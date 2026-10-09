// src/features/pandit/types/temple.types.ts

export type PanditTempleAssociationStatus = "pending" | "approved" | "rejected";

export interface PanditTempleAssociation {
  id: string;
  pandit_id: string;
  temple_id: string;
  status: PanditTempleAssociationStatus;
  is_active: boolean;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  temple?: {
    id: string;
    name: string;
    address?: string | null;
    city: string;
    state?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

export interface TempleAdditionRequest {
  id: string;
  pandit_id: string;
  name: string;
  address?: string | null;
  city: string;
  state: string;
  status: PanditTempleAssociationStatus;
  rejection_reason?: string | null;
  created_temple_id?: string | null;
  created_at: string;
}

export interface RequestNewTempleParams {
  name: string;
  address?: string;
  city: string;
  state?: string;
}
