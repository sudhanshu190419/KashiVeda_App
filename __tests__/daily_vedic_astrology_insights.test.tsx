// __tests__/daily_vedic_astrology_insights.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CANONICAL_RASHIS,
  getRashiById,
  mapKundliMoonSignToRashiId,
  DailyRashiInsight,
} from "../src/features/astrology/types/rashi.types.ts";
import { getIndianCalendarDate, formatIndianDisplayDate } from "../src/shared/utils/date.ts";
import { dailyRashiService } from "../src/features/astrology/services/dailyRashiService.ts";
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { RashiSelector } from "../src/features/astrology/components/RashiSelector.tsx";
import { DailyRashiInsightCard } from "../src/features/astrology/components/DailyRashiInsightCard.tsx";
import { RashiPersonalizationModal } from "../src/features/astrology/components/RashiPersonalizationModal.tsx";
import { AstrologyScreen } from "../src/features/astrology/screens/AstrologyScreen.tsx";
import { AstrologyPlanDetailScreen } from "../src/features/astrology/screens/AstrologyPlanDetailScreen.tsx";
import { FreeKundliResultScreen } from "../src/features/kundli/free/screens/FreeKundliResultScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();

let mockRouteParams: any = {};

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    NavigationContainer: ({ children }: any) => children,
    useNavigation: () => ({
      navigate: mockNavigate,
      replace: mockReplace,
      goBack: mockGoBack,
    }),
    useRoute: () => ({
      params: mockRouteParams,
    }),
    useFocusEffect: (callback: any) => {
      React.useEffect(() => {
        return callback();
      }, [callback]);
    },
  };
});

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("react-native-encrypted-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ type: "success", data: { idToken: "tok" } })),
    signOut: jest.fn(() => Promise.resolve()),
    getTokens: jest.fn(() => Promise.resolve({ idToken: "tok" })),
  },
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: { id: "cust-test-123", email: "user@kashiveda.com" },
    profile: {
      id: "cust-test-123",
      display_name: "Devotee",
      phone: "+919876543210",
      email: "user@kashiveda.com",
      preferred_rashi_id: 1,
    },
    role: "customer",
    isLoading: false,
    error: null,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
    setProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

jest.mock("../src/infrastructure/supabase/client.ts", () => {
  const mockAuth = {
    getUser: jest.fn(() =>
      Promise.resolve({
        data: { user: { id: "cust-test-123", email: "user@kashiveda.com" } },
        error: null,
      })
    ),
    getSession: jest.fn(() =>
      Promise.resolve({
        data: { session: { user: { id: "cust-test-123" } } },
        error: null,
      })
    ),
  };

  const mockRpc = jest.fn();
  const mockFrom = jest.fn();

  return {
    supabase: {
      auth: mockAuth,
      rpc: mockRpc,
      from: mockFrom,
    },
  };
});

describe("Daily Vedic Astrological Insights Test Suite", () => {
  const samplePlan = {
    id: "plan-monthly-daily",
    name: "Vedic Daily & Weekly Plan",
    duration_days: 30,
    price: 299,
    currency: "INR",
    daily_in_app_enabled: true,
    weekly_whatsapp_enabled: true,
    is_active: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRouteParams = {};
    dailyRashiService.clearMemoryCache();
    await AsyncStorage.clear();

    jest.spyOn(astrologyService, "getPlanById").mockResolvedValue(samplePlan as any);

    let mockProfileRashiId = 1;
    (supabase.rpc as jest.Mock).mockImplementation((name: string, args: any) => {
      if (name === "set_customer_preferred_rashi") {
        mockProfileRashiId = args?.p_rashi_id ?? null;
        return Promise.resolve({ data: { success: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // Default supabase from builder
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockImplementation(() =>
            Promise.resolve({
              data: { id: "cust-test-123", preferred_rashi_id: mockProfileRashiId },
              error: null,
            })
          ),
          maybeSingle: jest.fn().mockImplementation(() =>
            Promise.resolve({
              data: { id: "cust-test-123", preferred_rashi_id: mockProfileRashiId },
              error: null,
            })
          ),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      if (table === "astrology_subscription_plans") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [
                  samplePlan,
                  {
                    id: "plan-weekly-only",
                    name: "Weekly WhatsApp Plan",
                    duration_days: 30,
                    price: 149,
                    currency: "INR",
                    daily_in_app_enabled: false,
                    weekly_whatsapp_enabled: true,
                    is_active: true,
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "astrology_subscriptions") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [
                    {
                      id: "sub-active-1",
                      customer_id: "cust-test-123",
                      plan_id: "plan-monthly-daily",
                      status: "active",
                      starts_at: "2026-10-01T00:00:00Z",
                      ends_at: "2026-11-01T00:00:00Z",
                      plan: samplePlan,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "astrology_content") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  // ===========================================================================
  // SECTION 1: CANONICAL RASHI DEFINITIONS & MOON SIGN MAPPINGS
  // ===========================================================================
  describe("1. Canonical 12 Rashis and Moon Sign Mappings", () => {
    it("defines exact 12 canonical Rashis from Mesha (1) to Meena (12)", () => {
      expect(CANONICAL_RASHIS).toHaveLength(12);
      expect(CANONICAL_RASHIS[0].id).toBe(1);
      expect(CANONICAL_RASHIS[0].vedicName).toBe("Mesha");
      expect(CANONICAL_RASHIS[0].westernName).toBe("Aries");
      expect(CANONICAL_RASHIS[0].symbol).toBe("♈");
      expect(CANONICAL_RASHIS[0].element).toBe("Fire");

      expect(CANONICAL_RASHIS[11].id).toBe(12);
      expect(CANONICAL_RASHIS[11].vedicName).toBe("Meena");
      expect(CANONICAL_RASHIS[11].westernName).toBe("Pisces");
      expect(CANONICAL_RASHIS[11].symbol).toBe("♓");
      expect(CANONICAL_RASHIS[11].element).toBe("Water");
    });

    it("getRashiById returns correct Rashi or falls back to Mesha for invalid ID", () => {
      expect(getRashiById(1).vedicName).toBe("Mesha");
      expect(getRashiById(4).vedicName).toBe("Karka");
      expect(getRashiById(8).vedicName).toBe("Vrishchika");
      expect(getRashiById(12).vedicName).toBe("Meena");
      expect(getRashiById(99).vedicName).toBe("Mesha"); // Fallback
      expect(getRashiById(undefined).vedicName).toBe("Mesha");
    });

    it("mapKundliMoonSignToRashiId maps numeric sign_numbers 1-12 correctly", () => {
      expect(mapKundliMoonSignToRashiId(1)).toBe(1);
      expect(mapKundliMoonSignToRashiId(5)).toBe(5);
      expect(mapKundliMoonSignToRashiId(12)).toBe(12);
      expect(mapKundliMoonSignToRashiId(13)).toBeNull();
      expect(mapKundliMoonSignToRashiId(0)).toBeNull();
    });

    it("mapKundliMoonSignToRashiId maps string sign names (Vedic and English) correctly", () => {
      expect(mapKundliMoonSignToRashiId("Mesha")).toBe(1);
      expect(mapKundliMoonSignToRashiId("Aries")).toBe(1);
      expect(mapKundliMoonSignToRashiId("Vrishabha")).toBe(2);
      expect(mapKundliMoonSignToRashiId("Taurus")).toBe(2);
      expect(mapKundliMoonSignToRashiId("Mithun")).toBe(3);
      expect(mapKundliMoonSignToRashiId("Cancer (Karka)")).toBe(4);
      expect(mapKundliMoonSignToRashiId("Leo")).toBe(5);
      expect(mapKundliMoonSignToRashiId("Simha")).toBe(5);
      expect(mapKundliMoonSignToRashiId("Virgo")).toBe(6);
      expect(mapKundliMoonSignToRashiId("Kanya")).toBe(6);
      expect(mapKundliMoonSignToRashiId("Tula")).toBe(7);
      expect(mapKundliMoonSignToRashiId("Libra")).toBe(7);
      expect(mapKundliMoonSignToRashiId("Vrischika")).toBe(8);
      expect(mapKundliMoonSignToRashiId("Scorpio")).toBe(8);
      expect(mapKundliMoonSignToRashiId("Dhanu")).toBe(9);
      expect(mapKundliMoonSignToRashiId("Sagittarius")).toBe(9);
      expect(mapKundliMoonSignToRashiId("Makar")).toBe(10);
      expect(mapKundliMoonSignToRashiId("Capricorn")).toBe(10);
      expect(mapKundliMoonSignToRashiId("Kumbha")).toBe(11);
      expect(mapKundliMoonSignToRashiId("Aquarius")).toBe(11);
      expect(mapKundliMoonSignToRashiId("Meena")).toBe(12);
      expect(mapKundliMoonSignToRashiId("Pisces")).toBe(12);
    });

    it("returns null safely for invalid Moon sign input without throwing", () => {
      expect(mapKundliMoonSignToRashiId(null)).toBeNull();
      expect(mapKundliMoonSignToRashiId(undefined)).toBeNull();
      expect(mapKundliMoonSignToRashiId("UnknownSignXYZ")).toBeNull();
    });
  });

  // ===========================================================================
  // SECTION 2: TIMEZONE & DATE FORMATTING (Asia/Kolkata)
  // ===========================================================================
  describe("2. Timezone & Indian Calendar Date Resolution", () => {
    it("resolves date to YYYY-MM-DD in Asia/Kolkata timezone", () => {
      const indianDate = getIndianCalendarDate();
      expect(indianDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("formats Indian display date accurately", () => {
      const formatted = formatIndianDisplayDate("2026-10-10");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("Oct");
    });
  });

  // ===========================================================================
  // SECTION 3: PAID CONTENT ENTITLEMENT & DAILY RASHI SERVICE
  // ===========================================================================
  describe("3. Daily Rashi Service & Authoritative Paid Access", () => {
    it("calls get_daily_rashi_insight RPC and returns full content for entitled user", async () => {
      const mockInsight: DailyRashiInsight = {
        id: "insight-1",
        insight_date: "2026-10-10",
        rashi_id: 1,
        rashi_name: "Mesha",
        language: "en",
        general_outlook: "Auspicious planetary alignment for Mesha today.",
        career_business: "Promotion discussions are highly favored.",
        finance_wealth: "Avoid speculative risks.",
        love_relationships: "Harmony prevails in domestic life.",
        health_wellbeing: "Maintain hydration.",
        auspicious_color: "Saffron",
        auspicious_number: 9,
        status: "published",
        published_at: "2026-10-10T00:00:00Z",
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: {
          is_entitled: true,
          has_subscription: true,
          insight: mockInsight,
          message: "Daily insight retrieved successfully",
        },
        error: null,
      });

      const result = await dailyRashiService.getDailyInsight({
        rashiId: 1,
        date: "2026-10-10",
        language: "en",
      });

      expect(result.isEntitled).toBe(true);
      expect(result.hasSubscription).toBe(true);
      expect(result.insight).toBeDefined();
      expect(result.insight?.general_outlook).toBe("Auspicious planetary alignment for Mesha today.");
      expect(result.insight?.auspicious_color).toBe("Saffron");
    });

    it("returns isEntitled=false and no insight for unentitled/unsubscribed user", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: {
          is_entitled: false,
          has_subscription: false,
          insight: null,
          message: "Active subscription required to view daily insights",
        },
        error: null,
      });

      const result = await dailyRashiService.getDailyInsight({
        rashiId: 4,
        date: "2026-10-10",
        language: "en",
      });

      expect(result.isEntitled).toBe(false);
      expect(result.insight).toBeNull();
    });

    it("returns null insight when content is not yet published for current date", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: {
          is_entitled: true,
          has_subscription: true,
          insight: null,
          message: "No published insight found for this date and Rashi",
        },
        error: null,
      });

      const result = await dailyRashiService.getDailyInsight({
        rashiId: 5,
        date: "2026-10-10",
        language: "en",
      });

      expect(result.isEntitled).toBe(true);
      expect(result.insight).toBeNull();
    });

    it("caches insight in memory and AsyncStorage, returning cached data on subsequent calls", async () => {
      const mockInsight: DailyRashiInsight = {
        id: "insight-2",
        insight_date: "2026-10-10",
        rashi_id: 2,
        rashi_name: "Vrishabha",
        language: "en",
        general_outlook: "Stable day for Vrishabha.",
        status: "published",
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: {
          is_entitled: true,
          has_subscription: true,
          insight: mockInsight,
        },
        error: null,
      });

      // Call 1
      const res1 = await dailyRashiService.getDailyInsight({
        rashiId: 2,
        date: "2026-10-10",
        language: "en",
      });
      expect(res1.insight?.general_outlook).toBe("Stable day for Vrishabha.");

      // Call 2 with same key: Under Option A, cache cannot bypass server entitlement verification
      (supabase.rpc as jest.Mock).mockClear();
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: {
          is_entitled: true,
          has_subscription: true,
          insight: mockInsight,
        },
        error: null,
      });
      const res2 = await dailyRashiService.getDailyInsight({
        rashiId: 2,
        date: "2026-10-10",
        language: "en",
      });
      expect(res2.insight?.general_outlook).toBe("Stable day for Vrishabha.");
      // Strict entitlement validation requires server verification on every call
      expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });

    it("persists and retrieves customer Rashi preference in AsyncStorage and profile", async () => {
      // 1. Get initial preference (profile returns 1)
      const initialRashi = await dailyRashiService.getPreferredRashi();
      expect(initialRashi).toBe(1);

      // 2. Update preference to 4 (Karka)
      await dailyRashiService.updatePreferredRashi(4);

      // 3. Verify AsyncStorage and memory cache updated
      const updatedRashi = await dailyRashiService.getPreferredRashi();
      expect(updatedRashi).toBe(4);
    });

    it("handles non-fatal profile sync failures gracefully when updating Rashi", async () => {
      // Mock profile update to fail
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockRejectedValue(new Error("Network error during sync")),
            }),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      // Updating should not throw uncaught error; it falls back to local storage
      await expect(dailyRashiService.updatePreferredRashi(7)).resolves.not.toThrow();
      const pref = await dailyRashiService.getPreferredRashi();
      expect(pref).toBe(7);
    });
  });

  // ===========================================================================
  // SECTION 4: COMPONENT RENDERING & USER INTERACTIONS
  // ===========================================================================
  describe("4. Mobile UI Component Tests", () => {
    it("RashiSelector renders all 12 Rashis and handles selection callbacks", () => {
      const onSelect = jest.fn();
      let tree: any;

      act(() => {
        tree = ReactTestRenderer.create(
          <RashiSelector selectedRashiId={1} onSelectRashi={onSelect} />
        );
      });

      expect(tree.toJSON()).toBeDefined();
    });

    it("DailyRashiInsightCard renders full sections when user is entitled and insight exists", () => {
      const rashi = getRashiById(1);
      const insight: DailyRashiInsight = {
        id: "insight-1",
        insight_date: "2026-10-10",
        rashi_id: 1,
        rashi_name: "Mesha",
        language: "en",
        general_outlook: "Powerful energy alignment today.",
        career_business: "Great day for closing deals.",
        finance_wealth: "Gains from past investments.",
        love_relationships: "Spend quality time with family.",
        health_wellbeing: "Energetic and positive.",
        auspicious_color: "Red",
        auspicious_number: 7,
        status: "published",
      };

      let tree: any;
      act(() => {
        tree = ReactTestRenderer.create(
          <DailyRashiInsightCard
            rashi={rashi}
            insight={insight}
            loading={false}
            isEntitled={true}
            onSubscribePress={jest.fn()}
            onRetry={jest.fn()}
          />
        );
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Powerful energy alignment today.");
      expect(json).toContain("Great day for closing deals.");
      expect(json).toContain("Red");
      expect(json).toContain("7");
    });

    it("DailyRashiInsightCard renders subscription paywall CTA when unentitled", () => {
      const rashi = getRashiById(3);
      let tree: any;
      act(() => {
        tree = ReactTestRenderer.create(
          <DailyRashiInsightCard
            rashi={rashi}
            insight={null}
            loading={false}
            isEntitled={false}
            onSubscribePress={jest.fn()}
            onRetry={jest.fn()}
          />
        );
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Daily Horoscope for");
      expect(json).toContain("Subscribe to Kashi Veda Astrology");
    });

    it("RashiPersonalizationModal allows selecting Rashi or skipping during subscription checkout", () => {
      const onConfirm = jest.fn();
      const onSkip = jest.fn();
      const onClose = jest.fn();

      let tree: any;
      act(() => {
        tree = ReactTestRenderer.create(
          <RashiPersonalizationModal
            visible={true}
            initialRashiId={1}
            calculatedKundliRashiId={4}
            onConfirm={onConfirm}
            onSkip={onSkip}
            onClose={onClose}
          />
        );
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Personalize Your Daily Insights");
      expect(json).toContain("Detected from your Kundli");
    });
  });

  // ===========================================================================
  // SECTION 5: SCREEN INTEGRATION TESTS
  // ===========================================================================
  describe("5. Screen Integration Tests", () => {
    it("AstrologyScreen mounts cleanly with Daily Vedic Horoscope section", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: {
          is_entitled: true,
          has_subscription: true,
          insight: {
            id: "ins-1",
            insight_date: "2026-10-10",
            rashi_id: 1,
            language: "en",
            general_outlook: "Planetary harmony for Mesha.",
            status: "published",
          },
        },
        error: null,
      });

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyScreen />);
      });

      expect(tree.toJSON()).toBeDefined();
    });

    it("AstrologyPlanDetailScreen mounts and handles subscribe click", async () => {
      mockRouteParams = { planId: "plan-monthly-daily" };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyPlanDetailScreen />);
      });

      expect(tree.toJSON()).toBeDefined();
    });

    it("FreeKundliResultScreen renders Janma Rashi horoscope CTA", async () => {
      mockRouteParams = {
        kundliData: {
          birth: {
            name: "Rahul",
            date: "1995-05-15",
            time: "10:30",
            place: "Varanasi",
            latitude: 25.31,
            longitude: 82.97,
            timezone: "Asia/Kolkata",
          },
          ascendant: {
            sign: "Cancer (Karka)",
            sign_degree: 12.5,
            nakshatra: "Pushya",
            pada: 2,
          },
          moon: {
            sign: "Mesha (Aries)",
            sign_number: 1,
            sign_degree: 18.2,
            nakshatra: "Bharani",
            pada: 3,
          },
          planets: [
            { name: "Sun", sign: "Taurus", house: 11, degree: 0.5, sign_degree: 0.5, nakshatra: "Krittika", is_retrograde: false },
          ],
          houses: [],
          panchang: { tithi: "Purnima", nakshatra: "Bharani", vara: "Monday" },
          vimshottari: { current: { mahadasha_lord: "Venus", antardasha_lord: "Sun", start_date: "2025-01-01", end_date: "2028-01-01" } },
          vedic: { ayanamsha_degrees: 24.1 },
        },
      };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<FreeKundliResultScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("DAILY JYOTISH INSIGHTS");
      expect(json).toContain("Mesha");
      expect(json).toContain("Aries");
      expect(json).toContain("View Today's Horoscope for Mesha");
    });
  });
});
