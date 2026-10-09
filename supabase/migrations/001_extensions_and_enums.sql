-- =============================================================================
-- Migration: 001_extensions_and_enums.sql
-- Description: Foundation PostgreSQL extensions and core enum types for Kashi Veda Phase 1
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PostgreSQL Extensions
-- -----------------------------------------------------------------------------

-- PostGIS: Enables geospatial data types (geography/geometry) and spatial queries
-- required for Pandit service area radius calculations and customer location matching.
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA extensions;

-- pgcrypto: Provides cryptographic functions, secure hashing, and encrypted column storage
-- (e.g. pandit_bank_accounts.account_number_encrypted).
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- citext: Provides case-insensitive text data type used for unique, case-insensitive email snapshots (profiles.email).
CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA extensions;


-- -----------------------------------------------------------------------------
-- 2. Identity & Access Control Enums
-- -----------------------------------------------------------------------------

-- Primary application roles supported in Phase 1 (user_roles.role)
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM (
        'customer',
        'pandit',
        'admin',
        'super_admin'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- User profile lifecycle state (profiles.status)
DO $$ BEGIN
    CREATE TYPE public.profile_status AS ENUM (
        'active',
        'suspended',
        'deleted'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 3. Pandit Domain Enums
-- -----------------------------------------------------------------------------

-- Pandit account verification and administrative approval status (pandit_profiles.verification_status)
DO $$ BEGIN
    CREATE TYPE public.pandit_verification_status AS ENUM (
        'pending',
        'approved',
        'rejected',
        'suspended'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Public marketplace availability display status (pandit_profiles.public_status)
DO $$ BEGIN
    CREATE TYPE public.pandit_public_status AS ENUM (
        'available',
        'currently_unavailable'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Verification review state for Pandit credential documents (pandit_documents.verification_status)
DO $$ BEGIN
    CREATE TYPE public.document_verification_status AS ENUM (
        'pending',
        'approved',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Verification status for Pandit payout bank accounts (pandit_bank_accounts.verification_status)
DO $$ BEGIN
    CREATE TYPE public.bank_account_verification_status AS ENUM (
        'pending',
        'verified',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Payout release lifecycle to Pandits after completed service (pandit_payouts.status)
DO $$ BEGIN
    CREATE TYPE public.payout_status AS ENUM (
        'pending',
        'approved',
        'processing',
        'paid',
        'failed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 4. Ritual Catalog & Booking Enums
-- -----------------------------------------------------------------------------

-- Service fulfillment mode for Pujas (puja_services.allowed_modes, bookings.service_mode, booking_service_locations.location_type)
DO $$ BEGIN
    CREATE TYPE public.service_mode AS ENUM (
        'home',
        'temple',
        'remote'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Comprehensive Puja booking state machine (bookings.status)
DO $$ BEGIN
    CREATE TYPE public.booking_status AS ENUM (
        'draft',
        'payment_pending',
        'confirmed',
        'upcoming',
        'in_progress',
        'completed',
        'rescheduled',
        'cancelled',
        'disputed',
        'resolved'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Item type categorization in booking line items (booking_line_items.item_type)
DO $$ BEGIN
    CREATE TYPE public.line_item_type AS ENUM (
        'puja',
        'samagri_item',
        'samagri_package',
        'prasad',
        'live_service',
        'prepone_fee',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Direction of requested schedule modification (booking_reschedule_requests.change_type)
DO $$ BEGIN
    CREATE TYPE public.reschedule_change_type AS ENUM (
        'postpone',
        'prepone'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Lifecycle status of a customer reschedule request (booking_reschedule_requests.status)
DO $$ BEGIN
    CREATE TYPE public.reschedule_request_status AS ENUM (
        'requested',
        'approved',
        'rejected',
        'cancelled',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 5. Payment & Settlement Enums
-- -----------------------------------------------------------------------------

-- Purpose / business reason for a customer payment obligation (payment_orders.purpose)
DO $$ BEGIN
    CREATE TYPE public.payment_order_purpose AS ENUM (
        'booking_advance',
        'booking_balance',
        'samagri',
        'kundli',
        'subscription',
        'prepone_fee',
        'live_service',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Payment order obligation status (payment_orders.status)
DO $$ BEGIN
    CREATE TYPE public.payment_order_status AS ENUM (
        'created',
        'pending',
        'paid',
        'failed',
        'cancelled',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Payment gateway charge transaction state (payment_transactions.status)
DO $$ BEGIN
    CREATE TYPE public.payment_transaction_status AS ENUM (
        'created',
        'authorized',
        'captured',
        'failed',
        'refunded',
        'partially_refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Customer refund request and execution lifecycle (refunds.status)
DO $$ BEGIN
    CREATE TYPE public.refund_status AS ENUM (
        'requested',
        'processed',
        'failed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 6. Remote Live Puja Enums
-- -----------------------------------------------------------------------------

-- Remote live video/audio session lifecycle (live_sessions.status)
DO $$ BEGIN
    CREATE TYPE public.live_session_status AS ENUM (
        'created',
        'scheduled',
        'live',
        'ended',
        'failed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 7. Kundli Service Enums
-- -----------------------------------------------------------------------------

-- Handwritten Kundli order and preparation lifecycle (kundli_orders.status)
DO $$ BEGIN
    CREATE TYPE public.kundli_order_status AS ENUM (
        'draft',
        'payment_pending',
        'paid',
        'in_progress',
        'document_uploaded',
        'customer_confirmed',
        'cancelled',
        'disputed',
        'completed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 8. Vedic Astrology Subscription Enums
-- -----------------------------------------------------------------------------

-- Customer astrology subscription lifecycle (astrology_subscriptions.status)
DO $$ BEGIN
    CREATE TYPE public.astrology_subscription_status AS ENUM (
        'active',
        'expired',
        'cancelled',
        'payment_failed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Delivery communication channel for astrology content (astrology_content.channel, astrology_deliveries.channel)
DO $$ BEGIN
    CREATE TYPE public.astrology_channel AS ENUM (
        'in_app',
        'whatsapp'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Authoring and publication status for astrology content (astrology_content.status)
DO $$ BEGIN
    CREATE TYPE public.astrology_content_status AS ENUM (
        'draft',
        'scheduled',
        'published',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Dispatch / delivery status for subscriber astrology content (astrology_deliveries.status)
DO $$ BEGIN
    CREATE TYPE public.astrology_delivery_status AS ENUM (
        'queued',
        'sent',
        'failed',
        'skipped'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 9. Engagement & Platform Enums
-- -----------------------------------------------------------------------------

-- Customer review visibility state (reviews.visibility_status)
DO $$ BEGIN
    CREATE TYPE public.review_visibility_status AS ENUM (
        'published',
        'hidden'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Channel for user notifications (notifications.channel)
DO $$ BEGIN
    CREATE TYPE public.notification_channel AS ENUM (
        'in_app',
        'push',
        'whatsapp',
        'email'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Notification dispatch and consumption status (notifications.status)
DO $$ BEGIN
    CREATE TYPE public.notification_status AS ENUM (
        'queued',
        'sent',
        'failed',
        'read'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
