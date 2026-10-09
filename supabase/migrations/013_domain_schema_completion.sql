-- =============================================================================
-- Migration: 013_domain_schema_completion.sql
-- Description: Phase 1 domain schema completion: Pandit-specific Kundli configuration,
--              itemized Prasad unit pricing, authoritative server-side price enforcement,
--              and dependent business function reconciliations.
-- Source of Truth: Kashi Veda Phase 1 Development Ready Scope & Supabase Specification
-- Migrations 001-012 are immutable and authoritative.
-- =============================================================================

-- =============================================================================
-- 1. Schema Extensions & Invariants
-- =============================================================================

-- 1.1 Pandit-Specific Kundli Capability & Pricing Configuration
ALTER TABLE public.pandit_profiles
ADD COLUMN IF NOT EXISTS kundli_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS kundli_price NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS kundli_turnaround_days INTEGER;

DO $$
BEGIN
    -- Check constraint for non-negative Kundli pricing
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_profiles_kundli_price'
    ) THEN
        ALTER TABLE public.pandit_profiles
        ADD CONSTRAINT chk_pandit_profiles_kundli_price
        CHECK (kundli_price IS NULL OR kundli_price >= 0);
    END IF;

    -- Check constraint for positive turnaround days
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_profiles_kundli_turnaround'
    ) THEN
        ALTER TABLE public.pandit_profiles
        ADD CONSTRAINT chk_pandit_profiles_kundli_turnaround
        CHECK (kundli_turnaround_days IS NULL OR kundli_turnaround_days > 0);
    END IF;

    -- Strict business invariant: When Kundli is enabled, an authoritative price > 0 is mandatory
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_pandit_profiles_kundli_active_price'
    ) THEN
        ALTER TABLE public.pandit_profiles
        ADD CONSTRAINT chk_pandit_profiles_kundli_active_price
        CHECK ((kundli_enabled = false) OR (kundli_enabled = true AND kundli_price IS NOT NULL AND kundli_price > 0));
    END IF;
END $$;


-- 1.2 Prasad Pricing Schema Reconciliation
-- Ensures public.prasad_items has the authoritative unit_price column with non-negative check
ALTER TABLE public.prasad_items
ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_prasad_items_unit_price'
    ) THEN
        ALTER TABLE public.prasad_items
        ADD CONSTRAINT chk_prasad_items_unit_price
        CHECK (unit_price >= 0);
    END IF;
END $$;

-- Backfill unit_price from legacy price column if present (dynamic SQL protects against catalog parse issues)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'prasad_items' AND column_name = 'price'
    ) THEN
        EXECUTE 'UPDATE public.prasad_items SET unit_price = COALESCE(price, 0) WHERE unit_price = 0 AND price IS NOT NULL AND price > 0';
    END IF;
END $$;


-- =============================================================================
-- 2. Business Functions Reconciliation & Pricing Integrity
-- =============================================================================

-- 2.1 Booking Creation & Validation with Prasad Unit Pricing
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
    v_item_price NUMERIC(12,2);
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
    IF v_puja_price IS NULL OR v_puja_price < 0 THEN
        RAISE EXCEPTION 'Authoritative pricing for Pandit Puja service is not configured.';
    END IF;

    v_duration_minutes := COALESCE(v_pandit_puja.duration_minutes, v_puja.default_duration_minutes);
    IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN
        v_duration_minutes := 60;
    END IF;

    v_scheduled_end_at := p_scheduled_start_at + (v_duration_minutes || ' minutes')::interval;

    -- 5. Service Mode Specific Validation & Geographic Coverage
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

    -- 6. Availability Rules Verification
    v_dow := EXTRACT(DOW FROM (p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
    v_start_time := (p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
    v_end_time := (v_scheduled_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

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

    -- 7. Unavailability Blocks & Existing Booking Overlap Verification
    IF EXISTS (
        SELECT 1
        FROM public.pandit_unavailability_blocks
        WHERE pandit_id = p_pandit_id
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange(p_scheduled_start_at, v_scheduled_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Pandit has marked an unavailability block during this time window.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.bookings
        WHERE pandit_id = p_pandit_id
          AND status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
          AND tstzrange(scheduled_start_at, scheduled_end_at, '[)') && tstzrange(p_scheduled_start_at, v_scheduled_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Selected time slot conflicts with an existing confirmed booking.';
    END IF;

    -- 8. Calculate Samagri Server-Side
    IF p_samagri_package_id IS NOT NULL AND (
        (p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0) OR
        (p_custom_samagri_quantities IS NOT NULL AND array_length(p_custom_samagri_quantities, 1) > 0)
    ) THEN
        RAISE EXCEPTION 'Cannot select both a predefined Samagri package and custom Samagri items in the same booking.';
    END IF;

    IF (p_custom_samagri_item_ids IS NOT NULL AND p_custom_samagri_quantities IS NULL) OR
       (p_custom_samagri_item_ids IS NULL AND p_custom_samagri_quantities IS NOT NULL) OR
       (COALESCE(array_length(p_custom_samagri_item_ids, 1), 0) != COALESCE(array_length(p_custom_samagri_quantities, 1), 0)) THEN
        RAISE EXCEPTION 'Custom Samagri item IDs and quantities arrays must both be provided and have matching lengths.';
    END IF;

    IF (p_prasad_item_ids IS NOT NULL AND p_prasad_quantities IS NULL) OR
       (p_prasad_item_ids IS NULL AND p_prasad_quantities IS NOT NULL) OR
       (COALESCE(array_length(p_prasad_item_ids, 1), 0) != COALESCE(array_length(p_prasad_quantities, 1), 0)) THEN
        RAISE EXCEPTION 'Prasad item IDs and quantities arrays must both be provided and have matching lengths.';
    END IF;

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

        SELECT COUNT(*) INTO v_pkg_item_count
        FROM public.samagri_package_items
        WHERE package_id = p_samagri_package_id;

        IF v_pkg_item_count = 0 THEN
            RAISE EXCEPTION 'Selected Samagri package contains no configured items.';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.samagri_package_items spi
            LEFT JOIN public.samagri_items si ON si.id = spi.samagri_item_id
            WHERE spi.package_id = p_samagri_package_id
              AND (si.id IS NULL OR si.is_active = false OR si.unit_price IS NULL OR si.unit_price < 0 OR spi.quantity <= 0)
        ) THEN
            RAISE EXCEPTION 'Selected Samagri package contains invalid, inactive, or missing component items.';
        END IF;

        SELECT ROUND(SUM(spi.quantity * si.unit_price), 2)
        INTO v_pkg_calculated_price
        FROM public.samagri_package_items spi
        JOIN public.samagri_items si ON si.id = spi.samagri_item_id
        WHERE spi.package_id = p_samagri_package_id;

        v_samagri_total := v_pkg_calculated_price;

    ELSIF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
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

    -- 9. Calculate Prasad Server-Side using Authoritative unit_price
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

            v_item_price := COALESCE(v_prasad_item.unit_price, 0);
            IF v_item_price < 0 THEN
                RAISE EXCEPTION 'Prasad item % has invalid pricing.', v_prasad_item.name;
            END IF;

            v_prasad_total := v_prasad_total + ROUND(v_item_price * v_item_qty, 2);
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

    -- 13. Create Itemized Line Items
    -- Base Ritual Line Item
    INSERT INTO public.booking_line_items (
        booking_id,
        item_type,
        name_snapshot,
        unit,
        quantity,
        unit_price,
        total_price,
        is_refundable
    ) VALUES (
        v_booking_id,
        'puja'::public.line_item_type,
        v_puja.name,
        'ritual',
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
            unit,
            quantity,
            unit_price,
            total_price,
            is_refundable
        ) VALUES (
            v_booking_id,
            'samagri_package'::public.line_item_type,
            p_samagri_package_id,
            v_package.name,
            'package',
            1,
            v_samagri_total,
            v_samagri_total,
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
            v_item_price := COALESCE(v_prasad_item.unit_price, 0);
            v_item_total := ROUND(v_item_price * v_item_qty, 2);

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
                v_item_price,
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
        'puja_price', v_puja_price,
        'samagri_total', v_samagri_total,
        'prasad_total', v_prasad_total,
        'payment_order_id', v_payment_order_id
    );
END;
$$;


-- 2.2 Kundli Order Creation with Authoritative Pandit Pricing Enforcement
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

    IF p_date_of_birth IS NULL OR p_time_of_birth IS NULL OR p_place_of_birth IS NULL OR trim(p_place_of_birth) = '' THEN
        RAISE EXCEPTION 'Date of birth, time of birth, and place of birth are required for Kundli order.';
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

    IF v_pandit.kundli_price IS NULL OR v_pandit.kundli_price <= 0 THEN
        RAISE EXCEPTION 'Selected Pandit has not configured a valid commercial Kundli price.';
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


-- 2.3 Kundli Completion & Settlement Release
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


-- 2.4 Pandit Earnings Calculation Derived from Settlement Ledger
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
    SELECT COALESCE(SUM(gross_amount), 0) INTO v_completed_service_gross
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND booking_id IS NOT NULL
      AND status IN ('pending', 'approved', 'processing', 'paid')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    SELECT COALESCE(SUM(gross_amount), 0) INTO v_completed_kundli_gross
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND kundli_order_id IS NOT NULL
      AND status IN ('pending', 'approved', 'processing', 'paid')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    SELECT COALESCE(SUM(platform_fee), 0) INTO v_total_platform_fee
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND status IN ('pending', 'approved', 'processing', 'paid')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    SELECT COALESCE(SUM(net_amount), 0) INTO v_net_payout_value
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND status IN ('pending', 'approved', 'processing', 'paid')
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

    SELECT COALESCE(SUM(net_amount), 0) INTO v_paid_payout
    FROM public.pandit_payouts
    WHERE pandit_id = p_pandit_id
      AND status = 'paid'
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date);

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


-- 2.5 Customer Pandit Discovery Function
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
    LEFT JOIN LATERAL (
        SELECT array_agg(ps.name ORDER BY ps.name) AS names
        FROM public.pandit_puja_services pps
        JOIN public.puja_services ps ON ps.id = pps.puja_service_id
        WHERE pps.pandit_id = pp.id AND pps.is_active = true AND ps.is_active = true
    ) offerings ON true
    LEFT JOIN public.pandit_puja_services pps_target 
        ON pps_target.pandit_id = pp.id 
       AND pps_target.puja_service_id = p_puja_service_id 
       AND pps_target.is_active = true
    LEFT JOIN LATERAL (
        SELECT 
            ROUND(AVG(r.rating)::numeric, 2) AS rating_avg,
            COUNT(r.id)::bigint AS rating_count
        FROM public.reviews r
        WHERE r.pandit_id = pp.id AND r.visibility_status = 'published'
    ) rev ON true
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
-- 3. Granular Permissions & Column-Level Access Control
-- =============================================================================

-- 3.1 Pandit Profiles: Grant column-level INSERT & UPDATE on new Kundli capability fields
GRANT INSERT (
    kundli_enabled,
    kundli_price,
    kundli_turnaround_days
) ON TABLE public.pandit_profiles TO authenticated;

GRANT UPDATE (
    kundli_enabled,
    kundli_price,
    kundli_turnaround_days
) ON TABLE public.pandit_profiles TO authenticated;

-- 3.2 Function Execution Permissions & Revocations
REVOKE EXECUTE ON FUNCTION public.create_or_validate_booking(
    UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.create_kundli_order(
    UUID, DATE, TIME, TEXT, NUMERIC, NUMERIC, TEXT
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.confirm_kundli_and_enable_payout(
    UUID
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.calculate_pandit_earnings(
    UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.get_customer_pandits(
    public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_or_validate_booking(
    UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_kundli_order(
    UUID, DATE, TIME, TEXT, NUMERIC, NUMERIC, TEXT
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.confirm_kundli_and_enable_payout(
    UUID
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.calculate_pandit_earnings(
    UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_customer_pandits(
    public.service_mode, NUMERIC, NUMERIC, UUID, INTEGER, INTEGER
) TO anon, authenticated, service_role;
