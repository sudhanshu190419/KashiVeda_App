// src/features/astrology/services/astrologyService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import {
  AstrologyChannel,
  AstrologyContent,
  AstrologyDelivery,
  AstrologySubscription,
  AstrologySubscriptionPlan,
  CreateAstrologySubscriptionOrderResult,
  PaginatedAstrologyContent,
  PaginatedAstrologyDeliveries,
} from "../types/astrology.types.ts";

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
      .order("price", { ascending: true });

    if (error) {
      throw new Error(error.message || "Failed to load astrology subscription plans.");
    }

    return (data || []).map((row: any) => ({
      ...row,
      price: Number(row.price),
      duration_days: Number(row.duration_days),
    }));
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
   * Fetch the active / current astrology subscription for the authenticated customer.
   * Authoritatively bounded by RLS (customer_id = auth.uid()).
   */
  async getCustomerSubscription(customerId?: string): Promise<AstrologySubscription | null> {
    let query = supabase
      .from("astrology_subscriptions")
      .select(
        `
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
      `
      );

    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load customer subscription.");
    }

    if (!data) return null;

    const planData = (data as any).astrology_subscription_plans;
    const plan: AstrologySubscriptionPlan | null = planData
      ? {
          ...planData,
          price: Number(planData.price),
          duration_days: Number(planData.duration_days),
        }
      : null;

    return {
      id: data.id,
      customer_id: data.customer_id,
      plan_id: data.plan_id,
      payment_order_id: data.payment_order_id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      status: data.status,
      created_at: data.created_at,
      plan,
    };
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

    return {
      subscription_id: data.subscription_id,
      payment_order_id: data.payment_order_id,
      amount: Number(data.amount),
      currency: data.currency,
      status: data.status,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      is_reused: data.is_reused,
    };
  },
};
