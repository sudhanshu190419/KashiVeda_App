const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

console.log('=== Plan Mutation Functions (Lines 180 to 290) ===');
lines.slice(180, 290).forEach((l, i) => {
  console.log(`${i + 181}: ${l}`);
});

console.log('\n=== Legacy Content Mutation Functions (Lines 680 to 800) ===');
lines.slice(680, 800).forEach((l, i) => {
  console.log(`${i + 681}: ${l}`);
});
