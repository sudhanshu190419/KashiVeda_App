const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Update import to include PublishSetResult
const oldImport = `  PublishSetValidationResult,
  DailyRashiInsightFormData,`;

const newImport = `  PublishSetValidationResult,
  PublishSetResult,
  DailyRashiInsightFormData,`;

if (!content.includes(newImport) && content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
}

// 2. Add publishResult state
const stateMarker = `const [isPublishingSet, setIsPublishingSet] = useState(false);`;
const newState = `const [isPublishingSet, setIsPublishingSet] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishSetResult | null>(null);`;

if (!content.includes("const [publishResult, setPublishResult]") && content.includes(stateMarker)) {
  content = content.replace(stateMarker, newState);
}

// 3. Update handleOpenPublishModal to clear publishResult
const oldOpenPublish = `  const handleOpenPublishModal = async () => {
    if (!isSynced) return;
    setIsPublishModalOpen(true);
    setPublishValidation(null);
    setIsValidatingPublish(true);`;

const newOpenPublish = `  const handleOpenPublishModal = async () => {
    if (!isSynced) return;
    setIsPublishModalOpen(true);
    setPublishResult(null);
    setPublishValidation(null);
    setIsValidatingPublish(true);`;

if (!content.includes("setPublishResult(null);\n    setPublishValidation(null);") && content.includes(oldOpenPublish)) {
  content = content.replace(oldOpenPublish, newOpenPublish);
}

// 4. Update handleConfirmPublishSet and add handleRetryFailedRashis
const oldConfirmPublish = `  // Confirm Publish Daily Set
  const handleConfirmPublishSet = async (publishReadyOnly: boolean) => {
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot publish set: matrix is loading or desynchronized with selected date/language.',
      });
      return;
    }

    setIsPublishingSet(true);
    try {
      const res = await publishDailyRashiInsightsSet({
        date: matrix.date,
        language: matrix.language,
        publishReadyOnly,
      });

      if (res.success) {
        setNotification({ type: 'success', message: res.message || 'Daily Set successfully published!' });
        setIsPublishModalOpen(false);
        handleFetchMatrix(matrix.date, matrix.language);
      } else {
        setNotification({
          type: 'error',
          message: res.errors?.join(', ') || res.message || 'Failed to publish daily set.',
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error publishing daily set.' });
    } finally {
      setIsPublishingSet(false);
    }
  };`;

const newConfirmPublish = `  // Confirm Publish Daily Set (AST-10: Truthful outcome reporting and retry support)
  const handleConfirmPublishSet = async (publishReadyOnly: boolean) => {
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot publish set: matrix is loading or desynchronized with selected date/language.',
      });
      return;
    }

    setIsPublishingSet(true);
    try {
      const res = await publishDailyRashiInsightsSet({
        date: matrix.date,
        language: matrix.language,
        publishReadyOnly,
      });

      setPublishResult(res);

      if (res.status === 'success') {
        setNotification({ type: 'success', message: res.message });
        setIsPublishModalOpen(false);
        handleFetchMatrix(matrix.date, matrix.language);
      } else if (res.status === 'partial_success') {
        setNotification({ type: 'warning', message: res.message });
        handleFetchMatrix(matrix.date, matrix.language);
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Error publishing daily set.' });
    } finally {
      setIsPublishingSet(false);
    }
  };

  // Retry failed Rashis (AST-10)
  const handleRetryFailedRashis = async (failedRashiIds: number[]) => {
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot retry publishing: matrix is currently loading or desynchronized.',
      });
      return;
    }

    setIsPublishingSet(true);
    try {
      const res = await publishDailyRashiInsightsSet({
        date: matrix.date,
        language: matrix.language,
        publishReadyOnly: true,
        targetRashiIds: failedRashiIds,
      });

      setPublishResult(res);

      if (res.status === 'success') {
        setNotification({ type: 'success', message: \`Retry succeeded! All \${res.publishedCount} previously failed signs published.\` });
        handleFetchMatrix(matrix.date, matrix.language);
      } else if (res.status === 'partial_success') {
        setNotification({ type: 'warning', message: res.message });
        handleFetchMatrix(matrix.date, matrix.language);
      } else {
        setNotification({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to retry failed signs.' });
    } finally {
      setIsPublishingSet(false);
    }
  };`;

if (content.includes(oldConfirmPublish)) {
  content = content.replace(oldConfirmPublish, newConfirmPublish);
}

// 5. Update <PublishDailySetModal ... /> JSX
const oldModalJSX = `      {/* 4. Publish Daily Set Modal */}
      <PublishDailySetModal
        isOpen={isPublishModalOpen}
        date={matrix.date}
        language={matrix.language}
        validation={publishValidation}
        isValidating={isValidatingPublish}
        isPublishing={isPublishingSet}
        onClose={() => setIsPublishModalOpen(false)}
        onConfirmPublish={handleConfirmPublishSet}
        onEditRashi={(rashiId) => {
          setIsPublishModalOpen(false);
          const slot = matrix.slots.find((s) => s.rashi.id === rashiId);
          if (slot && isSynced) {
            handleOpenFieldEditor(slot.rashi, slot.insight, 'general_outlook');
          }
        }}
      />`;

const newModalJSX = `      {/* 4. Publish Daily Set Modal */}
      <PublishDailySetModal
        isOpen={isPublishModalOpen}
        date={matrix.date}
        language={matrix.language}
        validation={publishValidation}
        isValidating={isValidatingPublish}
        isPublishing={isPublishingSet}
        publishResult={publishResult}
        onClose={() => {
          setIsPublishModalOpen(false);
          setPublishResult(null);
          if (publishResult && publishResult.publishedCount > 0) {
            handleFetchMatrix(matrix.date, matrix.language);
          }
        }}
        onConfirmPublish={handleConfirmPublishSet}
        onRetryFailed={handleRetryFailedRashis}
        onResetResult={() => setPublishResult(null)}
        onEditRashi={(rashiId) => {
          setIsPublishModalOpen(false);
          setPublishResult(null);
          const slot = matrix.slots.find((s) => s.rashi.id === rashiId);
          if (slot && isSynced) {
            handleOpenFieldEditor(slot.rashi, slot.insight, 'general_outlook');
          }
        }}
      />`;

if (content.includes(oldModalJSX)) {
  content = content.replace(oldModalJSX, newModalJSX);
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log("Successfully updated daily-insights-matrix-view.tsx for AST-10.");
