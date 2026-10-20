const fs = require('fs');

const modalPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx';
const modalContent = fs.readFileSync(modalPath, 'utf8');
const lines = modalContent.split('\n');
console.log('=== LINES 60 to 220 ===');
console.log(lines.slice(60, 220).join('\n'));
console.log('=== LINES 220 to 380 ===');
console.log(lines.slice(220, 380).join('\n'));
