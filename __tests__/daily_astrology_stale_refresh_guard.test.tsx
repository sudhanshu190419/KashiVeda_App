// __tests__/daily_astrology_stale_refresh_guard.test.tsx
/**
 * AST-03 Regression Test Suite:
 * Prevent Stale Manual Refresh Results
 *
 * Verifies that:
 * Test A: Older manual refresh for Rashi A completing after Rashi B selection cannot overwrite B's content.
 * Test B: Reverse completion order: Older refresh resolving before new selection completes cannot contaminate state.
 * Test C: Obsolete request failure does not overwrite current result, error state, or loading state.
 * Test D: Unmount protection prevents obsolete responses from updating unmounted state or corrupting remounts.
 * Test E: Repeated refreshes for the same Rashi preserve strictly the latest request result.
 * Test F: Authentication transitions (logout / account switch) discard prior user requests.
 * Test G: Legitimate errors from the current valid request are correctly handled and surfaced.
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
import {
  useDailyRashiInsight,
  UseDailyRashiInsightResult,
} from "../src/features/astrology/hooks/useDailyRashiInsight.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(15000);

let mockCurrentUser: { id: string; email?: string } | null = { id: "devotee-ast-03-uuid" };

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

// Test Harness Component combining hook and card display
const TestHarness: React.FC<{
  onStateUpdate?: (state: UseDailyRashiInsightResult) => void;
  initialRashiId?: number;
}> = ({ onStateUpdate, initialRashiId = 1 }) => {
  const result = useDailyRashiInsight(initialRashiId);

  // Synchronously notify on every render so the latest hook state is always immediately available
  onStateUpdate?.(result);

  return (
    <DailyRashiInsightCard
      rashi={result.selectedRashi}
      insight={result.insight}
      loading={result.loading}
      isEntitled={result.isEntitled}
      isUnverifiedOffline={result.isUnverifiedOffline}
    />
  );
};

describe("AST-03: Prevent Stale Manual Refresh Results", () => {
  const ariesInsight: DailyRashiInsight = {
    id: "insight-aries-1",
    insight_date: "2026-10-10",
    rashi_id: 1,
    rashi_name: "Mesha",
    language: "en",
    general_outlook: "Aries: Dynamic martial energy fuels bold beginnings.",
    career_business: "Aries: Lead initiatives assertively.",
    finance_wealth: "Aries: Watch impulsive expenditures.",
    love_relationships: "Aries: Passionate encounters.",
    health_wellbeing: "Aries: Channel excess heat.",
    auspicious_color: "Red",
    auspicious_number: 9,
    status: "published",
  };

  const taurusInsight: DailyRashiInsight = {
    id: "insight-taurus-2",
    insight_date: "2026-10-10",
    rashi_id: 2,
    rashi_name: "Vrishabha",
    language: "en",
    general_outlook: "Taurus: Venusian grounding brings steady progress.",
    career_business: "Taurus: Consolidate existing gains patiently.",
    finance_wealth: "Taurus: Stable accumulation in tangible assets.",
    love_relationships: "Taurus: Deep loyalty and domestic comfort.",
    health_wellbeing: "Taurus: Nurture throat and vocal cords.",
    auspicious_color: "White",
    auspicious_number: 6,
    status: "published",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCurrentUser = { id: "devotee-ast-03-uuid" };
    dailyRashiService.clearSessionCache();
    await AsyncStorage.clear();

    // Default: RPC handles set_customer_preferred_rashi immediately, and serves insights by rashi
    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string, params: any) => {
      if (rpcName === "set_customer_preferred_rashi") {
        return Promise.resolve({ error: null });
      }
      if (rpcName === "get_daily_rashi_insight") {
        if (!mockCurrentUser) {
          return Promise.resolve({
            data: { success: false, is_entitled: false, content: null, error: "Auth required" },
            error: null,
          });
        }
        const content = params?.p_rashi_id === 2 ? taurusInsight : ariesInsight;
        return Promise.resolve({
          data: {
            success: true,
            is_entitled: true,
            content,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  // ===========================================================================
  // TEST A: Older manual refresh completes last
  // ===========================================================================
  it("Test A: Older manual refresh for Aries completing after Taurus selection cannot overwrite Taurus content", async () => {
    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    // 1. Initial mount as Aries (1)
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <TestHarness initialRashiId={1} onStateUpdate={(state) => (hookState = state)} />
      );
    });

    expect(hookState.selectedRashiId).toBe(1);
    expect(hookState.insight?.rashi_id).toBe(1);
    expect(hookState.insight?.general_outlook).toContain("Aries: Dynamic martial energy");

    let treeJson = JSON.stringify(renderer.toJSON());
    expect(treeJson).toContain("Mesha");
    expect(treeJson).toContain("Aries: Dynamic martial energy");

    // 2. Prepare controlled promises for refresh and Taurus load
    let resolveAriesRefresh: (val: any) => void;
    const ariesRefreshPromise = new Promise((resolve) => {
      resolveAriesRefresh = resolve;
    });

    let resolveTaurusLoad: (val: any) => void;
    const taurusLoadPromise = new Promise((resolve) => {
      resolveTaurusLoad = resolve;
    });

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string, params: any) => {
      if (rpcName === "set_customer_preferred_rashi") {
        return Promise.resolve({ error: null });
      }
      if (rpcName === "get_daily_rashi_insight") {
        if (params?.p_rashi_id === 1) {
          return ariesRefreshPromise;
        }
        if (params?.p_rashi_id === 2) {
          return taurusLoadPromise;
        }
      }
      return Promise.resolve({ data: null, error: null });
    });

    // 3. Trigger Aries manual refresh
    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = hookState.refresh();
    });

    expect(hookState.loading).toBe(true);

    // 4. User selects Taurus (2) while Aries refresh is pending
    await act(async () => {
      await hookState.selectRashi(2);
    });

    expect(hookState.selectedRashiId).toBe(2);

    // 5. Resolve Taurus request first
    await act(async () => {
      resolveTaurusLoad!({
        data: {
          success: true,
          is_entitled: true,
          content: taurusInsight,
        },
        error: null,
      });
    });

    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_id).toBe(2);
    expect(hookState.insight?.general_outlook).toContain("Taurus: Venusian grounding");

    treeJson = JSON.stringify(renderer.toJSON());
    expect(treeJson).toContain("Vrishabha");
    expect(treeJson).toContain("Taurus: Venusian grounding");
    expect(treeJson).not.toContain("Aries: Dynamic martial energy");

    // 6. Older Aries refresh completes AFTER Taurus completed
    await act(async () => {
      resolveAriesRefresh!({
        data: {
          success: true,
          is_entitled: true,
          content: ariesInsight,
        },
        error: null,
      });
      await refreshPromise!;
    });

    // Content MUST STILL belong to Taurus (rashi_id: 2)
    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_id).toBe(2);
    expect(hookState.insight?.general_outlook).toContain("Taurus: Venusian grounding");

    treeJson = JSON.stringify(renderer.toJSON());
    expect(treeJson).toContain("Vrishabha");
    expect(treeJson).toContain("Taurus: Venusian grounding");
    expect(treeJson).not.toContain("Aries: Dynamic martial energy");
    expect(treeJson).not.toContain("Mesha");
  });

  // ===========================================================================
  // TEST B: Reverse completion order
  // ===========================================================================
  it("Test B: Reverse completion order: Older Aries request completing before Taurus finishes is discarded and cannot overwrite Taurus", async () => {
    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <TestHarness initialRashiId={1} onStateUpdate={(state) => (hookState = state)} />
      );
    });

    // 1. Prepare controlled promises
    let resolveAries: (val: any) => void;
    const ariesPromise = new Promise((res) => {
      resolveAries = res;
    });

    let resolveTaurus: (val: any) => void;
    const taurusPromise = new Promise((res) => {
      resolveTaurus = res;
    });

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string, params: any) => {
      if (rpcName === "set_customer_preferred_rashi") return Promise.resolve({ error: null });
      if (rpcName === "get_daily_rashi_insight") {
        if (params?.p_rashi_id === 1) return ariesPromise;
        if (params?.p_rashi_id === 2) return taurusPromise;
      }
      return Promise.resolve({ data: null, error: null });
    });

    // 2. Start manual refresh for Aries
    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = hookState.refresh();
    });

    // 3. Select Taurus (2)
    await act(async () => {
      await hookState.selectRashi(2);
    });

    expect(hookState.selectedRashiId).toBe(2);

    // 4. Resolve Aries BEFORE Taurus finishes
    await act(async () => {
      resolveAries!({
        data: { success: true, is_entitled: true, content: ariesInsight },
        error: null,
      });
      await refreshPromise!;
    });

    // Aries MUST be discarded; insight must not be set to Aries
    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight).toBeNull(); // Still awaiting Taurus

    // 5. Now resolve Taurus
    await act(async () => {
      resolveTaurus!({
        data: { success: true, is_entitled: true, content: taurusInsight },
        error: null,
      });
    });

    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_id).toBe(2);
    expect(hookState.insight?.general_outlook).toContain("Taurus: Venusian grounding");

    const treeJson = JSON.stringify(renderer.toJSON());
    expect(treeJson).toContain("Vrishabha");
    expect(treeJson).not.toContain("Aries: Dynamic martial energy");
  });

  // ===========================================================================
  // TEST C: Obsolete request fails
  // ===========================================================================
  it("Test C: Obsolete request rejection does not overwrite current result, error state, or loading state", async () => {
    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <TestHarness initialRashiId={1} onStateUpdate={(state) => (hookState = state)} />
      );
    });

    // 1. Start Aries refresh with controlled promise
    let rejectAries: (err: any) => void;
    const ariesPromise = new Promise((_res, rej) => {
      rejectAries = rej;
    });

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string, params: any) => {
      if (rpcName === "set_customer_preferred_rashi") return Promise.resolve({ error: null });
      if (rpcName === "get_daily_rashi_insight") {
        if (params?.p_rashi_id === 1) return ariesPromise;
        if (params?.p_rashi_id === 2) {
          return Promise.resolve({
            data: { success: true, is_entitled: true, content: taurusInsight },
            error: null,
          });
        }
      }
      return Promise.resolve({ data: null, error: null });
    });

    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = hookState.refresh();
    });

    // 2. Switch to Taurus and allow Taurus to load successfully
    await act(async () => {
      await hookState.selectRashi(2);
    });

    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_id).toBe(2);
    expect(hookState.error).toBeNull();
    expect(hookState.loading).toBe(false);

    // 3. Obsolete Aries request rejects with an error afterward
    await act(async () => {
      rejectAries!(new Error("Network timeout for Aries"));
      try {
        await refreshPromise!;
      } catch {
        // Catch rejected promise in test
      }
    });

    // Obsolete error MUST be dropped; Taurus result and clean error state MUST remain intact
    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_id).toBe(2);
    expect(hookState.insight?.general_outlook).toContain("Taurus: Venusian grounding");
    expect(hookState.error).toBeNull();
    expect(hookState.loading).toBe(false);

    const treeJson = JSON.stringify(renderer.toJSON());
    expect(treeJson).toContain("Vrishabha");
    expect(treeJson).not.toContain("Network timeout for Aries");
  });

  // ===========================================================================
  // TEST D: Unmount protection
  // ===========================================================================
  it("Test D: Unmount protection prevents obsolete pending requests from updating unmounted state or leaking into remounts", async () => {
    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    let resolvePending: (val: any) => void;
    const pendingPromise = new Promise((res) => {
      resolvePending = res;
    });

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "set_customer_preferred_rashi") return Promise.resolve({ error: null });
      if (rpcName === "get_daily_rashi_insight") return pendingPromise;
      return Promise.resolve({ data: null, error: null });
    });

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <TestHarness initialRashiId={1} onStateUpdate={(state) => (hookState = state)} />
      );
    });

    expect(hookState.loading).toBe(true);

    // Unmount while request is pending
    await act(async () => {
      renderer.unmount();
    });

    // Resolve the pending promise after unmount
    await act(async () => {
      resolvePending!({
        data: { success: true, is_entitled: true, content: ariesInsight },
        error: null,
      });
    });

    // Remount a fresh instance with Taurus (2)
    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string, params: any) => {
      if (rpcName === "set_customer_preferred_rashi") return Promise.resolve({ error: null });
      if (rpcName === "get_daily_rashi_insight") {
        return Promise.resolve({
          data: { success: true, is_entitled: true, content: taurusInsight },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    let newHookState: UseDailyRashiInsightResult = {} as any;
    let newRenderer: any;
    await act(async () => {
      newRenderer = ReactTestRenderer.create(
        <TestHarness initialRashiId={2} onStateUpdate={(state) => (newHookState = state)} />
      );
    });

    expect(newHookState.selectedRashiId).toBe(2);
    expect(newHookState.insight?.rashi_id).toBe(2);
    expect(newHookState.insight?.general_outlook).toContain("Taurus: Venusian grounding");

    const treeJson = JSON.stringify(newRenderer.toJSON());
    expect(treeJson).toContain("Vrishabha");
    expect(treeJson).not.toContain("Mesha");
  });

  // ===========================================================================
  // TEST E: Repeated refreshes for the same Rashi
  // ===========================================================================
  it("Test E: Repeated refreshes for the same Rashi strictly preserve the latest request result when older completes last", async () => {
    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <TestHarness initialRashiId={1} onStateUpdate={(state) => (hookState = state)} />
      );
    });

    const olderAriesResult: DailyRashiInsight = {
      ...ariesInsight,
      general_outlook: "Older Aries snapshot: Morning cosmic outlook.",
    };

    const latestAriesResult: DailyRashiInsight = {
      ...ariesInsight,
      general_outlook: "Latest Aries snapshot: Updated afternoon transits.",
    };

    // 1. User initiates refresh #1
    let resolveRefresh1: (val: any) => void;
    const refresh1Promise = new Promise((res) => {
      resolveRefresh1 = res;
    });

    // 2. User immediately initiates refresh #2
    let resolveRefresh2: (val: any) => void;
    const refresh2Promise = new Promise((res) => {
      resolveRefresh2 = res;
    });

    let callCount = 0;
    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "set_customer_preferred_rashi") return Promise.resolve({ error: null });
      if (rpcName === "get_daily_rashi_insight") {
        callCount++;
        if (callCount === 1) return refresh1Promise;
        if (callCount === 2) return refresh2Promise;
      }
      return Promise.resolve({ data: null, error: null });
    });

    let p1: Promise<void>;
    act(() => {
      p1 = hookState.refresh();
    });

    let p2: Promise<void>;
    act(() => {
      p2 = hookState.refresh();
    });

    // 3. Resolve refresh #2 (the newer one) first
    await act(async () => {
      resolveRefresh2!({
        data: { success: true, is_entitled: true, content: latestAriesResult },
        error: null,
      });
      await p2!;
    });

    expect(hookState.insight?.general_outlook).toBe("Latest Aries snapshot: Updated afternoon transits.");

    // 4. Resolve refresh #1 (the older one) afterward
    await act(async () => {
      resolveRefresh1!({
        data: { success: true, is_entitled: true, content: olderAriesResult },
        error: null,
      });
      await p1!;
    });

    // Content MUST STILL be the latest request result
    expect(hookState.insight?.general_outlook).toBe("Latest Aries snapshot: Updated afternoon transits.");
    expect(hookState.insight?.general_outlook).not.toBe("Older Aries snapshot: Morning cosmic outlook.");

    const treeJson = JSON.stringify(renderer.toJSON());
    expect(treeJson).toContain("Latest Aries snapshot: Updated afternoon transits.");
    expect(treeJson).not.toContain("Older Aries snapshot: Morning cosmic outlook.");
  });

  // ===========================================================================
  // TEST F: Authentication transition regression
  // ===========================================================================
  it("Test F: Results from a previous user cannot be committed after logout or account switching", async () => {
    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    let resolveUserACall: (val: any) => void;
    const userAPromise = new Promise((res) => {
      resolveUserACall = res;
    });

    (supabase.rpc as jest.Mock).mockImplementation((rpcName: string) => {
      if (rpcName === "set_customer_preferred_rashi") return Promise.resolve({ error: null });
      if (rpcName === "get_daily_rashi_insight") {
        if (!mockCurrentUser) {
          return Promise.resolve({
            data: { success: false, is_entitled: false, content: null, error: "Auth required" },
            error: null,
          });
        }
        return userAPromise;
      }
      return Promise.resolve({ data: null, error: null });
    });

    mockCurrentUser = { id: "user-a-uuid" };
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <TestHarness initialRashiId={1} onStateUpdate={(state) => (hookState = state)} />
      );
    });

    expect(hookState.loading).toBe(true);

    // User logs out while User A's request is pending
    await act(async () => {
      mockCurrentUser = null;
      renderer.update(
        <TestHarness initialRashiId={1} onStateUpdate={(state) => (hookState = state)} />
      );
    });

    // Old User A call finishes afterward
    await act(async () => {
      resolveUserACall!({
        data: { success: true, is_entitled: true, content: ariesInsight },
        error: null,
      });
    });

    // Must be completely dropped; state remains null and not entitled
    expect(hookState.insight).toBeNull();
    expect(hookState.isEntitled).toBe(false);

    const treeJson = JSON.stringify(renderer.toJSON());
    expect(treeJson).not.toContain("Aries: Dynamic martial energy fuels bold beginnings.");
  });

  // ===========================================================================
  // TEST G: Current request errors
  // ===========================================================================
  it("Test G: Legitimate errors from the current valid request are surfaced and not suppressed", async () => {
    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <TestHarness initialRashiId={1} onStateUpdate={(state) => (hookState = state)} />
      );
    });

    expect(hookState.insight).not.toBeNull();
    expect(hookState.error).toBeNull();

    // Clear offline cache so network failure surfaces raw error
    await AsyncStorage.clear();
    dailyRashiService.clearSessionCache();

    // Trigger manual refresh with real network failure
    (supabase.rpc as jest.Mock).mockRejectedValueOnce(
      new Error("Authoritative Vedic planetary engine timeout")
    );

    await act(async () => {
      await hookState.refresh();
    });

    // The current request's error MUST be handled and surfaced
    expect(hookState.error).toContain("Authoritative Vedic planetary engine timeout");
    expect(hookState.isEntitled).toBe(false);
    expect(hookState.loading).toBe(false);
  });
});
