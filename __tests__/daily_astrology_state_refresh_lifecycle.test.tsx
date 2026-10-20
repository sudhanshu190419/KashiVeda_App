// __tests__/daily_astrology_state_refresh_lifecycle.test.tsx
/**
 * AST-04 Comprehensive Regression Test Suite:
 * Refresh State on Date, Authentication, and Entitlement Changes
 *
 * Verifies that:
 * Test A: Indian midnight rollover detects date rollover, clears yesterday's insight, and requests new date.
 * Test B: Device timezone independence resolves correct Indian calendar date across global timezones and boundaries.
 * Test C: Foreground after midnight rechecks Indian date and reloads content.
 * Test D: Foreground subscription refresh re-executes query and reflects latest backend response.
 * Test E: Return after checkout revalidates subscription and updates daily entitlement upon confirmation.
 * Test F: Login, logout, and account switch immediately clears previous state and drops obsolete responses.
 * Test G: Subscription boundary fires bounded one-shot refresh at expiration without periodic polling.
 * Test H: Focus and foreground deduplication prevents burst of duplicate requests.
 * Test I: Request failure during rollover clears yesterday's content and avoids false expiration claim.
 * Test J: AST-03 regression confirms earlier Rashi cannot overwrite selected Rashi during refresh.
 */

import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { AppState } from "react-native";
import {
  getIndianCalendarDate,
  getMsUntilNextIndianMidnight,
} from "../src/shared/utils/date.ts";
import { dailyRashiService } from "../src/features/astrology/services/dailyRashiService.ts";
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import {
  useDailyRashiInsight,
  UseDailyRashiInsightResult,
} from "../src/features/astrology/hooks/useDailyRashiInsight.ts";
import { useCustomerSubscription } from "../src/features/astrology/hooks/useCustomerSubscription.ts";
import { DailyRashiInsightCard } from "../src/features/astrology/components/DailyRashiInsightCard.tsx";
import { AstrologyScreen } from "../src/features/astrology/screens/AstrologyScreen.tsx";
import { AstrologySubscription } from "../src/features/astrology/types/astrology.types.ts";
import { astrologyEventBus } from "../src/features/astrology/services/astrologyEventBus.ts";

let mockCurrentUser: { id: string; email?: string } | null = { id: "devotee-ast-04-uuid" };
let mockFocusCallback: (() => void) | null = null;

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    NavigationContainer: ({ children }: any) => children,
    useNavigation: () => ({
      navigate: jest.fn(),
      replace: jest.fn(),
      goBack: jest.fn(),
    }),
    useRoute: () => ({ params: {} }),
    useFocusEffect: (callback: any) => {
      mockFocusCallback = callback;
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

// Hook test harness for daily insight
const DailyInsightHarness: React.FC<{
  onStateUpdate?: (state: UseDailyRashiInsightResult) => void;
  initialRashiId?: number;
}> = ({ onStateUpdate, initialRashiId = 1 }) => {
  const result = useDailyRashiInsight(initialRashiId);
  onStateUpdate?.(result);
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

// Hook test harness for customer subscription
const SubscriptionHarness: React.FC<{
  onStateUpdate?: (state: ReturnType<typeof useCustomerSubscription>) => void;
}> = ({ onStateUpdate }) => {
  const result = useCustomerSubscription();
  onStateUpdate?.(result);
  return null;
};

describe("AST-04: Refresh State on Date, Authentication, and Entitlement Changes", () => {
  let appStateListeners: Array<(state: string) => void> = [];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    astrologyEventBus.clear();
    mockCurrentUser = { id: "devotee-ast-04-uuid" };
    mockFocusCallback = null;
    appStateListeners = [];

    // Capture AppState listeners
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

  // -------------------------------------------------------------------------
  // Test A — Indian midnight rollover
  // -------------------------------------------------------------------------
  test("Test A: Indian midnight rollover detects new date, clears yesterday's insight, and requests new date", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    // Set system time to 23:59:50 IST on Oct 10, 2026 (18:29:50 UTC)
    jest.setSystemTime(new Date("2026-10-10T18:29:50.000Z"));

    const oct10Insight = {
      id: "insight-oct-10",
      rashi_id: 1,
      insight_date: "2026-10-10",
      general_outlook: "Oct 10: Favorable planetary alignment for Aries.",
      is_premium_unlocked: true,
      guidance_level: "detailed",
    } as any;

    const oct11Insight = {
      id: "insight-oct-11",
      rashi_id: 1,
      insight_date: "2026-10-11",
      general_outlook: "Oct 11: Auspicious lunar transit for Aries.",
      is_premium_unlocked: true,
      guidance_level: "detailed",
    } as any;

    const fetchSpy = jest.spyOn(dailyRashiService, "fetchDailyInsight").mockImplementation(
      async (date, _rashiId) => {
        if (date === "2026-10-10") {
          return { success: true, is_entitled: true, is_unverified: false, content: oct10Insight };
        }
        if (date === "2026-10-11") {
          return { success: true, is_entitled: true, is_unverified: false, content: oct11Insight };
        }
        return { success: true, is_entitled: false, is_unverified: false, content: null };
      }
    );

    let hookState: UseDailyRashiInsightResult = {} as any;
    let renderer: any;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <DailyInsightHarness
          initialRashiId={1}
          onStateUpdate={(st) => {
            hookState = st;
          }}
        />
      );
    });

    expect(hookState.insight?.insight_date).toBe("2026-10-10");
    expect(hookState.insight?.general_outlook).toContain("Oct 10");
    expect(fetchSpy).toHaveBeenCalledWith("2026-10-10", 1, "en", "devotee-ast-04-uuid");

    // Advance system time past Indian midnight to 00:00:10 IST on Oct 11, 2026 (18:30:10 UTC)
    jest.setSystemTime(new Date("2026-10-10T18:30:10.000Z"));

    // Advance fake timers by 25 seconds (timer delay was msUntilMidnight ~10s + 250ms buffer)
    await act(async () => {
      jest.advanceTimersByTime(25000);
    });

    // Content must have updated to Oct 11
    expect(hookState.insight?.insight_date).toBe("2026-10-11");
    expect(hookState.insight?.general_outlook).toContain("Oct 11");
    expect(fetchSpy).toHaveBeenCalledWith("2026-10-11", 1, "en", "devotee-ast-04-uuid", expect.anything());
    expect(hookState.selectedRashiId).toBe(1); // Selected Rashi preserved
    expect(renderer).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test B — Device timezone independence
  // -------------------------------------------------------------------------
  test("Test B: Device timezone independence resolves correct Indian calendar date near midnight", () => {
    // 1. One second before Indian midnight (18:29:59.000 UTC)
    const justBeforeMidnight = new Date("2026-10-10T18:29:59.000Z");
    expect(getIndianCalendarDate(justBeforeMidnight)).toBe("2026-10-10");
    const msUntil1 = getMsUntilNextIndianMidnight(justBeforeMidnight);
    expect(msUntil1).toBe(1000); // Exactly 1 second remaining

    // 2. Exact Indian midnight (18:30:00.000 UTC)
    const exactMidnight = new Date("2026-10-10T18:30:00.000Z");
    expect(getIndianCalendarDate(exactMidnight)).toBe("2026-10-11");
    const msUntil2 = getMsUntilNextIndianMidnight(exactMidnight);
    expect(msUntil2).toBe(24 * 60 * 60 * 1000); // Exactly 24 hours remaining until next midnight

    // 3. One second after Indian midnight (18:30:01.000 UTC)
    const justAfterMidnight = new Date("2026-10-10T18:30:01.000Z");
    expect(getIndianCalendarDate(justAfterMidnight)).toBe("2026-10-11");
    const msUntil3 = getMsUntilNextIndianMidnight(justAfterMidnight);
    expect(msUntil3).toBe(24 * 60 * 60 * 1000 - 1000); // 23h 59m 59s

    // 4. Middle of the day IST: 12:00:00 PM IST is 06:30:00 UTC
    const midDay = new Date("2026-10-11T06:30:00.000Z");
    expect(getIndianCalendarDate(midDay)).toBe("2026-10-11");
    expect(getMsUntilNextIndianMidnight(midDay)).toBe(12 * 60 * 60 * 1000); // 12 hours remaining
  });

  // -------------------------------------------------------------------------
  // Test C — Foreground after midnight
  // -------------------------------------------------------------------------
  test("Test C: Backgrounding app across midnight and returning to foreground refreshes daily content", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-10T17:00:00.000Z")); // 22:30 IST on Oct 10

    const oct10Insight = { id: "in-10", insight_date: "2026-10-10", rashi_id: 1, general_outlook: "Oct 10 text" } as any;
    const oct11Insight = { id: "in-11", insight_date: "2026-10-11", rashi_id: 1, general_outlook: "Oct 11 text" } as any;

    const fetchSpy = jest.spyOn(dailyRashiService, "fetchDailyInsight").mockImplementation(
      async (date) => {
        if (date === "2026-10-10") return { success: true, is_entitled: true, is_unverified: false, content: oct10Insight };
        if (date === "2026-10-11") return { success: true, is_entitled: true, is_unverified: false, content: oct11Insight };
        return { success: true, is_entitled: false, is_unverified: false, content: null };
      }
    );

    let hookState: UseDailyRashiInsightResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <DailyInsightHarness
          initialRashiId={1}
          onStateUpdate={(st) => {
            hookState = st;
          }}
        />
      );
    });

    expect(hookState.insight?.insight_date).toBe("2026-10-10");

    // User backgrounded the app
    act(() => {
      appStateListeners.forEach((l) => l("background"));
    });

    // Time advances across Indian midnight into Oct 11 (01:00 IST = 19:30 UTC)
    jest.setSystemTime(new Date("2026-10-10T19:30:00.000Z"));

    // User returns to the app
    await act(async () => {
      appStateListeners.forEach((l) => l("active"));
    });

    // Content must have refreshed for Oct 11
    expect(hookState.insight?.insight_date).toBe("2026-10-11");
    expect(hookState.insight?.general_outlook).toContain("Oct 11 text");
    expect(fetchSpy).toHaveBeenCalledWith("2026-10-11", 1, "en", "devotee-ast-04-uuid", expect.anything());
  });

  // -------------------------------------------------------------------------
  // Test D — Foreground subscription refresh
  // -------------------------------------------------------------------------
  test("Test D: Foreground transition re-queries subscription and reflects changed backend state", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-10T10:00:00.000Z"));

    let backendSubscription: AstrologySubscription | null = null;
    const subSpy = jest.spyOn(astrologyService, "getCustomerSubscription").mockImplementation(async () => {
      return backendSubscription;
    });

    let hookState: ReturnType<typeof useCustomerSubscription> = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness
          onStateUpdate={(st) => {
            hookState = st;
          }}
        />
      );
    });

    expect(hookState.subscription).toBeNull();
    expect(hookState.isActive).toBe(false);

    // App backgrounded
    act(() => {
      appStateListeners.forEach((l) => l("background"));
    });

    // While in background, user activated subscription (or webhook confirmed)
    backendSubscription = {
      id: "sub-fresh-1",
      customer_id: "devotee-ast-04-uuid",
      plan_id: "plan-monthly-1",
      payment_order_id: "po-1",
      starts_at: "2026-10-10T10:00:00Z",
      ends_at: "2026-11-10T10:00:00Z",
      status: "active",
      created_at: "2026-10-10T10:00:00Z",
    };

    // Advance time past deduplication cooldown
    jest.advanceTimersByTime(5000);

    // App returns to foreground
    await act(async () => {
      appStateListeners.forEach((l) => l("active"));
    });

    expect(hookState.subscription?.id).toBe("sub-fresh-1");
    expect(hookState.isActive).toBe(true);
    expect(subSpy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test E — Return after checkout
  // -------------------------------------------------------------------------
  test("Test E: Return after checkout revalidates subscription and reconciles daily insight entitlement", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-10T10:00:00.000Z"));

    let isSubscribed = false;

    jest.spyOn(astrologyService, "getActivePlans").mockResolvedValue([
      {
        id: "plan-1",
        name: "Monthly",
        duration_days: 30,
        price: 501,
        currency: "INR",
        daily_in_app_enabled: true,
        weekly_whatsapp_enabled: true,
        is_active: true,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
    ]);

    jest.spyOn(astrologyService, "getCustomerSubscription").mockImplementation(async () => {
      if (!isSubscribed) return null;
      return {
        id: "sub-post-checkout",
        customer_id: "devotee-ast-04-uuid",
        plan_id: "plan-1",
        payment_order_id: "po-1",
        starts_at: "2026-10-10T10:00:00Z",
        ends_at: "2026-11-10T10:00:00Z",
        status: "active",
        created_at: "2026-10-10T10:00:00Z",
      };
    });

    jest.spyOn(astrologyService, "getPublishedContent").mockResolvedValue({ items: [], count: 0, hasMore: false });

    jest.spyOn(dailyRashiService, "fetchDailyInsight").mockImplementation(async () => {
      return {
        success: true,
        is_entitled: isSubscribed,
        is_unverified: false,
        content: isSubscribed
          ? ({
              id: "in-unlocked",
              rashi_id: 1,
              insight_date: "2026-10-10",
              general_outlook: "Unlocked premium planetary wisdom for devotee.",
              career_business: "Prosperous leadership transit.",
              finance_wealth: "Favorable investment opportunity.",
              guidance_level: "detailed",
              is_premium_unlocked: true,
            } as any)
          : null,
      };
    });

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<AstrologyScreen />);
    });

    // Initially, user is not entitled (shows subscribe CTA)
    let text = extractAllText(renderer.toJSON());
    expect(text).toContain("Paid Vedic Guidance");

    // User navigates to checkout, completes payment
    isSubscribed = true;
    jest.advanceTimersByTime(10000); // 10s checkout duration

    // User returns to AstrologyScreen (triggers navigation focus effect)
    await act(async () => {
      mockFocusCallback?.();
    });

    text = extractAllText(renderer.toJSON());
    expect(text).toContain("Unlocked premium planetary wisdom for devotee");
    expect(text).toContain("Prosperous leadership transit");
  });

  // -------------------------------------------------------------------------
  // Test F — Login, logout, and account switch
  // -------------------------------------------------------------------------
  test("Test F: Logout and account switch immediately clears previous-user content and ignores late responses", async () => {
    let resolveUserA: (val: any) => void;
    const userAPromise = new Promise((res) => {
      resolveUserA = res;
    });

    jest.spyOn(dailyRashiService, "fetchDailyInsight").mockImplementation(async (_d, _r, _l, userId) => {
      if (userId === "user-A") {
        return userAPromise as any;
      }
      if (userId === "user-B") {
        return {
          success: true,
          is_entitled: true,
          is_unverified: false,
          content: { id: "in-B", rashi_id: 1, insight_date: "2026-10-10", general_outlook: "User B Outlook" } as any,
        };
      }
      return { success: true, is_entitled: false, is_unverified: false, content: null };
    });

    let subResolveUserA: (val: any) => void;
    const subUserAPromise = new Promise((res) => {
      subResolveUserA = res;
    });

    jest.spyOn(astrologyService, "getCustomerSubscription").mockImplementation(async (userId) => {
      if (userId === "user-A") {
        return subUserAPromise as any;
      }
      if (userId === "user-B") {
        return {
          id: "sub-B",
          customer_id: "user-B",
          plan_id: "plan-1",
          payment_order_id: "po-B",
          starts_at: "2026-10-10T00:00:00Z",
          ends_at: "2026-11-10T00:00:00Z",
          status: "active",
          created_at: "2026-10-10T00:00:00Z",
        };
      }
      return null;
    });

    mockCurrentUser = { id: "user-A" };

    let insightState: UseDailyRashiInsightResult = {} as any;
    let subState: ReturnType<typeof useCustomerSubscription> = {} as any;

    const TestComponent: React.FC = () => {
      insightState = useDailyRashiInsight(1);
      subState = useCustomerSubscription();
      return null;
    };

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<TestComponent />);
    });

    // 1. Resolve User A's data
    await act(async () => {
      resolveUserA!({
        success: true,
        is_entitled: true,
        is_unverified: false,
        content: { id: "in-A", rashi_id: 1, insight_date: "2026-10-10", general_outlook: "User A Sensitive Insight" },
      });
      subResolveUserA!({
        id: "sub-A",
        customer_id: "user-A",
        plan_id: "plan-1",
        payment_order_id: "po-A",
        starts_at: "2026-10-10T00:00:00Z",
        ends_at: "2026-11-10T00:00:00Z",
        status: "active",
        created_at: "2026-10-10T00:00:00Z",
      });
    });

    expect(insightState.insight?.general_outlook).toBe("User A Sensitive Insight");
    expect(subState.subscription?.id).toBe("sub-A");

    // 2. User logs out: immediate clearing
    mockCurrentUser = null;
    await act(async () => {
      renderer.update(<TestComponent />);
    });

    expect(insightState.insight).toBeNull();
    expect(insightState.isEntitled).toBe(false);
    expect(subState.subscription).toBeNull();
    expect(subState.isActive).toBe(false);

    // 3. User B logs in
    mockCurrentUser = { id: "user-B" };
    await act(async () => {
      renderer.update(<TestComponent />);
    });

    expect(insightState.insight?.general_outlook).toBe("User B Outlook");
    expect(subState.subscription?.id).toBe("sub-B");
    expect(subState.isActive).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test G — Subscription boundary
  // -------------------------------------------------------------------------
  test("Test G: Subscription expiration boundary triggers scheduled one-shot refresh without polling", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    // Start at 10:00:00 UTC
    jest.setSystemTime(new Date("2026-10-10T10:00:00.000Z"));

    // Subscription expires in 10 minutes at 10:10:00 UTC
    let currentBackendSub: AstrologySubscription | null = {
      id: "sub-expiring",
      customer_id: "devotee-ast-04-uuid",
      plan_id: "plan-1",
      payment_order_id: "po-1",
      starts_at: "2026-09-10T10:00:00Z",
      ends_at: "2026-10-10T10:10:00Z",
      status: "active",
      created_at: "2026-09-10T10:00:00Z",
    };

    const subSpy = jest.spyOn(astrologyService, "getCustomerSubscription").mockImplementation(async () => {
      return currentBackendSub;
    });

    let subState: ReturnType<typeof useCustomerSubscription> = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness
          onStateUpdate={(st) => {
            subState = st;
          }}
        />
      );
    });

    expect(subState.isActive).toBe(true);
    expect(subSpy).toHaveBeenCalledTimes(1);

    // Advance 5 minutes (no timer should fire, no polling)
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(subSpy).toHaveBeenCalledTimes(1);

    // At 10 minutes, subscription expires in backend
    currentBackendSub = {
      ...currentBackendSub,
      status: "expired",
    };

    // Advance across expiration boundary (+5m and 1s)
    jest.setSystemTime(new Date("2026-10-10T10:10:01.000Z"));
    await act(async () => {
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
    });

    // Exactly one bounded refresh ran at expiration
    expect(subSpy).toHaveBeenCalledTimes(2);
    expect(subState.isActive).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test H — Focus and foreground deduplication
  // -------------------------------------------------------------------------
  test("Test H: Concurrent focus and foreground events are deduplicated to a single request", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-10T10:00:00.000Z"));

    const insightSpy = jest.spyOn(dailyRashiService, "fetchDailyInsight").mockResolvedValue({
      success: true,
      is_entitled: true,
      is_unverified: false,
      content: { id: "in-1", rashi_id: 1, insight_date: "2026-10-10", general_outlook: "Outlook" } as any,
    });

    const subSpy = jest.spyOn(astrologyService, "getCustomerSubscription").mockResolvedValue({
      id: "sub-1",
      customer_id: "devotee-ast-04-uuid",
      plan_id: "plan-1",
      payment_order_id: "po-1",
      starts_at: "2026-10-10T00:00:00Z",
      ends_at: "2026-11-10T00:00:00Z",
      status: "active",
      created_at: "2026-10-10T00:00:00Z",
    });

    let hookDaily: UseDailyRashiInsightResult = {} as any;
    let hookSub: ReturnType<typeof useCustomerSubscription> = {} as any;

    const DualHarness: React.FC = () => {
      hookDaily = useDailyRashiInsight(1);
      hookSub = useCustomerSubscription();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(<DualHarness />);
    });

    expect(insightSpy).toHaveBeenCalledTimes(1);
    expect(subSpy).toHaveBeenCalledTimes(1);

    // Advance time past initial mount
    jest.advanceTimersByTime(5000);

    // Simultaneously trigger AppState active AND navigation focus
    await act(async () => {
      appStateListeners.forEach((l) => l("active"));
      hookDaily.refresh({ force: false });
      hookSub.refresh({ force: false });
    });

    // Deduplication should ensure only 1 extra request was made for each, not 2 or 3!
    expect(insightSpy).toHaveBeenCalledTimes(2);
    expect(subSpy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test I — Request failure during rollover
  // -------------------------------------------------------------------------
  test("Test I: Rollover request failure clears yesterday's insight and renders offline retry without false expiration", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-10T18:29:50.000Z")); // 23:59:50 IST Oct 10

    const oct10Insight = { id: "in-10", insight_date: "2026-10-10", rashi_id: 1, general_outlook: "Oct 10 Text" } as any;

    jest.spyOn(dailyRashiService, "fetchDailyInsight").mockImplementation(async (date) => {
      if (date === "2026-10-10") {
        return { success: true, is_entitled: true, is_unverified: false, content: oct10Insight };
      }
      // Oct 11 fails due to network outage
      throw new Error("Network request failed");
    });

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<DailyInsightHarness initialRashiId={1} />);
    });

    let str = extractAllText(renderer.toJSON());
    expect(str).toContain("Oct 10 Text");

    // Advance across midnight to Oct 11
    jest.setSystemTime(new Date("2026-10-10T18:30:10.000Z"));
    await act(async () => {
      jest.advanceTimersByTime(25000);
    });

    str = extractAllText(renderer.toJSON());
    // Yesterday's content must NOT be displayed
    expect(str).not.toContain("Oct 10 Text");
    // Offline mode is displayed with retry button
    expect(str).toContain("Offline Mode");
    expect(str).toContain("Unable to verify subscription status while offline");
    expect(str).toContain("Retry Connection");
    // MUST NOT falsely claim that the subscription has expired
    expect(str).not.toContain("expired");
  });

  // -------------------------------------------------------------------------
  // Test J — AST-03 regression
  // -------------------------------------------------------------------------
  test("Test J: AST-03 regression: Earlier Rashi request cannot overwrite selected Rashi following refresh", async () => {
    let resolveAries: (val: any) => void;
    const ariesPromise = new Promise((res) => {
      resolveAries = res;
    });

    const taurusInsight = {
      id: "in-taurus",
      rashi_id: 2,
      insight_date: "2026-10-10",
      general_outlook: "Taurus: Venusian stability",
    } as any;

    jest.spyOn(dailyRashiService, "fetchDailyInsight").mockImplementation(async (_d, rashiId) => {
      if (rashiId === 1) return ariesPromise as any;
      if (rashiId === 2) return { success: true, is_entitled: true, is_unverified: false, content: taurusInsight };
      return { success: true, is_entitled: false, is_unverified: false, content: null };
    });

    let hookState: UseDailyRashiInsightResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <DailyInsightHarness
          initialRashiId={1}
          onStateUpdate={(st) => {
            hookState = st;
          }}
        />
      );
    });

    // Start manual refresh for Aries
    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = hookState.refresh();
    });

    // User switches to Taurus
    await act(async () => {
      await hookState.selectRashi(2);
    });

    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_id).toBe(2);
    expect(hookState.insight?.general_outlook).toContain("Taurus");

    // Earlier Aries request finishes late
    await act(async () => {
      resolveAries!({
        success: true,
        is_entitled: true,
        is_unverified: false,
        content: { id: "in-aries", rashi_id: 1, insight_date: "2026-10-10", general_outlook: "Aries Obsolete" },
      });
      await refreshPromise!;
    });

    // Taurus content must NOT be overwritten by Aries
    expect(hookState.selectedRashiId).toBe(2);
    expect(hookState.insight?.rashi_id).toBe(2);
    expect(hookState.insight?.general_outlook).toContain("Taurus");
  });
});
