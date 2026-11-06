// __tests__/adversarial_m1_challenger2.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { HomeScreen } from "../src/features/discovery/screens/HomeScreen.tsx";
import { ExploreScreen } from "../src/features/discovery/screens/ExploreScreen.tsx";
import { PanditDirectoryScreen } from "../src/features/discovery/screens/PanditDirectoryScreen.tsx";
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

const mockPanditItem: PanditSummary = {
  id: "pandit-adv-1",
  user_id: "user-adv-1",
  display_name: "Acharya Devavrat",
  avatar_url: "https://example.com/avatar.jpg",
  bio: "Senior Rigveda priest",
  years_experience: 15,
  rating_avg: 4.9,
  rating_count: 88,
  languages: ["Sanskrit", "Hindi", "English"],
  offering_names: ["Rudra Mahayagya", "Griha Pravesh"],
  puja_price: 5100,
  public_status: "available",
  distance_km: 2.5,
  kundli_enabled: true,
  kundli_price: 1100,
};

describe("Adversarial Stress Harness: Challenger 2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};

    jest.spyOn(supabase, "rpc").mockImplementation((fn: string) => {
      if (fn === "get_customer_pandits") {
        return Promise.resolve({
          data: [mockPanditItem],
          error: null,
        }) as any;
      }
      return Promise.resolve({ data: [], error: null }) as any;
    });

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
      if (table === "bookings") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: [], error: null }),
        } as any;
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      } as any;
    });
  });

  describe("Probe 1: Adversarial Navigation on HomeScreen Mode Cards", () => {
    it("dispatches exact customer tabs and exploration parameters on tapping cards", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      const homeCard = renderer.root.findByProps({ accessibilityLabel: "Explore Home Pujas" });
      const onlineCard = renderer.root.findByProps({ accessibilityLabel: "Explore Online Pujas" });
      const templeCard = renderer.root.findByProps({ accessibilityLabel: "Explore Temple Pujas" });

      // Tap Home
      act(() => {
        homeCard.props.onPress();
      });
      expect(mockNavigate).toHaveBeenLastCalledWith("CustomerTabs", {
        screen: "Explore",
        params: { initialTab: "pujas", serviceMode: "home" },
      });

      // Tap Online
      act(() => {
        onlineCard.props.onPress();
      });
      expect(mockNavigate).toHaveBeenLastCalledWith("CustomerTabs", {
        screen: "Explore",
        params: { initialTab: "pujas", serviceMode: "remote" },
      });

      // Tap Temple
      act(() => {
        templeCard.props.onPress();
      });
      expect(mockNavigate).toHaveBeenLastCalledWith("CustomerTabs", {
        screen: "Explore",
        params: { initialTab: "pujas", serviceMode: "temple" },
      });

      // Sequential multi-tap stress
      act(() => {
        homeCard.props.onPress();
        templeCard.props.onPress();
        onlineCard.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledTimes(6);
    });

    it("verifies touch target wrapper and activeOpacity on all 3 cards", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      const labels = [
        "Explore Home Pujas",
        "Explore Online Pujas",
        "Explore Temple Pujas",
      ];

      for (const label of labels) {
        const touchable = renderer.root.findByProps({ accessibilityLabel: label });
        expect(touchable.props.accessibilityRole).toBe("button");
        expect(touchable.props.activeOpacity).toBe(0.8);
      }
    });
  });

  describe("Probe 2: Hindi Locale Stress & Subtitle Absence Verification", () => {
    it("renders HomeScreen under Hindi locale without crashing and without deleted subtitles", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />, "hi");
      });

      const text = extractAllText(renderer.toJSON());

      // Ensure absolutely NO deleted subtitles exist in English or Hindi
      const deletedSubtitles = [
        "At Home",
        "Live Darshan",
        "In Sanctum",
        "यजमान गृह",
        "लाइव वीडियो",
        "मंदिर गर्भगृह",
      ];

      for (const sub of deletedSubtitles) {
        expect(text).not.toContain(sub);
      }
    });

    it("renders PanditCard under Hindi locale with correct translations and without removed affiliation", () => {
      const renderer = renderWithProviders(
        <PanditCard pandit={mockPanditItem} onPress={jest.fn()} />,
        "hi"
      );

      const text = extractAllText(renderer.toJSON());

      // Correct Hindi button translations
      expect(text).toContain("प्रोफ़ाइल देखें");
      expect(text).toContain("पूजा सेवाएं");

      // Experience translation
      expect(text).toContain("15 वर्ष परंपरा");

      // Disallowed removed texts
      expect(text).not.toContain("Kashi Vidvat Parishad");
      expect(text).not.toContain("काशी विद्वत परिषद्");
      expect(text).not.toContain("Request Sankalp");
      expect(text).not.toContain("संकल्प अनुरोध");

      // Rating accessibility label in Hindi
      const ratingStrip = renderer.root.find((node: any) =>
        node.props?.accessibilityRole === "text" &&
        node.props?.accessibilityLabel?.includes("समीक्षाएं")
      );
      expect(ratingStrip).toBeDefined();
      expect(ratingStrip.props.accessibilityLabel).toBe("4.9 स्टार, 88 समीक्षाएं");
    });
  });

  describe("Probe 3: Layout Balance & Theme Consistency", () => {
    it("verifies serviceModeCard styles match design system invariants", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      const cards = renderer.root.findAll((node: any) => {
        const style = Array.isArray(node.props?.style)
          ? Object.assign({}, ...node.props.style)
          : node.props?.style;
        return style?.minHeight === 88;
      });

      expect(cards.length).toBeGreaterThanOrEqual(3);
      const modeCardStyles = cards.map((c: any) =>
        Array.isArray(c.props.style) ? Object.assign({}, ...c.props.style) : c.props.style
      );
      for (const style of modeCardStyles) {
        expect(style.minHeight).toBe(88);
        expect(style.borderRadius).toBe(14);
        expect(style.borderWidth).toBe(1);
        expect(style.borderColor).toBe("#ede4d5");
      }
    });

    it("verifies PanditCard credential strip and two buttons geometry", () => {
      const renderer = renderWithProviders(
        <PanditCard pandit={mockPanditItem} onPress={jest.fn()} />
      );

      // Credential strip
      const stripNodes = renderer.root.findAll((node: any) => {
        const style = Array.isArray(node.props?.style)
          ? Object.assign({}, ...node.props.style)
          : node.props?.style;
        return style?.borderRadius === 8 && style?.flexDirection === "row" && style?.marginTop === 12;
      });
      expect(stripNodes.length).toBeGreaterThanOrEqual(1);
      const stripStyle = Array.isArray(stripNodes[0].props.style)
        ? Object.assign({}, ...stripNodes[0].props.style)
        : stripNodes[0].props.style;
      expect(stripStyle.backgroundColor).not.toBe("#FEF3C7");

      // Action buttons
      const viewProfileBtn = renderer.root.findByProps({
        testID: `pandit-card-${mockPanditItem.id}-view-profile`,
      });
      const pujasOfferedBtn = renderer.root.findByProps({
        testID: `pandit-card-${mockPanditItem.id}-pujas-offered`,
      });

      const getStyle = (node: any) =>
        Array.isArray(node.props.style)
          ? Object.assign({}, ...node.props.style)
          : node.props.style;

      const vpStyle = getStyle(viewProfileBtn);
      const poStyle = getStyle(pujasOfferedBtn);

      expect(vpStyle.minHeight).toBe(48);
      expect(poStyle.minHeight).toBe(48);
      expect(vpStyle.borderRadius).toBe(8);
      expect(poStyle.borderRadius).toBe(8);
    });
  });

  describe("Probe 4: Caller Contract Verification across App Screens", () => {
    it("preserves navigation callback from HomeScreen PanditCard caller", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      // Find PanditCards in HomeScreen
      const panditCards = renderer.root.findAllByType(PanditCard);
      expect(panditCards.length).toBeGreaterThanOrEqual(1);

      const firstCard = panditCards[0];
      const viewProfileBtn = firstCard.findByProps({
        testID: `pandit-card-${firstCard.props.pandit.id}-view-profile`,
      });
      const pujasOfferedBtn = firstCard.findByProps({
        testID: `pandit-card-${firstCard.props.pandit.id}-pujas-offered`,
      });

      // Clicking View Profile calls caller's onPress -> navigates to PanditDetail
      act(() => {
        viewProfileBtn.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith("PanditDetail", {
        panditId: firstCard.props.pandit.id,
        panditName: firstCard.props.pandit.display_name,
      });

      // Clicking Pooja Offered calls caller's onPress -> navigates to PanditDetail
      act(() => {
        pujasOfferedBtn.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith("PanditDetail", {
        panditId: firstCard.props.pandit.id,
        panditName: firstCard.props.pandit.display_name,
      });
    });

    it("preserves navigation callback from ExploreScreen PanditCard caller", async () => {
      mockRouteParams = { initialTab: "pandits" };
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<ExploreScreen />);
      });

      const panditCards = renderer.root.findAllByType(PanditCard);
      expect(panditCards.length).toBeGreaterThanOrEqual(1);

      const firstCard = panditCards[0];
      const viewProfileBtn = firstCard.findByProps({
        testID: `pandit-card-${firstCard.props.pandit.id}-view-profile`,
      });

      act(() => {
        viewProfileBtn.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith("PanditDetail", {
        panditId: firstCard.props.pandit.id,
        panditName: firstCard.props.pandit.display_name,
      });
    });

    it("preserves navigation callback from PanditDirectoryScreen caller", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<PanditDirectoryScreen />);
      });

      const panditCards = renderer.root.findAllByType(PanditCard);
      expect(panditCards.length).toBeGreaterThanOrEqual(1);

      const firstCard = panditCards[0];
      const pujasOfferedBtn = firstCard.findByProps({
        testID: `pandit-card-${firstCard.props.pandit.id}-pujas-offered`,
      });

      act(() => {
        pujasOfferedBtn.props.onPress();
      });
      expect(mockNavigate).toHaveBeenCalledWith("PanditDetail", {
        panditId: firstCard.props.pandit.id,
        panditName: firstCard.props.pandit.display_name,
      });
    });
  });

  describe("Probe 5: Data Robustness & Edge Case Defense", () => {
    it("handles pandit with zero reviews (rating_avg=null, rating_count=0) without showing 0.0", () => {
      const edgePandit: PanditSummary = {
        id: "edge-zero",
        user_id: "user-zero",
        display_name: "Acharya Somnath",
        avatar_url: null,
        bio: null,
        years_experience: 1,
        rating_avg: null,
        rating_count: 0,
        languages: [],
        offering_names: [],
        puja_price: 1500,
        public_status: "available",
        distance_km: null,
        kundli_enabled: false,
        kundli_price: null,
      };

      const renderer = renderWithProviders(
        <PanditCard pandit={edgePandit} onPress={jest.fn()} />
      );

      const text = extractAllText(renderer.toJSON());
      expect(text).toContain("★ New Pandit Ji");
      expect(text).not.toContain("0.0");
      expect(text).toContain("Shukla Yajurveda"); // default discipline fallback
    });

    it("handles pandit with missing display_name and null experience gracefully", () => {
      const edgePandit: PanditSummary = {
        id: "edge-nulls",
        user_id: "user-nulls",
        display_name: "",
        avatar_url: null,
        bio: null,
        years_experience: null,
        rating_avg: 5,
        rating_count: 1,
        languages: [],
        offering_names: ["Mahamrityunjaya"],
        puja_price: 1500,
        public_status: "available",
        distance_km: null,
        kundli_enabled: false,
        kundli_price: null,
      };

      const renderer = renderWithProviders(
        <PanditCard pandit={edgePandit} onPress={jest.fn()} />
      );

      const text = extractAllText(renderer.toJSON());
      expect(text).toContain("Vedic Pandit Ji");
      expect(text).toContain("Vedic Tradition");
      expect(text).toContain("★ 5.0 (1)");
    });
  });
});
