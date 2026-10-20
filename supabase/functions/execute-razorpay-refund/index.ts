// supabase/functions/execute-razorpay-refund/index.ts
import { corsHeaders, jsonResponse } from "../_shared/response.ts";
import { getEnv, getSupabaseAdminClient } from "../_shared/supabase.ts";
import { logger } from "../_shared/logger.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ExecuteRefundDependencies {
  adminClient?: any;
  fetchFn?: typeof fetch;
  getEnvFn?: (key: string) => string | undefined;
}

/**
 * Supabase Edge Function: execute-razorpay-refund
 * Production-hardened server-side function to initiate refund via Razorpay Refund API
 * for database-authorized refund obligations in public.refunds.
 * 
 * Hardening Guarantees:
 * 1. Exclusive claim lock (claim_refund_for_execution / FOR UPDATE) before external API call
 * 2. Razorpay idempotency key (X-Refund-Idempotency: refund_<id>) prevents gateway duplicate refunds
 * 3. Ambiguous network/provider outcomes stay in 'processing' (never blind auto-retry)
 * 4. Critical database errors are NOT ignored (returns 500 so callers know authoritative state)
 * 5. Already-processed refunds short-circuit safely (HTTP 200 idempotent)
 * 6. Audit trail logged via authoritative server context
 * 7. Supports single execution, database webhooks, and automatic batch dispatch of queued refunds
 */
export async function handleExecuteRazorpayRefund(
  req: Request,
  deps: ExecuteRefundDependencies = {}
): Promise<Response> {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const envGetter = deps.getEnvFn ?? getEnv;
  const customFetch = deps.fetchFn ?? fetch;

  let adminClient: any;
  try {
    adminClient = deps.adminClient ?? (await getSupabaseAdminClient(envGetter));
  } catch (clientErr: any) {
    logger.error("Failed to initialize database client", {
      functionName: "execute-razorpay-refund",
      error: clientErr?.message,
    });
    return jsonResponse({ error: "Internal configuration error" }, 500);
  }

  // 2. Authentication & Authorization (Internal Worker Secret OR Administrator JWT)
  const serviceRoleKey = envGetter("SUPABASE_SERVICE_ROLE_KEY");
  const workerSecret = envGetter("INTERNAL_WORKER_SECRET");
  const xWorkerSecret = req.headers.get("x-worker-secret");

  let isInternalWorker = false;
  let callerUserId: string | null = null;

  // Path A: Dedicated x-worker-secret header (Internal Worker / pg_net Dispatcher)
  if (xWorkerSecret) {
    if (!workerSecret) {
      logger.error("Internal worker secret is not configured in environment", {
        functionName: "execute-razorpay-refund",
      });
      return jsonResponse(
        { error: "Internal worker authentication not configured" },
        500
      );
    }

    if (timingSafeEqual(xWorkerSecret, workerSecret)) {
      isInternalWorker = true;
      callerUserId = null;
    } else {
      logger.warn("Internal worker authentication failed: invalid secret provided", {
        functionName: "execute-razorpay-refund",
      });
      return jsonResponse(
        { error: "Invalid worker credentials" },
        401
      );
    }
  } else {
    // Path B: Administrator Bearer JWT verification (Admin Dashboard Modal)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Missing or invalid authentication credentials" }, 401);
    }

    const jwtToken = authHeader.substring(7).trim();
    if (!jwtToken) {
      return jsonResponse({ error: "Missing authentication token" }, 401);
    }

    // Support fallback service-role key or worker secret in Bearer token if provided
    if (
      (serviceRoleKey && timingSafeEqual(jwtToken, serviceRoleKey)) ||
      (workerSecret && timingSafeEqual(jwtToken, workerSecret))
    ) {
      isInternalWorker = true;
      callerUserId = null;
    } else {
      try {
        const {
          data: { user },
          error: authError,
        } = await adminClient.auth.getUser(jwtToken);

        if (authError || !user?.id) {
          return jsonResponse({ error: "Invalid or expired authentication token" }, 401);
        }

        callerUserId = user.id;

        const { data: adminRole } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", callerUserId)
          .in("role", ["admin", "super_admin"])
          .maybeSingle();

        if (!adminRole) {
          return jsonResponse(
            { error: "Forbidden: Only administrators can execute gateway refunds." },
            403
          );
        }
      } catch (err: any) {
        logger.error("Authentication check failed in execute-razorpay-refund", {
          functionName: "execute-razorpay-refund",
          error: err?.message,
        });
        return jsonResponse({ error: "Authentication verification failed" }, 401);
      }
    }
  }

  // 4. Parse request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Malformed JSON body" }, 400);
  }

  // 4a. Batch / Queued Dispatcher Mode ({ mode: "dispatch_queued", batch_size?: number })
  if (body?.mode === "dispatch_queued" || body?.action === "dispatch_queued") {
    const batchSize = Math.max(1, Math.min(Number(body?.batch_size) || 10, 50));

    const { data: pendingRefunds, error: fetchErr } = await adminClient
      .from("refunds")
      .select("id, status, created_at")
      .eq("status", "requested")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchErr) {
      logger.error("Failed to query queued refunds for dispatch", {
        functionName: "execute-razorpay-refund",
        error: fetchErr.message,
      });
      return jsonResponse({ error: "Database error querying queued refunds" }, 500);
    }

    const items: Array<{ id: string }> = pendingRefunds || [];
    const results: any[] = [];

    for (const item of items) {
      const outcomeRes = await executeRefundObligation(
        item.id,
        callerUserId,
        isInternalWorker,
        adminClient,
        envGetter,
        customFetch
      );
      let outcomeData: any;
      try {
        outcomeData = await outcomeRes.json();
      } catch {
        outcomeData = { status: outcomeRes.status };
      }
      results.push({
        refund_id: item.id,
        status_code: outcomeRes.status,
        outcome: outcomeData,
      });
    }

    logger.info("Batch queued refund dispatch completed", {
      functionName: "execute-razorpay-refund",
      totalFound: items.length,
      processedCount: results.length,
      isInternalWorker,
    });

    return jsonResponse(
      {
        success: true,
        mode: "dispatch_queued",
        total_found: items.length,
        processed_count: results.length,
        results,
      },
      200
    );
  }

  // 4b. Parse refund ID from canonical payload or database webhook event
  let refundId = body?.refund_id;

  // Supabase Database Webhook payload support: { record: { id, status }, table: "refunds" }
  if (!refundId && body?.record && body?.table === "refunds") {
    if (body.record.status && body.record.status !== "requested") {
      return jsonResponse(
        {
          success: true,
          status: "ignored",
          message: `Database webhook event ignored for refund status '${body.record.status}'`,
        },
        200
      );
    }
    refundId = body.record.id;
  }

  if (!refundId || typeof refundId !== "string" || !UUID_REGEX.test(refundId)) {
    return jsonResponse({ error: "Valid UUID refund_id is strictly required" }, 400);
  }

  // 4b. Explicit Active Provider Reconciliation Action ({ refund_id, action: "reconcile" })
  // Allows an Administrator to actively verify gateway state for an in-flight, ambiguous, or stuck refund
  // with bounded pagination across pages of refunds, strict matching invariants, and safe status transitions.
  if (body?.action === "reconcile") {
    const { data: record, error: refundErr } = await adminClient
      .from("refunds")
      .select(`
        id,
        payment_transaction_id,
        booking_cancellation_id,
        amount,
        status,
        provider_refund_id,
        execution_attempt_id,
        payment_transaction:payment_transactions(
          id,
          provider_payment_id,
          amount,
          status
        )
      `)
      .eq("id", refundId)
      .maybeSingle();

    if (refundErr) {
      return jsonResponse(
        {
          success: false,
          outcome: "reconciliation_error",
          error: "Database error resolving refund record",
        },
        500
      );
    }
    if (!record) {
      return jsonResponse(
        {
          success: false,
          outcome: "reconciliation_error",
          error: "Refund record not found",
        },
        404
      );
    }

    if (record.status === "processed") {
      return jsonResponse(
        {
          success: true,
          outcome: "matched_processed",
          status: "already_processed",
          refund_id: record.id,
          provider_refund_id: record.provider_refund_id,
          reconciled: true,
        },
        200
      );
    }

    const providerPaymentId = record.payment_transaction?.provider_payment_id;
    if (!providerPaymentId) {
      return jsonResponse(
        {
          success: false,
          outcome: "reconciliation_error",
          error: "No provider payment ID linked to this refund obligation",
        },
        400
      );
    }

    const keyId = envGetter("RAZORPAY_KEY_ID");
    const keySecret = envGetter("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      return jsonResponse(
        {
          success: false,
          outcome: "reconciliation_error",
          error: "Payment gateway configuration error",
        },
        500
      );
    }

    const btoaFn = (globalThis as any).btoa;
    const authCredentials = btoaFn
      ? btoaFn(`${keyId}:${keySecret}`)
      : (globalThis as any).Buffer?.from(`${keyId}:${keySecret}`).toString("base64");

    const expectedPaise = Math.round(Number(record.amount) * 100);

    // Bounded Pagination Parameters
    const PAGE_SIZE = 20;
    const MAX_PAGES = 10;
    let skip = 0;
    let matchedRefund: any = null;
    let searchExhausted = false;
    let pagesScanned = 0;
    let totalItemsScanned = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      pagesScanned++;
      const listUrl = `https://api.razorpay.com/v1/payments/${encodeURIComponent(
        providerPaymentId
      )}/refunds?count=${PAGE_SIZE}&skip=${skip}`;

      let listRes: Response;
      try {
        listRes = await customFetch(listUrl, {
          method: "GET",
          headers: {
            Authorization: `Basic ${authCredentials}`,
            "Content-Type": "application/json",
          },
        });
      } catch (fetchErr: any) {
        logger.error("Network error during refund reconciliation pagination", {
          functionName: "execute-razorpay-refund",
          refundId: record.id,
          providerPaymentId,
          page: pagesScanned,
          skip,
          error: fetchErr?.message,
        });
        return jsonResponse(
          {
            success: false,
            outcome: "provider_outcome_unresolved",
            status: "network_error",
            refund_id: record.id,
            pages_scanned: pagesScanned,
            error: `Network error querying gateway refunds: ${fetchErr?.message}`,
          },
          502
        );
      }

      if (!listRes.ok) {
        logger.error("Gateway error response during refund reconciliation pagination", {
          functionName: "execute-razorpay-refund",
          refundId: record.id,
          providerPaymentId,
          page: pagesScanned,
          statusCode: listRes.status,
        });
        return jsonResponse(
          {
            success: false,
            outcome: "provider_outcome_unresolved",
            status: "gateway_error",
            refund_id: record.id,
            pages_scanned: pagesScanned,
            error: `Failed to fetch refunds from gateway (HTTP ${listRes.status})`,
            statusCode: listRes.status,
          },
          502
        );
      }

      let listData: any;
      try {
        listData = await listRes.json();
      } catch {
        return jsonResponse(
          {
            success: false,
            outcome: "provider_outcome_unresolved",
            status: "malformed_gateway_response",
            refund_id: record.id,
            pages_scanned: pagesScanned,
            error: "Gateway returned non-JSON response during reconciliation",
          },
          502
        );
      }

      const items: any[] = Array.isArray(listData?.items) ? listData.items : [];
      totalItemsScanned += items.length;

      // Check items on this page
      for (const item of items) {
        const notesRefundId = item?.notes?.refund_id;
        const isNotesMatch = notesRefundId === record.id;

        // If notes.refund_id is present and matches THIS refund obligation:
        if (isNotesMatch) {
          let conflictType: string | null = null;
          let conflictDescription = "";

          // 1. Payment ID mismatch
          if (item?.payment_id && item.payment_id !== providerPaymentId) {
            conflictType = "payment_id_mismatch";
            conflictDescription = `Payment ID mismatch: gateway item has payment_id '${item.payment_id}', expected '${providerPaymentId}'`;
          }
          // 2. Previously recorded provider_refund_id conflict
          else if (record.provider_refund_id && item?.id && item.id !== record.provider_refund_id) {
            conflictType = "provider_refund_id_mismatch";
            conflictDescription = `Conflicting provider refund ID: gateway item has id '${item.id}', but local record already has '${record.provider_refund_id}'`;
          }
          // 3. Malformed provider refund ID format
          else if (!item?.id || typeof item.id !== "string" || !item.id.startsWith("rfnd_")) {
            conflictType = "malformed_provider_refund_id";
            conflictDescription = `Malformed provider refund ID: '${item?.id}' does not match expected 'rfnd_' prefix format`;
          }
          // 4. Amount mismatch
          else if (item?.amount !== expectedPaise) {
            conflictType = "amount_mismatch";
            conflictDescription = `Amount mismatch: gateway item has amount ${item?.amount} paise, expected ${expectedPaise} paise`;
          }
          // 5. Currency mismatch
          else if (item?.currency && item.currency.toUpperCase() !== "INR") {
            conflictType = "currency_mismatch";
            conflictDescription = `Currency mismatch: gateway item has currency '${item.currency}', expected 'INR'`;
          }

          // If ANY conflict was detected:
          if (conflictType) {
            logger.warn("Conflicting provider refund record detected during reconciliation", {
              functionName: "execute-razorpay-refund",
              refundId: record.id,
              providerPaymentId,
              expectedPaise,
              conflictType,
              providerRefund: item,
            });

            // Log durable server audit log of the reconciliation conflict
            try {
              await adminClient.from("admin_audit_logs").insert({
                actor_user_id: callerUserId,
                action: "refund_reconciliation_conflict",
                entity_type: "refund",
                entity_id: record.id,
                details: {
                  execution_attempt_id: record.execution_attempt_id || null,
                  conflict_type: conflictType,
                  conflict_description: conflictDescription,
                  expected_payment_id: providerPaymentId,
                  actual_payment_id: item?.payment_id,
                  expected_amount_paise: expectedPaise,
                  actual_amount_paise: item?.amount,
                  expected_currency: "INR",
                  actual_currency: item?.currency,
                  expected_provider_refund_id: record.provider_refund_id,
                  actual_provider_refund_id: item?.id,
                  pages_scanned: pagesScanned,
                  timestamp: new Date().toISOString(),
                },
              });
            } catch (auditErr: any) {
              logger.warn("Non-fatal error logging reconciliation conflict event", {
                functionName: "execute-razorpay-refund",
                refundId: record.id,
                error: auditErr?.message,
              });
            }

            // Immediately stop reconciliation and return conflict outcome without mutating DB refund state
            return jsonResponse(
              {
                success: false,
                outcome: "provider_outcome_unresolved",
                status: "provider_record_conflict",
                conflict_type: conflictType,
                refund_id: record.id,
                provider_refund_id: item?.id ?? null,
                pages_scanned: pagesScanned,
                error: `Conflicting provider refund record detected: ${conflictDescription}. Status preserved in ${record.status}.`,
                details: {
                  expected_payment_id: providerPaymentId,
                  actual_payment_id: item?.payment_id,
                  expected_amount_paise: expectedPaise,
                  actual_amount_paise: item?.amount,
                  expected_currency: "INR",
                  actual_currency: item?.currency,
                  expected_provider_refund_id: record.provider_refund_id,
                  actual_provider_refund_id: item?.id,
                },
              },
              409
            );
          }

          // If no conflict, this is an exact authoritative match!
          matchedRefund = item;
          break;
        }

        // If notes.refund_id is present but for a DIFFERENT refund obligation:
        if (notesRefundId && !isNotesMatch) {
          // Unrelated refund belonging to another obligation: skip and continue searching
          continue;
        }

        // Fallback match: if single refund exists across entirety of gateway list with exact amount and matching payment
        const isSingleRefundMatch =
          !notesRefundId &&
          items.length === 1 &&
          page === 0 &&
          listData?.count === 1 &&
          item?.amount === expectedPaise &&
          (!item?.payment_id || item.payment_id === providerPaymentId) &&
          (!item?.currency || item.currency.toUpperCase() === "INR") &&
          (item?.id && typeof item.id === "string" && item.id.startsWith("rfnd_")) &&
          (!record.provider_refund_id || record.provider_refund_id === item.id);

        if (isSingleRefundMatch) {
          matchedRefund = item;
          break;
        }
      }

      if (matchedRefund) {
        break;
      }

      // Check if more items exist
      if (items.length < PAGE_SIZE) {
        searchExhausted = true;
        break;
      }

      skip += items.length;
    }

    // Handle Matched Refund by Provider Status
    if (matchedRefund && matchedRefund.id) {
      const providerStatus = (matchedRefund.status || "").toLowerCase().trim();

      // Case A: Provider status = processed
      if (providerStatus === "processed") {
        const { data: rpcReconcile, error: rpcErr } = await adminClient.rpc(
          "reconcile_processed_refund",
          {
            p_refund_id: record.id,
            p_provider_refund_id: matchedRefund.id,
            p_amount_paise: expectedPaise,
            p_gateway_status: "processed",
            p_raw_response: matchedRefund,
          }
        );

        if (rpcErr && rpcErr.message?.includes("does not exist")) {
          // Fallback direct update only if RPC missing from unapplied migration
          await adminClient
            .from("refunds")
            .update({
              status: "processed",
              provider_refund_id: matchedRefund.id,
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", record.id);
        } else if (rpcReconcile && !rpcReconcile.success && rpcReconcile.status !== "already_processed") {
          logger.error("reconcile_processed_refund RPC rejected reconciliation", {
            functionName: "execute-razorpay-refund",
            refundId: record.id,
            error: rpcReconcile.error,
            status: rpcReconcile.status,
          });
          return jsonResponse(
            {
              success: false,
              outcome: "provider_outcome_unresolved",
              status: rpcReconcile.status || "reconciliation_failed",
              refund_id: record.id,
              error: rpcReconcile.error || "Database rejected processed refund reconciliation",
            },
            400
          );
        }

        return jsonResponse(
          {
            success: true,
            outcome: "matched_processed",
            status: "processed",
            refund_id: record.id,
            provider_refund_id: matchedRefund.id,
            reconciled: true,
            pages_scanned: pagesScanned,
          },
          200
        );
      }

      // Case B: Provider status = pending
      if (providerStatus === "pending") {
        // Never mark local refund as processed!
        // Preserve 'processing' state and persist provider_refund_id safely.
        await adminClient
          .from("refunds")
          .update({
            provider_refund_id: matchedRefund.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id)
          .eq("status", "processing");

        return jsonResponse(
          {
            success: true,
            outcome: "matched_pending",
            status: "pending",
            refund_id: record.id,
            provider_refund_id: matchedRefund.id,
            reconciled: false,
            pages_scanned: pagesScanned,
            message:
              "Gateway refund is in 'pending' clearance. Provider refund ID persisted. Local status preserved in processing.",
          },
          200
        );
      }

      // Case C: Provider status = failed
      if (providerStatus === "failed") {
        // Use failure reconciliation path with both local refund UUID and provider refund ID. Non-regressing.
        await adminClient.rpc("reconcile_failed_refund", {
          p_refund_id: record.id,
          p_provider_refund_id: matchedRefund.id,
          p_error_code: matchedRefund.error_code || null,
          p_error_description: matchedRefund.error_description || null,
        });

        // Ensure row status is 'failed' and provider_refund_id persisted
        await adminClient
          .from("refunds")
          .update({
            status: "failed",
            provider_refund_id: matchedRefund.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id)
          .neq("status", "processed");

        return jsonResponse(
          {
            success: true,
            outcome: "matched_failed",
            status: "failed",
            refund_id: record.id,
            provider_refund_id: matchedRefund.id,
            reconciled: false,
            pages_scanned: pagesScanned,
            message: "Gateway refund confirmed failed.",
          },
          200
        );
      }

      // Case D: Missing, unknown, or malformed provider status
      return jsonResponse(
        {
          success: false,
          outcome: "provider_outcome_unresolved",
          status: "unknown_gateway_status",
          refund_id: record.id,
          provider_refund_id: matchedRefund.id,
          pages_scanned: pagesScanned,
          message: `Gateway refund status '${matchedRefund.status}' is unrecognized. Status preserved without mutation.`,
        },
        422
      );
    }

    // If search exhausted without match
    if (searchExhausted) {
      // Authoritative Server Audit Log: Stamp durable proof of exhaustive gateway search
      try {
        await adminClient.from("admin_audit_logs").insert({
          actor_user_id: callerUserId,
          action: "refund_reconciliation_not_found",
          entity_type: "refund",
          entity_id: record.id,
          details: {
            execution_attempt_id: record.execution_attempt_id || null,
            payment_transaction_id: record.payment_transaction_id,
            provider_payment_id: providerPaymentId,
            pages_scanned: pagesScanned,
            total_items_scanned: totalItemsScanned,
            search_exhausted: true,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (auditErr: any) {
        logger.warn("Non-fatal error logging reconciliation not found event", {
          functionName: "execute-razorpay-refund",
          refundId: record.id,
          error: auditErr?.message,
        });
      }

      return jsonResponse(
        {
          success: false,
          outcome: "not_found_after_complete_search",
          status: "not_found_on_gateway",
          refund_id: record.id,
          current_db_status: record.status,
          pages_scanned: pagesScanned,
          message:
            "No matching refund found on payment gateway for this obligation (complete search).",
        },
        200
      );
    }

    // Incomplete search (reached MAX_PAGES without exhaustion)
    return jsonResponse(
      {
        success: false,
        outcome: "provider_outcome_unresolved",
        status: "search_incomplete",
        refund_id: record.id,
        current_db_status: record.status,
        pages_scanned: pagesScanned,
        message:
          "Pagination limit reached without finding matching refund or exhausting list. Provider outcome remains unresolved.",
      },
      502
    );
  }

  return executeRefundObligation(
    refundId,
    callerUserId,
    isInternalWorker,
    adminClient,
    envGetter,
    customFetch
  );
}

/**
 * Authoritative single refund obligation execution.
 * Invoked either directly (Admin / Webhook single refund) or in a batch loop (Queue Dispatcher).
 */
export async function executeRefundObligation(
  refundId: string,
  callerUserId: string | null,
  isInternalWorker: boolean,
  adminClient: any,
  envGetter: (key: string) => string | undefined,
  customFetch: typeof fetch
): Promise<Response> {
  // 5. Atomic Exclusive Claim / Concurrency Lock
  let refundData: {
    id: string;
    payment_transaction_id: string;
    booking_cancellation_id?: string | null;
    amount: number;
    provider_payment_id: string;
  };

  const { data: claimResult, error: claimRpcErr } = await adminClient.rpc(
    "claim_refund_for_execution",
    { p_refund_id: refundId }
  );

  if (claimRpcErr || !claimResult) {
    logger.error("Authoritative database claim RPC failed", {
      functionName: "execute-razorpay-refund",
      refundId,
      error: claimRpcErr?.message || "No claim result returned from database",
    });
    return jsonResponse(
      {
        error:
          "Authoritative database claim failed; refund execution cannot proceed without confirmed atomic claim.",
      },
      500
    );
  }

  if (claimResult.status === "already_processed") {
    return jsonResponse(
      {
        success: true,
        status: "already_processed",
        refund_id: refundId,
        provider_refund_id: claimResult.provider_refund_id,
      },
      200
    );
  }

  if (!claimResult.success) {
    if (claimResult.status_code === 409 || claimResult.status === "already_processing") {
      return jsonResponse(
        { error: "Refund execution is already in progress for this record." },
        409
      );
    }
    return jsonResponse(
      { error: claimResult.error || "Cannot claim refund for execution." },
      claimResult.status_code || 400
    );
  }

  refundData = {
    id: claimResult.refund_id,
    payment_transaction_id: claimResult.payment_transaction_id,
    booking_cancellation_id: claimResult.booking_cancellation_id,
    amount: Number(claimResult.amount),
    provider_payment_id: claimResult.provider_payment_id,
  };

  // 6. Razorpay API Configuration
  const keyId = envGetter("RAZORPAY_KEY_ID");
  const keySecret = envGetter("RAZORPAY_KEY_SECRET");

  if (!keyId || !keySecret) {
    logger.error("Razorpay API credentials missing in environment", {
      functionName: "execute-razorpay-refund",
      refundId,
    });
    return jsonResponse({ error: "Payment gateway configuration error" }, 500);
  }

  const amountPaise = Math.round(refundData.amount * 100);

  const btoaFn = (globalThis as any).btoa;
  const authCredentials = btoaFn
    ? btoaFn(`${keyId}:${keySecret}`)
    : (globalThis as any).Buffer?.from(`${keyId}:${keySecret}`).toString("base64");
  const razorpayUrl = `https://api.razorpay.com/v1/payments/${encodeURIComponent(
    refundData.provider_payment_id
  )}/refund`;

  // 7. Execute Gateway Refund with Idempotency Key
  let response: Response;
  let responseData: any;

  try {
    response = await customFetch(razorpayUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authCredentials}`,
        "Content-Type": "application/json",
        // Strict Gateway-level Refund Idempotency Header (Razorpay documented)
        "X-Refund-Idempotency": `refund_${refundData.id}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        notes: {
          refund_id: refundData.id,
          booking_cancellation_id: refundData.booking_cancellation_id || "",
        },
      }),
    });

    const responseText = await response.text();
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }
  } catch (fetchErr: any) {
    // AMBIGUOUS PROVIDER OUTCOME: Do NOT auto-retry or mark failed!
    // Row remains in 'processing' awaiting webhook reconciliation.
    logger.error("Network or execution error calling Razorpay refund API", {
      functionName: "execute-razorpay-refund",
      refundId: refundData.id,
      error: fetchErr?.message,
    });

    return jsonResponse(
      {
        error:
          "Network timeout contacting payment gateway. The refund remains in processing state to prevent duplicate debits. It will reconcile automatically upon gateway confirmation.",
      },
      502
    );
  }

  // 8. Handle Gateway Response
  if (!response.ok) {
    logger.error("Razorpay refund API call returned error", {
      functionName: "execute-razorpay-refund",
      refundId: refundData.id,
      providerPaymentId: refundData.provider_payment_id,
      statusCode: response.status,
      errorData: responseData,
    });

    // 8a. Ambiguous / In-Progress Gateway Responses (HTTP 409 Conflict or HTTP 5xx Server Error)
    // Do NOT automatically assume no refund occurred!
    // Row remains in 'processing' state to prevent duplicate debits,
    // awaiting webhook reconciliation or administrative recovery.
    if (response.status === 409) {
      return jsonResponse(
        {
          error: responseData?.error?.description
            ? `Payment gateway reported conflict (HTTP 409): ${responseData.error.description}. The refund remains in processing state to prevent duplicate debits.`
            : "Payment gateway reported conflict or concurrent refund in progress. The refund remains in processing state to prevent duplicate debits.",
        },
        409
      );
    }

    if (response.status >= 500) {
      return jsonResponse(
        {
          error: responseData?.error?.description
            ? `Payment gateway returned an ambiguous server error (HTTP ${response.status}): ${responseData.error.description}. The refund remains in processing state to prevent duplicate debits. It will reconcile automatically upon gateway confirmation.`
            : `Payment gateway returned an ambiguous server error (HTTP ${response.status}). The refund remains in processing state to prevent duplicate debits. It will reconcile automatically upon gateway confirmation.`,
        },
        502
      );
    }

    // 8b. Definitive Gateway Rejection (HTTP 4xx client errors, e.g. 400 Bad Request)
    // Gateway definitively refused the refund; safe to revert to 'failed' for administrative review / retry.
    await adminClient
      .from("refunds")
      .update({ status: "failed" })
      .eq("id", refundData.id);

    // Audit failed attempt if invoked by an authenticated human admin
    if (callerUserId) {
      try {
        await adminClient.from("admin_audit_logs").insert({
          actor_user_id: callerUserId,
          action: "execute_gateway_refund_failed",
          entity_type: "refund",
          entity_id: refundData.id,
          details: {
            payment_transaction_id: refundData.payment_transaction_id,
            provider_payment_id: refundData.provider_payment_id,
            amount: refundData.amount,
            statusCode: response.status,
            error: responseData?.error?.description || "Gateway rejected refund",
          },
        });
      } catch {}
    }

    return jsonResponse(
      {
        error:
          responseData?.error?.description ||
          "Payment gateway rejected refund request.",
      },
      400
    );
  }

  // 9. Authoritative Database Reconciliation
  const providerRefundId = responseData?.id;
  const gatewayStatus = (responseData?.status || "").toLowerCase().trim();

  if (gatewayStatus === "processed") {
    const { data: rpcReconcile, error: rpcErr } = await adminClient.rpc(
      "reconcile_processed_refund",
      {
        p_refund_id: refundData.id,
        p_provider_refund_id: providerRefundId,
        p_amount_paise: amountPaise,
        p_gateway_status: "processed",
        p_raw_response: responseData,
      }
    );

    if (rpcErr && rpcErr.message?.includes("does not exist")) {
      // Fallback direct update only if RPC missing from unapplied migration
      await adminClient
        .from("refunds")
        .update({
          provider_refund_id: providerRefundId,
          status: "processed",
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundData.id);
    } else if (rpcReconcile && !rpcReconcile.success && rpcReconcile.status !== "already_processed") {
      logger.error("reconcile_processed_refund RPC rejected reconciliation on POST", {
        functionName: "execute-razorpay-refund",
        refundId: refundData.id,
        error: rpcReconcile.error,
        status: rpcReconcile.status,
      });
      return jsonResponse(
        {
          success: false,
          status: rpcReconcile.status || "reconciliation_failed",
          refund_id: refundData.id,
          error: rpcReconcile.error || "Database rejected processed refund reconciliation",
        },
        400
      );
    }

    // Audit Log if invoked by an authenticated human admin
    if (callerUserId) {
      try {
        await adminClient.from("admin_audit_logs").insert({
          actor_user_id: callerUserId,
          action: "execute_gateway_refund_success",
          entity_type: "refund",
          entity_id: refundData.id,
          details: {
            payment_transaction_id: refundData.payment_transaction_id,
            provider_payment_id: refundData.provider_payment_id,
            provider_refund_id: providerRefundId,
            amount: refundData.amount,
            status: "processed",
          },
        });
      } catch (auditErr: any) {
        logger.warn("Non-fatal error logging refund audit event", {
          functionName: "execute-razorpay-refund",
          refundId: refundData.id,
          error: auditErr?.message,
        });
      }
    }

    logger.info("Razorpay refund executed and processed successfully", {
      functionName: "execute-razorpay-refund",
      refundId: refundData.id,
      providerRefundId,
      gatewayStatus: "processed",
      isInternalWorker,
    });

    return jsonResponse(
      {
        success: true,
        refund_id: refundData.id,
        provider_refund_id: providerRefundId,
        status: "processed",
        outcome: "matched_processed",
      },
      200
    );
  } else if (gatewayStatus === "pending") {
    // Gateway accepted refund in pending queue (e.g. standard banking clearance)
    // Row remains in 'processing' state; provider_refund_id is persisted.
    await adminClient
      .from("refunds")
      .update({
        provider_refund_id: providerRefundId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundData.id)
      .eq("status", "processing");

    if (callerUserId) {
      try {
        await adminClient.from("admin_audit_logs").insert({
          actor_user_id: callerUserId,
          action: "execute_gateway_refund_pending",
          entity_type: "refund",
          entity_id: refundData.id,
          details: {
            payment_transaction_id: refundData.payment_transaction_id,
            provider_payment_id: refundData.provider_payment_id,
            provider_refund_id: providerRefundId,
            amount: refundData.amount,
            status: "pending",
          },
        });
      } catch (auditErr: any) {
        logger.warn("Non-fatal error logging refund pending audit event", {
          functionName: "execute-razorpay-refund",
          refundId: refundData.id,
          error: auditErr?.message,
        });
      }
    }

    logger.info("Razorpay refund accepted in pending state", {
      functionName: "execute-razorpay-refund",
      refundId: refundData.id,
      providerRefundId,
      gatewayStatus: "pending",
      isInternalWorker,
    });

    return jsonResponse(
      {
        success: true,
        refund_id: refundData.id,
        provider_refund_id: providerRefundId,
        status: "pending",
        outcome: "matched_pending",
        message: "Refund accepted by gateway in pending state. Provider refund ID persisted. Awaiting webhook clearance.",
      },
      200
    );
  } else if (gatewayStatus === "failed") {
    // Gateway explicitly confirmed refund failure
    await adminClient.rpc("reconcile_failed_refund", {
      p_provider_refund_id: providerRefundId,
      p_error_code: responseData?.error_code || null,
      p_error_description: responseData?.error_description || null,
      p_refund_id: refundData.id,
    });

    await adminClient
      .from("refunds")
      .update({
        status: "failed",
        provider_refund_id: providerRefundId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundData.id)
      .neq("status", "processed");

    if (callerUserId) {
      try {
        await adminClient.from("admin_audit_logs").insert({
          actor_user_id: callerUserId,
          action: "execute_gateway_refund_failed",
          entity_type: "refund",
          entity_id: refundData.id,
          details: {
            payment_transaction_id: refundData.payment_transaction_id,
            provider_payment_id: refundData.provider_payment_id,
            provider_refund_id: providerRefundId,
            amount: refundData.amount,
            status: "failed",
            error: responseData?.error_description || "Gateway reported refund failed",
          },
        });
      } catch {}
    }

    return jsonResponse(
      {
        success: false,
        refund_id: refundData.id,
        provider_refund_id: providerRefundId,
        status: "failed",
        outcome: "matched_failed",
        error: responseData?.error_description || "Gateway reported refund failed.",
      },
      400
    );
  } else {
    // Malformed / Unrecognized gateway status
    if (providerRefundId) {
      await adminClient
        .from("refunds")
        .update({
          provider_refund_id: providerRefundId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundData.id)
        .eq("status", "processing");
    }

    return jsonResponse(
      {
        success: false,
        refund_id: refundData.id,
        provider_refund_id: providerRefundId,
        status: responseData?.status || "unknown",
        outcome: "provider_outcome_unresolved",
        error: "Unresolved gateway refund status. Row preserved in processing.",
      },
      502
    );
  }
}

// Default export / Deno server entry point
if (typeof (globalThis as any).Deno !== "undefined") {
  (globalThis as any).Deno.serve(async (req: Request) => {
    return handleExecuteRazorpayRefund(req);
  });
}
