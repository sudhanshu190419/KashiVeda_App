-- =============================================================================
-- Migration 025: Financial Refund Recovery & Stuck Claim Reconciliation
-- =============================================================================
-- Prerequisite: Migration 024 (Financial Backend Hardening) is already applied.
--
-- Purpose:
-- 1. Adds updated_at tracking and indexes to public.refunds to support in-flight
--    gateway lease validation and automated lease expiration detection.
-- 2. Ensures the details JSONB column exists on public.admin_audit_logs for
--    dual-compatible structured administrative audit logging.
-- 3. Attaches an automatic trigger (trg_refunds_updated_at) using the existing
--    public.set_updated_at() routine to guarantee updated_at is always maintained.
-- 4. Upgrades claim_refund_for_execution, reconcile_processed_refund, and
--    reconcile_failed_refund to explicitly update updated_at and dual-log audit.
-- 5. Implements authoritative administrative recovery RPC:
--    public.admin_unlock_stuck_refund(UUID, TEXT)
--    allowing administrators to release orphaned processing claims (where the
--    gateway outcome was unknown and age >= 15 minutes) into a safe retryable state.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema Extensions: Refunds updated_at & Audit details
-- -----------------------------------------------------------------------------

-- Track updated_at on public.refunds to support safe lock lease expirations and recovery
ALTER TABLE public.refunds 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ensure details column exists on admin_audit_logs for structured metadata
ALTER TABLE public.admin_audit_logs 
    ADD COLUMN IF NOT EXISTS details JSONB;

-- Composite index for efficient querying of in-flight / stuck processing refunds
CREATE INDEX IF NOT EXISTS idx_refunds_status_updated_at 
    ON public.refunds(status, updated_at);

-- Attach standard updated_at trigger to public.refunds
DROP TRIGGER IF EXISTS trg_refunds_updated_at ON public.refunds;
CREATE TRIGGER trg_refunds_updated_at
    BEFORE UPDATE ON public.refunds
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 2. Enhanced Exclusive Claim RPC: claim_refund_for_execution
-- -----------------------------------------------------------------------------
-- Upgraded to explicitly stamp updated_at = now() and write dual audit payloads.
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
    SET status = 'processing',
        updated_at = now()
    WHERE id = p_refund_id;

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
            'claim_gateway_refund',
            'refund',
            p_refund_id::text,
            jsonb_build_object(
                'amount', v_refund.amount,
                'payment_transaction_id', v_refund.payment_transaction_id,
                'provider_payment_id', v_tx.provider_payment_id,
                'previous_status', v_refund.status,
                'new_status', 'processing'
            ),
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
'Atomically claims a requested or failed refund obligation for gateway execution, preventing concurrent double-charges.';

REVOKE EXECUTE ON FUNCTION public.claim_refund_for_execution(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_refund_for_execution(UUID) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. Enhanced Reconciliation RPCs: reconcile_processed_refund & reconcile_failed_refund
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
        processed_at = COALESCE(processed_at, now()),
        updated_at = now()
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
    SET status = 'failed',
        updated_at = now()
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


-- -----------------------------------------------------------------------------
-- 4. Authoritative Administrative Recovery: admin_unlock_stuck_refund
-- -----------------------------------------------------------------------------
-- Enables an Administrator or Super Administrator to release an orphaned refund
-- claim that is stuck in 'processing' state when the external Razorpay gateway
-- request timed out or its outcome was unknown.
--
-- Safety Guarantees:
-- 1. Authentication & Role: Strictly restricted to Admin / Super Admin callers.
-- 2. Concurrency Lock: SELECT ... FOR UPDATE prevents race conditions.
-- 3. In-Flight Protection: Requires the refund to have remained in 'processing'
--    for at least 15 minutes to guarantee that in-flight gateway network requests
--    have expired before an administrator can release the claim.
-- 4. Gateway Dispatch Guard: Rejects recovery if provider_refund_id is present,
--    ensuring that refunds registered with Razorpay are reconciled via webhooks.
-- 5. Non-Destructive State Transition: Transitions 'processing' -> 'failed',
--    allowing the existing safe retry path to re-execute with the same deterministic
--    idempotency key without altering booking or cancellation financial state.
-- 6. Authoritative Audit Trail: Records an immutable administrative audit entry
--    including refund_id, actor, prior/new status, mandatory reason, and timestamp.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_unlock_stuck_refund(
    p_refund_id UUID,
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
    v_refund RECORD;
    v_age_minutes NUMERIC;
    c_min_age_minutes CONSTANT NUMERIC := 15.0;
    v_trimmed_reason TEXT;
BEGIN
    -- 1. Authorization: Authenticated Admin / Super Admin
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to recover stuck refunds.';
    END IF;

    IF NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only administrators can recover stuck refunds.';
    END IF;

    -- 2. Input Validation: Mandatory non-empty reason
    v_trimmed_reason := trim(COALESCE(p_reason, ''));
    IF v_trimmed_reason = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'empty_reason',
            'error', 'A valid non-empty reason is mandatory for administrative refund recovery.',
            'status_code', 400
        );
    END IF;

    IF p_refund_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_id',
            'error', 'A valid refund ID is required.',
            'status_code', 400
        );
    END IF;

    -- 3. Row-level Lock on Refund Obligation
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

    -- 4. State Validation: Can only recover from 'processing'
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'already_processed',
            'error', 'Refund has already been processed by the gateway and cannot be recovered or reset.',
            'status_code', 400
        );
    END IF;

    IF v_refund.status != 'processing' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_status',
            'error', 'Only refunds in ''processing'' state can be recovered. Current status is ''' || v_refund.status || '''.',
            'status_code', 400
        );
    END IF;

    -- 5. Gateway Dispatch Verification: provider_refund_id must be NULL
    IF v_refund.provider_refund_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'gateway_id_present',
            'error', 'Refund already has an active gateway provider refund ID (' || v_refund.provider_refund_id || '). Automatic reconciliation must be awaited.',
            'status_code', 400
        );
    END IF;

    -- 6. Safe Age Verification: Must have remained in processing for >= 15 minutes
    v_age_minutes := EXTRACT(EPOCH FROM (now() - COALESCE(v_refund.updated_at, v_refund.created_at))) / 60.0;
    IF v_age_minutes < c_min_age_minutes THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'too_recent',
            'error', 'Refund claim was updated ' || ROUND(v_age_minutes, 1) || ' minutes ago. A minimum in-flight grace period of ' || c_min_age_minutes || ' minutes is required before administrative recovery.',
            'age_minutes', ROUND(v_age_minutes, 1),
            'min_required_minutes', c_min_age_minutes,
            'status_code', 400
        );
    END IF;

    -- 7. Authoritative Transition: processing -> failed
    UPDATE public.refunds
    SET status = 'failed'::public.refund_status,
        updated_at = now()
    WHERE id = p_refund_id;

    -- 8. Authoritative Server Audit Log
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
        'refund_processing_recovered',
        'refund',
        p_refund_id::text,
        jsonb_build_object(
            'status', v_refund.status,
            'provider_refund_id', v_refund.provider_refund_id,
            'updated_at', v_refund.updated_at
        ),
        jsonb_build_object(
            'status', 'failed',
            'provider_refund_id', NULL,
            'updated_at', now()
        ),
        jsonb_build_object(
            'refund_id', p_refund_id,
            'previous_status', 'processing',
            'new_status', 'failed',
            'actor', v_caller_id,
            'reason', v_trimmed_reason,
            'in_flight_age_minutes', ROUND(v_age_minutes, 1),
            'timestamp', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'recovered_to_failed',
        'refund_id', p_refund_id,
        'previous_status', 'processing',
        'new_status', 'failed',
        'reason', v_trimmed_reason,
        'status_code', 200
    );
END;
$$;

COMMENT ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT) IS
'Authoritatively transitions an orphaned processing refund (with no gateway provider_refund_id and age >= 15 mins) to failed, enabling safe retry.';

REVOKE EXECUTE ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT) TO authenticated, service_role;
