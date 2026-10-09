const fs = require('fs');
const path = require('path');

console.log('Starting admin Pandit Bank Proof updates...');

// =============================================================================
// 1. Update lib/types/pandit-management.ts
// =============================================================================
const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/pandit-management.ts';
let typesContent = fs.readFileSync(typesPath, 'utf8');

const oldBankItemType = `export interface PanditBankItem {
  id: string;
  accountHolderName: string;
  bankName: string | null;
  ifscCode: string;
  maskedAccountNumber: string;
  upiId: string | null;
  verificationStatus: BankAccountVerificationStatus;
  verifiedByName: string | null;
  verifiedAt: string | null;
  isDefault: boolean;
  createdAt: string;
}`;

const newBankItemType = `export interface PanditBankItem {
  id: string;
  accountHolderName: string;
  bankName: string | null;
  ifscCode: string;
  maskedAccountNumber: string;
  upiId: string | null;
  verificationStatus: BankAccountVerificationStatus;
  verificationDocumentPath: string | null;
  verificationDocumentType: string | null;
  verificationDocumentUploadedAt: string | null;
  panditConfirmedAt: string | null;
  signedUrl: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  isDefault: boolean;
  createdAt: string;
}`;

if (typesContent.includes(oldBankItemType)) {
  typesContent = typesContent.replace(oldBankItemType, newBankItemType);
  fs.writeFileSync(typesPath, typesContent, 'utf8');
  console.log('✓ Updated lib/types/pandit-management.ts');
} else {
  console.error('✗ Could not find oldBankItemType in lib/types/pandit-management.ts');
}

// =============================================================================
// 2. Update lib/actions/pandit-management.ts
// =============================================================================
const actionsPath = 'C:/Projects/kashi-veda-admin/lib/actions/pandit-management.ts';
let actionsContent = fs.readFileSync(actionsPath, 'utf8');

// 2.1 Update BankJoined interface
const oldBankJoined = `interface BankJoined {
  id: string;
  account_holder_name: string;
  account_number_encrypted: string;
  ifsc_code: string;
  bank_name?: string | null;
  upi_id?: string | null;
  verification_status: BankAccountVerificationStatus;
  verified_by?: string | null;
  verified_at?: string | null;
  is_default: boolean;
  created_at: string;
  verifier?:
    | { display_name?: string | null }
    | { display_name?: string | null }[];
}`;

const newBankJoined = `interface BankJoined {
  id: string;
  account_holder_name: string;
  account_number_encrypted: string;
  ifsc_code: string;
  bank_name?: string | null;
  upi_id?: string | null;
  verification_status: BankAccountVerificationStatus;
  verification_document_path?: string | null;
  verification_document_type?: string | null;
  verification_document_uploaded_at?: string | null;
  pandit_confirmed_at?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  is_default: boolean;
  created_at: string;
  verifier?:
    | { display_name?: string | null }
    | { display_name?: string | null }[];
}`;

if (actionsContent.includes(oldBankJoined)) {
  actionsContent = actionsContent.replace(oldBankJoined, newBankJoined);
  console.log('✓ Updated BankJoined interface in lib/actions/pandit-management.ts');
} else {
  console.error('✗ Could not find oldBankJoined in lib/actions/pandit-management.ts');
}

// 2.2 Update default bank account select query
const oldBankSelect = `      // Default bank account
      supabase
        .from("pandit_bank_accounts")
        .select(
          \`id, account_holder_name, account_number_encrypted, ifsc_code, bank_name, upi_id,
           verification_status, verified_by, verified_at, is_default, created_at,
           verifier:profiles!pandit_bank_accounts_verified_by_fkey(display_name)\`
        )
        .eq("pandit_id", panditId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle(),`;

const newBankSelect = `      // Default bank account
      supabase
        .from("pandit_bank_accounts")
        .select(
          \`id, account_holder_name, account_number_encrypted, ifsc_code, bank_name, upi_id,
           verification_status, verification_document_path, verification_document_type,
           verification_document_uploaded_at, pandit_confirmed_at,
           verified_by, verified_at, is_default, created_at,
           verifier:profiles!pandit_bank_accounts_verified_by_fkey(display_name)\`
        )
        .eq("pandit_id", panditId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle(),`;

if (actionsContent.includes(oldBankSelect)) {
  actionsContent = actionsContent.replace(oldBankSelect, newBankSelect);
  console.log('✓ Updated pandit_bank_accounts select query in lib/actions/pandit-management.ts');
} else {
  console.error('✗ Could not find oldBankSelect in lib/actions/pandit-management.ts');
}

// 2.3 Update bankItem mapping and signed URL generation
const oldBankMapping = `    // 8. Mask Bank Details
    let bankItem: PanditBankItem | null = null;
    if (bankData) {
      const rawBank = bankData as unknown as BankJoined;
      const verifierObj = extractSingle(rawBank.verifier);
      bankItem = {
        id: rawBank.id,
        accountHolderName: rawBank.account_holder_name,
        bankName: rawBank.bank_name || null,
        ifscCode: rawBank.ifsc_code,
        maskedAccountNumber: maskAccountNumber(rawBank.account_number_encrypted),
        upiId: rawBank.upi_id || null,
        verificationStatus: rawBank.verification_status,
        verifiedByName: verifierObj?.display_name || null,
        verifiedAt: rawBank.verified_at || null,
        isDefault: !!rawBank.is_default,
        createdAt: rawBank.created_at,
      };
    }`;

const newBankMapping = `    // 8. Mask Bank Details & Generate Signed URL for Bank Proof (1 hour expiry)
    let bankItem: PanditBankItem | null = null;
    if (bankData) {
      const rawBank = bankData as unknown as BankJoined;
      const verifierObj = extractSingle(rawBank.verifier);

      let bankProofSignedUrl: string | null = null;
      if (rawBank.verification_document_path) {
        try {
          const { data: s, error: sErr } = await supabase.storage
            .from("pandit-bank-documents")
            .createSignedUrl(rawBank.verification_document_path, 3600);
          if (!sErr && s?.signedUrl) {
            bankProofSignedUrl = s.signedUrl;
          }
        } catch {
          bankProofSignedUrl = null;
        }
      }

      bankItem = {
        id: rawBank.id,
        accountHolderName: rawBank.account_holder_name,
        bankName: rawBank.bank_name || null,
        ifscCode: rawBank.ifsc_code,
        maskedAccountNumber: maskAccountNumber(rawBank.account_number_encrypted),
        upiId: rawBank.upi_id || null,
        verificationStatus: rawBank.verification_status,
        verificationDocumentPath: rawBank.verification_document_path || null,
        verificationDocumentType: rawBank.verification_document_type || null,
        verificationDocumentUploadedAt: rawBank.verification_document_uploaded_at || null,
        panditConfirmedAt: rawBank.pandit_confirmed_at || null,
        signedUrl: bankProofSignedUrl,
        verifiedByName: verifierObj?.display_name || null,
        verifiedAt: rawBank.verified_at || null,
        isDefault: !!rawBank.is_default,
        createdAt: rawBank.created_at,
      };
    }`;

if (actionsContent.includes(oldBankMapping)) {
  actionsContent = actionsContent.replace(oldBankMapping, newBankMapping);
  console.log('✓ Updated bankItem mapping & signed URL in lib/actions/pandit-management.ts');
} else {
  console.error('✗ Could not find oldBankMapping in lib/actions/pandit-management.ts');
}

fs.writeFileSync(actionsPath, actionsContent, 'utf8');

// =============================================================================
// 3. Update components/admin/pandits/tabs/pandit-bank-tab.tsx
// =============================================================================
const bankTabPath = 'C:/Projects/kashi-veda-admin/components/admin/pandits/tabs/pandit-bank-tab.tsx';
const newBankTabContent = `"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VerifyBankModal } from "../modals/verify-bank-modal";
import type { PanditDetail } from "@/lib/types/pandit-management";
import {
  Landmark,
  CheckCircle2,
  XCircle,
  Coins,
  FileCheck2,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Clock,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface PanditBankTabProps {
  pandit: PanditDetail;
  onRefresh: () => void;
}

export function PanditBankTab({ pandit, onRefresh }: PanditBankTabProps) {
  const [modalDecision, setModalDecision] = useState<"verified" | "rejected" | null>(null);

  const bank = pandit.bankAccount;

  return (
    <div className="space-y-6">
      {/* Payout Credentials & Bank Proof Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Destination Bank Account Card */}
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-200">
              <Landmark className="h-4 w-4 text-amber-500" />
              <span>Payout Destination Account</span>
            </CardTitle>
            {bank && (
              <Badge
                variant="outline"
                className={\`text-[10px] capitalize \${
                  bank.verificationStatus === "verified"
                    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                    : bank.verificationStatus === "rejected"
                    ? "border-rose-500/30 text-rose-400 bg-rose-500/10"
                    : "border-amber-500/30 text-amber-400 bg-amber-500/10"
                }\`}
              >
                {bank.verificationStatus}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!bank ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No bank account details submitted by this Pandit yet.
              </div>
            ) : (
              <>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-500">Account Holder Name</span>
                    <span className="font-semibold text-slate-200">{bank.accountHolderName}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-500">Bank Name</span>
                    <span className="text-slate-300">{bank.bankName || "Standard Banking"}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-500">IFSC Code</span>
                    <span className="font-mono text-slate-200">{bank.ifscCode}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-500">Account Number</span>
                    <span className="font-mono text-amber-400 font-bold">{bank.maskedAccountNumber}</span>
                  </div>
                  {bank.upiId && (
                    <div className="flex justify-between py-1.5 border-b border-slate-800">
                      <span className="text-slate-500">UPI ID</span>
                      <span className="font-mono text-slate-300">{bank.upiId}</span>
                    </div>
                  )}

                  {/* Pandit Confirmation Status */}
                  <div className="flex justify-between py-1.5 border-b border-slate-800 items-center">
                    <span className="text-slate-500">Pandit Confirmation</span>
                    {bank.panditConfirmedAt ? (
                      <span className="flex items-center gap-1 font-medium text-emerald-400 text-[11px]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Confirmed on {new Date(bank.panditConfirmedAt).toLocaleDateString()}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-medium text-amber-400 text-[11px]">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Awaiting Pandit Confirmation</span>
                      </span>
                    )}
                  </div>

                  {bank.verifiedByName && (
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-500">Reviewed By</span>
                      <span className="text-slate-400">
                        {bank.verifiedByName}{" "}
                        {bank.verifiedAt && \`(\${new Date(bank.verifiedAt).toLocaleDateString()})\`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bank Proof Section */}
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <FileCheck2 className="h-4 w-4 text-amber-500" />
                      <span>Bank Proof Document</span>
                    </span>
                    {bank.verificationDocumentPath ? (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                        Uploaded
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-rose-500/30 text-rose-400 text-[10px]">
                        Missing Proof
                      </Badge>
                    )}
                  </div>

                  {bank.verificationDocumentPath ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-400 text-[11px]">
                        <span>Document Type</span>
                        <span className="font-medium text-slate-200 capitalize">
                          {bank.verificationDocumentType
                            ? bank.verificationDocumentType.replace(/_/g, " ")
                            : "Passbook / Cheque"}
                        </span>
                      </div>
                      {bank.verificationDocumentUploadedAt && (
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Uploaded On</span>
                          <span className="font-mono text-slate-300">
                            {new Date(bank.verificationDocumentUploadedAt).toLocaleString()}
                          </span>
                        </div>
                      )}

                      <div className="pt-1">
                        {bank.signedUrl ? (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs gap-1.5 h-8"
                          >
                            <a
                              href={bank.signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>View Bank Proof (Image)</span>
                              <ExternalLink className="h-3 w-3 ml-auto opacity-70" />
                            </a>
                          </Button>
                        ) : (
                          <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-300 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>Bank proof could not be opened. Refresh and try again.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      No bank proof document uploaded by this Pandit.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-slate-800">
                  <Button
                    size="sm"
                    disabled={bank.verificationStatus === "verified"}
                    onClick={() => setModalDecision("verified")}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Verify Account</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bank.verificationStatus === "rejected"}
                    onClick={() => setModalDecision("rejected")}
                    className="flex-1 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs gap-1"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Reject</span>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Settlement Summary */}
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-200">
              <Coins className="h-4 w-4 text-emerald-400" />
              <span>Settlement &amp; Earnings Ledger</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
                <span className="text-[11px] text-slate-500">Gross Ritual Earnings</span>
                <div className="mt-1 font-mono text-xl font-bold text-slate-100">
                  ₹{pandit.settlements.totalGrossEarned.toLocaleString("en-IN")}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
                <span className="text-[11px] text-slate-500">Platform Fees Retained</span>
                <div className="mt-1 font-mono text-xl font-bold text-slate-400">
                  ₹{pandit.settlements.totalPlatformFee.toLocaleString("en-IN")}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
                <span className="text-[11px] text-emerald-400">Total Net Disbursed</span>
                <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
                  ₹{pandit.settlements.totalNetPaid.toLocaleString("en-IN")}
                </div>
              </div>
              <div className="rounded-lg bg-slate-950 p-3 border border-slate-800">
                <span className="text-[11px] text-amber-400">Pending Release Balance</span>
                <div className="mt-1 font-mono text-xl font-bold text-amber-400">
                  ₹{pandit.settlements.pendingPayoutBalance.toLocaleString("en-IN")}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              * Ritual payouts are calculated atomically by database RPCs upon confirmed completion and
              disbursed directly to the verified default bank account.
            </p>
          </CardContent>
        </Card>
      </div>

      {modalDecision && bank && (
        <VerifyBankModal
          bankAccount={bank}
          panditId={pandit.id}
          decision={modalDecision}
          isOpen={!!modalDecision}
          onClose={() => setModalDecision(null)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
`;

fs.writeFileSync(bankTabPath, newBankTabContent, 'utf8');
console.log('✓ Updated components/admin/pandits/tabs/pandit-bank-tab.tsx');

// =============================================================================
// 4. Update components/admin/pandits/modals/verify-bank-modal.tsx
// =============================================================================
const verifyModalPath = 'C:/Projects/kashi-veda-admin/components/admin/pandits/modals/verify-bank-modal.tsx';
const newVerifyModalContent = `"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { verifyPanditBankAccountAction } from "@/lib/actions/pandit-management";
import type { PanditBankItem } from "@/lib/types/pandit-management";
import {
  ShieldCheck,
  ShieldAlert,
  FileCheck2,
  ExternalLink,
  AlertTriangle,
  FileText,
  Clock,
} from "lucide-react";

interface VerifyBankModalProps {
  bankAccount: PanditBankItem;
  panditId: string;
  decision: "verified" | "rejected";
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function VerifyBankModal({
  bankAccount,
  panditId,
  decision,
  isOpen,
  onClose,
  onSuccess,
}: VerifyBankModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verification Checklist State
  const [proofReviewed, setProofReviewed] = useState(false);
  const [nameMatched, setNameMatched] = useState(false);
  const [ifscMatched, setIfscMatched] = useState(false);
  const [accountMatched, setAccountMatched] = useState(false);
  const [confirmationAcknowledged, setConfirmationAcknowledged] = useState(false);

  if (!isOpen) return null;

  const isReject = decision === "rejected";

  const isConfirmedByPandit = !!bankAccount.panditConfirmedAt;
  const hasProofDocument = !!bankAccount.verificationDocumentPath;

  const allChecklistItemsChecked =
    proofReviewed &&
    nameMatched &&
    ifscMatched &&
    accountMatched &&
    confirmationAcknowledged;

  const canSubmit = isReject
    ? reason.trim().length >= 5
    : allChecklistItemsChecked && hasProofDocument && isConfirmedByPandit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isReject && reason.trim().length < 5) {
      setError("Please provide a rejection reason of at least 5 characters.");
      return;
    }

    if (!isReject) {
      if (!hasProofDocument) {
        setError("Cannot verify bank account: Verification proof document has not been uploaded.");
        return;
      }
      if (!isConfirmedByPandit) {
        setError("Cannot verify bank account: Pandit confirmation has not been recorded.");
        return;
      }
      if (!allChecklistItemsChecked) {
        setError("Please review and confirm all checklist items before verifying.");
        return;
      }
    }

    setLoading(true);
    setError(null);

    const res = await verifyPanditBankAccountAction(
      bankAccount.id,
      panditId,
      decision,
      isReject ? reason.trim() : undefined
    );
    setLoading(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || "Failed to update bank verification.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className={\`flex items-center gap-3 \${isReject ? "text-rose-400" : "text-emerald-400"}\`}>
          <div className={\`flex h-10 w-10 items-center justify-center rounded-full \${isReject ? "bg-rose-500/10" : "bg-emerald-500/10"}\`}>
            {isReject ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-slate-100">
              {isReject ? "Reject Payout Account" : "Verify Pandit Bank Account"}
            </h3>
            <p className="text-xs text-slate-400">Compliance &amp; Settlement Verification</p>
          </div>
        </div>

        {/* Bank Account Summary Card */}
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 text-slate-300">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Account Holder</span>
              <span className="font-semibold text-slate-200">{bankAccount.accountHolderName}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Bank Name</span>
              <span className="text-slate-200">{bankAccount.bankName || "Standard Banking"}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">IFSC Code</span>
              <span className="font-mono text-slate-200 font-semibold">{bankAccount.ifscCode}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Account Number</span>
              <span className="font-mono text-amber-400 font-bold">{bankAccount.maskedAccountNumber}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Pandit Confirmation:</span>
            </span>
            {isConfirmedByPandit ? (
              <span className="font-medium text-emerald-400">
                ✓ Confirmed ({new Date(bankAccount.panditConfirmedAt!).toLocaleDateString()})
              </span>
            ) : (
              <span className="font-medium text-amber-400">
                ⚠️ Not Confirmed by Pandit
              </span>
            )}
          </div>

          {/* Proof Document Link in Modal */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-1">
              <FileCheck2 className="h-3.5 w-3.5 text-amber-500" />
              <span>Uploaded Proof:</span>
            </span>
            {bankAccount.signedUrl ? (
              <a
                href={bankAccount.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium underline"
              >
                <span>View Bank Proof Image</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : bankAccount.verificationDocumentPath ? (
              <span className="text-slate-400">Proof attached (preview unavailable)</span>
            ) : (
              <span className="text-rose-400 font-medium">⚠️ No proof uploaded</span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {!isReject ? (
            <>
              {/* Verification Guards Warnings */}
              {!hasProofDocument && (
                <div className="rounded-md bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-500/20 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Verification Blocked:</strong> No verification proof document has been uploaded. An account cannot be approved without proof.
                  </span>
                </div>
              )}

              {!isConfirmedByPandit && (
                <div className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-300 border border-amber-500/20 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Pandit Confirmation Missing:</strong> The Pandit has not yet confirmed ownership of this bank account. Verification RPC requires explicit Pandit confirmation before approval.
                  </span>
                </div>
              )}

              {/* Verification Checklist */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-3">
                <span className="text-xs font-semibold text-slate-200 block border-b border-slate-800 pb-1.5">
                  Administrative Review Checklist (Required)
                </span>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-slate-100">
                  <Checkbox
                    id="check-proof"
                    checked={proofReviewed}
                    onCheckedChange={(c) => setProofReviewed(!!c)}
                    className="mt-0.5 border-slate-700 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  <span>I have opened and carefully inspected the uploaded bank proof image.</span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-slate-100">
                  <Checkbox
                    id="check-name"
                    checked={nameMatched}
                    onCheckedChange={(c) => setNameMatched(!!c)}
                    className="mt-0.5 border-slate-700 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  <span>Account holder name matches the name on the passbook / cheque.</span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-slate-100">
                  <Checkbox
                    id="check-ifsc"
                    checked={ifscMatched}
                    onCheckedChange={(c) => setIfscMatched(!!c)}
                    className="mt-0.5 border-slate-700 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  <span>Bank name and IFSC code match the official branch details.</span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-slate-100">
                  <Checkbox
                    id="check-account"
                    checked={accountMatched}
                    onCheckedChange={(c) => setAccountMatched(!!c)}
                    className="mt-0.5 border-slate-700 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  <span>Account number matches the submitted verification document proof.</span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 hover:text-slate-100">
                  <Checkbox
                    id="check-confirmation"
                    checked={confirmationAcknowledged}
                    onCheckedChange={(c) => setConfirmationAcknowledged(!!c)}
                    className="mt-0.5 border-slate-700 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                  <span>Pandit ownership confirmation is verified and recorded on file.</span>
                </label>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-semibold text-slate-300">Rejection Reason (Mandatory)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="E.g., Invalid IFSC code, passbook photo blurry, account name mismatch..."
                rows={3}
                required
                className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
              />
            </div>
          )}

          {error && (
            <div className="rounded-md bg-rose-500/10 p-2.5 text-xs text-rose-400 border border-rose-500/20">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-slate-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !canSubmit}
              className={
                isReject
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              }
            >
              {loading
                ? "Saving..."
                : isReject
                ? "Confirm Rejection"
                : "Approve & Verify Account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(verifyModalPath, newVerifyModalContent, 'utf8');
console.log('✓ Updated components/admin/pandits/modals/verify-bank-modal.tsx');

console.log('All files updated successfully!');
