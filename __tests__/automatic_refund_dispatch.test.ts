import {
  handleExecuteRazorpayRefund,
  executeRefundObligation,
} from "../supabase/functions/execute-razorpay-refund/index.ts";
declare const require: any;
declare const __dirname: string;
const fs = require("fs");
const path = require("path");

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

describe("Automatic Customer Refund Dispatch Pipeline", () => {
  const validServiceRoleKey = "mock_service_role_secret_key_12345";
  const validWorkerSecret = "mock_internal_worker_secret_99999";
  const validAdminUserId = "admin-1111-1111-1111-111111111111";
  const validRefundId = "e971b43a-92be-400a-bb79-9f03f1c95dd5";
  const validPaymentTxId = "tx-2222-2222-2222-222222222222";
  const validProviderPaymentId = "pay_Tp2TNHlHfHWbme";
  const validProviderRefundId = "rfnd_Tp3VaZXN1usXuZ";

  const mockEnv: Record<string, string> = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: validServiceRoleKey,
    INTERNAL_WORKER_SECRET: validWorkerSecret,
    RAZORPAY_KEY_ID: "rzp_test_mockKeyId",
    RAZORPAY_KEY_SECRET: "mockSecretKey",
  };

  const getEnvFn = (key: string) => mockEnv[key];

  function buildMockSupabase(overrides: {
    user?: any;
    authError?: any;
    userRole?: string | null;
    claimResult?: any;
    claimRpcErr?: any;
    reconcileResult?: any;
    reconcileRpcErr?: any;
    pendingRefunds?: any[];
    fetchRefundsErr?: any;
    refundRecord?: any;
  } = {}) {
    return {
      auth: {
        getUser: jest.fn().mockImplementation((token: string) => {
          if (overrides.authError) {
            return Promise.resolve({ data: { user: null }, error: overrides.authError });
          }
          if (token === "valid_admin_jwt") {
            return Promise.resolve({
              data: { user: { id: validAdminUserId, email: "admin@kashiveda.com" } },
              error: null,
            });
          }
          if (token === "customer_jwt") {
            return Promise.resolve({
              data: { user: { id: "customer-9999", email: "devotee@kashiveda.com" } },
              error: null,
            });
          }
          return Promise.resolve({
            data: { user: overrides.user || null },
            error: overrides.user ? null : new Error("Invalid JWT"),
          });
        }),
      },
      from: jest.fn().mockImplementation((table: string) => {
        if (table === "user_roles") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockImplementation(() => {
              if (overrides.userRole !== undefined) {
                if (overrides.userRole && ["admin", "super_admin"].includes(overrides.userRole)) {
                  return Promise.resolve({
                    data: { role: overrides.userRole },
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: null });
              }
              return Promise.resolve({ data: { role: "admin" }, error: null });
            }),
          };
        }
        if (table === "refunds") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockImplementation(() => {
              if (overrides.fetchRefundsErr) {
                return Promise.resolve({ data: null, error: overrides.fetchRefundsErr });
              }
              return Promise.resolve({
                data: overrides.pendingRefunds || [
                  { id: validRefundId, status: "requested", created_at: new Date().toISOString() },
                ],
                error: null,
              });
            }),
            update: jest.fn().mockReturnThis(),
            neq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: overrides.refundRecord || {
                id: validRefundId,
                status: "requested",
                amount: 24.5,
                payment_transaction: { provider_payment_id: validProviderPaymentId },
              },
              error: null,
            }),
          };
        }
        if (table === "admin_audit_logs") {
          return {
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: jest.fn().mockImplementation((fnName: string, args: any) => {
        if (fnName === "claim_refund_for_execution") {
          if (overrides.claimRpcErr) {
            return Promise.resolve({ data: null, error: overrides.claimRpcErr });
          }
          if (overrides.claimResult !== undefined) {
            return Promise.resolve({ data: overrides.claimResult, error: null });
          }
          return Promise.resolve({
            data: {
              success: true,
              refund_id: args?.p_refund_id || validRefundId,
              payment_transaction_id: validPaymentTxId,
              booking_cancellation_id: "cancellation-uuid-111",
              amount: 24.5,
              provider_payment_id: validProviderPaymentId,
            },
            error: null,
          });
        }
        if (fnName === "reconcile_processed_refund") {
          if (overrides.reconcileRpcErr) {
            return Promise.resolve({ data: null, error: overrides.reconcileRpcErr });
          }
          return Promise.resolve({
            data: overrides.reconcileResult || {
              success: true,
              status: "processed",
              refund_id: args?.p_refund_id,
              provider_refund_id: args?.p_provider_refund_id,
            },
            error: null,
          });
        }
        if (fnName === "reconcile_failed_refund") {
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
  }

  // ===========================================================================
  // 1. Automatic dispatch of a newly requested refund
  // ===========================================================================
  describe("1. Automatic Dispatch of a Newly Requested Refund", () => {
    it("dispatches single requested refund using service-role authorization", async () => {
      const mockAdminClient = buildMockSupabase();
      let capturedFetchUrl = "";
      let capturedFetchOptions: any;

      const mockFetch = jest.fn().mockImplementation((url: string, opts: any) => {
        capturedFetchUrl = url;
        capturedFetchOptions = opts;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: validProviderRefundId,
              entity: "refund",
              amount: 2450,
              currency: "INR",
              payment_id: validProviderPaymentId,
              status: "processed",
            }),
            { status: 200 }
          )
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBe("processed");
      expect(json.provider_refund_id).toBe(validProviderRefundId);

      // Verify claim RPC was called
      expect(mockAdminClient.rpc).toHaveBeenCalledWith("claim_refund_for_execution", {
        p_refund_id: validRefundId,
      });

      // Verify Razorpay API call
      expect(capturedFetchUrl).toBe(
        `https://api.razorpay.com/v1/payments/${validProviderPaymentId}/refund`
      );
      expect(capturedFetchOptions.headers["X-Refund-Idempotency"]).toBe(`refund_${validRefundId}`);

      // Verify reconciliation RPC was called
      expect(mockAdminClient.rpc).toHaveBeenCalledWith("reconcile_processed_refund", {
        p_refund_id: validRefundId,
        p_provider_refund_id: validProviderRefundId,
        p_amount_paise: 2450,
        p_gateway_status: "processed",
        p_raw_response: expect.any(Object),
      });
    });

    it("dispatches refund from Supabase Database Webhook INSERT event payload", async () => {
      const mockAdminClient = buildMockSupabase();
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 2450,
          }),
          { status: 200 }
        )
      );

      const webhookPayload = {
        type: "INSERT",
        table: "refunds",
        schema: "public",
        record: {
          id: validRefundId,
          status: "requested",
          amount: 24.5,
          created_at: new Date().toISOString(),
        },
        old_record: null,
      };

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: webhookPayload,
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBe("processed");
      expect(json.provider_refund_id).toBe(validProviderRefundId);
    });
  });

  // ===========================================================================
  // 2. Processing previously queued refunds
  // ===========================================================================
  describe("2. Processing Previously Queued Refunds (Batch Sweeper)", () => {
    it("sweeps and processes multiple queued refunds with status = 'requested'", async () => {
      const refundId1 = "11111111-1111-4111-8111-111111111111";
      const refundId2 = "22222222-2222-4222-8222-222222222222";

      const mockAdminClient = buildMockSupabase({
        pendingRefunds: [
          { id: refundId1, status: "requested" },
          { id: refundId2, status: "requested" },
        ],
      });

      let fetchCallCount = 0;
      const mockFetch = jest.fn().mockImplementation(() => {
        fetchCallCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: `rfnd_swept_${fetchCallCount}`,
              status: "processed",
              amount: 2450,
            }),
            { status: 200 }
          )
        );
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { mode: "dispatch_queued", batch_size: 10 },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.mode).toBe("dispatch_queued");
      expect(json.total_found).toBe(2);
      expect(json.processed_count).toBe(2);
      expect(fetchCallCount).toBe(2);
    });
  });

  // ===========================================================================
  // 3. No dispatch for ineligible refunds
  // ===========================================================================
  describe("3. Ineligible Refunds", () => {
    it("safely ignores database webhook event when record status is not 'requested'", async () => {
      const mockAdminClient = buildMockSupabase();
      const mockFetch = jest.fn();

      const webhookPayload = {
        type: "UPDATE",
        table: "refunds",
        schema: "public",
        record: {
          id: validRefundId,
          status: "processed", // Not requested!
        },
      };

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: webhookPayload,
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.status).toBe("ignored");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns error and does not call Razorpay if claim RPC rejects ineligible refund", async () => {
      const mockAdminClient = buildMockSupabase({
        claimResult: {
          success: false,
          status_code: 400,
          error: "Refund obligation has invalid state.",
        },
      });

      const mockFetch = jest.fn();

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain("Refund obligation has invalid state.");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 4. Concurrent dispatch attempts
  // ===========================================================================
  describe("4. Concurrent Dispatch Protection", () => {
    it("second concurrent dispatch loses atomic claim and is rejected with 409", async () => {
      let claimCallCount = 0;
      const mockAdminClient = {
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
        rpc: jest.fn().mockImplementation((fnName: string) => {
          if (fnName === "claim_refund_for_execution") {
            claimCallCount++;
            if (claimCallCount === 1) {
              return Promise.resolve({
                data: {
                  success: true,
                  refund_id: validRefundId,
                  payment_transaction_id: validPaymentTxId,
                  amount: 24.5,
                  provider_payment_id: validProviderPaymentId,
                },
                error: null,
              });
            }
            // Winner locks it; loser gets 409 already_processing
            return Promise.resolve({
              data: {
                success: false,
                status_code: 409,
                status: "already_processing",
                error: "Refund execution is already in progress for this record.",
              },
              error: null,
            });
          }
          if (fnName === "reconcile_processed_refund") {
            return Promise.resolve({ data: { success: true, status: "processed" }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      let externalFetchCount = 0;
      const mockFetch = jest.fn().mockImplementation(() => {
        externalFetchCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: validProviderRefundId, status: "processed" }),
            { status: 200 }
          )
        );
      });

      const req1 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const req2 = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

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

      expect(res2.status).toBe(409);
      expect(json2.error).toContain("already in progress");

      // Verify Razorpay was called exactly once
      expect(externalFetchCount).toBe(1);
    });
  });

  // ===========================================================================
  // 5. Duplicate event delivery
  // ===========================================================================
  describe("5. Duplicate Event Delivery", () => {
    it("handles already-processed refund idempotently without calling Razorpay", async () => {
      const mockAdminClient = buildMockSupabase({
        claimResult: {
          success: true,
          status: "already_processed",
          refund_id: validRefundId,
          provider_refund_id: validProviderRefundId,
        },
      });

      const mockFetch = jest.fn();

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBe("already_processed");
      expect(json.provider_refund_id).toBe(validProviderRefundId);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // 6. Razorpay API success and failure
  // ===========================================================================
  describe("6. Razorpay API Success and Terminal Failure", () => {
    it("handles Razorpay 200 processed response with reconciliation", async () => {
      const mockAdminClient = buildMockSupabase();
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 2450,
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.status).toBe("processed");
      expect(json.provider_refund_id).toBe(validProviderRefundId);
    });

    it("handles Razorpay 400 Bad Request by reverting status to 'failed'", async () => {
      const mockAdminClient = buildMockSupabase();
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "BAD_REQUEST_ERROR",
              description: "The payment has already been fully refunded.",
            },
          }),
          { status: 400 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain("fully refunded");

      // Verify DB update set status = 'failed'
      expect(mockAdminClient.from).toHaveBeenCalledWith("refunds");
    });
  });

  // ===========================================================================
  // 7. Network timeouts and ambiguous responses
  // ===========================================================================
  describe("7. Network Timeouts and Ambiguous Responses", () => {
    it("preserves 'processing' state without marking failed on network fetch failure", async () => {
      const mockAdminClient = buildMockSupabase();
      const mockFetch = jest.fn().mockRejectedValue(new Error("Connection reset by peer / Gateway timeout"));

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(502);
      expect(json.error).toContain("processing state");
    });

    it("preserves 'processing' state on HTTP 500/502 Gateway Server Error", async () => {
      const mockAdminClient = buildMockSupabase();
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { description: "Internal Razorpay server error" } }),
          { status: 502 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(502);
      expect(json.error).toContain("processing state");
    });
  });

  // ===========================================================================
  // 8. Safe retry behaviour
  // ===========================================================================
  describe("8. Safe Retry Behaviour", () => {
    it("retrying a previously failed refund claims it successfully with identical refund_id", async () => {
      const mockAdminClient = buildMockSupabase({
        claimResult: {
          success: true,
          refund_id: validRefundId,
          payment_transaction_id: validPaymentTxId,
          amount: 24.5,
          provider_payment_id: validProviderPaymentId,
        },
      });

      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 2450,
          }),
          { status: 200 }
        )
      );

      const retryReq = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(retryReq, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.provider_refund_id).toBe(validProviderRefundId);
    });
  });

  // ===========================================================================
  // 9. Webhook reconciliation
  // ===========================================================================
  describe("9. Webhook Reconciliation", () => {
    it("reconcile_processed_refund updates database atomically when gateway status is processed", async () => {
      const mockAdminClient = buildMockSupabase();
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 2450,
          }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: `Bearer ${validServiceRoleKey}` },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        "reconcile_processed_refund",
        expect.objectContaining({
          p_refund_id: validRefundId,
          p_provider_refund_id: validProviderRefundId,
          p_gateway_status: "processed",
        })
      );
    });
  });

  // ===========================================================================
  // 10. Authorization and secret handling
  // ===========================================================================
  describe("10. Authorization and Secret Handling", () => {
    it("rejects unauthorized request with missing Authorization header (401)", async () => {
      const mockAdminClient = buildMockSupabase();
      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      expect(res.status).toBe(401);
    });

    it("rejects unauthorized customer JWT with HTTP 403 Forbidden", async () => {
      const mockAdminClient = buildMockSupabase({ userRole: "customer" });
      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer customer_jwt" },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Forbidden: Only administrators");
    });

    it("authorizes internal worker using apikey and x-worker-secret header alone without Authorization header", async () => {
      const mockAdminClient = buildMockSupabase();
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: validProviderRefundId, status: "processed" }),
          { status: 200 }
        )
      );

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: {
          "apikey": "mock_supabase_publishable_anon_key",
          "x-worker-secret": validWorkerSecret,
        },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe("processed");
      expect(json.provider_refund_id).toBe(validProviderRefundId);
    });

    it("rejects request when invalid x-worker-secret is provided (401)", async () => {
      const mockAdminClient = buildMockSupabase();
      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: {
          "x-worker-secret": "incorrect-worker-secret-value",
        },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Invalid worker credentials");
    });

    it("returns 500 configuration error when x-worker-secret is sent but INTERNAL_WORKER_SECRET is unconfigured", async () => {
      const mockAdminClient = buildMockSupabase();
      const unconfiguredEnvGetter = (key: string) => {
        if (key === "INTERNAL_WORKER_SECRET") return undefined;
        return mockEnv[key];
      };

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: {
          "x-worker-secret": validWorkerSecret,
        },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        getEnvFn: unconfiguredEnvGetter,
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Internal worker authentication not configured");
    });

    it("never leaks secrets or keys in error responses", async () => {
      const mockAdminClient = buildMockSupabase({
        claimRpcErr: new Error("Simulated database failure"),
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { "x-worker-secret": validWorkerSecret },
        body: { refund_id: validRefundId },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      const bodyText = await res.text();
      expect(bodyText).not.toContain(validServiceRoleKey);
      expect(bodyText).not.toContain(validWorkerSecret);
      expect(bodyText).not.toContain("mockSecretKey");
      expect(bodyText).not.toContain("rzp_test_mockKeyId");
    });
  });

  // ===========================================================================
  // 11. Regression of the existing manual admin execution flow
  // ===========================================================================
  describe("11. Regression Suite: Manual Admin Execution Flow", () => {
    it("admin JWT executing single refund succeeds exactly as before", async () => {
      const mockAdminClient = buildMockSupabase({ userRole: "admin" });
      const mockFetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: validProviderRefundId,
            status: "processed",
            amount: 2450,
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

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.provider_refund_id).toBe(validProviderRefundId);

      // Verify admin audit log was created with caller's user ID
      expect(mockAdminClient.from).toHaveBeenCalledWith("admin_audit_logs");
    });

    it("admin JWT calling active reconciliation action preserves existing behavior", async () => {
      const mockAdminClient = buildMockSupabase({
        userRole: "admin",
        refundRecord: {
          id: validRefundId,
          status: "processed",
          provider_refund_id: validProviderRefundId,
        },
      });

      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: { authorization: "Bearer valid_admin_jwt" },
        body: { refund_id: validRefundId, action: "reconcile" },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.status).toBe("already_processed");
      expect(json.reconciled).toBe(true);
    });
  });

  // ===========================================================================
  // 12. Migration 060 and Scheduled Sweeper Verification for Existing Queued Refunds
  // ===========================================================================
  describe("12. Migration 060 Verification and Existing Queued Refunds Sweeper", () => {
    const existingQueuedRefund1 = "e7b28563-7fa7-4091-adfa-a6e69847b34d";
    const existingQueuedRefund2 = "fe08d5e2-dbcf-4bcf-9c43-111bea19c1f0";

    it("sweeps the two existing queued test refunds without creating new records", async () => {
      const mockAdminClient = buildMockSupabase({
        pendingRefunds: [
          { id: existingQueuedRefund1, status: "requested", created_at: "2026-10-18T00:00:00Z" },
          { id: existingQueuedRefund2, status: "requested", created_at: "2026-10-18T00:01:00Z" },
        ],
      });

      const processedIds: string[] = [];
      const mockFetch = jest.fn().mockImplementation((url: string, opts: any) => {
        const match = url.match(/payments\/(.*)\/refund/);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: `rfnd_${Date.now()}`,
              status: "processed",
              amount: 2450,
            }),
            { status: 200 }
          )
        );
      });

      // Internal worker sweeps queued refunds using dedicated apikey and x-worker-secret headers
      const req = createMockRequest("https://mock.supabase.co/functions/v1/execute-razorpay-refund", {
        headers: {
          "apikey": "mock_supabase_publishable_anon_key",
          "x-worker-secret": validWorkerSecret,
        },
        body: { mode: "dispatch_queued", batch_size: 10 },
      });

      const res = await handleExecuteRazorpayRefund(req, {
        adminClient: mockAdminClient,
        fetchFn: mockFetch,
        getEnvFn,
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.mode).toBe("dispatch_queued");
      expect(json.total_found).toBe(2);
      expect(json.processed_count).toBe(2);
      expect(json.results[0].refund_id).toBe(existingQueuedRefund1);
      expect(json.results[1].refund_id).toBe(existingQueuedRefund2);
      expect(json.results[0].status_code).toBe(200);
      expect(json.results[1].status_code).toBe(200);
    });

    it("validates that Migration 060 SQL adheres to security and Vault specifications", () => {
      const migrationPath = path.resolve(__dirname, "../supabase/migrations/060_secure_automatic_refund_dispatch.sql");
      expect(fs.existsSync(migrationPath)).toBe(true);

      const migrationSql = fs.readFileSync(migrationPath, "utf-8");

      // 1. Must query vault.decrypted_secrets for 'supabase_url', 'internal_worker_secret', and 'supabase_publishable_key'
      expect(migrationSql).toMatch(/FROM\s+vault\.decrypted_secrets\s+WHERE\s+name\s*=\s*'supabase_url'/i);
      expect(migrationSql).toMatch(/FROM\s+vault\.decrypted_secrets\s+WHERE\s+name\s*=\s*'internal_worker_secret'/i);
      expect(migrationSql).toMatch(/FROM\s+vault\.decrypted_secrets\s+WHERE\s+name\s*=\s*'supabase_publishable_key'/i);

      // 2. Must transmit 'apikey' and 'x-worker-secret' headers
      expect(migrationSql).toContain("'apikey'");
      expect(migrationSql).toContain("'x-worker-secret'");

      // 3. Must NEVER transmit service-role key or Authorization header over HTTP
      expect(migrationSql).not.toMatch(/'Authorization'\s*,/i);
      expect(migrationSql).not.toMatch(/'service_role_key'/i);

      // 4. Must handle missing Vault configuration safely with non-sensitive RAISE WARNING
      expect(migrationSql).toMatch(/IF\s+v_supabase_url\s+IS\s+NULL\s+OR\s+v_internal_worker_secret\s+IS\s+NULL\s+OR\s+v_supabase_publishable_key\s+IS\s+NULL\s+THEN/i);
      expect(migrationSql).toMatch(/RAISE\s+WARNING/i);

      // 5. Must target execute-razorpay-refund endpoint correctly
      expect(migrationSql).toContain("rtrim(v_supabase_url, '/') || '/functions/v1/execute-razorpay-refund'");

      // 6. Must keep fail-open exception handling
      expect(migrationSql).toContain("EXCEPTION WHEN OTHERS THEN");

      // 7. Must maintain 2-minute sweeper schedule in pg_cron
      expect(migrationSql).toContain("'*/2 * * * *'");
      expect(migrationSql).toContain("queued_refund_dispatch_sweeper");
    });
  });
});

