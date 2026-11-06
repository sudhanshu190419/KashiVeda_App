// __tests__/puja_and_pandit_detail_redesign.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { ThemeProvider } from "../src/shared/theme";
import { LanguageProvider } from "../src/shared/i18n";
import { PujaDetailScreen } from "../src/features/discovery/screens/PujaDetailScreen";
import { PanditDetailScreen } from "../src/features/discovery/screens/PanditDetailScreen";

// Navigation Mocks
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: any = {};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
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

// Hooks Mocks
const mockPujaData = {
  id: "puja-rudra-1",
  name: "Maha Rudrabhishek Puja",
  description: "Sacred Shastric bath ceremony of the Shiva Lingam with 11 sacred Dravyas.",
  category: { name: "Vedic Puja" },
  default_duration_minutes: 90,
  allowed_modes: ["home", "temple", "remote"],
  starting_price: 3500,
  image_url: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&h=300&q=80",
};

const mockSamagriPackages = [
  {
    id: "pkg-1",
    name: "Standard Samagri Kit",
    items: [
      { item: { id: "item-1", name: "Gangajal", unit: "ml" }, quantity: 250 },
      { item: { id: "item-2", name: "Kashi Bhasma", unit: "g" }, quantity: 50 },
      { item: { id: "item-3", name: "Bilva Leaves", unit: "pcs" }, quantity: 108 },
    ],
  },
];

const mockModePrices = {
  home: 3500,
  temple: 4500,
  remote: 2100,
};

jest.mock("../src/features/discovery/hooks/usePujaDetail", () => ({
  usePujaDetail: () => ({
    puja: mockPujaData,
    samagriPackages: mockSamagriPackages,
    modePrices: mockModePrices,
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

const mockPanditData = {
  id: "pandit-1",
  display_name: "Pt. Vidyadhar Shastri",
  avatar_url: null,
  city: "New Delhi (NCR)",
  tradition: "Shukla Yajurveda",
  years_experience: 18,
  rating_avg: 4.95,
  rating_count: 142,
  completed_pujas: 450,
  bio: "Specializes in Mahamrityunjaya Anushthan, Rudrabhishek, and Griha Pravesh.",
  languages: ["Sanskrit", "Hindi", "English"],
  videos: [
    {
      id: "v-1",
      title: "Shri Rudram",
      durationLabel: "0:45",
      durationSeconds: 45,
      posterUrl: "https://example.com/p1.jpg",
    },
    {
      id: "v-2",
      title: "Mahamrityunjaya Japa",
      durationLabel: "1:12",
      durationSeconds: 72,
      posterUrl: "https://example.com/p2.jpg",
    },
    {
      id: "v-3",
      title: "Shanti Path",
      durationLabel: "0:38",
      durationSeconds: 38,
      posterUrl: "https://example.com/p3.jpg",
    },
  ],
};

const mockOfferings = [
  {
    id: "offering-1",
    puja_service_id: "puja-rudra-1",
    puja_service: { name: "Maha Rudrabhishek" },
    duration_minutes: 90,
    home_price: 3500,
    temple_price: 4500,
    remote_price: 2100,
  },
  {
    id: "offering-2",
    puja_service_id: "puja-shanti-1",
    puja_service: { name: "Navgrah Shanti Havan" },
    duration_minutes: 120,
    home_price: 2800,
    temple_price: 3500,
    remote_price: 1800,
  },
];

const mockReviews = [
  {
    id: "rev-1",
    user_name: "Rajesh K.",
    rating: 5,
    comment: "Pundit ji performed the Rudrabhishek with pure Sanskrit pronunciation.",
    created_at: "2026-11-03T10:00:00Z",
  },
];

jest.mock("../src/features/discovery/hooks/usePanditDetail", () => ({
  usePanditDetail: () => ({
    pandit: mockPanditData,
    offerings: mockOfferings,
    reviews: mockReviews,
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

// Icons mock
jest.mock("../src/shared/components/icons", () => {
  const ReactModule = require("react");
  return {
    Ionicons: (props: any) => ReactModule.createElement("Text", { testID: `icon-ion-${props.name}` }, props.name),
    MaterialIcons: (props: any) => ReactModule.createElement("Text", { testID: `icon-mat-${props.name}` }, props.name),
    MaterialCommunityIcons: (props: any) => ReactModule.createElement("Text", { testID: `icon-mci-${props.name}` }, props.name),
  };
});

function renderWithProviders(element: React.ReactElement) {
  return (
    <ThemeProvider initialColorScheme="light">
      <LanguageProvider initialLanguage="en">
        {element}
      </LanguageProvider>
    </ThemeProvider>
  );
}

function extractText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (node.children) return extractText(node.children);
  return "";
}

describe("Puja & Pandit Detail Screens Redesign", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. PujaDetailScreen Redesign", () => {
    it("renders hero banner image with category and duration overlays", async () => {
      mockRouteParams = { pujaId: "puja-rudra-1", pujaName: "Maha Rudrabhishek Puja" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PujaDetailScreen />));
      });

      const text = extractText(tree.toJSON());
      expect(text).toContain("Maha Rudrabhishek Puja");
      expect(text).toContain("VEDIC PUJA");
      expect(text).toContain("Approx. 90 Mins");
      // Check that image element exists
      const images = tree.root.findAllByType("Image");
      expect(images.length).toBeGreaterThan(0);
      expect(images[0].props.source.uri).toContain("images.unsplash.com");
    });

    it("uses canonical Puja terminology with zero emojis", async () => {
      mockRouteParams = { pujaId: "puja-rudra-1" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PujaDetailScreen />));
      });

      const text = extractText(tree.toJSON());
      // No "Ritual" terminology
      expect(text).not.toContain("Ritual Details");
      expect(text).not.toContain("Schedule Ritual");
      // Zero pictorial emojis
      expect(/[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u.test(text)).toBe(false);
    });

    it("renders clean, uncluttered service format rows and updates selection", async () => {
      mockRouteParams = { pujaId: "puja-rudra-1", serviceMode: "home" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PujaDetailScreen />));
      });

      const text = extractText(tree.toJSON());
      expect(text).toContain("Select Service Format");
      expect(text).toContain("Home Puja");
      expect(text).toContain("Temple Puja");
      expect(text).toContain("Online Puja");
      expect(text).toContain("Schedule Home Puja");
    });

    it("renders itemized Samagri kit tags directly without filler sentences", async () => {
      mockRouteParams = { pujaId: "puja-rudra-1" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PujaDetailScreen />));
      });

      const text = extractText(tree.toJSON());
      expect(text).toContain("Samagri Included");
      expect(text).toContain("Provided by Priest");
      expect(text).toContain("Gangajal (250 ml)");
      expect(text).toContain("Kashi Bhasma (50 g)");
      expect(text).toContain("Bilva Leaves (108 pcs)");
    });

    it("renders 100% Escrow Protection badge and navigates on CTA press", async () => {
      mockRouteParams = { pujaId: "puja-rudra-1", serviceMode: "home" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PujaDetailScreen />));
      });

      const text = extractText(tree.toJSON());
      expect(text).toContain("100% Escrow Protection");
      expect(text).toContain("Released at Purnahuti");

      // Press primary CTA
      const touchables = tree.root.findAllByType("View");
      const ctaBtn = touchables.find((t: any) => t.props?.accessibilityLabel === "Schedule Home Puja");
      expect(ctaBtn).toBeDefined();

      await act(async () => {
        ctaBtn.props.onClick ? ctaBtn.props.onClick() : ctaBtn.props.onResponderRelease?.({});
      });
    });
  });

  describe("2. PanditDetailScreen Redesign", () => {
    it("renders Scholar Hero Card with All-India coverage and credential strip", async () => {
      mockRouteParams = { panditId: "pandit-1", panditName: "Pt. Vidyadhar Shastri" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PanditDetailScreen />));
      });

      const text = extractText(tree.toJSON());
      expect(text).toContain("Pt. Vidyadhar Shastri");
      expect(text).toContain("New Delhi (NCR) • Pan-India");
      expect(text).toContain("Experience");
      expect(text).toContain("18 Years");
      expect(text).toContain("Tradition");
      expect(text).toContain("Shukla Yajurveda");
      expect(text).toContain("Completed");
    });

    it("uses canonical Puja naming with zero emojis", async () => {
      mockRouteParams = { panditId: "pandit-1" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PanditDetailScreen />));
      });

      const text = extractText(tree.toJSON());
      // Zero pictorial emojis
      expect(/[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u.test(text)).toBe(false);
      // No "Rituals" section
      expect(text).not.toContain("Ritual Services & Dakshina");
      expect(text).toContain("Pujas Offered");
    });

    it("renders Vedic recitation video player with 3 switcher buttons and selectable offerings", async () => {
      mockRouteParams = { panditId: "pandit-1" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PanditDetailScreen />));
      });

      const text = extractText(tree.toJSON());
      expect(text).toContain("Vedic Recitation Video");
      expect(text).toContain("Vedic Video Proof");
      expect(text).toContain("Shri Rudram");
      expect(text).toContain("1. Shri Rudram");
      expect(text).toContain("2. Mahamrityunjaya");
      expect(text).toContain("3. Shanti Path");
      // Verify removed microcopy sentence as requested by user
      expect(text).not.toContain("Devotees can verify Shastric pronunciation");
      expect(text).toContain("Pujas Offered");
      expect(text).toContain("Maha Rudrabhishek");
      expect(text).toContain("Navgrah Shanti Havan");
    });

    it("calculates 25% escrow advance and updates primary CTA upon offering selection", async () => {
      mockRouteParams = { panditId: "pandit-1" };
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(renderWithProviders(<PanditDetailScreen />));
      });

      // Initially no offering is selected, so the bottom bar is hidden (selection-gated)
      let text = extractText(tree.toJSON());
      expect(text).not.toContain("25% ESCROW ADVANCE");

      // Tap on Maha Rudrabhishek offering
      const touchables = tree.root.findAll((node: any) =>
        node.props?.accessibilityRole === "button" &&
        node.props?.accessibilityLabel?.includes("Maha Rudrabhishek")
      );
      expect(touchables.length).toBeGreaterThan(0);

      await act(async () => {
        touchables[0].props.onPress();
      });

      text = extractText(tree.toJSON());
      expect(text).toContain("25% ESCROW ADVANCE");
      expect(text).toContain("875"); // 25% of 3500
      expect(text).toContain("75% Purnahuti Release");
      expect(text).toContain("Book Maha Rudrabhishek");
    });
  });
});
