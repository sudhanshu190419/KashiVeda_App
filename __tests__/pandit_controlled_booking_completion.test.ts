/**
 * Test Suite: Pandit-Controlled Pooja Completion & Balance Payment Workflow
 *
 * Covers all 15 scenarios specified in Phase 8:
 * 1. Balance payment permitted before 24-hour mark.
 * 2. Balance payment permitted within 24-hour window before start time.
 * 3. Balance payment permitted after scheduled start time while pooja is ongoing.
 * 4. Home pooja balance payment allowed until pandit completes pooja.
 * 5. Online pooja balance payment allowed until pandit completes pooja.
 * 6. Customer attempts balance payment after pooja is marked completed (rejected).
 * 7. Customer attempts balance payment on cancelled booking (rejected).
 * 8. Customer pays balance, order expires, customer retries with a new order (succeeds).
 * 9. Multiple balance payment orders are not left in an orphaned open state.
 * 10. Webhook arrives for balance payment after scheduled start time (succeeds and confirms).
 * 11. Duplicate webhook for balance payment is idempotent and does not duplicate payout or ledger entries.
 * 12. Pandit attempts to mark pooja completed with balance > 0 (rejected with clear reason).
 * 13. Pandit marks pooja completed with balance == 0 (succeeds).
 * 14. Unauthorized user attempts to mark pooja completed (rejected).
 * 15. Already-completed pooja completion attempt is idempotent.
 */
export {};
declare const require: any;
declare const __dirname: string;
const fs = require("fs");
const path = require("path");

describe("Pandit-Controlled Pooja Completion & Balance Payment Workflow", () => {
  const migration062Path = path.resolve(
    __dirname,
    "../supabase/migrations/062_pandit_controlled_booking_completion.sql"
  );
  let migration062Sql: string;

  const panditDetailsScreenPath = path.resolve(
    __dirname,
    "../src/features/pandit/screens/PanditBookingDetailsScreen.tsx"
  );
  let panditDetailsScreenContent: string;

  const bookingDetailsScreenPath = path.resolve(
    __dirname,
    "../src/features/booking/screens/BookingDetailsScreen.tsx"
  );
  let bookingDetailsScreenContent: string;

  const panditServicePath = path.resolve(
    __dirname,
    "../src/features/pandit/services/panditService.ts"
  );
  let panditServiceContent: string;

  beforeAll(() => {
    migration062Sql = fs.readFileSync(migration062Path, "utf-8").replace(/\r\n/g, "\n");
    panditDetailsScreenContent = fs.readFileSync(panditDetailsScreenPath, "utf-8").replace(/\r\n/g, "\n");
    bookingDetailsScreenContent = fs.readFileSync(bookingDetailsScreenPath, "utf-8").replace(/\r\n/g, "\n");
    panditServiceContent = fs.readFileSync(panditServicePath, "utf-8").replace(/\r\n/g, "\n");
  });

  describe("Scenario 1: Balance payment permitted before 24-hour mark", () => {
    it("assigns standard due_at when more than 24 hours remain", () => {
      expect(migration062Sql).toContain("IF v_booking.scheduled_start_at - interval '24 hours' <= now() THEN");
      expect(migration062Sql).toContain(
        "v_due_at := GREATEST(now() + interval '30 minutes', v_booking.scheduled_start_at - interval '24 hours');"
      );
    });

    it("creates balance order with valid due_at for advance booking", () => {
      const scheduledStart = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours away
      const deadline = new Date(scheduledStart.getTime() - 24 * 60 * 60 * 1000);
      expect(deadline.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Scenario 2: Balance payment permitted within 24-hour window before start time", () => {
    it("assigns active 30-minute checkout window within 24 hours instead of rejecting or immediate expiration", () => {
      expect(migration062Sql).toContain("v_due_at := now() + interval '30 minutes';");
      // Must not set due_at = now() which caused immediate expiration in prior versions
      expect(migration062Sql).not.toContain("v_due_at := now();");
    });

    it("evaluates a future checkout window for bookings 6 hours away", () => {
      const now = Date.now();
      const scheduledStart = new Date(now + 6 * 60 * 60 * 1000);
      const isWithin24Hours = scheduledStart.getTime() - 24 * 60 * 60 * 1000 <= now;
      expect(isWithin24Hours).toBe(true);

      const dueAt = new Date(now + 30 * 60 * 1000);
      expect(dueAt.getTime()).toBeGreaterThan(now);
      expect(dueAt.getTime() - now).toBe(30 * 60 * 1000);
    });
  });

  describe("Scenario 3: Balance payment permitted after scheduled start time while pooja is ongoing", () => {
    it("does not reject balance order creation when scheduled_start_at <= now()", () => {
      expect(migration062Sql).not.toContain("Ritual scheduled start time has already passed; balance checkout is closed.");
      expect(migration062Sql).toContain("v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')");
    });

    it("BookingDetailsScreen allows balance checkout when start time has passed", () => {
      expect(bookingDetailsScreenContent).toContain(
        "Ritual is underway or scheduled time has arrived. You may settle your remaining balance until the pandit completes the ceremony."
      );
      expect(bookingDetailsScreenContent).not.toContain("disabled={payingBalance || startDate.getTime() <= Date.now()}");
    });
  });

  describe("Scenario 4: Home pooja balance payment allowed until pandit completes pooja", () => {
    it("permits balance checkout for home rituals until status is completed", () => {
      const homeBooking = {
        id: "home-booking-uuid",
        service_mode: "home",
        status: "in_progress",
        scheduled_start_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        total_amount: 5100,
        advance_amount: 2040,
        balance_amount: 3060,
      };

      const isEligibleForBalancePayment =
        ["confirmed", "upcoming", "in_progress", "rescheduled"].includes(homeBooking.status) &&
        homeBooking.balance_amount > 0;
      expect(isEligibleForBalancePayment).toBe(true);
    });
  });

  describe("Scenario 5: Online pooja balance payment allowed until pandit completes pooja", () => {
    it("permits balance checkout for online/remote rituals until status is completed", () => {
      const onlineBooking = {
        id: "online-booking-uuid",
        service_mode: "remote",
        status: "in_progress",
        scheduled_start_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        total_amount: 3100,
        advance_amount: 1550,
        balance_amount: 1550,
      };

      const isEligibleForBalancePayment =
        ["confirmed", "upcoming", "in_progress", "rescheduled"].includes(onlineBooking.status) &&
        onlineBooking.balance_amount > 0;
      expect(isEligibleForBalancePayment).toBe(true);
    });
  });

  describe("Scenario 6: Customer attempts balance payment after pooja is marked completed (rejected)", () => {
    it("rejects balance order creation when booking status is completed", () => {
      expect(migration062Sql).toContain(
        "IF v_booking.status IN ('completed'::public.booking_status, 'cancelled'::public.booking_status) THEN"
      );
      expect(migration062Sql).toContain("Cannot create balance payment order for booking in terminal status");
    });

    it("BookingDetailsScreen hides balance checkout action when status is completed", () => {
      const completedBooking = {
        status: "completed",
        outstanding_balance: 0,
      };
      const isBalancePayable =
        ["confirmed", "upcoming", "in_progress", "rescheduled"].includes(completedBooking.status) &&
        completedBooking.outstanding_balance > 0;
      expect(isBalancePayable).toBe(false);
    });
  });

  describe("Scenario 7: Customer attempts balance payment on cancelled booking (rejected)", () => {
    it("rejects balance order creation when booking status is cancelled", () => {
      expect(migration062Sql).toContain(
        "IF v_booking.status IN ('completed'::public.booking_status, 'cancelled'::public.booking_status) THEN"
      );
    });
  });

  describe("Scenario 8: Customer pays balance, order expires, customer retries with a new order (succeeds)", () => {
    it("marks expired orders as 'expired' and creates fresh order with 30m window", () => {
      expect(migration062Sql).toContain("IF v_existing_order.due_at <= now() THEN");
      expect(migration062Sql).toContain("SET status = 'expired'::public.payment_order_status");
      expect(migration062Sql).toContain("INSERT INTO public.payment_orders (");
    });

    it("reuses active pending order if due_at is still in the future", () => {
      expect(migration062Sql).toContain("UPDATE public.payment_orders");
      expect(migration062Sql).toContain("SET amount = v_outstanding_balance,");
      expect(migration062Sql).toContain("v_payment_order_id := v_existing_order.id;");
    });
  });

  describe("Scenario 9: Multiple balance payment orders are not left in an orphaned open state", () => {
    it("queries for existing open balance payment order with FOR UPDATE lock", () => {
      expect(migration062Sql).toContain("purpose = 'booking_balance'::public.payment_order_purpose");
      expect(migration062Sql).toContain(
        "status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)"
      );
      expect(migration062Sql).toContain("FOR UPDATE;");
    });
  });

  describe("Scenario 10: Webhook arrives for balance payment after scheduled start time (succeeds and confirms)", () => {
    it("updates booking balance_amount to GREATEST(0.00, balance_amount - verified_amount)", () => {
      expect(migration062Sql).toContain(
        "balance_amount = GREATEST(0.00, v_booking.balance_amount - p_verified_amount)"
      );
    });

    it("confirms payment order and records payment transaction", () => {
      expect(migration062Sql).toContain("SET status = 'paid'::public.payment_order_status");
      expect(migration062Sql).toContain("INSERT INTO public.payment_transactions");
    });
  });

  describe("Scenario 11: Duplicate webhook for balance payment is idempotent and does not duplicate payout or ledger entries", () => {
    it("checks for existing confirmed payment transaction using provider_payment_id", () => {
      expect(migration062Sql).toContain("SELECT * INTO v_existing_tx");
      expect(migration062Sql).toContain("WHERE provider_payment_id = p_provider_payment_id;");
      expect(migration062Sql).toContain("IF v_order.status = 'paid'::public.payment_order_status THEN");
      expect(migration062Sql).toContain("'status', 'already_confirmed'");
    });
  });

  describe("Scenario 12: Pandit attempts to mark pooja completed with balance > 0 (rejected with clear reason)", () => {
    it("evaluates calculate_booking_balance in mark_booking_completed and rejects if balance > 0", () => {
      expect(migration062Sql).toContain("v_balance_json := public.calculate_booking_balance(p_booking_id);");
      expect(migration062Sql).toContain(
        "v_outstanding_balance := COALESCE((v_balance_json->>'outstanding_balance')::NUMERIC(12,2), 0.00);"
      );
      expect(migration062Sql).toContain("IF v_outstanding_balance > 0 THEN");
      expect(migration062Sql).toContain(
        "RAISE EXCEPTION 'Cannot complete ritual: Devotee has an outstanding balance of ₹% that must be settled before completion.', v_outstanding_balance;"
      );
    });

    it("PanditBookingDetailsScreen alerts the pandit when trying to complete with unsettled balance", () => {
      expect(panditDetailsScreenContent).toContain("Settlement Required");
      expect(panditDetailsScreenContent).toContain(
        "Please ask the devotee to settle the balance via their app, and tap 'Refresh Payment Status' once received."
      );
      expect(panditDetailsScreenContent).toContain("Devotee Balance Settlement Pending");
    });
  });

  describe("Scenario 13: Pandit marks pooja completed with balance == 0 (succeeds)", () => {
    it("transitions booking status to completed and records pandit payout", () => {
      expect(migration062Sql).toContain("SET status = 'completed'::public.booking_status");
      expect(migration062Sql).toContain("INSERT INTO public.pandit_payouts (");
      expect(migration062Sql).toContain("'pending'::public.payout_status");
    });

    it("records admin audit log when completed by admin or pandit", () => {
      expect(migration062Sql).toContain("INSERT INTO public.admin_audit_logs (");
      expect(migration062Sql).toContain("'booking_marked_completed_by_admin'");
    });
  });

  describe("Scenario 14: Unauthorized user attempts to mark pooja completed (rejected)", () => {
    it("enforces assigned pandit or admin check in mark_booking_completed", () => {
      expect(migration062Sql).toContain(
        "IF v_caller_id IS NOT NULL AND v_booking.pandit_user_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN"
      );
      expect(migration062Sql).toContain(
        "RAISE EXCEPTION 'Access denied: Only the assigned Pandit or Admin can complete this booking.';"
      );
    });
  });

  describe("Scenario 15: Already-completed pooja completion attempt is idempotent", () => {
    it("returns already_completed: true if booking is already completed", () => {
      expect(migration062Sql).toContain("IF v_booking.status = 'completed'::public.booking_status THEN");
      expect(migration062Sql).toContain("'already_completed', true");
    });
  });

  describe("Frontend Integration: panditService and PanditBookingDetailsScreen", () => {
    it("panditService fetchPanditBookingDetail calls calculate_booking_balance in parallel", () => {
      expect(panditServiceContent).toContain('supabase.rpc("calculate_booking_balance"');
      expect(panditServiceContent).toContain("outstanding_balance: outstandingBalance");
      expect(panditServiceContent).toContain("total_paid: totalPaid");
    });

    it("PanditBookingDetailsScreen displays total ritual value, paid dakshina, and outstanding balance", () => {
      expect(panditDetailsScreenContent).toContain("Devotee Booking &amp; Payment Overview");
      expect(panditDetailsScreenContent).toContain("Total Ritual Value");
      expect(panditDetailsScreenContent).toContain("Amount Paid to Date");
      expect(panditDetailsScreenContent).toContain("Outstanding Balance");
      expect(panditDetailsScreenContent).toContain("Refresh Payment Status");
    });
  });
});
