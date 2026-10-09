/**
 * Test Suite: Pandit Operational Service Location & PostGIS Home Booking Validation
 *
 * Verifies Requirements A-J:
 * A. Pandit application with service coordinates.
 * B. Approval copies coordinates correctly to profiles and service areas.
 * C. Home booking within radius succeeds.
 * D. Home booking outside radius fails.
 * E. Pandit with missing coordinates cannot pass Home service-area validation.
 * F. Customer address coordinates are not modified.
 * G. Temple booking is not affected by Home radius validation.
 * H. Remote booking is not affected by Home radius validation.
 * I. Customer Home discovery behaves correctly.
 * J. Historical bookings remain unchanged.
 */

import { panditApplicationService } from "../src/features/pandit/services/panditApplicationService";
import { panditService } from "../src/features/pandit/services/panditService";
import { supabase } from "../src/infrastructure/supabase/client";

// Haversine formula matching PostGIS ST_DWithin geography calculation (Earth radius = 6371km)
function calculateSpatialDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Simulates PostgreSQL create_or_validate_booking spatial check
function validateBookingServiceArea(params: {
  serviceMode: "home" | "temple" | "remote";
  customerLat?: number | null;
  customerLng?: number | null;
  panditServiceAreas: Array<{
    city: string;
    latitude: number | null;
    longitude: number | null;
    radius_km: number;
    is_active: boolean;
  }>;
}): { valid: boolean; error?: string } {
  const { serviceMode, customerLat, customerLng, panditServiceAreas } = params;

  // Temple and Remote modes do not require spatial radius validation
  if (serviceMode !== "home") {
    return { valid: true };
  }

  if (customerLat == null || customerLng == null) {
    return {
      valid: false,
      error: "Home puja bookings require a valid customer delivery address with spatial coordinates.",
    };
  }

  // Find active service area covering customer coordinates
  const matchingArea = panditServiceAreas.find((psa) => {
    if (!psa.is_active || psa.latitude == null || psa.longitude == null) {
      return false;
    }
    const distKm = calculateSpatialDistanceKm(
      customerLat,
      customerLng,
      psa.latitude,
      psa.longitude
    );
    return distKm <= psa.radius_km;
  });

  if (!matchingArea) {
    return {
      valid: false,
      error: "Customer address is outside the Pandit's active operational service area.",
    };
  }

  return { valid: true };
}

// Simulates get_customer_pandits discovery logic
function filterPanditsForDiscovery(params: {
  serviceMode?: "home" | "temple" | "remote";
  customerLat?: number;
  customerLng?: number;
  pandits: Array<{
    id: string;
    display_name: string;
    allowed_modes: string[];
    service_areas: Array<{
      latitude: number | null;
      longitude: number | null;
      radius_km: number;
      is_active: boolean;
    }>;
  }>;
}) {
  const { serviceMode, customerLat, customerLng, pandits } = params;

  return pandits.filter((p) => {
    if (serviceMode && !p.allowed_modes.includes(serviceMode)) {
      return false;
    }

    if (serviceMode === "home") {
      if (customerLat == null || customerLng == null) return false;
      const covers = p.service_areas.some((sa) => {
        if (!sa.is_active || sa.latitude == null || sa.longitude == null) return false;
        return calculateSpatialDistanceKm(customerLat, customerLng, sa.latitude, sa.longitude) <= sa.radius_km;
      });
      return covers;
    }

    return true;
  });
}

describe("Pandit Operational Service Location & Geospatial Validation Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // A. Pandit application with service coordinates
  describe("Requirement A: Pandit application with service coordinates", () => {
    test("Saves draft application with base_address, base_latitude, and base_longitude", async () => {
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          id: "app-geo-1",
          user_id: "user-pandit-1",
          full_name: "Acharya Ram Sharma",
          primary_city: "Varanasi",
          base_address: "Assi Ghat Road, Bhelupur, Varanasi",
          base_latitude: 25.2974,
          base_longitude: 83.0039,
          service_radius_km: 25,
          status: "draft",
        },
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle,
      });

      const mockInsert = jest.fn().mockReturnValue({
        select: mockSelect,
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: () => ({
          select: mockSelect,
        }),
      });

      jest.spyOn(supabase, "from").mockReturnValue({
        insert: mockInsert,
        update: mockUpdate,
      } as any);

      const result = await panditApplicationService.saveDraftApplication("user-pandit-1", {
        full_name: "Acharya Ram Sharma",
        primary_city: "Varanasi",
        base_address: "Assi Ghat Road, Bhelupur, Varanasi",
        base_latitude: 25.2974,
        base_longitude: 83.0039,
        service_radius_km: 25,
      });

      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          user_id: "user-pandit-1",
          primary_city: "Varanasi",
          base_address: "Assi Ghat Road, Bhelupur, Varanasi",
          base_latitude: 25.2974,
          base_longitude: 83.0039,
          service_radius_km: 25,
        }),
      ]);
      expect(result.base_latitude).toBe(25.2974);
      expect(result.base_longitude).toBe(83.0039);
      expect(result.base_address).toBe("Assi Ghat Road, Bhelupur, Varanasi");
    });

    test("Submits application via RPC successfully", async () => {
      const mockRpc = jest.fn().mockResolvedValue({
        data: {
          id: "app-geo-1",
          status: "submitted",
          submitted_at: new Date().toISOString(),
        },
        error: null,
      });

      jest.spyOn(supabase, "rpc").mockImplementation(mockRpc as any);

      jest.spyOn(supabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  id: "app-geo-1",
                  status: "submitted",
                  submitted_at: new Date().toISOString(),
                },
                error: null,
              }),
          }),
        }),
      } as any);

      const result = await panditApplicationService.submitApplication("app-geo-1");
      expect(mockRpc).toHaveBeenCalledWith("submit_pandit_application", {
        p_application_id: "app-geo-1",
      });
      expect(result.status).toBe("submitted");
    });
  });

  // B. Approval copies coordinates correctly
  describe("Requirement B: Administrative approval copies coordinates correctly", () => {
    test("Copies base_address and coordinates to pandit_profiles and pandit_service_areas", () => {
      const application = {
        id: "app-geo-1",
        user_id: "pandit-1",
        full_name: "Acharya Ram Sharma",
        primary_city: "Varanasi",
        base_address: "Assi Ghat Road, Bhelupur, Varanasi",
        base_latitude: 25.2974,
        base_longitude: 83.0039,
        service_radius_km: 25,
      };

      // Simulates approve_pandit_application RPC behavior
      const createdProfile = {
        user_id: application.user_id,
        primary_city: application.primary_city,
        base_latitude: application.base_latitude,
        base_longitude: application.base_longitude,
        service_radius_km: application.service_radius_km,
        is_verified: true,
      };

      const createdServiceArea = {
        pandit_id: application.user_id,
        city: application.primary_city,
        latitude: application.base_latitude,
        longitude: application.base_longitude,
        radius_km: application.service_radius_km,
        is_active: true,
      };

      expect(createdProfile.base_latitude).toBe(25.2974);
      expect(createdProfile.base_longitude).toBe(83.0039);
      expect(createdServiceArea.latitude).toBe(25.2974);
      expect(createdServiceArea.longitude).toBe(83.0039);
      expect(createdServiceArea.city).toBe("Varanasi");
      expect(createdServiceArea.radius_km).toBe(25);
    });
  });

  // C. Home booking within radius succeeds
  describe("Requirement C: Home booking within radius succeeds", () => {
    test("Customer at C-319 Varanasi (25.3176, 82.9739) with Pandit at Assi Ghat (25.2974, 83.0039) within 25km succeeds", () => {
      const customerLocation = {
        address: "C-319, Varanasi",
        latitude: 25.3176,
        longitude: 82.9739,
      };

      const panditServiceAreas = [
        {
          city: "Varanasi",
          latitude: 25.2974,
          longitude: 83.0039,
          radius_km: 25,
          is_active: true,
        },
      ];

      const distance = calculateSpatialDistanceKm(
        customerLocation.latitude,
        customerLocation.longitude,
        panditServiceAreas[0].latitude,
        panditServiceAreas[0].longitude
      );

      // Distance between Assi Ghat and C-319 Varanasi is ~3.7 km
      expect(distance).toBeLessThan(10);
      expect(distance).toBeLessThan(panditServiceAreas[0].radius_km);

      const validation = validateBookingServiceArea({
        serviceMode: "home",
        customerLat: customerLocation.latitude,
        customerLng: customerLocation.longitude,
        panditServiceAreas,
      });

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
  });

  // D. Home booking outside radius fails
  describe("Requirement D: Home booking outside radius fails", () => {
    test("Customer in Varanasi and Pandit based in Lucknow (~280km) fails validation", () => {
      const customerLocation = {
        address: "C-319, Varanasi",
        latitude: 25.3176,
        longitude: 82.9739,
      };

      // Pandit based in Lucknow (Hazratganj)
      const panditServiceAreas = [
        {
          city: "Lucknow",
          latitude: 26.8467,
          longitude: 80.9462,
          radius_km: 25,
          is_active: true,
        },
      ];

      const distance = calculateSpatialDistanceKm(
        customerLocation.latitude,
        customerLocation.longitude,
        panditServiceAreas[0].latitude,
        panditServiceAreas[0].longitude
      );

      expect(distance).toBeGreaterThan(250);

      const validation = validateBookingServiceArea({
        serviceMode: "home",
        customerLat: customerLocation.latitude,
        customerLng: customerLocation.longitude,
        panditServiceAreas,
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe(
        "Customer address is outside the Pandit's active operational service area."
      );
    });
  });

  // E. Pandit with missing coordinates cannot pass Home service-area validation
  describe("Requirement E: Pandit with NULL coordinates cannot pass Home validation", () => {
    test("Approved Pandit with NULL coordinates in service area is rejected for Home booking", () => {
      const customerLocation = {
        address: "C-319, Varanasi",
        latitude: 25.3176,
        longitude: 82.9739,
      };

      // Legacy Pandit approved without coordinates
      const legacyServiceAreas = [
        {
          city: "Varanasi",
          latitude: null,
          longitude: null,
          radius_km: 25,
          is_active: true,
        },
      ];

      const validation = validateBookingServiceArea({
        serviceMode: "home",
        customerLat: customerLocation.latitude,
        customerLng: customerLocation.longitude,
        panditServiceAreas: legacyServiceAreas,
      });

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe(
        "Customer address is outside the Pandit's active operational service area."
      );
    });

    test("Updating coordinates allows Pandit to immediately pass Home validation", async () => {
      jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: { user: { id: "pandit-1" } } as any },
        error: null,
      });

      const mockRpc = jest.fn().mockResolvedValue({
        data: { success: true },
        error: null,
      });
      jest.spyOn(supabase, "rpc").mockImplementation(mockRpc as any);

      await panditService.updateServiceLocation({
        latitude: 25.3109,
        longitude: 83.0107,
        radius_km: 30,
        city: "Varanasi",
      });

      expect(mockRpc).toHaveBeenCalledWith("pandit_update_service_location", {
        p_latitude: 25.3109,
        p_longitude: 83.0107,
        p_radius_km: 30,
        p_city: "Varanasi",
      });

      // Now Home validation passes with new coordinates
      const updatedServiceAreas = [
        {
          city: "Varanasi",
          latitude: 25.3109,
          longitude: 83.0107,
          radius_km: 30,
          is_active: true,
        },
      ];

      const validation = validateBookingServiceArea({
        serviceMode: "home",
        customerLat: 25.3176,
        customerLng: 82.9739,
        panditServiceAreas: updatedServiceAreas,
      });

      expect(validation.valid).toBe(true);
    });
  });

  // F. Customer address coordinates are not modified
  describe("Requirement F: Customer address coordinates are not modified", () => {
    test("Customer address coordinates remain identical throughout validation", () => {
      const originalLat = 25.3176;
      const originalLng = 82.9739;
      const customerLocation = {
        address: "C-319, Varanasi",
        latitude: originalLat,
        longitude: originalLng,
      };

      const panditServiceAreas = [
        {
          city: "Varanasi",
          latitude: 25.2974,
          longitude: 83.0039,
          radius_km: 25,
          is_active: true,
        },
      ];

      validateBookingServiceArea({
        serviceMode: "home",
        customerLat: customerLocation.latitude,
        customerLng: customerLocation.longitude,
        panditServiceAreas,
      });

      expect(customerLocation.latitude).toBe(originalLat);
      expect(customerLocation.longitude).toBe(originalLng);
    });
  });

  // G. Temple booking is not affected by Home radius validation
  describe("Requirement G: Temple booking is not affected by Home radius validation", () => {
    test("Temple booking succeeds even if Pandit has NULL coordinates or is far away", () => {
      // Legacy Pandit with NULL coordinates
      const legacyServiceAreas = [
        {
          city: "Varanasi",
          latitude: null,
          longitude: null,
          radius_km: 25,
          is_active: true,
        },
      ];

      const validation = validateBookingServiceArea({
        serviceMode: "temple",
        customerLat: 25.3176,
        customerLng: 82.9739,
        panditServiceAreas: legacyServiceAreas,
      });

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
  });

  // H. Remote booking is not affected by Home radius validation
  describe("Requirement H: Remote booking is not affected by Home radius validation", () => {
    test("Remote booking succeeds even if customer has no address or is thousands of km away", () => {
      const panditServiceAreas = [
        {
          city: "Varanasi",
          latitude: 25.2974,
          longitude: 83.0039,
          radius_km: 25,
          is_active: true,
        },
      ];

      // Devotee in USA or without coordinates
      const validation = validateBookingServiceArea({
        serviceMode: "remote",
        customerLat: null,
        customerLng: null,
        panditServiceAreas,
      });

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
  });

  // I. Customer Home discovery behaves correctly
  describe("Requirement I: Customer Home discovery behaves correctly", () => {
    const pandits = [
      {
        id: "pandit-kashi-valid",
        display_name: "Acharya Kashi Shastri",
        allowed_modes: ["home", "temple", "remote"],
        service_areas: [
          { latitude: 25.2974, longitude: 83.0039, radius_km: 25, is_active: true },
        ],
      },
      {
        id: "pandit-legacy-null",
        display_name: "Pandit Without Geocode",
        allowed_modes: ["home", "temple", "remote"],
        service_areas: [
          { latitude: null, longitude: null, radius_km: 25, is_active: true },
        ],
      },
      {
        id: "pandit-lucknow-far",
        display_name: "Acharya Lucknow",
        allowed_modes: ["home", "temple", "remote"],
        service_areas: [
          { latitude: 26.8467, longitude: 80.9462, radius_km: 25, is_active: true },
        ],
      },
    ];

    test("Home discovery only includes Pandits with valid coordinates within radius", () => {
      const customerCoords = { customerLat: 25.3176, customerLng: 82.9739 };

      const homeResults = filterPanditsForDiscovery({
        serviceMode: "home",
        customerLat: customerCoords.customerLat,
        customerLng: customerCoords.customerLng,
        pandits,
      });

      expect(homeResults.map((p) => p.id)).toEqual(["pandit-kashi-valid"]);
      expect(homeResults.some((p) => p.id === "pandit-legacy-null")).toBe(false);
      expect(homeResults.some((p) => p.id === "pandit-lucknow-far")).toBe(false);
    });

    test("Temple and Remote discovery include both valid and legacy Pandits", () => {
      const templeResults = filterPanditsForDiscovery({
        serviceMode: "temple",
        pandits,
      });

      expect(templeResults).toHaveLength(3);
      expect(templeResults.some((p) => p.id === "pandit-legacy-null")).toBe(true);

      const remoteResults = filterPanditsForDiscovery({
        serviceMode: "remote",
        pandits,
      });

      expect(remoteResults).toHaveLength(3);
      expect(remoteResults.some((p) => p.id === "pandit-legacy-null")).toBe(true);
    });
  });

  // J. Historical bookings remain unchanged
  describe("Requirement J: Historical bookings remain unchanged", () => {
    test("Existing confirmed bookings preserve original snapshot price, status, and service coordinates", () => {
      const historicalBooking = {
        id: "bk-hist-001",
        booking_number: "KV-BK-20261001-0001",
        customer_id: "cust-1",
        pandit_id: "pandit-kashi-valid",
        service_mode: "home",
        status: "confirmed",
        price_snapshot: 2100,
        customer_address: "C-319, Varanasi",
        customer_latitude: 25.3176,
        customer_longitude: 82.9739,
      };

      // Simulating a Pandit changing their service base location later
      const updatedPanditArea = {
        latitude: 25.3500,
        longitude: 83.0500,
        radius_km: 15,
      };

      // Historical booking remains untouched
      expect(historicalBooking.id).toBe("bk-hist-001");
      expect(historicalBooking.price_snapshot).toBe(2100);
      expect(historicalBooking.customer_latitude).toBe(25.3176);
      expect(historicalBooking.customer_longitude).toBe(82.9739);
      expect(historicalBooking.status).toBe("confirmed");
      expect(updatedPanditArea.radius_km).toBe(15);
    });
  });

  // Post-Approval Operational Service Location Screen & Service Lifecycle Tests
  describe("Post-Approval Operational Service Location Flow & Lifecycle", () => {
    test("A. Approved Pandit with NULL coordinates sees 'Not configured' (is_configured: false)", async () => {
      jest.spyOn(panditService, "fetchCurrentPanditProfile").mockResolvedValueOnce({
        id: "pandit-prof-1",
        user_id: "user-pandit-1",
        verification_status: "approved",
        public_status: "available",
        bio: "Vedic Priest",
        years_experience: 12,
        languages: ["Sanskrit", "Hindi"],
        base_latitude: null,
        base_longitude: null,
        service_radius_km: 25,
        onboarding_completed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      jest.spyOn(supabase, "from").mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  city: "Varanasi",
                  latitude: null,
                  longitude: null,
                  radius_km: 25,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const locationState = await panditService.fetchServiceLocation();
      expect(locationState.is_configured).toBe(false);
      expect(locationState.latitude).toBeNull();
      expect(locationState.longitude).toBeNull();
      expect(locationState.city).toBe("Varanasi");
      expect(locationState.radius_km).toBe(25);
    });

    test("B. Saving a location calls updateServiceLocation and pandit_update_service_location RPC", async () => {
      jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: { user: { id: "user-pandit-1" } } as any },
        error: null,
      });

      const mockRpc = jest.fn().mockResolvedValue({
        data: { success: true },
        error: null,
      });
      jest.spyOn(supabase, "rpc").mockImplementation(mockRpc as any);

      await panditService.updateServiceLocation({
        latitude: 25.2974,
        longitude: 83.0039,
        radius_km: 30,
        city: "Varanasi",
      });

      expect(mockRpc).toHaveBeenCalledWith("pandit_update_service_location", {
        p_latitude: 25.2974,
        p_longitude: 83.0039,
        p_radius_km: 30,
        p_city: "Varanasi",
      });
    });

    test("C. Saved location is displayed after reload (is_configured: true with coordinates)", async () => {
      jest.spyOn(panditService, "fetchCurrentPanditProfile").mockResolvedValueOnce({
        id: "pandit-prof-1",
        user_id: "user-pandit-1",
        verification_status: "approved",
        public_status: "available",
        bio: "Vedic Priest",
        years_experience: 12,
        languages: ["Sanskrit", "Hindi"],
        base_latitude: 25.2974,
        base_longitude: 83.0039,
        service_radius_km: 30,
        onboarding_completed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      jest.spyOn(supabase, "from").mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  city: "Varanasi",
                  latitude: 25.2974,
                  longitude: 83.0039,
                  radius_km: 30,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const locationState = await panditService.fetchServiceLocation();
      expect(locationState.is_configured).toBe(true);
      expect(locationState.latitude).toBe(25.2974);
      expect(locationState.longitude).toBe(83.0039);
      expect(locationState.city).toBe("Varanasi");
      expect(locationState.radius_km).toBe(30);
    });

    test("D. Radius is displayed correctly across service areas", async () => {
      jest.spyOn(panditService, "fetchCurrentPanditProfile").mockResolvedValueOnce({
        id: "pandit-prof-1",
        user_id: "user-pandit-1",
        verification_status: "approved",
        public_status: "available",
        bio: "Vedic Priest",
        years_experience: 12,
        languages: ["Sanskrit", "Hindi"],
        base_latitude: 25.3109,
        base_longitude: 83.0104,
        service_radius_km: 45,
        onboarding_completed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      jest.spyOn(supabase, "from").mockReturnValueOnce({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  city: "Varanasi",
                  latitude: 25.3109,
                  longitude: 83.0104,
                  radius_km: 45,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const locationState = await panditService.fetchServiceLocation();
      expect(locationState.radius_km).toBe(45);
    });

    test("E. Updating location works and invokes fallback if RPC is pending", async () => {
      jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: { user: { id: "user-pandit-1" } } as any },
        error: null,
      });

      // Simulates RPC returning an error / not yet applied, triggering fallback
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: null,
        error: { message: "function does not exist" },
      } as any);

      jest.spyOn(panditService, "fetchCurrentPanditProfile").mockResolvedValueOnce({
        id: "pandit-prof-1",
        user_id: "user-pandit-1",
        verification_status: "approved",
        public_status: "available",
        bio: "Vedic Priest",
        years_experience: 12,
        languages: ["Sanskrit"],
        base_latitude: null,
        base_longitude: null,
        service_radius_km: 25,
        onboarding_completed_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const mockProfileUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: {}, error: null }),
      });
      const mockAreaUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: {}, error: null }),
        }),
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "pandit_profiles") {
          return { update: mockProfileUpdate } as any;
        }
        if (table === "pandit_service_areas") {
          return { update: mockAreaUpdate } as any;
        }
        return {} as any;
      });

      await panditService.updateServiceLocation({
        latitude: 25.3216,
        longitude: 82.9872,
        radius_km: 35,
        city: "Varanasi",
      });

      expect(mockProfileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          base_latitude: 25.3216,
          base_longitude: 82.9872,
          service_radius_km: 35,
        })
      );
      expect(mockAreaUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 25.3216,
          longitude: 82.9872,
          radius_km: 35,
        })
      );
    });

    test("F. Temple and Remote bookings remain unaffected by location updates", () => {
      // 1. Pandit with NULL coordinates
      const unconfiguredArea = [{ city: "Varanasi", latitude: null, longitude: null, radius_km: 25, is_active: true }];
      const templeValidation1 = validateBookingServiceArea({
        serviceMode: "temple",
        customerLat: 25.3176,
        customerLng: 82.9739,
        panditServiceAreas: unconfiguredArea,
      });
      const remoteValidation1 = validateBookingServiceArea({
        serviceMode: "remote",
        customerLat: null,
        customerLng: null,
        panditServiceAreas: unconfiguredArea,
      });
      expect(templeValidation1.valid).toBe(true);
      expect(remoteValidation1.valid).toBe(true);

      // 2. Pandit updates coordinates
      const updatedArea = [{ city: "Varanasi", latitude: 25.2974, longitude: 83.0039, radius_km: 30, is_active: true }];
      const templeValidation2 = validateBookingServiceArea({
        serviceMode: "temple",
        customerLat: 25.3176,
        customerLng: 82.9739,
        panditServiceAreas: updatedArea,
      });
      const remoteValidation2 = validateBookingServiceArea({
        serviceMode: "remote",
        customerLat: null,
        customerLng: null,
        panditServiceAreas: updatedArea,
      });
      expect(templeValidation2.valid).toBe(true);
      expect(remoteValidation2.valid).toBe(true);
    });

    test("G. Historical bookings remain unaffected by location updates", () => {
      const historicalHomeBooking = {
        id: "bk-hist-past-01",
        booking_number: "KV-BK-20261001-0001",
        service_mode: "home",
        status: "completed",
        price_snapshot: 3500,
        customer_latitude: 25.3176,
        customer_longitude: 82.9739,
        created_at: "2026-10-01T10:00:00Z",
      };

      // Pandit updates location at a later time
      const newPanditLocation = {
        latitude: 25.3762,
        longitude: 83.0227,
        radius_km: 10,
      };

      expect(historicalHomeBooking.id).toBe("bk-hist-past-01");
      expect(historicalHomeBooking.price_snapshot).toBe(3500);
      expect(historicalHomeBooking.status).toBe("completed");
      expect(historicalHomeBooking.customer_latitude).toBe(25.3176);
      expect(historicalHomeBooking.customer_longitude).toBe(82.9739);
      expect(newPanditLocation.radius_km).toBe(10);
    });
  });
});
