const fs = require('fs');
const actionsContent = fs.readFileSync('C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts', 'utf8');
const actionLines = actionsContent.split('\n');
const pubStart = actionLines.findIndex(l => l.includes('async function publishDailyRashiInsightsSet'));
console.log(actionLines.slice(pubStart + 160, pubStart + 220).join('\n'));
