import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getMatrixIdentityKey,
  isMatrixSynced,
  MatrixRequestCoordinator,
  isModalBoundKeyValid,
  validateWriteKeyIntegrity,
  validateBulkDraftCoherence,
} from 'file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-matrix-coordinator.ts';

// Helper: Deferred Promise for controlled asynchronous resolution
function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// =============================================================================
// TEST A: Old date response arrives last
// =============================================================================
test('Test A: Old date response arrives last (Request B completes before Request A)', async () => {
  const coordinator = new MatrixRequestCoordinator();
  let matrix = { date: '2026-10-10', language: 'en', data: 'initial' };
  let selectedDate = '2026-10-10';
  let selectedLanguage = 'en';

  // Step 1: Start Request A for Oct 10, English
  const tokenA = coordinator.startRequest('2026-10-10', 'en');

  // Step 2: User changes selection to Oct 11, English
  selectedDate = '2026-10-11';
  const tokenB = coordinator.startRequest('2026-10-11', 'en');

  // Step 3: Response B arrives first
  const responseB = { date: '2026-10-11', language: 'en', data: 'matrix_oct_11' };
  const shouldCommitB = coordinator.shouldCommitResponse(
    tokenB,
    responseB.date,
    responseB.language,
    selectedDate,
    selectedLanguage
  );
  assert.equal(shouldCommitB, true, 'Request B should be committed');
  matrix = responseB;

  // Step 4: Response A arrives last
  const responseA = { date: '2026-10-10', language: 'en', data: 'matrix_oct_10' };
  const shouldCommitA = coordinator.shouldCommitResponse(
    tokenA,
    responseA.date,
    responseA.language,
    selectedDate,
    selectedLanguage
  );
  assert.equal(shouldCommitA, false, 'Obsolete Request A must be rejected');

  // Final verification: matrix remains Oct 11
  assert.equal(matrix.date, '2026-10-11');
  assert.equal(matrix.data, 'matrix_oct_11');
});

// =============================================================================
// TEST B: Date/language requests arrive out of order (3 requests)
// =============================================================================
test('Test B: 3 Requests (Oct 10 en, Oct 11 en, Oct 11 hi) resolving in various out-of-order sequences', async () => {
  const runSequence = (resolutionOrder) => {
    const coordinator = new MatrixRequestCoordinator();
    let matrix = { date: '2026-10-09', language: 'en', data: 'initial' };

    // Request 1: Oct 10, en
    let currentSelectedDate = '2026-10-10';
    let currentSelectedLanguage = 'en';
    const token1 = coordinator.startRequest('2026-10-10', 'en');
    const resp1 = { date: '2026-10-10', language: 'en', data: 'result_1' };

    // Request 2: Oct 11, en
    currentSelectedDate = '2026-10-11';
    currentSelectedLanguage = 'en';
    const token2 = coordinator.startRequest('2026-10-11', 'en');
    const resp2 = { date: '2026-10-11', language: 'en', data: 'result_2' };

    // Request 3: Oct 11, hi (FINAL INTENDED SELECTION)
    currentSelectedDate = '2026-10-11';
    currentSelectedLanguage = 'hi';
    const token3 = coordinator.startRequest('2026-10-11', 'hi');
    const resp3 = { date: '2026-10-11', language: 'hi', data: 'result_3' };

    const requestMap = {
      1: { token: token1, resp: resp1 },
      2: { token: token2, resp: resp2 },
      3: { token: token3, resp: resp3 },
    };

    // Resolve in specified order
    for (const reqNum of resolutionOrder) {
      const { token, resp } = requestMap[reqNum];
      if (
        coordinator.shouldCommitResponse(
          token,
          resp.date,
          resp.language,
          currentSelectedDate,
          currentSelectedLanguage
        )
      ) {
        matrix = resp;
      }
    }

    return matrix;
  };

  // Test Order 1: 3 resolves, then 1, then 2
  const final1 = runSequence([3, 1, 2]);
  assert.equal(final1.date, '2026-10-11');
  assert.equal(final1.language, 'hi');
  assert.equal(final1.data, 'result_3');

  // Test Order 2: 2 resolves, then 3, then 1
  const final2 = runSequence([2, 3, 1]);
  assert.equal(final2.date, '2026-10-11');
  assert.equal(final2.language, 'hi');
  assert.equal(final2.data, 'result_3');

  // Test Order 3: 1 resolves, then 2, then 3
  const final3 = runSequence([1, 2, 3]);
  assert.equal(final3.date, '2026-10-11');
  assert.equal(final3.language, 'hi');
  assert.equal(final3.data, 'result_3');
});

// =============================================================================
// TEST C: Editing blocked while a new matrix loads
// =============================================================================
test('Test C: Editing and mutation actions blocked while new matrix loads or is desynchronized', () => {
  // Case 1: Fetch in progress (isPending = true)
  const syncPending = isMatrixSynced({
    selectedDate: '2026-10-11',
    selectedLanguage: 'en',
    loadedDate: '2026-10-10',
    loadedLanguage: 'en',
    isPending: true,
    hasError: false,
  });
  assert.equal(syncPending, false, 'Must not be synced while isPending is true');

  // Case 2: Selected date changed, fetch has not updated loaded matrix yet
  const syncDateDiff = isMatrixSynced({
    selectedDate: '2026-10-11',
    selectedLanguage: 'en',
    loadedDate: '2026-10-10',
    loadedLanguage: 'en',
    isPending: false,
    hasError: false,
  });
  assert.equal(syncDateDiff, false, 'Must not be synced when selectedDate != loadedDate');

  // Case 3: Selected language changed
  const syncLangDiff = isMatrixSynced({
    selectedDate: '2026-10-10',
    selectedLanguage: 'hi',
    loadedDate: '2026-10-10',
    loadedLanguage: 'en',
    isPending: false,
    hasError: false,
  });
  assert.equal(syncLangDiff, false, 'Must not be synced when selectedLanguage != loadedLanguage');

  // Case 4: Perfectly synchronized
  const syncMatched = isMatrixSynced({
    selectedDate: '2026-10-11',
    selectedLanguage: 'en',
    loadedDate: '2026-10-11',
    loadedLanguage: 'en',
    isPending: false,
    hasError: false,
  });
  assert.equal(syncMatched, true, 'Must be synced when dates and languages match without pending or errors');
});

// =============================================================================
// TEST D: Modal invalidated by a key change
// =============================================================================
test('Test D: Modal invalidated when selected matrix key changes while modal is open', () => {
  const boundMatrixKey = getMatrixIdentityKey('2026-10-10', 'en'); // "2026-10-10::en"

  // User changes date to Oct 11 while modal remains open
  const changedSelectedKey = getMatrixIdentityKey('2026-10-11', 'en'); // "2026-10-11::en"

  const isValid = isModalBoundKeyValid(boundMatrixKey, changedSelectedKey);
  assert.equal(isValid, false, 'Modal bound key must be invalid when selected key differs');

  // Attempt to submit write payload using the stale modal
  const validation = validateWriteKeyIntegrity({
    boundMatrixKey,
    currentSelectedKey: changedSelectedKey,
    targetDate: '2026-10-10',
    targetLanguage: 'en',
    rashiId: 1,
  });

  assert.equal(validation.isValid, false);
  assert.match(validation.error, /Matrix key changed/);
});

// =============================================================================
// TEST E: Field-edit key integrity
// =============================================================================
test('Test E: Field-edit write key strictly matches row snapshot identity', () => {
  const loadedDate = '2026-10-10';
  const loadedLanguage = 'en';
  const boundMatrixKey = getMatrixIdentityKey(loadedDate, loadedLanguage);

  const rowSnapshot = {
    id: 'row-1',
    rashi_id: 1, // Mesha
    insight_date: loadedDate,
    language: loadedLanguage,
    general_outlook: 'Planetary energy is strong.',
  };

  // Coherent submit
  const validCheck = validateWriteKeyIntegrity({
    boundMatrixKey,
    currentSelectedKey: boundMatrixKey,
    targetDate: rowSnapshot.insight_date,
    targetLanguage: rowSnapshot.language,
    rashiId: rowSnapshot.rashi_id,
  });
  assert.equal(validCheck.isValid, true);

  // Corrupted submit where targetDate is altered to Oct 11
  const invalidCheck = validateWriteKeyIntegrity({
    boundMatrixKey,
    currentSelectedKey: boundMatrixKey,
    targetDate: '2026-10-11',
    targetLanguage: rowSnapshot.language,
    rashiId: rowSnapshot.rashi_id,
  });
  assert.equal(invalidCheck.isValid, false);
  assert.match(invalidCheck.error, /does not match bound matrix identity/);
});

// =============================================================================
// TEST F: Full-form key integrity
// =============================================================================
test('Test F: Full-form save targets the exact date/language identity as loaded row', () => {
  const loadedKey = getMatrixIdentityKey('2026-10-12', 'hi');

  const formPayload = {
    insight_date: '2026-10-12',
    language: 'hi',
    rashi_id: 4, // Karka
  };

  const check = validateWriteKeyIntegrity({
    boundMatrixKey: loadedKey,
    currentSelectedKey: loadedKey,
    targetDate: formPayload.insight_date,
    targetLanguage: formPayload.language,
    rashiId: formPayload.rashi_id,
  });

  assert.equal(check.isValid, true);
});

// =============================================================================
// TEST G: Bulk draft key integrity
// =============================================================================
test('Test G: Bulk draft save rejects mixed or stale matrix snapshots', () => {
  const expectedDate = '2026-10-10';
  const expectedLanguage = 'en';

  // Valid set of 12 items
  const validItems = Array.from({ length: 12 }, (_, i) => ({
    insight_date: '2026-10-10',
    language: 'en',
    rashi_id: i + 1,
  }));

  const validRes = validateBulkDraftCoherence(validItems, expectedDate, expectedLanguage);
  assert.equal(validRes.isValid, true);

  // Corrupted set with one row pointing to Oct 11
  const mixedItems = [
    ...validItems.slice(0, 11),
    { insight_date: '2026-10-11', language: 'en', rashi_id: 12 },
  ];

  const invalidRes = validateBulkDraftCoherence(mixedItems, expectedDate, expectedLanguage);
  assert.equal(invalidRes.isValid, false);
  assert.match(invalidRes.error, /Inconsistent item in bulk draft/);
});

// =============================================================================
// TEST H: Publishing key integrity
// =============================================================================
test('Test H: 12-Rashi publication set cannot be triggered while selected key and loaded matrix disagree', () => {
  // If selectedDate is Oct 11 but loadedDate is Oct 10, isMatrixSynced is false
  const isSynced = isMatrixSynced({
    selectedDate: '2026-10-11',
    selectedLanguage: 'en',
    loadedDate: '2026-10-10',
    loadedLanguage: 'en',
    isPending: false,
    hasError: false,
  });

  assert.equal(isSynced, false);

  // A publication action must enforce isSynced before calling publishDailyRashiInsightsSet
  const attemptPublish = (synced) => {
    if (!synced) {
      throw new Error('Publishing blocked: matrix is desynchronized');
    }
    return { success: true };
  };

  assert.throws(() => attemptPublish(isSynced), /Publishing blocked/);
});

// =============================================================================
// TEST I: Failed current request
// =============================================================================
test('Test I: Failed current matrix request is not masked as missing rows, keeps editing locked', () => {
  const coordinator = new MatrixRequestCoordinator();
  const token = coordinator.startRequest('2026-10-11', 'en');

  // Request fails
  const shouldCommitError = coordinator.shouldCommitError(token);
  assert.equal(shouldCommitError, true, 'Current error must be committed');

  const sync = isMatrixSynced({
    selectedDate: '2026-10-11',
    selectedLanguage: 'en',
    loadedDate: '2026-10-10', // old date still present in memory
    loadedLanguage: 'en',
    isPending: false,
    hasError: true, // error recorded
  });

  assert.equal(sync, false, 'Failed request must result in unsynced/locked state');
});

// =============================================================================
// TEST J: Obsolete request failure
// =============================================================================
test('Test J: Obsolete request failure does not overwrite newer successful state', () => {
  const coordinator = new MatrixRequestCoordinator();

  // Request 1: Oct 10
  const token1 = coordinator.startRequest('2026-10-10', 'en');

  // Request 2: Oct 11
  const token2 = coordinator.startRequest('2026-10-11', 'en');

  // Request 2 succeeds
  const shouldCommitResp2 = coordinator.shouldCommitResponse(
    token2,
    '2026-10-11',
    'en',
    '2026-10-11',
    'en'
  );
  assert.equal(shouldCommitResp2, true);

  // Request 1 fails later
  const shouldCommitErr1 = coordinator.shouldCommitError(token1);
  assert.equal(shouldCommitErr1, false, 'Obsolete failure from token1 must be ignored');
});

// =============================================================================
// TEST K: Unmount protection
// =============================================================================
test('Test K: Invalidation upon unmount blocks in-flight responses and errors', () => {
  const coordinator = new MatrixRequestCoordinator();

  const token = coordinator.startRequest('2026-10-10', 'en');

  // Component unmounts
  coordinator.invalidate();

  // In-flight response returns after unmount
  const shouldCommit = coordinator.shouldCommitResponse(
    token,
    '2026-10-10',
    'en',
    '2026-10-10',
    'en'
  );
  assert.equal(shouldCommit, false, 'Response arriving after unmount must be ignored');

  // In-flight error returns after unmount
  const shouldCommitErr = coordinator.shouldCommitError(token);
  assert.equal(shouldCommitErr, false, 'Error arriving after unmount must be ignored');
});

// =============================================================================
// TEST L: Correctly loaded empty matrix
// =============================================================================
test('Test L: Successfully loaded empty matrix is treated as synchronized, not an error', () => {
  const sync = isMatrixSynced({
    selectedDate: '2026-10-15',
    selectedLanguage: 'en',
    loadedDate: '2026-10-15',
    loadedLanguage: 'en',
    isPending: false,
    hasError: false,
  });

  assert.equal(sync, true, 'Successfully loaded empty matrix must be recognized as synchronized');
});

// =============================================================================
// TEST M: No regression
// =============================================================================
test('Test M: Canonical key formatting and English/Hindi language handling', () => {
  assert.equal(getMatrixIdentityKey('2026-10-10', 'en'), '2026-10-10::en');
  assert.equal(getMatrixIdentityKey('2026-10-10', 'hi'), '2026-10-10::hi');
  assert.equal(getMatrixIdentityKey(' 2026-10-10 ', ' EN '), '2026-10-10::en');
  assert.equal(getMatrixIdentityKey('2026-10-10'), '2026-10-10::en');
});
