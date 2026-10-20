# KASHIVEDA — AST-01 IMPLEMENTATION REPORT

**Remediation Target:** AST-01 (Unauthenticated callers may bypass authorization checks in administrative daily astrology RPCs)  
**Reference Feature Audit:** `C:\Projects\KashiVeda\KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`  
**Date:** 2026-10-10  
**Scope:** Local remediation only — No production deployment or modifications to historical migrations.

---

## 1. Root Cause Analysis

In Migration 045 (`supabase/migrations/045_daily_vedic_astrology_insights.sql`), two administrative PostgreSQL functions were defined with `SECURITY DEFINER`:

1. `public.admin_save_daily_rashi_insight`
2. `public.admin_list_daily_rashi_insights`

Both functions exhibited two compounding security defects:

### A. Defective SQL Caller Guard (`v_admin_id IS NOT NULL`)
The authorization checks inside both function bodies were written as:
```sql
v_admin_id := auth.uid();
IF v_admin_id IS NOT NULL AND NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required...';
END IF;
```
When an unauthenticated caller invoked either function via PostgREST RPC (`POST /rest/v1/rpc/admin_save_daily_rashi_insight` or `POST /rest/v1/rpc/admin_list_daily_rashi_insights`) with anonymous credentials, `auth.uid()` evaluated to `NULL`. Consequently, `v_admin_id IS NOT NULL` evaluated to `FALSE`. The condition `FALSE AND ...` evaluated to `FALSE`, bypassing the `RAISE EXCEPTION` block entirely.

- In `admin_list_daily_rashi_insights`, anonymous callers were able to read all 12 published and draft Rashi insights (including premium career, finance, love, and health sections) without any subscription entitlement.
- In `admin_save_daily_rashi_insight`, anonymous callers could insert or overwrite daily insight records with `created_by = NULL` and completely bypass administrative audit logging.

### B. Missing Revocation of Default `PUBLIC` Execution Privileges
Under PostgreSQL default privileges, newly created functions grant `EXECUTE` to the `PUBLIC` pseudo-role (which includes `anon`). Migration 045 executed:
```sql
GRANT EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights TO authenticated;
```
However, it failed to execute `REVOKE EXECUTE ... FROM PUBLIC, anon;`. Consequently, the `anon` role retained execution privileges on both `SECURITY DEFINER` functions.

---

## 2. Exact Files Changed

| File | Status | Description |
| --- | --- | --- |
| `supabase/migrations/047_harden_daily_astrology_admin_rpcs.sql` | **NEW** | Forward-only database migration redefining both functions with strict null-auth guards and hardened execution privileges. |
| `__tests__/daily_astrology_admin_rpc_hardening.test.ts` | **NEW** | Comprehensive Jest test suite covering AST-01 authorization state machine, migration SQL invariants, Server Action compatibility, and public catalog isolation. |
| `supabase/migrations/045_daily_vedic_astrology_insights.sql` | **UNMODIFIED** | Preserved historical migration intact. |
| `supabase/migrations/046_harden_is_admin_probing_guard.sql` | **UNMODIFIED** | Preserved historical migration intact. |
| Application source code (`src/`, `components/`, etc.) | **UNMODIFIED** | No changes required; existing Admin callers are 100% compatible. |

---

## 3. New Migration Contents and Intended Security Effects

File: `C:\Projects\KashiVeda\supabase\migrations\047_harden_daily_astrology_admin_rpcs.sql`

### 3.1 Strict Authorization Guards
Both functions now explicitly require non-null authenticated identity and admin role:
```sql
v_admin_id := auth.uid();
-- AST-01 Guard: Reject unauthenticated callers AND callers lacking administrative privileges
IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to manage daily insights.';
END IF;
```
For `admin_list_daily_rashi_insights`:
```sql
v_admin_id := auth.uid();
-- AST-01 Guard: Reject unauthenticated callers AND callers lacking administrative privileges
IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required to inspect daily insights.';
END IF;
```

### 3.2 Security Evaluation Matrix Under Hardened Guard

| Caller Type | `auth.uid()` | `is_admin(uid)` | Guard Evaluation | Result |
| --- | --- | --- | --- | --- |
| **Anonymous (`anon`)** | `NULL` | N/A | `v_admin_id IS NULL` is `TRUE` | **REJECTED (HTTP 400/500 Exception)** |
| **Customer (`customer`)** | Valid UUID | `FALSE` | `NOT is_admin()` is `TRUE` | **REJECTED (HTTP 400/500 Exception)** |
| **Pandit (`pandit`)** | Valid UUID | `FALSE` | `NOT is_admin()` is `TRUE` | **REJECTED (HTTP 400/500 Exception)** |
| **Admin (`admin`)** | Valid UUID | `TRUE` | Both checks `FALSE` | **PERMITTED** |
| **Super Admin (`super_admin`)** | Valid UUID | `TRUE` | Both checks `FALSE` | **PERMITTED** |

### 3.3 Trusted Audit Logging
Because `v_admin_id` is guaranteed non-null after the guard, `created_by` and `actor_user_id` in `public.admin_audit_logs` are always populated from the authenticated session context (`auth.uid()`). A caller cannot spoof actor identities or create untracked records.

---

## 4. Execution Privilege Changes (ACLs)

Migration 047 revokes default privileges and restricts execution strictly to authorized backend roles:

```sql
-- Explicitly revoke execution from PUBLIC pseudo-role and anon role
REVOKE EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status
) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights(
    DATE, VARCHAR(5)
) FROM PUBLIC, anon;

-- Grant execution strictly to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight(
    DATE, SMALLINT, TEXT, VARCHAR(5), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, public.astrology_content_status
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.admin_list_daily_rashi_insights(
    DATE, VARCHAR(5)
) TO authenticated, service_role;
```

---

## 5. Existing Admin Caller Compatibility

In `C:\Projects\kashi-veda-admin\lib\actions\daily-insights-management.ts`, all write operations call `admin_save_daily_rashi_insight` via an authenticated Supabase client:

1. `saveDailyRashiInsight` (Line 126): Individual insight save/publish.
2. `bulkSaveDailyRashiInsightsDrafts` (Line 210): Bulk CSV draft persistence.
3. `publishDailyRashiInsightsSet` (Line 354): Full 12-Rashi publication set.

Each call passes the exact arguments:
- `p_insight_date`: `DATE`
- `p_rashi_id`: `SMALLINT`
- `p_rashi_name`: `TEXT`
- `p_language`: `VARCHAR(5)`
- `p_general_outlook`: `TEXT`
- `p_career_business`: `TEXT` (optional)
- `p_finance_wealth`: `TEXT` (optional)
- `p_love_relationships`: `TEXT` (optional)
- `p_health_wellbeing`: `TEXT` (optional)
- `p_auspicious_color`: `TEXT` (optional)
- `p_auspicious_number`: `INTEGER` (optional)
- `p_status`: `public.astrology_content_status`

Because the function signature and return schema (`{ success, record_id, insight_date, rashi_id, status }`) were preserved exactly, all Admin Server Actions remain 100% compatible without requiring code modifications.

---

## 6. Regression Tests Added

File: `C:\Projects\KashiVeda\__tests__\daily_astrology_admin_rpc_hardening.test.ts`

### Test Coverage (17 Tests)
1. **Migration 047 File Integrity:** Verifies file existence and forward-only status.
2. **Historical Integrity:** Asserts migrations 045 and 046 remain unmodified.
3. **Save RPC Declaration:** Asserts strict `v_admin_id IS NULL OR NOT public.is_admin(v_admin_id)` guard, `SECURITY DEFINER`, and `SET search_path = public, auth, pg_temp`.
4. **List RPC Declaration:** Asserts strict `v_admin_id IS NULL OR NOT public.is_admin(v_admin_id)` guard, `SECURITY DEFINER`, and `SET search_path = public, auth, pg_temp`.
5. **Revoke Declarations:** Asserts explicit `REVOKE EXECUTE ... FROM PUBLIC, anon;`.
6. **Grant Declarations:** Asserts `GRANT EXECUTE ... TO authenticated, service_role;` and no grants to `anon`.
7. **Anonymous List Rejection:** Confirms unauthenticated calls throw unauthorized exception.
8. **Anonymous Save Rejection:** Confirms unauthenticated writes throw unauthorized exception.
9. **Customer Rejection:** Confirms authenticated customers cannot list or save.
10. **Pandit Rejection:** Confirms authenticated Pandits cannot list or save.
11. **Admin List Permitted:** Confirms authorized Admin lists editorial insights including drafts.
12. **Admin Draft Save Permitted:** Confirms authorized Admin saves drafts and records audit logs.
13. **Admin Publish Permitted:** Confirms authorized Admin publishes insights with `published_at` timestamp.
14. **Validation Preservation:** Confirms publishing without general outlook is rejected.
15. **Zero Mutation on Unauthorized:** Confirms rejected attempts create zero records and zero audit logs.
16. **Admin Server Action Compatibility:** Verifies argument contract matching `daily-insights-management.ts`.
17. **Public Catalog Isolation:** Confirms public RPC `get_daily_rashi_insight` and table RLS policies are untouched.

---

## 7. Tests Actually Executed and Results

### Test Execution Summary
Command: `npm test -- __tests__/daily_astrology_admin_rpc_hardening.test.ts`
- **Result:** **PASS** (17 passed, 17 total, Time: 2.771 s)

Full Astrology Test Suite Regression:
Command: `npm test -- __tests__/daily_vedic_astrology_insights.test.tsx __tests__/astrology.test.tsx __tests__/astrology_admin_operations.test.ts __tests__/astrology_delivery_lifecycle.test.ts __tests__/astrology_payment_backend.test.ts`
- **Result:** **PASS** (5 test suites, 86 passed, 86 total, Time: 5.918 s)

Combined Total: **103 passed, 0 failed, 0 skipped**.

---

## 8. Unresolved Issues

None for AST-01. The remediation completely eliminates the unauthenticated authorization bypass locally.

*Note on separate findings:*
- AST-02 (Mobile client memory/AsyncStorage cache lack of per-user isolation) remains open and is deliberately excluded from this phase as instructed.
- Production deployment of migration 047 is pending formal staging review and developer authorization.

---

## 9. Safe Staging Deployment and Verification Requirements

Before deploying Migration 047 to production:

1. **Staging / Remote SQL Execution:**
   Execute `supabase/migrations/047_harden_daily_astrology_admin_rpcs.sql` in the Supabase SQL Editor.
2. **Post-Deployment Verification Matrix:**
   - Execute an anonymous curl call to `POST /rest/v1/rpc/admin_list_daily_rashi_insights`:
     - Expected: `HTTP 401 Unauthorized` or `HTTP 403 Forbidden` (Permission Denied for role `anon`).
   - Execute an anonymous curl call to `POST /rest/v1/rpc/admin_save_daily_rashi_insight`:
     - Expected: `HTTP 401 Unauthorized` or `HTTP 403 Forbidden`.
   - Log in to the Admin Dashboard (`https://admin.kashiveda.org/astrology/daily-insights`) as an Admin:
     - Save a draft: Verify `HTTP 200` and record saved.
     - Publish an insight: Verify `HTTP 200` and `published_at` set.
     - Inspect `public.admin_audit_logs`: Verify `actor_user_id` matches the admin's UUID.
   - Verify mobile customer experience:
     - Open mobile app Astrology tab: Verify `get_daily_rashi_insight` continues to work normally for customers.
