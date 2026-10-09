-- =============================================================================
-- Migration: 033_pandit_available_slots_rpc.sql
-- Description: Create get_pandit_available_slots RPC for Customer slot discovery.
-- Security & Invariants:
--   1. SECURITY DEFINER function to evaluate Pandit availability rules, unavailability
--      blocks, and existing bookings without exposing sensitive customer booking rows.
--   2. Enforces Asia/Kolkata timezone handling and 30-minute interval slot generation.
--   3. Filters out past time slots.
--   4. Validates Pandit approval and availability status.
--   5. Returns safe JSONB payload { available_slots: text[], reason: text }.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_pandit_available_slots(
    p_pandit_id UUID,
    p_date DATE,
    p_duration_minutes INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_verification_status public.pandit_verification_status;
    v_public_status public.pandit_public_status;
    v_duration INTEGER;
    v_dow INTEGER;
    v_rule RECORD;
    v_has_rules BOOLEAN := false;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
    v_curr_slot TIMESTAMPTZ;
    v_curr_end TIMESTAMPTZ;
    v_slots TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 1. Input parameter validation
    IF p_pandit_id IS NULL OR p_date IS NULL THEN
        RETURN jsonb_build_object(
            'available_slots', '[]'::jsonb,
            'reason', 'Pandit ID and date are required.'
        );
    END IF;

    v_duration := COALESCE(p_duration_minutes, 60);
    IF v_duration <= 0 THEN
        v_duration := 60;
    END IF;

    -- 2. Verify Pandit profile exists, is approved, and is publicly available
    SELECT verification_status, public_status 
    INTO v_verification_status, v_public_status
    FROM public.pandit_profiles
    WHERE id = p_pandit_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'available_slots', '[]'::jsonb,
            'reason', 'Pandit profile not found.'
        );
    END IF;

    IF v_verification_status != 'approved' THEN
        RETURN jsonb_build_object(
            'available_slots', '[]'::jsonb,
            'reason', 'Pandit is not approved for bookings.'
        );
    END IF;

    IF v_public_status != 'available' THEN
        RETURN jsonb_build_object(
            'available_slots', '[]'::jsonb,
            'reason', 'Pandit is currently marked unavailable.'
        );
    END IF;

    -- 3. Determine Day of Week for requested date (0 = Sunday, 6 = Saturday)
    v_dow := EXTRACT(DOW FROM p_date)::INTEGER;

    -- 4. Iterate over active availability rules for this day of week
    FOR v_rule IN
        SELECT start_time, end_time
        FROM public.pandit_availability_rules
        WHERE pandit_id = p_pandit_id
          AND day_of_week = v_dow
          AND is_active = true
          AND end_time > start_time
        ORDER BY start_time ASC
    LOOP
        v_has_rules := true;

        -- Construct window start and end in Asia/Kolkata timezone
        v_window_start := (p_date + v_rule.start_time) AT TIME ZONE 'Asia/Kolkata';
        v_window_end := (p_date + v_rule.end_time) AT TIME ZONE 'Asia/Kolkata';

        v_curr_slot := v_window_start;
        WHILE (v_curr_slot + (v_duration || ' minutes')::interval) <= v_window_end LOOP
            v_curr_end := v_curr_slot + (v_duration || ' minutes')::interval;

            -- 4.1 Slot must be in the future
            IF v_curr_slot > now() THEN

                -- 4.2 Check against ad-hoc unavailability blocks
                IF NOT EXISTS (
                    SELECT 1 
                    FROM public.pandit_unavailability_blocks pub
                    WHERE pub.pandit_id = p_pandit_id
                      AND v_curr_slot < pub.ends_at
                      AND v_curr_end > pub.starts_at
                ) 
                -- 4.3 Check against existing active or pending bookings
                AND NOT EXISTS (
                    SELECT 1 
                    FROM public.bookings b
                    WHERE b.pandit_id = p_pandit_id
                      AND b.status IN ('confirmed', 'upcoming', 'in_progress', 'payment_pending')
                      AND v_curr_slot < b.scheduled_end_at
                      AND v_curr_end > b.scheduled_start_at
                ) THEN
                    v_slots := array_append(
                        v_slots, 
                        to_char(v_curr_slot AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS+05:30')
                    );
                END IF;

            END IF;

            -- Step forward by 30-minute interval
            v_curr_slot := v_curr_slot + interval '30 minutes';
        END LOOP;
    END LOOP;

    -- 5. Evaluate final results
    IF NOT v_has_rules THEN
        RETURN jsonb_build_object(
            'available_slots', '[]'::jsonb,
            'reason', 'Pandit has not scheduled working hours on this day of the week.'
        );
    END IF;

    IF array_length(v_slots, 1) IS NULL OR array_length(v_slots, 1) = 0 THEN
        RETURN jsonb_build_object(
            'available_slots', '[]'::jsonb,
            'reason', 'No open time slots available on this date.'
        );
    END IF;

    RETURN jsonb_build_object(
        'available_slots', to_jsonb(v_slots),
        'reason', NULL
    );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.get_pandit_available_slots(UUID, DATE, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pandit_available_slots(UUID, DATE, INTEGER) TO authenticated, anon, service_role;
