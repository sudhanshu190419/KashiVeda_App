-- =============================================================================
-- Migration 038: Pandit Bank Ownership Confirmation at Initial Submission
-- =============================================================================
-- Updates the Pandit payout bank account submission RPC (submit_pandit_bank_account)
-- to atomically record pandit_confirmed_at = now() during initial submission.
--
-- Operational & Architecture Rules:
-- 1. Pandit explicitly declares ownership and accuracy via mandatory UI checkbox
--    prior to submitting the bank account form.
-- 2. submit_pandit_bank_account atomically records pandit_confirmed_at = now() upon insertion.
-- 3. Eliminates the separate post-submission confirmation step for new submissions.
-- 4. Legacy unconfirmed records (pandit_confirmed_at IS NULL) are preserved and
--    remain unconfirmed until explicitly confirmed or resubmitted.
-- 5. Existing admin_verify_pandit_bank_account guards (requiring both verification_document_path
--    AND pandit_confirmed_at) remain strictly enforced.
-- 6. confirm_pandit_bank_account RPC is retained for backward compatibility with legacy records.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: submit_pandit_bank_account (Updated to record pandit_confirmed_at = now())
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
    v_confirmed_at TIMESTAMPTZ;
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

    -- 10. Record submission confirmation timestamp
    v_confirmed_at := now();

    -- 11. Insert new bank account record with 'pending' verification status and immediate confirmation
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
        v_confirmed_at, -- Atomically confirmed at submission upon explicit Pandit declaration
        now()
    ) RETURNING id INTO v_bank_account_id;

    -- 12. Write Admin Audit Log entry (recording ownership confirmation at submission)
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
            'verification_status', 'pending',
            'pandit_confirmed_at', v_confirmed_at,
            'confirmed_at_submission', true
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
        'verification_status', 'pending',
        'pandit_confirmed_at', v_confirmed_at
    );
END;
$$;

COMMENT ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
'Authoritative RPC for Pandits to submit payout bank account details with verification proof document and atomic ownership confirmation.';

REVOKE EXECUTE ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
