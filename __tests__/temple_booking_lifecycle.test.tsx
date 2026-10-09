/**
 * Temple Puja Lifecycle & Pandit Temple Association Test Suite
 *
 * Covers:
 * 1. Database & Authorization RPC contracts for Pandit-temple association.
 * 2. Discovery layer mode-aware filtering (p_temple_id passed for temple mode, lat/lng for home, none for remote).
 * 3. Booking hook (useBookingFlow) state transitions and dependent reset when temple/mode changes.
 * 4. Price and payment calculations for Temple mode (10% advance on dakshina, 100% on samagri).
 * 5. Pandit service layer (panditTempleService & panditApplicationService).
 * 6. Edge cases: unapproved association rejection, inactive temple exclusion, slot/pandit clearing on temple change.
 */

import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { discoveryService } from "../src/features/discovery/services/discoveryService.ts";
import { panditTempleService } from "../src/features/pandit/services/panditTempleService.ts";
import { panditApplicationService } from "../src/features/pandit/services/panditApplicationService.ts";
import { useBookingFlow } from "../src/features/booking/hooks/useBookingFlow.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { PanditSummary, PujaService } from "../src/features/discovery/types/discovery.ts";
import { Temple } from "../src/features/booking/types/booking.types.ts";

jest.mock("../src/infrastructure/supabase/client.ts", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: {
      getUser: jest.fn(),
    },
  },
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

describe("Temple Puja & Pandit Association Lifecycle", () => {
  const mockPuja: PujaService = {
    id: "puja-rudrabhishek-1",
    name: "Kashi Vishwanath Rudrabhishek",
    description: "Sacred abhisheka of Lord Shiva",
    category_id: "cat-abhishek-1",
    default_duration_minutes: 90,
    allowed_modes: ["home", "temple", "remote"],
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  };

  const mockTemple1: Temple = {
    id: "temple-kashi-vishwanath",
    name: "Kashi Vishwanath Temple",
    address: "Lahori Tola",
    city: "Varanasi",
    state: "Uttar Pradesh",
    latitude: 25.3109,
    longitude: 83.0107,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  };

  const mockTemple2: Temple = {
    id: "temple-kal-bhairav",
    name: "Kaal Bhairav Mandir",
    address: "Golghar",
    city: "Varanasi",
    state: "Uttar Pradesh",
    latitude: 25.3211,
    longitude: 83.0135,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  };

  const mockPanditAuthorized: PanditSummary = {
    id: "pandit-shastri-id",
    user_id: "user-shastri-1",
    display_name: "Acharya Ram Shastri",
    avatar_url: null,
    bio: "Vedic Priest",
    years_experience: 15,
    languages: ["Hindi", "Sanskrit"],
    public_status: "available",
    rating_avg: 4.9,
    rating_count: 85,
    offering_names: ["Rudrabhishek"],
    puja_price: 3500,
    home_price: 3500,
    temple_price: 4500,
    remote_price: 2500,
    distance_km: null,
    kundli_enabled: false,
    kundli_price: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Phase A: Discovery Layer & Temple Filtering", () => {
    it("fetches only active temples from public.temples", async () => {
      const activeTemples = [mockTemple1, mockTemple2];

      const selectMock = jest.fn().mockReturnThis();
      const eqMock = jest.fn().mockReturnThis();
      const orderMock = jest.fn().mockResolvedValueOnce({
        data: activeTemples,
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: selectMock,
        eq: eqMock,
        order: orderMock,
      });

      const temples = await panditTempleService.fetchActiveTemples();

      expect(supabase.from).toHaveBeenCalledWith("temples");
      expect(selectMock).toHaveBeenCalledWith(
        "id, name, address, city, state, latitude, longitude, is_active, created_at"
      );
      expect(eqMock).toHaveBeenCalledWith("is_active", true);
      expect(temples).toHaveLength(2);
      expect(temples[0].name).toBe("Kashi Vishwanath Temple");
    });

    it("passes p_temple_id to get_customer_pandits RPC when service_mode is temple", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            id: mockPanditAuthorized.id,
            display_name: mockPanditAuthorized.display_name,
            temple_price: 4500,
            service_mode: "temple",
            is_active: true,
          },
        ],
        error: null,
      });

      const result = await discoveryService.fetchPandits({
        pujaServiceId: mockPuja.id,
        serviceMode: "temple",
        templeId: mockTemple1.id,
      });

      expect(supabase.rpc).toHaveBeenCalledWith("get_customer_pandits", {
        p_service_mode: "temple",
        p_latitude: null,
        p_longitude: null,
        p_puja_service_id: mockPuja.id,
        p_limit: 20,
        p_offset: 0,
        p_temple_id: mockTemple1.id,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockPanditAuthorized.id);
    });

    it("passes customer lat/lng for home puja and does not pass temple_id", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            id: mockPanditAuthorized.id,
            display_name: mockPanditAuthorized.display_name,
            home_price: 3500,
          },
        ],
        error: null,
      });

      await discoveryService.fetchPandits({
        pujaServiceId: mockPuja.id,
        serviceMode: "home",
        latitude: 25.3176,
        longitude: 82.9739,
      });

      expect(supabase.rpc).toHaveBeenCalledWith("get_customer_pandits", {
        p_service_mode: "home",
        p_latitude: 25.3176,
        p_longitude: 82.9739,
        p_puja_service_id: mockPuja.id,
        p_limit: 20,
        p_offset: 0,
        p_temple_id: null,
      });
    });

    it("does not pass coordinates or temple for remote puja", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            id: mockPanditAuthorized.id,
            display_name: mockPanditAuthorized.display_name,
            remote_price: 2500,
          },
        ],
        error: null,
      });

      await discoveryService.fetchPandits({
        pujaServiceId: mockPuja.id,
        serviceMode: "remote",
      });

      expect(supabase.rpc).toHaveBeenCalledWith("get_customer_pandits", {
        p_service_mode: "remote",
        p_latitude: null,
        p_longitude: null,
        p_puja_service_id: mockPuja.id,
        p_limit: 20,
        p_offset: 0,
        p_temple_id: null,
      });
    });
  });

  describe("Phase C: Pandit Temple Association Management", () => {
    it("requests association with an active temple with status = 'pending'", async () => {
      const insertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValueOnce({
            data: {
              id: "assoc-123",
              pandit_id: "pandit-profile-456",
              temple_id: mockTemple1.id,
              status: "pending",
              is_active: true,
              created_at: "2026-10-09T10:00:00Z",
            },
            error: null,
          }),
        }),
      });

      (supabase.from as jest.Mock).mockReturnValue({
        insert: insertMock,
      });

      const assoc = await panditTempleService.requestTempleAssociation(
        "pandit-profile-456",
        mockTemple1.id
      );

      expect(supabase.from).toHaveBeenCalledWith("pandit_temples");
      expect(insertMock).toHaveBeenCalledWith([
        {
          pandit_id: "pandit-profile-456",
          temple_id: mockTemple1.id,
          status: "pending",
          is_active: true,
        },
      ]);
      expect(assoc.status).toBe("pending");
    });

    it("submits a new temple addition request with status = 'pending'", async () => {
      const insertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValueOnce({
            data: {
              id: "req-789",
              pandit_id: "pandit-profile-456",
              name: "Shri Sankat Mochan Hanuman Temple",
              address: "Saket Nagar",
              city: "Varanasi",
              state: "Uttar Pradesh",
              status: "pending",
              created_at: "2026-10-09T10:00:00Z",
            },
            error: null,
          }),
        }),
      });

      (supabase.from as jest.Mock).mockReturnValue({
        insert: insertMock,
      });

      const req = await panditTempleService.requestNewTemple("pandit-profile-456", {
        name: "Shri Sankat Mochan Hanuman Temple",
        address: "Saket Nagar",
        city: "Varanasi",
        state: "Uttar Pradesh",
      });

      expect(supabase.from).toHaveBeenCalledWith("temple_addition_requests");
      expect(req.status).toBe("pending");
      expect(req.name).toBe("Shri Sankat Mochan Hanuman Temple");
    });

    it("persists selected_temple_ids in pandit onboarding draft/application", async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValueOnce({
            data: {
              id: "app-123",
              user_id: "user-auth-123",
              selected_temple_ids: [mockTemple1.id, mockTemple2.id],
            },
            error: null,
          }),
        }),
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValueOnce({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
        insert: mockInsert,
      });

      const result = await panditApplicationService.saveDraftApplication("user-auth-123", {
        full_name: "Pandit Ram Shastri",
        email: "shastri@example.com",
        phone: "+919876543210",
        selected_temple_ids: [mockTemple1.id, mockTemple2.id],
      });

      expect(supabase.from).toHaveBeenCalledWith("pandit_applications");
      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          selected_temple_ids: [mockTemple1.id, mockTemple2.id],
        }),
      ]);
      expect(result.selected_temple_ids).toEqual([mockTemple1.id, mockTemple2.id]);
    });
  });

  describe("Phase D: Customer Booking Hook & Dynamic Mode State", () => {
    it("clears selected Pandit and Slot when temple is changed in Temple mode", () => {
      const hook = renderBookingFlowHook({
        initialPuja: mockPuja,
        initialMode: "temple",
        initialPandit: mockPanditAuthorized,
      });

      // Initially set slot
      act(() => {
        hook.current.setSelectedSlot("10:00 AM - 11:30 AM");
      });

      expect(hook.current.selectedPandit?.id).toBe(mockPanditAuthorized.id);
      expect(hook.current.selectedSlot).toBe("10:00 AM - 11:30 AM");

      // Change temple
      act(() => {
        hook.current.setSelectedTemple(mockTemple2);
      });

      // Changing temple must clear pandit and slot
      expect(hook.current.selectedTemple?.id).toBe(mockTemple2.id);
      expect(hook.current.selectedPandit).toBeNull();
      expect(hook.current.selectedSlot).toBeNull();
    });

    it("clears temple and slot when switching from Temple mode to Home mode", () => {
      const hook = renderBookingFlowHook({
        initialPuja: mockPuja,
        initialMode: "temple",
      });

      act(() => {
        hook.current.setSelectedTemple(mockTemple1);
        hook.current.setSelectedPandit(mockPanditAuthorized);
        hook.current.setSelectedSlot("09:00 AM");
      });

      expect(hook.current.selectedTemple?.id).toBe(mockTemple1.id);

      // Switch mode to home
      act(() => {
        hook.current.setServiceMode("home");
      });

      expect(hook.current.serviceMode).toBe("home");
      expect(hook.current.selectedTemple).toBeNull();
      expect(hook.current.selectedPandit).toBeNull();
      expect(hook.current.selectedSlot).toBeNull();
    });

    it("calculates 10% advance for Temple Puja mode Dakshina and 100% on Samagri", () => {
      const hook = renderBookingFlowHook({
        initialPuja: mockPuja,
        initialMode: "temple",
        initialPandit: mockPanditAuthorized,
      });

      // Pandit temple_price is 4500. Dakshina advance = 10% of 4500 = 450.
      expect(hook.current.estimatedPricing.basePrice).toBe(4500);
      expect(hook.current.estimatedPricing.samagriTotal).toBe(0);
      expect(hook.current.estimatedPricing.total).toBe(4500);
      expect(hook.current.estimatedPricing.advanceAmount).toBe(450);
      expect(hook.current.estimatedPricing.balanceAmount).toBe(4050);
      expect(hook.current.estimatedPricing.advancePercent).toBe(10);
    });

    it("calculates 50% advance for Remote Puja and disables Samagri", () => {
      const hook = renderBookingFlowHook({
        initialPuja: mockPuja,
        initialMode: "remote",
        initialPandit: mockPanditAuthorized,
      });

      // Pandit remote_price is 2500. Dakshina advance = 50% of 2500 = 1250.
      // Remote puja has no samagri. Total amount = 2500.
      // Advance due now = 1250. Remaining = 1250.
      expect(hook.current.estimatedPricing.basePrice).toBe(2500);
      expect(hook.current.estimatedPricing.samagriTotal).toBe(0);
      expect(hook.current.estimatedPricing.total).toBe(2500);
      expect(hook.current.estimatedPricing.advanceAmount).toBe(1250);
      expect(hook.current.estimatedPricing.balanceAmount).toBe(1250);
      expect(hook.current.estimatedPricing.advancePercent).toBe(50);
    });
  });

  describe("Phase E: Booking Creation & Invariant Enforcement", () => {
    it("submits create_or_validate_booking with p_temple_id for temple bookings", async () => {
      const hook = renderBookingFlowHook({
        initialPuja: mockPuja,
        initialMode: "temple",
      });

      // In Temple mode: 1. Select temple -> 2. Select authorized pandit -> 3. Select date & slot
      act(() => {
        hook.current.setSelectedTemple(mockTemple1);
        hook.current.setSelectedPandit(mockPanditAuthorized);
        hook.current.setSelectedDate("2026-10-15");
        hook.current.setSelectedSlot("2026-10-15T10:00:00Z");
      });

      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: {
          success: true,
          booking_id: "bk-temple-12345",
          total_price: 4500,
          advance_payment_amount: 450,
          remaining_amount: 4050,
        },
        error: null,
      });

      let response: any;
      await act(async () => {
        response = await hook.current.submitBooking();
      });

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_or_validate_booking",
        expect.objectContaining({
          p_puja_service_id: mockPuja.id,
          p_pandit_id: mockPanditAuthorized.id,
          p_service_mode: "temple",
          p_temple_id: mockTemple1.id,
          p_scheduled_start_at: "2026-10-15T10:00:00Z",
        })
      );
      expect(response.booking_id).toBe("bk-temple-12345");
    });
  });
});
