-- =============================================================================
-- Migration: 040_fix_samagri_prasad_catalog_rls_and_permissions.sql
-- Description: Drop ambiguous 0-argument is_admin overload if present, grant
--              execute permissions on authoritative public.is_admin(UUID) to anon
--              and authenticated roles, and split administrative FOR ALL policies
--              into granular mutation policies (INSERT, UPDATE, DELETE, SELECT)
--              across Samagri and Prasad catalogs.
-- Authoritative Schema: Kashi Veda Platform Catalog
-- =============================================================================

-- 1. Helper Function: Drop ambiguous 0-arg overload if exists, grant execute on authoritative is_admin(UUID)
DROP FUNCTION IF EXISTS public.is_admin();

-- Allow anonymous and authenticated roles to evaluate is_admin(UUID) safely (returns false when unauthenticated)
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated;

-- 2. Samagri Items Catalog (public.samagri_items)
DROP POLICY IF EXISTS "samagri_items_all_admin" ON public.samagri_items;
DROP POLICY IF EXISTS "samagri_items_select_public" ON public.samagri_items;
DROP POLICY IF EXISTS "samagri_items_select_admin" ON public.samagri_items;
DROP POLICY IF EXISTS "samagri_items_insert_admin" ON public.samagri_items;
DROP POLICY IF EXISTS "samagri_items_update_admin" ON public.samagri_items;
DROP POLICY IF EXISTS "samagri_items_delete_admin" ON public.samagri_items;

-- Public read for active catalog items
CREATE POLICY "samagri_items_select_public"
    ON public.samagri_items FOR SELECT
    USING (is_active = true);

-- Admin read for all catalog items (including inactive/draft)
CREATE POLICY "samagri_items_select_admin"
    ON public.samagri_items FOR SELECT
    USING (public.is_admin());

-- Admin CRUD mutations
CREATE POLICY "samagri_items_insert_admin"
    ON public.samagri_items FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "samagri_items_update_admin"
    ON public.samagri_items FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "samagri_items_delete_admin"
    ON public.samagri_items FOR DELETE
    USING (public.is_admin());


-- 3. Samagri Packages (public.samagri_packages)
DROP POLICY IF EXISTS "samagri_packages_all_admin" ON public.samagri_packages;
DROP POLICY IF EXISTS "samagri_packages_select_public" ON public.samagri_packages;
DROP POLICY IF EXISTS "samagri_packages_select_admin" ON public.samagri_packages;
DROP POLICY IF EXISTS "samagri_packages_insert_admin" ON public.samagri_packages;
DROP POLICY IF EXISTS "samagri_packages_update_admin" ON public.samagri_packages;
DROP POLICY IF EXISTS "samagri_packages_delete_admin" ON public.samagri_packages;

CREATE POLICY "samagri_packages_select_public"
    ON public.samagri_packages FOR SELECT
    USING (is_active = true);

CREATE POLICY "samagri_packages_select_admin"
    ON public.samagri_packages FOR SELECT
    USING (public.is_admin());

CREATE POLICY "samagri_packages_insert_admin"
    ON public.samagri_packages FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "samagri_packages_update_admin"
    ON public.samagri_packages FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "samagri_packages_delete_admin"
    ON public.samagri_packages FOR DELETE
    USING (public.is_admin());


-- 4. Samagri Package Items (public.samagri_package_items)
DROP POLICY IF EXISTS "samagri_package_items_all_admin" ON public.samagri_package_items;
DROP POLICY IF EXISTS "samagri_package_items_select_public" ON public.samagri_package_items;
DROP POLICY IF EXISTS "samagri_package_items_select_admin" ON public.samagri_package_items;
DROP POLICY IF EXISTS "samagri_package_items_insert_admin" ON public.samagri_package_items;
DROP POLICY IF EXISTS "samagri_package_items_update_admin" ON public.samagri_package_items;
DROP POLICY IF EXISTS "samagri_package_items_delete_admin" ON public.samagri_package_items;

CREATE POLICY "samagri_package_items_select_public"
    ON public.samagri_package_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.samagri_packages sp 
            WHERE sp.id = samagri_package_items.package_id 
              AND sp.is_active = true
        )
    );

CREATE POLICY "samagri_package_items_select_admin"
    ON public.samagri_package_items FOR SELECT
    USING (public.is_admin());

CREATE POLICY "samagri_package_items_insert_admin"
    ON public.samagri_package_items FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "samagri_package_items_update_admin"
    ON public.samagri_package_items FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "samagri_package_items_delete_admin"
    ON public.samagri_package_items FOR DELETE
    USING (public.is_admin());


-- 5. Prasad Items Catalog (public.prasad_items)
DROP POLICY IF EXISTS "prasad_items_all_admin" ON public.prasad_items;
DROP POLICY IF EXISTS "prasad_items_select_public" ON public.prasad_items;
DROP POLICY IF EXISTS "prasad_items_select_admin" ON public.prasad_items;
DROP POLICY IF EXISTS "prasad_items_insert_admin" ON public.prasad_items;
DROP POLICY IF EXISTS "prasad_items_update_admin" ON public.prasad_items;
DROP POLICY IF EXISTS "prasad_items_delete_admin" ON public.prasad_items;

CREATE POLICY "prasad_items_select_public"
    ON public.prasad_items FOR SELECT
    USING (is_active = true);

CREATE POLICY "prasad_items_select_admin"
    ON public.prasad_items FOR SELECT
    USING (public.is_admin());

CREATE POLICY "prasad_items_insert_admin"
    ON public.prasad_items FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "prasad_items_update_admin"
    ON public.prasad_items FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "prasad_items_delete_admin"
    ON public.prasad_items FOR DELETE
    USING (public.is_admin());


-- 6. Puja Categories & Services Granular Admin Policies
DROP POLICY IF EXISTS "puja_categories_all_admin" ON public.puja_categories;
DROP POLICY IF EXISTS "puja_categories_select_public" ON public.puja_categories;
DROP POLICY IF EXISTS "puja_categories_select_admin" ON public.puja_categories;
DROP POLICY IF EXISTS "puja_categories_insert_admin" ON public.puja_categories;
DROP POLICY IF EXISTS "puja_categories_update_admin" ON public.puja_categories;
DROP POLICY IF EXISTS "puja_categories_delete_admin" ON public.puja_categories;

CREATE POLICY "puja_categories_select_public"
    ON public.puja_categories FOR SELECT
    USING (is_active = true);

CREATE POLICY "puja_categories_select_admin"
    ON public.puja_categories FOR SELECT
    USING (public.is_admin());

CREATE POLICY "puja_categories_insert_admin"
    ON public.puja_categories FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "puja_categories_update_admin"
    ON public.puja_categories FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "puja_categories_delete_admin"
    ON public.puja_categories FOR DELETE
    USING (public.is_admin());


DROP POLICY IF EXISTS "puja_services_all_admin" ON public.puja_services;
DROP POLICY IF EXISTS "puja_services_select_public" ON public.puja_services;
DROP POLICY IF EXISTS "puja_services_select_admin" ON public.puja_services;
DROP POLICY IF EXISTS "puja_services_insert_admin" ON public.puja_services;
DROP POLICY IF EXISTS "puja_services_update_admin" ON public.puja_services;
DROP POLICY IF EXISTS "puja_services_delete_admin" ON public.puja_services;

CREATE POLICY "puja_services_select_public"
    ON public.puja_services FOR SELECT
    USING (is_active = true);

CREATE POLICY "puja_services_select_admin"
    ON public.puja_services FOR SELECT
    USING (public.is_admin());

CREATE POLICY "puja_services_insert_admin"
    ON public.puja_services FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY "puja_services_update_admin"
    ON public.puja_services FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "puja_services_delete_admin"
    ON public.puja_services FOR DELETE
    USING (public.is_admin());
