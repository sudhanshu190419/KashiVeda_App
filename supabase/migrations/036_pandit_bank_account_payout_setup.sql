-- =============================================================================
-- Migration 036: Pandit Bank Account Payout Setup & Verification
-- =============================================================================
-- Authoritative RPCs for approved Pandits to securely submit and manage
-- their default payout bank account, view masked account details, and
-- attain payout eligibility following administrative verification.
--
-- Security Policies Enforced:
-- 1. SECURITY DEFINER with fixed safe search_path.
-- 2. Authenticated Pandit role authorization required.
-- 3. IFSC and account number syntax validation.
-- 4. Automatic status reset to 'pending' upon new submission / update.
-- 5. Safe masking of account numbers in read queries (never expose plaintext).
-- 6. Preservation of historical payout records and ON DELETE RESTRICT lineage.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPC: submit_pandit_bank_account
-- -----------------------------------------------------------------------------
-- Securely registers or updates a Pandit's default bank account.
-- Deactivates previous default accounts and sets verification_status = 'pending'.

CREATE OR REPLACE FUNCTION public.submit_pandit_bank_account(
    p_account_holder_name TEXT,
    p_account_number TEXT,
    p_ifsc_code TEXT,
    p_bank_name TEXT,
    p_upi_id TEXT DEFAULT NULL
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

    -- 8. Deactivate previous default bank accounts for this Pandit
    UPDATE public.pandit_bank_accounts
    SET is_default = false
    WHERE pandit_id = v_pandit.id
      AND is_default = true;

    -- 9. Insert new bank account record with 'pending' verification status
    INSERT INTO public.pandit_bank_accounts (
        pandit_id,
        account_holder_name,
        account_number_encrypted,
        ifsc_code,
        bank_name,
        upi_id,
        verification_status,
        is_default,
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
        now()
    ) RETURNING id INTO v_bank_account_id;

    -- 10. Write Admin Audit Log entry
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
        'verification_status', 'pending'
    );
END;
$$;

COMMENT ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT) IS
'Authoritative RPC for Pandits to submit or update their payout bank account details for admin verification.';

REVOKE EXECUTE ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pandit_bank_account(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. RPC: get_pandit_payout_account
-- -----------------------------------------------------------------------------
-- Safely exposes the caller Pandit's default bank account with masked account number
-- and any administrative rejection reasons from audit history.

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
            'verified_at', v_bank.verified_at,
            'created_at', v_bank.created_at,
            'rejection_reason', v_rejection_reason
        )
    );
END;
$$;

COMMENT ON FUNCTION public.get_pandit_payout_account() IS
'Authoritative RPC for Pandits to inspect their current payout bank account with masked account number.';

REVOKE EXECUTE ON FUNCTION public.get_pandit_payout_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pandit_payout_account() TO authenticated, service_role;
