const fs = require('fs');

const actionPath = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
const content = fs.readFileSync(actionPath, 'utf8');

const startIdx = content.indexOf('export async function getAstrologySubscriptionById');
const endIdx = content.indexOf('export async function cancelAstrologySubscription');

console.log('Found function bounds:', startIdx, endIdx);
console.log('Function text:');
console.log(content.slice(startIdx, endIdx));
