const fs = require('fs');

const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/astrology-management.ts';
let content = fs.readFileSync(typesPath, 'utf8');

const targetSection = `  transactions: Array<{
    id: string;
    providerPaymentId: string | null;
    amount: number;
    status: string;
    paymentMethod: string | null;
    createdAt: string;
  }>;
  refunds: Array<{
    id: string;
    amount: number;
    reason: string | null;
    status: string;
    providerRefundId: string | null;
    createdAt: string;
  }>;
  deliveries: Array<{
    id: string;
    contentId: string;
    contentTitle: string | null;
    channel: AstrologyChannel;
    status: AstrologyDeliveryStatus;
    scheduledAt: string;
    sentAt: string | null;
    errorMessage: string | null;
  }>;`;

const replacementSection = `  transactions: Array<{
    id: string;
    providerPaymentId: string | null;
    amount: number;
    status: string;
    paymentMethod: string | null;
    createdAt: string;
  }>;
  transactionsError?: string | null;
  refunds: Array<{
    id: string;
    paymentTransactionId?: string;
    amount: number;
    reason: string | null;
    status: string;
    providerRefundId: string | null;
    createdAt: string;
  }>;
  refundsError?: string | null;
  deliveries: Array<{
    id: string;
    contentId: string;
    contentTitle: string | null;
    channel: AstrologyChannel;
    status: AstrologyDeliveryStatus;
    scheduledAt: string;
    sentAt: string | null;
    errorMessage: string | null;
  }>;
  deliveriesError?: string | null;`;

if (!content.includes(targetSection)) {
  console.error('Target section not found in astrology-management.ts');
  process.exit(1);
}

content = content.replace(targetSection, replacementSection);
fs.writeFileSync(typesPath, content, 'utf8');
console.log('Successfully updated lib/types/astrology-management.ts');
