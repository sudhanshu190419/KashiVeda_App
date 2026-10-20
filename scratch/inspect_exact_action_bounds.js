const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
const content = fs.readFileSync(path, 'utf8');

const planStart = content.indexOf('export async function saveAstrologyPlan(');
const planEnd = content.indexOf('export async function getAstrologySubscriptions(');

console.log('=== Plan function bounds ===', planStart, planEnd);
console.log(content.slice(planStart, planEnd));

const contentStart = content.indexOf('export async function saveAstrologyContent(');
const contentEnd = content.indexOf('export async function getAstrologyDeliveries(');

console.log('=== Content function bounds ===', contentStart, contentEnd);
console.log(content.slice(contentStart, contentEnd));
