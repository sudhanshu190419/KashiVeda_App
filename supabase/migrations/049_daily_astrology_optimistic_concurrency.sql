-- =============================================================================
-- Migration: 049_daily_astrology_optimistic_concurrency.sql
-- Description: Implement database-enforced optimistic concurrency control (OCC)
--              for administrative daily Vedic astrology insights (AST-09 remediation):
--              1. Add monotonic version column to public.daily_rashi_insights.
--              2. Drop legacy unversioned RPC overload to prevent ambiguous resolution.
--              3. Redefine public.admin_save_daily_rashi_insight with p_expected_version,
--                 row-level locking (FOR UPDATE), and safe insert race handling.
--              4. Update public.admin_list_daily_rashi_insights to serialize version.
--              5. Maintain authoritative audit logging and strict security definer ACLs.
-- Security Reference: AST-09 (KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md)
-- Previous Migrations: 045 (Base schema), 047 (ACL hardening), 048 (AST-07 locks)
-- =============================================================================

-- =============================================================================
-- 1. Add Monotonic Version Column to public.daily_rashi_insights
-- =============================================================================

ALTER TABLE public.daily_rashi_insights 
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_daily_rashi_insights_version_positive'
          AND conrelid = 'public.daily_rashi_insights'::regclass
    ) THEN
        ALTER TABLE public.daily_rashi_insights
            ADD CONSTRAINT chk_daily_rashi_insights_version_positive
            CHECK (version >= 1);
    END IF;
END $$;

COMMENT ON COLUMN public.daily_rashi_insights.version IS 
    'Monotonically increasing version counter for optimistic concurrency control (AST-09).';


-- =============================================================================
-- 2. Drop Legacy Unversioned RPC Overload (Prevent Ambiguous Resolution)
-- =============================================================================

DROP FUNCTION IF EXISTS public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status
);


-- =============================================================================
-- 3. Authoritative Versioned Mutation RPC: public.admin_save_daily_rashi_insight
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
    p_status public.astrology_content_status DEFAULT 'draft'::public.astrology_content_status,
    p_expected_version INTEGER DEFAULT NULL
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
    v_current_version INTEGER;
    v_new_version INTEGER;
    v_published_at TIMESTAMPTZ;
    v_record_id UUID;
    v_action TEXT;
BEGIN
    v_admin_id := auth.uid();
    -- AST-01 Guard: Reject unauthenticated callers AND callers lacking administrative privileges
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to manage daily insights.';
    END IF;

    -- Basic Validations
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

    -- Concurrency Protection (AST-09):
    -- Acquire row-level lock on the targeted composite key to serialize concurrent mutations
    SELECT id, version INTO v_existing_id, v_current_version
    FROM public.daily_rashi_insights
    WHERE insight_date = p_insight_date
      AND rashi_id = p_rashi_id
      AND language = p_language
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        -- Case A: Record already exists.
        -- If caller expected this to be a new creation (p_expected_version IS NULL),
        -- or if caller's snapshot version does not match the current database version,
        -- reject mutation cleanly with VERSION_CONFLICT.
        IF p_expected_version IS NULL OR v_current_version <> p_expected_version THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'VERSION_CONFLICT',
                'error', format('Conflict: Daily insight for %s (Rashi %s, %s) was modified by another editor. Expected version %s, current version is %s.',
                                p_insight_date, p_rashi_id, p_language,
                                COALESCE(p_expected_version::text, 'null'), v_current_version::text),
                'current_version', v_current_version,
                'expected_version', p_expected_version,
                'record_id', v_existing_id
            );
        END IF;

        -- Expected version matches current version! Atomically advance version counter.
        v_new_version := v_current_version + 1;

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
            version = v_new_version,
            updated_at = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_record_id;

        v_action := 'daily_rashi_insight_updated_by_admin';

    ELSE
        -- Case B: Record does not exist.
        -- If caller expected an existing record (p_expected_version IS NOT NULL),
        -- the record was either deleted or never existed.
        IF p_expected_version IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'RECORD_NOT_FOUND',
                'error', format('Conflict: Daily insight for %s (Rashi %s, %s) expected version %s, but record does not exist.',
                                p_insight_date, p_rashi_id, p_language, p_expected_version::text),
                'expected_version', p_expected_version
            );
        END IF;

        -- Brand-new record: initialize version to 1.
        v_new_version := 1;

        BEGIN
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
                created_by,
                version
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
                v_admin_id,
                v_new_version
            ) RETURNING id INTO v_record_id;

            v_action := 'daily_rashi_insight_created_by_admin';

        EXCEPTION
            WHEN unique_violation THEN
                -- Insert Race Guard (AST-09): Another transaction concurrently created this record!
                -- Safely report a structured conflict instead of an unhandled database exception.
                SELECT id, version INTO v_existing_id, v_current_version
                FROM public.daily_rashi_insights
                WHERE insight_date = p_insight_date
                  AND rashi_id = p_rashi_id
                  AND language = p_language;

                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'VERSION_CONFLICT',
                    'error', format('Conflict: Another editor created this daily insight concurrently (current version %s). Please reload.',
                                    COALESCE(v_current_version::text, '1')),
                    'current_version', v_current_version,
                    'expected_version', p_expected_version,
                    'record_id', v_existing_id
                );
        END;
    END IF;

    -- Authoritative Audit Logging (Executed strictly on successful mutations)
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
            'status', p_status,
            'version', v_new_version
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'record_id', v_record_id,
        'insight_date', p_insight_date,
        'rashi_id', p_rashi_id,
        'status', p_status,
        'version', v_new_version
    );
END;
$$;

COMMENT ON FUNCTION public.admin_save_daily_rashi_insight IS
    'Authoritative administrative RPC with optimistic concurrency control (AST-09): verifies p_expected_version, acquires row lock, prevents silent overwrites, and logs audit events.';


-- =============================================================================
-- 4. Authoritative Admin Listing RPC: public.admin_list_daily_rashi_insights
-- (Updated to include version in serialized JSON items)
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
            'version', d.version,
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
    'Authoritative administrative RPC: enforces admin role before returning the complete 12-Rashi editorial matrix including drafts and OCC version tokens.';


-- =============================================================================
-- 5. Execution Permissions & Access Control List (ACL) Hardening
-- =============================================================================

-- Explicitly revoke execution from PUBLIC pseudo-role and anon role
REVOKE EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status, INTEGER
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights(
    DATE, VARCHAR(5)
) FROM PUBLIC, anon;

-- Grant execution strictly to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status, INTEGER
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights(
    DATE, VARCHAR(5)
) TO authenticated, service_role;
