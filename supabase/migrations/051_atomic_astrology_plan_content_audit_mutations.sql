-- =============================================================================
-- Migration: 051_atomic_astrology_plan_content_audit_mutations.sql
-- Description: AST-16 Authoritative Atomic Mutations & In-Transaction Audit
--              Logging for Astrology Subscription Plans and Legacy Content.
--
-- Security & Invariants:
--   1. Replaces separate client-side table writes and uncoordinated audit log
--      inserts with atomic SECURITY DEFINER database operations.
--   2. Strict Administrative Guard: Enforces auth.uid() IS NOT NULL AND
--      public.is_admin(v_admin_id) inside the database transaction.
--   3. Actor Attribution: Audit records derive actor_user_id strictly from
--      auth.uid(), preventing client-supplied identity forgery.
--   4. Single Transaction Rollback: Business mutation and audit insertion occur
--      in the exact same database transaction. Any failure rolls back both.
--   5. Execution Permissions: Revokes EXECUTE from PUBLIC, anon, and service_role;
--      grants strictly to authenticated (used by admin Server Action sessions).
--   6. Hardened Search Path: Configured with SET search_path = '' and fully
--      schema-qualified object references to eliminate search-path hijacking.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Authoritative Atomic Astrology Subscription Plan Save RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_save_astrology_plan(
    p_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_duration_days INTEGER DEFAULT NULL,
    p_price NUMERIC(12,2) DEFAULT NULL,
    p_currency CHAR(3) DEFAULT 'INR',
    p_daily_in_app_enabled BOOLEAN DEFAULT TRUE,
    p_weekly_whatsapp_enabled BOOLEAN DEFAULT TRUE,
    p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_existing_plan RECORD;
    v_result_plan RECORD;
    v_action TEXT;
    v_trimmed_name TEXT;
    v_currency CHAR(3);
BEGIN
    -- 1. Authorization: Verify caller is authenticated and possesses administrator privileges
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to manage subscription plans.';
    END IF;

    -- 2. Input Validation
    v_trimmed_name := TRIM(COALESCE(p_name, ''));
    IF pg_catalog.length(v_trimmed_name) < 2 THEN
        RAISE EXCEPTION 'Plan name must be at least 2 characters.';
    END IF;

    IF p_duration_days IS NULL OR p_duration_days < 1 THEN
        RAISE EXCEPTION 'Duration must be at least 1 day.';
    END IF;

    IF p_price IS NULL OR p_price < 0 THEN
        RAISE EXCEPTION 'Price cannot be negative.';
    END IF;

    v_currency := COALESCE(NULLIF(TRIM(p_currency), ''), 'INR');

    -- 3. Execute Mutation (Insert or Update)
    IF p_id IS NOT NULL THEN
        -- Verify existence
        SELECT * INTO v_existing_plan
        FROM public.astrology_subscription_plans
        WHERE id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Astrology subscription plan % not found.', p_id;
        END IF;

        UPDATE public.astrology_subscription_plans
        SET
            name = v_trimmed_name,
            duration_days = p_duration_days,
            price = p_price,
            currency = v_currency,
            daily_in_app_enabled = COALESCE(p_daily_in_app_enabled, true),
            weekly_whatsapp_enabled = COALESCE(p_weekly_whatsapp_enabled, true),
            is_active = COALESCE(p_is_active, true),
            updated_at = pg_catalog.now()
        WHERE id = p_id
        RETURNING * INTO v_result_plan;

        v_action := 'astrology_plan_updated_by_admin';

        -- 4. Atomic Audit Log Entry in same transaction
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_admin_id,
            v_action,
            'astrology_subscription_plans',
            v_result_plan.id::pg_catalog.text,
            pg_catalog.jsonb_build_object(
                'name', v_result_plan.name,
                'price', v_result_plan.price,
                'duration_days', v_result_plan.duration_days,
                'currency', v_result_plan.currency,
                'is_active', v_result_plan.is_active,
                'daily_in_app_enabled', v_result_plan.daily_in_app_enabled,
                'weekly_whatsapp_enabled', v_result_plan.weekly_whatsapp_enabled,
                'previous_name', v_existing_plan.name,
                'previous_price', v_existing_plan.price,
                'previous_is_active', v_existing_plan.is_active
            )
        );
    ELSE
        INSERT INTO public.astrology_subscription_plans (
            name,
            duration_days,
            price,
            currency,
            daily_in_app_enabled,
            weekly_whatsapp_enabled,
            is_active
        ) VALUES (
            v_trimmed_name,
            p_duration_days,
            p_price,
            v_currency,
            COALESCE(p_daily_in_app_enabled, true),
            COALESCE(p_weekly_whatsapp_enabled, true),
            COALESCE(p_is_active, true)
        )
        RETURNING * INTO v_result_plan;

        v_action := 'astrology_plan_created_by_admin';

        -- 4. Atomic Audit Log Entry in same transaction
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_admin_id,
            v_action,
            'astrology_subscription_plans',
            v_result_plan.id::pg_catalog.text,
            pg_catalog.jsonb_build_object(
                'name', v_result_plan.name,
                'price', v_result_plan.price,
                'duration_days', v_result_plan.duration_days,
                'currency', v_result_plan.currency,
                'is_active', v_result_plan.is_active,
                'daily_in_app_enabled', v_result_plan.daily_in_app_enabled,
                'weekly_whatsapp_enabled', v_result_plan.weekly_whatsapp_enabled
            )
        );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'action', v_action,
        'plan', pg_catalog.to_jsonb(v_result_plan)
    );
END;
$$;

-- Explicit Permissions Hardening
REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. Authoritative Atomic Astrology Content Save RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_save_astrology_content(
    p_id UUID DEFAULT NULL,
    p_channel public.astrology_channel DEFAULT 'in_app'::public.astrology_channel,
    p_title TEXT DEFAULT NULL,
    p_body TEXT DEFAULT NULL,
    p_publish_at TIMESTAMPTZ DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_status public.astrology_content_status DEFAULT 'draft'::public.astrology_content_status
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_existing_content RECORD;
    v_result_content RECORD;
    v_action TEXT;
    v_trimmed_body TEXT;
    v_trimmed_title TEXT;
BEGIN
    -- 1. Authorization: Verify caller is authenticated and possesses administrator privileges
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to manage astrology content.';
    END IF;

    -- 2. Input Validation
    IF p_channel IS NULL THEN
        RAISE EXCEPTION 'Channel is required.';
    END IF;

    v_trimmed_body := TRIM(COALESCE(p_body, ''));
    IF pg_catalog.length(v_trimmed_body) < 5 THEN
        RAISE EXCEPTION 'Content body must be at least 5 characters.';
    END IF;

    IF p_publish_at IS NULL THEN
        RAISE EXCEPTION 'Publish date and time is required.';
    END IF;

    IF p_expires_at IS NOT NULL AND p_expires_at <= p_publish_at THEN
        RAISE EXCEPTION 'Expiration date and time must be strictly after the publication date and time.';
    END IF;

    v_trimmed_title := NULLIF(TRIM(COALESCE(p_title, '')), '');

    -- 3. Execute Mutation (Insert or Update)
    IF p_id IS NOT NULL THEN
        -- Verify existence
        SELECT * INTO v_existing_content
        FROM public.astrology_content
        WHERE id = p_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Astrology content % not found.', p_id;
        END IF;

        UPDATE public.astrology_content
        SET
            channel = p_channel,
            title = v_trimmed_title,
            body = v_trimmed_body,
            publish_at = p_publish_at,
            expires_at = p_expires_at,
            status = COALESCE(p_status, 'draft'::public.astrology_content_status),
            updated_at = pg_catalog.now()
        WHERE id = p_id
        RETURNING * INTO v_result_content;

        v_action := 'astrology_content_updated_by_admin';

        -- 4. Atomic Audit Log Entry in same transaction
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_admin_id,
            v_action,
            'astrology_content',
            v_result_content.id::pg_catalog.text,
            pg_catalog.jsonb_build_object(
                'channel', v_result_content.channel,
                'title', v_result_content.title,
                'status', v_result_content.status,
                'publish_at', v_result_content.publish_at,
                'expires_at', v_result_content.expires_at,
                'previous_status', v_existing_content.status,
                'previous_channel', v_existing_content.channel
            )
        );
    ELSE
        INSERT INTO public.astrology_content (
            channel,
            title,
            body,
            publish_at,
            expires_at,
            status,
            created_by
        ) VALUES (
            p_channel,
            v_trimmed_title,
            v_trimmed_body,
            p_publish_at,
            p_expires_at,
            COALESCE(p_status, 'draft'::public.astrology_content_status),
            v_admin_id
        )
        RETURNING * INTO v_result_content;

        v_action := 'astrology_content_created_by_admin';

        -- 4. Atomic Audit Log Entry in same transaction
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            v_admin_id,
            v_action,
            'astrology_content',
            v_result_content.id::pg_catalog.text,
            pg_catalog.jsonb_build_object(
                'channel', v_result_content.channel,
                'title', v_result_content.title,
                'status', v_result_content.status,
                'publish_at', v_result_content.publish_at,
                'expires_at', v_result_content.expires_at
            )
        );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'action', v_action,
        'content', pg_catalog.to_jsonb(v_result_content)
    );
END;
$$;

-- Explicit Permissions Hardening
REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_content(UUID, public.astrology_channel, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.astrology_content_status) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_astrology_content(UUID, public.astrology_channel, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.astrology_content_status) TO authenticated;

