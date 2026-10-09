// supabase/functions/create-razorpay-order/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/response.ts";
import { getEnv, getSupabaseAdminClient } from "../_shared/supabase.ts";
import { logger } from "../_shared/logger.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateOrderDependencies {
  adminClient?: any;
  fetchFn?: typeof fetch;
  getEnvFn?: (key: string) => string | undefined;
}

export async function handleCreateRazorpayOrder(
  req: Request,
  deps: CreateOrderDependencies = {}
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

  // 2. Require valid Supabase JWT before accessing backend resources
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  const jwtToken = authHeader.substring(7).trim();
  if (!jwtToken) {
    return jsonResponse({ error: "Missing authentication token" }, 401);
  }

  // 3. Resolve Admin Client for authoritative database access
  let adminClient: any;
  try {
    if (deps.adminClient) {
      adminClient = deps.adminClient;
    } else {
      try {
        adminClient = await getSupabaseAdminClient(envGetter);
      } catch {
        const supabaseUrl = envGetter("SUPABASE_URL");
        const serviceRoleKey = envGetter("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceRoleKey) {
          adminClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
        } else {
          throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable");
        }
      }
    }
  } catch (clientErr: any) {
    logger.error("Failed to initialize database client", {
      functionName: "create-razorpay-order",
      error: clientErr?.message,
    });
    return jsonResponse({ error: "Internal configuration error" }, 500);
  }

  let authenticatedUserId: string;
  try {
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(jwtToken);

    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired authentication token" }, 401);
    }
    authenticatedUserId = user.id;
  } catch (err: any) {
    logger.error("Authentication verification failed", {
      functionName: "create-razorpay-order",
      error: err?.message,
    });
    return jsonResponse({ error: "Authentication failed" }, 401);
  }

  // 4. Parse input body and validate payment_order_id
  let body: { payment_order_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Malformed JSON body" }, 400);
  }

  const paymentOrderId = body?.payment_order_id;
  if (!paymentOrderId || typeof paymentOrderId !== "string" || !UUID_REGEX.test(paymentOrderId)) {
    return jsonResponse(
      { error: "Valid UUID payment_order_id is strictly required" },
      400
    );
  }

  // 5. Fetch authoritative payment order from database
  const { data: order, error: orderError } = await adminClient
    .from("payment_orders")
    .select(
      "id, booking_id, kundli_order_id, subscription_id, purpose, amount, currency, status, provider, provider_order_id"
    )
    .eq("id", paymentOrderId)
    .maybeSingle();

  if (orderError) {
    logger.error("Database error fetching payment order", {
      functionName: "create-razorpay-order",
      paymentOrderId,
      error: orderError.message,
    });
    return jsonResponse({ error: "Database error resolving payment order" }, 500);
  }

  // Protect against resource enumeration: identical response for not found and unauthorized
  if (!order) {
    return jsonResponse({ error: "Payment order not found or unauthorized" }, 404);
  }

  // 6. Authorize ownership from actual current schema
  if (order.booking_id) {
    const { data: booking, error: bookingErr } = await adminClient
      .from("bookings")
      .select("id, customer_id")
      .eq("id", order.booking_id)
      .maybeSingle();

    if (bookingErr || !booking || booking.customer_id !== authenticatedUserId) {
      return jsonResponse({ error: "Payment order not found or unauthorized" }, 404);
    }
  } else if (order.kundli_order_id) {
    const { data: kundli, error: kundliErr } = await adminClient
      .from("kundli_orders")
      .select("id, customer_id")
      .eq("id", order.kundli_order_id)
      .maybeSingle();

    if (kundliErr || !kundli || kundli.customer_id !== authenticatedUserId) {
      return jsonResponse({ error: "Payment order not found or unauthorized" }, 404);
    }
  } else if (order.subscription_id) {
    const { data: subscription, error: subErr } = await adminClient
      .from("astrology_subscriptions")
      .select("id, customer_id")
      .eq("id", order.subscription_id)
      .maybeSingle();

    if (subErr || !subscription || subscription.customer_id !== authenticatedUserId) {
      return jsonResponse({ error: "Payment order not found or unauthorized" }, 404);
    }
  } else {
    return jsonResponse({ error: "Invalid payment order target" }, 400);
  }

  // 7. Payment State Machine Validations
  if (order.status === "paid") {
    return jsonResponse({ error: "Payment order is already paid" }, 400);
  }

  if (["failed", "cancelled", "expired"].includes(order.status)) {
    return jsonResponse(
      { error: `Payment order is not payable (current status: ${order.status})` },
      400
    );
  }

  if (order.provider !== "razorpay") {
    return jsonResponse(
      { error: `Unsupported payment provider: ${order.provider}` },
      400
    );
  }

  const numericAmount = Number(order.amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return jsonResponse({ error: "Invalid payment order obligation amount" }, 400);
  }

  const amountPaise = Math.round(numericAmount * 100);
  const keyId = envGetter("RAZORPAY_KEY_ID");
  const keySecret = envGetter("RAZORPAY_KEY_SECRET");

  if (!keyId || !keySecret) {
    logger.error("Razorpay API credentials missing in environment", {
      functionName: "create-razorpay-order",
      paymentOrderId: order.id,
    });
    return jsonResponse({ error: "Payment gateway configuration error" }, 500);
  }

  // 8. Idempotency: provider_order_id already populated
  if (order.provider_order_id) {
    logger.info("Returning existing Razorpay order ID idempotently", {
      functionName: "create-razorpay-order",
      paymentOrderId: order.id,
      razorpayOrderId: order.provider_order_id,
    });
    return jsonResponse(
      {
        success: true,
        razorpay_order_id: order.provider_order_id,
        amount: amountPaise,
        currency: order.currency,
        key_id: keyId,
      },
      200
    );
  }

  // 9. Handle in-progress order creation
  if (order.status === "pending" && !order.provider_order_id) {
    return jsonResponse(
      { error: "Payment order creation is currently in progress" },
      409
    );
  }

  // 10. Atomic CAS claim (status: 'created' -> 'pending')
  const { data: claimedRows, error: claimErr } = await adminClient
    .from("payment_orders")
    .update({
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "created")
    .is("provider_order_id", null)
    .select("id, status, provider_order_id");

  if (claimErr) {
    logger.error("Database error during CAS claim", {
      functionName: "create-razorpay-order",
      paymentOrderId: order.id,
      error: claimErr.message,
    });
    return jsonResponse({ error: "Database error claiming payment order" }, 500);
  }

  // If zero rows updated, another concurrent request won the claim
  if (!claimedRows || claimedRows.length === 0) {
    const { data: freshOrder } = await adminClient
      .from("payment_orders")
      .select("id, status, provider_order_id, amount, currency")
      .eq("id", order.id)
      .maybeSingle();

    if (freshOrder?.provider_order_id) {
      return jsonResponse(
        {
          success: true,
          razorpay_order_id: freshOrder.provider_order_id,
          amount: Math.round(Number(freshOrder.amount) * 100),
          currency: freshOrder.currency,
          key_id: keyId,
        },
        200
      );
    }

    if (freshOrder?.status === "pending" && !freshOrder.provider_order_id) {
      return jsonResponse(
        { error: "Payment order creation is currently in progress" },
        409
      );
    }

    return jsonResponse(
      { error: "Payment order state changed concurrently" },
      400
    );
  }

  // 11. Call Razorpay API (this request owns the CAS claim)
  const btoaFn = (globalThis as any).btoa;
  const authCredentials = btoaFn
    ? btoaFn(`${keyId}:${keySecret}`)
    : (globalThis as any).Buffer?.from(`${keyId}:${keySecret}`).toString("base64");
  const rzpPayload = {
    amount: amountPaise,
    currency: order.currency,
    receipt: order.id,
    notes: {
      payment_order_id: order.id,
      purpose: order.purpose,
    },
  };

  let rzpResponse: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    rzpResponse = await customFetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authCredentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rzpPayload),
      signal: controller.signal,
    });
  } catch (fetchErr: any) {
    logger.error("Razorpay network request failed or timed out", {
      functionName: "create-razorpay-order",
      paymentOrderId: order.id,
      error: fetchErr?.message ?? "Network error",
    });

    // Revert pending state back to 'created' so client can safely retry
    await adminClient
      .from("payment_orders")
      .update({ status: "created", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending")
      .is("provider_order_id", null);

    return jsonResponse(
      { error: "Payment gateway network error or timeout" },
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!rzpResponse.ok) {
    logger.error("Razorpay API returned non-2xx status code", {
      functionName: "create-razorpay-order",
      paymentOrderId: order.id,
      status: String(rzpResponse.status),
    });

    // Revert pending state back to 'created' so client can safely retry
    await adminClient
      .from("payment_orders")
      .update({ status: "created", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending")
      .is("provider_order_id", null);

    return jsonResponse(
      { error: "Payment gateway rejected order creation" },
      502
    );
  }

  let rzpData: any;
  try {
    rzpData = await rzpResponse.json();
  } catch {
    await adminClient
      .from("payment_orders")
      .update({ status: "created", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending")
      .is("provider_order_id", null);

    return jsonResponse(
      { error: "Malformed response received from payment gateway" },
      502
    );
  }

  const razorpayOrderId = rzpData?.id;
  if (!razorpayOrderId || typeof razorpayOrderId !== "string") {
    logger.error("Razorpay response missing order ID", {
      functionName: "create-razorpay-order",
      paymentOrderId: order.id,
    });

    await adminClient
      .from("payment_orders")
      .update({ status: "created", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "pending")
      .is("provider_order_id", null);

    return jsonResponse(
      { error: "Invalid order ID returned by payment gateway" },
      502
    );
  }

  // 12. Final DB write: persist provider_order_id
  const { data: finalUpdate, error: finalError } = await adminClient
    .from("payment_orders")
    .update({
      provider_order_id: razorpayOrderId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .is("provider_order_id", null)
    .select("id, provider_order_id");

  if (finalError || !finalUpdate || finalUpdate.length === 0) {
    logger.error("Failed to persist Razorpay order ID to database", {
      functionName: "create-razorpay-order",
      paymentOrderId: order.id,
      razorpayOrderId,
      error: finalError?.message ?? "Zero rows updated",
    });

    // Safe server error — do NOT fabricate success or create duplicate orders
    return jsonResponse({ error: "Failed to persist gateway order" }, 500);
  }

  logger.info("Successfully created and persisted Razorpay order", {
    functionName: "create-razorpay-order",
    paymentOrderId: order.id,
    razorpayOrderId,
    status: "pending",
  });

  // 13. Return authoritative gateway parameters to caller
  return jsonResponse(
    {
      success: true,
      razorpay_order_id: razorpayOrderId,
      amount: amountPaise,
      currency: order.currency,
      key_id: keyId,
    },
    200
  );
}

// Default export / Deno server entry point
if (typeof (globalThis as any).Deno !== "undefined") {
  (globalThis as any).Deno.serve(async (req: Request) => {
    return handleCreateRazorpayOrder(req);
  });
}
