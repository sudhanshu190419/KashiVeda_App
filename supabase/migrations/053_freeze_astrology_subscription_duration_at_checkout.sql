-- =============================================================================
-- Migration: 053_freeze_astrology_subscription_duration_at_checkout.sql
-- Description: AST-P01 Remediation: Freeze subscription duration at checkout
--              initiation to enforce Contract A (Checkout-Time Terms).
--
-- Background & Root Cause:
--   Prior to this migration, create_astrology_subscription_order snapshotted
--   the plan price in payment_orders.amount, but payment_orders did not persist
--   duration_days. In confirm_booking_payment, the payment capture path
--   re-queried astrology_subscription_plans for duration_days at capture time
--   and overwritten ends_at. As a consequence, administrator plan edits between
--   checkout initiation and payment capture could alter the duration granted
--   to the customer (e.g. paying for 30 days but receiving 7 days).
--
-- Invariants & Protections Enforced by this Migration:
--   1. Schema Extension: Adds duration_days INTEGER to public.payment_orders
--      with a non-null positive check constraint (duration_days IS NULL OR duration_days > 0).
--   2. Safe Backfill: Derives duration_days for existing pending subscription orders
--      where an exact positive day span can be established from the pending subscription.
--      Historical paid orders and unrelated purposes remain untouched.
--   3. Authoritative Order Creation: create_astrology_subscription_order snapshots
--      v_plan.duration_days directly into payment_orders within the same transaction
--      as v_plan.price, returning duration_days in the authoritative response.
--   4. Pending Order Reuse: Unexpired pending orders return their snapshotted duration_days.
--   5. Payment Capture Isolation: confirm_booking_payment enforces that v_order.duration_days
--      is valid and positive, and calculates the subscription period strictly from
--      v_order.duration_days rather than the mutable plan row.
--   6. Fail-Closed Validation: If duration_days is missing or non-positive on capture,
--      it raises an authoritative exception rather than falling back to current plan data.
--   7. Preserves AST-07 (customer serialization lock), AST-16 (atomic audit logging),
--      and AST-17 (strictly positive plan pricing).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema Extension: Add duration_days Snapshot to payment_orders
-- -----------------------------------------------------------------------------

ALTER TABLE public.payment_orders
    ADD COLUMN IF NOT EXISTS duration_days INTEGER;

ALTER TABLE public.payment_orders
    DROP CONSTRAINT IF EXISTS chk_payment_orders_duration_days_positive;

ALTER TABLE public.payment_orders
    ADD CONSTRAINT chk_payment_orders_duration_days_positive
    CHECK (duration_days IS NULL OR duration_days > 0);

COMMENT ON COLUMN public.payment_orders.duration_days IS
    'Authoritative immutable snapshot of the subscription duration in days at checkout order creation time.';

-- -----------------------------------------------------------------------------
-- 2. Safe Backfill: Recover duration_days for existing pending subscription orders
-- -----------------------------------------------------------------------------

-- For existing unpaid/payment_pending subscription payment orders, recover the
-- exact integer duration span established during their order-creation transaction.
UPDATE public.payment_orders po
SET duration_days = (EXTRACT(epoch FROM (s.ends_at - s.starts_at)) / 86400)::INTEGER
FROM public.astrology_subscriptions s
WHERE (po.subscription_id = s.id OR s.payment_order_id = po.id)
  AND po.purpose = 'subscription'::public.payment_order_purpose
  AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
  AND s.status = 'payment_pending'::public.astrology_subscription_status
  AND po.duration_days IS NULL
  AND s.ends_at > s.starts_at
  AND (EXTRACT(epoch FROM (s.ends_at - s.starts_at))::BIGINT % 86400 = 0)
  AND (EXTRACT(epoch FROM (s.ends_at - s.starts_at)) / 86400) >= 1;

-- -----------------------------------------------------------------------------
-- 3. Update public.create_astrology_subscription_order
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_astrology_subscription_order(
    p_plan_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_customer_id UUID;
    v_plan RECORD;
    v_existing_pending RECORD;
    v_active_sub RECORD;
    v_starts_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_subscription_id UUID;
    v_payment_order_id UUID;
BEGIN
    -- 1. Authenticate caller
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to subscribe to an astrology plan.';
    END IF;

    -- 2. Validate input
    IF p_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plan ID is required.';
    END IF;

    -- 3. Lock & Validate selected plan
    SELECT * INTO v_plan
    FROM public.astrology_subscription_plans
    WHERE id = p_plan_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected astrology plan not found.';
    END IF;

    IF NOT v_plan.is_active THEN
        RAISE EXCEPTION 'Selected astrology plan is not currently active.';
    END IF;

    IF v_plan.price IS NULL OR v_plan.price <= 0 THEN
        RAISE EXCEPTION 'Selected astrology plan does not have a valid price.';
    END IF;

    IF v_plan.duration_days IS NULL OR v_plan.duration_days <= 0 THEN
        RAISE EXCEPTION 'Selected astrology plan has an invalid duration.';
    END IF;

    -- 4. AST-07 Per-Customer Serialization Lock
    -- Acquire transaction-scoped advisory lock keyed to canonical customer UUID.
    PERFORM pg_advisory_xact_lock(
        ('x' || substr(md5('astrology_subscription_customer:' || v_customer_id::text), 1, 16))::bit(64)::bigint
    );

    -- 5. Idempotency Check (under customer serialization lock):
    -- Reuse existing unexpired payment_pending order for same plan within 30-minute window.
    SELECT s.id AS subscription_id, po.id AS payment_order_id, po.amount, po.currency, po.duration_days, s.starts_at, s.ends_at
    INTO v_existing_pending
    FROM public.astrology_subscriptions s
    JOIN public.payment_orders po ON po.id = s.payment_order_id
    WHERE s.customer_id = v_customer_id
      AND s.plan_id = v_plan.id
      AND s.status = 'payment_pending'::public.astrology_subscription_status
      AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
      AND po.created_at > (now() - INTERVAL '30 minutes')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_existing_pending.subscription_id IS NOT NULL THEN
        -- Contract A: Never fall back to mutable catalog plan duration for an existing pending order.
        -- If the pending order's snapshot is missing or invalid, fail closed rather than substituting catalog terms
        -- or creating a duplicate order while an unresolved pending order exists.
        IF v_existing_pending.duration_days IS NULL OR v_existing_pending.duration_days <= 0 THEN
            RAISE EXCEPTION 'Pending subscription order % has missing or invalid duration snapshot (value: %). Cannot reuse order without authoritative terms.',
                v_existing_pending.payment_order_id, v_existing_pending.duration_days;
        END IF;

        RETURN jsonb_build_object(
            'subscription_id', v_existing_pending.subscription_id,
            'payment_order_id', v_existing_pending.payment_order_id,
            'amount', v_existing_pending.amount,
            'currency', v_existing_pending.currency,
            'duration_days', v_existing_pending.duration_days,
            'status', 'payment_pending',
            'starts_at', v_existing_pending.starts_at,
            'ends_at', v_existing_pending.ends_at,
            'is_reused', true
        );
    END IF;

    -- 6. Calculate Subscription Validity Window (under customer serialization lock)
    -- If customer already has an active subscription, new term starts when active term ends.
    SELECT * INTO v_active_sub
    FROM public.astrology_subscriptions
    WHERE customer_id = v_customer_id
      AND status = 'active'::public.astrology_subscription_status
      AND ends_at > now()
    ORDER BY ends_at DESC
    LIMIT 1;

    IF v_active_sub.id IS NOT NULL THEN
        v_starts_at := v_active_sub.ends_at;
        v_ends_at := v_starts_at + (v_plan.duration_days || ' days')::INTERVAL;
    ELSE
        v_starts_at := now();
        v_ends_at := now() + (v_plan.duration_days || ' days')::INTERVAL;
    END IF;

    -- 7. Insert new astrology_subscriptions record in payment_pending state
    INSERT INTO public.astrology_subscriptions (
        customer_id,
        plan_id,
        starts_at,
        ends_at,
        status
    ) VALUES (
        v_customer_id,
        v_plan.id,
        v_starts_at,
        v_ends_at,
        'payment_pending'::public.astrology_subscription_status
    ) RETURNING id INTO v_subscription_id;

    -- 8. Insert authoritative payment_order obligation with duration_days snapshot
    INSERT INTO public.payment_orders (
        subscription_id,
        purpose,
        amount,
        currency,
        duration_days,
        status,
        provider
    ) VALUES (
        v_subscription_id,
        'subscription'::public.payment_order_purpose,
        v_plan.price,
        v_plan.currency,
        v_plan.duration_days,
        'created'::public.payment_order_status,
        'razorpay'
    ) RETURNING id INTO v_payment_order_id;

    -- 9. Complete backlink from subscription to payment_order
    UPDATE public.astrology_subscriptions
    SET payment_order_id = v_payment_order_id
    WHERE id = v_subscription_id;

    -- 10. Return authoritative order details including duration_days snapshot
    RETURN jsonb_build_object(
        'subscription_id', v_subscription_id,
        'payment_order_id', v_payment_order_id,
        'amount', v_plan.price,
        'currency', v_plan.currency,
        'duration_days', v_plan.duration_days,
        'status', 'payment_pending',
        'starts_at', v_starts_at,
        'ends_at', v_ends_at,
        'is_reused', false
    );
END;
$$;

COMMENT ON FUNCTION public.create_astrology_subscription_order(UUID) IS
    'Creates a customer astrology subscription in payment_pending state and a linked payment_order with authoritative price and duration_days snapshotted from the plan. Serialized per customer to guarantee race-free pending reuse.';

-- Explicit permissions: revoke PUBLIC/anon; grant authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.create_astrology_subscription_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_astrology_subscription_order(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Update public.confirm_booking_payment
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
    p_payment_order_id UUID,
    p_provider_payment_id TEXT,
    p_verified_amount NUMERIC(12,2),
    p_provider_signature TEXT DEFAULT NULL,
    p_raw_response JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_order RECORD;
    v_booking RECORD;
    v_pandit RECORD;
    v_kundli RECORD;
    v_subscription RECORD;
    v_active_sub RECORD;
    v_reschedule RECORD;
    v_existing_tx RECORD;
    v_transaction_id UUID;
    v_refund_id UUID;
    v_result JSONB;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_slot_valid BOOLEAN;
    v_rejection_reason TEXT;
    v_starts_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
BEGIN
    -- 1. Input Validation: Verified captured amount is strictly required
    IF p_payment_order_id IS NULL OR p_provider_payment_id IS NULL OR p_verified_amount IS NULL THEN
        RAISE EXCEPTION 'Payment order ID, provider payment ID, and verified captured amount are strictly required.';
    END IF;

    -- 2. Fetch & Lock Payment Order FOR UPDATE (Level 1 Lock in hierarchy)
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_payment_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_payment_order_id;
    END IF;

    -- 3. Exact Amount Verification: Captured amount must match payment order obligation
    IF p_verified_amount != v_order.amount THEN
        RAISE EXCEPTION 'Verified captured amount (%) does not match payment order obligation amount (%).', p_verified_amount, v_order.amount;
    END IF;

    -- 4. Validate Provider Payment Transaction Idempotency & Conflict Check
    SELECT * INTO v_existing_tx
    FROM public.payment_transactions
    WHERE provider_payment_id = p_provider_payment_id;

    IF FOUND THEN
        IF v_existing_tx.payment_order_id != p_payment_order_id THEN
            RAISE EXCEPTION 'Provider payment ID % is already registered to a different payment order (%).', p_provider_payment_id, v_existing_tx.payment_order_id;
        END IF;

        IF v_existing_tx.amount != p_verified_amount THEN
            RAISE EXCEPTION 'Provider payment ID % has a conflicting recorded transaction amount (%).', p_provider_payment_id, v_existing_tx.amount;
        END IF;

        IF v_existing_tx.status != 'captured' THEN
            RAISE EXCEPTION 'Provider payment ID % is not in captured status (current: %).', p_provider_payment_id, v_existing_tx.status;
        END IF;

        v_transaction_id := v_existing_tx.id;
    END IF;

    -- 5. Idempotency Check: If order is already marked paid
    IF v_order.status = 'paid' THEN
        IF v_existing_tx.id IS NULL THEN
            RAISE EXCEPTION 'Payment order is marked paid but no corresponding transaction exists for provider payment ID %.', p_provider_payment_id;
        END IF;

        -- Return idempotent success response branched by purpose
        IF v_order.purpose IN ('booking_advance', 'booking_balance') AND v_order.booking_id IS NOT NULL THEN
            SELECT * INTO v_booking FROM public.bookings WHERE id = v_order.booking_id;
            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'payment_transaction_id', v_existing_tx.id,
                'confirmed_at', COALESCE(v_booking.confirmed_at, v_existing_tx.paid_at)
            );
        ELSIF v_order.purpose = 'prepone_fee' AND v_order.booking_id IS NOT NULL THEN
            SELECT * INTO v_booking FROM public.bookings WHERE id = v_order.booking_id;
            SELECT * INTO v_reschedule 
            FROM public.booking_reschedule_requests 
            WHERE booking_id = v_booking.id 
              AND change_type = 'prepone' 
              AND fee_amount = v_order.amount
            ORDER BY created_at DESC 
            LIMIT 1;

            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', 'prepone_fee',
                'payment_order_id', v_order.id,
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'reschedule_request_id', v_reschedule.id,
                'reschedule_status', COALESCE(v_reschedule.status::text, 'unknown'),
                'payment_transaction_id', v_existing_tx.id,
                'paid_at', v_existing_tx.paid_at
            );
        ELSIF v_order.purpose = 'kundli' AND v_order.kundli_order_id IS NOT NULL THEN
            SELECT * INTO v_kundli FROM public.kundli_orders WHERE id = v_order.kundli_order_id;
            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'kundli_order_id', v_kundli.id,
                'order_number', v_kundli.order_number,
                'payment_transaction_id', v_existing_tx.id,
                'paid_at', v_existing_tx.paid_at
            );
        ELSIF v_order.purpose = 'subscription' AND v_order.subscription_id IS NOT NULL THEN
            SELECT * INTO v_subscription FROM public.astrology_subscriptions WHERE id = v_order.subscription_id;
            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', 'subscription',
                'payment_order_id', v_order.id,
                'subscription_id', v_subscription.id,
                'subscription_status', v_subscription.status,
                'duration_days', v_order.duration_days,
                'starts_at', v_subscription.starts_at,
                'ends_at', v_subscription.ends_at,
                'payment_transaction_id', v_existing_tx.id,
                'paid_at', v_existing_tx.paid_at
            );
        ELSE
            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'payment_transaction_id', v_existing_tx.id,
                'paid_at', v_existing_tx.paid_at
            );
        END IF;
    END IF;

    -- 6. Validate Payment Order Pre-Payment State (Only valid unpaid states: created, pending)
    IF v_order.status NOT IN ('created', 'pending') THEN
        RAISE EXCEPTION 'Payment order is in an invalid state for confirmation: %.', v_order.status;
    END IF;

    -- 7. Insert new immutable transaction with exact verified amount if not existing
    IF v_transaction_id IS NULL THEN
        INSERT INTO public.payment_transactions (
            payment_order_id,
            provider_payment_id,
            provider_signature,
            amount,
            status,
            paid_at,
            raw_response
        ) VALUES (
            p_payment_order_id,
            p_provider_payment_id,
            p_provider_signature,
            p_verified_amount,
            'captured'::public.payment_transaction_status,
            now(),
            p_raw_response
        ) RETURNING id INTO v_transaction_id;
    END IF;

    -- 8. Transition Payment Order to 'paid'
    UPDATE public.payment_orders
    SET status = 'paid'::public.payment_order_status,
        updated_at = now()
    WHERE id = p_payment_order_id;

    -- 9. Purpose-Specific State Transition Branching
    CASE v_order.purpose
        -- ------------------------------------------------------------
        -- booking_advance: Confirms initial booking advance payment
        -- ------------------------------------------------------------
        WHEN 'booking_advance' THEN
            IF v_order.booking_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose booking_advance must have an associated booking_id.';
            END IF;

            SELECT * INTO v_booking
            FROM public.bookings
            WHERE id = v_order.booking_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Booking % not found.', v_order.booking_id;
            END IF;

            IF v_booking.status != 'payment_pending' THEN
                RAISE EXCEPTION 'Booking is not in payment_pending state (current state: %).', v_booking.status;
            END IF;

            UPDATE public.bookings
            SET status = 'confirmed'::public.booking_status,
                confirmed_at = now(),
                updated_at = now()
            WHERE id = v_booking.id;

            v_result := jsonb_build_object(
                'status', 'confirmed',
                'purpose', 'booking_advance',
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'payment_transaction_id', v_transaction_id,
                'confirmed_at', now()
            );

        -- ------------------------------------------------------------
        -- booking_balance: Records remaining balance payment without changing booking status
        -- ------------------------------------------------------------
        WHEN 'booking_balance' THEN
            IF v_order.booking_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose booking_balance must have an associated booking_id.';
            END IF;

            SELECT * INTO v_booking
            FROM public.bookings
            WHERE id = v_order.booking_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Booking % not found.', v_order.booking_id;
            END IF;

            IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'completed', 'rescheduled') THEN
                RAISE EXCEPTION 'Cannot record balance payment for booking in state %.', v_booking.status;
            END IF;

            UPDATE public.bookings
            SET updated_at = now()
            WHERE id = v_booking.id;

            v_result := jsonb_build_object(
                'status', 'balance_paid',
                'purpose', 'booking_balance',
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'amount_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'paid_at', now()
            );

        -- ------------------------------------------------------------
        -- prepone_fee: Revalidates prepone slot under lock; approves or rejects + refunds
        -- ------------------------------------------------------------
        WHEN 'prepone_fee' THEN
            IF v_order.booking_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose prepone_fee must have an associated booking_id.';
            END IF;

            SELECT * INTO v_booking
            FROM public.bookings
            WHERE id = v_order.booking_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Booking % not found.', v_order.booking_id;
            END IF;

            SELECT * INTO v_pandit
            FROM public.pandit_profiles
            WHERE id = v_booking.pandit_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Pandit % not found.', v_booking.pandit_id;
            END IF;

            SELECT * INTO v_reschedule
            FROM public.booking_reschedule_requests
            WHERE booking_id = v_booking.id
              AND change_type = 'prepone'
              AND status = 'requested'
              AND fee_amount = v_order.amount
            ORDER BY created_at DESC 
            LIMIT 1
            FOR UPDATE;

            v_slot_valid := true;
            v_rejection_reason := NULL;

            IF NOT FOUND THEN
                v_slot_valid := false;
                v_rejection_reason := 'No matching pending prepone request found for booking.';
            ELSIF v_booking.reschedule_count >= 1 THEN
                v_slot_valid := false;
                v_rejection_reason := 'Reschedule limit reached. Only 1 reschedule is permitted per booking.';
            ELSIF v_reschedule.requested_start_at <= now() THEN
                v_slot_valid := false;
                v_rejection_reason := 'Requested prepone start time is no longer in the future.';
            ELSIF v_reschedule.requested_end_at <= v_reschedule.requested_start_at THEN
                v_slot_valid := false;
                v_rejection_reason := 'Requested prepone end time is before or equal to start time.';
            ELSIF v_pandit.verification_status != 'approved' OR v_pandit.public_status != 'available' THEN
                v_slot_valid := false;
                v_rejection_reason := 'Pandit is currently not available for bookings.';
            ELSE
                v_dow := EXTRACT(DOW FROM (v_reschedule.requested_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
                v_start_time := (v_reschedule.requested_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
                v_end_time := (v_reschedule.requested_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

                IF NOT EXISTS (
                    SELECT 1 
                    FROM public.pandit_availability_rules
                    WHERE pandit_id = v_booking.pandit_id
                      AND day_of_week = v_dow
                      AND is_active = true
                      AND start_time <= v_start_time
                      AND end_time >= v_end_time
                ) THEN
                    v_slot_valid := false;
                    v_rejection_reason := 'Requested time is outside the Pandit''s weekly working hours.';
                ELSIF EXISTS (
                    SELECT 1 
                    FROM public.pandit_unavailability_blocks
                    WHERE pandit_id = v_booking.pandit_id
                      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(v_reschedule.requested_start_at, v_reschedule.requested_end_at, '[)')
                ) THEN
                    v_slot_valid := false;
                    v_rejection_reason := 'Pandit has an active unavailability block during the requested time window.';
                ELSIF EXISTS (
                    SELECT 1 
                    FROM public.bookings
                    WHERE pandit_id = v_booking.pandit_id
                      AND id != v_booking.id
                      AND status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
                      AND tstzrange(scheduled_start_at, scheduled_end_at, '[)') && tstzrange(v_reschedule.requested_start_at, v_reschedule.requested_end_at, '[)')
                ) THEN
                    v_slot_valid := false;
                    v_rejection_reason := 'The requested prepone time slot conflicts with another confirmed booking.';
                END IF;
            END IF;

            IF NOT v_slot_valid THEN
                IF v_reschedule.id IS NOT NULL THEN
                    UPDATE public.booking_reschedule_requests
                    SET status = 'rejected'::public.reschedule_request_status
                    WHERE id = v_reschedule.id;
                END IF;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    v_order.amount,
                    COALESCE(v_rejection_reason, 'Prepone slot no longer available at payment confirmation time'),
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                v_result := jsonb_build_object(
                    'status', 'prepone_rejected',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'rejection_reason', v_rejection_reason,
                    'original_scheduled_start_at', v_booking.scheduled_start_at,
                    'original_scheduled_end_at', v_booking.scheduled_end_at,
                    'refund_required', true,
                    'refund_amount', v_order.amount,
                    'refund_id', v_refund_id,
                    'payment_transaction_id', v_transaction_id
                );
            ELSE
                UPDATE public.booking_reschedule_requests
                SET status = 'approved'::public.reschedule_request_status,
                    approved_at = now()
                WHERE id = v_reschedule.id;

                UPDATE public.bookings
                SET scheduled_start_at = v_reschedule.requested_start_at,
                    scheduled_end_at = v_reschedule.requested_end_at,
                    reschedule_count = reschedule_count + 1,
                    status = 'rescheduled'::public.booking_status,
                    updated_at = now()
                WHERE id = v_booking.id;

                v_result := jsonb_build_object(
                    'status', 'rescheduled',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'new_start_at', v_reschedule.requested_start_at,
                    'new_end_at', v_reschedule.requested_end_at,
                    'reschedule_count', v_booking.reschedule_count + 1,
                    'payment_transaction_id', v_transaction_id,
                    'approved_at', now()
                );
            END IF;

        -- ------------------------------------------------------------
        -- kundli: Transitions Kundli order to paid state
        -- ------------------------------------------------------------
        WHEN 'kundli' THEN
            IF v_order.kundli_order_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose kundli must have an associated kundli_order_id.';
            END IF;

            SELECT * INTO v_kundli
            FROM public.kundli_orders
            WHERE id = v_order.kundli_order_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Kundli order % not found.', v_order.kundli_order_id;
            END IF;

            IF v_kundli.status != 'payment_pending' THEN
                RAISE EXCEPTION 'Kundli order is not in payment_pending state (current state: %).', v_kundli.status;
            END IF;

            UPDATE public.kundli_orders
            SET status = 'paid'::public.kundli_order_status,
                updated_at = now()
            WHERE id = v_kundli.id;

            v_result := jsonb_build_object(
                'status', 'paid',
                'purpose', 'kundli',
                'kundli_order_id', v_kundli.id,
                'order_number', v_kundli.order_number,
                'amount_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'paid_at', now()
            );

        -- ------------------------------------------------------------
        -- subscription: Activates customer astrology subscription
        -- AST-P01 Remediation: Uses authoritative snapshotted duration_days
        -- from payment_orders rather than mutable current plan table
        -- ------------------------------------------------------------
        WHEN 'subscription' THEN
            IF v_order.subscription_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose subscription must have an associated subscription_id.';
            END IF;

            -- Level 2 Lock: Lock target subscription FOR UPDATE
            SELECT * INTO v_subscription
            FROM public.astrology_subscriptions
            WHERE id = v_order.subscription_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Astrology subscription % not found.', v_order.subscription_id;
            END IF;

            -- If subscription is already active (repeated confirmation of same order), return idempotently
            IF v_subscription.status = 'active'::public.astrology_subscription_status THEN
                v_result := jsonb_build_object(
                    'status', 'active',
                    'purpose', 'subscription',
                    'subscription_id', v_subscription.id,
                    'amount_paid', p_verified_amount,
                    'duration_days', v_order.duration_days,
                    'starts_at', v_subscription.starts_at,
                    'ends_at', v_subscription.ends_at,
                    'payment_transaction_id', v_transaction_id,
                    'paid_at', now()
                );
            ELSIF v_subscription.status != 'payment_pending'::public.astrology_subscription_status THEN
                RAISE EXCEPTION 'Astrology subscription is not in payment_pending state (current state: %).', v_subscription.status;
            ELSE
                -- Level 3 Lock: AST-07 Customer Serialization Lock
                -- Derive transaction-scoped advisory lock from canonical customer UUID.
                PERFORM pg_advisory_xact_lock(
                    ('x' || substr(md5('astrology_subscription_customer:' || v_subscription.customer_id::text), 1, 16))::bit(64)::bigint
                );

                -- AST-P01 Contract A Validation: Fail closed if order duration snapshot is missing or invalid
                IF v_order.duration_days IS NULL OR v_order.duration_days <= 0 THEN
                    RAISE EXCEPTION 'Payment order % has missing or invalid duration_days snapshot (value: %).', v_order.id, v_order.duration_days;
                END IF;

                -- Verify plan existence without reading its mutable duration
                IF NOT EXISTS (
                    SELECT 1 FROM public.astrology_subscription_plans WHERE id = v_subscription.plan_id
                ) THEN
                    RAISE EXCEPTION 'Astrology subscription plan % not found.', v_subscription.plan_id;
                END IF;

                -- RE-READ customer's latest active subscription AFTER obtaining customer lock.
                -- Any concurrent payment for the same customer that committed ahead of this lock
                -- is now visible here, guaranteeing sequential renewal without term overlap.
                SELECT * INTO v_active_sub
                FROM public.astrology_subscriptions
                WHERE customer_id = v_subscription.customer_id
                  AND id != v_subscription.id
                  AND status = 'active'::public.astrology_subscription_status
                  AND ends_at > now()
                ORDER BY ends_at DESC
                LIMIT 1;

                IF v_active_sub.id IS NOT NULL THEN
                    v_starts_at := v_active_sub.ends_at;
                    v_ends_at := v_starts_at + (v_order.duration_days || ' days')::INTERVAL;
                ELSE
                    v_starts_at := now();
                    v_ends_at := now() + (v_order.duration_days || ' days')::INTERVAL;
                END IF;

                -- Update subscription to active state with authoritative sequentially-allocated dates
                -- strictly using the snapshotted checkout-time duration_days
                UPDATE public.astrology_subscriptions
                SET status = 'active'::public.astrology_subscription_status,
                    starts_at = v_starts_at,
                    ends_at = v_ends_at
                WHERE id = v_subscription.id;

                v_result := jsonb_build_object(
                    'status', 'active',
                    'purpose', 'subscription',
                    'subscription_id', v_subscription.id,
                    'amount_paid', p_verified_amount,
                    'duration_days', v_order.duration_days,
                    'starts_at', v_starts_at,
                    'ends_at', v_ends_at,
                    'payment_transaction_id', v_transaction_id,
                    'paid_at', now()
                );
            END IF;

        -- ------------------------------------------------------------
        -- samagri / live_service / other: Safe generic confirmation
        -- ------------------------------------------------------------
        ELSE
            v_result := jsonb_build_object(
                'status', 'paid',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'amount_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'paid_at', now()
            );
    END CASE;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) IS
    'Authoritative payment capture confirmation RPC for Razorpay webhooks. Atomically handles bookings, Kundli orders, and astrology subscriptions with customer-scoped serialization and immutable order duration snapshots.';

-- Permissions for confirm_booking_payment (restricted strictly to service_role)
REVOKE EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;
