const fs = require('fs');

function inspectQuery(filePath, searchStr) {
  console.log(`\n=== ${filePath} ===`);
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (l.includes(searchStr)) {
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 10); j++) {
        console.log(`  ${j + 1}: ${lines[j]}`);
      }
    }
  });
}

inspectQuery('C:/Projects/kashi-veda-admin/lib/actions/payment-management.ts', '.from("payment_transactions")');
inspectQuery('C:/Projects/kashi-veda-admin/lib/actions/booking-management.ts', 'transactions:payment_transactions(');
inspectQuery('C:/Projects/kashi-veda-admin/lib/actions/kundli-management.ts', 'payment_transactions(');
