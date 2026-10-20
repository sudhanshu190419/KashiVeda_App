# AST-11 Implementation & Database Contract Verification Report

## Executive Summary

This report documents the implementation and focused database-contract verification of **AST-11** (CSV Importer Database-Identity & Overwrite Enforcement) from `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`.

Following an audit check regarding the RPC signature and AST-09 optimistic-concurrency compatibility:
1. **Source Code vs. Documentation Verification**: The source migrations (`045`, `047`, `049`, and `050`), table definitions, and application callers were inspected in detail. The investigation confirmed that **Migration 050 in `supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql` was implemented with the true canonical 14-parameter signature** extending Migration 049. The unrelated parameters (`p_general_prediction`, `p_lucky_color_code`, `p_lucky_time`, etc.) mentioned in the prior report draft were a documentation artifact in the markdown report itself, not in the actual SQL or application code.
2. **AST-09 Null Expected Version Verification**: Verified that when an existing daily insight row is targeted with `p_allow_overwrite = TRUE`, providing a `NULL` or omitted `p_expected_version` is strictly rejected with `error_code: 'VERSION_CONFLICT'`. The row's content, publication status, version, and audit logs remain unchanged.
3. **Exception Handling Hardening**: Migration 050 was further hardened to ensure that if a `unique_violation` is raised during a concurrent insert race that is *unrelated* to the composite identity `(insight_date, rashi_id, language)`, the original exception is re-raised via `IF v_existing_id IS NULL THEN RAISE; END IF;`, rather than being masked as an overwrite skip or conflict.
4. **Database Write Contract Verification**: The full migration chain (`045` -> `047` -> `049` -> `050`) was executed in an isolated PostgreSQL 18.4 database on port 5433. Database catalog queries confirmed that `daily_rashi_insights` and `admin_save_daily_rashi_insight` conform exactly to the canonical schema across all 14 parameters, with zero conflicting overloads and zero foreign fields.
5. **All Application Callers Verified**: Every caller of `admin_save_daily_rashi_insight` across the admin application—including draft creation, field-specific editing, full-form saving, bulk CSV import, and daily-set publishing—resolves unambiguously to the canonical function and successfully executes against the actual table columns.

---

## 1. RPC Signature Discrepancy Analysis & Source Evidence

### Inspected Files
1. `supabase/migrations/045_daily_vedic_astrology_insights.sql`: Base table definition and 12-parameter unversioned RPC.
2. `supabase/migrations/047_harden_daily_astrology_admin_rpcs.sql`: Added AST-01 administrator authentication guard (`is_admin()`).
3. `supabase/migrations/049_daily_astrology_optimistic_concurrency.sql`: Added `version INTEGER NOT NULL DEFAULT 1` to `daily_rashi_insights`, dropped 12-parameter overload, and added `p_expected_version INTEGER DEFAULT NULL` (13 parameters).
4. `supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql`: Dropped 13-parameter overload and added `p_allow_overwrite BOOLEAN DEFAULT TRUE` (14 parameters).
5. `C:\Projects\kashi-veda-admin\lib\actions\daily-insights-management.ts`: Callers in `saveDailyRashiInsight`, `bulkSaveDailyRashiInsightsDrafts`, and `publishDailyRashiInsightsSet`.
6. `C:\Projects\kashi-veda-admin\components\admin\astrology\daily-insights\`: Callers in `daily-insight-field-modal.tsx`, `daily-insights-form-modal.tsx`, and `bulk-import-modal.tsx`.

### Findings
- **Did the signature discrepancy exist in the actual SQL?**
  **NO.** Migration 050 was already defined with the canonical schema parameters (`p_rashi_name`, `p_general_outlook`, `p_career_business`, etc.) and the 14th argument `p_allow_overwrite BOOLEAN DEFAULT TRUE`.
- **Where did the discrepancy arise?**
  The discrepancy existed solely in Section 4 of the initial `KASHIVEDA_AST_11_IMPLEMENTATION_REPORT.md` markdown draft, where sample SQL snippets with foreign horoscope column names (`p_general_prediction`, `p_lucky_color_code`, `p_lucky_time`, `p_mood_of_day`, `p_remedy`, etc.) were erroneously included in the documentation text.
- **Table Columns vs. Function Parameters**:
  The underlying PostgreSQL table `daily_rashi_insights` has never had those foreign columns. As verified by `information_schema.columns`, the table columns are exclusively:
  `id`, `insight_date`, `rashi_id`, `rashi_name`, `language`, `general_outlook`, `career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`, `auspicious_color`, `auspicious_number`, `status`, `published_at`, `created_by`, `created_at`, `updated_at`, `version`.

---

## 2. Canonical Database & RPC Contract

### Verified Table Schema (`public.daily_rashi_insights`)
```sql
CREATE TABLE public.daily_rashi_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_date DATE NOT NULL,
    rashi_id SMALLINT NOT NULL CHECK (rashi_id BETWEEN 1 AND 12),
    rashi_name TEXT NOT NULL,
    language VARCHAR(5) NOT NULL DEFAULT 'en',
    general_outlook TEXT NOT NULL,
    career_business TEXT,
    finance_wealth TEXT,
    love_relationships TEXT,
    health_wellbeing TEXT,
    auspicious_color TEXT,
    auspicious_number INTEGER,
    status public.astrology_content_status NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_daily_rashi_insights_date_rashi_lang UNIQUE (insight_date, rashi_id, language)
);
```

### Verified Canonical RPC Signature (`public.admin_save_daily_rashi_insight`)
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
    p_expected_version INTEGER DEFAULT NULL,
    p_allow_overwrite BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
```

### Overload Cleanliness & Security Grants
1. **Overload Cleanup**:
   ```sql
   DROP FUNCTION IF EXISTS public.admin_save_daily_rashi_insight(
       DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status, INTEGER
   );
   ```
   PostgreSQL `pg_proc` catalog queries confirm that exactly **one** overload of `admin_save_daily_rashi_insight` exists in `public`.
2. **Access Control**:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
       DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status, INTEGER, BOOLEAN
   ) FROM PUBLIC, anon;

   GRANT EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
       DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status, INTEGER, BOOLEAN
   ) TO authenticated, service_role;
   ```

---

## 3. Caller Alignment & Backward Compatibility

Because `p_allow_overwrite` has a default value of `TRUE`, existing callers that do not supply this argument retain their expected behavior without breaking or requiring signature adjustments:

| Caller / Workflow | File Location | Parameters Supplied | `p_allow_overwrite` Behavior |
|---|---|---|---|
| **Field-specific Modal Edit** | `components/admin/astrology/daily-insights/daily-insight-field-modal.tsx` -> `saveDailyRashiInsight` | 13 parameters (`p_expected_version` included) | Defaults to `TRUE`; OCC enforces expected version. |
| **Full-form Modal Save** | `components/admin/astrology/daily-insights/daily-insights-form-modal.tsx` -> `saveDailyRashiInsight` | 13 parameters (`p_expected_version` included) | Defaults to `TRUE`; OCC enforces expected version. |
| **Publish Daily Set (12 Rashis)** | `lib/actions/daily-insights-management.ts` -> `publishDailyRashiInsightsSet` | 13 parameters (`p_status = 'published'`, `p_expected_version` included) | Defaults to `TRUE`; publishes approved content and advances version. |
| **Bulk CSV Importer** | `lib/actions/daily-insights-management.ts` -> `bulkSaveDailyRashiInsightsDrafts` | 14 parameters (`p_expected_version` and `p_allow_overwrite` explicitly supplied) | Explicitly passes administrator's overwrite choice (`allowOverwrite: boolean`). |

---

## 4. Atomic Server/Database Overwrite Guard Mechanics & AST-09 Compatibility

### A. When Overwrite Is Disabled (`p_allow_overwrite = FALSE`)
1. **Row-Level Lock Acquisition**:
   ```sql
   SELECT id, version INTO v_existing_id, v_current_version
   FROM public.daily_rashi_insights
   WHERE insight_date = p_insight_date
     AND rashi_id = p_rashi_id
     AND language = p_language
   FOR UPDATE;
   ```
2. **Immediate Rejection**:
   ```sql
   IF v_existing_id IS NOT NULL THEN
       IF NOT p_allow_overwrite THEN
           RETURN jsonb_build_object(
               'success', false,
               'skipped', true,
               'error_code', 'OVERWRITE_DISALLOWED',
               'error', format('Record already exists for %s (Rashi %s, %s) and overwrite is disabled.',
                               p_insight_date, p_rashi_id, p_language),
               'current_version', v_current_version,
               'expected_version', p_expected_version,
               'record_id', v_existing_id
           );
       END IF;
   ```
3. **Database Guarantees**:
   - The existing row is completely untouched (content, published status, `published_at`, `version`, `updated_at`).
   - `version` is not incremented.
   - Zero audit log entries are generated in `admin_audit_logs`.
   - The Server Action maps this to outcome `skipped` (`skip_reason: 'Record already exists and overwrite is disabled'`).

### B. When Overwrite Is Enabled (`p_allow_overwrite = TRUE`) & AST-09 Version Checks
1. **Optimistic Concurrency Control Guard**:
   ```sql
   IF p_expected_version IS NULL OR v_current_version <> p_expected_version THEN
       RETURN jsonb_build_object(
           'success', false,
           'error_code', 'VERSION_CONFLICT',
           'error', format('Conflict: Daily insight for %s (Rashi %s, %s) was modified by another editor. Expected version %s, current version is %s.',
                           p_insight_date, p_rashi_id, p_language,
                           COALESCE(p_expected_version::text, 'null'), v_current_version::text),
           'current_version', v_current_version,
           'expected_version', p_expected_version,
           'record_id', v_existing_id
       );
   END IF;
   ```
2. **Behavior on Existing Rows**:
   - **`p_expected_version` is NULL or omitted**: When an existing row is targeted and the caller supplies `NULL`, `p_expected_version IS NULL` evaluates to `TRUE`. The RPC rejects the write immediately with `error_code: 'VERSION_CONFLICT'`, preserving the database row and creating 0 audit entries.
   - **`p_expected_version` does not match `v_current_version`**: Evaluates to `TRUE`. The RPC cleanly returns `error_code: 'VERSION_CONFLICT'`.
   - **`p_expected_version` matches `v_current_version`**: The update proceeds, increments `version = v_current_version + 1`, and logs a single audit entry.

### C. Behavior on Genuinely New Rows
When `v_existing_id IS NULL`:
1. If caller supplied `p_expected_version IS NOT NULL`, the RPC returns `error_code: 'RECORD_NOT_FOUND'`.
2. If `p_expected_version IS NULL`, the insert proceeds with `version = 1`.
3. If a concurrent transaction wins an insert race, the `unique_violation` block handles it:
   ```sql
   EXCEPTION
       WHEN unique_violation THEN
           SELECT id, version INTO v_existing_id, v_current_version
           FROM public.daily_rashi_insights
           WHERE insight_date = p_insight_date
             AND rashi_id = p_rashi_id
             AND language = p_language;

           -- If the violated constraint was not the composite identity, re-raise original exception
           IF v_existing_id IS NULL THEN
               RAISE;
           END IF;

           IF NOT p_allow_overwrite THEN
               RETURN jsonb_build_object(
                   'success', false,
                   'skipped', true,
                   'error_code', 'OVERWRITE_DISALLOWED',
                   'error', format('Record was created concurrently for %s (Rashi %s, %s) and overwrite is disabled.',
                                   p_insight_date, p_rashi_id, p_language),
                   'current_version', v_current_version,
                   'expected_version', p_expected_version,
                   'record_id', v_existing_id
               );
           END IF;

           RETURN jsonb_build_object(
               'success', false,
               'error_code', 'VERSION_CONFLICT',
               'error', format('Conflict: Another editor created this daily insight concurrently (current version %s). Please reload.',
                               COALESCE(v_current_version::text, '1')),
               'current_version', v_current_version,
               'expected_version', p_expected_version,
               'record_id', v_existing_id
           );
   ```

---

## 5. Authoritative Per-Row Import Result Contract

```typescript
export type BulkImportRowOutcome =
  | 'inserted'   // Successfully created new DB record
  | 'updated'    // Successfully updated existing DB record
  | 'skipped'    // Existing record preserved because allowOverwrite=false
  | 'duplicate'  // Duplicate composite key within the submitted CSV payload
  | 'conflict'   // Rejected due to AST-09 OCC version mismatch
  | 'failed';    // Validation or RPC execution error
```

### Summary Count Reconciliation
```typescript
const insertedCount = results.filter((r) => r.outcome === 'inserted').length;
const updatedCount = results.filter((r) => r.outcome === 'updated').length;
const skippedCount = results.filter((r) => r.outcome === 'skipped').length;
const conflictedCount = results.filter((r) => r.outcome === 'conflict').length;
const failedCount = results.filter((r) => r.outcome === 'failed').length;
const duplicateCount = results.filter((r) => r.outcome === 'duplicate').length;

return {
  totalSubmitted: items.length,
  insertedCount,
  updatedCount,
  skippedCount,
  conflictedCount,
  failedCount,
  duplicateCount,
  savedCount: insertedCount + updatedCount,
  results,
};
```
Identity check: `totalSubmitted === insertedCount + updatedCount + skippedCount + conflictedCount + failedCount + duplicateCount`.

---

## 6. Comprehensive Test Matrix & Results

| Test Scenario | Environment | Method | Outcome |
|---|---|---|---|
| **Database Schema Verification** | PostgreSQL 18.4 (Port 5433) | `python scratch/verify_rpc_schema_contract.py` | PASS: Verified all 18 table columns and exactly 14 RPC parameters; confirmed absence of foreign columns and overloads. |
| **A. Same Rashi, different dates** | Node / TS | `scratch/test_ast_11_csv_identity.mjs` | PASS: Distinct valid identities preserved. |
| **B. Same Rashi, different languages** | Node / TS | `scratch/test_ast_11_csv_identity.mjs` | PASS: English and Hindi for same Rashi/date do not collide. |
| **C. Exact duplicate within CSV** | Node / TS | `scratch/test_ast_11_csv_identity.mjs` | PASS: Colliding row flagged deterministically as `duplicate`. |
| **D. Overwrite disabled with existing DB row** | PostgreSQL 18.4 | `scratch/test_ast_11_db_overwrite_concurrency.py` | PASS: RPC returned `OVERWRITE_DISALLOWED`, version stayed 1, 0 audit entries. |
| **E. Row absent from visible matrix** | PostgreSQL 18.4 | `scratch/test_ast_11_db_overwrite_concurrency.py` | PASS: DB RPC enforced overwrite guard regardless of UI matrix presence. |
| **F. Overwrite enabled with valid version** | PostgreSQL 18.4 | `scratch/test_ast_11_db_overwrite_concurrency.py` | PASS: Content updated, version advanced 1 -> 2, audit entry created. |
| **G. Concurrent create after preview** | PostgreSQL 18.4 (2 Sessions) | `scratch/test_ast_11_db_overwrite_concurrency.py` | PASS: Competitor's row created in Session 2 remained untouched; Session 1 returned `OVERWRITE_DISALLOWED`. |
| **H. Concurrent update after preview** | PostgreSQL 18.4 (2 Sessions) | `scratch/test_ast_11_db_overwrite_concurrency.py` | PASS: Stale overwrite attempt in Session 1 rejected with `VERSION_CONFLICT`; Session 2's edits preserved. |
| **I. Result identities & counts reconciliation** | Node / TS | `scratch/test_ast_11_csv_identity.mjs` | PASS: All per-row outcomes match identities, sum equals total submitted. |
| **J. Authorization & audit integrity** | PostgreSQL 18.4 | `scratch/test_ast_11_db_overwrite_concurrency.py` | PASS: Non-admin rejected by AST-01 guard; 0 audit entries created. |
| **K. NULL expected_version on existing row** | PostgreSQL 18.4 | `scratch/test_ast_09_null_version_compatibility.py` | PASS: RPC rejected update with `VERSION_CONFLICT`; row, version, and audit logs untouched. |
| **Write Contract Workflow Integration** | PostgreSQL 18.4 | `python scratch/verify_rpc_schema_contract.py` | PASS: Exercised Caller 1 (Draft create), Caller 2 (Full-form update), Caller 3 (Publish set), Caller 4 (OCC conflict), Caller 5 (Disallow overwrite), Caller 6 (Insert race), Caller 7 (AST-01 auth). |

---

## 7. Isolated PostgreSQL Execution Commands & Results

All database integration tests were executed against an isolated PostgreSQL 18.4 instance on port 5433 initialized from migrations `045`, `047`, `049`, and `050`.

```bash
# Command 1: AST-09 NULL Expected Version Compatibility
python scratch/test_ast_09_null_version_compatibility.py
# Outcome: 100% SUCCESS
# Verified: Initial insert at v1 -> RPC with expected_version=NULL and allow_overwrite=TRUE
# rejected with VERSION_CONFLICT -> row/version untouched -> zero audit entries -> valid update advances to v2 ->
# allow_overwrite=FALSE preserves v2 row.

# Command 2: Database Overwrite & Concurrency Suite (Scenarios D, E, F, G, H, J, K)
python scratch/test_ast_11_db_overwrite_concurrency.py
# Outcome: 100% SUCCESS

# Command 3: Full Schema Catalog & Live RPC Caller Execution
python scratch/verify_rpc_schema_contract.py
# Outcome: 100% SUCCESS (verified 18 table columns, 14 RPC parameters, 0 overloads, 7 caller workflows)

# Command 4: AST-09 Optimistic Concurrency Control Regression Suite
python scratch/test_astrology_optimistic_concurrency.py
# Outcome: 100% SUCCESS (Scenarios A through H passed)
```

---

## 8. TypeScript, Lint, Regression, and Build Results

1. **Jest Test Suites**:
   - `npm test -- __tests__/daily_astrology_csv_identity_overwrite.test.ts`: **17/17 tests PASSED**.
   - All 10 daily astrology suites (`npm test -- __tests__/daily_astrology`): **136/136 tests PASSED**.
2. **Prior AST Regressions**:
   - AST-08 Matrix Coordinator (`test_astrology_matrix_coordinator.mjs`): **13/13 tests PASSED**.
   - AST-10 Publishing Results (`test_ast_10_publishing_results.mjs`): **7/7 tests PASSED**.
3. **TypeScript Compilation**:
   - `npx tsc --noEmit` in `kashi-veda-admin`: **0 errors**.
4. **ESLint**:
   - `npx eslint components/admin/astrology/daily-insights/ lib/actions/daily-insights-management.ts lib/types/daily-insights-management.ts` in `kashi-veda-admin`: **0 errors, 0 warnings**.
5. **Production Build Validation**:
   - `npm run build` executed in `kashi-veda-admin`.
   - The only build failure was the pre-existing, documented Next.js Turbopack config issue in `app/(dashboard)/reviews/page.tsx:5:14` (`Route segment config "dynamic" is not compatible with nextConfig.cacheComponents`).
   - Per project instructions, `app/(dashboard)/reviews/page.tsx` was NOT modified.

---

## 9. Remaining Limitations & Scope Limits

1. **AST-12 (CSV Parser/Preview Hardening)**:
   - Malformed CSV quoting, unescaped commas, numeric token coercion, and FileReader lifecycle remain as in the original implementation and will be addressed in AST-12.
2. **Batch Transaction Granularity**:
   - Each row in `bulkSaveDailyRashiInsightsDrafts` executes through the authoritative RPC individually. If a transport interruption occurs mid-batch, rows committed prior to failure remain committed while remaining rows are reported with outcome `failed` (`error_code: 'DB_TRANSPORT_ERROR'`).
3. **Production Safety**:
   - No migration was deployed to remote or production Supabase databases.
   - No production database was accessed or modified.
