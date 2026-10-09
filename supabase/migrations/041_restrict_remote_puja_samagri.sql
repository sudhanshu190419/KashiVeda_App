-- =============================================================================
-- Migration: 041_restrict_remote_puja_samagri.sql
-- Description: Enforce backend restriction prohibiting Samagri package or custom
--              item selections for Remote Puja bookings in create_or_validate_booking RPC.
-- Authoritative Schema: Kashi Veda Platform Booking Engine
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

    -- 3. Validate Master Puja Service & Master Catalog Supported Mode
    SELECT * INTO v_puja
    FROM public.puja_services
    WHERE id = p_puja_service_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected Puja ritual is not active or does not exist.';
    END IF;

    IF NOT (p_service_mode = ANY(v_puja.allowed_modes)) THEN
        RAISE EXCEPTION 'Service mode % is not supported for this Puja in catalog.', p_service_mode;
    END IF;

    -- 4. Validate Pandit Offering & Resolve Mode-Specific Authoritative Price
    SELECT * INTO v_pandit_puja
    FROM public.pandit_puja_services
    WHERE pandit_id = p_pandit_id 
      AND puja_service_id = p_puja_service_id 
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit does not offer the requested Puja service.';
    END IF;

    -- Mode-Specific Price Resolution
    IF p_service_mode = 'home' THEN
        v_puja_price := v_pandit_puja.home_price;
    ELSIF p_service_mode = 'temple' THEN
        v_puja_price := v_pandit_puja.temple_price;
    ELSIF p_service_mode = 'remote' THEN
        v_puja_price := v_pandit_puja.remote_price;
    ELSE
        RAISE EXCEPTION 'Invalid service mode: %', p_service_mode;
    END IF;

    -- Strict validation: Pandit must specifically offer the requested mode with price > 0
    IF v_puja_price IS NULL OR v_puja_price <= 0 THEN
        RAISE EXCEPTION 'Selected Pandit does not offer "%" in % mode.', v_puja.name, p_service_mode;
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
            RAISE EXCEPTION 'Customer address is outside the Pandit''s active operational service radius.';
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
    END IF;

    -- 6. Availability Schedule Verification (Day of week & Operating Hours)
    v_dow := EXTRACT(DOW FROM p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata');
    v_start_time := (p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata')::time;
    v_end_time := (v_scheduled_end_at AT TIME ZONE 'Asia/Kolkata')::time;

    IF NOT EXISTS (
        SELECT 1 
        FROM public.pandit_availability_rules par
        WHERE par.pandit_id = p_pandit_id
          AND par.day_of_week = v_dow
          AND par.is_active = true
          AND par.start_time <= v_start_time
          AND par.end_time >= v_end_time
    ) THEN
        RAISE EXCEPTION 'Booking time is outside the Pandit''s configured weekly operating hours.';
    END IF;

    -- 7. Unavailability Blocks Check
    IF EXISTS (
        SELECT 1 
        FROM public.pandit_unavailability_blocks pub
        WHERE pub.pandit_id = p_pandit_id
          AND p_scheduled_start_at < pub.ends_at
          AND v_scheduled_end_at > pub.starts_at
    ) THEN
        RAISE EXCEPTION 'Selected Pandit is unavailable during the requested time window.';
    END IF;

    -- 8. Existing Overlapping Confirmed/Upcoming Bookings Check
    IF EXISTS (
        SELECT 1 
        FROM public.bookings b
        WHERE b.pandit_id = p_pandit_id
          AND b.status IN ('confirmed', 'upcoming', 'in_progress', 'payment_pending')
          AND p_scheduled_start_at < b.scheduled_end_at
          AND v_scheduled_end_at > b.scheduled_start_at
    ) THEN
        RAISE EXCEPTION 'Selected Pandit already has a booking or pending reservation during this time window.';
    END IF;

    -- 9. Samagri Selection & Pricing Verification
    IF p_service_mode = 'remote' THEN
        -- Remote Puja strictly prohibits any Samagri package or custom items
        IF p_samagri_package_id IS NOT NULL OR (p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0) THEN
            RAISE EXCEPTION 'Samagri selections are not permitted for Remote Puja bookings.';
        END IF;
    ELSIF p_samagri_package_id IS NOT NULL THEN
        SELECT * INTO v_package
        FROM public.samagri_packages
        WHERE id = p_samagri_package_id 
          AND puja_service_id = p_puja_service_id 
          AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected Samagri Package does not exist for this Puja service.';
        END IF;

        SELECT COUNT(*) INTO v_pkg_item_count
        FROM public.samagri_package_items
        WHERE samagri_package_id = p_samagri_package_id;

        IF v_pkg_item_count = 0 THEN
            RAISE EXCEPTION 'Selected Samagri Package has no configured items.';
        END IF;

        SELECT COALESCE(SUM(spi.quantity * si.unit_price), 0) INTO v_pkg_calculated_price
        FROM public.samagri_package_items spi
        JOIN public.samagri_items si ON si.id = spi.samagri_item_id
        WHERE spi.samagri_package_id = p_samagri_package_id AND si.is_active = true;

        v_samagri_total := v_pkg_calculated_price;

    ELSIF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
        IF p_custom_samagri_quantities IS NULL OR array_length(p_custom_samagri_quantities, 1) != array_length(p_custom_samagri_item_ids, 1) THEN
            RAISE EXCEPTION 'Mismatch between custom Samagri item IDs and quantities array length.';
        END IF;

        FOR v_idx IN 1..array_length(p_custom_samagri_item_ids, 1) LOOP
            v_item_qty := p_custom_samagri_quantities[v_idx];
            IF v_item_qty <= 0 THEN
                RAISE EXCEPTION 'Quantity for Samagri item must be strictly greater than zero.';
            END IF;

            SELECT * INTO v_samagri_item
            FROM public.samagri_items
            WHERE id = p_custom_samagri_item_ids[v_idx] AND is_active = true;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Samagri item % is inactive or does not exist.', p_custom_samagri_item_ids[v_idx];
            END IF;

            v_item_total := ROUND(v_item_qty * v_samagri_item.unit_price, 2);
            v_samagri_total := v_samagri_total + v_item_total;
        END LOOP;
    END IF;

    -- 10. Prasad Selection & Item-Level Unit Pricing Verification
    IF p_service_mode = 'remote' THEN
        -- Remote Puja strictly prohibits Prasad selections
        IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
            RAISE EXCEPTION 'Prasad selections are not permitted for Remote Puja bookings.';
        END IF;
    ELSIF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
        IF p_prasad_quantities IS NULL OR array_length(p_prasad_quantities, 1) != array_length(p_prasad_item_ids, 1) THEN
            RAISE EXCEPTION 'Mismatch between Prasad item IDs and quantities array length.';
        END IF;

        FOR v_idx IN 1..array_length(p_prasad_item_ids, 1) LOOP
            v_item_qty := p_prasad_quantities[v_idx];
            IF v_item_qty <= 0 THEN
                RAISE EXCEPTION 'Quantity for Prasad item must be strictly greater than zero.';
            END IF;

            SELECT * INTO v_prasad_item
            FROM public.prasad_items
            WHERE id = p_prasad_item_ids[v_idx] AND is_active = true;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Prasad item % is inactive or does not exist.', p_prasad_item_ids[v_idx];
            END IF;

            v_item_price := v_prasad_item.unit_price;
            IF v_item_price IS NULL OR v_item_price < 0 THEN
                RAISE EXCEPTION 'Unit price for Prasad item "%" is not properly configured.', v_prasad_item.name;
            END IF;

            v_item_total := ROUND(v_item_qty * v_item_price, 2);
            v_prasad_total := v_prasad_total + v_item_total;
        END LOOP;
    END IF;

    -- 11. Authoritative Financial Policy Calculation (Canonical booking_policy_settings)
    SELECT * INTO v_policy
    FROM public.booking_policy_settings
    WHERE id = 1;

    IF p_service_mode = 'home' THEN
        v_advance_percent := COALESCE(v_policy.home_advance_percent, 10.00);
    ELSIF p_service_mode = 'remote' THEN
        v_advance_percent := COALESCE(v_policy.remote_advance_percent, 50.00);
    ELSIF p_service_mode = 'temple' THEN
        v_advance_percent := COALESCE(v_policy.temple_advance_percent, 10.00);
    ELSE
        v_advance_percent := 10.00;
    END IF;

    IF v_advance_percent < 0 OR v_advance_percent > 100 THEN
        v_advance_percent := 10.00;
    END IF;

    v_total_amount := v_puja_price + v_samagri_total + v_prasad_total;
    v_advance_amount := ROUND(((v_puja_price * v_advance_percent) / 100.0) + v_samagri_total + v_prasad_total, 2);
    v_balance_amount := v_total_amount - v_advance_amount;

    IF v_advance_amount > v_total_amount THEN
        v_advance_amount := v_total_amount;
        v_balance_amount := 0;
    END IF;

    -- 12. Create Booking Record
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

    -- 13. Create Historical Service Location Snapshot
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
            longitude
        ) VALUES (
            v_booking_id,
            'home'::public.service_mode,
            v_address.id,
            v_address.address_line1 || COALESCE(', ' || v_address.address_line2, ''),
            v_address.city,
            v_address.state,
            v_address.pincode,
            v_address.latitude,
            v_address.longitude
        );
    ELSIF p_service_mode = 'temple' THEN
        INSERT INTO public.booking_service_locations (
            booking_id,
            location_type,
            temple_id,
            temple_name_snapshot,
            city,
            state,
            pincode,
            latitude,
            longitude
        ) VALUES (
            v_booking_id,
            'temple'::public.service_mode,
            v_temple.id,
            v_temple.name,
            v_temple.city,
            v_temple.state,
            v_temple.pincode,
            v_temple.latitude,
            v_temple.longitude
        );
    ELSIF p_service_mode = 'remote' THEN
        INSERT INTO public.booking_service_locations (
            booking_id,
            location_type,
            city,
            state
        ) VALUES (
            v_booking_id,
            'remote'::public.service_mode,
            'Varanasi',
            'Uttar Pradesh'
        );
    END IF;

    -- 14. Create Historical Line Items Snapshots
    -- 14.1 Ritual fee
    INSERT INTO public.booking_line_items (
        booking_id,
        item_type,
        name_snapshot,
        unit_price,
        total_price,
        is_refundable
    ) VALUES (
        v_booking_id,
        'puja'::public.line_item_type,
        v_puja.name || ' (' || p_service_mode || ')',
        v_puja_price,
        v_puja_price,
        true
    );

    -- 14.2 Package samagri items (Only for home/temple)
    IF p_samagri_package_id IS NOT NULL THEN
        INSERT INTO public.booking_line_items (
            booking_id,
            item_type,
            samagri_package_id,
            samagri_item_id,
            name_snapshot,
            unit,
            quantity,
            unit_price,
            total_price,
            is_refundable
        )
        SELECT 
            v_booking_id,
            'samagri'::public.line_item_type,
            p_samagri_package_id,
            si.id,
            si.name,
            si.unit,
            spi.quantity,
            si.unit_price,
            ROUND(spi.quantity * si.unit_price, 2),
            true
        FROM public.samagri_package_items spi
        JOIN public.samagri_items si ON si.id = spi.samagri_item_id
        WHERE spi.samagri_package_id = p_samagri_package_id AND si.is_active = true;
    END IF;

    -- 14.3 Custom samagri items (Only for home/temple)
    IF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
        FOR v_idx IN 1..array_length(p_custom_samagri_item_ids, 1) LOOP
            SELECT * INTO v_samagri_item FROM public.samagri_items WHERE id = p_custom_samagri_item_ids[v_idx];
            v_item_qty := p_custom_samagri_quantities[v_idx];

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
                'samagri'::public.line_item_type,
                v_samagri_item.id,
                v_samagri_item.name,
                v_samagri_item.unit,
                v_item_qty,
                v_samagri_item.unit_price,
                ROUND(v_item_qty * v_samagri_item.unit_price, 2),
                true
            );
        END LOOP;
    END IF;

    -- 14.4 Prasad items
    IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
        FOR v_idx IN 1..array_length(p_prasad_item_ids, 1) LOOP
            SELECT * INTO v_prasad_item FROM public.prasad_items WHERE id = p_prasad_item_ids[v_idx];
            v_item_qty := p_prasad_quantities[v_idx];
            v_item_price := v_prasad_item.unit_price;

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
                'pack',
                v_item_qty,
                v_item_price,
                ROUND(v_item_qty * v_item_price, 2),
                true
            );
        END LOOP;
    END IF;

    -- 15. Create Authoritative Server-Side Advance Payment Order Obligation
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
        'service_mode', p_service_mode,
        'puja_price', v_puja_price,
        'samagri_total', v_samagri_total,
        'prasad_total', v_prasad_total,
        'advance_percent', v_advance_percent,
        'advance_amount', v_advance_amount,
        'balance_amount', v_balance_amount,
        'total_amount', v_total_amount,
        'payment_order_id', v_payment_order_id,
        'scheduled_start_at', p_scheduled_start_at,
        'scheduled_end_at', v_scheduled_end_at
    );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.create_or_validate_booking(UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_or_validate_booking(UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]) TO authenticated, service_role;
