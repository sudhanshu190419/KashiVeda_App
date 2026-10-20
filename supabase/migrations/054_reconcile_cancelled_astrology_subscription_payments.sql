-- =============================================================================
-- Migration: 054_reconcile_cancelled_astrology_subscription_payments.sql
-- Description: Remediate AST-P02 financial-reconciliation gap.
--              If a payment gateway verifiably captures a valid payment for an
--              astrology subscription whose order or subscription was cancelled
--              prior to confirmation, durably record the payment in payment_transactions
--              and atomically queue a full refund request in public.refunds.
--              Does NOT reactivate the cancelled subscription or grant access.
--              Provides full idempotency for redelivered capture events.
-- Target Audit Finding: AST-P02 (Lock-Order Deadlock & Payment Reconciliation)
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Architecture
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ARCHITECTURAL DESIGN & INVARIANTS:
--
-- 1. Root Cause of Reconciliation Gap (AST-P02):
--    Prior to this migration, confirm_booking_payment strictly checked:
--      IF v_order.status NOT IN ('created', 'pending') THEN RAISE EXCEPTION ...
--    and inside the subscription branch:
--      ELSIF v_subscription.status != 'payment_pending' THEN RAISE EXCEPTION ...
--    If an administrator cancelled a subscription while the customer was completing
--    checkout at the gateway, the open payment order and subscription were set to
--    'cancelled'. When the gateway webhook arrived with payment.captured, the RPC
--    aborted with an unhandled exception. The transaction rolled back completely,
--    the webhook returned HTTP 500, gateway retries were exhausted after 24 hours,
--    and no transaction, refund obligation, or admin record was created. Customer
--    funds were stranded with the merchant with zero operator visibility.
--
-- 2. Corrected Behavior for Cancelled Subscriptions:
--    When confirm_booking_payment receives a valid, verified payment capture for an
--    astrology subscription whose order or subscription is in 'cancelled' state:
--      a. Record the payment in public.payment_transactions with status 'captured'.
--      b. Persist payment_orders status as 'cancelled' (order obligation is dead).
--      c. Subscription status remains 'cancelled' (NO access is granted or extended).
--      d. Atomically insert a refund request in public.refunds with status 'requested'
--         and amount equal to the verified captured payment.
--      e. Record structured admin audit log in public.admin_audit_logs.
--      f. Return JSON payload with status 'refund_queued', allowing the webhook to
--         acknowledge HTTP 200 to Razorpay and terminate further retries.
--
-- 3. Idempotent Duplicate Delivery Protection:
--    If the gateway redelivers the same event for a previously reconciled cancelled
--    subscription, the function detects the existing payment transaction and refund
--    record, returning status 'already_refunded' idempotently without duplicate records.
--
-- 4. Lock Hierarchy Preservation (Level 1 -> Level 2 -> Level 3):
--    Maintains the strict global partial lock order established in Migration 048:
--      Level 1: public.payment_orders (FOR UPDATE)
--      Level 2: public.astrology_subscriptions (FOR UPDATE)
--      Level 3: Customer advisory lock (pg_advisory_xact_lock)
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
    v_existing_refund RECORD;
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

    -- Level 2 Lock for Subscription Orders: Fetch & lock target subscription FOR UPDATE
    IF v_order.purpose = 'subscription' AND v_order.subscription_id IS NOT NULL THEN
        SELECT * INTO v_subscription
        FROM public.astrology_subscriptions
        WHERE id = v_order.subscription_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Astrology subscription % not found.', v_order.subscription_id;
        END IF;
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

        IF v_existing_tx.status NOT IN ('captured', 'refunded', 'partially_refunded') THEN
            RAISE EXCEPTION 'Provider payment ID % is not in captured status (current: %).', p_provider_payment_id, v_existing_tx.status;
        END IF;

        v_transaction_id := v_existing_tx.id;
    END IF;

    -- 5. Idempotency Check: Order already paid
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

    -- 6. AST-P02 Idempotency Check: Cancelled subscription with already-recorded transaction
    IF v_order.purpose = 'subscription' AND v_existing_tx.id IS NOT NULL AND
       (v_order.status = 'cancelled' OR (v_subscription.id IS NOT NULL AND v_subscription.status = 'cancelled')) THEN
        SELECT * INTO v_existing_refund
        FROM public.refunds
        WHERE payment_transaction_id = v_existing_tx.id
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_existing_refund.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'status', 'already_refunded',
                'purpose', 'subscription',
                'subscription_id', v_subscription.id,
                'subscription_status', v_subscription.status,
                'payment_order_id', v_order.id,
                'payment_transaction_id', v_existing_tx.id,
                'refund_id', v_existing_refund.id,
                'refund_status', v_existing_refund.status,
                'amount_refunded', v_existing_refund.amount,
                'message', 'Payment was previously captured and refund queued for cancelled subscription.'
            );
        ELSE
            -- Self-healing recovery: transaction was recorded but refund request was missing
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
                'Automatic recovery refund: captured payment missing refund obligation for cancelled subscription.',
                'requested'::public.refund_status
            ) RETURNING id INTO v_refund_id;

            RETURN jsonb_build_object(
                'status', 'refund_queued',
                'purpose', 'subscription',
                'subscription_id', v_subscription.id,
                'subscription_status', 'cancelled',
                'payment_order_id', v_order.id,
                'payment_transaction_id', v_existing_tx.id,
                'refund_id', v_refund_id,
                'refund_status', 'requested',
                'amount_refunded', v_existing_tx.amount,
                'is_recovered', true,
                'message', 'Recovered missing refund obligation for previously captured payment on cancelled subscription.'
            );
        END IF;
    END IF;

    -- 7. AST-P02 Remediation: Cancelled Subscription Capture Reconciliation Branch
    -- If the gateway verifiably captured funds for an astrology subscription whose
    -- order or subscription was cancelled prior to confirmation:
    -- Durably record the captured payment, keep the subscription cancelled, and
    -- atomically queue a full refund request in public.refunds.
    IF v_order.purpose = 'subscription' AND
       (v_order.status = 'cancelled' OR (v_subscription.id IS NOT NULL AND v_subscription.status = 'cancelled')) THEN

        -- Insert authoritative payment transaction
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

        -- Maintain payment order status in 'cancelled' state
        UPDATE public.payment_orders
        SET status = 'cancelled'::public.payment_order_status,
            updated_at = now()
        WHERE id = p_payment_order_id;

        -- Ensure subscription remains cancelled (do NOT reactivate or extend term)
        IF v_subscription.id IS NOT NULL AND v_subscription.status != 'cancelled'::public.astrology_subscription_status THEN
            UPDATE public.astrology_subscriptions
            SET status = 'cancelled'::public.astrology_subscription_status
            WHERE id = v_subscription.id;
        END IF;

        -- Atomically queue full refund request in public.refunds
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
            'Automatic refund: payment captured for cancelled astrology subscription.',
            'requested'::public.refund_status
        ) RETURNING id INTO v_refund_id;

        -- Authoritative Admin Audit Trail (if invoked within authenticated user session)
        IF auth.uid() IS NOT NULL THEN
            INSERT INTO public.admin_audit_logs (
                actor_user_id,
                action,
                entity_type,
                entity_id,
                details
            ) VALUES (
                auth.uid(),
                'cancelled_subscription_payment_captured_and_refund_queued',
                'payment_orders',
                v_order.id::text,
                jsonb_build_object(
                    'subscription_id', v_subscription.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'provider_payment_id', p_provider_payment_id,
                    'amount', p_verified_amount,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'reconciled_at', now()
                )
            );
        END IF;

        -- Acknowledge durable reconciliation to caller/webhook
        RETURN jsonb_build_object(
            'status', 'refund_queued',
            'purpose', 'subscription',
            'subscription_id', v_subscription.id,
            'subscription_status', 'cancelled',
            'payment_order_id', v_order.id,
            'payment_transaction_id', v_transaction_id,
            'refund_id', v_refund_id,
            'refund_status', 'requested',
            'amount_refunded', p_verified_amount,
            'message', 'Payment captured for cancelled subscription; refund automatically requested.'
        );
    END IF;

    -- 8. Standard Pre-Payment Validation (For active/pending orders)
    IF v_order.status NOT IN ('created', 'pending') THEN
        RAISE EXCEPTION 'Payment order is in an invalid state for confirmation: %.', v_order.status;
    END IF;

    -- 9. Insert new immutable transaction with exact verified amount if not existing
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

    -- 10. Transition Payment Order to 'paid'
    UPDATE public.payment_orders
    SET status = 'paid'::public.payment_order_status,
        updated_at = now()
    WHERE id = p_payment_order_id;

    -- 11. Purpose-Specific State Transition Branching
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

            -- Validate slot availability before confirming booking
            v_dow := EXTRACT(DOW FROM v_booking.booking_date)::INTEGER;
            v_start_time := v_booking.booking_time;
            v_end_time := (v_booking.booking_time + (v_booking.duration_minutes || ' minutes')::INTERVAL)::TIME;

            SELECT EXISTS (
                SELECT 1 FROM public.pandit_availability_slots
                WHERE pandit_id = v_booking.pandit_id
                  AND day_of_week = v_dow
                  AND start_time <= v_start_time
                  AND end_time >= v_end_time
                  AND is_active = true
            ) INTO v_slot_valid;

            IF NOT v_slot_valid THEN
                SELECT * INTO v_pandit FROM public.pandit_profiles WHERE id = v_booking.pandit_id;
                IF NOT FOUND OR v_pandit.status != 'active' THEN
                    RAISE EXCEPTION 'Selected pandit is unavailable or inactive.';
                END IF;
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
                'amount_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'confirmed_at', now()
            );

        -- ------------------------------------------------------------
        -- booking_balance: Completes second-installment payment
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

            IF v_booking.status != 'confirmed' THEN
                RAISE EXCEPTION 'Booking must be in confirmed state to pay balance (current state: %).', v_booking.status;
            END IF;

            UPDATE public.bookings
            SET balance_paid = true,
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
        -- prepone_fee: Confirms administrative reschedule fee
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
            WHERE booking_id = v_booking.id
              AND status = 'pending_customer_payment'::public.reschedule_request_status
              AND change_type = 'prepone'
              AND fee_amount = p_verified_amount
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No pending prepone reschedule request found matching fee amount % for booking %.', p_verified_amount, v_booking.id;
            END IF;

            -- Apply requested booking schedule adjustments
            UPDATE public.bookings
            SET booking_date = v_reschedule.requested_date,
                booking_time = v_reschedule.requested_time,
                updated_at = now()
            WHERE id = v_booking.id;

            -- Mark reschedule request approved
            UPDATE public.booking_reschedule_requests
            SET status = 'approved'::public.reschedule_request_status,
                responded_at = now(),
                response_notes = 'Prepone fee paid and reschedule confirmed.',
                updated_at = now()
            WHERE id = v_reschedule.id;

            v_result := jsonb_build_object(
                'status', 'prepone_confirmed',
                'purpose', 'prepone_fee',
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'reschedule_request_id', v_reschedule.id,
                'new_booking_date', v_reschedule.requested_date,
                'new_booking_time', v_reschedule.requested_time,
                'fee_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'confirmed_at', now()
            );

        -- ------------------------------------------------------------
        -- kundli: Confirms Kundli consultation report order
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
            SET status = 'processing'::public.kundli_order_status,
                updated_at = now()
            WHERE id = v_kundli.id;

            v_result := jsonb_build_object(
                'status', 'processing',
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
                'status', 'confirmed',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'amount_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'confirmed_at', now()
            );
    END CASE;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) IS 
    'Confirms payment order, validates exact amount and idempotency, activates bookings, subscriptions, and Kundli orders. AST-P01 duration snapshot compliant; AST-P02 cancelled subscription capture-reconciliation and auto-refund compliant.';

REVOKE EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;
