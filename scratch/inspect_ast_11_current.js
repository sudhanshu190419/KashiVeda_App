const fs = require('fs');

function inspect() {
  const modalPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx';
  const actionsPath = 'C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts';
  const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts';

  console.log('=== TYPES (Bulk Import) ===');
  const typesContent = fs.readFileSync(typesPath, 'utf8');
  const typeLines = typesContent.split('\n');
  const bulkIdx = typeLines.findIndex(l => l.includes('Bulk CSV Import Types'));
  console.log(typeLines.slice(bulkIdx, bulkIdx + 60).join('\n'));

  console.log('=== ACTIONS (bulkSaveDailyRashiInsightsDrafts) ===');
  const actionsContent = fs.readFileSync(actionsPath, 'utf8');
  const actionLines = actionsContent.split('\n');
  const actionIdx = actionLines.findIndex(l => l.includes('bulkSaveDailyRashiInsightsDrafts'));
  console.log(actionLines.slice(actionIdx, actionIdx + 120).join('\n'));

  console.log('=== MODAL (bulk-import-modal.tsx) ===');
  const modalContent = fs.readFileSync(modalPath, 'utf8');
  console.log(modalContent.slice(0, 1500));
}

inspect();
