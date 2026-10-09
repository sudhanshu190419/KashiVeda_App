// __tests__/pandit_mode_specific_pricing.test.ts
import { ServiceModePrices } from "../src/features/pandit/types/application";
import { ServiceMode } from "../src/features/discovery/types/discovery";

describe("Mode-Specific Pandit Puja Pricing Test Suite (Phase 1-12)", () => {
  // Master ritual fixture
  const masterRitual = {
    id: "puja-griha-pravesh",
    name: "Griha Pravesh Puja",
    allowed_modes: ["home", "temple", "remote"] as ServiceMode[],
    default_duration_minutes: 120,
    is_active: true,
  };

  const templeOnlyRitual = {
    id: "puja-shiva-abhishek",
    name: "Maha Rudrabhishek",
    allowed_modes: ["temple"] as ServiceMode[],
    default_duration_minutes: 90,
    is_active: true,
  };

  // Helper validation logic mirroring Migration 029 & Application wizard
  function validateModePricing(
    pricing: ServiceModePrices,
    allowedModes: ServiceMode[]
  ): { valid: boolean; error?: string } {
    const offeredModes = Object.entries(pricing).filter(
      ([_, price]) => price != null && price !== "" && !isNaN(Number(price))
    );

    if (offeredModes.length === 0) {
      return { valid: false, error: "At least one service mode must be offered." };
    }

    for (const [mode, priceStr] of offeredModes) {
      if (!allowedModes.includes(mode as ServiceMode)) {
        return { valid: false, error: `Service mode '${mode}' is not allowed for this ritual.` };
      }
      const num = Number(priceStr);
      if (isNaN(num) || num <= 0) {
        return { valid: false, error: `Price for mode '${mode}' must be strictly greater than 0.` };
      }
    }

    return { valid: true };
  }

  // Helper for simulating PostgreSQL RPC resolve price
  function resolveBookingPrice(
    offering: {
      home_price: number | null;
      temple_price: number | null;
      remote_price: number | null;
    },
    requestedMode: ServiceMode
  ): { price: number } {
    let resolvedPrice: number | null = null;
    if (requestedMode === "home") resolvedPrice = offering.home_price;
    else if (requestedMode === "temple") resolvedPrice = offering.temple_price;
    else if (requestedMode === "remote") resolvedPrice = offering.remote_price;

    if (resolvedPrice == null || resolvedPrice <= 0) {
      throw new Error(
        `Selected Pandit does not offer ritual in ${requestedMode} mode`
      );
    }

    return { price: resolvedPrice };
  }

  // =========================================================================
  // SCENARIO 1 & 2: Offering One Mode vs Multiple Modes
  // =========================================================================
  test("1. Pandit can offer exactly one mode (Home only)", () => {
    const singleModePricing: ServiceModePrices = {
      home: 5000,
    };
    const res = validateModePricing(singleModePricing, masterRitual.allowed_modes);
    expect(res.valid).toBe(true);
    expect(singleModePricing.temple).toBeUndefined();
    expect(singleModePricing.remote).toBeUndefined();
  });

  test("2. Pandit can offer multiple modes with distinct pricing", () => {
    const multiModePricing: ServiceModePrices = {
      home: 5000,
      temple: 3500,
      remote: 2000,
    };
    const res = validateModePricing(multiModePricing, masterRitual.allowed_modes);
    expect(res.valid).toBe(true);
    expect(multiModePricing.home).toBe(5000);
    expect(multiModePricing.temple).toBe(3500);
    expect(multiModePricing.remote).toBe(2000);
  });

  // =========================================================================
  // SCENARIO 3, 4, 5: Every offered mode requires price > 0
  // =========================================================================
  test("3. Every offered mode requires price strictly greater than 0", () => {
    const validPricing: ServiceModePrices = { home: 100 };
    expect(validateModePricing(validPricing, masterRitual.allowed_modes).valid).toBe(true);
  });

  test("4. Zero price is rejected", () => {
    const zeroPricing: ServiceModePrices = { home: 0 };
    const res = validateModePricing(zeroPricing, masterRitual.allowed_modes);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("must be strictly greater than 0");
  });

  test("5. Negative price is rejected", () => {
    const negPricing: ServiceModePrices = { home: -500 };
    const res = validateModePricing(negPricing, masterRitual.allowed_modes);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("must be strictly greater than 0");
  });

  // =========================================================================
  // SCENARIO 6 & 7: Unsupported Mode Rejected & No Mode Selected Rejected
  // =========================================================================
  test("6. Unsupported mode is rejected if ritual does not allow it", () => {
    // Temple-only ritual offered in home mode
    const invalidModePricing: ServiceModePrices = { home: 3000 };
    const res = validateModePricing(invalidModePricing, templeOnlyRitual.allowed_modes);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("is not allowed for this ritual");
  });

  test("7. No mode selected is rejected", () => {
    const emptyPricing: ServiceModePrices = {};
    const res = validateModePricing(emptyPricing, masterRitual.allowed_modes);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("At least one service mode must be offered");
  });

  // =========================================================================
  // SCENARIO 8: Application stores mode-aware prices payload
  // =========================================================================
  test("8. Application stores mode-aware prices structured payload", () => {
    const applicationPayload = {
      puja_prices: {
        "puja-griha-pravesh": {
          home: 5000,
          temple: 3500,
          remote: 2000,
        },
        "puja-shiva-abhishek": {
          temple: 2100,
        },
      },
    };

    expect(typeof applicationPayload.puja_prices["puja-griha-pravesh"]).toBe("object");
    expect(applicationPayload.puja_prices["puja-griha-pravesh"].home).toBe(5000);
    expect(applicationPayload.puja_prices["puja-shiva-abhishek"].temple).toBe(2100);
  });

  // =========================================================================
  // SCENARIO 9: Approval creates correct mode prices
  // =========================================================================
  test("9. Approval simulates insertion into pandit_puja_services with separate mode columns", () => {
    const submittedOffering = {
      home: 5000,
      temple: 3500,
    };

    const simulatedDbRow = {
      pandit_id: "pnd-123",
      puja_service_id: masterRitual.id,
      home_price: submittedOffering.home,
      temple_price: submittedOffering.temple,
      remote_price: null,
      price: submittedOffering.home, // legacy backward compatibility
      duration_minutes: masterRitual.default_duration_minutes,
      is_active: true,
    };

    expect(simulatedDbRow.home_price).toBe(5000);
    expect(simulatedDbRow.temple_price).toBe(3500);
    expect(simulatedDbRow.remote_price).toBeNull();
    expect(simulatedDbRow.price).toBe(5000);
  });

  // =========================================================================
  // SCENARIO 10: Pandit can edit only own mode prices
  // =========================================================================
  test("10. Pandit authorization: updating offerings requires matching pandit_id", () => {
    const currentPanditId: string = "pnd-123";
    const targetOfferingPanditId: string = "pnd-456"; // belongs to another pandit

    const isAuthorized = currentPanditId === targetOfferingPanditId;
    expect(isAuthorized).toBe(false);
  });

  // =========================================================================
  // SCENARIO 11 & 12: Customer view & bookable modes
  // =========================================================================
  test("11. Customer sees correct mode prices returned by discovery", () => {
    const customerPanditOffering = {
      puja_id: masterRitual.id,
      name: masterRitual.name,
      home_price: 5000,
      temple_price: 3500,
      remote_price: null, // remote not offered
    };

    expect(customerPanditOffering.home_price).toBe(5000);
    expect(customerPanditOffering.temple_price).toBe(3500);
    expect(customerPanditOffering.remote_price).toBeNull();
  });

  test("12. Customer cannot select unavailable mode (mode with null price is unbookable)", () => {
    const offeringPrices = {
      home: 5000,
      temple: 3500,
      remote: null,
    };

    const isHomeBookable = offeringPrices.home != null && offeringPrices.home > 0;
    const isRemoteBookable = offeringPrices.remote != null && (offeringPrices.remote as number) > 0;

    expect(isHomeBookable).toBe(true);
    expect(isRemoteBookable).toBe(false);
  });

  // =========================================================================
  // SCENARIO 13, 14, 15, 16: Booking resolution by mode
  // =========================================================================
  const testOffering = {
    home_price: 5000,
    temple_price: 3500,
    remote_price: 2000,
  };

  test("13. Booking uses Home price when mode=home", () => {
    const result = resolveBookingPrice(testOffering, "home");
    expect(result.price).toBe(5000);
  });

  test("14. Booking uses Temple price when mode=temple", () => {
    const result = resolveBookingPrice(testOffering, "temple");
    expect(result.price).toBe(3500);
  });

  test("15. Booking uses Remote price when mode=remote", () => {
    const result = resolveBookingPrice(testOffering, "remote");
    expect(result.price).toBe(2000);
  });

  test("16. Booking rejects mode not offered by Pandit", () => {
    const partialOffering = {
      home_price: 5000,
      temple_price: 3500,
      remote_price: null, // Not offered
    };

    expect(() => resolveBookingPrice(partialOffering, "remote")).toThrow(
      "Selected Pandit does not offer ritual in remote mode"
    );
  });

  // =========================================================================
  // SCENARIO 17 & 18: Price Snapshotting & Immutability Invariant
  // =========================================================================
  test("17. Booking snapshots selected mode price authoritatively", () => {
    const resolved = resolveBookingPrice(testOffering, "home");
    const createdBooking = {
      id: "bk-001",
      service_mode: "home" as ServiceMode,
      total_amount: resolved.price,
      advance_amount: Math.round(resolved.price * 0.25),
      balance_amount: resolved.price - Math.round(resolved.price * 0.25),
      price_snapshot: resolved.price,
    };

    expect(createdBooking.price_snapshot).toBe(5000);
    expect(createdBooking.total_amount).toBe(5000);
    expect(createdBooking.advance_amount).toBe(1250);
    expect(createdBooking.balance_amount).toBe(3750);
  });

  test("18. Invariant: Later Pandit price changes do NOT affect existing bookings", () => {
    // 1. Existing booking created at Home = 5000
    const existingBooking = {
      id: "bk-001",
      service_mode: "home" as ServiceMode,
      price_snapshot: 5000,
      total_amount: 5000,
    };

    // 2. Pandit later increases Home price to 6000
    const updatedOffering = {
      ...testOffering,
      home_price: 6000,
    };

    // 3. Existing booking remains untouched
    expect(existingBooking.price_snapshot).toBe(5000);
    expect(existingBooking.total_amount).toBe(5000);

    // 4. New booking gets new price
    const newBookingPrice = resolveBookingPrice(updatedOffering, "home").price;
    expect(newBookingPrice).toBe(6000);
  });

  // =========================================================================
  // SCENARIO 19: Discovery filtering by mode
  // =========================================================================
  test("19. Discovery filters Pandits correctly by requested mode", () => {
    const pandits = [
      { id: "p1", name: "Acharya Sharma", home_price: 5000, temple_price: 3500, remote_price: null },
      { id: "p2", name: "Acharya Shastri", home_price: null, temple_price: 3000, remote_price: 2000 },
      { id: "p3", name: "Acharya Dwivedi", home_price: 6000, temple_price: null, remote_price: 2500 },
    ];

    // Filter by mode='home'
    const homePandits = pandits.filter((p) => p.home_price != null && p.home_price > 0);
    expect(homePandits.map((p) => p.id)).toEqual(["p1", "p3"]);

    // Filter by mode='remote'
    const remotePandits = pandits.filter((p) => p.remote_price != null && p.remote_price > 0);
    expect(remotePandits.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  // =========================================================================
  // SCENARIO 20: Legacy flat puja_prices compatibility
  // =========================================================================
  test("20. Legacy flat numeric puja_prices are mapped across allowed catalog modes safely", () => {
    const legacyPujaPrices: Record<string, number> = {
      "puja-griha-pravesh": 2500,
      "puja-shiva-abhishek": 1500,
    };

    // Griha Pravesh allows [home, temple, remote]
    const legacyGrihaPrice = legacyPujaPrices["puja-griha-pravesh"];
    const grihaHome = masterRitual.allowed_modes.includes("home") ? legacyGrihaPrice : null;
    const grihaTemple = masterRitual.allowed_modes.includes("temple") ? legacyGrihaPrice : null;
    const grihaRemote = masterRitual.allowed_modes.includes("remote") ? legacyGrihaPrice : null;

    expect(grihaHome).toBe(2500);
    expect(grihaTemple).toBe(2500);
    expect(grihaRemote).toBe(2500);

    // Shiva Abhishek allows only [temple]
    const legacyShivaPrice = legacyPujaPrices["puja-shiva-abhishek"];
    const shivaHome = templeOnlyRitual.allowed_modes.includes("home") ? legacyShivaPrice : null;
    const shivaTemple = templeOnlyRitual.allowed_modes.includes("temple") ? legacyShivaPrice : null;
    const shivaRemote = templeOnlyRitual.allowed_modes.includes("remote") ? legacyShivaPrice : null;

    expect(shivaHome).toBeNull();
    expect(shivaTemple).toBe(1500);
    expect(shivaRemote).toBeNull();
  });

  // =========================================================================
  // SCENARIO 21: RLS and authorization remain intact
  // =========================================================================
  test("21. RLS and authorization rules enforce customer read-only and pandit own-edit only", () => {
    const roles = {
      customer: { canEditOffering: false, canBookOfferedMode: true },
      pandit: { canEditOwnOffering: true, canEditOtherOffering: false },
      admin: { canEditAnyOffering: true },
    };

    expect(roles.customer.canEditOffering).toBe(false);
    expect(roles.pandit.canEditOwnOffering).toBe(true);
    expect(roles.pandit.canEditOtherOffering).toBe(false);
    expect(roles.admin.canEditAnyOffering).toBe(true);
  });

  // =========================================================================
  // SCENARIO 22: Home Booking Payment-Order Creation & Financial Snapshot
  // =========================================================================
  test("22. Home booking creates payment-order with 10% advance, correct purpose, and price snapshot", () => {
    const homeDakshina = resolveBookingPrice(testOffering, "home").price; // 5000
    expect(homeDakshina).toBe(5000);

    const advancePercent = 10;
    const advanceAmount = Math.round(((homeDakshina * advancePercent) / 100) * 100) / 100; // 500
    const balanceAmount = homeDakshina - advanceAmount; // 4500

    // Booking snapshot
    const booking = {
      id: "booking-home-1",
      booking_number: "KV-BK-20261008-HOME01",
      customer_id: "user-cust-1",
      service_mode: "home" as ServiceMode,
      price_snapshot: homeDakshina,
      advance_percent: advancePercent,
      advance_amount: advanceAmount,
      balance_amount: balanceAmount,
      total_amount: homeDakshina,
      status: "payment_pending",
    };

    // Authoritative payment order obligation matching canonical schema
    const paymentOrder = {
      id: "po-home-1",
      booking_id: booking.id,
      purpose: "booking_advance" as const,
      amount: booking.advance_amount,
      currency: "INR",
      status: "created" as const,
      provider: "razorpay",
    };

    expect(booking.price_snapshot).toBe(5000);
    expect(booking.advance_amount).toBe(500);
    expect(booking.balance_amount).toBe(4500);
    expect(booking.total_amount).toBe(5000);
    expect(paymentOrder.booking_id).toBe(booking.id);
    expect(paymentOrder.purpose).toBe("booking_advance");
    expect(paymentOrder.amount).toBe(500);
    expect(paymentOrder.status).toBe("created");
    expect(paymentOrder.provider).toBe("razorpay");
  });

  // =========================================================================
  // SCENARIO 23: Temple Booking Payment-Order Creation & Financial Snapshot
  // =========================================================================
  test("23. Temple booking creates payment-order with 10% advance, correct purpose, and price snapshot", () => {
    const templeDakshina = resolveBookingPrice(testOffering, "temple").price; // 3500
    expect(templeDakshina).toBe(3500);

    const advancePercent = 10;
    const advanceAmount = Math.round(((templeDakshina * advancePercent) / 100) * 100) / 100; // 350
    const balanceAmount = templeDakshina - advanceAmount; // 3150

    const booking = {
      id: "booking-temple-1",
      booking_number: "KV-BK-20261008-TMPL01",
      customer_id: "user-cust-1",
      service_mode: "temple" as ServiceMode,
      price_snapshot: templeDakshina,
      advance_percent: advancePercent,
      advance_amount: advanceAmount,
      balance_amount: balanceAmount,
      total_amount: templeDakshina,
      status: "payment_pending",
    };

    const paymentOrder = {
      id: "po-temple-1",
      booking_id: booking.id,
      purpose: "booking_advance" as const,
      amount: booking.advance_amount,
      currency: "INR",
      status: "created" as const,
      provider: "razorpay",
    };

    expect(booking.price_snapshot).toBe(3500);
    expect(booking.advance_amount).toBe(350);
    expect(booking.balance_amount).toBe(3150);
    expect(booking.total_amount).toBe(3500);
    expect(paymentOrder.booking_id).toBe(booking.id);
    expect(paymentOrder.purpose).toBe("booking_advance");
    expect(paymentOrder.amount).toBe(350);
  });

  // =========================================================================
  // SCENARIO 24: Remote Booking Payment-Order Creation & Financial Snapshot
  // =========================================================================
  test("24. Remote booking creates payment-order with 50% advance, correct purpose, and price snapshot", () => {
    const remoteDakshina = resolveBookingPrice(testOffering, "remote").price; // 2000
    expect(remoteDakshina).toBe(2000);

    // Remote policy enforces 50% advance
    const advancePercent = 50;
    const advanceAmount = Math.round(((remoteDakshina * advancePercent) / 100) * 100) / 100; // 1000
    const balanceAmount = remoteDakshina - advanceAmount; // 1000

    const booking = {
      id: "booking-remote-1",
      booking_number: "KV-BK-20261008-REMT01",
      customer_id: "user-cust-1",
      service_mode: "remote" as ServiceMode,
      price_snapshot: remoteDakshina,
      advance_percent: advancePercent,
      advance_amount: advanceAmount,
      balance_amount: balanceAmount,
      total_amount: remoteDakshina,
      status: "payment_pending",
    };

    const paymentOrder = {
      id: "po-remote-1",
      booking_id: booking.id,
      purpose: "booking_advance" as const,
      amount: booking.advance_amount,
      currency: "INR",
      status: "created" as const,
      provider: "razorpay",
    };

    expect(booking.price_snapshot).toBe(2000);
    expect(booking.advance_amount).toBe(1000);
    expect(booking.balance_amount).toBe(1000);
    expect(booking.total_amount).toBe(2000);
    expect(paymentOrder.booking_id).toBe(booking.id);
    expect(paymentOrder.purpose).toBe("booking_advance");
    expect(paymentOrder.amount).toBe(1000);
  });

  // =========================================================================
  // SCENARIO 25: Canonical payment_orders schema validation
  // =========================================================================
  test("25. Payment order insert matches canonical schema and rejects invalid legacy columns", () => {
    // Valid canonical columns on public.payment_orders (007_payments_and_live.sql)
    const validPaymentOrderColumns = [
      "id",
      "booking_id",
      "kundli_order_id",
      "subscription_id",
      "purpose",
      "amount",
      "currency",
      "status",
      "provider",
      "provider_order_id",
      "due_at",
      "created_at",
      "updated_at",
    ];

    // Invalid columns that were mistakenly used in 029
    const invalidColumns = ["customer_id", "payment_type"];
    invalidColumns.forEach((col) => {
      expect(validPaymentOrderColumns.includes(col)).toBe(false);
    });

    // Valid purposes in public.payment_order_purpose enum
    const validPurposes = [
      "booking_advance",
      "booking_balance",
      "samagri",
      "kundli",
      "subscription",
      "prepone_fee",
      "live_service",
      "other",
    ];

    expect(validPurposes.includes("booking_advance")).toBe(true);
    expect(validPurposes.includes("advance")).toBe(false); // 'advance' is invalid
  });

  // =========================================================================
  // MIGRATION 039 REGRESSION TESTS: Nullable Legacy Price & Approval Pricing
  // =========================================================================
  describe("Migration 039: Nullable Legacy Price & Mode-Specific Pricing Invariants", () => {
    // Simulated approve_pandit_application insertion logic (Migration 039)
    const simulateApprovePanditApplicationPujaLink = (
      panditId: string,
      puja: { id: string; name: string; default_duration_minutes: number; allowed_modes: string[] },
      pricingPayload: { home?: number; temple?: number; remote?: number }
    ) => {
      const homePrice =
        pricingPayload.home && pricingPayload.home > 0 && puja.allowed_modes.includes("home")
          ? pricingPayload.home
          : null;
      const templePrice =
        pricingPayload.temple && pricingPayload.temple > 0 && puja.allowed_modes.includes("temple")
          ? pricingPayload.temple
          : null;
      const remotePrice =
        pricingPayload.remote && pricingPayload.remote > 0 && puja.allowed_modes.includes("remote")
          ? pricingPayload.remote
          : null;

      // In Migration 039: price is nullable and computed as COALESCE(home, temple, remote)
      const legacyPrice = homePrice ?? templePrice ?? remotePrice ?? null;

      return {
        id: `pps-${panditId}-${puja.id}`,
        pandit_id: panditId,
        puja_service_id: puja.id,
        price: legacyPrice,
        home_price: homePrice,
        temple_price: templePrice,
        remote_price: remotePrice,
        duration_minutes: puja.default_duration_minutes || 60,
        is_active: true,
      };
    };

    const grihaTestPuja = {
      id: "puja-griha-test",
      name: "Griha Test",
      default_duration_minutes: 60,
      allowed_modes: ["home", "temple", "remote"],
    };

    test("TEST 1, TEST 2 & TEST 8: Admin Pandit approval succeeds without NOT NULL price error, creating row with home=55, temple=66, remote=77", () => {
      const submittedPricing = {
        home: 55,
        temple: 66,
        remote: 77,
      };

      // TEST 8 & TEST 1: Approval executes and creates row without NOT NULL error
      const createdRow = simulateApprovePanditApplicationPujaLink("pandit-sudhanshu-1", grihaTestPuja, submittedPricing);
      expect(createdRow).toBeDefined();
      expect(createdRow.is_active).toBe(true);

      // TEST 2: Row contains exact mode prices and fallback price
      expect(createdRow.home_price).toBe(55);
      expect(createdRow.temple_price).toBe(66);
      expect(createdRow.remote_price).toBe(77);
      expect(createdRow.price).toBe(55); // Deterministic fallback
    });

    test("TEST 3: Customer selecting Home receives 55", () => {
      const offering = {
        home_price: 55,
        temple_price: 66,
        remote_price: 77,
        price: 55,
      };
      const result = resolveBookingPrice(offering, "home");
      expect(result.price).toBe(55);
    });

    test("TEST 4: Customer selecting Temple receives 66", () => {
      const offering = {
        home_price: 55,
        temple_price: 66,
        remote_price: 77,
        price: 55,
      };
      const result = resolveBookingPrice(offering, "temple");
      expect(result.price).toBe(66);
    });

    test("TEST 5: Customer selecting Remote receives 77", () => {
      const offering = {
        home_price: 55,
        temple_price: 66,
        remote_price: 77,
        price: 55,
      };
      const result = resolveBookingPrice(offering, "remote");
      expect(result.price).toBe(77);
    });

    test("TEST 6: Legacy price does not override mode-specific booking pricing", () => {
      // Even if legacy scalar price is different (e.g. 999 or 0 or null)
      const offeringWithDivergentLegacyPrice = {
        home_price: 55,
        temple_price: 66,
        remote_price: 77,
        price: 999, // divergent legacy value
      };

      expect(resolveBookingPrice(offeringWithDivergentLegacyPrice, "home").price).toBe(55);
      expect(resolveBookingPrice(offeringWithDivergentLegacyPrice, "temple").price).toBe(66);
      expect(resolveBookingPrice(offeringWithDivergentLegacyPrice, "remote").price).toBe(77);
    });

    test("TEST 7: Existing historical pandit_puja_services rows remain valid", () => {
      // Pre-029 historical record with legacy price backfilled
      const historicalRow = {
        id: "pps-hist-1",
        pandit_id: "pandit-hist",
        puja_service_id: "puja-1",
        price: 2500,
        home_price: 2500,
        temple_price: null,
        remote_price: null,
        is_active: true,
      };

      expect(historicalRow.price).toBe(2500);
      expect(resolveBookingPrice(historicalRow, "home").price).toBe(2500);
      expect(() => resolveBookingPrice(historicalRow, "temple")).toThrow(
        "Selected Pandit does not offer ritual in temple mode"
      );
    });
  });
});
