// __tests__/service_mode_discovery_booking.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";
import { HomeScreen } from "../src/features/discovery/screens/HomeScreen.tsx";
import { PujaListScreen } from "../src/features/discovery/screens/PujaListScreen.tsx";
import { PujaDetailScreen } from "../src/features/discovery/screens/PujaDetailScreen.tsx";
import { BookingWizardScreen } from "../src/features/booking/screens/BookingWizardScreen.tsx";
import { discoveryService } from "../src/features/discovery/services/discoveryService.ts";
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { useBookingFlow } from "../src/features/booking/hooks/useBookingFlow.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { PujaService, PanditSummary } from "../src/features/discovery/types/discovery.ts";
import { Temple } from "../src/features/booking/types/booking.types.ts";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: any = {};

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    replace: jest.fn(),
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

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user-id" } },
    user: { id: "test-user-id", phone: "+919876543210" },
    profile: { display_name: "Ananya Sharma" },
    role: "customer",
    panditProfile: null,
    isLoading: false,
    error: null,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

function renderBookingFlowHook(initialProps: Parameters<typeof useBookingFlow>[0] = {}) {
  let hookInstance: any = null;
  function TestComponent({ props }: { props: Parameters<typeof useBookingFlow>[0] }) {
    const value = useBookingFlow(props);
    hookInstance = value;
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<TestComponent props={initialProps} />);
  });
  return {
    get current(): ReturnType<typeof useBookingFlow> {
      return hookInstance;
    },
    rerender(newProps?: Parameters<typeof useBookingFlow>[0]) {
      act(() => {
        renderer.update(<TestComponent props={newProps || initialProps} />);
      });
    },
  };
}

describe("Service-Mode Entry Points & Discovery Architecture", () => {
  const mockPujaMultiMode: PujaService = {
    id: "puja-rudra-1",
    category_id: "cat-1",
    name: "Kashi Vishwanath Rudrabhishek",
    description: "Sacred Shiva Abhishek ritual",
    default_duration_minutes: 90,
    allowed_modes: ["home", "temple", "remote"],
    is_active: true,
    created_at: "2026-10-01T00:00:00Z",
    starting_price: 2100,
  };

  const mockPujaRemoteOnly: PujaService = {
    id: "puja-remote-1",
    category_id: "cat-2",
    name: "Navagraha Shanti Online",
    description: "Online astrological ritual via live video",
    default_duration_minutes: 60,
    allowed_modes: ["remote"],
    is_active: true,
    created_at: "2026-10-01T00:00:00Z",
    starting_price: 1500,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};

    jest.spyOn(discoveryService, "fetchCategories").mockResolvedValue([
      { id: "cat-1", name: "Abhishek", description: "Sacred Abhishek", display_order: 1, is_active: true },
    ]);

    jest.spyOn(discoveryService, "fetchPujaServices").mockResolvedValue([mockPujaMultiMode]);

    jest.spyOn(discoveryService, "fetchPandits").mockResolvedValue([
      {
        id: "pandit-1",
        user_id: "u-1",
        display_name: "Acharya Ram Shastri",
        avatar_url: null,
        bio: "Vedic Scholar",
        years_experience: 15,
        languages: ["Hindi", "Sanskrit"],
        public_status: "available",
        rating_avg: 4.95,
        rating_count: 50,
        offering_names: ["Kashi Vishwanath Rudrabhishek"],
        puja_price: 2100,
        home_price: 2100,
        temple_price: 3100,
        remote_price: 1800,
        distance_km: null,
        kundli_enabled: true,
        kundli_price: 500,
      },
    ]);

    jest.spyOn(discoveryService, "fetchPujaDetail").mockResolvedValue({
      puja: mockPujaMultiMode,
      samagriPackages: [],
      offeringsCount: 1,
      minPrice: 2100,
    });
  });

  describe("1. Customer Home Screen Service-Mode Entry Points", () => {
    it("renders Home Puja, Online Puja, Temple Puja cards and Browse All Pujas", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<HomeScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("How would you like to perform your puja?");
      expect(json).toContain("Choose the experience that works best for you.");
      expect(json).toContain("Home Puja");
      expect(json).toContain("Book a Pandit to perform your puja at home.");
      expect(json).toContain("Explore Home Pujas");
      expect(json).toContain("Online Puja");
      expect(json).toContain("Connect with a Pandit through a live video session.");
      expect(json).toContain("Explore Online Pujas");
      expect(json).toContain("Temple Puja");
      expect(json).toContain("Choose a temple and find Pandits who serve there.");
      expect(json).toContain("Explore Temple Pujas");
      expect(json).toContain("Browse All Pujas");
      expect(json).toContain("Choose your puja first, then decide how you want to perform it.");
    });

    it("navigates with correct parameters when Home Puja card is tapped", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<HomeScreen />);
      });

      const root = tree.root;
      const touchables = root.findAllByType(TouchableOpacity);
      const homeCard = touchables.find((t: any) => t.props.accessibilityLabel === "Explore Home Pujas");
      expect(homeCard).toBeDefined();

      act(() => {
        homeCard.props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith("PujaList", {
        serviceMode: "home",
        modeTitle: "Home Pujas",
      });
    });

    it("navigates with correct parameters when Online Puja card is tapped", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<HomeScreen />);
      });

      const root = tree.root;
      const touchables = root.findAllByType(TouchableOpacity);
      const onlineCard = touchables.find((t: any) => t.props.accessibilityLabel === "Explore Online Pujas");
      expect(onlineCard).toBeDefined();

      act(() => {
        onlineCard.props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith("PujaList", {
        serviceMode: "remote",
        modeTitle: "Online Pujas",
      });
    });

    it("navigates with correct parameters when Temple Puja card is tapped", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<HomeScreen />);
      });

      const root = tree.root;
      const touchables = root.findAllByType(TouchableOpacity);
      const templeCard = touchables.find((t: any) => t.props.accessibilityLabel === "Explore Temple Pujas");
      expect(templeCard).toBeDefined();

      act(() => {
        templeCard.props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith("PujaList", {
        serviceMode: "temple",
        modeTitle: "Temple Pujas",
      });
    });

    it("navigates with no filter when Browse All Pujas is tapped", async () => {
      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<HomeScreen />);
      });

      const root = tree.root;
      const touchables = root.findAllByType(TouchableOpacity);
      const browseAll = touchables.find((t: any) => t.props.accessibilityLabel === "Browse All Pujas");
      expect(browseAll).toBeDefined();

      act(() => {
        browseAll.props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith("PujaList");
    });
  });

  describe("2. Puja Catalog Filtering by Mode (Service-Mode-First)", () => {
    it("filters catalog by remote mode when opened for Online Puja", async () => {
      mockRouteParams = { serviceMode: "remote", modeTitle: "Online Pujas" };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PujaListScreen />);
      });

      expect(discoveryService.fetchPujaServices).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceMode: "remote",
        })
      );

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Online Pujas");
      expect(json).toContain("Connect with verified Pandits through live video sessions");
    });

    it("shows mode-specific empty message when no remote pujas are available", async () => {
      mockRouteParams = { serviceMode: "remote", modeTitle: "Online Pujas" };
      jest.spyOn(discoveryService, "fetchPujaServices").mockResolvedValueOnce([]);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PujaListScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("No online pujas are currently available.");
    });

    it("shows mode-specific empty message when no home pujas are available", async () => {
      mockRouteParams = { serviceMode: "home", modeTitle: "Home Pujas" };
      jest.spyOn(discoveryService, "fetchPujaServices").mockResolvedValueOnce([]);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PujaListScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("No pujas are currently available for Home service.");
    });

    it("shows mode-specific empty message when no temple pujas are available", async () => {
      mockRouteParams = { serviceMode: "temple", modeTitle: "Temple Pujas" };
      jest.spyOn(discoveryService, "fetchPujaServices").mockResolvedValueOnce([]);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PujaListScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("No temple pujas are currently available.");
    });
  });

  describe("3. Puja Detail Screen & Mode Selection", () => {
    it("preserves initial service mode and shows Online Puja selection", async () => {
      mockRouteParams = {
        pujaId: "puja-rudra-1",
        pujaName: "Kashi Vishwanath Rudrabhishek",
        serviceMode: "remote",
      };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PujaDetailScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Schedule Online Ritual Now");
      expect(json).toContain("Online Puja");
      expect(json).toContain("Connect with a Pandit through a live video session.");
    });

    it("displays general schedule button if no service mode is pre-selected (Puja-First journey)", async () => {
      mockRouteParams = {
        pujaId: "puja-rudra-1",
        pujaName: "Kashi Vishwanath Rudrabhishek",
      };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PujaDetailScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Schedule Ritual Now");
    });
  });

  describe("4. State Management & Discovery Isolation (useBookingFlow)", () => {
    it("initializes with Remote mode and defaults Samagri to none", () => {
      const hook = renderBookingFlowHook({
        initialPuja: mockPujaMultiMode,
        initialMode: "remote",
      });

      expect(hook.current.serviceMode).toBe("remote");
      expect(hook.current.selectedPandit).toBeNull();
      expect(hook.current.samagriType).toBe("none");
      expect(hook.current.selectedAddress).toBeNull();
      expect(hook.current.selectedTemple).toBeNull();
    });

    it("resets incompatible pandit, slot, address, and temple when switching service mode from Home to Temple", () => {
      const mockPandit: PanditSummary = {
        id: "pandit-1",
        user_id: "u-1",
        display_name: "Acharya Shastri",
        avatar_url: null,
        bio: null,
        years_experience: 10,
        languages: ["Hindi"],
        public_status: "available",
        rating_avg: 4.8,
        rating_count: 10,
        offering_names: ["Kashi Vishwanath Rudrabhishek"],
        puja_price: 2000,
        home_price: 2000,
        temple_price: 2500,
        remote_price: 1500,
        distance_km: null,
        kundli_enabled: false,
        kundli_price: null,
      };

      const mockAddress = {
        id: "addr-1",
        customer_id: "test-user-id",
        label: "Home",
        address_line1: "Ghat Road",
        city: "Varanasi",
        latitude: 25.3176,
        longitude: 82.9739,
        is_default: true,
      };

      const hook = renderBookingFlowHook({
        initialPuja: mockPujaMultiMode,
        initialMode: "home",
      });

      act(() => {
        hook.current.setSelectedAddress(mockAddress);
        hook.current.setSelectedPandit(mockPandit);
        hook.current.setSelectedSlot("2026-10-15T10:00:00+05:30");
      });

      expect(hook.current.selectedAddress).not.toBeNull();
      expect(hook.current.selectedPandit).not.toBeNull();
      expect(hook.current.selectedSlot).toBe("2026-10-15T10:00:00+05:30");

      // Change service mode to temple
      act(() => {
        hook.current.setServiceMode("temple");
      });

      expect(hook.current.serviceMode).toBe("temple");
      expect(hook.current.selectedPandit).toBeNull();
      expect(hook.current.selectedSlot).toBeNull();
      expect(hook.current.selectedAddress).toBeNull();
      expect(hook.current.selectedTemple).toBeNull();
    });

    it("resets state and adjusts samagriType when switching to remote mode", () => {
      const hook = renderBookingFlowHook({
        initialPuja: mockPujaMultiMode,
        initialMode: "home",
      });

      expect(hook.current.samagriType).toBe("package");

      act(() => {
        hook.current.setServiceMode("remote");
      });

      expect(hook.current.serviceMode).toBe("remote");
      expect(hook.current.samagriType).toBe("none");
      expect(hook.current.selectedAddress).toBeNull();
      expect(hook.current.selectedTemple).toBeNull();
    });
  });

  describe("5. BookingWizardScreen Dynamic Steps & Entry Preservation", () => {
    beforeEach(() => {
      jest.spyOn(bookingService, "fetchCustomSamagriItems").mockResolvedValue([]);
      jest.spyOn(bookingService, "fetchPrasadItems").mockResolvedValue([]);
      jest.spyOn(bookingService, "fetchCustomerAddresses").mockResolvedValue([
        {
          id: "addr-1",
          customer_id: "test-user-id",
          label: "Home",
          address_line1: "Ghat Road",
          city: "Varanasi",
          latitude: 25.3176,
          longitude: 82.9739,
          is_default: true,
        },
      ]);
      jest.spyOn(bookingService, "fetchTemples").mockResolvedValue([
        {
          id: "temple-1",
          name: "Kashi Vishwanath Mandir",
          city: "Varanasi",
          is_active: true,
        },
      ]);
    });

    it("Home Puja entry skips Mode Selection and starts on Address selection step (Step 1 of 5)", async () => {
      mockRouteParams = {
        pujaId: "puja-rudra-1",
        pujaName: "Kashi Vishwanath Rudrabhishek",
        serviceMode: "home",
      };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingWizardScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Step 1 of 5");
      expect(json).toContain("Select Home Address");
      // Must NOT contain Select Service Format on Step 1
      expect(json).not.toContain("Select Service Format");
    });

    it("Online Puja entry skips Mode Selection, Address, and Temple, starting on Pandit discovery (Step 1 of 3)", async () => {
      mockRouteParams = {
        pujaId: "puja-rudra-1",
        pujaName: "Kashi Vishwanath Rudrabhishek",
        serviceMode: "remote",
      };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingWizardScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Step 1 of 3");
      expect(json).toContain("Choose Verified Acharya");
      expect(json).toContain("Verified priests consecrated for remote Kashi Vishwanath Rudrabhishek invocation.");
      expect(json).not.toContain("Select Service Format");
      expect(json).not.toContain("Select Home Address");
    });

    it("Temple Puja entry skips Mode Selection and starts on Temple selection (Step 1 of 5)", async () => {
      mockRouteParams = {
        pujaId: "puja-rudra-1",
        pujaName: "Kashi Vishwanath Rudrabhishek",
        serviceMode: "temple",
      };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingWizardScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Step 1 of 5");
      expect(json).toContain("Select Consecrated Temple");
      expect(json).not.toContain("Select Service Format");
    });

    it("Browse All Pujas entry (no pre-selected mode) starts on Mode Selection (Step 1 of 6)", async () => {
      mockRouteParams = {
        pujaId: "puja-rudra-1",
        pujaName: "Kashi Vishwanath Rudrabhishek",
      };

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingWizardScreen />);
      });

      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain("Step 1 of 6");
      expect(json).toContain("Select Service Format");
    });
  });
});

