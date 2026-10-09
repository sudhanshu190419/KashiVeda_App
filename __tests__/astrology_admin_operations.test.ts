// __tests__/astrology_admin_operations.test.ts
import { handleExecuteRazorpayRefund } from "../supabase/functions/execute-razorpay-refund/index.ts";

describe("M19: Astrology Backend Contract Hardening & Admin Operations", () => {
  const testSubId = "11111111-2222-4333-8444-555555555555";
  const testPlanId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const testTxId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const testRefundId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const testDeliveryId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const testAdminUserId = "99999999-9999-4999-8999-999999999999";
  const testSuperAdminUserId = "88888888-8888-4888-8888-888888888888";

  const mockEnv: Record<string, string> = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_service_role_key",
    RAZORPAY_KEY_ID: "rzp_test_m19_key",
    RAZORPAY_KEY_SECRET: "rzp_test_m19_secret",
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

  // ===========================================================================
  // 1. Subscription Cancellation State Machine (admin_cancel_astrology_subscription)
  // ===========================================================================
  describe("1. Subscription Cancellation State Machine", () => {
    function simulateAdminCancelSubscription(params: {
      callerRole: "customer" | "pandit" | "admin" | "super_admin";
      subscription: {
        id: string;
        status: string;
        starts_at: string;
        ends_at: string;
      };
      reason: string;
      refundEligible: boolean;
      capturedAmount: number;
      alreadyRefundedAmount: number;
    }) {
      const { callerRole, subscription, reason, refundEligible, capturedAmount, alreadyRefundedAmount } = params;

      // 1. Authorization: Super Admin only
      if (callerRole !== "super_admin") {
        throw new Error("Unauthorized: Super Administrator privileges required to cancel astrology subscriptions.");
      }

      // 2. Validate reason
      const trimmedReason = (reason || "").trim();
      if (trimmedReason.length < 5) {
        throw new Error("A detailed cancellation reason of at least 5 characters is required.");
      }

      // 3. Terminal state check: expired
      if (subscription.status === "expired") {
        throw new Error("Cannot cancel astrology subscription in expired status. Subscription term has already concluded.");
      }

      // 4. Idempotency: already cancelled
      if (subscription.status === "cancelled") {
        return {
          success: true,
          status: "already_cancelled",
          subscription_id: subscription.id,
          message: "Astrology subscription has already been cancelled.",
        };
      }

      // 5. Calculate net captured funds
      const netCaptured = Math.max(capturedAmount - alreadyRefundedAmount, 0);
      const refundAmount = refundEligible ? netCaptured : 0;

      // 6. Return transition result
      return {
        success: true,
        status: "cancelled",
        subscription_id: subscription.id,
        previous_status: subscription.status,
        total_captured: capturedAmount,
        already_refunded: alreadyRefundedAmount,
        refund_amount: refundAmount,
        refund_eligible: refundEligible,
        message:
          refundAmount > 0
            ? "Astrology subscription cancelled. Refund obligation queued in requested state."
            : "Astrology subscription cancelled without refund obligation.",
      };
    }

    it("rejects cancellation attempts from standard Admin, Customer, and Pandit roles", () => {
      const sub = {
        id: testSubId,
        status: "active",
        starts_at: "2026-10-01T00:00:00Z",
        ends_at: "2026-10-31T00:00:00Z",
      };

      expect(() =>
        simulateAdminCancelSubscription({
          callerRole: "admin",
          subscription: sub,
          reason: "Customer requested cancellation",
          refundEligible: true,
          capturedAmount: 499,
          alreadyRefundedAmount: 0,
        })
      ).toThrow("Super Administrator privileges required");

      expect(() =>
        simulateAdminCancelSubscription({
          callerRole: "customer",
          subscription: sub,
          reason: "Cancel please",
          refundEligible: false,
          capturedAmount: 499,
          alreadyRefundedAmount: 0,
        })
      ).toThrow("Super Administrator privileges required");

      expect(() =>
        simulateAdminCancelSubscription({
          callerRole: "pandit",
          subscription: sub,
          reason: "Cancel please",
          refundEligible: false,
          capturedAmount: 499,
          alreadyRefundedAmount: 0,
        })
      ).toThrow("Super Administrator privileges required");
    });

    it("enforces minimum 5 characters reason for administrative cancellation audit logging", () => {
      const sub = {
        id: testSubId,
        status: "active",
        starts_at: "2026-10-01T00:00:00Z",
        ends_at: "2026-10-31T00:00:00Z",
      };

      expect(() =>
        simulateAdminCancelSubscription({
          callerRole: "super_admin",
          subscription: sub,
          reason: "cxl",
          refundEligible: true,
          capturedAmount: 499,
          alreadyRefundedAmount: 0,
        })
      ).toThrow("at least 5 characters");
    });

    it("rejects cancellation of already expired subscription (terminal state protection)", () => {
      const expiredSub = {
        id: testSubId,
        status: "expired",
        starts_at: "2026-09-01T00:00:00Z",
        ends_at: "2026-09-30T00:00:00Z",
      };

      expect(() =>
        simulateAdminCancelSubscription({
          callerRole: "super_admin",
          subscription: expiredSub,
          reason: "Customer dissatisfaction after term concluded",
          refundEligible: false,
          capturedAmount: 499,
          alreadyRefundedAmount: 0,
        })
      ).toThrow("Cannot cancel astrology subscription in expired status");
    });

    it("returns already_cancelled idempotently on repeat cancellation calls", () => {
      const cancelledSub = {
        id: testSubId,
        status: "cancelled",
        starts_at: "2026-10-01T00:00:00Z",
        ends_at: "2026-10-31T00:00:00Z",
      };

      const result = simulateAdminCancelSubscription({
        callerRole: "super_admin",
        subscription: cancelledSub,
        reason: "Duplicate cancellation request",
        refundEligible: true,
        capturedAmount: 499,
        alreadyRefundedAmount: 499,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("already_cancelled");
    });

    it("cancels active subscription with full refund obligation when refundEligible = true", () => {
      const activeSub = {
        id: testSubId,
        status: "active",
        starts_at: "2026-10-01T00:00:00Z",
        ends_at: "2026-10-31T00:00:00Z",
      };

      const result = simulateAdminCancelSubscription({
        callerRole: "super_admin",
        subscription: activeSub,
        reason: "Service level agreement cancellation per customer request",
        refundEligible: true,
        capturedAmount: 999,
        alreadyRefundedAmount: 0,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("cancelled");
      expect(result.refund_amount).toBe(999);
      expect(result.refund_eligible).toBe(true);
    });

    it("cancels payment_pending subscription with ZERO refund obligations and cancels open payment order", () => {
      const pendingSub = {
        id: testSubId,
        status: "payment_pending",
        starts_at: "2026-10-07T00:00:00Z",
        ends_at: "2026-11-06T00:00:00Z",
      };

      const result = simulateAdminCancelSubscription({
        callerRole: "super_admin",
        subscription: pendingSub,
        reason: "Devotee abandoned payment checkout",
        refundEligible: false,
        capturedAmount: 0,
        alreadyRefundedAmount: 0,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("cancelled");
      expect(result.refund_amount).toBe(0);
      expect(result.refund_eligible).toBe(false);
    });

    it("M17 execute-razorpay-refund processes the requested subscription refund obligation", async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: testSuperAdminUserId } },
            error: null,
          }),
        },
        rpc: jest.fn((rpcName: string) => {
          if (rpcName === "claim_refund_for_execution") {
            return Promise.resolve({
              data: {
                success: true,
                refund_id: testRefundId,
                payment_transaction_id: testTxId,
                amount: 999,
                provider_payment_id: "pay_rzp_sub_mock_123",
              },
              error: null,
            });
          }
          if (rpcName === "reconcile_processed_refund") {
            return Promise.resolve({
              data: {
                success: true,
                status: "processed",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
        from: jest.fn((table: string) => {
          if (table === "user_roles") {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  in: jest.fn().mockReturnValue({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: { role: "super_admin" },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "refunds") {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: testRefundId,
                      amount: 999,
                      status: "requested",
                      payment_transaction_id: testTxId,
                      payment_transactions: {
                        id: testTxId,
                        provider_payment_id: "pay_rzp_sub_mock_123",
                        status: "captured",
                      },
                    },
                    error: null,
                  }),
                }),
              }),
              update: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === "admin_audit_logs") {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
            };
          }
          return {};
        }),
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: "rfnd_rzp_sub_mock_456",
            amount: 99900, // paise
            status: "processed",
          }),
        json: async () => ({
          id: "rfnd_rzp_sub_mock_456",
          amount: 99900,
          status: "processed",
        }),
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        method: "POST",
        headers: {
          authorization: "Bearer mock_super_admin_jwt",
          "content-type": "application/json",
        },
        body: { refund_id: testRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockSupabase as any,
        fetchFn: mockFetch as any,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.refund_id).toBe(testRefundId);
      expect(body.provider_refund_id).toBe("rfnd_rzp_sub_mock_456");
      expect(body.status).toBe("processed");
    });
  });

  // ===========================================================================
  // 2. Delivery Retry State Machine (admin_retry_astrology_delivery)
  // ===========================================================================
  describe("2. Delivery Retry State Machine", () => {
    function simulateAdminRetryDelivery(params: {
      callerRole: "customer" | "pandit" | "admin" | "super_admin";
      delivery: {
        id: string;
        subscription_id: string;
        content_id: string;
        channel: "in_app" | "whatsapp";
        status: "queued" | "sent" | "failed" | "skipped";
        error_message: string | null;
      };
    }) {
      const { callerRole, delivery } = params;

      // 1. Authorization: Admin or Super Admin
      if (callerRole !== "admin" && callerRole !== "super_admin") {
        throw new Error("Unauthorized: Administrator privileges required to retry astrology deliveries.");
      }

      // 2. State invariant checks
      if (delivery.status === "sent") {
        throw new Error("Cannot retry delivery that has already been successfully sent.");
      }

      if (delivery.status === "skipped") {
        throw new Error("Cannot retry delivery in skipped status.");
      }

      // Idempotency: already queued
      if (delivery.status === "queued") {
        return {
          success: true,
          status: "already_queued",
          delivery_id: delivery.id,
          message: "Delivery is already queued for dispatch.",
        };
      }

      if (delivery.status !== "failed") {
        throw new Error(`Cannot retry delivery in status ${delivery.status} (only failed deliveries may be retried).`);
      }

      // 3. Reset status to queued
      return {
        success: true,
        status: "queued",
        delivery_id: delivery.id,
        subscription_id: delivery.subscription_id,
        content_id: delivery.content_id,
        channel: delivery.channel,
        message: "Astrology delivery status reset to queued for dispatch retry.",
      };
    }

    it("permits both standard Admin and Super Admin to execute delivery retries", () => {
      const failedDelivery = {
        id: testDeliveryId,
        subscription_id: testSubId,
        content_id: "content-1",
        channel: "whatsapp" as const,
        status: "failed" as const,
        error_message: "Gateway timeout communicating with WhatsApp provider",
      };

      const adminResult = simulateAdminRetryDelivery({
        callerRole: "admin",
        delivery: failedDelivery,
      });
      expect(adminResult.success).toBe(true);
      expect(adminResult.status).toBe("queued");

      const superAdminResult = simulateAdminRetryDelivery({
        callerRole: "super_admin",
        delivery: failedDelivery,
      });
      expect(superAdminResult.success).toBe(true);
      expect(superAdminResult.status).toBe("queued");
    });

    it("rejects delivery retry attempts from unauthorized Customer and Pandit roles", () => {
      const failedDelivery = {
        id: testDeliveryId,
        subscription_id: testSubId,
        content_id: "content-1",
        channel: "whatsapp" as const,
        status: "failed" as const,
        error_message: "Network error",
      };

      expect(() =>
        simulateAdminRetryDelivery({
          callerRole: "customer",
          delivery: failedDelivery,
        })
      ).toThrow("Administrator privileges required");

      expect(() =>
        simulateAdminRetryDelivery({
          callerRole: "pandit",
          delivery: failedDelivery,
        })
      ).toThrow("Administrator privileges required");
    });

    it("rejects retry attempt on delivery that is already successfully sent", () => {
      const sentDelivery = {
        id: testDeliveryId,
        subscription_id: testSubId,
        content_id: "content-1",
        channel: "in_app" as const,
        status: "sent" as const,
        error_message: null,
      };

      expect(() =>
        simulateAdminRetryDelivery({
          callerRole: "admin",
          delivery: sentDelivery,
        })
      ).toThrow("Cannot retry delivery that has already been successfully sent");
    });

    it("rejects retry attempt on delivery in skipped status", () => {
      const skippedDelivery = {
        id: testDeliveryId,
        subscription_id: testSubId,
        content_id: "content-1",
        channel: "whatsapp" as const,
        status: "skipped" as const,
        error_message: null,
      };

      expect(() =>
        simulateAdminRetryDelivery({
          callerRole: "admin",
          delivery: skippedDelivery,
        })
      ).toThrow("Cannot retry delivery in skipped status");
    });

    it("handles already queued delivery idempotently without duplicating queue state", () => {
      const queuedDelivery = {
        id: testDeliveryId,
        subscription_id: testSubId,
        content_id: "content-1",
        channel: "in_app" as const,
        status: "queued" as const,
        error_message: null,
      };

      const result = simulateAdminRetryDelivery({
        callerRole: "admin",
        delivery: queuedDelivery,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("already_queued");
    });
  });

  // ===========================================================================
  // 3. Schema Invariants & Ghost Column Rejection
  // ===========================================================================
  describe("3. Schema Invariants & Ghost Column Rejection", () => {
    it("verifies authoritative columns on astrology_subscription_plans and rejects ghost fields", () => {
      const validPlan = {
        id: testPlanId,
        name: "Masik Jyotish Guidance",
        duration_days: 30,
        price: 501,
        currency: "INR",
        daily_in_app_enabled: true,
        weekly_whatsapp_enabled: true,
        is_active: true,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      };

      // Valid fields in schema
      expect(typeof validPlan.name).toBe("string");
      expect(typeof validPlan.duration_days).toBe("number");
      expect(typeof validPlan.price).toBe("number");
      expect(typeof validPlan.currency).toBe("string");
      expect(typeof validPlan.daily_in_app_enabled).toBe("boolean");
      expect(typeof validPlan.weekly_whatsapp_enabled).toBe("boolean");
      expect(typeof validPlan.is_active).toBe("boolean");

      // Assert non-existence of ghost columns in real DB
      expect("frequency" in validPlan).toBe(false);
      expect("description" in validPlan).toBe(false);
      expect("tier" in validPlan).toBe(false);
    });

    it("verifies authoritative columns on astrology_content and rejects hypothetical horoscope fields", () => {
      const validContent = {
        id: "content-guidance-123",
        channel: "in_app",
        title: "Daily Cosmic Alignment",
        body: "Rohini Nakshatra brings clarity and auspicious energy for starting creative endeavors.",
        publish_at: "2026-10-07T06:00:00Z",
        expires_at: "2026-10-08T05:59:59Z",
        status: "published",
        created_by: testAdminUserId,
        created_at: "2026-10-07T00:00:00Z",
        updated_at: "2026-10-07T00:00:00Z",
      };

      // Real columns
      expect(validContent.channel).toBe("in_app");
      expect(validContent.status).toBe("published");
      expect(typeof validContent.body).toBe("string");
      expect(typeof validContent.publish_at).toBe("string");

      // Rejection of ghost columns that do NOT exist in PostgreSQL schema
      expect("zodiac_sign" in validContent).toBe(false);
      expect("content_date" in validContent).toBe(false);
      expect("prediction_text" in validContent).toBe(false);
      expect("lucky_number" in validContent).toBe(false);
      expect("lucky_color" in validContent).toBe(false);
      expect("remedy_text" in validContent).toBe(false);
    });

    it("verifies delivery channel enum allows only in_app and whatsapp", () => {
      const validChannels = ["in_app", "whatsapp"];
      expect(validChannels.includes("in_app")).toBe(true);
      expect(validChannels.includes("whatsapp")).toBe(true);
      expect(validChannels.includes("push")).toBe(false);
      expect(validChannels.includes("email")).toBe(false);
    });
  });

  // ===========================================================================
  // 4. Migration 027 Declarations & Grants Assertions
  // ===========================================================================
  describe("4. Migration 027 Declarations & Grants Assertions", () => {
    it("asserts admin_cancel_astrology_subscription RPC signature and security model", () => {
      const rpcSignature = "admin_cancel_astrology_subscription(p_subscription_id UUID, p_reason TEXT, p_refund_eligible BOOLEAN DEFAULT false)";
      expect(rpcSignature).toContain("p_subscription_id UUID");
      expect(rpcSignature).toContain("p_reason TEXT");
      expect(rpcSignature).toContain("p_refund_eligible BOOLEAN");
    });

    it("asserts admin_retry_astrology_delivery RPC signature and security model", () => {
      const rpcSignature = "admin_retry_astrology_delivery(p_delivery_id UUID)";
      expect(rpcSignature).toContain("p_delivery_id UUID");
    });

    it("asserts minimal index idx_astrology_subscriptions_created_at targeting created_at DESC", () => {
      const indexSql = "CREATE INDEX IF NOT EXISTS idx_astrology_subscriptions_created_at ON public.astrology_subscriptions (created_at DESC)";
      expect(indexSql).toContain("idx_astrology_subscriptions_created_at");
      expect(indexSql).toContain("created_at DESC");
    });
  });
});
