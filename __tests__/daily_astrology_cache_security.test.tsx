// __tests__/daily_astrology_cache_security.test.ts
/**
 * AST-02 Regression Test Suite:
 * Secure Daily Astrology Cache and Subscription Entitlement
 *
 * Verifies that:
 * 1. Daily astrology cache is strictly user-scoped and isolated across accounts.
 * 2. Cached entitlement flags (is_entitled: true) cannot grant access independently.
 * 3. Offline fallback sanitizes and hides all premium content while preserving free overview.
 * 4. Logout and account switching immediately clears visible state and invalidates in-flight requests.
 * 5. Legacy globally shared cache entries cannot be restored as premium content.
 */

import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DailyRashiInsight,
  getRashiById,
} from "../src/features/astrology/types/rashi.types.ts";
import { dailyRashiService } from "../src/features/astrology/services/dailyRashiService.ts";
import { DailyRashiInsightCard } from "../src/features/astrology/components/DailyRashiInsightCard.tsx";
import { useDailyRashiInsight } from "../src/features/astrology/hooks/useDailyRashiInsight.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(15000);

// Controllable mock auth user
let mockCurrentUser: { id: string; email?: string } | null = { id: "user-a-uuid" };

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
  }),
  useRoute: () => ({ params: {} }),
}));

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
    signIn: jest.fn(() => Promise.resolve({ type: "success" })),
    signOut: jest.fn(() => Promise.resolve()),
    getTokens: jest.fn(() => Promise.resolve({ idToken: "tok" })),
  },
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    profile: mockCurrentUser ? { id: mockCurrentUser.id } : null,
    role: "customer",
    isLoading: false,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
    setProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

jest.mock("../src/infrastructure/supabase/client.ts", () => {
  return {
    supabase: {
      auth: {
        getUser: jest.fn(() =>
          Promise.resolve({
            data: { user: mockCurrentUser ? { id: mockCurrentUser.id } : null },
            error: null,
          })
        ),
        getSession: jest.fn(() =>
          Promise.resolve({
            data: { session: mockCurrentUser ? { user: { id: mockCurrentUser.id } } : null },
            error: null,
          })
        ),
      },
      rpc: jest.fn(),
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  };
});

// Helper component to mount and test useDailyRashiInsight hook lifecycle
const HookTestComponent: React.FC<{
  onStateUpdate?: (state: any) => void;
  rashiId?: number;
}> = ({ onStateUpdate, rashiId = 1 }) => {
  const result = useDailyRashiInsight(rashiId);
  React.useEffect(() => {
    if (onStateUpdate) {
      onStateUpdate(result);
    }
  }, [result, onStateUpdate]);
  return null;
};

describe("AST-02: Secure Daily Astrology Cache and Subscription Entitlement", () => {
  const sampleFullInsight: DailyRashiInsight = {
    id: "insight-full-01",
    insight_date: "2026-10-10",
    rashi_id: 1,
    rashi_name: "Mesha",
    language: "en",
    general_outlook: "Sun brings high vitality and focus today.",
    career_business: "Confidential executive negotiation succeeds.",
    finance_wealth: "Secret windfall from overseas venture.",
    love_relationships: "Harmony and peace at home.",
    health_wellbeing: "Strong vitality and digestion.",
    auspicious_color: "Crimson Red",
    auspicious_number: 9,
    status: "published",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCurrentUser = { id: "user-a-uuid" };
    dailyRashiService.clearSessionCache();
    await AsyncStorage.clear();

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        if (!mockCurrentUser) {
          return Promise.resolve({
            data: {
              success: false,
              is_entitled: false,
              content: null,
              error: "An active Vedic Astrology subscription is required to access Daily Insights.",
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: {
            success: true,
            is_entitled: true,
            content: sampleFullInsight,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  // ===========================================================================
  // SCENARIO 1: Cross-account isolation
  // ===========================================================================
  it("1. Cross-account isolation: User A's cached premium insight is never displayed or returned to User B", async () => {
    // 1. User A fetches while entitled
    const userAResult = await dailyRashiService.fetchDailyInsight(
      "2026-10-10",
      1,
      "en",
      "user-a-uuid"
    );
    expect(userAResult.is_entitled).toBe(true);
    expect(userAResult.content?.career_business).toBe("Confidential executive negotiation succeeds.");

    // 2. User B logs in (different UUID)
    mockCurrentUser = { id: "user-b-uuid" };
    // User B's network is offline/fails
    (supabase.rpc as jest.Mock).mockRejectedValueOnce(new Error("Network connection unavailable"));

    // User B attempts to read daily insight
    await expect(
      dailyRashiService.fetchDailyInsight("2026-10-10", 1, "en", "user-b-uuid")
    ).rejects.toThrow("Network connection unavailable");

    // 3. Verify User A's stored content cannot be loaded for User B
    const allKeys = await AsyncStorage.getAllKeys();
    const userAKey = "@kashiveda_daily_insight_v2:u_user-a-uuid:2026-10-10:1:en";
    const userBKey = "@kashiveda_daily_insight_v2:u_user-b-uuid:2026-10-10:1:en";
    expect(allKeys).toContain(userAKey);
    expect(allKeys).not.toContain(userBKey);
  });

  // ===========================================================================
  // SCENARIO 2: Logout immediately clears visible state and session cache
  // ===========================================================================
  it("2. Logout: Premium content disappears immediately when the current user logs out", async () => {
    let hookState: any = null;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <HookTestComponent onStateUpdate={(state) => (hookState = state)} />
      );
    });

    expect(hookState.isEntitled).toBe(true);
    expect(hookState.insight?.career_business).toBe("Confidential executive negotiation succeeds.");

    // User logs out: mockCurrentUser becomes null
    await act(async () => {
      mockCurrentUser = null;
      renderer.update(
        <HookTestComponent onStateUpdate={(state) => (hookState = state)} />
      );
    });

    // Visible state must be cleared immediately
    expect(hookState.insight).toBeNull();
    expect(hookState.isEntitled).toBe(false);
  });

  // ===========================================================================
  // SCENARIO 3: Account switch invalidates in-flight responses
  // ===========================================================================
  it("3. Account switch: A pending cache read or request from User A cannot restore User A's content after User B signs in", async () => {
    let resolveUserARequest: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveUserARequest = resolve;
    });

    (supabase.rpc as jest.Mock).mockImplementationOnce(() => pendingPromise);

    let hookState: any = null;
    let renderer: any;

    // User A mounts and starts in-flight fetch
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <HookTestComponent onStateUpdate={(state) => (hookState = state)} />
      );
    });

    expect(hookState.loading).toBe(true);

    // User switches to User B while User A's request is still in-flight
    await act(async () => {
      mockCurrentUser = { id: "user-b-uuid" };
      // User B's call immediately returns unentitled
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: { success: false, is_entitled: false, content: null },
        error: null,
      });

      renderer.update(
        <HookTestComponent onStateUpdate={(state) => (hookState = state)} />
      );
    });

    // Now User A's old slow network request finally resolves
    await act(async () => {
      resolveUserARequest!({
        data: {
          success: true,
          is_entitled: true,
          content: sampleFullInsight,
        },
        error: null,
      });
    });

    // User B's state MUST NOT be overwritten by User A's late-resolving response
    expect(hookState.isEntitled).toBe(false);
    expect(hookState.insight).toBeNull();
  });

  // ===========================================================================
  // SCENARIO 4: Cached entitlement cannot authorize
  // ===========================================================================
  it("4. Cached entitlement cannot authorize: A cached response containing is_entitled: true does not independently permit premium rendering", async () => {
    // Manually place a cached entry with premium fields in storage
    const userKey = "@kashiveda_daily_insight_v2:u_user-a-uuid:2026-10-10:1:en";
    await AsyncStorage.setItem(userKey, JSON.stringify(sampleFullInsight));

    // When network fails/offline, offline fallback is invoked
    (supabase.rpc as jest.Mock).mockRejectedValueOnce(new Error("Network offline"));

    const result = await dailyRashiService.fetchDailyInsight(
      "2026-10-10",
      1,
      "en",
      "user-a-uuid"
    );

    // Rule: Cached entitlement can NEVER authorize premium content independently
    expect(result.is_entitled).toBe(false);
    expect(result.is_unverified).toBe(true);

    // Premium fields must be sanitized to null
    expect(result.content?.career_business).toBeNull();
    expect(result.content?.finance_wealth).toBeNull();
    expect(result.content?.love_relationships).toBeNull();
    expect(result.content?.health_wellbeing).toBeNull();

    // Free fields must remain accessible
    expect(result.content?.general_outlook).toBe("Sun brings high vitality and focus today.");
    expect(result.content?.auspicious_color).toBe("Crimson Red");
    expect(result.content?.auspicious_number).toBe(9);
  });

  // ===========================================================================
  // SCENARIO 5: Confirmed entitlement permits expected premium fields
  // ===========================================================================
  it("5. Confirmed entitlement: A successful current backend response confirming entitlement permits expected premium fields to display", () => {
    const rashi = getRashiById(1);
    let tree: any;

    act(() => {
      tree = ReactTestRenderer.create(
        <DailyRashiInsightCard
          rashi={rashi}
          insight={sampleFullInsight}
          loading={false}
          isEntitled={true}
        />
      );
    });

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("General Cosmic Outlook");
    expect(json).toContain("Sun brings high vitality and focus today.");
    expect(json).toContain("Career & Profession");
    expect(json).toContain("Confidential executive negotiation succeeds.");
    expect(json).toContain("Wealth & Finance");
    expect(json).toContain("Secret windfall from overseas venture.");
    expect(json).toContain("Love & Relationships");
    expect(json).toContain("Health & Vitality");
  });

  // ===========================================================================
  // SCENARIO 6: Confirmed no entitlement keeps premium sections locked
  // ===========================================================================
  it("6. Confirmed no entitlement: A non-entitled backend response keeps premium sections locked even when old cached premium text exists", async () => {
    // Populate cache with old premium data
    const userKey = "@kashiveda_daily_insight_v2:u_user-a-uuid:2026-10-10:1:en";
    await AsyncStorage.setItem(userKey, JSON.stringify(sampleFullInsight));

    // Backend confirms user subscription is expired / not entitled
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: {
        success: false,
        is_entitled: false,
        error: "Subscription expired. Please renew.",
      },
      error: null,
    });

    const result = await dailyRashiService.fetchDailyInsight(
      "2026-10-10",
      1,
      "en",
      "user-a-uuid"
    );

    expect(result.is_entitled).toBe(false);
    expect(result.content).toBeNull();

    // UI rendering when not entitled
    const rashi = getRashiById(1);
    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <DailyRashiInsightCard
          rashi={rashi}
          insight={result.content}
          loading={false}
          isEntitled={result.is_entitled}
        />
      );
    });

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Subscribe to Kashi Veda Astrology");
    expect(json).not.toContain("Confidential executive negotiation succeeds.");
  });

  // ===========================================================================
  // SCENARIO 7: Offline fallback preserves free content and hides premium
  // ===========================================================================
  it("7. Offline fallback: Free content is displayed while premium content remains hidden if entitlement cannot be verified", async () => {
    const userKey = "@kashiveda_daily_insight_v2:u_user-a-uuid:2026-10-10:1:en";
    await AsyncStorage.setItem(userKey, JSON.stringify(sampleFullInsight));

    // Network offline
    (supabase.rpc as jest.Mock).mockRejectedValueOnce(new Error("Network offline"));

    const result = await dailyRashiService.fetchDailyInsight(
      "2026-10-10",
      1,
      "en",
      "user-a-uuid"
    );

    const rashi = getRashiById(1);
    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <DailyRashiInsightCard
          rashi={rashi}
          insight={result.content}
          loading={false}
          isEntitled={result.is_entitled}
          isUnverifiedOffline={result.is_unverified}
        />
      );
    });

    const json = JSON.stringify(tree.toJSON());
    // Free content is visible
    expect(json).toContain("General Cosmic Outlook");
    expect(json).toContain("Sun brings high vitality and focus today.");
    expect(json).toContain("Crimson Red");
    expect(json).toContain("9");

    // Premium fields MUST NOT be visible
    expect(json).not.toContain("Confidential executive negotiation succeeds.");
    expect(json).not.toContain("Secret windfall from overseas venture.");

    // Offline unverified notice is rendered
    expect(json).toContain("Offline Mode — Subscription Unverified");
  });

  // ===========================================================================
  // SCENARIO 8: Offline messaging does not falsely state subscription expired
  // ===========================================================================
  it("8. Offline messaging: The user is not falsely told their subscription has expired merely because verification failed", () => {
    const rashi = getRashiById(1);
    const sanitizedFreeContent = dailyRashiService.sanitizeFreeContent(sampleFullInsight);
    let tree: any;

    act(() => {
      tree = ReactTestRenderer.create(
        <DailyRashiInsightCard
          rashi={rashi}
          insight={sanitizedFreeContent}
          loading={false}
          isEntitled={false}
          isUnverifiedOffline={true}
        />
      );
    });

    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain("Offline Mode — Subscription Unverified");
    expect(json).toContain("Unable to verify your active subscription while offline");
    expect(json).not.toContain("Subscription expired");
  });

  // ===========================================================================
  // SCENARIO 9: Legacy cache isolation and cleanup
  // ===========================================================================
  it("9. Legacy cache isolation: An old globally shared cache entry cannot be restored as premium content", async () => {
    // Put an old globally shared entry under legacy prefix without user ID
    const legacyKey = "@kashiveda_daily_insight_2026-10-10:1:en";
    await AsyncStorage.setItem(legacyKey, JSON.stringify(sampleFullInsight));

    // 1. Service's getOfflineCachedInsight only queries v2 prefix; legacy key is never read
    (supabase.rpc as jest.Mock).mockRejectedValueOnce(new Error("Offline"));
    await expect(
      dailyRashiService.fetchDailyInsight("2026-10-10", 1, "en", "user-c-uuid")
    ).rejects.toThrow("Offline");

    // 2. Explicitly trigger legacy cleanup
    await dailyRashiService.cleanupLegacyCache();
    const remainingKeys = await AsyncStorage.getAllKeys();
    expect(remainingKeys).not.toContain(legacyKey);
  });

  // ===========================================================================
  // SCENARIO 10: Cache identity prevents collisions across users, rashis, dates, languages
  // ===========================================================================
  it("10. Cache identity: Different users, dates, Rashi IDs, and languages cannot unintentionally collide", async () => {
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({
        data: { success: true, is_entitled: true, content: { ...sampleFullInsight, rashi_id: 1, language: "en" } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { success: true, is_entitled: true, content: { ...sampleFullInsight, rashi_id: 2, language: "en" } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { success: true, is_entitled: true, content: { ...sampleFullInsight, rashi_id: 1, language: "hi" } },
        error: null,
      });

    await dailyRashiService.fetchDailyInsight("2026-10-10", 1, "en", "user-1");
    await dailyRashiService.fetchDailyInsight("2026-10-10", 2, "en", "user-1");
    await dailyRashiService.fetchDailyInsight("2026-10-10", 1, "hi", "user-1");

    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toContain("@kashiveda_daily_insight_v2:u_user-1:2026-10-10:1:en");
    expect(keys).toContain("@kashiveda_daily_insight_v2:u_user-1:2026-10-10:2:en");
    expect(keys).toContain("@kashiveda_daily_insight_v2:u_user-1:2026-10-10:1:hi");
  });

  // ===========================================================================
  // SCENARIO 11: Session transition: dropped in-flight responses
  // ===========================================================================
  it("11. Session transition: A result started under an earlier user identity is ignored after the identity changes", async () => {
    let hookState: any = null;
    let renderer: any;

    let resolveSlowCall: (val: any) => void;
    (supabase.rpc as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveSlowCall = res;
        })
    );

    // Initial mount as User 1
    mockCurrentUser = { id: "user-1" };
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <HookTestComponent onStateUpdate={(state) => (hookState = state)} />
      );
    });

    // User logs out while request is pending
    await act(async () => {
      mockCurrentUser = null;
      renderer.update(
        <HookTestComponent onStateUpdate={(state) => (hookState = state)} />
      );
    });

    // Old call finishes
    await act(async () => {
      resolveSlowCall!({
        data: { success: true, is_entitled: true, content: sampleFullInsight },
        error: null,
      });
    });

    // Content must still be null because session transitioned
    expect(hookState.insight).toBeNull();
    expect(hookState.isEntitled).toBe(false);
  });

  // ===========================================================================
  // SCENARIO 12: No regression for free content, entitled users, and languages
  // ===========================================================================
  it("12. No regression: Existing expected behavior for free content, authenticated entitled users, and supported languages remains intact", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: {
        success: true,
        is_entitled: true,
        content: {
          ...sampleFullInsight,
          language: "hi",
          general_outlook: "सूर्य का प्रभाव आज विशेष फलदायी रहेगा।",
          career_business: "व्यापार में नए अवसर प्राप्त होंगे।",
        },
      },
      error: null,
    });

    const res = await dailyRashiService.fetchDailyInsight(
      "2026-10-10",
      1,
      "hi",
      "user-a-uuid"
    );

    expect(res.success).toBe(true);
    expect(res.is_entitled).toBe(true);
    expect(res.content?.language).toBe("hi");
    expect(res.content?.general_outlook).toBe("सूर्य का प्रभाव आज विशेष फलदायी रहेगा।");
    expect(res.content?.career_business).toBe("व्यापार में नए अवसर प्राप्त होंगे।");
  });
});
