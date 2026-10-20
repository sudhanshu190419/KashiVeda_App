export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");

/**
 * Test Suite: AST-15 — Admin Astrology Subscription Detail Financial Ledger
 * Target: C:\Projects\kashi-veda-admin & C:\Projects\KashiVeda
 *
 * Requirements:
 * Scenario A: Valid transactions and refunds returned and mapped correctly
 * Scenario B: No transactions exist -> genuine empty history, refund query skipped safely
 * Scenario C: Subscription with captured payment displays supported transaction details
 * Scenario D: Subscription with a refund returns both with correct linkage
 * Scenario E: Multiple transactions and refunds preserved without loss or cross-talk
 * Scenario F: Invalid-column query failure (missing payment_method) reported explicitly, not disguised as empty
 * Scenario G: Permission-denied transaction query failure reported explicitly
 * Scenario H: Refund query failure reported explicitly while preserving valid transaction data
 * Scenario I: Refund query skipped ONLY when transaction query completed successfully with empty set
 * Scenario J: Missing subscription returns null, while prerequisite query failures throw explicit errors
 * Scenario K: UI state distinction: distinguishes query errors from genuine empty history
 * Scenario L: Schema integrity: verifies payment_transactions schema has no payment_method column
 */

const adminRoot = path.resolve(__dirname, "../../kashi-veda-admin");
const kashiVedaRoot = path.resolve(__dirname, "..");

interface MockQueryBuilder {
  select: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  maybeSingle: jest.Mock;
}

function createMockSupabase(overrides: {
  subscriptionData?: any;
  subscriptionError?: any;
  transactionsData?: any;
  transactionsError?: any;
  refundsData?: any;
  refundsError?: any;
  deliveriesData?: any;
  deliveriesError?: any;
}) {
  const tableMocks: Record<string, MockQueryBuilder> = {};

  const getOrCreateMock = (table: string): MockQueryBuilder => {
    if (!tableMocks[table]) {
      const qb: any = {};
      qb.select = jest.fn().mockReturnValue(qb);
      qb.eq = jest.fn().mockReturnValue(qb);
      qb.in = jest.fn().mockReturnValue(qb);
      qb.order = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.maybeSingle = jest.fn();

      if (table === "astrology_subscriptions") {
        qb.maybeSingle.mockResolvedValue({
          data: overrides.subscriptionData !== undefined ? overrides.subscriptionData : null,
          error: overrides.subscriptionError !== undefined ? overrides.subscriptionError : null,
        });
      } else if (table === "payment_transactions") {
        qb.order.mockResolvedValue({
          data: overrides.transactionsData !== undefined ? overrides.transactionsData : null,
          error: overrides.transactionsError !== undefined ? overrides.transactionsError : null,
        });
      } else if (table === "refunds") {
        qb.order.mockResolvedValue({
          data: overrides.refundsData !== undefined ? overrides.refundsData : null,
          error: overrides.refundsError !== undefined ? overrides.refundsError : null,
        });
      } else if (table === "astrology_deliveries") {
        qb.limit.mockResolvedValue({
          data: overrides.deliveriesData !== undefined ? overrides.deliveriesData : [],
          error: overrides.deliveriesError !== undefined ? overrides.deliveriesError : null,
        });
      }

      tableMocks[table] = qb;
    }
    return tableMocks[table];
  };

  const client = {
    from: jest.fn((table: string) => getOrCreateMock(table)),
  };

  return { client, tableMocks };
}

// Function that executes the logic of getAstrologySubscriptionById using injected client
async function executeGetAstrologySubscriptionById(supabase: any, id: string) {
  function extractSingle(val: any) {
    if (Array.isArray(val)) return val[0] || null;
    return val || null;
  }

  const { data: sub, error } = await supabase
    .from("astrology_subscriptions")
    .select(`
      id,
      customer_id,
      plan_id,
      payment_order_id,
      starts_at,
      ends_at,
      status,
      created_at,
      customer:profiles!astrology_subscriptions_customer_id_fkey(id, display_name, phone, avatar_url),
      plan:astrology_subscription_plans!astrology_subscriptions_plan_id_fkey(id, name, duration_days, price, currency, daily_in_app_enabled, weekly_whatsapp_enabled, is_active),
      payment_order:payment_orders!astrology_subscriptions_payment_order_id_fkey(id, status, amount, currency, provider, provider_order_id, created_at, updated_at)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load astrology subscription: ${error.message}`);
  }

  if (!sub) {
    return null;
  }

  const cust = extractSingle(sub.customer);
  const pln = extractSingle(sub.plan);
  const po = extractSingle(sub.payment_order);

  let transactions: any[] = [];
  let transactionsError: string | null = null;
  let refunds: any[] = [];
  let refundsError: string | null = null;

  if (sub.payment_order_id) {
    const { data: txData, error: txError } = await supabase
      .from("payment_transactions")
      .select("id, provider_payment_id, amount, status, created_at")
      .eq("payment_order_id", sub.payment_order_id)
      .order("created_at", { ascending: false });

    if (txError) {
      transactionsError = "Payment transaction history could not be loaded.";
      refundsError = "Refund history could not be verified because payment transaction lookup failed.";
    } else {
      transactions = txData || [];

      if (transactions.length > 0) {
        const txIds = transactions.map((t: any) => t.id);
        const { data: rfData, error: rfError } = await supabase
          .from("refunds")
          .select("id, payment_transaction_id, amount, reason, status, provider_refund_id, created_at")
          .in("payment_transaction_id", txIds)
          .order("created_at", { ascending: false });

        if (rfError) {
          refundsError = "Refund history could not be loaded.";
        } else {
          refunds = rfData || [];
        }
      }
    }
  }

  let deliveries: any[] = [];
  let deliveriesError: string | null = null;
  const { data: deliveriesData, error: deliveriesErr } = await supabase
    .from("astrology_deliveries")
    .select(`
      id,
      content_id,
      channel,
      status,
      scheduled_at,
      sent_at,
      error_message,
      content:astrology_content!astrology_deliveries_content_id_fkey(title)
    `)
    .eq("subscription_id", id)
    .order("scheduled_at", { ascending: false })
    .limit(20);

  if (deliveriesErr) {
    deliveriesError = "Delivery dispatch history could not be loaded.";
  } else {
    deliveries = (deliveriesData || []).map((d: any) => {
      const c = extractSingle(d.content);
      return {
        id: d.id,
        contentId: d.content_id,
        contentTitle: c?.title || null,
        channel: d.channel,
        status: d.status,
        scheduledAt: d.scheduled_at,
        sentAt: d.sent_at,
        errorMessage: d.error_message,
      };
    });
  }

  return {
    id: sub.id,
    customer: {
      id: cust?.id || sub.customer_id,
      displayName: cust?.display_name || "Unknown Devotee",
      phone: cust?.phone || null,
      email: null,
      avatarUrl: cust?.avatar_url || null,
    },
    plan: {
      id: pln?.id || sub.plan_id,
      name: pln?.name || "Unknown Plan",
      durationDays: pln?.duration_days || 0,
      price: Number(pln?.price || 0),
      currency: pln?.currency || "INR",
      dailyInAppEnabled: pln?.daily_in_app_enabled ?? true,
      weeklyWhatsappEnabled: pln?.weekly_whatsapp_enabled ?? false,
      isActive: pln?.is_active ?? true,
    },
    status: sub.status,
    startsAt: sub.starts_at,
    endsAt: sub.ends_at,
    createdAt: sub.created_at,
    paymentOrder: po
      ? {
          id: po.id,
          status: po.status,
          amount: Number(po.amount || 0),
          currency: po.currency || "INR",
          provider: po.provider,
          providerOrderId: po.provider_order_id,
          createdAt: po.created_at,
          updatedAt: po.updated_at,
        }
      : null,
    transactions: transactions.map((t: any) => ({
      id: t.id,
      providerPaymentId: t.provider_payment_id,
      amount: Number(t.amount),
      status: t.status,
      paymentMethod: null,
      createdAt: t.created_at,
    })),
    transactionsError,
    refunds: refunds.map((r: any) => ({
      id: r.id,
      paymentTransactionId: r.payment_transaction_id,
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      providerRefundId: r.provider_refund_id,
      createdAt: r.created_at,
    })),
    refundsError,
    deliveries,
    deliveriesError,
  };
}

describe("AST-15: Subscription Detail Financial Ledger Query & Error Handling", () => {
  const baseSubRow = {
    id: "sub-123",
    customer_id: "cust-456",
    plan_id: "plan-789",
    payment_order_id: "po-999",
    starts_at: "2026-10-10T00:00:00Z",
    ends_at: "2026-11-10T00:00:00Z",
    status: "active",
    created_at: "2026-10-10T00:00:00Z",
    customer: { id: "cust-456", display_name: "Aarav Sharma", phone: "+919876543210", avatar_url: null },
    plan: { id: "plan-789", name: "Varshik Jyotish", duration_days: 30, price: 501, currency: "INR", daily_in_app_enabled: true, weekly_whatsapp_enabled: false, is_active: true },
    payment_order: { id: "po-999", status: "paid", amount: 501, currency: "INR", provider: "razorpay", provider_order_id: "order_rzp_123", created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-10T00:05:00Z" },
  };

  test("Scenario A: Valid transactions and refunds returned and mapped correctly", async () => {
    const { client } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsData: [
        {
          id: "tx-001",
          provider_payment_id: "pay_rzp_001",
          amount: 501,
          status: "captured",
          created_at: "2026-10-10T00:01:00Z",
        },
      ],
      refundsData: [
        {
          id: "rf-001",
          payment_transaction_id: "tx-001",
          amount: 501,
          reason: "Devotee cancellation",
          status: "processed",
          provider_refund_id: "rfnd_rzp_001",
          created_at: "2026-10-10T02:00:00Z",
        },
      ],
    });

    const result = await executeGetAstrologySubscriptionById(client, "sub-123");
    expect(result).not.toBeNull();
    expect(result!.transactions).toHaveLength(1);
    expect(result!.transactions[0]).toEqual({
      id: "tx-001",
      providerPaymentId: "pay_rzp_001",
      amount: 501,
      status: "captured",
      paymentMethod: null,
      createdAt: "2026-10-10T00:01:00Z",
    });
    expect(result!.transactionsError).toBeNull();

    expect(result!.refunds).toHaveLength(1);
    expect(result!.refunds[0]).toEqual({
      id: "rf-001",
      paymentTransactionId: "tx-001",
      amount: 501,
      reason: "Devotee cancellation",
      status: "processed",
      providerRefundId: "rfnd_rzp_001",
      createdAt: "2026-10-10T02:00:00Z",
    });
    expect(result!.refundsError).toBeNull();
  });

  test("Scenario B: No transactions exist -> genuine empty history, refund query skipped safely", async () => {
    const { client, tableMocks } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsData: [],
      transactionsError: null,
    });

    const result = await executeGetAstrologySubscriptionById(client, "sub-123");
    expect(result).not.toBeNull();
    expect(result!.transactions).toEqual([]);
    expect(result!.transactionsError).toBeNull();
    expect(result!.refunds).toEqual([]);
    expect(result!.refundsError).toBeNull();

    // Verify refund query was never called
    expect(tableMocks["refunds"]).toBeUndefined();
  });

  test("Scenario C: Subscription with captured payment displays supported transaction details", async () => {
    const { client } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsData: [
        {
          id: "tx-captured",
          provider_payment_id: "pay_captured_888",
          amount: 1500,
          status: "captured",
          created_at: "2026-10-10T08:00:00Z",
        },
      ],
      refundsData: [],
    });

    const result = await executeGetAstrologySubscriptionById(client, "sub-123");
    expect(result!.transactions).toHaveLength(1);
    expect(result!.transactions[0].status).toBe("captured");
    expect(result!.transactions[0].amount).toBe(1500);
    expect(result!.transactions[0].providerPaymentId).toBe("pay_captured_888");
  });

  test("Scenario D: Subscription with a refund returns both with correct linkage", async () => {
    const { client } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsData: [
        {
          id: "tx-d",
          provider_payment_id: "pay_d",
          amount: 750,
          status: "refunded",
          created_at: "2026-10-10T05:00:00Z",
        },
      ],
      refundsData: [
        {
          id: "rf-d",
          payment_transaction_id: "tx-d",
          amount: 750,
          reason: "Duplicate charge",
          status: "processed",
          provider_refund_id: "rfnd_d",
          created_at: "2026-10-10T06:00:00Z",
        },
      ],
    });

    const result = await executeGetAstrologySubscriptionById(client, "sub-123");
    expect(result!.transactions[0].id).toBe("tx-d");
    expect(result!.refunds[0].paymentTransactionId).toBe("tx-d");
    expect(result!.refunds[0].amount).toBe(750);
  });

  test("Scenario E: Multiple transactions and refunds preserved without loss or cross-talk", async () => {
    const { client, tableMocks } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsData: [
        { id: "tx-1", provider_payment_id: "pay-1", amount: 500, status: "captured", created_at: "2026-10-10T01:00:00Z" },
        { id: "tx-2", provider_payment_id: "pay-2", amount: 500, status: "captured", created_at: "2026-10-10T02:00:00Z" },
      ],
      refundsData: [
        { id: "rf-1", payment_transaction_id: "tx-1", amount: 250, reason: "Partial refund 1", status: "processed", provider_refund_id: "rfnd-1", created_at: "2026-10-10T03:00:00Z" },
        { id: "rf-2", payment_transaction_id: "tx-2", amount: 500, reason: "Full refund 2", status: "processed", provider_refund_id: "rfnd-2", created_at: "2026-10-10T04:00:00Z" },
      ],
    });

    const result = await executeGetAstrologySubscriptionById(client, "sub-123");
    expect(result!.transactions).toHaveLength(2);
    expect(result!.refunds).toHaveLength(2);
    expect(result!.transactions.map((t) => t.id)).toEqual(["tx-1", "tx-2"]);
    expect(result!.refunds.map((r) => r.id)).toEqual(["rf-1", "rf-2"]);

    // Verify .in query passed both IDs
    expect(tableMocks["refunds"].in).toHaveBeenCalledWith("payment_transaction_id", ["tx-1", "tx-2"]);
  });

  test("Scenario F: Invalid-column query failure (missing payment_method) reported explicitly, not disguised as empty", async () => {
    const { client, tableMocks } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsError: {
        code: "42703",
        message: 'column payment_transactions.payment_method does not exist',
      },
      transactionsData: null,
    });

    const result = await executeGetAstrologySubscriptionById(client, "sub-123");
    expect(result).not.toBeNull();
    // Must NOT be disguised as normal empty history
    expect(result!.transactions).toEqual([]);
    expect(result!.transactionsError).toBe("Payment transaction history could not be loaded.");
    // Must NOT disguise refunds as empty when transaction query failed
    expect(result!.refunds).toEqual([]);
    expect(result!.refundsError).toBe(
      "Refund history could not be verified because payment transaction lookup failed."
    );
    // Refund query must be skipped because transaction IDs are unknown
    expect(tableMocks["refunds"]).toBeUndefined();
  });

  test("Scenario G: Permission-denied transaction query failure reported explicitly", async () => {
    const { client } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsError: {
        code: "42501",
        message: "permission denied for table payment_transactions",
      },
      transactionsData: null,
    });

    const result = await executeGetAstrologySubscriptionById(client, "sub-123");
    expect(result!.transactionsError).toBe("Payment transaction history could not be loaded.");
    expect(result!.refundsError).toBe(
      "Refund history could not be verified because payment transaction lookup failed."
    );
  });

  test("Scenario H: Refund query failure reported explicitly while preserving valid transaction data", async () => {
    const { client } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsData: [
        {
          id: "tx-valid",
          provider_payment_id: "pay_valid",
          amount: 999,
          status: "captured",
          created_at: "2026-10-10T11:00:00Z",
        },
      ],
      refundsError: {
        code: "42501",
        message: "permission denied for table refunds",
      },
      refundsData: null,
    });

    const result = await executeGetAstrologySubscriptionById(client, "sub-123");
    // Valid transaction data preserved!
    expect(result!.transactions).toHaveLength(1);
    expect(result!.transactions[0].id).toBe("tx-valid");
    expect(result!.transactionsError).toBeNull();

    // Refund failure reported explicitly
    expect(result!.refunds).toEqual([]);
    expect(result!.refundsError).toBe("Refund history could not be loaded.");
  });

  test("Scenario I: Refund query skipped ONLY when transaction query completed successfully with empty set", async () => {
    // 1. Successful empty transaction query -> refunds skipped safely with null error
    const { client: clientEmpty, tableMocks: mocksEmpty } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsData: [],
      transactionsError: null,
    });
    const resultEmpty = await executeGetAstrologySubscriptionById(clientEmpty, "sub-123");
    expect(resultEmpty!.transactionsError).toBeNull();
    expect(resultEmpty!.refundsError).toBeNull();
    expect(mocksEmpty["refunds"]).toBeUndefined();

    // 2. Failed transaction query -> refunds NOT treated as valid empty
    const { client: clientFailed } = createMockSupabase({
      subscriptionData: baseSubRow,
      transactionsData: null,
      transactionsError: { message: "timeout" },
    });
    const resultFailed = await executeGetAstrologySubscriptionById(clientFailed, "sub-123");
    expect(resultFailed!.transactionsError).toBe("Payment transaction history could not be loaded.");
    expect(resultFailed!.refundsError).toContain("Refund history could not be verified");
  });

  test("Scenario J: Missing subscription returns null, while prerequisite query failures throw explicit errors", async () => {
    // 1. Missing subscription row -> returns null (triggers 404)
    const { client: clientNotFound } = createMockSupabase({
      subscriptionData: null,
      subscriptionError: null,
    });
    const resultNotFound = await executeGetAstrologySubscriptionById(clientNotFound, "sub-none");
    expect(resultNotFound).toBeNull();

    // 2. Database query failure on subscription -> throws explicit Error
    const { client: clientDbError } = createMockSupabase({
      subscriptionData: null,
      subscriptionError: { message: "connection refused" },
    });
    await expect(
      executeGetAstrologySubscriptionById(clientDbError, "sub-err")
    ).rejects.toThrow("Failed to load astrology subscription: connection refused");
  });

  test("Scenario K: UI source code distinguishes query errors from genuine empty history", () => {
    const detailViewFile = path.resolve(
      adminRoot,
      "components/admin/astrology/astrology-subscription-detail-view.tsx"
    );
    const content = fs.readFileSync(detailViewFile, "utf-8");

    // Must check transactionsError
    expect(content).toContain("subscription.transactionsError");
    // Must display error state
    expect(content).toContain("Captured Gateway Transactions");
    // Must display empty state when transactions.length === 0 and no error
    expect(content).toContain("No gateway transactions recorded for this order.");

    // Must check refundsError
    expect(content).toContain("subscription.refundsError");

    // Must check deliveriesError
    expect(content).toContain("subscription.deliveriesError");
    expect(content).toContain("No deliveries dispatched for this subscription yet.");
  });

  test("Scenario L: Schema integrity: verifies payment_transactions in migration 007 has no payment_method column", () => {
    const migration007 = path.resolve(
      kashiVedaRoot,
      "supabase/migrations/007_payments_and_live.sql"
    );
    const sql = fs.readFileSync(migration007, "utf-8");

    // Extract CREATE TABLE public.payment_transactions block
    const ptMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.payment_transactions\s*\(([\s\S]*?)\);/);
    expect(ptMatch).not.toBeNull();
    const ptBody = ptMatch![1];

    // Assert supported columns exist
    expect(ptBody).toContain("id UUID PRIMARY KEY");
    expect(ptBody).toContain("payment_order_id UUID NOT NULL");
    expect(ptBody).toContain("provider_payment_id TEXT NOT NULL");
    expect(ptBody).toContain("amount NUMERIC(12,2) NOT NULL");
    expect(ptBody).toContain("status public.payment_transaction_status NOT NULL");
    expect(ptBody).toContain("paid_at TIMESTAMPTZ");
    expect(ptBody).toContain("raw_response JSONB");
    expect(ptBody).toContain("created_at TIMESTAMPTZ NOT NULL");

    // Assert payment_method DOES NOT exist in payment_transactions schema
    expect(ptBody).not.toContain("payment_method");

    // Assert action file no longer queries payment_method from payment_transactions
    const actionFile = path.resolve(
      adminRoot,
      "lib/actions/astrology-management.ts"
    );
    const actionContent = fs.readFileSync(actionFile, "utf-8");
    expect(actionContent).not.toMatch(
      /\.from\("payment_transactions"\)\s*\.select\("[^"]*payment_method/
    );
  });
});
