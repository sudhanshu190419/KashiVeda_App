-- =============================================================================
-- Migration: 016_cron_and_queues.sql
-- Description: Supabase Cron and Queues infrastructure for Kashi Veda Phase 1.
--              Sets up scheduled database maintenance tasks (astrology subscription
--              deactivation and daily astrology delivery dispatch) and declares
--              asynchronous retryable processing queues (WhatsApp, Push notifications,
--              Astrology deliveries, and Pandit payouts).
-- Source of Truth:
--   1. Kashi Veda Phase 1 Development Ready Scope
--   2. Kashi Veda Phase 1 Supabase-Native Implementation Specification (Section 6.3)
--   3. Actual migrations 001–015
-- =============================================================================

-- =============================================================================
-- 1. Required PostgreSQL Extensions
-- =============================================================================
-- pg_cron: Native scheduled task runner for Supabase PostgreSQL.
-- pgmq:    Native durable message queues for Supabase asynchronous workloads.
-- Fail-Closed Policy: Extensions must be successfully present/created; failures
-- are not silently ignored.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pgmq";


-- =============================================================================
-- 2. Database Maintenance & Housekeeping Functions (Cron Targets)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 Astrology Subscription Expiry Housekeeping
-- Marks active subscriptions whose ends_at timestamp has passed as 'expired'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_astrology_subscription_housekeeping()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_count INTEGER := 0;
BEGIN
    UPDATE public.astrology_subscriptions
    SET status = 'expired'::public.astrology_subscription_status
    WHERE status = 'active'::public.astrology_subscription_status
      AND ends_at < now();

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;

COMMENT ON FUNCTION public.cron_astrology_subscription_housekeeping() IS 
    'Daily cron worker function: transitions expired astrology subscriptions from active to expired.';

-- -----------------------------------------------------------------------------
-- 2.2 Daily Astrology Delivery Dispatch
-- Idempotently generates queued delivery records in public.astrology_deliveries
-- for active subscribers matching published astrology content ready for dispatch.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_astrology_delivery_dispatch()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inserted_count INTEGER := 0;
BEGIN
    INSERT INTO public.astrology_deliveries (
        subscription_id,
        content_id,
        channel,
        scheduled_at,
        status
    )
    SELECT 
        s.id AS subscription_id,
        c.id AS content_id,
        c.channel,
        c.publish_at AS scheduled_at,
        'queued'::public.astrology_delivery_status
    FROM public.astrology_subscriptions s
    JOIN public.astrology_subscription_plans p ON p.id = s.plan_id
    CROSS JOIN public.astrology_content c
    WHERE s.status = 'active'::public.astrology_subscription_status
      AND s.starts_at <= now()
      AND s.ends_at > now()
      AND c.status = 'published'::public.astrology_content_status
      AND c.publish_at <= now()
      AND (c.expires_at IS NULL OR c.expires_at > now())
      AND (
          (c.channel = 'in_app'::public.astrology_channel AND p.daily_in_app_enabled = true) OR
          (c.channel = 'whatsapp'::public.astrology_channel AND p.weekly_whatsapp_enabled = true)
      )
      -- Prevent duplicate delivery entries for the same subscription and content
      AND NOT EXISTS (
          SELECT 1 
          FROM public.astrology_deliveries d 
          WHERE d.subscription_id = s.id 
            AND d.content_id = c.id
      );

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    RETURN v_inserted_count;
END;
$$;

COMMENT ON FUNCTION public.cron_astrology_delivery_dispatch() IS 
    'Daily cron worker function: generates queued delivery records for active subscribers and published content.';


-- =============================================================================
-- 3. Cron Function Permissions & Security Lockdown
-- =============================================================================
-- Cron worker functions must NEVER be callable by authenticated clients
-- or anonymous visitors. Access is strictly granted to service_role and postgres.
-- =============================================================================

REVOKE ALL ON FUNCTION public.cron_astrology_subscription_housekeeping() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_astrology_subscription_housekeeping() TO service_role;

REVOKE ALL ON FUNCTION public.cron_astrology_delivery_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_astrology_delivery_dispatch() TO service_role;


-- =============================================================================
-- 4. Supabase Cron Schedules (pg_cron)
-- =============================================================================
-- Configures idempotent cron jobs using pg_cron.
-- Note on Scheduling:
-- The schedules below represent operational infrastructure defaults and are NOT
-- frozen customer-facing business rules. They can be tuned operationally in pg_cron:
--   - daily_astrology_subscription_housekeeping: '5 0 * * *' (00:05 UTC / 05:35 IST)
--   - daily_astrology_delivery_dispatch:        '30 0 * * *' (00:30 UTC / 06:00 IST)
-- =============================================================================

DO $$
BEGIN
    -- Unschedule existing job definitions if present to ensure clean, updated registrations
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'daily_astrology_subscription_housekeeping'
    ) THEN
        PERFORM cron.unschedule('daily_astrology_subscription_housekeeping');
    END IF;

    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'daily_astrology_delivery_dispatch'
    ) THEN
        PERFORM cron.unschedule('daily_astrology_delivery_dispatch');
    END IF;

    -- Clean up any obsolete/removed jobs if previously registered
    IF EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'hourly_stale_payment_order_housekeeping'
    ) THEN
        PERFORM cron.unschedule('hourly_stale_payment_order_housekeeping');
    END IF;

    -- 1. Daily subscription expiry check (operational default: 00:05 UTC)
    PERFORM cron.schedule(
        'daily_astrology_subscription_housekeeping',
        '5 0 * * *',
        'SELECT public.cron_astrology_subscription_housekeeping();'
    );

    -- 2. Daily astrology delivery dispatch (operational default: 00:30 UTC)
    PERFORM cron.schedule(
        'daily_astrology_delivery_dispatch',
        '30 0 * * *',
        'SELECT public.cron_astrology_delivery_dispatch();'
    );
END $$;


-- =============================================================================
-- 5. Supabase Queues Infrastructure (pgmq)
-- =============================================================================
-- Declares the 4 core asynchronous retryable queues required by Phase 1:
--   1. whatsapp_messages:   Retryable WhatsApp template dispatches (send-whatsapp-message)
--   2. push_notifications:  Retryable FCM/APNs push dispatches (send-push-notification)
--   3. astrology_deliveries: Batch queued astrology delivery execution (process-astrology-delivery)
--   4. pandit_payouts:      Deferred gateway bank transfers (process-pandit-payout)
--
-- MINIMAL PAYLOAD CONTRACT & IDEMPOTENCY SPECIFICATION:
-- Queue payloads must NOT contain authoritative mutable business values (e.g. price,
-- payout amount, recipient phone, bank details, message content). Payloads contain
-- authoritative primary key identifiers ONLY:
--   - whatsapp_messages:   { "notification_id": "UUID" }
--   - push_notifications:  { "notification_id": "UUID" }
--   - astrology_deliveries: { "delivery_id": "UUID" }
--   - pandit_payouts:      { "payout_id": "UUID" }
--
-- Consumer Invariant:
-- Edge Function workers MUST re-read the authoritative PostgreSQL record using
-- service_role before performing any external provider actions. Consumers must
-- verify the record's current status and update status within the same transaction.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'whatsapp_messages') THEN
        PERFORM pgmq.create('whatsapp_messages');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'push_notifications') THEN
        PERFORM pgmq.create('push_notifications');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'astrology_deliveries') THEN
        PERFORM pgmq.create('astrology_deliveries');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'pandit_payouts') THEN
        PERFORM pgmq.create('pandit_payouts');
    END IF;
END $$;
