-- =============================================================================
-- Migration: 042_pandit_manual_payout_management.sql
-- Description: Authoritative schema and RPCs for Manual Pandit Payout Management,
--              payment proof storage bucket configuration, and audit logging.
-- Authoritative Schema: Kashi Veda Platform Settlement & Payout Engine
-- =============================================================================

-- 1. Schema Extensions for Manual Payout Tracking
ALTER TABLE public.pandit_payouts
ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'upi', 'neft', 'imps', 'rtgs', 'cheque', 'cash', 'other')),
ADD COLUMN IF NOT EXISTS transaction_reference TEXT,
ADD COLUMN IF NOT EXISTS proof_document_path TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS confirmed_by_admin_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Index for searching transaction references and confirmed payouts
CREATE INDEX IF NOT EXISTS idx_pandit_payouts_tx_ref ON public.pandit_payouts(transaction_reference) WHERE transaction_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pandit_payouts_confirmed_at ON public.pandit_payouts(confirmed_at) WHERE confirmed_at IS NOT NULL;

-- 2. Private Storage Bucket for Payout Proof Receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'payout-documents',
    'payout-documents',
    false,
    10485760, -- 10 MB limit
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[];

-- Granular RLS on storage.objects for payout-documents (Admin & Associated Pandit)
DROP POLICY IF EXISTS "payout_documents_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "payout_documents_select" ON storage.objects;
CREATE POLICY "payout_documents_select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'payout-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
            OR (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.pandit_payouts pp
                JOIN public.pandit_profiles prof ON prof.id = pp.pandit_id
                WHERE pp.proof_document_path = name
                  AND prof.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "payout_documents_admin_insert" ON storage.objects;
CREATE POLICY "payout_documents_admin_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'payout-documents' AND public.is_admin());

DROP POLICY IF EXISTS "payout_documents_admin_update" ON storage.objects;
CREATE POLICY "payout_documents_admin_update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'payout-documents' AND public.is_admin());

DROP POLICY IF EXISTS "payout_documents_admin_delete" ON storage.objects;
CREATE POLICY "payout_documents_admin_delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'payout-documents' AND public.is_admin());


-- =============================================================================
-- 3. Authoritative RPC: get_pandit_payout_summaries
-- Returns summary KPI metrics and filterable list of Pandits with payout balances
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_pandit_payout_summaries(
    p_search TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_total_unpaid NUMERIC(12,2) := 0;
    v_pending_count INTEGER := 0;
    v_total_paid NUMERIC(12,2) := 0;
    v_paid_count INTEGER := 0;
    v_pandits_awaiting_count INTEGER := 0;
    v_pandit_rows JSONB := '[]'::jsonb;
    v_total_pandits INTEGER := 0;
BEGIN
    -- 1. Authorization: Admin check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to inspect payout summaries.';
    END IF;

    -- 2. Global Aggregate Metrics
    SELECT 
        COALESCE(SUM(CASE WHEN status IN ('pending', 'approved', 'processing') THEN net_amount ELSE 0 END), 0),
        COALESCE(COUNT(CASE WHEN status IN ('pending', 'approved', 'processing') THEN 1 END), 0),
        COALESCE(SUM(CASE WHEN status = 'paid' THEN net_amount ELSE 0 END), 0),
        COALESCE(COUNT(CASE WHEN status = 'paid' THEN 1 END), 0),
        COALESCE(COUNT(DISTINCT CASE WHEN status IN ('pending', 'approved', 'processing') THEN pandit_id END), 0)
    INTO 
        v_total_unpaid,
        v_pending_count,
        v_total_paid,
        v_paid_count,
        v_pandits_awaiting_count
    FROM public.pandit_payouts;

    -- 3. Filtered Pandit Aggregation
    WITH pandit_calc AS (
        SELECT
            pp.id AS pandit_id,
            p.display_name AS pandit_name,
            p.phone AS pandit_phone,
            p.email AS pandit_email,
            pp.verification_status AS pandit_verification_status,
            ba.id AS bank_account_id,
            ba.bank_name,
            ba.ifsc_code,
            CASE 
                WHEN ba.account_number_encrypted IS NOT NULL AND length(ba.account_number_encrypted) >= 4 
                THEN '•••• •••• ' || right(ba.account_number_encrypted, 4) 
                ELSE NULL 
            END AS account_number_masked,
            ba.account_holder_name,
            ba.upi_id,
            ba.verification_status AS bank_verification_status,
            COALESCE(SUM(po.gross_amount), 0) AS total_gross_earnings,
            COALESCE(SUM(po.platform_fee), 0) AS total_platform_fee,
            COALESCE(SUM(po.net_amount), 0) AS total_eligible_earnings,
            COALESCE(SUM(CASE WHEN po.status = 'paid' THEN po.net_amount ELSE 0 END), 0) AS amount_paid,
            COALESCE(SUM(CASE WHEN po.status IN ('pending', 'approved', 'processing') THEN po.net_amount ELSE 0 END), 0) AS remaining_payable_balance,
            COALESCE(COUNT(CASE WHEN po.status IN ('pending', 'approved', 'processing') THEN 1 END), 0) AS pending_payout_count,
            MAX(CASE WHEN po.status = 'paid' THEN po.released_at ELSE NULL END) AS last_payout_date,
            COUNT(po.id) AS total_payout_records
        FROM public.pandit_profiles pp
        JOIN public.profiles p ON p.id = pp.user_id
        LEFT JOIN public.pandit_bank_accounts ba ON ba.pandit_id = pp.id AND ba.is_default = true
        LEFT JOIN public.pandit_payouts po ON po.pandit_id = pp.id
        WHERE (
            p_search IS NULL OR
            p.display_name ILIKE '%' || p_search || '%' OR
            p.phone ILIKE '%' || p_search || '%' OR
            ba.bank_name ILIKE '%' || p_search || '%' OR
            ba.ifsc_code ILIKE '%' || p_search || '%'
        )
        GROUP BY pp.id, p.display_name, p.phone, p.email, pp.verification_status, ba.id, ba.bank_name, ba.ifsc_code, ba.account_number_encrypted, ba.account_holder_name, ba.upi_id, ba.verification_status
    ),
    filtered_pandits AS (
        SELECT *,
            CASE 
                WHEN remaining_payable_balance > 0 THEN 'pending'
                WHEN amount_paid > 0 AND remaining_payable_balance = 0 THEN 'paid'
                ELSE 'no_earnings'
            END AS calculated_payout_status
        FROM pandit_calc
        WHERE (
            p_status IS NULL OR p_status = 'all' OR
            (p_status = 'pending' AND remaining_payable_balance > 0) OR
            (p_status = 'paid' AND amount_paid > 0 AND remaining_payable_balance = 0) OR
            (p_status = 'unverified_bank' AND (bank_verification_status IS NULL OR bank_verification_status != 'verified'))
        )
    )
    SELECT 
        COUNT(*),
        jsonb_agg(
            jsonb_build_object(
                'pandit_id', pandit_id,
                'pandit_name', pandit_name,
                'pandit_phone', pandit_phone,
                'pandit_email', pandit_email,
                'pandit_verification_status', pandit_verification_status,
                'bank_account_id', bank_account_id,
                'bank_name', bank_name,
                'ifsc_code', ifsc_code,
                'account_number_masked', account_number_masked,
                'upi_id', upi_id,
                'bank_verification_status', bank_verification_status,
                'total_gross_earnings', total_gross_earnings,
                'total_platform_fee', total_platform_fee,
                'eligible_earnings', total_eligible_earnings,
                'amount_paid', amount_paid,
                'remaining_payable_balance', remaining_payable_balance,
                'pending_payout_count', pending_payout_count,
                'last_payout_date', last_payout_date,
                'payout_status', calculated_payout_status,
                'total_payout_records', total_payout_records
            )
            ORDER BY remaining_payable_balance DESC, pandit_name ASC
        )
    INTO v_total_pandits, v_pandit_rows
    FROM (
        SELECT * FROM filtered_pandits
        ORDER BY remaining_payable_balance DESC, pandit_name ASC
        LIMIT p_limit OFFSET p_offset
    ) sub;

    RETURN jsonb_build_object(
        'summary', jsonb_build_object(
            'total_unpaid_amount', v_total_unpaid,
            'pending_payouts_count', v_pending_count,
            'total_paid_amount', v_total_paid,
            'paid_payouts_count', v_paid_count,
            'pandits_awaiting_payment_count', v_pandits_awaiting_count
        ),
        'pandits', COALESCE(v_pandit_rows, '[]'::jsonb),
        'total_count', COALESCE(v_total_pandits, 0),
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$;


-- =============================================================================
-- 4. Authoritative RPC: record_manual_pandit_payout
-- Atomically records a confirmed manual payout for a Pandit, transitions status
-- to 'paid', logs admin audit trail, and prevents duplicate or over-payments.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_manual_pandit_payout(
    p_pandit_id UUID,
    p_payout_ids UUID[] DEFAULT NULL,
    p_amount NUMERIC(12,2) DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'bank_transfer',
    p_transaction_reference TEXT DEFAULT NULL,
    p_payment_date TIMESTAMPTZ DEFAULT now(),
    p_proof_document_path TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit RECORD;
    v_bank RECORD;
    v_target_payout_ids UUID[] := ARRAY[]::UUID[];
    v_total_eligible_pending NUMERIC(12,2) := 0;
    v_settle_amount NUMERIC(12,2) := 0;
    v_updated_count INTEGER := 0;
    v_updated_payouts JSONB := '[]'::jsonb;
    v_now TIMESTAMPTZ := now();
    v_payment_date TIMESTAMPTZ;
    v_clean_ref TEXT;
BEGIN
    -- 1. Authorization Check (Admin Only)
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to record manual payouts.';
    END IF;

    -- 2. Input Validation
    IF p_pandit_id IS NULL THEN
        RAISE EXCEPTION 'Pandit ID is strictly required.';
    END IF;

    v_clean_ref := trim(COALESCE(p_transaction_reference, ''));
    IF v_clean_ref = '' THEN
        RAISE EXCEPTION 'Transaction reference / UTR is strictly required to record a manual payout.';
    END IF;

    v_payment_date := COALESCE(p_payment_date, v_now);
    IF v_payment_date > v_now + interval '1 day' THEN
        RAISE EXCEPTION 'Payment date cannot be in the future.';
    END IF;

    -- 3. Validate Pandit Exists
    SELECT * INTO v_pandit
    FROM public.pandit_profiles
    WHERE id = p_pandit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pandit profile not found for ID %', p_pandit_id;
    END IF;

    -- 4. Validate Verified Bank Account Exists
    SELECT * INTO v_bank
    FROM public.pandit_bank_accounts
    WHERE pandit_id = p_pandit_id AND is_default = true;

    IF NOT FOUND OR v_bank.verification_status != 'verified' THEN
        RAISE EXCEPTION 'Cannot record payout: Pandit does not have a verified default bank account.';
    END IF;

    -- 5. Lock and Resolve Target Payouts (Concurrency Protection)
    IF p_payout_ids IS NOT NULL AND array_length(p_payout_ids, 1) > 0 THEN
        -- Specific Payout IDs selected
        WITH locked_payouts AS (
            SELECT id, net_amount
            FROM public.pandit_payouts
            WHERE id = ANY(p_payout_ids)
              AND pandit_id = p_pandit_id
              AND status IN ('pending', 'approved', 'processing')
            FOR UPDATE
        )
        SELECT 
            COALESCE(array_agg(id), ARRAY[]::UUID[]),
            COALESCE(SUM(net_amount), 0)
        INTO v_target_payout_ids, v_total_eligible_pending
        FROM locked_payouts;

        IF array_length(v_target_payout_ids, 1) IS NULL OR array_length(v_target_payout_ids, 1) = 0 THEN
            RAISE EXCEPTION 'None of the specified payout IDs are eligible or pending for this Pandit.';
        END IF;

        IF array_length(v_target_payout_ids, 1) != array_length(p_payout_ids, 1) THEN
            RAISE EXCEPTION 'Some of the selected payout items are already paid or invalid.';
        END IF;

        v_settle_amount := v_total_eligible_pending;
    ELSE
        -- Settle All Pending Payouts for this Pandit
        WITH locked_payouts AS (
            SELECT id, net_amount, created_at
            FROM public.pandit_payouts
            WHERE pandit_id = p_pandit_id
              AND status IN ('pending', 'approved', 'processing')
            ORDER BY created_at ASC
            FOR UPDATE
        )
        SELECT 
            COALESCE(array_agg(id ORDER BY created_at ASC), ARRAY[]::UUID[]),
            COALESCE(SUM(net_amount), 0)
        INTO v_target_payout_ids, v_total_eligible_pending
        FROM locked_payouts;

        IF array_length(v_target_payout_ids, 1) IS NULL OR array_length(v_target_payout_ids, 1) = 0 THEN
            RAISE EXCEPTION 'Pandit has no eligible pending earnings awaiting payout.';
        END IF;

        v_settle_amount := v_total_eligible_pending;
    END IF;

    -- 6. Amount Overpayment Protection
    IF p_amount IS NOT NULL THEN
        IF p_amount <= 0 THEN
            RAISE EXCEPTION 'Payout amount must be strictly greater than zero.';
        END IF;

        IF p_amount > v_total_eligible_pending THEN
            RAISE EXCEPTION 'Payout amount (₹%) exceeds total eligible pending balance (₹%).', p_amount, v_total_eligible_pending;
        END IF;

        v_settle_amount := p_amount;
    END IF;

    -- 7. Execute Atomic State Transition to 'paid'
    UPDATE public.pandit_payouts
    SET 
        status = 'paid'::public.payout_status,
        provider_payout_id = v_clean_ref,
        transaction_reference = v_clean_ref,
        payment_method = p_payment_method,
        proof_document_path = p_proof_document_path,
        notes = p_notes,
        released_at = v_payment_date,
        confirmed_by_admin_id = v_caller_id,
        confirmed_at = v_now
    WHERE id = ANY(v_target_payout_ids);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- 8. Record Immutable Audit Trail
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        v_caller_id,
        'pandit_manual_payout_recorded',
        'pandit_payout',
        v_target_payout_ids[1],
        jsonb_build_object(
            'pandit_id', p_pandit_id,
            'payout_ids', v_target_payout_ids,
            'amount_paid', v_settle_amount,
            'payouts_count', v_updated_count,
            'payment_method', p_payment_method,
            'transaction_reference', v_clean_ref,
            'payment_date', v_payment_date,
            'proof_document_path', p_proof_document_path,
            'notes', p_notes,
            'bank_account_id', v_bank.id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'pandit_id', p_pandit_id,
        'payout_ids', v_target_payout_ids,
        'payouts_settled_count', v_updated_count,
        'amount_paid', v_settle_amount,
        'transaction_reference', v_clean_ref,
        'payment_date', v_payment_date,
        'status', 'paid',
        'confirmed_at', v_now
    );
END;
$$;


-- =============================================================================
-- 5. Authoritative RPC: get_pandit_individual_payout_history
-- Returns detailed chronological payout history for a single Pandit
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_pandit_individual_payout_history(
    p_pandit_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_payout_records JSONB := '[]'::jsonb;
    v_bank_info JSONB;
    v_pandit_info JSONB;
    v_earnings JSONB;
BEGIN
    -- 1. Admin authorization check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required to inspect payout history.';
    END IF;

    -- 2. Pandit Profile Info
    SELECT jsonb_build_object(
        'pandit_id', pp.id,
        'pandit_name', p.display_name,
        'pandit_phone', p.phone,
        'pandit_email', p.email,
        'verification_status', pp.verification_status
    ) INTO v_pandit_info
    FROM public.pandit_profiles pp
    JOIN public.profiles p ON p.id = pp.user_id
    WHERE pp.id = p_pandit_id;

    IF v_pandit_info IS NULL THEN
        RAISE EXCEPTION 'Pandit profile not found for ID %', p_pandit_id;
    END IF;

    -- 3. Verified Default Bank Info
    SELECT jsonb_build_object(
        'id', ba.id,
        'bank_name', ba.bank_name,
        'ifsc_code', ba.ifsc_code,
        'account_number_masked', CASE 
            WHEN ba.account_number_encrypted IS NOT NULL AND length(ba.account_number_encrypted) >= 4 
            THEN '•••• •••• ' || right(ba.account_number_encrypted, 4) 
            ELSE NULL 
        END,
        'upi_id', ba.upi_id,
        'verification_status', ba.verification_status,
        'verification_document_path', ba.verification_document_path,
        'ownership_confirmed_at', ba.pandit_confirmed_at
    ) INTO v_bank_info
    FROM public.pandit_bank_accounts ba
    WHERE ba.pandit_id = p_pandit_id AND ba.is_default = true;

    -- 4. Pandit Earnings Summary
    v_earnings := public.calculate_pandit_earnings(p_pandit_id);

    -- 5. Detailed Chronological Payouts List
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', po.id,
            'booking_id', po.booking_id,
            'booking_number', b.booking_number,
            'puja_name', ps.name,
            'kundli_order_id', po.kundli_order_id,
            'gross_amount', po.gross_amount,
            'platform_fee', po.platform_fee,
            'net_amount', po.net_amount,
            'status', po.status,
            'payment_method', po.payment_method,
            'transaction_reference', COALESCE(po.transaction_reference, po.provider_payout_id),
            'proof_document_path', po.proof_document_path,
            'notes', po.notes,
            'released_at', po.released_at,
            'created_at', po.created_at,
            'confirmed_at', po.confirmed_at,
            'confirmed_by_admin_name', admin_p.display_name
        )
        ORDER BY po.created_at DESC
    ) INTO v_payout_records
    FROM public.pandit_payouts po
    LEFT JOIN public.bookings b ON b.id = po.booking_id
    LEFT JOIN public.puja_services ps ON ps.id = b.puja_service_id
    LEFT JOIN public.profiles admin_p ON admin_p.id = po.confirmed_by_admin_id
    WHERE po.pandit_id = p_pandit_id;

    RETURN jsonb_build_object(
        'pandit', v_pandit_info,
        'bank', v_bank_info,
        'earnings', v_earnings,
        'payouts', COALESCE(v_payout_records, '[]'::jsonb)
    );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.get_pandit_payout_summaries(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pandit_payout_summaries(TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_manual_pandit_payout(UUID, UUID[], NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_manual_pandit_payout(UUID, UUID[], NUMERIC, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_pandit_individual_payout_history(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pandit_individual_payout_history(UUID) TO authenticated, service_role;
