-- =============================================================================
-- Migration: 039_pandit_puja_services_nullable_legacy_price.sql
-- Description: Make legacy pandit_puja_services.price nullable to support canonical
--              mode-specific pricing (home_price, temple_price, remote_price) and update
--              approve_pandit_application RPC to insert both mode-specific and legacy prices.
-- Source of Truth: Kashi Veda Phase 14 Mode-Specific Pricing Specification
-- NOTE: CREATED ONLY. DO NOT APPLY OR PUSH AUTOMATICALLY.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Make legacy pandit_puja_services.price column nullable
-- -----------------------------------------------------------------------------
-- In Migration 004, pandit_puja_services.price was defined as NOT NULL.
-- In Migration 029, mode-specific pricing columns (home_price, temple_price, remote_price)
-- were introduced as the canonical pricing model.
-- Dropping the NOT NULL constraint on price allows mode-specific pricing to operate
-- as canonical while preserving the column and its CHECK constraint (price >= 0) for
-- backward compatibility with historical records.

ALTER TABLE public.pandit_puja_services
ALTER COLUMN price DROP NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. Update RPC: approve_pandit_application
-- Ensures approval inserts mode-specific prices and sets legacy price as a
-- deterministic fallback: COALESCE(home_price, temple_price, remote_price).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_pandit_application(
    p_application_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_admin_id UUID;
    v_app RECORD;
    v_pandit_id UUID;
    v_puja RECORD;
    v_pricing JSONB;
    v_home_price NUMERIC;
    v_temple_price NUMERIC;
    v_remote_price NUMERIC;
    v_legacy_price NUMERIC;
    v_has_service_area BOOLEAN := false;
BEGIN
    -- 1. Authorization: Verify caller is an administrator
    v_admin_id := auth.uid();
    IF NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to approve Pandit applications.';
    END IF;

    -- 2. Lock and fetch application record
    SELECT * INTO v_app
    FROM public.pandit_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit application not found with id: %', p_application_id;
    END IF;

    -- 3. Invariant: Only submitted or under_review applications can be approved
    IF v_app.status NOT IN ('submitted', 'under_review') THEN
        RAISE EXCEPTION 'Application cannot be approved from status "%". Must be submitted or under_review.', v_app.status;
    END IF;

    -- 4. Invariant: Mandatory data integrity check
    IF trim(COALESCE(v_app.full_name, '')) = '' OR trim(COALESCE(v_app.primary_city, '')) = '' THEN
        RAISE EXCEPTION 'Application is missing full name or primary service city.';
    END IF;

    -- 5. Mark application approved
    UPDATE public.pandit_applications
    SET status = 'approved'::public.pandit_application_status,
        approved_at = now(),
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        updated_at = now()
    WHERE id = p_application_id;

    -- 6. Upsert public.pandit_profiles with operational location & Kundli configuration
    INSERT INTO public.pandit_profiles (
        user_id,
        verification_status,
        bio,
        years_experience,
        languages,
        service_radius_km,
        base_latitude,
        base_longitude,
        kundli_enabled,
        kundli_price,
        kundli_turnaround_days,
        public_status,
        approved_at,
        onboarding_completed_at
    ) VALUES (
        v_app.user_id,
        'approved'::public.pandit_verification_status,
        v_app.bio,
        v_app.years_experience,
        v_app.languages,
        v_app.service_radius_km,
        v_app.base_latitude,
        v_app.base_longitude,
        COALESCE(v_app.kundli_enabled, false),
        CASE WHEN v_app.kundli_enabled = true THEN v_app.kundli_price ELSE NULL END,
        CASE WHEN v_app.kundli_enabled = true THEN COALESCE(v_app.kundli_turnaround_days, 3) ELSE NULL END,
        'available'::public.pandit_public_status,
        now(),
        now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        verification_status = 'approved'::public.pandit_verification_status,
        bio = EXCLUDED.bio,
        years_experience = EXCLUDED.years_experience,
        languages = EXCLUDED.languages,
        service_radius_km = EXCLUDED.service_radius_km,
        base_latitude = COALESCE(EXCLUDED.base_latitude, pandit_profiles.base_latitude),
        base_longitude = COALESCE(EXCLUDED.base_longitude, pandit_profiles.base_longitude),
        kundli_enabled = EXCLUDED.kundli_enabled,
        kundli_price = EXCLUDED.kundli_price,
        kundli_turnaround_days = EXCLUDED.kundli_turnaround_days,
        public_status = 'available'::public.pandit_public_status,
        approved_at = now(),
        updated_at = now()
    RETURNING id INTO v_pandit_id;

    -- 7. Add pandit role in public.user_roles WITHOUT removing customer role
    INSERT INTO public.user_roles (
        user_id,
        role,
        assigned_by,
        assigned_at
    ) VALUES (
        v_app.user_id,
        'pandit'::public.user_role,
        auth.uid(),
        now()
    )
    ON CONFLICT (user_id, role) DO NOTHING;

    -- 8. Register or update primary service area with operational coordinates
    SELECT EXISTS (
        SELECT 1 FROM public.pandit_service_areas
        WHERE pandit_id = v_pandit_id AND is_active = true
    ) INTO v_has_service_area;

    IF v_has_service_area THEN
        -- Update existing active service area with approved coordinates & radius
        UPDATE public.pandit_service_areas
        SET city = v_app.primary_city,
            radius_km = v_app.service_radius_km,
            latitude = COALESCE(v_app.base_latitude, latitude),
            longitude = COALESCE(v_app.base_longitude, longitude)
        WHERE pandit_id = v_pandit_id AND is_active = true;
    ELSE
        INSERT INTO public.pandit_service_areas (
            pandit_id,
            city,
            latitude,
            longitude,
            radius_km,
            is_active
        ) VALUES (
            v_pandit_id,
            v_app.primary_city,
            v_app.base_latitude,
            v_app.base_longitude,
            v_app.service_radius_km,
            true
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- 9. Link selected pujas in public.pandit_puja_services using Pandit's mode-specific prices
    IF v_app.selected_puja_ids IS NOT NULL AND array_length(v_app.selected_puja_ids, 1) > 0 THEN
        FOR v_puja IN
            SELECT ps.id, ps.name, ps.default_duration_minutes, ps.allowed_modes
            FROM public.puja_services ps
            WHERE ps.id = ANY(v_app.selected_puja_ids)
        LOOP
            v_pricing := v_app.puja_prices->v_puja.id::text;
            v_home_price := NULL;
            v_temple_price := NULL;
            v_remote_price := NULL;

            IF jsonb_typeof(v_pricing) = 'object' THEN
                IF v_pricing ? 'home' AND 'home'::public.service_mode = ANY(v_puja.allowed_modes) THEN
                    BEGIN
                        v_home_price := (v_pricing->>'home')::numeric;
                        IF v_home_price <= 0 THEN v_home_price := NULL; END IF;
                    EXCEPTION WHEN OTHERS THEN v_home_price := NULL; END;
                END IF;

                IF v_pricing ? 'temple' AND 'temple'::public.service_mode = ANY(v_puja.allowed_modes) THEN
                    BEGIN
                        v_temple_price := (v_pricing->>'temple')::numeric;
                        IF v_temple_price <= 0 THEN v_temple_price := NULL; END IF;
                    EXCEPTION WHEN OTHERS THEN v_temple_price := NULL; END;
                END IF;

                IF v_pricing ? 'remote' AND 'remote'::public.service_mode = ANY(v_puja.allowed_modes) THEN
                    BEGIN
                        v_remote_price := (v_pricing->>'remote')::numeric;
                        IF v_remote_price <= 0 THEN v_remote_price := NULL; END IF;
                    EXCEPTION WHEN OTHERS THEN v_remote_price := NULL; END;
                END IF;
            ELSE
                BEGIN
                    v_legacy_price := (v_pricing #>> '{}')::numeric;
                    IF v_legacy_price > 0 THEN
                        IF 'home'::public.service_mode = ANY(v_puja.allowed_modes) THEN
                            v_home_price := v_legacy_price;
                        END IF;
                        IF 'temple'::public.service_mode = ANY(v_puja.allowed_modes) THEN
                            v_temple_price := v_legacy_price;
                        END IF;
                        IF 'remote'::public.service_mode = ANY(v_puja.allowed_modes) THEN
                            v_remote_price := v_legacy_price;
                        END IF;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    v_legacy_price := NULL;
                END;
            END IF;

            INSERT INTO public.pandit_puja_services (
                pandit_id,
                puja_service_id,
                price,
                home_price,
                temple_price,
                remote_price,
                duration_minutes,
                is_active
            ) VALUES (
                v_pandit_id,
                v_puja.id,
                COALESCE(v_home_price, v_temple_price, v_remote_price),
                v_home_price,
                v_temple_price,
                v_remote_price,
                COALESCE(v_puja.default_duration_minutes, 60),
                true
            )
            ON CONFLICT (pandit_id, puja_service_id) DO UPDATE SET
                price = EXCLUDED.price,
                home_price = EXCLUDED.home_price,
                temple_price = EXCLUDED.temple_price,
                remote_price = EXCLUDED.remote_price,
                duration_minutes = EXCLUDED.duration_minutes,
                is_active = true,
                updated_at = now();
        END LOOP;
    END IF;

    -- 10. Mark all documents verified
    UPDATE public.pandit_documents
    SET verification_status = 'approved'::public.document_verification_status,
        reviewed_by = v_admin_id,
        reviewed_at = now()
    WHERE pandit_id = v_pandit_id;

    -- 11. Write audit log entry
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_admin_id,
        'pandit_application_approved',
        'pandit_application',
        p_application_id,
        to_jsonb(v_app),
        jsonb_build_object(
            'pandit_profile_id', v_pandit_id,
            'user_id', v_app.user_id,
            'full_name', v_app.full_name,
            'primary_city', v_app.primary_city,
            'base_latitude', v_app.base_latitude,
            'base_longitude', v_app.base_longitude,
            'service_radius_km', v_app.service_radius_km,
            'status', 'approved'
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'pandit_profile_id', v_pandit_id,
        'status', 'approved',
        'message', 'Pandit application successfully approved with operational service coordinates and mode-specific pricing.'
    );
END;
$$;

-- Grant execution permissions
REVOKE EXECUTE ON FUNCTION public.approve_pandit_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pandit_application(UUID) TO authenticated, service_role;
