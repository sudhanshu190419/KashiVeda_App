const fs = require('fs');

function inspect() {
  const typesPath = 'C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts';
  const actionsPath = 'C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts';
  const modalPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/publish-daily-set-modal.tsx';
  const matrixPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx';

  console.log('=== TYPES (PublishSetResult & related) ===');
  const typesContent = fs.readFileSync(typesPath, 'utf8');
  const typeLines = typesContent.split('\n');
  console.log(typeLines.slice(80, 140).join('\n'));

  console.log('=== ACTIONS (publishDailyRashiInsightsSet) ===');
  const actionsContent = fs.readFileSync(actionsPath, 'utf8');
  const actionLines = actionsContent.split('\n');
  const pubStart = actionLines.findIndex(l => l.includes('async function publishDailyRashiInsightsSet'));
  console.log(actionLines.slice(pubStart, pubStart + 120).join('\n'));

  console.log('=== MODAL (publish-daily-set-modal.tsx) ===');
  const modalContent = fs.readFileSync(modalPath, 'utf8');
  console.log(modalContent.slice(0, 1200));

  console.log('=== MATRIX VIEW (handleRetry & publish) ===');
  const matrixContent = fs.readFileSync(matrixPath, 'utf8');
  const matrixLines = matrixContent.split('\n');
  const retryIdx = matrixLines.findIndex(l => l.includes('handleRetryFailedRashis'));
  console.log(matrixLines.slice(Math.max(0, retryIdx - 10), retryIdx + 40).join('\n'));
}

inspect();
