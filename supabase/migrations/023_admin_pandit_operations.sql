-- =============================================================================
-- Migration: 023_admin_pandit_operations.sql
-- Description: Authoritative administrative operations for post-approval Pandit
--              management: Operational status toggling, Super Admin suspension
--              and reactivation, bank account verification, and service radius updates.
-- Source of Truth: Kashi Veda Phase 15 Administrative Architecture Specification
-- DO NOT APPLY AUTOMATICALLY: To be applied by administrator.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: admin_set_pandit_public_status
-- -----------------------------------------------------------------------------
-- Toggles Pandit operational availability ('available' vs 'currently_unavailable').
-- Preserves verification_status and records an immutable audit log.

CREATE OR REPLACE FUNCTION public.admin_set_pandit_public_status(
    p_pandit_id UUID,
    p_public_status public.pandit_public_status
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit RECORD;
    v_old_status public.pandit_public_status;
BEGIN
    -- 1. Authorization: Administrator privileges required
    v_caller_id := auth.uid();
    IF NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    IF p_public_status NOT IN ('available', 'currently_unavailable') THEN
        RAISE EXCEPTION 'Invalid public status: %', p_public_status;
    END IF;

    -- 2. Lock target pandit profile
    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit profile not found with id: %', p_pandit_id;
    END IF;

    v_old_status := v_pandit.public_status;

    -- 3. Update public_status and updated_at
    UPDATE public.pandit_profiles
    SET public_status = p_public_status,
        updated_at = now()
    WHERE id = p_pandit_id;

    -- 4. Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_caller_id,
        'pandit_public_status_toggled',
        'pandit_profiles',
        p_pandit_id::text,
        jsonb_build_object('public_status', v_old_status),
        jsonb_build_object('public_status', p_public_status, 'updated_at', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'pandit_id', p_pandit_id,
        'previous_status', v_old_status,
        'current_status', p_public_status
    );
END;
$$;

COMMENT ON FUNCTION public.admin_set_pandit_public_status(UUID, public.pandit_public_status) IS
'Authoritative RPC for administrators to toggle Pandit operational marketplace availability.';

REVOKE EXECUTE ON FUNCTION public.admin_set_pandit_public_status(UUID, public.pandit_public_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pandit_public_status(UUID, public.pandit_public_status) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. RPC: admin_suspend_pandit
-- -----------------------------------------------------------------------------
-- Super Admin suspends a Pandit for compliance or disciplinary reasons.
-- Sets verification_status = 'suspended' and public_status = 'currently_unavailable'.
-- Queries upcoming active bookings and returns them without silent cancellation.

CREATE OR REPLACE FUNCTION public.admin_suspend_pandit(
    p_pandit_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit RECORD;
    v_trimmed_reason TEXT;
    v_upcoming_bookings_count INTEGER;
    v_affected_bookings JSONB;
BEGIN
    -- 1. Authorization: Super Admin only
    v_caller_id := auth.uid();
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Super Administrator privileges required to suspend a Pandit';
    END IF;

    -- 2. Validate reason
    v_trimmed_reason := trim(COALESCE(p_reason, ''));
    IF length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'A detailed suspension reason of at least 5 characters is required';
    END IF;

    -- 3. Lock target pandit profile
    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit profile not found with id: %', p_pandit_id;
    END IF;

    IF v_pandit.verification_status != 'approved' THEN
        RAISE EXCEPTION 'Only approved Pandits can be suspended (current status: %)', v_pandit.verification_status;
    END IF;

    -- 4. Inspect upcoming active bookings that are confirmed/upcoming/rescheduled/in_progress
    SELECT 
        COUNT(*)::INTEGER,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'booking_id', b.id,
                    'booking_number', b.booking_number,
                    'scheduled_start_at', b.scheduled_start_at,
                    'status', b.status,
                    'total_amount', b.total_amount
                ) ORDER BY b.scheduled_start_at ASC
            ),
            '[]'::jsonb
        )
    INTO v_upcoming_bookings_count, v_affected_bookings
    FROM public.bookings b
    WHERE b.pandit_id = p_pandit_id
      AND b.status IN ('confirmed', 'upcoming', 'rescheduled', 'in_progress')
      AND b.scheduled_start_at >= now();

    -- 5. Update pandit_profiles: verification_status = suspended, public_status = currently_unavailable
    UPDATE public.pandit_profiles
    SET verification_status = 'suspended'::public.pandit_verification_status,
        public_status = 'currently_unavailable'::public.pandit_public_status,
        updated_at = now()
    WHERE id = p_pandit_id;

    -- 6. Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_caller_id,
        'pandit_suspended',
        'pandit_profiles',
        p_pandit_id::text,
        jsonb_build_object(
            'verification_status', v_pandit.verification_status,
            'public_status', v_pandit.public_status
        ),
        jsonb_build_object(
            'verification_status', 'suspended',
            'public_status', 'currently_unavailable',
            'reason', v_trimmed_reason,
            'upcoming_bookings_count', v_upcoming_bookings_count,
            'suspended_at', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'pandit_id', p_pandit_id,
        'verification_status', 'suspended',
        'public_status', 'currently_unavailable',
        'reason', v_trimmed_reason,
        'upcoming_bookings_count', v_upcoming_bookings_count,
        'affected_bookings', v_affected_bookings
    );
END;
$$;

COMMENT ON FUNCTION public.admin_suspend_pandit(UUID, TEXT) IS
'Authoritative Super Admin RPC to suspend a Pandit profile and inspect upcoming bookings.';

REVOKE EXECUTE ON FUNCTION public.admin_suspend_pandit(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_suspend_pandit(UUID, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. RPC: admin_reactivate_pandit
-- -----------------------------------------------------------------------------
-- Super Admin restores a suspended Pandit to 'approved' verification status.
-- Preserves public_status as-is for explicit operational activation.

CREATE OR REPLACE FUNCTION public.admin_reactivate_pandit(
    p_pandit_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit RECORD;
    v_trimmed_reason TEXT;
BEGIN
    -- 1. Authorization: Super Admin only
    v_caller_id := auth.uid();
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Super Administrator privileges required to reactivate a Pandit';
    END IF;

    -- 2. Validate reason
    v_trimmed_reason := trim(COALESCE(p_reason, ''));
    IF length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'A detailed reactivation reason of at least 5 characters is required';
    END IF;

    -- 3. Lock target pandit profile
    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit profile not found with id: %', p_pandit_id;
    END IF;

    IF v_pandit.verification_status != 'suspended' THEN
        RAISE EXCEPTION 'Only suspended Pandits can be reactivated (current status: %)', v_pandit.verification_status;
    END IF;

    -- 4. Restore verification_status = approved
    UPDATE public.pandit_profiles
    SET verification_status = 'approved'::public.pandit_verification_status,
        updated_at = now()
    WHERE id = p_pandit_id;

    -- 5. Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_caller_id,
        'pandit_reactivated',
        'pandit_profiles',
        p_pandit_id::text,
        jsonb_build_object(
            'verification_status', v_pandit.verification_status,
            'public_status', v_pandit.public_status
        ),
        jsonb_build_object(
            'verification_status', 'approved',
            'public_status', v_pandit.public_status,
            'reason', v_trimmed_reason,
            'reactivated_at', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'pandit_id', p_pandit_id,
        'verification_status', 'approved',
        'public_status', v_pandit.public_status,
        'reason', v_trimmed_reason
    );
END;
$$;

COMMENT ON FUNCTION public.admin_reactivate_pandit(UUID, TEXT) IS
'Authoritative Super Admin RPC to restore a suspended Pandit to approved status.';

REVOKE EXECUTE ON FUNCTION public.admin_reactivate_pandit(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_pandit(UUID, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 4. RPC: admin_verify_pandit_bank_account
-- -----------------------------------------------------------------------------
-- Admin approves or rejects a Pandit's submitted bank payout account.
-- Sets verification_status, verified_by, verified_at, and writes an audit log.

CREATE OR REPLACE FUNCTION public.admin_verify_pandit_bank_account(
    p_bank_account_id UUID,
    p_decision TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_bank RECORD;
    v_trimmed_reason TEXT;
    v_decision_enum public.bank_account_verification_status;
BEGIN
    -- 1. Authorization: Administrator privileges required
    v_caller_id := auth.uid();
    IF NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    -- 2. Validate decision
    IF p_decision NOT IN ('verified', 'rejected') THEN
        RAISE EXCEPTION 'Invalid decision: %. Allowed values are verified or rejected', p_decision;
    END IF;

    v_decision_enum := p_decision::public.bank_account_verification_status;
    v_trimmed_reason := trim(COALESCE(p_rejection_reason, ''));

    IF v_decision_enum = 'rejected' AND length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'A detailed rejection reason of at least 5 characters is required when rejecting a bank account';
    END IF;

    -- 3. Lock target bank account
    SELECT * INTO v_bank
    FROM public.pandit_bank_accounts
    WHERE id = p_bank_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank account record not found with id: %', p_bank_account_id;
    END IF;

    -- 4. Update bank account
    UPDATE public.pandit_bank_accounts
    SET verification_status = v_decision_enum,
        verified_by = v_caller_id,
        verified_at = now()
    WHERE id = p_bank_account_id;

    -- 5. Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_caller_id,
        CASE WHEN v_decision_enum = 'verified' THEN 'pandit_bank_verified' ELSE 'pandit_bank_rejected' END,
        'pandit_bank_accounts',
        p_bank_account_id::text,
        jsonb_build_object(
            'pandit_id', v_bank.pandit_id,
            'verification_status', v_bank.verification_status
        ),
        jsonb_build_object(
            'pandit_id', v_bank.pandit_id,
            'verification_status', p_decision,
            'rejection_reason', CASE WHEN v_decision_enum = 'rejected' THEN v_trimmed_reason ELSE NULL END,
            'verified_at', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'bank_account_id', p_bank_account_id,
        'pandit_id', v_bank.pandit_id,
        'verification_status', p_decision,
        'verified_at', now()
    );
END;
$$;

COMMENT ON FUNCTION public.admin_verify_pandit_bank_account(UUID, TEXT, TEXT) IS
'Authoritative RPC for administrators to verify or reject a Pandit payout bank account.';

REVOKE EXECUTE ON FUNCTION public.admin_verify_pandit_bank_account(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_pandit_bank_account(UUID, TEXT, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5. RPC: admin_update_pandit_service_radius
-- -----------------------------------------------------------------------------
-- Admin adjusts a Pandit's operational service radius (in kilometers).
-- Updates pandit_profiles.service_radius_km and active pandit_service_areas.

CREATE OR REPLACE FUNCTION public.admin_update_pandit_service_radius(
    p_pandit_id UUID,
    p_radius_km NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit RECORD;
    v_old_radius NUMERIC;
BEGIN
    -- 1. Authorization: Administrator privileges required
    v_caller_id := auth.uid();
    IF NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    -- 2. Validate radius: positive, maximum 500 km
    IF p_radius_km IS NULL OR p_radius_km <= 0 OR p_radius_km > 500 THEN
        RAISE EXCEPTION 'Service radius must be a positive number between 0.1 and 500 km (received: %)', p_radius_km;
    END IF;

    -- 3. Lock target pandit profile
    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit profile not found with id: %', p_pandit_id;
    END IF;

    v_old_radius := v_pandit.service_radius_km;

    -- 4. Update pandit_profiles.service_radius_km
    UPDATE public.pandit_profiles
    SET service_radius_km = p_radius_km,
        updated_at = now()
    WHERE id = p_pandit_id;

    -- 5. Update active service areas for this pandit
    UPDATE public.pandit_service_areas
    SET radius_km = p_radius_km
    WHERE pandit_id = p_pandit_id AND is_active = true;

    -- 6. Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_caller_id,
        'pandit_service_radius_updated',
        'pandit_profiles',
        p_pandit_id::text,
        jsonb_build_object('service_radius_km', v_old_radius),
        jsonb_build_object('service_radius_km', p_radius_km, 'updated_at', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'pandit_id', p_pandit_id,
        'previous_radius_km', v_old_radius,
        'current_radius_km', p_radius_km
    );
END;
$$;

COMMENT ON FUNCTION public.admin_update_pandit_service_radius(UUID, NUMERIC) IS
'Authoritative RPC for administrators to update a Pandit service area radius.';

REVOKE EXECUTE ON FUNCTION public.admin_update_pandit_service_radius(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pandit_service_radius(UUID, NUMERIC) TO authenticated, service_role;
