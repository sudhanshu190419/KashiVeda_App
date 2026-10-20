const fs = require('fs');

const actionPath = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
let content = fs.readFileSync(actionPath, 'utf8');

const oldFuncText = `export async function getAstrologySubscriptionById(
  id: string
): Promise<AstrologySubscriptionDetail | null> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { data: sub, error } = await supabase
    .from("astrology_subscriptions")
    .select(\`
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
    \`)
    .eq("id", id)
    .maybeSingle();

  if (error || !sub) {
    return null;
  }

  const cust = extractSingle(sub.customer);
  const pln = extractSingle(sub.plan);
  const po = extractSingle(sub.payment_order);

  // Fetch transactions and refunds if payment_order_id exists
  let transactions: any[] = [];
  let refunds: any[] = [];

  if (sub.payment_order_id) {
    const { data: txData } = await supabase
      .from("payment_transactions")
      .select("id, provider_payment_id, amount, status, payment_method, created_at")
      .eq("payment_order_id", sub.payment_order_id)
      .order("created_at", { ascending: false });

    transactions = txData || [];

    if (transactions.length > 0) {
      const txIds = transactions.map((t) => t.id);
      const { data: rfData } = await supabase
        .from("refunds")
        .select("id, amount, reason, status, provider_refund_id, created_at")
        .in("payment_transaction_id", txIds)
        .order("created_at", { ascending: false });

      refunds = rfData || [];
    }
  }

  // Fetch delivery history for this subscription
  const { data: deliveriesData } = await supabase
    .from("astrology_deliveries")
    .select(\`
      id,
      content_id,
      channel,
      status,
      scheduled_at,
      sent_at,
      error_message,
      content:astrology_content!astrology_deliveries_content_id_fkey(title)
    \`)
    .eq("subscription_id", id)
    .order("scheduled_at", { ascending: false })
    .limit(20);

  const deliveries = (deliveriesData || []).map((d: any) => {
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
    transactions: transactions.map((t) => ({
      id: t.id,
      providerPaymentId: t.provider_payment_id,
      amount: Number(t.amount),
      status: t.status,
      paymentMethod: t.payment_method,
      createdAt: t.created_at,
    })),
    refunds: refunds.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      providerRefundId: r.provider_refund_id,
      createdAt: r.created_at,
    })),
    deliveries,
  };
}`;

const newFuncText = `export async function getAstrologySubscriptionById(
  id: string
): Promise<AstrologySubscriptionDetail | null> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { data: sub, error } = await supabase
    .from("astrology_subscriptions")
    .select(\`
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
    \`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching astrology subscription:", error.message);
    throw new Error(\`Failed to load astrology subscription: \${error.message}\`);
  }

  if (!sub) {
    return null;
  }

  const cust = extractSingle(sub.customer);
  const pln = extractSingle(sub.plan);
  const po = extractSingle(sub.payment_order);

  // Fetch transactions and refunds if payment_order_id exists
  let transactions: any[] = [];
  let transactionsError: string | null = null;
  let refunds: any[] = [];
  let refundsError: string | null = null;

  if (sub.payment_order_id) {
    // AST-15: Query only existing columns in public.payment_transactions.
    // payment_method does not exist on payment_transactions.
    const { data: txData, error: txError } = await supabase
      .from("payment_transactions")
      .select("id, provider_payment_id, amount, status, created_at")
      .eq("payment_order_id", sub.payment_order_id)
      .order("created_at", { ascending: false });

    if (txError) {
      console.error("Failed to fetch payment transactions:", txError.message);
      transactionsError = "Payment transaction history could not be loaded.";
      // Distinguish absent transactions from a failed query:
      // When transaction query fails, we cannot know transaction IDs to fetch refunds.
      // Do not interpret absent IDs as proof that no refunds exist.
      refundsError = "Refund history could not be verified because payment transaction lookup failed.";
    } else {
      transactions = txData || [];

      // Conditionally fetch refunds only when transactions query completed successfully and has IDs
      if (transactions.length > 0) {
        const txIds = transactions.map((t) => t.id);
        const { data: rfData, error: rfError } = await supabase
          .from("refunds")
          .select("id, payment_transaction_id, amount, reason, status, provider_refund_id, created_at")
          .in("payment_transaction_id", txIds)
          .order("created_at", { ascending: false });

        if (rfError) {
          console.error("Failed to fetch refunds:", rfError.message);
          refundsError = "Refund history could not be loaded.";
        } else {
          refunds = rfData || [];
        }
      }
    }
  }

  // Fetch delivery history for this subscription
  let deliveries: any[] = [];
  let deliveriesError: string | null = null;
  const { data: deliveriesData, error: deliveriesErr } = await supabase
    .from("astrology_deliveries")
    .select(\`
      id,
      content_id,
      channel,
      status,
      scheduled_at,
      sent_at,
      error_message,
      content:astrology_content!astrology_deliveries_content_id_fkey(title)
    \`)
    .eq("subscription_id", id)
    .order("scheduled_at", { ascending: false })
    .limit(20);

  if (deliveriesErr) {
    console.error("Failed to fetch astrology deliveries:", deliveriesErr.message);
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
    transactions: transactions.map((t) => ({
      id: t.id,
      providerPaymentId: t.provider_payment_id,
      amount: Number(t.amount),
      status: t.status,
      paymentMethod: null,
      createdAt: t.created_at,
    })),
    transactionsError,
    refunds: refunds.map((r) => ({
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
}`;

if (!content.includes(oldFuncText)) {
  console.error('Old function text not matched exactly!');
  process.exit(1);
}

content = content.replace(oldFuncText, newFuncText);
fs.writeFileSync(actionPath, content, 'utf8');
console.log('Successfully updated lib/actions/astrology-management.ts');
