// src/features/kundli/types/kundliProfile.types.ts

export type KundliRelation =
  | "self"
  | "spouse"
  | "son"
  | "daughter"
  | "father"
  | "mother"
  | "brother"
  | "sister"
  | "other";

export interface KundliProfile {
  id: string;
  name: string;
  relation: KundliRelation;
  dateOfBirth: string;
  timeOfBirth?: string;
  timeUnknown?: boolean;
  placeOfBirth: string;
  gotra?: string;
  rashi?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveKundliProfileInput {
  name: string;
  relation: KundliRelation;
  dateOfBirth: string;
  timeOfBirth?: string;
  timeUnknown?: boolean;
  placeOfBirth: string;
  gotra?: string;
  rashi?: string;
}
