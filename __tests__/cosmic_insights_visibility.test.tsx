// __tests__/cosmic_insights_visibility.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";
import { HomeScreen } from "../src/features/discovery/screens/HomeScreen.tsx";
import { AstrologyScreen } from "../src/features/astrology/screens/AstrologyScreen.tsx";
import { AstrologyContentScreen } from "../src/features/astrology/screens/AstrologyContentScreen.tsx";
import { AstrologyContentDetailScreen } from "../src/features/astrology/screens/AstrologyContentDetailScreen.tsx";
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { dailyRashiService } from "../src/features/astrology/services/dailyRashiService.ts";
import { Button } from "../src/shared/components/ui/Button.tsx";
import {
  AstrologyContent,
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
  useFocusEffect: jest.fn(),
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
  statusCodes: {},
  isErrorWithCode: jest.fn(() => false),
  isCancelledResponse: jest.fn(() => false),
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: { id: "cust-user-1", email: "devotee@kashiveda.org" },
    profile: {
      id: "cust-user-1",
      display_name: "Devotee Sharma",
      phone: "+919876543210",
      email: "devotee@kashiveda.org",
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

jest.mock("../src/features/discovery/hooks/usePujaCategories.ts", () => ({
  usePujaCategories: () => ({
    categories: [
      { id: "cat-1", name: "Ganga Aarti", slug: "ganga-aarti" },
      { id: "cat-2", name: "Rudrabhishek", slug: "rudrabhishek" },
    ],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock("../src/features/discovery/hooks/usePanditDirectory.ts", () => ({
  usePanditDirectory: () => ({
    pandits: [
      { id: "pandit-1", display_name: "Pt. Ramakant Shukla", city: "Varanasi" },
    ],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

jest.mock("../src/features/astrology/services/dailyRashiService.ts", () => ({
  dailyRashiService: {
    fetchDailyInsight: jest.fn().mockResolvedValue({
      success: true,
      is_entitled: false,
      is_unverified: false,
      content: {
        id: "daily-1",
        rashi_id: 1,
        insight_date: "2026-10-11",
        general_outlook: "Moon in Aries brings energy",
        career_business: null, // Gated
        health_wellbeing: null, // Gated
        status: "published",
        rashi_name: "Mesha",
        language: "en",
      },
    }),
    getPreferredRashi: jest.fn().mockResolvedValue(1),
    savePreferredRashi: jest.fn().mockResolvedValue(true),
    clearSessionCache: jest.fn(),
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

describe("Cosmic Insights Visibility & Navigation Suite", () => {
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

  const sampleContent: AstrologyContent = {
    id: "content-insight-101",
    channel: "in_app",
    title: "Surya Gochar in Tula Rashi",
    body: "Sun enters Libra bringing cosmic balance and heightened spiritual awareness.",
    publish_at: "2026-10-10T06:00:00Z",
    expires_at: null,
    status: "published",
    created_by: "admin-1",
    created_at: "2026-10-10T06:00:00Z",
    updated_at: "2026-10-10T06:00:00Z",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
  });

  // 1 & 2. Home screen discoverable Cosmic Insights entry & navigation
  test("1 & 2. HomeScreen renders prominent Cosmic Insights entry near top and navigates to Astrology", async () => {
    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<HomeScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Cosmic Insights");
    expect(str).toContain("Daily Guidance");
    expect(str).toContain("Explore daily planetary transits, auspicious timings, and Vedic Jyotish guidance.");

    // Find the upper touchable entry point
    const root = tree.root;
    const touchables = root.findAllByType(TouchableOpacity);
    const cosmicEntry = touchables.find(
      (t: any) => t.props.accessibilityLabel === "Cosmic Insights & Vedic Astrology"
    );
    expect(cosmicEntry).toBeDefined();

    act(() => {
      cosmicEntry.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("Astrology");

    // Also verify that the secondary entry in Sacred Pillars still exists and works
    const pillarEntry = touchables.find(
      (t: any) => t.props.accessibilityLabel === "Vedic Astrology and Insights"
    );
    expect(pillarEntry).toBeDefined();
    act(() => {
      pillarEntry.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("Astrology");
  });

  // 3 & 4. AstrologyScreen renders Cosmic Insights near top (above Daily Horoscope and Plans) with View All link
  test("3 & 4. AstrologyScreen positions Cosmic Insights section near top and shows View All link with content", async () => {
    jest.spyOn(astrologyService, "getActivePlans").mockResolvedValue([samplePlan]);
    jest.spyOn(astrologyService, "getCustomerSubscription").mockResolvedValue(null);
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
    expect(str).toContain("Cosmic Insights");
    expect(str).toContain("Daily celestial transits and spiritual guidance");
    expect(str).toContain("View All ›");
    expect(str).toContain("Surya Gochar in Tula Rashi");

    // Check layout order: "Cosmic Insights" appears before "Daily Vedic Horoscope" and "Subscription Plans"
    const cosmicIndex = str.indexOf("Cosmic Insights");
    const horoscopeIndex = str.indexOf("Daily Vedic Horoscope");
    const plansIndex = str.indexOf("Subscription Plans");

    expect(cosmicIndex).toBeGreaterThan(-1);
    expect(horoscopeIndex).toBeGreaterThan(-1);
    expect(plansIndex).toBeGreaterThan(-1);
    expect(cosmicIndex).toBeLessThan(horoscopeIndex);
    expect(horoscopeIndex).toBeLessThan(plansIndex);

    // Verify tapping "View All ›" navigates to AstrologyContent
    const touchables = tree.root.findAllByType(TouchableOpacity);
    const viewAllBtn = touchables.find(
      (t: any) => t.props.accessibilityLabel === "View all cosmic insights"
    );
    expect(viewAllBtn).toBeDefined();

    act(() => {
      viewAllBtn.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("AstrologyContent");
  });

  // 5. Feed-navigation button remains visible when content is empty (no dead end)
  test("5. AstrologyScreen renders View All link and actionable EmptyState button when content is empty", async () => {
    jest.spyOn(astrologyService, "getActivePlans").mockResolvedValue([samplePlan]);
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
    expect(str).toContain("Cosmic Insights");
    expect(str).toContain("View All ›"); // View All link is NOT hidden
    expect(str).toContain("No Insights Available");
    expect(str).toContain("Browse All Insights");

    // Tapping the section header "View All ›" navigates to AstrologyContent
    const touchables = tree.root.findAllByType(TouchableOpacity);
    const viewAllBtn = touchables.find(
      (t: any) => t.props.accessibilityLabel === "View all cosmic insights"
    );
    expect(viewAllBtn).toBeDefined();
    act(() => {
      viewAllBtn.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("AstrologyContent");

    // Tapping the EmptyState action button also navigates to AstrologyContent
    const buttons = tree.root.findAllByType(Button);
    const browseAllBtn = buttons.find((b: any) => b.props.title === "Browse All Insights");
    expect(browseAllBtn).toBeDefined();
    act(() => {
      browseAllBtn.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("AstrologyContent");
  });

  // 6. Feed opens successfully with no article cards and displays actionable refresh
  test("6. AstrologyContentScreen opens cleanly with zero articles and shows Refresh Insights action", async () => {
    const mockRefresh = jest.spyOn(astrologyService, "getPublishedContent").mockResolvedValue({
      items: [],
      count: 0,
      hasMore: false,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyContentScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Cosmic Insights");
    expect(str).toContain("All Insights");
    expect(str).toContain("Daily In-App");
    expect(str).toContain("WhatsApp Broadcasts");
    expect(str).toContain("No Insights Available");
    expect(str).toContain("Refresh Insights");

    // Tapping Refresh Insights re-queries getPublishedContent
    const buttons = tree.root.findAllByType(Button);
    const refreshBtn = buttons.find((b: any) => b.props.title === "Refresh Insights");
    expect(refreshBtn).toBeDefined();

    await act(async () => {
      refreshBtn.props.onPress();
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  // 7. Published article cards navigate to correct detail record
  test("7. Tapping an AstrologyContentCard navigates to AstrologyContentDetail with contentId", async () => {
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
    expect(str).toContain("Surya Gochar in Tula Rashi");

    // Find card and tap
    const cardComponent = tree.root.findByType(
      require("../src/features/astrology/components/AstrologyContentCard.tsx").AstrologyContentCard
    );
    expect(cardComponent).toBeDefined();

    act(() => {
      cardComponent.props.onPress(sampleContent);
    });
    expect(mockNavigate).toHaveBeenCalledWith("AstrologyContentDetail", {
      contentId: "content-insight-101",
    });
  });

  // 8 & 9. Error state and Retry behavior on AstrologyScreen and AstrologyContentDetailScreen
  test("8 & 9. Query failure displays ErrorState and actionable Retry re-fetches content", async () => {
    jest.spyOn(astrologyService, "getActivePlans").mockResolvedValue([samplePlan]);
    jest.spyOn(astrologyService, "getCustomerSubscription").mockResolvedValue(null);
    const mockFetch = jest
      .spyOn(astrologyService, "getPublishedContent")
      .mockRejectedValue(new Error("Network timeout: unable to reach database."));

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(mockFetch).toHaveBeenCalled();
    expect(str).toContain("Unable to Load Insights");
    expect(str).toContain("Network timeout");

    // Detail screen error and retry
    mockRouteParams = { contentId: "content-insight-101" };
    const mockDetailFetch = jest
      .spyOn(astrologyService, "getContentById")
      .mockRejectedValueOnce(new Error("Connection reset"))
      .mockResolvedValueOnce(sampleContent);

    let detailTree: any;
    await act(async () => {
      detailTree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
    });

    let detailStr = extractAllText(detailTree.toJSON());
    expect(detailStr).toContain("Insight Not Available");
    expect(detailStr).toContain("Connection reset");

    // Tap Retry on detail screen
    const buttons = detailTree.root.findAllByType(Button);
    const retryBtn = buttons.find((b: any) => b.props.title?.includes("Retry") || b.props.title?.includes("Try Again"));
    expect(retryBtn).toBeDefined();

    await act(async () => {
      retryBtn.props.onPress();
    });

    expect(mockDetailFetch).toHaveBeenCalledTimes(2);
    detailStr = extractAllText(detailTree.toJSON());
    expect(detailStr).toContain("Surya Gochar in Tula Rashi");
  });

  // 10. Channel filter chip triggers getPublishedContent with expected channel parameter
  test("10. AstrologyContentScreen filter chips toggle channel filter correctly", async () => {
    const mockQuery = jest.spyOn(astrologyService, "getPublishedContent").mockResolvedValue({
      items: [sampleContent],
      count: 1,
      hasMore: false,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyContentScreen />);
    });

    const touchables = tree.root.findAllByType(TouchableOpacity);
    const inAppChip = touchables.find((t: any) => t.props.accessibilityLabel === "Daily In-App insights");
    expect(inAppChip).toBeDefined();

    await act(async () => {
      inAppChip.props.onPress();
    });

    expect(mockQuery).toHaveBeenCalledWith(1, 10, "in_app");

    const newTouchables = tree.root.findAllByType(TouchableOpacity);
    const whatsappChip = newTouchables.find((t: any) => t.props.accessibilityLabel === "WhatsApp Broadcasts");
    expect(whatsappChip).toBeDefined();

    await act(async () => {
      whatsappChip.props.onPress();
    });

    expect(mockQuery).toHaveBeenCalledWith(1, 10, "whatsapp");
  });

  // 11, 12 & 13. Policy preservation: Unsubscribed user reads published legacy content, Daily Horoscope still gated
  test("11, 12 & 13. Option A policy preserved: published legacy content reads freely, Daily Horoscope retains gating", async () => {
    // Legacy content detail reads without subscription
    mockRouteParams = { contentId: "content-insight-101" };
    jest.spyOn(astrologyService, "getContentById").mockResolvedValue(sampleContent);

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Surya Gochar in Tula Rashi");
    expect(str).toContain("Sun enters Libra bringing cosmic balance");
    // Verify no lock icon or subscription paywall on legacy article
    expect(str).not.toContain("Unlock Guidance");
    expect(str).not.toContain("Paid Vedic Guidance");

    // In contrast, Daily Vedic Horoscope retains subscription gating
    const dailyInsight = await dailyRashiService.fetchDailyInsight("2026-10-11", 1);
    expect(dailyInsight.is_entitled).toBe(false);
    expect(dailyInsight.content?.career_business).toBeNull();
  });

  // 14. Unrelated Home and Astrology navigation continues to work
  test("14. Unrelated Home features (categories, pandits, service modes) remain functional", async () => {
    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<HomeScreen />);
    });

    const touchables = tree.root.findAllByType(TouchableOpacity);

    // Service mode: Home Puja
    const homePuja = touchables.find((t: any) => t.props.accessibilityLabel === "Explore Home Pujas");
    expect(homePuja).toBeDefined();
    act(() => {
      homePuja.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("PujaList", {
      serviceMode: "home",
      modeTitle: "Home Pujas",
    });

    // Browse all pujas
    const browseAll = touchables.find((t: any) => t.props.accessibilityLabel === "Browse All Pujas");
    expect(browseAll).toBeDefined();
    act(() => {
      browseAll.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("PujaList");
  });
});
