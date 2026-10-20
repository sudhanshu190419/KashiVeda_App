# KashiVeda AST-19 Final Verification Report: Persistence Error Classification & Remote-Save Handling

## 1. Executive Summary

Finding **AST-19** from `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md` has been fully and definitively closed. This follow-up verification addressed the two final persistence gaps:
1. **Accurate Error Classification:** Distinguishing transient network/transport failures from definitive server rejections (permission denials, validation errors, database constraints, client exceptions) to eliminate false `local_only` fallbacks.
2. **Accurate Remote Success with Cache Failure Reporting:** Handling cases where the authoritative database RPC succeeds on PostgreSQL but the device's scoped AsyncStorage write fails, introducing the explicit `"remote_only"` status with detailed cache warnings.

All changes remain strictly within AST-19 boundaries. No code has been deployed to production and no database migrations were created or modified.

---

## 2. Error Classification & Local-Only Fallback Policy

### The Ambiguity in Previous Handling
Previously, any non-successful RPC outcome was treated uniformly: if the local storage write succeeded, the service returned `status: "local_only"`. This created a severe vulnerability: if the server rejected a request due to invalid input (e.g. check constraint violation) or authorization failure (e.g. 401/403/42501), the application would save the rejected value into local storage and report `local_only`, falsely implying that the preference was saved and could be retried later.

### The Hardened Error Classification Policy
We hardened `dailyRashiService.isNetworkError(err)` and the evaluation flow in `savePreferredRashi`:

```
+-----------------------------------------------------------------------------------------+
| Error Classification & Fallback Matrix                                                  |
+------------------------------------+--------------------------+-------------------------+
| Error Category                     | Detection Criteria       | Persistence Action      |
+------------------------------------+--------------------------+-------------------------+
| 1. Genuine Network / Transport     | - msg: "network",        | - Allowed to retain     |
|    Failure (Offline / Unreachable) |   "failed to fetch",     |   selection in user's   |
|                                    |   "connection closed",   |   scoped local cache.   |
|                                    |   "offline", etc.        | - Returns 'local_only'  |
|                                    | - code: ECONNRESET,      |   if cache write OK.    |
|                                    |   ETIMEDOUT, ENOTFOUND   | - Returns 'failed' if   |
|                                    | - status: 0              |   cache write fails.    |
+------------------------------------+--------------------------+-------------------------+
| 2. Permission / Authorization      | - HTTP 401, 403          | - Definitive rejection. |
|    Rejection                       | - code: PGRST301, 42501  | - MUST NOT write to     |
|                                    | - msg: "permission denied|   local storage.        |
|                                    |   for function..."       | - Returns 'failed'.     |
+------------------------------------+--------------------------+-------------------------+
| 3. Validation / Constraint         | - HTTP 400, 422          | - Definitive rejection. |
|    Rejection                       | - code: 23514 (check),   | - MUST NOT write to     |
|                                    |   22P02, PGRST100        |   local storage.        |
|                                    | - msg: "violates check", | - Returns 'failed'.     |
|                                    |   "invalid input syntax" |                         |
+------------------------------------+--------------------------+-------------------------+
| 4. Database Server / Statement     | - code: 57014 (statement | - Server execution error|
|    Timeout                         |   timeout), 500 error    | - MUST NOT write to     |
|                                    |                          |   local storage.        |
|                                    |                          | - Returns 'failed'.     |
+------------------------------------+--------------------------+-------------------------+
| 5. Client-Side Runtime Exception   | - TypeError, syntax error| - Client bug/exception. |
|    (non-network)                   | - Thrown outside fetch   | - MUST NOT write to     |
|                                    |                          |   local storage.        |
|                                    |                          | - Returns 'failed'.     |
+------------------------------------+--------------------------+-------------------------+
```

### Deterministic Network Guard
`dailyRashiService.isNetworkError(err)` now explicitly excludes database error codes and HTTP 4xx statuses before testing for transient network keywords:
```ts
if (
  status === 400 ||
  status === 401 ||
  status === 403 ||
  status === 404 ||
  status === 422 ||
  code.startsWith("PGRST") ||
  code.startsWith("23") || // Integrity constraint violations
  code.startsWith("42") || // Syntax or access rule violations
  code.startsWith("22") || // Data exceptions
  code.startsWith("28") || // Invalid authorization specification
  code === "57014"         // Statement timeout
) {
  return false;
}
```

---

## 3. Remote RPC Success When Local Cache Fails (`"remote_only"`)

### The Gap
If the profile RPC (`set_customer_preferred_rashi`) committed successfully to PostgreSQL, but the device's AsyncStorage write failed (e.g. disk full, quota exceeded, operating system storage error):
- Reporting `"failed"` is false: PostgreSQL has already committed the preference authoritative to the user's profile.
- Reporting `"synced"` is false: the local device cache was not written.

### The Solution: `"remote_only"` Status
We adjusted the return contract to include `"remote_only"`:
```ts
export type PreferenceSyncStatus =
  | "synced"       // Both remote RPC and local cache succeeded
  | "remote_only"  // Remote RPC succeeded, but local device cache failed
  | "local_only"   // Remote RPC failed due to network, local device cache succeeded
  | "failed"       // Definitive rejection, or both remote and local failed
  | "guest_saved"; // Unauthenticated guest saved to guest storage
```

When local caching fails after a successful remote RPC:
1. `savePreferredRashi` returns:
   ```ts
   {
     status: "remote_only",
     rashiId: targetRashiId,
     userId: targetUserId,
     error: localErrorMsg,
     cacheWarning: `Remote preference was saved successfully, but local cache update failed: ${localErrorMsg}`
   }
   ```
2. The user's authoritative profile on PostgreSQL remains 100% accurate.
3. Subsequent profile queries (`getPreferredRashi("user-A")`) read from the authoritative profile and restore the preference.
4. Other accounts (Customer B) are completely unaffected.
5. In UI callers ([useDailyRashiInsight.ts](file:///c:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts), [FreeKundliResultScreen.tsx](file:///c:/Projects/KashiVeda/src/features/kundli/free/screens/FreeKundliResultScreen.tsx)):
   - `syncStatus` surfaces `"remote_only"`.
   - Callers can display non-blocking cache warnings without falsely telling the user that their cloud preference failed to save.
   - `retrySync()` remains available to re-attempt synchronizing the local device cache once storage is restored.

---

## 4. Return Contract and Caller Updates

### Types in [dailyRashiService.ts](file:///c:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts)
```ts
export type PreferenceSyncStatus =
  | "synced"
  | "remote_only"
  | "local_only"
  | "failed"
  | "guest_saved";

export interface SavePreferredRashiResult {
  status: PreferenceSyncStatus;
  rashiId: number | null;
  userId: string | null;
  error?: string | null;
  cacheWarning?: string | null;
}
```

### Callers
1. **[useDailyRashiInsight.ts](file:///c:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts):**
   - Passes `saveResult.status` directly to `setSyncStatus`.
   - `retrySync()` allows retrying when `syncStatus !== "synced"`, supporting recovery from both `"local_only"` and `"remote_only"` states.
2. **[FreeKundliResultScreen.tsx](file:///c:/Projects/KashiVeda/src/features/kundli/free/screens/FreeKundliResultScreen.tsx):**
   - Handles `result.status === "failed"` and `result.status === "remote_only"` gracefully with informative logging.

---

## 5. Test Evidence

### 1. Focused AST-19 Suite
```bash
npx jest __tests__/daily_astrology_preference_isolation.test.tsx
```
**Results:**
```
PASS __tests__/daily_astrology_preference_isolation.test.tsx (7.487 s)
  AST-19: Prevent Preferred Rashi Leakage & Report Persistence Accurately
    Group A: Account-specific preference isolation
      √ 1-5. Switch from A to B: getPreferredRashi returns B's authoritative profile, keeping caches isolated (13 ms)
      √ 6. Customer A's preference is never used when Customer B has no cached value (3 ms)
      √ 7. Profile read returning genuine null preference is handled distinctly from failed profile read (5 ms)
    Group B: Legacy global-key handling
      √ 8-12. Seed legacy global key with Rashi A; B's profile preference overrides it, neutralizing legacy key (2 ms)
      √ 13. Guest preference remains strictly isolated from authenticated accounts (3 ms)
    Group C: Account switching and sign-out races
      √ 14-17. Asynchronous profile read for Customer A resolving after switch to B cannot overwrite B (757 ms)
      √ 18. Customer A profile read failing after B succeeds does not overwrite B with error (20 ms)
      √ 19-20. Sign out while preference read is pending: old request resolving cannot repopulate cleared state (12 ms)
      √ 21. In-flight save from Customer A resolving after switch to B cannot mutate B's active cache (5 ms)
    Group D: Persistence success, failure, and retry reporting
      √ 22. Successful profile RPC updates authoritative profile and reports status: 'synced' (1 ms)
      √ 23. Network error + successful user-scoped AsyncStorage write produces status: 'local_only' (3 ms)
      √ 24. Network error + AsyncStorage failure returns status: 'failed' (1 ms)
      √ 25. Permission / Authorization rejection returns status: 'failed' without writing local cache (1 ms)
      √ 25b. Validation error / constraint rejection returns status: 'failed' without writing local cache (5 ms)
      √ 25c. Non-network RPC database error returns status: 'failed' without writing local cache (1 ms)
      √ 25d. Non-network exception thrown by client returns status: 'failed' without writing local cache (5 ms)
      √ 25e. Remote RPC succeeds + local cache write fails: reports 'remote_only' accurately (4 ms)
      √ 26. Profile read errors are represented distinctly rather than converted to missing preference (1 ms)
      √ 27-29. Newer selection made while older save pending remains authoritative, and retrySync operates on active selection (41 ms)
    Group E: New installation and compatibility
      √ 30. Fresh installation: No AsyncStorage present, successful profile read restores preference (5 ms)
      √ 31. Legacy global key cannot override a different account's profile preference (1 ms)
      √ 32. Janam Kundli Moon Sign mapping to canonical Rashi IDs 1-12 functions correctly (2 ms)
      √ 33. Default behavior preserved when no preference exists (profile returns null) (10 ms)

Test Suites: 1 passed, 1 total
Tests:       23 passed, 23 total
Snapshots:   0 total
Time:        7.969 s
```

### 2. Full Regression Suite (All Daily Astrology Tests)
```bash
npx jest __tests__/daily_astrology --runInBand
```
**Results:**
```
Test Suites: 18 passed, 18 total
Tests:       309 passed, 309 total
Snapshots:   0 total
Time:        20.885 s
```

### 3. Daily Vedic Astrology Insights Suite
```bash
npx jest __tests__/daily_vedic_astrology_insights.test.tsx
```
**Results:**
```
Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
Snapshots:   0 total
Time:        6.922 s
```

### 4. TypeScript Verification
```bash
npx tsc --noEmit
```
**Results:** Exited with code 0 (0 errors).

### 5. ESLint Verification
```bash
npx eslint src/features/astrology/services/dailyRashiService.ts src/features/astrology/hooks/useDailyRashiInsight.ts src/features/kundli/free/screens/FreeKundliResultScreen.tsx __tests__/daily_astrology_preference_isolation.test.tsx
```
**Results:** Exited with code 0 (0 errors, 0 warnings).

---

## 6. Verification Against Expected Outcomes

| Scenario | Expected Behavior | Verification Status |
| :--- | :--- | :--- |
| **Network error + scoped local write succeeds** | Explicit `local_only` state returned; local storage scoped to user contains Rashi. | Verified (Test 23) |
| **Network error + scoped local write fails** | Genuine failure returned (`failed`); error message combines both failures. | Verified (Test 24) |
| **Permission / authorization error** | Rejection returned (`failed`); local cache is NOT updated with rejected selection; no unauthorized direct update. | Verified (Test 25) |
| **Validation / constraint error** | Rejection returned (`failed`); local cache is NOT updated with rejected selection. | Verified (Test 25b) |
| **Non-network database error (statement timeout)** | Rejection returned (`failed`); local cache is NOT updated. | Verified (Test 25c) |
| **Non-network client exception (TypeError)** | Rejection returned (`failed`); local cache is NOT updated. | Verified (Test 25d) |
| **Remote RPC succeeds + local cache write fails** | Explicit `remote_only` status returned; `cacheWarning` detailed; profile contains authoritative value; subsequent profile read restores selection; Customer B unaffected. | Verified (Test 25e) |
| **Account changes while any operation is pending** | Aborted with `failed`; Customer B's cache and active state protected from contamination. | Verified (Test 21) |
| **Retry after network failure** | Retries active user's selection; on network recovery, transitions to `synced`. | Verified (Test 27–29) |

---

## 7. Limitations & Edge Cases

* **Post-Authentication Guest Preference:** Guest preferences stored in `@kashiveda_preferred_rashi_id:guest` remain strictly segregated from authenticated profiles. If a user personalizes as a guest and subsequently logs in, the guest preference is not automatically written to their account profile unless the user explicitly performs an authenticated selection or onboarding prompt.
* **Transient 5xx HTTP Errors:** Transient 502/503/504 errors generated at reverse proxies without custom error payloads are handled safely: if the transport connection itself fails, it falls back to `local_only`; if an HTTP error code (e.g. 500) is returned from PostgreSQL, it is classified as a server failure and returns `failed` without corrupting local storage.

---

## 8. Deployment Status

* **Production Code Deployment:** Explicitly confirmed that no application code was deployed.
* **Database Migrations:** Explicitly confirmed that no database migrations were created, pushed, or executed on production.
* **Audit Finding Status:** AST-19 is completely closed. AST-20 has not been started.
