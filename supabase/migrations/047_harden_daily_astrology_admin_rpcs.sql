-- =============================================================================
-- Migration: 047_harden_daily_astrology_admin_rpcs.sql
-- Description: Harden administrative daily astrology RPCs against unauthenticated
--              and unprivileged access (AST-01 remediation):
--              1. Reject unauthenticated callers (auth.uid() IS NULL) and non-admin
--                 authenticated callers (customers, pandits) explicitly in SQL guards.
--              2. Revoke default PUBLIC and anon EXECUTE permissions.
--              3. Grant EXECUTE strictly to authenticated and service_role.
--              4. Preserve authoritative audit logging and existing parameter/return contracts.
-- Security Advisory Reference: AST-01 (KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md)
-- Authoritative Base: Migration 045
-- =============================================================================

-- =============================================================================
-- 1. Redefine public.admin_save_daily_rashi_insight with Strict Guard
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
    -- AST-01 Guard: Reject unauthenticated callers AND callers lacking administrative privileges
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
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

    -- Authoritative Audit Logging (v_admin_id is guaranteed non-null and authorized)
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

    RETURN jsonb_build_object(
        'success', true,
        'record_id', v_record_id,
        'insight_date', p_insight_date,
        'rashi_id', p_rashi_id,
        'status', p_status
    );
END;
$$;

COMMENT ON FUNCTION public.admin_save_daily_rashi_insight IS
    'Authoritative administrative RPC: validates input, enforces admin role, and records audit logs when saving or publishing daily Rashi insights.';


-- =============================================================================
-- 2. Redefine public.admin_list_daily_rashi_insights with Strict Guard
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
    -- AST-01 Guard: Reject unauthenticated callers AND callers lacking administrative privileges
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
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

COMMENT ON FUNCTION public.admin_list_daily_rashi_insights IS
    'Authoritative administrative RPC: enforces admin role before returning the complete 12-Rashi editorial matrix including drafts for a given date and language.';


-- =============================================================================
-- 3. Execution Permissions & Access Control List (ACL) Hardening
-- =============================================================================

-- Explicitly revoke execution from PUBLIC pseudo-role and anon role
REVOKE EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights(
    DATE, VARCHAR(5)
) FROM PUBLIC, anon;

-- Grant execution strictly to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights(
    DATE, VARCHAR(5)
) TO authenticated, service_role;
