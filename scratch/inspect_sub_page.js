const fs = require('fs');

const pagePath = 'C:/Projects/kashi-veda-admin/app/(dashboard)/astrology/subscriptions/[id]/page.tsx';
if (fs.existsSync(pagePath)) {
  console.log(fs.readFileSync(pagePath, 'utf8'));
} else {
  console.log('File does not exist:', pagePath);
}
