// __tests__/remote_puja_samagri_restriction.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { SamagriSelector } from "../src/features/booking/components/SamagriSelector.tsx";
import { PrasadSelector } from "../src/features/booking/components/PrasadSelector.tsx";
import { BookingPriceBreakdown } from "../src/features/booking/components/BookingPriceBreakdown.tsx";
import { useBookingFlow } from "../src/features/booking/hooks/useBookingFlow.ts";
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import {
  PanditSummary,
  PujaService,
  SamagriItem,
  SamagriPackage,
  ServiceMode,
} from "../src/features/discovery/types/discovery.ts";
import { PrasadItem } from "../src/features/booking/types/booking.types.ts";

describe("Remote Puja Samagri Restriction Test Suite", () => {
  const mockPuja: PujaService = {
    id: "puja-rudra-1",
    category_id: "cat-shiva",
    name: "Kashi Rudrabhishek",
    description: "Sacred Vedic Shiva Rudrabhishek in Varanasi",
    default_duration_minutes: 60,
    is_active: true,
    starting_price: 2100,
    allowed_modes: ["home", "temple", "remote"],
    created_at: "2026-01-01T00:00:00.000Z",
  };

  const mockPandit: PanditSummary = {
    id: "pandit-1",
    user_id: "user-pandit-1",
    display_name: "Acharya Ram Shastri",
    avatar_url: null,
    bio: "Vedic Scholar",
    is_verified: true,
    public_status: "available",
    rating_avg: 4.9,
    rating_count: 120,
    offering_names: ["Kashi Rudrabhishek"],
    puja_price: 2100,
    home_price: 2500,
    temple_price: 2100,
    remote_price: 1800,
    distance_km: null,
    kundli_enabled: true,
    kundli_price: 500,
    years_experience: 15,
    languages: ["Sanskrit", "Hindi"],
  } as any;

  const mockPackages: SamagriPackage[] = [
    {
      id: "pkg-std-1",
      puja_service_id: "puja-rudra-1",
      name: "Complete Rudrabhishek Kit",
      description: "Complete ritual samagri",
      is_active: true,
      items: [
        {
          quantity: 1,
          item: {
            id: "item-ghee-1",
            name: "Gir Cow Ghee",
            description: "Pure cow ghee",
            unit: "kg",
            unit_price: 600,
            is_active: true,
          },
        },
        {
          quantity: 2,
          item: {
            id: "item-gangajal-1",
            name: "Brahmakund Gangajal",
            description: "Sacred Ganga water",
            unit: "litre",
            unit_price: 150,
            is_active: true,
          },
        },
      ],
    },
  ];

  const mockCustomCatalog: SamagriItem[] = [
    {
      id: "item-belpatra-1",
      name: "Fresh Bilva Patra (108 pcs)",
      description: "108 Bilva leaves",
      unit: "pack",
      unit_price: 108,
      is_active: true,
    },
    {
      id: "item-dhatura-1",
      name: "Sacred Dhatura Flowers",
      description: "Dhatura flowers for Lord Shiva",
      unit: "pack",
      unit_price: 75,
      is_active: true,
    },
  ];

  const mockPrasadCatalog: PrasadItem[] = [
    {
      id: "prasad-peda-1",
      name: "Kashi Vishwanath Dry Peda Prasad",
      description: "Blessed peda from sanctum sanctorum",
      unit_price: 350,
      is_active: true,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. UI Rendering & Mode Visibility Rules
  // =========================================================================
  describe("1. Mobile Booking UI & Visibility Rules", () => {
    test("1. Home Puja displays all three Samagri options (Ritual Package, Custom Items, Devotee Arranged)", () => {
      let currentType: "none" | "package" | "custom" = "package";
      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <SamagriSelector
            serviceMode="home"
            samagriType={currentType}
            onSelectSamagriType={(t) => {
              currentType = t;
            }}
            packages={mockPackages}
            selectedPackage={mockPackages[0]}
            onSelectPackage={() => {}}
            customCatalog={mockCustomCatalog}
            customSelections={[]}
            onUpdateCustomQty={() => {}}
          />
        );
      });

      const str = JSON.stringify(renderer!.toJSON());
      expect(str).toContain("Sacred Samagri Options");
      expect(str).toContain("Ritual Package");
      expect(str).toContain("Custom Items");
      expect(str).toContain("Devotee Arranged");
      expect(str).toContain("Complete Rudrabhishek Kit");
    });

    test("2. Temple Puja displays all three Samagri options (Ritual Package, Custom Items, Devotee Arranged)", () => {
      let currentType: "none" | "package" | "custom" = "custom";
      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <SamagriSelector
            serviceMode="temple"
            samagriType={currentType}
            onSelectSamagriType={(t) => {
              currentType = t;
            }}
            packages={mockPackages}
            selectedPackage={null}
            onSelectPackage={() => {}}
            customCatalog={mockCustomCatalog}
            customSelections={[{ item: mockCustomCatalog[0], quantity: 2 }]}
            onUpdateCustomQty={() => {}}
          />
        );
      });

      const str = JSON.stringify(renderer!.toJSON());
      expect(str).toContain("Sacred Samagri Options");
      expect(str).toContain("Ritual Package");
      expect(str).toContain("Custom Items");
      expect(str).toContain("Devotee Arranged");
      expect(str).toContain("Fresh Bilva Patra");
    });

    test("3. Remote Puja completely hides the Samagri selection section (returns null)", () => {
      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <SamagriSelector
            serviceMode="remote"
            samagriType="none"
            onSelectSamagriType={() => {}}
            packages={mockPackages}
            selectedPackage={mockPackages[0]}
            onSelectPackage={() => {}}
            customCatalog={mockCustomCatalog}
            customSelections={[]}
            onUpdateCustomQty={() => {}}
          />
        );
      });

      expect(renderer!.toJSON()).toBeNull();
    });

    test("3b. Remote Puja completely hides the optional Blessed Prasad selector (returns null)", () => {
      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <PrasadSelector
            serviceMode="remote"
            prasadCatalog={mockPrasadCatalog}
            prasadSelections={[{ item: mockPrasadCatalog[0], quantity: 1 }]}
            onUpdatePrasadQty={() => {}}
          />
        );
      });

      expect(renderer!.toJSON()).toBeNull();
    });

    test("3c. Home and Temple Puja display the optional Blessed Prasad selector", () => {
      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <PrasadSelector
            serviceMode="home"
            prasadCatalog={mockPrasadCatalog}
            prasadSelections={[]}
            onUpdatePrasadQty={() => {}}
          />
        );
      });

      const str = JSON.stringify(renderer!.toJSON());
      expect(str).toContain("Optional Blessed Prasad");
      expect(str).toContain("Kashi Vishwanath Dry Peda Prasad");
    });
  });

  // =========================================================================
  // 2. Hook State Management & Mode Switching
  // =========================================================================
  describe("2. useBookingFlow State Management & Mode Switching", () => {
    function HookTestComponent({
      initialMode,
      onReady,
    }: {
      initialMode?: ServiceMode;
      onReady: (hook: ReturnType<typeof useBookingFlow>) => void;
    }) {
      const hook = useBookingFlow({
        initialPuja: mockPuja,
        initialPandit: mockPandit,
        initialMode: initialMode || "home",
      });
      React.useEffect(() => {
        onReady(hook);
      });
      return null;
    }

    test("4. Remote Puja initializes with samagriType 'none', null package, and empty prasad", () => {
      let flow: any;
      act(() => {
        ReactTestRenderer.create(
          <HookTestComponent
            initialMode="remote"
            onReady={(h) => {
              flow = h;
            }}
          />
        );
      });

      expect(flow.serviceMode).toBe("remote");
      expect(flow.samagriType).toBe("none");
      expect(flow.selectedPackage).toBeNull();
      expect(flow.customSamagri).toEqual([]);
      expect(flow.prasadSelections).toEqual([]);
      expect(flow.estimatedPricing.samagriTotal).toBe(0);
      expect(flow.estimatedPricing.prasadTotal).toBe(0);
      // Remote: Dakshina is 1800, 50% advance = 900
      expect(flow.estimatedPricing.basePrice).toBe(1800);
      expect(flow.estimatedPricing.total).toBe(1800);
      expect(flow.estimatedPricing.advanceAmount).toBe(900);
    });

    test("5. Switching from Home/Temple to Remote resets and clears stale Samagri and Prasad selections", () => {
      let flow: any;
      act(() => {
        ReactTestRenderer.create(
          <HookTestComponent
            initialMode="home"
            onReady={(h) => {
              flow = h;
            }}
          />
        );
      });

      // Initially home with package selection and prasad
      act(() => {
        flow.setSelectedPackage(mockPackages[0]);
        flow.updateCustomSamagriQty(mockCustomCatalog[0], 2);
        flow.updatePrasadQty(mockPrasadCatalog[0], 2);
      });

      expect(flow.selectedPackage).not.toBeNull();
      expect(flow.customSamagri.length).toBe(1);
      expect(flow.prasadSelections.length).toBe(1);

      // Switch to Remote mode
      act(() => {
        flow.setServiceMode("remote");
      });

      expect(flow.serviceMode).toBe("remote");
      expect(flow.samagriType).toBe("none");
      expect(flow.selectedPackage).toBeNull();
      expect(flow.customSamagri).toEqual([]);
      expect(flow.prasadSelections).toEqual([]);
      expect(flow.estimatedPricing.samagriTotal).toBe(0);
      expect(flow.estimatedPricing.prasadTotal).toBe(0);
    });

    test("6. Switching back from Remote to Home allows selecting Samagri and Prasad again without regressions", () => {
      let flow: any;
      act(() => {
        ReactTestRenderer.create(
          <HookTestComponent
            initialMode="remote"
            onReady={(h) => {
              flow = h;
            }}
          />
        );
      });

      expect(flow.serviceMode).toBe("remote");

      // Switch to Home mode
      act(() => {
        flow.setServiceMode("home");
        flow.setSelectedPandit(mockPandit);
        flow.setSamagriType("package");
        flow.setSelectedPackage(mockPackages[0]);
        flow.updatePrasadQty(mockPrasadCatalog[0], 1);
      });

      expect(flow.serviceMode).toBe("home");
      expect(flow.samagriType).toBe("package");
      expect(flow.selectedPackage?.id).toBe("pkg-std-1");
      expect(flow.prasadSelections.length).toBe(1);
      // Home basePrice (2500) + Package total (600 + 2*150 = 900) + Prasad (350) = 3750
      expect(flow.estimatedPricing.samagriTotal).toBe(900);
      expect(flow.estimatedPricing.prasadTotal).toBe(350);
      expect(flow.estimatedPricing.total).toBe(3750);
      // Home advance: 10% of 2500 (250) + 100% of 900 (900) + 100% of 350 (350) = 1500
      expect(flow.estimatedPricing.advanceAmount).toBe(1500);
    });

    test("7. Remote Puja booking totals contain zero Samagri or Prasad charges", () => {
      let flow: any;
      act(() => {
        ReactTestRenderer.create(
          <HookTestComponent
            initialMode="remote"
            onReady={(h) => {
              flow = h;
            }}
          />
        );
      });

      expect(flow.estimatedPricing.samagriTotal).toBe(0);
      expect(flow.estimatedPricing.prasadTotal).toBe(0);
      // Remote: Dakshina 1800 (50% adv = 900), no add-ons
      expect(flow.estimatedPricing.total).toBe(1800);
      expect(flow.estimatedPricing.advanceAmount).toBe(900);
      expect(flow.estimatedPricing.balanceAmount).toBe(900);
    });

    test("8. submitBooking guarantees null Samagri and null Prasad IDs for Remote Puja", async () => {
      const createBookingSpy = jest.spyOn(bookingService, "createOrValidateBooking").mockResolvedValue({
        booking_id: "bk-remote-1",
        booking_number: "KV-BK-20261010-REMOTE",
        status: "payment_pending",
        puja_price: 1800,
        samagri_total: 0,
        prasad_total: 0,
        advance_amount: 900,
        balance_amount: 900,
        total_amount: 1800,
        payment_order_id: "po-remote-1",
        scheduled_start_at: "2026-10-10T10:00:00+05:30",
        scheduled_end_at: "2026-10-10T11:00:00+05:30",
      });

      let flow: any;
      act(() => {
        ReactTestRenderer.create(
          <HookTestComponent
            initialMode="remote"
            onReady={(h) => {
              flow = h;
            }}
          />
        );
      });

      act(() => {
        flow.setSelectedSlot("2026-10-10T10:00:00+05:30");
      });

      await act(async () => {
        await flow.submitBooking(mockPuja.id);
      });

      expect(createBookingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pandit_id: mockPandit.id,
          puja_service_id: mockPuja.id,
          service_mode: "remote",
          samagri_package_id: null,
          custom_samagri_item_ids: null,
          custom_samagri_quantities: null,
          prasad_item_ids: null,
          prasad_quantities: null,
        })
      );
    });
  });

  // =========================================================================
  // 3. Price Breakdown Component Presentation
  // =========================================================================
  describe("3. Price Breakdown UI Presentation", () => {
    test("9. BookingPriceBreakdown omits Samagri and Prasad line items when totals are 0", () => {
      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <BookingPriceBreakdown
            pujaPrice={1800}
            samagriTotal={0}
            prasadTotal={0}
            totalAmount={1800}
            advanceAmount={900}
            balanceAmount={900}
            serviceMode="remote"
          />
        );
      });

      const str = JSON.stringify(renderer!.toJSON());
      expect(str).toContain("Puja Ritual Dakshina");
      expect(str).not.toContain("Sacred Samagri");
      expect(str).not.toContain("Blessed Prasad");
      expect(str).toContain("50% of Ritual");
    });
  });

  // =========================================================================
  // 4. Authoritative Backend RPC Validation Logic Simulation (Migration 041)
  // =========================================================================
  describe("4. Authoritative Backend RPC Validation (Migration 041)", () => {
    /**
     * Exact TypeScript translation of Sections 9 & 10 of create_or_validate_booking RPC
     * in supabase/migrations/041_restrict_remote_puja_samagri.sql
     */
    function simulateRpcSection9And10Validation(params: {
      service_mode: ServiceMode;
      samagri_package_id?: string | null;
      custom_samagri_item_ids?: string[] | null;
      custom_samagri_quantities?: number[] | null;
      prasad_item_ids?: string[] | null;
      prasad_quantities?: number[] | null;
    }) {
      const {
        service_mode,
        samagri_package_id,
        custom_samagri_item_ids,
        custom_samagri_quantities,
        prasad_item_ids,
        prasad_quantities,
      } = params;

      let samagri_total = 0;
      let prasad_total = 0;

      // Section 9: Samagri validation
      if (service_mode === "remote") {
        if (
          samagri_package_id != null ||
          (custom_samagri_item_ids != null && custom_samagri_item_ids.length > 0)
        ) {
          throw new Error("Samagri selections are not permitted for Remote Puja bookings.");
        }
      } else if (samagri_package_id != null) {
        const pkg = mockPackages.find((p) => p.id === samagri_package_id && p.is_active);
        if (!pkg) {
          throw new Error("Selected Samagri Package does not exist for this Puja service.");
        }
        samagri_total = (pkg.items || []).reduce(
          (sum, pi) => sum + pi.quantity * (pi.item.unit_price || 0),
          0
        );
      } else if (custom_samagri_item_ids != null && custom_samagri_item_ids.length > 0) {
        if (
          !custom_samagri_quantities ||
          custom_samagri_quantities.length !== custom_samagri_item_ids.length
        ) {
          throw new Error("Mismatch between custom Samagri item IDs and quantities array length.");
        }
        for (let i = 0; i < custom_samagri_item_ids.length; i++) {
          const qty = custom_samagri_quantities[i];
          if (qty <= 0) {
            throw new Error("Quantity for Samagri item must be strictly greater than zero.");
          }
          const item = mockCustomCatalog.find(
            (it) => it.id === custom_samagri_item_ids[i] && it.is_active
          );
          if (!item) {
            throw new Error(`Samagri item ${custom_samagri_item_ids[i]} is inactive or does not exist.`);
          }
          samagri_total += Math.round(qty * item.unit_price * 100) / 100;
        }
      }

      // Section 10: Prasad validation
      if (service_mode === "remote") {
        if (prasad_item_ids != null && prasad_item_ids.length > 0) {
          throw new Error("Prasad selections are not permitted for Remote Puja bookings.");
        }
      } else if (prasad_item_ids != null && prasad_item_ids.length > 0) {
        if (
          !prasad_quantities ||
          prasad_quantities.length !== prasad_item_ids.length
        ) {
          throw new Error("Mismatch between Prasad item IDs and quantities array length.");
        }
        for (let i = 0; i < prasad_item_ids.length; i++) {
          const qty = prasad_quantities[i];
          if (qty <= 0) {
            throw new Error("Quantity for Prasad item must be strictly greater than zero.");
          }
          const item = mockPrasadCatalog.find(
            (it) => it.id === prasad_item_ids[i] && it.is_active
          );
          if (!item) {
            throw new Error(`Prasad item ${prasad_item_ids[i]} is inactive or does not exist.`);
          }
          prasad_total += Math.round(qty * item.unit_price * 100) / 100;
        }
      }

      return { samagri_total, prasad_total };
    }

    test("10. Backend RPC rejects Remote Puja request with Samagri package", () => {
      expect(() => {
        simulateRpcSection9And10Validation({
          service_mode: "remote",
          samagri_package_id: "pkg-std-1",
        });
      }).toThrow("Samagri selections are not permitted for Remote Puja bookings.");
    });

    test("11. Backend RPC rejects Remote Puja request with custom Samagri items", () => {
      expect(() => {
        simulateRpcSection9And10Validation({
          service_mode: "remote",
          custom_samagri_item_ids: ["item-belpatra-1"],
          custom_samagri_quantities: [2],
        });
      }).toThrow("Samagri selections are not permitted for Remote Puja bookings.");
    });

    test("12. Backend RPC rejects Remote Puja request with Prasad items", () => {
      expect(() => {
        simulateRpcSection9And10Validation({
          service_mode: "remote",
          prasad_item_ids: ["prasad-peda-1"],
          prasad_quantities: [1],
        });
      }).toThrow("Prasad selections are not permitted for Remote Puja bookings.");
    });

    test("13. Backend RPC accepts Remote Puja request with null Samagri and null Prasad", () => {
      const res = simulateRpcSection9And10Validation({
        service_mode: "remote",
        samagri_package_id: null,
        custom_samagri_item_ids: null,
        custom_samagri_quantities: null,
        prasad_item_ids: null,
        prasad_quantities: null,
      });

      expect(res.samagri_total).toBe(0);
      expect(res.prasad_total).toBe(0);
    });

    test("14. Backend RPC accepts Home & Temple Puja requests with valid Samagri and Prasad items", () => {
      // Home with package and prasad
      const homeRes = simulateRpcSection9And10Validation({
        service_mode: "home",
        samagri_package_id: "pkg-std-1",
        prasad_item_ids: ["prasad-peda-1"],
        prasad_quantities: [1],
      });
      expect(homeRes.samagri_total).toBe(900);
      expect(homeRes.prasad_total).toBe(350);

      // Temple with custom items and prasad
      const templeRes = simulateRpcSection9And10Validation({
        service_mode: "temple",
        custom_samagri_item_ids: ["item-belpatra-1", "item-dhatura-1"],
        custom_samagri_quantities: [1, 2],
        prasad_item_ids: ["prasad-peda-1"],
        prasad_quantities: [2],
      });
      // 108*1 + 75*2 = 258, prasad = 350*2 = 700
      expect(templeRes.samagri_total).toBe(258);
      expect(templeRes.prasad_total).toBe(700);
    });
  });
});
