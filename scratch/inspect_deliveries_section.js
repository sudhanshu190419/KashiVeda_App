const fs = require('fs');

const detailPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-subscription-detail-view.tsx';
const lines = fs.readFileSync(detailPath, 'utf8').split('\n');

lines.forEach((l, i) => {
  if (i >= 340 && i <= 430) {
    console.log(`${i + 1}: ${l}`);
  }
});
