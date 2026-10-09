-- =============================================================================
-- Migration: 002_identity.sql
-- Description: Core identity foundation (profiles, user_roles), triggers, and Supabase Auth integration
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper Functions
-- -----------------------------------------------------------------------------

-- Generic updated_at timestamp maintenance trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. Profiles Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    email extensions.citext UNIQUE,
    phone TEXT UNIQUE,
    avatar_url TEXT,
    status public.profile_status NOT NULL DEFAULT 'active'::public.profile_status,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to automatically maintain updated_at on profile modifications
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Index for status filtering (e.g. active, suspended, deleted queries)
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);


-- -----------------------------------------------------------------------------
-- 3. User Roles Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.user_role NOT NULL,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role)
);

-- Indexes for role-based lookups and audit joins
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by ON public.user_roles(assigned_by);


-- -----------------------------------------------------------------------------
-- 4. Automatic Profile Creation on Supabase Auth Signup
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
    v_display_name TEXT;
    v_phone TEXT;
    v_avatar_url TEXT;
BEGIN
    -- Extract and sanitize display name from user metadata, falling back to email prefix or default
    v_display_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        NULLIF(split_part(NEW.email, '@', 1), ''),
        'User'
    );

    -- Extract phone from auth record or metadata
    v_phone := NULLIF(TRIM(COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone')), '');

    -- Extract avatar URL if provided
    v_avatar_url := NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), '');

    -- Insert into public.profiles (linked to auth.users via id)
    INSERT INTO public.profiles (
        id,
        display_name,
        email,
        phone,
        avatar_url,
        status,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        v_display_name,
        NEW.email::extensions.citext,
        v_phone,
        v_avatar_url,
        'active'::public.profile_status,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        updated_at = now();

    -- Every newly authenticated user receives ONLY the baseline 'customer' role.
    -- Privileged/specialized roles ('pandit', 'admin', 'super_admin') cannot be self-assigned
    -- via signup metadata and must be granted through authorized administrative/approval workflows.
    INSERT INTO public.user_roles (
        user_id,
        role,
        assigned_by,
        assigned_at
    ) VALUES (
        NEW.id,
        'customer'::public.user_role,
        NULL,
        now()
    )
    ON CONFLICT (user_id, role) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Trigger on auth.users executed after signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
