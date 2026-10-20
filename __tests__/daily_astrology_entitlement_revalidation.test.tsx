// __tests__/daily_astrology_entitlement_revalidation.test.tsx
/**
 * AST-04 Follow-up: Verification of Current Backend Entitlement on Lifecycle Refresh
 *
 * Verifies that:
 * 1. A same-day cached entitled result is not accepted as the final entitlement answer
 *    when lifecycle revalidation is triggered.
 * 2. A foreground refresh after simulated subscription expiry/cancellation queries the backend
 *    and hides premium content when the current response is non-entitled.
 * 3. Concurrent navigation focus and AppState activation are deduplicated to a single backend request.
 * 4. A temporary verification failure (network error) preserves offline policy (sanitized free overview,
 *    unverified notice) without falsely claiming subscription expired.
 * 5. A previous cache entry cannot restore entitlement or premium text after revalidation confirms non-entitled.
 * 6. A successful current entitled response displays full premium content correctly.
 * 7. Logout and account switching immediately clears state and prevents cross-account disclosure.
 * 8. AST-03 guarded request-generation mechanism drops late responses from older Rashis.
 * 9. Direct dailyRashiService.fetchDailyInsight bypassCache/revalidate bypasses in-memory cache.
 */

import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DailyRashiInsight,
} from "../src/features/astrology/types/rashi.types.ts";
import { dailyRashiService } from "../src/features/astrology/services/dailyRashiService.ts";
import { DailyRashiInsightCard } from "../src/features/astrology/components/DailyRashiInsightCard.tsx";
import {
  useDailyRashiInsight,
  UseDailyRashiInsightResult,
} from "../src/features/astrology/hooks/useDailyRashiInsight.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(15000);

let mockCurrentUser: { id: string; email?: string } | null = { id: "user-a-uuid" };

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useNavigation: () => ({
      navigate: jest.fn(),
      replace: jest.fn(),
      goBack: jest.fn(),
    }),
    useRoute: () => ({ params: {} }),
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

jest.mock("../src/infrastructure/supabase/client.ts", () => ({
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
}));

function extractAllText(node: any): string {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractAllText).join(" ");
  if (node.props && node.props.children) {
    return extractAllText(node.props.children);
  }
  if (node.children) {
    return extractAllText(node.children);
  }
  return "";
}

// Integrated harness rendering the hook and UI card together
const AstrologyHarness: React.FC<{
  onStateUpdate?: (state: UseDailyRashiInsightResult) => void;
  rashiId?: number;
}> = ({ onStateUpdate, rashiId = 1 }) => {
  const result = useDailyRashiInsight(rashiId);
  React.useEffect(() => {
    onStateUpdate?.(result);
  }, [result, onStateUpdate]);
  return (
    <DailyRashiInsightCard
      rashi={result.selectedRashi}
      insight={result.insight}
      loading={result.loading}
      isEntitled={result.isEntitled}
      isUnverifiedOffline={result.isUnverifiedOffline}
      onRetry={result.refresh}
    />
  );
};

describe("AST-04 Follow-up: Entitlement Revalidation on Lifecycle Refresh", () => {
  const samplePremiumInsight: DailyRashiInsight = {
    id: "insight-mesha-premium",
    insight_date: "2026-10-10",
    rashi_id: 1,
    rashi_name: "Mesha",
    language: "en",
    general_outlook: "Sun in Aries brings vigor and decisive leadership.",
    career_business: "Executive negotiation closes successfully with substantial gains.",
    finance_wealth: "Lucrative investment yield anticipated from gold holdings.",
    love_relationships: "Mutual understanding and harmonious bonding with partner.",
    health_wellbeing: "Abundant vitality; protect digestion from spicy meals.",
    auspicious_color: "Deep Crimson",
    auspicious_number: 9,
    status: "published",
    is_premium_unlocked: true,
    guidance_level: "detailed",
  } as any;

  let appStateListeners: Array<(state: string) => void> = [];

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCurrentUser = { id: "user-a-uuid" };
    appStateListeners = [];
    dailyRashiService.clearSessionCache();
    await AsyncStorage.clear();

    jest.spyOn(AppState, "addEventListener").mockImplementation((type: any, listener: any) => {
      if (type === "change") {
        appStateListeners.push(listener);
      }
      return {
        remove: () => {
          appStateListeners = appStateListeners.filter((l) => l !== listener);
        },
      } as any;
    });

    jest.spyOn(dailyRashiService, "getPreferredRashi").mockResolvedValue(1);
    jest.spyOn(dailyRashiService, "savePreferredRashi").mockResolvedValue({
      status: "synced",
      rashiId: 1,
      userId: "test-user-id",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // 1. Critical Scenario Reproduction: Stale Cache vs Backend Entitlement Check
  // =========================================================================
  test("1. Stale in-memory cache is NOT treated as authoritative on lifecycle refresh when backend entitlement changes", async () => {
    let backendEntitled = true;
    let rpcCallCount = 0;

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        rpcCallCount++;
        if (backendEntitled) {
          return Promise.resolve({
            data: {
              success: true,
              is_entitled: true,
              content: samplePremiumInsight,
            },
            error: null,
          });
        }
        // Subscription expired or cancelled on backend
        return Promise.resolve({
          data: {
            success: false,
            is_entitled: false,
            error: "An active Vedic Astrology subscription is required to access Daily Insights.",
            content: null,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    // Step 1: User A mounts screen, backend returns is_entitled: true
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(rpcCallCount).toBe(1);
    expect(hookState.isEntitled).toBe(true);
    expect(hookState.insight?.career_business).toBe("Executive negotiation closes successfully with substantial gains.");
    let renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Executive negotiation closes successfully");
    expect(renderedText).not.toContain("Subscribe to Kashi Veda Astrology");

    // Step 2: Background app, simulate subscription expiry/cancellation on backend
    act(() => {
      appStateListeners.forEach((l) => l("background"));
    });
    backendEntitled = false;

    // Fast-forward beyond deduplication cooldown window (e.g. 3 seconds later)
    jest.useFakeTimers({ advanceTimers: true });
    jest.advanceTimersByTime(3000);

    // Step 3: Trigger AppState foreground wake-up
    await act(async () => {
      appStateListeners.forEach((l) => l("active"));
    });

    // Step 4: Verify backend was queried (cache was bypassed) rather than returning cached true
    expect(rpcCallCount).toBe(2);
    expect(hookState.isEntitled).toBe(false);
    expect(hookState.insight).toBeNull();

    // Step 5: Verify UI hid premium guidance immediately and shows subscription lock
    renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).not.toContain("Executive negotiation closes successfully");
    expect(renderedText).not.toContain("Lucrative investment yield");
    expect(renderedText).toContain("Subscribe to Kashi Veda Astrology");
  });

  // =========================================================================
  // 2. Navigation Focus Revalidation
  // =========================================================================
  test("2. Navigation focus refresh revalidates backend entitlement and revokes premium access", async () => {
    let backendEntitled = true;
    let rpcCallCount = 0;

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        rpcCallCount++;
        if (backendEntitled) {
          return Promise.resolve({
            data: {
              success: true,
              is_entitled: true,
              content: samplePremiumInsight,
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: {
            success: false,
            is_entitled: false,
            error: "An active Vedic Astrology subscription is required to access Daily Insights.",
            content: null,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(rpcCallCount).toBe(1);
    expect(hookState.isEntitled).toBe(true);

    // Backend state change: subscription cancelled
    backendEntitled = false;

    // Fast-forward beyond throttle
    jest.useFakeTimers({ advanceTimers: true });
    jest.advanceTimersByTime(3000);

    // Focus revalidation via refresh({ force: false, revalidate: true })
    await act(async () => {
      await hookState.refresh({ force: false, revalidate: true });
    });

    expect(rpcCallCount).toBe(2);
    expect(hookState.isEntitled).toBe(false);
    expect(hookState.insight).toBeNull();
    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).not.toContain("Executive negotiation");
    expect(renderedText).toContain("Subscribe to Kashi Veda Astrology");
  });

  // =========================================================================
  // 3. Concurrent Focus and Foreground Deduplication
  // =========================================================================
  test("3. Navigation focus and AppState activation arriving together do not generate duplicate requests", async () => {
    let rpcCallCount = 0;
    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        rpcCallCount++;
        return Promise.resolve({
          data: {
            success: true,
            is_entitled: true,
            content: samplePremiumInsight,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });
    expect(rpcCallCount).toBe(1);

    // Advance time past cooldown
    jest.useFakeTimers({ advanceTimers: true });
    jest.advanceTimersByTime(5000);

    // Simulate simultaneous focus and foreground arriving in the exact same event loop
    await act(async () => {
      const focusPromise = hookState.refresh({ force: false, revalidate: true });
      appStateListeners.forEach((l) => l("active"));
      await focusPromise;
    });

    // Exactly 1 additional RPC call, not 2
    expect(rpcCallCount).toBe(2);
  });

  // =========================================================================
  // 4. Temporary Verification Failure (Offline / Network Error Policy)
  // =========================================================================
  test("4. Temporary network failure during revalidation does NOT falsely declare subscription expired", async () => {
    let networkError = false;

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        if (networkError) {
          return Promise.reject(new Error("Network connection lost"));
        }
        return Promise.resolve({
          data: {
            success: true,
            is_entitled: true,
            content: samplePremiumInsight,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.isEntitled).toBe(true);

    // Background app, network disconnects
    act(() => {
      appStateListeners.forEach((l) => l("background"));
    });
    networkError = true;

    jest.useFakeTimers({ advanceTimers: true });
    jest.advanceTimersByTime(3000);

    // Return to foreground while offline
    await act(async () => {
      appStateListeners.forEach((l) => l("active"));
    });

    // Preserves offline policy:
    // 1. isEntitled is false (does not falsely grant access)
    // 2. isUnverifiedOffline is true
    // 3. Sanitized free overview is visible
    // 4. Premium fields are hidden
    // 5. Does NOT falsely report that the subscription has expired!
    expect(hookState.isEntitled).toBe(false);
    expect(hookState.isUnverifiedOffline).toBe(true);
    expect(hookState.insight?.general_outlook).toContain("Sun in Aries brings vigor");
    expect(hookState.insight?.career_business).toBeNull();

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Offline Mode — Subscription Unverified");
    expect(renderedText).toContain("Unable to verify your active subscription while offline");
    expect(renderedText).toContain("Retry Connection 🔄");
    // Must NOT claim subscription expired or render standard expired paywall
    expect(renderedText).not.toContain("Executive negotiation");
    expect(renderedText).not.toContain("Subscription Expired");
  });

  // =========================================================================
  // 5. Evicted Cache Cannot Restore Entitlement on Subsequent Renders
  // =========================================================================
  test("5. Prior cache entry is permanently evicted when backend confirms non-entitled", async () => {
    let backendEntitled = true;

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        if (backendEntitled) {
          return Promise.resolve({
            data: {
              success: true,
              is_entitled: true,
              content: samplePremiumInsight,
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: {
            success: false,
            is_entitled: false,
            error: "Subscription expired.",
            content: null,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });
    expect(hookState.isEntitled).toBe(true);

    // Subscription expired
    backendEntitled = false;

    jest.useFakeTimers({ advanceTimers: true });
    jest.advanceTimersByTime(3000);

    // Revalidate
    await act(async () => {
      await hookState.refresh({ force: false, revalidate: true });
    });
    expect(hookState.isEntitled).toBe(false);

    // Direct fetchDailyInsight without bypassCache: must not find cached entitled entry
    const directResult = await dailyRashiService.fetchDailyInsight(
      "2026-10-10",
      1,
      "en",
      "user-a-uuid"
    );
    expect(directResult.is_entitled).toBe(false);
    expect(directResult.content).toBeNull();
  });

  // =========================================================================
  // 6. Successful Current Entitled Response Revalidates Cleanly
  // =========================================================================
  test("6. Successful current entitled response preserves full premium content", async () => {
    let rpcCallCount = 0;
    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        rpcCallCount++;
        return Promise.resolve({
          data: {
            success: true,
            is_entitled: true,
            content: samplePremiumInsight,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    act(() => {
      appStateListeners.forEach((l) => l("background"));
    });
    jest.useFakeTimers({ advanceTimers: true });
    jest.advanceTimersByTime(3000);

    await act(async () => {
      appStateListeners.forEach((l) => l("active"));
    });

    expect(rpcCallCount).toBe(2);
    expect(hookState.isEntitled).toBe(true);
    expect(hookState.insight?.career_business).toBe("Executive negotiation closes successfully with substantial gains.");
    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Executive negotiation closes successfully");
  });

  // =========================================================================
  // 7. Logout and Account Switching Boundary
  // =========================================================================
  test("7. Logout immediately clears visible content and prevents cross-account disclosure", async () => {
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
            content: samplePremiumInsight,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.isEntitled).toBe(true);

    // User A logs out
    await act(async () => {
      mockCurrentUser = null;
      renderer.update(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.insight).toBeNull();
    expect(hookState.isEntitled).toBe(false);

    // User B signs in (different user id)
    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        return Promise.resolve({
          data: {
            success: false,
            is_entitled: false,
            error: "No active subscription for User B.",
            content: null,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await act(async () => {
      mockCurrentUser = { id: "user-b-uuid" };
      renderer.update(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.isEntitled).toBe(false);
    expect(hookState.insight).toBeNull();
    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).not.toContain("Executive negotiation");
  });

  // =========================================================================
  // 8. AST-03 Protection Against Late Responses from Older Rashi
  // =========================================================================
  test("8. AST-03 Guard: Slow response from earlier Rashi is dropped when user selects new Rashi", async () => {
    let slowResolveRashi1: ((val: any) => void) | null = null;

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string, params: any) => {
      if (rpcName === "get_daily_rashi_insight") {
        if (params?.p_rashi_id === 1) {
          return new Promise((resolve) => {
            slowResolveRashi1 = resolve;
          });
        }
        if (params?.p_rashi_id === 2) {
          return Promise.resolve({
            data: {
              success: true,
              is_entitled: true,
              content: {
                ...samplePremiumInsight,
                rashi_id: 2,
                rashi_name: "Vrishabha",
                general_outlook: "Venus brings prosperity to Taurus today.",
              },
            },
            error: null,
          });
        }
      }
      return Promise.resolve({ data: null, error: null });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <AstrologyHarness rashiId={1} onStateUpdate={(st) => (hookState = st)} />
      );
    });

    // User switches to Rashi 2 before Rashi 1 responds
    await act(async () => {
      await hookState.selectRashi(2);
    });

    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.general_outlook).toContain("Venus brings prosperity to Taurus");

    // Now Rashi 1's slow response finally resolves
    await act(async () => {
      slowResolveRashi1?.({
        data: {
          success: true,
          is_entitled: true,
          content: {
            ...samplePremiumInsight,
            rashi_id: 1,
            general_outlook: "LATE RASHI 1 CONTENT",
          },
        },
        error: null,
      });
    });

    // Rashi 1 content must NOT overwrite Rashi 2
    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.general_outlook).toContain("Venus brings prosperity to Taurus");
    expect(hookState.insight?.general_outlook).not.toContain("LATE RASHI 1 CONTENT");
  });

  // =========================================================================
  // 9. Direct dailyRashiService Option A Strict Entitlement Verification
  // =========================================================================
  test("9. Option A Strict Entitlement: fetchDailyInsight verifies backend entitlement on every call and cannot grant entitlement from memory cache", async () => {
    let rpcCount = 0;
    let backendEntitled = true;
    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "get_daily_rashi_insight") {
        rpcCount++;
        if (backendEntitled) {
          return Promise.resolve({
            data: {
              success: true,
              is_entitled: true,
              content: samplePremiumInsight,
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: {
            success: false,
            is_entitled: false,
            content: null,
            error: "An active Vedic Astrology subscription is required.",
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // First call: Queries backend RPC and returns entitled
    const res1 = await dailyRashiService.fetchDailyInsight("2026-10-10", 1, "en", "user-a-uuid");
    expect(res1.is_entitled).toBe(true);
    expect(rpcCount).toBe(1);

    // Second call without bypassCache: Under Option A, MUST query authoritative backend
    // rather than manufacturing is_entitled: true from memory cache
    const res2 = await dailyRashiService.fetchDailyInsight("2026-10-10", 1, "en", "user-a-uuid");
    expect(res2.is_entitled).toBe(true);
    expect(rpcCount).toBe(2);

    // Third call when backend entitlement has lapsed: Immediately reflects backend result (is_entitled: false)
    backendEntitled = false;
    const res3 = await dailyRashiService.fetchDailyInsight(
      "2026-10-10",
      1,
      "en",
      "user-a-uuid"
    );
    expect(res3.is_entitled).toBe(false);
    expect(res3.content).toBeNull();
    expect(rpcCount).toBe(3);
  });
});
