-- =============================================================================
-- Migration: 012_rls_and_permissions.sql
-- Description: Production Row Level Security (RLS) policies, role-based access control,
--              minimal recursion-safe helper functions, column-level update hardening,
--              and granular database permissions.
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- Migrations 001-011 are immutable and authoritative.
-- =============================================================================

-- =============================================================================
-- 1. Minimal Recursion-Safe Security Definer Helper Functions
-- =============================================================================

-- 1.1 Helper: Check if the current authenticated caller possesses a specific role without RLS recursion
CREATE OR REPLACE FUNCTION public.current_user_has_role(p_role public.user_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = v_caller_id 
          AND role = p_role
    );
END;
$$;

-- 1.2 Helper: Check if current caller is super_admin (0-argument)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN public.current_user_has_role('super_admin'::public.user_role);
END;
$$;

-- 1.3 Helper: Check if caller possesses admin / super_admin role (Preserves Migration 011 signature & default)
-- Security Guard: Non-admin callers can only evaluate their own status; arbitrary-user probing returns false.
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

    IF v_target_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Security Guard: Prevent arbitrary-user probing by unprivileged callers
    IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
        ) THEN
            RETURN false;
        END IF;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = v_target_user_id 
          AND role IN ('admin', 'super_admin')
    );
END;
$$;

-- 1.4 Helper: Check if current caller is a Pandit (0-argument)
CREATE OR REPLACE FUNCTION public.is_pandit()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN public.current_user_has_role('pandit'::public.user_role);
END;
$$;

-- 1.5 Helper: Check if current caller is a customer (0-argument)
CREATE OR REPLACE FUNCTION public.is_customer()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN public.current_user_has_role('customer'::public.user_role);
END;
$$;

-- 1.6 Helper: Get pandit_profiles.id for user (Preserves Migration 011 signature & default)
-- Security Guard: Non-admin callers can only evaluate their own status; arbitrary-user probing returns NULL.
CREATE OR REPLACE FUNCTION public.get_pandit_id_for_user(p_user_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_target_user_id UUID;
    v_caller_id UUID;
    v_pandit_id UUID;
BEGIN
    v_caller_id := auth.uid();
    v_target_user_id := COALESCE(p_user_id, v_caller_id);

    IF v_target_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Security Guard: Prevent arbitrary-user probing by unprivileged callers
    IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
        ) THEN
            RETURN NULL;
        END IF;
    END IF;

    SELECT id INTO v_pandit_id
    FROM public.pandit_profiles 
    WHERE user_id = v_target_user_id 
    LIMIT 1;

    RETURN v_pandit_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Parameterized Helper Overloads (Service Role / Internal Admin Use Only)
-- Strictly prevents arbitrary-user probing by returning false if unprivileged
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
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

    IF v_target_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Security Guard: Prevent arbitrary-user probing by unprivileged callers
    IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role = 'super_admin'
        ) THEN
            RETURN false;
        END IF;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = v_target_user_id 
          AND role = 'super_admin'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_pandit(p_user_id UUID)
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

    IF v_target_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Security Guard: Prevent arbitrary-user probing by unprivileged callers
    IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
        ) THEN
            RETURN false;
        END IF;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = v_target_user_id 
          AND role = 'pandit'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_customer(p_user_id UUID)
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

    IF v_target_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Security Guard: Prevent arbitrary-user probing by unprivileged callers
    IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
        ) THEN
            RETURN false;
        END IF;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = v_target_user_id 
          AND role = 'customer'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(p_role public.user_role, p_user_id UUID)
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

    IF v_target_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Security Guard: Prevent arbitrary-user probing by unprivileged callers
    IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
        ) THEN
            RETURN false;
        END IF;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = v_target_user_id 
          AND role = p_role
    );
END;
$$;


-- =============================================================================
-- 2. Enable Row Level Security across All 40 Public Schema Tables
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandit_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandit_service_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandit_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puja_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puja_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandit_puja_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samagri_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samagri_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samagri_package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prasad_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandit_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandit_unavailability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_service_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_reschedule_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kundli_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kundli_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrology_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrology_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrology_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astrology_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_policy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_policy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pandit_payouts ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 3. Identity Domain Policies (profiles, user_roles)
-- =============================================================================

-- 3.1 profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
    ON public.profiles FOR SELECT
    USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin"
    ON public.profiles FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 3.2 user_roles
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
    ON public.user_roles FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles_select_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_admin"
    ON public.user_roles FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "user_roles_all_super_admin" ON public.user_roles;
CREATE POLICY "user_roles_all_super_admin"
    ON public.user_roles FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());


-- =============================================================================
-- 4. Pandit Domain Policies
-- =============================================================================

-- 4.1 pandit_profiles
DROP POLICY IF EXISTS "pandit_profiles_select_own" ON public.pandit_profiles;
CREATE POLICY "pandit_profiles_select_own"
    ON public.pandit_profiles FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pandit_profiles_select_admin" ON public.pandit_profiles;
CREATE POLICY "pandit_profiles_select_admin"
    ON public.pandit_profiles FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "pandit_profiles_insert_own" ON public.pandit_profiles;
CREATE POLICY "pandit_profiles_insert_own"
    ON public.pandit_profiles FOR INSERT
    WITH CHECK (
        user_id = auth.uid() 
        AND verification_status = 'pending'::public.pandit_verification_status
        AND approved_at IS NULL
        AND onboarding_completed_at IS NULL
    );

DROP POLICY IF EXISTS "pandit_profiles_update_own" ON public.pandit_profiles;
CREATE POLICY "pandit_profiles_update_own"
    ON public.pandit_profiles FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 4.2 pandit_documents
DROP POLICY IF EXISTS "pandit_documents_select_own" ON public.pandit_documents;
CREATE POLICY "pandit_documents_select_own"
    ON public.pandit_documents FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_documents_select_admin" ON public.pandit_documents;
CREATE POLICY "pandit_documents_select_admin"
    ON public.pandit_documents FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "pandit_documents_insert_own" ON public.pandit_documents;
CREATE POLICY "pandit_documents_insert_own"
    ON public.pandit_documents FOR INSERT
    WITH CHECK (
        pandit_id = public.get_pandit_id_for_user()
        AND verification_status = 'pending'::public.document_verification_status
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
        AND rejection_reason IS NULL
    );

DROP POLICY IF EXISTS "pandit_documents_update_own" ON public.pandit_documents;
CREATE POLICY "pandit_documents_update_own"
    ON public.pandit_documents FOR UPDATE
    USING (
        pandit_id = public.get_pandit_id_for_user()
        AND verification_status = 'pending'::public.document_verification_status
    )
    WITH CHECK (
        pandit_id = public.get_pandit_id_for_user()
        AND verification_status = 'pending'::public.document_verification_status
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
        AND rejection_reason IS NULL
    );

DROP POLICY IF EXISTS "pandit_documents_delete_own" ON public.pandit_documents;
CREATE POLICY "pandit_documents_delete_own"
    ON public.pandit_documents FOR DELETE
    USING (
        pandit_id = public.get_pandit_id_for_user()
        AND verification_status = 'pending'::public.document_verification_status
    );

-- 4.3 pandit_service_areas
DROP POLICY IF EXISTS "pandit_service_areas_select_own" ON public.pandit_service_areas;
CREATE POLICY "pandit_service_areas_select_own"
    ON public.pandit_service_areas FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_service_areas_insert_own" ON public.pandit_service_areas;
CREATE POLICY "pandit_service_areas_insert_own"
    ON public.pandit_service_areas FOR INSERT
    WITH CHECK (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_service_areas_update_own" ON public.pandit_service_areas;
CREATE POLICY "pandit_service_areas_update_own"
    ON public.pandit_service_areas FOR UPDATE
    USING (pandit_id = public.get_pandit_id_for_user())
    WITH CHECK (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_service_areas_delete_own" ON public.pandit_service_areas;
CREATE POLICY "pandit_service_areas_delete_own"
    ON public.pandit_service_areas FOR DELETE
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_service_areas_all_admin" ON public.pandit_service_areas;
CREATE POLICY "pandit_service_areas_all_admin"
    ON public.pandit_service_areas FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 4.4 pandit_bank_accounts (Read-Only for Pandit & Admin; Mutations via service_role/Edge Functions)
DROP POLICY IF EXISTS "pandit_bank_accounts_select_own" ON public.pandit_bank_accounts;
CREATE POLICY "pandit_bank_accounts_select_own"
    ON public.pandit_bank_accounts FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_bank_accounts_select_admin" ON public.pandit_bank_accounts;
CREATE POLICY "pandit_bank_accounts_select_admin"
    ON public.pandit_bank_accounts FOR SELECT
    USING (public.is_admin());


-- =============================================================================
-- 5. Public Ritual Catalog, Offerings & Temple Policies
-- =============================================================================

-- 5.1 puja_categories
DROP POLICY IF EXISTS "puja_categories_select_public" ON public.puja_categories;
CREATE POLICY "puja_categories_select_public"
    ON public.puja_categories FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "puja_categories_all_admin" ON public.puja_categories;
CREATE POLICY "puja_categories_all_admin"
    ON public.puja_categories FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.2 puja_services
DROP POLICY IF EXISTS "puja_services_select_public" ON public.puja_services;
CREATE POLICY "puja_services_select_public"
    ON public.puja_services FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "puja_services_all_admin" ON public.puja_services;
CREATE POLICY "puja_services_all_admin"
    ON public.puja_services FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.3 pandit_puja_services
DROP POLICY IF EXISTS "pandit_puja_services_select_public" ON public.pandit_puja_services;
CREATE POLICY "pandit_puja_services_select_public"
    ON public.pandit_puja_services FOR SELECT
    USING (
        is_active = true 
        AND EXISTS (
            SELECT 1 FROM public.pandit_profiles pp 
            WHERE pp.id = pandit_puja_services.pandit_id 
              AND pp.verification_status = 'approved'
        )
    );

DROP POLICY IF EXISTS "pandit_puja_services_select_own" ON public.pandit_puja_services;
CREATE POLICY "pandit_puja_services_select_own"
    ON public.pandit_puja_services FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_puja_services_insert_own" ON public.pandit_puja_services;
CREATE POLICY "pandit_puja_services_insert_own"
    ON public.pandit_puja_services FOR INSERT
    WITH CHECK (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_puja_services_update_own" ON public.pandit_puja_services;
CREATE POLICY "pandit_puja_services_update_own"
    ON public.pandit_puja_services FOR UPDATE
    USING (pandit_id = public.get_pandit_id_for_user())
    WITH CHECK (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_puja_services_delete_own" ON public.pandit_puja_services;
CREATE POLICY "pandit_puja_services_delete_own"
    ON public.pandit_puja_services FOR DELETE
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_puja_services_all_admin" ON public.pandit_puja_services;
CREATE POLICY "pandit_puja_services_all_admin"
    ON public.pandit_puja_services FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.4 temples
DROP POLICY IF EXISTS "temples_select_public" ON public.temples;
CREATE POLICY "temples_select_public"
    ON public.temples FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "temples_all_admin" ON public.temples;
CREATE POLICY "temples_all_admin"
    ON public.temples FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.5 samagri_items
DROP POLICY IF EXISTS "samagri_items_select_public" ON public.samagri_items;
CREATE POLICY "samagri_items_select_public"
    ON public.samagri_items FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "samagri_items_all_admin" ON public.samagri_items;
CREATE POLICY "samagri_items_all_admin"
    ON public.samagri_items FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.6 samagri_packages
DROP POLICY IF EXISTS "samagri_packages_select_public" ON public.samagri_packages;
CREATE POLICY "samagri_packages_select_public"
    ON public.samagri_packages FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "samagri_packages_all_admin" ON public.samagri_packages;
CREATE POLICY "samagri_packages_all_admin"
    ON public.samagri_packages FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.7 samagri_package_items
DROP POLICY IF EXISTS "samagri_package_items_select_public" ON public.samagri_package_items;
CREATE POLICY "samagri_package_items_select_public"
    ON public.samagri_package_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.samagri_packages sp 
            WHERE sp.id = samagri_package_items.package_id 
              AND sp.is_active = true
        )
    );

DROP POLICY IF EXISTS "samagri_package_items_all_admin" ON public.samagri_package_items;
CREATE POLICY "samagri_package_items_all_admin"
    ON public.samagri_package_items FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 5.8 prasad_items
DROP POLICY IF EXISTS "prasad_items_select_public" ON public.prasad_items;
CREATE POLICY "prasad_items_select_public"
    ON public.prasad_items FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "prasad_items_all_admin" ON public.prasad_items;
CREATE POLICY "prasad_items_all_admin"
    ON public.prasad_items FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- =============================================================================
-- 6. Customer Addresses & Pandit Availability Policies
-- =============================================================================

-- 6.1 customer_addresses
DROP POLICY IF EXISTS "customer_addresses_select_own" ON public.customer_addresses;
CREATE POLICY "customer_addresses_select_own"
    ON public.customer_addresses FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "customer_addresses_insert_own" ON public.customer_addresses;
CREATE POLICY "customer_addresses_insert_own"
    ON public.customer_addresses FOR INSERT
    WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "customer_addresses_update_own" ON public.customer_addresses;
CREATE POLICY "customer_addresses_update_own"
    ON public.customer_addresses FOR UPDATE
    USING (customer_id = auth.uid())
    WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "customer_addresses_delete_own" ON public.customer_addresses;
CREATE POLICY "customer_addresses_delete_own"
    ON public.customer_addresses FOR DELETE
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "customer_addresses_select_admin" ON public.customer_addresses;
CREATE POLICY "customer_addresses_select_admin"
    ON public.customer_addresses FOR SELECT
    USING (public.is_admin());

-- 6.2 pandit_availability_rules
DROP POLICY IF EXISTS "pandit_availability_rules_select_own" ON public.pandit_availability_rules;
CREATE POLICY "pandit_availability_rules_select_own"
    ON public.pandit_availability_rules FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_availability_rules_insert_own" ON public.pandit_availability_rules;
CREATE POLICY "pandit_availability_rules_insert_own"
    ON public.pandit_availability_rules FOR INSERT
    WITH CHECK (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_availability_rules_update_own" ON public.pandit_availability_rules;
CREATE POLICY "pandit_availability_rules_update_own"
    ON public.pandit_availability_rules FOR UPDATE
    USING (pandit_id = public.get_pandit_id_for_user())
    WITH CHECK (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_availability_rules_delete_own" ON public.pandit_availability_rules;
CREATE POLICY "pandit_availability_rules_delete_own"
    ON public.pandit_availability_rules FOR DELETE
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_availability_rules_all_admin" ON public.pandit_availability_rules;
CREATE POLICY "pandit_availability_rules_all_admin"
    ON public.pandit_availability_rules FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 6.3 pandit_unavailability_blocks
DROP POLICY IF EXISTS "pandit_unavailability_blocks_select_own" ON public.pandit_unavailability_blocks;
CREATE POLICY "pandit_unavailability_blocks_select_own"
    ON public.pandit_unavailability_blocks FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_unavailability_blocks_insert_own" ON public.pandit_unavailability_blocks;
CREATE POLICY "pandit_unavailability_blocks_insert_own"
    ON public.pandit_unavailability_blocks FOR INSERT
    WITH CHECK (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_unavailability_blocks_update_own" ON public.pandit_unavailability_blocks;
CREATE POLICY "pandit_unavailability_blocks_update_own"
    ON public.pandit_unavailability_blocks FOR UPDATE
    USING (pandit_id = public.get_pandit_id_for_user())
    WITH CHECK (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_unavailability_blocks_delete_own" ON public.pandit_unavailability_blocks;
CREATE POLICY "pandit_unavailability_blocks_delete_own"
    ON public.pandit_unavailability_blocks FOR DELETE
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_unavailability_blocks_all_admin" ON public.pandit_unavailability_blocks;
CREATE POLICY "pandit_unavailability_blocks_all_admin"
    ON public.pandit_unavailability_blocks FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- =============================================================================
-- 7. Bookings & Child Domain Policies (Server-Controlled Mutations)
-- =============================================================================

-- 7.1 bookings
DROP POLICY IF EXISTS "bookings_select_customer" ON public.bookings;
CREATE POLICY "bookings_select_customer"
    ON public.bookings FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "bookings_select_pandit" ON public.bookings;
CREATE POLICY "bookings_select_pandit"
    ON public.bookings FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "bookings_select_admin" ON public.bookings;
CREATE POLICY "bookings_select_admin"
    ON public.bookings FOR SELECT
    USING (public.is_admin());

-- 7.2 booking_service_locations
DROP POLICY IF EXISTS "booking_service_locations_select_customer" ON public.booking_service_locations;
CREATE POLICY "booking_service_locations_select_customer"
    ON public.booking_service_locations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = booking_service_locations.booking_id 
              AND b.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "booking_service_locations_select_pandit" ON public.booking_service_locations;
CREATE POLICY "booking_service_locations_select_pandit"
    ON public.booking_service_locations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = booking_service_locations.booking_id 
              AND b.pandit_id = public.get_pandit_id_for_user()
        )
    );

DROP POLICY IF EXISTS "booking_service_locations_select_admin" ON public.booking_service_locations;
CREATE POLICY "booking_service_locations_select_admin"
    ON public.booking_service_locations FOR SELECT
    USING (public.is_admin());

-- 7.3 booking_line_items
DROP POLICY IF EXISTS "booking_line_items_select_customer" ON public.booking_line_items;
CREATE POLICY "booking_line_items_select_customer"
    ON public.booking_line_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = booking_line_items.booking_id 
              AND b.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "booking_line_items_select_pandit" ON public.booking_line_items;
CREATE POLICY "booking_line_items_select_pandit"
    ON public.booking_line_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = booking_line_items.booking_id 
              AND b.pandit_id = public.get_pandit_id_for_user()
        )
    );

DROP POLICY IF EXISTS "booking_line_items_select_admin" ON public.booking_line_items;
CREATE POLICY "booking_line_items_select_admin"
    ON public.booking_line_items FOR SELECT
    USING (public.is_admin());

-- 7.4 booking_reschedule_requests
DROP POLICY IF EXISTS "booking_reschedule_requests_select_customer" ON public.booking_reschedule_requests;
CREATE POLICY "booking_reschedule_requests_select_customer"
    ON public.booking_reschedule_requests FOR SELECT
    USING (
        requested_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = booking_reschedule_requests.booking_id 
              AND b.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "booking_reschedule_requests_select_pandit" ON public.booking_reschedule_requests;
CREATE POLICY "booking_reschedule_requests_select_pandit"
    ON public.booking_reschedule_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = booking_reschedule_requests.booking_id 
              AND b.pandit_id = public.get_pandit_id_for_user()
        )
    );

DROP POLICY IF EXISTS "booking_reschedule_requests_select_admin" ON public.booking_reschedule_requests;
CREATE POLICY "booking_reschedule_requests_select_admin"
    ON public.booking_reschedule_requests FOR SELECT
    USING (public.is_admin());

-- 7.5 booking_cancellations
DROP POLICY IF EXISTS "booking_cancellations_select_customer" ON public.booking_cancellations;
CREATE POLICY "booking_cancellations_select_customer"
    ON public.booking_cancellations FOR SELECT
    USING (
        cancelled_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = booking_cancellations.booking_id 
              AND b.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "booking_cancellations_select_pandit" ON public.booking_cancellations;
CREATE POLICY "booking_cancellations_select_pandit"
    ON public.booking_cancellations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = booking_cancellations.booking_id 
              AND b.pandit_id = public.get_pandit_id_for_user()
        )
    );

DROP POLICY IF EXISTS "booking_cancellations_select_admin" ON public.booking_cancellations;
CREATE POLICY "booking_cancellations_select_admin"
    ON public.booking_cancellations FOR SELECT
    USING (public.is_admin());


-- =============================================================================
-- 8. Payments, Settlements & Remote Live Policies (Server-Controlled Mutations)
-- =============================================================================

-- 8.1 payment_orders
DROP POLICY IF EXISTS "payment_orders_select_customer" ON public.payment_orders;
CREATE POLICY "payment_orders_select_customer"
    ON public.payment_orders FOR SELECT
    USING (
        (booking_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = payment_orders.booking_id 
              AND b.customer_id = auth.uid()
        ))
        OR (kundli_order_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.kundli_orders ko 
            WHERE ko.id = payment_orders.kundli_order_id 
              AND ko.customer_id = auth.uid()
        ))
        OR (subscription_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.astrology_subscriptions sub 
            WHERE sub.id = payment_orders.subscription_id 
              AND sub.customer_id = auth.uid()
        ))
    );

DROP POLICY IF EXISTS "payment_orders_select_admin" ON public.payment_orders;
CREATE POLICY "payment_orders_select_admin"
    ON public.payment_orders FOR SELECT
    USING (public.is_admin());

-- 8.2 payment_transactions
DROP POLICY IF EXISTS "payment_transactions_select_customer" ON public.payment_transactions;
CREATE POLICY "payment_transactions_select_customer"
    ON public.payment_transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.payment_orders po 
            WHERE po.id = payment_transactions.payment_order_id 
              AND (
                (po.booking_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.bookings b 
                    WHERE b.id = po.booking_id AND b.customer_id = auth.uid()
                ))
                OR (po.kundli_order_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.kundli_orders ko 
                    WHERE ko.id = po.kundli_order_id AND ko.customer_id = auth.uid()
                ))
                OR (po.subscription_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.astrology_subscriptions sub 
                    WHERE sub.id = po.subscription_id AND sub.customer_id = auth.uid()
                ))
              )
        )
    );

DROP POLICY IF EXISTS "payment_transactions_select_admin" ON public.payment_transactions;
CREATE POLICY "payment_transactions_select_admin"
    ON public.payment_transactions FOR SELECT
    USING (public.is_admin());

-- 8.3 refunds
DROP POLICY IF EXISTS "refunds_select_customer" ON public.refunds;
CREATE POLICY "refunds_select_customer"
    ON public.refunds FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.payment_transactions pt
            JOIN public.payment_orders po ON po.id = pt.payment_order_id
            WHERE pt.id = refunds.payment_transaction_id
              AND (
                (po.booking_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.bookings b 
                    WHERE b.id = po.booking_id AND b.customer_id = auth.uid()
                ))
                OR (po.kundli_order_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.kundli_orders ko 
                    WHERE ko.id = po.kundli_order_id AND ko.customer_id = auth.uid()
                ))
                OR (po.subscription_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.astrology_subscriptions sub 
                    WHERE sub.id = po.subscription_id AND sub.customer_id = auth.uid()
                ))
              )
        )
    );

DROP POLICY IF EXISTS "refunds_select_admin" ON public.refunds;
CREATE POLICY "refunds_select_admin"
    ON public.refunds FOR SELECT
    USING (public.is_admin());

-- 8.4 live_pricing_rules
DROP POLICY IF EXISTS "live_pricing_rules_select_public" ON public.live_pricing_rules;
CREATE POLICY "live_pricing_rules_select_public"
    ON public.live_pricing_rules FOR SELECT
    USING (
        is_active = true 
        AND (effective_to IS NULL OR effective_to > now())
    );

DROP POLICY IF EXISTS "live_pricing_rules_all_admin" ON public.live_pricing_rules;
CREATE POLICY "live_pricing_rules_all_admin"
    ON public.live_pricing_rules FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 8.5 live_sessions
DROP POLICY IF EXISTS "live_sessions_select_customer" ON public.live_sessions;
CREATE POLICY "live_sessions_select_customer"
    ON public.live_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = live_sessions.booking_id 
              AND b.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "live_sessions_select_pandit" ON public.live_sessions;
CREATE POLICY "live_sessions_select_pandit"
    ON public.live_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = live_sessions.booking_id 
              AND b.pandit_id = public.get_pandit_id_for_user()
        )
    );

DROP POLICY IF EXISTS "live_sessions_select_admin" ON public.live_sessions;
CREATE POLICY "live_sessions_select_admin"
    ON public.live_sessions FOR SELECT
    USING (public.is_admin());

-- 8.6 pandit_payouts (Settlement Ledger: Read-Only for Pandit & Admin)
DROP POLICY IF EXISTS "pandit_payouts_select_pandit" ON public.pandit_payouts;
CREATE POLICY "pandit_payouts_select_pandit"
    ON public.pandit_payouts FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "pandit_payouts_select_admin" ON public.pandit_payouts;
CREATE POLICY "pandit_payouts_select_admin"
    ON public.pandit_payouts FOR SELECT
    USING (public.is_admin());


-- =============================================================================
-- 9. Kundli Domain Policies
-- =============================================================================

-- 9.1 kundli_orders
DROP POLICY IF EXISTS "kundli_orders_select_customer" ON public.kundli_orders;
CREATE POLICY "kundli_orders_select_customer"
    ON public.kundli_orders FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "kundli_orders_select_pandit" ON public.kundli_orders;
CREATE POLICY "kundli_orders_select_pandit"
    ON public.kundli_orders FOR SELECT
    USING (pandit_id = public.get_pandit_id_for_user());

DROP POLICY IF EXISTS "kundli_orders_select_admin" ON public.kundli_orders;
CREATE POLICY "kundli_orders_select_admin"
    ON public.kundli_orders FOR SELECT
    USING (public.is_admin());

-- 9.2 kundli_documents
DROP POLICY IF EXISTS "kundli_documents_select_customer" ON public.kundli_documents;
CREATE POLICY "kundli_documents_select_customer"
    ON public.kundli_documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.kundli_orders ko 
            WHERE ko.id = kundli_documents.kundli_order_id 
              AND ko.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "kundli_documents_select_pandit" ON public.kundli_documents;
CREATE POLICY "kundli_documents_select_pandit"
    ON public.kundli_documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.kundli_orders ko 
            WHERE ko.id = kundli_documents.kundli_order_id 
              AND ko.pandit_id = public.get_pandit_id_for_user()
        )
    );

DROP POLICY IF EXISTS "kundli_documents_insert_pandit" ON public.kundli_documents;
CREATE POLICY "kundli_documents_insert_pandit"
    ON public.kundli_documents FOR INSERT
    WITH CHECK (
        uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.kundli_orders ko 
            WHERE ko.id = kundli_documents.kundli_order_id 
              AND ko.pandit_id = public.get_pandit_id_for_user()
        )
    );

DROP POLICY IF EXISTS "kundli_documents_update_pandit" ON public.kundli_documents;
CREATE POLICY "kundli_documents_update_pandit"
    ON public.kundli_documents FOR UPDATE
    USING (
        uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.kundli_orders ko 
            WHERE ko.id = kundli_documents.kundli_order_id 
              AND ko.pandit_id = public.get_pandit_id_for_user()
        )
    )
    WITH CHECK (
        uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.kundli_orders ko 
            WHERE ko.id = kundli_documents.kundli_order_id 
              AND ko.pandit_id = public.get_pandit_id_for_user()
        )
    );

DROP POLICY IF EXISTS "kundli_documents_select_admin" ON public.kundli_documents;
CREATE POLICY "kundli_documents_select_admin"
    ON public.kundli_documents FOR SELECT
    USING (public.is_admin());


-- =============================================================================
-- 10. Vedic Astrology Domain Policies
-- =============================================================================

-- 10.1 astrology_subscription_plans
DROP POLICY IF EXISTS "astrology_subscription_plans_select_public" ON public.astrology_subscription_plans;
CREATE POLICY "astrology_subscription_plans_select_public"
    ON public.astrology_subscription_plans FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "astrology_subscription_plans_all_admin" ON public.astrology_subscription_plans;
CREATE POLICY "astrology_subscription_plans_all_admin"
    ON public.astrology_subscription_plans FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 10.2 astrology_subscriptions
DROP POLICY IF EXISTS "astrology_subscriptions_select_customer" ON public.astrology_subscriptions;
CREATE POLICY "astrology_subscriptions_select_customer"
    ON public.astrology_subscriptions FOR SELECT
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "astrology_subscriptions_select_admin" ON public.astrology_subscriptions;
CREATE POLICY "astrology_subscriptions_select_admin"
    ON public.astrology_subscriptions FOR SELECT
    USING (public.is_admin());

-- 10.3 astrology_content
DROP POLICY IF EXISTS "astrology_content_select_customer" ON public.astrology_content;
CREATE POLICY "astrology_content_select_customer"
    ON public.astrology_content FOR SELECT
    USING (
        status = 'published'::public.astrology_content_status
        AND publish_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
    );

DROP POLICY IF EXISTS "astrology_content_all_admin" ON public.astrology_content;
CREATE POLICY "astrology_content_all_admin"
    ON public.astrology_content FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 10.4 astrology_deliveries
DROP POLICY IF EXISTS "astrology_deliveries_select_customer" ON public.astrology_deliveries;
CREATE POLICY "astrology_deliveries_select_customer"
    ON public.astrology_deliveries FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.astrology_subscriptions sub 
            WHERE sub.id = astrology_deliveries.subscription_id 
              AND sub.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "astrology_deliveries_select_admin" ON public.astrology_deliveries;
CREATE POLICY "astrology_deliveries_select_admin"
    ON public.astrology_deliveries FOR SELECT
    USING (public.is_admin());


-- =============================================================================
-- 11. Engagement, Configuration & Audit Policies
-- =============================================================================

-- 11.1 reviews
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

DROP POLICY IF EXISTS "reviews_insert_customer" ON public.reviews;
CREATE POLICY "reviews_insert_customer"
    ON public.reviews FOR INSERT
    WITH CHECK (
        customer_id = auth.uid()
        AND visibility_status = 'published'::public.review_visibility_status
        AND EXISTS (
            SELECT 1 FROM public.bookings b 
            WHERE b.id = reviews.booking_id 
              AND b.customer_id = auth.uid() 
              AND b.status = 'completed'
        )
    );

DROP POLICY IF EXISTS "reviews_update_customer" ON public.reviews;
CREATE POLICY "reviews_update_customer"
    ON public.reviews FOR UPDATE
    USING (customer_id = auth.uid())
    WITH CHECK (
        customer_id = auth.uid()
        AND visibility_status = 'published'::public.review_visibility_status
    );

DROP POLICY IF EXISTS "reviews_delete_customer" ON public.reviews;
CREATE POLICY "reviews_delete_customer"
    ON public.reviews FOR DELETE
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "reviews_all_admin" ON public.reviews;
CREATE POLICY "reviews_all_admin"
    ON public.reviews FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 11.2 notifications
DROP POLICY IF EXISTS "notifications_select_recipient" ON public.notifications;
CREATE POLICY "notifications_select_recipient"
    ON public.notifications FOR SELECT
    USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_recipient" ON public.notifications;
CREATE POLICY "notifications_update_recipient"
    ON public.notifications FOR UPDATE
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_select_admin" ON public.notifications;
CREATE POLICY "notifications_select_admin"
    ON public.notifications FOR SELECT
    USING (public.is_admin());

-- 11.3 platform_settings
DROP POLICY IF EXISTS "platform_settings_all_admin" ON public.platform_settings;
CREATE POLICY "platform_settings_all_admin"
    ON public.platform_settings FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 11.4 booking_policy_settings
DROP POLICY IF EXISTS "booking_policy_settings_select_public" ON public.booking_policy_settings;
CREATE POLICY "booking_policy_settings_select_public"
    ON public.booking_policy_settings FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "booking_policy_settings_all_admin" ON public.booking_policy_settings;
CREATE POLICY "booking_policy_settings_all_admin"
    ON public.booking_policy_settings FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 11.5 cancellation_policy_rules
DROP POLICY IF EXISTS "cancellation_policy_rules_select_public" ON public.cancellation_policy_rules;
CREATE POLICY "cancellation_policy_rules_select_public"
    ON public.cancellation_policy_rules FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "cancellation_policy_rules_all_admin" ON public.cancellation_policy_rules;
CREATE POLICY "cancellation_policy_rules_all_admin"
    ON public.cancellation_policy_rules FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 11.6 admin_audit_logs
DROP POLICY IF EXISTS "admin_audit_logs_select_admin" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_logs_select_admin"
    ON public.admin_audit_logs FOR SELECT
    USING (public.is_admin());


-- =============================================================================
-- 12. Privilege Hardening, Granular Grants & Column Protections
-- =============================================================================

-- Revoke default public schema access
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Service Role maintains unrestricted administrative database execution
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 12.1 Anonymous (Unauthenticated) Public Grants
GRANT SELECT ON TABLE 
    public.puja_categories,
    public.puja_services,
    public.pandit_puja_services,
    public.temples,
    public.samagri_items,
    public.samagri_packages,
    public.samagri_package_items,
    public.prasad_items,
    public.astrology_subscription_plans,
    public.live_pricing_rules,
    public.booking_policy_settings,
    public.cancellation_policy_rules,
    public.reviews
TO anon;

-- 12.2 Authenticated User Grants (Subject to Granular RLS & Column Restrictions)

-- Identity Domain: Profiles (Self-service column updates only; lifecycle/status protected)
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (display_name, phone, avatar_url) ON TABLE public.profiles TO authenticated;

-- Role Assignments: Super Admin manages role assignments (enforced by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_roles TO authenticated;

-- Pandit Domain: Editable fields only; status/approval/verification columns strictly protected
GRANT SELECT ON TABLE public.pandit_profiles TO authenticated;
GRANT INSERT (
    user_id,
    bio, 
    years_experience, 
    languages, 
    base_latitude, 
    base_longitude, 
    service_radius_km, 
    public_status
) ON TABLE public.pandit_profiles TO authenticated;

GRANT UPDATE (
    bio, 
    years_experience, 
    languages, 
    base_latitude, 
    base_longitude, 
    service_radius_km, 
    public_status
) ON TABLE public.pandit_profiles TO authenticated;

-- Pandit KYC Documents: Column-restricted INSERT/UPDATE; pending-only DELETE
GRANT SELECT, DELETE ON TABLE public.pandit_documents TO authenticated;
GRANT INSERT (pandit_id, document_type, storage_path) ON TABLE public.pandit_documents TO authenticated;
GRANT UPDATE (document_type, storage_path) ON TABLE public.pandit_documents TO authenticated;

-- Pandit Service Areas & Availability
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    public.pandit_service_areas,
    public.pandit_availability_rules,
    public.pandit_unavailability_blocks
TO authenticated;

-- Pandit Bank Accounts: Read-Only for Authenticated; mutations via trusted server-side Edge Functions
GRANT SELECT ON TABLE public.pandit_bank_accounts TO authenticated;

-- Customer Address Management: Full CRUD for own address records
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.customer_addresses TO authenticated;

-- Public Ritual Catalog & Admin Management (Admin CRUD enforced by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    public.puja_categories,
    public.puja_services,
    public.pandit_puja_services,
    public.temples,
    public.samagri_items,
    public.samagri_packages,
    public.samagri_package_items,
    public.prasad_items,
    public.astrology_subscription_plans,
    public.astrology_content,
    public.live_pricing_rules,
    public.platform_settings,
    public.booking_policy_settings,
    public.cancellation_policy_rules
TO authenticated;

-- Financial, State-Machine & Settlement Tables: Read-Only for Authenticated; mutations via 011 RPCs & service_role
GRANT SELECT ON TABLE 
    public.bookings,
    public.booking_service_locations,
    public.booking_line_items,
    public.booking_reschedule_requests,
    public.booking_cancellations,
    public.payment_orders,
    public.payment_transactions,
    public.refunds,
    public.live_sessions,
    public.pandit_payouts,
    public.kundli_orders,
    public.astrology_subscriptions,
    public.astrology_deliveries,
    public.admin_audit_logs
TO authenticated;

-- Kundli Documents: Pandit uploads/updates for assigned orders; customer downloads
GRANT SELECT, INSERT ON TABLE public.kundli_documents TO authenticated;
GRANT UPDATE (is_current, file_name) ON TABLE public.kundli_documents TO authenticated;

-- Reviews: Customer insert/delete for completed bookings; customer column updates & admin moderation
GRANT SELECT, INSERT, DELETE ON TABLE public.reviews TO authenticated;
GRANT UPDATE (rating, comment, visibility_status) ON TABLE public.reviews TO authenticated;

-- Notifications: Recipient read-state update only
GRANT SELECT ON TABLE public.notifications TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.notifications TO authenticated;

-- 12.3 Helper Function Execution Permissions & Probing Immunity

-- Revoke execution from PUBLIC and anon across all helper signatures
REVOKE EXECUTE ON FUNCTION public.current_user_has_role(public.user_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_has_role(public.user_role, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_pandit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_pandit(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_customer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_customer(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pandit_id_for_user(UUID) FROM PUBLIC, anon;

-- Grant self-evaluating and RLS-supporting functions to authenticated & service_role
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.user_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_pandit() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_customer() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pandit_id_for_user(UUID) TO authenticated, service_role;

-- Parameterized overloads for non-defaulted functions are strictly restricted to service_role ONLY
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.user_role, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_pandit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_customer(UUID) TO service_role;
