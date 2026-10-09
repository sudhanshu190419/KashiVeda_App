-- =============================================================================
-- Migration: 015_realtime_setup.sql
-- Description: Supabase Realtime publication configuration for Kashi Veda Phase 1.
--              Enables selective Postgres Changes on durable user notifications
--              and documents application-level Broadcast channel architecture.
-- Source of Truth:
--   1. Kashi Veda Phase 1 Development Ready Scope
--   2. Kashi Veda Phase 1 Supabase-Native Implementation Specification (Section 6.3)
--   3. Actual migrations 001–014
-- =============================================================================

-- =============================================================================
-- 1. Realtime Publication Setup (Postgres Changes)
-- =============================================================================
-- RATIONALE & ARCHITECTURE:
-- Per Section 6.3 of the Phase 1 Specification:
-- - "Postgres Changes: use selectively for durable notification badge updates
--   or narrowly scoped state changes; do not subscribe every client to high-churn tables."
-- - "Realtime Broadcast: use for ephemeral booking/availability/live-session UI events
--   where subscribers need immediate updates but the event itself is not the source of truth."
-- - PostgreSQL remains the authoritative source of truth at all times.
--
-- SECURITY & RLS COMPLIANCE:
-- Realtime Postgres Changes strictly respects table Row Level Security (RLS) policies
-- established in Migration 012:
-- - "notifications_select_recipient" ensures recipient_id = auth.uid()
-- - "notifications_select_admin" ensures public.is_admin()
-- No authenticated user or client can receive notification records belonging to another user.
--
-- EXCLUSION OF HIGH-CHURN / SENSITIVE TABLES:
-- The following tables are INTENTIONALLY EXCLUDED from Postgres Changes publication:
-- - public.bookings, public.booking_line_items, public.booking_status_history
-- - public.pandit_availability_rules, public.pandit_unavailability_blocks
-- - public.payment_orders, public.payment_transactions, public.pandit_payouts
-- - public.live_sessions, public.kundli_orders, public.pandit_documents
-- =============================================================================

DO $$
BEGIN
    -- Ensure standard Supabase realtime publication exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Idempotently add public.notifications to supabase_realtime publication
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

-- =============================================================================
-- 2. Phase 1 Broadcast Channel Architecture Reference (Application-Level)
-- =============================================================================
-- Ephemeral broadcast channels do NOT require database table persistence or
-- event triggers. They are managed at the client/Edge Function application layer:
--
-- 1. Booking Lifecycle Channel: `booking:<booking_id>`
--    - Events: 'status_updated', 'reschedule_requested', 'reschedule_reviewed'
--    - Purpose: Instant UI refresh for active booking detail screens.
--    - Authority: Client calls PostgreSQL RPC/SELECT for authoritative state.
--
-- 2. Availability Channel: `pandit-availability:<pandit_id>`
--    - Events: 'slots_updated', 'block_added'
--    - Purpose: Instant calendar slot cache invalidation for booking checkout UI.
--    - Authority: get_available_pandit_slots() RPC remains authoritative.
--
-- 3. Live Session Channel: `live-session:<booking_id>`
--    - Events: 'session_started', 'session_ended', 'recording_ready'
--    - Purpose: Instant video room state synchronization.
--    - Authority: WebRTC provider / public.live_sessions record is authoritative.
-- =============================================================================
