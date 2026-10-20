const fs = require('fs');

const content = fs.readFileSync('C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
  if (l.includes('bulkSaveDailyRashiInsightsDrafts')) {
    console.log(`Line ${i + 1}: ${l}`);
    console.log(lines.slice(Math.max(0, i - 10), i + 20).join('\n'));
  }
});
