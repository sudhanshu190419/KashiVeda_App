// scratch/inspect_admin_supabase_config.js
const fs = require('fs');

const files = [
  'C:\\Projects\\kashi-veda-admin\\.env.local',
  'C:\\Projects\\kashi-veda-admin\\lib\\supabase\\server.ts',
  'C:\\Projects\\kashi-veda-admin\\lib\\supabase\\client.ts',
  'C:\\Projects\\kashi-veda-admin\\lib\\auth\\roles.ts'
];

files.forEach(f => {
  console.log(`\n=== FILE: ${f} ===`);
  if (fs.existsSync(f)) {
    console.log(fs.readFileSync(f, 'utf8'));
  } else {
    console.log('DOES NOT EXIST');
  }
});
