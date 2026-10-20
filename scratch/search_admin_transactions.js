const fs = require('fs');
const path = require('path');

function search(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') search(full);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('payment_transactions')) {
        console.log('Found payment_transactions in:', full);
        const lines = content.split('\n');
        lines.forEach((l, i) => {
          if (l.includes('payment_transactions')) console.log(`  Line ${i + 1}: ${l.trim()}`);
        });
      }
    }
  }
}

search('C:/Projects/kashi-veda-admin');
