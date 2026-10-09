-- =============================================================================
-- Migration: 028_pandit_pricing_onboarding.sql
-- Description: Pandit-Controlled Ritual Pricing & Paid Kundli Onboarding Flow
-- Source of Truth: Kashi Veda Phase 14.2 & Commercial Pricing Specifications
-- NOTE: CREATED ONLY. DO NOT APPLY OR PUSH AUTOMATICALLY.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend public.pandit_applications with commercial pricing fields
-- -----------------------------------------------------------------------------

ALTER TABLE public.pandit_applications
ADD COLUMN IF NOT EXISTS puja_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS kundli_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS kundli_price NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS kundli_turnaround_days INTEGER DEFAULT 3;

DO $$
BEGIN
    -- Check constraint for non-negative Kundli price
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_applications_kundli_price'
    ) THEN
        ALTER TABLE public.pandit_applications
        ADD CONSTRAINT chk_pandit_applications_kundli_price
        CHECK (kundli_price IS NULL OR kundli_price >= 0);
    END IF;

    -- Check constraint for positive turnaround days
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_applications_kundli_turnaround'
    ) THEN
        ALTER TABLE public.pandit_applications
        ADD CONSTRAINT chk_pandit_applications_kundli_turnaround
        CHECK (kundli_turnaround_days IS NULL OR kundli_turnaround_days > 0);
    END IF;

    -- Strict business invariant: When Kundli is enabled, price MUST be > 0
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_applications_kundli_active_price'
    ) THEN
        ALTER TABLE public.pandit_applications
        ADD CONSTRAINT chk_pandit_applications_kundli_active_price
        CHECK ((kundli_enabled = false) OR (kundli_enabled = true AND kundli_price IS NOT NULL AND kundli_price > 0));
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. Update RPC: submit_pandit_application
-- Validates ritual selection, ritual prices (> 0), and Kundli pricing before submission
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
    v_price_text TEXT;
    v_price NUMERIC(12,2);
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

    -- 6. Validate each selected ritual exists and has a strictly positive price
    FOREACH v_puja_id IN ARRAY v_app.selected_puja_ids LOOP
        -- Verify active ritual in catalog
        SELECT * INTO v_puja
        FROM public.puja_services
        WHERE id = v_puja_id AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected Puja ritual % is inactive or does not exist', v_puja_id;
        END IF;

        -- Verify price in puja_prices JSONB
        v_price_text := v_app.puja_prices->>v_puja_id::text;
        IF v_price_text IS NULL OR trim(v_price_text) = '' THEN
            RAISE EXCEPTION 'Price is required for selected ritual "%"', v_puja.name;
        END IF;

        BEGIN
            v_price := v_price_text::numeric;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Price for ritual "%" must be a valid numeric amount', v_puja.name;
        END;

        IF v_price IS NULL OR v_price <= 0 THEN
            RAISE EXCEPTION 'Price for ritual "%" must be strictly greater than zero', v_puja.name;
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
-- 3. Update RPC: approve_pandit_application
-- Links offerings with Pandit's submitted prices and configures Kundli
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
    v_price NUMERIC(12,2);
BEGIN
    -- 1. Authorization check
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    -- 2. Lock row
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
        bio = COALESCE(EXCLUDED.bio, pandit_profiles.bio),
        years_experience = COALESCE(EXCLUDED.years_experience, pandit_profiles.years_experience),
        languages = COALESCE(EXCLUDED.languages, pandit_profiles.languages),
        service_radius_km = COALESCE(EXCLUDED.service_radius_km, pandit_profiles.service_radius_km),
        kundli_enabled = EXCLUDED.kundli_enabled,
        kundli_price = EXCLUDED.kundli_price,
        kundli_turnaround_days = EXCLUDED.kundli_turnaround_days,
        public_status = 'available'::public.pandit_public_status,
        approved_at = now(),
        onboarding_completed_at = COALESCE(pandit_profiles.onboarding_completed_at, now()),
        updated_at = now()
    RETURNING id INTO v_pandit_id;

    -- 7. Upsert primary service area in public.pandit_service_areas
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

    -- 8. Link selected pujas in public.pandit_puja_services using Pandit's submitted prices
    IF v_app.selected_puja_ids IS NOT NULL AND array_length(v_app.selected_puja_ids, 1) > 0 THEN
        FOR v_puja IN
            SELECT ps.id, ps.name, ps.default_duration_minutes
            FROM public.puja_services ps
            WHERE ps.id = ANY(v_app.selected_puja_ids)
        LOOP
            BEGIN
                v_price := (v_app.puja_prices->>v_puja.id::text)::numeric;
            EXCEPTION WHEN OTHERS THEN
                v_price := NULL;
            END;

            IF v_price IS NULL OR v_price <= 0 THEN
                RAISE EXCEPTION 'Cannot approve application: ritual "%" has no valid price configured in application', v_puja.name;
            END IF;

            INSERT INTO public.pandit_puja_services (
                pandit_id,
                puja_service_id,
                price,
                duration_minutes,
                is_active
            ) VALUES (
                v_pandit_id,
                v_puja.id,
                v_price,
                COALESCE(v_puja.default_duration_minutes, 60),
                true
            )
            ON CONFLICT (pandit_id, puja_service_id) DO UPDATE SET
                price = EXCLUDED.price,
                duration_minutes = EXCLUDED.duration_minutes,
                is_active = true;
        END LOOP;
    END IF;

    -- 9. Record documents in public.pandit_documents
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
                verification_status,
                reviewed_by,
                reviewed_at
            ) VALUES (
                v_pandit_id,
                v_doc.doc_type,
                v_doc.doc_path,
                'approved'::public.document_verification_status,
                auth.uid(),
                now()
            )
            ON CONFLICT DO NOTHING;
        END LOOP;
    END IF;

    -- 10. Grant pandit role in public.user_roles WITHOUT removing customer role
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

    -- 11. Record immutable audit event
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        after_json
    ) VALUES (
        auth.uid(),
        'approve_pandit_application',
        'pandit_applications',
        p_application_id::text,
        jsonb_build_object(
            'applicant_user_id', v_app.user_id,
            'pandit_profile_id', v_pandit_id,
            'approved_at', now(),
            'kundli_enabled', v_app.kundli_enabled,
            'kundli_price', v_app.kundli_price
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'pandit_id', v_pandit_id,
        'user_id', v_app.user_id,
        'status', 'approved'
    );
END;
$$;
