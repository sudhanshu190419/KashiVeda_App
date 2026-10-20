-- =============================================================================
-- Migration: 044_pandit_customer_reviews.sql
-- Description: Authoritative Pandit review submission, retrieval, and admin moderation
--              Hardens review insertion, enforces booking-to-pandit validation,
--              prevents client-side spoofing, and restricts direct mutations.
-- Source of Truth: Kashi Veda Pandit Review and Rating Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Authoritative Review Submission RPC: submit_booking_review
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_booking_review(
    p_booking_id UUID,
    p_rating SMALLINT,
    p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_cleaned_comment TEXT;
    v_existing_review_id UUID;
    v_review_id UUID;
BEGIN
    -- 1. Verify authenticated caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit a ritual review.';
    END IF;

    -- 2. Validate rating parameter (1 to 5 stars)
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Rating must be an integer between 1 and 5 (received: %).', p_rating;
    END IF;

    -- 3. Clean and validate comment parameter
    v_cleaned_comment := NULLIF(TRIM(p_comment), '');
    IF v_cleaned_comment IS NOT NULL AND char_length(v_cleaned_comment) > 1000 THEN
        RAISE EXCEPTION 'Review comment exceeds maximum allowed length of 1000 characters.';
    END IF;

    -- 4. Fetch and lock booking record to verify ownership and completed status
    SELECT b.id, b.customer_id, b.pandit_id, b.status, b.service_mode, b.booking_number
    INTO v_booking
    FROM public.bookings b
    WHERE b.id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- 5. Invariant: Caller must be the customer who booked the ritual
    IF v_booking.customer_id != v_caller_id THEN
        RAISE EXCEPTION 'Access denied: You can only review your own bookings.';
    END IF;

    -- 6. Invariant: Booking must be in completed state
    IF v_booking.status != 'completed'::public.booking_status THEN
        RAISE EXCEPTION 'Only completed rituals can be reviewed (current booking status: %).', v_booking.status;
    END IF;

    -- 7. Invariant: Pandit must be assigned to the booking
    IF v_booking.pandit_id IS NULL THEN
        RAISE EXCEPTION 'Booking % does not have an assigned Pandit.', p_booking_id;
    END IF;

    -- 8. Invariant: Prevent duplicate reviews for the same booking
    SELECT id INTO v_existing_review_id
    FROM public.reviews
    WHERE booking_id = p_booking_id;

    IF v_existing_review_id IS NOT NULL THEN
        RAISE EXCEPTION 'This booking has already been reviewed.';
    END IF;

    -- 9. Insert authoritative review deriving pandit_id and customer_id from authoritative booking
    INSERT INTO public.reviews (
        booking_id,
        customer_id,
        pandit_id,
        rating,
        comment,
        visibility_status,
        created_at
    ) VALUES (
        v_booking.id,
        v_caller_id,
        v_booking.pandit_id,
        p_rating,
        v_cleaned_comment,
        'published'::public.review_visibility_status,
        now()
    ) RETURNING id INTO v_review_id;

    -- 10. Return success response
    RETURN jsonb_build_object(
        'success', true,
        'review_id', v_review_id,
        'booking_id', v_booking.id,
        'pandit_id', v_booking.pandit_id,
        'rating', p_rating,
        'comment', v_cleaned_comment,
        'visibility_status', 'published',
        'created_at', now()
    );
END;
$$;

COMMENT ON FUNCTION public.submit_booking_review(UUID, SMALLINT, TEXT) IS
'Authoritative RPC for customers to submit a verified 1-5 star review for their own completed booking.';

REVOKE ALL ON FUNCTION public.submit_booking_review(UUID, SMALLINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_booking_review(UUID, SMALLINT, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. Secure Booking Review Retrieval RPC: get_booking_review
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_booking_review(
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_review RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- 1. Fetch booking
    SELECT b.id, b.customer_id, b.pandit_id, pp.user_id AS pandit_user_id
    INTO v_booking
    FROM public.bookings b
    LEFT JOIN public.pandit_profiles pp ON pp.id = b.pandit_id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- 2. Invariant: Only the booking customer, assigned pandit, or admin may query
    IF v_booking.customer_id != v_caller_id 
       AND v_booking.pandit_user_id != v_caller_id 
       AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied.';
    END IF;

    -- 3. Fetch review
    SELECT r.id, r.rating, r.comment, r.visibility_status, r.created_at, r.pandit_id
    INTO v_review
    FROM public.reviews r
    WHERE r.booking_id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'has_reviewed', false,
            'review', NULL
        );
    END IF;

    RETURN jsonb_build_object(
        'has_reviewed', true,
        'review', jsonb_build_object(
            'id', v_review.id,
            'rating', v_review.rating,
            'comment', v_review.comment,
            'visibility_status', v_review.visibility_status,
            'created_at', v_review.created_at,
            'pandit_id', v_review.pandit_id
        )
    );
END;
$$;

COMMENT ON FUNCTION public.get_booking_review(UUID) IS
'Authoritative RPC for booking owner, assigned priest, or admin to check if a booking has a review.';

REVOKE ALL ON FUNCTION public.get_booking_review(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_review(UUID) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3. Safe Public Pandit Reviews RPC: get_public_pandit_reviews
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_pandit_reviews(
    p_pandit_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    rating SMALLINT,
    comment TEXT,
    created_at TIMESTAMPTZ,
    reviewer_label TEXT,
    service_mode public.service_mode,
    puja_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        'Verified Devotee' AS reviewer_label,
        b.service_mode,
        ps.name AS puja_name
    FROM public.reviews r
    JOIN public.bookings b ON b.id = r.booking_id
    LEFT JOIN public.puja_services ps ON ps.id = b.puja_service_id
    WHERE r.pandit_id = p_pandit_id
      AND r.visibility_status = 'published'::public.review_visibility_status
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    OFFSET GREATEST(p_offset, 0);
$$;

COMMENT ON FUNCTION public.get_public_pandit_reviews(UUID, INTEGER, INTEGER) IS
'Safe public RPC to fetch published reviews for a Pandit with ritual service mode and verified devotee label without exposing private customer data.';

GRANT EXECUTE ON FUNCTION public.get_public_pandit_reviews(UUID, INTEGER, INTEGER) TO anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 4. Admin Review Moderation RPC: admin_moderate_review
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_moderate_review(
    p_review_id UUID,
    p_visibility_status public.review_visibility_status,
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
    v_review RECORD;
    v_cleaned_reason TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Administrator privileges required.';
    END IF;

    v_cleaned_reason := NULLIF(TRIM(p_reason), '');
    IF v_cleaned_reason IS NULL OR char_length(v_cleaned_reason) < 3 THEN
        RAISE EXCEPTION 'A valid moderation reason is required (minimum 3 characters).';
    END IF;

    -- Fetch review
    SELECT * INTO v_review
    FROM public.reviews
    WHERE id = p_review_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Review % not found.', p_review_id;
    END IF;

    -- Update visibility status only (rating and comment are immutable)
    UPDATE public.reviews
    SET visibility_status = p_visibility_status
    WHERE id = p_review_id;

    -- Record audit log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_caller_id,
        'review_moderated',
        'reviews',
        p_review_id::text,
        jsonb_build_object(
            'visibility_status', v_review.visibility_status,
            'rating', v_review.rating
        ),
        jsonb_build_object(
            'visibility_status', p_visibility_status,
            'reason', v_cleaned_reason
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'review_id', p_review_id,
        'visibility_status', p_visibility_status,
        'reason', v_cleaned_reason
    );
END;
$$;

COMMENT ON FUNCTION public.admin_moderate_review(UUID, public.review_visibility_status, TEXT) IS
'Authoritative RPC for administrators to hide or restore a review with immutable audit logging.';

REVOKE ALL ON FUNCTION public.admin_moderate_review(UUID, public.review_visibility_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_review(UUID, public.review_visibility_status, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5. Admin Review Listing RPC: admin_list_reviews
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_reviews(
    p_visibility_status public.review_visibility_status DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    booking_id UUID,
    booking_number TEXT,
    customer_id UUID,
    customer_name TEXT,
    customer_email TEXT,
    pandit_id UUID,
    pandit_name TEXT,
    puja_name TEXT,
    service_mode public.service_mode,
    rating SMALLINT,
    comment TEXT,
    visibility_status public.review_visibility_status,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Administrator privileges required.';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.booking_id,
        b.booking_number,
        r.customer_id,
        COALESCE(c_pr.display_name, 'Devotee') AS customer_name,
        c_pr.email::text AS customer_email,
        r.pandit_id,
        COALESCE(p_pr.display_name, 'Vedic Acharya') AS pandit_name,
        ps.name AS puja_name,
        b.service_mode,
        r.rating,
        r.comment,
        r.visibility_status,
        r.created_at
    FROM public.reviews r
    JOIN public.bookings b ON b.id = r.booking_id
    LEFT JOIN public.puja_services ps ON ps.id = b.puja_service_id
    LEFT JOIN public.profiles c_pr ON c_pr.id = r.customer_id
    LEFT JOIN public.pandit_profiles pp ON pp.id = r.pandit_id
    LEFT JOIN public.profiles p_pr ON p_pr.id = pp.user_id
    WHERE (p_visibility_status IS NULL OR r.visibility_status = p_visibility_status)
    ORDER BY r.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

COMMENT ON FUNCTION public.admin_list_reviews(public.review_visibility_status, INTEGER, INTEGER) IS
'Authoritative RPC for administrators to query reviews with joined booking, devotee, and pandit context.';

REVOKE ALL ON FUNCTION public.admin_list_reviews(public.review_visibility_status, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_reviews(public.review_visibility_status, INTEGER, INTEGER) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 6. Tighten Direct RLS & Grants on public.reviews
-- -----------------------------------------------------------------------------

-- Direct mutations on public.reviews are revoked from authenticated users.
-- Submissions must use public.submit_booking_review RPC.
-- Moderations must use public.admin_moderate_review RPC.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.reviews FROM authenticated, anon;
GRANT SELECT ON TABLE public.reviews TO authenticated, anon;

-- Recreate RLS policies to disallow direct unvalidated client mutations
DROP POLICY IF EXISTS "reviews_insert_customer" ON public.reviews;
DROP POLICY IF EXISTS "reviews_update_customer" ON public.reviews;
DROP POLICY IF EXISTS "reviews_delete_customer" ON public.reviews;
DROP POLICY IF EXISTS "reviews_all_admin" ON public.reviews;

-- Read policies remain active
DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
CREATE POLICY "reviews_select_public"
    ON public.reviews FOR SELECT
    USING (visibility_status = 'published'::public.review_visibility_status);

DROP POLICY IF EXISTS "reviews_select_own_customer" ON public.reviews;
CREATE POLICY "reviews_select_own_customer"
    ON public.reviews FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "reviews_select_own_pandit" ON public.reviews;
CREATE POLICY "reviews_select_own_pandit"
    ON public.reviews FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "reviews_select_admin" ON public.reviews;
CREATE POLICY "reviews_select_admin"
    ON public.reviews FOR SELECT
    USING (public.is_admin());
