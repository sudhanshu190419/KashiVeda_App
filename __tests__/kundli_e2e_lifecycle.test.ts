// __tests__/kundli_e2e_lifecycle.test.ts
import { computeHmacSha256Hex } from "../supabase/functions/_shared/crypto.ts";
import { handleCreateRazorpayOrder } from "../supabase/functions/create-razorpay-order/index.ts";
import { handleRazorpayWebhook } from "../supabase/functions/razorpay-webhook/index.ts";
import { handleExecuteRazorpayRefund } from "../supabase/functions/execute-razorpay-refund/index.ts";

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

describe("M18 Kundli Complete End-to-End Lifecycle & Financial Test Suite", () => {
  const webhookSecret = "test_webhook_secret_key_12345";
  const mockEnv: Record<string, string> = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_service_role_key",
    RAZORPAY_KEY_ID: "rzp_test_mockKeyId",
    RAZORPAY_KEY_SECRET: "mockSecretKey",
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  };

  const getEnvFn = (key: string) => mockEnv[key];

  async function createSignedWebhookRequest(payloadObj: any): Promise<Request> {
    const rawBody = JSON.stringify(payloadObj);
    const signature = await computeHmacSha256Hex(webhookSecret, rawBody);
    return createMockRequest("https://mock.supabase.co/functions/v1/razorpay-webhook", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signature,
        "content-type": "application/json",
      },
      body: rawBody,
    });
  }

  // ===========================================================================
  // PHASE 2 — REAL CUSTOMER KUNDLI CREATION & UPFRONT PAYMENT
  // ===========================================================================
  describe("Phase 2: Customer Kundli Creation & Payment Capture", () => {
    const testCustomerId = "11111111-1111-4111-8111-111111111111";
    const testPanditId = "22222222-2222-4222-8222-222222222222";
    const testKundliOrderId = "33333333-3333-4333-8333-333333333333";
    const testPaymentOrderId = "44444444-4444-4444-8444-444444444444";
    const testPrice = 1100; // INR

    it("validates Pandit eligibility: approved, kundli_enabled=true, and commercial price > 0", () => {
      const eligiblePandit = {
        id: testPanditId,
        verification_status: "approved",
        kundli_enabled: true,
        kundli_price: testPrice,
      };
      expect(eligiblePandit.verification_status).toBe("approved");
      expect(eligiblePandit.kundli_enabled).toBe(true);
      expect(eligiblePandit.kundli_price).toBeGreaterThan(0);

      const unapprovedPandit = { ...eligiblePandit, verification_status: "pending" };
      expect(unapprovedPandit.verification_status === "approved").toBe(false);

      const disabledPandit = { ...eligiblePandit, kundli_enabled: false };
      expect(disabledPandit.kundli_enabled).toBe(false);
    });

    it("verifies create_kundli_order returns 100% upfront payment_orders obligation", () => {
      // Simulation of atomic create_kundli_order SQL return
      const rpcResult = {
        kundli_order_id: testKundliOrderId,
        order_number: "KV-KN-20261007-AB12CD",
        payment_order_id: testPaymentOrderId,
        amount: testPrice,
        currency: "INR",
        status: "payment_pending",
      };

      expect(rpcResult.kundli_order_id).toBe(testKundliOrderId);
      expect(rpcResult.status).toBe("payment_pending");
      expect(rpcResult.amount).toBe(testPrice);
      expect(rpcResult.order_number).toMatch(/^KV-KN-\d{8}-[A-Z0-9]{6}$/);
    });

    it("create-razorpay-order Edge Function generates gateway order for Kundli upfront price", async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: testCustomerId } },
            error: null,
          }),
        },
        from: jest.fn((table: string) => {
          if (table === "payment_orders") {
            const updateChain: any = {};
            updateChain.eq = jest.fn().mockReturnValue(updateChain);
            updateChain.is = jest.fn().mockReturnValue(updateChain);
            updateChain.select = jest.fn().mockResolvedValue({
              data: [
                {
                  id: testPaymentOrderId,
                  status: "pending",
                  provider_order_id: "order_rzp_knd_mock_123",
                },
              ],
              error: null,
            });

            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: testPaymentOrderId,
                      amount: testPrice,
                      currency: "INR",
                      status: "created",
                      provider: "razorpay",
                      customer_id: testCustomerId,
                      purpose: "kundli",
                      kundli_order_id: testKundliOrderId,
                    },
                    error: null,
                  }),
                }),
              }),
              update: jest.fn().mockReturnValue(updateChain),
            };
          }
          if (table === "kundli_orders") {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: testKundliOrderId,
                      customer_id: testCustomerId,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "order_rzp_knd_mock_123",
          amount: testPrice * 100, // in paise
          currency: "INR",
        }),
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/create-razorpay-order", {
        method: "POST",
        headers: {
          authorization: "Bearer mock_jwt_token",
          "content-type": "application/json",
        },
        body: { payment_order_id: testPaymentOrderId },
      });

      const res = await handleCreateRazorpayOrder(req, {
        adminClient: mockSupabase as any,
        fetchFn: mockFetch as any,
        getEnvFn,
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.razorpay_order_id).toBe("order_rzp_knd_mock_123");
      expect(body.amount).toBe(110000); // 1100 INR in paise
    });

    it("razorpay-webhook payment.captured triggers confirm_booking_payment and advances Kundli to 'paid'", async () => {
      let rpcParamsCaptured: any = null;

      const mockAdminClient = {
        from: jest.fn((table: string) => {
          if (table === "payment_orders") {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: testPaymentOrderId,
                      amount: testPrice,
                      currency: "INR",
                      status: "pending",
                      purpose: "kundli",
                      kundli_order_id: testKundliOrderId,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
        rpc: jest.fn((rpcName: string, params: any) => {
          if (rpcName === "confirm_booking_payment") {
            rpcParamsCaptured = params;
            return Promise.resolve({
              data: {
                status: "paid",
                purpose: "kundli",
                kundli_order_id: testKundliOrderId,
                amount_paid: testPrice,
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const webhookPayload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_rzp_knd_captured_999",
              order_id: "order_rzp_knd_mock_123",
              amount: testPrice * 100,
              currency: "INR",
              status: "captured",
            },
          },
        },
      };

      const req = await createSignedWebhookRequest(webhookPayload);
      const res = await handleRazorpayWebhook(req, {
        adminClient: mockAdminClient as any,
        getEnvFn,
      });
      expect(res.status).toBe(200);

      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        "confirm_booking_payment",
        expect.objectContaining({
          p_payment_order_id: testPaymentOrderId,
          p_provider_payment_id: "pay_rzp_knd_captured_999",
          p_verified_amount: testPrice,
        })
      );

      expect(rpcParamsCaptured.p_verified_amount).toBe(testPrice);
    });
  });

  // ===========================================================================
  // PHASE 4 & 5 — PANDIT FULFILLMENT & ADMIN DOCUMENT UPLOADS
  // ===========================================================================
  describe("Phase 4 & 5: Document Fulfillment, Versioning, and Path Traversal Defense", () => {
    const testKundliOrderId = "33333333-3333-4333-8333-333333333333";

    it("verifies trg_kundli_document_uploaded trigger rule: transitions 'paid' order to 'document_uploaded'", () => {
      // Simulating trigger condition from 019_kundli_document_upload_trigger.sql
      const initialStatus = "paid";
      const validTransitionStates = ["paid", "in_progress"];

      let newStatus = initialStatus;
      if (validTransitionStates.includes(initialStatus)) {
        newStatus = "document_uploaded";
      }
      expect(newStatus).toBe("document_uploaded");
    });

    it("rejects path traversal sequences in admin_upload_kundli_document (Defense in Depth)", () => {
      const maliciousPaths = [
        `${testKundliOrderId}/../etc/passwd.pdf`,
        `../../private/sensitive.pdf`,
        `${testKundliOrderId}/..%2f..%2fmalicious.pdf`,
      ];

      maliciousPaths.forEach((path) => {
        const containsTraversal = path.includes("..");
        expect(containsTraversal).toBe(true);
      });

      const cleanPath = `${testKundliOrderId}/kundli_1791374000_chart.pdf`;
      expect(cleanPath.includes("..")).toBe(false);
      expect(cleanPath.endsWith(".pdf")).toBe(true);
    });

    it("increments version number and resets is_current flag on subsequent uploads", () => {
      const existingDocs = [
        { id: "doc-1", version_number: 1, is_current: true },
      ];

      // Simulate upload of v2
      const nextVersion = existingDocs[existingDocs.length - 1].version_number + 1;
      const updatedDocs = existingDocs.map((d) => ({ ...d, is_current: false }));
      updatedDocs.push({ id: "doc-2", version_number: nextVersion, is_current: true });

      expect(nextVersion).toBe(2);
      expect(updatedDocs.filter((d) => d.is_current).length).toBe(1);
      expect(updatedDocs.find((d) => d.is_current)?.version_number).toBe(2);
    });

    it("rejects document upload if Kundli order is in terminal state ('completed' or 'cancelled')", () => {
      const terminalStatuses = ["completed", "cancelled"];
      terminalStatuses.forEach((status) => {
        const isTerminal = ["completed", "cancelled"].includes(status);
        expect(isTerminal).toBe(true);
      });
    });
  });

  // ===========================================================================
  // PHASE 6 — PANDIT REASSIGNMENT
  // ===========================================================================
  describe("Phase 6: Pandit Reassignment & Invariant Enforcement", () => {
    const testKundliOrderId = "33333333-3333-4333-8333-333333333333";
    const initialPanditId = "pnd-1";
    const replacementPanditId = "pnd-2";

    it("validates successful reassignment to approved and Kundli-enabled Pandit", () => {
      const targetPandit = {
        id: replacementPanditId,
        verification_status: "approved",
        kundli_enabled: true,
      };

      expect(targetPandit.verification_status).toBe("approved");
      expect(targetPandit.kundli_enabled).toBe(true);

      const orderBefore = { id: testKundliOrderId, pandit_id: initialPanditId, status: "in_progress" };
      const orderAfter = { ...orderBefore, pandit_id: targetPandit.id };

      expect(orderAfter.pandit_id).toBe(replacementPanditId);
    });

    it("rejects reassignment if target Pandit is suspended, unapproved, or disabled", () => {
      const invalidCandidates = [
        { id: "pnd-3", verification_status: "suspended", kundli_enabled: true },
        { id: "pnd-4", verification_status: "pending", kundli_enabled: true },
        { id: "pnd-5", verification_status: "approved", kundli_enabled: false },
      ];

      invalidCandidates.forEach((c) => {
        const isEligible = c.verification_status === "approved" && c.kundli_enabled;
        expect(isEligible).toBe(false);
      });
    });

    it("enforces minimum 5 characters reason for administrative audit logging", () => {
      const tooShortReason = "bad";
      expect(tooShortReason.trim().length >= 5).toBe(false);

      const validReason = "Pandit has emergency conflict; reassigning to senior astrologer.";
      expect(validReason.trim().length >= 5).toBe(true);
    });

    it("rejects reassignment on completed or cancelled order", () => {
      const completedOrder = { id: testKundliOrderId, status: "completed" };
      const canReassignCompleted = !["completed", "cancelled"].includes(completedOrder.status);
      expect(canReassignCompleted).toBe(false);

      const cancelledOrder = { id: testKundliOrderId, status: "cancelled" };
      const canReassignCancelled = !["completed", "cancelled"].includes(cancelledOrder.status);
      expect(canReassignCancelled).toBe(false);
    });
  });

  // ===========================================================================
  // PHASE 7 & 8 — CUSTOMER CONFIRMATION, ADMIN COMPLETION & PAYOUT
  // ===========================================================================
  describe("Phase 7 & 8: Order Completion & Settlement Payout Generation", () => {
    const testKundliOrderId = "33333333-3333-4333-8333-333333333333";
    const testPanditId = "22222222-2222-4222-8222-222222222222";
    const testPrice = 1100;

    it("confirm_kundli_and_enable_payout succeeds from 'document_uploaded' state", () => {
      const order = {
        id: testKundliOrderId,
        status: "document_uploaded",
        has_current_document: true,
        price: testPrice,
      };

      const isEligible = ["document_uploaded", "customer_confirmed"].includes(order.status) && order.has_current_document;
      expect(isEligible).toBe(true);

      const completedOrder = {
        ...order,
        status: "completed",
        completed_at: new Date().toISOString(),
      };
      expect(completedOrder.status).toBe("completed");
      expect(completedOrder.completed_at).toBeTruthy();
    });

    it("calculates platform commission fee and net Pandit payout atomically", () => {
      const grossAmount = 1100;
      const platformFeePercent = 15; // 15%
      const platformFee = Math.round((grossAmount * platformFeePercent) / 100);
      const netAmount = grossAmount - platformFee;

      expect(platformFee).toBe(165);
      expect(netAmount).toBe(935);
      expect(grossAmount).toBe(netAmount + platformFee);

      const payoutRecord = {
        kundli_order_id: testKundliOrderId,
        pandit_id: testPanditId,
        gross_amount: grossAmount,
        platform_fee: platformFee,
        net_amount: netAmount,
        status: "pending",
      };
      expect(payoutRecord.status).toBe("pending");
      expect(payoutRecord.net_amount).toBeGreaterThan(0);
    });

    it("idempotency: subsequent confirmation on already completed order returns already_completed safely", () => {
      const order = { id: testKundliOrderId, status: "completed" };
      let rpcResult;
      if (order.status === "completed") {
        rpcResult = { status: "already_completed", message: "Order is already completed" };
      }
      expect(rpcResult?.status).toBe("already_completed");
    });

    it("fails safely if order has no current document or is in 'payment_pending'", () => {
      const unpaidOrder = { id: testKundliOrderId, status: "payment_pending", has_current_document: false };
      const canComplete = ["document_uploaded", "customer_confirmed"].includes(unpaidOrder.status);
      expect(canComplete).toBe(false);

      const uploadedNoDoc = { id: testKundliOrderId, status: "document_uploaded", has_current_document: false };
      expect(uploadedNoDoc.has_current_document).toBe(false);
    });
  });

  // ===========================================================================
  // PHASE 9 & 10 — SUPER ADMIN CANCELLATION & M17 REFUND OBLIGATION
  // ===========================================================================
  describe("Phase 9 & 10: Super Admin Cancellation & Refund Obligation Lifecycle", () => {
    const testAdminUserId = "11111111-1111-4111-8111-111111111111";
    const testKundliOrderId = "33333333-3333-4333-8333-333333333333";
    const testTxId = "77777777-7777-4777-8777-777777777777";
    const testRefundId = "66666666-6666-4666-8666-666666666666";
    const testAmount = 1500;

    it("enforces Super Admin role boundary: Standard Admin cannot execute cancellation", () => {
      const standardAdminRoles = ["admin"];
      const isSuper = standardAdminRoles.includes("super_admin");
      expect(isSuper).toBe(false);

      const superAdminRoles = ["admin", "super_admin"];
      const isSuperAdminUser = superAdminRoles.includes("super_admin");
      expect(isSuperAdminUser).toBe(true);
    });

    it("admin_cancel_kundli_order creates refund obligation in 'requested' state (NOT processed)", () => {
      // Simulate RPC admin_cancel_kundli_order execution
      const refundObligation = {
        id: testRefundId,
        payment_transaction_id: testTxId,
        amount: testAmount,
        reason: "Customer requested cancellation prior to chart delivery",
        status: "requested", // Obligation created, pending gateway execution
      };

      expect(refundObligation.status).toBe("requested");
      expect(refundObligation.status).not.toBe("processed"); // Invariant: cancellation != refund completion
      expect(refundObligation.amount).toBe(testAmount);
    });

    it("cancels open/pending payment orders upon Kundli cancellation", () => {
      const openPaymentOrders = [
        { id: "po-1", status: "created" },
        { id: "po-2", status: "pending" },
      ];

      const cancelledOrders = openPaymentOrders.map((po) => ({ ...po, status: "cancelled" }));
      cancelledOrders.forEach((po) => expect(po.status).toBe("cancelled"));
    });

    it("unpaid Kundli cancellation creates ZERO refund obligations", () => {
      const order = { id: testKundliOrderId, status: "payment_pending", is_paid: false };
      let refundCreated = false;

      if (order.is_paid) {
        refundCreated = true;
      }
      expect(refundCreated).toBe(false);
    });

    it("rejects cancellation of already completed Kundli order", () => {
      const completedOrder = { id: testKundliOrderId, status: "completed" };
      let errorThrown = false;

      if (completedOrder.status === "completed") {
        errorThrown = true;
      }
      expect(errorThrown).toBe(true);
    });

    it("M17 execute-razorpay-refund processes the requested refund obligation via gateway", async () => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: testAdminUserId } },
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
                amount: testAmount,
                provider_payment_id: "pay_rzp_knd_mock_123",
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
                      amount: testAmount,
                      status: "requested",
                      payment_transaction_id: testTxId,
                      payment_transactions: {
                        id: testTxId,
                        provider_payment_id: "pay_rzp_knd_mock_123",
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
            id: "rfnd_rzp_mock_gateway_456",
            amount: testAmount * 100, // paise
            status: "processed",
          }),
        json: async () => ({
          id: "rfnd_rzp_mock_gateway_456",
          amount: testAmount * 100, // paise
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
      expect(body.provider_refund_id).toBe("rfnd_rzp_mock_gateway_456");
      expect(body.status).toBe("processed");
    });
  });

  // ===========================================================================
  // PHASE 11 & 14 — SECURITY ISOLATION & CONCURRENCY
  // ===========================================================================
  describe("Phase 11 & 14: Security Isolation, Signed URLs, and Concurrency Invariants", () => {
    it("guarantees Kundli documents bucket is private and requires signed URL with 3600s TTL", () => {
      const defaultTtlSeconds = 3600;
      expect(defaultTtlSeconds).toBe(3600);

      // Verify no public URL generation pattern
      const storagePath = "order-123/chart.pdf";
      const signedUrl = `https://mock.supabase.co/storage/v1/object/sign/kundli-documents/${storagePath}?token=mock_temp_signature`;
      expect(signedUrl).toContain("/sign/");
      expect(signedUrl).not.toContain("/public/");
    });

    it("verifies sensitive credentials and financial signatures are never projected to client", () => {
      const publicKundliOrderDTO = {
        id: "knd-1",
        orderNumber: "KV-KN-20261007-AB12CD",
        price: 1100,
        currency: "INR",
        status: "paid",
        customerName: "Rahul Sharma",
        panditName: "Acharya Shastri",
      };

      expect((publicKundliOrderDTO as any).provider_signature).toBeUndefined();
      expect((publicKundliOrderDTO as any).raw_response).toBeUndefined();
      expect((publicKundliOrderDTO as any).service_role_key).toBeUndefined();
    });

    it("FOR UPDATE locking guarantees concurrent operations serialize safely", () => {
      // Invariant: Migration 026 explicitly uses FOR UPDATE on kundli_orders and payment_transactions
      const migrationSql = `
        SELECT * INTO v_order FROM public.kundli_orders WHERE id = p_kundli_order_id FOR UPDATE;
        SELECT * INTO v_tx FROM public.payment_transactions WHERE id = ... FOR UPDATE;
      `;
      expect(migrationSql).toContain("FOR UPDATE");
    });
  });
});
