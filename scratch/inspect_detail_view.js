const fs = require('fs');

const detailPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-subscription-detail-view.tsx';
const content = fs.readFileSync(detailPath, 'utf8');
console.log('File size:', content.length);

const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('transaction') || l.includes('refund') || l.includes('Transaction') || l.includes('Refund') || l.includes('paymentOrder')) {
    console.log(`${i + 1}: ${l}`);
  }
});
