-- =============================================================================
-- Migration 055: Decouple Plan Deactivation From Existing Subscriber Entitlements
-- AST-Q02: Approved Option A — Deactivation Affects New Sales Only
-- Security Hardened: Single-argument caller-bound is_customer_subscribed_to_plan
--
-- Objective:
-- Setting `astrology_subscription_plans.is_active = false` prevents new customers
-- from purchasing that plan (catalog exclusion & order creation rejection),
-- but DOES NOT revoke Daily Vedic Horoscope access from customers who already
-- hold a valid, paid, unexpired subscription to it during their purchased interval.
--
-- Authoritative State Preserved:
-- 1. Authentication and caller identity isolation (`auth.uid()`).
-- 2. Subscription ownership (`s.customer_id = auth.uid()`).
-- 3. Subscription status (`s.status = 'active'`).
-- 4. Purchased interval boundaries (`s.starts_at <= now()` AND `s.ends_at > now()`).
-- 5. Purchased feature capability (`p.daily_in_app_enabled = true`).
-- 6. Content status (`status = 'published'`).
-- 7. Calendar date semantics (`insight_date <= ((now() AT TIME ZONE 'Asia/Kolkata')::DATE)`).
-- 8. Admin full bypass (`public.is_admin()`).
--
-- Catalog & Financial Protections Retained:
-- - Inactive plans remain hidden from the customer catalog (`astrology_subscription_plans_select_public`).
-- - New order creation for inactive plans is rejected (`create_astrology_subscription_order`).
-- - AST-P01 duration snapshots and AST-P02 reconciliation flows remain unchanged.
-- - Automated cron delivery dispatch (`cron_astrology_delivery_dispatch`) remains unchanged and aligned.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Security Definer Helper: is_customer_subscribed_to_plan
-- Safely determines whether the authenticated customer holds a subscription to a plan.
-- Caller identity is strictly bound to auth.uid() inside the function body to prevent
-- caller-identity spoofing or subscription probing across users.
-- search_path is locked to '' with fully qualified identifiers (AST-16 standard).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "astrology_subscription_plans_select_public" ON public.astrology_subscription_plans;
DROP FUNCTION IF EXISTS public.is_customer_subscribed_to_plan(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_customer_subscribed_to_plan(UUID);

CREATE OR REPLACE FUNCTION public.is_customer_subscribed_to_plan(
    p_plan_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE 
        WHEN auth.uid() IS NULL THEN false
        ELSE EXISTS (
            SELECT 1 
            FROM public.astrology_subscriptions s
            WHERE s.plan_id = p_plan_id
              AND s.customer_id = auth.uid()
        )
    END;
$$;

COMMENT ON FUNCTION public.is_customer_subscribed_to_plan(UUID) IS
    'AST-Q02 Security-Hardened: Determines whether the authenticated caller (auth.uid()) is subscribed to p_plan_id. Derives caller identity strictly from auth.uid() to prevent user probing.';

REVOKE ALL ON FUNCTION public.is_customer_subscribed_to_plan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_customer_subscribed_to_plan(UUID) TO authenticated, anon;


-- -----------------------------------------------------------------------------
-- 2. Update Public / Customer Plan SELECT Policy on public.astrology_subscription_plans
-- Ensures inactive plans remain invisible to prospective buyers, but visible to
-- users who already hold an existing subscription to that plan.
-- -----------------------------------------------------------------------------
CREATE POLICY "astrology_subscription_plans_select_public"
    ON public.astrology_subscription_plans FOR SELECT
    USING (
        is_active = true
        OR public.is_admin()
        OR (
            auth.uid() IS NOT NULL
            AND public.is_customer_subscribed_to_plan(id)
        )
    );

COMMENT ON POLICY "astrology_subscription_plans_select_public" ON public.astrology_subscription_plans IS
    'AST-Q02: Public catalog displays active plans; subscribers can also read plans they have purchased.';


-- -----------------------------------------------------------------------------
-- 3. Update Customer SELECT Policy on public.daily_rashi_insights
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "daily_rashi_insights_select_customer" ON public.daily_rashi_insights;

CREATE POLICY "daily_rashi_insights_select_customer"
    ON public.daily_rashi_insights FOR SELECT
    USING (
        status = 'published'::public.astrology_content_status
        AND insight_date <= ((now() AT TIME ZONE 'Asia/Kolkata')::DATE)
        AND (
            public.is_admin()
            OR EXISTS (
                SELECT 1
                FROM public.astrology_subscriptions s
                JOIN public.astrology_subscription_plans p ON p.id = s.plan_id
                WHERE s.customer_id = auth.uid()
                  AND s.status = 'active'::public.astrology_subscription_status
                  AND s.starts_at <= now()
                  AND s.ends_at > now()
                  AND p.daily_in_app_enabled = true
                  -- AST-Q02 Option A: p.is_active is deliberately omitted here.
                  -- Existing subscribers with valid paid intervals retain reading rights.
            )
        )
    );

COMMENT ON POLICY "daily_rashi_insights_select_customer" ON public.daily_rashi_insights IS
    'AST-Q02: Allows access to published daily insights for admins and customers holding an active, unexpired subscription with daily_in_app_enabled=true, regardless of whether the plan is active for new catalog sales.';


-- -----------------------------------------------------------------------------
-- 4. Update Authoritative RPC: public.get_daily_rashi_insight
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_rashi_insight(
    p_insight_date DATE,
    p_rashi_id SMALLINT,
    p_language VARCHAR(5) DEFAULT 'en'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN := false;
    v_is_entitled BOOLEAN := false;
    v_today_ist DATE;
    v_insight RECORD;
    v_active_sub RECORD;
BEGIN
    v_caller_id := auth.uid();
    v_today_ist := ((now() AT TIME ZONE 'Asia/Kolkata')::DATE);

    -- Validate input parameters
    IF p_insight_date IS NULL THEN
        p_insight_date := v_today_ist;
    END IF;

    IF p_rashi_id IS NULL OR p_rashi_id < 1 OR p_rashi_id > 12 THEN
        RAISE EXCEPTION 'Invalid Rashi ID. Must be between 1 and 12.';
    END IF;

    IF p_language IS NULL OR TRIM(p_language) = '' THEN
        p_language := 'en';
    END IF;

    -- Check Administrator status
    IF v_caller_id IS NOT NULL AND public.is_admin(v_caller_id) THEN
        v_is_admin := true;
        v_is_entitled := true;
    END IF;

    -- If not admin, check customer subscription entitlement
    -- AST-Q02 Option A: Check active status, valid interval, ownership, and feature flag.
    -- p.is_active = true is omitted so that deactivating a plan affects only new catalog purchases.
    IF NOT v_is_admin AND v_caller_id IS NOT NULL THEN
        SELECT s.id, s.starts_at, s.ends_at, p.name AS plan_name, p.daily_in_app_enabled
        INTO v_active_sub
        FROM public.astrology_subscriptions s
        JOIN public.astrology_subscription_plans p ON p.id = s.plan_id
        WHERE s.customer_id = v_caller_id
          AND s.status = 'active'::public.astrology_subscription_status
          AND s.starts_at <= now()
          AND s.ends_at > now()
          AND p.daily_in_app_enabled = true
        ORDER BY s.ends_at DESC
        LIMIT 1;

        IF v_active_sub.id IS NOT NULL THEN
            v_is_entitled := true;
        END IF;
    END IF;

    -- Prevent customers from querying future dates
    IF NOT v_is_admin AND p_insight_date > v_today_ist THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_entitled', v_is_entitled,
            'error', 'Future insights are not available.'
        );
    END IF;

    -- If customer is not entitled, return subscription requirement indicator
    IF NOT v_is_entitled THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_entitled', false,
            'error', 'An active Vedic Astrology subscription is required to access Daily Insights.',
            'insight_date', p_insight_date,
            'rashi_id', p_rashi_id
        );
    END IF;

    -- Fetch the published insight
    SELECT 
        id,
        insight_date,
        rashi_id,
        rashi_name,
        language,
        general_outlook,
        career_business,
        finance_wealth,
        love_relationships,
        health_wellbeing,
        auspicious_color,
        auspicious_number,
        status,
        published_at,
        created_at,
        updated_at
    INTO v_insight
    FROM public.daily_rashi_insights
    WHERE insight_date = p_insight_date
      AND rashi_id = p_rashi_id
      AND language = p_language
      AND (status = 'published'::public.astrology_content_status OR v_is_admin);

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_entitled', true,
            'content', NULL,
            'insight_date', p_insight_date,
            'rashi_id', p_rashi_id,
            'language', p_language,
            'message', 'No published daily insight found for the requested date and Rashi.'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_entitled', true,
        'content', to_jsonb(v_insight)
    );
END;
$$;

COMMENT ON FUNCTION public.get_daily_rashi_insight IS 
    'Authoritative client query: enforces subscription entitlement before returning daily Rashi guidance. Under AST-Q02 Option A, existing subscribers with active paid intervals remain entitled even if the underlying plan has been deactivated for new catalog sales.';

GRANT EXECUTE ON FUNCTION public.get_daily_rashi_insight TO authenticated, anon;
