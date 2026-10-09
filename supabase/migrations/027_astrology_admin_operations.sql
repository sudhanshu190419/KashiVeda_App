-- =============================================================================
-- Migration: 027_astrology_admin_operations.sql
-- Description: Authoritative administrative operations for Vedic Astrology services (M19):
--              1. Index on astrology_subscriptions.created_at for directory pagination.
--              2. Super Admin RPC: admin_cancel_astrology_subscription (with M17 refund queueing).
--              3. Admin RPC: admin_retry_astrology_delivery (resets failed delivery to queued).
-- Source of Truth: Kashi Veda Phase 2A Specification & M19 Architecture Audit
-- =============================================================================

-- =============================================================================
-- 1. Performance Index for Subscription Directory Pagination
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_astrology_subscriptions_created_at
    ON public.astrology_subscriptions (created_at DESC);


-- =============================================================================
-- 2. RPC: admin_cancel_astrology_subscription
-- =============================================================================
-- Authoritative administrative subscription cancellation.
-- Super Administrator only.
-- Atomically cancels subscription, cancels open payment orders,
-- queues requested refund obligation in public.refunds for captured funds,
-- and records immutable entry in public.admin_audit_logs.

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

    -- 3. Fetch & Lock Astrology Subscription FOR UPDATE
    SELECT * INTO v_subscription
    FROM public.astrology_subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrology subscription % not found.', p_subscription_id;
    END IF;

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
'Authoritative administrative cancellation for customer astrology subscriptions. Super Administrator only. Cancels open payment orders, updates status to cancelled, and optionally queues refund obligation in public.refunds.';

REVOKE EXECUTE ON FUNCTION public.admin_cancel_astrology_subscription(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_astrology_subscription(UUID, TEXT, BOOLEAN) TO authenticated, service_role;


-- =============================================================================
-- 3. RPC: admin_retry_astrology_delivery
-- =============================================================================
-- Authoritative retry for failed astrology deliveries.
-- Administrator privileges required.
-- Atomically resets status from failed to queued, clears error_message,
-- and records entry in public.admin_audit_logs.

CREATE OR REPLACE FUNCTION public.admin_retry_astrology_delivery(
    p_delivery_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_delivery RECORD;
BEGIN
    -- 1. Authorization: Administrator privileges required
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to retry astrology deliveries.';
    END IF;

    -- 2. Fetch & Lock Astrology Delivery FOR UPDATE
    SELECT * INTO v_delivery
    FROM public.astrology_deliveries
    WHERE id = p_delivery_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Astrology delivery % not found.', p_delivery_id;
    END IF;

    -- 3. State Invariant Checks
    IF v_delivery.status = 'sent' THEN
        RAISE EXCEPTION 'Cannot retry delivery that has already been successfully sent.';
    END IF;

    IF v_delivery.status = 'skipped' THEN
        RAISE EXCEPTION 'Cannot retry delivery in skipped status.';
    END IF;

    -- Idempotency check: Already queued
    IF v_delivery.status = 'queued' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_queued',
            'delivery_id', v_delivery.id,
            'message', 'Delivery is already queued for dispatch.'
        );
    END IF;

    IF v_delivery.status != 'failed' THEN
        RAISE EXCEPTION 'Cannot retry delivery in status % (only failed deliveries may be retried).', v_delivery.status;
    END IF;

    -- 4. Atomically Reset Delivery Status to queued & Clear Previous Error
    UPDATE public.astrology_deliveries
    SET status = 'queued'::public.astrology_delivery_status,
        error_message = NULL,
        scheduled_at = now()
    WHERE id = p_delivery_id;

    -- 5. Record Authoritative Admin Audit Log
    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_caller_id,
            'astrology_delivery_retried_by_admin',
            'astrology_deliveries',
            p_delivery_id::text,
            jsonb_build_object(
                'previous_status', 'failed',
                'new_status', 'queued',
                'subscription_id', v_delivery.subscription_id,
                'content_id', v_delivery.content_id,
                'channel', v_delivery.channel,
                'previous_error', v_delivery.error_message
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'queued',
        'delivery_id', p_delivery_id,
        'subscription_id', v_delivery.subscription_id,
        'content_id', v_delivery.content_id,
        'channel', v_delivery.channel,
        'message', 'Astrology delivery status reset to queued for dispatch retry.'
    );
END;
$$;

COMMENT ON FUNCTION public.admin_retry_astrology_delivery(UUID) IS
'Authoritative administrative retry for failed astrology deliveries. Resets status to queued and clears error_message.';

REVOKE EXECUTE ON FUNCTION public.admin_retry_astrology_delivery(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_retry_astrology_delivery(UUID) TO authenticated, service_role;
