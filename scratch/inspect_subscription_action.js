const fs = require('fs');

const adminPath = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
const content = fs.readFileSync(adminPath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (index >= 500 && index <= 560) {
    console.log(`${index + 1}: ${line}`);
  }
});
