-- =============================================================================
-- Migration: 008_kundli.sql
-- Description: Handwritten Kundli orders, birth chart details, scanned document
--              versioning, and deferred payment order FK resolution.
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Kundli Orders Table (Handwritten Kundli Request & Fulfillment Entity)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kundli_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    pandit_id UUID NOT NULL REFERENCES public.pandit_profiles(id) ON DELETE RESTRICT,
    price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    date_of_birth DATE NOT NULL,
    time_of_birth TIME NOT NULL,
    place_of_birth TEXT NOT NULL,
    birth_latitude NUMERIC(9,6) CHECK (birth_latitude IS NULL OR (birth_latitude BETWEEN -90 AND 90)),
    birth_longitude NUMERIC(9,6) CHECK (birth_longitude IS NULL OR (birth_longitude BETWEEN -180 AND 180)),
    additional_notes TEXT,
    status public.kundli_order_status NOT NULL DEFAULT 'payment_pending'::public.kundli_order_status,
    customer_confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to maintain updated_at on kundli_orders
DROP TRIGGER IF EXISTS trg_kundli_orders_updated_at ON public.kundli_orders;
CREATE TRIGGER trg_kundli_orders_updated_at
    BEFORE UPDATE ON public.kundli_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Indexes for customer queries, Pandit assignment dashboard, and status filtering
CREATE INDEX IF NOT EXISTS idx_kundli_orders_customer_id ON public.kundli_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_kundli_orders_pandit_id ON public.kundli_orders(pandit_id);
CREATE INDEX IF NOT EXISTS idx_kundli_orders_status ON public.kundli_orders(status);


-- -----------------------------------------------------------------------------
-- 2. Kundli Documents Table (Scanned PDF Document Metadata & Versioning)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.kundli_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kundli_order_id UUID NOT NULL REFERENCES public.kundli_orders(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
    storage_path TEXT NOT NULL,
    file_name TEXT,
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_current BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_kundli_documents_order_version UNIQUE (kundli_order_id, version_number)
);

-- Partial unique index ensuring at most one document is marked as current per Kundli order
CREATE UNIQUE INDEX IF NOT EXISTS uq_kundli_documents_current
    ON public.kundli_documents(kundli_order_id)
    WHERE is_current = true;

-- Indexes for order document lookups and uploader audit tracking
CREATE INDEX IF NOT EXISTS idx_kundli_documents_kundli_order_id ON public.kundli_documents(kundli_order_id);
CREATE INDEX IF NOT EXISTS idx_kundli_documents_uploaded_by ON public.kundli_documents(uploaded_by);


-- -----------------------------------------------------------------------------
-- 3. Complete Deferred Foreign Key: payment_orders.kundli_order_id
-- -----------------------------------------------------------------------------
-- Resolves the forward reference deferred from Migration 007 (payment_orders).

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_orders_kundli_order'
    ) THEN
        ALTER TABLE public.payment_orders
            ADD CONSTRAINT fk_payment_orders_kundli_order
            FOREIGN KEY (kundli_order_id)
            REFERENCES public.kundli_orders(id)
            ON DELETE RESTRICT;
    END IF;
END $$;
