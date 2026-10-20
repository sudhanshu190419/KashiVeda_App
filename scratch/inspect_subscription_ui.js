const fs = require('fs');

function searchFiles() {
  const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/astrology-management.ts';
  if (fs.existsSync(typesPath)) {
    console.log('--- lib/types/astrology-management.ts ---');
    console.log(fs.readFileSync(typesPath, 'utf8'));
  }

  const detailViewPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/subscriptions/astrology-subscription-detail-view.tsx';
  if (fs.existsSync(detailViewPath)) {
    console.log('--- astrology-subscription-detail-view.tsx exists! Length:', fs.readFileSync(detailViewPath, 'utf8').length);
  } else {
    console.log('Detail view path does not exist, searching for detail view in components/admin/astrology...');
    const walk = (dir) => {
      fs.readdirSync(dir).forEach(f => {
        const p = dir + '/' + f;
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (f.includes('detail') || f.includes('subscription')) console.log('Found:', p);
      });
    };
    walk('C:/Projects/kashi-veda-admin/components/admin/astrology');
    walk('C:/Projects/kashi-veda-admin/app/(dashboard)/astrology');
  }
}

searchFiles();
