-- =============================================================================
-- Migration: 060_secure_automatic_refund_dispatch.sql
-- Description: Secure automatic customer refund dispatch infrastructure for KashiVeda.
--              Updates dispatch mechanism to:
--              1. Retrieve 'supabase_url', 'internal_worker_secret', and 'supabase_publishable_key' from Supabase Vault
--              2. Transmit 'apikey' and 'x-worker-secret' headers (eliminates service-role key over HTTP)
--              3. Maintain non-blocking, fail-open cancellation trigger (pg_net)
--              4. Maintain recurring 2-minute background sweeper (pg_cron)
--              5. Log clear, non-sensitive warnings when any required Vault configuration is missing
-- Source of Truth:
--   - KashiVeda Phase 1 Architecture: Decoupled financial state transitions
--   - Migrations 001–059 (authoritative)
--   - Edge Function: execute-razorpay-refund
-- =============================================================================

-- =============================================================================
-- 1. Secure Event-Driven Trigger Function: trg_dispatch_requested_refund
-- =============================================================================
-- Fires asynchronously AFTER INSERT on public.refunds when status = 'requested'.
-- Dispatches an asynchronous HTTP POST to execute-razorpay-refund via pg_net
-- using apikey and the dedicated x-worker-secret header.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_dispatch_requested_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
    v_supabase_url TEXT;
    v_internal_worker_secret TEXT;
    v_supabase_publishable_key TEXT;
BEGIN
    -- Only dispatch for 'requested' refunds with an associated payment transaction
    IF NEW.status = 'requested' AND NEW.payment_transaction_id IS NOT NULL THEN
        -- Check if pg_net extension is active in the environment
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
            BEGIN
                -- Safely resolve URL, internal worker secret, and publishable key from Supabase Vault
                SELECT decrypted_secret INTO v_supabase_url
                FROM vault.decrypted_secrets
                WHERE name = 'supabase_url'
                LIMIT 1;

                SELECT decrypted_secret INTO v_internal_worker_secret
                FROM vault.decrypted_secrets
                WHERE name = 'internal_worker_secret'
                LIMIT 1;

                SELECT decrypted_secret INTO v_supabase_publishable_key
                FROM vault.decrypted_secrets
                WHERE name = 'supabase_publishable_key'
                LIMIT 1;

                -- Check configuration presence
                IF v_supabase_url IS NULL OR v_internal_worker_secret IS NULL OR v_supabase_publishable_key IS NULL THEN
                    RAISE WARNING 'Automatic refund dispatch skipped for refund %: missing required Supabase Vault configuration (supabase_url, internal_worker_secret, or supabase_publishable_key).', NEW.id;
                ELSE
                    -- Invoke execute-razorpay-refund using dedicated x-worker-secret header and apikey
                    -- Never transmits service-role key over HTTP
                    PERFORM net.http_post(
                        url := rtrim(v_supabase_url, '/') || '/functions/v1/execute-razorpay-refund',
                        headers := jsonb_build_object(
                            'Content-Type', 'application/json',
                            'apikey', v_supabase_publishable_key,
                            'x-worker-secret', v_internal_worker_secret
                        ),
                        body := jsonb_build_object(
                            'refund_id', NEW.id
                        )
                    );
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Fail-open: Never block or abort the customer cancellation transaction
                RAISE WARNING 'trg_dispatch_requested_refund notice: pg_net dispatch error: %', SQLERRM;
            END;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_dispatch_requested_refund() IS
'Secure asynchronous event trigger function: pings execute-razorpay-refund via pg_net with apikey and x-worker-secret.';

REVOKE ALL ON FUNCTION public.trg_dispatch_requested_refund() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_dispatch_requested_refund() TO service_role, postgres;


-- Ensure Trigger is cleanly attached on public.refunds
DROP TRIGGER IF EXISTS trg_refund_automatic_dispatch ON public.refunds;

CREATE TRIGGER trg_refund_automatic_dispatch
    AFTER INSERT ON public.refunds
    FOR EACH ROW
    WHEN (NEW.status = 'requested')
    EXECUTE FUNCTION public.trg_dispatch_requested_refund();


-- =============================================================================
-- 2. Secure Recurring Housekeeping Sweeper (pg_cron)
-- =============================================================================
-- Periodic background sweeper to catch any queued refunds that were missed by
-- the event trigger (e.g. during deployments, restarts, or before Vault setup).
-- Processes refunds with status = 'requested'.
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
    v_internal_worker_secret TEXT;
    v_supabase_publishable_key TEXT;
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

            SELECT decrypted_secret INTO v_internal_worker_secret
            FROM vault.decrypted_secrets
            WHERE name = 'internal_worker_secret'
            LIMIT 1;

            SELECT decrypted_secret INTO v_supabase_publishable_key
            FROM vault.decrypted_secrets
            WHERE name = 'supabase_publishable_key'
            LIMIT 1;

            IF v_supabase_url IS NULL OR v_internal_worker_secret IS NULL OR v_supabase_publishable_key IS NULL THEN
                RAISE WARNING 'cron_dispatch_queued_refunds: % queued refund(s) pending, but Vault configuration (supabase_url, internal_worker_secret, or supabase_publishable_key) is missing.', v_count;
            ELSE
                PERFORM net.http_post(
                    url := rtrim(v_supabase_url, '/') || '/functions/v1/execute-razorpay-refund',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'apikey', v_supabase_publishable_key,
                        'x-worker-secret', v_internal_worker_secret
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
'Secure cron housekeeping worker: triggers batch dispatch of pending requested refunds every 2 minutes with apikey and x-worker-secret.';

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
