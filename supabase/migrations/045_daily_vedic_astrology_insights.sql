-- =============================================================================
-- Migration: 045_daily_vedic_astrology_insights.sql
-- Description: Dedicated 12-Rashi Daily Vedic Astrological Insights data model,
--              optional customer Janma Rashi preference on profiles, authoritative
--              paid subscription entitlement enforcement, and admin curation RPCs.
-- Source of Truth: Kashi Veda Phase 2A Architecture & M20 Daily Insights Specification
-- =============================================================================

-- =============================================================================
-- 1. Optional Customer Preferred Rashi on public.profiles
-- =============================================================================

ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS preferred_rashi_id SMALLINT 
    CHECK (preferred_rashi_id IS NULL OR (preferred_rashi_id BETWEEN 1 AND 12));

COMMENT ON COLUMN public.profiles.preferred_rashi_id IS 
    'Customer-selected preferred Vedic Rashi identifier (1=Mesha to 12=Meena) for personalized Daily Insights.';


-- =============================================================================
-- 2. Dedicated Table: public.daily_rashi_insights
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.daily_rashi_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_date DATE NOT NULL,
    rashi_id SMALLINT NOT NULL CHECK (rashi_id BETWEEN 1 AND 12),
    rashi_name TEXT NOT NULL,
    language VARCHAR(5) NOT NULL DEFAULT 'en',
    
    -- Structured Sectional Insights
    general_outlook TEXT NOT NULL,
    career_business TEXT,
    finance_wealth TEXT,
    love_relationships TEXT,
    health_wellbeing TEXT,
    auspicious_color TEXT,
    auspicious_number INTEGER,
    
    -- Publication Lifecycle & Attribution
    status public.astrology_content_status NOT NULL DEFAULT 'draft'::public.astrology_content_status,
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Integrity: Exactly one record per (date, rashi, language)
    CONSTRAINT uq_daily_rashi_insights_date_rashi_lang UNIQUE (insight_date, rashi_id, language)
);

-- Trigger to maintain updated_at on daily_rashi_insights
DROP TRIGGER IF EXISTS trg_daily_rashi_insights_updated_at ON public.daily_rashi_insights;
CREATE TRIGGER trg_daily_rashi_insights_updated_at
    BEFORE UPDATE ON public.daily_rashi_insights
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_daily_rashi_insights_lookup 
    ON public.daily_rashi_insights (insight_date, rashi_id, language, status);

CREATE INDEX IF NOT EXISTS idx_daily_rashi_insights_admin 
    ON public.daily_rashi_insights (insight_date DESC, status);


-- =============================================================================
-- 3. Row-Level Security (RLS) Configuration
-- =============================================================================

ALTER TABLE public.daily_rashi_insights ENABLE ROW LEVEL SECURITY;

-- 3.1 Customer Read Policy: Requires published status, applicable date (IST), and active eligible subscription
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
                  AND p.is_active = true
            )
        )
    );

-- 3.2 Admin Full Access Policy
DROP POLICY IF EXISTS "daily_rashi_insights_all_admin" ON public.daily_rashi_insights;
CREATE POLICY "daily_rashi_insights_all_admin"
    ON public.daily_rashi_insights FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- =============================================================================
-- 4. Authoritative RPC: get_daily_rashi_insight
-- Securely retrieves the daily insight with server-side subscription validation.
-- =============================================================================

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
          AND p.is_active = true
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
    'Authoritative client query: enforces subscription entitlement before returning daily Rashi guidance.';


-- =============================================================================
-- 5. Authoritative RPC: set_customer_preferred_rashi
-- Persists customer preferred Rashi preference to public.profiles.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_customer_preferred_rashi(
    p_rashi_id SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to set Rashi preference.';
    END IF;

    IF p_rashi_id IS NOT NULL AND (p_rashi_id < 1 OR p_rashi_id > 12) THEN
        RAISE EXCEPTION 'Invalid Rashi ID. Must be between 1 and 12, or NULL to reset.';
    END IF;

    UPDATE public.profiles
    SET preferred_rashi_id = p_rashi_id,
        updated_at = now()
    WHERE id = v_customer_id;

    RETURN jsonb_build_object(
        'success', true,
        'preferred_rashi_id', p_rashi_id
    );
END;
$$;


-- =============================================================================
-- 6. Authoritative Admin RPC: admin_save_daily_rashi_insight
-- Handles draft creation, editing, and publication with audit logging.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_save_daily_rashi_insight(
    p_insight_date DATE,
    p_rashi_id SMALLINT,
    p_rashi_name TEXT,
    p_language VARCHAR(5),
    p_general_outlook TEXT,
    p_career_business TEXT DEFAULT NULL,
    p_finance_wealth TEXT DEFAULT NULL,
    p_love_relationships TEXT DEFAULT NULL,
    p_health_wellbeing TEXT DEFAULT NULL,
    p_auspicious_color TEXT DEFAULT NULL,
    p_auspicious_number INTEGER DEFAULT NULL,
    p_status public.astrology_content_status DEFAULT 'draft'::public.astrology_content_status
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_existing_id UUID;
    v_published_at TIMESTAMPTZ;
    v_record_id UUID;
    v_action TEXT;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NOT NULL AND NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to manage daily insights.';
    END IF;

    -- Validations
    IF p_insight_date IS NULL THEN
        RAISE EXCEPTION 'Insight date is required.';
    END IF;

    IF p_rashi_id IS NULL OR p_rashi_id < 1 OR p_rashi_id > 12 THEN
        RAISE EXCEPTION 'Invalid Rashi ID (must be between 1 and 12).';
    END IF;

    IF p_rashi_name IS NULL OR TRIM(p_rashi_name) = '' THEN
        RAISE EXCEPTION 'Rashi name is required.';
    END IF;

    IF p_language IS NULL OR TRIM(p_language) = '' THEN
        p_language := 'en';
    END IF;

    IF p_status = 'published'::public.astrology_content_status AND (p_general_outlook IS NULL OR TRIM(p_general_outlook) = '') THEN
        RAISE EXCEPTION 'General Outlook is mandatory when publishing a daily insight.';
    END IF;

    IF p_status = 'published'::public.astrology_content_status THEN
        v_published_at := now();
    ELSE
        v_published_at := NULL;
    END IF;

    -- Check if record already exists for this (date, rashi, lang)
    SELECT id INTO v_existing_id
    FROM public.daily_rashi_insights
    WHERE insight_date = p_insight_date
      AND rashi_id = p_rashi_id
      AND language = p_language;

    IF v_existing_id IS NOT NULL THEN
        UPDATE public.daily_rashi_insights
        SET rashi_name = TRIM(p_rashi_name),
            general_outlook = TRIM(COALESCE(p_general_outlook, '')),
            career_business = NULLIF(TRIM(COALESCE(p_career_business, '')), ''),
            finance_wealth = NULLIF(TRIM(COALESCE(p_finance_wealth, '')), ''),
            love_relationships = NULLIF(TRIM(COALESCE(p_love_relationships, '')), ''),
            health_wellbeing = NULLIF(TRIM(COALESCE(p_health_wellbeing, '')), ''),
            auspicious_color = NULLIF(TRIM(COALESCE(p_auspicious_color, '')), ''),
            auspicious_number = p_auspicious_number,
            status = p_status,
            published_at = COALESCE(v_published_at, published_at),
            updated_at = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_record_id;

        v_action := 'daily_rashi_insight_updated_by_admin';
    ELSE
        INSERT INTO public.daily_rashi_insights (
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
            created_by
        ) VALUES (
            p_insight_date,
            p_rashi_id,
            TRIM(p_rashi_name),
            p_language,
            TRIM(COALESCE(p_general_outlook, '')),
            NULLIF(TRIM(COALESCE(p_career_business, '')), ''),
            NULLIF(TRIM(COALESCE(p_finance_wealth, '')), ''),
            NULLIF(TRIM(COALESCE(p_love_relationships, '')), ''),
            NULLIF(TRIM(COALESCE(p_health_wellbeing, '')), ''),
            NULLIF(TRIM(COALESCE(p_auspicious_color, '')), ''),
            p_auspicious_number,
            p_status,
            v_published_at,
            v_admin_id
        ) RETURNING id INTO v_record_id;

        v_action := 'daily_rashi_insight_created_by_admin';
    END IF;

    -- Audit Logging
    IF v_admin_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_admin_id,
            v_action,
            'daily_rashi_insights',
            v_record_id,
            jsonb_build_object(
                'insight_date', p_insight_date,
                'rashi_id', p_rashi_id,
                'rashi_name', p_rashi_name,
                'language', p_language,
                'status', p_status
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'record_id', v_record_id,
        'insight_date', p_insight_date,
        'rashi_id', p_rashi_id,
        'status', p_status
    );
END;
$$;


-- =============================================================================
-- 7. Authoritative Admin RPC: admin_list_daily_rashi_insights
-- Returns the 12-Rashi matrix for a given calendar date and language.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_daily_rashi_insights(
    p_insight_date DATE,
    p_language VARCHAR(5) DEFAULT 'en'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_admin_id UUID;
    v_items JSONB;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NOT NULL AND NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to inspect daily insights.';
    END IF;

    IF p_insight_date IS NULL THEN
        p_insight_date := ((now() AT TIME ZONE 'Asia/Kolkata')::DATE);
    END IF;

    IF p_language IS NULL OR TRIM(p_language) = '' THEN
        p_language := 'en';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'insight_date', d.insight_date,
            'rashi_id', d.rashi_id,
            'rashi_name', d.rashi_name,
            'language', d.language,
            'general_outlook', d.general_outlook,
            'career_business', d.career_business,
            'finance_wealth', d.finance_wealth,
            'love_relationships', d.love_relationships,
            'health_wellbeing', d.health_wellbeing,
            'auspicious_color', d.auspicious_color,
            'auspicious_number', d.auspicious_number,
            'status', d.status,
            'published_at', d.published_at,
            'created_by', d.created_by,
            'created_at', d.created_at,
            'updated_at', d.updated_at
        ) ORDER BY d.rashi_id ASC
    ) INTO v_items
    FROM public.daily_rashi_insights d
    WHERE d.insight_date = p_insight_date
      AND d.language = p_language;

    RETURN jsonb_build_object(
        'success', true,
        'insight_date', p_insight_date,
        'language', p_language,
        'insights', COALESCE(v_items, '[]'::jsonb)
    );
END;
$$;


-- =============================================================================
-- 8. Grants and Permissions
-- =============================================================================

-- 8. Grants and Permissions (Admin RLS policy daily_rashi_insights_all_admin governs table operations)
GRANT ALL ON TABLE public.daily_rashi_insights TO authenticated;
GRANT SELECT ON TABLE public.daily_rashi_insights TO anon;

GRANT EXECUTE ON FUNCTION public.get_daily_rashi_insight TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.set_customer_preferred_rashi TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights TO authenticated;
