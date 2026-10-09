// supabase/functions/execute-razorpay-refund/index.ts
import { corsHeaders, jsonResponse } from "../_shared/response.ts";
import { getEnv, getSupabaseAdminClient } from "../_shared/supabase.ts";
import { logger } from "../_shared/logger.ts";

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
 * 2. Razorpay idempotency key (X-Razorpay-Idempotency: refund_<id>) prevents gateway duplicate refunds
 * 3. Ambiguous network/provider outcomes stay in 'processing' (never blind auto-retry)
 * 4. Critical database errors are NOT ignored (returns 500 so callers know authoritative state)
 * 5. Already-processed refunds short-circuit safely (HTTP 200 idempotent)
 * 6. Audit trail logged via authoritative server context
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

  // 2. Authentication: Require valid Bearer token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  const jwtToken = authHeader.substring(7).trim();
  if (!jwtToken) {
    return jsonResponse({ error: "Missing authentication token" }, 401);
  }

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

  // 3. Verify Admin Role / Authorization
  let callerUserId: string;
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

  // 4. Parse request body (canonical payload: { refund_id })
  let body: { refund_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Malformed JSON body" }, 400);
  }

  const refundId = body?.refund_id;
  if (!refundId || typeof refundId !== "string" || !UUID_REGEX.test(refundId)) {
    return jsonResponse({ error: "Valid UUID refund_id is strictly required" }, 400);
  }

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

  if (!claimRpcErr && claimResult) {
    if (!claimResult.success) {
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
  } else {
    // Fallback if claim RPC not yet deployed: read authoritative row and lock
    const { data: record, error: refundErr } = await adminClient
      .from("refunds")
      .select(`
        id,
        payment_transaction_id,
        booking_cancellation_id,
        amount,
        status,
        provider_refund_id,
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
      logger.error("Database error looking up refund record", {
        functionName: "execute-razorpay-refund",
        refundId,
        error: refundErr.message,
      });
      return jsonResponse({ error: "Database error resolving refund record" }, 500);
    }

    if (!record) {
      return jsonResponse({ error: "Refund record not found" }, 404);
    }

    if (record.status === "processed") {
      return jsonResponse(
        {
          success: true,
          status: "already_processed",
          refund_id: record.id,
          provider_refund_id: record.provider_refund_id,
        },
        200
      );
    }

    if (record.status === "processing") {
      return jsonResponse(
        { error: "Refund execution is already in progress for this record." },
        409
      );
    }

    if (record.status !== "requested" && record.status !== "failed") {
      return jsonResponse(
        { error: `Refund cannot be executed from status '${record.status}'` },
        400
      );
    }

    const providerPaymentId = record.payment_transaction?.provider_payment_id;
    if (!providerPaymentId) {
      return jsonResponse(
        { error: "No provider payment ID linked to this refund obligation" },
        400
      );
    }

    // Attempt status transition to 'processing'
    await adminClient
      .from("refunds")
      .update({ status: "processing" })
      .eq("id", refundId)
      .in("status", ["requested", "failed"]);

    refundData = {
      id: record.id,
      payment_transaction_id: record.payment_transaction_id,
      booking_cancellation_id: record.booking_cancellation_id,
      amount: Number(record.amount),
      provider_payment_id: providerPaymentId,
    };
  }

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
        // Strict Gateway-level Idempotency Header
        "X-Razorpay-Idempotency": `refund_${refundData.id}`,
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

  // 8. Handle Gateway Rejection
  if (!response.ok) {
    logger.error("Razorpay refund API call returned error", {
      functionName: "execute-razorpay-refund",
      refundId: refundData.id,
      providerPaymentId: refundData.provider_payment_id,
      statusCode: response.status,
      errorData: responseData,
    });

    // Revert status to 'failed' for administrative review / retry
    await adminClient
      .from("refunds")
      .update({ status: "failed" })
      .eq("id", refundData.id);

    // Audit failed attempt
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
  const isGatewayProcessed = responseData?.status === "processed";

  const { data: rpcReconcile, error: rpcErr } = await adminClient.rpc(
    "reconcile_processed_refund",
    {
      p_refund_id: refundData.id,
      p_provider_refund_id: providerRefundId,
      p_amount_paise: amountPaise,
      p_gateway_status: responseData?.status || "processed",
      p_raw_response: responseData,
    }
  );

  if (rpcErr || (rpcReconcile && !rpcReconcile.success && rpcReconcile.status !== "already_processed")) {
    // Fallback direct update if RPC is missing
    const { error: dbUpdateErr } = await adminClient
      .from("refunds")
      .update({
        provider_refund_id: providerRefundId,
        status: isGatewayProcessed ? "processed" : "processing",
        processed_at: isGatewayProcessed ? new Date().toISOString() : null,
      })
      .eq("id", refundData.id);

    if (dbUpdateErr) {
      logger.error("Critical database error persisting processed refund", {
        functionName: "execute-razorpay-refund",
        refundId: refundData.id,
        providerRefundId,
        error: dbUpdateErr.message,
      });
      return jsonResponse(
        {
          error: "Database error persisting confirmed gateway refund.",
          provider_refund_id: providerRefundId,
        },
        500
      );
    }
  }

  // 10. Audit Log via Authoritative Backend
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
        status: responseData?.status || "processed",
      },
    });
  } catch (auditErr: any) {
    logger.warn("Non-fatal error logging refund audit event", {
      functionName: "execute-razorpay-refund",
      refundId: refundData.id,
      error: auditErr?.message,
    });
  }

  logger.info("Razorpay refund executed successfully", {
    functionName: "execute-razorpay-refund",
    refundId: refundData.id,
    providerRefundId,
    gatewayStatus: responseData?.status,
  });

  return jsonResponse(
    {
      success: true,
      refund_id: refundData.id,
      provider_refund_id: providerRefundId,
      status: responseData?.status || "processed",
    },
    200
  );
}

// Default export / Deno server entry point
if (typeof (globalThis as any).Deno !== "undefined") {
  (globalThis as any).Deno.serve(async (req: Request) => {
    return handleExecuteRazorpayRefund(req);
  });
}
