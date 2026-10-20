-- =============================================================================
-- Migration 058: Fix Cancellation Refund Base Invariant & Check Constraint Compatibility
--
-- TARGET ISSUE:
-- When cancelling a paid ritual booking with non-refundable line items (e.g. samagri),
-- public.cancel_booking_and_calculate_refund previously inserted v_refundable_base (e.g. ₹49.00)
-- into public.booking_cancellations.refund_base_amount, while setting deduction_amount
-- to (v_net_captured - v_refund_amount) (e.g. ₹480.40) and refund_amount to ₹24.50.
--
-- This violated database check constraint chk_booking_cancellations_amount_math:
--   CHECK (refund_base_amount = refund_amount + deduction_amount)
-- Because:
--   49.00 != 24.50 + 480.40 (= 504.90)
--
-- REMEDIATION:
-- 1. Sets refund_base_amount = v_net_captured in public.booking_cancellations.
--    Because deduction_amount = v_net_captured - v_refund_amount, the arithmetic identity:
--      refund_base_amount = refund_amount + deduction_amount
--      v_net_captured = v_refund_amount + (v_net_captured - v_refund_amount) = v_net_captured
--    holds unconditionally under all policy slabs, item breakdowns, and rounding boundaries.
--
-- 2. Records granular line item audit data in policy_snapshot:
--      refundable_base: line items eligible for policy discount (puja dakshina)
--      non_refundable_base: line items withheld 100% (samagri / supplies)
--      net_captured: total paid funds being resolved
--      refund_percent: tier percentage applied to refundable_base
--
-- 3. Synchronizes preview_cancellation_refund and cancel_booking_and_calculate_refund
--    to return identical authoritative fields (net_captured, refundable_base,
--    refund_base_amount, refund_percent, deduction_amount, refund_amount).
--
-- 4. Preserves atomic transaction boundaries, exclusive row locks, and standard
--    Razorpay Payments refund queues.
-- =============================================================================

-- 1. Update public.cancel_booking_and_calculate_refund
CREATE OR REPLACE FUNCTION public.cancel_booking_and_calculate_refund(
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
    v_cancellation_id UUID;
    v_remaining_refund NUMERIC(12,2);
    v_tx RECORD;
    v_tx_refunded NUMERIC(12,2);
    v_tx_capacity NUMERIC(12,2);
    v_this_refund NUMERIC(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to cancel a booking.';
    END IF;

    -- 1. Fetch & Lock Booking (Atomic concurrency protection)
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.customer_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only cancel your own bookings.';
    END IF;

    IF v_booking.status IN ('cancelled', 'completed', 'in_progress') THEN
        RAISE EXCEPTION 'Booking cannot be cancelled in its current state (%).', v_booking.status;
    END IF;

    -- 2. Calculate Total Captured Funds across payment transactions
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_total_captured
    FROM public.payment_transactions pt
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = v_booking.id
      AND pt.status IN ('captured', 'refunded', 'partially_refunded');

    -- 3. Calculate Already Refunded Funds
    SELECT COALESCE(SUM(r.amount), 0) INTO v_total_already_refunded
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = v_booking.id
      AND r.status IN ('requested', 'processed');

    v_net_captured := GREATEST(v_total_captured - v_total_already_refunded, 0);

    -- 4. Evaluate Cancellation Policy
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
        v_refundable_base := 0;
        v_refund_percent := 0;
        v_refund_amount := 0;
        v_deduction_amount := v_net_captured;
    END IF;

    -- 5. Record Cancellation & Granular Policy Snapshot
    -- refund_base_amount is authoritative net captured funds resolved by this cancellation.
    -- Invariant: refund_base_amount = refund_amount + deduction_amount (chk_booking_cancellations_amount_math)
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
        p_reason,
        v_rule.id,
        v_net_captured,
        v_deduction_amount,
        v_refund_amount,
        jsonb_build_object(
            'rule_id', v_rule.id,
            'rule_name', v_rule.name,
            'hours_before', v_hours_before,
            'refund_percent', v_refund_percent,
            'non_refundable_items', v_rule.non_refundable_item_types,
            'net_captured', v_net_captured,
            'refundable_base', v_refundable_base,
            'non_refundable_base', (v_net_captured - v_refundable_base)
        )
    ) RETURNING id INTO v_cancellation_id;

    -- 6. Distribute Refund Instruction across Captured Transactions
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
                    p_reason,
                    'requested'::public.refund_status
                );

                v_remaining_refund := v_remaining_refund - v_this_refund;
            END IF;
        END LOOP;
    END IF;

    -- 7. Cancel Any Remaining Open Payment Orders
    UPDATE public.payment_orders
    SET status = 'cancelled'::public.payment_order_status,
        updated_at = now()
    WHERE booking_id = v_booking.id AND status IN ('created', 'pending');

    -- 8. Transition Booking State
    UPDATE public.bookings
    SET status = 'cancelled'::public.booking_status,
        cancelled_at = now(),
        updated_at = now()
    WHERE id = v_booking.id;

    -- 9. Authoritative Audit Trail for Admin Execution
    IF public.is_admin(v_caller_id) THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_caller_id,
            'booking_cancelled_by_admin_for_devotee',
            'booking',
            v_booking.id,
            jsonb_build_object(
                'cancellation_id', v_cancellation_id,
                'refund_amount', v_refund_amount,
                'deduction_amount', v_deduction_amount,
                'refund_percent', v_refund_percent,
                'net_captured', v_net_captured,
                'refundable_base', v_refundable_base,
                'reason', p_reason
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'cancelled',
        'cancellation_id', v_cancellation_id,
        'total_captured', v_total_captured,
        'already_refunded', v_total_already_refunded,
        'net_captured', v_net_captured,
        'refundable_base', v_refundable_base,
        'refund_base_amount', v_net_captured,
        'refund_amount', v_refund_amount,
        'deduction_amount', v_deduction_amount,
        'refund_percent', v_refund_percent
    );
END;
$$;

COMMENT ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) IS
'Authoritative cancellation RPC that enforces exact math invariants (refund_base_amount = refund_amount + deduction_amount) and queues refunds.';

REVOKE EXECUTE ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) TO authenticated, service_role;


-- 2. Update public.preview_cancellation_refund
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
            'refund_base_amount', 0.00,
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
        'refund_base_amount', v_net_captured,
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
