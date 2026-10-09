// src/features/kundli/free/types/freeKundli.types.ts

export interface FreeKundliRequest {
  name?: string;
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:MM or HH:MM:SS
  birthPlace: string;
  latitude?: number;
  longitude?: number;
  timezone?: string; // e.g. "Asia/Kolkata"
}

export interface PlanetPosition {
  name: string;
  sanskrit_name?: string;
  longitude: number; // 0.0 - 360.0
  sign: string;
  sign_number: number; // 1 - 12
  sign_degree: number; // 0.0 - 30.0
  nakshatra: string;
  nakshatra_number?: number;
  pada: number; // 1 - 4
  nakshatra_lord?: string;
  house: number; // 1 - 12
  is_retrograde: boolean;
  speed?: number;
  d9_sign?: string;
}

export interface HouseData {
  house: number; // 1 - 12
  house_number?: number;
  sign: string;
  sign_number: number;
  span_degrees?: string;
  occupants?: string[];
}

export interface VimshottariSubPeriod {
  lord: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface VimshottariMahadasha {
  lord?: string;
  planet?: string;
  start_date: string;
  end_date: string;
  duration_years?: number;
  is_current?: boolean;
  is_active?: boolean;
  antardashas?: VimshottariSubPeriod[];
}

export interface ActiveDashaSummary {
  mahadasha_lord: string;
  antardasha_lord: string;
  start_date: string;
  end_date: string;
}

export interface AscendantData {
  longitude: number;
  sign: string;
  sign_number: number;
  sign_degree: number;
  nakshatra: string;
  nakshatra_number?: number;
  pada: number;
  nakshatra_lord?: string;
  d9_sign?: string;
}

export interface MoonData {
  name?: string;
  sanskrit_name?: string;
  sign: string;
  sign_number: number;
  sign_degree: number;
  longitude?: number;
  house?: number;
  nakshatra: string;
  nakshatra_number?: number;
  pada: number;
  nakshatra_lord?: string;
  is_retrograde?: boolean;
  speed?: number;
  d9_sign?: string;
}

export interface PanchangData {
  tithi: string;
  tithi_number?: number;
  paksha?: string;
  nakshatra: string;
  nakshatra_number?: number;
  vara: string;
  vara_number?: number;
  yoga?: string;
  yoga_number?: number;
  karana?: string;
  karana_number?: number;
}

export interface FreeKundliResponse {
  engine: {
    name: string;
    version: string;
    calculationVersion: string;
  };
  birth: {
    name?: string;
    date: string;
    time: string;
    place: string;
    latitude: number;
    longitude: number;
    timezone: string;
    utc: string;
    julian_day?: number;
  };
  vedic: {
    ayanamsha: string;
    ayanamsha_degrees: number;
    zodiac: string;
    houseSystem: string;
    nodeMode: string;
  };
  ascendant: AscendantData;
  moon: MoonData;
  planets: PlanetPosition[];
  houses: HouseData[];
  panchang: PanchangData;
  vimshottari: {
    starting_lord?: string;
    current_mahadasha?: string;
    balance_at_birth_years?: number;
    current?: ActiveDashaSummary | null;
    mahadashas: VimshottariMahadasha[];
  };
}
