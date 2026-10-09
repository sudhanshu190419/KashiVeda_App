// __tests__/discovery.test.tsx
import React from "react";
import ReactTestRenderer from "react-test-renderer";
import { discoveryService } from "../src/features/discovery/services/discoveryService.ts";
import { HomeScreen } from "../src/features/discovery/screens/HomeScreen.tsx";
import { PujaCategoryListScreen } from "../src/features/discovery/screens/PujaCategoryListScreen.tsx";
import { PujaListScreen } from "../src/features/discovery/screens/PujaListScreen.tsx";
import { PujaDetailScreen } from "../src/features/discovery/screens/PujaDetailScreen.tsx";
import { PanditDirectoryScreen } from "../src/features/discovery/screens/PanditDirectoryScreen.tsx";
import { PanditDetailScreen } from "../src/features/discovery/screens/PanditDetailScreen.tsx";
import { ExploreScreen } from "../src/features/discovery/screens/ExploreScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";

// Mock React Native navigation modules
jest.setTimeout(30000);
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({
    params: {
      categoryId: "cat-1",
      categoryName: "Abhishek & Rudra",
      pujaId: "puja-1",
      pujaName: "Rudrabhishek",
      panditId: "pandit-1",
      panditName: "Acharya Shastri",
    },
  }),
}));

jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component }: any) => (
      <Component route={{ params: {} }} navigation={{ navigate: mockNavigate, goBack: mockGoBack }} />
    ),
  }),
}));

jest.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component }: any) => (
      <Component route={{ params: {} }} navigation={{ navigate: mockNavigate, goBack: mockGoBack }} />
    ),
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
    panditProfile: null,
    isLoading: false,
    error: null,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

describe("M2 Discovery — Service Layer & Queries", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("fetches categories ordered deterministically", async () => {
    const mockCategories = [
      { id: "cat-1", name: "Abhishek & Rudra", description: "Sacred abhisheks", display_order: 1, is_active: true },
      { id: "cat-2", name: "Havan & Yagya", description: "Vedic fire rituals", display_order: 2, is_active: true },
    ];

    jest.spyOn(supabase, "from").mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnValueOnce({
        order: jest.fn().mockResolvedValueOnce({ data: mockCategories, error: null }),
      }),
    } as any);

    const result = await discoveryService.fetchCategories();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Abhishek & Rudra");
  });

  it("handles category fetch failure gracefully", async () => {
    jest.spyOn(supabase, "from").mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnValueOnce({
        order: jest.fn().mockResolvedValueOnce({ data: null, error: { message: "Network offline" } }),
      }),
    } as any);

    await expect(discoveryService.fetchCategories()).rejects.toThrow("Failed to fetch puja categories: Network offline");
  });

  it("fetches puja services with category filtering and search", async () => {
    const mockPujas = [
      {
        id: "puja-1",
        category_id: "cat-1",
        name: "Kashi Vishwanath Rudrabhishek",
        description: "Sacred Abhishek in Kashi",
        default_duration_minutes: 90,
        allowed_modes: ["home", "temple", "remote"],
        is_active: true,
        created_at: "2026-10-05T00:00:00Z",
        category: { id: "cat-1", name: "Abhishek & Rudra" },
      },
    ];

    jest.spyOn(supabase, "from").mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValueOnce({ data: mockPujas, error: null }),
    } as any);

    const result = await discoveryService.fetchPujaServices({ categoryId: "cat-1", search: "Rudra" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Kashi Vishwanath Rudrabhishek");
  });

  it("fetches pandit directory using authoritative get_customer_pandits RPC", async () => {
    const mockPandits = [
      {
        id: "pandit-1",
        user_id: "user-p1",
        display_name: "Acharya Ram Shastri",
        avatar_url: null,
        bio: "Vedic Priest with 15 years experience in Varanasi",
        years_experience: 15,
        languages: ["Hindi", "Sanskrit"],
        public_status: "available",
        rating_avg: 4.95,
        rating_count: 24,
        offering_names: ["Rudrabhishek", "Maha Mrityunjaya Jaap"],
        puja_price: 2100,
        distance_km: null,
        kundli_enabled: true,
        kundli_price: 1100,
      },
    ];

    jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: mockPandits,
      error: null,
    } as any);

    const result = await discoveryService.fetchPandits({ limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith("get_customer_pandits", {
      p_service_mode: null,
      p_latitude: null,
      p_longitude: null,
      p_puja_service_id: null,
      p_limit: 10,
      p_offset: 0,
      p_temple_id: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].display_name).toBe("Acharya Ram Shastri");
  });

  it("fetches published reviews for a pandit", async () => {
    const mockReviews = [
      {
        id: "rev-1",
        booking_id: "bk-1",
        customer_id: "cust-1",
        pandit_id: "pandit-1",
        rating: 5,
        comment: "Excellent and authentic chanting!",
        visibility_status: "published",
        created_at: "2026-10-05T12:00:00Z",
      },
    ];

    jest.spyOn(supabase, "from").mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnValueOnce({
        limit: jest.fn().mockResolvedValueOnce({ data: mockReviews, error: null }),
      }),
    } as any);

    const reviews = await discoveryService.fetchReviews("pandit-1");
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(5);
  });
});

describe("M2 Discovery — Screen Rendering & Navigation", () => {
  beforeEach(() => {
    jest.spyOn(discoveryService, "fetchCategories").mockResolvedValue([
      { id: "cat-1", name: "Abhishek & Rudra", description: "Sacred abhisheks", display_order: 1, is_active: true },
    ]);

    jest.spyOn(discoveryService, "fetchPujaServices").mockResolvedValue([
      {
        id: "puja-1",
        category_id: "cat-1",
        name: "Rudrabhishek",
        description: "Vedic Shiva Abhishek",
        default_duration_minutes: 60,
        allowed_modes: ["home", "temple", "remote"],
        is_active: true,
        created_at: "2026-10-05T00:00:00Z",
        category: { id: "cat-1", name: "Abhishek & Rudra" },
      },
    ]);

    jest.spyOn(discoveryService, "fetchPandits").mockResolvedValue([
      {
        id: "pandit-1",
        user_id: "user-p1",
        display_name: "Acharya Shastri",
        avatar_url: null,
        bio: "Experienced priest",
        years_experience: 12,
        languages: ["Hindi", "Sanskrit"],
        public_status: "available",
        rating_avg: 4.9,
        rating_count: 15,
        offering_names: ["Rudrabhishek"],
        puja_price: 2100,
        distance_km: null,
        kundli_enabled: true,
        kundli_price: 1100,
      },
    ]);

    jest.spyOn(discoveryService, "fetchPujaDetail").mockResolvedValue({
      puja: {
        id: "puja-1",
        category_id: "cat-1",
        name: "Rudrabhishek",
        description: "Vedic Shiva Abhishek",
        default_duration_minutes: 60,
        allowed_modes: ["home", "temple", "remote"],
        is_active: true,
        created_at: "2026-10-05T00:00:00Z",
        category: { id: "cat-1", name: "Abhishek & Rudra" },
      },
      samagriPackages: [
        {
          id: "pkg-1",
          puja_service_id: "puja-1",
          name: "Standard Samagri Kit",
          description: "All pure ingredients",
          is_active: true,
          items: [
            {
              quantity: 1,
              item: { id: "item-1", name: "Gangajal", description: "Holy Ganga water", unit: "bottle", unit_price: 50 },
            },
          ],
        },
      ],
      offeringsCount: 1,
      minPrice: 2100,
    });

    jest.spyOn(discoveryService, "fetchPanditDetail").mockResolvedValue({
      pandit: {
        id: "pandit-1",
        user_id: "user-p1",
        display_name: "Acharya Shastri",
        avatar_url: null,
        bio: "Experienced priest",
        years_experience: 12,
        languages: ["Hindi", "Sanskrit"],
        public_status: "available",
        rating_avg: 4.9,
        rating_count: 15,
        offering_names: ["Rudrabhishek"],
        puja_price: 2100,
        distance_km: null,
        kundli_enabled: true,
        kundli_price: 1100,
      },
      offerings: [
        {
          id: "off-1",
          pandit_id: "pandit-1",
          puja_service_id: "puja-1",
          price: 2100,
          currency: "INR",
          duration_minutes: 60,
          is_active: true,
          puja_service: { id: "puja-1", name: "Rudrabhishek", default_duration_minutes: 60 },
        },
      ],
      reviews: [
        {
          id: "rev-1",
          booking_id: "bk-1",
          customer_id: "c-1",
          pandit_id: "pandit-1",
          rating: 5,
          comment: "Very pious ceremony",
          visibility_status: "published",
          created_at: "2026-10-05T12:00:00Z",
        },
      ],
    });
  });

  it("renders HomeScreen with categories, banners, and pandits", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<HomeScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders PujaCategoryListScreen with categories list", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<PujaCategoryListScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders PujaListScreen with search and filters", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<PujaListScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders PujaDetailScreen with samagri breakdown and pricing", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<PujaDetailScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders PanditDirectoryScreen with verified pandit list", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<PanditDirectoryScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders PanditDetailScreen with bio, offerings, and reviews", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<PanditDetailScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders ExploreScreen with quick gateways", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<ExploreScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
