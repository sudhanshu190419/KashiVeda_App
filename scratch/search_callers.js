const fs = require('fs');
const path = require('path');

function searchCallers(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') searchCallers(full);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('getAstrologySubscriptionById')) {
        console.log('Found in:', full);
      }
    }
  }
}

searchCallers('C:/Projects/kashi-veda-admin');
