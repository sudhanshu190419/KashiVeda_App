-- =============================================================================
-- Migration: 019_kundli_document_upload_trigger.sql
-- Description: Authoritative database trigger to transition kundli_orders status
--              to 'document_uploaded' upon valid current document metadata insertion.
-- Source of Truth: Kashi Veda Phase 1 Supabase-Native Implementation Specification
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trigger Function: handle_kundli_document_uploaded
-- -----------------------------------------------------------------------------
-- Transitions kundli_orders from 'paid' or 'in_progress' to 'document_uploaded'
-- whenever a valid current document is uploaded/marked.
-- Operates under SECURITY DEFINER to maintain strict SELECT-only RLS on kundli_orders
-- for authenticated clients while guaranteeing database-enforced state progression.

CREATE OR REPLACE FUNCTION public.handle_kundli_document_uploaded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    -- Only transition state when a document is marked/inserted as current
    IF NEW.is_current = true THEN
        -- Atomically update order status ONLY from 'paid' or 'in_progress' to 'document_uploaded'
        -- Protects already completed, customer_confirmed, cancelled, disputed, draft, and payment_pending orders
        UPDATE public.kundli_orders
        SET status = 'document_uploaded'::public.kundli_order_status,
            updated_at = now()
        WHERE id = NEW.kundli_order_id
          AND status IN ('paid'::public.kundli_order_status, 'in_progress'::public.kundli_order_status);
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Trigger: trg_kundli_document_uploaded ON public.kundli_documents
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_kundli_document_uploaded ON public.kundli_documents;
CREATE TRIGGER trg_kundli_document_uploaded
    AFTER INSERT OR UPDATE OF is_current ON public.kundli_documents
    FOR EACH ROW
    WHEN (NEW.is_current = true)
    EXECUTE FUNCTION public.handle_kundli_document_uploaded();
