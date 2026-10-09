// scratch/inspect_record_payout_action.js
const fs = require('fs');

const content = fs.readFileSync('C:\\Projects\\kashi-veda-admin\\lib\\actions\\payout-management.ts', 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('recordManualPayoutAction'));
console.log(lines.slice(idx, idx + 100).join('\n'));
