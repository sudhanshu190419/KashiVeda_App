// scratch/inspect_admin_bookings_page.js
const fs = require('fs');

const f = 'C:\\Projects\\kashi-veda-admin\\app\\(dashboard)\\bookings\\page.tsx';
if (fs.existsSync(f)) {
  console.log('=== app/(dashboard)/bookings/page.tsx ===');
  console.log(fs.readFileSync(f, 'utf8'));
}
