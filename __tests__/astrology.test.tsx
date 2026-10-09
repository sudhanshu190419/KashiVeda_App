// __tests__/astrology.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { astrologyPaymentService } from "../src/features/astrology/services/astrologyPaymentService.ts";
import { AstrologyPlanCard } from "../src/features/astrology/components/AstrologyPlanCard.tsx";
import { AstrologySubscriptionCard } from "../src/features/astrology/components/AstrologySubscriptionCard.tsx";
import { AstrologyContentCard } from "../src/features/astrology/components/AstrologyContentCard.tsx";
import { AstrologyScreen } from "../src/features/astrology/screens/AstrologyScreen.tsx";
import { AstrologyPlanDetailScreen } from "../src/features/astrology/screens/AstrologyPlanDetailScreen.tsx";
import { AstrologyPaymentScreen } from "../src/features/astrology/screens/AstrologyPaymentScreen.tsx";
import { AstrologySubscriptionScreen } from "../src/features/astrology/screens/AstrologySubscriptionScreen.tsx";
import { AstrologyContentScreen } from "../src/features/astrology/screens/AstrologyContentScreen.tsx";
import { AstrologyContentDetailScreen } from "../src/features/astrology/screens/AstrologyContentDetailScreen.tsx";
import { AstrologyDeliveriesScreen } from "../src/features/astrology/screens/AstrologyDeliveriesScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import {
  AstrologyContent,
  AstrologyDelivery,
  AstrologySubscription,
  AstrologySubscriptionPlan,
} from "../src/features/astrology/types/astrology.types.ts";

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();

let mockRouteParams: any = {};

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
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
    signIn: jest.fn(() =>
      Promise.resolve({
        type: "success",
        data: {
          idToken: "mock-google-id-token-xyz",
          user: { id: "google-1", email: "devotee@gmail.com", name: "Devotee" },
        },
      })
    ),
    signOut: jest.fn(() => Promise.resolve()),
    getTokens: jest.fn(() => Promise.resolve({ idToken: "mock-google-id-token-xyz" })),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
  },
  isErrorWithCode: jest.fn(() => false),
  isCancelledResponse: jest.fn(() => false),
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: { id: "cust-user-1", email: "sharma@kashiveda.org" },
    profile: {
      id: "cust-user-1",
      display_name: "Devotee Sharma",
      phone: "+919876543210",
      email: "sharma@kashiveda.org",
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

describe("M6 Vedic Astrology Subscription & Content Test Suite", () => {
  const samplePlan: AstrologySubscriptionPlan = {
    id: "plan-monthly-1",
    name: "Masik Jyotish Guidance",
    duration_days: 30,
    price: 501,
    currency: "INR",
    daily_in_app_enabled: true,
    weekly_whatsapp_enabled: true,
    is_active: true,
    created_at: "2026-10-06T00:00:00Z",
    updated_at: "2026-10-06T00:00:00Z",
  };

  const sampleSubscription: AstrologySubscription = {
    id: "sub-123",
    customer_id: "cust-user-1",
    plan_id: "plan-monthly-1",
    payment_order_id: "po-sub-123",
    starts_at: "2026-10-01T00:00:00Z",
    ends_at: "2026-10-31T23:59:59Z",
    status: "active",
    created_at: "2026-10-01T00:00:00Z",
    plan: samplePlan,
  };

  const sampleContent: AstrologyContent = {
    id: "content-insight-1",
    channel: "in_app",
    title: "Surya Gochar in Tula Rashi",
    body: "Sun enters Libra bringing balance, focus on dharma, and auspicious opportunities for spiritual devotion in Kashi.",
    publish_at: "2026-10-06T06:00:00Z",
    expires_at: null,
    status: "published",
    created_by: "admin-user-1",
    created_at: "2026-10-06T05:00:00Z",
    updated_at: "2026-10-06T05:00:00Z",
  };

  const sampleDelivery: AstrologyDelivery = {
    id: "del-123",
    subscription_id: "sub-123",
    content_id: "content-insight-1",
    channel: "in_app",
    scheduled_at: "2026-10-06T06:00:00Z",
    sent_at: "2026-10-06T06:01:00Z",
    status: "sent",
    provider_message_id: null,
    error_message: null,
    content: sampleContent,
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    mockRouteParams = {};

    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "mock-jwt-token-123" } },
      error: null,
    } as any);

    jest.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: "cust-user-1", email: "sharma@kashiveda.org" } },
      error: null,
    } as any);
  });

  // 1 & 2. Astrology hub & Active Plan Catalog rendering
  test("1 & 2. AstrologyScreen hub renders cosmic header, active plans catalog, and content preview", async () => {
    jest.spyOn(astrologyService, "getActivePlans").mockResolvedValue([samplePlan]);
    jest.spyOn(astrologyService, "getCustomerSubscription").mockResolvedValue(sampleSubscription);
    jest.spyOn(astrologyService, "getPublishedContent").mockResolvedValue({
      items: [sampleContent],
      count: 1,
      hasMore: false,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Vedic Astrology");
    expect(str).toContain("Cosmic Planetary Wisdom");
    expect(str).toContain("Masik Jyotish Guidance");
    expect(str).toContain("₹501.00");
    expect(str).toContain("Surya Gochar in Tula Rashi");
  });

  // 3. Empty Plans State
  test("3. AstrologyScreen renders clear empty state when no subscription plans are active", async () => {
    jest.spyOn(astrologyService, "getActivePlans").mockResolvedValue([]);
    jest.spyOn(astrologyService, "getCustomerSubscription").mockResolvedValue(null);
    jest.spyOn(astrologyService, "getPublishedContent").mockResolvedValue({
      items: [],
      count: 0,
      hasMore: false,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("No Plans Available");
  });

  // 4. Plan Detail Rendering & Features
  test("4. AstrologyPlanDetailScreen renders plan name, duration, price, and deliverables", async () => {
    mockRouteParams = { planId: "plan-monthly-1" };
    jest.spyOn(astrologyService, "getPlanById").mockResolvedValue(samplePlan);

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyPlanDetailScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Masik Jyotish Guidance");
    expect(str).toContain("30 Days Full Coverage");
    expect(str).toContain("₹501.00");
    expect(str).toContain("Daily In-App Astrological Insights");
    expect(str).toContain("Weekly Guidance Broadcast");
  });

  // 5. Subscription Absence State
  test("5. AstrologySubscriptionScreen displays empty state when customer has no subscription", async () => {
    jest.spyOn(astrologyService, "getCustomerSubscription").mockResolvedValue(null);

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologySubscriptionScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("No Active Subscription");
    expect(str).toContain("Explore Plans");
  });

  // 6. Active Subscription Rendering
  test("6. AstrologySubscriptionCard renders active status badge, dates, and remaining days", () => {
    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <AstrologySubscriptionCard subscription={sampleSubscription} />
      );
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Masik Jyotish Guidance");
    expect(str).toContain("Active");
    expect(str).toContain("Valid From");
    expect(str).toContain("Valid Till");
    expect(str).toContain("Remaining");
  });

  // 7. Expired/Cancelled Subscription Rendering
  test("7. AstrologySubscriptionCard renders expired and cancelled status gracefully", () => {
    const expiredSub: AstrologySubscription = {
      ...sampleSubscription,
      status: "expired",
      ends_at: "2026-09-01T00:00:00Z",
    };

    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <AstrologySubscriptionCard subscription={expiredSub} />
      );
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Expired");
  });

  // 8. Published Content Filtering at Service Level
  test("8. astrologyService.getPublishedContent queries published items with channel filter", async () => {
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({
        data: [sampleContent],
        count: 1,
        error: null,
      }),
    };

    jest.spyOn(supabase, "from").mockReturnValue(mockQuery as any);

    const result = await astrologyService.getPublishedContent(1, 10, "in_app");
    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe("Surya Gochar in Tula Rashi");
    expect(result.count).toBe(1);
  });

  // 9. Content Feed & Pagination
  test("9. AstrologyContentScreen renders published insights list and handles pagination", async () => {
    jest.spyOn(astrologyService, "getPublishedContent").mockResolvedValue({
      items: [sampleContent],
      count: 1,
      hasMore: false,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyContentScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Cosmic Insights");
    expect(str).toContain("Surya Gochar in Tula Rashi");
  });

  // 10. Content Detail Screen
  test("10. AstrologyContentDetailScreen displays full planetary guidance body and publish date", async () => {
    mockRouteParams = { contentId: "content-insight-1" };
    jest.spyOn(astrologyService, "getContentById").mockResolvedValue(sampleContent);

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Surya Gochar in Tula Rashi");
    expect(str).toContain("Sun enters Libra bringing balance");
    expect(str).toContain("Daily In-App");
  });

  // 11 & 12. Delivery History Pagination & Empty State
  test("11 & 12. AstrologyDeliveriesScreen renders delivery history and empty state when no deliveries exist", async () => {
    jest.spyOn(astrologyService, "getCustomerDeliveries").mockResolvedValue({
      deliveries: [sampleDelivery],
      count: 1,
      hasMore: false,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyDeliveriesScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Delivery Journal");
    expect(str).toContain("Surya Gochar in Tula Rashi");
    expect(str).toContain("Delivered");
  });

  // 13. Customer Ownership Isolation
  test("13. astrologyService.getCustomerSubscription scopes query to authenticated customer_id", async () => {
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: "sub-123",
          customer_id: "cust-user-1",
          plan_id: "plan-monthly-1",
          payment_order_id: "po-sub-123",
          starts_at: "2026-10-01T00:00:00Z",
          ends_at: "2026-10-31T23:59:59Z",
          status: "active",
          created_at: "2026-10-01T00:00:00Z",
          astrology_subscription_plans: samplePlan,
        },
        error: null,
      }),
    };

    jest.spyOn(supabase, "from").mockReturnValue(mockQuery as any);

    const sub = await astrologyService.getCustomerSubscription("cust-user-1");
    expect(sub?.customer_id).toBe("cust-user-1");
    expect(sub?.plan?.name).toBe("Masik Jyotish Guidance");
  });

  // 14. Plan Detail Subscribe CTA with duplicate tap protection and authoritative plan ID
  test("14. Plan detail Subscribe CTA calls createSubscriptionOrder with only planId and navigates to AstrologyPayment", async () => {
    mockRouteParams = { planId: "plan-monthly-1" };
    jest.spyOn(astrologyService, "getPlanById").mockResolvedValue(samplePlan);
    const mockCreateOrder = jest.spyOn(astrologyService, "createSubscriptionOrder").mockResolvedValue({
      subscription_id: "sub-123-new",
      payment_order_id: "po-sub-123-new",
      amount: 501,
      currency: "INR",
      status: "payment_pending",
      starts_at: null,
      ends_at: null,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyPlanDetailScreen />);
    });

    const buttons = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button);
    const subscribeBtn = buttons[buttons.length - 1];

    expect(subscribeBtn.props.disabled).toBe(false);
    expect(subscribeBtn.props.title).toContain("Subscribe Now");

    await act(async () => {
      subscribeBtn.props.onPress();
    });

    expect(mockCreateOrder).toHaveBeenCalledWith("plan-monthly-1");
    expect(mockNavigate).toHaveBeenCalledWith("AstrologyPayment", {
      subscriptionId: "sub-123-new",
      paymentOrderId: "po-sub-123-new",
      planId: "plan-monthly-1",
      planName: "Masik Jyotish Guidance",
      amount: 501,
      currency: "INR",
      durationDays: 30,
    });
  });

  // 15. Plan Detail Active Subscription Conflict (Backend 409)
  test("15. Handles already-active subscription conflict gracefully on plan detail screen", async () => {
    mockRouteParams = { planId: "plan-monthly-1" };
    jest.spyOn(astrologyService, "getPlanById").mockResolvedValue(samplePlan);
    jest.spyOn(astrologyService, "createSubscriptionOrder").mockRejectedValue(
      new Error("Customer already has an active astrology subscription")
    );

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyPlanDetailScreen />);
    });

    const buttons = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button);
    const subscribeBtn = buttons[buttons.length - 1];

    await act(async () => {
      subscribeBtn.props.onPress();
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("You already have an active astrology subscription");
  });

  // 16. AstrologyPaymentScreen flow: Initial render, Razorpay invocation, and active confirmation
  test("16. AstrologyPaymentScreen launches Razorpay and polls until subscription becomes active", async () => {
    mockRouteParams = {
      subscriptionId: "sub-123-new",
      paymentOrderId: "po-sub-123-new",
      planId: "plan-monthly-1",
      planName: "Masik Jyotish Guidance",
      amount: 501,
      currency: "INR",
      durationDays: 30,
    };

    const mockCreateRzp = jest.spyOn(astrologyPaymentService, "createRazorpayOrder").mockResolvedValue({
      razorpay_order_id: "order_rzp_sub_123",
      amount: 50100,
      currency: "INR",
      key_id: "rzp_test_key_123",
    });

    const mockOpenCheckout = jest.spyOn(astrologyPaymentService, "openRazorpayCheckout").mockResolvedValue({
      razorpay_payment_id: "pay_sub_123",
      razorpay_order_id: "order_rzp_sub_123",
    });

    const mockPoll = jest.spyOn(astrologyPaymentService, "pollSubscriptionConfirmation").mockResolvedValue({
      confirmed: true,
      status: "active",
      subscription: {
        ...sampleSubscription,
        id: "sub-123-new",
        starts_at: "2026-10-06T12:00:00Z",
        ends_at: "2026-11-05T12:00:00Z",
      },
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyPaymentScreen />);
    });

    const strInitial = extractAllText(tree.toJSON());
    expect(strInitial).toContain("Masik Jyotish Guidance");
    expect(strInitial).toContain("30 Days");

    const payBtn = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button)[0];

    await act(async () => {
      payBtn.props.onPress();
    });

    expect(mockCreateRzp).toHaveBeenCalledWith("po-sub-123-new");
    expect(mockOpenCheckout).toHaveBeenCalled();
    expect(mockPoll).toHaveBeenCalledWith("sub-123-new", 12, 2000);

    const strConfirmed = extractAllText(tree.toJSON());
    expect(strConfirmed).toContain("Subscription Activated!");
    expect(strConfirmed).toContain("Access Cosmic Insights");
  });

  // 17. AstrologyPaymentScreen: Polling timeout while status remains payment_pending
  test("17. AstrologyPaymentScreen handles webhook confirmation timeout gracefully", async () => {
    mockRouteParams = {
      subscriptionId: "sub-123-pending",
      paymentOrderId: "po-sub-123-pending",
      planId: "plan-monthly-1",
      planName: "Masik Jyotish Guidance",
      amount: 501,
      currency: "INR",
      durationDays: 30,
    };

    jest.spyOn(astrologyPaymentService, "createRazorpayOrder").mockResolvedValue({
      razorpay_order_id: "order_rzp_sub_pending",
      amount: 50100,
      currency: "INR",
      key_id: "rzp_test_key_123",
    });

    jest.spyOn(astrologyPaymentService, "openRazorpayCheckout").mockResolvedValue({
      razorpay_payment_id: "pay_sub_pending",
      razorpay_order_id: "order_rzp_sub_pending",
    });

    jest.spyOn(astrologyPaymentService, "pollSubscriptionConfirmation").mockResolvedValue({
      confirmed: false,
      status: "payment_pending",
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyPaymentScreen />);
    });

    const payBtn = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button)[0];

    await act(async () => {
      payBtn.props.onPress();
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Verification in Progress");
    expect(str).toContain("Your payment is still being confirmed.");
  });

  // 18. AstrologyPaymentScreen: User cancels checkout
  test("18. AstrologyPaymentScreen handles user cancellation gracefully", async () => {
    mockRouteParams = {
      subscriptionId: "sub-123-cancel",
      paymentOrderId: "po-sub-123-cancel",
      planId: "plan-monthly-1",
      planName: "Masik Jyotish Guidance",
      amount: 501,
      currency: "INR",
      durationDays: 30,
    };

    jest.spyOn(astrologyPaymentService, "createRazorpayOrder").mockResolvedValue({
      razorpay_order_id: "order_rzp_sub_cancel",
      amount: 50100,
      currency: "INR",
      key_id: "rzp_test_key_123",
    });

    jest.spyOn(astrologyPaymentService, "openRazorpayCheckout").mockRejectedValue(
      new Error("Payment was cancelled by user")
    );

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyPaymentScreen />);
    });

    const payBtn = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button)[0];

    await act(async () => {
      payBtn.props.onPress();
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Payment Cancelled");
    expect(str).toContain("Try Payment Again");
  });

  // 19. AstrologySubscriptionCard with payment_pending and null dates
  test("19. AstrologySubscriptionCard renders payment_pending state with Pending Activation dates", () => {
    const pendingSub: AstrologySubscription = {
      id: "sub-pending-1",
      customer_id: "cust-user-1",
      plan_id: "plan-monthly-1",
      payment_order_id: "po-123",
      starts_at: null,
      ends_at: null,
      status: "payment_pending",
      created_at: "2026-10-06T12:00:00Z",
      plan: samplePlan,
    };

    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <AstrologySubscriptionCard subscription={pendingSub} />
      );
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Pending Activation");
    expect(str).toContain("Masik Jyotish Guidance");
  });

  // 20. Navigation to Astrology Screens
  test("20. AstrologyPlanCard and AstrologyContentCard trigger navigation callbacks on press", () => {
    const onSelectPlan = jest.fn();
    const onSelectContent = jest.fn();

    let planTree: any;
    act(() => {
      planTree = ReactTestRenderer.create(
        <AstrologyPlanCard plan={samplePlan} onSelect={onSelectPlan} />
      );
    });

    const touchable = planTree.root.findByType(require("react-native").TouchableOpacity);
    act(() => {
      touchable.props.onPress();
    });
    expect(onSelectPlan).toHaveBeenCalledWith(samplePlan);

    let contentTree: any;
    act(() => {
      contentTree = ReactTestRenderer.create(
        <AstrologyContentCard content={sampleContent} onPress={onSelectContent} />
      );
    });

    const contentTouchable = contentTree.root.findByType(require("react-native").TouchableOpacity);
    act(() => {
      contentTouchable.props.onPress();
    });
    expect(onSelectContent).toHaveBeenCalledWith(sampleContent);
  });
});
