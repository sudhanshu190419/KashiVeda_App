const fs = require('fs');
const path = require('path');

function searchPaymentMethod(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') searchPaymentMethod(full);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('payment_method') || content.includes('paymentMethod')) {
        console.log('Found in:', full);
        content.split('\n').forEach((l, i) => {
          if (l.includes('payment_method') || l.includes('paymentMethod')) {
            console.log(`  ${i + 1}: ${l.trim()}`);
          }
        });
      }
    }
  }
}

searchPaymentMethod('C:/Projects/kashi-veda-admin');
