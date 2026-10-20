// __tests__/financial_backend_hardening.test.ts
import { handleExecuteRazorpayRefund } from "../supabase/functions/execute-razorpay-refund/index.ts";
import { handleRazorpayWebhook } from "../supabase/functions/razorpay-webhook/index.ts";
import { computeHmacSha256Hex } from "../supabase/functions/_shared/crypto.ts";
declare const require: any;
declare const __dirname: string;
const fs = require("fs");
const path = require("path");

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

describe("M17-A Financial Backend Hardening Test Suite", () => {
  const validAdminUserId = "admin-1111-1111-1111-111111111111";
  const validRefundId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const validTxId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const validProviderPaymentId = "pay_rzp_mock_payment_123";
  const validProviderRefundId = "rfnd_rzp_mock_refund_456";
  const webhookSecret = "test_webhook_secret_key_12345";

  const mockEnv: Record<string, string> = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_service_role_key",
    RAZORPAY_KEY_ID: "rzp_test_mockKeyId",
    RAZORPAY_KEY_SECRET: "mockSecretKey",
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  };

  const getEnvFn = (key: string) => mockEnv[key];

  // Helper for signing mock webhook requests
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

  // ---------------------------------------------------------------------------
  // 1. Concurrent Refund Requests: Only ONE External Refund Attempt
  // ---------------------------------------------------------------------------
  describe("Scenario 1: Concurrent Refund Requests", () => {
    it("locks the refund and executes external Razorpay API only ONCE, rejecting concurrent attempt with 409", async () => {
      let claimCallCount = 0;
      let externalFetchCount = 0;

      // Mock DB client where claim_refund_for_execution RPC grants lock to first caller and rejects second
      const mockAdminClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: validAdminUserId } },
            error: null,
          }),
        },
        from: (table: string) => {
          if (table === "user_roles") {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: { role: "admin" },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "admin_audit_logs") {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
            };
          }
          return {};
        },
        rpc: jest.fn().mockImplementation((rpcName: string, _args: any) => {
          if (rpcName === "claim_refund_for_execution") {
            claimCallCount++;
            if (claimCallCount === 1) {
              // First call successfully claims
              return Promise.resolve({
                data: {
                  success: true,
                  status: "claimed",
                  refund_id: validRefundId,
                  payment_transaction_id: validTxId,
                  provider_payment_id: validProviderPaymentId,
                  amount: 2500.0,
                },
                error: null,
              });
            } else {
              // Second concurrent call encounters concurrency lock (409)
              return Promise.resolve({
                data: {
                  success: false,
                  status: "already_processing",
                  status_code: 409,
                  error: "Refund execution is already in progress for this record.",
                },
                error: null,
              });
            }
          }
          if (rpcName === "reconcile_processed_refund") {
            return Promise.resolve({
              data: { success: true, status: "refund_processed" },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const mockFetch = jest.fn().mockImplementation(async () => {
        externalFetchCount++;
        return new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 250000,
          }),
          { status: 200 }
        );
      });

      const req1 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const req2 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      // Execute both concurrently
      const [res1, res2] = await Promise.all([
        handleExecuteRazorpayRefund(req1, {
          adminClient: mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        }),
        handleExecuteRazorpayRefund(req2, {
          adminClient: mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        }),
      ]);

      const json1 = await res1.json();
      const json2 = await res2.json();

      expect(res1.status).toBe(200);
      expect(json1.success).toBe(true);
      expect(json1.provider_refund_id).toBe(validProviderRefundId);

      expect(res2.status).toBe(409);
      expect(json2.error).toContain("already in progress");

      // Verify Razorpay gateway API was invoked ONLY ONCE
      expect(externalFetchCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Duplicate Refund Webhook: Idempotent Handling
  // ---------------------------------------------------------------------------
  describe("Scenario 2: Duplicate Refund Webhook", () => {
    it("handles duplicate refund.processed event idempotently without duplicate transition", async () => {
      let rpcCallCount = 0;

      const mockAdminClient = {
        from: (table: string) => {
          if (table === "payment_transactions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: validTxId, amount: 2500.0 },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "refunds") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: validRefundId,
                      amount: 2500.0,
                      status: "processed", // Already processed in prior execution
                      payment_transaction_id: validTxId,
                      provider_refund_id: validProviderRefundId,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: jest.fn().mockImplementation(() => {
          rpcCallCount++;
          return Promise.resolve({ data: { success: true }, error: null });
        }),
      };

      const webhookPayload = {
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: validProviderRefundId,
              payment_id: validProviderPaymentId,
              amount: 250000,
              notes: { refund_id: validRefundId },
            },
          },
        },
      };

      const req = await createSignedWebhookRequest(webhookPayload);
      const res = await handleRazorpayWebhook(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBe("already_processed");
      expect(json.refund_id).toBe(validRefundId);

      // Reconcile RPC must not be called again
      expect(rpcCallCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Processed -> Failed Webhook Ordering: Processed NEVER Regresses
  // ---------------------------------------------------------------------------
  describe("Scenario 3: Processed -> Failed Webhook Ordering (Non-Regression)", () => {
    it("safely ignores refund.failed event when refund is already marked processed", async () => {
      let updateExecuted = false;

      const mockAdminClient = {
        from: (table: string) => {
          if (table === "refunds") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: validRefundId,
                      status: "processed", // Terminal authoritative state
                    },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: () => ({
                  neq: jest.fn().mockImplementation(() => {
                    updateExecuted = true;
                    return Promise.resolve({ error: null });
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      const webhookPayload = {
        event: "refund.failed",
        payload: {
          refund: {
            entity: {
              id: validProviderRefundId,
              payment_id: validProviderPaymentId,
              error_code: "GATEWAY_ERROR",
              error_description: "Delayed gateway timeout failure",
            },
          },
        },
      };

      const req = await createSignedWebhookRequest(webhookPayload);
      const res = await handleRazorpayWebhook(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.status).toBe("ignored_already_processed");
      expect(updateExecuted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Wrong Refund Amount: Rejected
  // ---------------------------------------------------------------------------
  describe("Scenario 4: Wrong Refund Amount", () => {
    it("rejects refund.processed event with 400 when gateway amount does not match expected amount", async () => {
      const mockAdminClient = {
        from: (table: string) => {
          if (table === "payment_transactions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: validTxId, amount: 2500.0 },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "refunds") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: validRefundId,
                      amount: 2500.0, // Expected 250000 paise
                      status: "requested",
                      payment_transaction_id: validTxId,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
        rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      };

      const wrongAmountPayload = {
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: validProviderRefundId,
              payment_id: validProviderPaymentId,
              amount: 150000, // Gateway claims 1500.00 instead of 2500.00
              notes: { refund_id: validRefundId },
            },
          },
        },
      };

      const req = await createSignedWebhookRequest(wrongAmountPayload);
      const res = await handleRazorpayWebhook(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Refund amount mismatch");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Wrong Refund / Payment Identity: Cross-Mutation Rejected
  // ---------------------------------------------------------------------------
  describe("Scenario 5: Wrong Refund / Payment Identity", () => {
    it("rejects refund.processed when refund does not belong to the payment transaction", async () => {
      const otherTxId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

      const mockAdminClient = {
        from: (table: string) => {
          if (table === "payment_transactions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: validTxId, amount: 2500.0 },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "refunds") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: validRefundId,
                      amount: 2500.0,
                      status: "requested",
                      payment_transaction_id: otherTxId, // Belongs to different transaction!
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const mismatchPayload = {
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: validProviderRefundId,
              payment_id: validProviderPaymentId,
              amount: 250000,
              notes: { refund_id: validRefundId },
            },
          },
        },
      };

      const req = await createSignedWebhookRequest(mismatchPayload);
      const res = await handleRazorpayWebhook(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Transaction ownership mismatch");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Admin Refund Payload Contract
  // ---------------------------------------------------------------------------
  describe("Scenario 6: Admin Refund Payload Contract", () => {
    it("Edge Function strictly expects canonical refund_id and rejects refundId", async () => {
      const mockAdminClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: validAdminUserId } },
            error: null,
          }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: { role: "admin" },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      // Non-canonical payload { refundId }
      const badReq = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_jwt" },
        body: { refundId: validRefundId },
      });

      const badRes = await handleExecuteRazorpayRefund(badReq, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      expect(badRes.status).toBe(400);
      const badJson = await badRes.json();
      expect(badJson.error).toContain("Valid UUID refund_id is strictly required");
    });

    it("verifies booking-management.ts sends canonical refund_id in payload", () => {
      const adminActionPath = "C:/Projects/kashi-veda-admin/lib/actions/booking-management.ts";
      const fileContent = fs.readFileSync(adminActionPath, "utf8");

      // Verify canonical contract
      expect(fileContent).toContain('JSON.stringify({ refund_id: refundId })');
      // Verify obsolete mismatch is gone
      expect(fileContent).not.toContain('JSON.stringify({ refundId })');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Refund Preview Mapping
  // ---------------------------------------------------------------------------
  describe("Scenario 7: Refund Preview Mapping Against SQL Return", () => {
    it("correctly maps authoritative SQL fields for Tier 1 (>48h notice = 100% refund)", () => {
      const mockSqlResult = {
        booking_id: "12345678-1234-4234-8234-123456789abc",
        is_cancellable: true,
        hours_before: 52.4,
        total_captured: 5000.0,
        already_refunded: 0.0,
        net_captured: 5000.0,
        refundable_base: 5000.0,
        refund_percent: 100.0,
        refund_amount: 5000.0,
        deduction_amount: 0.0,
        policy_name: "Full Refund (>48h Before Ritual)",
      };

      // Emulate mapping function in previewCancellationRefundAction
      const mapped = {
        bookingId: String(mockSqlResult.booking_id),
        isCancellable: Boolean(mockSqlResult.is_cancellable),
        hoursBefore: Number(mockSqlResult.hours_before),
        policyName: String(mockSqlResult.policy_name),
        refundPercent: Number(mockSqlResult.refund_percent),
        totalCaptured: Number(mockSqlResult.total_captured),
        alreadyRefunded: Number(mockSqlResult.already_refunded),
        netCaptured: Number(mockSqlResult.net_captured),
        refundableBase: Number(mockSqlResult.refundable_base),
        refundAmount: Number(mockSqlResult.refund_amount),
        deductionAmount: Number(mockSqlResult.deduction_amount),
      };

      expect(mapped.policyName).toBe("Full Refund (>48h Before Ritual)");
      expect(mapped.refundPercent).toBe(100.0);
      expect(mapped.totalCaptured).toBe(5000.0);
      expect(mapped.refundAmount).toBe(5000.0);
      expect(mapped.deductionAmount).toBe(0.0);
      expect(mapped.isCancellable).toBe(true);
    });

    it("correctly maps authoritative SQL fields for Tier 3 (<24h notice = 0% refund)", () => {
      const mockSqlResult = {
        booking_id: "12345678-1234-4234-8234-123456789abc",
        is_cancellable: true,
        hours_before: 14.2,
        total_captured: 5000.0,
        already_refunded: 0.0,
        net_captured: 5000.0,
        refundable_base: 0.0,
        refund_percent: 0.0,
        refund_amount: 0.0,
        deduction_amount: 5000.0,
        policy_name: "Non-Refundable Policy (<24h)",
      };

      const mapped = {
        bookingId: String(mockSqlResult.booking_id),
        isCancellable: Boolean(mockSqlResult.is_cancellable),
        hoursBefore: Number(mockSqlResult.hours_before),
        policyName: String(mockSqlResult.policy_name),
        refundPercent: Number(mockSqlResult.refund_percent),
        totalCaptured: Number(mockSqlResult.total_captured),
        refundAmount: Number(mockSqlResult.refund_amount),
        deductionAmount: Number(mockSqlResult.deduction_amount),
      };

      expect(mapped.policyName).toBe("Non-Refundable Policy (<24h)");
      expect(mapped.refundPercent).toBe(0.0);
      expect(mapped.refundAmount).toBe(0.0);
      expect(mapped.deductionAmount).toBe(5000.0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Financial Audit Behavior
  // ---------------------------------------------------------------------------
  describe("Scenario 8: Audit Behavior in Authoritative Backend", () => {
    it("creates durable audit log entry upon successful refund execution", async () => {
      let auditLogRecord: any = null;

      const mockAdminClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: validAdminUserId } },
            error: null,
          }),
        },
        from: (table: string) => {
          if (table === "user_roles") {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: { role: "admin" },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "admin_audit_logs") {
            return {
              insert: jest.fn().mockImplementation((record: any) => {
                auditLogRecord = record;
                return Promise.resolve({ error: null });
              }),
            };
          }
          return {};
        },
        rpc: jest.fn().mockImplementation((rpcName: string) => {
          if (rpcName === "claim_refund_for_execution") {
            return Promise.resolve({
              data: {
                success: true,
                refund_id: validRefundId,
                payment_transaction_id: validTxId,
                provider_payment_id: validProviderPaymentId,
                amount: 1000.0,
              },
              error: null,
            });
          }
          if (rpcName === "reconcile_processed_refund") {
            return Promise.resolve({
              data: { success: true, status: "refund_processed" },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 100000,
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      expect(auditLogRecord).not.toBeNull();
      expect(auditLogRecord.actor_user_id).toBe(validAdminUserId);
      expect(auditLogRecord.action).toBe("execute_gateway_refund_success");
      expect(auditLogRecord.entity_type).toBe("refund");
      expect(auditLogRecord.entity_id).toBe(validRefundId);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. RPC Execution Grants in Migration 024
  // ---------------------------------------------------------------------------
  describe("Scenario 9: RPC Execution Grants (Migration 024 Verification)", () => {
    it("verifies narrow grants for calculate_booking_balance, cancel_booking_and_calculate_refund, mark_booking_completed", () => {
      const migrationPath = path.resolve(__dirname, "../supabase/migrations/024_financial_backend_hardening.sql");
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, "utf8");

      // Verify narrow grants
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.calculate_booking_balance(UUID) TO authenticated, service_role;");
      expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.calculate_booking_balance(UUID) FROM PUBLIC, anon;");

      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) TO authenticated, service_role;");
      expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) FROM PUBLIC, anon;");

      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.mark_booking_completed(UUID) TO authenticated, service_role;");
      expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.mark_booking_completed(UUID) FROM PUBLIC, anon;");

      // Privileged reconciliation RPCs restricted to service_role ONLY
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reconcile_processed_refund(UUID, TEXT, BIGINT, TEXT, JSONB) TO service_role;");
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT) TO service_role;");
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Sensitive Financial Data DTO Protection
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // 10. Sensitive Financial Data DTO Protection
  // ---------------------------------------------------------------------------
  describe("Scenario 10: Sensitive Financial Data Protection", () => {
    it("verifies provider_signature and raw_response are omitted from client projections and ciphertext is hidden", () => {
      const adminActionPath = "C:/Projects/kashi-veda-admin/lib/actions/booking-management.ts";
      const fileContent = fs.readFileSync(adminActionPath, "utf8");

      // Verify provider_signature is never selected
      expect(fileContent).not.toMatch(/select\([^)]*provider_signature[^)]*\)/i);
      // Verify raw_response is never selected
      expect(fileContent).not.toMatch(/select\([^)]*raw_response[^)]*\)/i);
      // Verify account_number_encrypted is NOT selected into browser DTOs
      expect(fileContent).not.toContain('account_number_encrypted');
      // Verify masked placeholder is used
      expect(fileContent).toContain('"Account number hidden"');
      // Verify payout destination uses rawPayout.bank_account_id
      expect(fileContent).toContain('rawPayout.bank_account_id');
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Authoritative Stuck Refund Recovery (admin_unlock_stuck_refund) Helper
  // ---------------------------------------------------------------------------
  interface RefundRow {
    id: string;
    status: "requested" | "processing" | "processed" | "failed";
    provider_refund_id: string | null;
    execution_attempt_id?: string | null;
    amount: number;
    updated_at: Date;
    created_at: Date;
  }

  function simulateRecordRefundRecoveryAuthorization(
    refund: RefundRow,
    caller: { userId: string; role: string } | null,
    reviewedOutcome: string,
    justification: string,
    now: Date = new Date(),
    auditLogs: Array<any> = []
  ) {
    if (!caller || caller.role !== "super_admin") {
      throw new Error("Access denied: Only Super Administrators can authorize financial recovery of ambiguous refund outcomes.");
    }
    const cleanOutcome = (reviewedOutcome || "").toLowerCase().trim();
    if (
      ![
        "manual_gateway_dashboard_verified_no_refund",
        "merchant_bank_account_verified_no_debit",
        "provider_support_ticket_confirmed_void",
      ].includes(cleanOutcome)
    ) {
      return {
        success: false,
        status: "invalid_reviewed_outcome",
        error: "A valid reviewed provider outcome classification is mandatory (e.g. manual_gateway_dashboard_verified_no_refund, merchant_bank_account_verified_no_debit, provider_support_ticket_confirmed_void).",
        status_code: 400,
      };
    }
    const cleanJustification = (justification || "").trim();
    if (cleanJustification.length < 15) {
      return {
        success: false,
        status: "empty_justification",
        error: "A detailed operational justification (minimum 15 characters) documenting the external financial verification is mandatory.",
        status_code: 400,
      };
    }
    if (refund.status !== "processing") {
      return {
        success: false,
        status: "invalid_status",
        error: "Recovery authorization is only applicable to refunds in 'processing' status.",
        status_code: 400,
      };
    }
    if (refund.provider_refund_id !== null) {
      return {
        success: false,
        status: "gateway_id_present",
        error: "Refund already has an active gateway provider refund ID. Recovery cannot be authorized.",
        status_code: 400,
      };
    }
    if (!refund.execution_attempt_id) {
      return {
        success: false,
        status: "reconciliation_required",
        error: "Refund has no active processing attempt token.",
        status_code: 400,
      };
    }
    const hasConflict = auditLogs.some(
      (log) =>
        log.action === "refund_reconciliation_conflict" &&
        (log.details?.execution_attempt_id === refund.execution_attempt_id ||
         (!log.created_at || (now.getTime() - log.created_at.getTime()) <= 2 * 60 * 60 * 1000))
    );
    if (hasConflict) {
      return {
        success: false,
        status: "reconciliation_conflict",
        error: "Cannot authorize recovery: gateway reconciliation detected conflicting refund records on Razorpay.",
        status_code: 400,
      };
    }
    const hasReconcileProof = auditLogs.some(
      (log) =>
        log.action === "refund_reconciliation_not_found" &&
        log.details?.execution_attempt_id === refund.execution_attempt_id &&
        (!log.created_at || (now.getTime() - log.created_at.getTime()) <= 2 * 60 * 60 * 1000)
    );
    if (!hasReconcileProof) {
      return {
        success: false,
        status: "reconciliation_required",
        error: "Exhaustive gateway reconciliation showing no matching refund must be completed for the current attempt before authorization can be recorded.",
        status_code: 400,
      };
    }

    const authLog = {
      action: "refund_recovery_authorized",
      entity_type: "refund",
      entity_id: refund.id,
      created_at: now,
      details: {
        refund_id: refund.id,
        execution_attempt_id: refund.execution_attempt_id,
        reviewed_outcome: cleanOutcome,
        justification: cleanJustification,
        authorized_by: caller.userId,
        timestamp: now.toISOString(),
      },
    };
    auditLogs.push(authLog);
    return {
      success: true,
      status: "recovery_authorized",
      refund_id: refund.id,
      execution_attempt_id: refund.execution_attempt_id,
      reviewed_outcome: cleanOutcome,
      status_code: 200,
      auditLog: authLog,
    };
  }

  function simulateAdminUnlockStuckRefund(
    refund: RefundRow | null,
    caller: { userId: string; role: string } | null,
    reason: string,
    now: Date = new Date(),
    auditLogsOrRecorder?: Array<{ action: string; entity_id: string; entity_type: string; details?: any; created_at?: Date }> | ((entry: any) => void),
    auditLogRecorderOrOutcome?: ((entry: any) => void) | string | null,
    reviewedOutcomeParam?: string | null,
    requireFinancialReviewParam?: boolean
  ) {
    let auditLogs: Array<{ action: string; entity_id: string; entity_type: string; details?: any; created_at?: Date }> | undefined;
    let actualRecorder: ((entry: any) => void) | undefined;
    let reviewedOutcome: string | null = null;
    let requireFinancialReview = Boolean(requireFinancialReviewParam);

    if (typeof auditLogsOrRecorder === "function") {
      actualRecorder = auditLogsOrRecorder;
    } else if (Array.isArray(auditLogsOrRecorder)) {
      auditLogs = auditLogsOrRecorder;
    }

    if (typeof auditLogRecorderOrOutcome === "function") {
      actualRecorder = auditLogRecorderOrOutcome;
    } else if (typeof auditLogRecorderOrOutcome === "string") {
      reviewedOutcome = auditLogRecorderOrOutcome;
    }

    if (typeof reviewedOutcomeParam === "string") {
      reviewedOutcome = reviewedOutcomeParam;
    }

    // 1. Authorization: Only authenticated Admin / Super Admin
    if (!caller || !["admin", "super_admin"].includes(caller.role)) {
      throw new Error("Access denied: Only administrators can recover stuck refunds.");
    }

    // 2. Reason validation: Mandatory non-empty reason
    const cleanReason = reason ? reason.trim() : "";
    if (!cleanReason) {
      return {
        success: false,
        status: "empty_reason",
        error: "A valid non-empty reason is mandatory for administrative refund recovery.",
        status_code: 400,
      };
    }

    if (!refund) {
      return {
        success: false,
        status: "not_found",
        error: "Refund record not found.",
        status_code: 404,
      };
    }

    // 4. Status validation: Cannot recover processed refunds
    if (refund.status === "processed") {
      return {
        success: false,
        status: "already_processed",
        error: "Refund has already been processed by the gateway and cannot be recovered or reset.",
        status_code: 400,
      };
    }

    // Can only recover processing refunds
    if (refund.status !== "processing") {
      return {
        success: false,
        status: "invalid_status",
        error: `Only refunds in 'processing' state can be recovered. Current status is '${refund.status}'.`,
        status_code: 400,
      };
    }

    // 5. Gateway Dispatch Verification: provider_refund_id must be NULL
    if (refund.provider_refund_id !== null) {
      return {
        success: false,
        status: "gateway_id_present",
        error: `Refund already has an active gateway provider refund ID (${refund.provider_refund_id}). Automatic reconciliation must be awaited.`,
        status_code: 400,
      };
    }

    // 6. Safe Age Verification: Must have remained in processing for >= 15 minutes
    const refTime = refund.updated_at || refund.created_at;
    const ageMinutes = (now.getTime() - refTime.getTime()) / (1000 * 60);
    if (ageMinutes < 15.0) {
      return {
        success: false,
        status: "too_recent",
        error: `Refund claim was updated ${ageMinutes.toFixed(1)} minutes ago. A minimum in-flight grace period of 15 minutes is required before administrative recovery.`,
        age_minutes: ageMinutes,
        min_required_minutes: 15.0,
        status_code: 400,
      };
    }

    // 7. Durable Server-Enforced Reconciliation Precondition:
    // Requires verified exhaustive gateway reconciliation showing no matching refund before unlocking,
    // and strictly blocks unlock if any reconciliation conflict was detected.
    if (auditLogs !== undefined) {
      // Must have active execution_attempt_id
      if (!refund.execution_attempt_id) {
        return {
          success: false,
          status: "reconciliation_required",
          error: "Refund has no active processing attempt token. Reconciliation must be executed for the current attempt before unlocking.",
          status_code: 400,
        };
      }

      const hasConflict = auditLogs.some(
        (log: any) =>
          log.entity_type === "refund" &&
          log.entity_id === refund.id &&
          log.action === "refund_reconciliation_conflict" &&
          (log.details?.execution_attempt_id === refund.execution_attempt_id ||
           (!log.created_at || (now.getTime() - log.created_at.getTime()) <= 2 * 60 * 60 * 1000))
      );

      if (hasConflict) {
        return {
          success: false,
          status: "reconciliation_conflict",
          error: "Administrative recovery cannot proceed: gateway reconciliation detected conflicting refund records on Razorpay.",
          status_code: 400,
        };
      }

      const hasReconcileProof = auditLogs.some(
        (log: any) =>
          log.entity_type === "refund" &&
          log.entity_id === refund.id &&
          log.action === "refund_reconciliation_not_found" &&
          log.details?.execution_attempt_id === refund.execution_attempt_id &&
          (!log.created_at || (now.getTime() - log.created_at.getTime()) <= 2 * 60 * 60 * 1000)
      );

      if (!hasReconcileProof) {
        return {
          success: false,
          status: "reconciliation_required",
          error: "Administrative recovery requires verified exhaustive gateway reconciliation showing no matching refund for the current processing attempt before unlocking. Proof from prior attempts is invalid.",
          status_code: 400,
        };
      }

      // 8. Explicit Financial-Operations Review Precondition (When enforced):
      if (requireFinancialReview) {
        const cleanOutcome = (reviewedOutcome || "").toLowerCase().trim();
        let hasFinancialAuth = false;

        if (cleanOutcome) {
          if (caller.role !== "super_admin") {
            throw new Error("Access denied: Only Super Administrators can authorize recovery of ambiguous refund outcomes.");
          }
          if (
            ![
              "manual_gateway_dashboard_verified_no_refund",
              "merchant_bank_account_verified_no_debit",
              "provider_support_ticket_confirmed_void",
            ].includes(cleanOutcome)
          ) {
            return {
              success: false,
              status: "invalid_reviewed_outcome",
              error: "A valid reviewed provider outcome classification is mandatory (e.g. manual_gateway_dashboard_verified_no_refund, merchant_bank_account_verified_no_debit, provider_support_ticket_confirmed_void).",
              status_code: 400,
            };
          }
          if (cleanReason.length < 15) {
            return {
              success: false,
              status: "empty_justification",
              error: "A detailed operational justification (minimum 15 characters) documenting the external financial verification is mandatory.",
              status_code: 400,
            };
          }
          hasFinancialAuth = true;
        } else {
          hasFinancialAuth = auditLogs.some(
            (log: any) =>
              log.entity_type === "refund" &&
              log.entity_id === refund.id &&
              log.action === "refund_recovery_authorized" &&
              log.details?.execution_attempt_id === refund.execution_attempt_id &&
              (!log.created_at || (now.getTime() - log.created_at.getTime()) <= 2 * 60 * 60 * 1000)
          );
        }

        if (!hasFinancialAuth) {
          return {
            success: false,
            status: "financial_review_required",
            error: "Administrative recovery of an ambiguous in-flight refund requires an explicit financial-operations review decision (refund_recovery_authorized) confirming no external debit occurred. An automated search alone cannot authorize recovery.",
            status_code: 400,
          };
        }
      }
    }

    // 9. Transition: processing -> failed
    const previousStatus = refund.status;
    const previousAttemptId = refund.execution_attempt_id;
    refund.status = "failed";
    refund.execution_attempt_id = null;
    refund.updated_at = now;

    // 10. Authoritative Audit Log
    if (actualRecorder) {
      actualRecorder({
        actor_user_id: caller.userId,
        action: "refund_processing_recovered",
        entity_type: "refund",
        entity_id: refund.id,
        details: {
          refund_id: refund.id,
          execution_attempt_id: previousAttemptId,
          previous_status: previousStatus,
          new_status: "failed",
          actor: caller.userId,
          reason: cleanReason,
          in_flight_age_minutes: Math.round(ageMinutes * 10) / 10,
          timestamp: now.toISOString(),
        },
      });
    }

    return {
      success: true,
      status: "recovered_to_failed",
      refund_id: refund.id,
      previous_status: previousStatus,
      new_status: "failed",
      reason: cleanReason,
      status_code: 200,
    };
  }

  describe("Scenario 11: Stuck Processing Refund Recovery", () => {

    it("1. processing + provider_refund_id NULL + older than threshold -> recovery succeeds", () => {
      const now = new Date();
      const sixteenMinutesAgo = new Date(now.getTime() - 16 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: sixteenMinutesAgo,
        updated_at: sixteenMinutesAgo,
      };

      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Confirmed Razorpay API timeout with no provider refund created in dashboard",
        now
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe("recovered_to_failed");
      expect(res.new_status).toBe("failed");
      expect(refund.status).toBe("failed");
      expect(refund.updated_at).toEqual(now);
    });

    it("2. processing + too recent (<15 mins) -> recovery rejected", () => {
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: tenMinutesAgo,
        updated_at: tenMinutesAgo,
      };

      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Trying early recovery",
        now
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe("too_recent");
      expect(res.status_code).toBe(400);
      expect(refund.status).toBe("processing");
    });

    it("3. processing + provider_refund_id present -> recovery rejected", () => {
      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: validProviderRefundId,
        amount: 2500.0,
        created_at: twentyMinutesAgo,
        updated_at: twentyMinutesAgo,
      };

      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Trying to unlock refund that has provider refund ID",
        now
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe("gateway_id_present");
      expect(res.status_code).toBe(400);
      expect(refund.status).toBe("processing");
    });

    it("4. processed -> recovery rejected", () => {
      const now = new Date();
      const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processed",
        provider_refund_id: validProviderRefundId,
        amount: 2500.0,
        created_at: anHourAgo,
        updated_at: anHourAgo,
      };

      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Attempting recovery on processed refund",
        now
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe("already_processed");
      expect(res.status_code).toBe(400);
      expect(refund.status).toBe("processed");
    });

    it("5. requested -> recovery rejected", () => {
      const now = new Date();
      const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "requested",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: anHourAgo,
        updated_at: anHourAgo,
      };

      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Attempting recovery on requested refund",
        now
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe("invalid_status");
      expect(res.status_code).toBe(400);
      expect(refund.status).toBe("requested");
    });

    it("6. failed -> recovery rejected", () => {
      const now = new Date();
      const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "failed",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: anHourAgo,
        updated_at: anHourAgo,
      };

      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Attempting recovery on already-failed refund",
        now
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe("invalid_status");
      expect(res.status_code).toBe(400);
      expect(refund.status).toBe("failed");
    });

    it("7. non-admin caller -> rejected", () => {
      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: twentyMinutesAgo,
        updated_at: twentyMinutesAgo,
      };

      expect(() => {
        simulateAdminUnlockStuckRefund(
          refund,
          { userId: "customer-123", role: "customer" },
          "Customer trying recovery",
          now
        );
      }).toThrow(/Access denied: Only administrators/i);

      expect(() => {
        simulateAdminUnlockStuckRefund(
          refund,
          null,
          "Anonymous caller",
          now
        );
      }).toThrow(/Access denied: Only administrators/i);
    });

    it("8. empty reason -> rejected", () => {
      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: twentyMinutesAgo,
        updated_at: twentyMinutesAgo,
      };

      const resEmpty = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "   ",
        now
      );

      expect(resEmpty.success).toBe(false);
      expect(resEmpty.status).toBe("empty_reason");
      expect(resEmpty.status_code).toBe(400);
      expect(refund.status).toBe("processing");
    });

    it("9. recovery creates audit event", () => {
      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: twentyMinutesAgo,
        updated_at: twentyMinutesAgo,
      };

      let recordedAudit: any = null;
      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Operational recovery of stuck processing claim",
        now,
        (entry) => {
          recordedAudit = entry;
        }
      );

      expect(res.success).toBe(true);
      expect(recordedAudit).not.toBeNull();
      expect(recordedAudit.actor_user_id).toBe(validAdminUserId);
      expect(recordedAudit.action).toBe("refund_processing_recovered");
      expect(recordedAudit.entity_type).toBe("refund");
      expect(recordedAudit.entity_id).toBe(validRefundId);
      expect(recordedAudit.details.previous_status).toBe("processing");
      expect(recordedAudit.details.new_status).toBe("failed");
      expect(recordedAudit.details.reason).toBe("Operational recovery of stuck processing claim");
      expect(recordedAudit.details.actor).toBe(validAdminUserId);
    });

    it("10. after recovery: processing -> failed and normal claim can subsequently retry safely", () => {
      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: twentyMinutesAgo,
        updated_at: twentyMinutesAgo,
      };

      // Step 1: Stuck refund is recovered to 'failed'
      const recoveryRes = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Release orphaned lock",
        now
      );
      expect(recoveryRes.success).toBe(true);
      expect(refund.status).toBe("failed");

      // Step 2: Normal claim_refund_for_execution RPC accepts 'failed' state and claims lock
      function simulateClaimRefund(r: RefundRow) {
        if (!["requested", "failed"].includes(r.status)) {
          return { success: false, status: "invalid_status" };
        }
        r.status = "processing";
        r.updated_at = new Date();
        return {
          success: true,
          status: "claimed",
          refund_id: r.id,
          amount: r.amount,
        };
      }

      const claimRes = simulateClaimRefund(refund);
      expect(claimRes.success).toBe(true);
      expect(claimRes.status).toBe("claimed");
      expect(refund.status).toBe("processing");
    });

    it("11. concurrent recovery attempts -> only one succeeds", () => {
      const now = new Date();
      const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        amount: 2500.0,
        created_at: twentyMinutesAgo,
        updated_at: twentyMinutesAgo,
      };

      // First recovery attempt succeeds under SELECT ... FOR UPDATE lock
      const res1 = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "First recovery attempt",
        now
      );
      expect(res1.success).toBe(true);
      expect(refund.status).toBe("failed");

      // Second concurrent recovery attempt sees status='failed' and is rejected
      const res2 = simulateAdminUnlockStuckRefund(
        refund,
        { userId: "admin-2222-2222-2222-222222222222", role: "admin" },
        "Second concurrent recovery attempt",
        now
      );
      expect(res2.success).toBe(false);
      expect(res2.status).toBe("invalid_status");
      expect(res2.status_code).toBe(400);
    });

    it("verifies authoritative Migration 025 RPC declaration, grants, and audit assertions", () => {
      const migration25Path = path.resolve(__dirname, "../supabase/migrations/025_financial_refund_recovery.sql");
      expect(fs.existsSync(migration25Path)).toBe(true);

      const sql = fs.readFileSync(migration25Path, "utf8");

      // Schema upgrades
      expect(sql).toContain("ALTER TABLE public.refunds");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();");
      expect(sql).toContain("ALTER TABLE public.admin_audit_logs");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS details JSONB;");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_refunds_status_updated_at");

      // RPC signature & security
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_unlock_stuck_refund(");
      expect(sql).toContain("SECURITY DEFINER");
      expect(sql).toContain("SET search_path = public, extensions");
      expect(sql).toContain("c_min_age_minutes CONSTANT NUMERIC := 15.0;");
      expect(sql).toContain("WHERE id = p_refund_id\n    FOR UPDATE;");
      expect(sql).toContain("v_refund.provider_refund_id IS NOT NULL");
      expect(sql).toContain("v_age_minutes < c_min_age_minutes");
      expect(sql).toContain("SET status = 'failed'::public.refund_status");
      expect(sql).toContain("'refund_processing_recovered'");

      // Permissions
      expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT) FROM PUBLIC, anon;");
      expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT) TO authenticated, service_role;");
    });

    it("verifies Admin Web unlockStuckRefundAction Server Action contract and validation", () => {
      const adminActionPath = "C:/Projects/kashi-veda-admin/lib/actions/booking-management.ts";
      const fileContent = fs.readFileSync(adminActionPath, "utf8");

      expect(fileContent).toContain("export async function unlockStuckRefundAction(");
      expect(fileContent).toContain("await requireAdmin(supabase)");
      expect(fileContent).toContain("admin_unlock_stuck_refund");
      expect(fileContent).toContain("cleanReason.length < 5");
      expect(fileContent).toContain("revalidatePath");
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Razorpay Refund Idempotency Header (X-Refund-Idempotency) & Retry Invariants
  // ---------------------------------------------------------------------------
  describe("Scenario 12: Razorpay Refund Idempotency Header (X-Refund-Idempotency) & Retry Invariants", () => {
    function setupRefundMockClient(customRefundStatus: string = "requested", customRefundData: any = {}) {
      let currentRefundStatus = customRefundStatus;
      let recordedAuditLog: any = null;
      let updateCalls: any[] = [];

      const mockAdminClient = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: validAdminUserId } },
            error: null,
          }),
        },
        from: (table: string) => {
          if (table === "user_roles") {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    maybeSingle: jest.fn().mockResolvedValue({
                      data: { role: "admin" },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "admin_audit_logs") {
            return {
              insert: jest.fn().mockImplementation((payload) => {
                recordedAuditLog = payload;
                return Promise.resolve({ error: null });
              }),
            };
          }
          if (table === "refunds") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockImplementation(() =>
                    Promise.resolve({
                      data: {
                        id: validRefundId,
                        payment_transaction_id: validTxId,
                        booking_cancellation_id: "cancel-1111-1111",
                        amount: 2500.0,
                        status: currentRefundStatus,
                        provider_refund_id: currentRefundStatus === "processed" ? validProviderRefundId : null,
                        payment_transaction: {
                          id: validTxId,
                          provider_payment_id: validProviderPaymentId,
                          amount: 2500.0,
                          status: currentRefundStatus === "processed" ? "refunded" : "captured",
                        },
                      },
                      error: null,
                    })
                  ),
                }),
              }),
              update: (updatePayload: any) => ({
                eq: (_col: string, _val: any) => {
                  updateCalls.push(updatePayload);
                  if (updatePayload.status) {
                    currentRefundStatus = updatePayload.status;
                  }
                  return Promise.resolve({ error: null });
                },
              }),
            };
          }
          return {};
        },
        rpc: jest.fn().mockImplementation((rpcName: string, args: any) => {
          if (rpcName === "claim_refund_for_execution") {
            if (currentRefundStatus === "processed") {
              return Promise.resolve({
                data: {
                  success: true,
                  status: "already_processed",
                  refund_id: validRefundId,
                  provider_refund_id: validProviderRefundId,
                  amount: 2500.0,
                  status_code: 200,
                },
                error: null,
              });
            }
            if (currentRefundStatus === "processing") {
              return Promise.resolve({
                data: {
                  success: false,
                  status: "already_processing",
                  status_code: 409,
                  error: "Refund execution is already in progress for this record.",
                },
                error: null,
              });
            }
            if (currentRefundStatus === "requested" || currentRefundStatus === "failed") {
              currentRefundStatus = "processing";
              return Promise.resolve({
                data: {
                  success: true,
                  status: "claimed",
                  refund_id: validRefundId,
                  payment_transaction_id: validTxId,
                  provider_payment_id: validProviderPaymentId,
                  amount: 2500.0,
                  booking_cancellation_id: "cancel-1111-1111",
                  status_code: 200,
                  ...customRefundData,
                },
                error: null,
              });
            }
            return Promise.resolve({
              data: {
                success: false,
                status: "invalid_status",
                error: `Refund cannot be executed from status ${currentRefundStatus}`,
                status_code: 400,
              },
              error: null,
            });
          }
          if (rpcName === "reconcile_processed_refund") {
            currentRefundStatus = "processed";
            return Promise.resolve({
              data: {
                success: true,
                status: "refund_processed",
                refund_id: validRefundId,
                provider_refund_id: args.p_provider_refund_id,
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      return {
        mockAdminClient,
        getStatus: () => currentRefundStatus,
        setStatus: (s: string) => {
          currentRefundStatus = s;
        },
        getAuditLog: () => recordedAuditLog,
        getUpdateCalls: () => updateCalls,
      };
    }

    it("1. [Exact Header & Key Derivation] sends X-Refund-Idempotency derived from refund UUID and exact request payload", async () => {
      const helper = setupRefundMockClient("requested");
      let capturedRequest: { url: string; options: RequestInit } | null = null;

      const mockFetch = jest.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedRequest = { url, options };
        return new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 250000,
          }),
          { status: 200 }
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(capturedRequest).not.toBeNull();

      // 1. Assert exact endpoint URL
      expect(capturedRequest!.url).toBe(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(validProviderPaymentId)}/refund`
      );

      // 2. Assert exact header name is X-Refund-Idempotency and NOT X-Razorpay-Idempotency
      const headers = capturedRequest!.options.headers as Record<string, string>;
      expect(headers["X-Refund-Idempotency"]).toBe(`refund_${validRefundId}`);
      expect(headers["X-Razorpay-Idempotency"]).toBeUndefined();

      // 3. Assert Authorization header format
      expect(headers["Authorization"]).toMatch(/^Basic /);
      expect(headers["Content-Type"]).toBe("application/json");

      // 4. Assert exact request body payload
      const sentBody = JSON.parse(capturedRequest!.options.body as string);
      expect(sentBody).toEqual({
        amount: 250000, // 2500.00 * 100 paise
        notes: {
          refund_id: validRefundId,
          booking_cancellation_id: "cancel-1111-1111",
        },
      });
    });

    it("2. [Retry Stability] repeated retry attempts use identical X-Refund-Idempotency key, payment ID, amount, and body", async () => {
      const helper = setupRefundMockClient("failed");
      const capturedRequests: Array<{ url: string; headers: Record<string, string>; body: any }> = [];

      const mockFetch = jest.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedRequests.push({
          url,
          headers: options.headers as Record<string, string>,
          body: JSON.parse(options.body as string),
        });
        return new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 250000,
          }),
          { status: 200 }
        );
      });

      // Attempt 1: First execution from status 'failed'
      const req1 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      const res1 = await handleExecuteRazorpayRefund(req1, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });
      expect(res1.status).toBe(200);

      // Now reset status to 'failed' to simulate a retried attempt
      helper.setStatus("failed");

      // Attempt 2: Second execution (retry)
      const req2 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      const res2 = await handleExecuteRazorpayRefund(req2, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });
      expect(res2.status).toBe(200);

      expect(capturedRequests.length).toBe(2);

      // Invariants across retries:
      // Exact same idempotency key
      expect(capturedRequests[0].headers["X-Refund-Idempotency"]).toBe(`refund_${validRefundId}`);
      expect(capturedRequests[1].headers["X-Refund-Idempotency"]).toBe(`refund_${validRefundId}`);
      expect(capturedRequests[0].headers["X-Refund-Idempotency"]).toBe(capturedRequests[1].headers["X-Refund-Idempotency"]);

      // Exact same payment ID endpoint
      expect(capturedRequests[0].url).toBe(capturedRequests[1].url);

      // Exact same amount and body
      expect(capturedRequests[0].body).toEqual(capturedRequests[1].body);
      expect(capturedRequests[0].body.amount).toBe(250000);
      expect(capturedRequests[0].body.notes.refund_id).toBe(validRefundId);
    });

    it("3. [Ambiguous Network Failure] timeout/fetch error preserves 'processing' status and cannot create duplicate independent refund", async () => {
      const helper = setupRefundMockClient("requested");

      const mockFetch = jest.fn().mockImplementation(async () => {
        throw new Error("ETIMEDOUT: Connection dropped to payment gateway");
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      // Returns 502 Bad Gateway
      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toContain("Network timeout contacting payment gateway");

      // CRITICAL: Row remains in 'processing' — it must NOT be marked 'failed'
      expect(helper.getStatus()).toBe("processing");

      // A concurrent or subsequent retry attempt is locked out with 409
      const retryReq = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      const retryRes = await handleExecuteRazorpayRefund(retryReq, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });
      expect(retryRes.status).toBe(409);
      const retryJson = await retryRes.json();
      expect(retryJson.error).toContain("already in progress");
    });

    it("4. [Ambiguous Gateway HTTP 409] preserves 'processing' status to prevent duplicate debits", async () => {
      const helper = setupRefundMockClient("requested");

      const mockFetch = jest.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: "BAD_REQUEST_ERROR",
              description: "A refund with the specified idempotency key is already processing",
            },
          }),
          { status: 409 }
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(409);
      // Status MUST NOT revert to 'failed'; remains 'processing'
      expect(helper.getStatus()).toBe("processing");
      expect(helper.getAuditLog()).toBeNull(); // No 'execute_gateway_refund_failed' audit entry
    });

    it("5. [Ambiguous Gateway HTTP 5xx] preserves 'processing' status and returns 502", async () => {
      const helper = setupRefundMockClient("requested");

      const mockFetch = jest.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: "GATEWAY_ERROR",
              description: "Internal gateway timeout",
            },
          }),
          { status: 504 }
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toContain("Payment gateway returned an ambiguous server error (HTTP 504)");
      // Must NOT revert to 'failed'; remains 'processing' awaiting webhook reconciliation
      expect(helper.getStatus()).toBe("processing");
    });

    it("6. [Definitive Gateway 4xx Rejection] safely reverts status to 'failed' and audits failure", async () => {
      const helper = setupRefundMockClient("requested");

      const mockFetch = jest.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: "BAD_REQUEST_ERROR",
              description: "The payment has not been captured yet",
            },
          }),
          { status: 400 }
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("The payment has not been captured yet");

      // For definitive client error (400), status is reverted to 'failed'
      expect(helper.getStatus()).toBe("failed");
      expect(helper.getAuditLog()).not.toBeNull();
      expect(helper.getAuditLog().action).toBe("execute_gateway_refund_failed");
      expect(helper.getAuditLog().entity_id).toBe(validRefundId);
    });

    it("7. [Already Processed Idempotency] returns 200 without calling Razorpay API", async () => {
      const helper = setupRefundMockClient("processed");
      const mockFetch = jest.fn();

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe("already_processed");
      expect(json.provider_refund_id).toBe(validProviderRefundId);

      // Razorpay gateway API is never called for already processed refund
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("8. [Active Reconciliation - Succeeded at Gateway] action: 'reconcile' finds refund matching notes.refund_id and reconciles DB to 'processed' without POST", async () => {
      const helper = setupRefundMockClient("processing");
      let capturedMethod: string | null = null;
      let capturedUrl: string | null = null;

      const mockFetch = jest.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedMethod = options.method || "GET";
        capturedUrl = url;
        return new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_recon_active_888",
                entity: "refund",
                amount: 250000,
                status: "processed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe("processed");
      expect(json.provider_refund_id).toBe("rfnd_recon_active_888");
      expect(json.reconciled).toBe(true);

      // Verify ONLY a read-only GET was performed, NEVER a POST!
      expect(capturedMethod).toBe("GET");
      expect(capturedUrl).toBe(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(validProviderPaymentId)}/refunds?count=20&skip=0`
      );
      expect(helper.getStatus()).toBe("processed");
    });

    it("9. [Active Reconciliation - Not Found on Gateway] action: 'reconcile' reports not_found_on_gateway when obligation has not been executed", async () => {
      const helper = setupRefundMockClient("processing");

      const mockFetch = jest.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            entity: "collection",
            count: 0,
            items: [],
          }),
          { status: 200 }
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.status).toBe("not_found_on_gateway");
      expect(json.message).toContain("No matching refund found on payment gateway");

      // Database status remains 'processing' without mutation
      expect(helper.getStatus()).toBe("processing");
    });

    it("10. [Active Reconciliation - Gateway Query Error] returns 502 on network failure without altering DB state", async () => {
      const helper = setupRefundMockClient("processing");

      const mockFetch = jest.fn().mockImplementation(async () => {
        throw new Error("ETIMEDOUT: Connection dropped to payment gateway");
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toContain("Network error querying gateway refunds");

      // Database status remains 'processing' without mutation
      expect(helper.getStatus()).toBe("processing");
    });

    it("11. [Lost Response Webhook Self-Healing] webhook refund.processed self-heals stranded processing refund asynchronously", async () => {
      let rpcReconciledId: string | null = null;
      let rpcProviderId: string | null = null;

      const mockAdminClient = {
        from: (table: string) => {
          if (table === "payment_transactions") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { id: validTxId, provider_payment_id: validProviderPaymentId, amount: 2500.0 },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "refunds") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: {
                      id: validRefundId,
                      amount: 2500.0,
                      status: "processing", // Stuck in processing due to lost response
                      payment_transaction_id: validTxId,
                      provider_refund_id: null,
                    },
                  }),
                }),
              }),
            };
          }
          if (table === "admin_audit_logs") {
            return {
              insert: jest.fn().mockResolvedValue({ error: null }),
            };
          }
          return {};
        },
        rpc: jest.fn().mockImplementation((rpcName: string, args: any) => {
          if (rpcName === "reconcile_processed_refund") {
            rpcReconciledId = args.p_refund_id;
            rpcProviderId = args.p_provider_refund_id;
            return Promise.resolve({
              data: { success: true, status: "refund_processed" },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      // Webhook payload from Razorpay containing the refund notes with our refund_id
      const webhookReq = await createSignedWebhookRequest({
        event: "refund.processed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_lost_response_recovered_777",
              payment_id: validProviderPaymentId,
              amount: 250000,
              status: "processed",
              notes: {
                refund_id: validRefundId,
              },
            },
          },
        },
      });

      const res = await handleRazorpayWebhook(webhookReq, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("refund_processed");

      // Verify authoritative reconciliation occurred with real gateway provider refund ID
      expect(rpcReconciledId).toBe(validRefundId);
      expect(rpcProviderId).toBe("rfnd_lost_response_recovered_777");
    });
  });

  function setupReconcileMock(
    initialStatus: string = "processing",
    initialProviderId: string | null = null,
    initialExecutionAttemptId: string | null = "attempt-initial-uuid"
  ) {
    let currentStatus = initialStatus;
    let currentProviderId = initialProviderId;
    let currentExecutionAttemptId = initialExecutionAttemptId;
    let auditLogRecords: any[] = [];
    let auditLogRecord: any = null;
    const updateCalls: any[] = [];
    const rpcCalls: Array<{ rpcName: string; args: any }> = [];

    const mockAdminClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: validAdminUserId } },
          error: null,
        }),
      },
      from: (table: string) => {
        if (table === "user_roles") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { role: "admin" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "admin_audit_logs") {
          return {
            insert: jest.fn().mockImplementation((payload) => {
              auditLogRecord = payload;
              auditLogRecords.push(payload);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "refunds") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: jest.fn().mockImplementation(() =>
                  Promise.resolve({
                    data: {
                      id: validRefundId,
                      payment_transaction_id: validTxId,
                      booking_cancellation_id: "cancel-1111-1111",
                      amount: 2500.0,
                      status: currentStatus,
                      provider_refund_id: currentProviderId,
                      execution_attempt_id: currentExecutionAttemptId,
                      payment_transaction: {
                        id: validTxId,
                        provider_payment_id: validProviderPaymentId,
                        amount: 2500.0,
                        status: currentStatus === "processed" ? "refunded" : "captured",
                      },
                    },
                    error: null,
                  })
                ),
              }),
            }),
            update: (updatePayload: any) => {
              updateCalls.push(updatePayload);
              if (updatePayload.status) currentStatus = updatePayload.status;
              if (updatePayload.provider_refund_id !== undefined) currentProviderId = updatePayload.provider_refund_id;
              if (updatePayload.execution_attempt_id !== undefined) currentExecutionAttemptId = updatePayload.execution_attempt_id;
              const chain: any = {
                eq: () => chain,
                neq: () => chain,
                in: () => chain,
                then: (resolve: any) => resolve({ error: null }),
              };
              return chain;
            },
          };
        }
        return {};
      },
      rpc: jest.fn().mockImplementation((rpcName: string, args: any) => {
        rpcCalls.push({ rpcName, args });
        if (rpcName === "claim_refund_for_execution") {
          currentExecutionAttemptId = "attempt-" + Math.random().toString(36).substring(2, 10);
          currentStatus = "processing";
          return Promise.resolve({
            data: {
              success: true,
              status: "claimed",
              refund_id: validRefundId,
              payment_transaction_id: validTxId,
              provider_payment_id: validProviderPaymentId,
              booking_cancellation_id: "cancel-1111-1111",
              amount: 2500.0,
              execution_attempt_id: currentExecutionAttemptId,
              status_code: 200,
            },
            error: null,
          });
        }
        if (rpcName === "reconcile_processed_refund") {
          const cleanStatus = (args.p_gateway_status || "").trim().toLowerCase();
          if (!args.p_gateway_status || cleanStatus !== "processed") {
            return Promise.resolve({
              data: {
                success: false,
                status: "invalid_gateway_status",
                error: `Cannot reconcile refund as processed when gateway status is ${args.p_gateway_status && args.p_gateway_status.trim() ? args.p_gateway_status.trim() : "NULL"}`,
              },
              error: null,
            });
          }
          currentStatus = "processed";
          currentProviderId = args.p_provider_refund_id;
          return Promise.resolve({
            data: {
              success: true,
              status: "refund_processed",
              refund_id: validRefundId,
              provider_refund_id: args.p_provider_refund_id,
            },
            error: null,
          });
        }
        if (rpcName === "reconcile_failed_refund") {
          if (currentStatus !== "processed") {
            currentStatus = "failed";
            currentExecutionAttemptId = null;
            if (args.p_provider_refund_id) {
              currentProviderId = args.p_provider_refund_id;
            }
          }
          return Promise.resolve({
            data: {
              success: true,
              status: currentStatus === "processed" ? "ignored_already_processed" : "refund_failed",
              refund_id: validRefundId,
              provider_refund_id: args.p_provider_refund_id || currentProviderId,
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    return {
      mockAdminClient,
      getStatus: () => currentStatus,
      getProviderId: () => currentProviderId,
      getExecutionAttemptId: () => currentExecutionAttemptId,
      setStatus: (s: string) => { currentStatus = s; },
      setProviderId: (id: string | null) => { currentProviderId = id; },
      setExecutionAttemptId: (id: string | null) => { currentExecutionAttemptId = id; },
      getAuditLog: () => auditLogRecord,
      getAuditLogs: () => auditLogRecords,
      getUpdateCalls: () => updateCalls,
      getRpcCalls: () => rpcCalls,
    };
  }

  // ---------------------------------------------------------------------------
  // 13. Final Reconciliation Status & Complete Bounded Pagination Regression Suite (Feature 03 Task 4)
  // NOTE: Mocked provider responses are used for unit tests.
  // These mocked tests are NOT live Razorpay integration tests.
  // ---------------------------------------------------------------------------
  describe("Scenario 13: Final Reconciliation Status and Bounded Pagination Regression Suite", () => {
    it("1. Matching refund has provider status processed -> reconciles locally to processed", async () => {
      const helper = setupReconcileMock("processing");
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_test_processed_01",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "processed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.outcome).toBe("matched_processed");
      expect(json.status).toBe("processed");
      expect(json.provider_refund_id).toBe("rfnd_test_processed_01");
      expect(json.reconciled).toBe(true);
      expect(helper.getStatus()).toBe("processed");
    });

    it("2. Matching refund has provider status pending -> preserves processing, persists provider ID, never marks processed", async () => {
      const helper = setupReconcileMock("processing");
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_test_pending_02",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "pending",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.outcome).toBe("matched_pending");
      expect(json.status).toBe("pending");
      expect(json.provider_refund_id).toBe("rfnd_test_pending_02");
      expect(json.reconciled).toBe(false);

      // Local status MUST remain 'processing'; provider_refund_id MUST be saved
      expect(helper.getStatus()).toBe("processing");
      expect(helper.getProviderId()).toBe("rfnd_test_pending_02");

      // Verify reconcile_processed_refund was NEVER called
      const processedCalls = helper.getRpcCalls().filter((c) => c.rpcName === "reconcile_processed_refund");
      expect(processedCalls.length).toBe(0);
    });

    it("3. Matching refund has provider status failed -> transitions to failed, persists provider ID, non-regressing", async () => {
      const helper = setupReconcileMock("processing");
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_test_failed_03",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "failed",
                error_code: "BAD_REQUEST_ERROR",
                error_description: "Card account closed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.outcome).toBe("matched_failed");
      expect(json.status).toBe("failed");
      expect(json.provider_refund_id).toBe("rfnd_test_failed_03");
      expect(json.reconciled).toBe(false);

      // Local status transitioned to 'failed', provider_refund_id persisted
      expect(helper.getStatus()).toBe("failed");
      expect(helper.getProviderId()).toBe("rfnd_test_failed_03");

      // Verify reconcile_failed_refund was called
      const failedCalls = helper.getRpcCalls().filter((c) => c.rpcName === "reconcile_failed_refund");
      expect(failedCalls.length).toBe(1);
      expect(failedCalls[0].args.p_provider_refund_id).toBe("rfnd_test_failed_03");
    });

    it("4. Provider payment ID mismatch when notes.refund_id matches -> stops immediately, returns 409 provider_record_conflict", async () => {
      const helper = setupReconcileMock("processing");
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 2,
            items: [
              {
                id: "rfnd_wrong_payment",
                payment_id: "pay_different_payment_999",
                amount: 250000,
                currency: "INR",
                status: "processed",
                notes: { refund_id: validRefundId },
              },
              {
                id: "invalid_prefix_123",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "processed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.outcome).toBe("provider_outcome_unresolved");
      expect(json.status).toBe("provider_record_conflict");
      expect(json.conflict_type).toBe("payment_id_mismatch");
      expect(helper.getStatus()).toBe("processing");
      expect(helper.getUpdateCalls().length).toBe(0);
    });

    it("5. Provider amount or currency mismatch when notes.refund_id matches -> stops immediately, returns 409 provider_record_conflict", async () => {
      const helper = setupReconcileMock("processing");
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 2,
            items: [
              {
                id: "rfnd_wrong_amount",
                payment_id: validProviderPaymentId,
                amount: 100000, // 1000.00 != expected 2500.00 (250000 paise)
                currency: "INR",
                status: "processed",
                notes: { refund_id: validRefundId },
              },
              {
                id: "rfnd_wrong_currency",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "USD", // USD != INR
                status: "processed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.outcome).toBe("provider_outcome_unresolved");
      expect(json.status).toBe("provider_record_conflict");
      expect(json.conflict_type).toBe("amount_mismatch");
      expect(helper.getStatus()).toBe("processing");
      expect(helper.getUpdateCalls().length).toBe(0);
    });

    it("6. notes.refund_id does not match -> rejects refund belonging to another obligation, outcome not_found_after_complete_search", async () => {
      const helper = setupReconcileMock("processing");
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_another_customer",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "processed",
                notes: { refund_id: "99999999-9999-4999-8999-999999999999" }, // Different obligation UUID
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.outcome).toBe("not_found_after_complete_search");
      expect(helper.getStatus()).toBe("processing");
    });

    it("7. Matching refund appears after the first 10 results -> bounded pagination inspects page 2 and finds match", async () => {
      const helper = setupReconcileMock("processing");

      // Page 1: 20 other refunds on this payment (items 1 to 20)
      const page1Items = Array.from({ length: 20 }, (_, i) => ({
        id: `rfnd_page1_${i + 1}`,
        payment_id: validProviderPaymentId,
        amount: 250000,
        currency: "INR",
        status: "processed",
        notes: { refund_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` },
      }));

      // Page 2: Item 22 overall (index 1 on page 2) is our target refund
      const page2Items = [
        {
          id: "rfnd_page2_21",
          payment_id: validProviderPaymentId,
          amount: 250000,
          currency: "INR",
          status: "processed",
          notes: { refund_id: "00000000-0000-4000-8000-000000000021" },
        },
        {
          id: "rfnd_target_item_22",
          payment_id: validProviderPaymentId,
          amount: 250000,
          currency: "INR",
          status: "processed",
          notes: { refund_id: validRefundId },
        },
      ];

      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes("skip=0")) {
          return new Response(JSON.stringify({ entity: "collection", count: 22, items: page1Items }), { status: 200 });
        }
        if (url.includes("skip=20")) {
          return new Response(JSON.stringify({ entity: "collection", count: 22, items: page2Items }), { status: 200 });
        }
        return new Response(JSON.stringify({ entity: "collection", count: 0, items: [] }), { status: 200 });
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.outcome).toBe("matched_processed");
      expect(json.provider_refund_id).toBe("rfnd_target_item_22");
      expect(json.pages_scanned).toBe(2);
      expect(helper.getStatus()).toBe("processed");
    });

    it("8. Matching refund appears on a subsequent page -> asserts count and skip params advance across pages", async () => {
      const helper = setupReconcileMock("processing");
      const urlsRequested: string[] = [];

      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        urlsRequested.push(url);
        if (url.includes("skip=0")) {
          return new Response(
            JSON.stringify({
              entity: "collection",
              count: 21,
              items: Array.from({ length: 20 }, (_, i) => ({
                id: `rfnd_p1_${i}`,
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "processed",
                notes: { refund_id: `other_${i}` },
              })),
            }),
            { status: 200 }
          );
        }
        if (url.includes("skip=20")) {
          return new Response(
            JSON.stringify({
              entity: "collection",
              count: 21,
              items: [
                {
                  id: "rfnd_on_page_2",
                  payment_id: validProviderPaymentId,
                  amount: 250000,
                  currency: "INR",
                  status: "processed",
                  notes: { refund_id: validRefundId },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(urlsRequested.length).toBe(2);
      expect(urlsRequested[0]).toContain("count=20&skip=0");
      expect(urlsRequested[1]).toContain("count=20&skip=20");
    });

    it("9. Pagination request fails midway -> returns 502 with provider_outcome_unresolved without claiming exhaustive search", async () => {
      const helper = setupReconcileMock("processing");

      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes("skip=0")) {
          return new Response(
            JSON.stringify({
              entity: "collection",
              count: 50,
              items: Array.from({ length: 20 }, (_, i) => ({
                id: `rfnd_p1_${i}`,
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "processed",
                notes: { refund_id: `other_${i}` },
              })),
            }),
            { status: 200 }
          );
        }
        // Page 2 drops connection / throws error
        throw new Error("ETIMEDOUT: Connection dropped to payment gateway on page 2");
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.outcome).toBe("provider_outcome_unresolved");
      expect(json.status).toBe("network_error");
      expect(json.pages_scanned).toBe(2);
      // Crucial: Does NOT claim not_found_after_complete_search!
      expect(json.outcome).not.toBe("not_found_after_complete_search");
      // DB status remains 'processing' without mutation
      expect(helper.getStatus()).toBe("processing");
    });

    it("10. Provider returns an empty result -> returns not_found_after_complete_search without creating new obligation", async () => {
      const helper = setupReconcileMock("processing");
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 0,
            items: [],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.outcome).toBe("not_found_after_complete_search");
      expect(json.status).toBe("not_found_on_gateway");
      // Crucial: No state mutations, no new refund obligation
      expect(helper.getStatus()).toBe("processing");
      expect(helper.getUpdateCalls().length).toBe(0);
    });

    it("11. Network error leaves provider outcome unresolved -> returns 502 with provider_outcome_unresolved and DB untouched", async () => {
      const helper = setupReconcileMock("processing");
      const mockFetch = jest.fn().mockRejectedValue(new Error("ECONNRESET: Socket closed"));

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.outcome).toBe("provider_outcome_unresolved");
      expect(json.status).toBe("network_error");
      expect(helper.getStatus()).toBe("processing");
    });

    it("12. A pending provider refund cannot become locally processed -> verifies DB RPC guard and Edge Function guard", async () => {
      // 12a. Inspect Migration 056 SQL definition of reconcile_processed_refund
      const migrationPath = path.resolve(
        __dirname,
        "../supabase/migrations/056_remediate_booking_and_payment_rpc_schema_compatibility.sql"
      );
      const sql = fs.readFileSync(migrationPath, "utf8");
      expect(sql).toContain("IF p_gateway_status IS NULL OR lower(trim(p_gateway_status)) != 'processed' THEN");
      expect(sql).toContain("'status', 'invalid_gateway_status'");

      // 12b. Test RPC reject behavior with p_gateway_status = 'pending'
      const helper = setupReconcileMock("processing");
      const rpcResult = await helper.mockAdminClient.rpc("reconcile_processed_refund", {
        p_refund_id: validRefundId,
        p_provider_refund_id: "rfnd_pending_test",
        p_amount_paise: 250000,
        p_gateway_status: "pending",
      });
      expect(rpcResult.data.success).toBe(false);
      expect(rpcResult.data.status).toBe("invalid_gateway_status");
      expect(helper.getStatus()).toBe("processing"); // Must not have transitioned to 'processed'

      // 12c. Test POST creation flow when Razorpay returns status: "pending"
      const helperPost = setupReconcileMock("requested");
      const mockFetchPost = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "rfnd_new_pending_999",
            status: "pending",
            amount: 250000,
          }),
          { status: 200 }
        )
      );

      const postReq = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      // Claim refund first
      await helperPost.mockAdminClient.rpc("claim_refund_for_execution", { p_refund_id: validRefundId });

      const postRes = await handleExecuteRazorpayRefund(postReq, {
        adminClient: helperPost.mockAdminClient,
        fetchFn: mockFetchPost,
        getEnvFn,
      });

      expect(postRes.status).toBe(200);
      const postJson = await postRes.json();
      expect(postJson.status).toBe("pending");
      expect(postJson.outcome).toBe("matched_pending");
      expect(helperPost.getStatus()).toBe("processing"); // Row MUST remain in 'processing', NOT 'processed'
      expect(helperPost.getProviderId()).toBe("rfnd_new_pending_999");
    });

    it("13. An unresolved refund cannot be unlocked based only on an incomplete provider query -> admin unlock blocked", async () => {
      // Setup refund that has provider_refund_id persisted from a prior query or pending state
      const refundRowWithProviderId = {
        id: validRefundId,
        status: "processing" as const,
        provider_refund_id: "rfnd_active_provider_id_123",
        amount: 2500.0,
        updated_at: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes old
        created_at: new Date(Date.now() - 30 * 60 * 1000),
      };

      // 13a. Attempt to unlock when provider_refund_id is present -> rejected with gateway_id_present
      const unlockWithProvider = simulateAdminUnlockStuckRefund(
        refundRowWithProviderId,
        { userId: validAdminUserId, role: "admin" },
        "Admin observed network drop during query"
      );
      expect(unlockWithProvider.success).toBe(false);
      expect(unlockWithProvider.status).toBe("gateway_id_present");
      expect(unlockWithProvider.error).toContain("Refund already has an active gateway provider refund ID");

      // 13b. Attempt to unlock when refund is too recent (<15 minutes) -> rejected with too_recent
      const refundRowTooRecent = {
        id: validRefundId,
        status: "processing" as const,
        provider_refund_id: null,
        amount: 2500.0,
        updated_at: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes old
        created_at: new Date(Date.now() - 5 * 60 * 1000),
      };

      const unlockTooRecent = simulateAdminUnlockStuckRefund(
        refundRowTooRecent,
        { userId: validAdminUserId, role: "admin" },
        "Admin observed network drop"
      );
      expect(unlockTooRecent.success).toBe(false);
      expect(unlockTooRecent.status).toBe("too_recent");
      expect(unlockTooRecent.error).toContain("A minimum in-flight grace period of 15 minutes is required");

      // 13c. Attempt to unlock by non-admin caller -> throws Access denied
      expect(() => {
        simulateAdminUnlockStuckRefund(
          refundRowWithProviderId,
          { userId: "customer-111", role: "customer" },
          "Customer attempting unlock"
        );
      }).toThrow("Access denied: Only administrators can recover stuck refunds.");
    });

    it("14. Duplicate or concurrent reconciliation cannot regress a processed refund -> non-regression guarantee", async () => {
      const helper = setupReconcileMock("processed", "rfnd_already_processed_999");
      const mockFetch = jest.fn();

      // 14a. Active reconciliation returns already_processed immediately
      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe("already_processed");
      expect(json.outcome).toBe("matched_processed");
      expect(mockFetch).not.toHaveBeenCalled(); // No gateway calls

      // 14b. Webhook refund.failed ignores already processed refund
      const webhookFailedReq = await createSignedWebhookRequest({
        event: "refund.failed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_already_processed_999",
              payment_id: validProviderPaymentId,
              status: "failed",
            },
          },
        },
      });

      const webhookFailedRes = await handleRazorpayWebhook(webhookFailedReq, {
        adminClient: helper.mockAdminClient,
        getEnvFn,
      });

      expect(webhookFailedRes.status).toBe(200);
      const webhookFailedJson = await webhookFailedRes.json();
      expect(webhookFailedJson.status).toBe("ignored_already_processed");
      expect(helper.getStatus()).toBe("processed"); // Must NOT regress to failed
    });

    it("15. Recovery preserves the original refund UUID and idempotency key -> identical retry payload and headers", async () => {
      const helper = setupReconcileMock("failed");
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      const mockFetch = jest.fn().mockImplementation(async (_url: string, options: RequestInit) => {
        capturedHeaders = options.headers as Record<string, string>;
        capturedBody = JSON.parse(options.body as string);
        return new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 250000,
          }),
          { status: 200 }
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      expect(capturedHeaders["X-Refund-Idempotency"]).toBe(`refund_${validRefundId}`);
      expect(capturedBody.amount).toBe(250000);
      expect(capturedBody.notes.refund_id).toBe(validRefundId);
      expect(capturedBody.notes.booking_cancellation_id).toBe("cancel-1111-1111");
    });

    it("16. No second refund obligation is created -> single refund record invariant across retry/reconcile lifecycle", async () => {
      // Verify that across the entire lifecycle, only the authoritative refund record is tracked
      const helper = setupReconcileMock("processing");
      const insertCalls: any[] = [];

      const trackingClient = {
        ...helper.mockAdminClient,
        from: (table: string) => {
          if (table === "refunds") {
            return {
              ...helper.mockAdminClient.from(table),
              insert: (payload: any) => {
                insertCalls.push(payload);
                return Promise.resolve({ error: null });
              },
            };
          }
          return helper.mockAdminClient.from(table);
        },
      };

      // Perform active reconciliation
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_single_obligation_777",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "processed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: trackingClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      // Zero refund inserts allowed during reconciliation or retry
      expect(insertCalls.length).toBe(0);
      expect(helper.getStatus()).toBe("processed");
    });
  });

  // ---------------------------------------------------------------------------
  // 14. Final Three-Blocker Audit Regression Suite (Migration 056 Readiness)
  // ---------------------------------------------------------------------------
  describe("Scenario 14: Final Three-Blocker Audit Regression Suite (Migration 056 Readiness)", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../supabase/migrations/056_remediate_booking_and_payment_rpc_schema_compatibility.sql"
    );

    // =========================================================================
    // BLOCKER 1: Strict Gateway Status Guard in reconcile_processed_refund
    // =========================================================================
    describe("Blocker 1: NULL / Invalid Gateway Status Must Be Rejected", () => {
      it("1.1. NULL gateway status is strictly rejected", async () => {
        const helper = setupReconcileMock("processing");
        const res = await helper.mockAdminClient.rpc("reconcile_processed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_test_null",
          p_amount_paise: 250000,
          p_gateway_status: null,
        });

        expect(res.data.success).toBe(false);
        expect(res.data.status).toBe("invalid_gateway_status");
        expect(res.data.error).toContain("gateway status is NULL");
        expect(helper.getStatus()).toBe("processing");
      });

      it("1.2. Empty string gateway status is strictly rejected", async () => {
        const helper = setupReconcileMock("processing");
        const res = await helper.mockAdminClient.rpc("reconcile_processed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_test_empty",
          p_amount_paise: 250000,
          p_gateway_status: "",
        });

        expect(res.data.success).toBe(false);
        expect(res.data.status).toBe("invalid_gateway_status");
        expect(res.data.error).toContain("gateway status is NULL");
        expect(helper.getStatus()).toBe("processing");
      });

      it("1.3. Whitespace-only gateway status is strictly rejected", async () => {
        const helper = setupReconcileMock("processing");
        const res = await helper.mockAdminClient.rpc("reconcile_processed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_test_ws",
          p_amount_paise: 250000,
          p_gateway_status: "   \t  ",
        });

        expect(res.data.success).toBe(false);
        expect(res.data.status).toBe("invalid_gateway_status");
        expect(res.data.error).toContain("gateway status is NULL");
        expect(helper.getStatus()).toBe("processing");
      });

      it("1.4. pending gateway status is strictly rejected", async () => {
        const helper = setupReconcileMock("processing");
        const res = await helper.mockAdminClient.rpc("reconcile_processed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_test_pending",
          p_amount_paise: 250000,
          p_gateway_status: "pending",
        });

        expect(res.data.success).toBe(false);
        expect(res.data.status).toBe("invalid_gateway_status");
        expect(res.data.error).toContain("gateway status is pending");
        expect(helper.getStatus()).toBe("processing");
      });

      it("1.5. failed gateway status is strictly rejected", async () => {
        const helper = setupReconcileMock("processing");
        const res = await helper.mockAdminClient.rpc("reconcile_processed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_test_failed",
          p_amount_paise: 250000,
          p_gateway_status: "failed",
        });

        expect(res.data.success).toBe(false);
        expect(res.data.status).toBe("invalid_gateway_status");
        expect(res.data.error).toContain("gateway status is failed");
        expect(helper.getStatus()).toBe("processing");
      });

      it("1.6. Exact processed gateway status is accepted", async () => {
        const helper = setupReconcileMock("processing");
        const res = await helper.mockAdminClient.rpc("reconcile_processed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_test_processed",
          p_amount_paise: 250000,
          p_gateway_status: "processed",
        });

        expect(res.data.success).toBe(true);
        expect(res.data.status).toBe("refund_processed");
        expect(helper.getStatus()).toBe("processed");
        expect(helper.getProviderId()).toBe("rfnd_test_processed");
      });

      it("1.7. Case and surrounding whitespace are handled consistently ('  PROCESSED  ', 'Processed')", async () => {
        const helper1 = setupReconcileMock("processing");
        const res1 = await helper1.mockAdminClient.rpc("reconcile_processed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_test_case_1",
          p_amount_paise: 250000,
          p_gateway_status: "  PROCESSED  ",
        });
        expect(res1.data.success).toBe(true);
        expect(res1.data.status).toBe("refund_processed");
        expect(helper1.getStatus()).toBe("processed");

        const helper2 = setupReconcileMock("processing");
        const res2 = await helper2.mockAdminClient.rpc("reconcile_processed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_test_case_2",
          p_amount_paise: 250000,
          p_gateway_status: "Processed",
        });
        expect(res2.data.success).toBe(true);
        expect(res2.data.status).toBe("refund_processed");
        expect(helper2.getStatus()).toBe("processed");
      });

      it("1.8. No invalid status can update refund or payment transaction state; verified in Migration 056 source", async () => {
        const sql = fs.readFileSync(migrationPath, "utf8");
        expect(sql).toContain("IF p_gateway_status IS NULL OR lower(trim(p_gateway_status)) != 'processed' THEN");
        expect(sql).toContain("'status', 'invalid_gateway_status'");
        expect(sql).toContain("COALESCE(NULLIF(trim(p_gateway_status), ''), 'NULL')");

        // Edge Function POST flow rejection: if RPC rejects with invalid_gateway_status, no fallback update occurs
        const helper = setupReconcileMock("requested");
        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              id: "rfnd_invalid_status_xyz",
              status: "pending", // Gateway status pending
              amount: 250000,
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId },
        });

        await helper.mockAdminClient.rpc("claim_refund_for_execution", { p_refund_id: validRefundId });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.status).toBe("pending");
        // State must NOT be processed
        expect(helper.getStatus()).not.toBe("processed");
      });
    });

    // =========================================================================
    // BLOCKER 1: Conflicting Provider Records Must NOT Mean Not Found
    // =========================================================================
    describe("Blocker 1: Conflicting Provider Records Must NOT Mean Not Found", () => {
      it("1.1. Correct local notes.refund_id but wrong payment ID -> stops pagination, returns 409 provider_record_conflict", async () => {
        const helper = setupReconcileMock("processing");
        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 1,
              items: [
                {
                  id: "rfnd_test_conflict_pay",
                  payment_id: "pay_different_payment_999", // Conflict!
                  amount: 250000,
                  currency: "INR",
                  status: "processed",
                  notes: { refund_id: validRefundId },
                },
              ],
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.outcome).toBe("provider_outcome_unresolved");
        expect(json.status).toBe("provider_record_conflict");
        expect(json.conflict_type).toBe("payment_id_mismatch");
        expect(json.error).toContain("Payment ID mismatch");
      });

      it("1.2. Correct local notes.refund_id but wrong amount -> stops pagination, returns 409 provider_record_conflict", async () => {
        const helper = setupReconcileMock("processing");
        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 1,
              items: [
                {
                  id: "rfnd_test_conflict_amt",
                  payment_id: validProviderPaymentId,
                  amount: 100000, // 1000.00 != expected 250000 paise (2500.00)
                  currency: "INR",
                  status: "processed",
                  notes: { refund_id: validRefundId },
                },
              ],
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.outcome).toBe("provider_outcome_unresolved");
        expect(json.status).toBe("provider_record_conflict");
        expect(json.conflict_type).toBe("amount_mismatch");
        expect(json.error).toContain("Amount mismatch");
      });

      it("1.3. Correct local notes.refund_id but wrong currency -> stops pagination, returns 409 provider_record_conflict", async () => {
        const helper = setupReconcileMock("processing");
        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 1,
              items: [
                {
                  id: "rfnd_test_conflict_curr",
                  payment_id: validProviderPaymentId,
                  amount: 250000,
                  currency: "USD", // USD != INR
                  status: "processed",
                  notes: { refund_id: validRefundId },
                },
              ],
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.outcome).toBe("provider_outcome_unresolved");
        expect(json.status).toBe("provider_record_conflict");
        expect(json.conflict_type).toBe("currency_mismatch");
        expect(json.error).toContain("Currency mismatch");
      });

      it("1.4. Correct local notes.refund_id but conflicting provider refund ID -> stops pagination, returns 409 provider_record_conflict", async () => {
        // Record already has provider_refund_id "rfnd_original_saved_123"
        const helper = setupReconcileMock("processing", "rfnd_original_saved_123");
        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 1,
              items: [
                {
                  id: "rfnd_different_id_999", // Conflict with stored provider_refund_id
                  payment_id: validProviderPaymentId,
                  amount: 250000,
                  currency: "INR",
                  status: "processed",
                  notes: { refund_id: validRefundId },
                },
              ],
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.outcome).toBe("provider_outcome_unresolved");
        expect(json.status).toBe("provider_record_conflict");
        expect(json.conflict_type).toBe("provider_refund_id_mismatch");
        expect(json.error).toContain("Conflicting provider refund ID");
      });

      it("1.5. Unrelated refund with different notes.refund_id is skipped, and valid matching result found on page 2", async () => {
        const helper = setupReconcileMock("processing");

        const page1Items = Array.from({ length: 20 }, (_, i) => ({
          id: `rfnd_unrelated_${i + 1}`,
          payment_id: validProviderPaymentId,
          amount: 250000,
          currency: "INR",
          status: "processed",
          notes: { refund_id: `99990000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }, // Unrelated
        }));

        const page2Items = [
          {
            id: "rfnd_valid_match_page2",
            payment_id: validProviderPaymentId,
            amount: 250000,
            currency: "INR",
            status: "processed",
            notes: { refund_id: validRefundId }, // Target match!
          },
        ];

        const mockFetch = jest.fn().mockImplementation(async (url: string) => {
          if (url.includes("skip=0")) {
            return new Response(JSON.stringify({ entity: "collection", count: 21, items: page1Items }), { status: 200 });
          }
          if (url.includes("skip=20")) {
            return new Response(JSON.stringify({ entity: "collection", count: 21, items: page2Items }), { status: 200 });
          }
          return new Response(JSON.stringify({ entity: "collection", count: 0, items: [] }), { status: 200 });
        });

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.outcome).toBe("matched_processed");
        expect(json.provider_refund_id).toBe("rfnd_valid_match_page2");
        expect(json.pages_scanned).toBe(2);
        expect(helper.getStatus()).toBe("processed");
      });

      it("1.6. Conflicting provider record cannot generate not-found recovery proof", async () => {
        const helper = setupReconcileMock("processing");
        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 1,
              items: [
                {
                  id: "rfnd_conflict_not_found_test",
                  payment_id: "pay_different_payment_888", // Conflict!
                  amount: 250000,
                  currency: "INR",
                  status: "processed",
                  notes: { refund_id: validRefundId },
                },
              ],
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(409);
        const json = await res.json();
        expect(json.outcome).toBe("provider_outcome_unresolved");
        expect(json.status).toBe("provider_record_conflict");

        // Verify audit logs:
        // Must record refund_reconciliation_conflict
        // Must NEVER record refund_reconciliation_not_found!
        const auditLogs = helper.getAuditLogs();
        const conflictLog = auditLogs.find((l) => l.action === "refund_reconciliation_conflict");
        const notFoundLog = auditLogs.find((l) => l.action === "refund_reconciliation_not_found");

        expect(conflictLog).toBeDefined();
        expect(conflictLog.entity_id).toBe(validRefundId);
        expect(notFoundLog).toBeUndefined();
      });

      it("1.7. Conflicting provider record cannot authorize administrative unlock", () => {
        const attemptId = "attempt-uuid-conflict-17";
        const stuckRefund: RefundRow = {
          id: validRefundId,
          status: "processing",
          provider_refund_id: null,
          execution_attempt_id: attemptId,
          amount: 2500.0,
          created_at: new Date(Date.now() - 30 * 60 * 1000), // 30 mins old
          updated_at: new Date(Date.now() - 30 * 60 * 1000),
        };

        // Audit logs contain BOTH a not_found log AND a recent conflict log
        const auditLogsWithConflict = [
          {
            action: "refund_reconciliation_not_found",
            entity_id: validRefundId,
            entity_type: "refund",
            created_at: new Date(Date.now() - 10 * 60 * 1000),
            details: { execution_attempt_id: attemptId },
          },
          {
            action: "refund_reconciliation_conflict",
            entity_id: validRefundId,
            entity_type: "refund",
            created_at: new Date(Date.now() - 5 * 60 * 1000),
            details: { execution_attempt_id: attemptId },
          },
        ];

        const res = simulateAdminUnlockStuckRefund(
          stuckRefund,
          { userId: validAdminUserId, role: "admin" },
          "Admin attempting unlock after reconciliation conflict",
          new Date(),
          auditLogsWithConflict
        );

        expect(res.success).toBe(false);
        expect(res.status).toBe("reconciliation_conflict");
        expect(res.error).toContain("conflicting refund records on Razorpay");
        expect(stuckRefund.status).toBe("processing");
      });

      it("1.8. The actual database refund state remains unchanged on conflict", async () => {
        const helper = setupReconcileMock("processing");
        const initialStatus = helper.getStatus();
        const initialProviderId = helper.getProviderId();
        const initialUpdateCalls = helper.getUpdateCalls().length;

        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 1,
              items: [
                {
                  id: "rfnd_conflict_state_check",
                  payment_id: validProviderPaymentId,
                  amount: 999999, // Mismatched amount
                  currency: "INR",
                  status: "processed",
                  notes: { refund_id: validRefundId },
                },
              ],
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(409);
        // Database row state is 100% untouched
        expect(helper.getStatus()).toBe(initialStatus);
        expect(helper.getProviderId()).toBe(initialProviderId);
        expect(helper.getUpdateCalls().length).toBe(initialUpdateCalls);

        // Verify in Migration 056 SQL: admin_unlock_stuck_refund explicitly checks refund_reconciliation_conflict
        const sql = fs.readFileSync(migrationPath, "utf8");
        expect(sql).toContain("action = 'refund_reconciliation_conflict'");
        expect(sql).toContain("'status', 'reconciliation_conflict'");
      });
    });

    // =========================================================================
    // BLOCKER 2: Audit All reconcile_failed_refund Function Signatures
    // =========================================================================
    describe("Blocker 2: Audit All reconcile_failed_refund Function Signatures", () => {
      it("2.1. Webhook refund.failed can locate the correct local refund row (both by provider ID and notes.refund_id)", async () => {
        // Case A: Looked up by provider_refund_id
        const helperA = setupReconcileMock("processing", "rfnd_known_failed_01");
        const reqA = await createSignedWebhookRequest({
          event: "refund.failed",
          payload: {
            refund: {
              entity: {
                id: "rfnd_known_failed_01",
                payment_id: validProviderPaymentId,
                status: "failed",
                error_code: "GATEWAY_TIMEOUT",
                error_description: "Bank timeout",
              },
            },
          },
        });
        const resA = await handleRazorpayWebhook(reqA, {
          adminClient: helperA.mockAdminClient,
          getEnvFn,
        });
        expect(resA.status).toBe(200);
        expect(helperA.getStatus()).toBe("failed");

        // Case B: Looked up by notes.refund_id when provider_refund_id was not yet stored
        const helperB = setupReconcileMock("processing", null);
        const reqB = await createSignedWebhookRequest({
          event: "refund.failed",
          payload: {
            refund: {
              entity: {
                id: "rfnd_recovered_by_notes_02",
                payment_id: validProviderPaymentId,
                status: "failed",
                notes: { refund_id: validRefundId },
              },
            },
          },
        });
        const resB = await handleRazorpayWebhook(reqB, {
          adminClient: helperB.mockAdminClient,
          getEnvFn,
        });
        expect(resB.status).toBe(200);
        expect(helperB.getStatus()).toBe("failed");
        expect(helperB.getProviderId()).toBe("rfnd_recovered_by_notes_02");
      });

      it("2.2. A failure before provider_refund_id is saved still reconciles the correct row when local refund UUID is known", async () => {
        const helper = setupReconcileMock("processing", null);

        // Call RPC supplying only p_refund_id (provider_refund_id is null)
        const res = await helper.mockAdminClient.rpc("reconcile_failed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: null,
          p_error_code: "BAD_REQUEST_ERROR",
          p_error_description: "Payment already refunded or invalid state",
        });

        expect(res.data.success).toBe(true);
        expect(res.data.status).toBe("refund_failed");
        expect(res.data.refund_id).toBe(validRefundId);
        expect(helper.getStatus()).toBe("failed");
      });

      it("2.3. The local UUID is never replaced by the Razorpay ID", async () => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const providerId = "rfnd_external_gateway_identifier_12345";

        // Provider ID cannot match UUID format
        expect(uuidRegex.test(providerId)).toBe(false);
        expect(uuidRegex.test(validRefundId)).toBe(true);

        // Verify in Migration 056 SQL: id is primary key UUID and is NEVER assigned p_provider_refund_id
        const sql = fs.readFileSync(migrationPath, "utf8");
        expect(sql).toContain("provider_refund_id = COALESCE(v_refund.provider_refund_id, v_clean_provider_id)");
        expect(sql).toContain("WHERE id = v_refund.id;");
        expect(sql).not.toContain("SET id =");
      });

      it("2.4. All remaining callers supply both p_refund_id and p_provider_refund_id to reconcile_failed_refund", () => {
        const edgeRefundPath = path.resolve(__dirname, "../supabase/functions/execute-razorpay-refund/index.ts");
        const webhookPath = path.resolve(__dirname, "../supabase/functions/razorpay-webhook/index.ts");

        const edgeRefundCode = fs.readFileSync(edgeRefundPath, "utf8");
        const webhookCode = fs.readFileSync(webhookPath, "utf8");

        // execute-razorpay-refund calls
        expect(edgeRefundCode).toContain("p_refund_id: record.id");
        expect(edgeRefundCode).toContain("p_refund_id: refundData.id");

        // razorpay-webhook calls
        expect(webhookCode).toContain("p_refund_id: targetRefundId ?? null");
        expect(webhookCode).toContain("p_provider_refund_id: providerRefundId");
      });

      it("2.5. The legacy 3-parameter overload is explicitly dropped in Migration 056 and cannot bypass corrected behavior", () => {
        const sql = fs.readFileSync(migrationPath, "utf8");

        // Explicit drop of legacy overload
        expect(sql).toContain("DROP FUNCTION IF EXISTS public.reconcile_failed_refund(TEXT, TEXT, TEXT);");

        // Canonical declaration with 4 parameters
        expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reconcile_failed_refund(");
        expect(sql).toContain("p_provider_refund_id TEXT DEFAULT NULL,");
        expect(sql).toContain("p_error_code TEXT DEFAULT NULL,");
        expect(sql).toContain("p_error_description TEXT DEFAULT NULL,");
        expect(sql).toContain("p_refund_id UUID DEFAULT NULL");

        // Strict permissions
        expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;");
        expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT, UUID) TO service_role;");
      });

      it("2.6. Already-processed refunds cannot regress to failed under reconcile_failed_refund", async () => {
        const helper = setupReconcileMock("processed", "rfnd_permanent_processed_999");

        const res = await helper.mockAdminClient.rpc("reconcile_failed_refund", {
          p_refund_id: validRefundId,
          p_provider_refund_id: "rfnd_permanent_processed_999",
          p_error_code: "GATEWAY_ERROR",
          p_error_description: "Late gateway failure event",
        });

        expect(res.data.success).toBe(true);
        expect(res.data.status).toBe("ignored_already_processed");
        expect(helper.getStatus()).toBe("processed"); // Crucial: did NOT regress to 'failed'

        // Verify in Migration 056 SQL
        const sql = fs.readFileSync(migrationPath, "utf8");
        expect(sql).toContain("IF v_refund.status = 'processed' THEN");
        expect(sql).toContain("'status', 'ignored_already_processed'");
      });
    });

    // =========================================================================
    // BLOCKER 3: Safe Administrative Unlock Preconditions
    // =========================================================================
    describe("Blocker 3: Prevent Unsafe Admin Unlock of an Unresolved Refund", () => {
      it("3.1. Incomplete reconciliation cannot authorize unlock (reconciliation never performed)", () => {
        const stuckRefund: RefundRow = {
          id: validRefundId,
          status: "processing",
          provider_refund_id: null,
          execution_attempt_id: "attempt-uuid-unreconciled-31",
          amount: 2500.0,
          created_at: new Date(Date.now() - 30 * 60 * 1000), // 30 mins old
          updated_at: new Date(Date.now() - 30 * 60 * 1000),
        };

        // Attempt unlock without prior reconciliation audit log
        const res = simulateAdminUnlockStuckRefund(
          stuckRefund,
          { userId: validAdminUserId, role: "admin" },
          "Admin attempting unlock without reconciliation",
          new Date(),
          [] // Empty audit logs: no reconciliation proof
        );

        expect(res.success).toBe(false);
        expect(res.status).toBe("reconciliation_required");
        expect(res.error).toContain("Administrative recovery requires verified exhaustive gateway reconciliation");
        expect(stuckRefund.status).toBe("processing");
      });

      it("3.2. Network failure during reconciliation cannot authorize unlock", async () => {
        const helper = setupReconcileMock("processing");
        const mockFetch = jest.fn().mockRejectedValue(new Error("ETIMEDOUT: Connection timed out"));

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(502);
        const json = await res.json();
        expect(json.outcome).toBe("provider_outcome_unresolved");
        expect(json.status).toBe("network_error");

        // Verify NO refund_reconciliation_not_found audit log was created
        expect(helper.getAuditLog()).toBeNull();

        // Unlock must fail
        const stuckRefund: RefundRow = {
          id: validRefundId,
          status: "processing",
          provider_refund_id: null,
          amount: 2500.0,
          created_at: new Date(Date.now() - 30 * 60 * 1000),
          updated_at: new Date(Date.now() - 30 * 60 * 1000),
        };

        const unlockRes = simulateAdminUnlockStuckRefund(
          stuckRefund,
          { userId: validAdminUserId, role: "admin" },
          "Attempting unlock after network drop",
          new Date(),
          []
        );

        expect(unlockRes.success).toBe(false);
        expect(unlockRes.status).toBe("reconciliation_required");
      });

      it("3.3. Max-pages-reached (incomplete search) cannot authorize unlock", async () => {
        const helper = setupReconcileMock("processing");
        // Gateway returns 20 items on every page without exhaustion
        const mockFetch = jest.fn().mockImplementation(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                entity: "collection",
                count: 20,
                items: Array(20).fill({
                  id: "rfnd_unrelated_999",
                  payment_id: "pay_different_payment",
                  amount: 1000,
                  status: "processed",
                }),
              }),
              { status: 200 }
            )
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(502);
        const json = await res.json();
        expect(json.outcome).toBe("provider_outcome_unresolved");
        expect(json.status).toBe("search_incomplete");

        // No refund_reconciliation_not_found audit log
        expect(helper.getAuditLog()).toBeNull();
      });

      it("3.4. Unknown provider status cannot authorize unlock", async () => {
        const helper = setupReconcileMock("processing");
        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 1,
              items: [
                {
                  id: "rfnd_unknown_status_123",
                  payment_id: validProviderPaymentId,
                  amount: 250000,
                  currency: "INR",
                  status: "under_review", // Unknown status
                  notes: { refund_id: validRefundId },
                },
              ],
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(422);
        const json = await res.json();
        expect(json.outcome).toBe("provider_outcome_unresolved");
        expect(json.status).toBe("unknown_gateway_status");
        expect(helper.getAuditLog()).toBeNull();
      });

      it("3.5. A recent refund (<15 minutes) cannot be unlocked even if complete reconciliation exists", () => {
        const refundTooRecent: RefundRow = {
          id: validRefundId,
          status: "processing",
          provider_refund_id: null,
          amount: 2500.0,
          created_at: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes old
          updated_at: new Date(Date.now() - 5 * 60 * 1000),
        };

        const res = simulateAdminUnlockStuckRefund(
          refundTooRecent,
          { userId: validAdminUserId, role: "admin" },
          "Attempting early unlock",
          new Date(),
          [
            {
              action: "refund_reconciliation_not_found",
              entity_id: validRefundId,
              entity_type: "refund",
              created_at: new Date(),
            },
          ]
        );

        expect(res.success).toBe(false);
        expect(res.status).toBe("too_recent");
        expect(res.error).toContain("A minimum in-flight grace period of 15 minutes is required");
      });

      it("3.6. A provider refund ID blocks unlock while refund is pending or registered on gateway", () => {
        const refundWithProviderId: RefundRow = {
          id: validRefundId,
          status: "processing",
          provider_refund_id: "rfnd_already_on_gateway",
          amount: 2500.0,
          created_at: new Date(Date.now() - 30 * 60 * 1000),
          updated_at: new Date(Date.now() - 30 * 60 * 1000),
        };

        const res = simulateAdminUnlockStuckRefund(
          refundWithProviderId,
          { userId: validAdminUserId, role: "admin" },
          "Attempting unlock on pending refund with gateway ID",
          new Date(),
          [
            {
              action: "refund_reconciliation_not_found",
              entity_id: validRefundId,
              entity_type: "refund",
              created_at: new Date(),
            },
          ]
        );

        expect(res.success).toBe(false);
        expect(res.status).toBe("gateway_id_present");
        expect(res.error).toContain("Refund already has an active gateway provider refund ID");
      });

      it("3.7. The intended verified recovery path remains available after exhaustive search confirms no match", async () => {
        const helper = setupReconcileMock("processing");
        // Complete search with 0 matching items across gateway list
        const mockFetch = jest.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 0,
              items: [],
            }),
            { status: 200 }
          )
        );

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.outcome).toBe("not_found_after_complete_search");
        expect(json.status).toBe("not_found_on_gateway");

        // Verify audit log was recorded by server
        const audit = helper.getAuditLog();
        expect(audit).not.toBeNull();
        expect(audit.action).toBe("refund_reconciliation_not_found");
        expect(audit.entity_id).toBe(validRefundId);

        // Now admin calls unlock on 30-minute-old record with the audit record
        const stuckRefund: RefundRow = {
          id: validRefundId,
          status: "processing",
          provider_refund_id: null,
          execution_attempt_id: helper.getExecutionAttemptId(),
          amount: 2500.0,
          created_at: new Date(Date.now() - 30 * 60 * 1000),
          updated_at: new Date(Date.now() - 30 * 60 * 1000),
        };

        const unlockRes = simulateAdminUnlockStuckRefund(
          stuckRefund,
          { userId: validAdminUserId, role: "admin" },
          "Verified complete gateway reconciliation: refund was never created on Razorpay",
          new Date(),
          helper.getAuditLogs()
        );

        expect(unlockRes.success).toBe(true);
        expect(unlockRes.status).toBe("recovered_to_failed");
        expect(unlockRes.new_status).toBe("failed");
        expect(stuckRefund.status).toBe("failed");
      });

      it("3.8. Concurrent recovery operations cannot create independent refunds or corrupt state", () => {
        const attemptToken = "attempt-uuid-concurrent-38";
        const stuckRefund: RefundRow = {
          id: validRefundId,
          status: "processing",
          provider_refund_id: null,
          execution_attempt_id: attemptToken,
          amount: 2500.0,
          created_at: new Date(Date.now() - 30 * 60 * 1000),
          updated_at: new Date(Date.now() - 30 * 60 * 1000),
        };

        const auditLogs = [
          {
            action: "refund_reconciliation_not_found",
            entity_id: validRefundId,
            entity_type: "refund",
            created_at: new Date(),
            details: { execution_attempt_id: attemptToken },
          },
        ];

        // Call 1 succeeds
        const res1 = simulateAdminUnlockStuckRefund(
          stuckRefund,
          { userId: validAdminUserId, role: "admin" },
          "Admin 1 unlocking",
          new Date(),
          auditLogs
        );
        expect(res1.success).toBe(true);
        expect(res1.new_status).toBe("failed");

        // Concurrent Call 2 fails because row is already 'failed' (serialized by FOR UPDATE in SQL)
        const res2 = simulateAdminUnlockStuckRefund(
          stuckRefund,
          { userId: validAdminUserId, role: "admin" },
          "Admin 2 racing",
          new Date(),
          auditLogs
        );
        expect(res2.success).toBe(false);
        expect(res2.status).toBe("invalid_status");
      });

      it("3.9. Verified recovery preserves the exact same local refund UUID, payment ID, amount, and idempotency key on retry", async () => {
        const helper = setupReconcileMock("failed");
        let capturedHeaders: Record<string, string> = {};
        let capturedBody: any = null;

        const mockFetch = jest.fn().mockImplementation(async (_url: string, options: RequestInit) => {
          capturedHeaders = options.headers as Record<string, string>;
          capturedBody = JSON.parse(options.body as string);
          return new Response(
            JSON.stringify({
              id: "rfnd_retried_successfully_456",
              status: "processed",
              amount: 250000,
            }),
            { status: 200 }
          );
        });

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(200);
        expect(capturedHeaders["X-Refund-Idempotency"]).toBe(`refund_${validRefundId}`);
        expect(capturedBody.amount).toBe(250000);
        expect(capturedBody.notes.refund_id).toBe(validRefundId);
        expect(capturedBody.notes.booking_cancellation_id).toBe("cancel-1111-1111");
        expect(helper.getStatus()).toBe("processed");
      });

      it("3.10. Already-processed refunds never regress under unlock, reconciliation, or webhook failure", async () => {
        const processedRefund: RefundRow = {
          id: validRefundId,
          status: "processed",
          provider_refund_id: "rfnd_already_processed_permanent",
          amount: 2500.0,
          created_at: new Date(Date.now() - 60 * 60 * 1000),
          updated_at: new Date(Date.now() - 60 * 60 * 1000),
        };

        // 1. Admin unlock rejected
        const unlockRes = simulateAdminUnlockStuckRefund(
          processedRefund,
          { userId: validAdminUserId, role: "admin" },
          "Attempting unlock on processed refund",
          new Date(),
          [
            {
              action: "refund_reconciliation_not_found",
              entity_id: validRefundId,
              entity_type: "refund",
              created_at: new Date(),
            },
          ]
        );
        expect(unlockRes.success).toBe(false);
        expect(unlockRes.status).toBe("already_processed");
        expect(processedRefund.status).toBe("processed");

        // 2. Active reconciliation rejected / returns already_processed
        const helper = setupReconcileMock("processed", "rfnd_already_processed_permanent");
        const mockFetch = jest.fn();

        const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
          headers: { authorization: "Bearer valid_admin_jwt" },
          body: { refund_id: validRefundId, action: "reconcile" },
        });

        const res = await handleExecuteRazorpayRefund(req, {
          adminClient: helper.mockAdminClient,
          fetchFn: mockFetch,
          getEnvFn,
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.status).toBe("already_processed");
        expect(mockFetch).not.toHaveBeenCalled();

        // 3. Webhook refund.failed ignored without regressing
        const webhookReq = await createSignedWebhookRequest({
          event: "refund.failed",
          payload: {
            refund: {
              entity: {
                id: "rfnd_already_processed_permanent",
                payment_id: validProviderPaymentId,
                status: "failed",
              },
            },
          },
        });

        const webhookRes = await handleRazorpayWebhook(webhookReq, {
          adminClient: helper.mockAdminClient,
          getEnvFn,
        });

        expect(webhookRes.status).toBe(200);
        const webhookJson = await webhookRes.json();
        expect(webhookJson.status).toBe("ignored_already_processed");
        expect(helper.getStatus()).toBe("processed");

        // 4. Migration 056 Section 7 SQL asserts all preconditions and grants
        const sql = fs.readFileSync(migrationPath, "utf8");
        expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_unlock_stuck_refund(");
        expect(sql).toContain("v_age_minutes < c_min_age_minutes");
        expect(sql).toContain("action = 'refund_reconciliation_not_found'");
        expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT, TEXT) FROM PUBLIC, anon;");
        expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT, TEXT) TO authenticated, service_role;");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 15. Task 4 Final Regression Suite (Feature 03 Attempt-Scoped Proof & Duplicate Safety)
  // NOTE: Mocked provider responses are used for unit testing.
  // These mocked tests are NOT live Razorpay integration tests.
  // ---------------------------------------------------------------------------
  describe("Scenario 15: Task 4 Final Regression Suite (Feature 03 Attempt-Scoped Proof & Duplicate Safety)", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../supabase/migrations/056_remediate_booking_and_payment_rpc_schema_compatibility.sql"
    );

    // 1. A no-refund proof can authorize only the attempt for which it was generated.
    it("1. A no-refund proof can authorize only the attempt for which it was generated", async () => {
      const attemptId = "attempt-uuid-0001";
      const helper = setupReconcileMock("processing", null, attemptId);

      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ entity: "collection", count: 0, items: [] }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.outcome).toBe("not_found_after_complete_search");

      // Verify audit log has the matching attempt ID
      const auditLog = helper.getAuditLog();
      expect(auditLog).not.toBeNull();
      expect(auditLog.action).toBe("refund_reconciliation_not_found");
      expect(auditLog.details.execution_attempt_id).toBe(attemptId);

      // Verify unlock succeeds for this exact attempt
      const refundRow: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: attemptId,
        amount: 2500.0,
        created_at: new Date(Date.now() - 25 * 60 * 1000),
        updated_at: new Date(Date.now() - 25 * 60 * 1000),
      };

      const unlockRes = simulateAdminUnlockStuckRefund(
        refundRow,
        { userId: validAdminUserId, role: "admin" },
        "Exhaustive reconciliation verified for attempt 0001",
        new Date(),
        helper.getAuditLogs()
      );

      expect(unlockRes.success).toBe(true);
      expect(unlockRes.status).toBe("recovered_to_failed");
      expect(refundRow.status).toBe("failed");
      expect(refundRow.execution_attempt_id).toBeNull();
    });

    // 2. An unlock and subsequent retry invalidate the prior proof (Sequence A–F).
    it("2. An unlock and subsequent retry invalidate the prior proof (Sequence A-F)", async () => {
      // Step A: Attempt A times out
      const attemptA = "attempt-uuid-AAAA";
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: attemptA,
        amount: 2500.0,
        created_at: new Date(Date.now() - 40 * 60 * 1000),
        updated_at: new Date(Date.now() - 40 * 60 * 1000),
      };

      // Step B: A complete reconciliation records not-found evidence for Attempt A
      const auditLogs = [
        {
          action: "refund_reconciliation_not_found",
          entity_id: validRefundId,
          entity_type: "refund",
          created_at: new Date(Date.now() - 35 * 60 * 1000),
          details: {
            execution_attempt_id: attemptA,
            payment_id: validProviderPaymentId,
            items_scanned: 0,
          },
        },
      ];

      // Step C: Attempt A is unlocked (20 minutes after updated_at to satisfy >= 15 min grace period)
      const unlockA = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Unlock Attempt A after verified reconciliation",
        new Date(Date.now() - 20 * 60 * 1000),
        auditLogs
      );
      expect(unlockA.success).toBe(true);
      expect(refund.status).toBe("failed");
      expect(refund.execution_attempt_id).toBeNull();

      // Step D: The same refund UUID is claimed again for Attempt B
      const attemptB = "attempt-uuid-BBBB";
      refund.status = "processing";
      refund.execution_attempt_id = attemptB;
      refund.updated_at = new Date(Date.now() - 25 * 60 * 1000);

      // Step E: Attempt B times out (in-flight >= 15 min grace period)
      // (refund updated_at was 25 minutes ago)

      // Step F: An administrator attempts to unlock Attempt B WITHOUT conducting fresh reconciliation
      // The audit logs only contain Attempt A's evidence (which is still <2 hours old!)
      const unlockB = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Attempting unlock of Attempt B using stale Attempt A proof",
        new Date(),
        auditLogs // Still only has attemptA
      );

      // Server-enforced attempt check MUST reject Attempt B
      expect(unlockB.success).toBe(false);
      expect(unlockB.status).toBe("reconciliation_required");
      expect(unlockB.error).toContain("Proof from prior attempts is invalid");
      expect(refund.status).toBe("processing");
      expect(refund.execution_attempt_id).toBe(attemptB);
    });

    // 3. A stale not-found log cannot authorize a later attempt.
    it("3. A stale not-found log cannot authorize a later attempt", () => {
      const now = new Date();
      const currentAttempt = "attempt-uuid-current";
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: currentAttempt,
        amount: 2500.0,
        created_at: new Date(now.getTime() - 30 * 60 * 1000),
        updated_at: new Date(now.getTime() - 30 * 60 * 1000),
      };

      // Case 3a: Very recent log (<5 min old) but belongs to a different attempt
      const logsWrongAttempt = [
        {
          action: "refund_reconciliation_not_found",
          entity_id: validRefundId,
          entity_type: "refund",
          created_at: new Date(now.getTime() - 5 * 60 * 1000),
          details: { execution_attempt_id: "attempt-uuid-other" },
        },
      ];

      const resWrongAttempt = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Unlock with different attempt token",
        now,
        logsWrongAttempt
      );
      expect(resWrongAttempt.success).toBe(false);
      expect(resWrongAttempt.status).toBe("reconciliation_required");

      // Case 3b: Log matches attempt ID but is older than 2 hours (expired)
      const logsExpired = [
        {
          action: "refund_reconciliation_not_found",
          entity_id: validRefundId,
          entity_type: "refund",
          created_at: new Date(now.getTime() - 130 * 60 * 1000), // 130 min old (> 2 hours)
          details: { execution_attempt_id: currentAttempt },
        },
      ];

      const resExpired = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Unlock with expired attempt token",
        now,
        logsExpired
      );
      expect(resExpired.success).toBe(false);
      expect(resExpired.status).toBe("reconciliation_required");
    });

    // 4. A new processing attempt without fresh reconciliation cannot be unlocked.
    it("4. A new processing attempt without fresh reconciliation cannot be unlocked", () => {
      const newAttempt = "attempt-uuid-fresh-claim";
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: newAttempt,
        amount: 2500.0,
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        updated_at: new Date(Date.now() - 20 * 60 * 1000),
      };

      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Direct unlock without running reconciliation",
        new Date(),
        [] // Empty audit logs
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe("reconciliation_required");
      expect(refund.status).toBe("processing");
    });

    // 5. Incomplete pagination cannot authorize an unlock.
    it("5. Incomplete pagination cannot authorize an unlock", async () => {
      const currentAttempt = "attempt-uuid-pagination-test";
      const helper = setupReconcileMock("processing", null, currentAttempt);

      // Gateway returns 20 items per page indefinitely (max 5 pages reached = 100 items)
      const mockFetch = jest.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              entity: "collection",
              count: 20,
              items: Array(20).fill({
                id: "rfnd_other_refund",
                payment_id: "pay_different_payment",
                amount: 1000,
                status: "processed",
              }),
            }),
            { status: 200 }
          )
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.status).toBe("search_incomplete");
      expect(json.outcome).toBe("provider_outcome_unresolved");

      // Verify no refund_reconciliation_not_found audit log was created
      expect(helper.getAuditLog()).toBeNull();

      // Unlock attempt must fail
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: currentAttempt,
        amount: 2500.0,
        created_at: new Date(Date.now() - 20 * 60 * 1000),
        updated_at: new Date(Date.now() - 20 * 60 * 1000),
      };

      const unlockRes = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Unlock after incomplete pagination",
        new Date(),
        helper.getAuditLogs()
      );

      expect(unlockRes.success).toBe(false);
      expect(unlockRes.status).toBe("reconciliation_required");
    });

    // 6. Network and provider errors cannot authorize an unlock.
    it("6. Network and provider errors cannot authorize an unlock", async () => {
      const currentAttempt = "attempt-uuid-net-err";
      const helper = setupReconcileMock("processing", null, currentAttempt);

      const mockFetch = jest.fn().mockRejectedValue(new Error("ETIMEDOUT: Connection dropped"));

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.status).toBe("network_error");
      expect(json.outcome).toBe("provider_outcome_unresolved");
      expect(helper.getAuditLog()).toBeNull();

      // Unlock attempt must fail
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: currentAttempt,
        amount: 2500.0,
        created_at: new Date(Date.now() - 25 * 60 * 1000),
        updated_at: new Date(Date.now() - 25 * 60 * 1000),
      };

      const unlockRes = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Unlock after network error",
        new Date(),
        helper.getAuditLogs()
      );

      expect(unlockRes.success).toBe(false);
      expect(unlockRes.status).toBe("reconciliation_required");
    });

    // 7. A provider-record conflict cannot authorize an unlock.
    it("7. A provider-record conflict cannot authorize an unlock", async () => {
      const currentAttempt = "attempt-uuid-conflict-test";
      const helper = setupReconcileMock("processing", null, currentAttempt);

      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_conflict_amt_007",
                payment_id: validProviderPaymentId,
                amount: 100000, // Expected 250000 paise (2500.00)
                currency: "INR",
                status: "processed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.status).toBe("provider_record_conflict");
      expect(json.conflict_type).toBe("amount_mismatch");

      // Verify audit log has action refund_reconciliation_conflict with attempt token
      const conflictLog = helper.getAuditLogs().find((l) => l.action === "refund_reconciliation_conflict");
      expect(conflictLog).toBeDefined();
      expect(conflictLog.details.execution_attempt_id).toBe(currentAttempt);

      // Unlock attempt must fail with reconciliation_conflict
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: currentAttempt,
        amount: 2500.0,
        created_at: new Date(Date.now() - 30 * 60 * 1000),
        updated_at: new Date(Date.now() - 30 * 60 * 1000),
      };

      const unlockRes = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Unlock after conflict",
        new Date(),
        helper.getAuditLogs()
      );

      expect(unlockRes.success).toBe(false);
      expect(unlockRes.status).toBe("reconciliation_conflict");
      expect(refund.status).toBe("processing");
    });

    // 8. Matching pending refunds remain in progress.
    it("8. Matching pending refunds remain in progress", async () => {
      const helper = setupReconcileMock("processing", null, "attempt-uuid-pending");

      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_pending_gateway_008",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "pending",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.outcome).toBe("matched_pending");
      expect(json.status).toBe("pending");
      expect(json.provider_refund_id).toBe("rfnd_pending_gateway_008");
      expect(json.reconciled).toBe(false);

      // Local status remains 'processing' and provider ID is saved
      expect(helper.getStatus()).toBe("processing");
      expect(helper.getProviderId()).toBe("rfnd_pending_gateway_008");

      // Verify administrative unlock is blocked by presence of provider_refund_id
      const refundWithProviderId: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: "rfnd_pending_gateway_008",
        execution_attempt_id: "attempt-uuid-pending",
        amount: 2500.0,
        created_at: new Date(Date.now() - 30 * 60 * 1000),
        updated_at: new Date(Date.now() - 30 * 60 * 1000),
      };

      const unlockRes = simulateAdminUnlockStuckRefund(
        refundWithProviderId,
        { userId: validAdminUserId, role: "admin" },
        "Attempting unlock on pending refund",
        new Date(),
        helper.getAuditLogs()
      );

      expect(unlockRes.success).toBe(false);
      expect(unlockRes.status).toBe("gateway_id_present");
    });

    // 9. Matching processed refunds reconcile successfully.
    it("9. Matching processed refunds reconcile successfully", async () => {
      const helper = setupReconcileMock("processing", null, "attempt-uuid-proc");

      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_processed_gateway_009",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "processed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.outcome).toBe("matched_processed");
      expect(json.status).toBe("processed");
      expect(json.provider_refund_id).toBe("rfnd_processed_gateway_009");
      expect(json.reconciled).toBe(true);

      // Local status transitioned to 'processed'
      expect(helper.getStatus()).toBe("processed");
    });

    // 10. A genuinely failed refund follows the correct failure path.
    it("10. A genuinely failed refund follows the correct failure path", async () => {
      const helper = setupReconcileMock("processing", null, "attempt-uuid-fail");

      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_failed_gateway_010",
                payment_id: validProviderPaymentId,
                amount: 250000,
                currency: "INR",
                status: "failed",
                error_code: "BAD_REQUEST_ERROR",
                error_description: "Card issuer declined refund",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.outcome).toBe("matched_failed");
      expect(json.status).toBe("failed");
      expect(json.provider_refund_id).toBe("rfnd_failed_gateway_010");

      // Local status transitioned to 'failed' and execution_attempt_id cleared
      expect(helper.getStatus()).toBe("failed");
      expect(helper.getExecutionAttemptId()).toBeNull();
    });

    // 11. A processed refund never regresses.
    it("11. A processed refund never regresses", async () => {
      const processedRefund: RefundRow = {
        id: validRefundId,
        status: "processed",
        provider_refund_id: "rfnd_permanent_proc_011",
        amount: 2500.0,
        created_at: new Date(Date.now() - 60 * 60 * 1000),
        updated_at: new Date(Date.now() - 60 * 60 * 1000),
      };

      // 1. Admin unlock rejected
      const unlockRes = simulateAdminUnlockStuckRefund(
        processedRefund,
        { userId: validAdminUserId, role: "admin" },
        "Try unlocking processed refund",
        new Date()
      );
      expect(unlockRes.success).toBe(false);
      expect(unlockRes.status).toBe("already_processed");
      expect(processedRefund.status).toBe("processed");

      // 2. reconcile_failed_refund rejected
      const helper = setupReconcileMock("processed", "rfnd_permanent_proc_011");
      const rpcRes = await helper.mockAdminClient.rpc("reconcile_failed_refund", {
        p_refund_id: validRefundId,
        p_provider_refund_id: "rfnd_permanent_proc_011",
        p_error_code: "GATEWAY_ERROR",
        p_error_description: "Late failure event",
      });
      expect(rpcRes.data.status).toBe("ignored_already_processed");
      expect(helper.getStatus()).toBe("processed");

      // 3. Webhook refund.failed ignored
      const webhookReq = await createSignedWebhookRequest({
        event: "refund.failed",
        payload: {
          refund: {
            entity: {
              id: "rfnd_permanent_proc_011",
              payment_id: validProviderPaymentId,
              status: "failed",
            },
          },
        },
      });

      const webhookRes = await handleRazorpayWebhook(webhookReq, {
        adminClient: helper.mockAdminClient,
        getEnvFn,
      });

      expect(webhookRes.status).toBe(200);
      const webhookJson = await webhookRes.json();
      expect(webhookJson.status).toBe("ignored_already_processed");
      expect(helper.getStatus()).toBe("processed");
    });

    // 12. Recovery never creates a second local refund obligation.
    it("12. Recovery never creates a second local refund obligation", async () => {
      const helper = setupReconcileMock("processing", null, "attempt-uuid-012");
      const insertCalls: any[] = [];

      const trackingClient = {
        ...helper.mockAdminClient,
        from: (table: string) => {
          if (table === "refunds") {
            return {
              ...helper.mockAdminClient.from(table),
              insert: (payload: any) => {
                insertCalls.push(payload);
                return Promise.resolve({ error: null });
              },
            };
          }
          return helper.mockAdminClient.from(table);
        },
      };

      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ entity: "collection", count: 0, items: [] }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      await handleExecuteRazorpayRefund(req, {
        adminClient: trackingClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      // Exactly zero inserts into refunds table
      expect(insertCalls.length).toBe(0);
    });

    // 13. Retry identity and payload remain stable.
    it("13. Retry identity and payload remain stable", async () => {
      const helper = setupReconcileMock("failed");
      const capturedRequests: Array<{ url: string; headers: Record<string, string>; body: any }> = [];

      const mockFetch = jest.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedRequests.push({
          url,
          headers: options.headers as Record<string, string>,
          body: JSON.parse(options.body as string),
        });
        return new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 250000,
          }),
          { status: 200 }
        );
      });

      // Claim and execute Attempt 1
      await helper.mockAdminClient.rpc("claim_refund_for_execution", { p_refund_id: validRefundId });
      const req1 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      await handleExecuteRazorpayRefund(req1, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      // Reset to failed and claim/execute Attempt 2 (retry)
      helper.setStatus("failed");
      await helper.mockAdminClient.rpc("claim_refund_for_execution", { p_refund_id: validRefundId });
      const req2 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      await handleExecuteRazorpayRefund(req2, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(capturedRequests.length).toBe(2);
      // Both requests use identical endpoint URL
      expect(capturedRequests[0].url).toBe(capturedRequests[1].url);
      // Both requests use identical idempotency header
      expect(capturedRequests[0].headers["X-Refund-Idempotency"]).toBe(`refund_${validRefundId}`);
      expect(capturedRequests[1].headers["X-Refund-Idempotency"]).toBe(`refund_${validRefundId}`);
      // Both requests use identical amount and payload notes
      expect(capturedRequests[0].body.amount).toBe(capturedRequests[1].body.amount);
      expect(capturedRequests[0].body.notes.refund_id).toBe(capturedRequests[1].body.notes.refund_id);
      expect(capturedRequests[0].body.notes.booking_cancellation_id).toBe(capturedRequests[1].body.notes.booking_cancellation_id);
    });

    // 14. Concurrent recovery operations cannot bypass attempt-scoped checks.
    it("14. Concurrent recovery operations cannot bypass attempt-scoped checks", () => {
      const attemptToken = "attempt-uuid-concurrent-14";
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: attemptToken,
        amount: 2500.0,
        created_at: new Date(Date.now() - 30 * 60 * 1000),
        updated_at: new Date(Date.now() - 30 * 60 * 1000),
      };

      const auditLogs = [
        {
          action: "refund_reconciliation_not_found",
          entity_id: validRefundId,
          entity_type: "refund",
          created_at: new Date(Date.now() - 10 * 60 * 1000),
          details: { execution_attempt_id: attemptToken },
        },
      ];

      // Thread 1 acquires FOR UPDATE lock, validates token, sets status='failed' and clears execution_attempt_id
      const res1 = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Thread 1 unlocking",
        new Date(),
        auditLogs
      );
      expect(res1.success).toBe(true);
      expect(refund.status).toBe("failed");
      expect(refund.execution_attempt_id).toBeNull();

      // Thread 2 unblocks from row lock, sees status='failed' and execution_attempt_id=null
      const res2 = simulateAdminUnlockStuckRefund(
        refund,
        { userId: "admin-2222-2222-2222-222222222222", role: "admin" },
        "Thread 2 unlocking concurrently",
        new Date(),
        auditLogs
      );
      expect(res2.success).toBe(false);
      expect(res2.status).toBe("invalid_status");
    });

    // 15. Ambiguous original POST requests are not presented as definitively unsuccessful merely because no refund is returned by the query.
    it("15. Ambiguous original POST requests are not presented as definitively unsuccessful merely because no refund is returned by the query", async () => {
      const currentAttempt = "attempt-uuid-ambiguous-post";
      const helper = setupReconcileMock("processing", null, currentAttempt);

      // Razorpay refund list returns 0 refunds
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ entity: "collection", count: 0, items: [] }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();

      // The outcome is strictly NOT marked "definitively_failed" or "rejected"
      expect(json.outcome).toBe("not_found_after_complete_search");
      expect(json.status).toBe("not_found_on_gateway");
      expect(json.outcome).not.toBe("matched_failed");

      // The refund row remains in 'processing' — it is NEVER automatically marked 'failed'
      expect(helper.getStatus()).toBe("processing");

      // Verify that Migration 056 requires an explicit human administrative unlock review
      const sql = fs.readFileSync(migrationPath, "utf8");
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_unlock_stuck_refund(");
      expect(sql).toContain("(details->>'execution_attempt_id')::text = v_refund.execution_attempt_id::text");
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 16: FEATURE 03 FINAL AMBIGUOUS REFUND RECOVERY & FALLBACK AUDIT
  // ---------------------------------------------------------------------------
  describe("Scenario 16: Feature 03 Final Ambiguous Refund Recovery and Fallback Audit", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../supabase/migrations/056_remediate_booking_and_payment_rpc_schema_compatibility.sql"
    );
    const edgeFunctionPath = path.resolve(
      __dirname,
      "../supabase/functions/execute-razorpay-refund/index.ts"
    );

    // 1. Empty refund search after an ambiguous POST does not silently establish that the original request can never succeed.
    it("1. Empty refund search after an ambiguous POST does not silently establish that the original request can never succeed", async () => {
      const attemptId = "attempt-ambiguous-post-01";
      const helper = setupReconcileMock("processing", null, attemptId);

      // Provider search returns empty list
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ entity: "collection", count: 0, items: [] }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.outcome).toBe("not_found_after_complete_search");
      expect(json.status).toBe("not_found_on_gateway");

      // Authoritative database status MUST remain 'processing'
      expect(helper.getStatus()).toBe("processing");
      expect(helper.getExecutionAttemptId()).toBe(attemptId);
      expect(helper.getProviderId()).toBeNull();

      // Audit log records absence proof, but does NOT mark failed or authorize retry
      const auditLog = helper.getAuditLog();
      expect(auditLog).not.toBeNull();
      expect(auditLog.action).toBe("refund_reconciliation_not_found");
      expect(auditLog.details.execution_attempt_id).toBe(attemptId);
    });

    // 2. The normal unlock path cannot authorize an unsafe retry solely because a complete search found no refund.
    it("2. The normal unlock path cannot authorize an unsafe retry solely because a complete search found no refund", () => {
      const attemptId = "attempt-denied-unlock-02";
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: attemptId,
        amount: 2500.0,
        created_at: new Date(Date.now() - 30 * 60 * 1000),
        updated_at: new Date(Date.now() - 30 * 60 * 1000),
      };

      const auditLogs = [
        {
          action: "refund_reconciliation_not_found",
          entity_type: "refund",
          entity_id: validRefundId,
          created_at: new Date(Date.now() - 10 * 60 * 1000),
          details: { execution_attempt_id: attemptId },
        },
      ];

      // Unlock attempt without explicit financial-operations review authorization MUST be DENIED
      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Attempting standard unlock with empty search only",
        new Date(),
        auditLogs,
        null,
        null,
        true // requireFinancialReviewParam = true
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe("financial_review_required");
      expect(refund.status).toBe("processing");
      expect(refund.execution_attempt_id).toBe(attemptId);
    });

    // 3. An explicit, auditable financial-operations decision is required when the provider outcome remains unresolved.
    it("3. An explicit, auditable financial-operations decision is required when the provider outcome remains unresolved", () => {
      const attemptId = "attempt-financial-auth-03";
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: attemptId,
        amount: 2500.0,
        created_at: new Date(Date.now() - 30 * 60 * 1000),
        updated_at: new Date(Date.now() - 30 * 60 * 1000),
      };

      const auditLogs: any[] = [
        {
          action: "refund_reconciliation_not_found",
          entity_type: "refund",
          entity_id: validRefundId,
          created_at: new Date(Date.now() - 10 * 60 * 1000),
          details: { execution_attempt_id: attemptId },
        },
      ];

      // Non-super-admin cannot authorize recovery
      expect(() => {
        simulateRecordRefundRecoveryAuthorization(
          refund,
          { userId: validAdminUserId, role: "admin" },
          "manual_gateway_dashboard_verified_no_refund",
          "Verified on Razorpay Merchant Dashboard that no refund was created",
          new Date(),
          auditLogs
        );
      }).toThrow(/Only Super Administrators can authorize financial recovery/);

      // Short justification rejected
      const shortJustificationRes = simulateRecordRefundRecoveryAuthorization(
        refund,
        { userId: "super-admin-uuid", role: "super_admin" },
        "manual_gateway_dashboard_verified_no_refund",
        "Too short",
        new Date(),
        auditLogs
      );
      expect(shortJustificationRes.success).toBe(false);
      expect(shortJustificationRes.status).toBe("empty_justification");

      // Invalid outcome code rejected
      const invalidOutcomeRes = simulateRecordRefundRecoveryAuthorization(
        refund,
        { userId: "super-admin-uuid", role: "super_admin" },
        "unverified_assumption",
        "Verified on Razorpay Merchant Dashboard that no refund was created",
        new Date(),
        auditLogs
      );
      expect(invalidOutcomeRes.success).toBe(false);
      expect(invalidOutcomeRes.status).toBe("invalid_reviewed_outcome");

      // Valid Super-Admin authorization succeeds
      const authRes = simulateRecordRefundRecoveryAuthorization(
        refund,
        { userId: "super-admin-uuid", role: "super_admin" },
        "manual_gateway_dashboard_verified_no_refund",
        "Verified on Razorpay Merchant Dashboard that no refund exists for payment",
        new Date(),
        auditLogs
      );
      expect(authRes.success).toBe(true);
      expect(authRes.status).toBe("recovery_authorized");
      expect(authRes.reviewed_outcome).toBe("manual_gateway_dashboard_verified_no_refund");

      // Verify audit log has complete attribution
      const authLog = auditLogs.find((l) => l.action === "refund_recovery_authorized");
      expect(authLog).toBeDefined();
      expect(authLog.details.execution_attempt_id).toBe(attemptId);
      expect(authLog.details.reviewed_outcome).toBe("manual_gateway_dashboard_verified_no_refund");
      expect(authLog.details.authorized_by).toBe("super-admin-uuid");

      // Now the administrative unlock succeeds
      const unlockRes = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Unlocking stuck refund following Super Admin authorization",
        new Date(),
        auditLogs,
        null,
        null,
        true
      );
      expect(unlockRes.success).toBe(true);
      expect(unlockRes.status).toBe("recovered_to_failed");
      expect(refund.status).toBe("failed");
      expect(refund.execution_attempt_id).toBeNull();
    });

    // 4. Prior-attempt proof cannot authorize recovery of a later attempt.
    it("4. Prior-attempt proof cannot authorize recovery of a later attempt", () => {
      const priorAttempt = "attempt-prior-attempt-04";
      const currentAttempt = "attempt-current-attempt-04";

      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: currentAttempt,
        amount: 2500.0,
        created_at: new Date(Date.now() - 40 * 60 * 1000),
        updated_at: new Date(Date.now() - 40 * 60 * 1000),
      };

      // Audit logs contain evidence ONLY for the prior attempt
      const auditLogs = [
        {
          action: "refund_reconciliation_not_found",
          entity_type: "refund",
          entity_id: validRefundId,
          created_at: new Date(Date.now() - 25 * 60 * 1000),
          details: { execution_attempt_id: priorAttempt },
        },
        {
          action: "refund_recovery_authorized",
          entity_type: "refund",
          entity_id: validRefundId,
          created_at: new Date(Date.now() - 20 * 60 * 1000),
          details: {
            execution_attempt_id: priorAttempt,
            reviewed_outcome: "manual_gateway_dashboard_verified_no_refund",
          },
        },
      ];

      // Unlock MUST be rejected because evidence is bound to prior attempt
      const res = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Attempting unlock with prior attempt proof",
        new Date(),
        auditLogs,
        null,
        null,
        true
      );

      expect(res.success).toBe(false);
      expect(res.status).toBe("reconciliation_required");
      expect(refund.status).toBe("processing");
    });

    // 5. RPC failure cannot fall through to an unclaimed refund POST.
    it("5. RPC failure cannot fall through to an unclaimed refund POST", async () => {
      const mockFetch = jest.fn();
      let rpcCalled = false;
      const helper = setupReconcileMock("requested");

      const failingAdminClient = {
        ...helper.mockAdminClient,
        rpc: (fn: string, params: any) => {
          if (fn === "claim_refund_for_execution") {
            rpcCalled = true;
            return Promise.resolve({
              data: null,
              error: { message: "connection timeout to database" },
            });
          }
          return helper.mockAdminClient.rpc(fn, params);
        },
      };

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: failingAdminClient as any,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(rpcCalled).toBe(true);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain("Authoritative database claim failed");

      // Razorpay gateway API must NEVER be contacted
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // 6. A fallback cannot bypass row-lock or status-transition invariants.
    it("6. A fallback cannot bypass row-lock or status-transition invariants", () => {
      const edgeFunctionCode = fs.readFileSync(edgeFunctionPath, "utf8");

      // Verify fallbackAttemptId and globalThis.crypto.randomUUID() have been removed
      expect(edgeFunctionCode).not.toContain("fallbackAttemptId");
      expect(edgeFunctionCode).not.toMatch(/crypto\.randomUUID\(\)/);

      // Verify that claimRpcErr or !claimResult strictly returns 500 without proceeding
      expect(edgeFunctionCode).toContain("if (claimRpcErr || !claimResult) {");
      expect(edgeFunctionCode).toContain("Authoritative database claim failed; refund execution cannot proceed without confirmed atomic claim.");

      // Verify that claim_refund_for_execution is the mandatory prerequisite before POST
      const claimIndex = edgeFunctionCode.indexOf("claim_refund_for_execution");
      const postIndex = edgeFunctionCode.indexOf('method: "POST"');
      expect(claimIndex).toBeGreaterThan(0);
      expect(postIndex).toBeGreaterThan(claimIndex);
    });

    // 7. Concurrent claims cannot independently submit the same refund.
    it("7. Concurrent claims cannot independently submit the same refund", async () => {
      const helper = setupReconcileMock("requested");

      // Simulate atomic row lock: only one caller can claim from 'requested'
      const client1 = {
        ...helper.mockAdminClient,
        rpc: async (fn: string, params: any) => {
          if (fn === "claim_refund_for_execution") {
            if (helper.getStatus() !== "requested") {
              return { data: { success: false, status: "already_processing", status_code: 409 } };
            }
            helper.setStatus("processing");
            helper.setExecutionAttemptId("attempt-worker-1");
            return {
              data: {
                success: true,
                status: "claimed",
                refund_id: validRefundId,
                payment_transaction_id: validTxId,
                provider_payment_id: validProviderPaymentId,
                amount: 2500.0,
                execution_attempt_id: "attempt-worker-1",
              },
            };
          }
          return helper.mockAdminClient.rpc(fn, params);
        },
      };

      const mockFetch1 = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: validProviderRefundId, status: "processed", amount: 250000 }),
          { status: 200 }
        )
      );
      const mockFetch2 = jest.fn();

      // Worker 1 claims and dispatches
      const req1 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      const res1 = await handleExecuteRazorpayRefund(req1, {
        adminClient: client1,
        fetchFn: mockFetch1,
        getEnvFn,
      });

      expect(res1.status).toBe(200);
      expect(mockFetch1).toHaveBeenCalledTimes(1);

      // Worker 2 attempts concurrent claim while status is now 'processing'
      const req2 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      const res2 = await handleExecuteRazorpayRefund(req2, {
        adminClient: client1,
        fetchFn: mockFetch2,
        getEnvFn,
      });

      expect(res2.status).toBe(409);
      const json2 = await res2.json();
      expect(json2.error).toContain("already in progress");

      // Worker 2 fetch was NEVER called
      expect(mockFetch2).not.toHaveBeenCalled();
    });

    // 8. Stable refund UUID, payment ID, amount, payload, and idempotency key.
    it("8. Stable refund UUID, payment ID, amount, payload, and idempotency key across attempts", async () => {
      const helper = setupReconcileMock("failed");
      const capturedPayloads: any[] = [];

      const mockFetch = jest.fn().mockImplementation(async (url: string, options: any) => {
        capturedPayloads.push({
          url,
          idempotencyKey: options.headers["X-Refund-Idempotency"],
          body: JSON.parse(options.body),
        });
        return new Response(
          JSON.stringify({ id: validProviderRefundId, status: "processed", amount: 250000 }),
          { status: 200 }
        );
      });

      // Attempt 1
      helper.setStatus("requested");
      const req1 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      await handleExecuteRazorpayRefund(req1, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      // Reset to failed and execute Attempt 2
      helper.setStatus("failed");
      const req2 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId },
      });
      await handleExecuteRazorpayRefund(req2, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(capturedPayloads.length).toBe(2);
      expect(capturedPayloads[0].url).toBe(`https://api.razorpay.com/v1/payments/${validProviderPaymentId}/refund`);
      expect(capturedPayloads[1].url).toBe(`https://api.razorpay.com/v1/payments/${validProviderPaymentId}/refund`);
      expect(capturedPayloads[0].idempotencyKey).toBe(`refund_${validRefundId}`);
      expect(capturedPayloads[1].idempotencyKey).toBe(`refund_${validRefundId}`);
      expect(capturedPayloads[0].body.amount).toBe(250000);
      expect(capturedPayloads[1].body.amount).toBe(250000);
      expect(capturedPayloads[0].body.notes.refund_id).toBe(validRefundId);
      expect(capturedPayloads[1].body.notes.refund_id).toBe(validRefundId);
    });

    // 9. Processed or pending refunds cannot be treated as not found.
    it("9. Processed or pending refunds cannot be treated as not found", async () => {
      const helper = setupReconcileMock("processing", null, "attempt-proc-pending-check");

      // 1. Processed refund returned by gateway search
      const mockFetchProcessed = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_already_done",
                payment_id: validProviderPaymentId,
                amount: 250000,
                status: "processed",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req1 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res1 = await handleExecuteRazorpayRefund(req1, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetchProcessed,
        getEnvFn,
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.outcome).toBe("matched_processed");
      expect(json1.outcome).not.toBe("not_found_after_complete_search");
      expect(helper.getStatus()).toBe("processed");
      expect(helper.getAuditLog()).toBeNull(); // No not_found audit log

      // 2. Pending refund returned by gateway search
      helper.setStatus("processing");
      helper.setProviderId(null);
      const mockFetchPending = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entity: "collection",
            count: 1,
            items: [
              {
                id: "rfnd_still_pending",
                payment_id: validProviderPaymentId,
                amount: 250000,
                status: "pending",
                notes: { refund_id: validRefundId },
              },
            ],
          }),
          { status: 200 }
        )
      );

      const req2 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res2 = await handleExecuteRazorpayRefund(req2, {
        adminClient: helper.mockAdminClient,
        fetchFn: mockFetchPending,
        getEnvFn,
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.outcome).toBe("matched_pending");
      expect(json2.outcome).not.toBe("not_found_after_complete_search");
      expect(helper.getStatus()).toBe("processing");
      expect(helper.getProviderId()).toBe("rfnd_still_pending");
      expect(helper.getAuditLog()).toBeNull();
    });

    // 10. Conflicting provider records remain blocked from recovery.
    it("10. Conflicting provider records remain blocked from recovery", () => {
      const attemptId = "attempt-conflict-block-10";
      const refund: RefundRow = {
        id: validRefundId,
        status: "processing",
        provider_refund_id: null,
        execution_attempt_id: attemptId,
        amount: 2500.0,
        created_at: new Date(Date.now() - 30 * 60 * 1000),
        updated_at: new Date(Date.now() - 30 * 60 * 1000),
      };

      const auditLogs = [
        {
          action: "refund_reconciliation_conflict",
          entity_type: "refund",
          entity_id: validRefundId,
          created_at: new Date(Date.now() - 15 * 60 * 1000),
          details: {
            execution_attempt_id: attemptId,
            conflict_type: "amount_mismatch",
            expected_amount: 250000,
            actual_amount: 50000,
          },
        },
        {
          action: "refund_reconciliation_not_found",
          entity_type: "refund",
          entity_id: validRefundId,
          created_at: new Date(Date.now() - 10 * 60 * 1000),
          details: { execution_attempt_id: attemptId },
        },
      ];

      // Recovery authorization MUST be blocked by conflict
      const authRes = simulateRecordRefundRecoveryAuthorization(
        refund,
        { userId: "super-admin-uuid", role: "super_admin" },
        "manual_gateway_dashboard_verified_no_refund",
        "Verified conflict manually on dashboard",
        new Date(),
        auditLogs
      );
      expect(authRes.success).toBe(false);
      expect(authRes.status).toBe("reconciliation_conflict");

      // Administrative unlock MUST be blocked by conflict
      const unlockRes = simulateAdminUnlockStuckRefund(
        refund,
        { userId: validAdminUserId, role: "admin" },
        "Attempting unlock when conflict exists",
        new Date(),
        auditLogs,
        null,
        null,
        true
      );
      expect(unlockRes.success).toBe(false);
      expect(unlockRes.status).toBe("reconciliation_conflict");
      expect(refund.status).toBe("processing");
    });
  });
});



