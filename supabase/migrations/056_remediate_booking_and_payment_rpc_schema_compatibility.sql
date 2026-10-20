-- =============================================================================
-- Migration: 056_remediate_booking_and_payment_rpc_schema_compatibility.sql
-- Description: Production-verified canonical remediation of Feature 03 RPCs:
--              0. Schema Hardening: Deterministic Reschedule Association & updated_at
--              1. public.create_or_validate_booking (Canonical Schema & Pricing Remediation)
--              2. public.request_booking_reschedule (Reschedule Creation & 1:1 Binding)
--              3. public.confirm_booking_payment (Defect F3-02, Reschedule & Refund Reconciliation)
--              4. public.expire_stale_payment_orders (Authoritative Housekeeping & Slot Release)
--              5. Idempotent pg_cron Housekeeping Job Registration
--              6. Refund Reconciliation Hardening: reconcile_processed_refund & reconcile_failed_refund
--              7. Authoritative Administrative Recovery: admin_unlock_stuck_refund (Hardened Reconciliation Precondition)
--
-- Verified Canonical Invariants:
--   1. Pandit Verification & Availability:
--      Uses pandit_profiles.verification_status = 'approved' (not 'verified')
--      Uses pandit_profiles.public_status = 'available' (booking intake availability)
--
--   2. Puja Catalog & Mode-Specific Pricing:
--      Uses puja_services.allowed_modes (not available_service_modes)
--      Uses COALESCE(pandit_puja_services.duration_minutes, puja_services.default_duration_minutes)
--      Resolves dakshina price authoritatively by mode from pandit_puja_services:
--        - home   -> pandit_puja_services.home_price
--        - temple -> pandit_puja_services.temple_price
--        - remote -> pandit_puja_services.remote_price
--
--   3. Customer Addresses & Service Radius:
--      Uses public.customer_addresses (customer_id = auth.uid())
--      Enforces PostGIS operational radius validation via public.pandit_service_areas
--      (extensions.st_dwithin with geography calculation against radius_km * 1000)
--
--   4. Temple Association:
--      Enforces authoritative temple affiliation via public.pandit_temples
--      (status = 'approved' AND is_active = true)
--
--   5. Financial Policy & Booking Advance Calculation:
--      Reads public.booking_policy_settings (id = 1) mode-specific advance percentages:
--        - home   -> home_advance_percent (default 10%)
--        - remote -> remote_advance_percent (default 50%)
--        - temple -> temple_advance_percent (default 50%)
--      Advance amount = ROUND(((puja_price * advance_percent) / 100.0) + samagri_total + prasad_total, 2)
--      Samagri & Prasad are physical offerings paid 100% upfront; dakshina balance is due pre-ritual.
--
--   6. Canonical Table Columns:
--      bookings: price_snapshot, advance_percent, total_amount, advance_amount, balance_amount
--      (No non-existent balance_due_at or samagri_package_id on bookings)
--      payment_orders: booking_id, purpose, amount, currency, status, provider, due_at
--      booking_service_locations: address_id (REFERENCES customer_addresses), temple_id
--      refunds: payment_transaction_id, booking_cancellation_id, amount, reason, status ('requested'::public.refund_status)
--
--   7. Deterministic Reschedule 1:1 Binding & Reschedule Safety:
--      request_booking_reschedule creates payment_orders and booking_reschedule_requests with
--      payment_order_id in the exact same transaction block.
--      confirm_booking_payment strictly preserves the original booking when prepone fee payment
--      fails, arrives late, encounters a slot conflict, or pandit availability issues:
--      the fee payment is durably recorded and refunded ('refund_queued'), the reschedule request
--      is expired/rejected, and the original booking's schedule, active status, and reschedule_count
--      remain completely intact.
--
--   8. Payment Expiration, Gateway Event Timing, Timeout Recovery & Refund Idempotency:
--      Gateway Event Timing:
--        Extracts provider event emission timestamp from top-level p_raw_response->>'created_at'.
--        Never uses payment.entity.created_at (which is payment attempt initialization time).
--        Conservative auditable fallback is now() when gateway event timestamp is unavailable.
--      Timeout Recovery vs Explicit Cancellation:
--        Housekeeping (expire_stale_payment_orders) tags cancelled bookings with
--        cancellation_reason = 'payment_timeout'.
--        When a verified on-time payment (gateway event time <= due_at) arrives after housekeeping
--        ran, confirm_booking_payment safely recovers the booking if:
--        - The booking was cancelled solely due to payment_timeout (and never explicitly cancelled
--          by customer or administrator, checked against public.booking_cancellations)
--        - The scheduled ritual start time is still in the future
--        - Pandit availability rules, unavailability blocks, and slot conflict checks under
--          row-level exclusive locks confirm the slot remains vacant and valid.
--        If the slot was claimed by a newer booking, pandit is unavailable, or time passed,
--        the payment is durably recorded and a full refund is queued without creating a conflict.
--      Prepone-Fee Timeout Recovery:
--        Applies identical recovery reasoning to prepone fee payments: if payment was on time
--        and the request was timeout-expired, revalidates availability and slot conflict under locks;
--        approves reschedule if vacant, or queues fee refund while strictly preserving original booking.
--      Refund Idempotency Semantics & Self-Healing Retries:
--        Distinguishes newly queued refund ('refund_queued'), refund already queued ('refund_already_queued'
--        when refunds.status IN ('requested', 'processing')), completed refund ('already_refunded'
--        when refunds.status = 'processed'), and automatically re-queues fresh 'requested' refund
--        obligation when refunds.status = 'failed'.
--
--   9. Execution Permissions & Security:
--      VOLATILE SECURITY DEFINER, SET search_path = public, extensions.
--      Row-level locks (FOR UPDATE) on pandit_profiles serialize bookings and prevent double-booking.
--      create_or_validate_booking: authenticated, service_role
--      request_booking_reschedule: authenticated, service_role
--      confirm_booking_payment: service_role, postgres
--      expire_stale_payment_orders: service_role, postgres
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. SCHEMA HARDENING: Deterministic Reschedule Association & updated_at
-- =============================================================================

-- Add payment_order_id foreign key on booking_reschedule_requests to associate
-- each reschedule fee payment order deterministically with its generating request.
ALTER TABLE public.booking_reschedule_requests
    ADD COLUMN IF NOT EXISTS payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL;

-- Verify and ensure updated_at column exists on booking_reschedule_requests
ALTER TABLE public.booking_reschedule_requests
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Attach standard updated_at trigger to maintain timestamp on updates
DROP TRIGGER IF EXISTS trg_booking_reschedule_requests_updated_at ON public.booking_reschedule_requests;
CREATE TRIGGER trg_booking_reschedule_requests_updated_at
    BEFORE UPDATE ON public.booking_reschedule_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.booking_reschedule_requests.payment_order_id IS
    'Deterministic link to the payment_order generated for prepone fee obligation.';

-- Ensure cancellation_reason column exists on bookings to distinguish
-- timeout-driven cancellation from explicit customer/admin cancellation.
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN public.bookings.cancellation_reason IS
    'Reason for booking cancellation (e.g. payment_timeout, booking_conflict, customer_cancelled, admin_cancelled). Used to prevent resurrection of explicitly cancelled bookings.';

-- Forward-only safeguard: Guarantee that any explicit cancellation (via RPC, admin tool, or direct update)
-- reliably records a non-timeout cancellation reason if not explicitly provided.
CREATE OR REPLACE FUNCTION public.trg_enforce_booking_cancellation_reason()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.status = 'cancelled'::public.booking_status AND OLD.status != 'cancelled'::public.booking_status THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
        IF NEW.cancellation_reason IS NULL THEN
            IF EXISTS (SELECT 1 FROM public.booking_cancellations WHERE booking_id = NEW.id) THEN
                NEW.cancellation_reason := 'explicit_cancellation';
            ELSE
                NEW.cancellation_reason := 'admin_or_direct_cancellation';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_cancellation_reason ON public.bookings;
CREATE TRIGGER trg_booking_cancellation_reason
    BEFORE UPDATE OF status ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_enforce_booking_cancellation_reason();

-- Backfill existing cancelled bookings linked to booking_cancellations that have NULL cancellation_reason
UPDATE public.bookings b
SET cancellation_reason = COALESCE(bc.reason, 'explicit_cancellation')
FROM public.booking_cancellations bc
WHERE bc.booking_id = b.id
  AND b.status = 'cancelled'::public.booking_status
  AND b.cancellation_reason IS NULL;


-- Guarantee 1-to-1 uniqueness between payment order and reschedule request
-- Hardened Preflight: Halts migration with actionable error if duplicate payment_order_id records exist.
DO $$
DECLARE
    v_dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_dup_count
    FROM (
        SELECT payment_order_id
        FROM public.booking_reschedule_requests
        WHERE payment_order_id IS NOT NULL
        GROUP BY payment_order_id
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
        RAISE EXCEPTION 'Cannot apply migration 056: Invariant "uq_booking_reschedule_requests_payment_order_id" failed. Detected % distinct payment_order_id values with duplicate reschedule request records. Resolve conflicts using read-only diagnostic: SELECT payment_order_id, COUNT(*), array_agg(id) FROM public.booking_reschedule_requests WHERE payment_order_id IS NOT NULL GROUP BY payment_order_id HAVING COUNT(*) > 1;',
            v_dup_count
            USING ERRCODE = '23505';
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_reschedule_requests_payment_order_id
        ON public.booking_reschedule_requests(payment_order_id)
        WHERE payment_order_id IS NOT NULL;
END $$;

-- Guarantee only one pending reschedule request per booking at any time
-- Hardened Preflight: Halts migration with actionable error if multiple pending requests exist for any booking.
DO $$
DECLARE
    v_dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_dup_count
    FROM (
        SELECT booking_id
        FROM public.booking_reschedule_requests
        WHERE status = 'requested'::public.reschedule_request_status
        GROUP BY booking_id
        HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
        RAISE EXCEPTION 'Cannot apply migration 056: Invariant "uq_booking_reschedule_requests_single_pending" failed. Detected % bookings with multiple active pending reschedule requests. Resolve conflicts using read-only diagnostic: SELECT booking_id, COUNT(*), array_agg(id) FROM public.booking_reschedule_requests WHERE status = ''requested'' GROUP BY booking_id HAVING COUNT(*) > 1;',
            v_dup_count
            USING ERRCODE = '23505';
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_reschedule_requests_single_pending
        ON public.booking_reschedule_requests(booking_id)
        WHERE status = 'requested'::public.reschedule_request_status;
END $$;


-- =============================================================================
-- 1. FUNCTION: public.create_or_validate_booking (CANONICAL REMEDIATION)
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
    v_samagri_item RECORD;
    v_prasad_item RECORD;

    v_duration_minutes INTEGER;
    v_scheduled_end_at TIMESTAMPTZ;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;

    v_puja_price NUMERIC(12,2);
    v_samagri_total NUMERIC(12,2) := 0.00;
    v_prasad_total NUMERIC(12,2) := 0.00;
    v_advance_percent NUMERIC(5,2);
    v_advance_amount NUMERIC(12,2);
    v_balance_amount NUMERIC(12,2);
    v_total_amount NUMERIC(12,2);

    v_booking_id UUID;
    v_booking_number TEXT;
    v_payment_order_id UUID;

    v_idx INTEGER;
    v_pkg_item_count INTEGER;
    v_item_qty NUMERIC(12,3);
    v_item_price NUMERIC(12,2);
    v_item_total NUMERIC(12,2);
BEGIN
    -- 1. Authenticate Caller
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create a booking.';
    END IF;

    -- Validate scheduled start timestamp in future
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

    -- Canonical verification_status check: must be 'approved'
    IF v_pandit.verification_status != 'approved' THEN
        RAISE EXCEPTION 'Selected Pandit is not currently approved for bookings.';
    END IF;

    -- Canonical public_status check: must be 'available'
    IF v_pandit.public_status != 'available' THEN
        RAISE EXCEPTION 'Selected Pandit is currently unavailable and cannot receive new bookings.';
    END IF;

    -- 3. Validate Master Puja Service & Catalog Mode Support
    SELECT * INTO v_puja
    FROM public.puja_services
    WHERE id = p_puja_service_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected Puja ritual is not active or does not exist.';
    END IF;

    -- Canonical allowed_modes column check
    IF NOT (p_service_mode = ANY(v_puja.allowed_modes)) THEN
        RAISE EXCEPTION 'Service mode % is not supported for this Puja in catalog.', p_service_mode;
    END IF;

    -- 4. Validate Pandit Offering & Mode-Specific Dakshina Pricing
    SELECT * INTO v_pandit_puja
    FROM public.pandit_puja_services
    WHERE pandit_id = p_pandit_id 
      AND puja_service_id = p_puja_service_id 
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit does not offer the requested Puja service.';
    END IF;

    -- Authoritative Mode-Specific Price Resolution
    IF p_service_mode = 'home' THEN
        v_puja_price := v_pandit_puja.home_price;
    ELSIF p_service_mode = 'temple' THEN
        v_puja_price := v_pandit_puja.temple_price;
    ELSIF p_service_mode = 'remote' THEN
        v_puja_price := v_pandit_puja.remote_price;
    ELSE
        RAISE EXCEPTION 'Invalid service mode: %', p_service_mode;
    END IF;

    -- Strict validation: Pandit must offer the requested mode with price > 0
    IF v_puja_price IS NULL OR v_puja_price <= 0 THEN
        RAISE EXCEPTION 'Selected Pandit does not offer "%" in % mode.', v_puja.name, p_service_mode;
    END IF;

    -- Authoritative Duration Resolution: Pandit override or Master Catalog default
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

        -- Canonical customer_addresses table and customer_id column check
        SELECT * INTO v_address
        FROM public.customer_addresses
        WHERE id = p_address_id AND customer_id = v_customer_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Provided address does not belong to the authenticated customer.';
        END IF;

        IF v_address.latitude IS NULL OR v_address.longitude IS NULL THEN
            RAISE EXCEPTION 'Customer address must have valid geographical coordinates for Home service validation.';
        END IF;

        -- Authoritative Service Radius Check via PostGIS against pandit_service_areas
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

        -- Authoritative Temple-Pandit Association Check via public.pandit_temples
        IF NOT EXISTS (
            SELECT 1 
            FROM public.pandit_temples pt
            WHERE pt.pandit_id = p_pandit_id
              AND pt.temple_id = p_temple_id
              AND pt.status = 'approved'::public.pandit_temple_association_status
              AND pt.is_active = true
        ) THEN
            RAISE EXCEPTION 'Selected Pandit is not authorized to perform rituals at the selected Temple.';
        END IF;

    ELSIF p_service_mode = 'remote' THEN
        IF p_address_id IS NOT NULL THEN
            RAISE EXCEPTION 'Address is not applicable for Remote Puja bookings.';
        END IF;

        IF p_temple_id IS NOT NULL THEN
            RAISE EXCEPTION 'Temple selection is not applicable for Remote Puja bookings.';
        END IF;
    END IF;

    -- 6. Availability Schedule Verification (Day of week & Operating Hours in Asia/Kolkata)
    v_dow := EXTRACT(DOW FROM (p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
    v_start_time := (p_scheduled_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
    v_end_time := (v_scheduled_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

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

    -- 8. Existing Overlapping Bookings Check (Deadline-Aware Active Reservation Filter)
    IF EXISTS (
        SELECT 1 
        FROM public.bookings b
        WHERE b.pandit_id = p_pandit_id
          AND (
              b.status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
              OR (
                  b.status = 'payment_pending'
                  AND EXISTS (
                      SELECT 1 FROM public.payment_orders po
                      WHERE po.booking_id = b.id
                        AND po.purpose = 'booking_advance'::public.payment_order_purpose
                        AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
                        AND COALESCE(po.due_at, po.created_at + interval '30 minutes') > now()
                  )
              )
          )
          AND p_scheduled_start_at < b.scheduled_end_at
          AND v_scheduled_end_at > b.scheduled_start_at
    ) THEN
        RAISE EXCEPTION 'Selected Pandit already has a booking or pending reservation during this time window.';
    END IF;

    -- 9. Samagri Selection & Pricing Verification
    -- Mutual Exclusivity: Prohibit simultaneous selection of package and custom items
    IF p_samagri_package_id IS NOT NULL AND p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
        RAISE EXCEPTION 'Simultaneous selection of Samagri package and custom Samagri items is not permitted. Please choose either a package or custom items.';
    END IF;

    IF p_service_mode = 'remote' THEN
        -- Remote Puja strictly prohibits any Samagri package or custom items
        IF p_samagri_package_id IS NOT NULL OR (p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0) THEN
            RAISE EXCEPTION 'Samagri selections are not permitted for Remote Puja bookings. The sanctum provides all necessary ritual offerings.';
        END IF;

        IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 THEN
            RAISE EXCEPTION 'Prasad selections are not permitted for Remote Puja bookings.';
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

        -- Verify package component items: must exist, be active, and priced > 0
        IF EXISTS (
            SELECT 1
            FROM public.samagri_package_items spi
            JOIN public.samagri_items si ON si.id = spi.samagri_item_id
            WHERE spi.samagri_package_id = p_samagri_package_id
              AND (si.is_active = false OR si.unit_price <= 0 OR spi.quantity <= 0)
        ) THEN
            RAISE EXCEPTION 'Selected Samagri package contains invalid, inactive, or unpriced component items.';
        END IF;

        SELECT COUNT(*) INTO v_pkg_item_count
        FROM public.samagri_package_items
        WHERE samagri_package_id = p_samagri_package_id;

        IF v_pkg_item_count = 0 THEN
            RAISE EXCEPTION 'Selected Samagri Package has no configured items.';
        END IF;

        SELECT COALESCE(SUM(ROUND(spi.quantity * si.unit_price, 2)), 0.00) INTO v_samagri_total
        FROM public.samagri_package_items spi
        JOIN public.samagri_items si ON si.id = spi.samagri_item_id
        WHERE spi.samagri_package_id = p_samagri_package_id AND si.is_active = true;

        IF v_samagri_total <= 0.00 THEN
            RAISE EXCEPTION 'Selected Samagri package has an invalid total or contains no items.';
        END IF;

    ELSIF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 THEN
        IF p_custom_samagri_quantities IS NULL OR array_length(p_custom_samagri_item_ids, 1) != array_length(p_custom_samagri_quantities, 1) THEN
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

            IF v_samagri_item.unit_price <= 0 THEN
                RAISE EXCEPTION 'Samagri item "%" has invalid unit pricing.', v_samagri_item.name;
            END IF;

            v_item_total := ROUND(v_item_qty * v_samagri_item.unit_price, 2);
            v_samagri_total := v_samagri_total + v_item_total;
        END LOOP;
    END IF;

    -- 10. Prasad Selection & Item-Level Unit Pricing Verification
    IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 AND p_service_mode != 'remote' THEN
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
            IF v_item_price IS NULL OR v_item_price <= 0 THEN
                RAISE EXCEPTION 'Unit price for Prasad item "%" is not properly configured.', v_prasad_item.name;
            END IF;

            v_item_total := ROUND(v_item_qty * v_item_price, 2);
            v_prasad_total := v_prasad_total + v_item_total;
        END LOOP;
    END IF;

    -- 11. Authoritative Financial Policy Calculation (Canonical booking_policy_settings WHERE id = 1)
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

    -- Financial Totals (Rupees)
    -- Advance % applies to dakshina (puja_price); Samagri & Prasad are physical goods paid 100% upfront
    v_total_amount := v_puja_price + v_samagri_total + v_prasad_total;
    v_advance_amount := ROUND(((v_puja_price * v_advance_percent) / 100.0) + v_samagri_total + v_prasad_total, 2);
    v_balance_amount := v_total_amount - v_advance_amount;

    IF v_advance_amount > v_total_amount THEN
        v_advance_amount := v_total_amount;
        v_balance_amount := 0.00;
    END IF;

    -- 12. Create Authoritative Booking Record
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
            address_snapshot,
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
            v_temple.address,
            v_temple.city,
            v_temple.state,
            NULL,
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
    -- 14.1 Ritual dakshina fee
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

    -- 14.2 Predefined Samagri Package Breakdown
    IF p_samagri_package_id IS NOT NULL AND p_service_mode != 'remote' THEN
        FOR v_samagri_item IN
            SELECT 
                si.id AS item_id,
                si.name,
                si.unit,
                si.unit_price,
                spi.quantity,
                ROUND(spi.quantity * si.unit_price, 2) AS line_total
            FROM public.samagri_package_items spi
            JOIN public.samagri_items si ON si.id = spi.samagri_item_id
            WHERE spi.samagri_package_id = p_samagri_package_id AND si.is_active = true
        LOOP
            INSERT INTO public.booking_line_items (
                booking_id,
                item_type,
                samagri_item_id,
                samagri_package_id,
                name_snapshot,
                unit,
                quantity,
                unit_price,
                total_price,
                is_refundable
            ) VALUES (
                v_booking_id,
                'samagri_item'::public.line_item_type,
                v_samagri_item.item_id,
                p_samagri_package_id,
                v_samagri_item.name,
                v_samagri_item.unit,
                v_samagri_item.quantity,
                v_samagri_item.unit_price,
                v_samagri_item.line_total,
                false
            );
        END LOOP;

    -- 14.3 Custom Individual Samagri Items Breakdown (Mutually Exclusive to Package)
    ELSIF p_custom_samagri_item_ids IS NOT NULL AND array_length(p_custom_samagri_item_ids, 1) > 0 AND p_service_mode != 'remote' THEN
        FOR v_idx IN 1..array_length(p_custom_samagri_item_ids, 1) LOOP
            SELECT * INTO v_samagri_item
            FROM public.samagri_items
            WHERE id = p_custom_samagri_item_ids[v_idx];

            v_item_qty := p_custom_samagri_quantities[v_idx];
            v_item_total := ROUND(v_item_qty * v_samagri_item.unit_price, 2);

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
                false
            );
        END LOOP;
    END IF;

    -- 14.4 Prasad Items Breakdown
    IF p_prasad_item_ids IS NOT NULL AND array_length(p_prasad_item_ids, 1) > 0 AND p_service_mode != 'remote' THEN
        FOR v_idx IN 1..array_length(p_prasad_item_ids, 1) LOOP
            SELECT * INTO v_prasad_item
            FROM public.prasad_items
            WHERE id = p_prasad_item_ids[v_idx];

            v_item_qty := p_prasad_quantities[v_idx];
            v_item_price := v_prasad_item.unit_price;
            v_item_total := ROUND(v_item_qty * v_item_price, 2);

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
                v_prasad_item.unit,
                v_item_qty,
                v_item_price,
                v_item_total,
                false
            );
        END LOOP;
    END IF;

    -- 15. Create Initial Payment Order Record in Canonical payment_orders Table
    INSERT INTO public.payment_orders (
        booking_id,
        purpose,
        amount,
        currency,
        status,
        provider,
        due_at
    ) VALUES (
        v_booking_id,
        'booking_advance'::public.payment_order_purpose,
        v_advance_amount,
        'INR',
        'created'::public.payment_order_status,
        'razorpay',
        now() + interval '30 minutes'
    ) RETURNING id INTO v_payment_order_id;

    -- 16. Return Authoritative Response Payload
    -- Satisfies CreateBookingResponse contract and provides backward-compatible paise fields
    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'booking_number', v_booking_number,
        'status', 'payment_pending'::public.booking_status,
        'service_mode', p_service_mode,
        'scheduled_start_at', p_scheduled_start_at,
        'scheduled_end_at', v_scheduled_end_at,
        'total_amount', v_total_amount,
        'advance_amount', v_advance_amount,
        'balance_amount', v_balance_amount,
        'advance_percent', v_advance_percent,
        'puja_price', v_puja_price,
        'samagri_total', v_samagri_total,
        'prasad_total', v_prasad_total,
        'payment_order_id', v_payment_order_id,
        'currency', 'INR',
        'due_at', (now() + interval '30 minutes'),
        'expires_at', (now() + interval '30 minutes'),
        'total_amount_paise', ROUND(v_total_amount * 100)::bigint,
        'advance_amount_paise', ROUND(v_advance_amount * 100)::bigint,
        'balance_amount_paise', ROUND(v_balance_amount * 100)::bigint
    );
END;
$$;

-- Explicit Execution ACLs for create_or_validate_booking
REVOKE ALL ON FUNCTION public.create_or_validate_booking(
    UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_or_validate_booking(
    UUID, UUID, public.service_mode, TIMESTAMPTZ, UUID, UUID, UUID, UUID[], NUMERIC[], UUID[], NUMERIC[]
) TO authenticated, service_role;


-- =============================================================================
-- 2. FUNCTION: public.request_booking_reschedule (DETERMINISTIC LINKING)
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
    v_new_due_at TIMESTAMPTZ;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to reschedule a booking.';
    END IF;

    -- 1. Fetch & Lock Booking FOR UPDATE
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking % not found.', p_booking_id;
    END IF;

    -- Ownership & Authorization Check
    IF v_booking.customer_id != v_caller_id AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: You can only reschedule your own bookings.';
    END IF;

    -- 2. State & Policy Validation
    IF v_booking.status NOT IN ('confirmed', 'upcoming', 'rescheduled') THEN
        RAISE EXCEPTION 'Booking cannot be rescheduled in its current state (%).', v_booking.status;
    END IF;

    SELECT * INTO v_policy FROM public.booking_policy_settings WHERE id = 1;

    -- Reschedule Limit: Reject immediately if permitted limit reached
    IF v_booking.reschedule_count >= COALESCE(v_policy.max_reschedules, 1) THEN
        RAISE EXCEPTION 'Reschedule limit reached. Only % reschedule is permitted per booking.',
            COALESCE(v_policy.max_reschedules, 1);
    END IF;

    -- Guard: Reject if a pending reschedule request already exists for this booking
    IF EXISTS (
        SELECT 1 FROM public.booking_reschedule_requests
        WHERE booking_id = v_booking.id
          AND status = 'requested'::public.reschedule_request_status
    ) THEN
        RAISE EXCEPTION 'A reschedule request is already pending payment or approval for booking %.',
            v_booking.booking_number;
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
        RAISE EXCEPTION 'Supplied change type (%) contradicts requested time direction (%).',
            p_change_type, v_derived_change_type;
    END IF;

    -- 4. Lock Pandit Row to Prevent Concurrent Double-Booking
    PERFORM 1
    FROM public.pandit_profiles
    WHERE id = v_booking.pandit_id
    FOR UPDATE;

    v_duration := v_booking.scheduled_end_at - v_booking.scheduled_start_at;
    v_requested_end_at := p_requested_start_at + v_duration;

    -- 5. Verify Reschedule Windows and Prepone Fee Policy
    v_hours_notice := EXTRACT(EPOCH FROM (v_booking.scheduled_start_at - now())) / 3600.0;

    IF v_derived_change_type = 'prepone' THEN
        IF v_policy.prepone_window_hours IS NOT NULL AND v_hours_notice < v_policy.prepone_window_hours THEN
            RAISE EXCEPTION 'Preponing requires at least % hours advance notice.', v_policy.prepone_window_hours;
        END IF;

        IF v_policy.prepone_fee_amount IS NOT NULL AND v_policy.prepone_fee_amount > 0 THEN
            v_fee_amount := v_policy.prepone_fee_amount;
        ELSE
            v_fee_amount := 0.00;
        END IF;
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

    -- Check Unavailability blocks using canonical column names starts_at, ends_at
    IF EXISTS (
        SELECT 1 
        FROM public.pandit_unavailability_blocks
        WHERE pandit_id = v_booking.pandit_id
          AND p_requested_start_at < ends_at
          AND v_requested_end_at > starts_at
    ) THEN
        RAISE EXCEPTION 'Pandit is unavailable during the requested new time slot.';
    END IF;

    -- Conflict Check Against Other Bookings or Pending Reservations (Deadline-Aware)
    IF EXISTS (
        SELECT 1 
        FROM public.bookings b
        WHERE b.pandit_id = v_booking.pandit_id
          AND b.id != v_booking.id
          AND (
              b.status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
              OR (
                  b.status = 'payment_pending'
                  AND EXISTS (
                      SELECT 1 FROM public.payment_orders po
                      WHERE po.booking_id = b.id
                        AND po.purpose = 'booking_advance'::public.payment_order_purpose
                        AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
                        AND COALESCE(po.due_at, po.created_at + interval '30 minutes') > now()
                  )
              )
          )
          AND b.scheduled_start_at < v_requested_end_at
          AND b.scheduled_end_at > p_requested_start_at
    ) THEN
        RAISE EXCEPTION 'The requested new time slot conflicts with an existing booking or pending reservation.';
    END IF;

    -- 7. Apply Transition: Deterministic Same-Transaction Association
    IF v_fee_amount > 0.00 THEN
        -- 7A. Fee > 0: Create payment order obligation first within the same transaction
        INSERT INTO public.payment_orders (
            booking_id,
            purpose,
            amount,
            currency,
            status,
            provider,
            due_at
        ) VALUES (
            v_booking.id,
            'prepone_fee'::public.payment_order_purpose,
            v_fee_amount,
            'INR',
            'created'::public.payment_order_status,
            'razorpay',
            now() + interval '30 minutes'
        ) RETURNING id INTO v_payment_order_id;

        -- Create reschedule request explicitly linked to v_payment_order_id in the exact same transaction
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
            approved_at,
            payment_order_id
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
            NULL,
            v_payment_order_id
        ) RETURNING id INTO v_reschedule_id;

        RETURN jsonb_build_object(
            'status', 'requested',
            'reschedule_request_id', v_reschedule_id,
            'booking_id', v_booking.id,
            'fee_amount', v_fee_amount,
            'payment_order_id', v_payment_order_id,
            'old_start_at', v_booking.scheduled_start_at,
            'new_start_at', p_requested_start_at,
            'new_end_at', v_requested_end_at,
            'message', 'Reschedule requested. Prepone fee payment required to confirm new time slot.'
        );
    ELSE
        -- 7B. Fee = 0: Auto-approve immediately and transition booking schedule slot
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
            approved_at,
            payment_order_id
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
            now(),
            NULL
        ) RETURNING id INTO v_reschedule_id;

        UPDATE public.bookings
        SET scheduled_start_at = p_requested_start_at,
            scheduled_end_at = v_requested_end_at,
            reschedule_count = v_booking.reschedule_count + 1,
            status = 'rescheduled'::public.booking_status,
            updated_at = now()
        WHERE id = v_booking.id;

        -- Shift due_at for open balance payment orders to maintain 24h cutoff
        IF p_requested_start_at - interval '24 hours' <= now() THEN
            v_new_due_at := now();
        ELSE
            v_new_due_at := p_requested_start_at - interval '24 hours';
        END IF;

        UPDATE public.payment_orders
        SET due_at = v_new_due_at,
            updated_at = now()
        WHERE booking_id = v_booking.id
          AND purpose = 'booking_balance'::public.payment_order_purpose
          AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status);

        RETURN jsonb_build_object(
            'status', 'rescheduled',
            'reschedule_request_id', v_reschedule_id,
            'booking_id', v_booking.id,
            'old_start_at', v_booking.scheduled_start_at,
            'new_start_at', p_requested_start_at,
            'new_end_at', v_requested_end_at,
            'fee_amount', 0.00,
            'reschedule_count', v_booking.reschedule_count + 1,
            'balance_due_at', v_new_due_at
        );
    END IF;
END;
$$;

-- Explicit Execution ACLs for request_booking_reschedule
REVOKE ALL ON FUNCTION public.request_booking_reschedule(
    UUID, TIMESTAMPTZ, public.reschedule_change_type
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_booking_reschedule(
    UUID, TIMESTAMPTZ, public.reschedule_change_type
) TO authenticated, service_role;


-- =============================================================================
-- 3. FUNCTION: public.confirm_booking_payment (F3-02 REMEDIATION)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
    p_payment_order_id UUID,
    p_provider_payment_id TEXT,
    p_verified_amount NUMERIC,
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
    v_policy RECORD;
    v_kundli RECORD;
    v_subscription RECORD;
    v_active_sub RECORD;
    v_reschedule RECORD;
    v_existing_tx RECORD;
    v_existing_refund RECORD;
    v_transaction_id UUID;
    v_refund_id UUID;
    v_result JSONB;
    v_dow INTEGER;
    v_start_time TIME;
    v_end_time TIME;
    v_starts_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_gateway_event_at TIMESTAMPTZ := NULL;
    v_effective_paid_at TIMESTAMPTZ;
    v_effective_due_at TIMESTAMPTZ;
    v_is_overdue BOOLEAN := false;
    v_can_confirm BOOLEAN := false;
    v_can_approve BOOLEAN := false;
    v_is_timeout_recovery BOOLEAN := false;
BEGIN
    -- 1. Input Validation: Verified captured amount is strictly required and positive
    IF p_payment_order_id IS NULL OR p_provider_payment_id IS NULL OR p_verified_amount IS NULL THEN
        RAISE EXCEPTION 'Payment order ID, provider payment ID, and verified captured amount are strictly required.';
    END IF;

    IF p_verified_amount <= 0 THEN
        RAISE EXCEPTION 'Verified payment amount must be strictly greater than zero.';
    END IF;

    -- 2. Fetch & Lock Payment Order FOR UPDATE (Level 1 Lock in hierarchy)
    SELECT * INTO v_order
    FROM public.payment_orders
    WHERE id = p_payment_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment order % not found.', p_payment_order_id;
    END IF;

    -- Strict Exact Amount Validation: Prevents both underpayments and overpayments
    IF p_verified_amount != v_order.amount THEN
        RAISE EXCEPTION 'Verified captured amount (%) does not match payment order obligation amount (%).',
            p_verified_amount, v_order.amount;
    END IF;

    -- Extract gateway event timestamp from top-level signed webhook payload envelope.
    -- Provider Semantics & Invariants:
    -- In Razorpay, payload.payload.payment.entity.created_at represents the timestamp
    -- when the payment attempt entity was created (e.g. checkout opened), NOT capture time.
    -- Using entity.created_at would allow a late capture to masquerade as on-time.
    -- The top-level payload.created_at is the signed webhook event generation timestamp
    -- emitted by Razorpay when the payment.captured event occurred.
    -- If top-level created_at is present, it provides provider-signed evidence of event
    -- occurrence. If absent or invalid, the conservative, auditable fallback is now().
    IF p_raw_response IS NOT NULL AND (p_raw_response->>'created_at') IS NOT NULL THEN
        BEGIN
            v_gateway_event_at := to_timestamp((p_raw_response->>'created_at')::double precision);
        EXCEPTION WHEN OTHERS THEN
            v_gateway_event_at := NULL;
        END;
    ELSE
        v_gateway_event_at := NULL;
    END IF;

    -- Evaluate effective payment event time and authoritative deadline
    v_effective_paid_at := COALESCE(v_gateway_event_at, now());
    v_effective_due_at := COALESCE(v_order.due_at, v_order.created_at + interval '30 minutes');
    v_is_overdue := (v_effective_paid_at > v_effective_due_at);

    -- 3. AST-07 Lock Hierarchy: For subscription orders, acquire per-customer advisory lock
    IF v_order.purpose = 'subscription' THEN
        SELECT * INTO v_subscription
        FROM public.astrology_subscriptions
        WHERE id = v_order.subscription_id
        FOR UPDATE;

        IF FOUND AND v_subscription.customer_id IS NOT NULL THEN
            PERFORM pg_advisory_xact_lock(
                hashtext('astrology_subscription_customer:' || v_subscription.customer_id::text)
            );
        END IF;
    END IF;

    -- 4. Check for Existing Captured Transaction by Provider Payment ID
    SELECT * INTO v_existing_tx
    FROM public.payment_transactions
    WHERE provider_payment_id = p_provider_payment_id;

    -- Reject cross-order payment ID collision
    IF v_existing_tx.id IS NOT NULL AND v_existing_tx.payment_order_id != p_payment_order_id THEN
        RAISE EXCEPTION 'Provider payment ID % is already registered to a different payment order (%).',
            p_provider_payment_id, v_existing_tx.payment_order_id;
    END IF;

    -- 5. Idempotency Check: Order already marked paid
    IF v_order.status = 'paid' THEN
        IF v_existing_tx.id IS NULL THEN
            RAISE EXCEPTION 'Payment order is marked paid but no corresponding transaction exists for provider payment ID %.',
                p_provider_payment_id;
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
            WHERE (payment_order_id = v_order.id
                   OR (payment_order_id IS NULL AND booking_id = v_booking.id AND change_type = 'prepone' AND fee_amount = v_order.amount))
            ORDER BY (payment_order_id = v_order.id) DESC, created_at DESC 
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
        ELSIF v_order.purpose = 'subscription' AND v_order.subscription_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'status', 'already_confirmed',
                'purpose', 'subscription',
                'payment_order_id', v_order.id,
                'subscription_id', v_subscription.id,
                'subscription_status', v_subscription.status,
                'duration_days', v_order.duration_days,
                'starts_at', v_subscription.starts_at,
                'ends_at', v_subscription.ends_at,
                'payment_transaction_id', v_existing_tx.id,
                'paid_at', v_existing_tx.paid_at
            );
        ELSE
            RAISE EXCEPTION 'Unsupported or unhandled payment order purpose for idempotent resolution: %', v_order.purpose;
        END IF;
    END IF;

    -- 6. AST-P02 Idempotency Check: Cancelled or Expired order with already-recorded transaction
    IF v_existing_tx.id IS NOT NULL AND
       (v_order.status IN ('cancelled', 'expired') OR (v_order.purpose = 'subscription' AND v_subscription.id IS NOT NULL AND v_subscription.status = 'cancelled')) THEN
        SELECT * INTO v_existing_refund
        FROM public.refunds
        WHERE payment_transaction_id = v_existing_tx.id
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_existing_refund.id IS NOT NULL THEN
            IF v_existing_refund.status IN ('requested'::public.refund_status, 'processing'::public.refund_status) THEN
                RETURN jsonb_build_object(
                    'status', 'refund_already_queued',
                    'purpose', v_order.purpose,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_existing_tx.id,
                    'refund_id', v_existing_refund.id,
                    'refund_status', v_existing_refund.status,
                    'amount_refunded', v_existing_refund.amount,
                    'message', 'Refund is already queued or processing for captured payment on expired or cancelled order.'
                );
            ELSIF v_existing_refund.status = 'processed'::public.refund_status THEN
                RETURN jsonb_build_object(
                    'status', 'already_refunded',
                    'purpose', v_order.purpose,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_existing_tx.id,
                    'refund_id', v_existing_refund.id,
                    'refund_status', v_existing_refund.status,
                    'amount_refunded', v_existing_refund.amount,
                    'message', 'Payment was previously captured and refund has already been processed for expired or cancelled order.'
                );
            ELSIF v_existing_refund.status = 'failed'::public.refund_status THEN
                -- Reuse existing refund record and stable refund ID for retry.
                -- Preserves gateway idempotency key ("refund_" || id) and avoids creating duplicate obligations.
                UPDATE public.refunds
                SET status = 'requested'::public.refund_status,
                    reason = 'Retry refund for previously failed refund obligation on expired or cancelled order.',
                    updated_at = now()
                WHERE id = v_existing_refund.id;

                v_refund_id := v_existing_refund.id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', v_order.purpose,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_existing_tx.id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', v_existing_refund.amount,
                    'is_retry', true,
                    'message', 'Re-queued existing refund record for retry on expired or cancelled order.'
                );
            END IF;
        ELSE
            -- No refund obligation was recorded yet. If order is cancelled, overdue, or subscription,
            -- synthesize the missing refund obligation. For on-time booking_advance or prepone_fee,
            -- allow fall-through to Step 9 to evaluate authoritative slot/availability recovery.
            IF v_is_overdue OR v_order.status = 'cancelled'::public.payment_order_status OR v_order.purpose NOT IN ('booking_advance', 'prepone_fee') THEN
                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_existing_tx.id,
                    NULL,
                    v_existing_tx.amount,
                    'Automatic recovery refund: captured payment missing refund obligation for expired or cancelled order.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', v_order.purpose,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_existing_tx.id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', v_existing_tx.amount,
                    'is_recovered', true,
                    'message', 'Recovered missing refund obligation for previously captured payment on expired or cancelled order.'
                );
            END IF;
        END IF;
    END IF;

    -- 7. Validate Order Status is Transitionable
    -- Permit created, pending, and expired/cancelled (which routes to durable capture + refund_queued)
    IF v_order.status NOT IN ('created', 'pending', 'expired', 'cancelled') THEN
        RAISE EXCEPTION 'Payment order % is in % status and cannot be confirmed.',
            p_payment_order_id, v_order.status;
    END IF;

    -- 8. Record Gateway Charge / Capture in payment_transactions
    IF v_existing_tx.id IS NOT NULL THEN
        UPDATE public.payment_transactions
        SET status = 'captured'::public.payment_transaction_status,
            amount = p_verified_amount,
            paid_at = COALESCE(v_gateway_event_at, paid_at, now()),
            provider_signature = COALESCE(p_provider_signature, provider_signature),
            raw_response = COALESCE(p_raw_response, raw_response)
        WHERE id = v_existing_tx.id
        RETURNING id INTO v_transaction_id;
    ELSE
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
            COALESCE(v_gateway_event_at, now()),
            p_raw_response
        ) RETURNING id INTO v_transaction_id;
    END IF;

    -- 9. Execute Business State Transitions Branched by Purpose
    -- Payment order is updated to 'paid' strictly upon successful, verified business transition.
    CASE v_order.purpose
        -- ------------------------------------------------------------
        -- A. booking_advance: Confirms initial booking (F3-02 Fix)
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

            -- Evaluate whether booking is eligible for confirmation or recovery:
            -- 1. Timing: payment must be on time (NOT v_is_overdue)
            -- 2. State: order must be in ('created', 'pending', 'expired') (NOT cancelled)
            -- 3. Booking state: 'payment_pending' OR ('cancelled' with cancellation_reason = 'payment_timeout' strictly)
            -- 4. Never confirmed before (v_booking.confirmed_at IS NULL)
            -- 5. No explicit customer or admin cancellation (NOT EXISTS booking_cancellations)
            -- 6. Future start: scheduled_start_at > now()
            v_can_confirm := false;
            v_is_timeout_recovery := false;

            IF (NOT v_is_overdue)
               AND (v_order.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status, 'expired'::public.payment_order_status))
               AND (v_booking.status = 'payment_pending'::public.booking_status
                    OR (v_booking.status = 'cancelled'::public.booking_status
                        AND v_booking.cancellation_reason = 'payment_timeout'))
               AND (v_booking.confirmed_at IS NULL)
               AND (NOT EXISTS (SELECT 1 FROM public.booking_cancellations WHERE booking_id = v_booking.id))
               AND (v_booking.scheduled_start_at > now()) THEN

                -- Acquire row-level lock on Pandit profile
                SELECT * INTO v_pandit
                FROM public.pandit_profiles
                WHERE id = v_booking.pandit_id
                FOR UPDATE;

                IF FOUND
                   AND v_pandit.verification_status = 'approved'
                   AND v_pandit.public_status = 'available' THEN

                    v_dow := EXTRACT(DOW FROM (v_booking.scheduled_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
                    v_start_time := (v_booking.scheduled_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
                    v_end_time := (v_booking.scheduled_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

                    -- Re-verify Pandit availability rules and unavailability blocks
                    IF EXISTS (
                        SELECT 1 FROM public.pandit_availability_rules
                        WHERE pandit_id = v_booking.pandit_id
                          AND day_of_week = v_dow
                          AND is_active = true
                          AND start_time <= v_start_time
                          AND end_time >= v_end_time
                    ) AND NOT EXISTS (
                        SELECT 1 FROM public.pandit_unavailability_blocks
                        WHERE pandit_id = v_booking.pandit_id
                          AND v_booking.scheduled_start_at < ends_at
                          AND v_booking.scheduled_end_at > starts_at
                    ) THEN

                        -- Re-verify that the slot has not been taken by another confirmed booking or active reservation
                        IF NOT EXISTS (
                            SELECT 1 
                            FROM public.bookings b
                            WHERE b.pandit_id = v_booking.pandit_id
                              AND b.id != v_booking.id
                              AND (
                                  b.status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
                                  OR (
                                      b.status = 'payment_pending'
                                      AND EXISTS (
                                          SELECT 1 FROM public.payment_orders po
                                          WHERE po.booking_id = b.id
                                            AND po.purpose = 'booking_advance'::public.payment_order_purpose
                                            AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
                                            AND COALESCE(po.due_at, po.created_at + interval '30 minutes') > now()
                                      )
                                  )
                              )
                              AND v_booking.scheduled_start_at < b.scheduled_end_at
                              AND v_booking.scheduled_end_at > b.scheduled_start_at
                        ) THEN
                            v_can_confirm := true;
                        END IF;
                    END IF;
                END IF;
            END IF;

            IF v_can_confirm THEN
                IF v_booking.status = 'cancelled'::public.booking_status OR v_order.status = 'expired'::public.payment_order_status THEN
                    v_is_timeout_recovery := true;
                END IF;

                -- Mark Payment Order Paid upon valid confirmation or recovery
                UPDATE public.payment_orders
                SET status = 'paid'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                -- Transition booking status to 'confirmed', clearing any previous timeout cancellation
                UPDATE public.bookings
                SET status = 'confirmed'::public.booking_status,
                    confirmed_at = now(),
                    cancelled_at = NULL,
                    cancellation_reason = NULL,
                    updated_at = now()
                WHERE id = v_booking.id;

                -- Create future balance payment order obligation if balance is outstanding
                IF v_booking.balance_amount > 0 AND NOT EXISTS (
                    SELECT 1 FROM public.payment_orders
                    WHERE booking_id = v_booking.id
                      AND purpose = 'booking_balance'::public.payment_order_purpose
                      AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status, 'paid'::public.payment_order_status)
                ) THEN
                    INSERT INTO public.payment_orders (
                        booking_id,
                        purpose,
                        amount,
                        currency,
                        status,
                        provider,
                        due_at
                    ) VALUES (
                        v_booking.id,
                        'booking_balance'::public.payment_order_purpose,
                        v_booking.balance_amount,
                        'INR',
                        'created'::public.payment_order_status,
                        'razorpay',
                        CASE
                            WHEN v_booking.scheduled_start_at - interval '24 hours' <= now() THEN now()
                            ELSE v_booking.scheduled_start_at - interval '24 hours'
                        END
                    );
                END IF;

                v_result := jsonb_build_object(
                    'status', 'confirmed',
                    'purpose', 'booking_advance',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'advance_paid', p_verified_amount,
                    'balance_amount', v_booking.balance_amount,
                    'payment_transaction_id', v_transaction_id,
                    'confirmed_at', now(),
                    'is_recovered', v_is_timeout_recovery
                );
            ELSE
                -- Confirmation not possible: order expired/cancelled, overdue, slot claimed, or pandit unavailable.
                -- Safely maintain terminal states and queue full refund.
                IF v_order.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status) THEN
                    UPDATE public.payment_orders
                    SET status = 'expired'::public.payment_order_status,
                        updated_at = now()
                    WHERE id = v_order.id;
                END IF;

                IF v_booking.status = 'payment_pending'::public.booking_status THEN
                    UPDATE public.bookings
                    SET status = 'cancelled'::public.booking_status,
                        cancellation_reason = CASE
                            WHEN v_is_overdue THEN 'payment_timeout'
                            ELSE 'booking_conflict'
                        END,
                        cancelled_at = now(),
                        updated_at = now()
                    WHERE id = v_booking.id;
                END IF;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    CASE 
                        WHEN v_is_overdue THEN 'Payment captured after booking advance deadline expired: automatic full refund queued.'
                        WHEN v_booking.scheduled_start_at <= now() THEN 'Ritual scheduled start time has already passed: automatic full refund queued.'
                        WHEN v_order.status = 'cancelled'::public.payment_order_status
                             OR EXISTS (SELECT 1 FROM public.booking_cancellations WHERE booking_id = v_booking.id)
                             OR (v_booking.status = 'cancelled'::public.booking_status AND (v_booking.cancellation_reason IS NULL OR v_booking.cancellation_reason != 'payment_timeout'))
                             THEN 'Booking was explicitly cancelled: automatic full refund queued.'
                        ELSE 'Time slot was reserved by another booking: automatic full refund queued.'
                    END,
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'booking_advance',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', CASE 
                        WHEN v_is_overdue THEN 'Payment captured after checkout deadline expired. Full refund has been queued automatically.'
                        WHEN v_booking.scheduled_start_at <= now() THEN 'Ritual scheduled start time has already passed. Full refund has been queued automatically.'
                        WHEN v_order.status = 'cancelled'::public.payment_order_status
                             OR EXISTS (SELECT 1 FROM public.booking_cancellations WHERE booking_id = v_booking.id)
                             OR (v_booking.status = 'cancelled'::public.booking_status AND (v_booking.cancellation_reason IS NULL OR v_booking.cancellation_reason != 'payment_timeout'))
                             THEN 'Booking was cancelled. Full refund has been queued automatically.'
                        ELSE 'Time slot was no longer available when payment arrived. Full refund has been queued automatically.'
                    END
                );
            END IF;

        -- ------------------------------------------------------------
        -- B. booking_balance: Settles ritual dakshina balance (F3-02 Fix)
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

            IF v_booking.status NOT IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled') THEN
                RAISE EXCEPTION 'Booking must be in confirmed/active state to pay balance (current state: %).', v_booking.status;
            END IF;

            -- Settle balance: Updating updated_at on bookings row.
            -- Full financial balance settlement is authoritatively tracked via
            -- public.payment_transactions ('captured') and public.payment_orders ('paid'),
            -- which is validated by public.calculate_booking_balance returning outstanding_balance = 0.
            UPDATE public.payment_orders
            SET status = 'paid'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;

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
        -- C. prepone_fee: Confirms administrative reschedule fee (F3-02 Fix)
        -- ------------------------------------------------------------
        WHEN 'prepone_fee' THEN
            IF v_order.booking_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose prepone_fee must have an associated booking_id.';
            END IF;

            SELECT * INTO v_booking
            FROM public.bookings
            WHERE id = v_order.booking_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Booking % not found.', v_order.booking_id;
            END IF;

            -- Locate and lock the linked prepone reschedule request
            -- Priority 1: Direct 1-to-1 association via payment_order_id
            -- Priority 2: Unambiguous fallback matching booking_id, change_type, fee_amount
            SELECT * INTO v_reschedule
            FROM public.booking_reschedule_requests
            WHERE (payment_order_id = v_order.id
                   OR (payment_order_id IS NULL AND booking_id = v_booking.id AND change_type = 'prepone' AND fee_amount = p_verified_amount))
            ORDER BY (payment_order_id = v_order.id) DESC, created_at DESC
            LIMIT 1
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No reschedule request found associated with payment order % for booking %.',
                    v_order.id, v_booking.id;
            END IF;

            -- Check Reschedule Policy Limit: If limit reached, reject request and queue fee refund
            -- while strictly preserving the original booking
            SELECT * INTO v_policy FROM public.booking_policy_settings WHERE id = 1;
            IF v_booking.reschedule_count >= COALESCE(v_policy.max_reschedules, 1) THEN
                UPDATE public.payment_orders
                SET status = 'expired'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                IF v_reschedule.status = 'requested'::public.reschedule_request_status THEN
                    UPDATE public.booking_reschedule_requests
                    SET status = 'rejected'::public.reschedule_request_status,
                        updated_at = now()
                    WHERE id = v_reschedule.id;
                END IF;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Booking has reached the maximum permitted reschedule limit: automatic fee refund queued.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Booking has reached maximum permitted reschedule limit. Reschedule fee refund has been queued automatically.'
                );
            END IF;

            -- Strict Validation of Linked Reschedule Request Integrity:
            -- 1. Validate booking association
            IF v_reschedule.booking_id != v_booking.id THEN
                RAISE EXCEPTION 'Reschedule request % does not belong to booking %.',
                    v_reschedule.id, v_booking.id;
            END IF;

            -- 2. Validate payment order link
            IF v_reschedule.payment_order_id IS NOT NULL AND v_reschedule.payment_order_id != v_order.id THEN
                RAISE EXCEPTION 'Reschedule request % is linked to a different payment order (%).',
                    v_reschedule.id, v_reschedule.payment_order_id;
            END IF;

            -- 3. Validate change_type
            IF v_reschedule.change_type != 'prepone'::public.reschedule_change_type THEN
                RAISE EXCEPTION 'Reschedule request % change type is "%", expected "prepone".',
                    v_reschedule.id, v_reschedule.change_type;
            END IF;

            -- 4. Reject cancelled, rejected, or overdue requests
            -- Note: if order and request expired solely due to housekeeping timeout (v_reschedule.status = 'expired' and v_order.status = 'expired'),
            -- but the captured payment was ON TIME (NOT v_is_overdue), permit recovery to proceed!
            IF v_order.status = 'cancelled'::public.payment_order_status
               OR v_reschedule.status IN ('rejected'::public.reschedule_request_status, 'cancelled'::public.reschedule_request_status)
               OR v_is_overdue
               OR (v_reschedule.status != 'requested'::public.reschedule_request_status AND v_reschedule.status != 'expired'::public.reschedule_request_status) THEN
                IF v_order.status IN ('created', 'pending') THEN
                    UPDATE public.payment_orders
                    SET status = 'expired'::public.payment_order_status,
                        updated_at = now()
                    WHERE id = v_order.id;
                END IF;

                IF v_reschedule.status = 'requested'::public.reschedule_request_status THEN
                    UPDATE public.booking_reschedule_requests
                    SET status = CASE
                            WHEN v_is_overdue THEN 'expired'::public.reschedule_request_status
                            ELSE 'rejected'::public.reschedule_request_status
                        END,
                        updated_at = now()
                    WHERE id = v_reschedule.id;
                END IF;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    CASE 
                        WHEN v_is_overdue THEN 'Payment captured after prepone fee order deadline: automatic fee refund queued.'
                        ELSE 'Payment captured after prepone fee order expired or request was closed: automatic fee refund queued.'
                    END,
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', CASE 
                        WHEN v_is_overdue THEN 'Fee payment captured after deadline expired. Fee refund has been queued automatically.'
                        ELSE 'Fee payment captured after request expired or closed. Fee refund has been queued automatically.'
                    END
                );
            END IF;

            -- 5. Validate fee amount equality
            IF v_reschedule.fee_amount != p_verified_amount THEN
                RAISE EXCEPTION 'Reschedule request fee amount (%) does not match verified payment amount (%).',
                    v_reschedule.fee_amount, p_verified_amount;
            END IF;

            -- 6. Validate timing freshness: If requested start time has already passed, expire request and queue refund
            IF v_reschedule.requested_start_at <= now() THEN
                UPDATE public.payment_orders
                SET status = 'expired'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.booking_reschedule_requests
                SET status = 'expired'::public.reschedule_request_status,
                    updated_at = now()
                WHERE id = v_reschedule.id;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Requested reschedule start time is in the past: automatic fee refund queued.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Requested reschedule start time has already passed. Reschedule fee refund has been queued automatically.'
                );
            END IF;

            IF v_reschedule.requested_end_at <= v_reschedule.requested_start_at THEN
                RAISE EXCEPTION 'Requested reschedule end time must be strictly after start time.';
            END IF;

            -- 7. If associated via fallback, ensure no ambiguous multiple pending requests exist
            IF v_reschedule.payment_order_id IS NULL THEN
                IF (SELECT count(*) FROM public.booking_reschedule_requests WHERE booking_id = v_booking.id AND status = 'requested'::public.reschedule_request_status) > 1 THEN
                    RAISE EXCEPTION 'Multiple ambiguous pending reschedule requests exist for booking %. Cannot associate payment order % safely.',
                        v_booking.id, v_order.id;
                END IF;
            END IF;

            -- Row-level exclusive lock on Pandit to serialize concurrent schedule updates
            SELECT * INTO v_pandit
            FROM public.pandit_profiles
            WHERE id = v_booking.pandit_id
            FOR UPDATE;

            -- Re-verify Pandit Availability for Requested Timestamps
            v_dow := EXTRACT(DOW FROM (v_reschedule.requested_start_at AT TIME ZONE 'Asia/Kolkata'))::INTEGER;
            v_start_time := (v_reschedule.requested_start_at AT TIME ZONE 'Asia/Kolkata')::TIME;
            v_end_time := (v_reschedule.requested_end_at AT TIME ZONE 'Asia/Kolkata')::TIME;

            IF NOT EXISTS (
                SELECT 1 FROM public.pandit_availability_rules
                WHERE pandit_id = v_booking.pandit_id
                  AND day_of_week = v_dow
                  AND is_active = true
                  AND start_time <= v_start_time
                  AND end_time >= v_end_time
            ) OR EXISTS (
                SELECT 1 FROM public.pandit_unavailability_blocks
                WHERE pandit_id = v_booking.pandit_id
                  AND v_reschedule.requested_start_at < ends_at
                  AND v_reschedule.requested_end_at > starts_at
            ) THEN
                UPDATE public.payment_orders
                SET status = 'expired'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.booking_reschedule_requests
                SET status = 'rejected'::public.reschedule_request_status,
                    updated_at = now()
                WHERE id = v_reschedule.id;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Pandit is not available during requested reschedule time window: automatic fee refund queued.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Pandit is not available at requested reschedule slot. Reschedule fee refund has been queued automatically.'
                );
            END IF;

            -- Conflict Check Against Other Bookings or Pending Reservations (Deadline-Aware)
            IF EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.pandit_id = v_booking.pandit_id
                  AND b.id != v_booking.id
                  AND (
                      b.status IN ('confirmed', 'upcoming', 'in_progress', 'rescheduled')
                      OR (
                          b.status = 'payment_pending'
                          AND EXISTS (
                              SELECT 1 FROM public.payment_orders po
                              WHERE po.booking_id = b.id
                                AND po.purpose = 'booking_advance'::public.payment_order_purpose
                                AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
                                AND COALESCE(po.due_at, po.created_at + interval '30 minutes') > now()
                          )
                      )
                  )
                  AND b.scheduled_start_at < v_reschedule.requested_end_at
                  AND b.scheduled_end_at > v_reschedule.requested_start_at
            ) THEN
                UPDATE public.payment_orders
                SET status = 'expired'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.booking_reschedule_requests
                SET status = 'rejected'::public.reschedule_request_status,
                    updated_at = now()
                WHERE id = v_reschedule.id;

                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Requested reschedule window conflicts with an existing booking: automatic fee refund queued.',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                RETURN jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'prepone_fee',
                    'booking_id', v_booking.id,
                    'booking_number', v_booking.booking_number,
                    'reschedule_request_id', v_reschedule.id,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Requested reschedule slot was no longer available when fee payment arrived. Fee refund has been queued automatically.'
                );
            END IF;

            -- Mark Payment Order Paid upon valid prepone fee confirmation
            UPDATE public.payment_orders
            SET status = 'paid'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;

            -- Apply requested booking schedule adjustments: increment count accurately (no silent capping)
            UPDATE public.bookings
            SET scheduled_start_at = v_reschedule.requested_start_at,
                scheduled_end_at = v_reschedule.requested_end_at,
                reschedule_count = v_booking.reschedule_count + 1,
                status = 'rescheduled'::public.booking_status,
                updated_at = now()
            WHERE id = v_booking.id;

            -- Mark reschedule request approved and link payment_order_id deterministically
            UPDATE public.booking_reschedule_requests
            SET status = 'approved'::public.reschedule_request_status,
                approved_at = now(),
                payment_order_id = COALESCE(payment_order_id, v_order.id),
                updated_at = now()
            WHERE id = v_reschedule.id;

            -- Shift due_at for any open balance payment order to maintain 24h cutoff
            UPDATE public.payment_orders
            SET due_at = CASE 
                    WHEN v_reschedule.requested_start_at - interval '24 hours' <= now() THEN now()
                    ELSE v_reschedule.requested_start_at - interval '24 hours'
                END,
                updated_at = now()
            WHERE booking_id = v_booking.id
              AND purpose = 'booking_balance'::public.payment_order_purpose
              AND status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status);

            v_result := jsonb_build_object(
                'status', 'prepone_confirmed',
                'purpose', 'prepone_fee',
                'booking_id', v_booking.id,
                'booking_number', v_booking.booking_number,
                'reschedule_request_id', v_reschedule.id,
                'new_scheduled_start_at', v_reschedule.requested_start_at,
                'new_scheduled_end_at', v_reschedule.requested_end_at,
                'fee_paid', p_verified_amount,
                'reschedule_count', v_booking.reschedule_count + 1,
                'payment_transaction_id', v_transaction_id,
                'confirmed_at', now()
            );

        -- ------------------------------------------------------------
        -- D. kundli: Confirms Kundli order payment
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

            UPDATE public.payment_orders
            SET status = 'paid'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;

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
        -- E. subscription: Confirms astrology subscription with AST-P01 duration
        -- ------------------------------------------------------------
        WHEN 'subscription' THEN
            IF v_order.subscription_id IS NULL THEN
                RAISE EXCEPTION 'Payment order with purpose subscription must have an associated subscription_id.';
            END IF;

            IF v_order.status = 'cancelled' OR v_subscription.status = 'cancelled' THEN
                -- AST-P02: Late capture on cancelled subscription queues refund
                INSERT INTO public.refunds (
                    payment_transaction_id,
                    booking_cancellation_id,
                    amount,
                    reason,
                    status
                ) VALUES (
                    v_transaction_id,
                    NULL,
                    p_verified_amount,
                    'Payment captured after subscription cancellation',
                    'requested'::public.refund_status
                ) RETURNING id INTO v_refund_id;

                v_result := jsonb_build_object(
                    'status', 'refund_queued',
                    'purpose', 'subscription',
                    'subscription_id', v_subscription.id,
                    'subscription_status', v_subscription.status,
                    'payment_order_id', v_order.id,
                    'payment_transaction_id', v_transaction_id,
                    'refund_id', v_refund_id,
                    'refund_status', 'requested',
                    'amount_refunded', p_verified_amount,
                    'message', 'Payment captured after subscription was cancelled. Refund has been queued automatically.'
                );
            ELSE
                IF v_subscription.status != 'pending_payment' THEN
                    RAISE EXCEPTION 'Subscription is not in pending_payment state (current state: %).', v_subscription.status;
                END IF;

                -- AST-P01: Use immutable checkout snapshot duration_days
                IF v_order.duration_days IS NULL OR v_order.duration_days <= 0 THEN
                    RAISE EXCEPTION 'Payment order % is missing authoritative duration_days snapshot.', v_order.id;
                END IF;

                -- Check for existing active subscription to stack or activate immediately
                SELECT * INTO v_active_sub
                FROM public.astrology_subscriptions
                WHERE customer_id = v_subscription.customer_id
                  AND id != v_subscription.id
                  AND status = 'active'
                  AND ends_at > now()
                ORDER BY ends_at DESC
                LIMIT 1;

                IF FOUND THEN
                    v_starts_at := v_active_sub.ends_at;
                ELSE
                    v_starts_at := now();
                END IF;

                v_ends_at := v_starts_at + (v_order.duration_days || ' days')::interval;

                UPDATE public.payment_orders
                SET status = 'paid'::public.payment_order_status,
                    updated_at = now()
                WHERE id = v_order.id;

                UPDATE public.astrology_subscriptions
                SET status = 'active',
                    starts_at = v_starts_at,
                    ends_at = v_ends_at,
                    updated_at = now()
                WHERE id = v_subscription.id;

                v_result := jsonb_build_object(
                    'status', 'active',
                    'purpose', 'subscription',
                    'subscription_id', v_subscription.id,
                    'customer_id', v_subscription.customer_id,
                    'amount_paid', p_verified_amount,
                    'duration_days', v_order.duration_days,
                    'starts_at', v_starts_at,
                    'ends_at', v_ends_at,
                    'payment_transaction_id', v_transaction_id,
                    'paid_at', now()
                );
            END IF;

        -- ------------------------------------------------------------
        -- F. Fallback: Fail closed on unsupported or unhandled payment order purpose
        -- ------------------------------------------------------------
        ELSE
            RAISE EXCEPTION 'Unsupported or unhandled payment order purpose: "%". This purpose is not routed for automated fulfillment via confirm_booking_payment.', v_order.purpose
                USING ERRCODE = '22000';
    END CASE;

    RETURN v_result;
END;
$$;

-- Explicit Execution ACLs for confirm_booking_payment
REVOKE ALL ON FUNCTION public.confirm_booking_payment(
    UUID, TEXT, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(
    UUID, TEXT, NUMERIC, TEXT, JSONB
) TO service_role, postgres;


-- =============================================================================
-- 4. FUNCTION: public.expire_stale_payment_orders (AUTHORITATIVE HOUSEKEEPING)
-- =============================================================================
-- Authoritatively transitions expired unpaid payment orders to 'expired',
-- cancels associated payment_pending bookings, and expires pending reschedule requests.
-- Safe, idempotent, non-destructive, and concurrency-safe via FOR UPDATE SKIP LOCKED.

CREATE OR REPLACE FUNCTION public.expire_stale_payment_orders(
    p_batch_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_order RECORD;
    v_expired_count INTEGER := 0;
    v_cancelled_bookings INTEGER := 0;
    v_expired_reschedules INTEGER := 0;
BEGIN
    FOR v_order IN
        SELECT po.id, po.booking_id, po.purpose, po.status, b.status AS booking_status
        FROM public.payment_orders po
        LEFT JOIN public.bookings b ON b.id = po.booking_id
        WHERE po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
          AND (
              COALESCE(po.due_at, po.created_at + interval '30 minutes') < now()
              OR (po.booking_id IS NOT NULL AND b.status = 'cancelled'::public.booking_status)
          )
        ORDER BY COALESCE(po.due_at, po.created_at + interval '30 minutes') ASC
        LIMIT COALESCE(p_batch_limit, 100)
        FOR UPDATE OF po SKIP LOCKED
    LOOP
        -- If associated booking was already cancelled, transition order to 'cancelled'
        IF v_order.booking_id IS NOT NULL AND v_order.booking_status = 'cancelled'::public.booking_status THEN
            UPDATE public.payment_orders
            SET status = 'cancelled'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;
        ELSE
            -- Transition payment order to expired
            UPDATE public.payment_orders
            SET status = 'expired'::public.payment_order_status,
                updated_at = now()
            WHERE id = v_order.id;
        END IF;

        v_expired_count := v_expired_count + 1;

        -- If booking advance order, cancel associated payment_pending booking
        IF v_order.purpose = 'booking_advance'::public.payment_order_purpose AND v_order.booking_id IS NOT NULL THEN
            UPDATE public.bookings
            SET status = 'cancelled'::public.booking_status,
                cancellation_reason = 'payment_timeout',
                cancelled_at = COALESCE(cancelled_at, now()),
                updated_at = now()
            WHERE id = v_order.booking_id
              AND status = 'payment_pending'::public.booking_status;

            IF FOUND THEN
                v_cancelled_bookings := v_cancelled_bookings + 1;
            END IF;

        -- If prepone fee order, expire associated requested reschedule request
        ELSIF v_order.purpose = 'prepone_fee'::public.payment_order_purpose THEN
            UPDATE public.booking_reschedule_requests
            SET status = 'expired'::public.reschedule_request_status,
                updated_at = now()
            WHERE payment_order_id = v_order.id
              AND status = 'requested'::public.reschedule_request_status;

            IF FOUND THEN
                v_expired_reschedules := v_expired_reschedules + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'expired_orders', v_expired_count,
        'cancelled_bookings', v_cancelled_bookings,
        'expired_reschedules', v_expired_reschedules,
        'executed_at', now()
    );
END;
$$;

-- Explicit Execution ACLs for expire_stale_payment_orders
REVOKE ALL ON FUNCTION public.expire_stale_payment_orders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_payment_orders(INTEGER) TO service_role, postgres;


-- =============================================================================
-- 5. SCHEDULER: Idempotent pg_cron Registration for Housekeeping Worker
-- =============================================================================
-- If pg_cron extension is available in the target environment, register the
-- recurring stale payment order housekeeping worker to run every 10 minutes.
-- If pg_cron is not present, this block safely no-ops without error.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stale_payment_order_housekeeping') THEN
            PERFORM cron.unschedule('stale_payment_order_housekeeping');
        END IF;

        PERFORM cron.schedule(
            'stale_payment_order_housekeeping',
            '*/10 * * * *',
            'SELECT public.expire_stale_payment_orders(100);'
        );
    END IF;
END $$;


-- =============================================================================
-- 6. REFUND RECONCILIATION HARDENING: reconcile_processed_refund & reconcile_failed_refund
-- =============================================================================
-- Authoritative server-side atomic reconciliation of gateway refunds.
-- Guarantees:
-- 1. Gateway Status Enforcement: Only 'processed' gateway status can ever transition
--    a refund to 'processed'. Any other gateway status ('pending', 'failed', malformed)
--    is strictly rejected, preventing unconfirmed refunds from marking bookings refunded.
-- 2. Non-Regression Invariant: Refunds already in 'processed' state can never regress
--    to 'failed', 'processing', or 'requested'.
-- 3. Row-Level Locking: FOR UPDATE on refunds and payment_transactions ensures concurrency safety.
-- 4. Amount Validation: Exact integer paise verification against expected database amount.
-- 5. Execution ACLs: Restricted strictly to service_role.

-- -----------------------------------------------------------------------------
-- Schema Extension: Refunds execution_attempt_id
-- -----------------------------------------------------------------------------
-- Track execution_attempt_id on public.refunds to bind gateway reconciliation evidence to the exact processing attempt
ALTER TABLE public.refunds 
    ADD COLUMN IF NOT EXISTS execution_attempt_id UUID;

-- -----------------------------------------------------------------------------
-- Enhanced Exclusive Claim RPC: claim_refund_for_execution
-- -----------------------------------------------------------------------------
-- Atomically claims a requested or failed refund, stamping a unique execution_attempt_id
-- and updated_at to ensure that subsequent administrative recovery proof is strictly attempt-scoped.
CREATE OR REPLACE FUNCTION public.claim_refund_for_execution(
    p_refund_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_refund RECORD;
    v_tx RECORD;
    v_attempt_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only administrators can execute gateway refunds.';
    END IF;

    SELECT *
    INTO v_refund
    FROM public.refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'not_found',
            'error', 'Refund record not found.',
            'status_code', 404
        );
    END IF;

    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_processed',
            'refund_id', v_refund.id,
            'provider_refund_id', v_refund.provider_refund_id,
            'amount', v_refund.amount,
            'status_code', 200
        );
    END IF;

    IF v_refund.status = 'processing' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'already_processing',
            'error', 'Refund execution is already in progress for this record.',
            'status_code', 409
        );
    END IF;

    IF v_refund.status NOT IN ('requested', 'failed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_status',
            'error', 'Refund cannot be executed from status ' || v_refund.status || '.',
            'status_code', 400
        );
    END IF;

    SELECT *
    INTO v_tx
    FROM public.payment_transactions
    WHERE id = v_refund.payment_transaction_id;

    IF NOT FOUND OR v_tx.provider_payment_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'missing_payment_provider',
            'error', 'No provider payment ID linked to this refund transaction.',
            'status_code', 400
        );
    END IF;

    v_attempt_id := gen_random_uuid();

    UPDATE public.refunds
    SET status = 'processing',
        execution_attempt_id = v_attempt_id,
        updated_at = now()
    WHERE id = p_refund_id;

    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            after_json,
            details
        ) VALUES (
            v_caller_id,
            'claim_gateway_refund',
            'refund',
            p_refund_id::text,
            jsonb_build_object(
                'amount', v_refund.amount,
                'payment_transaction_id', v_refund.payment_transaction_id,
                'provider_payment_id', v_tx.provider_payment_id,
                'previous_status', v_refund.status,
                'new_status', 'processing',
                'execution_attempt_id', v_attempt_id
            ),
            jsonb_build_object(
                'amount', v_refund.amount,
                'payment_transaction_id', v_refund.payment_transaction_id,
                'provider_payment_id', v_tx.provider_payment_id,
                'previous_status', v_refund.status,
                'new_status', 'processing',
                'execution_attempt_id', v_attempt_id
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'claimed',
        'refund_id', v_refund.id,
        'payment_transaction_id', v_refund.payment_transaction_id,
        'provider_payment_id', v_tx.provider_payment_id,
        'booking_cancellation_id', v_refund.booking_cancellation_id,
        'amount', v_refund.amount,
        'execution_attempt_id', v_attempt_id,
        'status_code', 200
    );
END;
$$;

COMMENT ON FUNCTION public.claim_refund_for_execution(UUID) IS
'Atomically claims a requested or failed refund obligation for gateway execution, generating an attempt-scoped execution_attempt_id token to bind recovery proof.';

REVOKE EXECUTE ON FUNCTION public.claim_refund_for_execution(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_refund_for_execution(UUID) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.reconcile_processed_refund(
    p_refund_id UUID,
    p_provider_refund_id TEXT,
    p_amount_paise BIGINT,
    p_gateway_status TEXT DEFAULT 'processed',
    p_raw_response JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_refund RECORD;
    v_tx RECORD;
    v_expected_paise BIGINT;
    v_total_processed NUMERIC(12,2) := 0;
    v_new_tx_status public.payment_transaction_status;
BEGIN
    IF p_provider_refund_id IS NULL OR trim(p_provider_refund_id) = '' THEN
        RAISE EXCEPTION 'Provider refund ID is required for reconciliation.';
    END IF;

    -- Strict Gateway Status Guard: Reject NULL, empty, whitespace-only, pending, failed, or any unrecognized status.
    -- ONLY a non-NULL status that normalizes to 'processed' may proceed.
    IF p_gateway_status IS NULL OR lower(trim(p_gateway_status)) != 'processed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_gateway_status',
            'error', 'Cannot reconcile refund as processed when gateway status is ' || COALESCE(NULLIF(trim(p_gateway_status), ''), 'NULL')
        );
    END IF;

    SELECT *
    INTO v_refund
    FROM public.refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'not_found',
            'error', 'Refund record not found.'
        );
    END IF;

    -- Non-regression guard: already processed is idempotent success
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_processed',
            'refund_id', v_refund.id,
            'provider_refund_id', v_refund.provider_refund_id
        );
    END IF;

    v_expected_paise := ROUND(v_refund.amount * 100);
    IF p_amount_paise IS NOT NULL AND p_amount_paise != v_expected_paise THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'amount_mismatch',
            'error', 'Gateway refund amount (' || p_amount_paise || ' paise) does not match expected amount (' || v_expected_paise || ' paise).'
        );
    END IF;

    SELECT *
    INTO v_tx
    FROM public.payment_transactions
    WHERE id = v_refund.payment_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'transaction_not_found',
            'error', 'Parent payment transaction not found.'
        );
    END IF;

    UPDATE public.refunds
    SET 
        status = 'processed',
        execution_attempt_id = NULL,
        provider_refund_id = p_provider_refund_id,
        processed_at = COALESCE(processed_at, now()),
        updated_at = now()
    WHERE id = v_refund.id;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_processed
    FROM public.refunds
    WHERE payment_transaction_id = v_tx.id
      AND status = 'processed';

    IF v_total_processed >= v_tx.amount THEN
        v_new_tx_status := 'refunded';
    ELSE
        v_new_tx_status := 'partially_refunded';
    END IF;

    UPDATE public.payment_transactions
    SET status = v_new_tx_status
    WHERE id = v_tx.id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'refund_processed',
        'refund_id', v_refund.id,
        'provider_refund_id', p_provider_refund_id,
        'transaction_id', v_tx.id,
        'transaction_status', v_new_tx_status,
        'total_refunded', v_total_processed
    );
END;
$$;

COMMENT ON FUNCTION public.reconcile_processed_refund(UUID, TEXT, BIGINT, TEXT, JSONB) IS
'Authoritative server-side atomic reconciliation of gateway refunds. Enforces gateway status validation, amount checks, idempotency, and non-regression.';

REVOKE EXECUTE ON FUNCTION public.reconcile_processed_refund(UUID, TEXT, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_processed_refund(UUID, TEXT, BIGINT, TEXT, JSONB) TO service_role;


-- Explicitly drop the legacy 3-parameter overload from Migration 025 to prevent
-- function signature ambiguity and ensure all callers resolve to the canonical 4-parameter function.
DROP FUNCTION IF EXISTS public.reconcile_failed_refund(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.reconcile_failed_refund(
    p_provider_refund_id TEXT DEFAULT NULL,
    p_error_code TEXT DEFAULT NULL,
    p_error_description TEXT DEFAULT NULL,
    p_refund_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_refund RECORD;
    v_clean_provider_id TEXT;
BEGIN
    v_clean_provider_id := NULLIF(trim(COALESCE(p_provider_refund_id, '')), '');

    IF p_refund_id IS NULL AND v_clean_provider_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'missing_identifier',
            'error', 'Either a valid refund UUID (p_refund_id) or a provider refund ID (p_provider_refund_id) is required.'
        );
    END IF;

    -- Lookup prioritizes exact local refund primary key UUID, with fallback to provider_refund_id
    IF p_refund_id IS NOT NULL THEN
        SELECT *
        INTO v_refund
        FROM public.refunds
        WHERE id = p_refund_id
        FOR UPDATE;
    ELSE
        SELECT *
        INTO v_refund
        FROM public.refunds
        WHERE provider_refund_id = v_clean_provider_id
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'not_found',
            'error', 'Refund record not found.'
        );
    END IF;

    -- Non-regression guard: never regress processed state
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'ignored_already_processed',
            'refund_id', v_refund.id,
            'message', 'Refund is already authoritative processed; ignoring late gateway failure event.'
        );
    END IF;

    UPDATE public.refunds
    SET status = 'failed'::public.refund_status,
        provider_refund_id = COALESCE(v_refund.provider_refund_id, v_clean_provider_id),
        execution_attempt_id = NULL,
        updated_at = now()
    WHERE id = v_refund.id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'refund_failed',
        'refund_id', v_refund.id,
        'provider_refund_id', COALESCE(v_refund.provider_refund_id, v_clean_provider_id)
    );
END;
$$;

COMMENT ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT, UUID) IS
'Authoritative failure recording for gateway refunds. Guarantees processed state never regresses and supports local UUID or provider ID lookups.';

REVOKE EXECUTE ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_failed_refund(TEXT, TEXT, TEXT, UUID) TO service_role;


-- =============================================================================
-- 7. AUTHORITATIVE ADMINISTRATIVE RECOVERY & EXPLICIT FINANCIAL AUTHORIZATION
-- =============================================================================
-- Case E (Ambiguous original POST timeout followed by empty search) represents an
-- unknown provider outcome. A complete search only reflects absence at that time
-- and does not establish that the gateway request cannot settle later.
-- Therefore, an automated search alone (refund_reconciliation_not_found) CANNOT
-- authorize unlocking or retrying an ambiguous refund.
--
-- Strict Server-Enforced Controls:
-- 1. Explicit Financial-Operations Review: A Super Administrator must formally review
--    external gateway records / merchant bank statements and authorize recovery
--    via public.record_refund_recovery_authorization or direct super-admin unlock.
-- 2. Audit Binding: The authorization record ('refund_recovery_authorized') is
--    strictly bound to the current execution_attempt_id.
-- 3. Invalidation Across Attempts: Any new claim generates a new execution_attempt_id,
--    permanently invalidating all prior review decisions and reconciliation proofs.
-- 4. Concurrency Protection: SELECT ... FOR UPDATE serializes review and unlock.
-- 5. Conflict Guard: Conflicts ('refund_reconciliation_conflict') permanently block
--    both authorization and unlock.

CREATE OR REPLACE FUNCTION public.record_refund_recovery_authorization(
    p_refund_id UUID,
    p_reviewed_outcome TEXT,
    p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_refund RECORD;
    v_clean_outcome TEXT;
    v_clean_justification TEXT;
BEGIN
    -- 1. Authorization: Only Super Administrators can authorize recovery of ambiguous refund outcomes
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_super_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only Super Administrators can authorize financial recovery of ambiguous refund outcomes.';
    END IF;

    -- 2. Validate Refund ID
    IF p_refund_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_id',
            'error', 'A valid refund ID is required.',
            'status_code', 400
        );
    END IF;

    -- 3. Validate Reviewed Outcome Classification
    v_clean_outcome := lower(trim(COALESCE(p_reviewed_outcome, '')));
    IF v_clean_outcome NOT IN (
        'manual_gateway_dashboard_verified_no_refund',
        'merchant_bank_account_verified_no_debit',
        'provider_support_ticket_confirmed_void'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_reviewed_outcome',
            'error', 'A valid reviewed provider outcome classification is mandatory (e.g. manual_gateway_dashboard_verified_no_refund, merchant_bank_account_verified_no_debit, provider_support_ticket_confirmed_void).',
            'status_code', 400
        );
    END IF;

    -- 4. Validate Operational Justification (minimum 15 characters)
    v_clean_justification := trim(COALESCE(p_justification, ''));
    IF length(v_clean_justification) < 15 THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'empty_justification',
            'error', 'A detailed operational justification (minimum 15 characters) documenting the external financial verification is mandatory.',
            'status_code', 400
        );
    END IF;

    -- 5. Row-level Lock
    SELECT *
    INTO v_refund
    FROM public.refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'not_found',
            'error', 'Refund record not found.',
            'status_code', 404
        );
    END IF;

    IF v_refund.status != 'processing' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_status',
            'error', 'Recovery authorization is only applicable to refunds in ''processing'' status.',
            'status_code', 400
        );
    END IF;

    IF v_refund.provider_refund_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'gateway_id_present',
            'error', 'Refund already has an active gateway provider refund ID. Recovery cannot be authorized.',
            'status_code', 400
        );
    END IF;

    IF v_refund.execution_attempt_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'error', 'Refund has no active processing attempt token. Reconciliation must be executed for the current attempt before authorization.',
            'status_code', 400
        );
    END IF;

    -- 6. Verify No Conflicts Exist
    IF EXISTS (
        SELECT 1
        FROM public.admin_audit_logs
        WHERE entity_type = 'refund'
          AND entity_id = p_refund_id::text
          AND action = 'refund_reconciliation_conflict'
          AND (
              (details->>'execution_attempt_id')::text = v_refund.execution_attempt_id::text
              OR created_at >= (now() - INTERVAL '2 hours')
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_conflict',
            'error', 'Cannot authorize recovery: gateway reconciliation detected conflicting refund records on Razorpay.',
            'status_code', 400
        );
    END IF;

    -- 7. Verify Exhaustive Reconciliation Search was Completed for this Attempt
    IF NOT EXISTS (
        SELECT 1
        FROM public.admin_audit_logs
        WHERE entity_type = 'refund'
          AND entity_id = p_refund_id::text
          AND action = 'refund_reconciliation_not_found'
          AND (details->>'execution_attempt_id')::text = v_refund.execution_attempt_id::text
          AND created_at >= (now() - INTERVAL '2 hours')
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'error', 'Exhaustive gateway reconciliation showing no matching refund must be completed for the current attempt before authorization can be recorded.',
            'status_code', 400
        );
    END IF;

    -- 8. Record Explicit Financial Operations Review Audit Record
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        COALESCE(v_caller_id, '00000000-0000-0000-0000-000000000000'::UUID),
        'refund_recovery_authorized',
        'refund',
        p_refund_id::text,
        jsonb_build_object(
            'refund_id', p_refund_id,
            'execution_attempt_id', v_refund.execution_attempt_id,
            'reviewed_outcome', v_clean_outcome,
            'justification', v_clean_justification,
            'authorized_by', v_caller_id,
            'timestamp', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'recovery_authorized',
        'refund_id', p_refund_id,
        'execution_attempt_id', v_refund.execution_attempt_id,
        'reviewed_outcome', v_clean_outcome,
        'status_code', 200
    );
END;
$$;

COMMENT ON FUNCTION public.record_refund_recovery_authorization(UUID, TEXT, TEXT) IS
'Authoritatively records a Super-Admin financial-operations review decision for an ambiguous in-flight refund, enabling attempt-scoped unlock.';

REVOKE EXECUTE ON FUNCTION public.record_refund_recovery_authorization(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_refund_recovery_authorization(UUID, TEXT, TEXT) TO authenticated, service_role;


DROP FUNCTION IF EXISTS public.admin_unlock_stuck_refund(UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_unlock_stuck_refund(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_unlock_stuck_refund(
    p_refund_id UUID,
    p_reason TEXT,
    p_reviewed_outcome TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_refund RECORD;
    v_age_minutes NUMERIC;
    c_min_age_minutes CONSTANT NUMERIC := 15.0;
    v_trimmed_reason TEXT;
    v_clean_outcome TEXT;
    v_has_auth BOOLEAN := false;
BEGIN
    -- 1. Authorization: Authenticated Admin / Super Admin
    v_caller_id := auth.uid();
    IF v_caller_id IS NOT NULL AND NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied: Only administrators can recover stuck refunds.';
    END IF;

    -- 2. Input Validation: Mandatory non-empty reason
    v_trimmed_reason := trim(COALESCE(p_reason, ''));
    IF v_trimmed_reason = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'empty_reason',
            'error', 'A valid non-empty reason is mandatory for administrative refund recovery.',
            'status_code', 400
        );
    END IF;

    IF p_refund_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_id',
            'error', 'A valid refund ID is required.',
            'status_code', 400
        );
    END IF;

    -- 3. Row-level Lock on Refund Obligation
    SELECT *
    INTO v_refund
    FROM public.refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'not_found',
            'error', 'Refund record not found.',
            'status_code', 404
        );
    END IF;

    -- 4. State Validation: Can only recover from 'processing'
    IF v_refund.status = 'processed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'already_processed',
            'error', 'Refund has already been processed by the gateway and cannot be recovered or reset.',
            'status_code', 400
        );
    END IF;

    IF v_refund.status != 'processing' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_status',
            'error', 'Only refunds in ''processing'' state can be recovered. Current status is ''' || v_refund.status || '''.',
            'status_code', 400
        );
    END IF;

    -- 5. Gateway Dispatch Verification: provider_refund_id must be NULL
    IF v_refund.provider_refund_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'gateway_id_present',
            'error', 'Refund already has an active gateway provider refund ID (' || v_refund.provider_refund_id || '). Automatic reconciliation must be awaited.',
            'status_code', 400
        );
    END IF;

    -- 6. Safe Age Verification: Must have remained in processing for >= 15 minutes
    v_age_minutes := EXTRACT(EPOCH FROM (now() - COALESCE(v_refund.updated_at, v_refund.created_at))) / 60.0;
    IF v_age_minutes < c_min_age_minutes THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'too_recent',
            'error', 'Refund claim was updated ' || ROUND(v_age_minutes, 1) || ' minutes ago. A minimum in-flight grace period of ' || c_min_age_minutes || ' minutes is required before administrative recovery.',
            'age_minutes', ROUND(v_age_minutes, 1),
            'min_required_minutes', c_min_age_minutes,
            'status_code', 400
        );
    END IF;

    -- 7. Durable Server-Enforced Reconciliation Precondition:
    IF v_refund.execution_attempt_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'error', 'Refund has no active processing attempt token. Reconciliation must be executed for the current attempt before unlocking.',
            'status_code', 400
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.admin_audit_logs
        WHERE entity_type = 'refund'
          AND entity_id = p_refund_id::text
          AND action = 'refund_reconciliation_conflict'
          AND (
              (details->>'execution_attempt_id')::text = v_refund.execution_attempt_id::text
              OR created_at >= (now() - INTERVAL '2 hours')
          )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_conflict',
            'error', 'Administrative recovery cannot proceed: gateway reconciliation detected conflicting refund records on Razorpay.',
            'status_code', 400
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.admin_audit_logs
        WHERE entity_type = 'refund'
          AND entity_id = p_refund_id::text
          AND action = 'refund_reconciliation_not_found'
          AND (details->>'execution_attempt_id')::text = v_refund.execution_attempt_id::text
          AND created_at >= (now() - INTERVAL '2 hours')
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'error', 'Administrative recovery requires verified exhaustive gateway reconciliation showing no matching refund for the current processing attempt before unlocking. Proof from prior attempts is invalid.',
            'status_code', 400
        );
    END IF;

    -- 8. Explicit Financial-Operations Review Precondition:
    -- An automated search alone (refund_reconciliation_not_found) does NOT establish that an ambiguous
    -- in-flight request can never complete later. An explicit, auditable financial-operations review
    -- decision ('refund_recovery_authorized') bound to the CURRENT attempt is mandatory.
    v_clean_outcome := lower(trim(COALESCE(p_reviewed_outcome, '')));
    IF v_clean_outcome != '' THEN
        -- Direct authorization path: Caller must be Super Admin
        IF v_caller_id IS NOT NULL AND NOT public.is_super_admin(v_caller_id) THEN
            RAISE EXCEPTION 'Access denied: Only Super Administrators can authorize recovery of ambiguous refund outcomes.';
        END IF;

        IF v_clean_outcome NOT IN (
            'manual_gateway_dashboard_verified_no_refund',
            'merchant_bank_account_verified_no_debit',
            'provider_support_ticket_confirmed_void'
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'invalid_reviewed_outcome',
                'error', 'A valid reviewed provider outcome classification is mandatory (e.g. manual_gateway_dashboard_verified_no_refund, merchant_bank_account_verified_no_debit, provider_support_ticket_confirmed_void).',
                'status_code', 400
            );
        END IF;

        IF length(v_trimmed_reason) < 15 THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'empty_justification',
                'error', 'A detailed operational justification (minimum 15 characters) documenting the external financial verification is mandatory.',
                'status_code', 400
            );
        END IF;

        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details
        ) VALUES (
            COALESCE(v_caller_id, '00000000-0000-0000-0000-000000000000'::UUID),
            'refund_recovery_authorized',
            'refund',
            p_refund_id::text,
            jsonb_build_object(
                'refund_id', p_refund_id,
                'execution_attempt_id', v_refund.execution_attempt_id,
                'reviewed_outcome', v_clean_outcome,
                'justification', v_trimmed_reason,
                'authorized_by', v_caller_id,
                'timestamp', now()
            )
        );
        v_has_auth := true;
    ELSE
        -- Two-step path: Verify a prior 'refund_recovery_authorized' exists for this exact attempt
        SELECT EXISTS (
            SELECT 1
            FROM public.admin_audit_logs
            WHERE entity_type = 'refund'
              AND entity_id = p_refund_id::text
              AND action = 'refund_recovery_authorized'
              AND (details->>'execution_attempt_id')::text = v_refund.execution_attempt_id::text
              AND created_at >= (now() - INTERVAL '2 hours')
        ) INTO v_has_auth;
    END IF;

    IF NOT v_has_auth THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'financial_review_required',
            'error', 'Administrative recovery of an ambiguous in-flight refund requires an explicit financial-operations review decision (refund_recovery_authorized) confirming no external debit occurred. An automated search alone cannot authorize recovery.',
            'status_code', 400
        );
    END IF;

    -- 9. Authoritative Transition: processing -> failed
    UPDATE public.refunds
    SET status = 'failed'::public.refund_status,
        execution_attempt_id = NULL,
        updated_at = now()
    WHERE id = p_refund_id;

    -- 10. Authoritative Server Audit Log
    IF v_caller_id IS NOT NULL THEN
        INSERT INTO public.admin_audit_logs (
            actor_user_id,
            action,
            entity_type,
            entity_id,
            before_json,
            after_json,
            details
        ) VALUES (
            v_caller_id,
            'refund_processing_recovered',
            'refund',
            p_refund_id::text,
            jsonb_build_object(
                'status', v_refund.status,
                'provider_refund_id', v_refund.provider_refund_id,
                'updated_at', v_refund.updated_at
            ),
            jsonb_build_object(
                'status', 'failed',
                'provider_refund_id', NULL,
                'updated_at', now()
            ),
            jsonb_build_object(
                'refund_id', p_refund_id,
                'execution_attempt_id', v_refund.execution_attempt_id,
                'previous_status', 'processing',
                'new_status', 'failed',
                'actor', v_caller_id,
                'reason', v_trimmed_reason,
                'in_flight_age_minutes', ROUND(v_age_minutes, 1),
                'timestamp', now()
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'recovered_to_failed',
        'refund_id', p_refund_id,
        'previous_status', 'processing',
        'new_status', 'failed',
        'reason', v_trimmed_reason,
        'status_code', 200
    );
END;
$$;

COMMENT ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT, TEXT) IS
'Authoritatively transitions an orphaned processing refund (with verified complete gateway reconciliation proof, explicit financial-operations review authorization, no provider_refund_id, and age >= 15 mins) to failed, enabling safe retry.';

REVOKE EXECUTE ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unlock_stuck_refund(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
