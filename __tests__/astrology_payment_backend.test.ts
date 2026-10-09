// __tests__/astrology_payment_backend.test.ts
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { handleCreateRazorpayOrder } from "../supabase/functions/create-razorpay-order/index.ts";
import { handleRazorpayWebhook } from "../supabase/functions/razorpay-webhook/index.ts";
import { computeHmacSha256Hex } from "../supabase/functions/_shared/crypto.ts";

jest.mock("react-native-encrypted-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

describe("M7: Astrology Subscription Payment Backend", () => {
  const validPlanId = "11111111-1111-4111-8111-111111111111";
  const validSubscriptionId = "22222222-2222-4222-8222-222222222222";
  const validPaymentOrderId = "33333333-3333-4333-8333-333333333333";
  const validUserId = "44444444-4444-4444-8444-444444444444";
  const webhookSecret = "test_webhook_secret_m7";

  const mockEnv: Record<string, string> = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_service_role_key",
    RAZORPAY_KEY_ID: "rzp_test_m7_key",
    RAZORPAY_KEY_SECRET: "rzp_test_m7_secret",
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  };

  const getEnvFn = (key: string) => mockEnv[key];

  function createMockRequest(
    url: string,
    options: { method?: string; headers?: Record<string, string>; body?: any } = {}
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. create_astrology_subscription_order Service & RPC Integration", () => {
    it("successfully creates a subscription order with authoritative amount and dates", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          subscription_id: validSubscriptionId,
          payment_order_id: validPaymentOrderId,
          amount: 999.0,
          currency: "INR",
          status: "payment_pending",
          starts_at: "2026-10-06T10:00:00Z",
          ends_at: "2026-11-05T10:00:00Z",
          is_reused: false,
        },
        error: null,
      } as any);

      const result = await astrologyService.createSubscriptionOrder(validPlanId);

      expect(supabase.rpc).toHaveBeenCalledWith("create_astrology_subscription_order", {
        p_plan_id: validPlanId,
      });
      expect(result.subscription_id).toBe(validSubscriptionId);
      expect(result.payment_order_id).toBe(validPaymentOrderId);
      expect(result.amount).toBe(999.0);
      expect(result.currency).toBe("INR");
      expect(result.status).toBe("payment_pending");
      expect(result.is_reused).toBe(false);
    });

    it("throws an error when planId is missing", async () => {
      const spy = jest.spyOn(supabase, "rpc");
      await expect(astrologyService.createSubscriptionOrder("")).rejects.toThrow(
        "Plan ID is required to create a subscription order."
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it("bubbles database error when plan is inactive or invalid", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: null,
        error: { message: "Selected astrology plan is not currently active." },
      } as any);

      await expect(astrologyService.createSubscriptionOrder(validPlanId)).rejects.toThrow(
        "Selected astrology plan is not currently active."
      );
    });

    it("handles idempotent order reuse when user has an unexpired pending order", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          subscription_id: validSubscriptionId,
          payment_order_id: validPaymentOrderId,
          amount: 999.0,
          currency: "INR",
          status: "payment_pending",
          starts_at: "2026-10-06T10:00:00Z",
          ends_at: "2026-11-05T10:00:00Z",
          is_reused: true,
        },
        error: null,
      } as any);

      const result = await astrologyService.createSubscriptionOrder(validPlanId);
      expect(result.is_reused).toBe(true);
      expect(result.status).toBe("payment_pending");
    });
  });

  describe("2. create-razorpay-order Edge Function with Subscriptions", () => {
    function buildMockAdminClient(overrides: {
      order?: any;
      subscription?: any;
      subError?: any;
    } = {}) {
      return {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: validUserId } },
            error: null,
          }),
        },
        from: jest.fn((table: string) => {
          if (table === "payment_orders") {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data:
                      overrides.order !== undefined
                        ? overrides.order
                        : {
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
                    error: null,
                  }),
                })),
              })),
              update: jest.fn((updates: any) => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    is: jest.fn(() => ({
                      select: jest.fn().mockResolvedValue({
                        data: [
                          {
                            id: validPaymentOrderId,
                            status: updates.status || "pending",
                            provider_order_id: updates.provider_order_id || null,
                          },
                        ],
                        error: null,
                      }),
                    })),
                  })),
                })),
              })),
            };
          }

          if (table === "astrology_subscriptions") {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data:
                      overrides.subscription !== undefined
                        ? overrides.subscription
                        : {
                            id: validSubscriptionId,
                            customer_id: validUserId,
                          },
                    error: overrides.subError || null,
                  }),
                })),
              })),
            };
          }

          return {} as any;
        }),
      };
    }

    it("successfully creates a Razorpay gateway order for a customer subscription", async () => {
      const adminClient = buildMockAdminClient();
      const fetchFn = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: "order_rzp_sub_789" }),
      } as any);

      const req = createMockRequest("http://localhost/create-razorpay-order", {
        headers: { Authorization: "Bearer valid_jwt_token" },
        body: { payment_order_id: validPaymentOrderId },
      });

      const res = await handleCreateRazorpayOrder(req, { adminClient, fetchFn, getEnvFn });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.razorpay_order_id).toBe("order_rzp_sub_789");
      expect(json.amount).toBe(99900); // 999 INR in paise
    });

    it("rejects unauthorized access when subscription belongs to another customer", async () => {
      const adminClient = buildMockAdminClient({
        subscription: {
          id: validSubscriptionId,
          customer_id: "different-user-uuid",
        },
      });

      const req = createMockRequest("http://localhost/create-razorpay-order", {
        headers: { Authorization: "Bearer valid_jwt_token" },
        body: { payment_order_id: validPaymentOrderId },
      });

      const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized|not found/i);
    });

    it("returns existing provider_order_id idempotently", async () => {
      const adminClient = buildMockAdminClient({
        order: {
          id: validPaymentOrderId,
          booking_id: null,
          kundli_order_id: null,
          subscription_id: validSubscriptionId,
          purpose: "subscription",
          amount: "999.00",
          currency: "INR",
          status: "pending",
          provider: "razorpay",
          provider_order_id: "order_rzp_existing_456",
        },
      });

      const req = createMockRequest("http://localhost/create-razorpay-order", {
        headers: { Authorization: "Bearer valid_jwt_token" },
        body: { payment_order_id: validPaymentOrderId },
      });

      const res = await handleCreateRazorpayOrder(req, { adminClient, getEnvFn });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.razorpay_order_id).toBe("order_rzp_existing_456");
    });
  });

  describe("3. razorpay-webhook Edge Function with Subscriptions", () => {
    function buildMockWebhookClient(overrides: {
      order?: any;
      rpcResult?: any;
      rpcError?: any;
    } = {}) {
      return {
        from: jest.fn((table: string) => {
          if (table === "payment_orders") {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data:
                      overrides.order !== undefined
                        ? overrides.order
                        : {
                            id: validPaymentOrderId,
                            amount: "999.00",
                            currency: "INR",
                            status: "pending",
                            purpose: "subscription",
                            booking_id: null,
                            kundli_order_id: null,
                            subscription_id: validSubscriptionId,
                          },
                    error: null,
                  }),
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
                        status: "active",
                        purpose: "subscription",
                        subscription_id: validSubscriptionId,
                        amount_paid: 999.0,
                        starts_at: "2026-10-06T10:00:00Z",
                        ends_at: "2026-11-05T10:00:00Z",
                        payment_transaction_id: "tx-captured-999",
                      },
                error: null,
              }
        ),
      };
    }

    it("verifies signature and captures subscription payment activating the subscription", async () => {
      const adminClient = buildMockWebhookClient();
      const req = await createSignedWebhookRequest({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_captured_m7_123",
              order_id: "order_rzp_m7_456",
              amount: 99900,
              signature: "sig_valid_m7",
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
          p_payment_order_id: validPaymentOrderId,
          p_provider_payment_id: "pay_captured_m7_123",
          p_verified_amount: 999.0,
        })
      );
    });

    it("rejects captured amount mismatch with 400", async () => {
      const adminClient = buildMockWebhookClient({
        order: {
          id: validPaymentOrderId,
          amount: "999.00",
          currency: "INR",
          status: "pending",
          purpose: "subscription",
          subscription_id: validSubscriptionId,
        },
      });

      const req = await createSignedWebhookRequest({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_bad_amount",
              order_id: "order_rzp_m7_456",
              amount: 49900, // mismatch: 499 instead of 999
            },
          },
        },
      });

      const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/captured amount mismatch/i);
    });

    it("handles duplicate webhook idempotently when already confirmed", async () => {
      const adminClient = buildMockWebhookClient({
        rpcResult: {
          status: "already_confirmed",
          purpose: "subscription",
          payment_order_id: validPaymentOrderId,
          subscription_id: validSubscriptionId,
          subscription_status: "active",
        },
      });

      const req = await createSignedWebhookRequest({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_duplicate_123",
              order_id: "order_rzp_m7_456",
              amount: 99900,
            },
          },
        },
      });

      const res = await handleRazorpayWebhook(req, { adminClient, getEnvFn });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("already_confirmed");
    });
  });
});
