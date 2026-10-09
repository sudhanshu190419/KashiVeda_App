// src/features/kundli/types/kundli.types.ts

export type KundliOrderStatus =
  | "draft"
  | "payment_pending"
  | "paid"
  | "in_progress"
  | "document_uploaded"
  | "customer_confirmed"
  | "cancelled"
  | "disputed"
  | "completed";

export interface KundliDocument {
  id: string;
  kundli_order_id: string;
  version_number: number;
  storage_path: string;
  file_name?: string | null;
  uploaded_by: string;
  uploaded_at: string;
  is_current: boolean;
}

export interface KundliPandit {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  experience_years?: number | null;
  languages?: string[] | null;
  kundli_enabled: boolean;
  kundli_price: number;
  kundli_turnaround_days?: number | null;
  verification_status: string;
  public_status: string;
}

export interface KundliOrder {
  id: string;
  order_number: string;
  customer_id: string;
  pandit_id: string;
  price: number;
  currency: string;
  date_of_birth: string;
  time_of_birth: string;
  place_of_birth: string;
  birth_latitude?: number | null;
  birth_longitude?: number | null;
  additional_notes?: string | null;
  status: KundliOrderStatus;
  customer_confirmed_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  pandit?: {
    id: string;
    display_name?: string;
    avatar_url?: string | null;
    bio?: string | null;
    experience_years?: number | null;
    languages?: string[] | null;
    kundli_price?: number;
    kundli_turnaround_days?: number | null;
  };
  customer?: {
    id: string;
    display_name?: string;
    phone?: string;
    email?: string;
    avatar_url?: string | null;
  };
  current_document?: KundliDocument | null;
  documents?: KundliDocument[];
}

export interface CreateKundliOrderParams {
  pandit_id: string;
  date_of_birth: string;
  time_of_birth: string;
  place_of_birth: string;
  birth_latitude?: number | null;
  birth_longitude?: number | null;
  additional_notes?: string | null;
}

export interface CreateKundliOrderResult {
  kundli_order_id: string;
  order_number: string;
  status: string;
  price: number;
  payment_order_id: string;
}

export interface ConfirmKundliPayoutResult {
  status: "completed" | "already_completed";
  kundli_order_id: string;
  customer_confirmed_at?: string;
  completed_at?: string;
  payout_id?: string;
  payout_amount?: number;
}
