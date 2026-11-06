// __tests__/pandit.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { AvailabilityRuleCard } from "../src/features/pandit/components/AvailabilityRuleCard.tsx";
import { PanditBookingCard } from "../src/features/pandit/components/PanditBookingCard.tsx";
import { PanditOfferingCard } from "../src/features/pandit/components/PanditOfferingCard.tsx";
import { UnavailabilityBlockCard } from "../src/features/pandit/components/UnavailabilityBlockCard.tsx";
import { PanditAvailabilityScreen } from "../src/features/pandit/screens/PanditAvailabilityScreen.tsx";
import { PanditBookingDetailsScreen } from "../src/features/pandit/screens/PanditBookingDetailsScreen.tsx";
import { PanditBookingsScreen } from "../src/features/pandit/screens/PanditBookingsScreen.tsx";
import { PanditDashboardScreen } from "../src/features/pandit/screens/PanditDashboardScreen.tsx";
import { PanditLiveSessionScreen } from "../src/features/pandit/screens/PanditLiveSessionScreen.tsx";
import { PanditProfileScreen } from "../src/features/pandit/screens/PanditProfileScreen.tsx";
import { PanditUnavailableBlocksScreen } from "../src/features/pandit/screens/PanditUnavailableBlocksScreen.tsx";
import { panditService } from "../src/features/pandit/services/panditService.ts";
import { PanditBookingItem, PanditProfile } from "../src/features/pandit/types/pandit.types.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";
jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    NavigationContainer: ({ children }: any) => children,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
    }),
    useRoute: () => ({
      params: {
        bookingId: "bk-pandit-123",
        roomName: "room_bk-pandit-123",
        token: "mock-livekit-jwt-token",
        serverUrl: "wss://livekit.kashiveda.org",
        pujaName: "Kashi Rudrabhishek",
      },
    }),
    useFocusEffect: (callback: any) => {
      React.useEffect(() => {
        return callback();
      }, []);
    },
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

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    session: { user: { id: "user-p-1" } },
    user: { id: "user-p-1", phone: "+919876543210" },
    profile: { id: "user-p-1", display_name: "Acharya Shastri", phone: "+919876543210" },
    role: "pandit",
    panditProfile: {
      id: "pandit-shastri-1",
      user_id: "user-p-1",
      verification_status: "verified",
      public_status: "available",
      experience_years: 15,
      bio: "Vedic Scholar and Acharya of Kashi",
    },
    isLoading: false,
    error: null,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

const mockPanditProfile: PanditProfile = {
  id: "pandit-shastri-1",
  user_id: "user-p-1",
  verification_status: "approved",
  bio: "Vedic Scholar and Acharya of Kashi",
  years_experience: 15,
  languages: ["Sanskrit", "Hindi"],
  base_latitude: 25.3176,
  base_longitude: 82.9739,
  service_radius_km: 25,
  public_status: "available",
  onboarding_completed_at: new Date().toISOString(),
  approved_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  display_name: "Acharya Shastri",
  phone: "+919876543210",
  avatar_url: null,
};

const mockBooking: PanditBookingItem = {
  id: "bk-pandit-123",
  booking_number: "KV-BK-20261006-P1",
  customer_id: "cust-1",
  pandit_id: "pandit-shastri-1",
  puja_service_id: "puja-1",
  service_mode: "home",
  status: "confirmed",
  scheduled_start_at: "2026-10-10T09:00:00+05:30",
  scheduled_end_at: "2026-10-10T10:30:00+05:30",
  price_snapshot: 2100,
  currency: "INR",
  advance_amount: 960,
  balance_amount: 1890,
  total_amount: 2850,
  reschedule_count: 0,
  confirmed_at: new Date().toISOString(),
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  puja_service: {
    id: "puja-1",
    name: "Kashi Rudrabhishek",
    description: "Sacred Shiva ritual",
    default_duration_minutes: 90,
  },
  customer: {
    id: "cust-1",
    display_name: "Devotee Sharma",
    phone: "+919988776655",
    avatar_url: null,
  },
  location: {
    booking_id: "bk-pandit-123",
    location_type: "home",
    address_snapshot: "Assi Ghat Residence, Varanasi",
    city: "Varanasi",
  },
  line_items: [
    {
      id: "li-1",
      booking_id: "bk-pandit-123",
      item_type: "puja",
      name_snapshot: "Kashi Rudrabhishek",
      quantity: 1,
      unit_price: 2100,
      total_price: 2100,
      is_refundable: true,
    },
    {
      id: "li-2",
      booking_id: "bk-pandit-123",
      item_type: "samagri_package",
      name_snapshot: "Complete Shodashopachara Samagri",
      quantity: 1,
      unit_price: 750,
      total_price: 750,
      is_refundable: true,
    },
  ],
};

const mockInvoke = jest.fn();
Object.defineProperty(supabase, "functions", {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
});

describe("M4 Pandit Operational Workflows Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({
      data: {
        token: "mock-livekit-jwt-token",
        room_name: "room_bk-pandit-123",
        server_url: "wss://livekit.kashiveda.org",
        expires_at: new Date(Date.now() + 7200000).toISOString(),
      },
      error: null,
    });

    jest.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: "user-p-1", email: "acharya@kashiveda.org" } },
      error: null,
    } as any);

    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "mock-pandit-jwt" } },
      error: null,
    } as any);

    jest.spyOn(panditService, "fetchCurrentPanditProfile").mockResolvedValue(mockPanditProfile);

    jest.spyOn(panditService, "fetchPanditDashboardSummary").mockResolvedValue({
      pandit: mockPanditProfile,
      todayBookingsCount: 1,
      upcomingBookingsCount: 3,
      completedBookingsCount: 12,
      nextBooking: mockBooking,
      todayBookings: [mockBooking],
      verifiedBankAccount: true,
    });

    jest.spyOn(panditService, "fetchPanditBookings").mockResolvedValue({
      bookings: [mockBooking],
      totalCount: 1,
    });

    jest.spyOn(panditService, "fetchPanditBookingDetail").mockResolvedValue(mockBooking);

    jest.spyOn(panditService, "fetchAvailabilityRules").mockResolvedValue([
      {
        id: "rule-1",
        pandit_id: "pandit-shastri-1",
        day_of_week: 1, // Monday
        start_time: "08:00:00",
        end_time: "18:00:00",
        timezone: "Asia/Kolkata",
        is_active: true,
      },
    ]);

    jest.spyOn(panditService, "fetchUnavailabilityBlocks").mockResolvedValue([
      {
        id: "block-1",
        pandit_id: "pandit-shastri-1",
        starts_at: "2026-10-15T09:00:00+05:30",
        ends_at: "2026-10-15T18:00:00+05:30",
        reason: "Personal Travel",
      },
    ]);

    jest.spyOn(panditService, "fetchPanditOfferings").mockResolvedValue([
      {
        id: "off-1",
        pandit_id: "pandit-shastri-1",
        puja_service_id: "puja-1",
        price: 2100,
        currency: "INR",
        duration_minutes: 90,
        is_active: true,
        puja_service: {
          id: "puja-1",
          name: "Kashi Rudrabhishek",
          description: "Shiva Abhishek",
          default_duration_minutes: 90,
          starting_price: 2100,
        },
      },
    ]);
  });

  // 1. Dashboard Rendering
  test("1. PanditDashboardScreen renders summary stats, next ritual, and today schedule", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditDashboardScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Pranam, Acharya Shastri" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Kashi Rudrabhishek" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Today's Rituals" }).length).toBeGreaterThan(0);
  });

  // 2. Booking List Rendering
  test("2. PanditBookingsScreen renders filter tabs and assigned bookings", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditBookingsScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Assigned Rituals" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Upcoming" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Kashi Rudrabhishek" }).length).toBeGreaterThan(0);
  });

  // 3. Pandit Booking Card Component
  test("3. PanditBookingCard displays devotee name, muhurat, and status", () => {
    const onPress = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <PanditBookingCard booking={mockBooking} onPress={onPress} />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Devotee: Devotee Sharma" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Kashi Rudrabhishek" }).length).toBeGreaterThan(0);
  });

  // 4. Booking Details Rendering & Inclusions
  test("4. PanditBookingDetailsScreen renders customer info, location snapshot, and line items", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditBookingDetailsScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Kashi Rudrabhishek" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Assi Ghat Residence, Varanasi" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Devotee Information" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Mark Ritual as Completed 🕉️" }).length).toBeGreaterThan(0);
  });

  // 5. Availability Rule Card Component
  test("5. AvailabilityRuleCard displays day schedule and handles toggle", async () => {
    const onSave = jest.fn().mockResolvedValue({});
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <AvailabilityRuleCard
          dayOfWeek={1}
          rule={{
            id: "rule-1",
            pandit_id: "pandit-1",
            day_of_week: 1,
            start_time: "08:00:00",
            end_time: "18:00:00",
            timezone: "Asia/Kolkata",
            is_active: true,
          }}
          onSaveRule={onSave}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Monday" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "08:00 - 18:00" }).length).toBeGreaterThan(0);
  });

  // 6. Availability Screen Rendering
  test("6. PanditAvailabilityScreen renders all 7 days of the week", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditAvailabilityScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Weekly Schedule" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Monday" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Sunday" }).length).toBeGreaterThan(0);
  });

  // 7. Unavailability Block Card Component
  test("7. UnavailabilityBlockCard displays time window and delete action", () => {
    const onDelete = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <UnavailabilityBlockCard
          block={{
            id: "b-1",
            pandit_id: "p-1",
            starts_at: "2026-10-15T09:00:00+05:30",
            ends_at: "2026-10-15T18:00:00+05:30",
            reason: "Diwali Puja at Family Temple",
          }}
          onDelete={onDelete}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Diwali Puja at Family Temple" }).length).toBeGreaterThan(0);
  });

  // 8. Unavailable Blocks Screen Rendering
  test("8. PanditUnavailableBlocksScreen renders active blocks and add CTA", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditUnavailableBlocksScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Unavailable Blocks" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "+ Add Unavailable Period" }).length).toBeGreaterThan(0);
  });

  // 9. Unavailability Block Validation: Invalid Range (end <= start)
  test("9. panditService.createUnavailabilityBlock rejects when ends_at <= starts_at", async () => {
    await expect(
      panditService.createUnavailabilityBlock(
        "2026-10-15T18:00:00+05:30",
        "2026-10-15T09:00:00+05:30",
        "Invalid backward range"
      )
    ).rejects.toThrow("Block end time must be after start time.");
  });

  // 10. Unavailability Block Validation: Confirmed Booking Conflict
  test("10. panditService.createUnavailabilityBlock rejects when confirmed booking conflicts", async () => {
    jest.spyOn(supabase, "from").mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          in: () => ({
            lte: () => ({
              gte: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [{ id: "bk-1", booking_number: "KV-BK-100", scheduled_start_at: "2026-10-15T10:00:00+05:30" }],
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    } as any);

    await expect(
      panditService.createUnavailabilityBlock(
        "2026-10-15T09:00:00+05:30",
        "2026-10-15T18:00:00+05:30",
        "Overlap with KV-BK-100"
      )
    ).rejects.toThrow("Cannot block this time window: You have a confirmed ritual (KV-BK-100)");
  });

  // 11. Authoritative Status Transition: mark_booking_completed RPC Success
  test("11. panditService.markBookingCompleted calls authoritative mark_booking_completed RPC", async () => {
    jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: {
        status: "completed",
        booking_id: "bk-pandit-123",
        completed_at: new Date().toISOString(),
        payout_id: "payout-123",
        payout_amount: 2850,
      },
      error: null,
    } as any);

    const result = await panditService.markBookingCompleted("bk-pandit-123");
    expect(result.status).toBe("completed");
    expect(result.booking_id).toBe("bk-pandit-123");
    expect(result.payout_id).toBe("payout-123");
  });

  // 12. Authoritative Status Transition: Missing Verified Bank Account
  test("12. panditService.markBookingCompleted propagates verified bank account error from RPC", async () => {
    jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: null,
      error: { message: "Pandit does not have a verified default bank account." },
    } as any);

    await expect(panditService.markBookingCompleted("bk-pandit-123")).rejects.toThrow(
      "Pandit does not have a verified default bank account."
    );
  });

  // 13. Offering Card & Price Adjustment
  test("13. PanditOfferingCard displays ritual offering and custom dakshina", () => {
    const onUpdatePrice = jest.fn().mockResolvedValue({});
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <PanditOfferingCard
          offering={{
            id: "off-1",
            pandit_id: "p-1",
            puja_service_id: "puja-1",
            home_price: 2100,
            price: 2100,
            currency: "INR",
            duration_minutes: 90,
            is_active: true,
            puja_service: {
              id: "puja-1",
              name: "Kashi Rudrabhishek",
              description: "Shiva Puja",
              default_duration_minutes: 90,
            },
          }}
          onUpdatePrice={onUpdatePrice}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Kashi Rudrabhishek" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "₹2,100.00" }).length).toBeGreaterThan(0);
  });

  // 14. Profile Screen Rendering
  test("14. PanditProfileScreen renders identity, bio, experience, and offerings", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditProfileScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Pandit Ji Profile" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Acharya Shastri" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "15 Years" }).length).toBeGreaterThan(0);
  });

  // 15. Live Session Screen Rendering
  test("15. PanditLiveSessionScreen renders video viewport and room controls", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(<PanditLiveSessionScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Live Vedic Sanctum" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Leave Live Sanctum" }).length).toBeGreaterThan(0);
  });

  // 16. Live Session Token Request via Edge Function
  test("16. panditService.requestLiveSessionToken invokes live-session-token Edge function", async () => {
    const creds = await panditService.requestLiveSessionToken("bk-pandit-123");
    expect(creds.token).toBe("mock-livekit-jwt-token");
    expect(creds.room_name).toBe("room_bk-pandit-123");
  });
});
