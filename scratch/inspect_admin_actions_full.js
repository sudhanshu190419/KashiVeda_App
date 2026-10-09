// scratch/inspect_admin_actions_full.js
const fs = require('fs');

const f = 'C:\\Projects\\kashi-veda-admin\\lib\\actions\\pandit-management.ts';
if (fs.existsSync(f)) {
  console.log('=== pandit-management.ts ===');
  console.log(fs.readFileSync(f, 'utf8').substring(0, 1500));
}
