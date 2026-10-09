// src/features/pandit/types/application.ts

export type PanditApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected";

export type PanditApplicationDocumentType =
  | "identity_proof"
  | "vedic_qualification"
  | "other";

export interface PanditApplicationDocument {
  document_type: PanditApplicationDocumentType;
  storage_path: string;
  original_name?: string;
  uploaded_at: string;
}

export interface ServiceModePrices {
  home?: number | null;
  temple?: number | null;
  remote?: number | null;
}

export interface PanditApplication {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
  bio?: string | null;
  years_experience: number;
  languages: string[];
  vedic_tradition?: string | null;
  primary_city: string;
  base_address?: string | null;
  base_latitude?: number | null;
  base_longitude?: number | null;
  service_radius_km: number;
  selected_puja_ids: string[];
  puja_prices?: Record<string, ServiceModePrices | number>;
  kundli_enabled?: boolean;
  kundli_price?: number | null;
  kundli_turnaround_days?: number | null;
  service_modes: string[];
  selected_temple_ids?: string[];
  documents: PanditApplicationDocument[];
  status: PanditApplicationStatus;
  rejection_reason?: string | null;
  review_notes?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailablePujaService {
  id: string;
  name: string;
  description?: string | null;
  default_duration_minutes: number;
  allowed_modes: string[];
  category_name?: string;
}
