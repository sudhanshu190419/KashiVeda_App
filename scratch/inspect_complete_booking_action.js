// scratch/inspect_complete_booking_action.js
const fs = require('fs');

const content = fs.readFileSync('C:\\Projects\\kashi-veda-admin\\lib\\actions\\booking-management.ts', 'utf8');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('completeBookingAdminAction'));
console.log(lines.slice(idx, idx + 50).join('\n'));
