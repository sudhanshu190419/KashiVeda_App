// src/features/pandit/services/panditPayoutService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import {
  ConfirmBankAccountResponse,
  PanditBankAccountDetails,
  PanditEarningsSummary,
  PanditPayoutItem,
  PanditPayoutStatus,
  SubmitBankAccountParams,
  SubmitBankAccountResponse,
} from "../types/pandit.types.ts";

export const panditPayoutService = {
  /**
   * Resolves the authoritative Pandit profile ID for the currently authenticated session.
   */
  async getAuthenticatedPanditId(): Promise<string> {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      throw new Error("Authentication required to access Pandit earnings.");
    }

    const { data: pandit, error: panditErr } = await supabase
      .from("pandit_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (panditErr || !pandit?.id) {
      throw new Error("Pandit profile not found for authenticated user.");
    }

    return pandit.id;
  },

  /**
   * Uploads a bank verification document image (passbook, cheque, statement) to
   * the private Supabase Storage bucket 'pandit-bank-documents' using an ArrayBuffer payload.
   */
  async uploadBankVerificationDocument(
    panditId: string,
    file: {
      uri?: string;
      name: string;
      type?: string;
      arrayBuffer?: ArrayBuffer;
    }
  ): Promise<string> {
    if (!panditId) {
      throw new Error("Pandit ID is required for bank document upload.");
    }

    if (!file || (!file.uri && !file.arrayBuffer)) {
      throw new Error("No file content provided for bank verification document upload.");
    }

    const sanitizedFileName = (file.name || "bank_proof.jpg")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
    const storagePath = `${panditId}/${Date.now()}_${sanitizedFileName}`;

    let uploadPayload: ArrayBuffer;
    if (file.arrayBuffer) {
      uploadPayload = file.arrayBuffer;
    } else if (file.uri) {
      const response = await fetch(file.uri);
      if (!response.ok) {
        throw new Error(`Failed to read bank document: HTTP ${response.status}`);
      }
      uploadPayload = await response.arrayBuffer();
    } else {
      throw new Error("No file content provided for bank verification document upload.");
    }

    if (uploadPayload.byteLength > 10 * 1024 * 1024) {
      throw new Error("Bank document file size exceeds 10 MB limit.");
    }

    const { error: storageError } = await supabase.storage
      .from("pandit-bank-documents")
      .upload(storagePath, uploadPayload, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (storageError) {
      throw new Error(
        storageError.message || "Failed to upload bank verification document to secure storage."
      );
    }

    return storagePath;
  },

  /**
   * Cleans up an orphaned bank document from storage if subsequent RPC submission fails.
   */
  async deleteBankVerificationDocument(storagePath: string): Promise<void> {
    if (!storagePath) return;
    try {
      await supabase.storage.from("pandit-bank-documents").remove([storagePath]);
    } catch {
      // Best-effort cleanup
    }
  },

  /**
   * Fetches the current default payout bank account for the authenticated Pandit.
   * Leverages get_pandit_payout_account RPC to return masked account data and rejection reason.
   */
  async fetchCurrentBankAccount(): Promise<PanditBankAccountDetails | null> {
    const { data, error } = await supabase.rpc("get_pandit_payout_account");

    if (error) {
      throw new Error(error.message || "Failed to load payout bank account details.");
    }

    return (data?.bank_account || null) as PanditBankAccountDetails | null;
  },

  /**
   * Submits or updates the Pandit's default bank account details with required proof document.
   * Invokes authoritative submit_pandit_bank_account RPC and sets status to 'pending'.
   */
  async submitBankAccount(
    params: SubmitBankAccountParams
  ): Promise<SubmitBankAccountResponse> {
    const { data, error } = await supabase.rpc("submit_pandit_bank_account", {
      p_account_holder_name: params.account_holder_name,
      p_account_number: params.account_number,
      p_ifsc_code: params.ifsc_code,
      p_bank_name: params.bank_name,
      p_upi_id: params.upi_id || null,
      p_verification_document_path: params.verification_document_path,
      p_verification_document_type: params.verification_document_type || "passbook_cheque",
    });

    if (error) {
      throw new Error(error.message || "Failed to submit bank account details.");
    }

    return data as SubmitBankAccountResponse;
  },

  /**
   * Pandit explicitly confirms that the pending bank account details belong to them.
   */
  async confirmBankAccount(
    bankAccountId: string
  ): Promise<ConfirmBankAccountResponse> {
    const { data, error } = await supabase.rpc("confirm_pandit_bank_account", {
      p_bank_account_id: bankAccountId,
    });

    if (error) {
      throw new Error(error.message || "Failed to confirm bank account details.");
    }

    return data as ConfirmBankAccountResponse;
  },

  /**
   * Fetches authoritative earnings summary via calculate_pandit_earnings RPC
   * and aggregates failed payouts from the settlement ledger.
   */
  async fetchEarningsSummary(panditId?: string): Promise<PanditEarningsSummary> {
    const targetPanditId = panditId || (await this.getAuthenticatedPanditId());

    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "calculate_pandit_earnings",
      { p_pandit_id: targetPanditId }
    );

    if (rpcErr) {
      throw new Error(rpcErr.message || "Failed to calculate Pandit earnings.");
    }

    // Query failed payouts directly from settlement ledger (enforced by RLS)
    const { data: failedRows, error: failedErr } = await supabase
      .from("pandit_payouts")
      .select("net_amount")
      .eq("status", "failed");

    const failedPayouts = failedErr
      ? 0
      : (failedRows || []).reduce(
          (sum, row) => sum + Number(row.net_amount || 0),
          0
        );

    return {
      pandit_id: targetPanditId,
      total_gross: Number(rpcData?.total_gross || 0),
      total_platform_fee: Number(
        rpcData?.total_platform_fee || rpcData?.platform_fee || 0
      ),
      net_earnings: Number(
        rpcData?.net_earnings || rpcData?.net_payout_value || 0
      ),
      paid_payouts: Number(rpcData?.paid_payouts || rpcData?.paid_payout || 0),
      pending_payouts: Number(
        rpcData?.pending_payouts || rpcData?.pending_payout || 0
      ),
      failed_payouts: failedPayouts,
      completed_service_gross: Number(rpcData?.completed_service_gross || 0),
      completed_kundli_gross: Number(rpcData?.completed_kundli_gross || 0),
    };
  },

  /**
   * Fetches payout records with source lineage (booking or kundli), verified bank account,
   * and manual transfer settlement details (Migration 042 resilient).
   */
  async fetchPayoutHistory(options?: {
    limit?: number;
    offset?: number;
    status?: PanditPayoutStatus | "all";
  }): Promise<PanditPayoutItem[]> {
    const buildQuery = (includeExtendedFields: boolean) => {
      const selectFields = includeExtendedFields
        ? `
          id,
          pandit_id,
          booking_id,
          kundli_order_id,
          bank_account_id,
          gross_amount,
          platform_fee,
          net_amount,
          status,
          provider_payout_id,
          payment_method,
          transaction_reference,
          proof_document_path,
          confirmed_at,
          notes,
          released_at,
          created_at,
          booking:bookings (
            id,
            booking_number,
            status,
            service_mode,
            scheduled_start_at,
            puja_service:puja_services (
              id,
              name
            )
          ),
          kundli_order:kundli_orders (
            id,
            order_number,
            status,
            customer:profiles!customer_id (
              display_name
            )
          ),
          bank_account:pandit_bank_accounts (
            id,
            bank_name,
            ifsc_code,
            account_holder_name
          )
        `
        : `
          id,
          pandit_id,
          booking_id,
          kundli_order_id,
          bank_account_id,
          gross_amount,
          platform_fee,
          net_amount,
          status,
          provider_payout_id,
          released_at,
          created_at,
          booking:bookings (
            id,
            booking_number,
            status,
            service_mode,
            scheduled_start_at,
            puja_service:puja_services (
              id,
              name
            )
          ),
          kundli_order:kundli_orders (
            id,
            order_number,
            status,
            customer:profiles!customer_id (
              display_name
            )
          ),
          bank_account:pandit_bank_accounts (
            id,
            bank_name,
            ifsc_code,
            account_holder_name
          )
        `;

      let query = supabase
        .from("pandit_payouts")
        .select(selectFields)
        .order("created_at", { ascending: false });

      if (options?.status && options.status !== "all") {
        query = query.eq("status", options.status);
      }

      if (typeof options?.limit === "number") {
        const from = options.offset || 0;
        const to = from + options.limit - 1;
        query = query.range(from, to);
      }

      return query;
    };

    let { data, error } = await buildQuery(true);

    // If database returns column missing error (Migration 042 unapplied), gracefully fallback
    if (
      error &&
      (error.message?.toLowerCase().includes("does not exist") ||
        error.code === "42703" ||
        error.code === "PGRST204")
    ) {
      const fallbackResult = await buildQuery(false);
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      throw new Error(error.message || "Failed to load payout history.");
    }

    return (data || []) as unknown as PanditPayoutItem[];
  },

  /**
   * Generates a temporary signed URL for viewing a payout proof document from storage.
   */
  async getPayoutProofSignedUrl(
    proofDocumentPath: string
  ): Promise<string | null> {
    if (!proofDocumentPath) return null;
    try {
      const { data, error } = await supabase.storage
        .from("payout-documents")
        .createSignedUrl(proofDocumentPath, 3600);

      if (error || !data?.signedUrl) {
        return null;
      }
      return data.signedUrl;
    } catch {
      return null;
    }
  },
};

