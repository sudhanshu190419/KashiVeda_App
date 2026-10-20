const fs = require('fs');

const content = fs.readFileSync('C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx', 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('bulkSaveDailyRashiInsightsDrafts'));
console.log(lines.slice(Math.max(0, idx - 15), idx + 25).join('\n'));
