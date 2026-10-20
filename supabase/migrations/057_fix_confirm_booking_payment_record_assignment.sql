-- =============================================================================
-- Migration 057: Fix confirm_booking_payment Record Assignment Evaluation Defect
-- =============================================================================
-- Remediates PostgreSQL runtime evaluation failure in public.confirm_booking_payment:
--   ERROR: record "v_subscription" is not assigned yet
--   DETAIL: The tuple structure of a not-yet-assigned record is indeterminate.
--   SQLSTATE: 55000 (ERRCODE_OBJECT_NOT_IN_PREREQUISITE_STATE)
--
-- ROOT CAUSE:
-- In Migration 056, variable `v_subscription` was declared as an untyped `RECORD`.
-- `v_subscription` is only assigned when `v_order.purpose = 'subscription'`.
-- For non-subscription orders (booking_advance, booking_balance, prepone_fee, kundli),
-- `v_subscription` remains unassigned without a tuple structure.
-- In Step 6 (AST-P02 Idempotency Check), the compound boolean condition:
--   IF v_existing_tx.id IS NOT NULL AND
--      (v_order.status IN ('cancelled', 'expired') OR (v_order.purpose = 'subscription' AND v_subscription.id IS NOT NULL AND v_subscription.status = 'cancelled'))
-- caused PostgreSQL PL/pgSQL expression parameter evaluation to resolve record fields
-- (v_subscription.id / v_subscription.status) prior to evaluation. Because PL/pgSQL
-- expression parameter evaluation resolves unassigned RECORD attributes regardless
-- of boolean short-circuiting, all non-subscription payment confirmation flows aborted.
--
-- REMEDIATION:
-- 1. Introduce initialized boolean flag `v_is_subscription_cancelled BOOLEAN := false;`.
-- 2. Safely evaluate subscription cancellation strictly inside Step 3 after verifying FOUND.
-- 3. Replace unsafe inline record field access in Step 6 with `v_is_subscription_cancelled`.
-- 4. Preserve all 12 financial consistency invariants, concurrency controls, row locks,
--    exact amount validations, timeout recoveries, and idempotency guarantees.
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

    -- Extract gateway event timestamp from top-level signed webhook payload envelope.
    -- Provider Semantics & Invariants:
    -- In Razorpay, payload.payload.payment.entity.created_at represents the timestamp
    -- when the payment attempt entity was created (e.g. checkout opened), NOT capture time.
    -- Using entity.created_at would allow a late capture to masquerade as on-time.
    -- The top-level payload.created_at is the signed webhook event generation timestamp
    -- emitted by Razorpay when the payment.captured event occurred.
    -- If top-level created_at is present, it provides provider-signed evidence of event
    -- occurrence. If absent or invalid, the conservative, auditable fallback is now().
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

    -- 5. Idempotency Check: Order already marked paid
    IF v_order.status = 'paid' THEN
        IF v_existing_tx.id IS NULL THEN
            RAISE EXCEPTION 'Payment order is marked paid but no corresponding transaction exists for provider payment ID %.',
                p_provider_payment_id;
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
    -- Uses safe boolean flag v_is_subscription_cancelled to avoid evaluating unassigned RECORD attributes
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
                -- Reuse existing refund record and stable refund ID for retry.
                -- Preserves gateway idempotency key ("refund_" || id) and avoids creating duplicate obligations.
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
            -- No refund obligation was recorded yet. If order is cancelled, overdue, or subscription,
            -- synthesize the missing refund obligation. For on-time booking_advance or prepone_fee,
            -- allow fall-through to Step 9 to evaluate authoritative slot/availability recovery.
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
    -- Permit created, pending, and expired/cancelled (which routes to durable capture + refund_queued)
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
    -- Payment order is updated to 'paid' strictly upon successful, verified business transition.
    CASE v_order.purpose
        -- ------------------------------------------------------------
        -- A. booking_advance: Confirms initial booking (F3-02 Fix)
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

            -- Evaluate whether booking is eligible for confirmation or recovery:
            -- 1. Timing: payment must be on time (NOT v_is_overdue)
            -- 2. State: order must be in ('created', 'pending', 'expired') (NOT cancelled)
            -- 3. Booking state: 'payment_pending' OR ('cancelled' with cancellation_reason = 'payment_timeout' strictly)
            -- 4. Never confirmed before (v_booking.confirmed_at IS NULL)
            -- 5. No explicit customer or admin cancellation (NOT EXISTS booking_cancellations)
            -- 6. Future start: scheduled_start_at > now()
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

                -- Acquire row-level lock on Pandit profile
                SELECT * INTO v_pandit
                FROM public.pandit_profiles
                WHERE id = v_booking.pandit_id
                FOR UPDATE;

                IF FOUND
                   AND v_pandit.verification_status = 'approved'
                   AND v_pandit.public_status = 'available' THEN

                    v_dow := EXTRACT(DOW FROM (v_booking.scheduled_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
                    v_start_time := (v_booking.scheduled_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
                    v_end_time := (v_booking.scheduled_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

                    -- Re-verify Pandit availability rules and unavailability blocks
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
                    ) THEN

                        -- Re-verify that the slot has not been taken by another confirmed booking or active reservation
                        IF NOT EXISTS (
                            SELECT 1 
                            FROM public.bookings b
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
                              AND v_booking.scheduled_start_at < b.scheduled_end_at
                              AND v_booking.scheduled_end_at > b.scheduled_start_at
                        ) THEN
                            v_can_confirm := true;
                        END IF;
                    END IF;
                END IF;
            END IF;

            IF v_can_confirm THEN
                IF v_booking.status = 'cancelled'::public.booking_status OR v_order.status = 'expired'::public.payment_order_status THEN
                    v_is_timeout_recovery := true;
                END IF;

                -- Mark Payment Order Paid upon valid confirmation or recovery
                UPDATE public.payment_orders
                SET status = 'paid'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                -- Transition booking status to 'confirmed', clearing any previous timeout cancellation
                UPDATE public.bookings
                SET status = 'confirmed'::public.booking_status,
                    confirmed_at = now(),
                    cancelled_at = NULL,
                    cancellation_reason = NULL,
                    updated_at = now()
                WHERE id = v_booking.id;

                -- Create future balance payment order obligation if balance is outstanding
                IF v_booking.balance_amount > 0 AND NOT EXISTS (
                    SELECT 1 FROM public.payment_orders
                    WHERE booking_id = v_booking.id
                      AND purpose = 'booking_balance'::public.payment_order_purpose
                      AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status, 'paid'::public.payment_order_status)
                ) THEN
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
                        v_booking.balance_amount,
                        'INR',
                        'created'::public.payment_order_status,
                        'razorpay',
                        CASE
                            WHEN v_booking.scheduled_start_at - interval '24 hours' <= now() THEN now()
                            ELSE v_booking.scheduled_start_at - interval '24 hours'
                        END
                    );
                END IF;

                v_result := jsonb_build_object(
                    'status', 'confirmed',
                    'purpose', 'booking_advance',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'advance_paid', p_verified_amount,
                    'balance_amount', v_booking.balance_amount,
                    'payment_transaction_id', v_transaction_id,
                    'confirmed_at', now(),
                    'is_recovered', v_is_timeout_recovery
                );
            ELSE
                -- Confirmation not possible: order expired/cancelled, overdue, slot claimed, or pandit unavailable.
                -- Safely maintain terminal states and queue full refund.
                IF v_order.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status) THEN
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
        -- B. booking_balance: Settles ritual dakshina balance (F3-02 Fix)
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

            IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled') THEN
                RAISE EXCEPTION 'Booking must be in confirmed/active state to pay balance (current state: %).', v_booking.status;
            END IF;

            -- Settle balance: Updating updated_at on bookings row.
            -- Full financial balance settlement is authoritatively tracked via
            -- public.payment_transactions ('captured') and public.payment_orders ('paid'),
            -- which is validated by public.calculate_booking_balance returning outstanding_balance = 0.
            UPDATE public.payment_orders
            SET status = 'paid'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;

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
        -- C. prepone_fee: Confirms administrative reschedule fee (F3-02 Fix)
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

            -- Locate and lock the linked prepone reschedule request
            -- Priority 1: Direct 1-to-1 association via payment_order_id
            -- Priority 2: Unambiguous fallback matching booking_id, change_type, fee_amount
            SELECT * INTO v_reschedule
            FROM public.booking_reschedule_requests
            WHERE (payment_order_id = v_order.id
                   OR (payment_order_id IS NULL AND booking_id = v_booking.id AND change_type = 'prepone' AND fee_amount = p_verified_amount))
            ORDER BY (payment_order_id = v_order.id) DESC, created_at DESC
            LIMIT 1
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No reschedule request found associated with payment order % for booking %.',
                    v_order.id, v_booking.id;
            END IF;

            -- Check Reschedule Policy Limit: If limit reached, reject request and queue fee refund
            -- while strictly preserving the original booking
            SELECT * INTO v_policy FROM public.booking_policy_settings WHERE id = 1;
            IF v_booking.reschedule_count >= COALESCE(v_policy.max_reschedules, 1) THEN
                UPDATE public.payment_orders
                SET status = 'expired'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                IF v_reschedule.status = 'requested'::public.reschedule_request_status THEN
                    UPDATE public.booking_reschedule_requests
                    SET status = 'rejected'::public.reschedule_request_status,
                        updated_at = now()
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
                    p_verified_amount,
                    'Booking has reached the maximum permitted reschedule limit: automatic fee refund queued.',
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
                    'message', 'Booking has reached maximum permitted reschedule limit. Reschedule fee refund has been queued automatically.'
                );
            END IF;

            -- Strict Validation of Linked Reschedule Request Integrity:
            -- 1. Validate booking association
            IF v_reschedule.booking_id != v_booking.id THEN
                RAISE EXCEPTION 'Reschedule request % does not belong to booking %.',
                    v_reschedule.id, v_booking.id;
            END IF;

            -- 2. Validate payment order link
            IF v_reschedule.payment_order_id IS NOT NULL AND v_reschedule.payment_order_id != v_order.id THEN
                RAISE EXCEPTION 'Reschedule request % is linked to a different payment order (%).',
                    v_reschedule.id, v_reschedule.payment_order_id;
            END IF;

            -- 3. Validate change_type
            IF v_reschedule.change_type != 'prepone'::public.reschedule_change_type THEN
                RAISE EXCEPTION 'Reschedule request % change type is "%", expected "prepone".',
                    v_reschedule.id, v_reschedule.change_type;
            END IF;

            -- 4. Reject cancelled, rejected, or overdue requests
            -- Note: if order and request expired solely due to housekeeping timeout (v_reschedule.status = 'expired' and v_order.status = 'expired'),
            -- but the captured payment was ON TIME (NOT v_is_overdue), permit recovery to proceed!
            IF v_order.status = 'cancelled'::public.payment_order_status
               OR v_reschedule.status IN ('rejected'::public.reschedule_request_status, 'cancelled'::public.reschedule_request_status)
               OR v_is_overdue
               OR (v_reschedule.status != 'requested'::public.reschedule_request_status AND v_reschedule.status != 'expired'::public.reschedule_request_status) THEN
                IF v_order.status IN ('created', 'pending') THEN
                    UPDATE public.payment_orders
                    SET status = 'expired'::public.payment_order_status,
                        updated_at = now()
                    WHERE id = v_order.id;
                END IF;

                IF v_reschedule.status = 'requested'::public.reschedule_request_status THEN
                    UPDATE public.booking_reschedule_requests
                    SET status = CASE
                            WHEN v_is_overdue THEN 'expired'::public.reschedule_request_status
                            ELSE 'rejected'::public.reschedule_request_status
                        END,
                        updated_at = now()
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
                    p_verified_amount,
                    CASE 
                        WHEN v_is_overdue THEN 'Payment captured after prepone fee order deadline: automatic fee refund queued.'
                        ELSE 'Payment captured after prepone fee order expired or request was closed: automatic fee refund queued.'
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
                    'message', CASE 
                        WHEN v_is_overdue THEN 'Fee payment captured after deadline expired. Fee refund has been queued automatically.'
                        ELSE 'Fee payment captured after request expired or closed. Fee refund has been queued automatically.'
                    END
                );
            END IF;

            -- 5. Validate fee amount equality
            IF v_reschedule.fee_amount != p_verified_amount THEN
                RAISE EXCEPTION 'Reschedule request fee amount (%) does not match verified payment amount (%).',
                    v_reschedule.fee_amount, p_verified_amount;
            END IF;

            -- 6. Validate timing freshness: If requested start time has already passed, expire request and queue refund
            IF v_reschedule.requested_start_at <= now() THEN
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
                    'Requested reschedule start time is in the past: automatic fee refund queued.',
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

            -- 7. If associated via fallback, ensure no ambiguous multiple pending requests exist
            IF v_reschedule.payment_order_id IS NULL THEN
                IF (SELECT count(*) FROM public.booking_reschedule_requests WHERE booking_id = v_booking.id AND status = 'requested'::public.reschedule_request_status) > 1 THEN
                    RAISE EXCEPTION 'Multiple ambiguous pending reschedule requests exist for booking %. Cannot associate payment order % safely.',
                        v_booking.id, v_order.id;
                END IF;
            END IF;

            -- Row-level exclusive lock on Pandit to serialize concurrent schedule updates
            SELECT * INTO v_pandit
            FROM public.pandit_profiles
            WHERE id = v_booking.pandit_id
            FOR UPDATE;

            -- Re-verify Pandit Availability for Requested Timestamps
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

            -- Conflict Check Against Other Bookings or Pending Reservations (Deadline-Aware)
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

            -- Mark Payment Order Paid upon valid prepone fee confirmation
            UPDATE public.payment_orders
            SET status = 'paid'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;

            -- Apply requested booking schedule adjustments: increment count accurately (no silent capping)
            UPDATE public.bookings
            SET scheduled_start_at = v_reschedule.requested_start_at,
                scheduled_end_at = v_reschedule.requested_end_at,
                reschedule_count = v_booking.reschedule_count + 1,
                status = 'rescheduled'::public.booking_status,
                updated_at = now()
            WHERE id = v_booking.id;

            -- Mark reschedule request approved and link payment_order_id deterministically
            UPDATE public.booking_reschedule_requests
            SET status = 'approved'::public.reschedule_request_status,
                approved_at = now(),
                payment_order_id = COALESCE(payment_order_id, v_order.id),
                updated_at = now()
            WHERE id = v_reschedule.id;

            -- Shift due_at for any open balance payment order to maintain 24h cutoff
            UPDATE public.payment_orders
            SET due_at = CASE 
                    WHEN v_reschedule.requested_start_at - interval '24 hours' <= now() THEN now()
                    ELSE v_reschedule.requested_start_at - interval '24 hours'
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
        -- E. subscription: Confirms astrology subscription with AST-P01 duration
        -- ------------------------------------------------------------
        WHEN 'subscription' THEN
            IF v_order.subscription_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose subscription must have an associated subscription_id.';
            END IF;

            IF v_order.status = 'cancelled' OR v_is_subscription_cancelled THEN
                -- AST-P02: Late capture on cancelled subscription queues refund
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

                -- AST-P01: Use immutable checkout snapshot duration_days
                IF v_order.duration_days IS NULL OR v_order.duration_days <= 0 THEN
                    RAISE EXCEPTION 'Payment order % is missing authoritative duration_days snapshot.', v_order.id;
                END IF;

                -- Check for existing active subscription to stack or activate immediately
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

        -- ------------------------------------------------------------
        -- F. Fallback: Fail closed on unsupported or unhandled payment order purpose
        -- ------------------------------------------------------------
        ELSE
            RAISE EXCEPTION 'Unsupported or unhandled payment order purpose: "%". This purpose is not routed for automated fulfillment via confirm_booking_payment.', v_order.purpose
                USING ERRCODE = '22000';
    END CASE;

    RETURN v_result;
END;
$$;

-- Explicit Execution ACLs for confirm_booking_payment
REVOKE ALL ON FUNCTION public.confirm_booking_payment(
    UUID, TEXT, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(
    UUID, TEXT, NUMERIC, TEXT, JSONB
) TO service_role, postgres;
