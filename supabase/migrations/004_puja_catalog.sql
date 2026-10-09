-- =============================================================================
-- Migration: 004_puja_catalog.sql
-- Description: Core Puja and Samagri catalog tables, Pandit offerings, temples, and Prasad
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Puja Categories Table (Admin-Managed Discovery Taxonomy)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.puja_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Index for category ordering and active filtering
CREATE INDEX IF NOT EXISTS idx_puja_categories_is_active ON public.puja_categories(is_active, display_order);


-- -----------------------------------------------------------------------------
-- 2. Master Puja Services Table (Master Ritual Catalog)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.puja_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.puja_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    default_duration_minutes INTEGER CHECK (default_duration_minutes > 0),
    allowed_modes public.service_mode[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on puja_services
DROP TRIGGER IF EXISTS trg_puja_services_updated_at ON public.puja_services;
CREATE TRIGGER trg_puja_services_updated_at
    BEFORE UPDATE ON public.puja_services
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for puja service discovery and category joins
CREATE INDEX IF NOT EXISTS idx_puja_services_category_id ON public.puja_services(category_id);
CREATE INDEX IF NOT EXISTS idx_puja_services_is_active ON public.puja_services(is_active);


-- -----------------------------------------------------------------------------
-- 3. Pandit Puja Services Table (Pandit-Specific Offerings & Custom Pricing)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pandit_puja_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE CASCADE,
    puja_service_id UUID NOT NULL REFERENCES public.puja_services(id) ON DELETE CASCADE,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    duration_minutes INTEGER CHECK (duration_minutes > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pandit_puja_service UNIQUE (pandit_id, puja_service_id)
);

-- Trigger to maintain updated_at on pandit_puja_services
DROP TRIGGER IF EXISTS trg_pandit_puja_services_updated_at ON public.pandit_puja_services;
CREATE TRIGGER trg_pandit_puja_services_updated_at
    BEFORE UPDATE ON public.pandit_puja_services
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for Pandit offering lookups, catalog matching, and pricing queries
CREATE INDEX IF NOT EXISTS idx_pandit_puja_services_pandit_id ON public.pandit_puja_services(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_puja_services_puja_service_id ON public.pandit_puja_services(puja_service_id);
CREATE INDEX IF NOT EXISTS idx_pandit_puja_services_is_active ON public.pandit_puja_services(is_active);


-- -----------------------------------------------------------------------------
-- 4. Temples Table (Admin-Managed Temple Directory for Temple Mode)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.temples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for temple location matching and spatial discovery
CREATE INDEX IF NOT EXISTS idx_temples_city ON public.temples(city) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_temples_is_active ON public.temples(is_active);
CREATE INDEX IF NOT EXISTS idx_temples_geo
    ON public.temples
    USING gist (
        (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography)
    )
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 5. Samagri Items Table (Master Item Catalog for Custom Packages)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.samagri_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    unit TEXT NOT NULL DEFAULT 'piece',
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on samagri_items
DROP TRIGGER IF EXISTS trg_samagri_items_updated_at ON public.samagri_items;
CREATE TRIGGER trg_samagri_items_updated_at
    BEFORE UPDATE ON public.samagri_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Index for item catalog filtering
CREATE INDEX IF NOT EXISTS idx_samagri_items_is_active ON public.samagri_items(is_active);


-- -----------------------------------------------------------------------------
-- 6. Samagri Packages Table (Predefined Packages per Puja Service)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.samagri_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    puja_service_id UUID NOT NULL REFERENCES public.puja_services(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on samagri_packages
DROP TRIGGER IF EXISTS trg_samagri_packages_updated_at ON public.samagri_packages;
CREATE TRIGGER trg_samagri_packages_updated_at
    BEFORE UPDATE ON public.samagri_packages
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for puja service package lookups
CREATE INDEX IF NOT EXISTS idx_samagri_packages_puja_service_id ON public.samagri_packages(puja_service_id);
CREATE INDEX IF NOT EXISTS idx_samagri_packages_is_active ON public.samagri_packages(is_active);


-- -----------------------------------------------------------------------------
-- 7. Samagri Package Items Table (Items & Quantities Inside Predefined Packages)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.samagri_package_items (
    package_id UUID NOT NULL REFERENCES public.samagri_packages(id) ON DELETE CASCADE,
    samagri_item_id UUID NOT NULL REFERENCES public.samagri_items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    PRIMARY KEY (package_id, samagri_item_id)
);

-- Index for item dependency lookups
CREATE INDEX IF NOT EXISTS idx_samagri_package_items_samagri_item_id ON public.samagri_package_items(samagri_item_id);


-- -----------------------------------------------------------------------------
-- 8. Prasad Items Table (Optional Prasad Offerings)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.prasad_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for prasad filtering
CREATE INDEX IF NOT EXISTS idx_prasad_items_is_active ON public.prasad_items(is_active);
