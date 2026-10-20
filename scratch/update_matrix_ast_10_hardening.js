const fs = require('fs');

const matrixPath = 'C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx';
let matrixContent = fs.readFileSync(matrixPath, 'utf8');

const oldRetryFn = `  // Retry failed Rashis (AST-10)
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

const newRetryFn = `  // Retry failed Rashis (AST-10)
  const handleRetryFailedRashis = async (candidateRashiIds: number[]) => {
    if (!isSynced) {
      setNotification({
        type: 'error',
        message: 'Cannot retry publishing: matrix is currently loading or desynchronized.',
      });
      return;
    }

    // Safety guard: Filter to strictly retryable failures (exclude conflicts, skips, and published rows)
    const retryableIds = (publishResult?.results
      ? candidateRashiIds.filter((id) => {
          const row = publishResult.results.find((r) => r.rashi_id === id);
          return row && row.outcome === 'failed' && row.error_code !== 'VERSION_CONFLICT';
        })
      : candidateRashiIds
    ).filter((id) => {
      // Also verify against current matrix: never retry rows that are already published
      const matrixRow = matrix.rows.find((r) => r.rashi_id === id);
      return !matrixRow || matrixRow.status !== 'published';
    });

    if (retryableIds.length === 0) {
      setNotification({
        type: 'warning',
        message: 'No retryable failed signs. Signs with version conflicts or already published cannot be automatically retried; reload matrix to review.',
      });
      return;
    }

    setIsPublishingSet(true);
    try {
      const res = await publishDailyRashiInsightsSet({
        date: matrix.date,
        language: matrix.language,
        publishReadyOnly: true,
        targetRashiIds: retryableIds,
      });

      // Composite result: merge with prior publishResult to preserve non-retried signs (published, conflicts, skips)
      let compositeResult = res;
      if (publishResult && publishResult.results.length > 0) {
        const mergedResults = [...publishResult.results];
        res.results.forEach((newRow) => {
          const idx = mergedResults.findIndex((r) => r.rashi_id === newRow.rashi_id);
          if (idx >= 0) {
            mergedResults[idx] = newRow;
          } else {
            mergedResults.push(newRow);
          }
        });

        const newPubCount = mergedResults.filter((r) => r.outcome === 'published').length;
        const newFailCount = mergedResults.filter((r) => r.outcome === 'failed' || r.outcome === 'conflict').length;
        const newSkipCount = mergedResults.filter((r) => r.outcome === 'skipped').length;
        const conflictCount = mergedResults.filter((r) => r.outcome === 'conflict').length;

        let compositeStatus: PublishSetOverallStatus;
        if (newFailCount === 0 && newSkipCount === 0 && newPubCount > 0) {
          compositeStatus = 'success';
        } else if (newPubCount > 0) {
          compositeStatus = 'partial_success';
        } else if (newFailCount > 0) {
          compositeStatus = 'failure';
        } else {
          compositeStatus = 'no_eligible_rows';
        }

        compositeResult = {
          ...res,
          status: compositeStatus,
          success: compositeStatus === 'success',
          requestedCount: mergedResults.length,
          publishedCount: newPubCount,
          failedCount: newFailCount,
          skippedCount: newSkipCount,
          results: mergedResults,
          message:
            compositeStatus === 'success'
              ? \`All \${newPubCount} signs published successfully.\`
              : compositeStatus === 'partial_success'
              ? \`Partially published: \${newPubCount} succeeded, \${newFailCount} failed\${conflictCount > 0 ? \` (\${conflictCount} conflict\${conflictCount > 1 ? 's' : ''})\` : ''}, \${newSkipCount} skipped.\`
              : res.message,
        };
      }

      setPublishResult(compositeResult);

      if (compositeResult.status === 'success') {
        setNotification({
          type: 'success',
          message: \`Retry succeeded! All \${compositeResult.publishedCount} signs published.\`,
        });
        handleFetchMatrix(matrix.date, matrix.language);
      } else if (compositeResult.status === 'partial_success') {
        setNotification({ type: 'warning', message: compositeResult.message });
        handleFetchMatrix(matrix.date, matrix.language);
      } else {
        setNotification({ type: 'error', message: compositeResult.message });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to retry failed signs.' });
    } finally {
      setIsPublishingSet(false);
    }
  };`;

if (matrixContent.includes(oldRetryFn)) {
  matrixContent = matrixContent.replace(oldRetryFn, newRetryFn);
  fs.writeFileSync(matrixPath, matrixContent, 'utf8');
  console.log('Successfully updated daily-insights-matrix-view.tsx');
} else {
  console.log('Could not find oldRetryFn in matrixContent');
}
