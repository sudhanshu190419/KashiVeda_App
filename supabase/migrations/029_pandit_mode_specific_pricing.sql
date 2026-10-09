-- =============================================================================
-- Migration: 029_pandit_mode_specific_pricing.sql
-- Description: Pandit Mode-Specific Puja Pricing (Home, Temple, Remote)
-- Source of Truth: Kashi Veda Phase 14 Mode-Specific Pricing Specification
-- NOTE: CREATED ONLY. DO NOT APPLY OR PUSH AUTOMATICALLY.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend public.pandit_puja_services with Mode-Specific Pricing Columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.pandit_puja_services
ADD COLUMN IF NOT EXISTS home_price NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS temple_price NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS remote_price NUMERIC(12,2);

-- -----------------------------------------------------------------------------
-- 2. Safe Legacy Data Backfill & Consistency Validation
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_invalid_count INTEGER;
BEGIN
    -- 2.1 Verify no active offerings with zero or negative legacy price exist
    SELECT COUNT(*) INTO v_invalid_count
    FROM public.pandit_puja_services
    WHERE is_active = true AND (price IS NULL OR price <= 0);

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'Migration 029 Aborted: Found % active offerings with non-positive legacy price.', v_invalid_count;
    END IF;

    -- 2.2 Verify master rituals associated with active offerings have allowed_modes defined
    SELECT COUNT(*) INTO v_invalid_count
    FROM public.pandit_puja_services pps
    JOIN public.puja_services ps ON ps.id = pps.puja_service_id
    WHERE pps.is_active = true AND (ps.allowed_modes IS NULL OR cardinality(ps.allowed_modes) = 0);

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'Migration 029 Aborted: Found % active offerings linked to rituals with no allowed_modes.', v_invalid_count;
    END IF;

    -- 2.3 Safe Backfill: Copy legacy scalar price into each allowed mode
    UPDATE public.pandit_puja_services pps
    SET
        home_price = CASE WHEN 'home'::public.service_mode = ANY(ps.allowed_modes) THEN pps.price ELSE NULL END,
        temple_price = CASE WHEN 'temple'::public.service_mode = ANY(ps.allowed_modes) THEN pps.price ELSE NULL END,
        remote_price = CASE WHEN 'remote'::public.service_mode = ANY(ps.allowed_modes) THEN pps.price ELSE NULL END
    FROM public.puja_services ps
    WHERE ps.id = pps.puja_service_id
      AND pps.home_price IS NULL
      AND pps.temple_price IS NULL
      AND pps.remote_price IS NULL;

    -- 2.4 Verify that every active offering has at least one mode populated after backfill
    SELECT COUNT(*) INTO v_invalid_count
    FROM public.pandit_puja_services
    WHERE is_active = true
      AND home_price IS NULL
      AND temple_price IS NULL
      AND remote_price IS NULL;

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'Migration 029 Aborted: % active offerings could not be mapped to any allowed mode.', v_invalid_count;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Mode Pricing Check Constraints
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    -- Check constraint for home_price
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_puja_services_home_price'
    ) THEN
        ALTER TABLE public.pandit_puja_services
        ADD CONSTRAINT chk_pandit_puja_services_home_price
        CHECK (home_price IS NULL OR home_price > 0);
    END IF;

    -- Check constraint for temple_price
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_puja_services_temple_price'
    ) THEN
        ALTER TABLE public.pandit_puja_services
        ADD CONSTRAINT chk_pandit_puja_services_temple_price
        CHECK (temple_price IS NULL OR temple_price > 0);
    END IF;

    -- Check constraint for remote_price
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_puja_services_remote_price'
    ) THEN
        ALTER TABLE public.pandit_puja_services
        ADD CONSTRAINT chk_pandit_puja_services_remote_price
        CHECK (remote_price IS NULL OR remote_price > 0);
    END IF;

    -- Invariant: For active offerings, at least one mode price must be configured
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_puja_services_at_least_one_mode'
    ) THEN
        ALTER TABLE public.pandit_puja_services
        ADD CONSTRAINT chk_pandit_puja_services_at_least_one_mode
        CHECK ((is_active = false) OR (home_price IS NOT NULL OR temple_price IS NOT NULL OR remote_price IS NOT NULL));
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 4. Update RPC: submit_pandit_application
-- Validates mode-specific pricing payload, allowed modes, and positive prices
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
    v_puja_id UUID;
    v_puja RECORD;
    v_pricing JSONB;
    v_mode_key TEXT;
    v_mode_val_text TEXT;
    v_mode_price NUMERIC(12,2);
    v_valid_modes_count INTEGER;
BEGIN
    -- 1. Fetch and verify application ownership
    SELECT * INTO v_app
    FROM public.pandit_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found with id: %', p_application_id;
    END IF;

    IF v_app.user_id != auth.uid() AND NOT public.is_admin() THEN
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

    -- 4. Validate document uploads (Identity proof and qualification)
    IF v_app.documents IS NULL OR jsonb_array_length(v_app.documents) < 2 THEN
        RAISE EXCEPTION 'At least 2 verification documents (Identity Proof and Vedic Qualification) are required';
    END IF;

    -- 5. Validate Ritual Offerings: At least one ritual must be selected
    IF v_app.selected_puja_ids IS NULL OR array_length(v_app.selected_puja_ids, 1) IS NULL OR array_length(v_app.selected_puja_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one sacred Puja ritual must be selected for offering';
    END IF;

    -- 6. Validate Mode-Specific Pricing for each selected ritual
    FOREACH v_puja_id IN ARRAY v_app.selected_puja_ids LOOP
        -- Verify active ritual in master catalog
        SELECT * INTO v_puja
        FROM public.puja_services
        WHERE id = v_puja_id AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected Puja ritual % is inactive or does not exist', v_puja_id;
        END IF;

        v_pricing := v_app.puja_prices->v_puja_id::text;
        IF v_pricing IS NULL THEN
            RAISE EXCEPTION 'Pricing details are required for selected ritual "%"', v_puja.name;
        END IF;

        v_valid_modes_count := 0;

        -- Check if payload is mode-keyed object or legacy flat scalar
        IF jsonb_typeof(v_pricing) = 'object' THEN
            FOR v_mode_key, v_mode_val_text IN 
                SELECT key, value::text FROM jsonb_each_text(v_pricing)
            LOOP
                -- Validate mode is recognized
                IF v_mode_key NOT IN ('home', 'temple', 'remote') THEN
                    RAISE EXCEPTION 'Unrecognized service mode "%" for ritual "%"', v_mode_key, v_puja.name;
                END IF;

                -- Validate mode is allowed by master catalog
                IF NOT (v_mode_key::public.service_mode = ANY(v_puja.allowed_modes)) THEN
                    RAISE EXCEPTION 'Service mode "%" is not offered in master catalog for ritual "%"', v_mode_key, v_puja.name;
                END IF;

                -- If mode is specified, price must be valid numeric > 0
                IF v_mode_val_text IS NOT NULL AND trim(v_mode_val_text) != '' THEN
                    BEGIN
                        v_mode_price := v_mode_val_text::numeric;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE EXCEPTION 'Price for "%" mode in ritual "%" must be a valid numeric amount', v_mode_key, v_puja.name;
                    END;

                    IF v_mode_price <= 0 THEN
                        RAISE EXCEPTION 'Price for "%" mode in ritual "%" must be strictly greater than zero', v_mode_key, v_puja.name;
                    END IF;

                    v_valid_modes_count := v_valid_modes_count + 1;
                END IF;
            END LOOP;
        ELSE
            -- Legacy backward compatibility for flat numeric pricing
            BEGIN
                v_mode_price := (v_app.puja_prices->>v_puja_id::text)::numeric;
            EXCEPTION WHEN OTHERS THEN
                v_mode_price := NULL;
            END;

            IF v_mode_price IS NULL OR v_mode_price <= 0 THEN
                RAISE EXCEPTION 'Price for ritual "%" must be strictly greater than zero', v_puja.name;
            END IF;

            IF v_puja.allowed_modes IS NOT NULL AND cardinality(v_puja.allowed_modes) > 0 THEN
                v_valid_modes_count := cardinality(v_puja.allowed_modes);
            END IF;
        END IF;

        IF v_valid_modes_count = 0 THEN
            RAISE EXCEPTION 'At least one service format (Home, Temple, or Remote) must have a valid price for ritual "%"', v_puja.name;
        END IF;
    END LOOP;

    -- 7. Validate Kundli Commercial Offering if enabled
    IF v_app.kundli_enabled = true THEN
        IF v_app.kundli_price IS NULL OR v_app.kundli_price <= 0 THEN
            RAISE EXCEPTION 'Kundli Dakshina fee must be strictly greater than zero when Kundli services are enabled';
        END IF;

        IF v_app.kundli_turnaround_days IS NOT NULL AND v_app.kundli_turnaround_days <= 0 THEN
            RAISE EXCEPTION 'Kundli turnaround days must be greater than zero';
        END IF;
    END IF;

    -- 8. Transition status to submitted
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
        'submitted_at', now()
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 5. Update RPC: approve_pandit_application
-- Maps offerings with mode-specific prices (Home, Temple, Remote)
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
    v_app RECORD;
    v_pandit_id UUID;
    v_doc RECORD;
    v_puja RECORD;
    v_pricing JSONB;
    v_home_price NUMERIC(12,2);
    v_temple_price NUMERIC(12,2);
    v_remote_price NUMERIC(12,2);
    v_legacy_price NUMERIC(12,2);
BEGIN
    -- 1. Authorization check
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    -- 2. Lock application row
    SELECT * INTO v_app
    FROM public.pandit_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found with id: %', p_application_id;
    END IF;

    -- 3. Verify state
    IF v_app.status NOT IN ('submitted', 'under_review') THEN
        RAISE EXCEPTION 'Only submitted or under_review applications can be approved (current: %)', v_app.status;
    END IF;

    -- 4. Validate core requirements
    IF trim(COALESCE(v_app.full_name, '')) = '' OR trim(COALESCE(v_app.primary_city, '')) = '' THEN
        RAISE EXCEPTION 'Application contains incomplete profile data';
    END IF;

    -- 5. Mark application approved
    UPDATE public.pandit_applications
    SET status = 'approved'::public.pandit_application_status,
        approved_at = now(),
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        updated_at = now()
    WHERE id = p_application_id;

    -- 6. Upsert public.pandit_profiles with Kundli configuration
    INSERT INTO public.pandit_profiles (
        user_id,
        verification_status,
        bio,
        years_experience,
        languages,
        service_radius_km,
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
        kundli_enabled = EXCLUDED.kundli_enabled,
        kundli_price = EXCLUDED.kundli_price,
        kundli_turnaround_days = EXCLUDED.kundli_turnaround_days,
        public_status = 'available'::public.pandit_public_status,
        approved_at = now(),
        updated_at = now()
    RETURNING id INTO v_pandit_id;

    -- 7. Add pandit role in public.user_roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_app.user_id, 'pandit'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- 8. Register primary service area
    INSERT INTO public.pandit_service_areas (
        pandit_id,
        city,
        radius_km,
        is_active
    ) VALUES (
        v_pandit_id,
        v_app.primary_city,
        v_app.service_radius_km,
        true
    )
    ON CONFLICT DO NOTHING;

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
                -- Legacy scalar backfill: assign across all catalog-allowed modes
                BEGIN
                    v_legacy_price := (v_app.puja_prices->>v_puja.id::text)::numeric;
                EXCEPTION WHEN OTHERS THEN
                    v_legacy_price := NULL;
                END;

                IF v_legacy_price IS NOT NULL AND v_legacy_price > 0 THEN
                    v_home_price := CASE WHEN 'home'::public.service_mode = ANY(v_puja.allowed_modes) THEN v_legacy_price ELSE NULL END;
                    v_temple_price := CASE WHEN 'temple'::public.service_mode = ANY(v_puja.allowed_modes) THEN v_legacy_price ELSE NULL END;
                    v_remote_price := CASE WHEN 'remote'::public.service_mode = ANY(v_puja.allowed_modes) THEN v_legacy_price ELSE NULL END;
                END IF;
            END IF;

            IF v_home_price IS NULL AND v_temple_price IS NULL AND v_remote_price IS NULL THEN
                RAISE EXCEPTION 'Cannot approve application: ritual "%" has no valid mode prices configured in application', v_puja.name;
            END IF;

            INSERT INTO public.pandit_puja_services (
                pandit_id,
                puja_service_id,
                home_price,
                temple_price,
                remote_price,
                price,
                duration_minutes,
                is_active
            ) VALUES (
                v_pandit_id,
                v_puja.id,
                v_home_price,
                v_temple_price,
                v_remote_price,
                COALESCE(v_home_price, v_temple_price, v_remote_price),
                COALESCE(v_puja.default_duration_minutes, 60),
                true
            )
            ON CONFLICT (pandit_id, puja_service_id) DO UPDATE SET
                home_price = EXCLUDED.home_price,
                temple_price = EXCLUDED.temple_price,
                remote_price = EXCLUDED.remote_price,
                price = EXCLUDED.price,
                duration_minutes = EXCLUDED.duration_minutes,
                is_active = true;
        END LOOP;
    END IF;

    -- 10. Record documents in public.pandit_documents
    IF v_app.documents IS NOT NULL AND jsonb_array_length(v_app.documents) > 0 THEN
        FOR v_doc IN 
            SELECT 
                (elem->>'document_type')::text AS doc_type,
                (elem->>'storage_path')::text AS doc_path
            FROM jsonb_array_elements(v_app.documents) AS elem
        LOOP
            INSERT INTO public.pandit_documents (
                pandit_id,
                document_type,
                storage_path,
                verification_status
            ) VALUES (
                v_pandit_id,
                v_doc.doc_type,
                v_doc.doc_path,
                'verified'
            )
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- 11. Write audit log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        after_json
    ) VALUES (
        auth.uid(),
        'pandit_application_approved',
        'pandit_applications',
        p_application_id,
        jsonb_build_object(
            'pandit_id', v_pandit_id,
            'approved_at', now(),
            'puja_count', COALESCE(array_length(v_app.selected_puja_ids, 1), 0),
            'kundli_enabled', v_app.kundli_enabled,
            'kundli_price', v_app.kundli_price
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'pandit_id', v_pandit_id,
        'status', 'approved',
        'approved_at', now()
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 6. Update RPC: create_or_validate_booking
-- Resolves authoritative price based on p_service_mode and validates mode availability
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_or_validate_booking(
    p_pandit_id UUID,
    p_puja_service_id UUID,
    p_service_mode public.service_mode,
    p_scheduled_start_at TIMESTAMPTZ,
    p_address_id UUID DEFAULT NULL,
    p_temple_id UUID DEFAULT NULL,
    p_samagri_package_id UUID DEFAULT NULL,
    p_custom_samagri_item_ids UUID[] DEFAULT NULL,
    p_custom_samagri_quantities NUMERIC[] DEFAULT NULL,
    p_prasad_item_ids UUID[] DEFAULT NULL,
    p_prasad_quantities NUMERIC[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_customer_id UUID;
    v_pandit RECORD;
    v_puja RECORD;
    v_pandit_puja RECORD;
    v_policy RECORD;
    v_address RECORD;
    v_temple RECORD;
    v_package RECORD;
    v_duration_minutes INTEGER;
    v_scheduled_end_at TIMESTAMPTZ;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_puja_price NUMERIC(12,2);
    v_samagri_total NUMERIC(12,2) := 0;
    v_prasad_total NUMERIC(12,2) := 0;
    v_advance_percent NUMERIC(5,2);
    v_advance_amount NUMERIC(12,2);
    v_balance_amount NUMERIC(12,2);
    v_total_amount NUMERIC(12,2);
    v_booking_id UUID;
    v_booking_number TEXT;
    v_payment_order_id UUID;
    v_idx INTEGER;
    v_pkg_item_count INTEGER;
    v_samagri_item RECORD;
    v_prasad_item RECORD;
    v_item_qty NUMERIC(12,3);
    v_item_price NUMERIC(12,2);
    v_item_total NUMERIC(12,2);
    v_pkg_calculated_price NUMERIC(12,2) := 0;
BEGIN
    -- 1. Verify Authenticated Customer
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a booking.';
    END IF;

    IF p_scheduled_start_at IS NULL OR p_scheduled_start_at <= now() THEN
        RAISE EXCEPTION 'Scheduled booking time must be in the future.';
    END IF;

    -- 2. Concurrency Protection & Pandit Status Validation
    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected Pandit does not exist.';
    END IF;

    IF v_pandit.verification_status != 'approved' THEN
        RAISE EXCEPTION 'Selected Pandit is not currently approved for bookings.';
    END IF;

    IF v_pandit.public_status != 'available' THEN
        RAISE EXCEPTION 'Selected Pandit is currently unavailable and cannot receive new bookings.';
    END IF;

    -- 3. Validate Master Puja Service & Master Catalog Supported Mode
    SELECT * INTO v_puja
    FROM public.puja_services
    WHERE id = p_puja_service_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected Puja ritual is not active or does not exist.';
    END IF;

    IF NOT (p_service_mode = ANY(v_puja.allowed_modes)) THEN
        RAISE EXCEPTION 'Service mode % is not supported for this Puja in catalog.', p_service_mode;
    END IF;

    -- 4. Validate Pandit Offering & Resolve Mode-Specific Authoritative Price
    SELECT * INTO v_pandit_puja
    FROM public.pandit_puja_services
    WHERE pandit_id = p_pandit_id 
      AND puja_service_id = p_puja_service_id 
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit does not offer the requested Puja service.';
    END IF;

    -- Mode-Specific Price Resolution
    IF p_service_mode = 'home' THEN
        v_puja_price := v_pandit_puja.home_price;
    ELSIF p_service_mode = 'temple' THEN
        v_puja_price := v_pandit_puja.temple_price;
    ELSIF p_service_mode = 'remote' THEN
        v_puja_price := v_pandit_puja.remote_price;
    ELSE
        RAISE EXCEPTION 'Invalid service mode: %', p_service_mode;
    END IF;

    -- Strict validation: Pandit must specifically offer the requested mode with price > 0
    IF v_puja_price IS NULL OR v_puja_price <= 0 THEN
        RAISE EXCEPTION 'Selected Pandit does not offer "%" in % mode.', v_puja.name, p_service_mode;
    END IF;

    v_duration_minutes := COALESCE(v_pandit_puja.duration_minutes, v_puja.default_duration_minutes);
    IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN
        v_duration_minutes := 60;
    END IF;

    v_scheduled_end_at := p_scheduled_start_at + (v_duration_minutes || ' minutes')::interval;

    -- 5. Service Mode Specific Validation & Geographic Coverage
    IF p_service_mode = 'home' THEN
        IF p_address_id IS NULL THEN
            RAISE EXCEPTION 'Customer address is required for Home Puja bookings.';
        END IF;

        SELECT * INTO v_address
        FROM public.customer_addresses
        WHERE id = p_address_id AND customer_id = v_customer_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Provided address does not belong to the authenticated customer.';
        END IF;

        IF v_address.latitude IS NULL OR v_address.longitude IS NULL THEN
            RAISE EXCEPTION 'Customer address must have valid geographical coordinates for Home service validation.';
        END IF;

        IF NOT EXISTS (
            SELECT 1 
            FROM public.pandit_service_areas psa
            WHERE psa.pandit_id = p_pandit_id
              AND psa.is_active = true
              AND psa.latitude IS NOT NULL 
              AND psa.longitude IS NOT NULL
              AND extensions.st_dwithin(
                  extensions.st_setsrid(extensions.st_makepoint(psa.longitude, psa.latitude), 4326)::extensions.geography,
                  extensions.st_setsrid(extensions.st_makepoint(v_address.longitude, v_address.latitude), 4326)::extensions.geography,
                  psa.radius_km * 1000
              )
        ) THEN
            RAISE EXCEPTION 'Customer address is outside the Pandit''s active operational service radius.';
        END IF;

    ELSIF p_service_mode = 'temple' THEN
        IF p_temple_id IS NULL THEN
            RAISE EXCEPTION 'Temple selection is required for Temple Puja bookings.';
        END IF;

        SELECT * INTO v_temple
        FROM public.temples
        WHERE id = p_temple_id AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected Temple is not active or does not exist.';
        END IF;
    END IF;

    -- 6. Availability Schedule Verification (Day of week & Operating Hours)
    v_dow := EXTRACT(DOW FROM p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata');
    v_start_time := (p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata')::time;
    v_end_time := (v_scheduled_end_at AT TIME ZONE 'Asia/Kolkata')::time;

    IF NOT EXISTS (
        SELECT 1 
        FROM public.pandit_availability_rules par
        WHERE par.pandit_id = p_pandit_id
          AND par.day_of_week = v_dow
          AND par.is_active = true
          AND par.start_time <= v_start_time
          AND par.end_time >= v_end_time
    ) THEN
        RAISE EXCEPTION 'Booking time is outside the Pandit''s configured weekly operating hours.';
    END IF;

    -- 7. Unavailability Blocks Check
    IF EXISTS (
        SELECT 1 
        FROM public.pandit_unavailability_blocks pub
        WHERE pub.pandit_id = p_pandit_id
          AND p_scheduled_start_at < pub.ends_at
          AND v_scheduled_end_at > pub.starts_at
    ) THEN
        RAISE EXCEPTION 'Selected Pandit is unavailable during the requested time window.';
    END IF;

    -- 8. Existing Overlapping Confirmed/Upcoming Bookings Check
    IF EXISTS (
        SELECT 1 
        FROM public.bookings b
        WHERE b.pandit_id = p_pandit_id
          AND b.status IN ('confirmed', 'upcoming', 'in_progress', 'payment_pending')
          AND p_scheduled_start_at < b.scheduled_end_at
          AND v_scheduled_end_at > b.scheduled_start_at
    ) THEN
        RAISE EXCEPTION 'Selected Pandit already has a booking or pending reservation during this time window.';
    END IF;

    -- 9. Samagri Selection & Pricing Verification
    IF p_samagri_package_id IS NOT NULL THEN
        SELECT * INTO v_package
        FROM public.samagri_packages
        WHERE id = p_samagri_package_id 
          AND puja_service_id = p_puja_service_id 
          AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected Samagri Package does not exist for this Puja service.';
        END IF;

        SELECT COUNT(*) INTO v_pkg_item_count
        FROM public.samagri_package_items
        WHERE samagri_package_id = p_samagri_package_id;

        IF v_pkg_item_count = 0 THEN
            RAISE EXCEPTION 'Selected Samagri Package has no configured items.';
        END IF;

        SELECT COALESCE(SUM(spi.quantity * si.unit_price), 0) INTO v_pkg_calculated_price
        FROM public.samagri_package_items spi
        JOIN public.samagri_items si ON si.id = spi.samagri_item_id
        WHERE spi.samagri_package_id = p_samagri_package_id AND si.is_active = true;

        v_samagri_total := v_pkg_calculated_price;

    ELSIF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
        IF p_custom_samagri_quantities IS NULL OR array_length(p_custom_samagri_quantities, 1) != array_length(p_custom_samagri_item_ids, 1) THEN
            RAISE EXCEPTION 'Mismatch between custom Samagri item IDs and quantities array length.';
        END IF;

        FOR v_idx IN 1..array_length(p_custom_samagri_item_ids, 1) LOOP
            v_item_qty := p_custom_samagri_quantities[v_idx];
            IF v_item_qty <= 0 THEN
                RAISE EXCEPTION 'Quantity for Samagri item must be strictly greater than zero.';
            END IF;

            SELECT * INTO v_samagri_item
            FROM public.samagri_items
            WHERE id = p_custom_samagri_item_ids[v_idx] AND is_active = true;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Samagri item % is inactive or does not exist.', p_custom_samagri_item_ids[v_idx];
            END IF;

            v_item_total := ROUND(v_item_qty * v_samagri_item.unit_price, 2);
            v_samagri_total := v_samagri_total + v_item_total;
        END LOOP;
    END IF;

    -- 10. Prasad Selection & Item-Level Unit Pricing Verification
    IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
        IF p_prasad_quantities IS NULL OR array_length(p_prasad_quantities, 1) != array_length(p_prasad_item_ids, 1) THEN
            RAISE EXCEPTION 'Mismatch between Prasad item IDs and quantities array length.';
        END IF;

        FOR v_idx IN 1..array_length(p_prasad_item_ids, 1) LOOP
            v_item_qty := p_prasad_quantities[v_idx];
            IF v_item_qty <= 0 THEN
                RAISE EXCEPTION 'Quantity for Prasad item must be strictly greater than zero.';
            END IF;

            SELECT * INTO v_prasad_item
            FROM public.prasad_items
            WHERE id = p_prasad_item_ids[v_idx] AND is_active = true;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Prasad item % is inactive or does not exist.', p_prasad_item_ids[v_idx];
            END IF;

            v_item_price := v_prasad_item.unit_price;
            IF v_item_price IS NULL OR v_item_price < 0 THEN
                RAISE EXCEPTION 'Unit price for Prasad item "%" is not properly configured.', v_prasad_item.name;
            END IF;

            v_item_total := ROUND(v_item_qty * v_item_price, 2);
            v_prasad_total := v_prasad_total + v_item_total;
        END LOOP;
    END IF;

    -- 11. Authoritative Financial Policy Calculation
    SELECT * INTO v_policy
    FROM public.payment_policies
    WHERE policy_key = 'booking_advance' AND is_active = true;

    IF p_service_mode = 'home' THEN
        v_advance_percent := COALESCE((v_policy.policy_rules->>'home_advance_percentage')::numeric, 10.00);
    ELSIF p_service_mode = 'remote' THEN
        v_advance_percent := COALESCE((v_policy.policy_rules->>'remote_advance_percentage')::numeric, 50.00);
    ELSIF p_service_mode = 'temple' THEN
        v_advance_percent := COALESCE((v_policy.policy_rules->>'temple_advance_percentage')::numeric, 10.00);
    ELSE
        v_advance_percent := 10.00;
    END IF;

    IF v_advance_percent < 0 OR v_advance_percent > 100 THEN
        v_advance_percent := 10.00;
    END IF;

    v_total_amount := v_puja_price + v_samagri_total + v_prasad_total;
    v_advance_amount := ROUND(((v_puja_price * v_advance_percent) / 100.0) + v_samagri_total + v_prasad_total, 2);
    v_balance_amount := v_total_amount - v_advance_amount;

    IF v_advance_amount > v_total_amount THEN
        v_advance_amount := v_total_amount;
        v_balance_amount := 0;
    END IF;

    -- 12. Create Booking Record
    v_booking_number := 'KV-BK-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6));

    INSERT INTO public.bookings (
        booking_number,
        customer_id,
        pandit_id,
        puja_service_id,
        service_mode,
        status,
        scheduled_start_at,
        scheduled_end_at,
        price_snapshot,
        currency,
        advance_percent,
        advance_amount,
        balance_amount,
        total_amount,
        reschedule_count
    ) VALUES (
        v_booking_number,
        v_customer_id,
        p_pandit_id,
        p_puja_service_id,
        p_service_mode,
        'payment_pending'::public.booking_status,
        p_scheduled_start_at,
        v_scheduled_end_at,
        v_puja_price,
        'INR',
        v_advance_percent,
        v_advance_amount,
        v_balance_amount,
        v_total_amount,
        0
    ) RETURNING id INTO v_booking_id;

    -- 13. Create Historical Service Location Snapshot
    IF p_service_mode = 'home' THEN
        INSERT INTO public.booking_service_locations (
            booking_id,
            location_type,
            address_id,
            address_snapshot,
            city,
            state,
            pincode,
            latitude,
            longitude
        ) VALUES (
            v_booking_id,
            'home'::public.service_mode,
            v_address.id,
            v_address.address_line1 || COALESCE(', ' || v_address.address_line2, ''),
            v_address.city,
            v_address.state,
            v_address.pincode,
            v_address.latitude,
            v_address.longitude
        );
    ELSIF p_service_mode = 'temple' THEN
        INSERT INTO public.booking_service_locations (
            booking_id,
            location_type,
            temple_id,
            temple_name_snapshot,
            city,
            state,
            pincode,
            latitude,
            longitude
        ) VALUES (
            v_booking_id,
            'temple'::public.service_mode,
            v_temple.id,
            v_temple.name,
            v_temple.city,
            v_temple.state,
            v_temple.pincode,
            v_temple.latitude,
            v_temple.longitude
        );
    ELSIF p_service_mode = 'remote' THEN
        INSERT INTO public.booking_service_locations (
            booking_id,
            location_type,
            city,
            state
        ) VALUES (
            v_booking_id,
            'remote'::public.service_mode,
            'Varanasi',
            'Uttar Pradesh'
        );
    END IF;

    -- 14. Create Immutable Line Items Snapshot
    -- 14.1 Ritual Dakshina line item
    INSERT INTO public.booking_line_items (
        booking_id,
        item_type,
        name_snapshot,
        unit,
        quantity,
        unit_price,
        total_price,
        is_refundable
    ) VALUES (
        v_booking_id,
        'puja'::public.line_item_type,
        v_puja.name,
        'ceremony',
        1,
        v_puja_price,
        v_puja_price,
        true
    );

    -- 14.2 Package samagri items
    IF p_samagri_package_id IS NOT NULL THEN
        INSERT INTO public.booking_line_items (
            booking_id,
            item_type,
            samagri_package_id,
            samagri_item_id,
            name_snapshot,
            unit,
            quantity,
            unit_price,
            total_price,
            is_refundable
        )
        SELECT 
            v_booking_id,
            'samagri'::public.line_item_type,
            p_samagri_package_id,
            si.id,
            si.name,
            si.unit,
            spi.quantity,
            si.unit_price,
            ROUND(spi.quantity * si.unit_price, 2),
            true
        FROM public.samagri_package_items spi
        JOIN public.samagri_items si ON si.id = spi.samagri_item_id
        WHERE spi.samagri_package_id = p_samagri_package_id;

    -- 14.3 Custom samagri items
    ELSIF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
        FOR v_idx IN 1..array_length(p_custom_samagri_item_ids, 1) LOOP
            SELECT * INTO v_samagri_item FROM public.samagri_items WHERE id = p_custom_samagri_item_ids[v_idx];
            v_item_qty := p_custom_samagri_quantities[v_idx];
            INSERT INTO public.booking_line_items (
                booking_id,
                item_type,
                samagri_item_id,
                name_snapshot,
                unit,
                quantity,
                unit_price,
                total_price,
                is_refundable
            ) VALUES (
                v_booking_id,
                'samagri'::public.line_item_type,
                v_samagri_item.id,
                v_samagri_item.name,
                v_samagri_item.unit,
                v_item_qty,
                v_samagri_item.unit_price,
                ROUND(v_item_qty * v_samagri_item.unit_price, 2),
                true
            );
        END LOOP;
    END IF;

    -- 14.4 Prasad items
    IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
        FOR v_idx IN 1..array_length(p_prasad_item_ids, 1) LOOP
            SELECT * INTO v_prasad_item FROM public.prasad_items WHERE id = p_prasad_item_ids[v_idx];
            v_item_qty := p_prasad_quantities[v_idx];
            v_item_price := v_prasad_item.unit_price;

            INSERT INTO public.booking_line_items (
                booking_id,
                item_type,
                prasad_item_id,
                name_snapshot,
                unit,
                quantity,
                unit_price,
                total_price,
                is_refundable
            ) VALUES (
                v_booking_id,
                'prasad'::public.line_item_type,
                v_prasad_item.id,
                v_prasad_item.name,
                'pack',
                v_item_qty,
                v_item_price,
                ROUND(v_item_qty * v_item_price, 2),
                true
            );
        END LOOP;
    END IF;

    -- 15. Create Advance Payment Order
    INSERT INTO public.payment_orders (
        customer_id,
        booking_id,
        amount,
        currency,
        payment_type,
        status
    ) VALUES (
        v_customer_id,
        v_booking_id,
        v_advance_amount,
        'INR',
        'advance'::public.payment_type,
        'created'::public.payment_order_status
    ) RETURNING id INTO v_payment_order_id;

    -- 16. Audit Log Entry
    INSERT INTO public.audit_logs (
        entity_name,
        entity_id,
        action,
        performed_by,
        new_values
    ) VALUES (
        'bookings',
        v_booking_id,
        'INSERT',
        v_customer_id,
        jsonb_build_object(
            'booking_number', v_booking_number,
            'customer_id', v_customer_id,
            'pandit_id', p_pandit_id,
            'puja_service_id', p_puja_service_id,
            'service_mode', p_service_mode,
            'price_snapshot', v_puja_price,
            'advance_amount', v_advance_amount,
            'balance_amount', v_balance_amount,
            'total_amount', v_total_amount,
            'payment_order_id', v_payment_order_id
        )
    );

    RETURN jsonb_build_object(
        'booking_id', v_booking_id,
        'booking_number', v_booking_number,
        'status', 'payment_pending',
        'service_mode', p_service_mode,
        'puja_price', v_puja_price,
        'samagri_total', v_samagri_total,
        'prasad_total', v_prasad_total,
        'advance_percent', v_advance_percent,
        'advance_amount', v_advance_amount,
        'balance_amount', v_balance_amount,
        'total_amount', v_total_amount,
        'payment_order_id', v_payment_order_id,
        'scheduled_start_at', p_scheduled_start_at,
        'scheduled_end_at', v_scheduled_end_at
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 7. Update RPC: get_customer_pandits
-- Returns mode-specific prices and filters by requested service_mode
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_customer_pandits(public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_customer_pandits(
    p_service_mode public.service_mode DEFAULT NULL,
    p_latitude NUMERIC DEFAULT NULL,
    p_longitude NUMERIC DEFAULT NULL,
    p_puja_service_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    years_experience INTEGER,
    languages TEXT[],
    public_status public.pandit_public_status,
    rating_avg NUMERIC(3,2),
    rating_count BIGINT,
    offering_names TEXT[],
    puja_price NUMERIC(12,2),
    distance_km NUMERIC(6,2),
    kundli_enabled BOOLEAN,
    kundli_price NUMERIC(12,2),
    home_price NUMERIC(12,2),
    temple_price NUMERIC(12,2),
    remote_price NUMERIC(12,2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clamped_limit INTEGER;
    v_clamped_offset INTEGER;
BEGIN
    -- 1. Validate Coordinate Ranges when supplied
    IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
        RAISE EXCEPTION 'Latitude must be between -90 and 90 degrees.';
    END IF;

    IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
        RAISE EXCEPTION 'Longitude must be between -180 and 180 degrees.';
    END IF;

    -- 2. Strict Home Mode Validation: Coordinates are mandatory for Home discovery
    IF p_service_mode = 'home' AND (p_latitude IS NULL OR p_longitude IS NULL) THEN
        RAISE EXCEPTION 'Geographical coordinates (latitude and longitude) are required for Home service discovery.';
    END IF;

    -- 3. Safe Pagination Clamping
    v_clamped_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_clamped_offset := GREATEST(COALESCE(p_offset, 0), 0);

    -- 4. Return Filtered Pandit Directory with Mode-Specific Pricing
    RETURN QUERY
    SELECT 
        pp.id,
        pp.user_id,
        pr.display_name,
        pr.avatar_url,
        pp.bio,
        pp.years_experience,
        pp.languages,
        pp.public_status,
        rev.rating_avg,
        COALESCE(rev.rating_count, 0::bigint) AS rating_count,
        offerings.names AS offering_names,
        -- Effective price resolved from requested service_mode, falling back to minimum available mode price
        CASE p_service_mode
            WHEN 'home' THEN pps_target.home_price
            WHEN 'temple' THEN pps_target.temple_price
            WHEN 'remote' THEN pps_target.remote_price
            ELSE COALESCE(
                pps_target.price,
                pps_target.home_price,
                pps_target.temple_price,
                pps_target.remote_price
            )
        END AS puja_price,
        CASE 
            WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND psa_nearest.latitude IS NOT NULL THEN
                ROUND((extensions.st_distance(
                    extensions.st_setsrid(extensions.st_makepoint(psa_nearest.longitude, psa_nearest.latitude), 4326)::extensions.geography,
                    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
                ) / 1000.0)::numeric, 2)
            ELSE NULL
        END AS distance_km,
        pp.kundli_enabled,
        pp.kundli_price,
        pps_target.home_price,
        pps_target.temple_price,
        pps_target.remote_price
    FROM public.pandit_profiles pp
    JOIN public.profiles pr ON pr.id = pp.user_id
    LEFT JOIN LATERAL (
        SELECT array_agg(ps.name ORDER BY ps.name) AS names
        FROM public.pandit_puja_services pps
        JOIN public.puja_services ps ON ps.id = pps.puja_service_id
        WHERE pps.pandit_id = pp.id AND pps.is_active = true AND ps.is_active = true
    ) offerings ON true
    LEFT JOIN public.pandit_puja_services pps_target 
        ON pps_target.pandit_id = pp.id 
       AND pps_target.puja_service_id = p_puja_service_id 
       AND pps_target.is_active = true
    LEFT JOIN LATERAL (
        SELECT 
            ROUND(AVG(r.rating)::numeric, 2) AS rating_avg,
            COUNT(r.id)::bigint AS rating_count
        FROM public.reviews r
        WHERE r.pandit_id = pp.id AND r.visibility_status = 'published'
    ) rev ON true
    LEFT JOIN LATERAL (
        SELECT psa.latitude, psa.longitude, psa.radius_km
        FROM public.pandit_service_areas psa
        WHERE psa.pandit_id = pp.id 
          AND psa.is_active = true
          AND psa.latitude IS NOT NULL 
          AND psa.longitude IS NOT NULL
        ORDER BY CASE 
            WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
                extensions.st_distance(
                    extensions.st_setsrid(extensions.st_makepoint(psa.longitude, psa.latitude), 4326)::extensions.geography,
                    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
                )
            ELSE 0 
        END ASC
        LIMIT 1
    ) psa_nearest ON true
    WHERE pp.verification_status = 'approved'
      -- When specific puja is requested, Pandit must offer it
      AND (
          p_puja_service_id IS NULL 
          OR pps_target.id IS NOT NULL
      )
      -- When specific mode is requested for a ritual, Pandit must offer that mode
      AND (
          p_puja_service_id IS NULL 
          OR p_service_mode IS NULL 
          OR (
              CASE p_service_mode
                  WHEN 'home' THEN pps_target.home_price IS NOT NULL
                  WHEN 'temple' THEN pps_target.temple_price IS NOT NULL
                  WHEN 'remote' THEN pps_target.remote_price IS NOT NULL
                  ELSE false
              END
          )
      )
      -- Geographic filtering for Home service mode
      AND (
          p_service_mode IS NULL 
          OR p_service_mode != 'home'
          OR EXISTS (
              SELECT 1 
              FROM public.pandit_service_areas psa_chk
              WHERE psa_chk.pandit_id = pp.id
                AND psa_chk.is_active = true
                AND psa_chk.latitude IS NOT NULL 
                AND psa_chk.longitude IS NOT NULL
                AND extensions.st_dwithin(
                    extensions.st_setsrid(extensions.st_makepoint(psa_chk.longitude, psa_chk.latitude), 4326)::extensions.geography,
                    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
                    psa_chk.radius_km * 1000
                )
          )
      )
    ORDER BY 
        CASE WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN distance_km END ASC NULLS LAST,
        rev.rating_avg DESC NULLS LAST,
        pp.years_experience DESC NULLS LAST,
        pr.display_name ASC
    LIMIT v_clamped_limit
    OFFSET v_clamped_offset;
END;
$$;


-- -----------------------------------------------------------------------------
-- 8. Permissions & Execution Grants
-- -----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.submit_pandit_application(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_pandit_application(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_or_validate_booking(UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_pandits(public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER) TO anon, authenticated, service_role;
