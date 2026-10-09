-- =============================================================================
-- Migration: 030_fix_approve_pandit_application_role.sql
-- Description: Fix approve_pandit_application RPC role type cast
-- Bug: Replaces invalid 'public.app_role' cast with canonical 'public.user_role'
-- =============================================================================

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

    -- 7. Add pandit role in public.user_roles WITHOUT removing customer role
    -- Uses valid canonical public.user_role enum (customer, pandit, admin, super_admin)
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

-- Permissions
REVOKE EXECUTE ON FUNCTION public.approve_pandit_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_pandit_application(UUID) TO authenticated;
