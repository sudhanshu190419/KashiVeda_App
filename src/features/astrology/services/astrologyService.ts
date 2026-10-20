// src/features/astrology/services/astrologyService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import {
  AstrologyChannel,
  AstrologyContent,
  AstrologyDelivery,
  AstrologySubscription,
  AstrologySubscriptionPlan,
  CreateAstrologySubscriptionOrderResult,
  CustomerSubscriptionSummary,
  PaginatedAstrologyContent,
  PaginatedAstrologyDeliveries,
} from "../types/astrology.types.ts";

/**
 * Determines whether a subscription interval is currently active and granting access.
 * Enforces authoritative SQL predicates: status = 'active' AND starts_at <= now AND ends_at > now.
 */
export function isSubscriptionCurrentlyActive(
  sub: AstrologySubscription | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (!sub.starts_at || !sub.ends_at) return false;

  const startMs = new Date(sub.starts_at).getTime();
  const endMs = new Date(sub.ends_at).getTime();

  if (isNaN(startMs) || isNaN(endMs)) return false;

  // Exact boundary: starts_at <= now < ends_at (exclusive expiry)
  return startMs <= nowMs && endMs > nowMs;
}

/**
 * Determines whether a subscription is a future-start interval (scheduled renewal).
 * status = 'active' AND starts_at > now.
 */
export function isSubscriptionFutureStart(
  sub: AstrologySubscription | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (!sub.starts_at) return false;

  const startMs = new Date(sub.starts_at).getTime();
  if (isNaN(startMs)) return false;

  return startMs > nowMs;
}

/**
 * Determines whether a subscription is awaiting payment confirmation.
 */
export function isSubscriptionPending(
  sub: AstrologySubscription | null | undefined
): boolean {
  if (!sub) return false;
  return sub.status === "payment_pending";
}

/**
 * Determines whether a subscription has expired.
 */
export function isSubscriptionExpired(
  sub: AstrologySubscription | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!sub) return false;
  if (sub.status === "expired") return true;
  if (sub.status === "active" && sub.ends_at) {
    const endMs = new Date(sub.ends_at).getTime();
    return !isNaN(endMs) && endMs <= nowMs;
  }
  return false;
}

/**
 * Evaluates whether a subscription meets all authoritative SQL predicates for daily in-app insights:
 * status = 'active' AND starts_at <= now AND ends_at > now AND plan.daily_in_app_enabled = true.
 * Note: Under AST-Q02 Option A, plan.is_active affects new catalog sales only; existing subscribers
 * with valid paid intervals retain daily in-app access during their active subscription term.
 */
export function isEligibleForDailyInAppInsights(
  sub: AstrologySubscription | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!isSubscriptionCurrentlyActive(sub, nowMs)) return false;
  const plan = sub?.plan;
  if (!plan) return false;

  return plan.daily_in_app_enabled === true;
}

/**
 * Categorizes a list of customer subscriptions into current access, future renewal,
 * pending checkout, and historical newest record.
 */
export function selectSubscriptionSummary(
  subscriptions: AstrologySubscription[],
  nowMs = Date.now()
): CustomerSubscriptionSummary {
  if (!subscriptions || subscriptions.length === 0) {
    return {
      currentSubscription: null,
      futureSubscription: null,
      pendingSubscription: null,
      newestSubscription: null,
      allSubscriptions: [],
    };
  }

  // 1. Current Active Subscriptions: status === 'active', starts_at <= now < ends_at
  const currentlyActive = subscriptions.filter((s) => isSubscriptionCurrentlyActive(s, nowMs));
  // If multiple, order by ends_at DESC (matching SQL ORDER BY ends_at DESC LIMIT 1)
  currentlyActive.sort((a, b) => {
    const endA = a.ends_at ? new Date(a.ends_at).getTime() : 0;
    const endB = b.ends_at ? new Date(b.ends_at).getTime() : 0;
    return endB - endA;
  });
  const currentSubscription = currentlyActive[0] || null;

  // 2. Future Active Subscriptions: status === 'active', starts_at > now
  const futureActive = subscriptions.filter((s) => isSubscriptionFutureStart(s, nowMs));
  // Order by starts_at ASC (nearest upcoming activation first)
  futureActive.sort((a, b) => {
    const startA = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const startB = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return startA - startB;
  });
  const futureSubscription = futureActive[0] || null;

  // 3. Pending Subscriptions: status === 'payment_pending'
  const pending = subscriptions.filter((s) => s.status === "payment_pending");
  pending.sort((a, b) => {
    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return createdB - createdA;
  });
  const pendingSubscription = pending[0] || null;

  // 4. Newest Subscription by created_at DESC
  const sortedByCreated = [...subscriptions].sort((a, b) => {
    const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return createdB - createdA;
  });
  const newestSubscription = sortedByCreated[0] || null;

  return {
    currentSubscription,
    futureSubscription,
    pendingSubscription,
    newestSubscription,
    allSubscriptions: subscriptions,
  };
}

/**
 * Selects the single most relevant subscription to represent the customer's state.
 * Prioritizes current active access over future renewals, pending checkouts, and historical records.
 */
export function selectCurrentSubscription(
  subscriptions: AstrologySubscription[],
  nowMs = Date.now()
): AstrologySubscription | null {
  const summary = selectSubscriptionSummary(subscriptions, nowMs);
  return (
    summary.currentSubscription ||
    summary.futureSubscription ||
    summary.pendingSubscription ||
    summary.newestSubscription ||
    null
  );
}

export const astrologyService = {
  /**
   * Fetch all active astrology subscription plans configured by Admin.
   * Publicly readable for authenticated devotees.
   */
  async getActivePlans(): Promise<AstrologySubscriptionPlan[]> {
    const { data, error } = await supabase
      .from("astrology_subscription_plans")
      .select(
        "id, name, duration_days, price, currency, daily_in_app_enabled, weekly_whatsapp_enabled, is_active, created_at, updated_at"
      )
      .eq("is_active", true)
      .gt("price", 0)
      .order("price", { ascending: true });

    if (error) {
      throw new Error(error.message || "Failed to load astrology subscription plans.");
    }

    return (data || [])
      .map((row: any) => ({
        ...row,
        price: Number(row.price),
        duration_days: Number(row.duration_days),
      }))
      .filter((plan: AstrologySubscriptionPlan) => typeof plan.price === "number" && plan.price > 0);
  },

  /**
   * Fetch specific astrology plan by ID.
   */
  async getPlanById(planId: string): Promise<AstrologySubscriptionPlan | null> {
    if (!planId) return null;

    const { data, error } = await supabase
      .from("astrology_subscription_plans")
      .select(
        "id, name, duration_days, price, currency, daily_in_app_enabled, weekly_whatsapp_enabled, is_active, created_at, updated_at"
      )
      .eq("id", planId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || `Failed to load astrology plan ${planId}.`);
    }

    if (!data) return null;

    return {
      ...data,
      price: Number(data.price),
      duration_days: Number(data.duration_days),
    };
  },

  /**
  /**
   * Fetch customer subscriptions using targeted queries to ensure active access
   * and pending checkouts are never crowded out or truncated by large volumes of
   * historical, cancelled, or expired checkout records.
   *
   * Partitions retrieval into:
   * 1. All active subscriptions (never truncated by created_at DESC limit)
   * 2. Recent pending checkouts awaiting confirmation
   * 3. Recent subscription history for fallback / status presentation
   */
  async getCustomerSubscriptions(customerId?: string): Promise<AstrologySubscription[]> {
    const selectFields = `
      id,
      customer_id,
      plan_id,
      payment_order_id,
      starts_at,
      ends_at,
      status,
      created_at,
      astrology_subscription_plans (
        id,
        name,
        duration_days,
        price,
        currency,
        daily_in_app_enabled,
        weekly_whatsapp_enabled,
        is_active
      )
    `;

    // Helper to execute query with maybeSingle / thenable compatibility
    const executeQuery = async (queryBuilder: any): Promise<{ data: any; error: any }> => {
      if (typeof queryBuilder.then !== "function" && typeof queryBuilder.maybeSingle === "function") {
        return await queryBuilder.maybeSingle();
      }
      return await queryBuilder;
    };

    // 1. Query active subscriptions (authoritative current & future entitlement)
    let activeQuery = supabase
      .from("astrology_subscriptions")
      .select(selectFields)
      .eq("status", "active")
      .order("ends_at", { ascending: false });

    // 2. Query pending checkouts awaiting confirmation
    let pendingQuery = supabase
      .from("astrology_subscriptions")
      .select(selectFields)
      .eq("status", "payment_pending")
      .order("created_at", { ascending: false })
      .limit(5);

    // 3. Query recent history for newest fallback or cancellation review
    let recentQuery = supabase
      .from("astrology_subscriptions")
      .select(selectFields)
      .order("created_at", { ascending: false })
      .limit(10);

    if (customerId) {
      activeQuery = activeQuery.eq("customer_id", customerId);
      pendingQuery = pendingQuery.eq("customer_id", customerId);
      recentQuery = recentQuery.eq("customer_id", customerId);
    }

    const [activeRes, pendingRes, recentRes] = await Promise.all([
      executeQuery(activeQuery),
      executeQuery(pendingQuery),
      executeQuery(recentQuery),
    ]);

    const error = activeRes.error || pendingRes.error || recentRes.error;
    if (error) {
      throw new Error(error.message || "Failed to load customer subscriptions.");
    }

    const allRaw = [
      ...(Array.isArray(activeRes.data) ? activeRes.data : activeRes.data ? [activeRes.data] : []),
      ...(Array.isArray(pendingRes.data) ? pendingRes.data : pendingRes.data ? [pendingRes.data] : []),
      ...(Array.isArray(recentRes.data) ? recentRes.data : recentRes.data ? [recentRes.data] : []),
    ];

    const seen = new Set<string>();
    const deduplicated: AstrologySubscription[] = [];

    for (const item of allRaw) {
      if (item && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        const planData = item.astrology_subscription_plans;
        const plan: AstrologySubscriptionPlan | null = planData
          ? {
              ...planData,
              price: Number(planData.price),
              duration_days: Number(planData.duration_days),
            }
          : null;

        deduplicated.push({
          id: item.id,
          customer_id: item.customer_id,
          plan_id: item.plan_id,
          payment_order_id: item.payment_order_id,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          status: item.status,
          created_at: item.created_at,
          plan,
        });
      }
    }

    return deduplicated;
  },

  /**
   * Fetch the active / current astrology subscription for the authenticated customer.
   * Prioritizes the interval that currently grants access over newer pending or future-start records.
   */
  async getCustomerSubscription(customerId?: string): Promise<AstrologySubscription | null> {
    const subscriptions = await this.getCustomerSubscriptions(customerId);
    return selectCurrentSubscription(subscriptions);
  },

  /**
   * Fetch paginated published daily/weekly Vedic astrology content feed.
   * RLS strictly enforces status = 'published' AND publish_at <= now().
   */
  async getPublishedContent(
    page = 1,
    pageSize = 10,
    channel?: AstrologyChannel
  ): Promise<PaginatedAstrologyContent> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("astrology_content")
      .select(
        "id, channel, title, body, publish_at, expires_at, status, created_by, created_at, updated_at",
        { count: "exact" }
      );

    if (channel) {
      query = query.eq("channel", channel);
    }

    const { data, count, error } = await query
      .order("publish_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message || "Failed to load published astrology insights.");
    }

    const totalCount = count || 0;
    const items = (data || []) as AstrologyContent[];

    return {
      items,
      count: totalCount,
      hasMore: to + 1 < totalCount,
    };
  },

  /**
   * Fetch single astrology insight content by ID.
   */
  async getContentById(contentId: string): Promise<AstrologyContent | null> {
    if (!contentId) return null;

    const { data, error } = await supabase
      .from("astrology_content")
      .select(
        "id, channel, title, body, publish_at, expires_at, status, created_by, created_at, updated_at"
      )
      .eq("id", contentId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || `Failed to load astrology content ${contentId}.`);
    }

    return (data as AstrologyContent) || null;
  },

  /**
   * Fetch customer's own astrology delivery journal records.
   * Filtered authoritatively via RLS by subscriber ownership.
   */
  async getCustomerDeliveries(
    page = 1,
    pageSize = 10
  ): Promise<PaginatedAstrologyDeliveries> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from("astrology_deliveries")
      .select(
        `
        id,
        subscription_id,
        content_id,
        channel,
        scheduled_at,
        sent_at,
        status,
        provider_message_id,
        error_message,
        astrology_content (
          id,
          channel,
          title,
          body,
          publish_at,
          expires_at,
          status
        )
      `,
        { count: "exact" }
      )
      .order("scheduled_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message || "Failed to load delivery history.");
    }

    const totalCount = count || 0;
    const deliveries: AstrologyDelivery[] = (data || []).map((row: any) => ({
      id: row.id,
      subscription_id: row.subscription_id,
      content_id: row.content_id,
      channel: row.channel,
      scheduled_at: row.scheduled_at,
      sent_at: row.sent_at,
      status: row.status,
      provider_message_id: row.provider_message_id,
      error_message: row.error_message,
      content: row.astrology_content || null,
    }));

    return {
      deliveries,
      count: totalCount,
      hasMore: to + 1 < totalCount,
    };
  },

  /**
   * Create an authoritative astrology subscription purchase order via database RPC.
   * Derives price and duration strictly from the active plan on the server.
   */
  async createSubscriptionOrder(
    planId: string
  ): Promise<CreateAstrologySubscriptionOrderResult> {
    if (!planId) {
      throw new Error("Plan ID is required to create a subscription order.");
    }

    const { data, error } = await supabase.rpc(
      "create_astrology_subscription_order",
      {
        p_plan_id: planId,
      }
    );

    if (error) {
      throw new Error(
        error.message || "Failed to create astrology subscription order."
      );
    }

    if (!data || typeof data !== "object") {
      throw new Error("Invalid response received from order creation service.");
    }

    if (!data.subscription_id || !data.payment_order_id) {
      throw new Error("Invalid subscription order: missing subscription or payment order identifier.");
    }

    const durationDays = Number(data.duration_days);
    if (
      data.duration_days === undefined ||
      data.duration_days === null ||
      !Number.isInteger(durationDays) ||
      durationDays <= 0
    ) {
      throw new Error(
        `Invalid subscription order: duration snapshot is missing or non-positive (received: ${data.duration_days}).`
      );
    }

    const amount = Number(data.amount);
    if (data.amount === undefined || data.amount === null || isNaN(amount) || amount <= 0) {
      throw new Error(
        `Invalid subscription order: payment amount is invalid or non-positive (received: ${data.amount}).`
      );
    }

    return {
      subscription_id: data.subscription_id,
      payment_order_id: data.payment_order_id,
      amount,
      currency: data.currency || "INR",
      duration_days: durationDays,
      status: data.status,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      is_reused: Boolean(data.is_reused),
    };
  },
};
