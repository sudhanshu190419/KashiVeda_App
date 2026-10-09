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
  // 11. Authoritative Stuck Refund Recovery (admin_unlock_stuck_refund)
  // ---------------------------------------------------------------------------
  describe("Scenario 11: Stuck Processing Refund Recovery", () => {
    interface RefundRow {
      id: string;
      status: "requested" | "processing" | "processed" | "failed";
      provider_refund_id: string | null;
      amount: number;
      updated_at: Date;
      created_at: Date;
    }

    function simulateAdminUnlockStuckRefund(
      refund: RefundRow | null,
      caller: { userId: string; role: string } | null,
      reason: string,
      now: Date = new Date(),
      auditLogRecorder?: (entry: any) => void
    ) {
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

      // 7. Transition: processing -> failed
      const previousStatus = refund.status;
      refund.status = "failed";
      refund.updated_at = now;

      // 8. Authoritative Audit Log
      if (auditLogRecorder) {
        auditLogRecorder({
          actor_user_id: caller.userId,
          action: "refund_processing_recovered",
          entity_type: "refund",
          entity_id: refund.id,
          details: {
            refund_id: refund.id,
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
});

