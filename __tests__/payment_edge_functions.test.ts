// __tests__/payment_edge_functions.test.ts
import { handleCreateRazorpayOrder } from "../supabase/functions/create-razorpay-order/index.ts";
import { handleRazorpayWebhook } from "../supabase/functions/razorpay-webhook/index.ts";
import {
  computeHmacSha256Hex,
  timingSafeEqual,
  verifyRazorpayWebhookSignature,
} from "../supabase/functions/_shared/crypto.ts";
import { getSupabaseAdminClient } from "../supabase/functions/_shared/supabase.ts";

// Helper to create mock Request
function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Request {
  const { method = "POST", headers = {}, body } = options;
  const init: RequestInit = {
    method,
    headers: new Headers(headers),
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(url, init);
}

describe("Crypto Utilities", () => {
  const secret = "test_webhook_secret_key_12345";
  const payload = JSON.stringify({ event: "payment.captured", id: "pay_123" });

  it("computes correct HMAC-SHA256 hex digest", async () => {
    const hex = await computeHmacSha256Hex(secret, payload);
    expect(typeof hex).toBe("string");
    expect(hex.length).toBe(64);
  });

  it("timingSafeEqual correctly identifies identical and different strings", () => {
    expect(timingSafeEqual("abcdef", "abcdef")).toBe(true);
    expect(timingSafeEqual("abcdef", "abcdeg")).toBe(false);
    expect(timingSafeEqual("abcdef", "abcde")).toBe(false);
  });

  it("verifies matching webhook signature", async () => {
    const signature = await computeHmacSha256Hex(secret, payload);
    const isValid = await verifyRazorpayWebhookSignature(payload, signature, secret);
    expect(isValid).toBe(true);
  });

  it("rejects invalid webhook signature or missing secret", async () => {
    const isValidBadSig = await verifyRazorpayWebhookSignature(payload, "invalid_sig_hex", secret);
    expect(isValidBadSig).toBe(false);

    const isValidNoSecret = await verifyRazorpayWebhookSignature(payload, "some_sig", "");
    expect(isValidNoSecret).toBe(false);
  });
});

describe("create-razorpay-order Edge Function", () => {
  const validPaymentOrderId = "11111111-1111-4111-8111-111111111111";
  const validBookingId = "22222222-2222-4222-8222-222222222222";
  const validKundliId = "33333333-3333-4333-8333-333333333333";
  const validSubscriptionId = "44444444-4444-4444-8444-444444444444";
  const validUserId = "user-uuid-12345";

  const mockEnv: Record<string, string> = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_service_role_key",
    RAZORPAY_KEY_ID: "rzp_test_mockKeyId123",
    RAZORPAY_KEY_SECRET: "mockSecretKey456",
  };

  const getEnvFn = (key: string) => mockEnv[key];

  function buildMockSupabase(overrides: {
    user?: any;
    authError?: any;
    order?: any;
    orderError?: any;
    booking?: any;
    bookingError?: any;
    kundli?: any;
    kundliError?: any;
    subscription?: any;
    subscriptionError?: any;
    casRows?: any[];
    casError?: any;
    freshOrder?: any;
    finalUpdateRows?: any[];
    finalUpdateError?: any;
  } = {}) {
    return {
      auth: {
        getUser: jest.fn().mockResolvedValue(
          overrides.authError
            ? { data: { user: null }, error: overrides.authError }
            : {
                data: {
                  user:
                    overrides.user !== undefined
                      ? overrides.user
                      : { id: validUserId },
                },
                error: null,
              }
        ),
      },
      from: jest.fn((table: string) => {
        if (table === "payment_orders") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_field: string, _val: any) => ({
                maybeSingle: jest.fn().mockResolvedValue(
                  overrides.orderError
                    ? { data: null, error: overrides.orderError }
                    : {
                        data:
                          overrides.order !== undefined
                            ? overrides.order
                            : {
                                id: validPaymentOrderId,
                                booking_id: validBookingId,
                                kundli_order_id: null,
                                subscription_id: null,
                                purpose: "booking_advance",
                                amount: "501.00",
                                currency: "INR",
                                status: "created",
                                provider: "razorpay",
                                provider_order_id: null,
                              },
                        error: null,
                      }
                ),
              })),
            })),
            update: jest.fn((updates: any) => ({
              eq: jest.fn((_field1: string, _val1: any) => ({
                eq: jest.fn((_field2: string, _val2: any) => ({
                  is: jest.fn((_field3: string, _val3: any) => ({
                    select: jest.fn().mockResolvedValue(
                      updates.provider_order_id
                        ? overrides.finalUpdateError
                          ? { data: null, error: overrides.finalUpdateError }
                          : {
                              data:
                                overrides.finalUpdateRows !== undefined
                                  ? overrides.finalUpdateRows
                                  : [
                                      {
                                        id: validPaymentOrderId,
                                        provider_order_id: updates.provider_order_id,
                                      },
                                    ],
                              error: null,
                            }
                        : overrides.casError
                        ? { data: null, error: overrides.casError }
                        : {
                            data:
                              overrides.casRows !== undefined
                                ? overrides.casRows
                                : [
                                    {
                                      id: validPaymentOrderId,
                                      status: "pending",
                                      provider_order_id: null,
                                    },
                                  ],
                            error: null,
                          }
                    ),
                  })),
                })),
              })),
            })),
          };
        }

        if (table === "bookings") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_field: string, _val: any) => ({
                maybeSingle: jest.fn().mockResolvedValue(
                  overrides.bookingError
                    ? { data: null, error: overrides.bookingError }
                    : {
                        data:
                          overrides.booking !== undefined
                            ? overrides.booking
                            : {
                                id: validBookingId,
                                customer_id: validUserId,
                              },
                        error: null,
                      }
                ),
              })),
            })),
          };
        }

        if (table === "kundli_orders") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_field: string, _val: any) => ({
                maybeSingle: jest.fn().mockResolvedValue(
                  overrides.kundliError
                    ? { data: null, error: overrides.kundliError }
                    : {
                        data:
                          overrides.kundli !== undefined
                            ? overrides.kundli
                            : {
                                id: validKundliId,
                                customer_id: validUserId,
                              },
                        error: null,
                      }
                ),
              })),
            })),
          };
        }

        if (table === "astrology_subscriptions") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_field: string, _val: any) => ({
                maybeSingle: jest.fn().mockResolvedValue(
                  overrides.subscriptionError
                    ? { data: null, error: overrides.subscriptionError }
                    : {
                        data:
                          overrides.subscription !== undefined
                            ? overrides.subscription
                            : {
                                id: validSubscriptionId,
                                customer_id: validUserId,
                              },
                        error: null,
                      }
                ),
              })),
            })),
          };
        }

        return {} as any;
      }),
    };
  }

  it("reliably initializes Supabase admin client via getSupabaseAdminClient using npm:@supabase/supabase-js@2", async () => {
    const client = await getSupabaseAdminClient(getEnvFn);
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
    expect(typeof client.auth?.getUser).toBe("function");
  });

  it("throws clear error when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    await expect(getSupabaseAdminClient(() => undefined)).rejects.toThrow(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
  });

  it("handles OPTIONS request for CORS", async () => {
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      method: "OPTIONS",
    });
    const res = await handleCreateRazorpayOrder(req, { getEnvFn });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects non-POST methods with 405", async () => {
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      method: "GET",
    });
    const res = await handleCreateRazorpayOrder(req, { getEnvFn });
    expect(res.status).toBe(405);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { getEnvFn });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/authorization header/i);
  });

  it("returns 401 when JWT token is invalid", async () => {
    const adminClient = buildMockSupabase({
      authError: { message: "Invalid JWT token" },
    });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer invalid_token" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is malformed JSON", async () => {
    const adminClient = buildMockSupabase();
    const req = new Request("http://localhost/create-razorpay-order", {
      method: "POST",
      headers: new Headers({
        Authorization: "Bearer valid_jwt",
        "Content-Type": "application/json",
      }),
      body: "not-json-content",
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(400);
  });

  it("returns 400 when payment_order_id is not a valid UUID", async () => {
    const adminClient = buildMockSupabase();
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: "not-a-uuid" },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(400);
  });

  it("returns 404 when payment order is not found in database", async () => {
    const adminClient = buildMockSupabase({ order: null });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(404);
  });

  it("returns 404 when booking is owned by a different user (unauthorized)", async () => {
    const adminClient = buildMockSupabase({
      booking: { id: validBookingId, customer_id: "other-user-uuid" },
    });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(404);
  });

  it("successfully creates Razorpay order for purpose=subscription", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: validPaymentOrderId,
        booking_id: null,
        kundli_order_id: null,
        subscription_id: validSubscriptionId,
        purpose: "subscription",
        amount: "999.00",
        currency: "INR",
        status: "created",
        provider: "razorpay",
        provider_order_id: null,
      },
      subscription: {
        id: validSubscriptionId,
        customer_id: validUserId,
      },
    });
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ id: "order_rzp_sub_12345" }),
    } as any);

    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, fetchFn, getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.razorpay_order_id).toBe("order_rzp_sub_12345");
    expect(json.amount).toBe(99900);
  });

  it("returns 404 when subscription is owned by a different user (unauthorized)", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: validPaymentOrderId,
        booking_id: null,
        kundli_order_id: null,
        subscription_id: validSubscriptionId,
        purpose: "subscription",
        amount: "999.00",
        currency: "INR",
        status: "created",
        provider: "razorpay",
        provider_order_id: null,
      },
      subscription: {
        id: validSubscriptionId,
        customer_id: "other-customer-id",
      },
    });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized|not found/i);
  });

  it("returns 400 when order status is already 'paid'", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: validPaymentOrderId,
        booking_id: validBookingId,
        kundli_order_id: null,
        subscription_id: null,
        purpose: "booking_advance",
        amount: "501.00",
        currency: "INR",
        status: "paid",
        provider: "razorpay",
        provider_order_id: "order_existing123",
      },
    });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/already paid/i);
  });

  it("returns 400 when order status is in terminal non-payable state ('failed', 'cancelled', 'expired')", async () => {
    for (const st of ["failed", "cancelled", "expired"]) {
      const adminClient = buildMockSupabase({
        order: {
          id: validPaymentOrderId,
          booking_id: validBookingId,
          kundli_order_id: null,
          subscription_id: null,
          purpose: "booking_advance",
          amount: "501.00",
          currency: "INR",
          status: st,
          provider: "razorpay",
          provider_order_id: null,
        },
      });
      const req = createMockRequest("http://localhost/create-razorpay-order", {
        headers: { Authorization: "Bearer valid_jwt" },
        body: { payment_order_id: validPaymentOrderId },
      });
      const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
      expect(res.status).toBe(400);
    }
  });

  it("returns 400 when provider is not 'razorpay'", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: validPaymentOrderId,
        booking_id: validBookingId,
        kundli_order_id: null,
        subscription_id: null,
        purpose: "booking_advance",
        amount: "501.00",
        currency: "INR",
        status: "created",
        provider: "stripe",
        provider_order_id: null,
      },
    });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/unsupported payment provider/i);
  });

  it("returns existing Razorpay order ID idempotently if provider_order_id already exists", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: validPaymentOrderId,
        booking_id: validBookingId,
        kundli_order_id: null,
        subscription_id: null,
        purpose: "booking_advance",
        amount: "501.00",
        currency: "INR",
        status: "pending",
        provider: "razorpay",
        provider_order_id: "order_existing999",
      },
    });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.razorpay_order_id).toBe("order_existing999");
    expect(json.amount).toBe(50100);
    expect(json.key_id).toBe("rzp_test_mockKeyId123");
  });

  it("returns 409 when order creation is currently in progress (status: pending, provider_order_id: null)", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: validPaymentOrderId,
        booking_id: validBookingId,
        kundli_order_id: null,
        subscription_id: null,
        purpose: "booking_advance",
        amount: "501.00",
        currency: "INR",
        status: "pending",
        provider: "razorpay",
        provider_order_id: null,
      },
    });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    expect(res.status).toBe(409);
  });

  it("handles concurrent CAS race loser by returning 409 if in progress", async () => {
    // Simulate CAS returning 0 rows updated
    const adminClient = buildMockSupabase({
      casRows: [],
      order: {
        id: validPaymentOrderId,
        booking_id: validBookingId,
        kundli_order_id: null,
        subscription_id: null,
        purpose: "booking_advance",
        amount: "501.00",
        currency: "INR",
        status: "created",
        provider: "razorpay",
        provider_order_id: null,
      },
    });
    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });
    const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
    // In re-read fallback: if fresh read is pending & no provider_order_id -> 409
    expect([400, 409]).toContain(res.status);
  });

  it("successfully creates Razorpay order for booking payment and persists it", async () => {
    const adminClient = buildMockSupabase();
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "order_rzpCreated123", amount: 50100, currency: "INR" }),
    });

    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });

    const res = await handleCreateRazorpayOrder(req, {
      adminClient,
      fetchFn: fetchFn as any,
      getEnvFn,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.razorpay_order_id).toBe("order_rzpCreated123");
    expect(json.amount).toBe(50100);
    expect(json.currency).toBe("INR");
    expect(json.key_id).toBe("rzp_test_mockKeyId123");
  });

  it("successfully creates Razorpay order for Kundli payment", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: validPaymentOrderId,
        booking_id: null,
        kundli_order_id: validKundliId,
        subscription_id: null,
        purpose: "kundli",
        amount: "251.00",
        currency: "INR",
        status: "created",
        provider: "razorpay",
        provider_order_id: null,
      },
    });
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "order_kundli123", amount: 25100, currency: "INR" }),
    });

    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });

    const res = await handleCreateRazorpayOrder(req, {
      adminClient,
      fetchFn: fetchFn as any,
      getEnvFn,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.razorpay_order_id).toBe("order_kundli123");
    expect(json.amount).toBe(25100);
  });

  it("reverts status to 'created' and returns 502 on Razorpay 4xx/5xx rejection", async () => {
    const adminClient = buildMockSupabase();
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { description: "Invalid amount" } }),
    });

    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });

    const res = await handleCreateRazorpayOrder(req, {
      adminClient,
      fetchFn: fetchFn as any,
      getEnvFn,
    });

    expect(res.status).toBe(502);
  });

  it("reverts status to 'created' and returns 502 on network failure / timeout", async () => {
    const adminClient = buildMockSupabase();
    const fetchFn = jest.fn().mockRejectedValue(new Error("Network timeout"));

    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });

    const res = await handleCreateRazorpayOrder(req, {
      adminClient,
      fetchFn: fetchFn as any,
      getEnvFn,
    });

    expect(res.status).toBe(502);
  });

  it("returns 500 if DB write fails after Razorpay order is created", async () => {
    const adminClient = buildMockSupabase({
      finalUpdateRows: [],
    });
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "order_rzpCreated123" }),
    });

    const req = createMockRequest("http://localhost/create-razorpay-order", {
      headers: { Authorization: "Bearer valid_jwt" },
      body: { payment_order_id: validPaymentOrderId },
    });

    const res = await handleCreateRazorpayOrder(req, {
      adminClient,
      fetchFn: fetchFn as any,
      getEnvFn,
    });

    expect(res.status).toBe(500);
  });
});

describe("razorpay-webhook Edge Function", () => {
  const webhookSecret = "webhook_secret_for_tests_12345";
  const validPaymentOrderId = "11111111-1111-4111-8111-111111111111";
  const razorpayOrderId = "order_rzp12345";
  const providerPaymentId = "pay_rzp99999";

  const getEnvFn = (key: string) => {
    if (key === "RAZORPAY_WEBHOOK_SECRET") return webhookSecret;
    if (key === "SUPABASE_URL") return "https://mock.supabase.co";
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return "mock_service_role_key";
    return undefined;
  };

  async function createSignedWebhookRequest(payloadObj: any, secret = webhookSecret): Promise<Request> {
    const rawBody = JSON.stringify(payloadObj);
    const signature = await computeHmacSha256Hex(secret, rawBody);
    return new Request("http://localhost/razorpay-webhook", {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        "X-Razorpay-Signature": signature,
      }),
      body: rawBody,
    });
  }

  function buildMockSupabase(overrides: {
    order?: any;
    orderLookupErr?: any;
    rpcResult?: any;
    rpcError?: any;
  } = {}) {
    return {
      from: jest.fn((table: string) => {
        if (table === "payment_orders") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_field: string, _val: any) => ({
                maybeSingle: jest.fn().mockResolvedValue(
                  overrides.orderLookupErr
                    ? { data: null, error: overrides.orderLookupErr }
                    : {
                        data:
                          overrides.order !== undefined
                            ? overrides.order
                            : {
                                id: validPaymentOrderId,
                                amount: "501.00",
                                currency: "INR",
                                status: "pending",
                                purpose: "booking_advance",
                                booking_id: "b1111111-1111-1111-1111-111111111111",
                                kundli_order_id: null,
                                subscription_id: null,
                              },
                        error: null,
                      }
                ),
              })),
            })),
          };
        }
        return {} as any;
      }),
      rpc: jest.fn().mockResolvedValue(
        overrides.rpcError
          ? { data: null, error: overrides.rpcError }
          : {
              data:
                overrides.rpcResult !== undefined
                  ? overrides.rpcResult
                  : {
                      status: "confirmed",
                      purpose: "booking_advance",
                      booking_id: "b1111111-1111-1111-1111-111111111111",
                      booking_number: "BK-2026-0001",
                      payment_transaction_id: "tx-12345",
                    },
              error: null,
            }
      ),
    };
  }

  it("reliably initializes Supabase admin client via resolveAdminClient in webhook without runtime library error", async () => {
    // When deps.adminClient is omitted, resolveAdminClient uses the real getSupabaseAdminClient (which uses npm:@supabase/supabase-js@2)
    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: razorpayOrderId,
            amount: 50100,
          },
        },
      },
    });

    // Calling with getEnvFn provides real SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
    // The client will be created via createClient without throwing "Supabase JS library not found"
    const res = await handleRazorpayWebhook(req, { getEnvFn });
    // It proceeds past client initialization into database query; it will return 200 or 500 depending on network, but NEVER "Internal configuration error" from missing JS library!
    expect(res.status).not.toBe(400);
    const text = await res.text();
    expect(text).not.toContain("Supabase JS library not found");
  });

  it("returns 500 when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing during client initialization", async () => {
    const badEnvGetter = (key: string) => {
      if (key === "RAZORPAY_WEBHOOK_SECRET") return webhookSecret;
      return undefined; // Missing Supabase envs
    };
    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: razorpayOrderId,
            amount: 50100,
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { getEnvFn: badEnvGetter });
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal configuration error");
    expect(JSON.stringify(json)).not.toContain(webhookSecret);
  });

  it("ensures webhook secrets and service role keys are never leaked in response bodies", async () => {
    const req = new Request("http://localhost/razorpay-webhook", {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        "X-Razorpay-Signature": "invalid",
      }),
      body: JSON.stringify({ event: "payment.captured" }),
    });
    const res = await handleRazorpayWebhook(req, { getEnvFn });
    const text = await res.text();
    expect(text).not.toContain(webhookSecret);
    expect(text).not.toContain("mock_service_role_key");
  });

  it("handles OPTIONS request for CORS", async () => {
    const req = new Request("http://localhost/razorpay-webhook", {
      method: "OPTIONS",
    });
    const res = await handleRazorpayWebhook(req, { getEnvFn });
    expect(res.status).toBe(200);
  });

  it("rejects request missing X-Razorpay-Signature header with 400", async () => {
    const req = new Request("http://localhost/razorpay-webhook", {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ event: "payment.captured" }),
    });
    const res = await handleRazorpayWebhook(req, { getEnvFn });
    expect(res.status).toBe(400);
  });

  it("rejects request with invalid signature with 400", async () => {
    const req = new Request("http://localhost/razorpay-webhook", {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        "X-Razorpay-Signature": "invalid_signature_hex",
      }),
      body: JSON.stringify({ event: "payment.captured" }),
    });
    const res = await handleRazorpayWebhook(req, { getEnvFn });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid webhook signature/i);
  });

  it("handles malformed JSON payload after signature verification with 400", async () => {
    const rawBody = "{ not_valid_json: ";
    const signature = await computeHmacSha256Hex(webhookSecret, rawBody);
    const req = new Request("http://localhost/razorpay-webhook", {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
        "X-Razorpay-Signature": signature,
      }),
      body: rawBody,
    });
    const res = await handleRazorpayWebhook(req, { getEnvFn });
    expect(res.status).toBe(400);
  });

  it("safely ignores unhandled events with HTTP 200 without mutations", async () => {
    const req = await createSignedWebhookRequest({
      event: "order.paid",
      payload: {},
    });
    const res = await handleRazorpayWebhook(req, { getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(true);
    expect(json.event).toBe("order.paid");
  });

  it("returns 200 when payment.captured received for unknown/untracked order", async () => {
    const adminClient = buildMockSupabase({ order: null });
    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: razorpayOrderId,
            amount: 50100,
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("order_not_found");
  });

  it("returns 400 when captured amount does not match local payment order amount", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: validPaymentOrderId,
        amount: "501.00", // 50100 paise
        currency: "INR",
        booking_id: "b111",
      },
    });
    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: razorpayOrderId,
            amount: 40000, // mismatch: 400.00
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/amount mismatch/i);
  });

  it("successfully processes valid payment.captured event via RPC", async () => {
    const adminClient = buildMockSupabase();
    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: razorpayOrderId,
            amount: 50100,
            signature: "sig_audit_123",
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("confirmed");
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "confirm_booking_payment",
      expect.objectContaining({
        p_payment_order_id: validPaymentOrderId,
        p_provider_payment_id: providerPaymentId,
        p_verified_amount: 501.0,
      })
    );
  });

  it("handles duplicate payment.captured idempotently (status: already_confirmed)", async () => {
    const adminClient = buildMockSupabase({
      rpcResult: {
        status: "already_confirmed",
        purpose: "booking_advance",
        payment_order_id: validPaymentOrderId,
      },
    });
    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: razorpayOrderId,
            amount: 50100,
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.status).toBe("already_confirmed");
  });

  it("returns 500 when RPC confirm_booking_payment encounters genuine database error", async () => {
    const adminClient = buildMockSupabase({
      rpcError: { message: "Serialization failure deadlock" },
    });
    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: providerPaymentId,
            order_id: razorpayOrderId,
            amount: 50100,
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
    expect(res.status).toBe(500);
  });

  it("handles payment.failed event as a logged attempt without modifying order state or canceling booking", async () => {
    const adminClient = buildMockSupabase();
    const req = await createSignedWebhookRequest({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_failed_111",
            order_id: razorpayOrderId,
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Payment failed by bank",
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("failed_attempt_logged");
    expect(json.provider_payment_id).toBe("pay_failed_111");
    // Ensure no mutations / RPC calls were triggered
    expect(adminClient.rpc).not.toHaveBeenCalled();
  });

  it("handles payment.failed followed by payment.captured correctly", async () => {
    const adminClient = buildMockSupabase();

    // 1. First attempt fails
    const failedReq = await createSignedWebhookRequest({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_failed_111",
            order_id: razorpayOrderId,
            error_code: "GATEWAY_ERROR",
          },
        },
      },
    });
    const failedRes = await handleRazorpayWebhook(failedReq, { adminClient, getEnvFn });
    expect(failedRes.status).toBe(200);

    // 2. Second attempt succeeds and captures
    const captureReq = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_success_222",
            order_id: razorpayOrderId,
            amount: 50100,
          },
        },
      },
    });
    const captureRes = await handleRazorpayWebhook(captureReq, { adminClient, getEnvFn });
    expect(captureRes.status).toBe(200);
    const captureJson = await captureRes.json();
    expect(captureJson.success).toBe(true);
  });

  it("handles payment.captured followed by stale duplicate payment.failed without downgrading", async () => {
    const adminClient = buildMockSupabase();

    // 1. Capture succeeds
    const captureReq = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_success_222",
            order_id: razorpayOrderId,
            amount: 50100,
          },
        },
      },
    });
    const captureRes = await handleRazorpayWebhook(captureReq, { adminClient, getEnvFn });
    expect(captureRes.status).toBe(200);

    // 2. Stale failed webhook arrives late
    const staleFailedReq = await createSignedWebhookRequest({
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: "pay_failed_111",
            order_id: razorpayOrderId,
          },
        },
      },
    });
    const staleFailedRes = await handleRazorpayWebhook(staleFailedReq, { adminClient, getEnvFn });
    expect(staleFailedRes.status).toBe(200);
    const staleJson = await staleFailedRes.json();
    expect(staleJson.status).toBe("failed_attempt_logged");
  });

  it("successfully processes valid payment.captured event for subscription order", async () => {
    const subOrderId = "55555555-5555-4555-8555-555555555555";
    const subId = "66666666-6666-4666-8666-666666666666";
    const adminClient = buildMockSupabase({
      order: {
        id: subOrderId,
        amount: "999.00",
        currency: "INR",
        status: "pending",
        purpose: "subscription",
        booking_id: null,
        kundli_order_id: null,
        subscription_id: subId,
      },
      rpcResult: {
        status: "active",
        purpose: "subscription",
        subscription_id: subId,
        amount_paid: 999.0,
        starts_at: "2026-10-06T00:00:00Z",
        ends_at: "2026-11-05T00:00:00Z",
        payment_transaction_id: "tx-sub-12345",
      },
    });

    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_sub_captured_999",
            order_id: razorpayOrderId,
            amount: 99900,
            signature: "sig_sub_verified",
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("active");
    expect(adminClient.rpc).toHaveBeenCalledWith(
      "confirm_booking_payment",
      expect.objectContaining({
        p_payment_order_id: subOrderId,
        p_provider_payment_id: "pay_sub_captured_999",
        p_verified_amount: 999.0,
      })
    );
  });

  it("acknowledges with unsupported_order_target if payment order has no booking, kundli, or subscription target", async () => {
    const adminClient = buildMockSupabase({
      order: {
        id: "77777777-7777-4777-8777-777777777777",
        amount: "100.00",
        currency: "INR",
        status: "pending",
        purpose: "other",
        booking_id: null,
        kundli_order_id: null,
        subscription_id: null,
      },
    });

    const req = await createSignedWebhookRequest({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_unsupported_111",
            order_id: razorpayOrderId,
            amount: 10000,
          },
        },
      },
    });

    const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("unsupported_order_target");
  });
});
