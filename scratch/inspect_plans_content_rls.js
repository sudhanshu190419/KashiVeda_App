const fs = require('fs');

const content = fs.readFileSync('C:/Projects/KashiVeda/supabase/migrations/012_rls_and_permissions.sql', 'utf8');
const lines = content.split('\n');

lines.forEach((l, i) => {
  if (l.includes('astrology_subscription_plans') || l.includes('astrology_content')) {
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 8); j++) {
      console.log(`${j + 1}: ${lines[j]}`);
    }
  }
});
