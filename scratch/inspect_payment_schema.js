const fs = require('fs');
const path = require('path');

const migrationsDir = 'C:/Projects/KashiVeda/supabase/migrations';
const files = fs.readdirSync(migrationsDir).sort();

console.log('Searching migrations for payment_transactions and refunds...');

files.forEach(f => {
  const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
  if (content.includes('payment_transactions')) {
    console.log(`\n=== ${f} mentions payment_transactions ===`);
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (l.toLowerCase().includes('create table') || l.toLowerCase().includes('payment_transactions') || l.toLowerCase().includes('alter table')) {
        console.log(`  Line ${idx + 1}: ${l.trim()}`);
      }
    });
  }
  if (content.includes('CREATE TABLE IF NOT EXISTS refunds') || content.includes('CREATE TABLE refunds') || content.includes('create table if not exists public.refunds')) {
    console.log(`\n=== ${f} defines refunds ===`);
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (idx < 50 && (l.toLowerCase().includes('table') || l.toLowerCase().includes('refund'))) {
        console.log(`  Line ${idx + 1}: ${l.trim()}`);
      }
    });
  }
});
