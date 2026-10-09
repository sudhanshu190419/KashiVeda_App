-- =============================================================================
-- Migration: 011_business_functions.sql
-- Description: Core business logic functions, booking lifecycle state transitions,
--              server-side money calculations, Kundli fulfillment, Pandit payouts,
--              customer discovery, and minimal compatibility schema reconciliations.
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- =============================================================================
-- 1. Schema Reconciliations
-- =============================================================================

-- 1.1 Settlement Domain: public.pandit_payouts Table
-- Compatibility Note: public.pandit_payouts belongs to the settlement domain (Spec Table 32).
-- Because migrations 001-010 are immutable, it is created here prior to dependent functions.
-- Enforces mandatory verified bank account reference, platform fee ceiling, and mutual exclusivity.
CREATE TABLE IF NOT EXISTS public.pandit_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE RESTRICT,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
    kundli_order_id UUID REFERENCES public.kundli_orders(id) ON DELETE RESTRICT,
    bank_account_id UUID NOT NULL REFERENCES public.pandit_bank_accounts(id) ON DELETE RESTRICT,
    gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
    platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
    net_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
    status public.payout_status NOT NULL DEFAULT 'pending'::public.payout_status,
    provider_payout_id TEXT UNIQUE,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pandit_payouts_fee_limit CHECK (platform_fee <= gross_amount),
    CONSTRAINT chk_pandit_payouts_net_calc CHECK (net_amount = gross_amount - platform_fee),
    CONSTRAINT chk_pandit_payouts_source CHECK (
        (booking_id IS NOT NULL AND kundli_order_id IS NULL) OR
        (booking_id IS NULL AND kundli_order_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pandit_payouts_booking_id 
    ON public.pandit_payouts(booking_id) 
    WHERE booking_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pandit_payouts_kundli_order_id 
    ON public.pandit_payouts(kundli_order_id) 
    WHERE kundli_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pandit_payouts_pandit_id ON public.pandit_payouts(pandit_id);
CREATE INDEX IF NOT EXISTS idx_pandit_payouts_status ON public.pandit_payouts(status);
CREATE INDEX IF NOT EXISTS idx_pandit_payouts_bank_account_id ON public.pandit_payouts(bank_account_id);

-- Enable RLS and isolate sensitive financial payout rows from direct client queries
ALTER TABLE public.pandit_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pandit_payouts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pandit_payouts TO service_role;

-- 1.2 Prasad Pricing Schema Reconciliation
-- Migration 004 created prasad_items without a price column. Prasad is a priced add-on in Phase 1.
ALTER TABLE public.prasad_items 
ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) CHECK (price >= 0);

-- 1.3 Pandit Kundli Capability & Pricing Schema Reconciliation
-- Phase 1 requires Pandit-declared Kundli capability and pricing snapshots rather than hard-coded constants.
ALTER TABLE public.pandit_profiles 
ADD COLUMN IF NOT EXISTS kundli_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS kundli_price NUMERIC(12,2) CHECK (kundli_price IS NULL OR kundli_price >= 0),
ADD COLUMN IF NOT EXISTS kundli_turnaround_days INTEGER CHECK (kundli_turnaround_days IS NULL OR kundli_turnaround_days > 0);

-- 1.4 Booking Policy Settings: Configurable Reschedule Prepone Fee Reconciliation
-- Phase 1 supports configurable prepone fee policy instead of hard-coded constants.
ALTER TABLE public.booking_policy_settings
ADD COLUMN IF NOT EXISTS prepone_fee_amount NUMERIC(12,2) CHECK (prepone_fee_amount IS NULL OR prepone_fee_amount >= 0);


-- =============================================================================
-- 2. Helper Security & Lookup Functions
-- =============================================================================

-- Helper: Check if caller possesses admin / super_admin role
-- Security Guard: Non-admin users can only check their own admin status.
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

    -- Security Guard: Prevent authenticated users from probing roles of other users
    IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
        ) THEN
            RAISE EXCEPTION 'Access denied: You cannot check administrative privileges for other users.';
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

-- Helper: Get pandit_profile ID for a given auth user
-- Security Guard: Non-admin users can only lookup their own Pandit profile mapping.
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

    -- Security Guard: Prevent authenticated users from probing Pandit profile IDs of other users
    IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN
        IF NOT public.is_admin(v_caller_id) THEN
            RAISE EXCEPTION 'Access denied: You cannot lookup Pandit profile mappings for other users.';
        END IF;
    END IF;

    SELECT id INTO v_pandit_id
    FROM public.pandit_profiles 
    WHERE user_id = v_target_user_id 
    LIMIT 1;

    RETURN v_pandit_id;
END;
$$;


-- =============================================================================
-- 3. Business Function: create_or_validate_booking
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_or_validate_booking(
    p_pandit_id UUID,
    p_puja_service_id UUID,
    p_service_mode public.service_mode,
    p_scheduled_start_at TIMESTAMPTZ,
    p_address_id UUID DEFAULT NULL,
    p_temple_id UUID DEFAULT NULL,
    p_samagri_package_id UUID DEFAULT NULL,
    p_custom_samagri_item_ids UUID[] DEFAULT NULL,
    p_custom_samagri_quantities NUMERIC[] DEFAULT NULL,
    p_prasad_item_ids UUID[] DEFAULT NULL,
    p_prasad_quantities NUMERIC[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_customer_id UUID;
    v_pandit RECORD;
    v_puja RECORD;
    v_pandit_puja RECORD;
    v_policy RECORD;
    v_address RECORD;
    v_temple RECORD;
    v_package RECORD;
    v_duration_minutes INTEGER;
    v_scheduled_end_at TIMESTAMPTZ;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_puja_price NUMERIC(12,2);
    v_samagri_total NUMERIC(12,2) := 0;
    v_prasad_total NUMERIC(12,2) := 0;
    v_advance_percent NUMERIC(5,2);
    v_advance_amount NUMERIC(12,2);
    v_balance_amount NUMERIC(12,2);
    v_total_amount NUMERIC(12,2);
    v_booking_id UUID;
    v_booking_number TEXT;
    v_payment_order_id UUID;
    v_idx INTEGER;
    v_pkg_item_count INTEGER;
    v_samagri_item RECORD;
    v_prasad_item RECORD;
    v_item_qty NUMERIC(12,3);
    v_item_total NUMERIC(12,2);
    v_pkg_calculated_price NUMERIC(12,2) := 0;
BEGIN
    -- 1. Verify Authenticated Customer
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a booking.';
    END IF;

    IF p_scheduled_start_at IS NULL OR p_scheduled_start_at <= now() THEN
        RAISE EXCEPTION 'Scheduled booking time must be in the future.';
    END IF;

    -- 2. Concurrency Protection & Pandit Status Validation
    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected Pandit does not exist.';
    END IF;

    IF v_pandit.verification_status != 'approved' THEN
        RAISE EXCEPTION 'Selected Pandit is not currently approved for bookings.';
    END IF;

    -- Enforce Pandit public availability at booking time
    IF v_pandit.public_status != 'available' THEN
        RAISE EXCEPTION 'Selected Pandit is currently unavailable and cannot receive new bookings.';
    END IF;

    -- 3. Validate Master Puja Service & Supported Mode
    SELECT * INTO v_puja
    FROM public.puja_services
    WHERE id = p_puja_service_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected Puja ritual is not active or does not exist.';
    END IF;

    IF NOT (p_service_mode = ANY(v_puja.allowed_modes)) THEN
        RAISE EXCEPTION 'Service mode % is not supported for this Puja.', p_service_mode;
    END IF;

    -- 4. Validate Pandit Offering, Authoritative Price & Configured Duration
    SELECT * INTO v_pandit_puja
    FROM public.pandit_puja_services
    WHERE pandit_id = p_pandit_id 
      AND puja_service_id = p_puja_service_id 
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit does not offer the requested Puja service.';
    END IF;

    v_puja_price := v_pandit_puja.price;
    v_duration_minutes := COALESCE(v_pandit_puja.duration_minutes, v_puja.default_duration_minutes);

    IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN
        RAISE EXCEPTION 'Puja ritual duration is not configured for this offering.';
    END IF;

    v_scheduled_end_at := p_scheduled_start_at + (v_duration_minutes || ' minutes')::interval;

    -- 5. Validate Mode-Specific Location Requirements & Build Safe Snapshots
    IF p_service_mode = 'home' THEN
        IF p_address_id IS NULL THEN
            RAISE EXCEPTION 'Customer address is required for Home Puja bookings.';
        END IF;

        SELECT * INTO v_address
        FROM public.customer_addresses
        WHERE id = p_address_id AND customer_id = v_customer_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Provided address does not belong to the authenticated customer.';
        END IF;

        IF v_address.latitude IS NULL OR v_address.longitude IS NULL THEN
            RAISE EXCEPTION 'Customer address must have valid geographical coordinates for Home service validation.';
        END IF;

        -- Verify Pandit Service Area Coverage using PostGIS
        IF NOT EXISTS (
            SELECT 1 
            FROM public.pandit_service_areas psa
            WHERE psa.pandit_id = p_pandit_id
              AND psa.is_active = true
              AND psa.latitude IS NOT NULL 
              AND psa.longitude IS NOT NULL
              AND extensions.st_dwithin(
                    extensions.st_setsrid(extensions.st_makepoint(psa.longitude, psa.latitude), 4326)::extensions.geography,
                    extensions.st_setsrid(extensions.st_makepoint(v_address.longitude, v_address.latitude), 4326)::extensions.geography,
                    psa.radius_km * 1000
              )
        ) THEN
            RAISE EXCEPTION 'Selected Pandit does not serve the requested Home address location.';
        END IF;

    ELSIF p_service_mode = 'temple' THEN
        IF p_temple_id IS NULL THEN
            RAISE EXCEPTION 'Temple selection is required for Temple Puja bookings.';
        END IF;

        SELECT * INTO v_temple
        FROM public.temples
        WHERE id = p_temple_id AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected Temple is not active or does not exist.';
        END IF;

        -- Verify Pandit Service Area Coverage for Temple location using PostGIS when coordinates are present
        IF v_temple.latitude IS NOT NULL AND v_temple.longitude IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 
                FROM public.pandit_service_areas psa
                WHERE psa.pandit_id = p_pandit_id
                  AND psa.is_active = true
                  AND psa.latitude IS NOT NULL 
                  AND psa.longitude IS NOT NULL
                  AND extensions.st_dwithin(
                        extensions.st_setsrid(extensions.st_makepoint(psa.longitude, psa.latitude), 4326)::extensions.geography,
                        extensions.st_setsrid(extensions.st_makepoint(v_temple.longitude, v_temple.latitude), 4326)::extensions.geography,
                        psa.radius_km * 1000
                  )
            ) THEN
                RAISE EXCEPTION 'Selected Pandit does not serve the requested Temple location.';
            END IF;
        END IF;
    END IF;

    -- 6. Validate Availability & Double-Booking Protection (Asia/Kolkata Timezone)
    v_dow := EXTRACT(DOW FROM (p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
    v_start_time := (p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
    v_end_time := (v_scheduled_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

    -- Recurring weekly availability check
    IF NOT EXISTS (
        SELECT 1 
        FROM public.pandit_availability_rules
        WHERE pandit_id = p_pandit_id
          AND day_of_week = v_dow
          AND is_active = true
          AND start_time <= v_start_time
          AND end_time >= v_end_time
    ) THEN
        RAISE EXCEPTION 'Requested time is outside the Pandit''s weekly working schedule.';
    END IF;

    -- Ad-hoc unavailability blocks check
    IF EXISTS (
        SELECT 1 
        FROM public.pandit_unavailability_blocks
        WHERE pandit_id = p_pandit_id
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange(p_scheduled_start_at, v_scheduled_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Pandit has marked an unavailability block during this time window.';
    END IF;

    -- Check for overlapping active bookings
    IF EXISTS (
        SELECT 1 
        FROM public.bookings
        WHERE pandit_id = p_pandit_id
          AND status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
          AND tstzrange(scheduled_start_at, scheduled_end_at, '[)') && tstzrange(p_scheduled_start_at, v_scheduled_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Selected time slot conflicts with an existing confirmed booking.';
    END IF;

    -- 7. Samagri Package vs Custom Items Mutual Exclusivity & Strict Array Validation
    IF p_samagri_package_id IS NOT NULL AND (
        (p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0) OR
        (p_custom_samagri_quantities IS NOT NULL AND array_length(p_custom_samagri_quantities, 1) > 0)
    ) THEN
        RAISE EXCEPTION 'Cannot select both a predefined Samagri package and custom Samagri items in the same booking.';
    END IF;

    -- Custom Samagri array validation: both must be provided and lengths must match exactly
    IF (p_custom_samagri_item_ids IS NOT NULL AND p_custom_samagri_quantities IS NULL) OR
       (p_custom_samagri_item_ids IS NULL AND p_custom_samagri_quantities IS NOT NULL) OR
       (COALESCE(array_length(p_custom_samagri_item_ids, 1), 0) != COALESCE(array_length(p_custom_samagri_quantities, 1), 0)) THEN
        RAISE EXCEPTION 'Custom Samagri item IDs and quantities arrays must both be provided and have matching lengths.';
    END IF;

    -- Prasad array validation: both must be provided and lengths must match exactly
    IF (p_prasad_item_ids IS NOT NULL AND p_prasad_quantities IS NULL) OR
       (p_prasad_item_ids IS NULL AND p_prasad_quantities IS NOT NULL) OR
       (COALESCE(array_length(p_prasad_item_ids, 1), 0) != COALESCE(array_length(p_prasad_quantities, 1), 0)) THEN
        RAISE EXCEPTION 'Prasad item IDs and quantities arrays must both be provided and have matching lengths.';
    END IF;

    -- 8. Calculate Predefined Samagri Package Server-Side with Full Component Validation
    IF p_samagri_package_id IS NOT NULL THEN
        SELECT * INTO v_package
        FROM public.samagri_packages
        WHERE id = p_samagri_package_id AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected Samagri package is invalid or inactive.';
        END IF;

        IF v_package.puja_service_id != p_puja_service_id THEN
            RAISE EXCEPTION 'Selected Samagri package does not belong to the requested Puja ritual.';
        END IF;

        -- Verify package contains configured items
        SELECT COUNT(*) INTO v_pkg_item_count
        FROM public.samagri_package_items
        WHERE package_id = p_samagri_package_id;

        IF v_pkg_item_count = 0 THEN
            RAISE EXCEPTION 'Selected Samagri package contains no configured items.';
        END IF;

        -- Reject if ANY component is missing, inactive, or has invalid unit_price
        IF EXISTS (
            SELECT 1
            FROM public.samagri_package_items spi
            LEFT JOIN public.samagri_items si ON si.id = spi.samagri_item_id
            WHERE spi.package_id = p_samagri_package_id
              AND (si.id IS NULL OR si.is_active = false OR si.unit_price IS NULL OR si.unit_price < 0 OR spi.quantity <= 0)
        ) THEN
            RAISE EXCEPTION 'Selected Samagri package contains invalid, inactive, or missing component items.';
        END IF;

        -- Compute authoritative package price dynamically from all component items
        SELECT ROUND(SUM(spi.quantity * si.unit_price), 2)
        INTO v_pkg_calculated_price
        FROM public.samagri_package_items spi
        JOIN public.samagri_items si ON si.id = spi.samagri_item_id
        WHERE spi.package_id = p_samagri_package_id;

        v_samagri_total := v_pkg_calculated_price;
    END IF;

    -- Custom Samagri calculation
    IF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
        FOR v_idx IN 1 .. array_length(p_custom_samagri_item_ids, 1) LOOP
            v_item_qty := p_custom_samagri_quantities[v_idx];
            IF v_item_qty IS NULL OR v_item_qty <= 0 THEN
                RAISE EXCEPTION 'Custom Samagri quantity must be greater than zero.';
            END IF;

            SELECT * INTO v_samagri_item
            FROM public.samagri_items
            WHERE id = p_custom_samagri_item_ids[v_idx];

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Samagri item % does not exist.', p_custom_samagri_item_ids[v_idx];
            END IF;

            IF NOT v_samagri_item.is_active THEN
                RAISE EXCEPTION 'Samagri item % is inactive.', v_samagri_item.name;
            END IF;

            IF v_samagri_item.unit_price IS NULL OR v_samagri_item.unit_price < 0 THEN
                RAISE EXCEPTION 'Samagri item % has invalid pricing.', v_samagri_item.name;
            END IF;

            v_samagri_total := v_samagri_total + ROUND(v_samagri_item.unit_price * v_item_qty, 2);
        END LOOP;
    END IF;

    -- 9. Calculate Prasad Server-Side
    IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
        FOR v_idx IN 1 .. array_length(p_prasad_item_ids, 1) LOOP
            v_item_qty := p_prasad_quantities[v_idx];
            IF v_item_qty IS NULL OR v_item_qty <= 0 THEN
                RAISE EXCEPTION 'Prasad quantity must be greater than zero.';
            END IF;

            SELECT * INTO v_prasad_item
            FROM public.prasad_items
            WHERE id = p_prasad_item_ids[v_idx];

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Prasad item % does not exist.', p_prasad_item_ids[v_idx];
            END IF;

            IF NOT v_prasad_item.is_active THEN
                RAISE EXCEPTION 'Prasad item % is inactive.', v_prasad_item.name;
            END IF;

            IF v_prasad_item.price IS NULL OR v_prasad_item.price < 0 THEN
                RAISE EXCEPTION 'Prasad item % has no configured price.', v_prasad_item.name;
            END IF;

            v_prasad_total := v_prasad_total + ROUND(v_prasad_item.price * v_item_qty, 2);
        END LOOP;
    END IF;

    -- 10. Advance Calculation from Policy Settings
    SELECT * INTO v_policy
    FROM public.booking_policy_settings
    WHERE id = 1;

    IF p_service_mode = 'home' THEN
        v_advance_percent := COALESCE(v_policy.home_advance_percent, 10.00);
    ELSIF p_service_mode = 'remote' THEN
        v_advance_percent := COALESCE(v_policy.remote_advance_percent, 50.00);
    ELSIF p_service_mode = 'temple' THEN
        IF v_policy.temple_advance_percent IS NULL THEN
            RAISE EXCEPTION 'Temple Puja advance percentage is not configured.';
        END IF;
        v_advance_percent := v_policy.temple_advance_percent;
    ELSE
        v_advance_percent := 10.00;
    END IF;

    v_total_amount := v_puja_price + v_samagri_total + v_prasad_total;
    -- 100% upfront on Samagri & Prasad + mode-specific advance on ritual price
    v_advance_amount := ROUND((v_puja_price * v_advance_percent / 100.0) + v_samagri_total + v_prasad_total, 2);
    v_balance_amount := v_total_amount - v_advance_amount;

    -- 11. Create Booking Record
    v_booking_number := 'KV-BK-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6));

    INSERT INTO public.bookings (
        booking_number,
        customer_id,
        pandit_id,
        puja_service_id,
        service_mode,
        status,
        scheduled_start_at,
        scheduled_end_at,
        price_snapshot,
        currency,
        advance_percent,
        advance_amount,
        balance_amount,
        total_amount,
        reschedule_count
    ) VALUES (
        v_booking_number,
        v_customer_id,
        p_pandit_id,
        p_puja_service_id,
        p_service_mode,
        'payment_pending'::public.booking_status,
        p_scheduled_start_at,
        v_scheduled_end_at,
        v_puja_price,
        'INR',
        v_advance_percent,
        v_advance_amount,
        v_balance_amount,
        v_total_amount,
        0
    ) RETURNING id INTO v_booking_id;

    -- 12. Create Booking Service Location Snapshot by Mode
    IF p_service_mode = 'home' THEN
        INSERT INTO public.booking_service_locations (
            booking_id,
            location_type,
            address_id,
            address_snapshot,
            city,
            state,
            pincode,
            latitude,
            longitude,
            temple_id,
            temple_name_snapshot
        ) VALUES (
            v_booking_id,
            'home'::public.service_mode,
            v_address.id,
            v_address.address_line1 || COALESCE(', ' || v_address.address_line2, '') || ', ' || v_address.city || COALESCE(', ' || v_address.state, '') || COALESCE(' - ' || v_address.pincode, ''),
            v_address.city,
            v_address.state,
            v_address.pincode,
            v_address.latitude,
            v_address.longitude,
            NULL,
            NULL
        );
    ELSIF p_service_mode = 'temple' THEN
        INSERT INTO public.booking_service_locations (
            booking_id,
            location_type,
            address_id,
            address_snapshot,
            city,
            state,
            pincode,
            latitude,
            longitude,
            temple_id,
            temple_name_snapshot
        ) VALUES (
            v_booking_id,
            'temple'::public.service_mode,
            NULL,
            v_temple.address,
            v_temple.city,
            v_temple.state,
            NULL,
            v_temple.latitude,
            v_temple.longitude,
            v_temple.id,
            v_temple.name
        );
    ELSE
        INSERT INTO public.booking_service_locations (
            booking_id,
            location_type,
            address_id,
            address_snapshot,
            city,
            state,
            pincode,
            latitude,
            longitude,
            temple_id,
            temple_name_snapshot
        ) VALUES (
            v_booking_id,
            'remote'::public.service_mode,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL
        );
    END IF;

    -- 13. Create Line Items
    -- Base Ritual Line Item
    INSERT INTO public.booking_line_items (
        booking_id,
        item_type,
        name_snapshot,
        quantity,
        unit_price,
        total_price,
        is_refundable
    ) VALUES (
        v_booking_id,
        'puja'::public.line_item_type,
        v_puja.name,
        1,
        v_puja_price,
        v_puja_price,
        true
    );

    -- Samagri Package Line Item
    IF p_samagri_package_id IS NOT NULL THEN
        INSERT INTO public.booking_line_items (
            booking_id,
            item_type,
            samagri_package_id,
            name_snapshot,
            quantity,
            unit_price,
            total_price,
            is_refundable
        ) VALUES (
            v_booking_id,
            'samagri_package'::public.line_item_type,
            p_samagri_package_id,
            v_package.name,
            1,
            v_pkg_calculated_price,
            v_pkg_calculated_price,
            true
        );
    END IF;

    -- Custom Samagri Line Items
    IF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
        FOR v_idx IN 1 .. array_length(p_custom_samagri_item_ids, 1) LOOP
            v_item_qty := p_custom_samagri_quantities[v_idx];
            SELECT * INTO v_samagri_item FROM public.samagri_items WHERE id = p_custom_samagri_item_ids[v_idx];
            v_item_total := ROUND(v_samagri_item.unit_price * v_item_qty, 2);

            INSERT INTO public.booking_line_items (
                booking_id,
                item_type,
                samagri_item_id,
                name_snapshot,
                unit,
                quantity,
                unit_price,
                total_price,
                is_refundable
            ) VALUES (
                v_booking_id,
                'samagri_item'::public.line_item_type,
                v_samagri_item.id,
                v_samagri_item.name,
                v_samagri_item.unit,
                v_item_qty,
                v_samagri_item.unit_price,
                v_item_total,
                true
            );
        END LOOP;
    END IF;

    -- Prasad Line Items
    IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
        FOR v_idx IN 1 .. array_length(p_prasad_item_ids, 1) LOOP
            v_item_qty := p_prasad_quantities[v_idx];
            SELECT * INTO v_prasad_item FROM public.prasad_items WHERE id = p_prasad_item_ids[v_idx];
            v_item_total := ROUND(v_prasad_item.price * v_item_qty, 2);

            INSERT INTO public.booking_line_items (
                booking_id,
                item_type,
                prasad_item_id,
                name_snapshot,
                unit,
                quantity,
                unit_price,
                total_price,
                is_refundable
            ) VALUES (
                v_booking_id,
                'prasad'::public.line_item_type,
                v_prasad_item.id,
                v_prasad_item.name,
                NULL,
                v_item_qty,
                v_prasad_item.price,
                v_item_total,
                true
            );
        END LOOP;
    END IF;

    -- 14. Create Authoritative Server-Side Payment Order Obligation
    INSERT INTO public.payment_orders (
        booking_id,
        purpose,
        amount,
        currency,
        status,
        provider
    ) VALUES (
        v_booking_id,
        'booking_advance'::public.payment_order_purpose,
        v_advance_amount,
        'INR',
        'created'::public.payment_order_status,
        'razorpay'
    ) RETURNING id INTO v_payment_order_id;

    RETURN jsonb_build_object(
        'booking_id', v_booking_id,
        'booking_number', v_booking_number,
        'status', 'payment_pending',
        'scheduled_start_at', p_scheduled_start_at,
        'scheduled_end_at', v_scheduled_end_at,
        'total_amount', v_total_amount,
        'advance_amount', v_advance_amount,
        'balance_amount', v_balance_amount,
        'payment_order_id', v_payment_order_id
    );
END;
$$;


-- =============================================================================
-- 4. Business Function: confirm_booking_payment (Trusted Server-Side Only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
    p_payment_order_id UUID,
    p_provider_payment_id TEXT,
    p_verified_amount NUMERIC(12,2),
    p_provider_signature TEXT DEFAULT NULL,
    p_raw_response JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_order RECORD;
    v_booking RECORD;
    v_pandit RECORD;
    v_kundli RECORD;
    v_reschedule RECORD;
    v_existing_tx RECORD;
    v_transaction_id UUID;
    v_refund_id UUID;
    v_result JSONB;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_slot_valid BOOLEAN;
    v_rejection_reason TEXT;
BEGIN
    -- 1. Input Validation: Verified captured amount is strictly required
    IF p_payment_order_id IS NULL OR p_provider_payment_id IS NULL OR p_verified_amount IS NULL THEN
        RAISE EXCEPTION 'Payment order ID, provider payment ID, and verified captured amount are strictly required.';
    END IF;

    -- 2. Fetch & Lock Payment Order FOR UPDATE
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_payment_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_payment_order_id;
    END IF;

    -- 3. Exact Amount Verification: Captured amount must match payment order obligation
    IF p_verified_amount != v_order.amount THEN
        RAISE EXCEPTION 'Verified captured amount (%) does not match payment order obligation amount (%).', p_verified_amount, v_order.amount;
    END IF;

    -- 4. Validate Provider Payment Transaction Idempotency & Conflict Check
    SELECT * INTO v_existing_tx
    FROM public.payment_transactions
    WHERE provider_payment_id = p_provider_payment_id;

    IF FOUND THEN
        IF v_existing_tx.payment_order_id != p_payment_order_id THEN
            RAISE EXCEPTION 'Provider payment ID % is already registered to a different payment order (%).', p_provider_payment_id, v_existing_tx.payment_order_id;
        END IF;

        IF v_existing_tx.amount != p_verified_amount THEN
            RAISE EXCEPTION 'Provider payment ID % has a conflicting recorded transaction amount (%).', p_provider_payment_id, v_existing_tx.amount;
        END IF;

        IF v_existing_tx.status != 'captured' THEN
            RAISE EXCEPTION 'Provider payment ID % is not in captured status (current: %).', p_provider_payment_id, v_existing_tx.status;
        END IF;

        v_transaction_id := v_existing_tx.id;
    END IF;

    -- 5. Idempotency Check: If order is already marked paid
    IF v_order.status = 'paid' THEN
        IF v_existing_tx.id IS NULL THEN
            RAISE EXCEPTION 'Payment order is marked paid but no corresponding transaction exists for provider payment ID %.', p_provider_payment_id;
        END IF;

        -- Return idempotent success response branched by purpose
        IF v_order.purpose IN ('booking_advance', 'booking_balance') AND v_order.booking_id IS NOT NULL THEN
            SELECT * INTO v_booking FROM public.bookings WHERE id = v_order.booking_id;
            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'payment_transaction_id', v_existing_tx.id,
                'confirmed_at', COALESCE(v_booking.confirmed_at, v_existing_tx.paid_at)
            );
        ELSIF v_order.purpose = 'prepone_fee' AND v_order.booking_id IS NOT NULL THEN
            SELECT * INTO v_booking FROM public.bookings WHERE id = v_order.booking_id;
            SELECT * INTO v_reschedule 
            FROM public.booking_reschedule_requests 
            WHERE booking_id = v_booking.id 
              AND change_type = 'prepone' 
              AND fee_amount = v_order.amount
            ORDER BY created_at DESC 
            LIMIT 1;

            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', 'prepone_fee',
                'payment_order_id', v_order.id,
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'reschedule_request_id', v_reschedule.id,
                'reschedule_status', COALESCE(v_reschedule.status::text, 'unknown'),
                'payment_transaction_id', v_existing_tx.id,
                'paid_at', v_existing_tx.paid_at
            );
        ELSIF v_order.purpose = 'kundli' AND v_order.kundli_order_id IS NOT NULL THEN
            SELECT * INTO v_kundli FROM public.kundli_orders WHERE id = v_order.kundli_order_id;
            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'kundli_order_id', v_kundli.id,
                'order_number', v_kundli.order_number,
                'payment_transaction_id', v_existing_tx.id,
                'paid_at', v_existing_tx.paid_at
            );
        ELSE
            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'payment_transaction_id', v_existing_tx.id,
                'paid_at', v_existing_tx.paid_at
            );
        END IF;
    END IF;

    -- 6. Validate Payment Order Pre-Payment State (Only valid unpaid states: created, pending)
    IF v_order.status NOT IN ('created', 'pending') THEN
        RAISE EXCEPTION 'Payment order is in an invalid state for confirmation: %.', v_order.status;
    END IF;

    -- 7. Insert new immutable transaction with exact verified amount if not existing
    IF v_transaction_id IS NULL THEN
        INSERT INTO public.payment_transactions (
            payment_order_id,
            provider_payment_id,
            provider_signature,
            amount,
            status,
            paid_at,
            raw_response
        ) VALUES (
            p_payment_order_id,
            p_provider_payment_id,
            p_provider_signature,
            p_verified_amount,
            'captured'::public.payment_transaction_status,
            now(),
            p_raw_response
        ) RETURNING id INTO v_transaction_id;
    END IF;

    -- 8. Transition Payment Order to 'paid'
    UPDATE public.payment_orders
    SET status = 'paid'::public.payment_order_status,
        updated_at = now()
    WHERE id = p_payment_order_id;

    -- 9. Purpose-Specific State Transition Branching
    CASE v_order.purpose
        -- ------------------------------------------------------------
        -- booking_advance: Confirms initial booking advance payment
        -- ------------------------------------------------------------
        WHEN 'booking_advance' THEN
            IF v_order.booking_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose booking_advance must have an associated booking_id.';
            END IF;

            SELECT * INTO v_booking
            FROM public.bookings
            WHERE id = v_order.booking_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Booking % not found.', v_order.booking_id;
            END IF;

            IF v_booking.status != 'payment_pending' THEN
                RAISE EXCEPTION 'Booking is not in payment_pending state (current state: %).', v_booking.status;
            END IF;

            UPDATE public.bookings
            SET status = 'confirmed'::public.booking_status,
                confirmed_at = now(),
                updated_at = now()
            WHERE id = v_booking.id;

            v_result := jsonb_build_object(
                'status', 'confirmed',
                'purpose', 'booking_advance',
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'payment_transaction_id', v_transaction_id,
                'confirmed_at', now()
            );

        -- ------------------------------------------------------------
        -- booking_balance: Records remaining balance payment without changing booking status
        -- ------------------------------------------------------------
        WHEN 'booking_balance' THEN
            IF v_order.booking_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose booking_balance must have an associated booking_id.';
            END IF;

            SELECT * INTO v_booking
            FROM public.bookings
            WHERE id = v_order.booking_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Booking % not found.', v_order.booking_id;
            END IF;

            -- Balance payment can be received for confirmed, upcoming, in_progress, completed, or rescheduled bookings
            IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'completed', 'rescheduled') THEN
                RAISE EXCEPTION 'Cannot record balance payment for booking in state %.', v_booking.status;
            END IF;

            -- Update booking updated_at timestamp without modifying status
            UPDATE public.bookings
            SET updated_at = now()
            WHERE id = v_booking.id;

            v_result := jsonb_build_object(
                'status', 'balance_paid',
                'purpose', 'booking_balance',
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'amount_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'paid_at', now()
            );

        -- ------------------------------------------------------------
        -- prepone_fee: Revalidates prepone slot under lock; approves or rejects + refunds
        -- ------------------------------------------------------------
        WHEN 'prepone_fee' THEN
            IF v_order.booking_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose prepone_fee must have an associated booking_id.';
            END IF;

            -- Lock Booking Row FOR UPDATE
            SELECT * INTO v_booking
            FROM public.bookings
            WHERE id = v_order.booking_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Booking % not found.', v_order.booking_id;
            END IF;

            -- Lock Pandit Profile Row FOR UPDATE
            SELECT * INTO v_pandit
            FROM public.pandit_profiles
            WHERE id = v_booking.pandit_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Pandit % not found.', v_booking.pandit_id;
            END IF;

            -- Locate and Lock the Pending Prepone Reschedule Request
            SELECT * INTO v_reschedule
            FROM public.booking_reschedule_requests
            WHERE booking_id = v_booking.id
              AND change_type = 'prepone'
              AND status = 'requested'
              AND fee_amount = v_order.amount
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE;

            v_slot_valid := true;
            v_rejection_reason := NULL;

            IF NOT FOUND THEN
                v_slot_valid := false;
                v_rejection_reason := 'No matching pending prepone request found for booking.';
            ELSIF v_booking.reschedule_count >= 1 THEN
                v_slot_valid := false;
                v_rejection_reason := 'Reschedule limit reached. Only 1 reschedule is permitted per booking.';
            ELSIF v_reschedule.requested_start_at <= now() THEN
                v_slot_valid := false;
                v_rejection_reason := 'Requested prepone start time is no longer in the future.';
            ELSIF v_reschedule.requested_end_at <= v_reschedule.requested_start_at THEN
                v_slot_valid := false;
                v_rejection_reason := 'Requested prepone end time is before or equal to start time.';
            ELSIF v_pandit.verification_status != 'approved' OR v_pandit.public_status != 'available' THEN
                v_slot_valid := false;
                v_rejection_reason := 'Pandit is currently not available for bookings.';
            ELSE
                -- Revalidate weekly availability rule (Asia/Kolkata)
                v_dow := EXTRACT(DOW FROM (v_reschedule.requested_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
                v_start_time := (v_reschedule.requested_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
                v_end_time := (v_reschedule.requested_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

                IF NOT EXISTS (
                    SELECT 1 
                    FROM public.pandit_availability_rules
                    WHERE pandit_id = v_booking.pandit_id
                      AND day_of_week = v_dow
                      AND is_active = true
                      AND start_time <= v_start_time
                      AND end_time >= v_end_time
                ) THEN
                    v_slot_valid := false;
                    v_rejection_reason := 'Requested time is outside the Pandit''s weekly working hours.';
                -- Revalidate ad-hoc unavailability blocks
                ELSIF EXISTS (
                    SELECT 1 
                    FROM public.pandit_unavailability_blocks
                    WHERE pandit_id = v_booking.pandit_id
                      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(v_reschedule.requested_start_at, v_reschedule.requested_end_at, '[)')
                ) THEN
                    v_slot_valid := false;
                    v_rejection_reason := 'Pandit has an active unavailability block during the requested time window.';
                -- Revalidate active booking conflicts
                ELSIF EXISTS (
                    SELECT 1 
                    FROM public.bookings
                    WHERE pandit_id = v_booking.pandit_id
                      AND id != v_booking.id
                      AND status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
                      AND tstzrange(scheduled_start_at, scheduled_end_at, '[)') && tstzrange(v_reschedule.requested_start_at, v_reschedule.requested_end_at, '[)')
                ) THEN
                    v_slot_valid := false;
                    v_rejection_reason := 'The requested prepone time slot conflicts with another confirmed booking.';
                END IF;
            END IF;

            -- Apply Outcome: Approved vs Rejected + Refund
            IF NOT v_slot_valid THEN
                -- Mark reschedule request as rejected if record exists
                IF v_reschedule.id IS NOT NULL THEN
                    UPDATE public.booking_reschedule_requests
                    SET status = 'rejected'::public.reschedule_request_status
                    WHERE id = v_reschedule.id;
                END IF;

                -- Create auditable refund instruction against captured prepone transaction
                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    v_order.amount,
                    COALESCE(v_rejection_reason, 'Prepone slot no longer available at payment confirmation time'),
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                -- Booking schedule and reschedule_count remain unchanged
                v_result := jsonb_build_object(
                    'status', 'prepone_rejected',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'rejection_reason', v_rejection_reason,
                    'original_scheduled_start_at', v_booking.scheduled_start_at,
                    'original_scheduled_end_at', v_booking.scheduled_end_at,
                    'refund_required', true,
                    'refund_amount', v_order.amount,
                    'refund_id', v_refund_id,
                    'payment_transaction_id', v_transaction_id
                );
            ELSE
                -- Mark reschedule request as approved
                UPDATE public.booking_reschedule_requests
                SET status = 'approved'::public.reschedule_request_status,
                    approved_at = now()
                WHERE id = v_reschedule.id;

                -- Update booking schedule atomically and increment reschedule count
                UPDATE public.bookings
                SET scheduled_start_at = v_reschedule.requested_start_at,
                    scheduled_end_at = v_reschedule.requested_end_at,
                    reschedule_count = reschedule_count + 1,
                    status = 'rescheduled'::public.booking_status,
                    updated_at = now()
                WHERE id = v_booking.id;

                v_result := jsonb_build_object(
                    'status', 'rescheduled',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'new_start_at', v_reschedule.requested_start_at,
                    'new_end_at', v_reschedule.requested_end_at,
                    'reschedule_count', v_booking.reschedule_count + 1,
                    'payment_transaction_id', v_transaction_id,
                    'approved_at', now()
                );
            END IF;

        -- ------------------------------------------------------------
        -- kundli: Transitions Kundli order to paid state
        -- ------------------------------------------------------------
        WHEN 'kundli' THEN
            IF v_order.kundli_order_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose kundli must have an associated kundli_order_id.';
            END IF;

            SELECT * INTO v_kundli
            FROM public.kundli_orders
            WHERE id = v_order.kundli_order_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Kundli order % not found.', v_order.kundli_order_id;
            END IF;

            IF v_kundli.status != 'payment_pending' THEN
                RAISE EXCEPTION 'Kundli order is not in payment_pending state (current state: %).', v_kundli.status;
            END IF;

            UPDATE public.kundli_orders
            SET status = 'paid'::public.kundli_order_status,
                updated_at = now()
            WHERE id = v_kundli.id;

            v_result := jsonb_build_object(
                'status', 'paid',
                'purpose', 'kundli',
                'kundli_order_id', v_kundli.id,
                'order_number', v_kundli.order_number,
                'amount_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'paid_at', now()
            );

        -- ------------------------------------------------------------
        -- subscription / samagri / live_service / other: Safe generic confirmation
        -- ------------------------------------------------------------
        ELSE
            v_result := jsonb_build_object(
                'status', 'paid',
                'purpose', v_order.purpose,
                'payment_order_id', v_order.id,
                'amount_paid', p_verified_amount,
                'payment_transaction_id', v_transaction_id,
                'paid_at', now()
            );
    END CASE;

    RETURN v_result;
END;
$$;


-- =============================================================================
-- 5. Business Function: calculate_booking_balance
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_booking_balance(
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_total_amount NUMERIC(12,2) := 0;
    v_total_paid NUMERIC(12,2) := 0;
    v_total_refunded NUMERIC(12,2) := 0;
    v_net_paid NUMERIC(12,2) := 0;
    v_outstanding_balance NUMERIC(12,2) := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to calculate booking balance.';
    END IF;

    SELECT b.*, pp.user_id AS pandit_user_id
    INTO v_booking
    FROM public.bookings b
    JOIN public.pandit_profiles pp ON pp.id = b.pandit_id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- Ownership & Authorization Check
    IF v_booking.customer_id != v_caller_id 
       AND v_booking.pandit_user_id != v_caller_id 
       AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You cannot view financial balance for this booking.';
    END IF;

    -- Compute Total from Line Items
    SELECT COALESCE(SUM(total_price), 0) INTO v_total_amount
    FROM public.booking_line_items
    WHERE booking_id = p_booking_id;

    -- Compute Captured Payments across ALL payment orders and transactions
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_total_paid
    FROM public.payment_transactions pt
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = p_booking_id
      AND pt.status IN ('captured', 'refunded', 'partially_refunded');

    -- Compute Processed Refunds across ALL transactions
    SELECT COALESCE(SUM(r.amount), 0) INTO v_total_refunded
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = p_booking_id
      AND r.status = 'processed';

    v_net_paid := v_total_paid - v_total_refunded;
    v_outstanding_balance := GREATEST(v_total_amount - v_net_paid, 0);

    RETURN jsonb_build_object(
        'booking_id', p_booking_id,
        'total_amount', v_total_amount,
        'total_paid', v_total_paid,
        'total_refunded', v_total_refunded,
        'net_paid', v_net_paid,
        'outstanding_balance', v_outstanding_balance
    );
END;
$$;


-- =============================================================================
-- 6. Business Function: request_booking_reschedule
-- =============================================================================

CREATE OR REPLACE FUNCTION public.request_booking_reschedule(
    p_booking_id UUID,
    p_requested_start_at TIMESTAMPTZ,
    p_change_type public.reschedule_change_type DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_policy RECORD;
    v_derived_change_type public.reschedule_change_type;
    v_duration INTERVAL;
    v_requested_end_at TIMESTAMPTZ;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_hours_notice NUMERIC;
    v_fee_amount NUMERIC(12,2) := 0.00;
    v_reschedule_id UUID;
    v_payment_order_id UUID := NULL;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to reschedule a booking.';
    END IF;

    -- 1. Fetch & Lock Booking
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- Ownership Check
    IF v_booking.customer_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only reschedule your own bookings.';
    END IF;

    -- 2. State & Policy Validation
    IF v_booking.status NOT IN ('confirmed', 'upcoming', 'rescheduled') THEN
        RAISE EXCEPTION 'Booking cannot be rescheduled in its current state (%).', v_booking.status;
    END IF;

    IF v_booking.reschedule_count >= 1 THEN
        RAISE EXCEPTION 'Reschedule limit reached. Only 1 reschedule is permitted per booking.';
    END IF;

    IF p_requested_start_at IS NULL OR p_requested_start_at <= now() THEN
        RAISE EXCEPTION 'New scheduled time must be in the future.';
    END IF;

    -- 3. Derive Authoritative Change Type from Timestamp Comparison
    IF p_requested_start_at > v_booking.scheduled_start_at THEN
        v_derived_change_type := 'postpone'::public.reschedule_change_type;
    ELSIF p_requested_start_at < v_booking.scheduled_start_at THEN
        v_derived_change_type := 'prepone'::public.reschedule_change_type;
    ELSE
        RAISE EXCEPTION 'Requested time must be different from current scheduled time.';
    END IF;

    IF p_change_type IS NOT NULL AND p_change_type != v_derived_change_type THEN
        RAISE EXCEPTION 'Supplied change type (%) contradicts requested time direction (%).', p_change_type, v_derived_change_type;
    END IF;

    -- 4. Lock Pandit Row to Prevent Concurrent Double-Booking
    PERFORM 1
    FROM public.pandit_profiles
    WHERE id = v_booking.pandit_id
    FOR UPDATE;

    v_duration := v_booking.scheduled_end_at - v_booking.scheduled_start_at;
    v_requested_end_at := p_requested_start_at + v_duration;

    -- 5. Verify Reschedule Windows and Prepone Fee Policy
    SELECT * INTO v_policy FROM public.booking_policy_settings WHERE id = 1;
    v_hours_notice := EXTRACT(EPOCH FROM (v_booking.scheduled_start_at - now())) / 3600.0;

    IF v_derived_change_type = 'prepone' THEN
        IF v_policy.prepone_window_hours IS NOT NULL AND v_hours_notice < v_policy.prepone_window_hours THEN
            RAISE EXCEPTION 'Preponing requires at least % hours advance notice.', v_policy.prepone_window_hours;
        END IF;

        IF v_policy.prepone_fee_amount IS NULL THEN
            RAISE EXCEPTION 'Prepone fee is not configured.';
        END IF;

        v_fee_amount := v_policy.prepone_fee_amount;
    ELSIF v_derived_change_type = 'postpone' THEN
        IF v_policy.postpone_window_hours IS NOT NULL AND v_hours_notice < v_policy.postpone_window_hours THEN
            RAISE EXCEPTION 'Postponing requires at least % hours advance notice.', v_policy.postpone_window_hours;
        END IF;

        v_fee_amount := 0.00;
    END IF;

    -- 6. Verify Pandit Availability for New Slot (Asia/Kolkata Timezone)
    v_dow := EXTRACT(DOW FROM (p_requested_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
    v_start_time := (p_requested_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
    v_end_time := (v_requested_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

    IF NOT EXISTS (
        SELECT 1 
        FROM public.pandit_availability_rules
        WHERE pandit_id = v_booking.pandit_id
          AND day_of_week = v_dow
          AND is_active = true
          AND start_time <= v_start_time
          AND end_time >= v_end_time
    ) THEN
        RAISE EXCEPTION 'Requested new time slot is outside the Pandit''s working hours.';
    END IF;

    -- Check Unavailability blocks using actual column names: starts_at, ends_at
    IF EXISTS (
        SELECT 1 
        FROM public.pandit_unavailability_blocks
        WHERE pandit_id = v_booking.pandit_id
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange(p_requested_start_at, v_requested_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Pandit is unavailable during the requested new time slot.';
    END IF;

    -- Conflict Check Against Other Confirmed Bookings
    IF EXISTS (
        SELECT 1 
        FROM public.bookings
        WHERE pandit_id = v_booking.pandit_id
          AND id != v_booking.id
          AND status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
          AND tstzrange(scheduled_start_at, scheduled_end_at, '[)') && tstzrange(p_requested_start_at, v_requested_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'The requested new time slot conflicts with an existing booking.';
    END IF;

    -- 7. Apply Transition: If fee > 0, store as requested with payment order obligation; if fee = 0, auto-approve
    IF v_fee_amount > 0.00 THEN
        -- Create payment order obligation for prepone fee
        INSERT INTO public.payment_orders (
            booking_id,
            purpose,
            amount,
            currency,
            status,
            provider
        ) VALUES (
            v_booking.id,
            'prepone_fee'::public.payment_order_purpose,
            v_fee_amount,
            'INR',
            'created'::public.payment_order_status,
            'razorpay'
        ) RETURNING id INTO v_payment_order_id;

        INSERT INTO public.booking_reschedule_requests (
            booking_id,
            requested_by,
            change_type,
            old_start_at,
            old_end_at,
            requested_start_at,
            requested_end_at,
            fee_amount,
            status,
            approved_at
        ) VALUES (
            v_booking.id,
            v_caller_id,
            v_derived_change_type,
            v_booking.scheduled_start_at,
            v_booking.scheduled_end_at,
            p_requested_start_at,
            v_requested_end_at,
            v_fee_amount,
            'requested'::public.reschedule_request_status,
            NULL
        ) RETURNING id INTO v_reschedule_id;

        RETURN jsonb_build_object(
            'status', 'requested',
            'reschedule_request_id', v_reschedule_id,
            'booking_id', v_booking.id,
            'fee_amount', v_fee_amount,
            'payment_order_id', v_payment_order_id,
            'message', 'Reschedule requested. Prepone fee payment required to confirm new time slot.'
        );
    ELSE
        -- Fee is 0: Auto-approve and transition booking schedule slot immediately
        INSERT INTO public.booking_reschedule_requests (
            booking_id,
            requested_by,
            change_type,
            old_start_at,
            old_end_at,
            requested_start_at,
            requested_end_at,
            fee_amount,
            status,
            approved_at
        ) VALUES (
            v_booking.id,
            v_caller_id,
            v_derived_change_type,
            v_booking.scheduled_start_at,
            v_booking.scheduled_end_at,
            p_requested_start_at,
            v_requested_end_at,
            0.00,
            'approved'::public.reschedule_request_status,
            now()
        ) RETURNING id INTO v_reschedule_id;

        UPDATE public.bookings
        SET scheduled_start_at = p_requested_start_at,
            scheduled_end_at = v_requested_end_at,
            reschedule_count = reschedule_count + 1,
            status = 'rescheduled'::public.booking_status,
            updated_at = now()
        WHERE id = v_booking.id;

        RETURN jsonb_build_object(
            'status', 'rescheduled',
            'reschedule_request_id', v_reschedule_id,
            'booking_id', v_booking.id,
            'old_start_at', v_booking.scheduled_start_at,
            'new_start_at', p_requested_start_at,
            'new_end_at', v_requested_end_at,
            'fee_amount', 0.00,
            'reschedule_count', v_booking.reschedule_count + 1
        );
    END IF;
END;
$$;


-- =============================================================================
-- 7. Business Function: cancel_booking_and_calculate_refund
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_booking_and_calculate_refund(
    p_booking_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_rule RECORD;
    v_hours_before NUMERIC;
    v_total_captured NUMERIC(12,2) := 0;
    v_total_already_refunded NUMERIC(12,2) := 0;
    v_net_captured NUMERIC(12,2) := 0;
    v_refundable_line_items_total NUMERIC(12,2) := 0;
    v_refundable_base NUMERIC(12,2) := 0;
    v_refund_percent NUMERIC(5,2) := 0;
    v_refund_amount NUMERIC(12,2) := 0;
    v_deduction_amount NUMERIC(12,2) := 0;
    v_cancellation_id UUID;
    v_remaining_refund NUMERIC(12,2);
    v_tx RECORD;
    v_tx_refunded NUMERIC(12,2);
    v_tx_capacity NUMERIC(12,2);
    v_this_refund NUMERIC(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to cancel a booking.';
    END IF;

    -- 1. Fetch & Lock Booking
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    IF v_booking.customer_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only cancel your own bookings.';
    END IF;

    IF v_booking.status IN ('cancelled', 'completed', 'in_progress') THEN
        RAISE EXCEPTION 'Booking cannot be cancelled in its current state (%).', v_booking.status;
    END IF;

    -- 2. Handle Cancellation during payment_pending (Zero Financial Disbursement)
    IF v_booking.status = 'payment_pending' THEN
        INSERT INTO public.booking_cancellations (
            booking_id,
            cancelled_by,
            cancelled_at,
            reason,
            refund_base_amount,
            deduction_amount,
            refund_amount,
            policy_snapshot
        ) VALUES (
            v_booking.id,
            v_caller_id,
            now(),
            p_reason,
            0,
            0,
            0,
            jsonb_build_object('note', 'Cancelled while payment was pending; no funds captured.')
        ) RETURNING id INTO v_cancellation_id;

        UPDATE public.payment_orders
        SET status = 'cancelled'::public.payment_order_status,
            updated_at = now()
        WHERE booking_id = v_booking.id AND status IN ('created', 'pending');

        UPDATE public.bookings
        SET status = 'cancelled'::public.booking_status,
            cancelled_at = now(),
            updated_at = now()
        WHERE id = v_booking.id;

        RETURN jsonb_build_object(
            'status', 'cancelled',
            'cancellation_id', v_cancellation_id,
            'refund_amount', 0.00,
            'deduction_amount', 0.00
        );
    END IF;

    -- 3. Calculate Total Captured Funds across ALL Transactions
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_total_captured
    FROM public.payment_transactions pt
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = v_booking.id
      AND pt.status IN ('captured', 'refunded', 'partially_refunded');

    -- Calculate Total Already Refunded across ALL Transactions
    SELECT COALESCE(SUM(r.amount), 0) INTO v_total_already_refunded
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    JOIN public.payment_orders po ON po.id = pt.payment_order_id
    WHERE po.booking_id = v_booking.id
      AND r.status IN ('requested', 'processed');

    v_net_captured := GREATEST(v_total_captured - v_total_already_refunded, 0);

    -- 4. Match Applicable Active Cancellation Policy Rule
    v_hours_before := EXTRACT(EPOCH FROM (v_booking.scheduled_start_at - now())) / 3600.0;

    SELECT * INTO v_rule
    FROM public.cancellation_policy_rules
    WHERE is_active = true
      AND min_hours_before <= v_hours_before
      AND (max_hours_before IS NULL OR max_hours_before > v_hours_before)
    ORDER BY min_hours_before DESC
    LIMIT 1;

    IF FOUND THEN
        v_refund_percent := v_rule.refund_percent;

        -- Sum refundable line items excluding non-refundable types defined in policy
        SELECT COALESCE(SUM(total_price), 0) INTO v_refundable_line_items_total
        FROM public.booking_line_items
        WHERE booking_id = v_booking.id
          AND is_refundable = true
          AND NOT (item_type = ANY(v_rule.non_refundable_item_types));

        -- Refund base cannot exceed actual unrefunded paid funds
        v_refundable_base := LEAST(v_refundable_line_items_total, v_net_captured);
        v_refund_amount := ROUND(v_refundable_base * v_refund_percent / 100.0, 2);
        v_deduction_amount := v_net_captured - v_refund_amount;
    ELSE
        -- No matching tier: non-refundable by default
        v_refundable_base := 0;
        v_refund_percent := 0;
        v_refund_amount := 0;
        v_deduction_amount := v_net_captured;
    END IF;

    -- 5. Record Cancellation & Policy Snapshot
    INSERT INTO public.booking_cancellations (
        booking_id,
        cancelled_by,
        cancelled_at,
        reason,
        policy_rule_id,
        refund_base_amount,
        deduction_amount,
        refund_amount,
        policy_snapshot
    ) VALUES (
        v_booking.id,
        v_caller_id,
        now(),
        p_reason,
        v_rule.id,
        v_refundable_base,
        v_deduction_amount,
        v_refund_amount,
        jsonb_build_object(
            'rule_id', v_rule.id,
            'rule_name', v_rule.name,
            'hours_before', v_hours_before,
            'refund_percent', v_refund_percent,
            'non_refundable_items', v_rule.non_refundable_item_types
        )
    ) RETURNING id INTO v_cancellation_id;

    -- 6. Distribute Refund Instruction across Captured Transactions
    v_remaining_refund := v_refund_amount;
    IF v_remaining_refund > 0 THEN
        FOR v_tx IN 
            SELECT pt.id, pt.amount
            FROM public.payment_transactions pt
            JOIN public.payment_orders po ON po.id = pt.payment_order_id
            WHERE po.booking_id = v_booking.id
              AND pt.status IN ('captured', 'refunded', 'partially_refunded')
            ORDER BY pt.created_at ASC
        LOOP
            IF v_remaining_refund <= 0 THEN
                EXIT;
            END IF;

            -- Calculate how much has already been refunded on this transaction
            SELECT COALESCE(SUM(amount), 0) INTO v_tx_refunded
            FROM public.refunds
            WHERE payment_transaction_id = v_tx.id
              AND status IN ('requested', 'processed');

            v_tx_capacity := GREATEST(v_tx.amount - v_tx_refunded, 0);

            IF v_tx_capacity > 0 THEN
                v_this_refund := LEAST(v_remaining_refund, v_tx_capacity);

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_tx.id,
                    v_cancellation_id,
                    v_this_refund,
                    p_reason,
                    'requested'::public.refund_status
                );

                v_remaining_refund := v_remaining_refund - v_this_refund;
            END IF;
        END LOOP;
    END IF;

    -- 7. Cancel Any Remaining Open Payment Orders
    UPDATE public.payment_orders
    SET status = 'cancelled'::public.payment_order_status,
        updated_at = now()
    WHERE booking_id = v_booking.id AND status IN ('created', 'pending');

    -- 8. Transition Booking State
    UPDATE public.bookings
    SET status = 'cancelled'::public.booking_status,
        cancelled_at = now(),
        updated_at = now()
    WHERE id = v_booking.id;

    RETURN jsonb_build_object(
        'status', 'cancelled',
        'cancellation_id', v_cancellation_id,
        'total_captured', v_total_captured,
        'already_refunded', v_total_already_refunded,
        'net_captured', v_net_captured,
        'refund_base_amount', v_refundable_base,
        'refund_percent', v_refund_percent,
        'refund_amount', v_refund_amount,
        'deduction_amount', v_deduction_amount
    );
END;
$$;


-- =============================================================================
-- 8. Business Function: mark_booking_completed
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_booking_completed(
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_booking RECORD;
    v_bank_account_id UUID;
    v_gross_amount NUMERIC(12,2);
    v_platform_fee NUMERIC(12,2) := 0.00;
    v_net_amount NUMERIC(12,2);
    v_payout_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to mark booking completed.';
    END IF;

    -- 1. Fetch & Lock Booking
    SELECT b.*, pp.user_id AS pandit_user_id 
    INTO v_booking
    FROM public.bookings b
    JOIN public.pandit_profiles pp ON pp.id = b.pandit_id
    WHERE b.id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- Authorization: Assigned Pandit or Admin
    IF v_booking.pandit_user_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only the assigned Pandit or Admin can complete this booking.';
    END IF;

    -- Validate Valid Completion States (Must NOT allow payment_pending, cancelled, or duplicate completed)
    IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled') THEN
        RAISE EXCEPTION 'Booking cannot be completed from state %.', v_booking.status;
    END IF;

    -- 2. Verify Verified Default Pandit Bank Account Prior to State Transition
    SELECT id INTO v_bank_account_id
    FROM public.pandit_bank_accounts
    WHERE pandit_id = v_booking.pandit_id
      AND is_default = true
      AND verification_status = 'verified'
    LIMIT 1;

    IF v_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'Pandit does not have a verified default bank account.';
    END IF;

    -- 3. Transition Booking to Completed
    UPDATE public.bookings
    SET status = 'completed'::public.booking_status,
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = v_booking.id;

    -- 4. Calculate Payout from Authoritative Booking Line Items (0% platform fee in Phase 1)
    SELECT COALESCE(SUM(total_price), 0) INTO v_gross_amount
    FROM public.booking_line_items
    WHERE booking_id = v_booking.id;

    v_net_amount := v_gross_amount - v_platform_fee;

    -- 5. Idempotently Insert Payout Record with Verified Bank Account
    SELECT id INTO v_payout_id
    FROM public.pandit_payouts
    WHERE booking_id = v_booking.id;

    IF v_payout_id IS NULL THEN
        INSERT INTO public.pandit_payouts (
            pandit_id,
            booking_id,
            bank_account_id,
            gross_amount,
            platform_fee,
            net_amount,
            status
        ) VALUES (
            v_booking.pandit_id,
            v_booking.id,
            v_bank_account_id,
            v_gross_amount,
            v_platform_fee,
            v_net_amount,
            'pending'::public.payout_status
        ) RETURNING id INTO v_payout_id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'completed',
        'booking_id', v_booking.id,
        'completed_at', now(),
        'payout_id', v_payout_id,
        'payout_amount', v_net_amount
    );
END;
$$;


-- =============================================================================
-- 9. Business Function: create_kundli_order
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_kundli_order(
    p_pandit_id UUID,
    p_date_of_birth DATE,
    p_time_of_birth TIME,
    p_place_of_birth TEXT,
    p_birth_latitude NUMERIC DEFAULT NULL,
    p_birth_longitude NUMERIC DEFAULT NULL,
    p_additional_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_customer_id UUID;
    v_pandit RECORD;
    v_price NUMERIC(12,2);
    v_order_id UUID;
    v_order_number TEXT;
    v_payment_order_id UUID;
BEGIN
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a Kundli order.';
    END IF;

    -- 1. Validate Pandit and Authoritative Kundli Capability & Pricing
    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id AND verification_status = 'approved';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected Pandit is not verified or does not exist.';
    END IF;

    IF NOT v_pandit.kundli_enabled THEN
        RAISE EXCEPTION 'Selected Pandit is not currently offering Kundli services.';
    END IF;

    IF v_pandit.kundli_price IS NULL OR v_pandit.kundli_price < 0 THEN
        RAISE EXCEPTION 'Selected Pandit has not configured a valid Kundli price.';
    END IF;

    v_price := v_pandit.kundli_price;

    -- 2. Create Kundli Order Record
    v_order_number := 'KV-KN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6));

    INSERT INTO public.kundli_orders (
        order_number,
        customer_id,
        pandit_id,
        price,
        currency,
        date_of_birth,
        time_of_birth,
        place_of_birth,
        birth_latitude,
        birth_longitude,
        additional_notes,
        status
    ) VALUES (
        v_order_number,
        v_customer_id,
        p_pandit_id,
        v_price,
        'INR',
        p_date_of_birth,
        p_time_of_birth,
        p_place_of_birth,
        p_birth_latitude,
        p_birth_longitude,
        p_additional_notes,
        'payment_pending'::public.kundli_order_status
    ) RETURNING id INTO v_order_id;

    -- 3. Create 100% Upfront Server-Side Payment Order Obligation
    INSERT INTO public.payment_orders (
        kundli_order_id,
        purpose,
        amount,
        currency,
        status,
        provider
    ) VALUES (
        v_order_id,
        'kundli'::public.payment_order_purpose,
        v_price,
        'INR',
        'created'::public.payment_order_status,
        'razorpay'
    ) RETURNING id INTO v_payment_order_id;

    RETURN jsonb_build_object(
        'kundli_order_id', v_order_id,
        'order_number', v_order_number,
        'status', 'payment_pending',
        'price', v_price,
        'payment_order_id', v_payment_order_id
    );
END;
$$;


-- =============================================================================
-- 10. Business Function: confirm_kundli_and_enable_payout
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirm_kundli_and_enable_payout(
    p_kundli_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_order RECORD;
    v_captured_total NUMERIC(12,2) := 0;
    v_bank_account_id UUID;
    v_payout_id UUID;
    v_gross NUMERIC(12,2);
    v_net NUMERIC(12,2);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to confirm Kundli delivery.';
    END IF;

    -- 1. Fetch & Lock Kundli Order
    SELECT * INTO v_order
    FROM public.kundli_orders
    WHERE id = p_kundli_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Kundli order % not found.', p_kundli_order_id;
    END IF;

    -- Authorize Customer or Admin
    IF v_order.customer_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only confirm delivery of your own Kundli order.';
    END IF;

    -- Idempotency Check for Already Completed Orders
    IF v_order.status = 'completed' THEN
        RETURN jsonb_build_object(
            'status', 'already_completed',
            'kundli_order_id', p_kundli_order_id,
            'completed_at', v_order.completed_at
        );
    END IF;

    -- Strict State Machine Validation: Only permit confirmation from document_uploaded or customer_confirmed
    IF v_order.status NOT IN ('document_uploaded', 'customer_confirmed') THEN
        RAISE EXCEPTION 'Kundli order cannot be confirmed from state %. Order must be in document_uploaded state prior to confirmation.', v_order.status;
    END IF;

    -- 2. Authoritative Payment Verification: Full price must be captured across paid orders
    SELECT COALESCE(SUM(pt.amount), 0) INTO v_captured_total
    FROM public.payment_orders po
    JOIN public.payment_transactions pt ON pt.payment_order_id = po.id
    WHERE po.kundli_order_id = p_kundli_order_id
      AND po.status = 'paid'
      AND pt.status = 'captured';

    IF v_captured_total < v_order.price THEN
        RAISE EXCEPTION 'Cannot confirm Kundli order: Full payment of % has not been captured (captured: %).', v_order.price, v_captured_total;
    END IF;

    -- 3. Verify Active Current Document Exists
    IF NOT EXISTS (
        SELECT 1 
        FROM public.kundli_documents
        WHERE kundli_order_id = p_kundli_order_id AND is_current = true
    ) THEN
        RAISE EXCEPTION 'Cannot confirm Kundli order: No current document has been uploaded yet.';
    END IF;

    -- 4. Verify Verified Default Pandit Bank Account Prior to Settlement
    SELECT id INTO v_bank_account_id
    FROM public.pandit_bank_accounts
    WHERE pandit_id = v_order.pandit_id 
      AND is_default = true
      AND verification_status = 'verified'
    LIMIT 1;

    IF v_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'Pandit does not have a verified default bank account.';
    END IF;

    -- 5. Mark Kundli Order as Completed
    UPDATE public.kundli_orders
    SET status = 'completed'::public.kundli_order_status,
        customer_confirmed_at = COALESCE(customer_confirmed_at, now()),
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = p_kundli_order_id;

    -- 6. Enable Payout Record with Verified Bank Account (0% platform fee in Phase 1)
    v_gross := v_order.price;
    v_net := v_gross;

    SELECT id INTO v_payout_id
    FROM public.pandit_payouts
    WHERE kundli_order_id = p_kundli_order_id;

    IF v_payout_id IS NULL THEN
        INSERT INTO public.pandit_payouts (
            pandit_id,
            kundli_order_id,
            bank_account_id,
            gross_amount,
            platform_fee,
            net_amount,
            status
        ) VALUES (
            v_order.pandit_id,
            p_kundli_order_id,
            v_bank_account_id,
            v_gross,
            0.00,
            v_net,
            'pending'::public.payout_status
        ) RETURNING id INTO v_payout_id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'completed',
        'kundli_order_id', p_kundli_order_id,
        'customer_confirmed_at', now(),
        'payout_id', v_payout_id,
        'payout_amount', v_net
    );
END;
$$;


-- =============================================================================
-- 11. Business Function: calculate_pandit_earnings
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_pandit_earnings(
    p_pandit_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit_user_id UUID;
    v_completed_service_gross NUMERIC(12,2) := 0;
    v_completed_kundli_gross NUMERIC(12,2) := 0;
    v_total_platform_fee NUMERIC(12,2) := 0;
    v_net_payout_value NUMERIC(12,2) := 0;
    v_paid_payout NUMERIC(12,2) := 0;
    v_pending_payout NUMERIC(12,2) := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to calculate earnings.';
    END IF;

    SELECT user_id INTO v_pandit_user_id
    FROM public.pandit_profiles
    WHERE id = p_pandit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit % not found.', p_pandit_id;
    END IF;

    IF v_pandit_user_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only view your own earnings.';
    END IF;

    -- Authoritative calculation derived strictly from public.pandit_payouts settlement ledger
    -- Completed Service (Puja) Gross: active payouts for bookings
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_completed_service_gross
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND booking_id IS NOT NULL
      AND status IN ('pending', 'approved', 'processing', 'paid')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    -- Completed Kundli Gross: active payouts for Kundli orders
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_completed_kundli_gross
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND kundli_order_id IS NOT NULL
      AND status IN ('pending', 'approved', 'processing', 'paid')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    -- Total Platform Fees across all active payouts
    SELECT COALESCE(SUM(platform_fee), 0) INTO v_total_platform_fee
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND status IN ('pending', 'approved', 'processing', 'paid')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    -- Net Payout Value across all active payouts
    SELECT COALESCE(SUM(net_amount), 0) INTO v_net_payout_value
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND status IN ('pending', 'approved', 'processing', 'paid')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    -- Paid Payouts: settled net amount
    SELECT COALESCE(SUM(net_amount), 0) INTO v_paid_payout
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND status = 'paid'
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    -- Pending Payouts: pending, approved, or processing net amount
    SELECT COALESCE(SUM(net_amount), 0) INTO v_pending_payout
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND status IN ('pending', 'approved', 'processing')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    RETURN jsonb_build_object(
        'pandit_id', p_pandit_id,
        'completed_service_gross', v_completed_service_gross,
        'completed_kundli_gross', v_completed_kundli_gross,
        'puja_gross', v_completed_service_gross,
        'kundli_gross', v_completed_kundli_gross,
        'total_gross', (v_completed_service_gross + v_completed_kundli_gross),
        'total_platform_fee', v_total_platform_fee,
        'platform_fee', v_total_platform_fee,
        'net_payout_value', v_net_payout_value,
        'net_earnings', v_net_payout_value,
        'paid_payout', v_paid_payout,
        'paid_payouts', v_paid_payout,
        'pending_payout', v_pending_payout,
        'pending_payouts', v_pending_payout
    );
END;
$$;


-- =============================================================================
-- 12. Business Function: get_customer_pandits
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_customer_pandits(
    p_service_mode public.service_mode DEFAULT NULL,
    p_latitude NUMERIC DEFAULT NULL,
    p_longitude NUMERIC DEFAULT NULL,
    p_puja_service_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    years_experience INTEGER,
    languages TEXT[],
    public_status public.pandit_public_status,
    rating_avg NUMERIC(3,2),
    rating_count BIGINT,
    offering_names TEXT[],
    puja_price NUMERIC(12,2),
    distance_km NUMERIC(6,2),
    kundli_enabled BOOLEAN,
    kundli_price NUMERIC(12,2)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clamped_limit INTEGER;
    v_clamped_offset INTEGER;
BEGIN
    -- 1. Validate Coordinate Ranges when supplied
    IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
        RAISE EXCEPTION 'Latitude must be between -90 and 90 degrees.';
    END IF;

    IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
        RAISE EXCEPTION 'Longitude must be between -180 and 180 degrees.';
    END IF;

    -- 2. Strict Home Mode Validation: Coordinates are mandatory for Home discovery
    IF p_service_mode = 'home' AND (p_latitude IS NULL OR p_longitude IS NULL) THEN
        RAISE EXCEPTION 'Geographical coordinates (latitude and longitude) are required for Home service discovery.';
    END IF;

    -- 3. Safe Pagination Clamping
    v_clamped_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_clamped_offset := GREATEST(COALESCE(p_offset, 0), 0);

    -- 4. Return Filtered Pandit Directory
    RETURN QUERY
    SELECT 
        pp.id,
        pp.user_id,
        pr.display_name,
        pr.avatar_url,
        pp.bio,
        pp.years_experience,
        pp.languages,
        pp.public_status,
        rev.rating_avg,
        COALESCE(rev.rating_count, 0::bigint) AS rating_count,
        offerings.names AS offering_names,
        pps_target.price AS puja_price,
        CASE 
            WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND psa_nearest.latitude IS NOT NULL THEN
                ROUND((extensions.st_distance(
                    extensions.st_setsrid(extensions.st_makepoint(psa_nearest.longitude, psa_nearest.latitude), 4326)::extensions.geography,
                    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
                ) / 1000.0)::numeric, 2)
            ELSE NULL
        END AS distance_km,
        pp.kundli_enabled,
        pp.kundli_price
    FROM public.pandit_profiles pp
    JOIN public.profiles pr ON pr.id = pp.user_id
    -- Aggregate active offerings without multiplying Pandit rows
    LEFT JOIN LATERAL (
        SELECT array_agg(ps.name ORDER BY ps.name) AS names
        FROM public.pandit_puja_services pps
        JOIN public.puja_services ps ON ps.id = pps.puja_service_id
        WHERE pps.pandit_id = pp.id AND pps.is_active = true AND ps.is_active = true
    ) offerings ON true
    -- Target Puja offering if specific Puja is queried
    LEFT JOIN public.pandit_puja_services pps_target 
        ON pps_target.pandit_id = pp.id 
       AND pps_target.puja_service_id = p_puja_service_id 
       AND pps_target.is_active = true
    -- Aggregate published reviews only
    LEFT JOIN LATERAL (
        SELECT 
            ROUND(AVG(r.rating)::numeric, 2) AS rating_avg,
            COUNT(r.id)::bigint AS rating_count
        FROM public.reviews r
        WHERE r.pandit_id = pp.id AND r.visibility_status = 'published'
    ) rev ON true
    -- Find nearest active service area for distance calculation
    LEFT JOIN LATERAL (
        SELECT psa.latitude, psa.longitude, psa.radius_km
        FROM public.pandit_service_areas psa
        WHERE psa.pandit_id = pp.id 
          AND psa.is_active = true
          AND psa.latitude IS NOT NULL 
          AND psa.longitude IS NOT NULL
        ORDER BY CASE 
            WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
                extensions.st_distance(
                    extensions.st_setsrid(extensions.st_makepoint(psa.longitude, psa.latitude), 4326)::extensions.geography,
                    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
                )
            ELSE 0 
        END ASC
        LIMIT 1
    ) psa_nearest ON true
    WHERE pp.verification_status = 'approved'
      -- Home service mode requires active service area covering customer coordinates
      AND (
          p_service_mode IS NULL 
          OR p_service_mode != 'home'
          OR EXISTS (
              SELECT 1 
              FROM public.pandit_service_areas psa_chk
              WHERE psa_chk.pandit_id = pp.id
                AND psa_chk.is_active = true
                AND psa_chk.latitude IS NOT NULL 
                AND psa_chk.longitude IS NOT NULL
                AND extensions.st_dwithin(
                    extensions.st_setsrid(extensions.st_makepoint(psa_chk.longitude, psa_chk.latitude), 4326)::extensions.geography,
                    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
                    psa_chk.radius_km * 1000
                )
          )
      )
      -- Puja service offering filter
      AND (
          p_puja_service_id IS NULL 
          OR pps_target.id IS NOT NULL
      )
    ORDER BY rev.rating_avg DESC NULLS LAST, rev.rating_count DESC, pp.created_at ASC
    LIMIT v_clamped_limit
    OFFSET v_clamped_offset;
END;
$$;


-- =============================================================================
-- 13. Execution Permissions & Access Control Hardening
-- =============================================================================

-- Revoke default public execution from all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pandit_id_for_user(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_or_validate_booking(UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_booking_balance(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_booking_reschedule(UUID, TIMESTAMPTZ, public.reschedule_change_type) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_booking_completed(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_kundli_order(UUID, DATE, TIME, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_kundli_and_enable_payout(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_pandit_earnings(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_pandits(public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

-- Grant Execution Privileges to Authoritative Roles

-- Customer & Pandit Callable Functions
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pandit_id_for_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_or_validate_booking(UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_booking_balance(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_booking_reschedule(UUID, TIMESTAMPTZ, public.reschedule_change_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_and_calculate_refund(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_booking_completed(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_kundli_order(UUID, DATE, TIME, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_kundli_and_enable_payout(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_pandit_earnings(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- Public Customer Discovery
GRANT EXECUTE ON FUNCTION public.get_customer_pandits(public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER) TO anon, authenticated, service_role;

-- Trusted Payment Edge Function Role ONLY
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;
