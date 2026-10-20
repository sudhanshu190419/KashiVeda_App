const fs = require('fs');

const modalPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx';
const modalContent = fs.readFileSync(modalPath, 'utf8');
const lines = modalContent.split('\n');
console.log(lines.slice(75, 135).join('\n'));
