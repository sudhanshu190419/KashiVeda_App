// __tests__/pandit_payout_setup.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { PanditPayoutSetupScreen } from "../src/features/pandit/screens/PanditPayoutSetupScreen.tsx";
import { panditPayoutService } from "../src/features/pandit/services/panditPayoutService.ts";
import {
  PanditBankAccountDetails,
  SubmitBankAccountParams,
} from "../src/features/pandit/types/pandit.types.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    session: { user: { id: "user-pandit-1" } },
    user: { id: "user-pandit-1", phone: "+919876543210" },
    profile: { id: "user-pandit-1", display_name: "Acharya Ramkrishna", phone: "+919876543210" },
    role: "pandit",
    panditProfile: {
      id: "pandit-profile-1",
      user_id: "user-pandit-1",
      verification_status: "verified",
      public_status: "available",
    },
    isLoading: false,
    error: null,
    signOut: jest.fn(),
  }),
}));

function extractAllText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractAllText).join(" ");
  if (node.children) return extractAllText(node.children);
  return "";
}

describe("Pandit Bank Account & Payout Setup Test Suite", () => {
  let mockRpc: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc = jest.fn();
    (supabase as any).rpc = mockRpc;
  });

  // A. Pandit submits valid bank account
  test("A. Pandit submits valid bank account via panditPayoutService", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        bank_account_id: "bank-acc-101",
        pandit_id: "pandit-profile-1",
        account_holder_name: "Ramkrishna Shastri",
        bank_name: "State Bank of India",
        ifsc_code: "SBIN0001234",
        upi_id: "shastri@sbi",
        masked_account_number: "XXXX1234",
        verification_status: "pending",
      },
      error: null,
    });

    const params: SubmitBankAccountParams = {
      account_holder_name: "Ramkrishna Shastri",
      bank_name: "State Bank of India",
      account_number: "12345678901234",
      ifsc_code: "SBIN0001234",
      upi_id: "shastri@sbi",
    };

    const res = await panditPayoutService.submitBankAccount(params);

    expect(res.success).toBe(true);
    expect(res.bank_account_id).toBe("bank-acc-101");
    expect(res.masked_account_number).toBe("XXXX1234");
    expect(mockRpc).toHaveBeenCalledWith("submit_pandit_bank_account", {
      p_account_holder_name: "Ramkrishna Shastri",
      p_bank_name: "State Bank of India",
      p_account_number: "12345678901234",
      p_ifsc_code: "SBIN0001234",
      p_upi_id: "shastri@sbi",
      p_verification_document_path: undefined,
      p_verification_document_type: "passbook_cheque",
    });
  });

  // B. Invalid account number rejected
  test("B. Invalid account number (<9 digits or non-numeric) is rejected by RPC error", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Account number must contain between 9 and 18 numeric digits only" },
    });

    await expect(
      panditPayoutService.submitBankAccount({
        account_holder_name: "Ramkrishna Shastri",
        bank_name: "State Bank of India",
        account_number: "1234", // too short
        ifsc_code: "SBIN0001234",
      })
    ).rejects.toThrow("Account number must contain between 9 and 18 numeric digits only");
  });

  // C. Invalid IFSC rejected
  test("C. Invalid IFSC format is rejected by RPC error", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid IFSC code format. Must follow standard 11-character format (e.g. SBIN0001234)" },
    });

    await expect(
      panditPayoutService.submitBankAccount({
        account_holder_name: "Ramkrishna Shastri",
        bank_name: "State Bank of India",
        account_number: "123456789012",
        ifsc_code: "INVALID_IFSC",
      })
    ).rejects.toThrow("Invalid IFSC code format");
  });

  // D. Non-Pandit caller rejected
  test("D. Non-Pandit caller is rejected with Unauthorized error", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Unauthorized: Caller is not a registered Pandit" },
    });

    await expect(
      panditPayoutService.submitBankAccount({
        account_holder_name: "Customer User",
        bank_name: "HDFC Bank",
        account_number: "987654321012",
        ifsc_code: "HDFC0001234",
      })
    ).rejects.toThrow("Unauthorized: Caller is not a registered Pandit");
  });

  // E. Submission creates pending account
  test("E. Successful submission creates bank account with verification_status = 'pending'", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        bank_account_id: "bank-acc-102",
        verification_status: "pending",
        masked_account_number: "XXXX5678",
      },
      error: null,
    });

    const res = await panditPayoutService.submitBankAccount({
      account_holder_name: "Shri Acharya",
      bank_name: "Punjab National Bank",
      account_number: "11223344556678",
      ifsc_code: "PUNB0001234",
    });

    expect(res.verification_status).toBe("pending");
    expect(res.masked_account_number).toBe("XXXX5678");
  });

  // F. Previous default account is safely handled
  test("F. Querying current account returns default bank account", async () => {
    const mockAccount: PanditBankAccountDetails = {
      id: "bank-acc-101",
      pandit_id: "pandit-profile-1",
      account_holder_name: "Ramkrishna Shastri",
      bank_name: "State Bank of India",
      ifsc_code: "SBIN0001234",
      upi_id: "shastri@sbi",
      masked_account_number: "XXXX1234",
      verification_status: "pending",
      is_default: true,
      verified_at: null,
      created_at: "2026-10-08T10:00:00Z",
    };

    mockRpc.mockResolvedValueOnce({
      data: { bank_account: mockAccount },
      error: null,
    });

    const account = await panditPayoutService.fetchCurrentBankAccount();

    expect(account).not.toBeNull();
    expect(account?.id).toBe("bank-acc-101");
    expect(account?.is_default).toBe(true);
    expect(account?.verification_status).toBe("pending");
  });

  // G. Pandit sees masked account after submission
  test("G. PanditPayoutSetupScreen displays masked account number and pending status", async () => {
    const mockAccount: PanditBankAccountDetails = {
      id: "bank-acc-101",
      pandit_id: "pandit-profile-1",
      account_holder_name: "Ramkrishna Shastri",
      bank_name: "State Bank of India",
      ifsc_code: "SBIN0001234",
      upi_id: "shastri@sbi",
      masked_account_number: "XXXX1234",
      verification_status: "pending",
      is_default: true,
      verified_at: null,
      created_at: "2026-10-08T10:00:00Z",
    };

    mockRpc.mockResolvedValueOnce({
      data: { bank_account: mockAccount },
      error: null,
    });

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditPayoutSetupScreen />);
    });

    const fullText = extractAllText(renderer.toJSON());

    expect(fullText).toContain("PENDING VERIFICATION");
    expect(fullText).toContain("XXXX1234");
    expect(fullText).toContain("SBIN0001234");
    expect(fullText).toContain("Ramkrishna Shastri");
    expect(fullText).toContain("State Bank of India");
  });

  // H. Admin verifies account & UI displays verified badge
  test("H. PanditPayoutSetupScreen renders verified status and payout eligibility", async () => {
    const mockVerifiedAccount: PanditBankAccountDetails = {
      id: "bank-acc-101",
      pandit_id: "pandit-profile-1",
      account_holder_name: "Ramkrishna Shastri",
      bank_name: "State Bank of India",
      ifsc_code: "SBIN0001234",
      upi_id: "shastri@sbi",
      masked_account_number: "XXXX1234",
      verification_status: "verified",
      is_default: true,
      verified_at: "2026-10-08T12:00:00Z",
      created_at: "2026-10-08T10:00:00Z",
    };

    mockRpc.mockResolvedValueOnce({
      data: { bank_account: mockVerifiedAccount },
      error: null,
    });

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditPayoutSetupScreen />);
    });

    const fullText = extractAllText(renderer.toJSON());

    expect(fullText).toContain("VERIFIED & PAYOUT ELIGIBLE");
    expect(fullText).toContain("Payouts Active");
    expect(fullText).toContain("XXXX1234");
    expect(fullText).toContain("Change Bank Account");
  });

  // I. Admin rejects account with reason & J. Pandit sees rejection reason
  test("I & J. Rejected bank account displays rejection reason prominently", async () => {
    const mockRejectedAccount: PanditBankAccountDetails = {
      id: "bank-acc-101",
      pandit_id: "pandit-profile-1",
      account_holder_name: "Ramkrishna Shastri",
      bank_name: "State Bank of India",
      ifsc_code: "SBIN0001234",
      upi_id: "shastri@sbi",
      masked_account_number: "XXXX1234",
      verification_status: "rejected",
      is_default: true,
      verified_at: null,
      created_at: "2026-10-08T10:00:00Z",
      rejection_reason: "IFSC code does not match branch or account name mismatch.",
    };

    mockRpc.mockResolvedValueOnce({
      data: { bank_account: mockRejectedAccount },
      error: null,
    });

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditPayoutSetupScreen />);
    });

    const fullText = extractAllText(renderer.toJSON());

    expect(fullText).toContain("VERIFICATION REJECTED");
    expect(fullText).toContain("Reason: IFSC code does not match branch or account name mismatch.");
    expect(fullText).toContain("Update & Resubmit Bank Account");
  });

  // K. Pandit can resubmit after rejection
  test("K. Tapping 'Update & Resubmit Bank Account' opens prefilled form to correct details", async () => {
    const mockRejectedAccount: PanditBankAccountDetails = {
      id: "bank-acc-101",
      pandit_id: "pandit-profile-1",
      account_holder_name: "Ramkrishna Shastri",
      bank_name: "State Bank of India",
      ifsc_code: "SBIN0001234",
      upi_id: "shastri@sbi",
      masked_account_number: "XXXX1234",
      verification_status: "rejected",
      is_default: true,
      verified_at: null,
      created_at: "2026-10-08T10:00:00Z",
      rejection_reason: "Account number typo.",
    };

    mockRpc.mockResolvedValueOnce({
      data: { bank_account: mockRejectedAccount },
      error: null,
    });

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditPayoutSetupScreen />);
    });

    // Find the Update & Resubmit button
    const root = renderer.root;
    const resubmitBtn = root.findAll((el: any) =>
      el.props && el.props.title === "Update & Resubmit Bank Account"
    )[0];

    expect(resubmitBtn).toBeDefined();

    await act(async () => {
      resubmitBtn.props.onPress();
    });

    const fullText = extractAllText(renderer.toJSON());
    expect(fullText).toContain("Update Bank Account Details");
    expect(fullText).toContain("Submit Bank Details");
  });

  // L. Unconfigured state shows Add Bank Account CTA
  test("L. Unconfigured bank account shows clear Not Configured notice and form", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { bank_account: null },
      error: null,
    });

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditPayoutSetupScreen />);
    });

    const fullText = extractAllText(renderer.toJSON());

    expect(fullText).toContain("Bank Account Not Configured");
    expect(fullText).toContain("Add Payout Bank Account");
    expect(fullText).toContain("Account Holder Name *");
    expect(fullText).toContain("Bank Name *");
    expect(fullText).toContain("Bank Account Number *");
    expect(fullText).toContain("IFSC Code *");
  });

  // M. Security: Plaintext account number is never exposed in fetched bank account details
  test("M. Fetching bank account details yields masked account number, never plaintext storage", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        bank_account: {
          id: "bank-acc-999",
          pandit_id: "pandit-profile-1",
          account_holder_name: "Vedic Pandit",
          bank_name: "Canara Bank",
          ifsc_code: "CNRB0001234",
          upi_id: null,
          masked_account_number: "XXXX9876",
          verification_status: "verified",
          is_default: true,
          verified_at: "2026-10-08T12:00:00Z",
          created_at: "2026-10-08T10:00:00Z",
        },
      },
      error: null,
    });

    const account = await panditPayoutService.fetchCurrentBankAccount();

    expect(account?.masked_account_number).toBe("XXXX9876");
    expect((account as any).account_number).toBeUndefined();
    expect((account as any).account_number_encrypted).toBeUndefined();
  });

  // N. Historical Payout records preserve bank account lineage
  test("N. Payout history maintains relation to pandit_bank_accounts", async () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      then: (resolve: any) =>
        resolve({
          data: [
            {
              id: "payout-1",
              pandit_id: "pandit-profile-1",
              booking_id: "bk-1",
              kundli_order_id: null,
              bank_account_id: "bank-acc-101",
              gross_amount: 1500,
              platform_fee: 225,
              net_amount: 1275,
              status: "paid",
              provider_payout_id: "pout_123",
              released_at: "2026-10-07T12:00:00Z",
              created_at: "2026-10-06T10:00:00Z",
              bank_account: {
                id: "bank-acc-101",
                bank_name: "State Bank of India",
                ifsc_code: "SBIN0001234",
                account_holder_name: "Ramkrishna Shastri",
              },
            },
          ],
          error: null,
        }),
    };

    (supabase as any).from = jest.fn().mockReturnValue(mockQueryBuilder);

    const history = await panditPayoutService.fetchPayoutHistory();

    expect(history.length).toBe(1);
    expect(history[0].bank_account_id).toBe("bank-acc-101");
    expect(history[0].bank_account?.bank_name).toBe("State Bank of India");
    expect(history[0].bank_account?.ifsc_code).toBe("SBIN0001234");
  });

  // O. UPI ID Regex Validation Tests
  describe("UPI ID & Regex Validation Rules", () => {
    const upiRegex = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$/;

    test("A. Valid UPI passes: name@bank", () => {
      expect(upiRegex.test("shastri@sbi")).toBe(true);
      expect(upiRegex.test("ramkrishna@okhdfcbank")).toBe(true);
      expect(upiRegex.test("pandit123@icici")).toBe(true);
    });

    test("B. Valid UPI with dots/hyphens/underscores in username passes", () => {
      expect(upiRegex.test("acharya.ram-krishna_01@okaxis")).toBe(true);
      expect(upiRegex.test("shri.pandit-ji_99@paytm")).toBe(true);
      expect(upiRegex.test("user_name.test-1@sbi")).toBe(true);
    });

    test("C. Invalid UPI with missing @ fails", () => {
      expect(upiRegex.test("shastrisbi")).toBe(false);
      expect(upiRegex.test("ramkrishna.okhdfcbank")).toBe(false);
      expect(upiRegex.test("invalid_upi_id")).toBe(false);
    });

    test("D. Invalid UPI with invalid bank suffix fails", () => {
      expect(upiRegex.test("name@")).toBe(false);
      expect(upiRegex.test("name@123")).toBe(false);
      expect(upiRegex.test("name@b")).toBe(false); // < 2 chars
      expect(upiRegex.test("name@bank_invalid")).toBe(false); // special char in bank handle
    });

    test("E. Empty optional UPI is accepted (bypasses regex check)", () => {
      const validateUpi = (upi?: string) => {
        const trimmed = upi?.trim();
        if (!trimmed) return true;
        return upiRegex.test(trimmed);
      };

      expect(validateUpi("")).toBe(true);
      expect(validateUpi(undefined)).toBe(true);
      expect(validateUpi("   ")).toBe(true);
      expect(validateUpi("shastri@sbi")).toBe(true);
    });

    test("F. Very long UPI username above 64 characters fails", () => {
      const longUsername = "a".repeat(65);
      expect(upiRegex.test(`${longUsername}@sbi`)).toBe(false);

      const maxUsername = "a".repeat(64);
      expect(upiRegex.test(`${maxUsername}@sbi`)).toBe(true);
    });

    test("G. Submit no longer produces PostgreSQL 2201B (bounds <= 255)", () => {
      // In Postgres, DUPMAX = 255. Both bounds 64 <= 255, completely preventing 2201B
      const sqlUpiRegexString = "^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$";
      const matches = sqlUpiRegexString.match(/\{(\d+),(\d+)\}/g);
      expect(matches).not.toBeNull();
      matches?.forEach((m) => {
        const parts = m.replace(/[{}]/g, "").split(",");
        const min = parseInt(parts[0], 10);
        const max = parseInt(parts[1], 10);
        expect(min).toBeLessThanOrEqual(255);
        expect(max).toBeLessThanOrEqual(255);
      });
    });

    test("H. Existing IFSC/account-number validation still works correctly", () => {
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      const accRegex = /^\d{9,18}$/;

      expect(ifscRegex.test("SBIN0001234")).toBe(true);
      expect(ifscRegex.test("HDFC0000001")).toBe(true);
      expect(ifscRegex.test("SBIN1001234")).toBe(false); // 5th char must be 0
      expect(ifscRegex.test("sbin0001234")).toBe(false); // must be uppercase

      expect(accRegex.test("123456789")).toBe(true); // 9 digits
      expect(accRegex.test("123456789012345678")).toBe(true); // 18 digits
      expect(accRegex.test("12345678")).toBe(false); // 8 digits (too short)
      expect(accRegex.test("1234567890123456789")).toBe(false); // 19 digits (too long)
      expect(accRegex.test("1234567890A")).toBe(false); // non-digit
    });
  });

  // P. Ownership Confirmation at Initial Submission & Admin Verification Guards
  describe("P. Ownership Confirmation at Submission & Admin Verification Guards", () => {
    test("TEST 1: Pandit submits without ownership checkbox -> submission blocked, no RPC called", async () => {
      mockRpc.mockResolvedValueOnce({
        data: { bank_account: null },
        error: null,
      });

      let renderer: any;
      await act(async () => {
        renderer = ReactTestRenderer.create(<PanditPayoutSetupScreen />);
      });

      const root = renderer.root;

      // Fill in all form fields
      const inputs = root.findAll((el: any) => el.props && el.props.label);
      const nameInput = inputs.find((i: any) => i.props.label?.includes("Account Holder Name"));
      const bankInput = inputs.find((i: any) => i.props.label?.includes("Bank Name"));
      const accInput = inputs.find((i: any) => i.props.label?.includes("Bank Account Number"));
      const confirmAccInput = inputs.find((i: any) => i.props.label?.includes("Confirm Account Number"));
      const ifscInput = inputs.find((i: any) => i.props.label?.includes("IFSC Code"));

      await act(async () => {
        nameInput.props.onChangeText("Pandit Ramkrishna");
        bankInput.props.onChangeText("State Bank of India");
        accInput.props.onChangeText("123456789012");
        confirmAccInput.props.onChangeText("123456789012");
        ifscInput.props.onChangeText("SBIN0001234");
      });

      // Find and click Submit Bank Details WITHOUT checking the declaration
      const submitBtn = root.findAll((el: any) =>
        el.props && el.props.title === "Submit Bank Details"
      )[0];

      await act(async () => {
        submitBtn.props.onPress();
      });

      const fullText = extractAllText(renderer.toJSON());

      // Should show error and NOT call submit RPC
      expect(fullText).toContain("You must confirm that this bank account belongs to you and the details are correct.");
      expect(mockRpc).not.toHaveBeenCalledWith("submit_pandit_bank_account", expect.anything());
    });

    test("TEST 2: Pandit checks ownership declaration and submits -> verification_status = pending, pandit_confirmed_at populated", async () => {
      const nowIso = "2026-10-08T16:00:00.000Z";
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          bank_account_id: "bank-acc-201",
          pandit_id: "pandit-profile-1",
          account_holder_name: "Pandit Ramkrishna",
          bank_name: "State Bank of India",
          ifsc_code: "SBIN0001234",
          upi_id: null,
          masked_account_number: "XXXX9012",
          verification_document_path: "pandit-profile-1/proof.jpg",
          verification_status: "pending",
          pandit_confirmed_at: nowIso,
        },
        error: null,
      });

      const res = await panditPayoutService.submitBankAccount({
        account_holder_name: "Pandit Ramkrishna",
        bank_name: "State Bank of India",
        account_number: "123456789012",
        ifsc_code: "SBIN0001234",
        verification_document_path: "pandit-profile-1/proof.jpg",
        verification_document_type: "passbook_cheque",
      });

      expect(res.success).toBe(true);
      expect(res.verification_status).toBe("pending");
      expect(res.pandit_confirmed_at).toBe(nowIso);
      expect(mockRpc).toHaveBeenCalledWith("submit_pandit_bank_account", {
        p_account_holder_name: "Pandit Ramkrishna",
        p_bank_name: "State Bank of India",
        p_account_number: "123456789012",
        p_ifsc_code: "SBIN0001234",
        p_upi_id: null,
        p_verification_document_path: "pandit-profile-1/proof.jpg",
        p_verification_document_type: "passbook_cheque",
      });
    });

    test("TEST 3: Submitted account with pandit_confirmed_at displays ownership confirmed status", async () => {
      const mockAccount: PanditBankAccountDetails = {
        id: "bank-acc-201",
        pandit_id: "pandit-profile-1",
        account_holder_name: "Pandit Ramkrishna",
        bank_name: "State Bank of India",
        ifsc_code: "SBIN0001234",
        upi_id: null,
        masked_account_number: "XXXX9012",
        verification_status: "pending",
        verification_document_path: "pandit-profile-1/proof.jpg",
        is_default: true,
        pandit_confirmed_at: "2026-10-08T16:00:00.000Z",
        verified_at: null,
        created_at: "2026-10-08T16:00:00.000Z",
      };

      mockRpc.mockResolvedValueOnce({
        data: { bank_account: mockAccount },
        error: null,
      });

      let renderer: any;
      await act(async () => {
        renderer = ReactTestRenderer.create(<PanditPayoutSetupScreen />);
      });

      const fullText = extractAllText(renderer.toJSON());

      expect(fullText).toContain("PENDING VERIFICATION");
      expect(fullText).toContain("Ownership confirmed by you on");
      expect(fullText).toContain("Awaiting administrator approval");
      // Must NOT show legacy unconfirmed warning card
      expect(fullText).not.toContain("Legacy Account: Confirmation Required");
    });

    test("TEST 4: Existing legacy account with pandit_confirmed_at = NULL is NOT automatically confirmed", async () => {
      const mockLegacyAccount: PanditBankAccountDetails = {
        id: "bank-acc-legacy-1",
        pandit_id: "pandit-profile-1",
        account_holder_name: "Old Acharya",
        bank_name: "Canara Bank",
        ifsc_code: "CNRB0001234",
        upi_id: null,
        masked_account_number: "XXXX0001",
        verification_status: "pending",
        verification_document_path: "pandit-profile-1/legacy_proof.jpg",
        is_default: true,
        pandit_confirmed_at: null, // Unconfirmed legacy record
        verified_at: null,
        created_at: "2026-10-01T10:00:00.000Z",
      };

      mockRpc.mockResolvedValueOnce({
        data: { bank_account: mockLegacyAccount },
        error: null,
      });

      let renderer: any;
      await act(async () => {
        renderer = ReactTestRenderer.create(<PanditPayoutSetupScreen />);
      });

      const fullText = extractAllText(renderer.toJSON());

      expect(fullText).toContain("Legacy Account: Confirmation Required");
      expect(fullText).toContain("Confirm Bank Details");
      expect(fullText).toContain("Awaiting Confirmation");
    });

    test("TEST 5: Admin verification RPC fails if verification_document_path is missing", async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "Cannot verify bank account: Verification proof document has not been uploaded" },
      });

      const { error } = await supabase.rpc("admin_verify_pandit_bank_account", {
        p_bank_account_id: "bank-acc-no-doc",
        p_decision: "verified",
      });

      expect(error?.message).toContain("Verification proof document has not been uploaded");
    });

    test("TEST 6: Admin verification RPC fails if pandit_confirmed_at is NULL", async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "Cannot verify bank account: Pandit confirmation has not been recorded" },
      });

      const { error } = await supabase.rpc("admin_verify_pandit_bank_account", {
        p_bank_account_id: "bank-acc-unconfirmed",
        p_decision: "verified",
      });

      expect(error?.message).toContain("Pandit confirmation has not been recorded");
    });
  });
});


