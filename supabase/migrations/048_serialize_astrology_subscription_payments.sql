-- =============================================================================
-- Migration: 048_serialize_astrology_subscription_payments.sql
-- Description: Remediate AST-07 by establishing transaction-scoped customer-level
--              serialization for astrology subscription order creation and payment
--              confirmation term allocation. Prevents overlapping subscription
--              intervals under concurrent payments and eliminates races during
--              pending order reuse. Harmonizes global lock ordering across
--              capture, creation, and cancellation to prevent deadlocks.
-- Target Audit Finding: AST-07 (Distinct concurrent subscription orders can consume
--                       paid terms in parallel)
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Architecture
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ARCHITECTURAL DESIGN & CONCURRENCY PROTOCOL:
--
-- 1. Root Cause of Interval Overlap (AST-07):
--    Prior to this migration, confirm_booking_payment locked only the individual
--    payment_order row and target astrology_subscriptions row for the order being
--    confirmed. When a customer submitted two distinct subscription payments
--    concurrently (e.g. from rapid user interactions or concurrent webhooks),
--    both transactions held locks on distinct rows (Order A != Order B,
--    Subscription A != Subscription B) and therefore did NOT serialize.
--    Both transactions concurrently queried for active subscriptions:
--      SELECT * FROM public.astrology_subscriptions
--      WHERE customer_id = ... AND id != ... AND status = 'active' AND ends_at > now()
--    Under Read Committed isolation, neither uncommitted active interval was visible
--    to the other. Both transactions calculated identical starts_at and ends_at intervals
--    from the same pre-existing active timestamp (or now()), producing overlapping
--    subscription access rather than extending the subscription term sequentially.
--
-- 2. Root Cause of Pending Order Creation Race:
--    In create_astrology_subscription_order, concurrent requests from the same
--    customer checked for an existing payment_pending order without serialization.
--    Both requests saw no pending order and both inserted separate pending orders,
--    violating the 30-minute pending-reuse policy and creating redundant checkout
--    obligations that could subsequently be paid concurrently.
--
-- 3. Stable Customer Serialization Mechanism:
--    We introduce a transaction-scoped PostgreSQL advisory lock keyed to the
--    canonical customer UUID:
--      pg_advisory_xact_lock(('x' || substr(md5('astrology_subscription_customer:' || customer_id::text), 1, 16))::bit(64)::bigint)
--
--    Properties & Invariants:
--    a. Transaction-Scoped: Released automatically at COMMIT or ROLLBACK.
--    b. Canonical Key: Derived deterministically from customer_id; unrelated customers
--       operate with distinct 64-bit keys with zero contention.
--    c. Independent of Row Existence: Operates reliably even when customer has no
--       prior subscription rows.
--    d. Re-Reading Under Lock: Active intervals and pending-order reuse are re-evaluated
--       AFTER acquiring the lock, ensuring visibility of recently committed terms.
--
-- 4. Global Lock Ordering Hierarchy:
--    To mathematically eliminate circular wait deadlocks across concurrent transaction
--    paths (creation, capture, cancellation), all paths adhere to the strict partial order:
--      Level 1: payment_orders row lock(s) (FOR UPDATE)
--      Level 2: astrology_subscriptions row lock (FOR UPDATE)
--      Level 3: Customer advisory transaction lock (pg_advisory_xact_lock)
--
--    In confirm_booking_payment:
--      Locks payment_orders (Level 1) -> locks astrology_subscriptions (Level 2)
--      -> acquires customer advisory lock (Level 3) -> re-reads active terms -> commits.
--
--    In admin_cancel_astrology_subscription:
--      Locks open payment_orders (Level 1) -> locks astrology_subscriptions (Level 2)
--      -> acquires customer advisory lock (Level 3) -> performs cancellation & refund queuing -> commits.
--      (Serializes against capture of other subscriptions for the same customer to prevent gap/inconsistent allocation).
--
--    In create_astrology_subscription_order:
--      Acquires customer advisory lock -> evaluates reuse / reads active intervals
--      -> inserts pending records -> commits.
--      (Does not acquire Level 1 or 2 row locks on existing records, preventing inversion).
-- -----------------------------------------------------------------------------


-- =============================================================================
-- 1. Function: public.create_astrology_subscription_order
-- =============================================================================

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
    -- Acquire transaction-scoped advisory lock keyed to the canonical customer UUID.
    -- This serializes concurrent checkout requests for the same customer, preventing
    -- duplicate pending-order creation and ensuring stale pending checks cannot race.
    PERFORM pg_advisory_xact_lock(
        ('x' || substr(md5('astrology_subscription_customer:' || v_customer_id::text), 1, 16))::bit(64)::bigint
    );

    -- 5. Idempotency Check (under customer serialization lock):
    -- Reuse existing unexpired payment_pending order for same plan within 30-minute window.
    SELECT s.id AS subscription_id, po.id AS payment_order_id, po.amount, po.currency, s.starts_at, s.ends_at
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
        RETURN jsonb_build_object(
            'subscription_id', v_existing_pending.subscription_id,
            'payment_order_id', v_existing_pending.payment_order_id,
            'amount', v_existing_pending.amount,
            'currency', v_existing_pending.currency,
            'status', 'payment_pending',
            'starts_at', v_existing_pending.starts_at,
            'ends_at', v_existing_pending.ends_at,
            'is_reused', true
        );
    END IF;

    -- 6. Calculate Subscription Validity Window (under customer serialization lock)
    -- If customer already has an active subscription, the new term starts when the current active term ends.
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

    -- 8. Insert authoritative 100% upfront payment_order obligation
    INSERT INTO public.payment_orders (
        subscription_id,
        purpose,
        amount,
        currency,
        status,
        provider
    ) VALUES (
        v_subscription_id,
        'subscription'::public.payment_order_purpose,
        v_plan.price,
        v_plan.currency,
        'created'::public.payment_order_status,
        'razorpay'
    ) RETURNING id INTO v_payment_order_id;

    -- 9. Complete backlink from subscription to payment_order
    UPDATE public.astrology_subscriptions
    SET payment_order_id = v_payment_order_id
    WHERE id = v_subscription_id;

    -- 10. Return minimal authoritative order details
    RETURN jsonb_build_object(
        'subscription_id', v_subscription_id,
        'payment_order_id', v_payment_order_id,
        'amount', v_plan.price,
        'currency', v_plan.currency,
        'status', 'payment_pending',
        'starts_at', v_starts_at,
        'ends_at', v_ends_at,
        'is_reused', false
    );
END;
$$;

COMMENT ON FUNCTION public.create_astrology_subscription_order(UUID) IS
    'Creates a customer astrology subscription in payment_pending state and a linked payment_order with authoritative price derived from the active plan. Serialized per customer to guarantee race-free pending reuse.';

-- Explicit permissions: revoke PUBLIC/anon; grant authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.create_astrology_subscription_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_astrology_subscription_order(UUID) TO authenticated, service_role;


-- =============================================================================
-- 2. Function: public.confirm_booking_payment
-- =============================================================================

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
    v_plan RECORD;
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
        -- AST-07 Remediation: Serializes concurrent activations per-customer
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

            -- If subscription is already active (e.g. repeated confirmation of same order), return idempotently
            IF v_subscription.status = 'active'::public.astrology_subscription_status THEN
                v_result := jsonb_build_object(
                    'status', 'active',
                    'purpose', 'subscription',
                    'subscription_id', v_subscription.id,
                    'amount_paid', p_verified_amount,
                    'starts_at', v_subscription.starts_at,
                    'ends_at', v_subscription.ends_at,
                    'payment_transaction_id', v_transaction_id,
                    'paid_at', now()
                );
            ELSIF v_subscription.status != 'payment_pending'::public.astrology_subscription_status THEN
                RAISE EXCEPTION 'Astrology subscription is not in payment_pending state (current state: %).', v_subscription.status;
            ELSE
                -- Level 3 Lock: AST-07 Customer Serialization Lock
                -- Locks on distinct payment orders or distinct subscriptions do NOT serialize
                -- term allocation for the same customer.
                -- We acquire a transaction-scoped advisory lock derived from canonical customer UUID.
                PERFORM pg_advisory_xact_lock(
                    ('x' || substr(md5('astrology_subscription_customer:' || v_subscription.customer_id::text), 1, 16))::bit(64)::bigint
                );

                -- Read plan for duration_days
                SELECT * INTO v_plan
                FROM public.astrology_subscription_plans
                WHERE id = v_subscription.plan_id;

                IF NOT FOUND THEN
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
                    v_ends_at := v_starts_at + (v_plan.duration_days || ' days')::INTERVAL;
                ELSE
                    v_starts_at := now();
                    v_ends_at := now() + (v_plan.duration_days || ' days')::INTERVAL;
                END IF;

                -- Update subscription to active state with authoritative sequentially-allocated dates
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
    'Authoritative payment capture confirmation RPC for Razorpay webhooks. Atomically handles bookings, Kundli orders, and astrology subscriptions with customer-scoped serialization.';

-- Permissions for confirm_booking_payment (restricted strictly to service_role)
REVOKE EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;


-- =============================================================================
-- 3. Function: public.admin_cancel_astrology_subscription
-- =============================================================================
-- Harmonizes lock acquisition order: locks open payment orders associated with
-- the subscription before locking the subscription row, matching the global
-- (payment_orders -> astrology_subscriptions) hierarchy.

CREATE OR REPLACE FUNCTION public.admin_cancel_astrology_subscription(
    p_subscription_id UUID,
    p_reason TEXT,
    p_refund_eligible BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_subscription RECORD;
    v_trimmed_reason TEXT;
    v_total_captured NUMERIC(12,2) := 0;
    v_total_already_refunded NUMERIC(12,2) := 0;
    v_net_captured NUMERIC(12,2) := 0;
    v_refund_amount NUMERIC(12,2) := 0;
    v_remaining_refund NUMERIC(12,2) := 0;
    v_tx RECORD;
    v_tx_refunded NUMERIC(12,2) := 0;
    v_tx_capacity NUMERIC(12,2) := 0;
    v_this_refund NUMERIC(12,2) := 0;
    v_refund_id UUID;
BEGIN
    -- 1. Authorization: Super Administrator privileges strictly required
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_super_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Super Administrator privileges required to cancel astrology subscriptions.';
    END IF;

    -- 2. Validate cancellation reason
    v_trimmed_reason := trim(COALESCE(p_reason, ''));
    IF length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'A detailed cancellation reason of at least 5 characters is required.';
    END IF;

    -- 3. Lock Ordering Harmonization (Level 1 Lock before Level 2 Lock):
    -- Lock open payment orders associated with this subscription first
    -- to maintain consistent global lock acquisition order:
    -- payment_orders -> astrology_subscriptions
    PERFORM id FROM public.payment_orders
    WHERE subscription_id = p_subscription_id
    FOR UPDATE;

    -- Fetch & Lock Astrology Subscription FOR UPDATE (Level 2 Lock)
    SELECT * INTO v_subscription
    FROM public.astrology_subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrology subscription % not found.', p_subscription_id;
    END IF;

    -- Level 3 Lock: AST-07 Customer Serialization Lock
    -- Acquire transaction-scoped advisory lock keyed to canonical customer UUID.
    -- Ensures cancellation of one subscription and renewal term allocation of
    -- another subscription for the same customer are strictly serialized, preventing
    -- access gaps or inconsistent term allocations.
    PERFORM pg_advisory_xact_lock(
        ('x' || substr(md5('astrology_subscription_customer:' || v_subscription.customer_id::text), 1, 16))::bit(64)::bigint
    );

    -- 4. Terminal State Protection
    IF v_subscription.status = 'expired' THEN
        RAISE EXCEPTION 'Cannot cancel astrology subscription in expired status. Subscription term has already concluded.';
    END IF;

    -- Idempotency check: Already cancelled
    IF v_subscription.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_cancelled',
            'subscription_id', v_subscription.id,
            'message', 'Astrology subscription has already been cancelled.'
        );
    END IF;

    -- 5. Calculate Total Captured Funds across Linked Payment Transactions
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_total_captured
    FROM public.payment_transactions pt
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.subscription_id = v_subscription.id
      AND pt.status IN ('captured', 'refunded', 'partially_refunded');

    -- 6. Calculate Already Refunded Funds across Linked Payment Transactions
    SELECT COALESCE(SUM(r.amount), 0) INTO v_total_already_refunded
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.subscription_id = v_subscription.id
      AND r.status IN ('requested', 'processing', 'processed');

    v_net_captured := GREATEST(v_total_captured - v_total_already_refunded, 0);

    -- 7. Determine Refund Obligation Amount
    IF p_refund_eligible THEN
        v_refund_amount := v_net_captured;
    ELSE
        v_refund_amount := 0;
    END IF;

    -- 8. Distribute Refund across Captured Transactions into public.refunds (status: 'requested')
    v_remaining_refund := v_refund_amount;
    IF v_remaining_refund > 0 THEN
        FOR v_tx IN 
            SELECT pt.id, pt.amount
            FROM public.payment_transactions pt
            JOIN public.payment_orders po ON po.id = pt.payment_order_id
            WHERE po.subscription_id = v_subscription.id
              AND pt.status IN ('captured', 'refunded', 'partially_refunded')
            ORDER BY pt.created_at ASC
        LOOP
            IF v_remaining_refund <= 0 THEN
                EXIT;
            END IF;

            SELECT COALESCE(SUM(amount), 0) INTO v_tx_refunded
            FROM public.refunds
            WHERE payment_transaction_id = v_tx.id
              AND status IN ('requested', 'processing', 'processed');

            v_tx_capacity := GREATEST(v_tx.amount - v_tx_refunded, 0);

            IF v_tx_capacity > 0 THEN
                v_this_refund := LEAST(v_remaining_refund, v_tx_capacity);

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_tx.id,
                    NULL,
                    v_this_refund,
                    v_trimmed_reason,
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                v_remaining_refund := v_remaining_refund - v_this_refund;
            END IF;
        END LOOP;
    END IF;

    -- 9. Cancel Any Open / Pending Payment Orders
    UPDATE public.payment_orders
    SET status = 'cancelled'::public.payment_order_status,
        updated_at = now()
    WHERE subscription_id = v_subscription.id
      AND status IN ('created', 'pending');

    -- 10. Transition Astrology Subscription to Cancelled
    UPDATE public.astrology_subscriptions
    SET status = 'cancelled'::public.astrology_subscription_status
    WHERE id = v_subscription.id;

    -- 11. Record Authoritative Admin Audit Log
    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_caller_id,
            'astrology_subscription_cancelled_by_admin',
            'astrology_subscriptions',
            v_subscription.id::text,
            jsonb_build_object(
                'previous_status', v_subscription.status,
                'new_status', 'cancelled',
                'reason', v_trimmed_reason,
                'refund_eligible', p_refund_eligible,
                'refund_amount', v_refund_amount,
                'total_captured', v_total_captured,
                'already_refunded', v_total_already_refunded
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'cancelled',
        'subscription_id', v_subscription.id,
        'previous_status', v_subscription.status,
        'total_captured', v_total_captured,
        'already_refunded', v_total_already_refunded,
        'refund_amount', v_refund_amount,
        'refund_eligible', p_refund_eligible,
        'message', CASE 
            WHEN v_refund_amount > 0 THEN 'Astrology subscription cancelled. Refund obligation queued in requested state.'
            ELSE 'Astrology subscription cancelled without refund obligation.'
        END
    );
END;
$$;

COMMENT ON FUNCTION public.admin_cancel_astrology_subscription(UUID, TEXT, BOOLEAN) IS
'Authoritative administrative cancellation for customer astrology subscriptions. Super Administrator only. Cancels open payment orders with deadlock-free lock order, updates status to cancelled, and optionally queues refund obligation in public.refunds.';

REVOKE EXECUTE ON FUNCTION public.admin_cancel_astrology_subscription(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_astrology_subscription(UUID, TEXT, BOOLEAN) TO authenticated, service_role;
