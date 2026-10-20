-- =============================================================================
-- Migration 062: Pandit-Controlled Booking Completion & Lifecycle Balance Checkout
-- =============================================================================
-- Description:
-- Authoritatively implements the client-approved business requirement where:
-- 1. Devotees can pay their remaining booking balance until the Pandit marks the
--    ritual completed from the Pandit Dashboard, for BOTH Home and Online rituals.
-- 2. The 24-hour balance deadline and scheduled ritual start time no longer
--    permanently block or close balance checkout.
-- 3. In public.create_booking_balance_payment_order:
--    - The scheduled_start_at <= now() rejection is removed.
--    - Terminal bookings (completed, cancelled) are rejected.
--    - Active checkout windows of 30 minutes are granted whenever balance checkout
--      is requested within 24 hours of start, after start time, or while in progress.
--    - Expired orders are not reused as payable orders; retrying after expiration
--      safely issues a fresh payment order obligation.
--    - Active unexpired orders are reused with synchronized real-time amounts.
-- 4. In public.mark_booking_completed:
--    - Rejects completion if calculate_booking_balance returns outstanding_balance > 0.
--    - Authorizes assigned Pandit or Admin.
--    - Transitions booking to 'completed', sets balance_amount = 0.00, closes open orders,
--      and idempotently records pandit payout.
--    - Returns idempotent success if already completed.
-- 5. In public.confirm_booking_payment:
--    - Synchronizes bookings.balance_amount = GREATEST(0.00, balance_amount - verified_amount).
--    - If balance payment arrives for cancelled or completed booking, queues full refund.
-- 6. In public.expire_stale_payment_orders:
--    - Cleanly cancels open orders for completed and cancelled bookings.
-- =============================================================================

-- =============================================================================
-- 1. FUNCTION: public.calculate_booking_balance
-- =============================================================================
CREATE OR REPLACE FUNCTION public.calculate_booking_balance(
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
    v_total_amount NUMERIC(12,2) := 0;
    v_total_paid NUMERIC(12,2) := 0;
    v_total_refunded NUMERIC(12,2) := 0;
    v_net_paid NUMERIC(12,2) := 0;
    v_outstanding_balance NUMERIC(12,2) := 0;
BEGIN
    v_caller_id := auth.uid();

    -- Allow service_role and postgres callers even if auth.uid() is null
    IF v_caller_id IS NULL AND current_user NOT IN ('postgres', 'service_role') AND COALESCE(auth.jwt()->>'role', '') != 'service_role' THEN
        RAISE EXCEPTION 'Authentication required to calculate booking balance.';
    END IF;

    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'Valid booking ID is strictly required.';
    END IF;

    SELECT b.*, pp.user_id AS pandit_user_id
    INTO v_booking
    FROM public.bookings b
    LEFT JOIN public.pandit_profiles pp ON pp.id = b.pandit_id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- Ownership & Authorization Check
    IF v_caller_id IS NOT NULL 
       AND v_booking.customer_id != v_caller_id 
       AND v_booking.pandit_user_id != v_caller_id 
       AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You cannot view financial balance for this booking.';
    END IF;

    -- Compute Total from Line Items
    SELECT COALESCE(SUM(total_price), 0) INTO v_total_amount
    FROM public.booking_line_items
    WHERE booking_id = p_booking_id;

    -- Fallback to booking.total_amount if line items total is 0
    IF v_total_amount = 0 AND v_booking.total_amount > 0 THEN
        v_total_amount := v_booking.total_amount;
    END IF;

    -- Compute Captured Payments across ALL payment orders and transactions
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_total_paid
    FROM public.payment_transactions pt
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = p_booking_id
      AND pt.status IN ('captured', 'refunded', 'partially_refunded');

    -- Compute Processed Refunds across ALL transactions
    SELECT COALESCE(SUM(r.amount), 0) INTO v_total_refunded
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = p_booking_id
      AND r.status = 'processed';

    v_net_paid := v_total_paid - v_total_refunded;
    v_outstanding_balance := GREATEST(v_total_amount - v_net_paid, 0);

    RETURN jsonb_build_object(
        'booking_id', p_booking_id,
        'total_amount', v_total_amount,
        'total_paid', v_total_paid,
        'total_refunded', v_total_refunded,
        'net_paid', v_net_paid,
        'outstanding_balance', v_outstanding_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_booking_balance(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_booking_balance(UUID) TO authenticated, service_role, postgres;


-- =============================================================================
-- 2. FUNCTION: public.create_booking_balance_payment_order
-- =============================================================================
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
    IF v_caller_id IS NULL AND current_user NOT IN ('postgres', 'service_role') AND COALESCE(auth.jwt()->>'role', '') != 'service_role' THEN
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
    IF v_caller_id IS NOT NULL AND v_booking.customer_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only pay the balance for your own bookings.';
    END IF;

    -- 4. State validation: Reject completed and cancelled bookings
    IF v_booking.status IN ('completed'::public.booking_status, 'cancelled'::public.booking_status) THEN
        RAISE EXCEPTION 'Cannot create balance payment order for booking in terminal status ''%''.', v_booking.status;
    END IF;

    IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled') THEN
        RAISE EXCEPTION 'Cannot create balance payment order for booking in status ''%''.', v_booking.status;
    END IF;

    -- 5. Calculate outstanding balance using authoritative business function
    v_balance_json := public.calculate_booking_balance(p_booking_id);
    v_outstanding_balance := (v_balance_json->>'outstanding_balance')::NUMERIC(12,2);

    IF v_outstanding_balance IS NULL OR v_outstanding_balance <= 0 THEN
        RAISE EXCEPTION 'No outstanding balance due for booking % (balance: 0.00).', p_booking_id;
    END IF;

    -- 6. Compute due_at timestamp based on client-approved business rules:
    -- Standard cutoff: scheduled_start_at - 24 hours (when > 24 hours remain).
    -- If requested <= 24 hours before start, after start time, or while in progress:
    -- Grant an active 30-minute checkout window WITHOUT capping at scheduled_start_at.
    -- Balance checkout remains open until the pandit confirms ritual completion.
    IF v_booking.scheduled_start_at - interval '24 hours' <= now() THEN
        v_due_at := now() + interval '30 minutes';
    ELSE
        v_due_at := GREATEST(now() + interval '30 minutes', v_booking.scheduled_start_at - interval '24 hours');
    END IF;

    -- 7. Check for existing open payment order for booking_balance
    SELECT * INTO v_existing_order
    FROM public.payment_orders
    WHERE booking_id = p_booking_id
      AND purpose = 'booking_balance'::public.payment_order_purpose
      AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    -- Expire any older duplicate open orders for this booking
    IF v_existing_order.id IS NOT NULL THEN
        UPDATE public.payment_orders
        SET status = 'expired'::public.payment_order_status,
            updated_at = now()
        WHERE booking_id = p_booking_id
          AND purpose = 'booking_balance'::public.payment_order_purpose
          AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
          AND id != v_existing_order.id;
    END IF;

    -- If existing order has already passed its due date, mark it expired and generate a fresh order.
    -- Expired orders are NEVER reused as payable orders.
    -- If existing order is still active, refresh its amount and due_at to prevent duplicate orders.
    IF v_existing_order.id IS NOT NULL THEN
        IF v_existing_order.due_at <= now() THEN
            UPDATE public.payment_orders
            SET status = 'expired'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_existing_order.id;

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
        ELSE
            UPDATE public.payment_orders
            SET amount = v_outstanding_balance,
                due_at = v_due_at,
                updated_at = now()
            WHERE id = v_existing_order.id;

            v_payment_order_id := v_existing_order.id;
        END IF;
    ELSE
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

REVOKE ALL ON FUNCTION public.create_booking_balance_payment_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_balance_payment_order(UUID) TO authenticated, service_role, postgres;


-- =============================================================================
-- 3. FUNCTION: public.mark_booking_completed
-- =============================================================================
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
    v_balance_json JSONB;
    v_outstanding_balance NUMERIC(12,2) := 0.00;
    v_gross_amount NUMERIC(12,2) := 0.00;
    v_platform_fee NUMERIC(12,2) := 0.00;
    v_net_amount NUMERIC(12,2) := 0.00;
    v_payout_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL AND current_user NOT IN ('postgres', 'service_role') AND COALESCE(auth.jwt()->>'role', '') != 'service_role' THEN
        RAISE EXCEPTION 'Authentication required to mark booking completed.';
    END IF;

    IF p_booking_id IS NULL THEN
        RAISE EXCEPTION 'Valid booking ID is strictly required.';
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

    -- 2. Authorization: Assigned Pandit or Admin
    IF v_caller_id IS NOT NULL AND v_booking.pandit_user_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only the assigned Pandit or Admin can complete this booking.';
    END IF;

    -- 3. Idempotency Check: Already completed
    IF v_booking.status = 'completed'::public.booking_status THEN
        SELECT id, net_amount INTO v_payout_id, v_net_amount
        FROM public.pandit_payouts
        WHERE booking_id = v_booking.id;

        RETURN jsonb_build_object(
            'status', 'completed',
            'booking_id', v_booking.id,
            'completed_at', v_booking.completed_at,
            'payout_id', v_payout_id,
            'payout_amount', COALESCE(v_net_amount, 0.00),
            'already_completed', true
        );
    END IF;

    -- 4. State validation: Only active bookings can be completed
    IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled') THEN
        RAISE EXCEPTION 'Booking cannot be completed from state %.', v_booking.status;
    END IF;

    -- 5. Outstanding Balance Gate: Devotee must have settled all dakshina/balance
    v_balance_json := public.calculate_booking_balance(p_booking_id);
    v_outstanding_balance := COALESCE((v_balance_json->>'outstanding_balance')::NUMERIC(12,2), 0.00);

    IF v_outstanding_balance > 0 THEN
        RAISE EXCEPTION 'Cannot complete ritual: Devotee has an outstanding balance of ₹% that must be settled before completion.', v_outstanding_balance;
    END IF;

    -- 6. Verify Verified Default Pandit Bank Account Prior to State Transition
    SELECT id INTO v_bank_account_id
    FROM public.pandit_bank_accounts
    WHERE pandit_id = v_booking.pandit_id
      AND is_default = true
      AND verification_status = 'verified'
    LIMIT 1;

    IF v_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'Pandit does not have a verified default bank account.';
    END IF;

    -- 7. Transition Booking to Completed
    UPDATE public.bookings
    SET status = 'completed'::public.booking_status,
        balance_amount = 0.00,
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = v_booking.id;

    -- 8. Cleanly expire any dangling open balance payment orders
    UPDATE public.payment_orders
    SET status = 'expired'::public.payment_order_status,
        updated_at = now()
    WHERE booking_id = v_booking.id
      AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status);

    -- 9. Calculate Payout from Authoritative Booking Line Items
    SELECT COALESCE(SUM(total_price), 0) INTO v_gross_amount
    FROM public.booking_line_items
    WHERE booking_id = v_booking.id;

    IF v_gross_amount = 0 AND v_booking.total_amount > 0 THEN
        v_gross_amount := v_booking.total_amount;
    END IF;

    v_net_amount := v_gross_amount - v_platform_fee;

    -- 10. Idempotently Insert Payout Record with Verified Bank Account
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

    -- 11. Authoritative Audit Trail for Admin Execution
    IF v_caller_id IS NOT NULL AND public.is_admin(v_caller_id) THEN
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
GRANT EXECUTE ON FUNCTION public.mark_booking_completed(UUID) TO authenticated, service_role, postgres;


-- =============================================================================
-- 4. FUNCTION: public.expire_stale_payment_orders (HOUSEKEEPING)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_payment_orders(
    p_batch_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_order RECORD;
    v_expired_count INTEGER := 0;
    v_cancelled_bookings INTEGER := 0;
    v_expired_reschedules INTEGER := 0;
BEGIN
    FOR v_order IN
        SELECT po.id, po.booking_id, po.purpose, po.status, b.status AS booking_status
        FROM public.payment_orders po
        LEFT JOIN public.bookings b ON b.id = po.booking_id
        WHERE po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
          AND (
              COALESCE(po.due_at, po.created_at + interval '30 minutes') < now()
              OR (po.booking_id IS NOT NULL AND b.status IN ('cancelled'::public.booking_status, 'completed'::public.booking_status))
          )
        ORDER BY COALESCE(po.due_at, po.created_at + interval '30 minutes') ASC
        LIMIT COALESCE(p_batch_limit, 100)
        FOR UPDATE OF po SKIP LOCKED
    LOOP
        -- If associated booking was already cancelled or completed, transition order to 'cancelled'
        IF v_order.booking_id IS NOT NULL AND v_order.booking_status IN ('cancelled'::public.booking_status, 'completed'::public.booking_status) THEN
            UPDATE public.payment_orders
            SET status = 'cancelled'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;
        ELSE
            -- Transition payment order to expired
            UPDATE public.payment_orders
            SET status = 'expired'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;
        END IF;

        v_expired_count := v_expired_count + 1;

        -- If booking advance order, cancel associated payment_pending booking
        IF v_order.purpose = 'booking_advance'::public.payment_order_purpose AND v_order.booking_id IS NOT NULL THEN
            UPDATE public.bookings
            SET status = 'cancelled'::public.booking_status,
                cancellation_reason = 'payment_timeout',
                cancelled_at = COALESCE(cancelled_at, now()),
                updated_at = now()
            WHERE id = v_order.booking_id
              AND status = 'payment_pending'::public.booking_status;

            IF FOUND THEN
                v_cancelled_bookings := v_cancelled_bookings + 1;
            END IF;

        -- If prepone fee order, expire associated requested reschedule request
        ELSIF v_order.purpose = 'prepone_fee'::public.payment_order_purpose THEN
            UPDATE public.booking_reschedule_requests
            SET status = 'expired'::public.reschedule_request_status,
                updated_at = now()
            WHERE payment_order_id = v_order.id
              AND status = 'requested'::public.reschedule_request_status;

            IF FOUND THEN
                v_expired_reschedules := v_expired_reschedules + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'expired_orders', v_expired_count,
        'cancelled_bookings', v_cancelled_bookings,
        'expired_reschedules', v_expired_reschedules,
        'executed_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_payment_orders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_payment_orders(INTEGER) TO service_role, postgres;


-- =============================================================================
-- 5. FUNCTION: public.confirm_booking_payment
-- =============================================================================
CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
    p_payment_order_id UUID,
    p_provider_payment_id TEXT,
    p_verified_amount NUMERIC,
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
    v_policy RECORD;
    v_kundli RECORD;
    v_subscription RECORD;
    v_active_sub RECORD;
    v_reschedule RECORD;
    v_existing_tx RECORD;
    v_existing_refund RECORD;
    v_transaction_id UUID;
    v_refund_id UUID;
    v_result JSONB;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_starts_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_gateway_event_at TIMESTAMPTZ := NULL;
    v_effective_paid_at TIMESTAMPTZ;
    v_effective_due_at TIMESTAMPTZ;
    v_is_overdue BOOLEAN := false;
    v_can_confirm BOOLEAN := false;
    v_can_approve BOOLEAN := false;
    v_is_timeout_recovery BOOLEAN := false;
    v_is_subscription_cancelled BOOLEAN := false;
BEGIN
    -- 1. Input Validation: Verified captured amount is strictly required and positive
    IF p_payment_order_id IS NULL OR p_provider_payment_id IS NULL OR p_verified_amount IS NULL THEN
        RAISE EXCEPTION 'Payment order ID, provider payment ID, and verified captured amount are strictly required.';
    END IF;

    IF p_verified_amount <= 0 THEN
        RAISE EXCEPTION 'Verified payment amount must be strictly greater than zero.';
    END IF;

    -- 2. Fetch & Lock Payment Order FOR UPDATE (Level 1 Lock in hierarchy)
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_payment_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_payment_order_id;
    END IF;

    -- Strict Exact Amount Validation: Prevents both underpayments and overpayments
    IF p_verified_amount != v_order.amount THEN
        RAISE EXCEPTION 'Verified captured amount (%) does not match payment order obligation amount (%).',
            p_verified_amount, v_order.amount;
    END IF;

    IF p_raw_response IS NOT NULL AND (p_raw_response->>'created_at') IS NOT NULL THEN
        BEGIN
            v_gateway_event_at := to_timestamp((p_raw_response->>'created_at')::double precision);
        EXCEPTION WHEN OTHERS THEN
            v_gateway_event_at := NULL;
        END;
    ELSE
        v_gateway_event_at := NULL;
    END IF;

    -- Evaluate effective payment event time and authoritative deadline
    v_effective_paid_at := COALESCE(v_gateway_event_at, now());
    v_effective_due_at := COALESCE(v_order.due_at, v_order.created_at + interval '30 minutes');
    v_is_overdue := (v_effective_paid_at > v_effective_due_at);

    -- 3. AST-07 Lock Hierarchy: For subscription orders, acquire per-customer advisory lock
    IF v_order.purpose = 'subscription' THEN
        SELECT * INTO v_subscription
        FROM public.astrology_subscriptions
        WHERE id = v_order.subscription_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_subscription.status = 'cancelled' THEN
                v_is_subscription_cancelled := true;
            END IF;

            IF v_subscription.customer_id IS NOT NULL THEN
                PERFORM pg_advisory_xact_lock(
                    hashtext('astrology_subscription_customer:' || v_subscription.customer_id::text)
                );
            END IF;
        END IF;
    END IF;

    -- 4. Check for Existing Captured Transaction by Provider Payment ID
    SELECT * INTO v_existing_tx
    FROM public.payment_transactions
    WHERE provider_payment_id = p_provider_payment_id;

    -- Reject cross-order payment ID collision
    IF v_existing_tx.id IS NOT NULL AND v_existing_tx.payment_order_id != p_payment_order_id THEN
        RAISE EXCEPTION 'Provider payment ID % is already registered to a different payment order (%).',
            p_provider_payment_id, v_existing_tx.payment_order_id;
    END IF;

    -- 5. Strict Idempotency Check: Already Paid Order
    IF v_order.status = 'paid'::public.payment_order_status THEN
        IF v_existing_tx.id IS NULL THEN
            RAISE EXCEPTION 'Payment order is marked paid but no corresponding transaction exists for provider payment ID %.',
                p_provider_payment_id;
        END IF;

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
            WHERE (payment_order_id = v_order.id
                   OR (payment_order_id IS NULL AND booking_id = v_booking.id AND change_type = 'prepone' AND fee_amount = v_order.amount))
            ORDER BY (payment_order_id = v_order.id) DESC, created_at DESC 
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
            RAISE EXCEPTION 'Unsupported or unhandled payment order purpose for idempotent resolution: %', v_order.purpose;
        END IF;
    END IF;

    -- 6. AST-P02 Idempotency Check: Cancelled or Expired order with already-recorded transaction
    IF v_existing_tx.id IS NOT NULL AND
       (v_order.status IN ('cancelled', 'expired') OR v_is_subscription_cancelled) THEN
        SELECT * INTO v_existing_refund
        FROM public.refunds
        WHERE payment_transaction_id = v_existing_tx.id
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_existing_refund.id IS NOT NULL THEN
            IF v_existing_refund.status IN ('requested'::public.refund_status, 'processing'::public.refund_status) THEN
                RETURN jsonb_build_object(
                    'status', 'refund_already_queued',
                    'purpose', v_order.purpose,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_existing_tx.id,
                    'refund_id', v_existing_refund.id,
                    'refund_status', v_existing_refund.status,
                    'amount_refunded', v_existing_refund.amount,
                    'message', 'Refund is already queued or processing for captured payment on expired or cancelled order.'
                );
            ELSIF v_existing_refund.status = 'processed'::public.refund_status THEN
                RETURN jsonb_build_object(
                    'status', 'already_refunded',
                    'purpose', v_order.purpose,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_existing_tx.id,
                    'refund_id', v_existing_refund.id,
                    'refund_status', v_existing_refund.status,
                    'amount_refunded', v_existing_refund.amount,
                    'message', 'Payment was previously captured and refund has already been processed for expired or cancelled order.'
                );
            ELSIF v_existing_refund.status = 'failed'::public.refund_status THEN
                UPDATE public.refunds
                SET status = 'requested'::public.refund_status,
                    reason = 'Retry refund for previously failed refund obligation on expired or cancelled order.',
                    updated_at = now()
                WHERE id = v_existing_refund.id;

                v_refund_id := v_existing_refund.id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', v_order.purpose,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_existing_tx.id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', v_existing_refund.amount,
                    'is_retry', true,
                    'message', 'Re-queued existing refund record for retry on expired or cancelled order.'
                );
            END IF;
        ELSE
            IF v_is_overdue OR v_order.status = 'cancelled'::public.payment_order_status OR v_order.purpose NOT IN ('booking_advance', 'prepone_fee') THEN
                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_existing_tx.id,
                    NULL,
                    v_existing_tx.amount,
                    'Automatic recovery refund: captured payment missing refund obligation for expired or cancelled order.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', v_order.purpose,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_existing_tx.id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', v_existing_tx.amount,
                    'is_recovered', true,
                    'message', 'Recovered missing refund obligation for previously captured payment on expired or cancelled order.'
                );
            END IF;
        END IF;
    END IF;

    -- 7. Validate Order Status is Transitionable
    IF v_order.status NOT IN ('created', 'pending', 'expired', 'cancelled') THEN
        RAISE EXCEPTION 'Payment order % is in % status and cannot be confirmed.',
            p_payment_order_id, v_order.status;
    END IF;

    -- 8. Record Gateway Charge / Capture in payment_transactions
    IF v_existing_tx.id IS NOT NULL THEN
        UPDATE public.payment_transactions
        SET status = 'captured'::public.payment_transaction_status,
            amount = p_verified_amount,
            paid_at = COALESCE(v_gateway_event_at, paid_at, now()),
            provider_signature = COALESCE(p_provider_signature, provider_signature),
            raw_response = COALESCE(p_raw_response, raw_response)
        WHERE id = v_existing_tx.id
        RETURNING id INTO v_transaction_id;
    ELSE
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
            COALESCE(v_gateway_event_at, now()),
            p_raw_response
        ) RETURNING id INTO v_transaction_id;
    END IF;

    -- 9. Execute Business State Transitions Branched by Purpose
    CASE v_order.purpose
        -- ------------------------------------------------------------
        -- A. booking_advance: Confirms initial booking
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

            v_can_confirm := false;
            v_is_timeout_recovery := false;

            IF (NOT v_is_overdue)
               AND (v_order.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status, 'expired'::public.payment_order_status))
               AND (v_booking.status = 'payment_pending'::public.booking_status
                    OR (v_booking.status = 'cancelled'::public.booking_status
                        AND v_booking.cancellation_reason = 'payment_timeout'))
               AND (v_booking.confirmed_at IS NULL)
               AND (NOT EXISTS (SELECT 1 FROM public.booking_cancellations WHERE booking_id = v_booking.id))
               AND (v_booking.scheduled_start_at > now()) THEN

                SELECT * INTO v_pandit
                FROM public.pandit_profiles
                WHERE id = v_booking.pandit_id
                FOR UPDATE;

                v_dow := EXTRACT(DOW FROM (v_booking.scheduled_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
                v_start_time := (v_booking.scheduled_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
                v_end_time := (v_booking.scheduled_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

                IF EXISTS (
                    SELECT 1 FROM public.pandit_availability_rules
                    WHERE pandit_id = v_booking.pandit_id
                      AND day_of_week = v_dow
                      AND is_active = true
                      AND start_time <= v_start_time
                      AND end_time >= v_end_time
                ) AND NOT EXISTS (
                    SELECT 1 FROM public.pandit_unavailability_blocks
                    WHERE pandit_id = v_booking.pandit_id
                      AND v_booking.scheduled_start_at < ends_at
                      AND v_booking.scheduled_end_at > starts_at
                ) AND NOT EXISTS (
                    SELECT 1 FROM public.bookings b
                    WHERE b.pandit_id = v_booking.pandit_id
                      AND b.id != v_booking.id
                      AND (
                          b.status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
                          OR (
                              b.status = 'payment_pending'
                              AND EXISTS (
                                  SELECT 1 FROM public.payment_orders po
                                  WHERE po.booking_id = b.id
                                    AND po.purpose = 'booking_advance'::public.payment_order_purpose
                                    AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
                                    AND COALESCE(po.due_at, po.created_at + interval '30 minutes') > now()
                              )
                          )
                      )
                      AND b.scheduled_start_at < v_booking.scheduled_end_at
                      AND b.scheduled_end_at > v_booking.scheduled_start_at
                ) THEN
                    v_can_confirm := true;
                    IF v_booking.status = 'cancelled'::public.booking_status THEN
                        v_is_timeout_recovery := true;
                    END IF;
                END IF;
            END IF;

            IF v_can_confirm THEN
                UPDATE public.payment_orders
                SET status = 'paid'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.bookings
                SET status = 'confirmed'::public.booking_status,
                    confirmed_at = now(),
                    cancellation_reason = NULL,
                    cancelled_at = NULL,
                    updated_at = now()
                WHERE id = v_booking.id;

                v_result := jsonb_build_object(
                    'status', 'confirmed',
                    'purpose', 'booking_advance',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'amount_paid', p_verified_amount,
                    'payment_transaction_id', v_transaction_id,
                    'is_timeout_recovery', v_is_timeout_recovery,
                    'confirmed_at', now()
                );
            ELSE
                IF v_order.status != 'cancelled'::public.payment_order_status THEN
                    UPDATE public.payment_orders
                    SET status = 'expired'::public.payment_order_status,
                        updated_at = now()
                    WHERE id = v_order.id;
                END IF;

                IF v_booking.status = 'payment_pending'::public.booking_status THEN
                    UPDATE public.bookings
                    SET status = 'cancelled'::public.booking_status,
                        cancellation_reason = CASE
                            WHEN v_is_overdue THEN 'payment_timeout'
                            ELSE 'booking_conflict'
                        END,
                        cancelled_at = now(),
                        updated_at = now()
                    WHERE id = v_booking.id;
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
                    p_verified_amount,
                    CASE 
                        WHEN v_is_overdue THEN 'Payment captured after booking advance deadline expired: automatic full refund queued.'
                        WHEN v_booking.scheduled_start_at <= now() THEN 'Ritual scheduled start time has already passed: automatic full refund queued.'
                        WHEN v_order.status = 'cancelled'::public.payment_order_status
                             OR EXISTS (SELECT 1 FROM public.booking_cancellations WHERE booking_id = v_booking.id)
                             OR (v_booking.status = 'cancelled'::public.booking_status AND (v_booking.cancellation_reason IS NULL OR v_booking.cancellation_reason != 'payment_timeout'))
                             THEN 'Booking was explicitly cancelled: automatic full refund queued.'
                        ELSE 'Time slot was reserved by another booking: automatic full refund queued.'
                    END,
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'booking_advance',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', CASE 
                        WHEN v_is_overdue THEN 'Payment captured after checkout deadline expired. Full refund has been queued automatically.'
                        WHEN v_booking.scheduled_start_at <= now() THEN 'Ritual scheduled start time has already passed. Full refund has been queued automatically.'
                        WHEN v_order.status = 'cancelled'::public.payment_order_status
                             OR EXISTS (SELECT 1 FROM public.booking_cancellations WHERE booking_id = v_booking.id)
                             OR (v_booking.status = 'cancelled'::public.booking_status AND (v_booking.cancellation_reason IS NULL OR v_booking.cancellation_reason != 'payment_timeout'))
                             THEN 'Booking was cancelled. Full refund has been queued automatically.'
                        ELSE 'Time slot was no longer available when payment arrived. Full refund has been queued automatically.'
                    END
                );
            END IF;

        -- ------------------------------------------------------------
        -- B. booking_balance: Settles remaining dakshina balance
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

            -- If the booking was cancelled before this balance payment was confirmed,
            -- queue an automatic full refund so customer funds are never orphaned.
            IF v_booking.status = 'cancelled'::public.booking_status THEN
                UPDATE public.payment_orders
                SET status = 'cancelled'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Booking was already cancelled when balance payment arrived: automatic full refund queued.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'booking_balance',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Booking was cancelled. Balance payment has been queued for automatic refund.'
                );
            END IF;

            -- If the booking was already completed by the pandit,
            -- queue an automatic full refund because balance had already been cleared.
            IF v_booking.status = 'completed'::public.booking_status THEN
                UPDATE public.payment_orders
                SET status = 'cancelled'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Booking was already completed when balance payment arrived: automatic full refund queued.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'booking_balance',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Booking is already completed. Balance payment has been queued for automatic refund.'
                );
            END IF;

            IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled') THEN
                RAISE EXCEPTION 'Booking must be in confirmed/active state to pay balance (current state: %).', v_booking.status;
            END IF;

            -- Mark payment order paid and update bookings balance_amount
            UPDATE public.payment_orders
            SET status = 'paid'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;

            UPDATE public.bookings
            SET balance_amount = GREATEST(0.00, v_booking.balance_amount - p_verified_amount),
                updated_at = now()
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
        -- C. prepone_fee: Confirms administrative reschedule fee
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

            SELECT * INTO v_reschedule
            FROM public.booking_reschedule_requests
            WHERE (payment_order_id = v_order.id
                   OR (payment_order_id IS NULL AND booking_id = v_booking.id AND change_type = 'prepone' AND fee_amount = p_verified_amount))
            ORDER BY (payment_order_id = v_order.id) DESC, created_at DESC
            LIMIT 1
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No matching prepone reschedule request found for payment order %.', v_order.id;
            END IF;

            IF v_reschedule.status != 'requested'::public.reschedule_request_status THEN
                RAISE EXCEPTION 'Reschedule request is not in requested status (current status: %).', v_reschedule.status;
            END IF;

            IF v_booking.status NOT IN ('confirmed', 'upcoming', 'rescheduled') THEN
                RAISE EXCEPTION 'Associated booking is not in an active, confirmable state (current status: %).', v_booking.status;
            END IF;

            IF v_is_overdue OR v_reschedule.requested_start_at <= now() THEN
                UPDATE public.payment_orders
                SET status = 'expired'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.booking_reschedule_requests
                SET status = 'expired'::public.reschedule_request_status,
                    updated_at = now()
                WHERE id = v_reschedule.id;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    CASE 
                        WHEN v_is_overdue THEN 'Prepone fee payment captured after checkout window expired: automatic fee refund queued.'
                        ELSE 'Requested reschedule start time has already passed: automatic fee refund queued.'
                    END,
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Requested reschedule start time has already passed. Reschedule fee refund has been queued automatically.'
                );
            END IF;

            IF v_reschedule.requested_end_at <= v_reschedule.requested_start_at THEN
                RAISE EXCEPTION 'Requested reschedule end time must be strictly after start time.';
            END IF;

            IF v_reschedule.payment_order_id IS NULL THEN
                IF (SELECT count(*) FROM public.booking_reschedule_requests WHERE booking_id = v_booking.id AND status = 'requested'::public.reschedule_request_status) > 1 THEN
                    RAISE EXCEPTION 'Multiple ambiguous pending reschedule requests exist for booking %. Cannot associate payment order % safely.',
                        v_booking.id, v_order.id;
                END IF;
            END IF;

            SELECT * INTO v_pandit
            FROM public.pandit_profiles
            WHERE id = v_booking.pandit_id
            FOR UPDATE;

            v_dow := EXTRACT(DOW FROM (v_reschedule.requested_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
            v_start_time := (v_reschedule.requested_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
            v_end_time := (v_reschedule.requested_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

            IF NOT EXISTS (
                SELECT 1 FROM public.pandit_availability_rules
                WHERE pandit_id = v_booking.pandit_id
                  AND day_of_week = v_dow
                  AND is_active = true
                  AND start_time <= v_start_time
                  AND end_time >= v_end_time
            ) OR EXISTS (
                SELECT 1 FROM public.pandit_unavailability_blocks
                WHERE pandit_id = v_booking.pandit_id
                  AND v_reschedule.requested_start_at < ends_at
                  AND v_reschedule.requested_end_at > starts_at
            ) THEN
                UPDATE public.payment_orders
                SET status = 'expired'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.booking_reschedule_requests
                SET status = 'rejected'::public.reschedule_request_status,
                    updated_at = now()
                WHERE id = v_reschedule.id;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Pandit is not available during requested reschedule time window: automatic fee refund queued.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Pandit is not available at requested reschedule slot. Reschedule fee refund has been queued automatically.'
                );
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.pandit_id = v_booking.pandit_id
                  AND b.id != v_booking.id
                  AND (
                      b.status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
                      OR (
                          b.status = 'payment_pending'
                          AND EXISTS (
                              SELECT 1 FROM public.payment_orders po
                              WHERE po.booking_id = b.id
                                AND po.purpose = 'booking_advance'::public.payment_order_purpose
                                AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
                                AND COALESCE(po.due_at, po.created_at + interval '30 minutes') > now()
                          )
                      )
                  )
                  AND b.scheduled_start_at < v_reschedule.requested_end_at
                  AND b.scheduled_end_at > v_reschedule.requested_start_at
            ) THEN
                UPDATE public.payment_orders
                SET status = 'expired'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.booking_reschedule_requests
                SET status = 'rejected'::public.reschedule_request_status,
                    updated_at = now()
                WHERE id = v_reschedule.id;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Requested reschedule window conflicts with an existing booking: automatic fee refund queued.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Requested reschedule slot was no longer available when fee payment arrived. Fee refund has been queued automatically.'
                );
            END IF;

            UPDATE public.payment_orders
            SET status = 'paid'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;

            UPDATE public.bookings
            SET scheduled_start_at = v_reschedule.requested_start_at,
                scheduled_end_at = v_reschedule.requested_end_at,
                reschedule_count = v_booking.reschedule_count + 1,
                status = 'rescheduled'::public.booking_status,
                updated_at = now()
            WHERE id = v_booking.id;

            UPDATE public.booking_reschedule_requests
            SET status = 'approved'::public.reschedule_request_status,
                approved_at = now(),
                payment_order_id = COALESCE(payment_order_id, v_order.id),
                updated_at = now()
            WHERE id = v_reschedule.id;

            -- Refresh due_at for open balance order
            UPDATE public.payment_orders
            SET due_at = CASE 
                    WHEN v_reschedule.requested_start_at - interval '24 hours' <= now() THEN
                        now() + interval '30 minutes'
                    ELSE GREATEST(now() + interval '30 minutes', v_reschedule.requested_start_at - interval '24 hours')
                END,
                updated_at = now()
            WHERE booking_id = v_booking.id
              AND purpose = 'booking_balance'::public.payment_order_purpose
              AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status);

            v_result := jsonb_build_object(
                'status', 'prepone_confirmed',
                'purpose', 'prepone_fee',
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'reschedule_request_id', v_reschedule.id,
                'new_scheduled_start_at', v_reschedule.requested_start_at,
                'new_scheduled_end_at', v_reschedule.requested_end_at,
                'fee_paid', p_verified_amount,
                'reschedule_count', v_booking.reschedule_count + 1,
                'payment_transaction_id', v_transaction_id,
                'confirmed_at', now()
            );

        -- ------------------------------------------------------------
        -- D. kundli: Confirms Kundli order payment
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

            UPDATE public.payment_orders
            SET status = 'paid'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;

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
        -- E. subscription: Confirms astrology subscription
        -- ------------------------------------------------------------
        WHEN 'subscription' THEN
            IF v_order.subscription_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose subscription must have an associated subscription_id.';
            END IF;

            IF v_order.status = 'cancelled' OR v_is_subscription_cancelled THEN
                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Payment captured after subscription cancellation',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                v_result := jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'subscription',
                    'subscription_id', v_subscription.id,
                    'subscription_status', v_subscription.status,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Payment captured after subscription was cancelled. Refund has been queued automatically.'
                );
            ELSE
                IF v_subscription.status != 'pending_payment' THEN
                    RAISE EXCEPTION 'Subscription is not in pending_payment state (current state: %).', v_subscription.status;
                END IF;

                IF v_order.duration_days IS NULL OR v_order.duration_days <= 0 THEN
                    RAISE EXCEPTION 'Payment order % is missing authoritative duration_days snapshot.', v_order.id;
                END IF;

                SELECT * INTO v_active_sub
                FROM public.astrology_subscriptions
                WHERE customer_id = v_subscription.customer_id
                  AND id != v_subscription.id
                  AND status = 'active'
                  AND ends_at > now()
                ORDER BY ends_at DESC
                LIMIT 1;

                IF FOUND THEN
                    v_starts_at := v_active_sub.ends_at;
                ELSE
                    v_starts_at := now();
                END IF;

                v_ends_at := v_starts_at + (v_order.duration_days || ' days')::interval;

                UPDATE public.payment_orders
                SET status = 'paid'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.astrology_subscriptions
                SET status = 'active',
                    starts_at = v_starts_at,
                    ends_at = v_ends_at,
                    updated_at = now()
                WHERE id = v_subscription.id;

                v_result := jsonb_build_object(
                    'status', 'active',
                    'purpose', 'subscription',
                    'subscription_id', v_subscription.id,
                    'customer_id', v_subscription.customer_id,
                    'amount_paid', p_verified_amount,
                    'duration_days', v_order.duration_days,
                    'starts_at', v_starts_at,
                    'ends_at', v_ends_at,
                    'payment_transaction_id', v_transaction_id,
                    'paid_at', now()
                );
            END IF;

        ELSE
            RAISE EXCEPTION 'Unsupported or unhandled payment order purpose: "%". This purpose is not routed for automated fulfillment via confirm_booking_payment.', v_order.purpose
                USING ERRCODE = '22000';
    END CASE;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_booking_payment(
    UUID, TEXT, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(
    UUID, TEXT, NUMERIC, TEXT, JSONB
) TO service_role, postgres;
