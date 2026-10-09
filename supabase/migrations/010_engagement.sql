-- =============================================================================
-- Migration: 010_engagement.sql
-- Description: Customer reviews, user notifications, platform configuration,
--              booking policy settings, cancellation rules, admin audit logging,
--              and deferred booking cancellation FK resolution.
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reviews Table (Customer Ritual Ratings & Written Feedback)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE RESTRICT,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    visibility_status public.review_visibility_status NOT NULL DEFAULT 'published'::public.review_visibility_status,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Pandit profile ratings, customer reviews, and public visibility
CREATE INDEX IF NOT EXISTS idx_reviews_pandit_id ON public.reviews(pandit_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON public.reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_visibility_status ON public.reviews(visibility_status);
CREATE INDEX IF NOT EXISTS idx_reviews_pandit_published ON public.reviews(pandit_id, rating) WHERE visibility_status = 'published';


-- -----------------------------------------------------------------------------
-- 2. Notifications Table (Multi-Channel User Notification Dispatch Log)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    channel public.notification_channel NOT NULL DEFAULT 'push'::public.notification_channel,
    type TEXT NOT NULL,
    title TEXT,
    body TEXT NOT NULL,
    related_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    status public.notification_status NOT NULL DEFAULT 'queued'::public.notification_status,
    provider_message_id TEXT,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for user inbox, delivery worker queue, and booking notification lookups
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_channel ON public.notifications(channel);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_related_booking_id ON public.notifications(related_booking_id) WHERE related_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON public.notifications(recipient_id, created_at) WHERE read_at IS NULL;


-- -----------------------------------------------------------------------------
-- 3. Platform Settings Table (Key-Value Dynamic Operational Configuration)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on platform_settings
DROP TRIGGER IF EXISTS trg_platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER trg_platform_settings_updated_at
    BEFORE UPDATE ON public.platform_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 4. Booking Policy Settings Table (Advance Payments & Reschedule Windows)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booking_policy_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    home_advance_percent NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (home_advance_percent >= 0 AND home_advance_percent <= 100),
    temple_advance_percent NUMERIC(5,2) CHECK (temple_advance_percent IS NULL OR (temple_advance_percent >= 0 AND temple_advance_percent <= 100)),
    remote_advance_percent NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (remote_advance_percent >= 0 AND remote_advance_percent <= 100),
    samagri_advance_percent NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (samagri_advance_percent >= 0 AND samagri_advance_percent <= 100),
    kundli_advance_percent NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (kundli_advance_percent >= 0 AND kundli_advance_percent <= 100),
    max_reschedules SMALLINT NOT NULL DEFAULT 1 CHECK (max_reschedules >= 0),
    prepone_window_hours INTEGER CHECK (prepone_window_hours IS NULL OR prepone_window_hours >= 0),
    postpone_window_hours INTEGER CHECK (postpone_window_hours IS NULL OR postpone_window_hours >= 0),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on booking_policy_settings
DROP TRIGGER IF EXISTS trg_booking_policy_settings_updated_at ON public.booking_policy_settings;
CREATE TRIGGER trg_booking_policy_settings_updated_at
    BEFORE UPDATE ON public.booking_policy_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 5. Cancellation Policy Rules Table (Tiered Cancellation & Refund Slabs)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cancellation_policy_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    min_hours_before INTEGER NOT NULL DEFAULT 0 CHECK (min_hours_before >= 0),
    max_hours_before INTEGER CHECK (max_hours_before IS NULL OR max_hours_before > min_hours_before),
    refund_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (refund_percent >= 0 AND refund_percent <= 100),
    non_refundable_item_types public.line_item_type[] NOT NULL DEFAULT '{}'::public.line_item_type[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on cancellation_policy_rules
DROP TRIGGER IF EXISTS trg_cancellation_policy_rules_updated_at ON public.cancellation_policy_rules;
CREATE TRIGGER trg_cancellation_policy_rules_updated_at
    BEFORE UPDATE ON public.cancellation_policy_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Index for resolving active cancellation rules and evaluating time windows
CREATE INDEX IF NOT EXISTS idx_cancellation_policy_rules_lookup 
    ON public.cancellation_policy_rules(is_active, min_hours_before, max_hours_before);


-- -----------------------------------------------------------------------------
-- 6. Admin Audit Logs Table (Administrative Operations & Entity Change Audit)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    before_json JSONB,
    after_json JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for administrator action review, entity audit history, and timeline filtering
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_user_id ON public.admin_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON public.admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at);


-- -----------------------------------------------------------------------------
-- 7. Complete Deferred Foreign Key: booking_cancellations.policy_rule_id
-- -----------------------------------------------------------------------------
-- Resolves the forward reference deferred from Migration 006 (booking_cancellations).

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_cancellations_policy_rule'
    ) THEN
        ALTER TABLE public.booking_cancellations
            ADD CONSTRAINT fk_booking_cancellations_policy_rule
            FOREIGN KEY (policy_rule_id)
            REFERENCES public.cancellation_policy_rules(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_booking_cancellations_policy_rule_id
    ON public.booking_cancellations(policy_rule_id)
    WHERE policy_rule_id IS NOT NULL;
