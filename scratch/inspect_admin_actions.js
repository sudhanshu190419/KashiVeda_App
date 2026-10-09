// scratch/inspect_admin_actions.js
const fs = require('fs');
const path = require('path');

const actionFiles = [
  'C:\\Projects\\kashi-veda-admin\\lib\\actions\\bookings.ts',
  'C:\\Projects\\kashi-veda-admin\\lib\\actions\\pandits.ts',
  'C:\\Projects\\kashi-veda-admin\\lib\\actions\\payments.ts',
];

actionFiles.forEach(f => {
  console.log(`\n=== FILE: ${f} ===`);
  if (fs.existsSync(f)) {
    console.log(fs.readFileSync(f, 'utf8').substring(0, 1500));
  } else {
    console.log('DOES NOT EXIST');
  }
});
