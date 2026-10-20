const fs = require('fs');

const modalPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx';
const modalContent = fs.readFileSync(modalPath, 'utf8');
const lines = modalContent.split('\n');
const idx = lines.findIndex(l => l.includes('<table') || l.includes('table-auto') || l.includes('Preview'));
console.log(lines.slice(idx, idx + 100).join('\n'));
