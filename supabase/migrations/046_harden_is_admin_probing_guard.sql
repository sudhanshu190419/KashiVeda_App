-- =============================================================================
-- Migration: 046_harden_is_admin_probing_guard.sql
-- Description: Harden public.is_admin(UUID) against unauthenticated and unprivileged
--              arbitrary-user role probing while preserving anonymous catalog RLS
--              evaluation compatibility.
-- Security Advisory Reference: AUTH-SEC-01 (KASHIVEDA_AUTH_FOLLOWUP_AUDIT.md)
-- Authoritative Base: Migrations 012 and 040
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Redefine public.is_admin(UUID) with Strict Probing Immunity
-- -----------------------------------------------------------------------------
-- Vulnerability Addressed:
-- Previous implementation contained `IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id`.
-- When an unauthenticated caller invoked the function via RPC (`POST /rest/v1/rpc/is_admin`)
-- with an explicit `p_user_id`, `auth.uid()` was NULL, causing the guard to be bypassed
-- and leaking whether the target UUID belonged to an administrator.
--
-- Hardened Behavior:
-- 1. If target user is NULL, returns false immediately.
-- 2. If caller is unauthenticated (v_caller_id IS NULL) AND supplies an explicit target UUID,
--    it returns false immediately without evaluating public.user_roles for the target.
-- 3. If caller is an authenticated non-admin evaluating another user (v_caller_id != v_target_user_id),
--    it returns false immediately.
-- 4. If caller is an authenticated admin, evaluating any target UUID is permitted.
-- 5. If evaluating self (or evaluating auth.uid() when authenticated), evaluates own admin status.
-- 6. When called with no arguments by anonymous clients during catalog RLS evaluation,
--    it evaluates to false safely without error.

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_target_user_id UUID;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    v_target_user_id := COALESCE(p_user_id, v_caller_id);

    -- If target is NULL (e.g. unauthenticated 0-argument call), cannot be admin
    IF v_target_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Security Guard: Prevent arbitrary-user probing by unprivileged or unauthenticated callers.
    -- If evaluating another user (or if an unauthenticated caller supplies an explicit target UUID),
    -- caller MUST be authenticated AND possess an 'admin' or 'super_admin' role in public.user_roles.
    IF v_caller_id IS NULL OR v_caller_id != v_target_user_id THEN
        IF v_caller_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
        ) THEN
            RETURN false;
        END IF;
    END IF;

    -- Authorized evaluation (self-check or administrative query)
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = v_target_user_id 
          AND role IN ('admin', 'super_admin')
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Execution Permissions
-- -----------------------------------------------------------------------------
-- Revoke execution from PUBLIC default pseudo-role
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;

-- Grant execution to anon and authenticated (required for catalog RLS policy evaluations)
-- and service_role (backend administrative tasks)
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated, service_role;
