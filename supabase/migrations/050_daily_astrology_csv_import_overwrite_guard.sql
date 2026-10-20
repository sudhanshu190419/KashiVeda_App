-- =============================================================================
-- Migration: 050_daily_astrology_csv_import_overwrite_guard.sql
-- Description: Implement atomic server/database-level overwrite guard for daily 
--              astrology insights (AST-11 remediation):
--              1. Drop 13-argument overload to avoid ambiguous function resolution.
--              2. Redefine public.admin_save_daily_rashi_insight with p_allow_overwrite
--                 (default TRUE) to enforce no-overwrite policy atomically inside
--                 the row-level lock transaction.
--              3. When p_allow_overwrite is FALSE:
--                 - Existing rows are locked via SELECT ... FOR UPDATE and rejected
--                   with OVERWRITE_DISALLOWED without advancing version counter.
--                 - Concurrent insert races caught via unique_violation safely reject
--                   without mutating the competing row.
--              4. Maintain AST-01 admin role authorization and strict audit logging.
-- Security Reference: AST-11 (KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md)
-- Previous Migrations: 045 (Base schema), 047 (ACL hardening), 049 (AST-09 OCC)
-- =============================================================================

-- =============================================================================
-- 1. Drop Legacy 13-Argument RPC Overload (Prevent Ambiguous Resolution)
-- =============================================================================

DROP FUNCTION IF EXISTS public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status, INTEGER
);


-- =============================================================================
-- 2. Authoritative Mutation RPC with Atomic Overwrite Guard: public.admin_save_daily_rashi_insight
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
    p_expected_version INTEGER DEFAULT NULL,
    p_allow_overwrite BOOLEAN DEFAULT TRUE
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

    -- Concurrency Protection (AST-09) & Atomic Row Lock:
    -- Acquire row-level lock on the targeted composite key to serialize concurrent mutations
    SELECT id, version INTO v_existing_id, v_current_version
    FROM public.daily_rashi_insights
    WHERE insight_date = p_insight_date
      AND rashi_id = p_rashi_id
      AND language = p_language
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        -- Case A: Record already exists.

        -- AST-11 Guard: If overwrite is disallowed, reject immediately without mutating or advancing version.
        IF NOT p_allow_overwrite THEN
            RETURN jsonb_build_object(
                'success', false,
                'skipped', true,
                'error_code', 'OVERWRITE_DISALLOWED',
                'error', format('Record already exists for %s (Rashi %s, %s) and overwrite is disabled.',
                                p_insight_date, p_rashi_id, p_language),
                'current_version', v_current_version,
                'expected_version', p_expected_version,
                'record_id', v_existing_id
            );
        END IF;

        -- Overwrite is allowed: check AST-09 expected version!
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
                -- Insert Race Guard (AST-09/11): Another transaction concurrently created this record!
                SELECT id, version INTO v_existing_id, v_current_version
                FROM public.daily_rashi_insights
                WHERE insight_date = p_insight_date
                  AND rashi_id = p_rashi_id
                  AND language = p_language;

                -- If the violated constraint was not the composite identity, re-raise original exception
                IF v_existing_id IS NULL THEN
                    RAISE;
                END IF;

                -- If overwrite was disallowed, report cleanly as skipped/disallowed without modifying competing row
                IF NOT p_allow_overwrite THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'skipped', true,
                        'error_code', 'OVERWRITE_DISALLOWED',
                        'error', format('Record was created concurrently for %s (Rashi %s, %s) and overwrite is disabled.',
                                        p_insight_date, p_rashi_id, p_language),
                        'current_version', v_current_version,
                        'expected_version', p_expected_version,
                        'record_id', v_existing_id
                    );
                END IF;

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

    -- Authoritative Audit Logging (Strictly on successful mutations)
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
        'action', v_action,
        'record_id', v_record_id,
        'insight_date', p_insight_date,
        'rashi_id', p_rashi_id,
        'language', p_language,
        'status', p_status,
        'version', v_new_version
    );
END;
$$;

COMMENT ON FUNCTION public.admin_save_daily_rashi_insight IS
    'Authoritative administrative RPC with OCC (AST-09) and atomic overwrite guard (AST-11): verifies expected version, enforces p_allow_overwrite, acquires row lock, prevents silent overwrites, and logs audit events.';


-- =============================================================================
-- 3. Execution Permissions & Access Control List (ACL) Hardening
-- =============================================================================

-- Explicitly revoke execution from PUBLIC pseudo-role and anon role
REVOKE EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status, INTEGER, BOOLEAN
) FROM PUBLIC, anon;

-- Grant execution strictly to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status, INTEGER, BOOLEAN
) TO authenticated, service_role;
