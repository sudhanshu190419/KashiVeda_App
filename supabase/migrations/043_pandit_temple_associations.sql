-- =============================================================================
-- Migration: 043_pandit_temple_associations.sql
-- Description: Pandit-Temple Affiliations, Admin Review Lifecycle,
--              Temple-Filtered Customer Discovery, and Authoritative Validation.
-- Authoritative Schema: Kashi Veda Platform Booking & Temple Engine
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pandit-Temple Association Status Enum
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pandit_temple_association_status') THEN
        CREATE TYPE public.pandit_temple_association_status AS ENUM (
            'pending',
            'approved',
            'rejected'
        );
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Pandit Temples Association Table (Entity: pandit_profiles.id <-> temples.id)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pandit_temples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE CASCADE,
    temple_id UUID NOT NULL REFERENCES public.temples(id) ON DELETE CASCADE,
    status public.pandit_temple_association_status NOT NULL DEFAULT 'pending'::public.pandit_temple_association_status,
    is_active BOOLEAN NOT NULL DEFAULT true,
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pandit_temple_association UNIQUE (pandit_id, temple_id)
);

-- Trigger to maintain updated_at on pandit_temples
DROP TRIGGER IF EXISTS trg_pandit_temples_updated_at ON public.pandit_temples;
CREATE TRIGGER trg_pandit_temples_updated_at
    BEFORE UPDATE ON public.pandit_temples
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for discovery queries and admin queues
CREATE INDEX IF NOT EXISTS idx_pandit_temples_pandit_id ON public.pandit_temples(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_temples_temple_id ON public.pandit_temples(temple_id);
CREATE INDEX IF NOT EXISTS idx_pandit_temples_status ON public.pandit_temples(status);
CREATE INDEX IF NOT EXISTS idx_pandit_temples_lookup ON public.pandit_temples(temple_id, status, is_active);

-- -----------------------------------------------------------------------------
-- 3. Temple Addition Requests Table (Pandit Suggested Temples)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.temple_addition_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'Uttar Pradesh',
    status public.pandit_temple_association_status NOT NULL DEFAULT 'pending'::public.pandit_temple_association_status,
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_temple_id UUID REFERENCES public.temples(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on temple_addition_requests
DROP TRIGGER IF EXISTS trg_temple_addition_requests_updated_at ON public.temple_addition_requests;
CREATE TRIGGER trg_temple_addition_requests_updated_at
    BEFORE UPDATE ON public.temple_addition_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for temple request lookups
CREATE INDEX IF NOT EXISTS idx_temple_addition_requests_pandit_id ON public.temple_addition_requests(pandit_id);
CREATE INDEX IF NOT EXISTS idx_temple_addition_requests_status ON public.temple_addition_requests(status);

-- -----------------------------------------------------------------------------
-- 4. Extend pandit_applications table with selected_temple_ids
-- -----------------------------------------------------------------------------

ALTER TABLE public.pandit_applications 
ADD COLUMN IF NOT EXISTS selected_temple_ids UUID[] NOT NULL DEFAULT '{}';

-- -----------------------------------------------------------------------------
-- 5. Row Level Security & Permissions
-- -----------------------------------------------------------------------------

ALTER TABLE public.pandit_temples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temple_addition_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pandit_temples TO authenticated, service_role;
GRANT SELECT ON TABLE public.pandit_temples TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.temple_addition_requests TO authenticated, service_role;

-- 5.1 pandit_temples SELECT
-- Admins can view all. Pandits can view their own. Devotees/Anon can view approved active associations.
DROP POLICY IF EXISTS "pandit_temples_select" ON public.pandit_temples;
CREATE POLICY "pandit_temples_select"
    ON public.pandit_temples FOR SELECT
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.pandit_profiles pp
            WHERE pp.id = pandit_temples.pandit_id AND pp.user_id = auth.uid()
        )
        OR (status = 'approved'::public.pandit_temple_association_status AND is_active = true)
    );

-- 5.2 pandit_temples INSERT
-- Admins can insert any. Pandits can request association for their own profile (starts pending).
DROP POLICY IF EXISTS "pandit_temples_insert" ON public.pandit_temples;
CREATE POLICY "pandit_temples_insert"
    ON public.pandit_temples FOR INSERT
    WITH CHECK (
        public.is_admin()
        OR (
            status = 'pending'::public.pandit_temple_association_status
            AND is_active = true
            AND reviewed_by IS NULL
            AND reviewed_at IS NULL
            AND rejection_reason IS NULL
            AND EXISTS (
                SELECT 1 FROM public.pandit_profiles pp
                WHERE pp.id = pandit_temples.pandit_id AND pp.user_id = auth.uid()
            )
        )
    );

-- 5.3 pandit_temples UPDATE
-- Admins can update all. Pandits can resubmit rejected associations back to pending.
DROP POLICY IF EXISTS "pandit_temples_update" ON public.pandit_temples;
CREATE POLICY "pandit_temples_update"
    ON public.pandit_temples FOR UPDATE
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.pandit_profiles pp
            WHERE pp.id = pandit_temples.pandit_id AND pp.user_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_admin()
        OR (
            status = 'pending'::public.pandit_temple_association_status
            AND reviewed_by IS NULL
            AND reviewed_at IS NULL
            AND rejection_reason IS NULL
            AND EXISTS (
                SELECT 1 FROM public.pandit_profiles pp
                WHERE pp.id = pandit_temples.pandit_id AND pp.user_id = auth.uid()
            )
        )
    );

-- 5.4 pandit_temples DELETE
-- Admins can delete. Pandits can remove their own pending or rejected associations.
DROP POLICY IF EXISTS "pandit_temples_delete" ON public.pandit_temples;
CREATE POLICY "pandit_temples_delete"
    ON public.pandit_temples FOR DELETE
    USING (
        public.is_admin()
        OR (
            status IN ('pending'::public.pandit_temple_association_status, 'rejected'::public.pandit_temple_association_status)
            AND EXISTS (
                SELECT 1 FROM public.pandit_profiles pp
                WHERE pp.id = pandit_temples.pandit_id AND pp.user_id = auth.uid()
            )
        )
    );

-- 5.5 temple_addition_requests Policies
DROP POLICY IF EXISTS "temple_requests_select" ON public.temple_addition_requests;
CREATE POLICY "temple_requests_select"
    ON public.temple_addition_requests FOR SELECT
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.pandit_profiles pp
            WHERE pp.id = temple_addition_requests.pandit_id AND pp.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "temple_requests_insert" ON public.temple_addition_requests;
CREATE POLICY "temple_requests_insert"
    ON public.temple_addition_requests FOR INSERT
    WITH CHECK (
        public.is_admin()
        OR (
            status = 'pending'::public.pandit_temple_association_status
            AND reviewed_by IS NULL
            AND reviewed_at IS NULL
            AND rejection_reason IS NULL
            AND EXISTS (
                SELECT 1 FROM public.pandit_profiles pp
                WHERE pp.id = temple_addition_requests.pandit_id AND pp.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "temple_requests_update" ON public.temple_addition_requests;
CREATE POLICY "temple_requests_update"
    ON public.temple_addition_requests FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. Administrative Review RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_review_pandit_temple(
    p_association_id UUID,
    p_status TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_assoc RECORD;
    v_caller_id UUID;
BEGIN
    -- 1. Administrator Authorization Check
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required.';
    END IF;

    v_caller_id := auth.uid();

    IF p_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid review status. Must be "approved" or "rejected".';
    END IF;

    IF p_status = 'rejected' AND (p_rejection_reason IS NULL OR trim(p_rejection_reason) = '') THEN
        RAISE EXCEPTION 'Rejection reason is mandatory when rejecting a temple association.';
    END IF;

    -- 2. Fetch and Lock Association Record
    SELECT * INTO v_assoc
    FROM public.pandit_temples
    WHERE id = p_association_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit temple association not found with id: %', p_association_id;
    END IF;

    -- 3. Update Record
    UPDATE public.pandit_temples
    SET status = p_status::public.pandit_temple_association_status,
        rejection_reason = CASE WHEN p_status = 'rejected' THEN trim(p_rejection_reason) ELSE NULL END,
        reviewed_by = v_caller_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_association_id;

    -- 4. Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        after_json
    ) VALUES (
        v_caller_id,
        'pandit_temple_reviewed',
        'pandit_temples',
        p_association_id,
        jsonb_build_object(
            'pandit_id', v_assoc.pandit_id,
            'temple_id', v_assoc.temple_id,
            'status', p_status,
            'rejection_reason', p_rejection_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'association_id', p_association_id,
        'status', p_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_temple_request(
    p_request_id UUID,
    p_action TEXT,
    p_rejection_reason TEXT DEFAULT NULL,
    p_latitude NUMERIC DEFAULT NULL,
    p_longitude NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_req RECORD;
    v_caller_id UUID;
    v_created_temple_id UUID;
BEGIN
    -- 1. Administrator Authorization Check
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required.';
    END IF;

    v_caller_id := auth.uid();

    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid review action. Must be "approve" or "reject".';
    END IF;

    SELECT * INTO v_req
    FROM public.temple_addition_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Temple addition request not found with id: %', p_request_id;
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Only pending temple addition requests can be reviewed (current status: %).', v_req.status;
    END IF;

    IF p_action = 'approve' THEN
        -- Create the temple in the master temples catalog
        INSERT INTO public.temples (
            name,
            address,
            city,
            state,
            latitude,
            longitude,
            is_active
        ) VALUES (
            v_req.name,
            v_req.address,
            v_req.city,
            v_req.state,
            p_latitude,
            p_longitude,
            true
        ) RETURNING id INTO v_created_temple_id;

        -- Create and approve the Pandit's association with this newly approved temple
        INSERT INTO public.pandit_temples (
            pandit_id,
            temple_id,
            status,
            is_active,
            reviewed_by,
            reviewed_at
        ) VALUES (
            v_req.pandit_id,
            v_created_temple_id,
            'approved'::public.pandit_temple_association_status,
            true,
            v_caller_id,
            now()
        )
        ON CONFLICT (pandit_id, temple_id) DO UPDATE SET
            status = 'approved'::public.pandit_temple_association_status,
            is_active = true,
            reviewed_by = v_caller_id,
            reviewed_at = now(),
            rejection_reason = NULL;

        -- Update request
        UPDATE public.temple_addition_requests
        SET status = 'approved'::public.pandit_temple_association_status,
            created_temple_id = v_created_temple_id,
            reviewed_by = v_caller_id,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = p_request_id;

    ELSE
        IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
            RAISE EXCEPTION 'Rejection reason is required when rejecting a temple addition request.';
        END IF;

        UPDATE public.temple_addition_requests
        SET status = 'rejected'::public.pandit_temple_association_status,
            rejection_reason = trim(p_rejection_reason),
            reviewed_by = v_caller_id,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = p_request_id;
    END IF;

    -- Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        after_json
    ) VALUES (
        v_caller_id,
        'temple_addition_request_reviewed',
        'temple_addition_requests',
        p_request_id,
        jsonb_build_object(
            'pandit_id', v_req.pandit_id,
            'temple_name', v_req.name,
            'action', p_action,
            'created_temple_id', v_created_temple_id,
            'rejection_reason', p_rejection_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'action', p_action,
        'created_temple_id', v_created_temple_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_pandit_temple(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_temple_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Update get_customer_pandits RPC with p_temple_id Filtering
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_customer_pandits(public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_customer_pandits(public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER, UUID);

CREATE OR REPLACE FUNCTION public.get_customer_pandits(
    p_service_mode public.service_mode DEFAULT NULL,
    p_latitude NUMERIC DEFAULT NULL,
    p_longitude NUMERIC DEFAULT NULL,
    p_puja_service_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0,
    p_temple_id UUID DEFAULT NULL
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

    -- 4. Return Filtered Pandit Directory with Temple & Mode Filtering
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
                  WHEN 'home' THEN pps_target.home_price IS NOT NULL AND pps_target.home_price > 0
                  WHEN 'temple' THEN pps_target.temple_price IS NOT NULL AND pps_target.temple_price > 0
                  WHEN 'remote' THEN pps_target.remote_price IS NOT NULL AND pps_target.remote_price > 0
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
      -- Temple association filtering for Temple service mode
      AND (
          p_service_mode IS NULL
          OR p_service_mode != 'temple'
          OR p_temple_id IS NULL
          OR EXISTS (
              SELECT 1
              FROM public.pandit_temples pt
              JOIN public.temples t ON t.id = pt.temple_id
              WHERE pt.pandit_id = pp.id
                AND pt.temple_id = p_temple_id
                AND pt.status = 'approved'::public.pandit_temple_association_status
                AND pt.is_active = true
                AND t.is_active = true
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

GRANT EXECUTE ON FUNCTION public.get_customer_pandits(public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER, UUID) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Update Authoritative create_or_validate_booking RPC
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

        -- Authoritative Temple-Pandit Association Check
        IF NOT EXISTS (
            SELECT 1 
            FROM public.pandit_temples pt
            WHERE pt.pandit_id = p_pandit_id
              AND pt.temple_id = p_temple_id
              AND pt.status = 'approved'::public.pandit_temple_association_status
              AND pt.is_active = true
        ) THEN
            RAISE EXCEPTION 'Selected Pandit is not authorized to perform rituals at the selected Temple.';
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
    IF p_service_mode = 'remote' THEN
        -- Remote Puja strictly prohibits any Samagri package or custom items
        IF p_samagri_package_id IS NOT NULL OR (p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0) THEN
            RAISE EXCEPTION 'Samagri selections are not permitted for Remote Puja bookings.';
        END IF;
    ELSIF p_samagri_package_id IS NOT NULL THEN
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
    IF p_service_mode = 'remote' THEN
        -- Remote Puja strictly prohibits Prasad selections
        IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
            RAISE EXCEPTION 'Prasad selections are not permitted for Remote Puja bookings.';
        END IF;
    ELSIF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
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

    -- 11. Authoritative Financial Policy Calculation (Canonical booking_policy_settings)
    SELECT * INTO v_policy
    FROM public.booking_policy_settings
    WHERE id = 1;

    IF p_service_mode = 'home' THEN
        v_advance_percent := COALESCE(v_policy.home_advance_percent, 10.00);
    ELSIF p_service_mode = 'remote' THEN
        v_advance_percent := COALESCE(v_policy.remote_advance_percent, 50.00);
    ELSIF p_service_mode = 'temple' THEN
        v_advance_percent := COALESCE(v_policy.temple_advance_percent, 10.00);
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
            address_snapshot,
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
            v_temple.address,
            v_temple.city,
            v_temple.state,
            NULL,
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

    -- 14. Create Historical Line Items Snapshots
    -- 14.1 Ritual fee
    INSERT INTO public.booking_line_items (
        booking_id,
        item_type,
        name_snapshot,
        unit_price,
        total_price,
        is_refundable
    ) VALUES (
        v_booking_id,
        'puja'::public.line_item_type,
        v_puja.name || ' (' || p_service_mode || ')',
        v_puja_price,
        v_puja_price,
        true
    );

    -- 14.2 Predefined Samagri Package Breakdown
    IF p_samagri_package_id IS NOT NULL AND p_service_mode != 'remote' THEN
        FOR v_samagri_item IN
            SELECT 
                si.id AS item_id,
                si.name,
                si.unit,
                si.unit_price,
                spi.quantity,
                ROUND(spi.quantity * si.unit_price, 2) AS line_total
            FROM public.samagri_package_items spi
            JOIN public.samagri_items si ON si.id = spi.samagri_item_id
            WHERE spi.samagri_package_id = p_samagri_package_id AND si.is_active = true
        LOOP
            INSERT INTO public.booking_line_items (
                booking_id,
                item_type,
                samagri_item_id,
                samagri_package_id,
                name_snapshot,
                unit,
                quantity,
                unit_price,
                total_price,
                is_refundable
            ) VALUES (
                v_booking_id,
                'samagri_item'::public.line_item_type,
                v_samagri_item.item_id,
                p_samagri_package_id,
                v_samagri_item.name,
                v_samagri_item.unit,
                v_samagri_item.quantity,
                v_samagri_item.unit_price,
                v_samagri_item.line_total,
                false
            );
        END LOOP;
    END IF;

    -- 14.3 Custom Individual Samagri Items Breakdown
    IF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 AND p_service_mode != 'remote' THEN
        FOR v_idx IN 1..array_length(p_custom_samagri_item_ids, 1) LOOP
            SELECT * INTO v_samagri_item
            FROM public.samagri_items
            WHERE id = p_custom_samagri_item_ids[v_idx];

            v_item_qty := p_custom_samagri_quantities[v_idx];
            v_item_total := ROUND(v_item_qty * v_samagri_item.unit_price, 2);

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
                'samagri_item'::public.line_item_type,
                v_samagri_item.id,
                v_samagri_item.name,
                v_samagri_item.unit,
                v_item_qty,
                v_samagri_item.unit_price,
                v_item_total,
                false
            );
        END LOOP;
    END IF;

    -- 14.4 Prasad Items Breakdown
    IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 AND p_service_mode != 'remote' THEN
        FOR v_idx IN 1..array_length(p_prasad_item_ids, 1) LOOP
            SELECT * INTO v_prasad_item
            FROM public.prasad_items
            WHERE id = p_prasad_item_ids[v_idx];

            v_item_qty := p_prasad_quantities[v_idx];
            v_item_price := v_prasad_item.unit_price;
            v_item_total := ROUND(v_item_qty * v_item_price, 2);

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
                v_prasad_item.unit,
                v_item_qty,
                v_item_price,
                v_item_total,
                false
            );
        END LOOP;
    END IF;

    -- 15. Create Initial Payment Order Record
    INSERT INTO public.payment_orders (
        booking_id,
        customer_id,
        amount,
        currency,
        order_type,
        status,
        expires_at
    ) VALUES (
        v_booking_id,
        v_customer_id,
        v_advance_amount,
        'INR',
        'advance'::public.payment_order_type,
        'created'::public.payment_order_status,
        now() + interval '30 minutes'
    ) RETURNING id INTO v_payment_order_id;

    RETURN jsonb_build_object(
        'booking_id', v_booking_id,
        'booking_number', v_booking_number,
        'payment_order_id', v_payment_order_id,
        'advance_amount', v_advance_amount,
        'balance_amount', v_balance_amount,
        'total_amount', v_total_amount,
        'currency', 'INR',
        'scheduled_start_at', p_scheduled_start_at,
        'scheduled_end_at', v_scheduled_end_at,
        'expires_at', (now() + interval '30 minutes')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_or_validate_booking(UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_or_validate_booking(UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. Update approve_pandit_application RPC to convert onboarding temple selections
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
    v_temple_id UUID;
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

    -- 11. Convert Onboarding Temple Selections to Pending Pandit-Temple Association Requests
    -- (Does not auto-approve associations; leaves them in pending state for dedicated review)
    IF v_app.selected_temple_ids IS NOT NULL AND array_length(v_app.selected_temple_ids, 1) > 0 THEN
        FOREACH v_temple_id IN ARRAY v_app.selected_temple_ids
        LOOP
            -- Verify temple exists before creating association request
            IF EXISTS (SELECT 1 FROM public.temples WHERE id = v_temple_id AND is_active = true) THEN
                INSERT INTO public.pandit_temples (
                    pandit_id,
                    temple_id,
                    status,
                    is_active
                ) VALUES (
                    v_pandit_id,
                    v_temple_id,
                    'pending'::public.pandit_temple_association_status,
                    true
                )
                ON CONFLICT (pandit_id, temple_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- 12. Write audit log
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
            'temples_requested_count', COALESCE(array_length(v_app.selected_temple_ids, 1), 0),
            'kundli_enabled', v_app.kundli_enabled,
            'kundli_price', v_app.kundli_price
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'pandit_id', v_pandit_id,
        'status', 'approved'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_pandit_application(UUID) TO authenticated, service_role;
