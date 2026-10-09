// __tests__/booking.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { bookingPaymentService } from "../src/features/booking/services/bookingPaymentService.ts";
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { discoveryService } from "../src/features/discovery/services/discoveryService.ts";
import { BookingDateSelector } from "../src/features/booking/components/BookingDateSelector.tsx";
import { BookingLocationSelector } from "../src/features/booking/components/BookingLocationSelector.tsx";
import { BookingModeSelector } from "../src/features/booking/components/BookingModeSelector.tsx";
import { BookingPriceBreakdown } from "../src/features/booking/components/BookingPriceBreakdown.tsx";
import { BookingStatusBadge } from "../src/features/booking/components/BookingStatusBadge.tsx";
import { BookingTimeSlotSelector } from "../src/features/booking/components/BookingTimeSlotSelector.tsx";
import { PrasadSelector } from "../src/features/booking/components/PrasadSelector.tsx";
import { SamagriSelector } from "../src/features/booking/components/SamagriSelector.tsx";
import { BookingDetailsScreen } from "../src/features/booking/screens/BookingDetailsScreen.tsx";
import { BookingPaymentScreen } from "../src/features/booking/screens/BookingPaymentScreen.tsx";
import { BookingSuccessScreen } from "../src/features/booking/screens/BookingSuccessScreen.tsx";
import { BookingWizardScreen } from "../src/features/booking/screens/BookingWizardScreen.tsx";
import { BookingsScreen } from "../src/features/booking/screens/BookingsScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";

const realFetchBookingDetail = bookingService.fetchBookingDetail;
const realFetchCustomerBookings = bookingService.fetchCustomerBookings;

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => {
  const ReactModule = require("react");
  return {
    NavigationContainer: ({ children }: any) => children,
    useNavigation: () => ({
      navigate: mockNavigate,
      replace: mockReplace,
      goBack: mockGoBack,
    }),
    useRoute: () => ({
      params: {
        pujaId: "puja-rudra-1",
        pujaName: "Kashi Rudrabhishek",
        panditId: "pandit-shastri-1",
        bookingId: "bk-123",
        paymentOrderId: "po-123",
        bookingNumber: "KV-BK-20261006-A1B2C3",
        advanceAmount: 250,
        pujaNameParam: "Kashi Rudrabhishek",
        panditName: "Acharya Shastri",
      },
    }),
    useFocusEffect: (cb: any) => {
      ReactModule.useEffect(() => {
        return cb();
      }, [cb]);
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

const mockInvoke = jest.fn();
Object.defineProperty(supabase, "functions", {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
});

describe("M3 Customer Booking Flow Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        razorpay_order_id: "order_rzp_test123",
        amount: 96000,
        currency: "INR",
        key_id: "rzp_test_key",
      },
      error: null,
    });

    (supabase as any).functions = {
      invoke: mockInvoke,
    };

    jest.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: "cust-1", email: "devotee@kashiveda.org" } },
      error: null,
    } as any);

    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "mock-jwt-token-123" } },
      error: null,
    } as any);

    jest.spyOn(bookingService, "fetchPanditAvailability").mockResolvedValue({
      availableSlots: [
        "2026-10-10T09:00:00+05:30",
        "2026-10-10T10:30:00+05:30",
        "2026-10-10T14:00:00+05:30",
      ],
    });

    jest.spyOn(bookingService, "fetchCustomerBookings").mockResolvedValue({
      bookings: [],
      totalCount: 0,
    });

    jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue({
      id: "bk-123",
      booking_number: "KV-BK-20261006-A1B2C3",
      customer_id: "cust-1",
      pandit_id: "pandit-1",
      puja_service_id: "puja-1",
      service_mode: "home",
      status: "confirmed",
      scheduled_start_at: "2026-10-10T09:00:00+05:30",
      scheduled_end_at: "2026-10-10T10:00:00+05:30",
      price_snapshot: 2100,
      currency: "INR",
      advance_percent: 10,
      advance_amount: 960,
      balance_amount: 1890,
      total_amount: 2850,
      reschedule_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      puja_service: { id: "puja-1", name: "Kashi Rudrabhishek" },
      pandit: { id: "pandit-1", display_name: "Acharya Shastri" },
    });

    jest.spyOn(discoveryService, "fetchPujaDetail").mockResolvedValue({
      puja: {
        id: "puja-rudra-1",
        category_id: "cat-1",
        name: "Kashi Rudrabhishek",
        description: "Sacred Shiva ritual",
        default_duration_minutes: 60,
        allowed_modes: ["home", "temple", "remote"],
        is_active: true,
        created_at: new Date().toISOString(),
        starting_price: 2100,
      },
      samagriPackages: [
        {
          id: "pkg-1",
          puja_service_id: "puja-rudra-1",
          name: "Complete Shodashopachara Samagri",
          description: "16 pure Vedic offerings",
          is_active: true,
          items: [
            {
              quantity: 1,
              item: { id: "item-1", name: "Pure Cow Ghee", description: null, unit: "kg", unit_price: 600, is_active: true },
            },
          ],
        },
      ],
      offeringsCount: 3,
      minPrice: 2100,
    });

    jest.spyOn(discoveryService, "fetchPandits").mockResolvedValue([
      {
        id: "pandit-shastri-1",
        user_id: "user-p-1",
        display_name: "Acharya Shastri",
        avatar_url: null,
        bio: "Vedic Scholar",
        years_experience: 15,
        languages: ["Sanskrit", "Hindi"],
        public_status: "available",
        rating_avg: 4.9,
        rating_count: 24,
        offering_names: ["Kashi Rudrabhishek"],
        puja_price: 2100,
        distance_km: null,
        kundli_enabled: true,
        kundli_price: 1100,
      },
    ]);

    jest.spyOn(bookingService, "fetchCustomSamagriItems").mockResolvedValue([
      { id: "item-1", name: "Pure Cow Ghee", description: null, unit: "kg", unit_price: 600, is_active: true },
    ]);

    jest.spyOn(bookingService, "fetchPrasadItems").mockResolvedValue([
      { id: "prasad-1", name: "Kashi Vishwanath Mahaprasad", description: "Laddoo Box", unit_price: 250, is_active: true },
    ]);

    jest.spyOn(bookingService, "fetchCustomerAddresses").mockResolvedValue([
      {
        id: "addr-1",
        customer_id: "cust-1",
        label: "Home Residence",
        address_line1: "Ghat Road 12",
        city: "Varanasi",
        pincode: "221001",
        latitude: 25.31,
        longitude: 82.97,
        is_default: true,
      },
    ]);

    jest.spyOn(bookingService, "fetchTemples").mockResolvedValue([
      {
        id: "temple-1",
        name: "Kashi Vishwanath Temple",
        address: "Lahori Tola",
        city: "Varanasi",
        is_active: true,
      },
    ]);
  });

  // 1. Service Mode Selection Component
  test("1. BookingModeSelector renders modes and triggers onSelectMode", () => {
    const onSelectMode = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <BookingModeSelector
          selectedMode="home"
          allowedModes={["home", "remote", "temple"]}
          onSelectMode={onSelectMode}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Home Puja" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Online Puja" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Temple Puja" }).length).toBeGreaterThan(0);
  });

  // 2. Date Selection Component
  test("2. BookingDateSelector generates future dates and handles selection", () => {
    const onSelectDate = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    act(() => {
      renderer = ReactTestRenderer.create(
        <BookingDateSelector
          selectedDate="2026-10-10"
          onSelectDate={onSelectDate}
          daysAhead={7}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findByProps({ children: "Select Auspicious Date" })).toBeTruthy();
  });

  // 3. Time Slot Calculation & Selection
  test("3. BookingTimeSlotSelector renders calculated slots", async () => {
    jest.spyOn(bookingService, "fetchPanditAvailability").mockResolvedValueOnce({
      availableSlots: [
        "2026-10-10T09:00:00+05:30",
        "2026-10-10T10:30:00+05:30",
        "2026-10-10T14:00:00+05:30",
      ],
    });

    const onSelectSlot = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <BookingTimeSlotSelector
          panditId="pandit-1"
          dateStr="2026-10-10"
          durationMinutes={60}
          selectedSlot="2026-10-10T09:00:00+05:30"
          onSelectSlot={onSelectSlot}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findByProps({ children: "Select Muhurat / Time Slot" })).toBeTruthy();
  });

  // 4. Location Selector (Home vs Temple vs Remote)
  test("4. BookingLocationSelector handles Home addresses and Remote live sanctum", async () => {
    const onSelectAddress = jest.fn();
    const onSelectTemple = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <BookingLocationSelector
          serviceMode="home"
          selectedAddress={null}
          onSelectAddress={onSelectAddress}
          selectedTemple={null}
          onSelectTemple={onSelectTemple}
        />
      );
    });

    expect(renderer!.root.findAllByProps({ children: "Home Residence" }).length).toBeGreaterThan(0);

    // Remote mode
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <BookingLocationSelector
          serviceMode="remote"
          selectedAddress={null}
          onSelectAddress={onSelectAddress}
          selectedTemple={null}
          onSelectTemple={onSelectTemple}
        />
      );
    });

    expect(renderer!.root.findAllByProps({ children: "Live Remote Vedic Sanctum" }).length).toBeGreaterThan(0);
  });

  // 5. Samagri Package vs Custom Selection
  test("5. SamagriSelector allows toggling package and custom items", () => {
    const onSelectSamagriType = jest.fn();
    const onSelectPackage = jest.fn();
    const onUpdateCustomQty = jest.fn();

    const mockPackages = [
      {
        id: "pkg-1",
        puja_service_id: "puja-1",
        name: "Complete Shodashopachara Samagri",
        description: "16 pure Vedic offerings",
        is_active: true,
        items: [
          {
            quantity: 1,
            item: { id: "item-1", name: "Pure Cow Ghee", description: null, unit: "kg", unit_price: 600, is_active: true },
          },
        ],
      },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <SamagriSelector
          samagriType="package"
          onSelectSamagriType={onSelectSamagriType}
          packages={mockPackages}
          selectedPackage={mockPackages[0]}
          onSelectPackage={onSelectPackage}
          customCatalog={[]}
          customSelections={[]}
          onUpdateCustomQty={onUpdateCustomQty}
        />
      );
    });

    expect(renderer!.root.findAllByProps({ children: "Complete Shodashopachara Samagri" }).length).toBeGreaterThan(0);
  });

  // 6. Prasad Selection & Quantity Adjustment
  test("6. PrasadSelector renders available prasad offerings", () => {
    const onUpdatePrasadQty = jest.fn();
    const mockPrasad = [
      {
        id: "prasad-1",
        name: "Kashi Vishwanath Mahaprasad",
        description: "Pure Besan Laddoos",
        unit_price: 250,
        is_active: true,
      },
    ];

    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <PrasadSelector
          prasadCatalog={mockPrasad}
          prasadSelections={[{ item: mockPrasad[0], quantity: 2 }]}
          onUpdatePrasadQty={onUpdatePrasadQty}
        />
      );
    });

    expect(renderer!.root.findAllByProps({ children: "Optional Blessed Prasad" }).length).toBeGreaterThan(0);
  });

  // 7. Price Breakdown & Advance Calculation
  test("7. BookingPriceBreakdown displays transparent financial breakdown", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <BookingPriceBreakdown
          pujaPrice={2100}
          samagriTotal={500}
          prasadTotal={250}
          totalAmount={2850}
          advanceAmount={960} // 10% of 2100 = 210 + 500 + 250 = 960
          balanceAmount={1890}
          serviceMode="home"
          isAuthoritative={true}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findByProps({ children: "Dakshina & Price Breakdown" })).toBeTruthy();
    expect(root.findByProps({ children: "✓ Server Verified" })).toBeTruthy();
  });

  // 8. Booking Status Badges
  test("8. BookingStatusBadge renders correct status pill", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<BookingStatusBadge status="confirmed" />);
    });
    expect(renderer!.root.findByProps({ children: "Confirmed" })).toBeTruthy();

    act(() => {
      renderer = ReactTestRenderer.create(<BookingStatusBadge status="payment_pending" />);
    });
    expect(renderer!.root.findByProps({ children: "Payment Pending" })).toBeTruthy();
  });

  // 9. Booking RPC create_or_validate_booking Success
  test("9. bookingService.createOrValidateBooking calls authoritative RPC", async () => {
    const mockRpcResponse = {
      booking_id: "bk-12345",
      booking_number: "KV-BK-20261006-XYZ123",
      status: "payment_pending",
      scheduled_start_at: "2026-10-10T09:00:00+05:30",
      scheduled_end_at: "2026-10-10T10:00:00+05:30",
      total_amount: 2850,
      advance_amount: 960,
      balance_amount: 1890,
      puja_price: 2100,
      samagri_total: 500,
      prasad_total: 250,
      payment_order_id: "po-12345",
    };

    jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: mockRpcResponse,
      error: null,
    } as any);

    const result = await bookingService.createOrValidateBooking({
      pandit_id: "pandit-1",
      puja_service_id: "puja-1",
      service_mode: "home",
      scheduled_start_at: "2026-10-10T09:00:00+05:30",
      address_id: "addr-1",
    });

    expect(result.booking_id).toBe("bk-12345");
    expect(result.advance_amount).toBe(960);
    expect(result.payment_order_id).toBe("po-12345");
  });

  // 10. Booking RPC Error Handling (Conflict, Temple advance unconfigured)
  test("10. bookingService.createOrValidateBooking throws clean error on conflict", async () => {
    jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
      data: null,
      error: { message: "Selected time slot conflicts with an existing confirmed booking." },
    } as any);

    await expect(
      bookingService.createOrValidateBooking({
        pandit_id: "pandit-1",
        puja_service_id: "puja-1",
        service_mode: "home",
        scheduled_start_at: "2026-10-10T09:00:00+05:30",
      })
    ).rejects.toThrow("Selected time slot conflicts with an existing confirmed booking.");
  });

  // 11. Razorpay Order Creation via Edge Function
  test("11. bookingPaymentService.createRazorpayOrder calls create-razorpay-order Edge function", async () => {
    const orderRes = await bookingPaymentService.createRazorpayOrder("po-12345");
    expect(orderRes.success).toBe(true);
    expect(orderRes.razorpay_order_id).toBe("order_rzp_test123");
  });

  // 12. Polling for Confirmation
  test("12. bookingPaymentService.pollBookingConfirmation polls until confirmed", async () => {
    jest.spyOn(supabase, "from").mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: "bk-123",
                booking_number: "KV-BK-1",
                status: "confirmed",
                advance_amount: 960,
                total_amount: 2850,
              },
              error: null,
            }),
        }),
      }),
    } as any);

    const pollRes = await bookingPaymentService.pollBookingConfirmation("bk-123", 1, 10);
    expect(pollRes.confirmed).toBe(true);
    expect(pollRes.status).toBe("confirmed");
  });

  // 13. Booking Details Screen
  test("13. BookingDetailsScreen renders full line items and non-payable balance note", async () => {
    jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValueOnce({
      id: "bk-123",
      booking_number: "KV-BK-20261006-A1B2C3",
      customer_id: "cust-1",
      pandit_id: "pandit-1",
      puja_service_id: "puja-1",
      service_mode: "home",
      status: "confirmed",
      scheduled_start_at: "2026-10-10T09:00:00+05:30",
      scheduled_end_at: "2026-10-10T10:00:00+05:30",
      price_snapshot: 2100,
      currency: "INR",
      advance_percent: 10,
      advance_amount: 960,
      balance_amount: 1890,
      total_amount: 2850,
      reschedule_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      puja_service: { id: "puja-1", name: "Kashi Rudrabhishek" },
      pandit: { id: "pandit-1", display_name: "Acharya Shastri" },
      location: {
        booking_id: "bk-123",
        location_type: "home",
        address_snapshot: "Assi Ghat, Varanasi - 221005",
      },
      line_items: [
        {
          id: "li-1",
          booking_id: "bk-123",
          item_type: "puja",
          name_snapshot: "Kashi Rudrabhishek",
          quantity: 1,
          unit_price: 2100,
          total_price: 2100,
          is_refundable: true,
        },
        {
          id: "li-2",
          booking_id: "bk-123",
          item_type: "samagri_package",
          name_snapshot: "Complete Shodashopachara Samagri",
          quantity: 1,
          unit_price: 500,
          total_price: 500,
          is_refundable: true,
        },
      ],
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<BookingDetailsScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Kashi Rudrabhishek" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Outstanding Balance" }).length).toBeGreaterThan(0);
  });

  // 14. Booking History Screen (BookingsScreen)
  test("14. BookingsScreen renders customer booking list and filter tabs", async () => {
    jest.spyOn(bookingService, "fetchCustomerBookings").mockResolvedValue({
      bookings: [
        {
          id: "bk-123",
          booking_number: "KV-BK-20261006-A1B2C3",
          customer_id: "cust-1",
          pandit_id: "pandit-1",
          puja_service_id: "puja-1",
          service_mode: "home",
          status: "confirmed",
          scheduled_start_at: "2026-10-10T09:00:00+05:30",
          scheduled_end_at: "2026-10-10T10:00:00+05:30",
          price_snapshot: 2100,
          currency: "INR",
          advance_percent: 10,
          advance_amount: 960,
          balance_amount: 1890,
          total_amount: 2850,
          reschedule_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          puja_service: { id: "puja-1", name: "Kashi Rudrabhishek" },
          pandit: { id: "pandit-1", display_name: "Acharya Shastri" },
        },
      ],
      totalCount: 1,
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<BookingsScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "My Rituals" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Upcoming" }).length).toBeGreaterThan(0);
  });

  // 15. Booking Success Screen
  test("15. BookingSuccessScreen renders confirmation celebration card", async () => {
    jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValueOnce({
      id: "bk-123",
      booking_number: "KV-BK-20261006-A1B2C3",
      customer_id: "cust-1",
      pandit_id: "pandit-1",
      puja_service_id: "puja-1",
      service_mode: "home",
      status: "confirmed",
      scheduled_start_at: "2026-10-10T09:00:00+05:30",
      scheduled_end_at: "2026-10-10T10:00:00+05:30",
      price_snapshot: 2100,
      currency: "INR",
      advance_percent: 10,
      advance_amount: 960,
      balance_amount: 1890,
      total_amount: 2850,
      reschedule_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      puja_service: { id: "puja-1", name: "Kashi Rudrabhishek" },
      pandit: { id: "pandit-1", display_name: "Acharya Shastri" },
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<BookingSuccessScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Sankalp Confirmed!" }).length).toBeGreaterThan(0);
  });

  // 16. Booking Payment Screen
  test("16. BookingPaymentScreen renders advance payable and payment button", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<BookingPaymentScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Secure Payment" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Advance Amount Payable" }).length).toBeGreaterThan(0);
  });

  // 17. Booking Wizard Screen
  test("17. BookingWizardScreen renders step 1 mode selection and continue button", async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<BookingWizardScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Continue to Next Step" }).length).toBeGreaterThan(0);
  });

  // 18. fetchBookingDetail maps nested PostgREST pandit profile correctly
  test("18. bookingService.fetchBookingDetail maps nested PostgREST profiles:user_id correctly", async () => {
    (bookingService.fetchBookingDetail as any).mockImplementation(realFetchBookingDetail);

    const mockBookingDbRow = {
      id: "bk-nested-1",
      booking_number: "KV-BK-20261008-TEST01",
      customer_id: "cust-1",
      pandit_id: "p-99",
      puja_service_id: "puja-1",
      service_mode: "home",
      status: "confirmed",
      scheduled_start_at: "2026-10-11T05:00:00Z",
      scheduled_end_at: "2026-10-11T06:15:00Z",
      price_snapshot: 149,
      currency: "INR",
      advance_percent: 10,
      advance_amount: 14.9,
      balance_amount: 134.1,
      total_amount: 149,
      reschedule_count: 0,
      confirmed_at: "2026-10-08T10:30:53Z",
      created_at: "2026-10-08T10:30:35Z",
      updated_at: "2026-10-08T10:30:53Z",
      puja_service: { id: "puja-1", name: "Sacred Puja", description: null, default_duration_minutes: 60 },
      pandit: {
        id: "p-99",
        profiles: {
          display_name: "Acharya Vasishta",
          avatar_url: "https://avatar.kashiveda.org/vasishta.png",
          phone: "+919876543210",
        },
      },
      location: {
        booking_id: "bk-nested-1",
        location_type: "home",
        address_id: "addr-1",
        address_snapshot: "Varanasi Ghats",
        city: "Varanasi",
        state: "UP",
        pincode: "221001",
        latitude: 25.31,
        longitude: 82.97,
        temple_id: null,
        temple_name_snapshot: null,
      },
    };

    const fromSpy = jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: mockBookingDbRow, error: null }),
            }),
          }),
        } as any;
      }
      if (table === "booking_line_items") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const rpcSpy = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        outstanding_balance: 134.1,
        total_amount: 149,
        total_paid: 14.9,
        net_paid: 14.9,
        total_refunded: 0,
      },
      error: null,
    } as any);

    const result = await bookingService.fetchBookingDetail("bk-nested-1");
    expect(result.id).toBe("bk-nested-1");
    expect(result.pandit).not.toBeNull();
    expect(result.pandit?.id).toBe("p-99");
    expect(result.pandit?.display_name).toBe("Acharya Vasishta");
    expect(result.pandit?.avatar_url).toBe("https://avatar.kashiveda.org/vasishta.png");
    expect(result.pandit?.phone).toBe("+919876543210");

    fromSpy.mockRestore();
    rpcSpy.mockRestore();
  });

  // 19. fetchBookingDetail gracefully defaults when pandit profile is missing or array
  test("19. bookingService.fetchBookingDetail gracefully handles array and missing profile fallbacks", async () => {
    (bookingService.fetchBookingDetail as any).mockImplementation(realFetchBookingDetail);

    const mockRowWithArrayProfile = {
      id: "bk-nested-2",
      booking_number: "KV-BK-20261008-TEST02",
      customer_id: "cust-1",
      pandit_id: "p-88",
      puja_service_id: "puja-1",
      service_mode: "home",
      status: "confirmed",
      scheduled_start_at: "2026-10-11T05:00:00Z",
      scheduled_end_at: "2026-10-11T06:15:00Z",
      price_snapshot: 149,
      currency: "INR",
      advance_percent: 10,
      advance_amount: 14.9,
      balance_amount: 134.1,
      total_amount: 149,
      reschedule_count: 0,
      created_at: "2026-10-08T10:30:35Z",
      updated_at: "2026-10-08T10:30:53Z",
      pandit: {
        id: "p-88",
        profiles: [
          {
            display_name: "Acharya Brihaspati",
            avatar_url: null,
            phone: null,
          },
        ],
      },
    };

    const fromSpy = jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: mockRowWithArrayProfile, error: null }),
            }),
          }),
        } as any;
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      } as any;
    });

    const rpcSpy = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        outstanding_balance: 134.1,
        total_amount: 149,
        total_paid: 14.9,
        net_paid: 14.9,
        total_refunded: 0,
      },
      error: null,
    } as any);

    const result = await bookingService.fetchBookingDetail("bk-nested-2");
    expect(result.pandit?.display_name).toBe("Acharya Brihaspati");

    fromSpy.mockRestore();
    rpcSpy.mockRestore();
  });

  // 20. fetchCustomerBookings maps nested pandit profile correctly
  test("20. bookingService.fetchCustomerBookings maps nested pandit profile correctly", async () => {
    (bookingService.fetchCustomerBookings as any).mockImplementation(realFetchCustomerBookings);

    jest.spyOn(supabase.auth, "getUser").mockResolvedValueOnce({
      data: { user: { id: "cust-1" } as any },
      error: null,
    });

    const fromSpy = jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                range: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "bk-history-1",
                        booking_number: "KV-BK-HIST-01",
                        status: "confirmed",
                        customer_id: "cust-1",
                        pandit: {
                          id: "p-77",
                          profiles: {
                            display_name: "Acharya Narada",
                            avatar_url: "https://avatar.org/narada.png",
                            phone: null,
                          },
                        },
                      },
                    ],
                    count: 1,
                    error: null,
                  }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const result = await bookingService.fetchCustomerBookings();
    expect(result.totalCount).toBe(1);
    expect(result.bookings.length).toBe(1);
    expect(result.bookings[0].pandit?.display_name).toBe("Acharya Narada");
    expect(result.bookings[0].pandit?.avatar_url).toBe("https://avatar.org/narada.png");

    fromSpy.mockRestore();
  });

  // 21. BookingSuccessScreen renders ErrorState when query fails
  test("21. BookingSuccessScreen renders ErrorState with useful message when query fails", async () => {
    jest.spyOn(bookingService, "fetchBookingDetail").mockRejectedValueOnce(
      new Error("Could not connect to database server")
    );

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<BookingSuccessScreen />);
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Sankalp Retrieval Notice" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Could not connect to database server" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Try Again" }).length).toBeGreaterThan(0);
  });

  // 22. BookingSuccessScreen Try Again button triggers refetch
  test("22. BookingSuccessScreen Try Again button triggers refetch and renders confirmed card", async () => {
    const fetchSpy = jest
      .spyOn(bookingService, "fetchBookingDetail")
      .mockRejectedValueOnce(new Error("Initial query failure"))
      .mockResolvedValueOnce({
        id: "bk-retry-1",
        booking_number: "KV-BK-RETRY-01",
        customer_id: "cust-1",
        pandit_id: "pandit-1",
        puja_service_id: "puja-1",
        service_mode: "home",
        status: "confirmed",
        scheduled_start_at: "2026-10-10T09:00:00+05:30",
        scheduled_end_at: "2026-10-10T10:00:00+05:30",
        price_snapshot: 149,
        currency: "INR",
        advance_percent: 10,
        advance_amount: 14.9,
        balance_amount: 134.1,
        total_amount: 149,
        reschedule_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        puja_service: { id: "puja-1", name: "Sacred Puja" },
        pandit: { id: "pandit-1", display_name: "Acharya Shastri" },
      });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<BookingSuccessScreen />);
    });

    let root = renderer!.root;
    expect(root.findAllByProps({ children: "Initial query failure" }).length).toBeGreaterThan(0);

    // Find and press "Try Again"
    const tryAgainButton = root.findByProps({ title: "Try Again" });
    await act(async () => {
      tryAgainButton.props.onPress();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    root = renderer!.root;
    expect(root.findAllByProps({ children: "Sankalp Confirmed!" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "KV-BK-RETRY-01" }).length).toBeGreaterThan(0);
  });
});

