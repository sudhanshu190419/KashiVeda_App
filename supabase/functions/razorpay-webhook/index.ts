// supabase/functions/razorpay-webhook/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/response.ts";
import { getEnv, getSupabaseAdminClient } from "../_shared/supabase.ts";
import { verifyRazorpayWebhookSignature } from "../_shared/crypto.ts";
import { logger } from "../_shared/logger.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WebhookDependencies {
  adminClient?: any;
  getEnvFn?: (key: string) => string | undefined;
}

async function resolveAdminClient(
  deps: WebhookDependencies,
  envGetter: (key: string) => string | undefined
): Promise<any> {
  if (deps.adminClient) {
    return deps.adminClient;
  }
  try {
    return await getSupabaseAdminClient(envGetter);
  } catch {
    const supabaseUrl = envGetter("SUPABASE_URL");
    const serviceRoleKey = envGetter("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey) {
      return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable");
  }
}

export async function handleRazorpayWebhook(
  req: Request,
  deps: WebhookDependencies = {}
): Promise<Response> {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const envGetter = deps.getEnvFn ?? getEnv;

  // 2. Read RAW request body first (before any JSON parsing)
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (readErr: any) {
    logger.error("Failed to read raw webhook request body", {
      functionName: "razorpay-webhook",
      error: readErr?.message,
    });
    return jsonResponse({ error: "Failed to read request body" }, 400);
  }

  // 3. Extract signature header & webhook secret
  const signatureHeader =
    req.headers.get("x-razorpay-signature") ||
    req.headers.get("X-Razorpay-Signature");
  const webhookSecret = envGetter("RAZORPAY_WEBHOOK_SECRET");

  if (!signatureHeader || !webhookSecret) {
    logger.warn("Missing webhook signature header or webhook secret configuration", {
      functionName: "razorpay-webhook",
    });
    return jsonResponse(
      { error: "Missing webhook signature or secret configuration" },
      400
    );
  }

  // 4. Constant-time HMAC-SHA256 signature verification over exact raw body
  const isValid = await verifyRazorpayWebhookSignature(
    rawBody,
    signatureHeader,
    webhookSecret
  );

  if (!isValid) {
    logger.warn("Invalid webhook signature verification failed", {
      functionName: "razorpay-webhook",
    });
    return jsonResponse({ error: "Invalid webhook signature" }, 400);
  }

  // 5. Parse JSON payload ONLY after successful signature verification
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.warn("Malformed JSON payload in verified webhook", {
      functionName: "razorpay-webhook",
    });
    return jsonResponse({ error: "Malformed JSON payload" }, 400);
  }

  const event = payload?.event;
  if (!event || typeof event !== "string") {
    return jsonResponse({ error: "Missing event field in webhook payload" }, 400);
  }

  // 6. Handle Supported Events
  switch (event) {
    // -------------------------------------------------------------------------
    // Event: payment.captured (Authoritative capture confirmation)
    // -------------------------------------------------------------------------
    case "payment.captured": {
      const paymentEntity = payload?.payload?.payment?.entity;
      const providerPaymentId = paymentEntity?.id;
      const razorpayOrderId = paymentEntity?.order_id;
      const capturedAmountPaise = paymentEntity?.amount;
      const providerSignature = paymentEntity?.signature ?? null;

      if (
        !providerPaymentId ||
        !razorpayOrderId ||
        typeof capturedAmountPaise !== "number" ||
        capturedAmountPaise <= 0
      ) {
        logger.warn("Missing required payment entity fields in payment.captured", {
          functionName: "razorpay-webhook",
          eventType: event,
          providerPaymentId,
          razorpayOrderId,
        });
        return jsonResponse(
          { error: "Missing required payment fields in captured event" },
          400
        );
      }

      // Initialize database client lazily for capture processing
      let adminClient: any;
      try {
        adminClient = await resolveAdminClient(deps, envGetter);
      } catch (clientErr: any) {
        logger.error("Failed to initialize database client in webhook", {
          functionName: "razorpay-webhook",
          eventType: event,
          error: clientErr?.message,
        });
        return jsonResponse({ error: "Internal configuration error" }, 500);
      }

      // Look up local payment order by provider_order_id
      const { data: order, error: orderLookupErr } = await adminClient
        .from("payment_orders")
        .select(
          "id, amount, currency, status, purpose, booking_id, kundli_order_id, subscription_id"
        )
        .eq("provider_order_id", razorpayOrderId)
        .maybeSingle();

      if (orderLookupErr) {
        logger.error("Database error looking up payment order by provider_order_id", {
          functionName: "razorpay-webhook",
          eventType: event,
          razorpayOrderId,
          error: orderLookupErr.message,
        });
        return jsonResponse(
          { error: "Database error resolving payment order" },
          500
        );
      }

      // If no local payment order exists, log and acknowledge to avoid infinite webhook retry
      if (!order) {
        logger.warn("Received payment.captured for untracked razorpay order", {
          functionName: "razorpay-webhook",
          eventType: event,
          razorpayOrderId,
          providerPaymentId,
        });
        return jsonResponse(
          { received: true, status: "order_not_found" },
          200
        );
      }

      if (!order.booking_id && !order.kundli_order_id && !order.subscription_id) {
        logger.warn("Payment order has no valid booking, kundli, or subscription target", {
          functionName: "razorpay-webhook",
          paymentOrderId: order.id,
          razorpayOrderId,
        });
        return jsonResponse(
          { received: true, status: "unsupported_order_target" },
          200
        );
      }

      // Authoritative exact amount verification (integer paise)
      const expectedPaise = Math.round(Number(order.amount) * 100);
      if (capturedAmountPaise !== expectedPaise) {
        logger.error("Payment amount mismatch between gateway and database", {
          functionName: "razorpay-webhook",
          paymentOrderId: order.id,
          razorpayOrderId,
          providerPaymentId,
          capturedPaise: capturedAmountPaise,
          expectedPaise,
        });
        return jsonResponse({ error: "Captured amount mismatch" }, 400);
      }

      // Execute authoritative atomic database RPC confirm_booking_payment
      const { data: rpcResult, error: rpcError } = await adminClient.rpc(
        "confirm_booking_payment",
        {
          p_payment_order_id: order.id,
          p_provider_payment_id: providerPaymentId,
          p_verified_amount: Number(order.amount),
          p_provider_signature: providerSignature,
          p_raw_response: payload,
        }
      );

      if (rpcError) {
        logger.error("RPC confirm_booking_payment failed with database error", {
          functionName: "razorpay-webhook",
          paymentOrderId: order.id,
          providerPaymentId,
          razorpayOrderId,
          error: rpcError.message,
        });
        return jsonResponse(
          { error: "Failed to confirm payment in database" },
          500
        );
      }

      if (rpcResult?.status === "already_confirmed") {
        logger.info("Payment already confirmed (idempotent duplicate capture)", {
          functionName: "razorpay-webhook",
          paymentOrderId: order.id,
          providerPaymentId,
          razorpayOrderId,
        });
        return jsonResponse(
          { success: true, status: "already_confirmed" },
          200
        );
      }

      logger.info("Payment confirmed successfully via RPC", {
        functionName: "razorpay-webhook",
        paymentOrderId: order.id,
        providerPaymentId,
        razorpayOrderId,
        resultStatus: rpcResult?.status,
      });

      return jsonResponse({ success: true, data: rpcResult }, 200);
    }

    // -------------------------------------------------------------------------
    // Event: payment.failed (Failed payment attempt — NO terminal order state change)
    // -------------------------------------------------------------------------
    case "payment.failed": {
      const paymentEntity = payload?.payload?.payment?.entity;
      const providerPaymentId = paymentEntity?.id;
      const razorpayOrderId = paymentEntity?.order_id;
      const errorCode = paymentEntity?.error_code;
      const errorDescription = paymentEntity?.error_description;

      logger.info(
        "Received payment.failed event (attempt failure logged, order remains open)",
        {
          functionName: "razorpay-webhook",
          eventType: "payment.failed",
          providerPaymentId: providerPaymentId ?? "unknown",
          razorpayOrderId: razorpayOrderId ?? "unknown",
          errorCode: errorCode ?? "none",
          errorDescription: errorDescription ?? "none",
        }
      );

      return jsonResponse(
        {
          received: true,
          status: "failed_attempt_logged",
          provider_payment_id: providerPaymentId,
        },
        200
      );
    }

    // -------------------------------------------------------------------------
    // Event: refund.processed (Authoritative gateway refund completion)
    // -------------------------------------------------------------------------
    case "refund.processed": {
      const refundEntity = payload?.payload?.refund?.entity;
      const providerRefundId = refundEntity?.id;
      const providerPaymentId = refundEntity?.payment_id;
      const refundAmountPaise = refundEntity?.amount;
      const notesRefundId = refundEntity?.notes?.refund_id;

      if (
        !providerRefundId ||
        !providerPaymentId ||
        typeof refundAmountPaise !== "number" ||
        refundAmountPaise <= 0
      ) {
        logger.warn("Missing required refund entity fields in refund.processed", {
          functionName: "razorpay-webhook",
          eventType: event,
          providerRefundId,
          providerPaymentId,
        });
        return jsonResponse(
          { error: "Missing required fields in refund entity" },
          400
        );
      }

      let adminClient: any;
      try {
        adminClient = await resolveAdminClient(deps, envGetter);
      } catch (clientErr: any) {
        logger.error("Failed to initialize database client in refund webhook", {
          functionName: "razorpay-webhook",
          eventType: event,
          error: clientErr?.message,
        });
        return jsonResponse({ error: "Internal configuration error" }, 500);
      }

      // Find transaction by provider_payment_id
      const { data: tx, error: txErr } = await adminClient
        .from("payment_transactions")
        .select("id, amount, payment_order_id")
        .eq("provider_payment_id", providerPaymentId)
        .maybeSingle();

      if (txErr || !tx) {
        logger.warn("Payment transaction not found for processed refund", {
          functionName: "razorpay-webhook",
          providerRefundId,
          providerPaymentId,
        });
        return jsonResponse({ received: true, status: "transaction_not_found" }, 200);
      }

      // Locate authoritative refund record with strict matching priority:
      // Priority 1: notes.refund_id (if passed and valid UUID)
      // Priority 2: provider_refund_id
      // Priority 3: open refund on this transaction matching EXACT amount
      let refundRecord: any = null;

      if (notesRefundId && typeof notesRefundId === "string" && UUID_REGEX.test(notesRefundId)) {
        const { data: byNotes } = await adminClient
          .from("refunds")
          .select("id, amount, status, payment_transaction_id, provider_refund_id")
          .eq("id", notesRefundId)
          .maybeSingle();
        if (byNotes) {
          refundRecord = byNotes;
        }
      }

      if (!refundRecord) {
        const { data: byProvider } = await adminClient
          .from("refunds")
          .select("id, amount, status, payment_transaction_id, provider_refund_id")
          .eq("provider_refund_id", providerRefundId)
          .maybeSingle();
        if (byProvider) {
          refundRecord = byProvider;
        }
      }

      if (!refundRecord) {
        // Match open refund on this transaction matching EXACT refund amount
        const refundRupees = refundAmountPaise / 100;
        const { data: openRefunds } = await adminClient
          .from("refunds")
          .select("id, amount, status, payment_transaction_id, provider_refund_id")
          .eq("payment_transaction_id", tx.id)
          .in("status", ["requested", "processing"])
          .eq("amount", refundRupees)
          .order("created_at", { ascending: true })
          .limit(1);

        if (openRefunds && openRefunds.length > 0) {
          refundRecord = openRefunds[0];
        }
      }

      if (!refundRecord) {
        logger.warn("No matching refund record found in database for refund.processed", {
          functionName: "razorpay-webhook",
          providerRefundId,
          providerPaymentId,
          refundAmountPaise,
        });
        return jsonResponse({ received: true, status: "untracked_refund" }, 200);
      }

      // Validate transaction ownership
      if (refundRecord.payment_transaction_id && refundRecord.payment_transaction_id !== tx.id) {
        logger.error("Refund transaction mismatch in webhook", {
          functionName: "razorpay-webhook",
          refundId: refundRecord.id,
          expectedTxId: refundRecord.payment_transaction_id,
          receivedTxId: tx.id,
        });
        return jsonResponse({ error: "Transaction ownership mismatch" }, 400);
      }

      // Authoritative exact amount verification (integer paise)
      const expectedPaise = Math.round(Number(refundRecord.amount) * 100);
      if (refundAmountPaise !== expectedPaise) {
        logger.error("Refund amount mismatch between gateway and database", {
          functionName: "razorpay-webhook",
          refundId: refundRecord.id,
          providerRefundId,
          capturedPaise: refundAmountPaise,
          expectedPaise,
        });
        return jsonResponse({ error: "Refund amount mismatch" }, 400);
      }

      // Idempotency: If already processed, return immediately without regressing
      if (refundRecord.status === "processed") {
        logger.info("Refund already processed (idempotent duplicate webhook)", {
          functionName: "razorpay-webhook",
          refundId: refundRecord.id,
          providerRefundId,
        });
        return jsonResponse(
          {
            success: true,
            status: "already_processed",
            refund_id: refundRecord.id,
          },
          200
        );
      }

      // Execute authoritative atomic reconciliation RPC
      const { data: rpcReconcile, error: rpcErr } = await adminClient.rpc(
        "reconcile_processed_refund",
        {
          p_refund_id: refundRecord.id,
          p_provider_refund_id: providerRefundId,
          p_amount_paise: refundAmountPaise,
          p_gateway_status: "processed",
          p_raw_response: payload,
        }
      );

      if (!rpcErr && rpcReconcile && rpcReconcile.success) {
        logger.info("Refund reconciled successfully via RPC", {
          functionName: "razorpay-webhook",
          refundId: refundRecord.id,
          providerRefundId,
          transactionStatus: rpcReconcile.transaction_status,
        });

        return jsonResponse(
          {
            success: true,
            status: "refund_processed",
            refund_id: refundRecord.id,
          },
          200
        );
      }

      // Direct fallback atomic update if RPC is missing
      const { error: refundUpdateErr } = await adminClient
        .from("refunds")
        .update({
          status: "processed",
          provider_refund_id: providerRefundId,
          processed_at: new Date().toISOString(),
        })
        .eq("id", refundRecord.id);

      if (refundUpdateErr) {
        logger.error("Failed to update refund status in database", {
          functionName: "razorpay-webhook",
          refundId: refundRecord.id,
          providerRefundId,
          error: refundUpdateErr.message,
        });
        return jsonResponse(
          { error: "Database error updating refund to processed" },
          500
        );
      }

      // Calculate total processed refunds on transaction to update transaction status
      const { data: allRefunds, error: refundListErr } = await adminClient
        .from("refunds")
        .select("amount")
        .eq("payment_transaction_id", tx.id)
        .eq("status", "processed");

      if (refundListErr) {
        logger.error("Database error querying refunds for transaction reconciliation", {
          functionName: "razorpay-webhook",
          txId: tx.id,
          error: refundListErr.message,
        });
        return jsonResponse(
          { error: "Database error querying transaction refunds" },
          500
        );
      }

      const totalRefunded = (allRefunds || []).reduce(
        (sum: number, r: any) => sum + Number(r.amount),
        0
      );

      const txAmount = Number(tx.amount);
      const newTxStatus =
        totalRefunded >= txAmount ? "refunded" : "partially_refunded";

      const { error: txUpdateErr } = await adminClient
        .from("payment_transactions")
        .update({ status: newTxStatus })
        .eq("id", tx.id);

      if (txUpdateErr) {
        logger.error("Database error updating transaction status after refund", {
          functionName: "razorpay-webhook",
          txId: tx.id,
          error: txUpdateErr.message,
        });
        return jsonResponse(
          { error: "Database error updating transaction status" },
          500
        );
      }

      logger.info("Refund reconciled successfully via webhook fallback", {
        functionName: "razorpay-webhook",
        refundId: refundRecord.id,
        providerRefundId,
        transactionStatus: newTxStatus,
      });

      return jsonResponse(
        {
          success: true,
          status: "refund_processed",
          refund_id: refundRecord.id,
        },
        200
      );
    }

    // -------------------------------------------------------------------------
    // Event: refund.failed (Gateway refund attempt failed — non-regressing guard)
    // -------------------------------------------------------------------------
    case "refund.failed": {
      const refundEntity = payload?.payload?.refund?.entity;
      const providerRefundId = refundEntity?.id;
      const providerPaymentId = refundEntity?.payment_id;
      const errorCode = refundEntity?.error_code;
      const errorDescription = refundEntity?.error_description;

      logger.warn("Received refund.failed event from gateway", {
        functionName: "razorpay-webhook",
        providerRefundId: providerRefundId ?? "unknown",
        providerPaymentId: providerPaymentId ?? "unknown",
        errorCode: errorCode ?? "none",
        errorDescription: errorDescription ?? "none",
      });

      if (!providerRefundId) {
        return jsonResponse(
          { received: true, status: "missing_provider_refund_id" },
          200
        );
      }

      let adminClient: any;
      try {
        adminClient = await resolveAdminClient(deps, envGetter);
      } catch (clientErr: any) {
        logger.error("Failed to initialize database client in refund.failed webhook", {
          functionName: "razorpay-webhook",
          eventType: event,
          error: clientErr?.message,
        });
        return jsonResponse({ error: "Internal configuration error" }, 500);
      }

      // Non-regression guard: check if already processed
      const { data: existingRefund } = await adminClient
        .from("refunds")
        .select("id, status")
        .eq("provider_refund_id", providerRefundId)
        .maybeSingle();

      if (existingRefund?.status === "processed") {
        logger.warn(
          "Ignoring refund.failed event for already processed refund (non-regressing guarantee)",
          {
            functionName: "razorpay-webhook",
            providerRefundId,
            refundId: existingRefund.id,
          }
        );
        return jsonResponse(
          {
            received: true,
            status: "ignored_already_processed",
            provider_refund_id: providerRefundId,
          },
          200
        );
      }

      // Try RPC reconcile_failed_refund
      const { data: rpcRes, error: rpcErr } = await adminClient.rpc(
        "reconcile_failed_refund",
        {
          p_provider_refund_id: providerRefundId,
          p_error_code: errorCode ?? null,
          p_error_description: errorDescription ?? null,
        }
      );

      if (!rpcErr && rpcRes && rpcRes.success) {
        return jsonResponse(
          {
            received: true,
            status: rpcRes.status || "refund_failure_logged",
            provider_refund_id: providerRefundId,
          },
          200
        );
      }

      // Fallback direct update: only update if status != 'processed'
      const { error: updateErr } = await adminClient
        .from("refunds")
        .update({ status: "failed" })
        .eq("provider_refund_id", providerRefundId)
        .neq("status", "processed");

      if (updateErr) {
        logger.error("Failed to update refund status to failed", {
          functionName: "razorpay-webhook",
          providerRefundId,
          error: updateErr.message,
        });
        return jsonResponse(
          { error: "Database error updating failed refund" },
          500
        );
      }

      return jsonResponse(
        {
          received: true,
          status: "refund_failure_logged",
          provider_refund_id: providerRefundId,
        },
        200
      );
    }

    // -------------------------------------------------------------------------
    // All other unhandled events (safely acknowledged with no mutation)
    // -------------------------------------------------------------------------
    default: {
      logger.info("Unhandled webhook event received (safely ignored)", {
        functionName: "razorpay-webhook",
        eventType: event,
      });
      return jsonResponse(
        {
          received: true,
          ignored: true,
          event,
        },
        200
      );
    }
  }
}

// Default export / Deno server entry point
if (typeof (globalThis as any).Deno !== "undefined") {
  (globalThis as any).Deno.serve(async (req: Request) => {
    return handleRazorpayWebhook(req);
  });
}
