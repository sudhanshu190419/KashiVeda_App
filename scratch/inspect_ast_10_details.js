const fs = require('fs');

const actionsContent = fs.readFileSync('C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts', 'utf8');
const actionLines = actionsContent.split('\n');
const pubStart = actionLines.findIndex(l => l.includes('async function publishDailyRashiInsightsSet'));
console.log('=== ACTIONS LOOP AND RETURN ===');
console.log(actionLines.slice(pubStart + 80, pubStart + 160).join('\n'));

console.log('=== MODAL FULL ===');
const modalContent = fs.readFileSync('C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/publish-daily-set-modal.tsx', 'utf8');
console.log(modalContent);
