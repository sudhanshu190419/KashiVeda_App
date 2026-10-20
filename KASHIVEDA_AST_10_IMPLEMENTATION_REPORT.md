# KashiVeda AST-10 Implementation Report: Daily Astrology Partial-Publish Result Reporting & Concurrency Hardening

**Author:** Senior Production Software Engineer  
**Date:** 2026-10-10  
**Status:** Hardened, Fully Implemented & Verified in Isolated PostgreSQL 18.4 Database & Regression Test Suites  
**Target Repositories:**  
- Admin Application: `C:\Projects\kashi-veda-admin`  
- Backend & Migrations: `C:\Projects\KashiVeda`  
**Reference Finding:** `AST-10` from `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`  
**Prior Hardening Preserved:** `AST-01` (Migration 047), `AST-07` (Migration 048), `AST-08` (Matrix Request Coordinator), `AST-09` (Migration 049 Optimistic Concurrency Control)

---

## Executive Summary

AST-10 fixes incomplete, misleading, and swallowed results from the Admin Daily Astrology **Publish Daily Set** workflow, while reinforcing strict adherence to the AST-09 optimistic concurrency control (OCC) architecture.

Prior to AST-10:
1. `publishDailyRashiInsightsSet` in `lib/actions/daily-insights-management.ts` returned `success: true` and an unconditional success message as long as at least one row succeeded, silently dropping errors for failed rows.
2. Database query failures during prerequisite readiness validation or target row querying were unhandled, disguising critical read failures as "missing records" or resulting in misleading zero-publication "success" outcomes.
3. When all 12 rows were skipped due to missing required content (such as missing General Outlook), the system returned a generic failure banner claiming "all attempted signs failed", failing to explain that rows were skipped rather than failed.
4. Retry eligibility previously grouped version conflicts (`VERSION_CONFLICT`) together with ordinary failures, which could allow editorial content modified by another editor to be automatically published without explicit review.

AST-10 resolves all of these defects by:
1. Defining a comprehensive, typed per-row publication result contract (`PublishSetResult`, `PublishRowResult`, `PublishRowOutcome`, `PublishSetOverallStatus`), explicitly introducing `'no_eligible_rows'`.
2. Correcting prerequisite query error handling in both `validateDailySetReadiness` and `publishDailyRashiInsightsSet`, stopping execution safely on read errors and returning structured `prerequisite_error` results.
3. Deriving summary counts (`requestedCount`, `publishedCount`, `failedCount`, `skippedCount`) directly and consistently from the per-row result list, eliminating contradictory counters.
4. **Enforcing strict retry-eligibility constraints:** Version conflicts (`outcome: 'conflict'`, `error_code: 'VERSION_CONFLICT'`) are **never automatically retried**. Automatic retries target strictly ordinary retryable failures (such as transient transport timeouts).
5. **Protecting previously published rows:** Targeted retries verify row states and never re-submit or advance versions on already published signs.
6. **Transparent Admin UI & Explanatory Messaging:**
   - On complete success: green banner confirming all signs are live.
   - On partial outcome: amber banner showing separate published, failed, and skipped counts.
   - On all rows skipped: amber/info banner explaining that all signs were skipped due to missing required General Outlook (never claiming all rows failed).
   - On mixed failure and skip: rose banner explicitly stating how many failed and how many were skipped.
   - On version conflicts: dedicated amber notice explaining that another editor modified the content, barring automatic retry and instructing the editor to reload the matrix and review the updated text before publishing.
7. Verifying all scenarios (A through G) across simulated test suites and an isolated live PostgreSQL 18.4 database.

---

## 1. Confirmed Root Cause & Actual Source Locations Inspected

### 1.1 Source Locations Inspected
- `C:\Projects\kashi-veda-admin\lib\actions\daily-insights-management.ts` (lines 280–445)
- `C:\Projects\kashi-veda-admin\lib\types\daily-insights-management.ts` (lines 80–135)
- `C:\Projects\kashi-veda-admin\components\admin\astrology\daily-insights\publish-daily-set-modal.tsx` (entire file)
- `C:\Projects\kashi-veda-admin\components\admin\astrology\daily-insights\daily-insights-matrix-view.tsx` (lines 325–395 and 900–930)

### 1.2 Root Cause Analysis

1. **Failure Masking on Mixed Outcomes:**
   In `lib/actions/daily-insights-management.ts`:
   ```ts
   if (errors.length > 0 && publishedCount === 0) {
     return {
       success: false,
       publishedCount: 0,
       errors,
       message: "Failed to publish daily set.",
     };
   }

   return {
     success: true,
     publishedCount,
     message: `Successfully published ${publishedCount} Rashis for ${date} (${language.toUpperCase()}).`,
   };
   ```
   If 1 Rashi succeeded and 11 failed, `errors.length > 0 && publishedCount === 0` was `false`. The function returned `success: true`, dropped the `errors` array, and showed a green success toast in the UI, concealing all 11 failures from the administrator.

2. **Prerequisite Query Error Swallowing:**
   - In `validateDailySetReadiness`:
     `const { data } = await supabase.from("daily_rashi_insights").select(...);`
     The `error` object returned by Supabase was omitted. On query failure, `data` was `null`, and the code fell back to `[]`. This caused all 12 Rashis to be reported as "not created", disguising an infrastructure failure as an empty editorial state.
   - In `publishDailyRashiInsightsSet`:
     `const { data: existingRows } = await supabase.from("daily_rashi_insights").select("*")...;`
     The query `error` was also unhandled, resulting in a zero-publication operation with no error reported.

3. **Inaccurate "All Attempted Signs Failed" Banner When All Rows Skipped:**
   When 12 rows were requested but none contained General Outlook, `publishedCount` was 0 and `skippedCount` was 12. The action returned `status: 'failure'`, and the UI displayed a red banner stating `"Publication Failed: all attempted signs failed"`, which was misleading because no mutations were attempted and all rows were skipped.

4. **Automatic Retrying of AST-09 Version Conflicts (Bypassing Editorial Review):**
   In early retry drafts, retry target extraction included `r.outcome === 'conflict' || r.outcome === 'failed'`. This allowed the client to re-query the latest version token and publish the sign without the administrator reviewing the changes made by the concurrent editor.

---

## 2. Corrected Behavior Summary

| Defect Area | Previous Behavior | AST-10 Corrected Behavior |
| :--- | :--- | :--- |
| **Partial Publication** | Returned `success: true`, omitted error array, closed modal. | Returns `success: false`, `status: 'partial_success'`, retains all error strings, lists all per-row results, keeps modal open with amber alert. |
| **Complete Failure** | Returned `success: false` only if `publishedCount === 0 && errors.length > 0`. | Returns `success: false`, `status: 'failure'`, lists all per-row failure details; distinguishes failures from skips in message. |
| **No Eligible Rows** | Returned `status: 'failure'` and displayed "all attempted signs failed". | Returns `status: 'no_eligible_rows'`, displays dedicated "No Eligible Signs to Publish" banner explaining that all rows were skipped due to missing General Outlook. |
| **Prerequisite Read Failure** | Swallowed query errors, disguised as 12 missing signs. | Checks Supabase query errors, halts execution immediately, returns `status: 'prerequisite_error'`, provides human-readable error text. |
| **AST-09 Version Conflict** | Swallowed in partial success or included in retry. | Typed as `outcome: 'conflict'`, preserves `VERSION_CONFLICT` code. **Strictly excluded from automatic retry.** UI displays notice that manual review is required. |
| **Targeted Retry Eligibility** | Retried conflicts and failed rows alike. | **Strictly ordinary failures only** (`outcome === 'failed' && error_code !== 'VERSION_CONFLICT'`). Never retries conflicts, skips, or already published rows. |
| **Summary Counts** | Maintained through ad-hoc increments. | Derived directly and consistently from the per-row `results` array (`requested = published + failed + skipped`). |

---

## 3. Files Changed and Why

### Admin Application (`C:\Projects\kashi-veda-admin`)

1. **`lib/types/daily-insights-management.ts`**
   - Added `PublishRowOutcome = 'published' | 'failed' | 'skipped' | 'conflict'`.
   - Added `PublishRowResult` interface with identity, outcome, status, version, error, error code, and skip reason.
   - Added `PublishSetOverallStatus = 'success' | 'partial_success' | 'failure' | 'no_eligible_rows' | 'prerequisite_error'`.
   - Expanded `PublishSetResult` to include `status`, `requestedCount`, `publishedCount`, `failedCount`, `skippedCount`, `results`, and `prerequisiteError`.
   - Added `error?: string` to `PublishSetValidationResult` for prerequisite error tracking.

2. **`lib/actions/daily-insights-management.ts`**
   - In `validateDailySetReadiness`: added explicit error handling for `fetchErr`, returning `{ success: false, error: ... }` on query failure.
   - In `publishDailyRashiInsightsSet`:
     - Added `targetRashiIds?: number[]` parameter for targeted retries.
     - Checked `validation.error` and halted on prerequisite error.
     - In incomplete set check: if all rows skipped (`readyCount === 0`), returns `status: 'no_eligible_rows'`.
     - In targeted retry: if `row.status === 'published'`, records as published and skips RPC write, ensuring already published signs are never re-submitted or version-incremented.
     - Checked `rowsErr` on target row query and halted on query failure.
     - Evaluated each Rashi outcome: `'published'`, `'failed'`, `'conflict'`, or `'skipped'`.
     - Derived counts directly from `results`.
     - Set `status: 'success'` strictly when all requested signs succeed without failures or skips.
     - Set `status: 'partial_success'` and `success: false` on mixed outcomes.
     - Set `status: 'no_eligible_rows'` when all requested rows are skipped.
     - Set `status: 'failure'` when mutations failed, reporting both failed and skipped counts.

3. **`components/admin/astrology/daily-insights/publish-daily-set-modal.tsx`**
   - Added results view when `publishResult` is present.
   - Rendered distinct banners:
     - `success`: Green banner ("All N Signs Published Successfully")
     - `partial_success`: Amber banner ("Partial Outcome: N Published, N Failed, N Skipped")
     - `no_eligible_rows`: Amber/Info banner ("No Eligible Signs to Publish (N Skipped)")
     - `failure`: Rose banner ("Publication Failed (N Failed, N Skipped)")
     - `prerequisite_error`: Rose banner ("Prerequisite Database Error")
   - Rendered dedicated Version Conflict warning when `conflictCount > 0`: explains that editorial content was modified after loading and cannot be automatically retried; editor must reload matrix and review.
   - Filtered retry button to `retryableFailedRashiIds` (strictly `outcome === 'failed' && error_code !== 'VERSION_CONFLICT'`). Hidden if 0 retryable failures remain.
   - Rendered scrollable per-row list showing Rashi identity, status badge, and human-readable failure/conflict messages.

4. **`components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx`**
   - Added `publishResult` state and passed it to `PublishDailySetModal`.
   - On `partial_success` or `failure`: kept modal open so the administrator can inspect failures.
   - Refreshed matrix in background on partial success so successfully published signs are immediately reflected.
   - In `handleRetryFailedRashis`: guarded against conflicts and published signs, filtering candidates to strictly retryable ordinary failures.
   - Merged retry results with prior `publishResult` into a composite result, preserving previously published rows, conflicts, and skips in the modal report.
   - Added `'warning'` notification styling for partial success feedback.

### Backend & Regression Suites (`C:\Projects\KashiVeda`)

1. **`__tests__/daily_astrology_partial_publishing.test.ts`** *(New Test Suite)*
   - 19 invariant tests verifying type contracts, `no_eligible_rows`, prerequisite error handling, summary count reconciliation, partial success honesty, AST-09 OCC preservation, conflict exclusion from retry, and UI integration.

2. **`scratch/test_ast_10_publishing_results.mjs`** *(Node Test Suite)*
   - 7 automated tests covering Scenarios A through G from the user prompt:
     - A: Conflict excluded from retry (only ordinary failures retryable)
     - B: All unsuccessful rows are conflicts (no automatic retry offered)
     - C: Successful rows stay untouched during retry
     - D: Ordinary retry remains functional
     - E: All rows skipped (no_eligible_rows status and messaging)
     - F: Mixed failure and skip results (distinguishes failures from skips)
     - G: Prior AST-10 & AST-09 behaviors preserved

3. **`scratch/test_ast_10_db_publishing.py`** *(Isolated Database Test Suite)*
   - End-to-end integration test against live PostgreSQL 18.4 verifying real 12-Rashi publishing, OCC conflict handling, ordinary failure retry, non-auto-retry of conflicted signs, and explicit editorial review publishing.

---

## 4. Final Typed Result Contract

```typescript
export type PublishRowOutcome = 'published' | 'failed' | 'skipped' | 'conflict';

export interface PublishRowResult {
  rashi_id: number;
  rashi_name: string;
  vedic_name?: string;
  insight_date: string;
  language: string;
  outcome: PublishRowOutcome;
  status: 'published' | 'draft' | 'archived' | 'not_created';
  version?: number | null;
  error?: string;
  error_code?: 'VERSION_CONFLICT' | 'RECORD_NOT_FOUND' | 'VALIDATION_ERROR' | 'DB_ERROR' | string;
  skip_reason?: 'missing_general_outlook' | 'missing_record' | 'not_requested' | 'not_ready' | string;
}

export type PublishSetOverallStatus =
  | 'success'
  | 'partial_success'
  | 'failure'
  | 'no_eligible_rows'
  | 'prerequisite_error';

export interface PublishSetValidationResult {
  success?: boolean;
  isReadyForPublish: boolean;
  totalRashis: number;
  readyCount: number;
  missingCount: number;
  missingRashis: MissingRashiDetail[];
  error?: string;
}

export interface PublishSetResult {
  success: boolean; // true ONLY when status === 'success'
  status: PublishSetOverallStatus;
  date: string;
  language: string;
  requestedCount: number;
  publishedCount: number;
  failedCount: number;
  skippedCount: number;
  results: PublishRowResult[];
  errors?: string[];
  message: string;
  prerequisiteError?: string;
}
```

---

## 5. Retry Eligibility & Concurrency Preservation Policy

### 5.1 Strict Exclusion of Version Conflicts
When `admin_save_daily_rashi_insight` returns `error_code: 'VERSION_CONFLICT'`:
- The row is assigned `outcome: 'conflict'`.
- The row is **strictly excluded** from `retryableFailedRashiIds`:
  ```ts
  const retryableFailedRashiIds = publishResult?.results
    ? publishResult.results
        .filter((r) => r.outcome === "failed" && r.error_code !== "VERSION_CONFLICT")
        .map((r) => r.rashi_id)
    : [];
  ```
- If all unsuccessful signs have version conflicts, `retryableFailedRashiIds.length === 0`. The retry button is hidden.
- The administrator is presented with a clear warning:
  `"Editorial content was modified by another editor after loading. These signs cannot be automatically retried. Please close this modal, reload the matrix to review the latest content, and publish again."`
- The matrix view's `handleRetryFailedRashis` callback contains defense-in-depth filtering that strips any conflict row ID, ensuring accidental programmatic invocation cannot bypass the policy.

### 5.2 Protection of Already Published Rows
- Signs that were published during the initial attempt are never included in `retryableFailedRashiIds`.
- In `publishDailyRashiInsightsSet`, if a targeted retry includes a sign whose database record is already `status: 'published'`, the action marks it as `outcome: 'published'` and skips the mutation RPC call. This prevents redundant writes and unwarranted version increments.

### 5.3 Authoritative Current Version on Ordinary Retries
- When an ordinary failed sign (e.g. transient transport timeout) is retried, `publishDailyRashiInsightsSet` reloads the authoritative database record.
- It re-validates that the sign is ready (`general_outlook` is present).
- It supplies the row's authoritative `version` as `p_expected_version` to `admin_save_daily_rashi_insight`. If an intervening editor modified the row in the interim, the database-enforced check will reject the write with `VERSION_CONFLICT`.

---

## 6. Test Matrix & Results

### 6.1 Automated Unit & Contract Test Suite (`scratch/test_ast_10_publishing_results.mjs`)

| Scenario | Objective | Simulated Condition | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **A. Conflict excluded from retry** | Verify only ordinary failures are retryable | Row 1: `VERSION_CONFLICT`, Row 2: `DB_TRANSPORT_ERROR` | Retry list contains only `[2]`; detected 1 conflict | **PASS** |
| **B. All unsuccessful are conflicts** | Verify no retry button offered when all are conflicts | Rows 1 & 2: `VERSION_CONFLICT`, Row 3: `published` | Retry list is empty `[]`; detected 2 conflicts | **PASS** |
| **C. Successful rows untouched** | Verify retry never resubmits published or conflicted signs | Retry targeting only Row 2; Rows 1 & 3 exist | RPC invoked exactly once, only for Row 2; Row 1 untouched | **PASS** |
| **D. Ordinary retry functional** | Verify ordinary retry reloads DB state and succeeds | Transient failed Row 4 retried with valid v1 | Authoritative DB state reloaded; Row 4 published to v2 | **PASS** |
| **E. All rows skipped** | Verify `no_eligible_rows` status and truthful message | 12 rows missing required General Outlook | `status: 'no_eligible_rows'`, `skippedCount: 12`, message explains missing content (never says "all failed") | **PASS** |
| **F. Mixed failure and skip** | Verify failures distinguished from skips when 0 publish | Row 1: DB error, Row 2: missing outlook | `status: 'failure'`, message specifies `1 attempted signs failed and 1 signs were skipped` | **PASS** |
| **G. Prior AST-10/09 invariants** | Verify truthful partial success & OCC preservation | Row 1: success, Row 2: `VERSION_CONFLICT` | `status: 'partial_success'`, `published: 1`, `failed: 1`, `conflict: 1` | **PASS** |

*Command:* `node scratch/test_ast_10_publishing_results.mjs`  
*Result:* **7/7 Passed (100%)**

### 6.2 Live PostgreSQL 18.4 Integration Test Suite (`scratch/test_ast_10_db_publishing.py`)

| Test Phase | Operation | Database Verification | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Create 12 draft rows at version 1 | `SELECT count(*), max(version) FROM daily_rashi_insights` | 12 rows created in draft status at version 1 | **PASS** |
| **Phase 2** | Editor A updates Rashi 5 (Simha) to version 2 | Simha row updated with career advice | Simha advanced to version 2; other 11 rows remain version 1 | **PASS** |
| **Phase 3** | Publisher publishes set with stale v1 snapshot | Set publish loop against real `admin_save_daily_rashi_insight` | 10 rows publish to v2; Simha rejected with `VERSION_CONFLICT`; Vrishabha simulated transient failure | **PASS** |
| **Phase 4** | Enforce Retry Policy | Check `retryable_ids` extraction | `retryable_ids == [2]`; Simha (Rashi 5) strictly excluded | **PASS** |
| **Phase 5** | Verify Conflict Preservation | Inspect Simha row in PostgreSQL | Simha remains draft at version 2; career advice preserved | **PASS** |
| **Phase 6** | Retry Ordinary Failure (Rashi 2) | Target only Rashi 2 with re-queried v1 | Rashi 2 publishes to version 2 | **PASS** |
| **Phase 7** | Editorial Review & Publish of Simha | Editor reviews advice, publishes with expected version 2 | Simha publishes to version 3; no other signs mutated | **PASS** |
| **Phase 8** | Final Database State | `SELECT count(*) WHERE status = 'published'` | All 12 signs authoritatively published in PostgreSQL | **PASS** |

*Command:* `python scratch/test_ast_10_db_publishing.py`  
*Result:* **All Phases Passed (100%)**

### 6.3 Jest Invariant Test Suites

| Test Suite | Command | Result |
| :--- | :--- | :--- |
| **AST-10 Partial Publishing Suite** | `npx jest __tests__/daily_astrology_partial_publishing.test.ts` | **PASS** (19/19) |
| **AST-09 OCC Concurrency Suite** | `npx jest __tests__/daily_astrology_optimistic_concurrency.test.ts` | **PASS** (15/15) |
| **AST-01 Admin RPC Hardening** | `npx jest __tests__/daily_astrology_admin_rpc_hardening.test.ts` | **PASS** (17/17) |
| **AST-07 Subscription Payments** | `npx jest __tests__/astrology_subscription_payment_serialization.test.ts` | **PASS** (14/14) |

### 6.4 Existing Regression Suites

| Suite | Command | Result |
| :--- | :--- | :--- |
| **AST-08 Matrix Coordinator** | `node scratch/test_astrology_matrix_coordinator.mjs` | **PASS** (13/13) |
| **Bulk Import & Field Modal** | `node scratch/test_bulk_import_and_field_modal.mjs` | **PASS** (14/14) |
| **Dedicated Field Modal Focus** | `node scratch/test_field_specific_modal.mjs` | **PASS** (15/15) |
| **Database OCC Concurrency** | `python scratch/test_astrology_optimistic_concurrency.py` | **PASS** (8/8) |

---

## 7. TypeScript, Lint, and Production Build Results

| Verification Check | Target Directory | Command | Result |
| :--- | :--- | :--- | :--- |
| **TypeScript Compilation** | `C:\Projects\kashi-veda-admin` | `npx tsc --noEmit` | **PASS** (0 errors) |
| **ESLint Validation** | `C:\Projects\kashi-veda-admin` | `npx eslint lib/types/... lib/actions/... components/...` | **PASS** (0 errors, 0 warnings) |
| **Production Build** | `C:\Projects\kashi-veda-admin` | `npm run build` | **Blocked by pre-existing unrelated error** in `app/(dashboard)/reviews/page.tsx:5:14` (`export const dynamic = "force-dynamic"` incompatible with `cacheComponents`). In strict compliance with scope boundaries, this unrelated route was left untouched. |

---

## 8. Remaining Limitations and Unverified Behavior

1. **Remote Supabase Deployment:** In strict compliance with user rules, no migrations were deployed to any remote Supabase project. Verification was executed against an isolated local PostgreSQL 18.4 database.
2. **Bulk CSV Import Integration:** AST-11 (CSV identity enforcement) and AST-12 (CSV RFC parser) are separate audit findings and remain in their original implementations.

---

## 9. Scope Boundaries & Confirmation

1. **AST-11 through AST-21:** None of the later findings (AST-11 CSV identity and overwrite enforcement, AST-12 CSV parser and preview fixes, AST-13 date navigation, AST-14 legacy timestamps, etc.) were implemented.
2. **Historical Migrations 001–048 and AST-09 Migration 049:** Completely untouched and pristine. No new database migration was created or required for AST-10.
3. **Preservation of Prior Fixes:** AST-01 (RPC hardening), AST-07 (subscription serialization), AST-08 (matrix request coordinator), and AST-09 (database OCC versioned writes) remain intact and passing all regression suites.
4. **No Production Database Changes:** Zero mutations performed on production systems.

---
*End of KASHIVEDA_AST_10_IMPLEMENTATION_REPORT.md*
