const fs = require('fs');

const matrixPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx';
const content = fs.readFileSync(matrixPath, 'utf8');
const lines = content.split('\n');
const retryIdx = lines.findIndex(l => l.includes('handleRetryFailedRashis'));
console.log(lines.slice(retryIdx - 5, retryIdx + 50).join('\n'));
