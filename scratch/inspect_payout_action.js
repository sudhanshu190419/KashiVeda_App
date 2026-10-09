// scratch/inspect_payout_action.js
const fs = require('fs');

const content = fs.readFileSync('C:\\Projects\\kashi-veda-admin\\lib\\actions\\payout-management.ts', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(0, 350).join('\n'));
