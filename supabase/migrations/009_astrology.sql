-- =============================================================================
-- Migration: 009_astrology.sql
-- Description: Vedic astrology subscription plans, customer subscriptions,
--              daily/weekly astrology content, delivery queue tracking,
--              and deferred payment order FK resolution.
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Astrology Subscription Plans Table (Admin-Configured Subscription Tiers)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.astrology_subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),
    price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    daily_in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    weekly_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on astrology_subscription_plans
DROP TRIGGER IF EXISTS trg_astrology_subscription_plans_updated_at ON public.astrology_subscription_plans;
CREATE TRIGGER trg_astrology_subscription_plans_updated_at
    BEFORE UPDATE ON public.astrology_subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Index for customer subscription plan catalog discovery
CREATE INDEX IF NOT EXISTS idx_astrology_subscription_plans_is_active 
    ON public.astrology_subscription_plans(is_active);


-- -----------------------------------------------------------------------------
-- 2. Astrology Subscriptions Table (Customer Active/Historical Subscriptions)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.astrology_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES public.astrology_subscription_plans(id) ON DELETE RESTRICT,
    payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status public.astrology_subscription_status NOT NULL DEFAULT 'active'::public.astrology_subscription_status,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_astrology_subscriptions_period CHECK (ends_at > starts_at)
);

-- Indexes for customer subscription queries, status checks, and expiry processing
CREATE INDEX IF NOT EXISTS idx_astrology_subscriptions_customer_id ON public.astrology_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_astrology_subscriptions_plan_id ON public.astrology_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_astrology_subscriptions_payment_order_id ON public.astrology_subscriptions(payment_order_id) WHERE payment_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_astrology_subscriptions_status ON public.astrology_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_astrology_subscriptions_ends_at ON public.astrology_subscriptions(ends_at);


-- -----------------------------------------------------------------------------
-- 3. Astrology Content Table (Curated Daily Insights & Weekly Guidance)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.astrology_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel public.astrology_channel NOT NULL DEFAULT 'in_app'::public.astrology_channel,
    title TEXT,
    body TEXT NOT NULL,
    publish_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    status public.astrology_content_status NOT NULL DEFAULT 'draft'::public.astrology_content_status,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_astrology_content_expiry CHECK (expires_at IS NULL OR expires_at > publish_at)
);

-- Trigger to maintain updated_at on astrology_content
DROP TRIGGER IF EXISTS trg_astrology_content_updated_at ON public.astrology_content;
CREATE TRIGGER trg_astrology_content_updated_at
    BEFORE UPDATE ON public.astrology_content
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for content dispatch scheduling and author auditing
CREATE INDEX IF NOT EXISTS idx_astrology_content_channel ON public.astrology_content(channel);
CREATE INDEX IF NOT EXISTS idx_astrology_content_status ON public.astrology_content(status);
CREATE INDEX IF NOT EXISTS idx_astrology_content_publish_at ON public.astrology_content(publish_at);
CREATE INDEX IF NOT EXISTS idx_astrology_content_schedule ON public.astrology_content(status, channel, publish_at);
CREATE INDEX IF NOT EXISTS idx_astrology_content_created_by ON public.astrology_content(created_by);


-- -----------------------------------------------------------------------------
-- 4. Astrology Deliveries Table (Asynchronous Dispatch & Provider Tracking)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.astrology_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.astrology_subscriptions(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES public.astrology_content(id) ON DELETE RESTRICT,
    channel public.astrology_channel NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status public.astrology_delivery_status NOT NULL DEFAULT 'queued'::public.astrology_delivery_status,
    provider_message_id TEXT,
    error_message TEXT
);

-- Indexes for background dispatch workers and delivery reconciliation
CREATE INDEX IF NOT EXISTS idx_astrology_deliveries_subscription_id ON public.astrology_deliveries(subscription_id);
CREATE INDEX IF NOT EXISTS idx_astrology_deliveries_content_id ON public.astrology_deliveries(content_id);
CREATE INDEX IF NOT EXISTS idx_astrology_deliveries_status ON public.astrology_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_astrology_deliveries_scheduled_at ON public.astrology_deliveries(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_astrology_deliveries_queue ON public.astrology_deliveries(status, scheduled_at) WHERE status = 'queued';


-- -----------------------------------------------------------------------------
-- 5. Complete Deferred Foreign Key: payment_orders.subscription_id
-- -----------------------------------------------------------------------------
-- Resolves the forward reference deferred from Migration 007 (payment_orders).

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_orders_subscription'
    ) THEN
        ALTER TABLE public.payment_orders
            ADD CONSTRAINT fk_payment_orders_subscription
            FOREIGN KEY (subscription_id)
            REFERENCES public.astrology_subscriptions(id)
            ON DELETE RESTRICT;
    END IF;
END $$;
