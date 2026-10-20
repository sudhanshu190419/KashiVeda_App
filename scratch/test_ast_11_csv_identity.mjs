import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDailyInsightCompositeKey,
  CANONICAL_RASHIS,
} from '../../kashi-veda-admin/lib/types/daily-insights-management.ts';

/**
 * AST-11 Unit & Contract Test Suite
 * Covers:
 * - Scenario A: Same Rashi, different dates
 * - Scenario B: Same Rashi, different languages
 * - Scenario C: Exact duplicate identity within one CSV
 * - Scenario I: Exact per-row result identities and counts reconciliation
 */

// Simulated CSV parsing logic implementing the exact AST-11 bulk-import-modal parser
function parseAndValidateCSVRows(csvRows, selectedDate = '2026-10-15', selectedLanguage = 'en') {
  const parsedRows = [];
  const seenCompositeKeys = new Set();

  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const rowErrors = [];

    const rashiId = Number(row.rashi_id);
    const matchedCanonical = CANONICAL_RASHIS.find((r) => r.id === rashiId);
    const rashiName = matchedCanonical ? matchedCanonical.vedicName : `Rashi-${rashiId}`;

    if (!matchedCanonical) {
      rowErrors.push(`Unrecognized Rashi ID: ${rashiId}`);
    }

    const rowDate = (row.insight_date && row.insight_date.trim()) || selectedDate;
    const rowLang = ((row.language && row.language.trim()) || selectedLanguage).toLowerCase();
    const compositeKey = getDailyInsightCompositeKey(rowDate, rashiId, rowLang);

    // Composite identity duplicate check
    if (seenCompositeKeys.has(compositeKey) && rashiId > 0) {
      rowErrors.push(`Duplicate entry for ${rashiName} on ${rowDate} (${rowLang.toUpperCase()}) found in row ${i + 1}.`);
    } else if (rashiId > 0) {
      seenCompositeKeys.add(compositeKey);
    }

    parsedRows.push({
      rowIndex: i + 1,
      rashi_id: rashiId,
      rashi_name: rashiName,
      insight_date: rowDate,
      language: rowLang,
      general_outlook: row.general_outlook || '',
      compositeKey,
      isValid: rowErrors.length === 0,
      errors: rowErrors,
    });
  }

  return parsedRows;
}

// Simulated Server Action implementing bulkSaveDailyRashiInsightsDrafts
async function simulateBulkSaveDrafts(items, options, mockRpc) {
  const allowOverwrite = options?.allowOverwrite ?? true;
  const results = [];
  const errors = [];
  const seenKeysInBatch = new Set();

  for (const item of items) {
    const date = (item.insight_date || '').trim();
    const language = (item.language || 'en').trim().toLowerCase();
    const rashiId = Number(item.rashi_id);
    const compositeKey = getDailyInsightCompositeKey(date, rashiId, language);

    if (seenKeysInBatch.has(compositeKey)) {
      const errMsg = `Duplicate composite key in submission batch: ${compositeKey}`;
      errors.push(errMsg);
      results.push({
        insight_date: date,
        rashi_id: rashiId,
        language,
        outcome: 'duplicate',
        error: errMsg,
        error_code: 'DUPLICATE_IN_BATCH',
      });
      continue;
    }
    seenKeysInBatch.add(compositeKey);

    const rpcRes = await mockRpc({
      p_insight_date: date,
      p_rashi_id: rashiId,
      p_language: language,
      p_allow_overwrite: allowOverwrite,
      p_expected_version: item.expected_version ?? null,
    });

    if (rpcRes.error) {
      errors.push(rpcRes.error.message);
      results.push({
        insight_date: date,
        rashi_id: rashiId,
        language,
        outcome: 'failed',
        error: rpcRes.error.message,
        error_code: 'DB_TRANSPORT_ERROR',
      });
    } else if (!rpcRes.data.success) {
      if (rpcRes.data.skipped || rpcRes.data.error_code === 'OVERWRITE_DISALLOWED') {
        results.push({
          insight_date: date,
          rashi_id: rashiId,
          language,
          outcome: 'skipped',
          version: rpcRes.data.current_version ?? null,
          skip_reason: 'Record already exists and overwrite is disabled.',
          error_code: 'OVERWRITE_DISALLOWED',
        });
      } else if (rpcRes.data.error_code === 'VERSION_CONFLICT') {
        errors.push(rpcRes.data.error);
        results.push({
          insight_date: date,
          rashi_id: rashiId,
          language,
          outcome: 'conflict',
          version: rpcRes.data.current_version ?? null,
          error: rpcRes.data.error,
          error_code: 'VERSION_CONFLICT',
        });
      } else {
        errors.push(rpcRes.data.error);
        results.push({
          insight_date: date,
          rashi_id: rashiId,
          language,
          outcome: 'failed',
          error: rpcRes.data.error,
          error_code: rpcRes.data.error_code || 'RPC_ERROR',
        });
      }
    } else {
      const isInsert = rpcRes.data.action === 'daily_rashi_insight_created_by_admin';
      results.push({
        insight_date: date,
        rashi_id: rashiId,
        language,
        outcome: isInsert ? 'inserted' : 'updated',
        version: rpcRes.data.version,
      });
    }
  }

  const insertedCount = results.filter((r) => r.outcome === 'inserted').length;
  const updatedCount = results.filter((r) => r.outcome === 'updated').length;
  const skippedCount = results.filter((r) => r.outcome === 'skipped').length;
  const conflictedCount = results.filter((r) => r.outcome === 'conflict').length;
  const failedCount = results.filter((r) => r.outcome === 'failed' || r.outcome === 'duplicate').length;
  const savedCount = insertedCount + updatedCount;
  const totalSubmitted = results.length;
  const success = failedCount === 0 && conflictedCount === 0;

  return {
    success,
    totalSubmitted,
    insertedCount,
    updatedCount,
    skippedCount,
    conflictedCount,
    failedCount,
    savedCount,
    results,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// =============================================================================
// TEST A: Same Rashi, different dates
// =============================================================================
test('Scenario A: Same Rashi on different dates are distinct valid identities', () => {
  const csvRows = [
    { rashi_id: 1, insight_date: '2026-10-15', language: 'en', general_outlook: 'Day 1 Outlook' },
    { rashi_id: 1, insight_date: '2026-10-16', language: 'en', general_outlook: 'Day 2 Outlook' },
  ];

  const parsed = parseAndValidateCSVRows(csvRows);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].isValid, true, 'Row 1 (Oct 15) must be valid');
  assert.equal(parsed[1].isValid, true, 'Row 2 (Oct 16) must be valid and NOT flagged as duplicate');
  assert.notEqual(parsed[0].compositeKey, parsed[1].compositeKey);
  assert.equal(parsed[0].compositeKey, '2026-10-15:1:en');
  assert.equal(parsed[1].compositeKey, '2026-10-16:1:en');
});

// =============================================================================
// TEST B: Same Rashi, different languages
// =============================================================================
test('Scenario B: Same Rashi on same date with different languages are distinct valid identities', () => {
  const csvRows = [
    { rashi_id: 2, insight_date: '2026-10-15', language: 'en', general_outlook: 'English Outlook' },
    { rashi_id: 2, insight_date: '2026-10-15', language: 'hi', general_outlook: 'Hindi Outlook' },
  ];

  const parsed = parseAndValidateCSVRows(csvRows);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].isValid, true, 'Row 1 (English) must be valid');
  assert.equal(parsed[1].isValid, true, 'Row 2 (Hindi) must be valid and NOT flagged as duplicate');
  assert.notEqual(parsed[0].compositeKey, parsed[1].compositeKey);
  assert.equal(parsed[0].compositeKey, '2026-10-15:2:en');
  assert.equal(parsed[1].compositeKey, '2026-10-15:2:hi');
});

// =============================================================================
// TEST C: Exact duplicate identity within one CSV
// =============================================================================
test('Scenario C: Exact duplicate identity within one CSV is identified and flagged', () => {
  const csvRows = [
    { rashi_id: 3, insight_date: '2026-10-15', language: 'en', general_outlook: 'First Mithuna' },
    { rashi_id: 3, insight_date: '2026-10-15', language: 'en', general_outlook: 'Duplicate Mithuna' },
  ];

  const parsed = parseAndValidateCSVRows(csvRows);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].isValid, true, 'First row is valid');
  assert.equal(parsed[1].isValid, false, 'Second row must be flagged as duplicate');
  assert.ok(parsed[1].errors[0].includes('Duplicate entry for Mithuna on 2026-10-15 (EN)'));
});

// =============================================================================
// TEST I: Exact per-row result identities and counts reconciliation
// =============================================================================
test('Scenario I: Exact per-row result identities and counts reconciliation', async () => {
  const items = [
    { rashi_id: 1, insight_date: '2026-10-15', language: 'en', general_outlook: 'New Insert' },
    { rashi_id: 2, insight_date: '2026-10-15', language: 'en', general_outlook: 'Valid Update', expected_version: 1 },
    { rashi_id: 3, insight_date: '2026-10-15', language: 'en', general_outlook: 'Skipped Row' },
    { rashi_id: 4, insight_date: '2026-10-15', language: 'en', general_outlook: 'Conflicted Row', expected_version: 1 },
    { rashi_id: 5, insight_date: '2026-10-15', language: 'en', general_outlook: 'Failed Row' },
    { rashi_id: 1, insight_date: '2026-10-15', language: 'en', general_outlook: 'Duplicate in batch' },
  ];

  const mockRpc = async (payload) => {
    if (payload.p_rashi_id === 1) {
      return { data: { success: true, action: 'daily_rashi_insight_created_by_admin', version: 1 } };
    }
    if (payload.p_rashi_id === 2) {
      return { data: { success: true, action: 'daily_rashi_insight_updated_by_admin', version: 2 } };
    }
    if (payload.p_rashi_id === 3) {
      return { data: { success: false, skipped: true, error_code: 'OVERWRITE_DISALLOWED' } };
    }
    if (payload.p_rashi_id === 4) {
      return { data: { success: false, error_code: 'VERSION_CONFLICT', error: 'Stale version' } };
    }
    if (payload.p_rashi_id === 5) {
      return { data: { success: false, error_code: 'VALIDATION_ERROR', error: 'Database constraint failed' } };
    }
    return { data: { success: false, error: 'Unknown' } };
  };

  const res = await simulateBulkSaveDrafts(items, { allowOverwrite: false }, mockRpc);

  assert.equal(res.totalSubmitted, 6, 'totalSubmitted must equal 6');
  assert.equal(res.insertedCount, 1, 'insertedCount must equal 1');
  assert.equal(res.updatedCount, 1, 'updatedCount must equal 1');
  assert.equal(res.skippedCount, 1, 'skippedCount must equal 1');
  assert.equal(res.conflictedCount, 1, 'conflictedCount must equal 1');
  assert.equal(res.failedCount, 2, 'failedCount must equal 2 (1 DB error + 1 duplicate)');
  assert.equal(res.savedCount, 2, 'savedCount must equal 2 (inserted + updated)');
  assert.equal(res.success, false, 'success must be false due to conflict, error, and duplicate');

  // Verify mathematical reconciliation invariant:
  // totalSubmitted == inserted + updated + skipped + conflicted + failed
  assert.equal(
    res.totalSubmitted,
    res.insertedCount + res.updatedCount + res.skippedCount + res.conflictedCount + res.failedCount
  );

  // Verify per-row result identities
  assert.equal(res.results[0].outcome, 'inserted');
  assert.equal(res.results[0].rashi_id, 1);
  assert.equal(res.results[0].insight_date, '2026-10-15');
  assert.equal(res.results[0].language, 'en');

  assert.equal(res.results[1].outcome, 'updated');
  assert.equal(res.results[1].rashi_id, 2);

  assert.equal(res.results[2].outcome, 'skipped');
  assert.equal(res.results[2].rashi_id, 3);
  assert.equal(res.results[2].error_code, 'OVERWRITE_DISALLOWED');

  assert.equal(res.results[3].outcome, 'conflict');
  assert.equal(res.results[3].rashi_id, 4);
  assert.equal(res.results[3].error_code, 'VERSION_CONFLICT');

  assert.equal(res.results[4].outcome, 'failed');
  assert.equal(res.results[4].rashi_id, 5);

  assert.equal(res.results[5].outcome, 'duplicate');
  assert.equal(res.results[5].rashi_id, 1);
  assert.equal(res.results[5].error_code, 'DUPLICATE_IN_BATCH');
});
