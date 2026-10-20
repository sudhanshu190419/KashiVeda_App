const fs = require('fs');

const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts';
const content = fs.readFileSync(typesPath, 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('Bulk CSV Import Types'));
console.log(lines.slice(idx - 5, idx + 50).join('\n'));
