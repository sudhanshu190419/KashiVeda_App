-- =============================================================================
-- Migration: 003_pandit_domain.sql
-- Description: Core Pandit domain tables (profiles, documents, service areas, bank accounts)
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Pandit Profiles Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pandit_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    verification_status public.pandit_verification_status NOT NULL DEFAULT 'pending'::public.pandit_verification_status,
    bio TEXT,
    years_experience INTEGER CHECK (years_experience >= 0),
    languages TEXT[],
    base_latitude NUMERIC(9,6) CHECK (base_latitude BETWEEN -90 AND 90),
    base_longitude NUMERIC(9,6) CHECK (base_longitude BETWEEN -180 AND 180),
    service_radius_km NUMERIC(8,2) CHECK (service_radius_km >= 0),
    public_status public.pandit_public_status NOT NULL DEFAULT 'currently_unavailable'::public.pandit_public_status,
    onboarding_completed_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to automatically maintain updated_at on pandit_profiles
DROP TRIGGER IF EXISTS trg_pandit_profiles_updated_at ON public.pandit_profiles;
CREATE TRIGGER trg_pandit_profiles_updated_at
    BEFORE UPDATE ON public.pandit_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for pandit discovery, verification review, and spatial search
CREATE INDEX IF NOT EXISTS idx_pandit_profiles_verification_status ON public.pandit_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_pandit_profiles_public_status ON public.pandit_profiles(public_status);
CREATE INDEX IF NOT EXISTS idx_pandit_profiles_base_geo
    ON public.pandit_profiles
    USING gist (
        (extensions.st_setsrid(extensions.st_makepoint(base_longitude, base_latitude), 4326)::extensions.geography)
    )
    WHERE base_latitude IS NOT NULL AND base_longitude IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. Pandit Documents Table (Onboarding & Credentials)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pandit_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    verification_status public.document_verification_status NOT NULL DEFAULT 'pending'::public.document_verification_status,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for document verification review and pandit document lookups
CREATE INDEX IF NOT EXISTS idx_pandit_documents_pandit_id ON public.pandit_documents(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_documents_verification_status ON public.pandit_documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_pandit_documents_reviewed_by ON public.pandit_documents(reviewed_by);


-- -----------------------------------------------------------------------------
-- 3. Pandit Service Areas Table (Locations & Geofenced Coverage)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pandit_service_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE CASCADE,
    city TEXT,
    state TEXT,
    pincode TEXT,
    latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
    radius_km NUMERIC(8,2) CHECK (radius_km >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for service-area resolution, postal lookups, and spatial matching
CREATE INDEX IF NOT EXISTS idx_pandit_service_areas_pandit_id ON public.pandit_service_areas(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_service_areas_city ON public.pandit_service_areas(city) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pandit_service_areas_pincode ON public.pandit_service_areas(pincode) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pandit_service_areas_is_active ON public.pandit_service_areas(is_active);
CREATE INDEX IF NOT EXISTS idx_pandit_service_areas_geo
    ON public.pandit_service_areas
    USING gist (
        (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography)
    )
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 4. Pandit Bank Accounts Table (Encrypted / Sensitive Payout Credentials)
-- -----------------------------------------------------------------------------
-- SECURITY IMPLEMENTATION NOTE:
-- - Plaintext bank account numbers must NEVER be written to account_number_encrypted.
-- - Encryption must be performed in a trusted server-side Edge Function prior to database insertion.
-- - Encryption keys and provider secrets must NEVER be present in the React Native client applications.
-- - Database RLS and privileged server-side access controls will be enforced in subsequent migrations.

CREATE TABLE IF NOT EXISTS public.pandit_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE CASCADE,
    account_holder_name TEXT NOT NULL,
    account_number_encrypted TEXT NOT NULL,
    ifsc_code TEXT NOT NULL,
    bank_name TEXT,
    upi_id TEXT,
    verification_status public.bank_account_verification_status NOT NULL DEFAULT 'pending'::public.bank_account_verification_status,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    is_default BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for bank account lookup, admin verification queue, and auditing
CREATE INDEX IF NOT EXISTS idx_pandit_bank_accounts_pandit_id ON public.pandit_bank_accounts(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_bank_accounts_verification_status ON public.pandit_bank_accounts(verification_status);
CREATE INDEX IF NOT EXISTS idx_pandit_bank_accounts_verified_by ON public.pandit_bank_accounts(verified_by);

-- Partial unique index ensuring each Pandit can have at most one default payout bank account
CREATE UNIQUE INDEX IF NOT EXISTS uq_pandit_default_bank_account
    ON public.pandit_bank_accounts(pandit_id)
    WHERE is_default = true;
