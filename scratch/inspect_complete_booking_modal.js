// scratch/inspect_complete_booking_modal.js
const fs = require('fs');

const f = 'C:\\Projects\\kashi-veda-admin\\components\\admin\\bookings\\modals\\admin-complete-booking-modal.tsx';
if (fs.existsSync(f)) {
  console.log('=== admin-complete-booking-modal.tsx ===');
  console.log(fs.readFileSync(f, 'utf8'));
}
