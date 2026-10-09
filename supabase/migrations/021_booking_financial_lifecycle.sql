-- =============================================================================
-- Migration: 021_booking_financial_lifecycle.sql
-- Description: Complete Booking Financial Lifecycle:
--              1. Canonical booking policy settings (Temple 50% advance, free reschedules)
--              2. Canonical cancellation policy tiers (>48h 100%, 24-48h 50%, <24h 0%)
--              3. Authoritative balance payment order creation RPC
--              4. Pandit-initiated cancellation with 100% customer refund RPC
--              5. Cancellation refund preview RPC (server-authoritative query)
--              6. Reschedule RPC enhancement for free 1st reschedule & balance due_at shifting
-- Source of Truth: Kashi Veda Booking Financial Lifecycle Specification (M11)
-- =============================================================================

-- =============================================================================
-- 1. Seed & Update Canonical Booking Policy Settings (Singleton id = 1)
-- =============================================================================
-- Home: 10%, Remote: 50%, Temple: 50%, Samagri: 100%, Kundli: 100%, Max Reschedules: 1, Prepone Fee: 0

INSERT INTO public.booking_policy_settings (
    id,
    home_advance_percent,
    temple_advance_percent,
    remote_advance_percent,
    samagri_advance_percent,
    kundli_advance_percent,
    max_reschedules,
    prepone_window_hours,
    postpone_window_hours,
    prepone_fee_amount
) VALUES (
    1,
    10.00,
    50.00,
    50.00,
    100.00,
    100.00,
    1,
    NULL,
    NULL,
    0.00
)
ON CONFLICT (id) DO UPDATE SET
    temple_advance_percent = 50.00,
    remote_advance_percent = 50.00,
    home_advance_percent = 10.00,
    samagri_advance_percent = 100.00,
    kundli_advance_percent = 100.00,
    max_reschedules = 1,
    prepone_fee_amount = 0.00,
    updated_at = now();


-- =============================================================================
-- 2. Seed Canonical Cancellation Policy Rules
-- =============================================================================
-- Tier 1: >48h before start -> 100% refund
-- Tier 2: 24h-48h before start -> 50% refund
-- Tier 3: <24h before start -> 0% refund

-- Clean existing placeholder/unconfigured rules to ensure deterministic lookup
DELETE FROM public.cancellation_policy_rules;

INSERT INTO public.cancellation_policy_rules (
    name,
    min_hours_before,
    max_hours_before,
    refund_percent,
    non_refundable_item_types,
    is_active
) VALUES 
(
    'Full Refund (>48h Before Ritual)',
    48,
    NULL,
    100.00,
    '{}'::public.line_item_type[],
    true
),
(
    'Partial Refund (24h–48h Before Ritual)',
    24,
    48,
    50.00,
    '{}'::public.line_item_type[],
    true
),
(
    'Non-Refundable (<24h Before Ritual)',
    0,
    24,
    0.00,
    '{}'::public.line_item_type[],
    true
);


-- =============================================================================
-- 3. Business Function: create_booking_balance_payment_order
-- =============================================================================
-- Creates or reuses an authoritative server-side payment order obligation for
-- remaining booking balance payment via Razorpay.

CREATE OR REPLACE FUNCTION public.create_booking_balance_payment_order(
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_balance_json JSONB;
    v_outstanding_balance NUMERIC(12,2);
    v_due_at TIMESTAMPTZ;
    v_existing_order RECORD;
    v_payment_order_id UUID;
BEGIN
    -- 1. Verify authenticated user
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a balance payment order.';
    END IF;

    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'Valid booking ID is strictly required.';
    END IF;

    -- 2. Fetch & lock booking row
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- 3. Ownership & Authorization Check
    IF v_booking.customer_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only pay the balance for your own bookings.';
    END IF;

    -- 4. State validation
    IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled') THEN
        RAISE EXCEPTION 'Cannot create balance payment order for booking in status ''%''.', v_booking.status;
    END IF;

    -- 5. Calculate outstanding balance using authoritative business function
    v_balance_json := public.calculate_booking_balance(p_booking_id);
    v_outstanding_balance := (v_balance_json->>'outstanding_balance')::NUMERIC(12,2);

    IF v_outstanding_balance IS NULL OR v_outstanding_balance <= 0 THEN
        RAISE EXCEPTION 'No outstanding balance due for booking % (balance: 0.00).', p_booking_id;
    END IF;

    -- 6. Compute due_at timestamp based on locked business rules:
    -- Standard cutoff: scheduled_start_at - 24 hours.
    -- If created/requested < 24 hours before scheduled_start_at: due immediately (now()).
    IF v_booking.scheduled_start_at - interval '24 hours' <= now() THEN
        v_due_at := now();
    ELSE
        v_due_at := v_booking.scheduled_start_at - interval '24 hours';
    END IF;

    -- 7. Check for existing open payment order for booking_balance
    SELECT * INTO v_existing_order
    FROM public.payment_orders
    WHERE booking_id = p_booking_id
      AND purpose = 'booking_balance'::public.payment_order_purpose
      AND status IN ('created', 'pending')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- Update amount and due_at to ensure exact real-time accuracy
        UPDATE public.payment_orders
        SET amount = v_outstanding_balance,
            due_at = v_due_at,
            updated_at = now()
        WHERE id = v_existing_order.id;

        v_payment_order_id := v_existing_order.id;
    ELSE
        -- Insert new authoritative payment order obligation
        INSERT INTO public.payment_orders (
            booking_id,
            purpose,
            amount,
            currency,
            status,
            provider,
            due_at
        ) VALUES (
            v_booking.id,
            'booking_balance'::public.payment_order_purpose,
            v_outstanding_balance,
            v_booking.currency,
            'created'::public.payment_order_status,
            'razorpay',
            v_due_at
        ) RETURNING id INTO v_payment_order_id;
    END IF;

    RETURN jsonb_build_object(
        'payment_order_id', v_payment_order_id,
        'booking_id', v_booking.id,
        'booking_number', v_booking.booking_number,
        'purpose', 'booking_balance',
        'amount', v_outstanding_balance,
        'currency', v_booking.currency,
        'due_at', v_due_at,
        'status', 'created'
    );
END;
$$;

COMMENT ON FUNCTION public.create_booking_balance_payment_order(UUID) IS
'Authoritative RPC to initiate a balance payment order for a confirmed booking.';

REVOKE EXECUTE ON FUNCTION public.create_booking_balance_payment_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_balance_payment_order(UUID) TO authenticated, service_role;


-- =============================================================================
-- 4. Business Function: preview_cancellation_refund
-- =============================================================================
-- Read-only simulation function that evaluates active cancellation policy tiers
-- against authoritative paid funds and line items without mutating any data.

CREATE OR REPLACE FUNCTION public.preview_cancellation_refund(
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_rule RECORD;
    v_hours_before NUMERIC;
    v_total_captured NUMERIC(12,2) := 0;
    v_total_already_refunded NUMERIC(12,2) := 0;
    v_net_captured NUMERIC(12,2) := 0;
    v_refundable_line_items_total NUMERIC(12,2) := 0;
    v_refundable_base NUMERIC(12,2) := 0;
    v_refund_percent NUMERIC(5,2) := 0;
    v_refund_amount NUMERIC(12,2) := 0;
    v_deduction_amount NUMERIC(12,2) := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to preview cancellation refund.';
    END IF;

    SELECT b.*, pp.user_id AS pandit_user_id
    INTO v_booking
    FROM public.bookings b
    JOIN public.pandit_profiles pp ON pp.id = b.pandit_id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.customer_id != v_caller_id 
       AND v_booking.pandit_user_id != v_caller_id 
       AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only view cancellation details for your own bookings.';
    END IF;

    -- Calculate total captured funds
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_total_captured
    FROM public.payment_transactions pt
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = v_booking.id
      AND pt.status IN ('captured', 'refunded', 'partially_refunded');

    -- Calculate total already refunded
    SELECT COALESCE(SUM(r.amount), 0) INTO v_total_already_refunded
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = v_booking.id
      AND r.status IN ('requested', 'processed');

    v_net_captured := GREATEST(v_total_captured - v_total_already_refunded, 0);

    -- If booking is in payment_pending or has zero captured funds
    IF v_booking.status = 'payment_pending' OR v_net_captured = 0 THEN
        RETURN jsonb_build_object(
            'booking_id', v_booking.id,
            'is_cancellable', v_booking.status NOT IN ('cancelled', 'completed', 'in_progress'),
            'hours_before', NULL,
            'total_captured', 0.00,
            'already_refunded', v_total_already_refunded,
            'net_captured', 0.00,
            'refundable_base', 0.00,
            'refund_percent', 0.00,
            'refund_amount', 0.00,
            'deduction_amount', 0.00,
            'policy_name', 'Zero Captured Funds / Payment Pending'
        );
    END IF;

    -- Evaluate active cancellation policy rule by hours notice
    v_hours_before := EXTRACT(EPOCH FROM (v_booking.scheduled_start_at - now())) / 3600.0;

    SELECT * INTO v_rule
    FROM public.cancellation_policy_rules
    WHERE is_active = true
      AND min_hours_before <= v_hours_before
      AND (max_hours_before IS NULL OR max_hours_before > v_hours_before)
    ORDER BY min_hours_before DESC
    LIMIT 1;

    IF FOUND THEN
        v_refund_percent := v_rule.refund_percent;

        SELECT COALESCE(SUM(total_price), 0) INTO v_refundable_line_items_total
        FROM public.booking_line_items
        WHERE booking_id = v_booking.id
          AND is_refundable = true
          AND NOT (item_type = ANY(v_rule.non_refundable_item_types));

        v_refundable_base := LEAST(v_refundable_line_items_total, v_net_captured);
        v_refund_amount := ROUND(v_refundable_base * v_refund_percent / 100.0, 2);
        v_deduction_amount := v_net_captured - v_refund_amount;
    ELSE
        v_refund_percent := 0.00;
        v_refundable_base := 0.00;
        v_refund_amount := 0.00;
        v_deduction_amount := v_net_captured;
    END IF;

    RETURN jsonb_build_object(
        'booking_id', v_booking.id,
        'is_cancellable', v_booking.status NOT IN ('cancelled', 'completed', 'in_progress'),
        'hours_before', ROUND(v_hours_before, 1),
        'total_captured', v_total_captured,
        'already_refunded', v_total_already_refunded,
        'net_captured', v_net_captured,
        'refundable_base', v_refundable_base,
        'refund_percent', v_refund_percent,
        'refund_amount', v_refund_amount,
        'deduction_amount', v_deduction_amount,
        'policy_name', COALESCE(v_rule.name, 'Non-Refundable Policy (<24h)')
    );
END;
$$;

COMMENT ON FUNCTION public.preview_cancellation_refund(UUID) IS
'Authoritative preview of refund amounts and policy slabs prior to cancellation confirmation.';

REVOKE EXECUTE ON FUNCTION public.preview_cancellation_refund(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_cancellation_refund(UUID) TO authenticated, service_role;


-- =============================================================================
-- 5. Business Function: pandit_cancel_booking
-- =============================================================================
-- Allows assigned Pandit or Admin to cancel a booking with 100% customer refund
-- and zero deduction penalty charged to the customer.

CREATE OR REPLACE FUNCTION public.pandit_cancel_booking(
    p_booking_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_total_captured NUMERIC(12,2) := 0;
    v_total_already_refunded NUMERIC(12,2) := 0;
    v_net_captured NUMERIC(12,2) := 0;
    v_refund_amount NUMERIC(12,2) := 0;
    v_cancellation_id UUID;
    v_remaining_refund NUMERIC(12,2);
    v_tx RECORD;
    v_tx_refunded NUMERIC(12,2);
    v_tx_capacity NUMERIC(12,2);
    v_this_refund NUMERIC(12,2);
BEGIN
    -- 1. Check authentication
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to cancel booking.';
    END IF;

    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'Booking ID is required.';
    END IF;

    -- 2. Fetch & lock booking row
    SELECT b.*, pp.user_id AS pandit_user_id
    INTO v_booking
    FROM public.bookings b
    JOIN public.pandit_profiles pp ON pp.id = b.pandit_id
    WHERE b.id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- 3. Authorization: Assigned Pandit or Admin only
    IF v_booking.pandit_user_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only the assigned Pandit or Admin can cancel this booking on behalf of the priest.';
    END IF;

    -- 4. State validation
    IF v_booking.status IN ('completed', 'in_progress') THEN
        RAISE EXCEPTION 'Booking cannot be cancelled in state ''%''.', v_booking.status;
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'status', 'already_cancelled',
            'booking_id', v_booking.id,
            'message', 'Booking has already been cancelled.'
        );
    END IF;

    -- 5. Calculate Total Captured Funds across all transactions
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_total_captured
    FROM public.payment_transactions pt
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = v_booking.id
      AND pt.status IN ('captured', 'refunded', 'partially_refunded');

    SELECT COALESCE(SUM(r.amount), 0) INTO v_total_already_refunded
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = v_booking.id
      AND r.status IN ('requested', 'processed');

    v_net_captured := GREATEST(v_total_captured - v_total_already_refunded, 0);

    -- Pandit cancellation grants 100% refund of all net captured funds
    v_refund_amount := v_net_captured;

    -- 6. Insert Cancellation record with Pandit cancellation policy snapshot
    INSERT INTO public.booking_cancellations (
        booking_id,
        cancelled_by,
        cancelled_at,
        reason,
        policy_rule_id,
        refund_base_amount,
        deduction_amount,
        refund_amount,
        policy_snapshot
    ) VALUES (
        v_booking.id,
        v_caller_id,
        now(),
        COALESCE(p_reason, 'Cancelled by Acharya / Pandit'),
        NULL,
        v_net_captured,
        0.00,
        v_refund_amount,
        jsonb_build_object(
            'cancellation_source', 'pandit',
            'pandit_id', v_booking.pandit_id,
            'refund_percent', 100.00,
            'deduction_amount', 0.00,
            'note', 'Pandit-initiated cancellation: 100% customer refund granted.'
        )
    ) RETURNING id INTO v_cancellation_id;

    -- 7. Distribute Refund Instruction across Captured Transactions
    v_remaining_refund := v_refund_amount;
    IF v_remaining_refund > 0 THEN
        FOR v_tx IN 
            SELECT pt.id, pt.amount
            FROM public.payment_transactions pt
            JOIN public.payment_orders po ON po.id = pt.payment_order_id
            WHERE po.booking_id = v_booking.id
              AND pt.status IN ('captured', 'refunded', 'partially_refunded')
            ORDER BY pt.created_at ASC
        LOOP
            IF v_remaining_refund <= 0 THEN
                EXIT;
            END IF;

            SELECT COALESCE(SUM(amount), 0) INTO v_tx_refunded
            FROM public.refunds
            WHERE payment_transaction_id = v_tx.id
              AND status IN ('requested', 'processed');

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
                    v_cancellation_id,
                    v_this_refund,
                    COALESCE(p_reason, 'Cancelled by Pandit: 100% customer refund'),
                    'requested'::public.refund_status
                );

                v_remaining_refund := v_remaining_refund - v_this_refund;
            END IF;
        END LOOP;
    END IF;

    -- 8. Cancel open payment orders for this booking
    UPDATE public.payment_orders
    SET status = 'cancelled'::public.payment_order_status,
        updated_at = now()
    WHERE booking_id = v_booking.id AND status IN ('created', 'pending');

    -- 9. Transition booking state to cancelled
    UPDATE public.bookings
    SET status = 'cancelled'::public.booking_status,
        cancelled_at = now(),
        updated_at = now()
    WHERE id = v_booking.id;

    RETURN jsonb_build_object(
        'status', 'cancelled',
        'cancellation_id', v_cancellation_id,
        'booking_id', v_booking.id,
        'total_captured', v_total_captured,
        'already_refunded', v_total_already_refunded,
        'net_captured', v_net_captured,
        'refund_amount', v_refund_amount,
        'deduction_amount', 0.00,
        'message', 'Booking cancelled by Pandit. 100% customer refund queued.'
    );
END;
$$;

COMMENT ON FUNCTION public.pandit_cancel_booking(UUID, TEXT) IS
'Allows assigned Pandit or Admin to cancel a booking and issue a 100% customer refund.';

REVOKE EXECUTE ON FUNCTION public.pandit_cancel_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pandit_cancel_booking(UUID, TEXT) TO authenticated, service_role;


-- =============================================================================
-- 6. Business Function: request_booking_reschedule (Free 1st Reschedule & Due Shift)
-- =============================================================================
-- Aligned with approved policy:
-- 1. 1 free reschedule (both prepone and postpone are 100% free)
-- 2. Shifts due_at for open balance payment orders to new scheduled time - 24h
-- 3. Enforces reschedule_count <= 1

CREATE OR REPLACE FUNCTION public.request_booking_reschedule(
    p_booking_id UUID,
    p_requested_start_at TIMESTAMPTZ,
    p_change_type public.reschedule_change_type DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_derived_change_type public.reschedule_change_type;
    v_duration INTERVAL;
    v_requested_end_at TIMESTAMPTZ;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_reschedule_id UUID;
    v_new_due_at TIMESTAMPTZ;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to reschedule a booking.';
    END IF;

    -- 1. Fetch & Lock Booking
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- Ownership Check
    IF v_booking.customer_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only reschedule your own bookings.';
    END IF;

    -- 2. State & Limit Validation
    IF v_booking.status NOT IN ('confirmed', 'upcoming', 'rescheduled') THEN
        RAISE EXCEPTION 'Booking cannot be rescheduled in its current state (%).', v_booking.status;
    END IF;

    IF v_booking.reschedule_count >= 1 THEN
        RAISE EXCEPTION 'Reschedule limit reached. Only 1 free reschedule is permitted per booking.';
    END IF;

    IF p_requested_start_at IS NULL OR p_requested_start_at <= now() THEN
        RAISE EXCEPTION 'New scheduled time must be in the future.';
    END IF;

    -- 3. Derive Change Type
    IF p_requested_start_at > v_booking.scheduled_start_at THEN
        v_derived_change_type := 'postpone'::public.reschedule_change_type;
    ELSIF p_requested_start_at < v_booking.scheduled_start_at THEN
        v_derived_change_type := 'prepone'::public.reschedule_change_type;
    ELSE
        RAISE EXCEPTION 'Requested time must be different from current scheduled time.';
    END IF;

    -- 4. Lock Pandit Row to Prevent Concurrent Double-Booking
    PERFORM 1
    FROM public.pandit_profiles
    WHERE id = v_booking.pandit_id
    FOR UPDATE;

    v_duration := v_booking.scheduled_end_at - v_booking.scheduled_start_at;
    v_requested_end_at := p_requested_start_at + v_duration;

    -- 5. Verify Pandit Availability for New Slot (Asia/Kolkata Timezone)
    v_dow := EXTRACT(DOW FROM (p_requested_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
    v_start_time := (p_requested_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
    v_end_time := (v_requested_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

    IF NOT EXISTS (
        SELECT 1 
        FROM public.pandit_availability_rules
        WHERE pandit_id = v_booking.pandit_id
          AND day_of_week = v_dow
          AND is_active = true
          AND start_time <= v_start_time
          AND end_time >= v_end_time
    ) THEN
        RAISE EXCEPTION 'Requested new time slot is outside the Pandit''s working hours.';
    END IF;

    -- Check Unavailability blocks
    IF EXISTS (
        SELECT 1 
        FROM public.pandit_unavailability_blocks
        WHERE pandit_id = v_booking.pandit_id
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange(p_requested_start_at, v_requested_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Pandit is unavailable during the requested new time slot.';
    END IF;

    -- Conflict Check Against Other Active Bookings
    IF EXISTS (
        SELECT 1 
        FROM public.bookings
        WHERE pandit_id = v_booking.pandit_id
          AND id != v_booking.id
          AND status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
          AND tstzrange(scheduled_start_at, scheduled_end_at, '[)') && tstzrange(p_requested_start_at, v_requested_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'The requested new time slot conflicts with an existing booking.';
    END IF;

    -- 6. Approved 1st Free Reschedule: Auto-approve immediately (Fee = ₹0.00)
    INSERT INTO public.booking_reschedule_requests (
        booking_id,
        requested_by,
        change_type,
        old_start_at,
        old_end_at,
        requested_start_at,
        requested_end_at,
        fee_amount,
        status,
        approved_at
    ) VALUES (
        v_booking.id,
        v_caller_id,
        v_derived_change_type,
        v_booking.scheduled_start_at,
        v_booking.scheduled_end_at,
        p_requested_start_at,
        v_requested_end_at,
        0.00,
        'approved'::public.reschedule_request_status,
        now()
    ) RETURNING id INTO v_reschedule_id;

    -- Update booking timestamps, status, and reschedule counter
    UPDATE public.bookings
    SET scheduled_start_at = p_requested_start_at,
        scheduled_end_at = v_requested_end_at,
        reschedule_count = reschedule_count + 1,
        status = 'rescheduled'::public.booking_status,
        updated_at = now()
    WHERE id = v_booking.id;

    -- 7. Shift due_at for open balance payment orders to new scheduled time
    IF p_requested_start_at - interval '24 hours' <= now() THEN
        v_new_due_at := now();
    ELSE
        v_new_due_at := p_requested_start_at - interval '24 hours';
    END IF;

    UPDATE public.payment_orders
    SET due_at = v_new_due_at,
        updated_at = now()
    WHERE booking_id = v_booking.id
      AND purpose = 'booking_balance'::public.payment_order_purpose
      AND status IN ('created', 'pending');

    RETURN jsonb_build_object(
        'status', 'rescheduled',
        'reschedule_request_id', v_reschedule_id,
        'booking_id', v_booking.id,
        'old_start_at', v_booking.scheduled_start_at,
        'new_start_at', p_requested_start_at,
        'new_end_at', v_requested_end_at,
        'fee_amount', 0.00,
        'reschedule_count', v_booking.reschedule_count + 1,
        'balance_due_at', v_new_due_at
    );
END;
$$;

COMMENT ON FUNCTION public.request_booking_reschedule(UUID, TIMESTAMPTZ, public.reschedule_change_type) IS
'Authoritative RPC for 1-time free booking reschedule with automatic balance due_at shifting.';

REVOKE EXECUTE ON FUNCTION public.request_booking_reschedule(UUID, TIMESTAMPTZ, public.reschedule_change_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_booking_reschedule(UUID, TIMESTAMPTZ, public.reschedule_change_type) TO authenticated, service_role;
