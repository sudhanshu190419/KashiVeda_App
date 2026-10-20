const fs = require('fs');

const planModal = 'C:/Projects/kashi-veda-admin/components/admin/astrology/modals/plan-form-modal.tsx';
const contentModal = 'C:/Projects/kashi-veda-admin/components/admin/astrology/modals/content-form-modal.tsx';

console.log('=== plan-form-modal.tsx ===');
fs.readFileSync(planModal, 'utf8').split('\n').slice(70, 115).forEach((l, i) => console.log(`${i + 71}: ${l}`));

console.log('=== content-form-modal.tsx ===');
fs.readFileSync(contentModal, 'utf8').split('\n').slice(105, 145).forEach((l, i) => console.log(`${i + 106}: ${l}`));
