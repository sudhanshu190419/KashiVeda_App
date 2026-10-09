// src/features/booking/types/booking.types.ts
import { ServiceMode } from "../../discovery/types/discovery.ts";

export type BookingStatus =
  | "payment_pending"
  | "confirmed"
  | "upcoming"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "disputed";

export type PaymentOrderStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export type PaymentOrderPurpose =
  | "booking_advance"
  | "booking_balance"
  | "samagri"
  | "kundli"
  | "subscription"
  | "prepone_fee"
  | "live_service"
  | "other";

export type LineItemType =
  | "puja"
  | "samagri_package"
  | "samagri_item"
  | "prasad"
  | "custom_fee"
  | "other";

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  pincode?: string | null;
  latitude: number;
  longitude: number;
  is_default: boolean;
  created_at?: string;
}

export interface Temple {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active: boolean;
  created_at?: string;
}

export interface PrasadItem {
  id: string;
  name: string;
  description?: string | null;
  unit_price: number;
  is_active: boolean;
}

export interface AvailabilityRule {
  id: string;
  pandit_id: string;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  start_time: string;  // "08:00:00"
  end_time: string;    // "18:00:00"
  timezone: string;
  is_active: boolean;
}

export interface UnavailabilityBlock {
  id: string;
  pandit_id: string;
  starts_at: string;
  ends_at: string;
  reason?: string | null;
}

export interface BookingLineItem {
  id: string;
  booking_id: string;
  item_type: LineItemType;
  samagri_package_id?: string | null;
  samagri_item_id?: string | null;
  prasad_item_id?: string | null;
  name_snapshot: string;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_refundable: boolean;
}

export interface BookingServiceLocation {
  booking_id: string;
  location_type: ServiceMode;
  address_id?: string | null;
  address_snapshot?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  temple_id?: string | null;
  temple_name_snapshot?: string | null;
}

export interface Booking {
  id: string;
  booking_number: string;
  customer_id: string;
  pandit_id: string;
  puja_service_id: string;
  service_mode: ServiceMode;
  status: BookingStatus;
  scheduled_start_at: string;
  scheduled_end_at: string;
  price_snapshot: number;
  currency: string;
  advance_percent: number;
  advance_amount: number;
  balance_amount: number;
  total_amount: number;
  reschedule_count: number;
  confirmed_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingDetail extends Booking {
  puja_service?: {
    id: string;
    name: string;
    description?: string | null;
    default_duration_minutes?: number | null;
  } | null;
  pandit?: {
    id: string;
    display_name: string;
    avatar_url?: string | null;
    phone?: string | null;
  } | null;
  location?: BookingServiceLocation | null;
  line_items?: BookingLineItem[];
  outstanding_balance?: number;
  total_paid?: number;
  net_paid?: number;
  total_refunded?: number;
}

export interface CreateBookingParams {
  pandit_id: string;
  puja_service_id: string;
  service_mode: ServiceMode;
  scheduled_start_at: string; // ISO 8601 string
  address_id?: string | null;
  temple_id?: string | null;
  samagri_package_id?: string | null;
  custom_samagri_item_ids?: string[] | null;
  custom_samagri_quantities?: number[] | null;
  prasad_item_ids?: string[] | null;
  prasad_quantities?: number[] | null;
}

export interface CreateBookingResponse {
  booking_id: string;
  booking_number: string;
  status: BookingStatus;
  scheduled_start_at: string;
  scheduled_end_at: string;
  total_amount: number;
  advance_amount: number;
  balance_amount: number;
  puja_price: number;
  samagri_total: number;
  prasad_total: number;
  payment_order_id: string;
}

export interface RazorpayOrderResponse {
  success: boolean;
  razorpay_order_id: string;
  amount: number; // in paise
  currency: string;
  key_id: string;
}

export interface LiveSessionCredentials {
  token: string;
  server_url: string;
  session_id?: string;
  room_name: string;
  expires_at?: string;
}

export interface BalancePaymentOrderResponse {
  payment_order_id: string;
  booking_id: string;
  booking_number: string;
  purpose: "booking_balance";
  amount: number;
  currency: string;
  due_at: string;
  status: string;
}

export interface BookingBalanceCalculation {
  booking_id: string;
  total_amount: number;
  total_paid: number;
  total_refunded: number;
  net_paid: number;
  outstanding_balance: number;
}

export interface CancellationRefundPreview {
  booking_id: string;
  is_cancellable: boolean;
  hours_before: number | null;
  total_captured: number;
  already_refunded: number;
  net_captured: number;
  refundable_base: number;
  refund_percent: number;
  refund_amount: number;
  deduction_amount: number;
  policy_name: string;
}

export interface CancellationResult {
  status: "cancelled";
  cancellation_id: string;
  total_captured: number;
  already_refunded: number;
  net_captured: number;
  refund_base_amount: number;
  refund_percent: number;
  refund_amount: number;
  deduction_amount: number;
}

export interface PanditCancellationResult {
  status: "cancelled" | "already_cancelled";
  cancellation_id?: string;
  booking_id: string;
  total_captured?: number;
  already_refunded?: number;
  net_captured?: number;
  refund_amount?: number;
  deduction_amount?: number;
  message: string;
}

export interface RescheduleResult {
  status: "rescheduled";
  reschedule_request_id: string;
  booking_id: string;
  old_start_at: string;
  new_start_at: string;
  new_end_at: string;
  fee_amount: number;
  reschedule_count: number;
  balance_due_at?: string;
}

