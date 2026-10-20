const fs = require("fs");
const path = require("path");

const m056Path = path.resolve(__dirname, "../supabase/migrations/056_remediate_booking_and_payment_rpc_schema_compatibility.sql");
const m057Path = path.resolve(__dirname, "../supabase/migrations/057_fix_confirm_booking_payment_record_assignment.sql");
const m021Path = path.resolve(__dirname, "../supabase/migrations/021_booking_financial_lifecycle.sql");

const m056 = fs.readFileSync(m056Path, "utf8");
const m057 = fs.readFileSync(m057Path, "utf8");
const m021 = fs.readFileSync(m021Path, "utf8");

// 1. Extract create_or_validate_booking from 056
const createStart = m056.indexOf("CREATE OR REPLACE FUNCTION public.create_or_validate_booking(");
const createEnd = m056.indexOf("-- =============================================================================\n-- 2. FUNCTION: public.request_booking_reschedule");
let createSql = m056.substring(createStart, createEnd).trim();

// Verify and replace pricing section in create_or_validate_booking
const oldPricingBlock = `    -- 11. Authoritative Financial Policy Calculation (Canonical booking_policy_settings WHERE id = 1)
    SELECT * INTO v_policy
    FROM public.booking_policy_settings
    WHERE id = 1;

    IF p_service_mode = 'home' THEN
        v_advance_percent := COALESCE(v_policy.home_advance_percent, 10.00);
    ELSIF p_service_mode = 'remote' THEN
        v_advance_percent := COALESCE(v_policy.remote_advance_percent, 50.00);
    ELSIF p_service_mode = 'temple' THEN
        v_advance_percent := COALESCE(v_policy.temple_advance_percent, 10.00);
    ELSE
        v_advance_percent := 10.00;
    END IF;

    IF v_advance_percent < 0 OR v_advance_percent > 100 THEN
        v_advance_percent := 10.00;
    END IF;

    -- Financial Totals (Rupees)
    -- Advance % applies to dakshina (puja_price); Samagri & Prasad are physical goods paid 100% upfront
    v_total_amount := v_puja_price + v_samagri_total + v_prasad_total;
    v_advance_amount := ROUND(((v_puja_price * v_advance_percent) / 100.0) + v_samagri_total + v_prasad_total, 2);
    v_balance_amount := v_total_amount - v_advance_amount;

    IF v_advance_amount > v_total_amount THEN
        v_advance_amount := v_total_amount;
        v_balance_amount := 0.00;
    END IF;`;

const newPricingBlock = `    -- 11. Authoritative Financial Policy Calculation (Canonical booking_policy_settings WHERE id = 1)
    SELECT * INTO v_policy
    FROM public.booking_policy_settings
    WHERE id = 1;

    -- Authoritative 24-Hour Cutoff:
    -- If ritual is scheduled <= 24 hours from current server time (now()),
    -- require 100% full payment upfront.
    IF p_scheduled_start_at <= (now() + interval '24 hours') THEN
        v_advance_percent := 100.00;
    ELSIF p_service_mode = 'home' THEN
        v_advance_percent := COALESCE(v_policy.home_advance_percent, 10.00);
    ELSIF p_service_mode = 'remote' THEN
        v_advance_percent := COALESCE(v_policy.remote_advance_percent, 50.00);
    ELSIF p_service_mode = 'temple' THEN
        v_advance_percent := COALESCE(v_policy.temple_advance_percent, 10.00);
    ELSE
        v_advance_percent := 10.00;
    END IF;

    IF v_advance_percent < 0 OR v_advance_percent > 100 THEN
        v_advance_percent := 10.00;
    END IF;

    -- Financial Totals (Rupees)
    -- Advance % applies to dakshina (puja_price); Samagri & Prasad are physical goods paid 100% upfront.
    -- For full payment (100%), advance_amount equals total_amount exactly without double-counting.
    v_total_amount := v_puja_price + v_samagri_total + v_prasad_total;

    IF v_advance_percent = 100.00 THEN
        v_advance_amount := v_total_amount;
        v_balance_amount := 0.00;
    ELSE
        v_advance_amount := ROUND(((v_puja_price * v_advance_percent) / 100.0) + v_samagri_total + v_prasad_total, 2);
        v_balance_amount := v_total_amount - v_advance_amount;

        IF v_advance_amount > v_total_amount THEN
            v_advance_amount := v_total_amount;
            v_balance_amount := 0.00;
        END IF;
    END IF;`;

if (!createSql.includes(oldPricingBlock)) {
    console.error("Could not find oldPricingBlock in createSql!");
    process.exit(1);
}
createSql = createSql.replace(oldPricingBlock, newPricingBlock);

// 2. Extract create_booking_balance_payment_order from 021
const balStart = m021.indexOf("CREATE OR REPLACE FUNCTION public.create_booking_balance_payment_order(");
const balEnd = m021.indexOf("-- =============================================================================\n-- 4. Business Function: preview_cancellation_refund");
let balSql = m021.substring(balStart, balEnd).trim();

const oldBalDueAtBlock = `    -- 6. Compute due_at timestamp based on locked business rules:
    -- Standard cutoff: scheduled_start_at - 24 hours.
    -- If created/requested < 24 hours before scheduled_start_at: due immediately (now()).
    IF v_booking.scheduled_start_at - interval '24 hours' <= now() THEN
        v_due_at := now();
    ELSE
        v_due_at := v_booking.scheduled_start_at - interval '24 hours';
    END IF;`;

const newBalDueAtBlock = `    -- 6. Verify ritual has not already started
    IF v_booking.scheduled_start_at <= now() THEN
        RAISE EXCEPTION 'Ritual scheduled start time has already passed; balance checkout is closed.';
    END IF;

    -- 7. Compute due_at timestamp based on authoritative business rules:
    -- Standard cutoff: scheduled_start_at - 24 hours.
    -- If created/requested <= 24 hours before scheduled_start_at:
    -- Grant an active 30-minute checkout window capped at ritual start time,
    -- allowing the customer to settle the balance before the ritual begins
    -- without the order being instantly expired by the background sweeper.
    IF v_booking.scheduled_start_at - interval '24 hours' <= now() THEN
        v_due_at := LEAST(now() + interval '30 minutes', v_booking.scheduled_start_at);
    ELSE
        v_due_at := v_booking.scheduled_start_at - interval '24 hours';
    END IF;`;

if (!balSql.includes(oldBalDueAtBlock)) {
    console.error("Could not find oldBalDueAtBlock in balSql!");
    process.exit(1);
}
balSql = balSql.replace(oldBalDueAtBlock, newBalDueAtBlock);

// Replace comment 7 with comment 8 in balSql
balSql = balSql.replace(
    "-- 7. Check for existing open payment order for booking_balance",
    "-- 8. Check for existing open payment order for booking_balance"
);
// Ensure explicit casting of created and pending in status IN
balSql = balSql.replace(
    "AND status IN ('created', 'pending')",
    "AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)"
);
balSql = balSql.replace(
    "REVOKE EXECUTE ON FUNCTION public.create_booking_balance_payment_order(UUID) FROM PUBLIC, anon;",
    "REVOKE ALL ON FUNCTION public.create_booking_balance_payment_order(UUID) FROM PUBLIC, anon;"
);

// 3. Extract confirm_booking_payment from 057
const confStart = m057.indexOf("CREATE OR REPLACE FUNCTION public.confirm_booking_payment(");
let confSql = m057.substring(confStart).trim();

// Replace line 485 in confirm_booking_payment
const oldConfBalDue = `                        CASE
                            WHEN v_booking.scheduled_start_at - interval '24 hours' <= now() THEN now()
                            ELSE v_booking.scheduled_start_at - interval '24 hours'
                        END`;

const newConfBalDue = `                        CASE
                            WHEN v_booking.scheduled_start_at - interval '24 hours' <= now() THEN
                                LEAST(now() + interval '30 minutes', v_booking.scheduled_start_at)
                            ELSE v_booking.scheduled_start_at - interval '24 hours'
                        END`;

if (!confSql.includes(oldConfBalDue)) {
    console.error("Could not find oldConfBalDue in confSql!");
    process.exit(1);
}
confSql = confSql.replace(oldConfBalDue, newConfBalDue);

// Replace line 976 in prepone_fee branch in confirm_booking_payment
const oldConfPrepDue = `            SET due_at = CASE 
                    WHEN v_reschedule.requested_start_at - interval '24 hours' <= now() THEN now()
                    ELSE v_reschedule.requested_start_at - interval '24 hours'
                END,`;

const newConfPrepDue = `            SET due_at = CASE 
                    WHEN v_reschedule.requested_start_at - interval '24 hours' <= now() THEN
                        LEAST(now() + interval '30 minutes', v_reschedule.requested_start_at)
                    ELSE v_reschedule.requested_start_at - interval '24 hours'
                END,`;

if (!confSql.includes(oldConfPrepDue)) {
    console.error("Could not find oldConfPrepDue in confSql!");
    process.exit(1);
}
confSql = confSql.replace(oldConfPrepDue, newConfPrepDue);

const migration061Header = `-- =============================================================================
-- Migration 061: Authoritative 24-Hour Booking Full Payment Enforcement
-- =============================================================================
-- Solves the booking-within-24-hours balance payment expiration defect:
--
-- 1. ROOT CAUSE:
--    When rituals were booked <= 24 hours prior to ritual start time, the database
--    previously applied the standard service-mode advance percentages (Home: 10%,
--    Remote: 50%, Temple: 10%) and scheduled balance payment due at
--    \`scheduled_start_at - 24 hours\`.
--    Because that deadline had already passed (due_at <= now()), the initial balance
--    payment order created upon confirmation was immediately expired by
--    expire_stale_payment_orders. When the customer attempted to pay the remaining
--    balance, create_booking_balance_payment_order set due_at = now(), creating
--    orders that immediately expired and were rejected by create-razorpay-order
--    ("Payment order is not payable (current status: expired)"), preventing
--    customers from settling the balance or entering the live session.
--
-- 2. AUTHORITATIVE REMEDIATION:
--    A. public.create_or_validate_booking:
--       - Authoritatively evaluates scheduled_start_at against server time:
--         IF p_scheduled_start_at <= (now() + interval '24 hours') THEN
--             v_advance_percent := 100.00;
--         END IF;
--       - Sets advance_amount := total_amount exactly (100% upfront).
--       - Sets balance_amount := 0.00 (zero outstanding balance).
--       - Guarantees samagri, prasad, dakshina, and fees are included without duplicate charges.
--       - Creates a single payment order for the full amount (due_at = now() + 30 minutes).
--
--    B. public.create_booking_balance_payment_order:
--       - For existing bookings with an outstanding balance whose balance deadline passed:
--         - If scheduled_start_at <= now(): Rejects checkout ("Ritual scheduled start time has already passed").
--         - If within 24 hours: Grants an active 30-minute checkout window capped at ritual start:
--           v_due_at := LEAST(now() + interval '30 minutes', v_booking.scheduled_start_at);
--         - Refreshes open order or creates a fresh one so the devotee can complete payment.
--
--    C. public.confirm_booking_payment:
--       - When balance_amount = 0.00, skips booking_balance order insertion.
--       - Replaces fallback due_at = now() with LEAST(now() + interval '30 minutes', ...)
--         in both advance confirmation and prepone reschedule confirmation branches.
-- =============================================================================

`;

const migration061Content = migration061Header +
    "-- 1. FUNCTION: public.create_or_validate_booking (24-HOUR FULL PAYMENT ENFORCEMENT)\n" +
    createSql + "\n\n" +
    "-- 2. FUNCTION: public.create_booking_balance_payment_order (ACTIVE CHECKOUT WINDOW WITHIN 24H)\n" +
    balSql + "\n\n" +
    "-- 3. FUNCTION: public.confirm_booking_payment (ALIGNED BALANCE DEADLINE & CLEAN FULL PAYMENT CONFIRMATION)\n" +
    confSql + "\n";

const m061Path = path.resolve(__dirname, "../supabase/migrations/061_require_full_payment_within_24_hours.sql");
fs.writeFileSync(m061Path, migration061Content, "utf8");
console.log("Successfully created 061_require_full_payment_within_24_hours.sql! Total bytes:", migration061Content.length);
