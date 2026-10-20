// src/features/auth/types/auth.ts
import { User, Session } from "@supabase/supabase-js";

export type UserRole = "customer" | "pandit" | "admin" | "super_admin";

export type AppUserMode = "customer" | "pandit";

export interface Profile {
  id: string;
  display_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  preferred_rashi_id?: number | null;
  status?: "active" | "suspended" | "deleted";
  created_at?: string;
  updated_at?: string;
}

export interface PanditProfile {
  id: string;
  user_id: string;
  bio?: string | null;
  experience_years?: number;
  years_experience?: number;
  verification_status: "pending" | "verified" | "approved" | "rejected" | "suspended";
  public_status: "available" | "unavailable" | "currently_unavailable" | "hidden";
  kundli_enabled?: boolean;
  kundli_price?: string | null;
  kundli_turnaround_days?: number | null;
  base_latitude?: number | null;
  base_longitude?: number | null;
  service_radius_km?: number | null;
}

export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: UserRole[];
  role: UserRole | null;
  activeMode: AppUserMode;
  canSwitchToPanditMode: boolean;
  panditProfile: PanditProfile | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: Profile | null) => void;
  setActiveMode: (mode: AppUserMode) => Promise<void>;
  hasRole: (role: UserRole) => boolean;
}
