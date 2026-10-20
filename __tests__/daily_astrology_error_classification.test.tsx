// __tests__/daily_astrology_error_classification.test.tsx
/**
 * AST-05: Distinguish Backend Failures From Empty Content and Subscription Denial
 *
 * Test suite verifying:
 * Test A: Legitimate empty result (editorial empty state without error or paywall)
 * Test B: RPC returned error object (not converted to empty content or paywall)
 * Test C: RPC thrown exception (surface error, not falsely marked offline if non-network)
 * Test D: Compatibility fallback executed strictly on missing RPC (PGRST202 / 42883)
 * Test E: Unrelated RPC failure does NOT invoke fallback
 * Test F: Direct-table fallback query failure surfaces genuine error, not empty content
 * Test G: Subscription query error in fallback surfaces genuine error, not expired paywall
 * Test H: Transient offline failure sanitizes premium fields and displays unverified offline state
 * Test I: Backend confirms not entitled displays subscription lock and evicts cache
 * Test J: Visible Retry action on error state triggers guarded refresh
 * Test K: Successful retry clears error and displays valid content
 * Test L: Current request failure from older Rashi does not overwrite newer Rashi state
 * Test M: Lifecycle revalidation bypasses cache and respects confirmed non-entitled backend state
 * Test N: No regression for free attributes, cache security, and core contract
 */

import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DailyRashiInsight,
  getRashiById,
} from "../src/features/astrology/types/rashi.types.ts";
import { dailyRashiService } from "../src/features/astrology/services/dailyRashiService.ts";
import { DailyRashiInsightCard } from "../src/features/astrology/components/DailyRashiInsightCard.tsx";
import {
  useDailyRashiInsight,
  UseDailyRashiInsightResult,
} from "../src/features/astrology/hooks/useDailyRashiInsight.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(15000);

let mockCurrentUser: { id: string; email?: string } | null = { id: "user-ast05-uuid" };

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
    session: mockCurrentUser ? { user: { id: mockCurrentUser.id } } : null,
    loading: false,
    signOut: jest.fn(),
  }),
}));

let mockTableFromHandler: any = null;

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
    from: jest.fn((table: string) => {
      if (mockTableFromHandler) {
        return mockTableFromHandler(table);
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
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

function findButtonByText(node: any, buttonText: string): any {
  if (!node) return null;
  const text = extractAllText(node);
  if (node.props && typeof node.props.onPress === "function" && text.includes(buttonText)) {
    return node;
  }
  if (node.children) {
    for (const child of node.children) {
      const match = findButtonByText(child, buttonText);
      if (match) return match;
    }
  }
  return null;
}

const AstrologyHarness: React.FC<{
  onStateUpdate?: (state: UseDailyRashiInsightResult) => void;
  rashiId?: number;
  onSubscribePress?: () => void;
}> = ({ onStateUpdate, rashiId = 1, onSubscribePress = jest.fn() }) => {
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
      error={result.error}
      onSubscribePress={onSubscribePress}
      onRetry={result.refresh}
    />
  );
};

describe("KashiVeda AST-05: Error Classification & Fallback Hardening", () => {
  const samplePremiumInsight: DailyRashiInsight = {
    id: "insight-ast05-mesha",
    insight_date: "2026-10-10",
    rashi_id: 1,
    rashi_name: "Mesha",
    language: "en",
    general_outlook: "Auspicious planetary alignment favors clarity.",
    career_business: "Key deal closes with strategic advantage.",
    finance_wealth: "Gains from heritage investments.",
    love_relationships: "Harmony and mutual affection.",
    health_wellbeing: "Robust vitality and inner calm.",
    auspicious_color: "Saffron",
    auspicious_number: 7,
    status: "published",
  };

  let appStateListeners: Array<(state: string) => void> = [];

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCurrentUser = { id: "user-ast05-uuid" };
    mockTableFromHandler = null;
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
  });

  // =========================================================================
  // Test A — Legitimate empty result
  // =========================================================================
  test("Test A — Legitimate empty result displays editorial empty state without error or paywall", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        is_entitled: true,
        content: null,
      },
      error: null,
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.loading).toBe(false);
    expect(hookState.insight).toBeNull();
    expect(hookState.isEntitled).toBe(true);
    expect(hookState.error).toBeNull();
    expect(hookState.isUnverifiedOffline).toBe(false);

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("No Insight for Mesha Today");
    expect(renderedText).toContain("currently being prepared by Vedic scholars");
    expect(renderedText).not.toContain("Unable to Load Daily Guidance");
    expect(renderedText).not.toContain("Paid Vedic Guidance");
    expect(renderedText).not.toContain("Unlock Daily Astrological Insights");
  });

  // =========================================================================
  // Test B — RPC returned error object
  // =========================================================================
  test("Test B — RPC returned error object surfaces genuine failure and does not masquerade as empty content", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "500",
        message: "Internal server error: database query failed",
      },
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.loading).toBe(false);
    expect(hookState.insight).toBeNull();
    expect(hookState.error).toBe("Internal server error: database query failed");

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Unable to Load Daily Guidance for Mesha");
    expect(renderedText).toContain("Internal server error: database query failed");
    expect(renderedText).not.toContain("No Insight for Mesha Today");
    expect(renderedText).not.toContain("Paid Vedic Guidance");
  });

  // =========================================================================
  // Test C — RPC thrown exception
  // =========================================================================
  test("Test C — RPC thrown exception displays error state with visible retry and is not falsely marked offline", async () => {
    (supabase.rpc as jest.Mock).mockRejectedValue(new Error("Database statement crashed"));

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.loading).toBe(false);
    expect(hookState.insight).toBeNull();
    expect(hookState.error).toBe("Database statement crashed");
    expect(hookState.isUnverifiedOffline).toBe(false);

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Unable to Load Daily Guidance for Mesha");
    expect(renderedText).toContain("Database statement crashed");
    expect(renderedText).toContain("Try Again");
    expect(renderedText).not.toContain("Offline Mode");
    expect(renderedText).not.toContain("Paid Vedic Guidance");
  });

  // =========================================================================
  // Test D — Compatibility fallback condition
  // =========================================================================
  test("Test D — Compatibility fallback condition executes strictly on missing RPC error (PGRST202)", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.get_daily_rashi_insight in the schema cache",
      },
    });

    // Mock direct table queries for fallback
    mockTableFromHandler = (table: string) => {
      if (table === "astrology_subscriptions") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: "sub-ast05-active",
              starts_at: "2026-01-01T00:00:00Z",
              ends_at: "2026-12-31T23:59:59Z",
              status: "active",
              astrology_subscription_plans: {
                daily_in_app_enabled: true,
                is_active: true,
              },
            },
            error: null,
          }),
        };
      }
      if (table === "daily_rashi_insights") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: samplePremiumInsight,
            error: null,
          }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    };

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.loading).toBe(false);
    expect(hookState.isEntitled).toBe(true);
    expect(hookState.insight?.id).toBe("insight-ast05-mesha");
    expect(hookState.error).toBeNull();

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Auspicious planetary alignment favors clarity");
    expect(renderedText).toContain("Key deal closes with strategic advantage");
  });

  // =========================================================================
  // Test E — Unrelated RPC failure does NOT invoke fallback
  // =========================================================================
  test("Test E — Unrelated RPC failure (permission denied 42501) does NOT invoke fallback", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for function get_daily_rashi_insight",
      },
    });

    let subscriptionsTableQueried = false;
    let insightsTableQueried = false;

    mockTableFromHandler = (table: string) => {
      if (table === "astrology_subscriptions") subscriptionsTableQueried = true;
      if (table === "daily_rashi_insights") insightsTableQueried = true;
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    };

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    // Fallback must NOT have executed
    expect(subscriptionsTableQueried).toBe(false);
    expect(insightsTableQueried).toBe(false);

    expect(hookState.error).toBe("permission denied for function get_daily_rashi_insight");
    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Unable to Load Daily Guidance for Mesha");
    expect(renderedText).toContain("permission denied for function get_daily_rashi_insight");
  });

  // =========================================================================
  // Test F — Direct-table fallback failure surfaces genuine error
  // =========================================================================
  test("Test F — Direct-table fallback query failure surfaces genuine error, not empty content", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.get_daily_rashi_insight in the schema cache",
      },
    });

    mockTableFromHandler = (table: string) => {
      if (table === "astrology_subscriptions") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: "sub-ast05-active",
              starts_at: "2026-01-01T00:00:00Z",
              ends_at: "2026-12-31T23:59:59Z",
              status: "active",
              astrology_subscription_plans: {
                daily_in_app_enabled: true,
                is_active: true,
              },
            },
            error: null,
          }),
        };
      }
      if (table === "daily_rashi_insights") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: {
              code: "42703",
              message: "column does not exist in table daily_rashi_insights",
            },
          }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    };

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.insight).toBeNull();
    expect(hookState.error).toBe("column does not exist in table daily_rashi_insights");

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Unable to Load Daily Guidance for Mesha");
    expect(renderedText).toContain("column does not exist in table daily_rashi_insights");
    expect(renderedText).not.toContain("No Insight for Mesha Today");
  });

  // =========================================================================
  // Test G — Subscription-query error in fallback surfaces genuine error
  // =========================================================================
  test("Test G — Subscription-query error in fallback surfaces genuine error, not expired paywall", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.get_daily_rashi_insight in the schema cache",
      },
    });

    mockTableFromHandler = (table: string) => {
      if (table === "astrology_subscriptions") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: null,
            error: {
              code: "57014",
              message: "astrology_subscriptions connection timeout",
            },
          }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    };

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.error).toBe("astrology_subscriptions connection timeout");
    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Unable to Load Daily Guidance for Mesha");
    expect(renderedText).toContain("astrology_subscriptions connection timeout");
    expect(renderedText).not.toContain("Paid Vedic Guidance");
    expect(renderedText).not.toContain("Unlock Daily Astrological Insights");
  });

  // =========================================================================
  // Test H — Transient offline failure
  // =========================================================================
  test("Test H — Transient offline failure sanitizes premium fields and displays unverified offline state", async () => {
    // 1. Initial success seeds cache
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        is_entitled: true,
        content: samplePremiumInsight,
      },
      error: null,
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.isEntitled).toBe(true);
    expect(hookState.insight?.career_business).toBe("Key deal closes with strategic advantage.");

    // 2. Simulate network disconnect and refresh
    (supabase.rpc as jest.Mock).mockRejectedValue(new Error("Network connection lost"));

    await act(async () => {
      await hookState.refresh({ force: true });
    });

    expect(hookState.isEntitled).toBe(false);
    expect(hookState.isUnverifiedOffline).toBe(true);
    expect(hookState.insight?.general_outlook).toBe("Auspicious planetary alignment favors clarity.");
    expect(hookState.insight?.career_business).toBeNull();
    expect(hookState.insight?.finance_wealth).toBeNull();

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Offline Mode — Subscription Unverified");
    expect(renderedText).toContain("Unable to verify your active subscription while offline");
    expect(renderedText).not.toContain("Paid Vedic Guidance");
  });

  // =========================================================================
  // Test I — Backend confirms not entitled
  // =========================================================================
  test("Test I — Backend confirms not entitled displays subscription lock and evicts cache", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        success: false,
        is_entitled: false,
        error: "An active Vedic Astrology subscription is required to access Daily Insights.",
      },
      error: null,
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.isEntitled).toBe(false);
    expect(hookState.insight).toBeNull();
    expect(hookState.isUnverifiedOffline).toBe(false);

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Paid Vedic Guidance");
    expect(renderedText).toContain("Unlock Daily Astrological Insights ✨");
    expect(renderedText).not.toContain("Unable to Load Daily Guidance");
  });

  // =========================================================================
  // Test J — Visible Retry action calls guarded refresh path
  // =========================================================================
  test("Test J — Visible Retry action on error state triggers guarded refresh", async () => {
    let rpcCallCount = 0;
    (supabase.rpc as jest.Mock).mockImplementation(() => {
      rpcCallCount++;
      return Promise.resolve({
        data: null,
        error: { code: "500", message: "Temporary database failure" },
      });
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(rpcCallCount).toBe(1);
    expect(hookState.error).toBe("Temporary database failure");

    const tryAgainBtn = renderer.root.findByProps({ title: "Try Again" });
    expect(tryAgainBtn).toBeTruthy();

    await act(async () => {
      tryAgainBtn.props.onPress();
    });

    expect(rpcCallCount).toBe(2);
  });

  // =========================================================================
  // Test K — Successful retry
  // =========================================================================
  test("Test K — Successful retry after failure clears error and displays valid content", async () => {
    let shouldFail = true;
    (supabase.rpc as jest.Mock).mockImplementation(() => {
      if (shouldFail) {
        return Promise.resolve({
          data: null,
          error: { code: "500", message: "Service temporarily unavailable" },
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
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.error).toBe("Service temporarily unavailable");
    let text = extractAllText(renderer.toJSON());
    expect(text).toContain("Unable to Load Daily Guidance for Mesha");

    // Clear backend error and press retry
    shouldFail = false;
    const tryAgainBtn = renderer.root.findByProps({ title: "Try Again" });

    await act(async () => {
      tryAgainBtn.props.onPress();
    });

    expect(hookState.error).toBeNull();
    expect(hookState.isEntitled).toBe(true);
    expect(hookState.insight?.general_outlook).toContain("Auspicious planetary alignment favors clarity");

    text = extractAllText(renderer.toJSON());
    expect(text).toContain("Auspicious planetary alignment favors clarity");
    expect(text).not.toContain("Unable to Load Daily Guidance");
  });

  // =========================================================================
  // Test L — Current request failure from older Rashi does not overwrite newer Rashi state
  // =========================================================================
  test("Test L — Current request failure after Rashi switch does not overwrite current Rashi state", async () => {
    let resolveRashi1: any;
    let rejectRashi1: any;
    const rashi1Promise = new Promise((res, rej) => {
      resolveRashi1 = res;
      rejectRashi1 = rej;
    });

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string, args: any) => {
      if (args.p_rashi_id === 1) {
        return rashi1Promise;
      }
      if (args.p_rashi_id === 2) {
        return Promise.resolve({
          data: {
            success: true,
            is_entitled: true,
            content: {
              ...samplePremiumInsight,
              rashi_id: 2,
              rashi_name: "Vrishabha",
              general_outlook: "Venus bestows tranquility and material stability.",
            },
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
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} rashiId={1} />
      );
    });

    // Switch to Rashi 2 (Vrishabha) while Rashi 1 is in-flight
    await act(async () => {
      await hookState.selectRashi(2);
    });

    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_name).toBe("Vrishabha");
    expect(hookState.error).toBeNull();

    // Now fail the slow Rashi 1 request
    await act(async () => {
      rejectRashi1(new Error("Stale Rashi 1 network error"));
    });

    // Rashi 2 state must remain intact
    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_name).toBe("Vrishabha");
    expect(hookState.error).toBeNull();

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Venus bestows tranquility and material stability");
    expect(renderedText).not.toContain("Stale Rashi 1 network error");
  });

  // =========================================================================
  // Test M — Lifecycle revalidation regression
  // =========================================================================
  test("Test M — Lifecycle revalidation bypasses cache and respects confirmed non-entitled backend state", async () => {
    let isSubRevoked = false;

    (supabase.rpc as jest.Mock).mockImplementation(() => {
      if (isSubRevoked) {
        return Promise.resolve({
          data: {
            success: false,
            is_entitled: false,
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
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.isEntitled).toBe(true);

    // Midday subscription revocation happens on backend
    isSubRevoked = true;

    // App goes to background then returns to foreground
    act(() => {
      appStateListeners.forEach((l) => l("background"));
    });

    jest.useFakeTimers({ advanceTimers: true });
    jest.advanceTimersByTime(3000);

    await act(async () => {
      appStateListeners.forEach((l) => l("active"));
    });

    expect(hookState.isEntitled).toBe(false);
    expect(hookState.insight).toBeNull();

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Paid Vedic Guidance");
    expect(renderedText).toContain("Unlock Daily Astrological Insights ✨");
  });

  // =========================================================================
  // Test N — Core contract and free attributes no regression
  // =========================================================================
  test("Test N — Auspicious color, number, and multilingual parameters operate without regression", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        is_entitled: true,
        content: {
          ...samplePremiumInsight,
          auspicious_color: "Golden Yellow",
          auspicious_number: 3,
        },
      },
      error: null,
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AstrologyHarness onStateUpdate={(st) => (hookState = st)} />
      );
    });

    expect(hookState.insight?.auspicious_color).toBe("Golden Yellow");
    expect(hookState.insight?.auspicious_number).toBe(3);

    const renderedText = extractAllText(renderer.toJSON());
    expect(renderedText).toContain("Golden Yellow");
    expect(renderedText).toContain("3");
  });
});
