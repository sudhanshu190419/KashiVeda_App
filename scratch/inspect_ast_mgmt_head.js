const fs = require('fs');

const content = fs.readFileSync('C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts', 'utf8');
const lines = content.split('\n');
lines.slice(0, 45).forEach((l, i) => console.log(`${i + 1}: ${l}`));
