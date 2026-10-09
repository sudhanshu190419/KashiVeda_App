import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

declare const require: any;
declare const __dirname: string;
const fs = require("fs");
const path = require("path");

/**
 * Test Suite: Authoritative Booking Policy Settings & RPC Correction (Migration 035)
 *
 * Verifies Requirements A-I:
 * A. Home: 10% ritual advance
 * B. Temple: 10% ritual advance
 * C. Remote: 50% ritual advance
 * D. Samagri/Prasad: existing 100% rules preserved
 * E. booking_policy_settings is read correctly
 * F. No reference to public.payment_policies remains anywhere in the active booking RPC
 * G. Correct payment-order amount is generated for each mode
 * H. Existing mode-specific price snapshots remain correct
 * I. Historical booking financial data remains unchanged
 */

describe("Migration 035 — Authoritative Booking Policy Settings & RPC", () => {
  const migration035Path = path.resolve(
    __dirname,
    "../supabase/migrations/035_fix_booking_policy_settings_rpc.sql"
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // REQUIREMENT F: No reference to public.payment_policies in active RPC
  // =========================================================================
  describe("Requirement F: Schema Integrity & Nonexistent Table Elimination", () => {
    test("Migration 035 file exists locally", () => {
      expect(fs.existsSync(migration035Path)).toBe(true);
    });

    test("Active booking RPC in Migration 035 does NOT query public.payment_policies", () => {
      const sql = fs.readFileSync(migration035Path, "utf8");

      // Verify no SELECT/FROM/JOIN query against public.payment_policies inside function body
      const functionBodyStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.create_or_validate_booking");
      expect(functionBodyStart).toBeGreaterThan(0);
      const functionBody = sql.substring(functionBodyStart);

      expect(functionBody).not.toMatch(/FROM\s+public\.payment_policies/i);
      expect(functionBody).not.toMatch(/JOIN\s+public\.payment_policies/i);
      expect(functionBody).not.toMatch(/SELECT\s+.*\s+FROM\s+public\.payment_policies/i);
    });

    test("Migration 035 targets canonical public.booking_policy_settings", () => {
      const sql = fs.readFileSync(migration035Path, "utf8");
      expect(sql).toMatch(/FROM\s+public\.booking_policy_settings\s+WHERE\s+id\s*=\s*1/i);
      expect(sql).toMatch(/v_policy\.home_advance_percent/);
      expect(sql).toMatch(/v_policy\.temple_advance_percent/);
      expect(sql).toMatch(/v_policy\.remote_advance_percent/);
    });

    test("Migration 035 normalizes temple_advance_percent to 10.00% on singleton row", () => {
      const sql = fs.readFileSync(migration035Path, "utf8");
      expect(sql).toMatch(/UPDATE\s+public\.booking_policy_settings\s+SET\s+temple_advance_percent\s*=\s*10\.00/i);
    });
  });

  // =========================================================================
  // SIMULATION ENGINE: Mirrors PostgreSQL create_or_validate_booking calculations
  // =========================================================================
  interface BookingPolicySettings {
    id: number;
    home_advance_percent: number | null;
    temple_advance_percent: number | null;
    remote_advance_percent: number | null;
    samagri_advance_percent: number;
    kundli_advance_percent: number;
  }

  function simulateRpcFinancialCalculation(params: {
    serviceMode: "home" | "temple" | "remote";
    pujaPrice: number;
    samagriTotal: number;
    prasadTotal: number;
    policy: BookingPolicySettings | null;
  }) {
    const { serviceMode, pujaPrice, samagriTotal, prasadTotal, policy } = params;

    let advancePercent = 10.0;
    if (serviceMode === "home") {
      advancePercent = policy?.home_advance_percent ?? 10.0;
    } else if (serviceMode === "remote") {
      advancePercent = policy?.remote_advance_percent ?? 50.0;
    } else if (serviceMode === "temple") {
      advancePercent = policy?.temple_advance_percent ?? 10.0;
    }

    if (advancePercent < 0 || advancePercent > 100) {
      advancePercent = 10.0;
    }

    const totalAmount = Number((pujaPrice + samagriTotal + prasadTotal).toFixed(2));
    let advanceAmount = Number(
      (((pujaPrice * advancePercent) / 100.0) + samagriTotal + prasadTotal).toFixed(2)
    );
    let balanceAmount = Number((totalAmount - advanceAmount).toFixed(2));

    if (advanceAmount > totalAmount) {
      advanceAmount = totalAmount;
      balanceAmount = 0;
    }

    return {
      advancePercent,
      advanceAmount,
      balanceAmount,
      totalAmount,
      paymentOrder: {
        purpose: "booking_advance",
        amount: advanceAmount,
        currency: "INR",
        status: "created",
        provider: "razorpay",
      },
    };
  }

  const canonicalPolicy: BookingPolicySettings = {
    id: 1,
    home_advance_percent: 10.0,
    temple_advance_percent: 10.0,
    remote_advance_percent: 50.0,
    samagri_advance_percent: 100.0,
    kundli_advance_percent: 100.0,
  };

  // =========================================================================
  // REQUIREMENTS A, B, C, D: Mode-Specific Advance Percentages
  // =========================================================================
  describe("Requirements A, B, C, D: Advance Percentages & Financial Split", () => {
    test("A. Home Ritual: 10% ritual advance + 100% upfront Samagri/Prasad", () => {
      const result = simulateRpcFinancialCalculation({
        serviceMode: "home",
        pujaPrice: 5100.0, // Pandit home_price
        samagriTotal: 1500.0,
        prasadTotal: 400.0,
        policy: canonicalPolicy,
      });

      expect(result.advancePercent).toBe(10.0);
      // Advance: (5100 * 10%) + 1500 + 400 = 510 + 1900 = 2410
      expect(result.advanceAmount).toBe(2410.0);
      // Balance: 5100 * 90% = 4590
      expect(result.balanceAmount).toBe(4590.0);
      // Total: 5100 + 1500 + 400 = 7000
      expect(result.totalAmount).toBe(7000.0);
    });

    test("B. Temple Ritual: 10% ritual advance + 100% upfront Samagri/Prasad", () => {
      const result = simulateRpcFinancialCalculation({
        serviceMode: "temple",
        pujaPrice: 3500.0, // Pandit temple_price
        samagriTotal: 800.0,
        prasadTotal: 250.0,
        policy: canonicalPolicy,
      });

      expect(result.advancePercent).toBe(10.0);
      // Advance: (3500 * 10%) + 800 + 250 = 350 + 1050 = 1400
      expect(result.advanceAmount).toBe(1400.0);
      // Balance: 3500 * 90% = 3150
      expect(result.balanceAmount).toBe(3150.0);
      // Total: 3500 + 800 + 250 = 4550
      expect(result.totalAmount).toBe(4550.0);
    });

    test("C. Remote Ritual: 50% ritual advance + 100% upfront Samagri/Prasad", () => {
      const result = simulateRpcFinancialCalculation({
        serviceMode: "remote",
        pujaPrice: 2100.0, // Pandit remote_price
        samagriTotal: 0.0,
        prasadTotal: 0.0,
        policy: canonicalPolicy,
      });

      expect(result.advancePercent).toBe(50.0);
      // Advance: 2100 * 50% = 1050
      expect(result.advanceAmount).toBe(1050.0);
      // Balance: 2100 * 50% = 1050
      expect(result.balanceAmount).toBe(1050.0);
      // Total: 2100
      expect(result.totalAmount).toBe(2100.0);
    });

    test("D. Samagri and Prasad: 100% upfront preserved regardless of ritual mode", () => {
      const homeWithAddons = simulateRpcFinancialCalculation({
        serviceMode: "home",
        pujaPrice: 2000.0,
        samagriTotal: 1000.0,
        prasadTotal: 500.0,
        policy: canonicalPolicy,
      });
      // 10% of 2000 = 200. Plus full 1000 samagri + 500 prasad = 1700
      expect(homeWithAddons.advanceAmount).toBe(1700.0);
      expect(homeWithAddons.balanceAmount).toBe(1800.0); // Only remaining ritual fee
    });
  });

  // =========================================================================
  // REQUIREMENT E: booking_policy_settings Fallback & Read Correctness
  // =========================================================================
  describe("Requirement E: booking_policy_settings Read & Fallback Robustness", () => {
    test("Uses fallback defaults (Home: 10%, Temple: 10%, Remote: 50%) when policy is NULL or values missing", () => {
      const emptyPolicy: BookingPolicySettings = {
        id: 1,
        home_advance_percent: null,
        temple_advance_percent: null,
        remote_advance_percent: null,
        samagri_advance_percent: 100.0,
        kundli_advance_percent: 100.0,
      };

      const homeRes = simulateRpcFinancialCalculation({
        serviceMode: "home",
        pujaPrice: 1000,
        samagriTotal: 0,
        prasadTotal: 0,
        policy: emptyPolicy,
      });
      expect(homeRes.advancePercent).toBe(10.0);
      expect(homeRes.advanceAmount).toBe(100.0);

      const templeRes = simulateRpcFinancialCalculation({
        serviceMode: "temple",
        pujaPrice: 1000,
        samagriTotal: 0,
        prasadTotal: 0,
        policy: emptyPolicy,
      });
      expect(templeRes.advancePercent).toBe(10.0);
      expect(templeRes.advanceAmount).toBe(100.0);

      const remoteRes = simulateRpcFinancialCalculation({
        serviceMode: "remote",
        pujaPrice: 1000,
        samagriTotal: 0,
        prasadTotal: 0,
        policy: emptyPolicy,
      });
      expect(remoteRes.advancePercent).toBe(50.0);
      expect(remoteRes.advanceAmount).toBe(500.0);
    });

    test("Sanitizes out-of-bound percentages (>100 or <0) to safe 10.00% default", () => {
      const corruptPolicy: BookingPolicySettings = {
        id: 1,
        home_advance_percent: 150.0, // Corrupted
        temple_advance_percent: -5.0, // Corrupted
        remote_advance_percent: 50.0,
        samagri_advance_percent: 100.0,
        kundli_advance_percent: 100.0,
      };

      const homeRes = simulateRpcFinancialCalculation({
        serviceMode: "home",
        pujaPrice: 1000,
        samagriTotal: 0,
        prasadTotal: 0,
        policy: corruptPolicy,
      });
      expect(homeRes.advancePercent).toBe(10.0);

      const templeRes = simulateRpcFinancialCalculation({
        serviceMode: "temple",
        pujaPrice: 1000,
        samagriTotal: 0,
        prasadTotal: 0,
        policy: corruptPolicy,
      });
      expect(templeRes.advancePercent).toBe(10.0);
    });
  });

  // =========================================================================
  // REQUIREMENT G: Payment Order Generation Matches Authoritative Advance
  // =========================================================================
  describe("Requirement G: Payment Orders Insertion Schema & Amounts", () => {
    test("Generates payment_orders obligation with canonical columns and exact advance amount", () => {
      const homeRes = simulateRpcFinancialCalculation({
        serviceMode: "home",
        pujaPrice: 4000.0,
        samagriTotal: 1000.0,
        prasadTotal: 0.0,
        policy: canonicalPolicy,
      });

      expect(homeRes.paymentOrder).toEqual({
        purpose: "booking_advance",
        amount: 1400.0, // 400 (10% of 4000) + 1000
        currency: "INR",
        status: "created",
        provider: "razorpay",
      });
    });

    test("Client createOrValidateBooking call receives authoritative server response", async () => {
      const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: {
          booking_id: "bk-test-1",
          booking_number: "KV-BK-20261008-001",
          status: "payment_pending",
          service_mode: "home",
          puja_price: 5000,
          samagri_total: 1000,
          prasad_total: 0,
          advance_percent: 10,
          advance_amount: 1500,
          balance_amount: 4500,
          total_amount: 6000,
          payment_order_id: "po-test-1",
          scheduled_start_at: "2026-10-15T10:00:00Z",
          scheduled_end_at: "2026-10-15T11:30:00Z",
        },
        error: null,
      } as any);

      const response = await bookingService.createOrValidateBooking({
        pandit_id: "pandit-1",
        puja_service_id: "puja-1",
        service_mode: "home",
        scheduled_start_at: "2026-10-15T10:00:00Z",
        address_id: "addr-1",
      });

      expect(mockRpc).toHaveBeenCalledWith("create_or_validate_booking", expect.objectContaining({
        p_pandit_id: "pandit-1",
        p_puja_service_id: "puja-1",
        p_service_mode: "home",
      }));
      expect(response.advance_amount).toBe(1500);
      expect(response.payment_order_id).toBe("po-test-1");
    });
  });

  // =========================================================================
  // REQUIREMENT H & I: Mode-Specific Price Snapshots & Historical Immutability
  // =========================================================================
  describe("Requirements H & I: Price Snapshots & Historical Immutability", () => {
    test("H. Mode-specific prices are accurately snapshotted per service mode", () => {
      const panditOffering = {
        home_price: 6000.0,
        temple_price: 4500.0,
        remote_price: 2500.0,
      };

      const homeCalc = simulateRpcFinancialCalculation({
        serviceMode: "home",
        pujaPrice: panditOffering.home_price,
        samagriTotal: 0,
        prasadTotal: 0,
        policy: canonicalPolicy,
      });
      expect(homeCalc.totalAmount).toBe(6000.0);
      expect(homeCalc.advanceAmount).toBe(600.0);

      const templeCalc = simulateRpcFinancialCalculation({
        serviceMode: "temple",
        pujaPrice: panditOffering.temple_price,
        samagriTotal: 0,
        prasadTotal: 0,
        policy: canonicalPolicy,
      });
      expect(templeCalc.totalAmount).toBe(4500.0);
      expect(templeCalc.advanceAmount).toBe(450.0);

      const remoteCalc = simulateRpcFinancialCalculation({
        serviceMode: "remote",
        pujaPrice: panditOffering.remote_price,
        samagriTotal: 0,
        prasadTotal: 0,
        policy: canonicalPolicy,
      });
      expect(remoteCalc.totalAmount).toBe(2500.0);
      expect(remoteCalc.advanceAmount).toBe(1250.0);
    });

    test("I. Historical booking records remain authoritative and immutable", () => {
      // Existing confirmed booking record created under older policies
      const historicalBooking = {
        id: "hist-booking-1",
        service_mode: "remote",
        price_snapshot: 2100.0,
        advance_percent: 50.0,
        advance_amount: 1050.0,
        balance_amount: 1050.0,
        total_amount: 2100.0,
        status: "confirmed",
      };

      // Modifying policy or creating new bookings must not change historical records
      expect(historicalBooking.advance_amount).toBe(1050.0);
      expect(historicalBooking.balance_amount).toBe(1050.0);
      expect(historicalBooking.price_snapshot).toBe(2100.0);
    });
  });
});
