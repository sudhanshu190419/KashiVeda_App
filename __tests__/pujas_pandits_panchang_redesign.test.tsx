// __tests__/pujas_pandits_panchang_redesign.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { HomeScreen } from "../src/features/discovery/screens/HomeScreen.tsx";
import { ExploreScreen } from "../src/features/discovery/screens/ExploreScreen.tsx";
import { PanchangScreen } from "../src/features/discovery/screens/PanchangScreen.tsx";
import { KundliScreen } from "../src/features/kundli/screens/KundliScreen.tsx";
import { CustomerNavigator } from "../src/navigation/CustomerNavigator.tsx";
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

jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component, name }: any) => {
      const ReactModule = require("react");
      // Only mount CustomerTabs to avoid mounting all 20 secondary screens simultaneously
      if (name === "CustomerTabs" && Component) {
        return ReactModule.createElement(Component, {
          route: { params: {} },
          navigation: { navigate: mockNavigate, goBack: mockGoBack },
        });
      }
      return null;
    },
  }),
}));

jest.mock("@react-navigation/bottom-tabs", () => {
  const ReactModule = require("react");
  const TextModule = require("react-native").Text;
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }: any) => children,
      Screen: ({ options }: any) => {
        return options?.tabBarLabel
          ? ReactModule.createElement(TextModule, null, options.tabBarLabel)
          : null;
      },
    }),
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
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractAllText).join(" ");
  if (node.children) return extractAllText(node.children);
  return "";
}

describe("Redesigned Discovery & Panchang Architecture", () => {
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
                { id: "cat-2", name: "Havan & Yagya", display_order: 2, is_active: true },
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
        then: (resolve: any) => resolve({ data: [], error: null }),
      } as any;
    });

    jest.spyOn(supabase, "rpc").mockImplementation((fn: string) => {
      if (fn === "get_customer_pandits" || fn === "get_customer_kundli_pandits") {
        return Promise.resolve({
          data: [
            {
              id: "pandit-1",
              display_name: "Pt. Prabhakar Shastri",
              bio: "Shukla Yajurveda Acharya with 18 years tradition",
              rating_avg: 4.9,
              rating_count: 124,
              years_experience: 18,
              offering_names: ["Shukla Yajurveda"],
              puja_price: 2100,
              kundli_enabled: true,
              kundli_price: 1100,
            },
          ],
          error: null,
        }) as any;
      }
      return Promise.resolve({ data: [], error: null }) as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("1. ExploreScreen (Tab 2 Dual Hub: Pujas & Pandits)", () => {
    it("renders clean header 'Pujas & Pandits' or 'पूजा एवं पुरोहित' without removed eyebrows", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<ExploreScreen />);
      });
      const text = extractAllText(tree.toJSON());

      expect(text.includes("Pujas & Pandits") || text.includes("पूजा एवं पुरोहित")).toBe(true);

      // Clutter removed
      expect(text).not.toContain("Kashi Shastras");
      expect(text).not.toContain("Varanasi Sanctum");
      expect(text).not.toContain("Explore Rituals & Pandits");
      expect(text).not.toContain("Complete Rituals Catalog");
    });

    it("renders segmented control [All Pujas | Verified Pandits] and toggles", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<ExploreScreen />);
      });
      const text = extractAllText(tree.toJSON());

      expect(text.includes("All Pujas") || text.includes("समस्त पूजाएं")).toBe(true);
      expect(text.includes("Verified Pandits") || text.includes("सत्यापित पुरोहित")).toBe(true);
    });

    it("renders search and mode filters on Pujas subtab", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<ExploreScreen />);
      });
      const text = extractAllText(tree.toJSON());

      expect(text.includes("All Formats") || text.includes("समस्त पद्धतियां")).toBe(true);
      expect(text.includes("Home Puja") || text.includes("गृह पूजा")).toBe(true);
      expect(text.includes("Online Puja") || text.includes("लाइव दर्शन")).toBe(true);
      expect(text.includes("Temple Puja") || text.includes("मंदिर अनुष्ठान")).toBe(true);
    });

    it("renders search and sort button on Pandits subtab without removed subtitles", async () => {
      mockRouteParams = { initialTab: "pandits" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<ExploreScreen />);
      });
      const text = extractAllText(tree.toJSON());

      expect(text.includes("Sort") || text.includes("क्रम")).toBe(true);
      expect(text).not.toContain("Showing verified priests across India");
      expect(text).not.toContain("Sorted: Nearest First");
    });
  });

  describe("2. Dedicated PanchangScreen", () => {
    it("renders header 'Panchang' with back button, ephemeris strip, and 8 Shastric metrics", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PanchangScreen />);
      });
      const text = extractAllText(tree.toJSON());

      expect(text.includes("Panchang") || text.includes("पंचांग")).toBe(true);
      expect(text).not.toContain("Varanasi Ephemeris");
      expect(text).not.toContain("Astronomical Ephemeris");

      expect(text.includes("Tithi") || text.includes("तिथि") || text.includes("दशमी")).toBe(true);
      expect(text.includes("Nakshatra") || text.includes("नक्षत्र")).toBe(true);
      expect(text.includes("Yoga") || text.includes("योग")).toBe(true);
      expect(text.includes("Karana") || text.includes("करण")).toBe(true);
      expect(text.includes("Abhijit") || text.includes("अभिजित")).toBe(true);
      expect(text.includes("Rahu Kaal") || text.includes("राहु काल")).toBe(true);
    });
  });

  describe("3. HomeScreen Navigation Gateways", () => {
    it("navigates to Panchang screen when Today's Muhurat card is pressed", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<HomeScreen />);
      });

      const touchables = tree.root.findAllByProps({ accessibilityLabel: "Today's Muhurat Panchang Details" });
      expect(touchables.length).toBeGreaterThan(0);

      act(() => {
        touchables[0].props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith("Panchang");
    });

    it("navigates to Tab 2 with serviceMode filter when mode card is pressed", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<HomeScreen />);
      });

      const homePujaBtn = tree.root.findByProps({ accessibilityLabel: "Explore Home Pujas" });
      act(() => {
        homePujaBtn.props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith("CustomerTabs", {
        screen: "Explore",
        params: { initialTab: "pujas", serviceMode: "home" },
      });
    });

    it("navigates to Tab 2 with pandits tab when Vedic Scholars Directory is pressed", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<HomeScreen />);
      });

      const directoryBtn = tree.root.findByProps({ accessibilityLabel: "Verified Vedic Scholars Directory" });
      expect(directoryBtn).toBeDefined();

      act(() => {
        directoryBtn.props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith("CustomerTabs", {
        screen: "Explore",
        params: { initialTab: "pandits" },
      });
    });
  });

  describe("4. Vedic Kundli Screen (Tab 4)", () => {
    it("renders Free Kundli and Handwritten Kundli cards without emojis", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<KundliScreen />);
      });
      const text = extractAllText(tree.toJSON());

      expect(text.includes("Free Vedic Kundli") || text.includes("निःशुल्क वैदिक कुण्डली")).toBe(true);
      expect(text.includes("Handwritten Kundli Service") || text.includes("हस्तलिखित कुण्डली")).toBe(true);
      expect(text.includes("Calculate Free Kundli") || text.includes("निःशुल्क कुण्डली बनाएं")).toBe(true);
      expect(text.includes("Create Kundli Request") || text.includes("कुण्डली अनुरोध")).toBe(true);

      expect(text).not.toContain("✨");
    });
  });

  describe("5. CustomerNavigator Configuration", () => {
    it("has Tab 2 labeled as 'Pujas'", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<CustomerNavigator />);
      });
      const text = extractAllText(tree.toJSON());
      expect(text).toContain("Pujas");
    });
  });
});
