const fs = require('fs');
const path = require('path');

const adminRoot = 'C:\\Projects\\kashi-veda-admin';

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 1. lib/types/payout-management.ts
const typesContent = `/**
 * Kashi Veda Admin Console
 * Pandit Manual Payout Management Domain Types
 * Aligned with migration 042 authoritative schema and RPCs.
 */

export type PayoutStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled';

export type PaymentMethod =
  | 'bank_transfer'
  | 'upi'
  | 'neft'
  | 'imps'
  | 'rtgs'
  | 'cheque'
  | 'cash'
  | 'other';

export interface PayoutSummaryMetrics {
  totalUnpaidAmount: number;
  pendingPayoutsCount: number;
  totalPaidAmount: number;
  paidPayoutsCount: number;
  panditsAwaitingPaymentCount: number;
}

export interface PanditPayoutSummaryItem {
  panditId: string;
  panditName: string;
  panditPhone: string | null;
  panditEmail: string | null;
  panditVerificationStatus: string;
  bankAccountId: string | null;
  bankName: string | null;
  ifscCode: string | null;
  accountNumberMasked: string | null;
  upiId: string | null;
  bankVerificationStatus: string | null;
  totalGrossEarnings: number;
  totalPlatformFee: number;
  eligibleEarnings: number;
  amountPaid: number;
  remainingPayableBalance: number;
  pendingPayoutCount: number;
  lastPayoutDate: string | null;
  payoutStatus: 'pending' | 'paid' | 'no_earnings';
  totalPayoutRecords: number;
}

export interface PayoutRecordItem {
  id: string;
  bookingId: string | null;
  bookingNumber: string | null;
  pujaName: string | null;
  kundliOrderId: string | null;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  status: PayoutStatus;
  paymentMethod: PaymentMethod | string | null;
  transactionReference: string | null;
  proofDocumentPath: string | null;
  notes: string | null;
  releasedAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
  confirmedByAdminName: string | null;
  signedProofUrl?: string | null;
}

export interface PanditPayoutHistoryResponse {
  pandit: {
    panditId: string;
    panditName: string;
    panditPhone: string | null;
    panditEmail: string | null;
    verificationStatus: string;
  };
  bank: {
    id: string;
    bankName: string;
    ifscCode: string;
    accountNumberMasked: string;
    upiId: string | null;
    verificationStatus: string;
    verificationDocumentUrl: string | null;
    ownershipConfirmedAt: string | null;
  } | null;
  earnings: {
    completed_service_gross: number;
    completed_kundli_gross: number;
    total_gross: number;
    total_platform_fee: number;
    net_earnings: number;
    paid_payout: number;
    pending_payout: number;
  };
  payouts: PayoutRecordItem[];
}

export interface PayoutFilters {
  search?: string;
  status?: 'all' | 'pending' | 'paid' | 'unverified_bank';
  page: number;
  pageSize: number;
}

export interface PayoutOverviewResponse {
  summary: PayoutSummaryMetrics;
  pandits: PanditPayoutSummaryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RecordPayoutPayload {
  panditId: string;
  payoutIds?: string[];
  amount: number;
  paymentMethod: PaymentMethod;
  transactionReference: string;
  paymentDate?: string;
  proofDocumentPath?: string | null;
  notes?: string;
}

export interface RecordPayoutResult {
  success: boolean;
  panditId?: string;
  payoutIds?: string[];
  payoutsSettledCount?: number;
  amountPaid?: number;
  transactionReference?: string;
  paymentDate?: string;
  status?: string;
  confirmedAt?: string;
  error?: string;
}
`;

// 2. lib/actions/payout-management.ts
const actionsContent = `"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import type {
  PayoutFilters,
  PayoutOverviewResponse,
  PanditPayoutHistoryResponse,
  RecordPayoutPayload,
  RecordPayoutResult,
  PayoutSummaryMetrics,
  PanditPayoutSummaryItem,
  PayoutRecordItem,
} from "@/lib/types/payout-management";

function extractSingle<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? val[0] || null : val;
}

/**
 * Fetch overview of Pandit payouts, summary metrics, and filterable ledger list
 */
export async function getPayoutOverview(
  filters: PayoutFilters
): Promise<PayoutOverviewResponse> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { search = "", status = "all", page = 1, pageSize = 20 } = filters;
  const offset = (page - 1) * pageSize;

  try {
    // 1. Try authoritative RPC from Migration 042 if deployed
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_pandit_payout_summaries",
      {
        p_search: search.trim() || null,
        p_status: status === "all" ? null : status,
        p_limit: pageSize,
        p_offset: offset,
      }
    );

    if (!rpcError && rpcData) {
      const summary = rpcData.summary || {};
      const pandits = (rpcData.pandits || []).map((p: any) => ({
        panditId: p.pandit_id,
        panditName: p.pandit_name,
        panditPhone: p.pandit_phone,
        panditEmail: p.pandit_email,
        panditVerificationStatus: p.pandit_verification_status,
        bankAccountId: p.bank_account_id,
        bankName: p.bank_name,
        ifscCode: p.ifsc_code,
        accountNumberMasked: p.account_number_masked,
        upiId: p.upi_id,
        bankVerificationStatus: p.bank_verification_status,
        totalGrossEarnings: Number(p.total_gross_earnings) || 0,
        totalPlatformFee: Number(p.total_platform_fee) || 0,
        eligibleEarnings: Number(p.eligible_earnings) || 0,
        amountPaid: Number(p.amount_paid) || 0,
        remainingPayableBalance: Number(p.remaining_payable_balance) || 0,
        pendingPayoutCount: Number(p.pending_payout_count) || 0,
        lastPayoutDate: p.last_payout_date,
        payoutStatus: p.payout_status,
        totalPayoutRecords: Number(p.total_payout_records) || 0,
      }));

      const totalCount = rpcData.total_count || 0;
      const totalPages = Math.ceil(totalCount / pageSize) || 1;

      return {
        summary: {
          totalUnpaidAmount: Number(summary.total_unpaid_amount) || 0,
          pendingPayoutsCount: Number(summary.pending_payouts_count) || 0,
          totalPaidAmount: Number(summary.total_paid_amount) || 0,
          paidPayoutsCount: Number(summary.paid_payouts_count) || 0,
          panditsAwaitingPaymentCount: Number(summary.pandits_awaiting_payment_count) || 0,
        },
        pandits,
        totalCount,
        page,
        pageSize,
        totalPages,
      };
    }
  } catch (err) {
    console.warn("RPC get_pandit_payout_summaries fallback to direct query:", err);
  }

  // 2. Direct Query Fallback (Fully compatible before & after migration 042)
  // Summary Aggregates
  const { data: allPayouts } = await supabase
    .from("pandit_payouts")
    .select("pandit_id, net_amount, status");

  let totalUnpaid = 0;
  let pendingCount = 0;
  let totalPaid = 0;
  let paidCount = 0;
  const pendingPanditSet = new Set<string>();

  (allPayouts || []).forEach((p: any) => {
    const net = Number(p.net_amount) || 0;
    if (["pending", "approved", "processing"].includes(p.status)) {
      totalUnpaid += net;
      pendingCount++;
      if (p.pandit_id) pendingPanditSet.add(p.pandit_id);
    } else if (p.status === "paid") {
      totalPaid += net;
      paidCount++;
    }
  });

  const summaryMetrics: PayoutSummaryMetrics = {
    totalUnpaidAmount: totalUnpaid,
    pendingPayoutsCount: pendingCount,
    totalPaidAmount: totalPaid,
    paidPayoutsCount: paidCount,
    panditsAwaitingPaymentCount: pendingPanditSet.size,
  };

  // Fetch Pandits with their profiles and bank accounts
  let panditsQuery = supabase
    .from("pandit_profiles")
    .select(
      \`id, verification_status,
       profile:profiles!pandit_profiles_user_id_fkey(display_name, phone, email),
       bank_accounts:pandit_bank_accounts(id, bank_name, ifsc_code, account_number_encrypted, upi_id, verification_status, is_default),
       payouts:pandit_payouts(id, gross_amount, platform_fee, net_amount, status, released_at, created_at)\`
    );

  const { data: rawPandits, error: panditsErr } = await panditsQuery;

  if (panditsErr) {
    console.error("Failed to query pandits for payouts:", panditsErr);
    throw new Error(\`Failed to fetch pandits: \${panditsErr.message}\`);
  }

  const s = search.toLowerCase().trim();
  const mappedPandits: PanditPayoutSummaryItem[] = (rawPandits || []).map((row: any) => {
    const prof = extractSingle(row.profile);
    const bankList = row.bank_accounts || [];
    const defaultBank = bankList.find((b: any) => b.is_default) || bankList[0] || null;
    const payoutsList = row.payouts || [];

    let maskedAcc: string | null = null;
    if (defaultBank?.account_number_encrypted) {
      const raw = String(defaultBank.account_number_encrypted);
      maskedAcc = raw.length >= 4 ? \`•••• •••• \${raw.slice(-4)}\` : "•••• •••• ••••";
    }

    let gross = 0;
    let fee = 0;
    let eligible = 0;
    let paid = 0;
    let pending = 0;
    let pendingItemCount = 0;
    let lastPaidDate: string | null = null;

    payoutsList.forEach((p: any) => {
      const g = Number(p.gross_amount) || 0;
      const f = Number(p.platform_fee) || 0;
      const n = Number(p.net_amount) || 0;
      gross += g;
      fee += f;
      eligible += n;

      if (p.status === "paid") {
        paid += n;
        if (p.released_at && (!lastPaidDate || new Date(p.released_at) > new Date(lastPaidDate))) {
          lastPaidDate = p.released_at;
        }
      } else if (["pending", "approved", "processing"].includes(p.status)) {
        pending += n;
        pendingItemCount++;
      }
    });

    const calculatedStatus: 'pending' | 'paid' | 'no_earnings' =
      pending > 0 ? "pending" : paid > 0 ? "paid" : "no_earnings";

    return {
      panditId: row.id,
      panditName: prof?.display_name || "Assigned Pandit",
      panditPhone: prof?.phone || null,
      panditEmail: prof?.email || null,
      panditVerificationStatus: row.verification_status,
      bankAccountId: defaultBank?.id || null,
      bankName: defaultBank?.bank_name || null,
      ifscCode: defaultBank?.ifsc_code || null,
      accountNumberMasked: maskedAcc,
      upiId: defaultBank?.upi_id || null,
      bankVerificationStatus: defaultBank?.verification_status || null,
      totalGrossEarnings: gross,
      totalPlatformFee: fee,
      eligibleEarnings: eligible,
      amountPaid: paid,
      remainingPayableBalance: pending,
      pendingPayoutCount: pendingItemCount,
      lastPayoutDate: lastPaidDate,
      payoutStatus: calculatedStatus,
      totalPayoutRecords: payoutsList.length,
    };
  });

  // Client filter
  let filtered = mappedPandits.filter((p) => {
    if (s) {
      const matchName = p.panditName.toLowerCase().includes(s);
      const matchPhone = (p.panditPhone || "").toLowerCase().includes(s);
      const matchBank = (p.bankName || "").toLowerCase().includes(s);
      const matchIfsc = (p.ifscCode || "").toLowerCase().includes(s);
      if (!matchName && !matchPhone && !matchBank && !matchIfsc) return false;
    }
    if (status === "pending") return p.remainingPayableBalance > 0;
    if (status === "paid") return p.amountPaid > 0 && p.remainingPayableBalance === 0;
    if (status === "unverified_bank") return p.bankVerificationStatus !== "verified";
    return true;
  });

  // Sort: Pending balance desc, then name asc
  filtered.sort((a, b) => {
    if (b.remainingPayableBalance !== a.remainingPayableBalance) {
      return b.remainingPayableBalance - a.remainingPayableBalance;
    }
    return a.panditName.localeCompare(b.panditName);
  });

  const totalCount = filtered.length;
  const paginated = filtered.slice(offset, offset + pageSize);
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    summary: summaryMetrics,
    pandits: paginated,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Fetch detailed individual Pandit payout history, bank details, and signed proof URLs
 */
export async function getPanditPayoutHistory(
  panditId: string
): Promise<PanditPayoutHistoryResponse> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  // 1. Try authoritative RPC from Migration 042 if available
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_pandit_individual_payout_history",
      { p_pandit_id: panditId }
    );

    if (!rpcError && rpcData) {
      const payoutsList: PayoutRecordItem[] = await Promise.all(
        (rpcData.payouts || []).map(async (p: any) => {
          let signedUrl: string | null = null;
          if (p.proof_document_path) {
            try {
              const { data: s } = await supabase.storage
                .from("payout-documents")
                .createSignedUrl(p.proof_document_path, 3600);
              signedUrl = s?.signedUrl || null;
            } catch {
              signedUrl = null;
            }
          }
          return {
            id: p.id,
            bookingId: p.booking_id,
            bookingNumber: p.booking_number,
            pujaName: p.puja_name,
            kundliOrderId: p.kundli_order_id,
            grossAmount: Number(p.gross_amount) || 0,
            platformFee: Number(p.platform_fee) || 0,
            netAmount: Number(p.net_amount) || 0,
            status: p.status,
            paymentMethod: p.payment_method,
            transactionReference: p.transaction_reference,
            proofDocumentPath: p.proof_document_path,
            notes: p.notes,
            releasedAt: p.released_at,
            createdAt: p.created_at,
            confirmedAt: p.confirmed_at,
            confirmedByAdminName: p.confirmed_by_admin_name,
            signedProofUrl: signedUrl,
          };
        })
      );

      return {
        pandit: {
          panditId: rpcData.pandit.pandit_id,
          panditName: rpcData.pandit.pandit_name,
          panditPhone: rpcData.pandit.pandit_phone,
          panditEmail: rpcData.pandit.pandit_email,
          verificationStatus: rpcData.pandit.verification_status,
        },
        bank: rpcData.bank
          ? {
              id: rpcData.bank.id,
              bankName: rpcData.bank.bank_name,
              ifscCode: rpcData.bank.ifsc_code,
              accountNumberMasked: rpcData.bank.account_number_masked,
              upiId: rpcData.bank.upi_id,
              verificationStatus: rpcData.bank.verification_status,
              verificationDocumentUrl: rpcData.bank.verification_document_url,
              ownershipConfirmedAt: rpcData.bank.ownership_confirmed_at,
            }
          : null,
        earnings: rpcData.earnings || {
          completed_service_gross: 0,
          completed_kundli_gross: 0,
          total_gross: 0,
          total_platform_fee: 0,
          net_earnings: 0,
          paid_payout: 0,
          pending_payout: 0,
        },
        payouts: payoutsList,
      };
    }
  } catch (err) {
    console.warn("RPC get_pandit_individual_payout_history fallback:", err);
  }

  // 2. Direct fallback query
  const { data: panditData, error: pErr } = await supabase
    .from("pandit_profiles")
    .select(
      \`id, verification_status,
       profile:profiles!pandit_profiles_user_id_fkey(display_name, phone, email)\`
    )
    .eq("id", panditId)
    .single();

  if (pErr || !panditData) {
    throw new Error(\`Pandit not found for ID \${panditId}\`);
  }

  const prof = extractSingle(panditData.profile);

  const { data: bankData } = await supabase
    .from("pandit_bank_accounts")
    .select("id, bank_name, ifsc_code, account_number_encrypted, upi_id, verification_status, verification_document_path, pandit_confirmed_at")
    .eq("pandit_id", panditId)
    .eq("is_default", true)
    .maybeSingle();

  let bankMasked = "•••• •••• ••••";
  if (bankData?.account_number_encrypted) {
    const raw = String(bankData.account_number_encrypted);
    bankMasked = raw.length >= 4 ? \`•••• •••• \${raw.slice(-4)}\` : "•••• •••• ••••";
  }

  let bankDocSignedUrl: string | null = null;
  if (bankData?.verification_document_path) {
    try {
      const { data: s } = await supabase.storage
        .from("pandit-bank-documents")
        .createSignedUrl(bankData.verification_document_path, 3600);
      bankDocSignedUrl = s?.signedUrl || null;
    } catch {
      bankDocSignedUrl = null;
    }
  }

  const { data: rawPayouts } = await supabase
    .from("pandit_payouts")
    .select(
      \`id, booking_id, kundli_order_id, gross_amount, platform_fee, net_amount, status,
       provider_payout_id, transaction_reference, payment_method, proof_document_path, notes,
       released_at, created_at, confirmed_at, confirmed_by_admin_id,
       bookings:booking_id (id, booking_number, puja_services:puja_service_id(name))\`
    )
    .eq("pandit_id", panditId)
    .order("created_at", { ascending: false });

  let gross = 0;
  let fee = 0;
  let net = 0;
  let paid = 0;
  let pending = 0;

  const payoutsList: PayoutRecordItem[] = await Promise.all(
    (rawPayouts || []).map(async (p: any) => {
      const g = Number(p.gross_amount) || 0;
      const f = Number(p.platform_fee) || 0;
      const n = Number(p.net_amount) || 0;
      gross += g;
      fee += f;
      net += n;

      if (p.status === "paid") {
        paid += n;
      } else if (["pending", "approved", "processing"].includes(p.status)) {
        pending += n;
      }

      const booking = extractSingle(p.bookings);
      const puja = booking ? extractSingle(booking.puja_services) : null;
      const proofPath = p.proof_document_path || null;

      let signedUrl: string | null = null;
      if (proofPath) {
        try {
          const { data: s } = await supabase.storage
            .from("payout-documents")
            .createSignedUrl(proofPath, 3600);
          signedUrl = s?.signedUrl || null;
        } catch {
          signedUrl = null;
        }
      }

      return {
        id: p.id,
        bookingId: p.booking_id,
        bookingNumber: booking?.booking_number || null,
        pujaName: puja?.name || null,
        kundliOrderId: p.kundli_order_id,
        grossAmount: g,
        platformFee: f,
        netAmount: n,
        status: p.status,
        paymentMethod: p.payment_method || "bank_transfer",
        transactionReference: p.transaction_reference || p.provider_payout_id || null,
        proofDocumentPath: proofPath,
        notes: p.notes || null,
        releasedAt: p.released_at,
        createdAt: p.created_at,
        confirmedAt: p.confirmed_at,
        confirmedByAdminName: null,
        signedProofUrl: signedUrl,
      };
    })
  );

  return {
    pandit: {
      panditId: panditData.id,
      panditName: prof?.display_name || "Assigned Pandit",
      panditPhone: prof?.phone || null,
      panditEmail: prof?.email || null,
      verificationStatus: panditData.verification_status,
    },
    bank: bankData
      ? {
          id: bankData.id,
          bankName: bankData.bank_name || "Bank Account",
          ifscCode: bankData.ifsc_code || "N/A",
          accountNumberMasked: bankMasked,
          upiId: bankData.upi_id || null,
          verificationStatus: bankData.verification_status,
          verificationDocumentUrl: bankDocSignedUrl,
          ownershipConfirmedAt: bankData.pandit_confirmed_at,
        }
      : null,
    earnings: {
      completed_service_gross: gross,
      completed_kundli_gross: 0,
      total_gross: gross,
      total_platform_fee: fee,
      net_earnings: net,
      paid_payout: paid,
      pending_payout: pending,
    },
    payouts: payoutsList,
  };
}

/**
 * Upload payment proof receipt to private storage bucket 'payout-documents'
 */
export async function uploadPayoutProofAction(formData: FormData): Promise<{
  success: boolean;
  storagePath?: string;
  error?: string;
}> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const file = formData.get("file") as File | null;
  const panditId = formData.get("panditId") as string | null;

  if (!file || !panditId) {
    return { success: false, error: "Payment proof file and Pandit ID are required." };
  }

  // File Validation
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return {
      success: false,
      error: "Invalid file type. Allowed formats: PDF, JPEG, PNG, WebP.",
    };
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { success: false, error: "File size exceeds maximum limit of 10 MB." };
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const timestamp = Date.now();
  const storagePath = \`\${panditId}/receipt_\${timestamp}_\${cleanName}\`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await supabase.storage
      .from("payout-documents")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      console.error("Storage upload error for payout-documents:", uploadErr);
      return { success: false, error: \`Storage upload failed: \${uploadErr.message}\` };
    }

    return { success: true, storagePath };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to upload payment proof document." };
  }
}

/**
 * Record a confirmed manual Pandit payout with authoritative database integrity
 */
export async function recordManualPayoutAction(
  payload: RecordPayoutPayload
): Promise<RecordPayoutResult> {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);

  const {
    panditId,
    payoutIds,
    amount,
    paymentMethod,
    transactionReference,
    paymentDate,
    proofDocumentPath,
    notes,
  } = payload;

  if (!panditId) {
    return { success: false, error: "Pandit ID is required." };
  }

  const cleanRef = (transactionReference || "").trim();
  if (!cleanRef) {
    return {
      success: false,
      error: "Transaction reference / UTR is strictly required to record a manual payout.",
    };
  }

  if (amount <= 0) {
    return { success: false, error: "Payout amount must be greater than zero." };
  }

  const payDate = paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString();

  // 1. Try authoritative RPC from Migration 042 if available
  try {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      "record_manual_pandit_payout",
      {
        p_pandit_id: panditId,
        p_payout_ids: payoutIds && payoutIds.length > 0 ? payoutIds : null,
        p_amount: amount,
        p_payment_method: paymentMethod,
        p_transaction_reference: cleanRef,
        p_payment_date: payDate,
        p_proof_document_path: proofDocumentPath || null,
        p_notes: notes?.trim() || null,
      }
    );

    if (!rpcErr && rpcResult && rpcResult.success) {
      revalidatePath("/payouts");
      revalidatePath("/pandits");
      revalidatePath("/payments");
      return {
        success: true,
        panditId: rpcResult.pandit_id,
        payoutIds: rpcResult.payout_ids,
        payoutsSettledCount: rpcResult.payouts_settled_count,
        amountPaid: rpcResult.amount_paid,
        transactionReference: rpcResult.transaction_reference,
        paymentDate: rpcResult.payment_date,
        status: "paid",
        confirmedAt: rpcResult.confirmed_at,
      };
    } else if (rpcErr) {
      // If RPC explicitly raised business validation error, return it immediately
      if (!rpcErr.message.includes("does not exist")) {
        return { success: false, error: rpcErr.message };
      }
    }
  } catch (err: any) {
    console.warn("RPC record_manual_pandit_payout fallback:", err);
  }

  // 2. Direct Atomic Database Fallback
  try {
    // Verify Pandit and verified bank account
    const { data: bankData, error: bErr } = await supabase
      .from("pandit_bank_accounts")
      .select("id, verification_status")
      .eq("pandit_id", panditId)
      .eq("is_default", true)
      .maybeSingle();

    if (bErr || !bankData || bankData.verification_status !== "verified") {
      return {
        success: false,
        error: "Cannot record payout: Pandit does not have a verified default bank account.",
      };
    }

    // Query pending payouts for this pandit
    let pendingQuery = supabase
      .from("pandit_payouts")
      .select("id, net_amount, status")
      .eq("pandit_id", panditId)
      .in("status", ["pending", "approved", "processing"]);

    if (payoutIds && payoutIds.length > 0) {
      pendingQuery = pendingQuery.in("id", payoutIds);
    }

    const { data: pendingRows, error: pErr } = await pendingQuery;

    if (pErr || !pendingRows || pendingRows.length === 0) {
      return {
        success: false,
        error: "Pandit has no eligible pending payouts awaiting transfer.",
      };
    }

    const totalEligible = pendingRows.reduce(
      (sum, p) => sum + (Number(p.net_amount) || 0),
      0
    );

    if (amount > totalEligible) {
      return {
        success: false,
        error: \`Payout amount (₹\${amount}) exceeds eligible pending balance (₹\${totalEligible}).\`,
      };
    }

    const targetIds = pendingRows.map((p) => p.id);
    const nowIso = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("pandit_payouts")
      .update({
        status: "paid",
        provider_payout_id: cleanRef,
        transaction_reference: cleanRef,
        payment_method: paymentMethod,
        proof_document_path: proofDocumentPath || null,
        notes: notes?.trim() || null,
        released_at: payDate,
        confirmed_by_admin_id: adminUser.id,
        confirmed_at: nowIso,
      })
      .in("id", targetIds);

    if (updateErr) {
      console.error("Database error updating pandit_payouts:", updateErr);
      return { success: false, error: \`Database update error: \${updateErr.message}\` };
    }

    // Insert Admin Audit Log
    await supabase.from("admin_audit_logs").insert({
      actor_user_id: adminUser.id,
      action: "pandit_manual_payout_recorded",
      entity_type: "pandit_payout",
      entity_id: targetIds[0],
      details: {
        pandit_id: panditId,
        payout_ids: targetIds,
        amount_paid: amount,
        payment_method: paymentMethod,
        transaction_reference: cleanRef,
        payment_date: payDate,
        proof_document_path: proofDocumentPath,
        notes: notes,
        bank_account_id: bankData.id,
      },
    });

    revalidatePath("/payouts");
    revalidatePath("/pandits");
    revalidatePath("/payments");

    return {
      success: true,
      panditId,
      payoutIds: targetIds,
      payoutsSettledCount: targetIds.length,
      amountPaid: amount,
      transactionReference: cleanRef,
      paymentDate: payDate,
      status: "paid",
      confirmedAt: nowIso,
    };
  } catch (err: any) {
    console.error("Failed to execute manual payout fallback:", err);
    return { success: false, error: err?.message || "Failed to record manual payout." };
  }
}

/**
 * Get short-lived signed URL for payout proof document
 */
export async function getPayoutProofSignedUrlAction(
  storagePath: string
): Promise<{ success: boolean; signedUrl?: string; error?: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  if (!storagePath) {
    return { success: false, error: "Storage path is required." };
  }

  try {
    const { data, error } = await supabase.storage
      .from("payout-documents")
      .createSignedUrl(storagePath, 3600);

    if (error || !data?.signedUrl) {
      return { success: false, error: error?.message || "Failed to generate signed document URL." };
    }

    return { success: true, signedUrl: data.signedUrl };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to resolve document URL." };
  }
}
`;

// 3. components/admin/sidebar.tsx update
const sidebarContent = `"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  UserCheck,
  Users,
  Calendar,
  CreditCard,
  Compass,
  Sparkles,
  ShieldCheck,
  Settings,
  Database,
  Flame,
  Scroll,
  Package,
  Landmark,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isReady: boolean;
  comingSoonText?: string;
}

const navItems: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    isReady: true,
  },
  {
    name: "Puja Catalog",
    href: "/puja-catalog",
    icon: Scroll,
    isReady: true,
  },
  {
    name: "Samagri Catalog",
    href: "/samagri",
    icon: Package,
    isReady: true,
  },
  {
    name: "Pandit Applications",
    href: "/pandit-applications",
    icon: UserCheck,
    isReady: true,
  },
  {
    name: "Pandits",
    href: "/pandits",
    icon: Users,
    isReady: true,
  },
  {
    name: "Bookings",
    href: "/bookings",
    icon: Calendar,
    isReady: true,
  },
  {
    name: "Payments",
    href: "/payments",
    icon: CreditCard,
    isReady: true,
  },
  {
    name: "Pandit Payouts",
    href: "/payouts",
    icon: Landmark,
    isReady: true,
  },
  {
    name: "Kundli",
    href: "/kundli",
    icon: Compass,
    isReady: true,
  },
  {
    name: "Astrology",
    href: "/astrology",
    icon: Sparkles,
    isReady: true,
  },
  {
    name: "Audit Logs",
    href: "/audit-logs",
    icon: ShieldCheck,
    isReady: false,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    isReady: false,
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AdminSidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border/60 bg-card transition-transform duration-200 md:static md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-border/50 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Flame className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold tracking-tight text-foreground">
            Kashi Veda
          </span>
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            Admin Console
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Platform Operations
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.isReady && pathname.startsWith(item.href));

          if (!item.isReady) {
            return (
              <div
                key={item.name}
                className="group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/60 cursor-not-allowed select-none hover:bg-muted/30 transition-colors"
                title="Module coming in future release"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  <span>{item.name}</span>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4 border-border/50 text-muted-foreground font-mono"
                >
                  {item.comingSoonText || "Soon"}
                </Badge>
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Bottom Infrastructure Status */}
      <div className="border-t border-border/50 p-4">
        <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground border border-border/40">
          <Database className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="flex flex-col overflow-hidden">
            <span className="font-medium text-foreground truncate">
              Supabase PostgreSQL
            </span>
            <span className="text-[10px] text-muted-foreground">
              Authoritative RLS Active
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
`;

// 4. app/(dashboard)/payouts/page.tsx
const payoutsPageContent = `import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import { getPayoutOverview } from "@/lib/actions/payout-management";
import { PanditPayoutsOverviewView } from "@/components/admin/payouts/payout-overview-view";

export const metadata = {
  title: "Pandit Payouts & Settlement Ledger | Kashi Veda Admin",
  description: "Manage outgoing manual Pandit bank transfers, upload payment proof, and audit payout records.",
};

export default async function PanditPayoutsPage() {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const initialData = await getPayoutOverview({ page: 1, pageSize: 20 });

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading Pandit payout ledger...
        </div>
      }
    >
      <PanditPayoutsOverviewView initialData={initialData} />
    </Suspense>
  );
}
`;

// 5. components/admin/payouts/payout-overview-view.tsx
const overviewViewContent = `"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PanditPayoutTable } from "./payout-table";
import { RecordPayoutModal } from "./modals/record-payout-modal";
import { PayoutHistoryModal } from "./modals/payout-history-modal";
import { getPayoutOverview } from "@/lib/actions/payout-management";
import type {
  PayoutOverviewResponse,
  PanditPayoutSummaryItem,
  PayoutFilters,
} from "@/lib/types/payout-management";
import {
  Landmark,
  Coins,
  CheckCircle2,
  Clock,
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  FileCheck2,
} from "lucide-react";

interface PanditPayoutsOverviewViewProps {
  initialData: PayoutOverviewResponse;
}

export function PanditPayoutsOverviewView({
  initialData,
}: PanditPayoutsOverviewViewProps) {
  const [data, setData] = useState<PayoutOverviewResponse>(initialData);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'unverified_bank'>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [selectedPanditForPayout, setSelectedPanditForPayout] = useState<PanditPayoutSummaryItem | null>(null);
  const [selectedPanditForHistory, setSelectedPanditForHistory] = useState<PanditPayoutSummaryItem | null>(null);

  const handleRefresh = (newPage = currentPage, newStatus = statusFilter, newSearch = search) => {
    startTransition(async () => {
      try {
        const res = await getPayoutOverview({
          page: newPage,
          pageSize: 20,
          status: newStatus,
          search: newSearch,
        });
        setData(res);
        setCurrentPage(newPage);
      } catch (err) {
        console.error("Failed to refresh payouts overview:", err);
      }
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRefresh(1, statusFilter, search);
  };

  const handleStatusChange = (status: 'all' | 'pending' | 'paid' | 'unverified_bank') => {
    setStatusFilter(status);
    handleRefresh(1, status, search);
  };

  const { summary } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Pandit Payouts & Settlement
              </h1>
              <p className="text-xs text-muted-foreground">
                Authoritative manual transfer ledger, proof verification, and settlement audit history.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30 px-2.5 py-1">
            <FileCheck2 className="h-3.5 w-3.5 mr-1" />
            Manual Transfer Protocol
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRefresh()}
            disabled={isPending}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={\`h-3.5 w-3.5 \${isPending ? "animate-spin" : ""}\`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Unpaid Balance */}
        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Eligible Unpaid Balance
              </span>
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-amber-400">
              ₹{summary.totalUnpaidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <span>{summary.pendingPayoutsCount} rituals awaiting transfer</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Pandits Awaiting Settlement */}
        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Pandits Awaiting Transfer
              </span>
              <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
              {summary.panditsAwaitingPaymentCount}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Priests with payable completed services
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Completed Lifetime Payouts */}
        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Total Completed Payouts
              </span>
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-emerald-400">
              ₹{summary.totalPaidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {summary.paidPayoutsCount} payouts successfully settled
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Platform Fee Ceiling & Retainage */}
        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Platform Commission
              </span>
              <div className="p-1.5 rounded-md bg-muted text-muted-foreground">
                <Coins className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
              0.00%
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              100% Dakshina passed to Acharyas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by Pandit name, phone, bank, IFSC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusChange("all")}
            className="h-8 text-xs px-3"
          >
            All Pandits
          </Button>
          <Button
            type="button"
            variant={statusFilter === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusChange("pending")}
            className="h-8 text-xs px-3 gap-1"
          >
            <Clock className="h-3 w-3 text-amber-400" />
            Pending Payout ({summary.panditsAwaitingPaymentCount})
          </Button>
          <Button
            type="button"
            variant={statusFilter === "paid" ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusChange("paid")}
            className="h-8 text-xs px-3 gap-1"
          >
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            Fully Settled
          </Button>
          <Button
            type="button"
            variant={statusFilter === "unverified_bank" ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusChange("unverified_bank")}
            className="h-8 text-xs px-3 gap-1 text-rose-400"
          >
            <AlertCircle className="h-3 w-3" />
            Unverified Bank
          </Button>
        </div>
      </div>

      {/* Payouts Table */}
      <PanditPayoutTable
        pandits={data.pandits}
        isLoading={isPending}
        onRecordPayout={(pandit) => setSelectedPanditForPayout(pandit)}
        onViewHistory={(pandit) => setSelectedPanditForHistory(pandit)}
      />

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/40 pt-4 text-xs text-muted-foreground">
          <span>
            Showing page {data.page} of {data.totalPages} ({data.totalCount} total priests)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || isPending}
              onClick={() => handleRefresh(currentPage - 1)}
              className="h-8 text-xs"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= data.totalPages || isPending}
              onClick={() => handleRefresh(currentPage + 1)}
              className="h-8 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedPanditForPayout && (
        <RecordPayoutModal
          pandit={selectedPanditForPayout}
          isOpen={!!selectedPanditForPayout}
          onClose={() => setSelectedPanditForPayout(null)}
          onSuccess={() => {
            setSelectedPanditForPayout(null);
            handleRefresh();
          }}
        />
      )}

      {selectedPanditForHistory && (
        <PayoutHistoryModal
          pandit={selectedPanditForHistory}
          isOpen={!!selectedPanditForHistory}
          onClose={() => setSelectedPanditForHistory(null)}
          onRecordPayout={() => {
            const p = selectedPanditForHistory;
            setSelectedPanditForHistory(null);
            setSelectedPanditForPayout(p);
          }}
        />
      )}
    </div>
  );
}
`;

// 6. components/admin/payouts/payout-table.tsx
const payoutTableContent = `"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PanditPayoutSummaryItem } from "@/lib/types/payout-management";
import {
  Landmark,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  History,
  Coins,
} from "lucide-react";

interface PanditPayoutTableProps {
  pandits: PanditPayoutSummaryItem[];
  isLoading?: boolean;
  onRecordPayout: (pandit: PanditPayoutSummaryItem) => void;
  onViewHistory: (pandit: PanditPayoutSummaryItem) => void;
}

export function PanditPayoutTable({
  pandits,
  isLoading,
  onRecordPayout,
  onViewHistory,
}: PanditPayoutTableProps) {
  if (isLoading) {
    return (
      <Card className="border-border/60 bg-card p-12 text-center text-xs text-muted-foreground">
        Loading payout ledger balances...
      </Card>
    );
  }

  if (pandits.length === 0) {
    return (
      <Card className="border-border/60 bg-card p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
          <Landmark className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">No Payout Records Found</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          No Pandits matched the selected filter or search query.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border/60 bg-muted/40 font-medium text-muted-foreground">
            <tr>
              <th className="py-3 px-4">Acharya / Priest</th>
              <th className="py-3 px-4">Payout Destination (Masked)</th>
              <th className="py-3 px-4 text-right">Lifetime Earnings</th>
              <th className="py-3 px-4 text-right">Amount Paid</th>
              <th className="py-3 px-4 text-right">Payable Balance</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {pandits.map((pandit) => {
              const isBankVerified = pandit.bankVerificationStatus === "verified";
              const hasPayableBalance = pandit.remainingPayableBalance > 0;

              return (
                <tr
                  key={pandit.panditId}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {/* Priest Info */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        {pandit.panditName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {pandit.panditName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {pandit.panditPhone || pandit.panditEmail || "No contact"}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Bank Account */}
                  <td className="py-3.5 px-4">
                    {pandit.bankAccountId ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">
                            {pandit.bankName || "Bank Account"}
                          </span>
                          {isBankVerified ? (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                              <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-rose-500/30 text-rose-400 bg-rose-500/10">
                              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                              Unverified
                            </Badge>
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {pandit.accountNumberMasked || "•••• •••• •••• (Masked)"}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground/70">
                          IFSC: {pandit.ifscCode || "N/A"}
                          {pandit.upiId ? \` • UPI: \${pandit.upiId}\` : ""}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic text-[11px]">
                        No bank account attached
                      </span>
                    )}
                  </td>

                  {/* Lifetime Earnings */}
                  <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                    ₹{pandit.eligibleEarnings.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>

                  {/* Amount Paid */}
                  <td className="py-3.5 px-4 text-right font-mono text-emerald-400">
                    ₹{pandit.amountPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>

                  {/* Remaining Payable Balance */}
                  <td className="py-3.5 px-4 text-right">
                    <span
                      className={\`font-mono font-bold text-sm \${
                        hasPayableBalance ? "text-amber-400" : "text-muted-foreground/60"
                      }\`}
                    >
                      ₹{pandit.remainingPayableBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    {hasPayableBalance && (
                      <div className="text-[10px] text-amber-500/80">
                        {pandit.pendingPayoutCount} pending ritual{pandit.pendingPayoutCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3.5 px-4 text-center">
                    {hasPayableBalance ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10"
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        Pending Transfer
                      </Badge>
                    ) : pandit.amountPaid > 0 ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Fully Settled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/40">
                        No Earnings
                      </Badge>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewHistory(pandit)}
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                        title="View chronological payout ledger and proof receipts"
                      >
                        <History className="h-3.5 w-3.5 mr-1" />
                        History
                      </Button>

                      {hasPayableBalance && (
                        <Button
                          variant="default"
                          size="sm"
                          disabled={!isBankVerified}
                          onClick={() => onRecordPayout(pandit)}
                          className={\`h-7 text-xs px-2.5 gap-1 shadow-sm \${
                            isBankVerified
                              ? "bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
                              : "bg-muted text-muted-foreground cursor-not-allowed"
                          }\`}
                          title={
                            isBankVerified
                              ? "Record manual bank transfer or UPI payout"
                              : "Bank account must be verified before recording payout"
                          }
                        >
                          <Coins className="h-3.5 w-3.5" />
                          Record Payout
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
`;

// 7. components/admin/payouts/modals/record-payout-modal.tsx
const recordModalContent = `"use client";

import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  recordManualPayoutAction,
  uploadPayoutProofAction,
} from "@/lib/actions/payout-management";
import type {
  PanditPayoutSummaryItem,
  PaymentMethod,
} from "@/lib/types/payout-management";
import {
  Landmark,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Upload,
  FileCheck,
  Coins,
  X,
  CheckCircle2,
} from "lucide-react";

interface RecordPayoutModalProps {
  pandit: PanditPayoutSummaryItem;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RecordPayoutModal({
  pandit,
  isOpen,
  onClose,
  onSuccess,
}: RecordPayoutModalProps) {
  const [amount, setAmount] = useState<string>(
    pandit.remainingPayableBalance.toFixed(2)
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bank_transfer");
  const [transactionRef, setTransactionRef] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState<string>("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const maxPayable = pandit.remainingPayableBalance;
  const numAmount = parseFloat(amount) || 0;
  const isAmountValid = numAmount > 0 && numAmount <= maxPayable;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isAmountValid) {
      setError(\`Payable amount must be between ₹1 and ₹\${maxPayable.toFixed(2)}.\`);
      return;
    }

    if (!transactionRef.trim()) {
      setError("Transaction reference / UTR is strictly required to verify the manual bank transfer.");
      return;
    }

    setIsSubmitting(true);

    try {
      let uploadedPath: string | null = null;

      // 1. Upload proof file if provided
      if (proofFile) {
        const formData = new FormData();
        formData.append("file", proofFile);
        formData.append("panditId", pandit.panditId);

        const uploadRes = await uploadPayoutProofAction(formData);
        if (!uploadRes.success || !uploadRes.storagePath) {
          throw new Error(uploadRes.error || "Failed to upload payment proof document.");
        }
        uploadedPath = uploadRes.storagePath;
      }

      // 2. Record manual payout in authoritative database
      const res = await recordManualPayoutAction({
        panditId: pandit.panditId,
        amount: numAmount,
        paymentMethod,
        transactionReference: transactionRef.trim(),
        paymentDate: paymentDate ? new Date(paymentDate).toISOString() : undefined,
        proofDocumentPath: uploadedPath,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to record manual payout.");
      }

      onSuccess();
    } catch (err: any) {
      setError(err?.message || "Failed to record manual payout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-lg border-border/60 bg-card shadow-2xl my-8">
        <form onSubmit={handleSubmit}>
          <CardHeader className="border-b border-border/40 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-500">
                <Landmark className="h-5 w-5" />
                <CardTitle className="text-base font-bold text-foreground">
                  Record Manual Pandit Payout
                </CardTitle>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-8 w-8 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription className="text-xs">
              Confirm outgoing bank transfer / UPI payment for Acharya {pandit.panditName}.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-4 text-xs">
            {/* Pandit Bank Account Snapshot */}
            <div className="rounded-lg border border-border/60 bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  {pandit.panditName}
                </span>
                <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Verified Account
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t border-border/40 font-mono text-[11px]">
                <div>
                  <span className="text-[10px] text-muted-foreground/70 block">Bank</span>
                  <span className="text-foreground">{pandit.bankName || "Standard Banking"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground/70 block">IFSC Code</span>
                  <span className="text-foreground">{pandit.ifscCode || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground/70 block">Account (Masked)</span>
                  <span className="text-amber-400 font-bold">{pandit.accountNumberMasked || "•••• •••• •••• (Masked)"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground/70 block">UPI ID</span>
                  <span className="text-foreground">{pandit.upiId || "None"}</span>
                </div>
              </div>
            </div>

            {/* Payable Balance Alert */}
            <div className="flex items-center justify-between rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
              <span className="text-amber-300 font-medium">Eligible Unpaid Balance:</span>
              <span className="font-mono text-sm font-bold text-amber-400">
                ₹{maxPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Amount Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="amount" className="text-xs">
                  Transfer Amount (₹) <span className="text-rose-400">*</span>
                </Label>
                <button
                  type="button"
                  onClick={() => setAmount(maxPayable.toFixed(2))}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Pay Full Balance (₹{maxPayable.toFixed(2)})
                </button>
              </div>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="1"
                max={maxPayable}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="font-mono text-sm h-9"
              />
            </div>

            {/* Payment Method & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="method" className="text-xs">
                  Transfer Method <span className="text-rose-400">*</span>
                </Label>
                <select
                  id="method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="bank_transfer">Bank Transfer (NEFT / IMPS / RTGS)</option>
                  <option value="upi">UPI / QR Transfer</option>
                  <option value="imps">IMPS Instant</option>
                  <option value="neft">NEFT</option>
                  <option value="rtgs">RTGS</option>
                  <option value="other">Other Method</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="date" className="text-xs">
                  Payment Date <span className="text-rose-400">*</span>
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  required
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Transaction Reference / UTR */}
            <div className="space-y-1.5">
              <Label htmlFor="utr" className="text-xs">
                Transaction Reference / UTR Number <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="utr"
                type="text"
                placeholder="e.g. UTR1234567890 or UPI Ref ID"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                required
                className="font-mono text-xs h-9 uppercase"
              />
              <p className="text-[10px] text-muted-foreground">
                Authoritative bank reference number proving fund transfer.
              </p>
            </div>

            {/* Payment Proof Upload (Optional but Recommended) */}
            <div className="space-y-1.5">
              <Label className="text-xs">
                Payment Proof Receipt (Optional - PDF, JPG, PNG up to 10MB)
              </Label>
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-center gap-2 border border-dashed border-border/80 hover:border-primary rounded-md p-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/20">
                    {proofFile ? (
                      <>
                        <FileCheck className="h-4 w-4 text-emerald-400" />
                        <span className="font-mono text-foreground truncate max-w-xs">
                          {proofFile.name} ({(proofFile.size / 1024).toFixed(0)} KB)
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <span>Choose bank receipt screenshot or PDF</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setProofFile(e.target.files[0]);
                      }
                    }}
                  />
                </label>
                {proofFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setProofFile(null)}
                    className="h-8 px-2 text-rose-400 hover:text-rose-300"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Internal Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">
                Internal Administrative Notes (Optional)
              </Label>
              <textarea
                id="notes"
                rows={2}
                placeholder="e.g. Settle balance for completed rituals in October."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-input bg-background p-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Confirmation Warning Notice */}
            <div className="rounded-md bg-rose-500/10 border border-rose-500/20 p-2.5 text-[11px] text-rose-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> Ensure that the funds have been successfully debited from the platform account before confirming. This will immediately mark the earnings as <strong>PAID</strong> in the authoritative ledger.
              </span>
            </div>

            {/* Error Display */}
            {error && (
              <div className="rounded-md bg-rose-500/15 border border-rose-500/30 p-2.5 text-xs text-rose-400">
                {error}
              </div>
            )}
          </CardContent>

          <CardFooter className="border-t border-border/40 pt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !isAmountValid || !transactionRef.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isSubmitting ? "Recording Transfer..." : \`Confirm & Settle ₹\${numAmount.toFixed(2)}\`}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
`;

// 8. components/admin/payouts/modals/payout-history-modal.tsx
const historyModalContent = `"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPanditPayoutHistory } from "@/lib/actions/payout-management";
import type {
  PanditPayoutSummaryItem,
  PanditPayoutHistoryResponse,
  PayoutRecordItem,
} from "@/lib/types/payout-management";
import {
  History,
  CheckCircle2,
  Clock,
  ExternalLink,
  Coins,
  Landmark,
  X,
  FileText,
  ShieldCheck,
  Building,
} from "lucide-react";

interface PayoutHistoryModalProps {
  pandit: PanditPayoutSummaryItem;
  isOpen: boolean;
  onClose: () => void;
  onRecordPayout: () => void;
}

export function PayoutHistoryModal({
  pandit,
  isOpen,
  onClose,
  onRecordPayout,
}: PayoutHistoryModalProps) {
  const [data, setData] = useState<PanditPayoutHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      setLoading(true);
      getPanditPayoutHistory(pandit.panditId)
        .then((res: PanditPayoutHistoryResponse) => {
          if (isMounted) setData(res);
        })
        .catch((err: unknown) => {
          console.error("Failed to load payout history:", err);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, pandit.panditId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-3xl border-border/60 bg-card shadow-2xl my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <CardHeader className="border-b border-border/40 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-foreground">
              <History className="h-5 w-5 text-amber-500" />
              <div>
                <CardTitle className="text-base font-bold">
                  Payout History: {pandit.panditName}
                </CardTitle>
                <CardDescription className="text-xs">
                  {pandit.panditPhone || pandit.panditEmail || "Acharya Settlement Ledger"}
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Summary & Bank Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 flex flex-col justify-between">
              <span className="text-muted-foreground text-[11px]">Lifetime Net Earnings</span>
              <span className="font-mono text-base font-bold text-foreground mt-1">
                ₹{pandit.eligibleEarnings.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 flex flex-col justify-between">
              <span className="text-muted-foreground text-[11px]">Total Paid Out</span>
              <span className="font-mono text-base font-bold text-emerald-400 mt-1">
                ₹{pandit.amountPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="rounded-lg border border-border/60 bg-amber-500/10 p-3 flex flex-col justify-between">
              <span className="text-amber-400 font-medium text-[11px]">Remaining Payable Balance</span>
              <span className="font-mono text-base font-bold text-amber-400 mt-1">
                ₹{pandit.remainingPayableBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Masked Bank Destination */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3 text-[11px]">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-amber-500" />
              <div>
                <span className="font-semibold text-foreground">
                  {pandit.bankName || "Bank Destination"}
                </span>
                <span className="text-muted-foreground font-mono ml-2">
                  ({pandit.accountNumberMasked || "Masked"})
                </span>
              </div>
            </div>
            <span className="font-mono text-muted-foreground">
              IFSC: {pandit.ifscCode || "N/A"}
            </span>
          </div>

          {/* Chronological Payouts Table */}
          <div className="space-y-2">
            <h4 className="font-semibold text-foreground text-xs">
              Chronological Payouts & Settlement Records
            </h4>

            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading payout transactions...
              </div>
            ) : !data || data.payouts.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border/60 rounded-lg text-muted-foreground">
                No individual completed services or payouts recorded for this Pandit.
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/40 font-medium text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Service / Order</th>
                      <th className="py-2.5 px-3 text-right">Net Dakshina</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3">Transfer Details</th>
                      <th className="py-2.5 px-3">Payment Date</th>
                      <th className="py-2.5 px-3 text-right">Proof</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {data.payouts.map((pay: PayoutRecordItem) => (
                      <tr key={pay.id} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {pay.pujaName || (pay.bookingNumber ? \`Booking \${pay.bookingNumber}\` : "Kundli Order")}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {pay.bookingNumber || pay.id.substring(0, 8)}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                          ₹{pay.netAmount.toFixed(2)}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          {pay.status === "paid" ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                            >
                              Paid
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-amber-500/30 text-amber-400 bg-amber-500/10"
                            >
                              Pending
                            </Badge>
                          )}
                        </td>

                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {pay.transactionReference ? (
                            <div className="flex flex-col">
                              <span className="text-foreground font-bold">
                                {pay.transactionReference}
                              </span>
                              <span className="text-[9px] text-muted-foreground capitalize">
                                {pay.paymentMethod || "bank_transfer"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60 italic">Awaiting UTR</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                          {pay.releasedAt
                            ? new Date(pay.releasedAt).toLocaleDateString()
                            : "—"}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          {pay.signedProofUrl ? (
                            <a
                              href={pay.signedProofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                            >
                              <FileText className="h-3 w-3" />
                              View Proof
                            </a>
                          ) : pay.proofDocumentPath ? (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              Stored
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="border-t border-border/40 pt-4 flex justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            Close
          </Button>

          {pandit.remainingPayableBalance > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={onRecordPayout}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs gap-1.5"
            >
              <Coins className="h-3.5 w-3.5" />
              Record Payout (₹{pandit.remainingPayableBalance.toFixed(2)})
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
`;

// Write all files
ensureDir(path.join(adminRoot, 'lib', 'types'));
fs.writeFileSync(path.join(adminRoot, 'lib', 'types', 'payout-management.ts'), typesContent, 'utf8');
console.log('✓ Wrote lib/types/payout-management.ts');

ensureDir(path.join(adminRoot, 'lib', 'actions'));
fs.writeFileSync(path.join(adminRoot, 'lib', 'actions', 'payout-management.ts'), actionsContent, 'utf8');
console.log('✓ Wrote lib/actions/payout-management.ts');

ensureDir(path.join(adminRoot, 'components', 'admin'));
fs.writeFileSync(path.join(adminRoot, 'components', 'admin', 'sidebar.tsx'), sidebarContent, 'utf8');
console.log('✓ Wrote components/admin/sidebar.tsx');

ensureDir(path.join(adminRoot, 'app', '(dashboard)', 'payouts'));
fs.writeFileSync(path.join(adminRoot, 'app', '(dashboard)', 'payouts', 'page.tsx'), payoutsPageContent, 'utf8');
console.log('✓ Wrote app/(dashboard)/payouts/page.tsx');

ensureDir(path.join(adminRoot, 'components', 'admin', 'payouts'));
fs.writeFileSync(path.join(adminRoot, 'components', 'admin', 'payouts', 'payout-overview-view.tsx'), overviewViewContent, 'utf8');
console.log('✓ Wrote components/admin/payouts/payout-overview-view.tsx');

fs.writeFileSync(path.join(adminRoot, 'components', 'admin', 'payouts', 'payout-table.tsx'), payoutTableContent, 'utf8');
console.log('✓ Wrote components/admin/payouts/payout-table.tsx');

ensureDir(path.join(adminRoot, 'components', 'admin', 'payouts', 'modals'));
fs.writeFileSync(path.join(adminRoot, 'components', 'admin', 'payouts', 'modals', 'record-payout-modal.tsx'), recordModalContent, 'utf8');
console.log('✓ Wrote components/admin/payouts/modals/record-payout-modal.tsx');

fs.writeFileSync(path.join(adminRoot, 'components', 'admin', 'payouts', 'modals', 'payout-history-modal.tsx'), historyModalContent, 'utf8');
console.log('✓ Wrote components/admin/payouts/modals/payout-history-modal.tsx');

console.log('ALL FILES DEPLOYED SUCCESSFULLY');
