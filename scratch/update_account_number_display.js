const fs = require('fs');

console.log('Updating account number display in Admin website...');

// =============================================================================
// 1. Update lib/types/pandit-management.ts
// =============================================================================
const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/pandit-management.ts';
let typesContent = fs.readFileSync(typesPath, 'utf8');

const oldType = `export interface PanditBankItem {
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

const newType = `export interface PanditBankItem {
  id: string;
  accountHolderName: string;
  bankName: string | null;
  ifscCode: string;
  accountNumber: string;
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

if (typesContent.includes(oldType)) {
  typesContent = typesContent.replace(oldType, newType);
  fs.writeFileSync(typesPath, typesContent, 'utf8');
  console.log('✓ Updated lib/types/pandit-management.ts');
} else {
  console.error('✗ Could not find oldType in lib/types/pandit-management.ts');
}

// =============================================================================
// 2. Update lib/actions/pandit-management.ts
// =============================================================================
const actionsPath = 'C:/Projects/kashi-veda-admin/lib/actions/pandit-management.ts';
let actionsContent = fs.readFileSync(actionsPath, 'utf8');

const oldMapping = `      bankItem = {
        id: rawBank.id,
        accountHolderName: rawBank.account_holder_name,
        bankName: rawBank.bank_name || null,
        ifscCode: rawBank.ifsc_code,
        maskedAccountNumber: maskAccountNumber(rawBank.account_number_encrypted),
        upiId: rawBank.upi_id || null,`;

const newMapping = `      const fullAccountNumber = (rawBank.account_number_encrypted || "").trim();
      bankItem = {
        id: rawBank.id,
        accountHolderName: rawBank.account_holder_name,
        bankName: rawBank.bank_name || null,
        ifscCode: rawBank.ifsc_code,
        accountNumber: fullAccountNumber,
        maskedAccountNumber: fullAccountNumber,
        upiId: rawBank.upi_id || null,`;

if (actionsContent.includes(oldMapping)) {
  actionsContent = actionsContent.replace(oldMapping, newMapping);
  fs.writeFileSync(actionsPath, actionsContent, 'utf8');
  console.log('✓ Updated lib/actions/pandit-management.ts mapping');
} else {
  console.error('✗ Could not find oldMapping in lib/actions/pandit-management.ts');
}

// =============================================================================
// 3. Update components/admin/pandits/tabs/pandit-bank-tab.tsx
// =============================================================================
const bankTabPath = 'C:/Projects/kashi-veda-admin/components/admin/pandits/tabs/pandit-bank-tab.tsx';
let bankTabContent = fs.readFileSync(bankTabPath, 'utf8');

const oldTabAcc = `<div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-500">Account Number</span>
                    <span className="font-mono text-amber-400 font-bold">{bank.maskedAccountNumber}</span>
                  </div>`;

const newTabAcc = `<div className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-500">Account Number</span>
                    <span className="font-mono text-amber-400 font-bold tracking-wider">{bank.accountNumber || bank.maskedAccountNumber}</span>
                  </div>`;

if (bankTabContent.includes(oldTabAcc)) {
  bankTabContent = bankTabContent.replace(oldTabAcc, newTabAcc);
  fs.writeFileSync(bankTabPath, bankTabContent, 'utf8');
  console.log('✓ Updated pandit-bank-tab.tsx');
} else {
  console.error('✗ Could not find oldTabAcc in pandit-bank-tab.tsx');
}

// =============================================================================
// 4. Update components/admin/pandits/modals/verify-bank-modal.tsx
// =============================================================================
const modalPath = 'C:/Projects/kashi-veda-admin/components/admin/pandits/modals/verify-bank-modal.tsx';
let modalContent = fs.readFileSync(modalPath, 'utf8');

const oldModalAcc = `<div>
              <span className="text-slate-500 block text-[10px] uppercase">Account Number</span>
              <span className="font-mono text-amber-400 font-bold">{bankAccount.maskedAccountNumber}</span>
            </div>`;

const newModalAcc = `<div>
              <span className="text-slate-500 block text-[10px] uppercase">Account Number</span>
              <span className="font-mono text-amber-400 font-bold tracking-wider">{bankAccount.accountNumber || bankAccount.maskedAccountNumber}</span>
            </div>`;

if (modalContent.includes(oldModalAcc)) {
  modalContent = modalContent.replace(oldModalAcc, newModalAcc);
  fs.writeFileSync(modalPath, modalContent, 'utf8');
  console.log('✓ Updated verify-bank-modal.tsx');
} else {
  console.error('✗ Could not find oldModalAcc in verify-bank-modal.tsx');
}

console.log('Finished updating account number display.');
