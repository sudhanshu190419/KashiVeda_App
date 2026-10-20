-- =============================================================================
-- Migration: 059_automatic_refund_dispatch_infrastructure.sql
-- Description: Automatic customer refund dispatch infrastructure for KashiVeda.
--              Provides:
--              1. Authoritative helper RPC: get_pending_requested_refunds
--              2. Asynchronous event trigger on public.refunds via pg_net
--              3. Recurring background sweeper registration via pg_cron
--              4. Strict security definer and privilege lockouts (service_role only)
-- Source of Truth:
--   - Kashi Veda Phase 1 Architecture: Decoupled financial state transitions
--   - Existing migrations 001–058 (authoritative, immutable)
--   - Edge Function: execute-razorpay-refund
-- =============================================================================

-- =============================================================================
-- 1. Helper RPC: get_pending_requested_refunds
-- =============================================================================
-- Authoritative, read-only worker query to retrieve eligible queued refunds
-- that require execution. Filters for status = 'requested' and valid payment link.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_pending_requested_refunds(
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    refund_id UUID,
    booking_cancellation_id UUID,
    payment_transaction_id UUID,
    amount NUMERIC(12,2),
    status public.refund_status,
    created_at TIMESTAMPTZ,
    provider_payment_id TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT 
        r.id AS refund_id,
        r.booking_cancellation_id,
        r.payment_transaction_id,
        r.amount,
        r.status,
        r.created_at,
        pt.provider_payment_id
    FROM public.refunds r
    JOIN public.payment_transactions pt ON pt.id = r.payment_transaction_id
    WHERE r.status = 'requested'::public.refund_status
      AND pt.provider_payment_id IS NOT NULL
    ORDER BY r.created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100));
$$;

COMMENT ON FUNCTION public.get_pending_requested_refunds(INTEGER) IS
'Authoritative helper for refund background dispatchers to retrieve pending requested refunds.';

-- Strict privilege lockdown: worker RPC must never be exposed to public clients
REVOKE ALL ON FUNCTION public.get_pending_requested_refunds(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_requested_refunds(INTEGER) TO service_role, postgres;


-- =============================================================================
-- 2. Event-Driven Trigger Function: trg_dispatch_requested_refund
-- =============================================================================
-- Fires asynchronously AFTER INSERT on public.refunds when status = 'requested'.
-- Dispatches an asynchronous HTTP POST request to execute-razorpay-refund via pg_net.
-- 
-- Invariants & Safety:
-- 1. Fail-Safe: Trapped with EXCEPTION WHEN OTHERS to guarantee that cancellation
--    transactions are NEVER aborted or rolled back if pg_net or networking fails.
-- 2. Non-Blocking: pg_net queues the HTTP request asynchronously.
-- 3. Idempotent: execute-razorpay-refund calls claim_refund_for_execution,
--    preventing duplicate executions even under concurrent or repeated triggers.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_dispatch_requested_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    v_supabase_url TEXT;
    v_service_role_key TEXT;
BEGIN
    -- Only dispatch for 'requested' refunds with an associated payment transaction
    IF NEW.status = 'requested' AND NEW.payment_transaction_id IS NOT NULL THEN
        -- Check if pg_net extension is active in the environment
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
            BEGIN
                -- Safely resolve URL and key from decrypted secrets or configuration
                SELECT decrypted_secret INTO v_supabase_url
                FROM vault.decrypted_secrets
                WHERE name = 'supabase_url'
                LIMIT 1;

                SELECT decrypted_secret INTO v_service_role_key
                FROM vault.decrypted_secrets
                WHERE name = 'service_role_key'
                LIMIT 1;

                -- If vault secrets are available, invoke execute-razorpay-refund via pg_net
                IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
                    PERFORM net.http_post(
                        url := rtrim(v_supabase_url, '/') || '/functions/v1/execute-razorpay-refund',
                        headers := jsonb_build_object(
                            'Content-Type', 'application/json',
                            'Authorization', 'Bearer ' || v_service_role_key
                        ),
                        body := jsonb_build_object(
                            'refund_id', NEW.id
                        )
                    );
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Fail-open: Never block or abort the customer cancellation transaction
                RAISE WARNING 'trg_dispatch_requested_refund notice: pg_net dispatch skipped: %', SQLERRM;
            END;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_dispatch_requested_refund() IS
'Asynchronous event trigger function: pings execute-razorpay-refund via pg_net on refund creation.';

REVOKE ALL ON FUNCTION public.trg_dispatch_requested_refund() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_dispatch_requested_refund() TO service_role, postgres;


-- Attach Trigger to public.refunds
DROP TRIGGER IF EXISTS trg_refund_automatic_dispatch ON public.refunds;

CREATE TRIGGER trg_refund_automatic_dispatch
    AFTER INSERT ON public.refunds
    FOR EACH ROW
    WHEN (NEW.status = 'requested')
    EXECUTE FUNCTION public.trg_dispatch_requested_refund();


-- =============================================================================
-- 3. Recurring Housekeeping Sweeper (pg_cron)
-- =============================================================================
-- Periodic background sweeper to catch any queued refunds that were missed by
-- the event trigger (e.g. during deployments, restarts, or network blips).
-- Default schedule: Every 2 minutes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cron_dispatch_queued_refunds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    v_supabase_url TEXT;
    v_service_role_key TEXT;
    v_count INTEGER := 0;
BEGIN
    -- Check how many requested refunds are currently awaiting execution
    SELECT COUNT(*) INTO v_count
    FROM public.refunds
    WHERE status = 'requested';

    IF v_count > 0 AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        BEGIN
            SELECT decrypted_secret INTO v_supabase_url
            FROM vault.decrypted_secrets
            WHERE name = 'supabase_url'
            LIMIT 1;

            SELECT decrypted_secret INTO v_service_role_key
            FROM vault.decrypted_secrets
            WHERE name = 'service_role_key'
            LIMIT 1;

            IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
                PERFORM net.http_post(
                    url := rtrim(v_supabase_url, '/') || '/functions/v1/execute-razorpay-refund',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || v_service_role_key
                    ),
                    body := jsonb_build_object(
                        'mode', 'dispatch_queued',
                        'batch_size', 10
                    )
                );
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'cron_dispatch_queued_refunds notice: %', SQLERRM;
        END;
    END IF;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.cron_dispatch_queued_refunds() IS
'Cron housekeeping worker: triggers batch dispatch of pending requested refunds every 2 minutes.';

REVOKE ALL ON FUNCTION public.cron_dispatch_queued_refunds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_dispatch_queued_refunds() TO service_role, postgres;

-- Register in pg_cron if extension is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queued_refund_dispatch_sweeper') THEN
            PERFORM cron.unschedule('queued_refund_dispatch_sweeper');
        END IF;

        PERFORM cron.schedule(
            'queued_refund_dispatch_sweeper',
            '*/2 * * * *',
            'SELECT public.cron_dispatch_queued_refunds();'
        );
    END IF;
END $$;
