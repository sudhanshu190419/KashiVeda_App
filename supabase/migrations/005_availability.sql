-- =============================================================================
-- Migration: 005_availability.sql
-- Description: Customer addresses, Pandit recurring availability, and unavailability blocks
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Customer Addresses Table (Saved Addresses for Home/Temple Checkout)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT,
    pincode TEXT,
    latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on customer_addresses
DROP TRIGGER IF EXISTS trg_customer_addresses_updated_at ON public.customer_addresses;
CREATE TRIGGER trg_customer_addresses_updated_at
    BEFORE UPDATE ON public.customer_addresses
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for customer address lookups, default address resolution, and spatial matching
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON public.customer_addresses(customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_default_address
    ON public.customer_addresses(customer_id)
    WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_customer_addresses_geo
    ON public.customer_addresses
    USING gist (
        (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography)
    )
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. Pandit Availability Rules Table (Recurring Weekly Windows)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pandit_availability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_availability_time_window CHECK (end_time > start_time)
);

-- Indexes for recurring availability lookup by Pandit and day of week
CREATE INDEX IF NOT EXISTS idx_pandit_availability_rules_pandit_id ON public.pandit_availability_rules(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_availability_rules_lookup ON public.pandit_availability_rules(pandit_id, day_of_week) WHERE is_active = true;


-- -----------------------------------------------------------------------------
-- 3. Pandit Unavailability Blocks Table (One-Off & Future Blocked Periods)
-- -----------------------------------------------------------------------------
-- BUSINESS RULE & ARCHITECTURAL NOTE:
-- - "A Pandit cannot block a slot that is already booked."
-- - This table enforces standard range validity (ends_at > starts_at).
-- - Active booking conflict validation (ensuring the blocked period does not overlap
--   with existing confirmed/in-progress bookings) is performed atomically at the RPC/business-logic
--   layer during block creation, preventing lockouts on confirmed customer appointments.

CREATE TABLE IF NOT EXISTS public.pandit_unavailability_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_unavailability_time_range CHECK (ends_at > starts_at)
);

-- Indexes for unavailability range queries and conflict detection
CREATE INDEX IF NOT EXISTS idx_pandit_unavailability_blocks_pandit_id ON public.pandit_unavailability_blocks(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_unavailability_blocks_range ON public.pandit_unavailability_blocks(pandit_id, starts_at, ends_at);
