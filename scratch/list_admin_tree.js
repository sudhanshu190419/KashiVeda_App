// scratch/list_admin_tree.js
const fs = require('fs');
const path = require('path');

function listDir(dir, prefix = '') {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(e => {
    if (['node_modules', '.next', '.git'].includes(e.name)) return;
    const full = path.join(dir, e.name);
    console.log(`${prefix}${e.isDirectory() ? '[DIR] ' : '      '}${e.name}`);
    if (e.isDirectory()) {
      listDir(full, prefix + '  ');
    }
  });
}

console.log('=== ADMIN APP STRUCTURE ===');
listDir('C:\\Projects\\kashi-veda-admin');
