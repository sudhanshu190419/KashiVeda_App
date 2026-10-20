const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

lines.forEach((l, i) => {
  if (l.includes('.insert(') || l.includes('.update(') || l.includes('.delete(') || l.includes('.rpc(')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
  }
});
