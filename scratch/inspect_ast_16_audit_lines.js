const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

console.log('Total lines in astrology-management.ts:', lines.length);

// Search for admin_audit_logs or audit
lines.forEach((l, i) => {
  if (l.includes('admin_audit_logs') || l.includes('audit')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
