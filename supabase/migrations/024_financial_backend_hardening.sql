-- =============================================================================
-- Migration 024: Financial Backend Hardening (M17 Production Prerequisite)
-- =============================================================================
-- 1. Adds 'processing' state to public.refund_status enum for concurrency safety
--    and exclusive lock claiming before external gateway execution.
-- 2. Restores narrow, least-privilege EXECUTE grants on core booking RPCs that
--    were revoked in Migration 012's blanket routine revoke.
-- 3. Attaches transactional server-side financial audit log recording to
--    cancel_booking_and_calculate_refund, pandit_cancel_booking, and mark_booking_completed.
-- 4. Implements authoritative exclusive refund claim RPC (claim_refund_for_execution).
-- 5. Implements authoritative atomic refund reconciliation RPCs
--    (reconcile_processed_refund, reconcile_failed_refund) ensuring non-regressing
--    state transitions, strict amount validation, and idempotent gateway webhooks.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum Evolution: Add 'processing' to refund_status
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
    ALTER TYPE public.refund_status ADD VALUE IF NOT EXISTS 'processing' AFTER 'requested';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 2. Narrow RPC Execution Grants & Audit Authority
-- -----------------------------------------------------------------------------
-- Restore execution access for authenticated callers with internal ownership /
-- admin authorization checks, preserving SECURITY DEFINER behavior.

-- 2.1 calculate_booking_balance(UUID)
-- Intended Callers: Customer (owner), Assigned Pandit, Admin, Service Role
REVOKE EXECUTE ON FUNCTION public.calculate_booking_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_booking_balance(UUID) TO authenticated, service_role;


-- 2.2 cancel_booking_and_calculate_refund(UUID, TEXT) with Server Audit
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

    -- 1. Fetch & Lock Booking
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

    -- 2. Calculate Total Captured Funds
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

    -- 5. Record Cancellation & Policy Snapshot
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
        v_refundable_base,
        v_deduction_amount,
        v_refund_amount,
        jsonb_build_object(
            'rule_id', v_rule.id,
            'rule_name', v_rule.name,
            'hours_before', v_hours_before,
            'refund_percent', v_refund_percent,
            'non_refundable_items', v_rule.non_refundable_item_types
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
        'refund_amount', v_refund_amount,
        'deduction_amount', v_deduction_amount,
        'refund_percent', v_refund_percent
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) TO authenticated, service_role;


-- 2.3 mark_booking_completed(UUID) with Server Audit
CREATE OR REPLACE FUNCTION public.mark_booking_completed(
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
    v_bank_account_id UUID;
    v_gross_amount NUMERIC(12,2);
    v_platform_fee NUMERIC(12,2) := 0.00;
    v_net_amount NUMERIC(12,2);
    v_payout_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to mark booking completed.';
    END IF;

    -- 1. Fetch & Lock Booking
    SELECT b.*, pp.user_id AS pandit_user_id 
    INTO v_booking
    FROM public.bookings b
    JOIN public.pandit_profiles pp ON pp.id = b.pandit_id
    WHERE b.id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- Authorization: Assigned Pandit or Admin
    IF v_booking.pandit_user_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only the assigned Pandit or Admin can complete this booking.';
    END IF;

    IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled') THEN
        RAISE EXCEPTION 'Booking cannot be completed from state %.', v_booking.status;
    END IF;

    -- 2. Verify Verified Default Pandit Bank Account Prior to State Transition
    SELECT id INTO v_bank_account_id
    FROM public.pandit_bank_accounts
    WHERE pandit_id = v_booking.pandit_id
      AND is_default = true
      AND verification_status = 'verified'
    LIMIT 1;

    IF v_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'Pandit does not have a verified default bank account.';
    END IF;

    -- 3. Transition Booking to Completed
    UPDATE public.bookings
    SET status = 'completed'::public.booking_status,
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = v_booking.id;

    -- 4. Calculate Payout from Authoritative Booking Line Items
    SELECT COALESCE(SUM(total_price), 0) INTO v_gross_amount
    FROM public.booking_line_items
    WHERE booking_id = v_booking.id;

    v_net_amount := v_gross_amount - v_platform_fee;

    -- 5. Idempotently Insert Payout Record with Verified Bank Account
    SELECT id INTO v_payout_id
    FROM public.pandit_payouts
    WHERE booking_id = v_booking.id;

    IF v_payout_id IS NULL THEN
        INSERT INTO public.pandit_payouts (
            pandit_id,
            booking_id,
            bank_account_id,
            gross_amount,
            platform_fee,
            net_amount,
            status
        ) VALUES (
            v_booking.pandit_id,
            v_booking.id,
            v_bank_account_id,
            v_gross_amount,
            v_platform_fee,
            v_net_amount,
            'pending'::public.payout_status
        ) RETURNING id INTO v_payout_id;
    END IF;

    -- 6. Authoritative Audit Trail for Admin Execution
    IF public.is_admin(v_caller_id) THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_caller_id,
            'booking_marked_completed_by_admin',
            'booking',
            v_booking.id,
            jsonb_build_object(
                'payout_id', v_payout_id,
                'payout_amount', v_net_amount,
                'bank_account_id', v_bank_account_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'completed',
        'booking_id', v_booking.id,
        'completed_at', now(),
        'payout_id', v_payout_id,
        'payout_amount', v_net_amount
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_booking_completed(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_booking_completed(UUID) TO authenticated, service_role;


-- 2.4 pandit_cancel_booking(UUID, TEXT) with Server Audit
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
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to cancel booking.';
    END IF;

    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'Booking ID is required.';
    END IF;

    SELECT b.*, pp.user_id AS pandit_user_id
    INTO v_booking
    FROM public.bookings b
    JOIN public.pandit_profiles pp ON pp.id = b.pandit_id
    WHERE b.id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.pandit_user_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only the assigned Pandit or Admin can cancel this booking on behalf of the priest.';
    END IF;

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
    v_refund_amount := v_net_captured;

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
        NULL,
        v_net_captured,
        0.00,
        v_refund_amount,
        jsonb_build_object(
            'rule_name', 'Pandit Initiated Cancellation (100% Customer Refund)',
            'refund_percent', 100.00,
            'deduction_percent', 0.00,
            'cancelled_by_pandit_user_id', v_booking.pandit_user_id
        )
    ) RETURNING id INTO v_cancellation_id;

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

    UPDATE public.payment_orders
    SET status = 'cancelled'::public.payment_order_status,
        updated_at = now()
    WHERE booking_id = v_booking.id AND status IN ('created', 'pending');

    UPDATE public.bookings
    SET status = 'cancelled'::public.booking_status,
        cancelled_at = now(),
        updated_at = now()
    WHERE id = v_booking.id;

    -- Authoritative Audit Trail for Admin Execution
    IF public.is_admin(v_caller_id) THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_caller_id,
            'booking_cancelled_by_admin_for_pandit',
            'booking',
            v_booking.id,
            jsonb_build_object(
                'cancellation_id', v_cancellation_id,
                'refund_amount', v_refund_amount,
                'reason', p_reason
            )
        );
    END IF;

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

REVOKE EXECUTE ON FUNCTION public.pandit_cancel_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pandit_cancel_booking(UUID, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. Exclusive Claim RPC: claim_refund_for_execution
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_refund_for_execution(
    p_refund_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_refund RECORD;
    v_tx RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only administrators can execute gateway refunds.';
    END IF;

    SELECT *
    INTO v_refund
    FROM public.refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'not_found',
            'error', 'Refund record not found.',
            'status_code', 404
        );
    END IF;

    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_processed',
            'refund_id', v_refund.id,
            'provider_refund_id', v_refund.provider_refund_id,
            'amount', v_refund.amount,
            'status_code', 200
        );
    END IF;

    IF v_refund.status = 'processing' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'already_processing',
            'error', 'Refund execution is already in progress for this record.',
            'status_code', 409
        );
    END IF;

    IF v_refund.status NOT IN ('requested', 'failed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_status',
            'error', 'Refund cannot be executed from status ' || v_refund.status || '.',
            'status_code', 400
        );
    END IF;

    SELECT *
    INTO v_tx
    FROM public.payment_transactions
    WHERE id = v_refund.payment_transaction_id;

    IF NOT FOUND OR v_tx.provider_payment_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'missing_payment_provider',
            'error', 'No provider payment ID linked to this refund transaction.',
            'status_code', 400
        );
    END IF;

    UPDATE public.refunds
    SET status = 'processing'
    WHERE id = p_refund_id;

    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_caller_id,
            'claim_gateway_refund',
            'refund',
            p_refund_id,
            jsonb_build_object(
                'amount', v_refund.amount,
                'payment_transaction_id', v_refund.payment_transaction_id,
                'provider_payment_id', v_tx.provider_payment_id,
                'previous_status', v_refund.status,
                'new_status', 'processing'
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'claimed',
        'refund_id', v_refund.id,
        'payment_transaction_id', v_refund.payment_transaction_id,
        'provider_payment_id', v_tx.provider_payment_id,
        'booking_cancellation_id', v_refund.booking_cancellation_id,
        'amount', v_refund.amount,
        'status_code', 200
    );
END;
$$;

COMMENT ON FUNCTION public.claim_refund_for_execution(UUID) IS
'Atomically claims a requested refund obligation for gateway execution, preventing concurrent double-charges.';

REVOKE EXECUTE ON FUNCTION public.claim_refund_for_execution(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_refund_for_execution(UUID) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 4. Atomic Reconciliation RPC: reconcile_processed_refund
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_processed_refund(
    p_refund_id UUID,
    p_provider_refund_id TEXT,
    p_amount_paise BIGINT,
    p_gateway_status TEXT DEFAULT 'processed',
    p_raw_response JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_refund RECORD;
    v_tx RECORD;
    v_expected_paise BIGINT;
    v_total_processed NUMERIC(12,2) := 0;
    v_new_tx_status public.payment_transaction_status;
BEGIN
    IF p_provider_refund_id IS NULL OR trim(p_provider_refund_id) = '' THEN
        RAISE EXCEPTION 'Provider refund ID is required for reconciliation.';
    END IF;

    SELECT *
    INTO v_refund
    FROM public.refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'not_found',
            'error', 'Refund record not found.'
        );
    END IF;

    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_processed',
            'refund_id', v_refund.id,
            'provider_refund_id', v_refund.provider_refund_id
        );
    END IF;

    v_expected_paise := ROUND(v_refund.amount * 100);
    IF p_amount_paise IS NOT NULL AND p_amount_paise != v_expected_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'amount_mismatch',
            'error', 'Gateway refund amount (' || p_amount_paise || ' paise) does not match expected amount (' || v_expected_paise || ' paise).'
        );
    END IF;

    SELECT *
    INTO v_tx
    FROM public.payment_transactions
    WHERE id = v_refund.payment_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'transaction_not_found',
            'error', 'Parent payment transaction not found.'
        );
    END IF;

    UPDATE public.refunds
    SET 
        status = 'processed',
        provider_refund_id = p_provider_refund_id,
        processed_at = COALESCE(processed_at, now())
    WHERE id = v_refund.id;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_processed
    FROM public.refunds
    WHERE payment_transaction_id = v_tx.id
      AND status = 'processed';

    IF v_total_processed >= v_tx.amount THEN
        v_new_tx_status := 'refunded';
    ELSE
        v_new_tx_status := 'partially_refunded';
    END IF;

    UPDATE public.payment_transactions
    SET status = v_new_tx_status
    WHERE id = v_tx.id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'refund_processed',
        'refund_id', v_refund.id,
        'provider_refund_id', p_provider_refund_id,
        'transaction_id', v_tx.id,
        'transaction_status', v_new_tx_status,
        'total_refunded', v_total_processed
    );
END;
$$;

COMMENT ON FUNCTION public.reconcile_processed_refund(UUID, TEXT, BIGINT, TEXT, JSONB) IS
'Authoritative server-side atomic reconciliation of gateway refunds. Enforces amount checks, idempotency, and non-regression.';

REVOKE EXECUTE ON FUNCTION public.reconcile_processed_refund(UUID, TEXT, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_processed_refund(UUID, TEXT, BIGINT, TEXT, JSONB) TO service_role;


-- -----------------------------------------------------------------------------
-- 5. Non-Regressing Failure Reconciliation: reconcile_failed_refund
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_failed_refund(
    p_provider_refund_id TEXT,
    p_error_code TEXT DEFAULT NULL,
    p_error_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_refund RECORD;
BEGIN
    IF p_provider_refund_id IS NULL OR trim(p_provider_refund_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'missing_provider_refund_id',
            'error', 'Provider refund ID is required.'
        );
    END IF;

    SELECT *
    INTO v_refund
    FROM public.refunds
    WHERE provider_refund_id = p_provider_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'not_found',
            'error', 'Refund with provider refund ID not found.'
        );
    END IF;

    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'ignored_already_processed',
            'refund_id', v_refund.id,
            'message', 'Refund is already authoritative processed; ignoring late gateway failure event.'
        );
    END IF;

    UPDATE public.refunds
    SET status = 'failed'
    WHERE id = v_refund.id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'refund_failed',
        'refund_id', v_refund.id,
        'provider_refund_id', p_provider_refund_id
    );
END;
$$;

COMMENT ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT) IS
'Authoritative failure recording for gateway refunds. Guarantees processed state never regresses.';

REVOKE EXECUTE ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT) TO service_role;

