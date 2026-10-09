-- =============================================================================
-- Migration: 007_payments_and_live.sql
-- Description: Payment obligations, gateway transactions, customer refunds,
--              live service pricing rules, and remote live Puja sessions.
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Payment Orders Table (Authoritative Server-Side Payment Obligations)
-- -----------------------------------------------------------------------------
-- DEFERRED FOREIGN KEY NOTES:
-- - kundli_order_id: References public.kundli_orders(id), which will be created
--   in a subsequent migration (008_kundli). FK constraint is deferred until then.
-- - subscription_id: References public.astrology_subscriptions(id), which will be created
--   in a subsequent migration (009_astrology). FK constraint is deferred until then.

CREATE TABLE IF NOT EXISTS public.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
    kundli_order_id UUID,
    subscription_id UUID,
    purpose public.payment_order_purpose NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    status public.payment_order_status NOT NULL DEFAULT 'created'::public.payment_order_status,
    provider TEXT NOT NULL DEFAULT 'razorpay',
    provider_order_id TEXT UNIQUE,
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on payment_orders
DROP TRIGGER IF EXISTS trg_payment_orders_updated_at ON public.payment_orders;
CREATE TRIGGER trg_payment_orders_updated_at
    BEFORE UPDATE ON public.payment_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for payment order lookups and filtering
CREATE INDEX IF NOT EXISTS idx_payment_orders_booking_id ON public.payment_orders(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON public.payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_purpose ON public.payment_orders(purpose);
CREATE INDEX IF NOT EXISTS idx_payment_orders_kundli_order_id ON public.payment_orders(kundli_order_id) WHERE kundli_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_orders_subscription_id ON public.payment_orders(subscription_id) WHERE subscription_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. Payment Transactions Table (Immutable Gateway Charge & Capture Records)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
    provider_payment_id TEXT NOT NULL UNIQUE,
    provider_signature TEXT,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    status public.payment_transaction_status NOT NULL DEFAULT 'created'::public.payment_transaction_status,
    paid_at TIMESTAMPTZ,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for transaction reconciliation and order tracking
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_order_id ON public.payment_transactions(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);


-- -----------------------------------------------------------------------------
-- 3. Refunds Table (Customer Refund Lifecycle & Gateway Execution Records)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_transaction_id UUID NOT NULL REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
    booking_cancellation_id UUID REFERENCES public.booking_cancellations(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
    reason TEXT,
    status public.refund_status NOT NULL DEFAULT 'requested'::public.refund_status,
    provider_refund_id TEXT UNIQUE,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for refund auditing, transaction linkage, and cancellation lookups
CREATE INDEX IF NOT EXISTS idx_refunds_payment_transaction_id ON public.refunds(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_refunds_booking_cancellation_id ON public.refunds(booking_cancellation_id) WHERE booking_cancellation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds(status);


-- -----------------------------------------------------------------------------
-- 4. Live Pricing Rules Table (Remote Live-Service Pricing Configurations)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.live_pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name TEXT NOT NULL,
    rate_per_minute NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (rate_per_minute >= 0),
    rounding_minutes INTEGER NOT NULL DEFAULT 1 CHECK (rounding_minutes > 0),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT chk_live_pricing_effective_window CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- Index for resolving active pricing rules by provider and effective date window
CREATE INDEX IF NOT EXISTS idx_live_pricing_rules_lookup ON public.live_pricing_rules(provider_name, is_active, effective_from, effective_to);


-- -----------------------------------------------------------------------------
-- 5. Live Sessions Table (Remote Puja Streaming & Session Billing)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.live_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
    pricing_rule_id UUID REFERENCES public.live_pricing_rules(id) ON DELETE SET NULL,
    provider_session_id TEXT UNIQUE,
    status public.live_session_status NOT NULL DEFAULT 'created'::public.live_session_status,
    scheduled_start_at TIMESTAMPTZ,
    actual_started_at TIMESTAMPTZ,
    actual_ended_at TIMESTAMPTZ,
    billable_minutes INTEGER NOT NULL DEFAULT 0 CHECK (billable_minutes >= 0),
    customer_charge NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (customer_charge >= 0),
    provider_cost NUMERIC(12,2) CHECK (provider_cost >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_live_session_actual_time CHECK (
        actual_ended_at IS NULL OR actual_started_at IS NULL OR actual_ended_at >= actual_started_at
    )
);

-- Indexes for live session management, pricing audit, and status filtering
CREATE INDEX IF NOT EXISTS idx_live_sessions_pricing_rule_id ON public.live_sessions(pricing_rule_id) WHERE pricing_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_live_sessions_status ON public.live_sessions(status);


-- -----------------------------------------------------------------------------
-- 6. Complete Deferred Foreign Key: booking_line_items.live_session_id
-- -----------------------------------------------------------------------------
-- Resolves the forward reference deferred from Migration 006 (booking_line_items).

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_line_items_live_session'
    ) THEN
        ALTER TABLE public.booking_line_items
            ADD CONSTRAINT fk_booking_line_items_live_session
            FOREIGN KEY (live_session_id)
            REFERENCES public.live_sessions(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_booking_line_items_live_session_id
    ON public.booking_line_items(live_session_id)
    WHERE live_session_id IS NOT NULL;
