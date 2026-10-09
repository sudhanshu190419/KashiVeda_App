-- =============================================================================
-- Migration: 006_bookings.sql
-- Description: Core Puja booking lifecycle tables, location snapshots, line items, reschedules, and cancellations
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bookings Table (Core Puja Booking Entity & State Machine)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE RESTRICT,
    puja_service_id UUID NOT NULL REFERENCES public.puja_services(id) ON DELETE RESTRICT,
    service_mode public.service_mode NOT NULL,
    status public.booking_status NOT NULL DEFAULT 'payment_pending'::public.booking_status,
    scheduled_start_at TIMESTAMPTZ NOT NULL,
    scheduled_end_at TIMESTAMPTZ NOT NULL,
    price_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_snapshot >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    advance_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (advance_percent >= 0 AND advance_percent <= 100),
    advance_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
    balance_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    reschedule_count SMALLINT NOT NULL DEFAULT 0 CHECK (reschedule_count >= 0 AND reschedule_count <= 1),
    confirmed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    customer_completed_confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_booking_scheduled_time CHECK (scheduled_end_at > scheduled_start_at)
);

-- Trigger to maintain updated_at on bookings
DROP TRIGGER IF EXISTS trg_bookings_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for customer/pandit queries, calendar scheduling, and status filters
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_pandit_id ON public.bookings(pandit_id);
CREATE INDEX IF NOT EXISTS idx_bookings_puja_service_id ON public.bookings(puja_service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_start ON public.bookings(scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_pandit_schedule ON public.bookings(pandit_id, scheduled_start_at, scheduled_end_at);


-- -----------------------------------------------------------------------------
-- 2. Booking Service Locations Table (Historical Location Snapshot)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booking_service_locations (
    booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
    location_type public.service_mode NOT NULL,
    address_id UUID REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
    address_snapshot TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    latitude NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
    temple_id UUID REFERENCES public.temples(id) ON DELETE SET NULL,
    temple_name_snapshot TEXT
);

-- Indexes for city-level reporting and temple lookups
CREATE INDEX IF NOT EXISTS idx_booking_service_locations_city ON public.booking_service_locations(city);
CREATE INDEX IF NOT EXISTS idx_booking_service_locations_temple_id ON public.booking_service_locations(temple_id) WHERE temple_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 3. Booking Line Items Table (Immutable Pricing & Item Breakdown Snapshot)
-- -----------------------------------------------------------------------------
-- DEFERRED FOREIGN KEY NOTE:
-- - live_session_id is part of the approved line-item schema, but public.live_sessions
--   belongs to a later migration (007_payments / live).
-- - The foreign key constraint will be added in that migration once live_sessions exists.

CREATE TABLE IF NOT EXISTS public.booking_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    item_type public.line_item_type NOT NULL,
    samagri_item_id UUID REFERENCES public.samagri_items(id) ON DELETE SET NULL,
    samagri_package_id UUID REFERENCES public.samagri_packages(id) ON DELETE SET NULL,
    prasad_item_id UUID REFERENCES public.prasad_items(id) ON DELETE SET NULL,
    live_session_id UUID,
    name_snapshot TEXT NOT NULL,
    unit TEXT,
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    total_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
    is_refundable BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for booking item lookups and item type analytics
CREATE INDEX IF NOT EXISTS idx_booking_line_items_booking_id ON public.booking_line_items(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_line_items_item_type ON public.booking_line_items(item_type);


-- -----------------------------------------------------------------------------
-- 4. Booking Reschedule Requests Table (One-Time Customer Reschedule Record)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booking_reschedule_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    change_type public.reschedule_change_type NOT NULL,
    old_start_at TIMESTAMPTZ NOT NULL,
    old_end_at TIMESTAMPTZ NOT NULL,
    requested_start_at TIMESTAMPTZ NOT NULL,
    requested_end_at TIMESTAMPTZ NOT NULL,
    fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
    status public.reschedule_request_status NOT NULL DEFAULT 'requested'::public.reschedule_request_status,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_reschedule_old_time CHECK (old_end_at > old_start_at),
    CONSTRAINT chk_reschedule_requested_time CHECK (requested_end_at > requested_start_at)
);

-- Indexes for reschedule tracking and admin review
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_requests_booking_id ON public.booking_reschedule_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_requests_status ON public.booking_reschedule_requests(status);
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_requests_requested_by ON public.booking_reschedule_requests(requested_by);


-- -----------------------------------------------------------------------------
-- 5. Booking Cancellations Table (Cancellation Record & Policy Snapshot)
-- -----------------------------------------------------------------------------
-- DEFERRED FOREIGN KEY NOTE:
-- - policy_rule_id is part of the approved cancellation schema, but public.cancellation_policy_rules
--   belongs to a later engagement/policy migration (010_engagement).
-- - The foreign key constraint will be added in that migration once cancellation_policy_rules exists.

CREATE TABLE IF NOT EXISTS public.booking_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
    cancelled_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    cancelled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason TEXT,
    policy_rule_id UUID,
    refund_base_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refund_base_amount >= 0),
    deduction_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
    refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
    policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for cancellation lookups and auditing

CREATE INDEX IF NOT EXISTS idx_booking_cancellations_cancelled_by ON public.booking_cancellations(cancelled_by);
