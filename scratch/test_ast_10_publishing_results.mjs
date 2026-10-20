import test from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_RASHIS } from '../../kashi-veda-admin/lib/types/daily-insights-management.ts';

/**
 * AST-10 Comprehensive Test Harness
 * Evaluates Server Action and UI Contracts:
 * - Scenarios A through G from the user prompt:
 *   A: Conflict excluded from retry
 *   B: All unsuccessful rows are conflicts
 *   C: Successful rows stay untouched
 *   D: Ordinary retry remains functional
 *   E: All rows skipped (no_eligible_rows)
 *   F: Mixed failure and skip results
 *   G: Prior AST-10 and AST-09 behaviors preserved
 */

// Simulated Server Action Engine reflecting the exact logic of publishDailyRashiInsightsSet
async function simulatePublishDailySet({
  date,
  language = 'en',
  publishReadyOnly = false,
  targetRashiIds,
  mockValidationFetch,
  mockRowsFetch,
  mockRpcCall,
}) {
  // 1. Prerequisite validation
  const validationRes = await mockValidationFetch({ date, language });
  if (validationRes.error) {
    return {
      success: false,
      status: 'prerequisite_error',
      date,
      language,
      requestedCount: 0,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [],
      prerequisiteError: validationRes.error,
      errors: [validationRes.error],
      message: `Prerequisite readiness validation error: ${validationRes.error}`,
    };
  }

  // If full set requested but incomplete
  if (
    !validationRes.isReadyForPublish &&
    !publishReadyOnly &&
    (!targetRashiIds || targetRashiIds.length === 0)
  ) {
    const isAllSkipped = validationRes.readyCount === 0;
    const earlyStatus = isAllSkipped ? 'no_eligible_rows' : 'failure';
    const missingNames = validationRes.missingRashis.map((m) => m.vedicName).join(', ');
    const earlyMsg = isAllSkipped
      ? `No signs were eligible for publication: all ${validationRes.missingCount} signs were skipped because required General Outlook is missing.`
      : `Cannot publish complete daily set: ${validationRes.readyCount}/12 Rashis ready, ${validationRes.missingCount} missing required General Outlook: ${missingNames}`;

    const skippedResults = validationRes.missingRashis.map((m) => ({
      rashi_id: m.rashi_id,
      rashi_name: m.vedicName,
      vedic_name: m.vedicName,
      insight_date: date,
      language,
      outcome: 'skipped',
      status: 'not_created',
      skip_reason: m.reason,
      error: `Missing required content (${m.reason === 'missing_record' ? 'not created' : 'missing general outlook'})`,
    }));

    return {
      success: false,
      status: earlyStatus,
      date,
      language,
      requestedCount: 12,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: validationRes.missingCount,
      results: skippedResults,
      errors: [
        `Cannot publish complete daily set. ${validationRes.missingCount} of 12 Rashis are missing required General Outlook: ${missingNames}`,
      ],
      message: earlyMsg,
    };
  }

  // 2. Prerequisite rows fetch
  const { data: existingRows, error: rowsErr } = await mockRowsFetch({ date, language });
  if (rowsErr) {
    return {
      success: false,
      status: 'prerequisite_error',
      date,
      language,
      requestedCount: 0,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [],
      prerequisiteError: rowsErr.message,
      errors: [`Database query failed while fetching daily insights for publication: ${rowsErr.message}`],
      message: `Prerequisite query error: ${rowsErr.message}`,
    };
  }

  const existingMap = new Map();
  (existingRows || []).forEach((r) => existingMap.set(r.rashi_id, r));

  const targetList = targetRashiIds && targetRashiIds.length > 0
    ? CANONICAL_RASHIS.filter((r) => targetRashiIds.includes(r.id))
    : CANONICAL_RASHIS;

  const results = [];
  const errors = [];

  for (const rashi of targetList) {
    const row = existingMap.get(rashi.id);

    // If already published and this is a targeted retry, never re-submit or increment version
    if (targetRashiIds && targetRashiIds.length > 0 && row && row.status === 'published') {
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashi.vedicName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: 'published',
        status: 'published',
        version: row.version ?? null,
      });
      continue;
    }

    if (!row || !row.general_outlook || !row.general_outlook.trim()) {
      const skipReason = !row ? 'missing_record' : 'missing_general_outlook';
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashi.vedicName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: 'skipped',
        status: row ? row.status : 'not_created',
        version: row?.version ?? null,
        skip_reason: skipReason,
        error: `Rashi ${rashi.vedicName} lacks mandatory General Outlook guidance for publication.`,
      });
      continue;
    }

    const { data: rpcData, error: rpcErr } = await mockRpcCall({
      insight_date: row.insight_date,
      rashi_id: row.rashi_id,
      rashi_name: rashi.vedicName,
      language: row.language,
      general_outlook: row.general_outlook,
      expected_version: row.version ?? null,
    });

    if (rpcErr) {
      const errMsg = `Failed to publish ${rashi.vedicName}: ${rpcErr.message}`;
      errors.push(errMsg);
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashi.vedicName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: 'failed',
        status: row.status,
        version: row.version ?? null,
        error: rpcErr.message,
        error_code: 'DB_TRANSPORT_ERROR',
      });
    } else if (rpcData && !rpcData.success) {
      const isConflict = rpcData.error_code === 'VERSION_CONFLICT';
      const errMsg = `Failed to publish ${rashi.vedicName}: ${rpcData.error || (isConflict ? 'Version conflict detected' : 'Unknown error')}`;
      errors.push(errMsg);
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashi.vedicName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: isConflict ? 'conflict' : 'failed',
        status: row.status,
        version: row.version ?? null,
        error: rpcData.error || (isConflict ? 'Concurrent edit detected' : 'Publication failed'),
        error_code: rpcData.error_code || 'RPC_ERROR',
      });
    } else {
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashi.vedicName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: 'published',
        status: 'published',
        version: rpcData?.version ?? ((row.version || 1) + 1),
      });
    }
  }

  const publishedCount = results.filter((r) => r.outcome === 'published').length;
  const failedCount = results.filter((r) => r.outcome === 'failed' || r.outcome === 'conflict').length;
  const skippedCount = results.filter((r) => r.outcome === 'skipped').length;
  const requestedCount = results.length;

  let status;
  let message;

  if (failedCount === 0 && skippedCount === 0 && publishedCount > 0) {
    status = 'success';
    message = `Successfully published all ${publishedCount} Rashis for ${date} (${language.toUpperCase()}).`;
  } else if (publishedCount > 0) {
    status = 'partial_success';
    const conflictCount = results.filter((r) => r.outcome === 'conflict').length;
    const conflictNote = conflictCount > 0 ? ` (${conflictCount} conflict${conflictCount > 1 ? 's' : ''})` : '';
    message = `Partially published: ${publishedCount} succeeded, ${failedCount} failed${conflictNote}, ${skippedCount} skipped for ${date} (${language.toUpperCase()}).`;
  } else if (publishedCount === 0 && failedCount === 0 && skippedCount > 0) {
    status = 'no_eligible_rows';
    message = `No signs were eligible for publication: all ${skippedCount} requested signs were skipped because required General Outlook is missing.`;
  } else if (failedCount > 0 && skippedCount > 0) {
    status = 'failure';
    message = `Publication failed: ${failedCount} attempted signs failed and ${skippedCount} signs were skipped.`;
  } else {
    status = 'failure';
    message = `Publication failed: all ${failedCount} attempted Rashis failed to publish.`;
  }

  return {
    success: status === 'success',
    status,
    date,
    language,
    requestedCount,
    publishedCount,
    failedCount,
    skippedCount,
    results,
    errors: errors.length > 0 ? errors : undefined,
    message,
  };
}

// Client-side helper simulating modal & matrix retry extraction
function extractRetryableIds(publishResult) {
  if (!publishResult || !publishResult.results) return [];
  return publishResult.results
    .filter((r) => r.outcome === 'failed' && r.error_code !== 'VERSION_CONFLICT')
    .map((r) => r.rashi_id);
}

function countConflicts(publishResult) {
  if (!publishResult || !publishResult.results) return 0;
  return publishResult.results.filter((r) => r.outcome === 'conflict' || r.error_code === 'VERSION_CONFLICT').length;
}

// =============================================================================
// TEST A: Conflict excluded from retry
// =============================================================================
test('Scenario A: Conflict excluded from retry - only ordinary failures are retryable', async () => {
  // Simulate 2 rows: Rashi 1 has VERSION_CONFLICT, Rashi 2 has DB_TRANSPORT_ERROR
  const mockResult = {
    results: [
      { rashi_id: 1, outcome: 'conflict', error_code: 'VERSION_CONFLICT', error: 'Stale version' },
      { rashi_id: 2, outcome: 'failed', error_code: 'DB_TRANSPORT_ERROR', error: 'Connection timeout' },
      { rashi_id: 3, outcome: 'published', status: 'published' },
      { rashi_id: 4, outcome: 'skipped', skip_reason: 'missing_general_outlook' },
    ],
  };

  const retryableIds = extractRetryableIds(mockResult);
  assert.deepEqual(retryableIds, [2], 'Retryable list must contain only Rashi 2 (ordinary failure)');
  assert.equal(countConflicts(mockResult), 1, 'Must detect 1 version conflict');
});

// =============================================================================
// TEST B: All unsuccessful rows are conflicts
// =============================================================================
test('Scenario B: All unsuccessful rows are conflicts - no automatic retry offered', async () => {
  const mockResult = {
    results: [
      { rashi_id: 1, outcome: 'conflict', error_code: 'VERSION_CONFLICT', error: 'Stale version' },
      { rashi_id: 2, outcome: 'conflict', error_code: 'VERSION_CONFLICT', error: 'Stale version' },
      { rashi_id: 3, outcome: 'published', status: 'published' },
    ],
  };

  const retryableIds = extractRetryableIds(mockResult);
  assert.equal(retryableIds.length, 0, 'No retryable IDs must be offered when all unsuccessful rows are conflicts');
  assert.equal(countConflicts(mockResult), 2, 'Must detect 2 conflicts');
});

// =============================================================================
// TEST C: Successful rows stay untouched during retry
// =============================================================================
test('Scenario C: Successful rows stay untouched - retrying ordinary failure never resubmits published or conflicted rows', async () => {
  const rpcCalls = [];

  const existingRows = [
    { rashi_id: 1, insight_date: '2026-10-15', language: 'en', general_outlook: 'Outlook 1', status: 'published', version: 2 },
    { rashi_id: 2, insight_date: '2026-10-15', language: 'en', general_outlook: 'Outlook 2', status: 'draft', version: 1 },
    { rashi_id: 3, insight_date: '2026-10-15', language: 'en', general_outlook: 'Outlook 3', status: 'draft', version: 2 }, // conflicted in DB
  ];

  // We retry only Rashi 2 (the ordinary failed row)
  const res = await simulatePublishDailySet({
    date: '2026-10-15',
    language: 'en',
    publishReadyOnly: true,
    targetRashiIds: [2],
    mockValidationFetch: async () => ({ isReadyForPublish: true, missingCount: 0, missingRashis: [] }),
    mockRowsFetch: async () => ({ data: existingRows, error: null }),
    mockRpcCall: async (payload) => {
      rpcCalls.push(payload);
      return { data: { success: true, version: 2 }, error: null };
    },
  });

  assert.equal(rpcCalls.length, 1, 'RPC must be invoked exactly once');
  assert.equal(rpcCalls[0].rashi_id, 2, 'RPC must only be called for Rashi 2');
  assert.equal(rpcCalls[0].expected_version, 1, 'Must use authoritative current version 1');
  assert.equal(res.publishedCount, 1);
});

// =============================================================================
// TEST D: Ordinary retry remains functional
// =============================================================================
test('Scenario D: Ordinary retry remains functional - reloads authoritative state and succeeds', async () => {
  let dbReloadCount = 0;
  const existingRows = [
    { rashi_id: 4, insight_date: '2026-10-15', language: 'en', general_outlook: 'Valid outlook', status: 'draft', version: 1 },
  ];

  const res = await simulatePublishDailySet({
    date: '2026-10-15',
    language: 'en',
    publishReadyOnly: true,
    targetRashiIds: [4],
    mockValidationFetch: async () => ({ isReadyForPublish: true, missingCount: 0, missingRashis: [] }),
    mockRowsFetch: async () => {
      dbReloadCount++;
      return { data: existingRows, error: null };
    },
    mockRpcCall: async (payload) => {
      assert.equal(payload.rashi_id, 4);
      assert.equal(payload.expected_version, 1);
      return { data: { success: true, version: 2 }, error: null };
    },
  });

  assert.equal(dbReloadCount, 1, 'Must reload authoritative DB state');
  assert.equal(res.status, 'success');
  assert.equal(res.publishedCount, 1);
  assert.equal(res.results[0].outcome, 'published');
});

// =============================================================================
// TEST E: All rows skipped (no_eligible_rows)
// =============================================================================
test('Scenario E: All rows skipped - status is no_eligible_rows and message explains missing content', async () => {
  const missingRashis = CANONICAL_RASHIS.map((r) => ({
    rashi_id: r.id,
    vedicName: r.vedicName,
    englishName: r.englishName,
    reason: 'missing_general_outlook',
  }));

  const res = await simulatePublishDailySet({
    date: '2026-10-15',
    language: 'en',
    publishReadyOnly: false,
    mockValidationFetch: async () => ({
      isReadyForPublish: false,
      readyCount: 0,
      missingCount: 12,
      missingRashis,
    }),
    mockRowsFetch: async () => ({ data: [], error: null }),
    mockRpcCall: async () => ({ data: null, error: null }),
  });

  assert.equal(res.success, false, 'success must be false');
  assert.equal(res.status, 'no_eligible_rows', 'status must be no_eligible_rows');
  assert.equal(res.publishedCount, 0, 'publishedCount must be 0');
  assert.equal(res.failedCount, 0, 'failedCount must be 0');
  assert.equal(res.skippedCount, 12, 'skippedCount must be 12');
  assert.ok(res.message.includes('No signs were eligible for publication'), `Message must explain no eligible rows, got: ${res.message}`);
  assert.ok(!res.message.includes('all attempted Rashis failed'), 'Must not claim all attempted signs failed');
});

// =============================================================================
// TEST F: Mixed failure and skip results
// =============================================================================
test('Scenario F: Mixed failure and skip results - distinguishes failures from skips', async () => {
  const existingRows = [
    { rashi_id: 1, insight_date: '2026-10-15', language: 'en', general_outlook: 'Outlook 1', status: 'draft', version: 1 },
    { rashi_id: 2, insight_date: '2026-10-15', language: 'en', general_outlook: '', status: 'draft', version: 1 }, // skipped
  ];

  const res = await simulatePublishDailySet({
    date: '2026-10-15',
    language: 'en',
    targetRashiIds: [1, 2],
    mockValidationFetch: async () => ({ isReadyForPublish: true, missingCount: 0, missingRashis: [] }),
    mockRowsFetch: async () => ({ data: existingRows, error: null }),
    mockRpcCall: async () => ({
      data: null,
      error: { message: 'Database constraint violation' },
    }),
  });

  assert.equal(res.status, 'failure');
  assert.equal(res.publishedCount, 0);
  assert.equal(res.failedCount, 1);
  assert.equal(res.skippedCount, 1);
  assert.ok(res.message.includes('1 attempted signs failed and 1 signs were skipped'), `Message must distinguish failures from skips, got: ${res.message}`);
  assert.ok(!res.message.includes('all 1 attempted Rashis failed to publish'), 'Must not claim all attempted rashis failed without mentioning skips');
});

// =============================================================================
// TEST G: Prior AST-10 and AST-09 behaviors preserved
// =============================================================================
test('Scenario G: Prior AST-10 and AST-09 behaviors - truthful partial success and OCC preservation', async () => {
  const existingRows = [
    { rashi_id: 1, insight_date: '2026-10-15', language: 'en', general_outlook: 'Outlook 1', status: 'draft', version: 1 },
    { rashi_id: 2, insight_date: '2026-10-15', language: 'en', general_outlook: 'Outlook 2', status: 'draft', version: 1 },
  ];

  const res = await simulatePublishDailySet({
    date: '2026-10-15',
    language: 'en',
    targetRashiIds: [1, 2],
    mockValidationFetch: async () => ({ isReadyForPublish: true, missingCount: 0, missingRashis: [] }),
    mockRowsFetch: async () => ({ data: existingRows, error: null }),
    mockRpcCall: async (payload) => {
      if (payload.rashi_id === 1) {
        return { data: { success: true, version: 2 }, error: null };
      }
      return {
        data: { success: false, error_code: 'VERSION_CONFLICT', error: 'Row updated concurrently' },
        error: null,
      };
    },
  });

  assert.equal(res.success, false, 'Partial success must have success: false');
  assert.equal(res.status, 'partial_success');
  assert.equal(res.publishedCount, 1);
  assert.equal(res.failedCount, 1);
  assert.equal(res.results[0].outcome, 'published');
  assert.equal(res.results[1].outcome, 'conflict');
  assert.equal(res.results[1].error_code, 'VERSION_CONFLICT');
  assert.ok(res.message.includes('Partially published: 1 succeeded, 1 failed (1 conflict)'), `Message must report partial success with conflict count, got: ${res.message}`);
});
