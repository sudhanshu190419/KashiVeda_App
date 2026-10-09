// scratch/inspect_pandit_detail_payouts.js
const fs = require('fs');

const content = fs.readFileSync('C:\\Projects\\kashi-veda-admin\\lib\\actions\\pandit-management.ts', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(420, 520).join('\n'));
