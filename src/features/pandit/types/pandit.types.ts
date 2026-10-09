// src/features/pandit/types/pandit.types.ts
import { BookingStatus, LineItemType } from "../../booking/types/booking.types.ts";
import { ServiceMode } from "../../discovery/types/discovery.ts";

export type PanditVerificationStatus = "pending" | "verified" | "rejected" | "approved";
export type PanditPublicStatus = "available" | "unavailable" | "hidden" | "currently_unavailable";

export interface PanditProfile {
  id: string;
  user_id: string;
  verification_status: PanditVerificationStatus;
  bio: string | null;
  years_experience: number | null;
  languages: string[] | null;
  base_latitude: number | null;
  base_longitude: number | null;
  service_radius_km: number | null;
  public_status: PanditPublicStatus;
  kundli_enabled?: boolean;
  kundli_price?: number | null;
  kundli_turnaround_days?: number | null;
  onboarding_completed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  display_name?: string;
  phone?: string;
  avatar_url?: string | null;
}

export interface PanditAvailabilityRule {
  id: string;
  pandit_id: string;
  day_of_week: number; // 0 = Sun, 6 = Sat
  start_time: string; // "HH:MM:SS" or "HH:MM"
  end_time: string; // "HH:MM:SS" or "HH:MM"
  timezone: string;
  is_active: boolean;
  created_at?: string;
}

export interface PanditUnavailabilityBlock {
  id: string;
  pandit_id: string;
  starts_at: string; // ISO timestamptz
  ends_at: string; // ISO timestamptz
  reason: string | null;
  created_at?: string;
}

export interface PanditPujaServiceOffering {
  id: string;
  pandit_id: string;
  puja_service_id: string;
  price: number;
  home_price?: number | null;
  temple_price?: number | null;
  remote_price?: number | null;
  currency: string;
  duration_minutes: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  puja_service?: {
    id: string;
    name: string;
    description: string | null;
    default_duration_minutes: number;
    starting_price?: number;
    allowed_modes?: ServiceMode[];
  };
}

export interface PanditBookingServiceLocation {
  id?: string;
  booking_id: string;
  location_type: ServiceMode;
  address_snapshot?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  temple_name_snapshot?: string | null;
  special_instructions?: string | null;
}

export interface PanditBookingLineItem {
  id: string;
  booking_id: string;
  item_type: LineItemType;
  reference_id?: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_refundable: boolean;
}

export interface PanditBookingItem {
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
  advance_amount: number;
  balance_amount: number;
  total_amount: number;
  reschedule_count: number;
  confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  puja_service?: {
    id: string;
    name: string;
    description?: string | null;
    default_duration_minutes?: number;
  };
  customer?: {
    id: string;
    display_name: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  location?: PanditBookingServiceLocation;
  line_items?: PanditBookingLineItem[];
  payout?: PanditPayoutItem | null;
}

export interface PanditDashboardSummary {
  pandit: PanditProfile | null;
  todayBookingsCount: number;
  upcomingBookingsCount: number;
  completedBookingsCount: number;
  nextBooking: PanditBookingItem | null;
  todayBookings: PanditBookingItem[];
  verifiedBankAccount: boolean;
}

export interface LiveSessionCredentials {
  token: string;
  room_name: string;
  server_url: string;
  expires_at: string;
}

export type PanditPayoutStatus =
  | "pending"
  | "approved"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled";

export interface PanditEarningsSummary {
  pandit_id: string;
  total_gross: number;
  total_platform_fee: number;
  net_earnings: number;
  paid_payouts: number;
  pending_payouts: number;
  failed_payouts: number;
  completed_service_gross: number;
  completed_kundli_gross: number;
}

export interface PanditPayoutItem {
  id: string;
  pandit_id: string;
  booking_id: string | null;
  kundli_order_id: string | null;
  bank_account_id: string;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  status: PanditPayoutStatus;
  provider_payout_id: string | null;
  payment_method?: string | null;
  transaction_reference?: string | null;
  proof_document_path?: string | null;
  signed_proof_url?: string | null;
  confirmed_at?: string | null;
  notes?: string | null;
  released_at: string | null;
  created_at: string;
  booking?: {
    id: string;
    booking_number: string;
    status: string;
    service_mode: string;
    scheduled_start_at: string;
    puja_service?: {
      id: string;
      name: string;
    } | null;
  } | null;
  kundli_order?: {
    id: string;
    order_number: string;
    status: string;
    customer?: {
      display_name?: string | null;
    } | null;
    customer_name?: string | null;
    report_type?: string | null;
  } | null;
  bank_account?: {
    id: string;
    bank_name: string | null;
    ifsc_code: string;
    account_holder_name: string;
  } | null;
}

export type BankAccountVerificationStatus = "pending" | "verified" | "rejected";

export interface SelectedBankDocument {
  uri: string;
  name: string;
  type: string;
  size: number;
  arrayBuffer?: ArrayBuffer;
}

export interface PanditBankAccountDetails {
  id: string;
  pandit_id: string;
  account_holder_name: string;
  bank_name: string | null;
  ifsc_code: string;
  upi_id: string | null;
  masked_account_number: string;
  verification_status: BankAccountVerificationStatus;
  is_default: boolean;
  verification_document_path?: string | null;
  verification_document_type?: string | null;
  verification_document_uploaded_at?: string | null;
  pandit_confirmed_at?: string | null;
  verified_at: string | null;
  created_at: string;
  rejection_reason?: string | null;
}

export interface SubmitBankAccountParams {
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  upi_id?: string | null;
  verification_document_path?: string | null;
  verification_document_type?: string;
}

export interface SubmitBankAccountResponse {
  success: boolean;
  bank_account_id: string;
  pandit_id?: string;
  account_holder_name?: string;
  bank_name?: string;
  ifsc_code?: string;
  upi_id?: string | null;
  masked_account_number: string;
  verification_document_path?: string;
  verification_status?: BankAccountVerificationStatus;
  pandit_confirmed_at?: string | null;
}

export interface ConfirmBankAccountResponse {
  success: boolean;
  bank_account_id: string;
  pandit_id: string;
  pandit_confirmed_at: string;
}

