const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
const content = fs.readFileSync(path, 'utf8');

const funcs = content.match(/export async function \w+/g) || [];
console.log('Exported functions in astrology-management.ts:');
funcs.forEach(f => console.log(' - ' + f.replace('export async function ', '')));
