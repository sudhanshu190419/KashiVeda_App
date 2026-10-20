// src/features/astrology/types/rashi.types.ts

export interface RashiDefinition {
  id: number; // 1 - 12
  vedicName: string; // e.g. "Mesha"
  westernName: string; // e.g. "Aries"
  fullName: string; // e.g. "Mesha (Aries)"
  sanskritName: string; // e.g. "मेष"
  symbol: string; // e.g. "♈"
  element: "Fire" | "Earth" | "Air" | "Water";
  ruler: string; // e.g. "Mars (Mangala)"
}

export const CANONICAL_RASHIS: RashiDefinition[] = [
  {
    id: 1,
    vedicName: "Mesha",
    westernName: "Aries",
    fullName: "Mesha (Aries)",
    sanskritName: "मेष",
    symbol: "♈",
    element: "Fire",
    ruler: "Mars (Mangala)",
  },
  {
    id: 2,
    vedicName: "Vrishabha",
    westernName: "Taurus",
    fullName: "Vrishabha (Taurus)",
    sanskritName: "वृषभ",
    symbol: "♉",
    element: "Earth",
    ruler: "Venus (Shukra)",
  },
  {
    id: 3,
    vedicName: "Mithuna",
    westernName: "Gemini",
    fullName: "Mithuna (Gemini)",
    sanskritName: "मिथुन",
    symbol: "♊",
    element: "Air",
    ruler: "Mercury (Budha)",
  },
  {
    id: 4,
    vedicName: "Karka",
    westernName: "Cancer",
    fullName: "Karka (Cancer)",
    sanskritName: "कर्क",
    symbol: "♋",
    element: "Water",
    ruler: "Moon (Chandra)",
  },
  {
    id: 5,
    vedicName: "Simha",
    westernName: "Leo",
    fullName: "Simha (Leo)",
    sanskritName: "सिंह",
    symbol: "♌",
    element: "Fire",
    ruler: "Sun (Surya)",
  },
  {
    id: 6,
    vedicName: "Kanya",
    westernName: "Virgo",
    fullName: "Kanya (Virgo)",
    sanskritName: "कन्या",
    symbol: "♍",
    element: "Earth",
    ruler: "Mercury (Budha)",
  },
  {
    id: 7,
    vedicName: "Tula",
    westernName: "Libra",
    fullName: "Tula (Libra)",
    sanskritName: "तुला",
    symbol: "♎",
    element: "Air",
    ruler: "Venus (Shukra)",
  },
  {
    id: 8,
    vedicName: "Vrishchika",
    westernName: "Scorpio",
    fullName: "Vrishchika (Scorpio)",
    sanskritName: "वृश्चिक",
    symbol: "♏",
    element: "Water",
    ruler: "Mars (Mangala)",
  },
  {
    id: 9,
    vedicName: "Dhanu",
    westernName: "Sagittarius",
    fullName: "Dhanu (Sagittarius)",
    sanskritName: "धनु",
    symbol: "♐",
    element: "Fire",
    ruler: "Jupiter (Guru)",
  },
  {
    id: 10,
    vedicName: "Makara",
    westernName: "Capricorn",
    fullName: "Makara (Capricorn)",
    sanskritName: "मकर",
    symbol: "♑",
    element: "Earth",
    ruler: "Saturn (Shani)",
  },
  {
    id: 11,
    vedicName: "Kumbha",
    westernName: "Aquarius",
    fullName: "Kumbha (Aquarius)",
    sanskritName: "कुम्भ",
    symbol: "♒",
    element: "Air",
    ruler: "Saturn (Shani)",
  },
  {
    id: 12,
    vedicName: "Meena",
    westernName: "Pisces",
    fullName: "Meena (Pisces)",
    sanskritName: "मीन",
    symbol: "♓",
    element: "Water",
    ruler: "Jupiter (Guru)",
  },
];

/**
 * Returns RashiDefinition by ID (1 - 12), with safe fallback to Mesha (1).
 */
export function getRashiById(rashiId: number | null | undefined): RashiDefinition {
  if (!rashiId || rashiId < 1 || rashiId > 12) return CANONICAL_RASHIS[0];
  return CANONICAL_RASHIS.find((r) => r.id === rashiId) || CANONICAL_RASHIS[0];
}

/**
 * Maps free Kundli calculation output (sign string or sign number) to canonical Rashi ID (1 - 12).
 */
export function mapKundliMoonSignToRashiId(
  moonInput?: string | number | { sign?: string; sign_number?: number } | null
): number | null {
  if (!moonInput) return null;

  if (typeof moonInput === "number") {
    if (moonInput >= 1 && moonInput <= 12) return moonInput;
    return null;
  }

  if (typeof moonInput === "object") {
    if (typeof moonInput.sign_number === "number" && moonInput.sign_number >= 1 && moonInput.sign_number <= 12) {
      return moonInput.sign_number;
    }
    if (moonInput.sign) {
      return mapKundliMoonSignToRashiId(moonInput.sign);
    }
    return null;
  }

  const str = String(moonInput).toLowerCase().trim();

  // Common Hindi/Vedic variations & abbreviations
  if (str.includes("mithun")) return 3;
  if (str.includes("makar")) return 10;
  if (str.includes("vrischika") || str.includes("vrishchik")) return 8;
  if (str.includes("vrishabh")) return 2;
  if (str.includes("kumbh")) return 11;
  if (str.includes("meen")) return 12;

  for (const rashi of CANONICAL_RASHIS) {
    const vName = rashi.vedicName.toLowerCase();
    const wName = rashi.westernName.toLowerCase();
    if (
      str === String(rashi.id) ||
      str.includes(vName) ||
      str.includes(wName) ||
      vName.startsWith(str) ||
      wName.startsWith(str)
    ) {
      return rashi.id;
    }
  }

  return null;
}

export interface DailyRashiInsight {
  id: string;
  insight_date: string; // YYYY-MM-DD
  rashi_id: number; // 1 - 12
  rashi_name: string;
  language: string;
  general_outlook: string;
  career_business?: string | null;
  finance_wealth?: string | null;
  love_relationships?: string | null;
  health_wellbeing?: string | null;
  auspicious_color?: string | null;
  auspicious_number?: number | null;
  status: "draft" | "scheduled" | "published" | "cancelled";
  published_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DailyRashiInsightResult {
  success: boolean;
  is_entitled: boolean;
  is_unverified?: boolean;
  content: DailyRashiInsight | null;
  insight_date?: string;
  rashi_id?: number;
  language?: string;
  error?: string;
  message?: string;
}

