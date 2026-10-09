// scratch/inspect_booking_actions.js
const fs = require('fs');

const f1 = 'C:\\Projects\\kashi-veda-admin\\lib\\actions\\booking-management.ts';
if (fs.existsSync(f1)) {
  console.log('=== booking-management.ts ===');
  console.log(fs.readFileSync(f1, 'utf8').substring(0, 2000));
}

const f2 = 'C:\\Projects\\kashi-veda-admin\\scripts\\test-admin-kundli.mjs';
if (fs.existsSync(f2)) {
  console.log('\n=== test-admin-kundli.mjs ===');
  console.log(fs.readFileSync(f2, 'utf8'));
}
