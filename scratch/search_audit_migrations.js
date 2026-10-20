const fs = require('fs');
const path = require('path');

const migrationsDir = 'C:/Projects/KashiVeda/supabase/migrations';
const files = fs.readdirSync(migrationsDir).sort();

files.forEach(f => {
  const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
  if (content.includes('admin_audit_logs')) {
    console.log(`\n=== ${f} mentions admin_audit_logs ===`);
    const lines = content.split('\n');
    lines.forEach((l, idx) => {
      if (
        l.toLowerCase().includes('create table') ||
        l.toLowerCase().includes('admin_audit_logs') ||
        l.toLowerCase().includes('policy') ||
        l.toLowerCase().includes('grant') ||
        l.toLowerCase().includes('alter table')
      ) {
        console.log(`  Line ${idx + 1}: ${l.trim()}`);
      }
    });
  }
});
