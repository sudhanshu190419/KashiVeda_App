# KashiVeda AST-09 Implementation Report: Daily Astrology Optimistic Concurrency Control

**Author:** Senior Production Software Engineer  
**Date:** 2026-10-10  
**Status:** Implemented & Verified in Isolated Database & Test Suites  
**Target Repositories:**  
- Mobile/Backend: `C:\Projects\KashiVeda`  
- Admin Application: `C:\Projects\kashi-veda-admin`  
**Reference Finding:** `AST-09` from `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`  
**Prior Hardening:** `AST-01` (Migration 047), `AST-07` (Migration 048), `AST-08` (Matrix Request Coordinator)

---

## Executive Summary

AST-09 addresses the critical concurrency defect in daily Vedic astrology editorial operations where stale row snapshots silently overwrite newer database edits (the classic lost-update problem). 

Prior to AST-09, the authoritative administrative RPC `admin_save_daily_rashi_insight` executed unconditional updates without checking row versions or precondition states. Because single-field modals, full-form editors, and publication actions all loaded complete row snapshots and submitted them back through whole-row updates, concurrent operations by multiple editors or between an editor and a publisher silently reverted intermediate changes.

AST-09 establishes a **database-enforced optimistic concurrency control (OCC)** architecture backed by:
1. A forward-only migration (`049_daily_astrology_optimistic_concurrency.sql`) adding a monotonic `version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)` column to `public.daily_rashi_insights`.
2. Atomic transaction-scoped OCC validation in `public.admin_save_daily_rashi_insight` utilizing pessimistic row-level locking (`SELECT ... FOR UPDATE`), strict expected-version precondition checks, and monotonic version increments (`version = v_current_version + 1`).
3. Clean insert-race handling catching PostgreSQL `unique_violation` exceptions on the composite identity `(insight_date, rashi_id, language)` and returning structured `VERSION_CONFLICT` responses instead of unhandled database crashes.
4. Typed conflict reporting and non-destructive conflict handling across the Admin UI (`daily-insight-field-modal.tsx`, `daily-insights-form-modal.tsx`, and `daily-insights-matrix-view.tsx`), ensuring user inputs are preserved on conflict and clear guidance is rendered without silent overwrites.
5. End-to-end regression verification against a live isolated PostgreSQL 18.4 database covering all 8 specified concurrency scenarios (A through H), with 100% pass rates.

---

## 1. Confirmed Root Cause & Full Mutation Paths Inspected

### 1.1 Root Cause Analysis

The root cause was architectural:
- The database table `public.daily_rashi_insights` contained no monotonic revision counter (`version` token).
- The authoritative mutation function `admin_save_daily_rashi_insight` (defined in migration 045 and hardened in migration 047) accepted 12 parameters and performed an upsert:
  - If a row matching `(insight_date, rashi_id, language)` existed, it executed an unconditional `UPDATE public.daily_rashi_insights SET ...` updating all editorial fields.
- In the Admin frontend (`c:\Projects\kashi-veda-admin`):
  - Both `daily-insight-field-modal.tsx` (single-field editor) and `daily-insights-form-modal.tsx` (full-form editor) held an `existingInsight` snapshot fetched when the modal opened.
  - When submitting a single field (e.g. `career_business`), `daily-insight-field-modal.tsx` merged the edited field with the other 3-5 fields from `existingInsight` and called `saveDailyRashiInsight`.
  - If Editor B edited `career_business` while Editor A edited `general_outlook`, whichever editor saved second submitted the older snapshot of the other field, silently overwriting the first editor's committed work.
  - Similarly, `publishDailyRashiInsightsSet` read rows and called `admin_save_daily_rashi_insight` with `p_status := 'published'`, submitting the read snapshot values and potentially reverting in-flight drafts.

### 1.2 Inspection of Existing Mutation Paths

| Mutation Path | Entry Point | RPC Invoked | Fields Transmitted | Previous Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Field-Specific Edit** | `daily-insight-field-modal.tsx` -> `saveDailyRashiInsight` | `admin_save_daily_rashi_insight` | Single edited field + snapshot of all other fields | Overwrote entire row unconditionally. |
| **Full-Form Save** | `daily-insights-form-modal.tsx` -> `saveDailyRashiInsight` | `admin_save_daily_rashi_insight` | All 8 editorial fields + status | Overwrote entire row unconditionally. |
| **Bulk Draft Save** | `daily-insights-matrix-view.tsx` -> `bulkSaveDailyRashiInsightsDrafts` | `admin_save_daily_rashi_insight` (per item) | All modified row values | Overwrote entire row unconditionally. |
| **Single Rashi Publish** | `daily-insights-form-modal.tsx` (status='published') | `admin_save_daily_rashi_insight` | All fields with status='published' | Overwrote entire row unconditionally. |
| **Daily Set Publish** | `publish-daily-set-modal.tsx` -> `publishDailyRashiInsightsSet` | `admin_save_daily_rashi_insight` (per row) | Snapshot fields with status='published' | Overwrote entire row unconditionally. |
| **Bulk CSV Import** | `bulk-import-modal.tsx` -> `bulkSaveDailyRashiInsightsDrafts` | `admin_save_daily_rashi_insight` | Parsed CSV fields with status='draft' | Overwrote existing rows if overwrite checked. |

All mutation paths converged on `admin_save_daily_rashi_insight`. None bypassed the shared RPC.

---

## 2. Selected Concurrency Strategy & Safety Rationale

### Strategy: Database-Enforced Optimistic Concurrency Control (OCC) with Monotonic Row Versioning

We selected an optimistic concurrency control model with a dedicated `version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)` column, enforced authoritatively inside PostgreSQL within an atomic transaction.

### Why This Strategy is Safe and Production-Grade:
1. **Authoritative Boundary:** Concurrency cannot be bypassed by client defects, outdated frontend builds, or alternate admin clients because the check occurs within the PostgreSQL RPC before data modification.
2. **Deterministic Monotonicity:** Each row starts at `version = 1`. Every successful update advances `version = v_current_version + 1`. Version numbers never wrap or repeat within practical operational horizons.
3. **Pessimistic Row Lock (`FOR UPDATE`):** Before evaluating `v_current_version <> p_expected_version`, the RPC locks the target row (`SELECT id, version INTO ... FROM public.daily_rashi_insights ... FOR UPDATE;`). This serializes concurrent transactions targeting the same row, preventing phantom updates or mid-flight race conditions.
4. **Insert Race Protection:** When two sessions attempt to create the first record for the same `(insight_date, rashi_id, language)` composite identity simultaneously, both initially observe no existing row. The second transaction hits the unique constraint `uq_daily_rashi_insights_date_rashi_lang`. The RPC traps `unique_violation` in an `EXCEPTION` block and returns a structured `VERSION_CONFLICT` response rather than failing with an unhandled database abort.
5. **Audit Atomicity:** Admin audit entries in `public.admin_audit_logs` are generated strictly after successful mutation within the same database transaction. A rejected stale write emits zero audit log entries, preventing false historical audit trails.
6. **No Client Merge Assumptions:** Client forms do not attempt automated 3-way text merges. In high-stakes Vedic astrology editorial workflows, automated merging of astrological advice across divergent editor sessions can produce contradictory guidance (e.g. conflicting health or investment warnings). Requiring manual review upon conflict ensures data integrity.

---

## 3. Files Changed and Purpose of Each Change

### Backend Repository (`C:\Projects\KashiVeda`)

1. **`supabase/migrations/049_daily_astrology_optimistic_concurrency.sql`** *(New Migration)*
   - Adds `version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)` to `public.daily_rashi_insights`.
   - Backfills existing null versions (if any) to 1.
   - Drops legacy 12-parameter overload of `admin_save_daily_rashi_insight` to prevent PostgreSQL ambiguous signature errors.
   - Redefines `admin_save_daily_rashi_insight` with 13th parameter `p_expected_version INTEGER DEFAULT NULL`.
   - Implements `SELECT ... FOR UPDATE`, OCC validation returning structured JSON conflict payloads, monotonic version increment, and `unique_violation` trap.
   - Updates `admin_list_daily_rashi_insights` to include `version` in the JSON serialization.
   - Hardens execution permissions: revokes execute from `PUBLIC, anon` and grants strictly to `authenticated, service_role`.

2. **`__tests__/daily_astrology_optimistic_concurrency.test.ts`** *(New Jest Test Suite)*
   - 15 invariant tests verifying Migration 049 structure, ACL revocations, search_path safety, AST-01 preservation, and Admin UI contract integration.

3. **`scratch/test_astrology_optimistic_concurrency.py`** *(Isolated Database Test Harness)*
   - Comprehensive multi-connection Python test suite against isolated PostgreSQL 18.4 verifying all 8 concurrency scenarios (A through H).

4. **`__tests__/astrology_subscription_payment_serialization.test.ts`** *(Regression Maintenance)*
   - Adjusted migration length invariant from `toBe(48)` to `toBeGreaterThanOrEqual(48)` to accommodate forward-only Migration 049 without weakening historical migration invariants.

### Admin Website Repository (`C:\Projects\kashi-veda-admin`)

1. **`lib/types/daily-insights-management.ts`**
   - Added `version?: number;` to `DailyRashiInsightAdminItem`.
   - Added `expected_version?: number | null;` to `DailyRashiInsightFormData`.
   - Defined `SaveDailyRashiInsightResult` with `error_code?: 'VERSION_CONFLICT' | string; current_version?: number; expected_version?: number | null;`.

2. **`lib/actions/daily-insights-management.ts`**
   - In `getDailyRashiInsightsMatrix`: mapped `version` from RPC/database into the matrix items.
   - In `saveDailyRashiInsight`: passed `p_expected_version` to RPC, extracted structured `error_code`, `current_version`, and returned typed conflict response.
   - In `bulkSaveDailyRashiInsightsDrafts`: forwarded `item.expected_version` to RPC and recorded conflict errors.
   - In `publishDailyRashiInsightsSet`: forwarded `row.version` to RPC ensuring in-flight edits are not published without editor awareness.

3. **`components/admin/astrology/daily-insights/daily-insight-field-modal.tsx`**
   - Carried `expected_version: existingInsight?.version != null ? existingInsight.version : null` in save payload.
   - Handled `VERSION_CONFLICT` response: displayed prominent conflict banner explaining the version difference, preserved entered text in the textarea, prevented clearing of user work, and provided clear reload guidance.

4. **`components/admin/astrology/daily-insights/daily-insights-form-modal.tsx`**
   - Carried `expected_version: existingInsight?.version != null ? existingInsight.version : null` in full-form submission.
   - Handled `VERSION_CONFLICT` response: rendered destructive alert banner, preserved all form inputs, and advised reloading current matrix state.

5. **`components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx`**
   - In `handleBulkSaveDrafts`: included `expected_version: insight.version` for every drafted row.

6. **`components/admin/astrology/daily-insights/bulk-import-modal.tsx`**
   - Preserved `expected_version` mapping when bulk importing over existing rows.

---

## 4. Migration & Database Function Contracts

### Migration File
`supabase/migrations/049_daily_astrology_optimistic_concurrency.sql`

### Function: `public.admin_save_daily_rashi_insight`

```sql
CREATE OR REPLACE FUNCTION public.admin_save_daily_rashi_insight(
    p_insight_date DATE,
    p_rashi_id SMALLINT,
    p_rashi_name TEXT,
    p_language VARCHAR(5),
    p_general_outlook TEXT,
    p_career_business TEXT DEFAULT NULL,
    p_finance_wealth TEXT DEFAULT NULL,
    p_love_relationships TEXT DEFAULT NULL,
    p_health_wellbeing TEXT DEFAULT NULL,
    p_auspicious_color TEXT DEFAULT NULL,
    p_auspicious_number INTEGER DEFAULT NULL,
    p_status public.astrology_content_status DEFAULT 'draft'::public.astrology_content_status,
    p_expected_version INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
```

### Return Contract

#### On Successful Insert:
```json
{
  "success": true,
  "record_id": "uuid",
  "insight_date": "2026-10-15",
  "rashi_id": 1,
  "status": "draft",
  "version": 1
}
```

#### On Successful Update:
```json
{
  "success": true,
  "record_id": "uuid",
  "insight_date": "2026-10-15",
  "rashi_id": 1,
  "status": "draft",
  "version": 2
}
```

#### On Concurrency Conflict (Stale Version):
```json
{
  "success": false,
  "error_code": "VERSION_CONFLICT",
  "error": "Conflict: Daily insight for 2026-10-15 (Rashi 1, en) was modified by another editor. Expected version 1, current version is 2. Please reload.",
  "current_version": 2,
  "expected_version": 1,
  "record_id": "uuid"
}
```

#### On Concurrency Conflict (Missing Expected Version on Existing Row):
```json
{
  "success": false,
  "error_code": "VERSION_CONFLICT",
  "error": "Conflict: Daily insight for 2026-10-15 (Rashi 1, en) already exists (version 2). An expected version must be provided to prevent overwriting concurrent updates.",
  "current_version": 2,
  "expected_version": null,
  "record_id": "uuid"
}
```

#### On Insert Race (Trapped Unique Violation):
```json
{
  "success": false,
  "error_code": "VERSION_CONFLICT",
  "error": "Conflict: Another editor created this daily insight concurrently (current version 1). Please reload.",
  "current_version": 1,
  "expected_version": null,
  "record_id": "uuid"
}
```

---

## 5. Security, Authorization, and Audit Verification

1. **Role Authorization (`is_admin` Guard):**
   - Checked at line 1 of the function body:
     ```sql
     v_admin_id := auth.uid();
     IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
         RAISE EXCEPTION 'Unauthorized: Administrator privileges required to manage daily insights.';
     END IF;
     ```
   - Customer and anonymous requests are blocked with PostgreSQL exception before any locks or table scans occur.

2. **Privilege Revocations & Grants:**
   - Explicitly revoked from `PUBLIC` and `anon`:
     ```sql
     REVOKE EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(...) FROM PUBLIC, anon;
     REVOKE EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights(...) FROM PUBLIC, anon;
     ```
   - Granted strictly to `authenticated` and `service_role`.

3. **Audit Log Atomicity:**
   - Audit logging occurs at the very end of the mutation block.
   - If a version mismatch is detected, the function returns `{ success: false, error_code: 'VERSION_CONFLICT', ... }` immediately. No audit row is inserted into `public.admin_audit_logs`.
   - Verified in Scenario H: zero false audit records are created when conflicts are rejected.

---

## 6. Expected Version Behavior for Mutation Paths

1. **Field Editing (`daily-insight-field-modal.tsx`):**
   - Passes `expected_version = existingInsight.version`.
   - If another editor committed any change to the row in the meantime, the RPC returns `VERSION_CONFLICT`.
   - The modal displays the conflict message, keeps the user's typed input intact in the textarea, and disables silent re-submission until reloaded.

2. **Full-Form Save (`daily-insights-form-modal.tsx`):**
   - Passes `expected_version = existingInsight.version` (or `null` if creating a brand new record).
   - If the row was modified or published concurrently, the save is rejected with `VERSION_CONFLICT`.
   - Form inputs remain in component state for the user to copy or review.

3. **Set Publishing (`publishDailyRashiInsightsSet`):**
   - Each row being published passes its currently loaded `row.version` as `p_expected_version`.
   - If an editor changed a Rashi's text while the publisher was reviewing the set, that row fails with `VERSION_CONFLICT`, preventing publication of stale review drafts.

4. **Unpublishing / Changing Status to Draft:**
   - Submits `p_status := 'draft'` with `p_expected_version = existingInsight.version`.
   - Rejects the status change if another editor has modified the record concurrently.

---

## 7. Test Matrix & Results

### 7.1 Isolated Database Concurrency Tests (Scenarios A through H)
**Harness:** `python scratch/test_astrology_optimistic_concurrency.py`  
**Database:** Isolated PostgreSQL 18.4 on `127.0.0.1:5433`  
**Orchestration:** Independent database connections per simulated editor session and concurrent worker threads for race conditions.

| Scenario | Objective | Simulated Sequence | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **A. Concurrent edits to different fields** | Prevent Editor B's snapshot from overwriting Editor A's committed field. | 1. Editor A and B load row at v1.<br>2. Editor A commits `career_business` -> advances to v2.<br>3. Editor B submits `general_outlook` with expected v1. | Editor B write rejected with `VERSION_CONFLICT`. Row remains at v2 with Editor A's career guidance preserved intact. | **PASS** |
| **B. Publish-versus-edit race** | Prevent publisher's stale snapshot from restoring old fields or status. | 1. Publisher loads row at v1.<br>2. Editor updates health advice -> row advances to v2.<br>3. Publisher submits `status='published'` with expected v1. | Publisher write rejected with `VERSION_CONFLICT`. Health advice preserved, row remains draft v2. | **PASS** |
| **C. Stale full-form save** | Prevent stale full-form save from overwriting newer row content. | 1. Session loads row at v1.<br>2. Background updates to v2.<br>3. Session submits full form with expected v1. | Full-form save rejected with `VERSION_CONFLICT`. Newer row values completely preserved. | **PASS** |
| **D. Stale unpublish** | Prevent stale unpublish from reverting concurrent changes. | 1. Published row at v1 loaded.<br>2. Editor updates row to v2.<br>3. Stale session attempts unpublish with expected v1. | Unpublish rejected with `VERSION_CONFLICT`. Status and v2 content preserved. | **PASS** |
| **E. Concurrent first insert** | Prevent double insert / database crash on identical identity race. | Thread 1 and Thread 2 concurrently attempt insert for date `2026-10-20`, Rashi 6, `en`. | Thread 1 wins (creates row at v1). Thread 2 hits unique constraint, trapped by `unique_violation` block, and returns structured `VERSION_CONFLICT`. Exactly 1 row exists. | **PASS** |
| **F. Valid create and update** | Ensure legitimate sequential edits advance version monotonically. | 1. Create row -> v1.<br>2. Update with expected v1 -> v2.<br>3. Update with expected v2 -> v3. | Success: row monotonically advanced v1 -> v2 -> v3. Returned version tokens match stored state. | **PASS** |
| **G. Retry after conflict** | Ensure editor can reload and resubmit successfully against new version. | 1. Conflicted write rejected.<br>2. Editor reloads current version (v2).<br>3. Editor submits update with expected v2. | Success: update commits cleanly and advances row to v3. | **PASS** |
| **H. Authorization & Audit regression** | Ensure non-admin is blocked and rejected conflicts create 0 audit logs. | 1. Customer attempts save -> rejected.<br>2. Conflicting admin write executed -> rejected.<br>3. Audit log count verified before and after. | Customer rejected with `Unauthorized`. Audit log count remained identical (0 false audit records created). | **PASS** |

### 7.2 Jest & Regression Test Suites

| Test Suite | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **AST-09 OCC Jest Suite** | `npx jest __tests__/daily_astrology_optimistic_concurrency.test.ts` | **PASS** (15/15) | Verifies Migration 049 AST invariants, column constraints, overload drops, and Admin UI contracts. |
| **AST-08 Matrix Coordinator** | `node scratch/test_astrology_matrix_coordinator.mjs` | **PASS** (13/13) | Verifies date/language identity bounds, out-of-order request protection, and modal invalidation. |
| **Admin Field & Import Modals** | `node scratch/test_bulk_import_and_field_modal.mjs` | **PASS** (14/14) | Verifies single-field rendering, CSV parsing, and template generation. |
| **Dedicated Field Modal Focus** | `node scratch/test_field_specific_modal.mjs` | **PASS** (15/15) | Verifies field isolation and published status warning dialogs. |
| **AST-01 Admin RPC Hardening** | `npx jest __tests__/daily_astrology_admin_rpc_hardening.test.ts` | **PASS** (17/17) | Verifies migration 047 authorization checks, null guards, and audit trail generation. |
| **AST-07 Subscription Payments** | `npx jest __tests__/astrology_subscription_payment_serialization.test.ts` | **PASS** (14/14) | Verifies migration 048 advisory locking, customer serialization, and term append logic. |
| **Astrology Cache Security** | `npx jest __tests__/daily_astrology_cache_security.test.tsx` | **PASS** (10/10) | Verifies client caching boundaries and customer entitlement separation. |
| **Astrology Entitlement Reval** | `npx jest __tests__/daily_astrology_entitlement_revalidation.test.tsx` | **PASS** (11/11) | Verifies entitlement revalidation across background resumes. |

### 7.3 TypeScript & Linter Verification

| Verification Target | Command | Result |
| :--- | :--- | :--- |
| **Admin TypeScript Compilation** | `npx tsc --noEmit` (`c:\Projects\kashi-veda-admin`) | **PASS** (0 errors) |
| **Admin ESLint** | `npx eslint lib/actions/... components/...` | **PASS** (0 errors, 0 warnings) |

---

## 8. Production Build Verification

### Command Executed:
`npm run build` in `C:\Projects\kashi-veda-admin`

### Result:
Failed as anticipated due to the pre-existing unrelated configuration error:
```text
Error: Turbopack build failed with 1 error:
./app/(dashboard)/reviews/page.tsx:5:14
Error: Route segment config "dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it.
  3 | import { ReviewListView } from "@/components/admin/reviews/review-list-view";
  4 |
> 5 | export const dynamic = "force-dynamic";
```

### Scope Compliance:
In strict adherence to Prompt Section 7 and 8 limits, `app/(dashboard)/reviews/page.tsx` was **not touched**. The error is unrelated to AST-09 and has been documented accurately.

---

## 9. Items Remaining Unverified / Limitations

1. **Remote Supabase Deployment:** In accordance with user rules, migration 049 was not deployed to any remote Supabase environment. It was tested locally in an isolated disposable PostgreSQL 18.4 database running locally.
2. **AST-10 Partial Publishing Reporting:** AST-10 is intentionally out of scope. Bulk publishing currently halts or records individual errors, but comprehensive partial publishing progress summaries will be addressed under AST-10.

---

## 10. Confirmation of Invariants & Scope Boundaries

1. **AST-10 through AST-21:** None of the later findings (AST-10 partial publish, AST-11 CSV overwrite, AST-12 CSV parser, AST-13 date navigation, AST-14 legacy timestamps) were implemented.
2. **Historical Migrations 001–048:** Completely unmodified and pristine. Migration 049 is strictly forward-only.
3. **Preservation of Prior Fixes:** AST-01 (RPC hardening), AST-07 (advisory lock serialization), and AST-08 (matrix request coordinator) remain completely intact and passing all regression suites.
4. **No Production Database Changes:** Zero mutations performed on production systems.

---
*End of KASHIVEDA_AST_09_IMPLEMENTATION_REPORT.md*
