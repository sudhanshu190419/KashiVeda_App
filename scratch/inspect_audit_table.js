const fs = require('fs');

function inspectTableDef() {
  const migDir = 'C:/Projects/KashiVeda/supabase/migrations';
  fs.readdirSync(migDir).forEach(f => {
    const content = fs.readFileSync(migDir + '/' + f, 'utf8');
    if (content.includes('CREATE TABLE IF NOT EXISTS public.admin_audit_logs') || content.includes('CREATE TABLE public.admin_audit_logs')) {
      console.log(`=== Table Definition in ${f} ===`);
      const lines = content.split('\n');
      lines.forEach((l, i) => {
        if (i < 80 && (l.includes('admin_audit_logs') || l.includes('actor') || l.includes('action') || l.includes('entity') || l.includes('details'))) {
          console.log(`  ${i + 1}: ${l}`);
        }
      });
    }
    if (f === '012_rls_and_permissions.sql') {
      console.log(`=== Audit Policies in ${f} ===`);
      const lines = content.split('\n');
      lines.forEach((l, i) => {
        if (l.includes('admin_audit_logs')) {
          for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 15); j++) {
            console.log(`  ${j + 1}: ${lines[j]}`);
          }
        }
      });
    }
  });
}

inspectTableDef();
