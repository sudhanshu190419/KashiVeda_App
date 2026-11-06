// __tests__/challenger_m1_stress.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { StyleSheet } from "react-native";
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

const basePandit: PanditSummary = {
  id: "pandit-test",
  user_id: "user-test",
  display_name: "Pt. Test Shastri",
  avatar_url: null,
  bio: "Vedic Scholar",
  years_experience: 10,
  rating_avg: null,
  rating_count: 0,
  languages: ["Sanskrit", "Hindi"],
  offering_names: ["Rudrabhishek"],
  puja_price: 2100,
  public_status: "available",
  distance_km: null,
  kundli_enabled: false,
  kundli_price: null,
};

describe("Adversarial Stress Test Suite: Milestone 1", () => {
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
              data: [{ id: "cat-1", name: "Abhishek & Rudra", display_order: 1, is_active: true }],
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
                  description: "Complete Rudrabhishek",
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

  describe("Probe 1: Rating Boundary and Edge Case Conditions", () => {
    test("when rating_avg is null and rating_count is 0 -> renders '★ New Pandit Ji', never '★ 0.0'", () => {
      const pandit = { ...basePandit, rating_avg: null, rating_count: 0 };
      const renderer = renderWithProviders(<PanditCard pandit={pandit} onPress={jest.fn()} />);
      const text = extractAllText(renderer.toJSON());
      expect(text).toContain("★ New Pandit Ji");
      expect(text).not.toContain("★ 0.0");
      expect(text).not.toContain("0.0");
    });

    test("when rating_avg is undefined and rating_count is undefined -> renders '★ New Pandit Ji', never '★ 0.0'", () => {
      const pandit = { ...basePandit, rating_avg: undefined as any, rating_count: undefined as any };
      const renderer = renderWithProviders(<PanditCard pandit={pandit} onPress={jest.fn()} />);
      const text = extractAllText(renderer.toJSON());
      expect(text).toContain("★ New Pandit Ji");
      expect(text).not.toContain("★ 0.0");
    });

    test("when rating_avg is 0 and rating_count is 0 -> renders '★ New Pandit Ji', never '★ 0.0'", () => {
      const pandit = { ...basePandit, rating_avg: 0, rating_count: 0 };
      const renderer = renderWithProviders(<PanditCard pandit={pandit} onPress={jest.fn()} />);
      const text = extractAllText(renderer.toJSON());
      expect(text).toContain("★ New Pandit Ji");
      expect(text).not.toContain("★ 0.0");
    });

    test("when rating_avg is 0 and rating_count is undefined -> renders '★ New Pandit Ji', never '★ 0.0'", () => {
      const pandit = { ...basePandit, rating_avg: 0, rating_count: undefined as any };
      const renderer = renderWithProviders(<PanditCard pandit={pandit} onPress={jest.fn()} />);
      const text = extractAllText(renderer.toJSON());
      expect(text).toContain("★ New Pandit Ji");
      expect(text).not.toContain("★ 0.0");
    });

    test("stress test: high review volume (rating_count: 500, rating_avg: 4.95) formats correctly without truncation", () => {
      const pandit = { ...basePandit, rating_avg: 4.95, rating_count: 500 };
      const renderer = renderWithProviders(<PanditCard pandit={pandit} onPress={jest.fn()} />);
      const text = extractAllText(renderer.toJSON());
      // 4.95 toFixed(1) is "5.0"
      expect(text).toContain("★ 5.0 (500)");
      expect(text).not.toContain("★ New Pandit Ji");
    });

    test("stress test: boundary rating 5.0 with 1 review formats as '★ 5.0 (1)'", () => {
      const pandit = { ...basePandit, rating_avg: 5.0, rating_count: 1 };
      const renderer = renderWithProviders(<PanditCard pandit={pandit} onPress={jest.fn()} />);
      const text = extractAllText(renderer.toJSON());
      expect(text).toContain("★ 5.0 (1)");
    });
  });

  describe("Probe 2: Button Handlers Isolation and Default Delegation", () => {
    test("when only onPress is provided, View Profile, Pooja Offered, and upper card call onPress independently", () => {
      const onPressMock = jest.fn();
      const renderer = renderWithProviders(<PanditCard pandit={basePandit} onPress={onPressMock} />);

      const viewProfileBtn = renderer.root.find(
        (node: any) => node.props?.testID === `pandit-card-${basePandit.id}-view-profile`
      );
      const pujasOfferedBtn = renderer.root.find(
        (node: any) => node.props?.testID === `pandit-card-${basePandit.id}-pujas-offered`
      );

      // Tap View Profile
      act(() => {
        viewProfileBtn.props.onPress();
      });
      expect(onPressMock).toHaveBeenCalledTimes(1);

      // Tap Pooja Offered
      act(() => {
        pujasOfferedBtn.props.onPress();
      });
      expect(onPressMock).toHaveBeenCalledTimes(2);

      // Tap upper card container
      const upperTouchable = renderer.root.findByProps({
        accessibilityLabel: `Pandit Ji ${basePandit.display_name}`,
      });
      act(() => {
        upperTouchable.props.onPress();
      });
      expect(onPressMock).toHaveBeenCalledTimes(3);
    });

    test("when custom onViewProfile and onPujasOffered are passed, each button triggers ONLY its own handler", () => {
      const onPressMock = jest.fn();
      const onViewProfileMock = jest.fn();
      const onPujasOfferedMock = jest.fn();

      const renderer = renderWithProviders(
        <PanditCard
          pandit={basePandit}
          onPress={onPressMock}
          onViewProfile={onViewProfileMock}
          onPujasOffered={onPujasOfferedMock}
        />
      );

      const viewProfileBtn = renderer.root.find(
        (node: any) => node.props?.testID === `pandit-card-${basePandit.id}-view-profile`
      );
      const pujasOfferedBtn = renderer.root.find(
        (node: any) => node.props?.testID === `pandit-card-${basePandit.id}-pujas-offered`
      );

      // Tap View Profile
      act(() => {
        viewProfileBtn.props.onPress();
      });
      expect(onViewProfileMock).toHaveBeenCalledTimes(1);
      expect(onPujasOfferedMock).not.toHaveBeenCalled();
      expect(onPressMock).not.toHaveBeenCalled();

      // Tap Pooja Offered
      act(() => {
        pujasOfferedBtn.props.onPress();
      });
      expect(onPujasOfferedMock).toHaveBeenCalledTimes(1);
      expect(onViewProfileMock).toHaveBeenCalledTimes(1); // unchanged
      expect(onPressMock).not.toHaveBeenCalled(); // untouched
    });
  });

  describe("Probe 3: Touch Target Dimensions and Layout Conformance", () => {
    test("actionButton style definition explicitly enforces minHeight >= 48", () => {
      const renderer = renderWithProviders(<PanditCard pandit={basePandit} onPress={jest.fn()} />);

      const viewProfileBtn = renderer.root.find(
        (node: any) => node.props?.testID === `pandit-card-${basePandit.id}-view-profile`
      );
      const pujasOfferedBtn = renderer.root.find(
        (node: any) => node.props?.testID === `pandit-card-${basePandit.id}-pujas-offered`
      );

      const flattenStyle = (node: any) =>
        Array.isArray(node.props?.style)
          ? Object.assign({}, ...node.props.style)
          : node.props?.style;

      const vpStyle = flattenStyle(viewProfileBtn);
      const poStyle = flattenStyle(pujasOfferedBtn);

      expect(vpStyle.minHeight).toBeGreaterThanOrEqual(48);
      expect(poStyle.minHeight).toBeGreaterThanOrEqual(48);
    });

    test("HomeScreen serviceModeCard enforces minHeight >= 88 for balanced card height", async () => {
      let renderer: any;
      await act(async () => {
        renderer = renderWithProviders(<HomeScreen />);
      });

      const cards = renderer.root.findAll((node: any) => {
        const style = Array.isArray(node.props?.style)
          ? Object.assign({}, ...node.props.style)
          : node.props?.style;
        return style?.minHeight >= 88 && style?.borderWidth === 1;
      });

      // There are 3 sacred mode cards
      expect(cards.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Probe 4: Strict Disallowed Strings Absence Verification", () => {
    test("neither English nor Hindi affiliation text ('Kashi Vidvat Parishad' / 'काशी विद्वत परिषद्') is present in PanditCard", () => {
      const rendererEn = renderWithProviders(<PanditCard pandit={basePandit} onPress={jest.fn()} />, "en");
      const textEn = extractAllText(rendererEn.toJSON());
      expect(textEn).not.toContain("Kashi Vidvat Parishad");
      expect(textEn).not.toContain("काशी विद्वत परिषद्");

      const rendererHi = renderWithProviders(<PanditCard pandit={basePandit} onPress={jest.fn()} />, "hi");
      const textHi = extractAllText(rendererHi.toJSON());
      expect(textHi).not.toContain("Kashi Vidvat Parishad");
      expect(textHi).not.toContain("काशी विद्वत परिषद्");
    });

    test("subtitles ('At Home', 'Live Darshan', 'In Sanctum' and Hindi equivalents) are absent from HomeScreen", async () => {
      let rendererEn: any;
      await act(async () => {
        rendererEn = renderWithProviders(<HomeScreen />, "en");
      });
      const textEn = extractAllText(rendererEn.toJSON());
      expect(textEn).not.toContain("At Home");
      expect(textEn).not.toContain("Live Darshan");
      expect(textEn).not.toContain("In Sanctum");

      let rendererHi: any;
      await act(async () => {
        rendererHi = renderWithProviders(<HomeScreen />, "hi");
      });
      const textHi = extractAllText(rendererHi.toJSON());
      expect(textHi).not.toContain("यजमान गृह");
      expect(textHi).not.toContain("लाइव वीडियो");
      expect(textHi).not.toContain("मंदिर गर्भगृह");
    });

    test("obsolete CTA strings ('Request Sankalp' / 'संकल्प अनुरोध') are absent from PanditCard", () => {
      const rendererEn = renderWithProviders(<PanditCard pandit={basePandit} onPress={jest.fn()} />, "en");
      const textEn = extractAllText(rendererEn.toJSON());
      expect(textEn).not.toContain("Request Sankalp");

      const rendererHi = renderWithProviders(<PanditCard pandit={basePandit} onPress={jest.fn()} />, "hi");
      const textHi = extractAllText(rendererHi.toJSON());
      expect(textHi).not.toContain("संकल्प अनुरोध");
    });
  });

  describe("Probe 5: Hindi Localization Conformance", () => {
    test("renders localized Hindi CTA labels in Hindi mode", () => {
      const rendererHi = renderWithProviders(<PanditCard pandit={basePandit} onPress={jest.fn()} />, "hi");
      const textHi = extractAllText(rendererHi.toJSON());
      expect(textHi).toContain("प्रोफ़ाइल देखें");
      expect(textHi).toContain("पूजा सेवाएं");
    });
  });
});
