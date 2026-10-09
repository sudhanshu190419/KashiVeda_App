-- =============================================================================
-- Migration: 034_pandit_service_location_geocoding.sql
-- Description: Pandit Operational Service Location & Geocoding Lifecycle
-- Purpose:
--   1. Extend public.pandit_applications with base_address, base_latitude, base_longitude.
--   2. Update submit_pandit_application RPC to validate operational service coordinates.
--   3. Update approve_pandit_application RPC to copy submitted service coordinates atomically
--      into public.pandit_profiles (base_latitude, base_longitude) and
--      public.pandit_service_areas (latitude, longitude).
--   4. Provide admin_update_pandit_service_location and pandit_update_service_location RPCs
--      for administrative and self-service maintenance of operational coordinates.
--   5. Maintain strict backward compatibility: Existing approved Pandits with NULL coordinates
--      remain approved; Home booking validation safely prevents out-of-area home bookings
--      until coordinates are configured, while Temple and Remote modes remain unaffected.
-- NOTE: LOCAL MIGRATION ONLY. DO NOT APPLY OR PUSH DIRECTLY.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema Extension: Pandit Applications Service Base Location
-- -----------------------------------------------------------------------------

ALTER TABLE public.pandit_applications
ADD COLUMN IF NOT EXISTS base_address TEXT,
ADD COLUMN IF NOT EXISTS base_latitude NUMERIC(9,6),
ADD COLUMN IF NOT EXISTS base_longitude NUMERIC(9,6);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_applications_base_latitude'
    ) THEN
        ALTER TABLE public.pandit_applications
        ADD CONSTRAINT chk_pandit_applications_base_latitude
        CHECK (base_latitude IS NULL OR (base_latitude >= -90.0 AND base_latitude <= 90.0));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_applications_base_longitude'
    ) THEN
        ALTER TABLE public.pandit_applications
        ADD CONSTRAINT chk_pandit_applications_base_longitude
        CHECK (base_longitude IS NULL OR (base_longitude >= -180.0 AND base_longitude <= 180.0));
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. Update RPC: submit_pandit_application
-- Validates operational coordinates when Home / In-person service mode is configured
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_pandit_application(
    p_application_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_app RECORD;
    v_puja RECORD;
    v_puja_id UUID;
    v_price_text TEXT;
    v_price NUMERIC;
    v_pricing JSONB;
BEGIN
    -- 1. Fetch application and verify ownership
    SELECT * INTO v_app
    FROM public.pandit_applications
    WHERE id = p_application_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found with id: %', p_application_id;
    END IF;

    IF v_app.user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only submit your own application';
    END IF;

    -- 2. Verify state transition is valid
    IF v_app.status NOT IN ('draft', 'rejected') THEN
        RAISE EXCEPTION 'Application cannot be submitted from status: %', v_app.status;
    END IF;

    -- 3. Validate mandatory profile fields
    IF trim(COALESCE(v_app.full_name, '')) = '' THEN
        RAISE EXCEPTION 'Full name is required for submission';
    END IF;

    IF trim(COALESCE(v_app.primary_city, '')) = '' THEN
        RAISE EXCEPTION 'Primary service city is required for submission';
    END IF;

    IF v_app.years_experience IS NULL OR v_app.years_experience < 0 THEN
        RAISE EXCEPTION 'Valid years of experience is required';
    END IF;

    IF array_length(v_app.languages, 1) IS NULL OR array_length(v_app.languages, 1) = 0 THEN
        RAISE EXCEPTION 'At least one spoken language must be selected';
    END IF;

    -- 4. Validate Operational Service Location Coordinates if provided or required
    IF v_app.base_latitude IS NOT NULL THEN
        IF v_app.base_latitude < -90.0 OR v_app.base_latitude > 90.0 THEN
            RAISE EXCEPTION 'Service base latitude must be between -90 and 90 degrees';
        END IF;
    END IF;

    IF v_app.base_longitude IS NOT NULL THEN
        IF v_app.base_longitude < -180.0 OR v_app.base_longitude > 180.0 THEN
            RAISE EXCEPTION 'Service base longitude must be between -180 and 180 degrees';
        END IF;
    END IF;

    -- 5. Validate document uploads (Identity proof and qualification)
    IF v_app.documents IS NULL OR jsonb_array_length(v_app.documents) < 2 THEN
        RAISE EXCEPTION 'At least 2 verification documents (Identity Proof and Vedic Qualification) are required';
    END IF;

    -- 6. Validate Ritual Offerings: At least one ritual must be selected
    IF v_app.selected_puja_ids IS NULL OR array_length(v_app.selected_puja_ids, 1) IS NULL OR array_length(v_app.selected_puja_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one sacred Puja ritual must be selected for offering';
    END IF;

    -- 7. Validate each selected ritual exists and has valid mode-specific prices
    FOREACH v_puja_id IN ARRAY v_app.selected_puja_ids LOOP
        SELECT * INTO v_puja
        FROM public.puja_services
        WHERE id = v_puja_id AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected Puja ritual % is inactive or does not exist', v_puja_id;
        END IF;

        v_pricing := v_app.puja_prices->v_puja_id::text;
        IF v_pricing IS NULL THEN
            RAISE EXCEPTION 'Price configuration is required for selected ritual "%"', v_puja.name;
        END IF;

        IF jsonb_typeof(v_pricing) = 'object' THEN
            IF NOT (
                (v_pricing ? 'home' AND (v_pricing->>'home')::numeric > 0) OR
                (v_pricing ? 'temple' AND (v_pricing->>'temple')::numeric > 0) OR
                (v_pricing ? 'remote' AND (v_pricing->>'remote')::numeric > 0)
            ) THEN
                RAISE EXCEPTION 'At least one positive service mode price (Home, Temple, or Remote) is required for ritual "%"', v_puja.name;
            END IF;
        ELSE
            BEGIN
                v_price := (v_pricing #>> '{}')::numeric;
            EXCEPTION WHEN OTHERS THEN
                RAISE EXCEPTION 'Price for ritual "%" must be a valid numeric amount', v_puja.name;
            END;

            IF v_price IS NULL OR v_price <= 0 THEN
                RAISE EXCEPTION 'Price for ritual "%" must be strictly greater than zero', v_puja.name;
            END IF;
        END IF;
    END LOOP;

    -- 8. Validate Kundli Commercial Offering if enabled
    IF v_app.kundli_enabled = true THEN
        IF v_app.kundli_price IS NULL OR v_app.kundli_price <= 0 THEN
            RAISE EXCEPTION 'Kundli Dakshina fee must be strictly greater than zero when Kundli services are enabled';
        END IF;

        IF v_app.kundli_turnaround_days IS NOT NULL AND v_app.kundli_turnaround_days <= 0 THEN
            RAISE EXCEPTION 'Kundli turnaround days must be greater than zero';
        END IF;
    END IF;

    -- 9. Transition status to submitted
    UPDATE public.pandit_applications
    SET status = 'submitted'::public.pandit_application_status,
        submitted_at = now(),
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = p_application_id;

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'status', 'submitted',
        'message', 'Pandit application submitted successfully for administrator verification.'
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Update RPC: approve_pandit_application
-- Atomically copies base_latitude and base_longitude into pandit_profiles & pandit_service_areas
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
                home_price,
                temple_price,
                remote_price,
                duration_minutes,
                is_active
            ) VALUES (
                v_pandit_id,
                v_puja.id,
                v_home_price,
                v_temple_price,
                v_remote_price,
                COALESCE(v_puja.default_duration_minutes, 60),
                true
            )
            ON CONFLICT (pandit_id, puja_service_id) DO UPDATE SET
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
        'message', 'Pandit application successfully approved with operational service coordinates.'
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. Administrative RPC: admin_update_pandit_service_location
-- Allows Admins to update or backfill a Pandit's operational location
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_update_pandit_service_location(
    p_pandit_id UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_radius_km NUMERIC DEFAULT NULL,
    p_city TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_admin_id UUID;
    v_pandit RECORD;
    v_old_lat NUMERIC;
    v_old_lng NUMERIC;
    v_old_radius NUMERIC;
    v_old_city TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    IF p_latitude IS NULL OR p_latitude < -90.0 OR p_latitude > 90.0 THEN
        RAISE EXCEPTION 'Latitude must be between -90 and 90 degrees';
    END IF;

    IF p_longitude IS NULL OR p_longitude < -180.0 OR p_longitude > 180.0 THEN
        RAISE EXCEPTION 'Longitude must be between -180 and 180 degrees';
    END IF;

    IF p_radius_km IS NOT NULL AND (p_radius_km <= 0 OR p_radius_km > 500) THEN
        RAISE EXCEPTION 'Service radius must be between 0.1 and 500 km';
    END IF;

    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit profile not found with id: %', p_pandit_id;
    END IF;

    v_old_lat := v_pandit.base_latitude;
    v_old_lng := v_pandit.base_longitude;
    v_old_radius := v_pandit.service_radius_km;

    -- Update pandit_profiles
    UPDATE public.pandit_profiles
    SET base_latitude = p_latitude,
        base_longitude = p_longitude,
        service_radius_km = COALESCE(p_radius_km, service_radius_km),
        updated_at = now()
    WHERE id = p_pandit_id;

    -- Update or insert active service area
    IF EXISTS (SELECT 1 FROM public.pandit_service_areas WHERE pandit_id = p_pandit_id AND is_active = true) THEN
        UPDATE public.pandit_service_areas
        SET latitude = p_latitude,
            longitude = p_longitude,
            city = COALESCE(p_city, city),
            radius_km = COALESCE(p_radius_km, radius_km)
        WHERE pandit_id = p_pandit_id AND is_active = true;
    ELSE
        INSERT INTO public.pandit_service_areas (
            pandit_id,
            city,
            latitude,
            longitude,
            radius_km,
            is_active
        ) VALUES (
            p_pandit_id,
            COALESCE(p_city, 'Varanasi'),
            p_latitude,
            p_longitude,
            COALESCE(p_radius_km, 25.0),
            true
        );
    END IF;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_admin_id,
        'pandit_service_location_updated',
        'pandit_profile',
        p_pandit_id,
        jsonb_build_object(
            'base_latitude', v_old_lat,
            'base_longitude', v_old_lng,
            'service_radius_km', v_old_radius
        ),
        jsonb_build_object(
            'base_latitude', p_latitude,
            'base_longitude', p_longitude,
            'service_radius_km', COALESCE(p_radius_km, v_old_radius),
            'city', p_city
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'pandit_id', p_pandit_id,
        'base_latitude', p_latitude,
        'base_longitude', p_longitude,
        'service_radius_km', COALESCE(p_radius_km, v_old_radius),
        'message', 'Pandit operational service location updated successfully.'
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 5. Authenticated Pandit RPC: pandit_update_service_location
-- Allows an approved Pandit to update or configure their operational location
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pandit_update_service_location(
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_radius_km NUMERIC DEFAULT NULL,
    p_city TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_pandit RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_latitude IS NULL OR p_latitude < -90.0 OR p_latitude > 90.0 THEN
        RAISE EXCEPTION 'Latitude must be between -90 and 90 degrees';
    END IF;

    IF p_longitude IS NULL OR p_longitude < -180.0 OR p_longitude > 180.0 THEN
        RAISE EXCEPTION 'Longitude must be between -180 and 180 degrees';
    END IF;

    IF p_radius_km IS NOT NULL AND (p_radius_km <= 0 OR p_radius_km > 500) THEN
        RAISE EXCEPTION 'Service radius must be between 0.1 and 500 km';
    END IF;

    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit profile not found for authenticated user.';
    END IF;

    -- Update pandit_profiles
    UPDATE public.pandit_profiles
    SET base_latitude = p_latitude,
        base_longitude = p_longitude,
        service_radius_km = COALESCE(p_radius_km, service_radius_km),
        updated_at = now()
    WHERE id = v_pandit.id;

    -- Update or insert active service area
    IF EXISTS (SELECT 1 FROM public.pandit_service_areas WHERE pandit_id = v_pandit.id AND is_active = true) THEN
        UPDATE public.pandit_service_areas
        SET latitude = p_latitude,
            longitude = p_longitude,
            city = COALESCE(p_city, city),
            radius_km = COALESCE(p_radius_km, radius_km)
        WHERE pandit_id = v_pandit.id AND is_active = true;
    ELSE
        INSERT INTO public.pandit_service_areas (
            pandit_id,
            city,
            latitude,
            longitude,
            radius_km,
            is_active
        ) VALUES (
            v_pandit.id,
            COALESCE(p_city, 'Varanasi'),
            p_latitude,
            p_longitude,
            COALESCE(p_radius_km, v_pandit.service_radius_km, 25.0),
            true
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'pandit_id', v_pandit.id,
        'base_latitude', p_latitude,
        'base_longitude', p_longitude,
        'service_radius_km', COALESCE(p_radius_km, v_pandit.service_radius_km),
        'message', 'Operational service base location updated successfully.'
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 6. Permissions and Execution Grants
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.submit_pandit_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_pandit_application(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_pandit_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pandit_application(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_update_pandit_service_location(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_pandit_service_location(UUID, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.pandit_update_service_location(NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pandit_update_service_location(NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
