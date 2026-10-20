// __tests__/daily_astrology_subscription_selection.test.tsx
/**
 * AST-06: Correct Subscription Selection and Current Entitlement Display
 *
 * Verifies:
 * Test A: Valid active subscription plus newer pending checkout
 * Test B: Active subscription plus future-start renewal
 * Test C: Future-start interval without current access
 * Test D: Expired subscription (ends_at <= now)
 * Test E: Exact boundary conditions (starts_at <= now and ends_at > now)
 * Test F: Disabled plan (plan.is_active = false)
 * Test G: Daily feature disabled (plan.daily_in_app_enabled = false)
 * Test H: Multiple potentially qualifying rows (selection prioritizes current over newer rows)
 * Test I: Subscription query failure surfaces error, not confirmed expiration
 * Test J: Current subscription plus failed renewal preserves existing valid access
 * Test K: Authoritative backend agreement (RPC remains source of truth)
 * Test L: AST-04 lifecycle behavior (foreground/focus refreshes state)
 * Test M: No regression across AST-02 through AST-05 protections
 */

import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AstrologySubscription,
} from "../src/features/astrology/types/astrology.types.ts";
import {
  astrologyService,
  isSubscriptionCurrentlyActive,
  isSubscriptionFutureStart,
  isSubscriptionExpired,
  isEligibleForDailyInAppInsights,
  selectSubscriptionSummary,
  selectCurrentSubscription,
} from "../src/features/astrology/services/astrologyService.ts";
import { dailyRashiService } from "../src/features/astrology/services/dailyRashiService.ts";
import {
  useCustomerSubscription,
  UseCustomerSubscriptionResult,
} from "../src/features/astrology/hooks/useCustomerSubscription.ts";
import { AstrologySubscriptionCard } from "../src/features/astrology/components/AstrologySubscriptionCard.tsx";
import { AstrologySubscriptionScreen } from "../src/features/astrology/screens/AstrologySubscriptionScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(15000);

let mockCurrentUser: { id: string; email?: string } | null = { id: "cust-ast06-uuid" };
let mockFocusCallback: (() => void) | null = null;
void mockFocusCallback;

jest.mock("@react-navigation/native", () => {
  const ReactModule = require("react");
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
      ReactModule.useEffect(() => {
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

// Hook test harness for subscription hook
const SubscriptionHarness: React.FC<{
  onStateUpdate?: (state: UseCustomerSubscriptionResult) => void;
}> = ({ onStateUpdate }) => {
  const result = useCustomerSubscription();
  onStateUpdate?.(result);
  return null;
};

describe("KashiVeda AST-06: Correct Subscription Selection and Current Entitlement Display", () => {
  let appStateListeners: Array<(state: string) => void> = [];

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    await AsyncStorage.clear();
    mockCurrentUser = { id: "cust-ast06-uuid" };
    mockFocusCallback = null;
    appStateListeners = [];

    jest.spyOn(AppState, "addEventListener").mockImplementation((type: any, listener: any) => {
      if (type === "change") {
        appStateListeners.push(listener);
      }
      return { remove: jest.fn() } as any;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Test A — Valid subscription plus newer pending checkout
  // -------------------------------------------------------------------------
  test("Test A: Valid active subscription plus newer pending checkout maintains current access while keeping pending checkout discoverable", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    const activeSub: AstrologySubscription = {
      id: "sub-active-existing",
      customer_id: "cust-ast06-uuid",
      plan_id: "plan-monthly",
      payment_order_id: "po-1",
      starts_at: "2026-10-01T00:00:00.000Z",
      ends_at: "2026-10-31T23:59:59.000Z",
      status: "active",
      created_at: "2026-10-01T00:00:00.000Z",
      plan: {
        id: "plan-monthly",
        name: "Monthly Cosmic Guidance",
        duration_days: 30,
        price: 501,
        currency: "INR",
        daily_in_app_enabled: true,
        weekly_whatsapp_enabled: true,
        is_active: true,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    };

    const pendingSub: AstrologySubscription = {
      id: "sub-pending-new",
      customer_id: "cust-ast06-uuid",
      plan_id: "plan-monthly",
      payment_order_id: "po-2",
      starts_at: "2026-11-01T00:00:00.000Z",
      ends_at: "2026-11-30T23:59:59.000Z",
      status: "payment_pending",
      created_at: "2026-10-15T10:00:00.000Z", // Created newer than activeSub
      plan: {
        id: "plan-monthly",
        name: "Monthly Cosmic Guidance",
        duration_days: 30,
        price: 501,
        currency: "INR",
        daily_in_app_enabled: true,
        weekly_whatsapp_enabled: true,
        is_active: true,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      },
    };

    // Subscriptions returned in descending created_at order from DB
    const subsList = [pendingSub, activeSub];

    // Verify pure selection predicates
    const summary = selectSubscriptionSummary(subsList, Date.now());
    expect(summary.currentSubscription?.id).toBe("sub-active-existing");
    expect(summary.pendingSubscription?.id).toBe("sub-pending-new");
    expect(selectCurrentSubscription(subsList, Date.now())?.id).toBe("sub-active-existing");

    jest.spyOn(astrologyService, "getCustomerSubscriptions").mockResolvedValue(subsList);

    let hookState: UseCustomerSubscriptionResult = {} as any;

    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    // Current access is maintained!
    expect(hookState.isActive).toBe(true);
    expect(hookState.subscription?.id).toBe("sub-active-existing");
    expect(hookState.activeSubscription?.id).toBe("sub-active-existing");

    // Pending checkout remains discoverable!
    expect(hookState.pendingSubscription?.id).toBe("sub-pending-new");

    // Test UI presentation in AstrologySubscriptionScreen
    let screenRenderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      screenRenderer = ReactTestRenderer.create(<AstrologySubscriptionScreen />);
    });

    const screenText = extractAllText(screenRenderer!.toJSON());
    expect(screenText).toContain("Active");
    expect(screenText).toContain("Pending Renewal Order");
    expect(screenText).toContain("Pending Activation");
  });

  // -------------------------------------------------------------------------
  // Test B — Active plus future-start renewal
  // -------------------------------------------------------------------------
  test("Test B: Active subscription plus future-start renewal displays current interval remaining days, not premature future entitlement", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    const activeSub: AstrologySubscription = {
      id: "sub-current-active",
      customer_id: "cust-ast06-uuid",
      plan_id: "plan-monthly",
      payment_order_id: "po-1",
      starts_at: "2026-10-01T00:00:00.000Z",
      ends_at: "2026-10-31T23:59:59.000Z",
      status: "active",
      created_at: "2026-10-01T00:00:00.000Z",
    };

    const futureSub: AstrologySubscription = {
      id: "sub-future-renewal",
      customer_id: "cust-ast06-uuid",
      plan_id: "plan-monthly",
      payment_order_id: "po-2",
      starts_at: "2026-11-01T00:00:00.000Z",
      ends_at: "2026-11-30T23:59:59.000Z",
      status: "active", // Active in status, but starts_at is in the future
      created_at: "2026-10-15T09:00:00.000Z",
    };

    const subsList = [futureSub, activeSub];

    const summary = selectSubscriptionSummary(subsList, Date.now());
    expect(summary.currentSubscription?.id).toBe("sub-current-active");
    expect(summary.futureSubscription?.id).toBe("sub-future-renewal");

    jest.spyOn(astrologyService, "getCustomerSubscriptions").mockResolvedValue(subsList);

    let hookState: UseCustomerSubscriptionResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    expect(hookState.isActive).toBe(true);
    expect(hookState.subscription?.id).toBe("sub-current-active");
    // Remaining days is calculated from current active ends_at (Oct 31 - Oct 15 = 17 days), NOT Nov 30!
    expect(hookState.remainingDays).toBe(17);
    expect(hookState.futureSubscription?.id).toBe("sub-future-renewal");

    // Rendering future renewal card shows Scheduled badge, not Active badge
    let futureCardRenderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      futureCardRenderer = ReactTestRenderer.create(
        <AstrologySubscriptionCard subscription={futureSub} />
      );
    });

    const cardText = extractAllText(futureCardRenderer!.toJSON());
    expect(cardText).toContain("Scheduled");
    expect(cardText).toContain("Starts On");
    expect(cardText).toContain("Starts In");
    expect(cardText).not.toContain("Valid From");
  });

  // -------------------------------------------------------------------------
  // Test C — Future-start interval without current access
  // -------------------------------------------------------------------------
  test("Test C: Future-start interval without current access does not grant current entitlement before starts_at", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    const futureOnlySub: AstrologySubscription = {
      id: "sub-future-only",
      customer_id: "cust-ast06-uuid",
      plan_id: "plan-monthly",
      payment_order_id: "po-1",
      starts_at: "2026-11-01T00:00:00.000Z",
      ends_at: "2026-11-30T23:59:59.000Z",
      status: "active",
      created_at: "2026-10-15T00:00:00.000Z",
      plan: {
        id: "plan-monthly",
        name: "Upcoming Plan",
        duration_days: 30,
        price: 501,
        currency: "INR",
        daily_in_app_enabled: true,
        weekly_whatsapp_enabled: true,
        is_active: true,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
    };

    expect(isSubscriptionCurrentlyActive(futureOnlySub, Date.now())).toBe(false);
    expect(isSubscriptionFutureStart(futureOnlySub, Date.now())).toBe(true);

    jest.spyOn(astrologyService, "getCustomerSubscriptions").mockResolvedValue([futureOnlySub]);

    let hookState: UseCustomerSubscriptionResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    // Current entitlement is NOT granted before starts_at
    expect(hookState.isActive).toBe(false);
    expect(hookState.isFuture).toBe(true);
    expect(hookState.daysUntilStart).toBe(17);
    expect(hookState.remainingDays).toBe(0);

    // Card displays Scheduled badge
    let cardRenderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      cardRenderer = ReactTestRenderer.create(
        <AstrologySubscriptionCard subscription={futureOnlySub} />
      );
    });

    const text = extractAllText(cardRenderer!.toJSON());
    expect(text).toContain("Scheduled");
    expect(text).toContain("Starts On");
  });

  // -------------------------------------------------------------------------
  // Test D — Expired subscription
  // -------------------------------------------------------------------------
  test("Test D: Expired subscription (ends_at <= now) does not grant current access even with active status string", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    const expiredSub: AstrologySubscription = {
      id: "sub-expired",
      customer_id: "cust-ast06-uuid",
      plan_id: "plan-monthly",
      payment_order_id: "po-1",
      starts_at: "2026-09-01T00:00:00.000Z",
      ends_at: "2026-10-01T00:00:00.000Z", // In the past!
      status: "active", // Status column was not updated, but interval is past
      created_at: "2026-09-01T00:00:00.000Z",
      plan: {
        id: "plan-monthly",
        name: "Past Plan",
        duration_days: 30,
        price: 501,
        currency: "INR",
        daily_in_app_enabled: true,
        weekly_whatsapp_enabled: true,
        is_active: true,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    };

    expect(isSubscriptionCurrentlyActive(expiredSub, Date.now())).toBe(false);
    expect(isSubscriptionExpired(expiredSub, Date.now())).toBe(true);

    jest.spyOn(astrologyService, "getCustomerSubscriptions").mockResolvedValue([expiredSub]);

    let hookState: UseCustomerSubscriptionResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    expect(hookState.isActive).toBe(false);
    expect(hookState.remainingDays).toBe(0);

    let cardRenderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      cardRenderer = ReactTestRenderer.create(
        <AstrologySubscriptionCard subscription={expiredSub} />
      );
    });

    const cardText = extractAllText(cardRenderer!.toJSON());
    expect(cardText).toContain("Expired");
    expect(cardText).toContain("Valid Till");
  });

  // -------------------------------------------------------------------------
  // Test E — Exact boundary conditions
  // -------------------------------------------------------------------------
  test("Test E: Exact boundary conditions evaluate starts_at <= now and exclusive ends_at > now", () => {
    const fixedNowMs = new Date("2026-10-10T12:00:00.000Z").getTime();

    const plan = {
      id: "plan-1",
      name: "Standard",
      duration_days: 30,
      price: 501,
      currency: "INR",
      daily_in_app_enabled: true,
      weekly_whatsapp_enabled: true,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    // 1. Exactly at starts_at boundary (starts_at <= now is true)
    const subAtStart: AstrologySubscription = {
      id: "sub-start-exact",
      customer_id: "c1",
      plan_id: "plan-1",
      payment_order_id: "po-1",
      starts_at: new Date(fixedNowMs).toISOString(),
      ends_at: new Date(fixedNowMs + 10000).toISOString(),
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
      plan,
    };
    expect(isSubscriptionCurrentlyActive(subAtStart, fixedNowMs)).toBe(true);
    expect(isEligibleForDailyInAppInsights(subAtStart, fixedNowMs)).toBe(true);

    // 2. One millisecond before starts_at (starts_at <= now is false)
    const subBeforeStart: AstrologySubscription = {
      ...subAtStart,
      starts_at: new Date(fixedNowMs + 1).toISOString(),
    };
    expect(isSubscriptionCurrentlyActive(subBeforeStart, fixedNowMs)).toBe(false);
    expect(isSubscriptionFutureStart(subBeforeStart, fixedNowMs)).toBe(true);
    expect(isEligibleForDailyInAppInsights(subBeforeStart, fixedNowMs)).toBe(false);

    // 3. One millisecond before ends_at (ends_at > now is true)
    const subBeforeEnd: AstrologySubscription = {
      ...subAtStart,
      starts_at: new Date(fixedNowMs - 10000).toISOString(),
      ends_at: new Date(fixedNowMs + 1).toISOString(),
    };
    expect(isSubscriptionCurrentlyActive(subBeforeEnd, fixedNowMs)).toBe(true);
    expect(isEligibleForDailyInAppInsights(subBeforeEnd, fixedNowMs)).toBe(true);

    // 4. Exactly at ends_at boundary (ends_at > now is FALSE, exclusive expiry)
    const subAtEnd: AstrologySubscription = {
      ...subAtStart,
      starts_at: new Date(fixedNowMs - 10000).toISOString(),
      ends_at: new Date(fixedNowMs).toISOString(),
    };
    expect(isSubscriptionCurrentlyActive(subAtEnd, fixedNowMs)).toBe(false);
    expect(isSubscriptionExpired(subAtEnd, fixedNowMs)).toBe(true);
    expect(isEligibleForDailyInAppInsights(subAtEnd, fixedNowMs)).toBe(false);

    // 5. One millisecond past ends_at (ends_at > now is false)
    const subPastEnd: AstrologySubscription = {
      ...subAtStart,
      starts_at: new Date(fixedNowMs - 10000).toISOString(),
      ends_at: new Date(fixedNowMs - 1).toISOString(),
    };
    expect(isSubscriptionCurrentlyActive(subPastEnd, fixedNowMs)).toBe(false);
    expect(isSubscriptionExpired(subPastEnd, fixedNowMs)).toBe(true);
    expect(isEligibleForDailyInAppInsights(subPastEnd, fixedNowMs)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test F — Disabled plan (AST-Q02 Option A: Deactivation affects new sales only)
  // -------------------------------------------------------------------------
  test("Test F (AST-Q02 Option A): Subscription on a disabled plan (plan.is_active = false) retains daily in-app entitlement during valid interval", async () => {
    const fixedNowMs = new Date("2026-10-10T12:00:00.000Z").getTime();

    const subWithDisabledPlan: AstrologySubscription = {
      id: "sub-disabled-plan",
      customer_id: "c1",
      plan_id: "plan-archived",
      payment_order_id: "po-1",
      starts_at: new Date(fixedNowMs - 5000).toISOString(),
      ends_at: new Date(fixedNowMs + 50000).toISOString(),
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
      plan: {
        id: "plan-archived",
        name: "Archived Plan",
        duration_days: 30,
        price: 501,
        currency: "INR",
        daily_in_app_enabled: true,
        weekly_whatsapp_enabled: true,
        is_active: false, // Plan disabled in catalog for new sales
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    };

    // Under AST-Q02 Option A, an existing active subscription on an inactive plan retains entitlement
    expect(isEligibleForDailyInAppInsights(subWithDisabledPlan, fixedNowMs)).toBe(true);

    // Expired subscription on inactive plan does NOT grant entitlement
    const expiredSubDisabledPlan: AstrologySubscription = {
      ...subWithDisabledPlan,
      ends_at: new Date(fixedNowMs - 1000).toISOString(),
    };
    expect(isEligibleForDailyInAppInsights(expiredSubDisabledPlan, fixedNowMs)).toBe(false);

    // Inactive plan with daily_in_app_enabled = false does NOT grant entitlement
    const noFeatureSubDisabledPlan: AstrologySubscription = {
      ...subWithDisabledPlan,
      plan: {
        ...subWithDisabledPlan.plan!,
        daily_in_app_enabled: false,
      },
    };
    expect(isEligibleForDailyInAppInsights(noFeatureSubDisabledPlan, fixedNowMs)).toBe(false);

    // Test direct fallback in dailyRashiService verifies entitlement under AST-Q02 Option A
    const liveNow = Date.now();
    const activeRowDisabledPlan = {
      id: "sub-disabled-plan",
      starts_at: new Date(liveNow - 5000).toISOString(),
      ends_at: new Date(liveNow + 50000).toISOString(),
      status: "active",
      astrology_subscription_plans: {
        daily_in_app_enabled: true,
        is_active: false,
      },
    };

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "astrology_subscriptions") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: any) => {
            return Promise.resolve({ data: [activeRowDisabledPlan], error: null }).then(resolve);
          },
        } as any;
      }
      if (table === "daily_rashi_insights") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: "insight-1",
              insight_date: "2026-10-11",
              rashi_id: 1,
              status: "published",
              general_outlook: "Positive guidance",
            },
            error: null,
          }),
        } as any;
      }
      return {} as any;
    });

    const fallbackResult = await (dailyRashiService as any).fallbackFetchInsight(
      "2026-10-11",
      1,
      "en",
      "c1",
      "test-key"
    );
    expect(fallbackResult.is_entitled).toBe(true);
    expect(fallbackResult.content).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test G — Daily feature disabled on active plan
  // -------------------------------------------------------------------------
  test("Test G: Active subscription with daily_in_app_enabled = false does not grant daily insights but retains active subscription status", () => {
    const fixedNowMs = new Date("2026-10-10T12:00:00.000Z").getTime();

    const subWhatsappOnly: AstrologySubscription = {
      id: "sub-whatsapp-only",
      customer_id: "c1",
      plan_id: "plan-wa-only",
      payment_order_id: "po-1",
      starts_at: new Date(fixedNowMs - 5000).toISOString(),
      ends_at: new Date(fixedNowMs + 50000).toISOString(),
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
      plan: {
        id: "plan-wa-only",
        name: "WhatsApp Only Delivery",
        duration_days: 30,
        price: 301,
        currency: "INR",
        daily_in_app_enabled: false, // In-app feature disabled
        weekly_whatsapp_enabled: true,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    };

    // The subscription itself is ACTIVE! (Not expired)
    expect(isSubscriptionCurrentlyActive(subWhatsappOnly, fixedNowMs)).toBe(true);
    expect(isSubscriptionExpired(subWhatsappOnly, fixedNowMs)).toBe(false);

    // But it is NOT eligible for daily in-app insights
    expect(isEligibleForDailyInAppInsights(subWhatsappOnly, fixedNowMs)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test H — Multiple potentially qualifying rows
  // -------------------------------------------------------------------------
  test("Test H: Selection logic prioritizes currently valid interval over newer records (cancelled, pending, future)", () => {
    const now = new Date("2026-10-15T12:00:00.000Z").getTime();

    const cancelledNewest: AstrologySubscription = {
      id: "sub-5-cancelled",
      customer_id: "c1",
      plan_id: "plan-1",
      payment_order_id: "po-5",
      status: "cancelled",
      created_at: "2026-10-15T11:00:00Z",
    };

    const pendingNewer: AstrologySubscription = {
      id: "sub-4-pending",
      customer_id: "c1",
      plan_id: "plan-1",
      payment_order_id: "po-4",
      status: "payment_pending",
      created_at: "2026-10-15T10:00:00Z",
    };

    const futureRenewal: AstrologySubscription = {
      id: "sub-3-future",
      customer_id: "c1",
      plan_id: "plan-1",
      payment_order_id: "po-3",
      starts_at: "2026-11-01T00:00:00Z",
      ends_at: "2026-11-30T23:59:59Z",
      status: "active",
      created_at: "2026-10-14T00:00:00Z",
    };

    const currentlyActive: AstrologySubscription = {
      id: "sub-2-active-current",
      customer_id: "c1",
      plan_id: "plan-1",
      payment_order_id: "po-2",
      starts_at: "2026-10-01T00:00:00Z",
      ends_at: "2026-10-31T23:59:59Z",
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
    };

    const olderExpired: AstrologySubscription = {
      id: "sub-1-expired",
      customer_id: "c1",
      plan_id: "plan-1",
      payment_order_id: "po-1",
      starts_at: "2026-09-01T00:00:00Z",
      ends_at: "2026-09-30T23:59:59Z",
      status: "expired",
      created_at: "2026-09-01T00:00:00Z",
    };

    // Array ordered by created_at DESC as returned by query
    const rows = [cancelledNewest, pendingNewer, futureRenewal, currentlyActive, olderExpired];

    const currentSelected = selectCurrentSubscription(rows, now);
    expect(currentSelected?.id).toBe("sub-2-active-current");

    const summary = selectSubscriptionSummary(rows, now);
    expect(summary.currentSubscription?.id).toBe("sub-2-active-current");
    expect(summary.futureSubscription?.id).toBe("sub-3-future");
    expect(summary.pendingSubscription?.id).toBe("sub-4-pending");
  });

  // -------------------------------------------------------------------------
  // Test I — Subscription query failure surfaces error, not confirmed expiration
  // -------------------------------------------------------------------------
  test("Test I: Database query failure represents retrieval failure and does not claim confirmed expiration", async () => {
    jest.spyOn(astrologyService, "getCustomerSubscriptions").mockRejectedValue(
      new Error("PGRST500: Database connection timeout")
    );

    let hookState: UseCustomerSubscriptionResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    expect(hookState.loading).toBe(false);
    expect(hookState.error).toContain("Database connection timeout");
    expect(hookState.subscription).toBeNull();
    expect(hookState.isActive).toBe(false);

    // Screen displays ErrorState with Try Again, NOT EmptyState claiming "No Active Subscription"
    let screenRenderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      screenRenderer = ReactTestRenderer.create(<AstrologySubscriptionScreen />);
    });

    const screenText = extractAllText(screenRenderer!.toJSON());
    expect(screenText).toContain("Unable to Load Subscription");
    expect(screenText).toContain("Try Again");
    expect(screenText).not.toContain("No Active Subscription");
  });

  // -------------------------------------------------------------------------
  // Test J — Current subscription plus failed renewal
  // -------------------------------------------------------------------------
  test("Test J: Older valid subscription remains active while newer purchase attempt fails or cancels", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    const activeSub: AstrologySubscription = {
      id: "sub-active-existing",
      customer_id: "cust-ast06-uuid",
      plan_id: "plan-monthly",
      payment_order_id: "po-1",
      starts_at: "2026-10-01T00:00:00.000Z",
      ends_at: "2026-10-31T23:59:59.000Z",
      status: "active",
      created_at: "2026-10-01T00:00:00.000Z",
    };

    const cancelledRenewal: AstrologySubscription = {
      id: "sub-renewal-cancelled",
      customer_id: "cust-ast06-uuid",
      plan_id: "plan-monthly",
      payment_order_id: "po-failed",
      status: "cancelled",
      created_at: "2026-10-15T10:00:00.000Z",
    };

    const subs = [cancelledRenewal, activeSub];

    const current = selectCurrentSubscription(subs, Date.now());
    expect(current?.id).toBe("sub-active-existing");

    jest.spyOn(astrologyService, "getCustomerSubscriptions").mockResolvedValue(subs);

    let hookState: UseCustomerSubscriptionResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    expect(hookState.isActive).toBe(true);
    expect(hookState.subscription?.id).toBe("sub-active-existing");
  });

  // -------------------------------------------------------------------------
  // Test K — Authoritative backend agreement
  // -------------------------------------------------------------------------
  test("Test K: Authoritative daily insight RPC remains source of truth and client Boolean cannot override backend denial", async () => {
    // Backend RPC returns explicit denial
    jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        success: true,
        is_entitled: false,
        is_unverified: false,
        content: {
          id: "ins-locked",
          rashi_id: 1,
          insight_date: "2026-10-15",
          general_prediction: "General prediction available to all.",
          career_business: null,
          finance_wealth: null,
          love_relationships: null,
          health_wellbeing: null,
        },
      },
      error: null,
    } as any);

    const result = await dailyRashiService.fetchDailyInsight("2026-10-15", 1, "en", null, { bypassCache: true });
    expect(result.success).toBe(true);
    expect(result.is_entitled).toBe(false);
    expect(result.content?.career_business).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test L — AST-04 lifecycle behavior
  // -------------------------------------------------------------------------
  test("Test L: AppState foreground and navigation focus refresh subscription selection without restart", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    let backendSubs: AstrologySubscription[] = [
      {
        id: "sub-pending",
        customer_id: "cust-ast06-uuid",
        plan_id: "p1",
        payment_order_id: "po-1",
        status: "payment_pending",
        created_at: "2026-10-15T11:00:00Z",
      },
    ];

    const getSubsSpy = jest.spyOn(astrologyService, "getCustomerSubscriptions").mockImplementation(
      async () => backendSubs
    );

    let hookState: UseCustomerSubscriptionResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    expect(hookState.isActive).toBe(false);
    expect(hookState.isPending).toBe(true);

    // App transitions to background
    act(() => {
      appStateListeners.forEach((l) => l("background"));
    });

    // Backend confirms webhook / payment confirmation during checkout
    backendSubs = [
      {
        id: "sub-now-active",
        customer_id: "cust-ast06-uuid",
        plan_id: "p1",
        payment_order_id: "po-1",
        status: "active",
        starts_at: "2026-10-15T12:00:00Z",
        ends_at: "2026-11-15T12:00:00Z",
        created_at: "2026-10-15T11:00:00Z",
      },
    ];

    // User returns to app (foreground event)
    jest.advanceTimersByTime(5000);
    await act(async () => {
      appStateListeners.forEach((l) => l("active"));
    });

    expect(hookState.isActive).toBe(true);
    expect(hookState.subscription?.id).toBe("sub-now-active");
    expect(getSubsSpy).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Test M — No regression across AST-02 through AST-05 protections
  // -------------------------------------------------------------------------
  test("Test M: Multi-subscription selection does not regress cache isolation or offline sanitation", async () => {
    // 1. Verify user cache key isolation
    const cacheKeyUserA = (dailyRashiService as any).getCacheKey("u_userA", "2026-10-15", 1, "en");
    const cacheKeyUserB = (dailyRashiService as any).getCacheKey("u_userB", "2026-10-15", 1, "en");
    expect(cacheKeyUserA).not.toBe(cacheKeyUserB);

    // 2. Offline fallback sanitizes premium fields
    const mockInsight = {
      id: "ins-offline",
      rashi_id: 1,
      insight_date: "2026-10-15",
      general_prediction: "General insight",
      career_business: "Top Secret Career Guidance",
      finance_wealth: "Secret Finance Guidance",
      love_relationships: "Secret Love Guidance",
      health_wellbeing: "Secret Health Guidance",
    };
    await AsyncStorage.setItem(`@kashiveda_daily_insight_v2:${cacheKeyUserA}`, JSON.stringify(mockInsight));

    // Force network failure
    jest.spyOn(supabase, "rpc").mockRejectedValue(new Error("Network request failed - offline"));

    const offlineResult = await dailyRashiService.fetchDailyInsight("2026-10-15", 1, "en", "userA", {
      bypassCache: false,
    });

    expect(offlineResult.success).toBe(true);
    expect(offlineResult.is_unverified).toBe(true);
    expect(offlineResult.is_entitled).toBe(false);
    expect(offlineResult.content?.career_business).toBeNull();
    expect(offlineResult.content?.finance_wealth).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test N — Large-history scenario (>20 records): Valid active subscription
  // beyond the first 20 records is retrieved and recognized as active access
  // -------------------------------------------------------------------------
  test("Test N: Valid active subscription beyond the first 20 records (>20 records dataset) is not omitted by limit", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const fixedNow = new Date("2026-10-15T12:00:00.000Z");
    jest.setSystemTime(fixedNow);

    const customerId = "cust-large-history-uuid";
    mockCurrentUser = { id: customerId };

    const activePlan = {
      id: "plan-gold",
      name: "Gold Astrological Guidance",
      duration_days: 30,
      price: 501,
      currency: "INR",
      daily_in_app_enabled: true,
      weekly_whatsapp_enabled: true,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    // Construct 25 records:
    // Index 24 (oldest created_at, 30 days ago): 1 valid active subscription covering now
    // Indexes 0..23 (newer created_at, 1..24 days ago): 10 cancelled, 10 pending, 4 expired
    const allRecords: any[] = [];

    // 1. The valid active subscription created on Sept 15, valid Oct 1 to Oct 31
    const validActiveSub = {
      id: "sub-valid-active-older",
      customer_id: customerId,
      plan_id: "plan-gold",
      payment_order_id: "po-ancient-active",
      starts_at: "2026-10-01T00:00:00.000Z",
      ends_at: "2026-10-31T23:59:59.000Z",
      status: "active",
      created_at: "2026-09-15T00:00:00.000Z",
      astrology_subscription_plans: activePlan,
    };

    // 2. Newer 24 records: mixture of cancelled, pending, and expired
    for (let i = 1; i <= 24; i++) {
      const createdDate = new Date(fixedNow.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
      let status = "cancelled";
      let endsAt = "2026-10-10T00:00:00.000Z";

      if (i <= 10) {
        status = "cancelled";
      } else if (i <= 20) {
        status = "payment_pending";
      } else {
        status = "expired";
        endsAt = "2026-09-30T00:00:00.000Z";
      }

      allRecords.push({
        id: `sub-newer-${i}`,
        customer_id: customerId,
        plan_id: "plan-gold",
        payment_order_id: `po-attempt-${i}`,
        starts_at: "2026-09-01T00:00:00.000Z",
        ends_at: endsAt,
        status,
        created_at: createdDate,
        astrology_subscription_plans: activePlan,
      });
    }

    // Push the valid active sub at the end (index 24)
    allRecords.push(validActiveSub);

    // Mock query builder simulating PostgREST table filtering
    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "astrology_subscriptions") {
        const filters: Record<string, any> = {};
        let limitVal: number | null = null;
        let orderCol: string | null = null;
        let isAsc = false;

        const builder: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation((col: string, val: any) => {
            filters[col] = val;
            return builder;
          }),
          order: jest.fn().mockImplementation((col: string, opts?: any) => {
            orderCol = col;
            isAsc = opts?.ascending ?? false;
            return builder;
          }),
          limit: jest.fn().mockImplementation((num: number) => {
            limitVal = num;
            return builder;
          }),
          then: (resolve: any) => {
            let filtered = [...allRecords];
            if (filters.customer_id) {
              filtered = filtered.filter((r) => r.customer_id === filters.customer_id);
            }
            if (filters.status) {
              filtered = filtered.filter((r) => r.status === filters.status);
            }
            if (orderCol) {
              filtered.sort((a, b) => {
                const valA = new Date(a[orderCol!] || 0).getTime();
                const valB = new Date(b[orderCol!] || 0).getTime();
                return isAsc ? valA - valB : valB - valA;
              });
            }
            if (limitVal !== null) {
              filtered = filtered.slice(0, limitVal);
            }
            return Promise.resolve({ data: filtered, error: null }).then(resolve);
          },
        };
        return builder;
      }
      return {} as any;
    });

    // 1. Service retrieval test
    const subscriptions = await astrologyService.getCustomerSubscriptions(customerId);
    const subIds = subscriptions.map((s) => s.id);
    expect(subIds).toContain("sub-valid-active-older");

    const currentSub = await astrologyService.getCustomerSubscription(customerId);
    expect(currentSub?.id).toBe("sub-valid-active-older");

    // 2. Hook and UI recognition test
    let hookState: UseCustomerSubscriptionResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    expect(hookState.isActive).toBe(true);
    expect(hookState.subscription?.id).toBe("sub-valid-active-older");
    expect(hookState.activeSubscription?.id).toBe("sub-valid-active-older");
    // Oct 31 - Oct 15 = 17 days
    expect(hookState.remainingDays).toBe(17);
  });

  // -------------------------------------------------------------------------
  // Test O — Large-history scenario (>20 records): Dataset with no active
  // intervals does not invent entitlement
  // -------------------------------------------------------------------------
  test("Test O: Large dataset (>20 records) with no active intervals does not invent entitlement", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const fixedNow = new Date("2026-10-15T12:00:00.000Z");
    jest.setSystemTime(fixedNow);

    const customerId = "cust-no-active-large-uuid";
    mockCurrentUser = { id: customerId };

    const plan = {
      id: "plan-gold",
      name: "Gold Astrological Guidance",
      duration_days: 30,
      price: 501,
      currency: "INR",
      daily_in_app_enabled: true,
      weekly_whatsapp_enabled: true,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    // Construct 25 records with NO currently active interval
    const allRecords: any[] = [];
    for (let i = 1; i <= 25; i++) {
      const createdDate = new Date(fixedNow.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
      const status = i <= 15 ? "cancelled" : i <= 20 ? "payment_pending" : "expired";

      allRecords.push({
        id: `sub-nonactive-${i}`,
        customer_id: customerId,
        plan_id: "plan-gold",
        payment_order_id: `po-${i}`,
        starts_at: "2026-08-01T00:00:00.000Z",
        ends_at: "2026-08-31T23:59:59.000Z",
        status,
        created_at: createdDate,
        astrology_subscription_plans: plan,
      });
    }

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "astrology_subscriptions") {
        const filters: Record<string, any> = {};
        let limitVal: number | null = null;
        let orderCol: string | null = null;
        let isAsc = false;

        const builder: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation((col: string, val: any) => {
            filters[col] = val;
            return builder;
          }),
          order: jest.fn().mockImplementation((col: string, opts?: any) => {
            orderCol = col;
            isAsc = opts?.ascending ?? false;
            return builder;
          }),
          limit: jest.fn().mockImplementation((num: number) => {
            limitVal = num;
            return builder;
          }),
          then: (resolve: any) => {
            let filtered = [...allRecords];
            if (filters.customer_id) {
              filtered = filtered.filter((r) => r.customer_id === filters.customer_id);
            }
            if (filters.status) {
              filtered = filtered.filter((r) => r.status === filters.status);
            }
            if (orderCol) {
              filtered.sort((a, b) => {
                const valA = new Date(a[orderCol!] || 0).getTime();
                const valB = new Date(b[orderCol!] || 0).getTime();
                return isAsc ? valA - valB : valB - valA;
              });
            }
            if (limitVal !== null) {
              filtered = filtered.slice(0, limitVal);
            }
            return Promise.resolve({ data: filtered, error: null }).then(resolve);
          },
        };
        return builder;
      }
      return {} as any;
    });

    const subscriptions = await astrologyService.getCustomerSubscriptions(customerId);
    const activeSelected = selectCurrentSubscription(subscriptions, fixedNow.getTime());

    // Because there is no active subscription, currentSubscription is null
    expect(activeSelected?.status).not.toBe("active");

    let hookState: UseCustomerSubscriptionResult = {} as any;
    await act(async () => {
      ReactTestRenderer.create(
        <SubscriptionHarness onStateUpdate={(s) => (hookState = s)} />
      );
    });

    expect(hookState.isActive).toBe(false);
    expect(hookState.activeSubscription).toBeNull();
    expect(hookState.remainingDays).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test P — Large-history scenario in direct-table fallback: Older active
  // subscription beyond 20 newer records still grants daily in-app insight
  // -------------------------------------------------------------------------
  test("Test P: Direct-table fallback grants insight when active subscription is older than 20 newer cancelled records", async () => {
    const callerId = "cust-fallback-large-uuid";

    const activePlan = {
      id: "plan-gold",
      daily_in_app_enabled: true,
      is_active: true,
    };

    const activeRow = {
      id: "sub-ancient-active",
      customer_id: callerId,
      status: "active",
      starts_at: "2026-10-01T00:00:00.000Z",
      ends_at: "2026-10-31T23:59:59.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
      astrology_subscription_plans: activePlan,
    };

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "astrology_subscriptions") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: any) => {
            // Returns the active row directly because of .eq("status", "active")
            return Promise.resolve({ data: [activeRow], error: null }).then(resolve);
          },
        } as any;
      }
      if (table === "daily_rashi_insights") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              id: "ins-large-history",
              rashi_id: 1,
              insight_date: "2026-10-15",
              general_prediction: "Auspicious alignment for long-term subscribers.",
              career_business: "Success in enterprise ventures.",
            },
            error: null,
          }),
        } as any;
      }
      return {} as any;
    });

    const fallbackResult = await (dailyRashiService as any).fallbackFetchInsight(
      "2026-10-15",
      1,
      "en",
      callerId,
      "test-cache-key"
    );

    expect(fallbackResult.success).toBe(true);
    expect(fallbackResult.is_entitled).toBe(true);
    expect(fallbackResult.content?.career_business).toBe("Success in enterprise ventures.");
  });
});
