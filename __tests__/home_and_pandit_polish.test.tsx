// __tests__/home_and_pandit_polish.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { HomeScreen } from "../src/features/discovery/screens/HomeScreen.tsx";
import { PanditCard } from "../src/features/discovery/components/PanditCard.tsx";
import { PanditSummary } from "../src/features/discovery/types/discovery.ts";
import { ThemeProvider } from "../src/shared/theme/index.ts";
import { LanguageProvider } from "../src/shared/i18n/index.ts";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(30000);

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: any = {};

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    dispatch: jest.fn(),
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
  useFocusEffect: (cb: any) => {
    const ReactModule = require("react");
    ReactModule.useEffect(() => {
      return cb();
    }, [cb]);
  },
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

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user-id" } },
    user: { id: "test-user-id", phone: "+919876543210" },
    profile: { display_name: "Rahul Sharma" },
    role: "customer",
    roles: ["customer"],
    panditProfile: null,
    isLoading: false,
    error: null,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

function extractAllText(node: any): string {
  function collect(n: any): string {
    if (!n) return "";
    if (typeof n === "string" || typeof n === "number") return String(n);
    if (Array.isArray(n)) return n.map(collect).join(" ");
    if (n.children) return collect(n.children);
    if (n.props && n.props.children) return collect(n.props.children);
    return "";
  }
  return collect(node).replace(/\s+/g, " ").trim();
}

const initialMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, bottom: 34, right: 0 },
};

const renderWithProviders = (children: React.ReactElement, language: "en" | "hi" = "en") => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ThemeProvider initialColorScheme="light">
          <LanguageProvider initialLanguage={language}>{children}</LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return renderer;
};

const samplePanditWithReviews: PanditSummary = {
  id: "pandit-1",
  user_id: "user-1",
  display_name: "Pt. Ramkrishna Shastri",
  avatar_url: null,
  bio: "Vedic priest from Varanasi",
  years_experience: 22,
  rating_avg: 4.8,
  rating_count: 42,
  languages: ["Sanskrit", "Hindi"],
  offering_names: ["Rudrabhishek", "Mahamrityunjaya"],
  puja_price: 2100,
  public_status: "available",
  distance_km: null,
  kundli_enabled: false,
  kundli_price: null,
};

const samplePanditNew: PanditSummary = {
  id: "pandit-2",
  user_id: "user-2",
  display_name: "Acharya Vidyadhar",
  avatar_url: null,
  bio: "Rigveda scholar",
  years_experience: 6,
  rating_avg: null,
  rating_count: 0,
  languages: ["Sanskrit", "Hindi"],
  offering_names: ["Navgrah Shanti"],
  puja_price: 3100,
  public_status: "available",
  distance_km: null,
  kundli_enabled: false,
  kundli_price: null,
};

describe("Milestone 1: Home Screen & PanditCard Polish Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "puja_categories") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: any) =>
            resolve({
              data: [
                { id: "cat-1", name: "Abhishek & Rudra", display_order: 1, is_active: true },
              ],
              error: null,
            }),
        } as any;
      }
      if (table === "puja_services") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          contains: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          range: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          then: (resolve: any) =>
            resolve({
              data: [
                {
                  id: "puja-1",
                  category_id: "cat-1",
                  name: "Kashi Vishwanath Rudrabhishek",
                  description: "Complete Rudrabhishek with Ganga jal",
                  default_duration_minutes: 90,
                  allowed_modes: ["home", "temple", "remote"],
                  is_active: true,
                  category: { name: "Abhishek & Rudra" },
                  starting_price: 2100,
                },
              ],
              error: null,
            }),
        } as any;
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      } as any;
    });
  });

  describe("R1: Home Screen Sacred Puja Mode Cards", () => {
    it("renders mode titles ('Home Puja', 'Online Puja', 'Temple Puja') and circular icons", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain("Home Puja");
      expect(allText).toContain("Online Puja");
      expect(allText).toContain("Temple Puja");

      // Verify circular icon wrappers exist within each of the three mode cards
      const homeCard = renderer.root.findByProps({ accessibilityLabel: "Explore Home Pujas" });
      const onlineCard = renderer.root.findByProps({ accessibilityLabel: "Explore Online Pujas" });
      const templeCard = renderer.root.findByProps({ accessibilityLabel: "Explore Temple Pujas" });

      const findCircleIn = (parent: any) =>
        parent.findAll((node: any) => {
          const style = Array.isArray(node.props?.style)
            ? Object.assign({}, ...node.props.style)
            : node.props?.style;
          return style?.width === 38 && style?.height === 38 && style?.borderRadius === 19;
        });

      expect(findCircleIn(homeCard).length).toBeGreaterThanOrEqual(1);
      expect(findCircleIn(onlineCard).length).toBeGreaterThanOrEqual(1);
      expect(findCircleIn(templeCard).length).toBeGreaterThanOrEqual(1);
    });

    it("does NOT render bottom subtitle lines ('At Home', 'Live Darshan', 'In Sanctum' and Hindi equivalents)", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      const allText = extractAllText(renderer.toJSON());
      // Subtitles must be removed from the visible card UI
      expect(allText).not.toContain("At Home");
      expect(allText).not.toContain("Live Darshan");
      expect(allText).not.toContain("In Sanctum");
      expect(allText).not.toContain("यजमान गृह");
      expect(allText).not.toContain("लाइव वीडियो");
      expect(allText).not.toContain("मंदिर गर्भगृह");
    });

    it("navigates to CustomerTabs -> Explore with serviceMode for each of the 3 mode cards", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      const homeCard = renderer.root.findByProps({ accessibilityLabel: "Explore Home Pujas" });
      const onlineCard = renderer.root.findByProps({ accessibilityLabel: "Explore Online Pujas" });
      const templeCard = renderer.root.findByProps({ accessibilityLabel: "Explore Temple Pujas" });

      act(() => {
        homeCard.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith("CustomerTabs", {
        screen: "Explore",
        params: { initialTab: "pujas", serviceMode: "home" },
      });

      act(() => {
        onlineCard.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith("CustomerTabs", {
        screen: "Explore",
        params: { initialTab: "pujas", serviceMode: "remote" },
      });

      act(() => {
        templeCard.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith("CustomerTabs", {
        screen: "Explore",
        params: { initialTab: "pujas", serviceMode: "temple" },
      });
    });

    it("maintains balanced card minHeight (88 or 96dp) and activeOpacity touch feedback", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      const homeTouchable = renderer.root.findByProps({ accessibilityLabel: "Explore Home Pujas" });
      expect(homeTouchable.props.activeOpacity).toBe(0.8);

      const cards = renderer.root.findAll((node: any) => {
        const style = Array.isArray(node.props?.style)
          ? Object.assign({}, ...node.props.style)
          : node.props?.style;
        return (style?.minHeight === 88 || style?.minHeight === 96) && style?.borderWidth === 1;
      });
      expect(cards.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("R2: PanditCard Credential Strip & Rating Refinement", () => {
    it("completely removes 'Kashi Vidvat Parishad' and 'काशी विद्वत परिषद्' from the card", () => {
      const renderer = renderWithProviders(
        <PanditCard pandit={samplePanditWithReviews} onPress={jest.fn()} />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).not.toContain("Kashi Vidvat Parishad");
      expect(allText).not.toContain("काशी विद्वत परिषद्");
    });

    it("redesigns the credential strip away from harsh yellow styling (#FEF3C7)", () => {
      const renderer = renderWithProviders(
        <PanditCard pandit={samplePanditWithReviews} onPress={jest.fn()} />
      );

      const credentialStrips = renderer.root.findAll((node: any) => {
        const style = Array.isArray(node.props?.style)
          ? Object.assign({}, ...node.props.style)
          : node.props?.style;
        return style?.borderRadius === 8 && style?.flexDirection === "row";
      });

      expect(credentialStrips.length).toBeGreaterThanOrEqual(1);
      const stripStyle = Array.isArray(credentialStrips[0].props.style)
        ? Object.assign({}, ...credentialStrips[0].props.style)
        : credentialStrips[0].props.style;

      // Must NOT use the harsh saturated yellow #FEF3C7
      expect(stripStyle.backgroundColor).not.toBe("#FEF3C7");
      // Must use clean theme surface tokens (#FFFFFF or #FFFDF9 / surfaceBase / surfaceCard)
      expect(["#FFFFFF", "#FFFDF9", "#FAF5EF", "#F8F6F0"]).toContain(stripStyle.backgroundColor);
    });

    it("preserves exact devotee rating formatting ('★ 4.8 (42)' and '★ New Pandit Ji')", () => {
      const rendererWithReviews = renderWithProviders(
        <PanditCard pandit={samplePanditWithReviews} onPress={jest.fn()} />
      );
      const textReviews = extractAllText(rendererWithReviews.toJSON());
      expect(textReviews).toContain("★ 4.8 (42)");

      const rendererNew = renderWithProviders(
        <PanditCard pandit={samplePanditNew} onPress={jest.fn()} />
      );
      const textNew = extractAllText(rendererNew.toJSON());
      expect(textNew).toContain("★ New Pandit Ji");
      expect(textNew).not.toContain("★ 0.0");
    });
  });

  describe("R3: PanditCard Two-Button Action Layout", () => {
    it("renders two action buttons ('View Profile' and 'Pooja Offered') and removes 'Request Sankalp'", () => {
      const renderer = renderWithProviders(
        <PanditCard pandit={samplePanditWithReviews} onPress={jest.fn()} />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain("View Profile");
      expect(allText).toContain("Pooja Offered");
      expect(allText).not.toContain("Request Sankalp");
      expect(allText).not.toContain("संकल्प अनुरोध");
    });

    it("ensures both action buttons meet the accessibility touch target standard (minHeight >= 48dp)", () => {
      const renderer = renderWithProviders(
        <PanditCard pandit={samplePanditWithReviews} onPress={jest.fn()} />
      );

      // Find the two action buttons by testID
      const viewProfileBtn = renderer.root.find(
        (node: any) =>
          node.props?.testID === `pandit-card-${samplePanditWithReviews.id}-view-profile`
      );
      const pujasOfferedBtn = renderer.root.find(
        (node: any) =>
          node.props?.testID === `pandit-card-${samplePanditWithReviews.id}-pujas-offered`
      );

      expect(viewProfileBtn).toBeDefined();
      expect(pujasOfferedBtn).toBeDefined();

      const getMinHeight = (btn: any) => {
        const style = Array.isArray(btn.props?.style)
          ? Object.assign({}, ...btn.props.style)
          : btn.props?.style;
        return style?.minHeight ?? style?.height;
      };

      expect(getMinHeight(viewProfileBtn)).toBeGreaterThanOrEqual(48);
      expect(getMinHeight(pujasOfferedBtn)).toBeGreaterThanOrEqual(48);
    });

    it("triggers onViewProfile and onPujasOffered callbacks when provided", () => {
      const handlePress = jest.fn();
      const handleViewProfile = jest.fn();
      const handlePujasOffered = jest.fn();

      const renderer = renderWithProviders(
        <PanditCard
          pandit={samplePanditWithReviews}
          onPress={handlePress}
          onViewProfile={handleViewProfile}
          onPujasOffered={handlePujasOffered}
        />
      );

      const viewProfileBtn = renderer.root.find((node: any) =>
        node.props?.accessibilityRole === "button" &&
        (node.props?.accessibilityLabel?.includes("View Profile") ||
          node.props?.testID === `pandit-card-${samplePanditWithReviews.id}-view-profile`)
      );

      const pujasOfferedBtn = renderer.root.find((node: any) =>
        node.props?.accessibilityRole === "button" &&
        (node.props?.accessibilityLabel?.includes("Pooja Offered") ||
          node.props?.testID === `pandit-card-${samplePanditWithReviews.id}-pujas-offered`)
      );

      act(() => {
        viewProfileBtn.props.onPress();
      });
      expect(handleViewProfile).toHaveBeenCalledTimes(1);
      expect(handlePress).not.toHaveBeenCalled();

      act(() => {
        pujasOfferedBtn.props.onPress();
      });
      expect(handlePujasOffered).toHaveBeenCalledTimes(1);
      expect(handlePress).not.toHaveBeenCalled();
    });

    it("falls back to onPress for both buttons when optional callbacks are omitted (100% backward compatible)", () => {
      const handlePress = jest.fn();

      const renderer = renderWithProviders(
        <PanditCard pandit={samplePanditWithReviews} onPress={handlePress} />
      );

      const viewProfileBtn = renderer.root.find((node: any) =>
        node.props?.accessibilityRole === "button" &&
        (node.props?.accessibilityLabel?.includes("View Profile") ||
          node.props?.testID === `pandit-card-${samplePanditWithReviews.id}-view-profile`)
      );

      const pujasOfferedBtn = renderer.root.find((node: any) =>
        node.props?.accessibilityRole === "button" &&
        (node.props?.accessibilityLabel?.includes("Pooja Offered") ||
          node.props?.testID === `pandit-card-${samplePanditWithReviews.id}-pujas-offered`)
      );

      act(() => {
        viewProfileBtn.props.onPress();
      });
      expect(handlePress).toHaveBeenCalledTimes(1);

      act(() => {
        pujasOfferedBtn.props.onPress();
      });
      expect(handlePress).toHaveBeenCalledTimes(2);
    });
  });
});
