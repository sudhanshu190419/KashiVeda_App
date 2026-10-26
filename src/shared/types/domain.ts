/**
 * Kashi Veda — Core Domain Types
 *
 * These types mirror the data models that the backend will eventually provide.
 * Until the backend is wired, screens render EmptyState/ErrorState using
 * these types as structural contracts.
 *
 * ZERO MOCK DATA POLICY: No dummy instances of these types should ever
 * be created. They exist solely as type contracts.
 */

import type { BookingStatus, FulfillmentStage } from '../constants/vedic';

// ─── User & Auth ──────────────────────────────────────────────

export type UserRole = 'customer' | 'pandit' | 'guest';

export interface UserProfile {
  id: string;
  role: UserRole;
  fullName: string;
  fullNameHi?: string;
  fullNameEn?: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  preferredLanguage: 'en' | 'hi';
  createdAt: string; // ISO 8601
}

export interface CustomerProfile extends UserProfile {
  role: 'customer';
  astroDefaults?: AstroDefaults;
  familyProfiles: FamilyProfile[];
  savedAddresses: SavedAddress[];
  referralCode?: string;
}

export interface PanditProfile extends UserProfile {
  role: 'pandit';
  isVerified: boolean;
  isOnline: boolean;
  gotraId: string;
  bio: string;
  bioHi: string;
  credentials: PanditCredential[];
  languages: string[];
  languagesHi?: string[];
  languagesEn?: string[];
  ritualPricing: RitualPricing[];
  kundliPricing: KundliPricing[];
  serviceRadiusKm: number;
  averageRating: number;
  totalReviews: number;
  mediaGallery: MediaItem[];
  chantSampleUrl?: string;
  bankDetails?: BankDetails;
}

// ─── Astrology ────────────────────────────────────────────────

export interface AstroDefaults {
  dateOfBirth: string;   // YYYY-MM-DD
  timeOfBirth: string;   // HH:MM
  placeOfBirth: string;  // City name
  latitude: number;
  longitude: number;
}

export interface FamilyProfile {
  id: string;
  name: string;
  relation: string;
  dateOfBirth: string;
  timeOfBirth?: string;
  placeOfBirth?: string;
}

export interface PanchangData {
  date: string;          // YYYY-MM-DD
  tithi: string;
  tithiHi: string;
  nakshatra: string;
  nakshatraHi: string;
  yoga: string;
  yogaHi: string;
  karana: string;
  karanaHi: string;
  sunrise: string;       // HH:MM IST
  sunset: string;        // HH:MM IST
  rahukaalStart: string; // HH:MM IST
  rahukaalEnd: string;   // HH:MM IST
  abhijeetStart: string; // HH:MM IST
  abhijeetEnd: string;   // HH:MM IST
  isAuspicious: boolean;
  festivalName?: string;
  festivalNameHi?: string;
}

export interface KundliChart {
  id: string;
  userId: string;
  name: string;
  dateOfBirth: string;
  timeOfBirth: string;
  placeOfBirth: string;
  chartData: Record<string, unknown>; // Bhava data
  createdAt: string;
  pdfUrl?: string;
}

// ─── Booking & Escrow ─────────────────────────────────────────

export interface Booking {
  id: string;
  customerId: string;
  panditId: string;
  ritualId: string;
  ritualNameEn: string;
  ritualNameHi: string;
  mode: 'remote' | 'temple' | 'home';
  status: BookingStatus;
  fulfillmentStage?: FulfillmentStage;
  scheduledDate?: string;       // YYYY-MM-DD
  scheduledTime?: string;       // HH:MM
  location?: BookingLocation;
  samagriItems: SamagriItem[];
  pricing: BookingPricing;
  createdAt: string;
  updatedAt: string;
}

export interface BookingLocation {
  address: string;
  city: string;
  latitude: number;
  longitude: number;
}

export interface BookingPricing {
  baseDakshinaInr: number;
  samagriTotalInr: number;
  platformFeeInr: number;
  totalInr: number;
  advanceInr: number;       // 50% escrow
  balanceDueInr: number;    // Remaining after advance
  preponeFeeInr?: number;
}

export interface GotraOption {
  id: string;
  nameDevanagari: string;
  nameEnglish: string;
  rishi?: string;
  pravara: string[] | string;
  isUniversalFallback?: boolean;
}

export interface SamagriItem {
  id: string;
  nameEn: string;
  nameHi: string;
  nameEnglish?: string;
  nameHindi?: string;
  quantity: number | string;
  unitEn?: string;
  unitHi?: string;
  priceInr: number;
  price?: number;
  isIncluded?: boolean;
  isClientArranging?: boolean;
}

// ─── Reviews & Reputation ─────────────────────────────────────

export interface Review {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  panditId: string;
  rating: number;   // 1-5
  comment: string;
  commentHi?: string;
  panditReply?: string;
  isPinned: boolean;
  createdAt: string;
}

// ─── Revenue & Payouts ────────────────────────────────────────

export interface EarningsSummary {
  totalEarnedInr: number;
  availableToWithdrawInr: number;
  heldInEscrowInr: number;
  totalDakshinaTipsInr: number;
  nextPayoutDate?: string;
}

export interface LedgerEntry {
  id: string;
  bookingId: string;
  type: 'puja_earning' | 'dakshina_tip' | 'payout' | 'refund_deduction';
  amountInr: number;
  description: string;
  descriptionHi: string;
  createdAt: string;
}

// ─── Pandit Onboarding ────────────────────────────────────────

export interface PanditCredential {
  id: string;
  institutionId: string;
  degreeName: string;
  degreeNameHi: string;
  documentUrl: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
}

export interface RitualPricing {
  ritualId: string;
  ritualNameEn: string;
  ritualNameHi: string;
  basePriceInr: number;
  isCustom: boolean;
}

export interface KundliPricing {
  typeId: string;
  typeNameEn: string;
  typeNameHi: string;
  priceInr: number;
  isCustom: boolean;
}

export interface MediaItem {
  id: string;
  url: string;
  thumbnailUrl: string;
  type: 'image' | 'video';
  caption?: string;
}

export interface BankDetails {
  accountHolderName: string;
  upiId?: string;
  accountNumber?: string;
  ifscCode?: string;
}

// ─── Saved Addresses ──────────────────────────────────────────

export interface SavedAddress {
  id: string;
  label: string;      // e.g. 'Home', 'Office', 'Parents'
  labelHi: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
}

// ─── Subscription ─────────────────────────────────────────────

export interface Subscription {
  id: string;
  userId: string;
  type: 'daily_horoscope' | 'weekly_whatsapp';
  status: 'trial' | 'active' | 'expired' | 'cancelled';
  trialEndsAt?: string;
  expiresAt?: string;
}

// ─── Navigation ───────────────────────────────────────────────

export type CustomerTabRoute = 'home' | 'astrology' | 'profile';
export type PanditTabRoute = 'bookings' | 'profile' | 'revenue' | 'reviews';
