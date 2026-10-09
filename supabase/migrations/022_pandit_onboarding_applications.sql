-- =============================================================================
-- Migration: 022_pandit_onboarding_applications.sql
-- Description: Pandit Onboarding & Approval Lifecycle (Pre-approval applications,
--              atomic approval/rejection RPCs, storage policies, and multi-role sync)
-- Source of Truth: Kashi Veda Phase 14.2 Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pandit Application Status Enum
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pandit_application_status') THEN
        CREATE TYPE public.pandit_application_status AS ENUM (
            'draft',
            'submitted',
            'under_review',
            'approved',
            'rejected'
        );
    END IF;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. Pandit Applications Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pandit_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    date_of_birth DATE,
    phone TEXT,
    email TEXT,
    bio TEXT,
    years_experience INTEGER CHECK (years_experience >= 0),
    languages TEXT[] NOT NULL DEFAULT '{}',
    vedic_tradition TEXT,
    primary_city TEXT NOT NULL,
    service_radius_km NUMERIC(8,2) NOT NULL DEFAULT 25.0 CHECK (service_radius_km > 0),
    selected_puja_ids UUID[] NOT NULL DEFAULT '{}',
    service_modes TEXT[] NOT NULL DEFAULT '{"in_person"}',
    documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    status public.pandit_application_status NOT NULL DEFAULT 'draft'::public.pandit_application_status,
    rejection_reason TEXT,
    review_notes TEXT,
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on pandit_applications
DROP TRIGGER IF EXISTS trg_pandit_applications_updated_at ON public.pandit_applications;
CREATE TRIGGER trg_pandit_applications_updated_at
    BEFORE UPDATE ON public.pandit_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for status queues, user lookup, and active application constraint
CREATE INDEX IF NOT EXISTS idx_pandit_applications_status ON public.pandit_applications(status);
CREATE INDEX IF NOT EXISTS idx_pandit_applications_user_id ON public.pandit_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_pandit_applications_submitted_at ON public.pandit_applications(submitted_at);
CREATE INDEX IF NOT EXISTS idx_pandit_applications_reviewed_by ON public.pandit_applications(reviewed_by);

-- Invariant: A user can have at most ONE active application (draft, submitted, or under_review)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pandit_applications_active_user
    ON public.pandit_applications (user_id)
    WHERE status IN ('draft', 'submitted', 'under_review');


-- -----------------------------------------------------------------------------
-- 3. Row Level Security on pandit_applications
-- -----------------------------------------------------------------------------

ALTER TABLE public.pandit_applications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.pandit_applications TO authenticated;

-- Customers can view only their own applications
DROP POLICY IF EXISTS "pandit_applications_select_own" ON public.pandit_applications;
CREATE POLICY "pandit_applications_select_own"
    ON public.pandit_applications FOR SELECT
    USING (user_id = auth.uid());

-- Customers can insert new applications in draft status only
DROP POLICY IF EXISTS "pandit_applications_insert_own" ON public.pandit_applications;
CREATE POLICY "pandit_applications_insert_own"
    ON public.pandit_applications FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND status = 'draft'::public.pandit_application_status
    );

-- Customers can update their own draft or rejected applications (cannot self-approve or change status directly)
DROP POLICY IF EXISTS "pandit_applications_update_own" ON public.pandit_applications;
CREATE POLICY "pandit_applications_update_own"
    ON public.pandit_applications FOR UPDATE
    USING (
        user_id = auth.uid()
        AND status IN ('draft'::public.pandit_application_status, 'rejected'::public.pandit_application_status)
    )
    WITH CHECK (
        user_id = auth.uid()
        AND status IN ('draft'::public.pandit_application_status, 'rejected'::public.pandit_application_status)
        AND reviewed_by IS NULL
        AND approved_at IS NULL
    );

-- Administrators have full oversight of all applications
DROP POLICY IF EXISTS "pandit_applications_all_admin" ON public.pandit_applications;
CREATE POLICY "pandit_applications_all_admin"
    ON public.pandit_applications FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- -----------------------------------------------------------------------------
-- 4. Storage Policies: pandit-documents (applications/{user_id}/...)
-- -----------------------------------------------------------------------------

-- 4.1 SELECT: Applicant can view own application documents; Admins can view all
DROP POLICY IF EXISTS "pandit_documents_applications_select" ON storage.objects;
CREATE POLICY "pandit_documents_applications_select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR name LIKE 'applications/' || auth.uid()::text || '/%'
        )
    );

-- 4.2 INSERT: Applicant can upload to applications/{user_id}/...; Admins can upload
DROP POLICY IF EXISTS "pandit_documents_applications_insert" ON storage.objects;
CREATE POLICY "pandit_documents_applications_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR name LIKE 'applications/' || auth.uid()::text || '/%'
        )
    );

-- 4.3 UPDATE: Applicant can update in applications/{user_id}/...; Admins can update
DROP POLICY IF EXISTS "pandit_documents_applications_update" ON storage.objects;
CREATE POLICY "pandit_documents_applications_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR name LIKE 'applications/' || auth.uid()::text || '/%'
        )
    )
    WITH CHECK (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR name LIKE 'applications/' || auth.uid()::text || '/%'
        )
    );

-- 4.4 DELETE: Applicant can delete while draft/rejected; Admins can delete
DROP POLICY IF EXISTS "pandit_documents_applications_delete" ON storage.objects;
CREATE POLICY "pandit_documents_applications_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'pandit-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR name LIKE 'applications/' || auth.uid()::text || '/%'
        )
    );


-- -----------------------------------------------------------------------------
-- 5. RPC: submit_pandit_application (Customer initiates submission)
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

    -- 3. Validate mandatory fields
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

    -- 5. Transition status to submitted
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
-- 6. RPC: reject_pandit_application (Admin rejection with mandatory reason)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_pandit_application(
    p_application_id UUID,
    p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_app RECORD;
    v_trimmed_reason TEXT;
BEGIN
    -- 1. Authorization check
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    -- 2. Validate rejection reason
    v_trimmed_reason := trim(COALESCE(p_rejection_reason, ''));
    IF length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'A meaningful rejection reason of at least 5 characters is required';
    END IF;

    -- 3. Lock row and verify state
    SELECT * INTO v_app
    FROM public.pandit_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found with id: %', p_application_id;
    END IF;

    IF v_app.status NOT IN ('submitted', 'under_review') THEN
        RAISE EXCEPTION 'Only submitted or under_review applications can be rejected (current: %)', v_app.status;
    END IF;

    -- 4. Set application to rejected
    UPDATE public.pandit_applications
    SET status = 'rejected'::public.pandit_application_status,
        rejection_reason = v_trimmed_reason,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        updated_at = now()
    WHERE id = p_application_id;

    -- 5. Record immutable audit log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        after_json
    ) VALUES (
        auth.uid(),
        'reject_pandit_application',
        'pandit_applications',
        p_application_id::text,
        jsonb_build_object(
            'applicant_user_id', v_app.user_id,
            'rejection_reason', v_trimmed_reason,
            'rejected_at', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'status', 'rejected',
        'rejection_reason', v_trimmed_reason
    );
END;
$$;


-- -----------------------------------------------------------------------------
-- 7. RPC: approve_pandit_application (Atomic Administrator Approval)
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

    -- 6. Upsert public.pandit_profiles
    INSERT INTO public.pandit_profiles (
        user_id,
        verification_status,
        bio,
        years_experience,
        languages,
        service_radius_km,
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

    -- 8. Link selected pujas in public.pandit_puja_services
    IF array_length(v_app.selected_puja_ids, 1) > 0 THEN
        INSERT INTO public.pandit_puja_services (
            pandit_id,
            puja_service_id,
            price,
            duration_minutes,
            is_active
        )
        SELECT 
            v_pandit_id,
            ps.id,
            ps.base_price,
            ps.duration_minutes,
            true
        FROM public.puja_services ps
        WHERE ps.id = ANY(v_app.selected_puja_ids)
        ON CONFLICT (pandit_id, puja_service_id) DO NOTHING;
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
            'approved_at', now()
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
