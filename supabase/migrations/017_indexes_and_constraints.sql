-- =============================================================================
-- Migration: 017_indexes_and_constraints.sql
-- Description: Final hardening pass for Kashi Veda Phase 1: Missing unique
--              constraints, domain integrity CHECK constraints, foreign-key
--              supporting indexes, and query-path performance indexes.
-- Source of Truth:
--   1. Kashi Veda Phase 1 Development Ready Scope
--   2. Kashi Veda Phase 1 Supabase-Native Implementation Specification
--   3. Actual migrations 001–016
-- =============================================================================

-- =============================================================================
-- 1. Missing Domain Integrity & Financial CHECK Constraints
-- =============================================================================

DO $$
BEGIN
    -- 1.1 Booking Financial Arithmetic Invariant: total_amount = advance_amount + balance_amount
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_bookings_amount_arithmetic'
    ) THEN
        ALTER TABLE public.bookings
            ADD CONSTRAINT chk_bookings_amount_arithmetic
            CHECK (total_amount = advance_amount + balance_amount);
    END IF;

    -- 1.2 Cancellation Refund Arithmetic Invariant: refund_base_amount = refund_amount + deduction_amount
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_booking_cancellations_amount_math'
    ) THEN
        ALTER TABLE public.booking_cancellations
            ADD CONSTRAINT chk_booking_cancellations_amount_math
            CHECK (refund_base_amount = refund_amount + deduction_amount);
    END IF;

    -- 1.3 Payment Order Single-Target Invariant: exactly one obligation target must be populated
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_orders_target'
    ) THEN
        ALTER TABLE public.payment_orders
            ADD CONSTRAINT chk_payment_orders_target
            CHECK (
                (booking_id IS NOT NULL AND kundli_order_id IS NULL AND subscription_id IS NULL) OR
                (booking_id IS NULL AND kundli_order_id IS NOT NULL AND subscription_id IS NULL) OR
                (booking_id IS NULL AND kundli_order_id IS NULL AND subscription_id IS NOT NULL)
            );
    END IF;

    -- 1.4 Booking Policy Settings Singleton Invariant: enforce single-row operational config
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_booking_policy_settings_singleton'
    ) THEN
        ALTER TABLE public.booking_policy_settings
            ADD CONSTRAINT chk_booking_policy_settings_singleton
            CHECK (id = 1);
    END IF;
END $$;


-- =============================================================================
-- 2. Missing Unique Constraints & Invariant Indexes
-- =============================================================================

DO $$
BEGIN
    -- 2.1 Samagri Packages Name Uniqueness per Puja Service
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_samagri_packages_service_name'
    ) THEN
        ALTER TABLE public.samagri_packages
            ADD CONSTRAINT uq_samagri_packages_service_name
            UNIQUE (puja_service_id, name);
    END IF;

    -- 2.2 Prasad Items Name Uniqueness (Master Catalog)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_prasad_items_name'
    ) THEN
        ALTER TABLE public.prasad_items
            ADD CONSTRAINT uq_prasad_items_name
            UNIQUE (name);
    END IF;

    -- 2.3 Astrology Delivery Dispatch Uniqueness: one delivery row per subscriber per content item
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_astrology_deliveries_subscription_content'
    ) THEN
        ALTER TABLE public.astrology_deliveries
            ADD CONSTRAINT uq_astrology_deliveries_subscription_content
            UNIQUE (subscription_id, content_id);
    END IF;
END $$;


-- =============================================================================
-- 3. Query-Path, RLS & Foreign-Key Supporting Indexes
-- =============================================================================

-- 3.1 Pandit Discovery & Status Index: accelerates public Pandit catalog lookups
CREATE INDEX IF NOT EXISTS idx_pandit_profiles_active_discovery
    ON public.pandit_profiles (verification_status, public_status);

-- 3.2 Pandit Kundli Availability Partial Index: accelerates Kundli astrologer selection
CREATE INDEX IF NOT EXISTS idx_pandit_profiles_kundli_enabled
    ON public.pandit_profiles (id, kundli_price)
    WHERE kundli_enabled = true AND verification_status = 'approved';

-- 3.3 Active Astrology Subscriptions Partial Index: accelerates RLS content checks & cron dispatch
CREATE INDEX IF NOT EXISTS idx_astrology_subscriptions_active_customer
    ON public.astrology_subscriptions (customer_id, ends_at)
    WHERE status = 'active';

-- 3.4 Customer Booking History Index: accelerates mobile app booking listing
CREATE INDEX IF NOT EXISTS idx_bookings_customer_history
    ON public.bookings (customer_id, created_at DESC);

-- 3.5 Pandit Active Schedule Partial Index: accelerates conflict detection in booking RPCs
CREATE INDEX IF NOT EXISTS idx_bookings_pandit_active_schedule
    ON public.bookings (pandit_id, scheduled_start_at, scheduled_end_at)
    WHERE status IN ('confirmed', 'upcoming', 'in_progress');

-- 3.6 Booking Service Locations Address FK Supporting Index
CREATE INDEX IF NOT EXISTS idx_booking_service_locations_address_id
    ON public.booking_service_locations (address_id)
    WHERE address_id IS NOT NULL;


-- =============================================================================
-- 4. Architectural Note: Double-Booking Protection Invariant
-- =============================================================================
-- In Kashi Veda Phase 1, double-booking prevention is enforced strictly via
-- atomic transactional row-level locking (SELECT ... FOR UPDATE) and temporal
-- conflict validation inside public.create_or_validate_booking() and
-- public.request_booking_reschedule().
--
-- A PostgreSQL EXCLUDE constraint is intentionally NOT placed on public.bookings
-- because:
-- 1. Bookings progress through non-blocking intermediate states (payment_pending,
--    cancelled, completed, disputed) where strict spatial/temporal exclusion would
--    corrupt legitimate retry workflows and multi-booking history.
-- 2. Transactional locking combined with idx_bookings_pandit_active_schedule provides
--    zero-race-condition safety without schema rigidity.
-- =============================================================================
