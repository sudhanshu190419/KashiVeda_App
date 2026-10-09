// __tests__/mobile_foundation.test.tsx
import React from "react";
import ReactTestRenderer from "react-test-renderer";
import { colors } from "../src/shared/theme/colors.ts";
import { formatCurrency, formatDate, formatTime } from "../src/shared/utils/formatters.ts";
import { Button } from "../src/shared/components/ui/Button.tsx";
import { Text } from "../src/shared/components/ui/Text.tsx";
import { Input } from "../src/shared/components/ui/Input.tsx";
import { Card } from "../src/shared/components/ui/Card.tsx";
import { Header } from "../src/shared/components/ui/Header.tsx";
import { EmptyState } from "../src/shared/components/ui/EmptyState.tsx";
import { ErrorState } from "../src/shared/components/ui/ErrorState.tsx";
import { LoadingState } from "../src/shared/components/ui/LoadingState.tsx";
import { AdminNoticeScreen } from "../src/shared/screens/AdminNoticeScreen.tsx";
import { HomeScreen } from "../src/features/discovery/screens/HomeScreen.tsx";
import { PanditDashboardScreen } from "../src/features/pandit/screens/PanditDashboardScreen.tsx";
import { secureAuthStorage } from "../src/infrastructure/supabase/client.ts";
import EncryptedStorage from "react-native-encrypted-storage";

// Mock React Native navigation modules for clean unit testing
jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component }: any) => <Component route={{ params: {} }} navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />,
  }),
}));

jest.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component }: any) => <Component route={{ params: {} }} navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ type: "success", data: { idToken: "token" } })),
    getTokens: jest.fn(() => Promise.resolve({ idToken: "token" })),
    signOut: jest.fn(() => Promise.resolve(null)),
  },
  isSuccessResponse: jest.fn(() => true),
  isCancelledResponse: jest.fn(() => false),
  isErrorWithCode: jest.fn(() => false),
  statusCodes: {},
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
    panditProfile: {
      id: "pandit-1",
      verification_status: "verified",
      public_status: "available",
    },
    isLoading: false,
    error: null,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

jest.mock("../src/features/discovery/services/discoveryService.ts", () => ({
  discoveryService: {
    getCategories: jest.fn().mockResolvedValue([]),
    getFeaturedPujas: jest.fn().mockResolvedValue([]),
    getAvailablePandits: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../src/features/pandit/services/panditService.ts", () => ({
  panditService: {
    getDashboardSummary: jest.fn().mockResolvedValue({
      todayRitualCount: 0,
      monthlyEarnings: 0,
      rating: 5,
      totalReviews: 0,
    }),
    getSchedule: jest.fn().mockResolvedValue([]),
    getNextRitual: jest.fn().mockResolvedValue(null),
  },
}));

describe("M1 Foundation — Secure Auth Storage", () => {
  it("uses EncryptedStorage adapter for get, set, and remove", async () => {
    (EncryptedStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify({ access_token: "jwt" }));
    const value = await secureAuthStorage.getItem("supabase.auth.token");
    expect(EncryptedStorage.getItem).toHaveBeenCalledWith("supabase.auth.token");
    expect(value).toBe(JSON.stringify({ access_token: "jwt" }));

    await secureAuthStorage.setItem("supabase.auth.token", "new-token");
    expect(EncryptedStorage.setItem).toHaveBeenCalledWith("supabase.auth.token", "new-token");

    await secureAuthStorage.removeItem("supabase.auth.token");
    expect(EncryptedStorage.removeItem).toHaveBeenCalledWith("supabase.auth.token");
  });

  it("handles storage exceptions gracefully without crashing", async () => {
    (EncryptedStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("Keystore unavailable"));
    const result = await secureAuthStorage.getItem("supabase.auth.token");
    expect(result).toBeNull();
  });
});

describe("M1 Foundation — Design Tokens & Formatters", () => {
  it("defines authentic Kashi Veda sacred brand colors", () => {
    expect(colors.primary).toBe("#E05A1B");
    expect(colors.secondary).toBe("#D97706");
    expect(colors.background).toBe("#FAFAF9");
    expect(colors.surface).toBe("#FFFFFF");
  });

  it("formats currency correctly into INR", () => {
    expect(formatCurrency(501)).toBe("₹501.00");
    expect(formatCurrency("11000")).toBe("₹11,000.00");
    expect(formatCurrency("invalid")).toBe("₹0.00");
  });

  it("formats dates and times correctly", () => {
    const isoString = "2026-10-05T18:30:00.000Z";
    expect(formatDate(isoString)).not.toBe("—");
    expect(formatTime(isoString)).not.toBe("—");
    expect(formatDate(null)).toBe("—");
  });
});

describe("M1 Foundation — UI Primitives Rendering", () => {
  it("renders Text component with various variants", () => {
    let tree: any;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <>
          <Text variant="h1">Sacred Rituals</Text>
          <Text variant="caption">Varanasi</Text>
        </>
      );
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders Button component", () => {
    let tree: any;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Button title="Book Puja" />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders Input with label and error feedback", () => {
    let tree: any;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <Input
          label="Mobile Number"
          placeholder="Enter 10 digits"
          error="Invalid number"
        />
      );
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders Card container", () => {
    let tree: any;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <Card>
          <Text>Rudrabhishek</Text>
        </Card>
      );
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders Header with back action", () => {
    const onBack = jest.fn();
    let tree: any;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <Header title="My Bookings" subtitle="Active Pujas" onBack={onBack} />
      );
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders EmptyState, ErrorState, and LoadingState", () => {
    let tree: any;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <>
          <EmptyState title="No Active Pujas" description="Explore catalog" />
          <ErrorState title="Connection Failed" />
          <LoadingState message="Connecting to temple..." />
        </>
      );
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});

describe("M1 Foundation — Role Placeholder Screens", () => {
  it("renders Customer HomeScreen", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<HomeScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders PanditDashboardScreen placeholder", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<PanditDashboardScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });

  it("renders AdminNoticeScreen placeholder redirecting to web admin", async () => {
    let tree: any;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<AdminNoticeScreen />);
    });
    expect(tree.toJSON()).toBeTruthy();
  });
});
