// src/features/astrology/types/astrology.types.ts

export type AstrologyChannel = "in_app" | "whatsapp";

export type AstrologyContentStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "cancelled";

export type AstrologySubscriptionStatus =
  | "payment_pending"
  | "active"
  | "expired"
  | "cancelled";

export interface CreateAstrologySubscriptionOrderResult {
  subscription_id: string;
  payment_order_id: string;
  amount: number;
  currency: string;
  status: AstrologySubscriptionStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  is_reused?: boolean;
}

export type AstrologyDeliveryStatus =
  | "queued"
  | "sent"
  | "failed"
  | "skipped";

export interface AstrologySubscriptionPlan {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  currency: string;
  daily_in_app_enabled: boolean;
  weekly_whatsapp_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AstrologySubscription {
  id: string;
  customer_id: string;
  plan_id: string;
  payment_order_id: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  status: AstrologySubscriptionStatus;
  created_at: string;
  plan?: AstrologySubscriptionPlan | null;
}

export interface AstrologyContent {
  id: string;
  channel: AstrologyChannel;
  title: string | null;
  body: string;
  publish_at: string;
  expires_at: string | null;
  status: AstrologyContentStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AstrologyDelivery {
  id: string;
  subscription_id: string;
  content_id: string;
  channel: AstrologyChannel;
  scheduled_at: string;
  sent_at: string | null;
  status: AstrologyDeliveryStatus;
  provider_message_id: string | null;
  error_message: string | null;
  content?: AstrologyContent | null;
}

export interface PaginatedAstrologyContent {
  items: AstrologyContent[];
  count: number;
  hasMore: boolean;
}

export interface PaginatedAstrologyDeliveries {
  deliveries: AstrologyDelivery[];
  count: number;
  hasMore: boolean;
}
