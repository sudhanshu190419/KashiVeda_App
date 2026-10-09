// scratch/inspect_admin_login.js
const fs = require('fs');

const f1 = 'C:\\Projects\\kashi-veda-admin\\components\\admin-login-form.tsx';
if (fs.existsSync(f1)) {
  console.log('=== admin-login-form.tsx ===');
  console.log(fs.readFileSync(f1, 'utf8'));
}
