-- =============================================================================
-- Migration 037: Pandit Bank Verification Document Upload & Manual Review Workflow
-- =============================================================================
-- Enhances the Pandit payout bank account architecture to enforce manual
-- document verification (passbook photo, cancelled cheque, or bank statement)
-- prior to administrative approval.
--
-- Security & Operational Rules:
-- 1. Dedicated private storage bucket: 'pandit-bank-documents' (max 10MB, JPG/JPEG/PNG).
-- 2. Storage isolation: Pandits can only upload/view their own isolated folder.
-- 3. Document path only stored in database (no permanent public URLs, no raw bytes).
-- 4. Bank account cannot reach 'pending' verification without proof document.
-- 5. Explicit Pandit confirmation required before admin can approve.
-- 6. Strict manual checklist verification in admin console.
-- 7. Audit log capture for document submissions, Pandit confirmations, and admin approvals.
-- 8. Existing payout ledger and historical bank_account_id references strictly preserved.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema Alterations: Add verification document & confirmation fields
-- -----------------------------------------------------------------------------

ALTER TABLE public.pandit_bank_accounts
    ADD COLUMN IF NOT EXISTS verification_document_path TEXT,
    ADD COLUMN IF NOT EXISTS verification_document_type TEXT DEFAULT 'passbook_cheque',
    ADD COLUMN IF NOT EXISTS verification_document_uploaded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pandit_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.pandit_bank_accounts.verification_document_path IS
'Private Supabase Storage relative path to the Pandit bank verification document image.';

COMMENT ON COLUMN public.pandit_bank_accounts.verification_document_type IS
'Classification of bank document: passbook_cheque, bank_statement, or cancelled_cheque.';

COMMENT ON COLUMN public.pandit_bank_accounts.verification_document_uploaded_at IS
'Timestamp when the verification proof document was uploaded and linked.';

COMMENT ON COLUMN public.pandit_bank_accounts.pandit_confirmed_at IS
'Timestamp when the Pandit explicitly reviewed and confirmed their bank account details.';


-- -----------------------------------------------------------------------------
-- 2. Storage Bucket: pandit-bank-documents (Private, 10MB max, JPG/PNG only)
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'pandit-bank-documents',
    'pandit-bank-documents',
    false,
    10485760, -- 10 MB limit
    ARRAY['image/jpeg', 'image/png', 'image/jpg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;


-- -----------------------------------------------------------------------------
-- 3. Storage Row Level Security Policies for 'pandit-bank-documents'
-- -----------------------------------------------------------------------------

-- 3.1 SELECT Policy: Pandit can read own document folder; Admins can read all documents
DROP POLICY IF EXISTS "pandit_bank_documents_select" ON storage.objects;
CREATE POLICY "pandit_bank_documents_select"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'pandit-bank-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
            OR (storage.foldername(name))[1] = auth.uid()::text
        )
    );

-- 3.2 INSERT Policy: Pandit can upload only to their own pandit_id folder; Admins can upload
DROP POLICY IF EXISTS "pandit_bank_documents_insert" ON storage.objects;
CREATE POLICY "pandit_bank_documents_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'pandit-bank-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
            OR (storage.foldername(name))[1] = auth.uid()::text
        )
    );

-- 3.3 DELETE Policy: Pandit can clean up own document folder during failed submission; Admins can delete
DROP POLICY IF EXISTS "pandit_bank_documents_delete" ON storage.objects;
CREATE POLICY "pandit_bank_documents_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'pandit-bank-documents'
        AND auth.uid() IS NOT NULL
        AND (
            public.is_admin()
            OR (storage.foldername(name))[1] = public.get_pandit_id_for_user()::text
            OR (storage.foldername(name))[1] = auth.uid()::text
        )
    );


-- -----------------------------------------------------------------------------
-- 4. RPC: submit_pandit_bank_account (Updated to enforce verification document)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_pandit_bank_account(
    p_account_holder_name TEXT,
    p_account_number TEXT,
    p_ifsc_code TEXT,
    p_bank_name TEXT,
    p_upi_id TEXT DEFAULT NULL,
    p_verification_document_path TEXT DEFAULT NULL,
    p_verification_document_type TEXT DEFAULT 'passbook_cheque'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit RECORD;
    v_trimmed_holder TEXT;
    v_trimmed_bank TEXT;
    v_trimmed_acc TEXT;
    v_upper_ifsc TEXT;
    v_trimmed_upi TEXT;
    v_trimmed_doc_path TEXT;
    v_bank_account_id UUID;
BEGIN
    -- 1. Authentication check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to submit payout bank account';
    END IF;

    -- 2. Authorization check: must be a registered Pandit profile
    SELECT id, verification_status INTO v_pandit
    FROM public.pandit_profiles
    WHERE user_id = v_caller_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not a registered Pandit';
    END IF;

    -- 3. Input Validation: Account Holder Name
    v_trimmed_holder := trim(COALESCE(p_account_holder_name, ''));
    IF length(v_trimmed_holder) < 2 OR length(v_trimmed_holder) > 100 THEN
        RAISE EXCEPTION 'Account holder name must be between 2 and 100 characters';
    END IF;

    -- 4. Input Validation: Bank Name
    v_trimmed_bank := trim(COALESCE(p_bank_name, ''));
    IF length(v_trimmed_bank) < 2 OR length(v_trimmed_bank) > 100 THEN
        RAISE EXCEPTION 'Bank name must be between 2 and 100 characters';
    END IF;

    -- 5. Input Validation: Account Number (9 to 18 digits)
    v_trimmed_acc := trim(COALESCE(p_account_number, ''));
    IF v_trimmed_acc !~ '^[0-9]{9,18}$' THEN
        RAISE EXCEPTION 'Account number must contain between 9 and 18 numeric digits only';
    END IF;

    -- 6. Input Validation: IFSC Code (Standard 11-character Indian Financial System Code)
    v_upper_ifsc := upper(trim(COALESCE(p_ifsc_code, '')));
    IF v_upper_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN
        RAISE EXCEPTION 'Invalid IFSC code format. Must follow standard 11-character format (e.g. SBIN0001234)';
    END IF;

    -- 7. Input Validation: UPI ID (Optional)
    v_trimmed_upi := trim(COALESCE(p_upi_id, ''));
    IF length(v_trimmed_upi) > 0 THEN
        IF v_trimmed_upi !~ '^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$' OR length(v_trimmed_upi) > 100 THEN
            RAISE EXCEPTION 'Invalid UPI ID format. Expected format: username@bank';
        END IF;
    ELSE
        v_trimmed_upi := NULL;
    END IF;

    -- 8. Input Validation: Bank Verification Document (Mandatory)
    v_trimmed_doc_path := trim(COALESCE(p_verification_document_path, ''));
    IF length(v_trimmed_doc_path) < 3 THEN
        RAISE EXCEPTION 'Bank account verification document proof is required for submission';
    END IF;

    -- 9. Deactivate previous default bank accounts for this Pandit
    UPDATE public.pandit_bank_accounts
    SET is_default = false
    WHERE pandit_id = v_pandit.id
      AND is_default = true;

    -- 10. Insert new bank account record with 'pending' verification status
    INSERT INTO public.pandit_bank_accounts (
        pandit_id,
        account_holder_name,
        account_number_encrypted,
        ifsc_code,
        bank_name,
        upi_id,
        verification_status,
        is_default,
        verification_document_path,
        verification_document_type,
        verification_document_uploaded_at,
        pandit_confirmed_at,
        created_at
    ) VALUES (
        v_pandit.id,
        v_trimmed_holder,
        v_trimmed_acc,
        v_upper_ifsc,
        v_trimmed_bank,
        v_trimmed_upi,
        'pending'::public.bank_account_verification_status,
        true,
        v_trimmed_doc_path,
        COALESCE(p_verification_document_type, 'passbook_cheque'),
        now(),
        NULL, -- Requires Pandit confirmation before admin approval
        now()
    ) RETURNING id INTO v_bank_account_id;

    -- 11. Write Admin Audit Log entry
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        after_json
    ) VALUES (
        v_caller_id,
        'pandit_bank_submitted',
        'pandit_bank_accounts',
        v_bank_account_id::text,
        jsonb_build_object(
            'pandit_id', v_pandit.id,
            'bank_name', v_trimmed_bank,
            'ifsc_code', v_upper_ifsc,
            'account_holder_name', v_trimmed_holder,
            'masked_account', 'XXXX' || right(v_trimmed_acc, 4),
            'verification_document_path', v_trimmed_doc_path,
            'verification_status', 'pending'
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'bank_account_id', v_bank_account_id,
        'pandit_id', v_pandit.id,
        'account_holder_name', v_trimmed_holder,
        'bank_name', v_trimmed_bank,
        'ifsc_code', v_upper_ifsc,
        'upi_id', v_trimmed_upi,
        'masked_account_number', 'XXXX' || right(v_trimmed_acc, 4),
        'verification_document_path', v_trimmed_doc_path,
        'verification_status', 'pending'
    );
END;
$$;

COMMENT ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
'Authoritative RPC for Pandits to submit or update their payout bank account details with required verification proof document.';

REVOKE EXECUTE ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5. RPC: confirm_pandit_bank_account
-- -----------------------------------------------------------------------------
-- Authoritative RPC for the Pandit to explicitly confirm that the submitted
-- bank account details belong to them and are accurate for payouts.

CREATE OR REPLACE FUNCTION public.confirm_pandit_bank_account(
    p_bank_account_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit RECORD;
    v_bank RECORD;
BEGIN
    -- 1. Authentication
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to confirm bank account';
    END IF;

    -- 2. Authorization
    SELECT id INTO v_pandit
    FROM public.pandit_profiles
    WHERE user_id = v_caller_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not a registered Pandit';
    END IF;

    -- 3. Lock bank account record
    SELECT * INTO v_bank
    FROM public.pandit_bank_accounts
    WHERE id = p_bank_account_id
      AND pandit_id = v_pandit.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank account record not found or does not belong to caller';
    END IF;

    IF v_bank.verification_status != 'pending' THEN
        RAISE EXCEPTION 'Only pending bank accounts can be confirmed by Pandit';
    END IF;

    -- 4. Update confirmation timestamp
    UPDATE public.pandit_bank_accounts
    SET pandit_confirmed_at = now()
    WHERE id = p_bank_account_id;

    -- 5. Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        after_json
    ) VALUES (
        v_caller_id,
        'pandit_bank_confirmed_by_pandit',
        'pandit_bank_accounts',
        p_bank_account_id::text,
        jsonb_build_object(
            'pandit_id', v_pandit.id,
            'bank_account_id', p_bank_account_id,
            'pandit_confirmed_at', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'bank_account_id', p_bank_account_id,
        'pandit_id', v_pandit.id,
        'pandit_confirmed_at', now()
    );
END;
$$;

COMMENT ON FUNCTION public.confirm_pandit_bank_account(UUID) IS
'Authoritative RPC for a Pandit to confirm ownership and correctness of their pending payout bank account.';

REVOKE EXECUTE ON FUNCTION public.confirm_pandit_bank_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_pandit_bank_account(UUID) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 6. RPC: get_pandit_payout_account (Updated to include document & confirmation)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pandit_payout_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_pandit_id UUID;
    v_bank RECORD;
    v_rejection_reason TEXT := NULL;
    v_masked_acc TEXT;
BEGIN
    -- 1. Authentication
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- 2. Resolve Pandit ID
    SELECT id INTO v_pandit_id
    FROM public.pandit_profiles
    WHERE user_id = v_caller_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('bank_account', null);
    END IF;

    -- 3. Query current default bank account (or latest submitted)
    SELECT * INTO v_bank
    FROM public.pandit_bank_accounts
    WHERE pandit_id = v_pandit_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('bank_account', null);
    END IF;

    -- 4. Mask account number (last 4 digits only)
    v_masked_acc := 'XXXX' || right(v_bank.account_number_encrypted, 4);

    -- 5. Fetch rejection reason if rejected
    IF v_bank.verification_status = 'rejected' THEN
        SELECT after_json->>'rejection_reason' INTO v_rejection_reason
        FROM public.admin_audit_logs
        WHERE entity_type = 'pandit_bank_accounts'
          AND entity_id = v_bank.id::text
          AND action = 'pandit_bank_rejected'
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'bank_account', jsonb_build_object(
            'id', v_bank.id,
            'pandit_id', v_bank.pandit_id,
            'account_holder_name', v_bank.account_holder_name,
            'bank_name', v_bank.bank_name,
            'ifsc_code', v_bank.ifsc_code,
            'upi_id', v_bank.upi_id,
            'masked_account_number', v_masked_acc,
            'verification_status', v_bank.verification_status,
            'is_default', v_bank.is_default,
            'verification_document_path', v_bank.verification_document_path,
            'verification_document_type', v_bank.verification_document_type,
            'verification_document_uploaded_at', v_bank.verification_document_uploaded_at,
            'pandit_confirmed_at', v_bank.pandit_confirmed_at,
            'verified_at', v_bank.verified_at,
            'created_at', v_bank.created_at,
            'rejection_reason', v_rejection_reason
        )
    );
END;
$$;

COMMENT ON FUNCTION public.get_pandit_payout_account() IS
'Authoritative RPC for Pandits to inspect their payout bank account, proof document status, and confirmation state.';

REVOKE EXECUTE ON FUNCTION public.get_pandit_payout_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pandit_payout_account() TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 7. RPC: admin_verify_pandit_bank_account (Updated with document & confirmation guards)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_verify_pandit_bank_account(
    p_bank_account_id UUID,
    p_decision TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_bank RECORD;
    v_trimmed_reason TEXT;
    v_decision_enum public.bank_account_verification_status;
BEGIN
    -- 1. Authorization: Administrator privileges required
    v_caller_id := auth.uid();
    IF NOT public.is_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required';
    END IF;

    -- 2. Validate decision
    IF p_decision NOT IN ('verified', 'rejected') THEN
        RAISE EXCEPTION 'Invalid decision: %. Allowed values are verified or rejected', p_decision;
    END IF;

    v_decision_enum := p_decision::public.bank_account_verification_status;
    v_trimmed_reason := trim(COALESCE(p_rejection_reason, ''));

    IF v_decision_enum = 'rejected' AND length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'A detailed rejection reason of at least 5 characters is required when rejecting a bank account';
    END IF;

    -- 3. Lock target bank account
    SELECT * INTO v_bank
    FROM public.pandit_bank_accounts
    WHERE id = p_bank_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank account record not found with id: %', p_bank_account_id;
    END IF;

    -- 4. Verification Guards for approval
    IF v_decision_enum = 'verified' THEN
        -- Guard A: Verification document must be uploaded
        IF v_bank.verification_document_path IS NULL OR length(trim(v_bank.verification_document_path)) < 3 THEN
            RAISE EXCEPTION 'Cannot verify bank account: Verification proof document has not been uploaded';
        END IF;

        -- Guard B: Pandit must have confirmed the bank details
        IF v_bank.pandit_confirmed_at IS NULL THEN
            RAISE EXCEPTION 'Cannot verify bank account: Pandit confirmation has not been recorded';
        END IF;
    END IF;

    -- 5. Update bank account
    UPDATE public.pandit_bank_accounts
    SET verification_status = v_decision_enum,
        verified_by = v_caller_id,
        verified_at = now(),
        pandit_confirmed_at = CASE WHEN v_decision_enum = 'rejected' THEN NULL ELSE pandit_confirmed_at END
    WHERE id = p_bank_account_id;

    -- 6. Audit Log
    INSERT INTO public.admin_audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json
    ) VALUES (
        v_caller_id,
        CASE WHEN v_decision_enum = 'verified' THEN 'pandit_bank_verified' ELSE 'pandit_bank_rejected' END,
        'pandit_bank_accounts',
        p_bank_account_id::text,
        jsonb_build_object(
            'pandit_id', v_bank.pandit_id,
            'verification_status', v_bank.verification_status,
            'pandit_confirmed_at', v_bank.pandit_confirmed_at,
            'verification_document_path', v_bank.verification_document_path
        ),
        jsonb_build_object(
            'pandit_id', v_bank.pandit_id,
            'verification_status', p_decision,
            'rejection_reason', CASE WHEN v_decision_enum = 'rejected' THEN v_trimmed_reason ELSE NULL END,
            'verified_at', now()
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'bank_account_id', p_bank_account_id,
        'pandit_id', v_bank.pandit_id,
        'verification_status', p_decision,
        'verified_at', now()
    );
END;
$$;

COMMENT ON FUNCTION public.admin_verify_pandit_bank_account(UUID, TEXT, TEXT) IS
'Authoritative RPC for administrators to verify or reject a Pandit payout bank account after manual document and Pandit confirmation review.';

REVOKE EXECUTE ON FUNCTION public.admin_verify_pandit_bank_account(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_pandit_bank_account(UUID, TEXT, TEXT) TO authenticated, service_role;
