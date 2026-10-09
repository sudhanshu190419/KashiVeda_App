// scratch/inspect_booking_management_query.js
const fs = require('fs');

const content = fs.readFileSync('C:\\Projects\\kashi-veda-admin\\lib\\actions\\booking-management.ts', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(0, 200).join('\n'));
