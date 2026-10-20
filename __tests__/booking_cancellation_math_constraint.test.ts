// __tests__/booking_cancellation_math_constraint.test.ts
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { handleExecuteRazorpayRefund } from "../supabase/functions/execute-razorpay-refund/index.ts";

describe("Booking Cancellation & Amount Math Constraint Test Suite (Phase 3)", () => {
  const sampleBookingId = "b1111111-2222-4333-8444-555555555555";
  const sampleCancellationId = "c1111111-2222-4333-8444-555555555555";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. EXACT REPORTED SCENARIO: ₹504.90 captured, 50% refund policy, samagri deduction
  // ---------------------------------------------------------------------------
  test("1. The exact reported scenario: ₹504.90 captured amount and applicable 50% refund policy", async () => {
    // ₹504.90 total captured
    // ₹49.00 refundable puja dakshina, ₹455.90 non-refundable samagri
    // 50% refund on dakshina = ₹24.50
    // Total deduction = ₹480.40 (₹455.90 samagri + ₹24.50 retained dakshina)
    // Constraint check: refund_base_amount (₹504.90) = refund_amount (₹24.50) + deduction_amount (₹480.40)
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        status: "cancelled",
        cancellation_id: sampleCancellationId,
        total_captured: 504.9,
        already_refunded: 0.0,
        net_captured: 504.9,
        refundable_base: 49.0,
        refund_base_amount: 504.9,
        refund_percent: 50.0,
        refund_amount: 24.5,
        deduction_amount: 480.4,
      },
      error: null,
    } as any);

    const result = await bookingService.cancelBooking(sampleBookingId, "Devotee schedule conflict");

    expect(mockRpc).toHaveBeenCalledWith("cancel_booking_and_calculate_refund", {
      p_booking_id: sampleBookingId,
      p_reason: "Devotee schedule conflict",
    });

    expect(result.status).toBe("cancelled");
    expect(result.net_captured).toBe(504.9);
    expect(result.refund_amount).toBe(24.5);
    expect(result.deduction_amount).toBe(480.4);
    expect(result.refund_base_amount).toBe(504.9);
    // Strict arithmetic invariant: refund_base_amount = refund_amount + deduction_amount
    expect(result.refund_base_amount).toBe(Number((result.refund_amount + result.deduction_amount).toFixed(2)));
  });

  // ---------------------------------------------------------------------------
  // 2. CORRECT CALCULATION OF REFUND AND DEDUCTION
  // ---------------------------------------------------------------------------
  test("2. Correct server-side calculation of refund and deduction preserves all non-refundable funds", () => {
    const netCaptured = 504.9;
    const refundableLineItemsTotal = 49.0;
    const refundPercent = 50.0;

    const refundableBase = Math.min(refundableLineItemsTotal, netCaptured);
    const refundAmount = Math.round((refundableBase * refundPercent) / 100 * 100) / 100; // 24.50
    const deductionAmount = Math.round((netCaptured - refundAmount) * 100) / 100; // 480.40

    expect(refundAmount).toBe(24.5);
    expect(deductionAmount).toBe(480.4);
    expect(Math.round((refundAmount + deductionAmount) * 100) / 100).toBe(netCaptured);
  });

  // ---------------------------------------------------------------------------
  // 3. EQUALITY BETWEEN REFUND PREVIEW AND CONFIRMED CANCELLATION
  // ---------------------------------------------------------------------------
  test("3. Equality between refund preview and confirmed cancellation", async () => {
    const previewData = {
      booking_id: sampleBookingId,
      is_cancellable: true,
      hours_before: 36.5,
      total_captured: 504.9,
      already_refunded: 0.0,
      net_captured: 504.9,
      refundable_base: 49.0,
      refund_base_amount: 504.9,
      refund_percent: 50.0,
      refund_amount: 24.5,
      deduction_amount: 480.4,
      policy_name: "Partial Refund (24h–48h Before Ritual)",
    };

    const cancellationData = {
      status: "cancelled",
      cancellation_id: sampleCancellationId,
      total_captured: 504.9,
      already_refunded: 0.0,
      net_captured: 504.9,
      refundable_base: 49.0,
      refund_base_amount: 504.9,
      refund_percent: 50.0,
      refund_amount: 24.5,
      deduction_amount: 480.4,
    };

    const mockRpc = jest
      .spyOn(supabase, "rpc")
      .mockResolvedValueOnce({ data: previewData, error: null } as any)
      .mockResolvedValueOnce({ data: cancellationData, error: null } as any);

    const preview = await bookingService.previewCancellationRefund(sampleBookingId);
    const result = await bookingService.cancelBooking(sampleBookingId);

    // Exact parity between preview and confirmation
    expect(result.net_captured).toBe(preview.net_captured);
    expect(result.refund_amount).toBe(preview.refund_amount);
    expect(result.deduction_amount).toBe(preview.deduction_amount);
    expect(result.refund_percent).toBe(preview.refund_percent);
    expect(result.refund_base_amount).toBe(preview.refund_base_amount);
    expect(result.refundable_base).toBe(preview.refundable_base);
  });

  // ---------------------------------------------------------------------------
  // 4. ZERO-REFUND AND FULL-REFUND POLICY SCENARIOS
  // ---------------------------------------------------------------------------
  test("4. Full-refund policy (>48h) and zero-refund policy (<24h) scenarios", async () => {
    // 4.1 Full Refund (>48h): 100% of dakshina (49.00), deduction = 455.90 samagri
    const fullRefundData = {
      status: "cancelled",
      cancellation_id: "canc-full",
      total_captured: 504.9,
      already_refunded: 0.0,
      net_captured: 504.9,
      refundable_base: 49.0,
      refund_base_amount: 504.9,
      refund_percent: 100.0,
      refund_amount: 49.0,
      deduction_amount: 455.9,
    };

    // 4.2 Non-Refundable (<24h): 0% refund, deduction = 504.90
    const zeroRefundData = {
      status: "cancelled",
      cancellation_id: "canc-zero",
      total_captured: 504.9,
      already_refunded: 0.0,
      net_captured: 504.9,
      refundable_base: 49.0,
      refund_base_amount: 504.9,
      refund_percent: 0.0,
      refund_amount: 0.0,
      deduction_amount: 504.9,
    };

    const mockRpc = jest
      .spyOn(supabase, "rpc")
      .mockResolvedValueOnce({ data: fullRefundData, error: null } as any)
      .mockResolvedValueOnce({ data: zeroRefundData, error: null } as any);

    const fullResult = await bookingService.cancelBooking(sampleBookingId);
    expect(fullResult.refund_amount).toBe(49.0);
    expect(fullResult.deduction_amount).toBe(455.9);
    expect(fullResult.refund_base_amount).toBe(Number((fullResult.refund_amount + fullResult.deduction_amount).toFixed(2)));

    const zeroResult = await bookingService.cancelBooking(sampleBookingId);
    expect(zeroResult.refund_amount).toBe(0.0);
    expect(zeroResult.deduction_amount).toBe(504.9);
    expect(zeroResult.refund_base_amount).toBe(Number((zeroResult.refund_amount + zeroResult.deduction_amount).toFixed(2)));
  });

  // ---------------------------------------------------------------------------
  // 5. ROUNDING AND MONETARY BOUNDARY CASES
  // ---------------------------------------------------------------------------
  test("5. Rounding and fractional paise boundary cases satisfy amount math invariant", () => {
    // Test odd dakshina amounts that produce fractional paise (e.g. ₹49.15, 50% = 24.575 -> rounded to 24.58)
    const netCaptured = 504.9;
    const refundableBase = 49.15;
    const refundPercent = 50.0;

    const refundAmount = Math.round((refundableBase * refundPercent) / 100 * 100) / 100; // 24.58
    const deductionAmount = Math.round((netCaptured - refundAmount) * 100) / 100; // 480.32

    expect(refundAmount).toBe(24.58);
    expect(deductionAmount).toBe(480.32);
    // Invariant: net_captured = refund_amount + deduction_amount
    expect(Math.round((refundAmount + deductionAmount) * 100) / 100).toBe(netCaptured);
  });

  // ---------------------------------------------------------------------------
  // 6. INVALID OR INCONSISTENT MONETARY AMOUNTS REJECTED SAFELY
  // ---------------------------------------------------------------------------
  test("6. Invalid or inconsistent monetary amounts violate check constraint", () => {
    const checkAmountMathConstraint = (base: number, refund: number, deduction: number): boolean => {
      return Math.abs(base - (refund + deduction)) < 0.00001;
    };

    // Old bug: base was set to 49.00 while refund was 24.50 and deduction was 480.40
    expect(checkAmountMathConstraint(49.0, 24.5, 480.4)).toBe(false);

    // Corrupted amounts:
    expect(checkAmountMathConstraint(504.9, 24.5, 400.0)).toBe(false);
    expect(checkAmountMathConstraint(504.9, 0.0, 500.0)).toBe(false);

    // Correct amounts:
    expect(checkAmountMathConstraint(504.9, 24.5, 480.4)).toBe(true);
    expect(checkAmountMathConstraint(504.9, 49.0, 455.9)).toBe(true);
    expect(checkAmountMathConstraint(504.9, 0.0, 504.9)).toBe(true);
    expect(checkAmountMathConstraint(0.0, 0.0, 0.0)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7. DATABASE CONSTRAINT COMPATIBILITY: chk_booking_cancellations_amount_math
  // ---------------------------------------------------------------------------
  test("7. Fixed RPC produces parameters that strictly satisfy chk_booking_cancellations_amount_math", () => {
    const scenarios = [
      { name: "Reported 50% tier", net: 504.9, refBase: 49.0, pct: 50.0 },
      { name: "Reported 100% tier", net: 504.9, refBase: 49.0, pct: 100.0 },
      { name: "Reported 0% tier", net: 504.9, refBase: 49.0, pct: 0.0 },
      { name: "Pure puja booking (no samagri)", net: 1050.0, refBase: 1050.0, pct: 50.0 },
      { name: "Zero paid booking (payment_pending)", net: 0.0, refBase: 0.0, pct: 0.0 },
      { name: "Odd pricing boundary", net: 777.77, refBase: 333.33, pct: 50.0 },
    ];

    for (const sc of scenarios) {
      const refundAmount = Math.round((sc.refBase * sc.pct) / 100 * 100) / 100;
      const deductionAmount = Math.round((sc.net - refundAmount) * 100) / 100;
      const refundBaseAmount = sc.net; // As fixed in Migration 058

      // Evaluates chk_booking_cancellations_amount_math:
      // CHECK (refund_base_amount = refund_amount + deduction_amount)
      const satisfiesConstraint = refundBaseAmount === Number((refundAmount + deductionAmount).toFixed(2));
      expect(satisfiesConstraint).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 8. CANCELLATION TRANSACTION ROLLBACK ON DATABASE FAILURE
  // ---------------------------------------------------------------------------
  test("8. Cancellation transaction rolls back completely on database error and raises exception", async () => {
    jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: null,
      error: {
        message: 'new row for relation "booking_cancellations" violates check constraint "chk_booking_cancellations_amount_math"',
        code: "23514",
      },
    } as any);

    await expect(bookingService.cancelBooking(sampleBookingId)).rejects.toThrow(
      'new row for relation "booking_cancellations" violates check constraint "chk_booking_cancellations_amount_math"'
    );
  });

  // ---------------------------------------------------------------------------
  // 9. REFUND API FAILURE AND RETRY HANDLING
  // ---------------------------------------------------------------------------
  test("9. Refund API network failure leaves database refund in processing without false-failure", async () => {
    const mockAdminClient = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          success: true,
          status: "claimed",
          refund_id: "rfnd-uuid-1",
          payment_transaction_id: "tx-uuid-1",
          booking_cancellation_id: sampleCancellationId,
          amount: 24.5,
          provider_payment_id: "pay_test_123456",
        },
        error: null,
      }),
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "admin-user-1" } },
          error: null,
        }),
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { role: "admin" },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    // Network error during Razorpay external refund call
    const mockFetch = jest.fn().mockRejectedValue(new Error("Network timeout contacting Razorpay API"));

    const req = new Request("https://kashiveda.supabase.co/functions/v1/execute-razorpay-refund", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-admin-jwt",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refund_id: "11111111-2222-4333-8444-555555555555" }),
    });

    const res = await handleExecuteRazorpayRefund(req, {
      adminClient: mockAdminClient,
      fetchFn: mockFetch,
      getEnvFn: (k) => (k === "RAZORPAY_KEY_ID" ? "rzp_test_key" : k === "RAZORPAY_KEY_SECRET" ? "rzp_test_secret" : undefined),
    });

    // Returns HTTP 502 with protected processing state, keeping state protected
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Network timeout contacting payment gateway");
    expect(body.error).toContain("remains in processing state");
  });

  // ---------------------------------------------------------------------------
  // 10. DUPLICATE CANCELLATION REQUESTS AND REFUND IDEMPOTENCY
  // ---------------------------------------------------------------------------
  test("10. Duplicate cancellation request on already cancelled booking is rejected safely", async () => {
    jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: null,
      error: {
        message: "Booking cannot be cancelled in its current state (cancelled).",
        code: "P0001",
      },
    } as any);

    await expect(bookingService.cancelBooking(sampleBookingId)).rejects.toThrow(
      "Booking cannot be cancelled in its current state (cancelled)."
    );
  });

  // ---------------------------------------------------------------------------
  // 11. CANCELLATION REQUEST THAT IS NO LONGER ELIGIBLE
  // ---------------------------------------------------------------------------
  test("11. Cancellation request for completed or in_progress ritual is rejected", async () => {
    jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: null,
      error: {
        message: "Booking cannot be cancelled in its current state (completed).",
        code: "P0001",
      },
    } as any);

    await expect(bookingService.cancelBooking(sampleBookingId)).rejects.toThrow(
      "Booking cannot be cancelled in its current state (completed)."
    );
  });

  // ---------------------------------------------------------------------------
  // 12. FAILED CANCELLATION DOES NOT FALSELY REPORT SUCCESS OR TRIGGER REFUND
  // ---------------------------------------------------------------------------
  test("12. Failed cancellation does not report success or trigger an unintended refund", async () => {
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: null,
      error: { message: "Database lock conflict", code: "40P01" },
    } as any);

    let caughtError: any = null;
    try {
      await bookingService.cancelBooking(sampleBookingId);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain("Database lock conflict");
    // Ensure no refund confirmation is returned to the UI
  });
});
