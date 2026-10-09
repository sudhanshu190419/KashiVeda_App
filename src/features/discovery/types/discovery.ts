// src/features/discovery/types/discovery.ts

export type ServiceMode = "home" | "temple" | "remote";

export interface PujaCategory {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export interface PujaService {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  default_duration_minutes: number | null;
  allowed_modes: ServiceMode[];
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  category?: {
    id: string;
    name: string;
  } | null;
  starting_price?: number | null;
}

export interface SamagriItem {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price: number;
  is_active?: boolean;
}

export interface SamagriPackageItem {
  quantity: number;
  item: SamagriItem;
}

export interface SamagriPackage {
  id: string;
  puja_service_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  items?: SamagriPackageItem[];
}

export interface PanditPujaOffering {
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
  puja_service?: {
    id: string;
    name: string;
    default_duration_minutes: number | null;
    allowed_modes?: ServiceMode[];
  };
}

export interface PanditSummary {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[] | null;
  public_status: "available" | "unavailable" | "hidden";
  rating_avg: number | null;
  rating_count: number;
  offering_names: string[] | null;
  puja_price: number | null;
  home_price?: number | null;
  temple_price?: number | null;
  remote_price?: number | null;
  distance_km: number | null;
  kundli_enabled: boolean;
  kundli_price: number | null;
}

export interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  pandit_id: string;
  rating: number;
  comment: string | null;
  visibility_status: "published" | "hidden" | "flagged";
  created_at: string;
}
