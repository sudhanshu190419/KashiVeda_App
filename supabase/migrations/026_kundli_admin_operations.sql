-- =============================================================================
-- Migration: 026_kundli_admin_operations.sql
-- Description: Authoritative administrative operations for Kundli orders:
--              1. admin_cancel_kundli_order: Atomically cancels Kundli order and
--                 creates refund records across captured payment transactions.
--                 Enforced for Super Administrators only.
--              2. admin_reassign_kundli_pandit: Validates and reassigns an active
--                 Kundli order to an approved, Kundli-enabled Pandit.
--              3. admin_upload_kundli_document: Allows administrators to record
--                 fulfilled or revised Kundli PDF document metadata with strict
--                 path traversal defense, versioning, and automatic status progression.
-- Source of Truth: Kashi Veda Phase 18 Administrative Architecture Specification
-- DO NOT APPLY AUTOMATICALLY: To be applied by administrator.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: admin_cancel_kundli_order
-- -----------------------------------------------------------------------------
-- Authoritative administrative cancellation of a Kundli order.
-- Strictly enforced for Super Administrators only.
-- If payment was captured, creates authoritative refund records in public.refunds
-- using the established M16/M17 financial state machine.

CREATE OR REPLACE FUNCTION public.admin_cancel_kundli_order(
    p_kundli_order_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_order RECORD;
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
    v_trimmed_reason TEXT;
BEGIN
    -- 1. Authorization: Super Administrator privileges required
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_super_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Super Administrator privileges required to cancel Kundli orders.';
    END IF;

    -- 2. Validate reason
    v_trimmed_reason := trim(COALESCE(p_reason, ''));
    IF length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'A detailed cancellation reason of at least 5 characters is required.';
    END IF;

    -- 3. Fetch & Lock Kundli Order
    SELECT * INTO v_order
    FROM public.kundli_orders
    WHERE id = p_kundli_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kundli order % not found.', p_kundli_order_id;
    END IF;

    -- 4. Terminal State Protection
    IF v_order.status = 'completed' THEN
        RAISE EXCEPTION 'Cannot cancel Kundli order in completed status. Payout and fulfillment are already finalized.';
    END IF;

    -- Idempotency check: Already cancelled
    IF v_order.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_cancelled',
            'kundli_order_id', v_order.id,
            'message', 'Kundli order has already been cancelled.'
        );
    END IF;

    -- 5. Calculate Total Captured Funds across Linked Payment Transactions
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_total_captured
    FROM public.payment_transactions pt
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.kundli_order_id = v_order.id
      AND pt.status IN ('captured', 'refunded', 'partially_refunded');

    -- 6. Calculate Already Refunded Funds across Linked Payment Transactions
    SELECT COALESCE(SUM(r.amount), 0) INTO v_total_already_refunded
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.kundli_order_id = v_order.id
      AND r.status IN ('requested', 'processing', 'processed');

    v_net_captured := GREATEST(v_total_captured - v_total_already_refunded, 0);
    v_refund_amount := v_net_captured;

    -- 7. Distribute 100% Refund across Captured Transactions
    v_remaining_refund := v_refund_amount;
    IF v_remaining_refund > 0 THEN
        FOR v_tx IN 
            SELECT pt.id, pt.amount
            FROM public.payment_transactions pt
            JOIN public.payment_orders po ON po.id = pt.payment_order_id
            WHERE po.kundli_order_id = v_order.id
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

    -- 8. Cancel Any Open / Pending Payment Orders
    UPDATE public.payment_orders
    SET status = 'cancelled'::public.payment_order_status,
        updated_at = now()
    WHERE kundli_order_id = v_order.id
      AND status IN ('created', 'pending');

    -- 9. Transition Kundli Order Status to Cancelled
    UPDATE public.kundli_orders
    SET status = 'cancelled'::public.kundli_order_status,
        updated_at = now()
    WHERE id = v_order.id;

    -- 10. Record Authoritative Admin Audit Log
    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            before_json,
            after_json,
            details
        ) VALUES (
            v_caller_id,
            'kundli_order_cancelled_by_admin',
            'kundli_orders',
            v_order.id::text,
            jsonb_build_object('status', v_order.status),
            jsonb_build_object('status', 'cancelled', 'refund_amount', v_refund_amount),
            jsonb_build_object(
                'reason', v_trimmed_reason,
                'refund_amount', v_refund_amount,
                'total_captured', v_total_captured,
                'already_refunded', v_total_already_refunded
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'cancelled',
        'kundli_order_id', v_order.id,
        'total_captured', v_total_captured,
        'already_refunded', v_total_already_refunded,
        'refund_amount', v_refund_amount,
        'message', CASE 
            WHEN v_refund_amount > 0 THEN 'Kundli order cancelled. Refund queued for gateway execution.'
            ELSE 'Kundli order cancelled. No captured funds required refunding.'
        END
    );
END;
$$;

COMMENT ON FUNCTION public.admin_cancel_kundli_order(UUID, TEXT) IS
'Authoritative administrative cancellation for Kundli orders. Super Administrator only. Automatically queues 100% refund for captured funds.';

REVOKE EXECUTE ON FUNCTION public.admin_cancel_kundli_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_kundli_order(UUID, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. RPC: admin_reassign_kundli_pandit
-- -----------------------------------------------------------------------------
-- Authoritative Pandit reassignment for active Kundli orders.
-- Validates new Pandit approval and Kundli enablement before updating assignment.

CREATE OR REPLACE FUNCTION public.admin_reassign_kundli_pandit(
    p_kundli_order_id UUID,
    p_new_pandit_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_order RECORD;
    v_new_pandit RECORD;
    v_trimmed_reason TEXT;
BEGIN
    -- 1. Authorization: Administrator privileges required
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to reassign Kundli orders.';
    END IF;

    -- 2. Validate reason
    v_trimmed_reason := trim(COALESCE(p_reason, ''));
    IF length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'A valid reassignment reason of at least 5 characters is required.';
    END IF;

    -- 3. Fetch & Lock Kundli Order
    SELECT * INTO v_order
    FROM public.kundli_orders
    WHERE id = p_kundli_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kundli order % not found.', p_kundli_order_id;
    END IF;

    -- 4. Terminal State Protection
    IF v_order.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot reassign Kundli order in terminal status %.', v_order.status;
    END IF;

    -- 5. No-op Check
    IF v_order.pandit_id = p_new_pandit_id THEN
        RAISE EXCEPTION 'Kundli order is already assigned to this Pandit.';
    END IF;

    -- 6. Validate Target Pandit Eligibility
    SELECT * INTO v_new_pandit
    FROM public.pandit_profiles
    WHERE id = p_new_pandit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target Pandit profile % not found.', p_new_pandit_id;
    END IF;

    IF v_new_pandit.verification_status != 'approved' THEN
        RAISE EXCEPTION 'Target Pandit is not approved (verification_status: %).', v_new_pandit.verification_status;
    END IF;

    IF NOT v_new_pandit.kundli_enabled THEN
        RAISE EXCEPTION 'Target Pandit does not offer Kundli services.';
    END IF;

    -- 7. Atomically Update Pandit Assignment
    UPDATE public.kundli_orders
    SET pandit_id = p_new_pandit_id,
        updated_at = now()
    WHERE id = p_kundli_order_id;

    -- 8. Record Authoritative Admin Audit Log
    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            before_json,
            after_json,
            details
        ) VALUES (
            v_caller_id,
            'kundli_order_pandit_reassigned',
            'kundli_orders',
            p_kundli_order_id::text,
            jsonb_build_object('pandit_id', v_order.pandit_id),
            jsonb_build_object('pandit_id', p_new_pandit_id),
            jsonb_build_object(
                'old_pandit_id', v_order.pandit_id,
                'new_pandit_id', p_new_pandit_id,
                'reason', v_trimmed_reason
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'kundli_order_id', p_kundli_order_id,
        'old_pandit_id', v_order.pandit_id,
        'new_pandit_id', p_new_pandit_id,
        'status', v_order.status,
        'message', 'Pandit successfully reassigned for Kundli order.'
    );
END;
$$;

COMMENT ON FUNCTION public.admin_reassign_kundli_pandit(UUID, UUID, TEXT) IS
'Authoritative administrative Pandit reassignment for Kundli orders.';

REVOKE EXECUTE ON FUNCTION public.admin_reassign_kundli_pandit(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reassign_kundli_pandit(UUID, UUID, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. RPC: admin_upload_kundli_document
-- -----------------------------------------------------------------------------
-- Authoritative document metadata creation by administrators on behalf of Pandit.
-- Manages version incrementation, previous current flag reset, and triggers status progression.
-- Enforces strict path-traversal prevention.

CREATE OR REPLACE FUNCTION public.admin_upload_kundli_document(
    p_kundli_order_id UUID,
    p_storage_path TEXT,
    p_file_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_order RECORD;
    v_next_version INTEGER;
    v_document_id UUID;
BEGIN
    -- 1. Authorization: Administrator privileges required
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to upload Kundli documents.';
    END IF;

    -- 2. Validate Storage Path Convention ({kundli_order_id}/{file_name})
    IF p_storage_path NOT LIKE (p_kundli_order_id::text || '/%') THEN
        RAISE EXCEPTION 'Invalid storage path: Must follow %/{filename} convention.', p_kundli_order_id;
    END IF;

    -- Defense-in-depth: Reject any path traversal sequence
    IF p_storage_path LIKE '%..%' THEN
        RAISE EXCEPTION 'Path traversal sequences are not permitted.';
    END IF;

    -- Enforce PDF extension
    IF lower(p_storage_path) NOT LIKE '%.pdf' THEN
        RAISE EXCEPTION 'Invalid file type: Only PDF documents are permitted for Kundli fulfillment.';
    END IF;

    -- 3. Fetch & Lock Kundli Order
    SELECT * INTO v_order
    FROM public.kundli_orders
    WHERE id = p_kundli_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kundli order % not found.', p_kundli_order_id;
    END IF;

    IF v_order.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot upload documents for Kundli order in terminal state %.', v_order.status;
    END IF;

    -- 4. Calculate Version Number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM public.kundli_documents
    WHERE kundli_order_id = p_kundli_order_id;

    -- 5. Mark Previous Current Documents as Not Current
    UPDATE public.kundli_documents
    SET is_current = false
    WHERE kundli_order_id = p_kundli_order_id
      AND is_current = true;

    -- 6. Insert New Document Metadata
    INSERT INTO public.kundli_documents (
        kundli_order_id,
        version_number,
        storage_path,
        file_name,
        uploaded_by,
        uploaded_at,
        is_current
    ) VALUES (
        p_kundli_order_id,
        v_next_version,
        p_storage_path,
        p_file_name,
        COALESCE(v_caller_id, v_order.customer_id),
        now(),
        true
    ) RETURNING id INTO v_document_id;

    -- Note: trg_kundli_document_uploaded automatically advances order status
    -- to 'document_uploaded' if it was in ('paid', 'in_progress').

    -- 7. Record Authoritative Admin Audit Log
    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            after_json,
            details
        ) VALUES (
            v_caller_id,
            'kundli_document_uploaded_by_admin',
            'kundli_documents',
            v_document_id::text,
            jsonb_build_object('document_id', v_document_id, 'version_number', v_next_version, 'file_name', p_file_name),
            jsonb_build_object(
                'kundli_order_id', p_kundli_order_id,
                'storage_path', p_storage_path,
                'version_number', v_next_version
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'document_id', v_document_id,
        'kundli_order_id', p_kundli_order_id,
        'version_number', v_next_version,
        'file_name', p_file_name,
        'storage_path', p_storage_path,
        'message', 'Kundli document successfully recorded by admin.'
    );
END;
$$;

COMMENT ON FUNCTION public.admin_upload_kundli_document(UUID, TEXT, TEXT) IS
'Authoritative administrative document upload handler for Kundli orders.';

REVOKE EXECUTE ON FUNCTION public.admin_upload_kundli_document(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upload_kundli_document(UUID, TEXT, TEXT) TO authenticated, service_role;
