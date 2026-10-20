# KashiVeda Feature 02 — AST-16 Implementation Report
## Make Plan and Legacy-Content Mutations Atomic With Their Audit Records

**Target Finding:** AST-16  
**Repositories:**
- Admin Application: `C:\Projects\kashi-veda-admin`
- Backend & Migrations: `C:\Projects\KashiVeda`
**Scope:** AST-16 only. No alterations to AST-01 through AST-15 remediation. No deployment to remote or production databases.

---

### 1. Verdict

**Confirmed Issue:**
In `lib/actions/astrology-management.ts`, the mutations in `saveAstrologyPlan` (plan creation & plan update) and `saveAstrologyContent` (legacy-content creation & legacy-content update) executed separate, uncoordinated writes:
1. The business mutation was performed directly via `supabase.from("astrology_subscription_plans")` or `supabase.from("astrology_content")`.
2. Immediately afterward, a secondary write was attempted to `supabase.from("admin_audit_logs").insert(...)`.
3. The response `{ error }` from `supabase.from("admin_audit_logs").insert` was completely discarded without error handling or transaction rollback.
4. Furthermore, Migration 012 grants only `SELECT` privileges to `authenticated` users on `admin_audit_logs`, meaning direct client-session INSERTs were denied by PostgreSQL/RLS; yet the Server Action reported `{ success: true }`, falsely claiming success without any audit log being committed.
5. Even if direct INSERT permissions had existed, executing the business write and audit write across two separate HTTP requests completely lacked ACID atomicity: a crash, connection failure, or constraint violation between the two statements would leave the business record mutated without an audit trail.

**Status:** **FULLY RESOLVED**.
All plan and legacy-content mutations are now delegated to database-owned `SECURITY DEFINER` RPCs (`public.admin_save_astrology_plan` and `public.admin_save_astrology_content`). Inside a single atomic PostgreSQL transaction block:
- The actor identity is derived strictly from `auth.uid()`.
- Admin authorization is verified via `public.is_admin(auth.uid())`.
- The business table write (`INSERT` or `UPDATE`) and the audit record write (`INSERT INTO public.admin_audit_logs`) are executed together.
- If the audit write fails or is rejected, the business mutation rolls back completely.
- If the business mutation fails validation or constraints, zero audit logs are created.
- The Server Actions propagate database RPC errors and only revalidate Next.js caches on complete transaction success.

---

### 2. Root Cause Analysis

1. **Uncoordinated Non-Atomic Calls:**
   In `lib/actions/astrology-management.ts`:
   - `saveAstrologyPlan`: Performed `supabase.from("astrology_subscription_plans").insert(...)` (or `.update(...)`), followed by:
     ```typescript
     await supabase.from("admin_audit_logs").insert({
       actor_user_id: user.id,
       action: planId ? "astrology_plan_updated" : "astrology_plan_created",
       entity_type: "astrology_subscription_plans",
       ...
     });
     ```
     The returned `{ data, error }` from `insert` was not destructured or checked.
   - `saveAstrologyContent`: Performed direct `supabase.from("astrology_content").insert(...)` (or `.update(...)`), followed by:
     ```typescript
     await supabase.from("admin_audit_logs").insert({
       actor_user_id: user.id,
       action: contentId ? "astrology_content_updated" : "astrology_content_created",
       ...
     });
     ```
     The returned `{ data, error }` was likewise ignored.

2. **Schema & Privilege Misalignment:**
   - In Migration 010 (`010_engagement.sql`), `public.admin_audit_logs` is defined with columns `actor_user_id UUID`, `action TEXT`, `entity_type TEXT`, `entity_id TEXT`, `before_json JSONB`, `after_json JSONB`, `details JSONB`, `ip_address INET`, `created_at TIMESTAMPTZ`.
   - In Migration 012 (`012_rls_and_permissions.sql`), RLS is enabled on `admin_audit_logs` with a single policy: `admin_audit_logs_select_admin` allowing only `SELECT` for administrators.
   - Migration 012 explicitly granted `SELECT` to `authenticated`, but never granted `INSERT`.
   - Consequently, any direct client attempt by `authenticated` to `INSERT` into `admin_audit_logs` is rejected by PostgreSQL. Because the code ignored the returned `error`, the mutation succeeded while the audit record silently failed to persist.

3. **Lack of Transaction Rollback:**
   Even if permissions were granted to `authenticated`, a two-request HTTP client pattern cannot provide transaction rollback. If network connectivity drops or the database fails during the second call, the mutation remains committed without an audit record.

---

### 3. Security Design

1. **Database-Owned Transaction Scope:**
   - Both operations are implemented in PostgreSQL stored procedures (`PL/pgSQL`).
   - By definition, an unhandled exception inside a PostgreSQL function rolls back the entire transaction, guaranteeing 100% atomicity between business table mutations and audit logging.

2. **Trusted Server Auth Context (`auth.uid()`):**
   - The actor ID is strictly derived inside PostgreSQL using `v_admin_id := auth.uid()`.
   - No browser-supplied or untrusted client payload actor ID is accepted or trusted.
   - If `auth.uid()` is `NULL`, the function aborts immediately with `Unauthorized`.

3. **Authoritative Admin Verification (`public.is_admin`):**
   - The function calls `public.is_admin(v_admin_id)`.
   - Callers lacking admin role (`customer`, `pandit`, or unauthenticated) are immediately rejected with `Unauthorized: Administrator privileges required...`.

4. **Execution Permissions & Search Path Hygiene:**
   - Both functions are declared `SECURITY DEFINER SET search_path = public, auth, pg_temp;`.
   - Execution permissions are explicitly revoked from `PUBLIC` and `anon`:
     ```sql
     REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_plan FROM PUBLIC, anon;
     REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_content FROM PUBLIC, anon;
     ```
   - Execution is granted strictly to `authenticated` and `service_role`.

5. **No Dangerous Broadening of Audit Grants:**
   - The `authenticated` role is NOT given direct `INSERT` permissions on `public.admin_audit_logs`.
   - Direct attempts by end users or attackers to forge audit records via Supabase client remain completely blocked by RLS and table grants.

---

### 4. Files Changed

| Repository | File Path | Purpose |
|---|---|---|
| `C:\Projects\KashiVeda` | `supabase/migrations/051_atomic_astrology_plan_content_audit_mutations.sql` | Forward-only migration defining atomic RPCs `admin_save_astrology_plan` and `admin_save_astrology_content`, strict authorization, search_path hygiene, and execution grants. |
| `C:\Projects\kashi-veda-admin` | `lib/actions/astrology-management.ts` | Refactored `saveAstrologyPlan` and `saveAstrologyContent` to delegate to RPCs, eliminate separated direct audit writes, propagate database errors, and protect Next.js cache revalidation. |
| `C:\Projects\KashiVeda` | `scratch/test_ast_16_db_atomic_audit.py` | Isolated PostgreSQL 18.4 integration test script proving ACID rollback on audit failure, actor invariance, and authorization rejection. |
| `C:\Projects\KashiVeda` | `__tests__/daily_astrology_atomic_mutations.test.ts` | Jest test suite verifying AST-16 invariants, RPC delegation, error propagation, and PostgreSQL test runner execution. |

---

### 5. Migration Details

- **File:** `supabase/migrations/051_atomic_astrology_plan_content_audit_mutations.sql`
- **Migration Index:** `051` (strictly sequential after `050_daily_astrology_csv_import_overwrite_guard.sql`).
- **Contents:**
  1. `public.admin_save_astrology_plan(...)`:
     - Parameters: `p_id UUID`, `p_name TEXT`, `p_duration_days INTEGER`, `p_price NUMERIC`, `p_currency CHAR(3)`, `p_daily_in_app_enabled BOOLEAN`, `p_weekly_whatsapp_enabled BOOLEAN`, `p_is_active BOOLEAN`.
     - Validates name length >= 2, duration > 0, price >= 0, currency length = 3.
     - When `p_id` is provided: captures previous values and updates `astrology_subscription_plans`, recording `astrology_plan_updated_by_admin` in `admin_audit_logs` with before/after state in details.
     - When `p_id` is NULL: inserts new row into `astrology_subscription_plans`, recording `astrology_plan_created_by_admin` in `admin_audit_logs`.
  2. `public.admin_save_astrology_content(...)`:
     - Parameters: `p_id UUID`, `p_channel public.astrology_channel`, `p_title TEXT`, `p_body TEXT`, `p_publish_at TIMESTAMPTZ`, `p_expires_at TIMESTAMPTZ`, `p_status public.astrology_content_status`.
     - Validates body length >= 5, ensures `expires_at > publish_at` (enforcing `chk_astrology_content_expiry`).
     - When `p_id` is provided: captures previous channel/title/status, updates `astrology_content`, and logs `astrology_content_updated_by_admin`.
     - When `p_id` is NULL: inserts new row with `created_by = v_admin_id`, and logs `astrology_content_created_by_admin`.
  3. Strict privileges:
     - `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;`
     - `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;`

---

### 6. Mutation Coverage Mapping

| Action in `astrology-management.ts` | Operation | Target Table | Authoritative Atomic RPC | Audit Action in `admin_audit_logs` |
|---|---|---|---|---|
| `saveAstrologyPlan` | Create Plan (`!planId`) | `astrology_subscription_plans` | `public.admin_save_astrology_plan` | `astrology_plan_created_by_admin` |
| `saveAstrologyPlan` | Update Plan (`planId`) | `astrology_subscription_plans` | `public.admin_save_astrology_plan` | `astrology_plan_updated_by_admin` |
| `saveAstrologyContent` | Create Content (`!contentId`) | `astrology_content` | `public.admin_save_astrology_content` | `astrology_content_created_by_admin` |
| `saveAstrologyContent` | Update Content (`contentId`) | `astrology_content` | `public.admin_save_astrology_content` | `astrology_content_updated_by_admin` |

---

### 7. Test Evidence

#### A. Isolated PostgreSQL 18.4 Integration Test Suite
- **Command:** `python scratch/test_ast_16_db_atomic_audit.py`
- **Database:** Isolated local PostgreSQL 18.4 instance on port 5433 (reinitialized for testing).
- **Results:** 9/9 tests passed (16/16 assertions).

```text
--- 1. Setting up Base Schema & Applying Migration 051 ---
PASS: Migration 051 applied successfully to PostgreSQL 18.4.

--- TEST 1: Authenticated Admin Creates Plan Successfully ---
PASS: Plan created and audit record verified atomically: id=1d3502b4-1f22-4bab-8898-eaae427a1054, actor=6a624e52-5852-4875-b630-322807ff0df0

--- TEST 2: Authenticated Admin Updates Plan Successfully ---
PASS: Plan updated with previous values captured in audit log.

--- TEST 3: Authenticated Admin Creates Legacy Content ---
PASS: Legacy content created and audit record verified: id=dac8f31b-627d-48f2-94cd-69fb39396e15

--- TEST 4: Authenticated Admin Updates Legacy Content ---
PASS: Legacy content updated and audit record verified.

--- TEST 5: Unauthenticated Caller is Rejected ---
PASS: Unauthenticated caller rejected cleanly: ERROR:  Unauthorized: Administrator privileges required to manage subscription plans.

--- TEST 6: Non-Admin Authenticated Caller is Rejected ---
PASS: Customer rejected cleanly: ERROR:  Unauthorized: Administrator privileges required to manage astrology content.

--- TEST 7: Actor ID Invariance Check ---
PASS: Actor ID derived strictly from trusted server auth.uid().

--- TEST 8: Injected Audit Log Failure Causes Complete Mutation Rollback ---
PASS: Caught expected database-level audit failure: ERROR:  INJECTED_AUDIT_LOG_FAILURE: Disk full or audit violation
PASS: Verified 100% atomic rollback on audit failure: zero business rows inserted, zero audit rows inserted.

--- TEST 9: Business Mutation Failure Leaves Zero Audit Records ---
PASS: Business failure raised expected exception: ERROR:  Price cannot be negative.
PASS: Verified zero audit records on business validation failure.

======================================================================
ALL 9 ISOLATED POSTGRESQL ATOMIC MUTATION TESTS PASSED (16/16 ASSERTIONS)!
======================================================================
```

#### B. Jest Test Suite (`daily_astrology_atomic_mutations.test.ts`)
- **Command:** `npx jest __tests__/daily_astrology_atomic_mutations.test.ts`
- **Results:** 9/9 tests passed (100% pass).

```text
PASS __tests__/daily_astrology_atomic_mutations.test.ts
  AST-16: Atomic Plan & Legacy-Content Mutations With Audit Records
    √ Requirement 1: Migration 051 exists and defines authoritative atomic RPCs (7 ms)
    √ Requirement 2: Migration 051 RPCs enforce SECURITY DEFINER and search_path hygiene (2 ms)
    √ Requirement 3: Migration 051 enforces auth.uid() and public.is_admin checks (1 ms)
    √ Requirement 4: Migration 051 revokes execution from PUBLIC/anon and grants strictly to authenticated/service_role (1 ms)
    √ Requirement 5: Migration 051 writes audit logs in-transaction for both create and update operations (1 ms)
    √ Requirement 6: Server Action astrology-management.ts delegates plan mutation to RPC (2 ms)
    √ Requirement 7: Server Action astrology-management.ts delegates content mutation to RPC (2 ms)
    √ Requirement 8: Server Actions handle database errors explicitly and avoid premature revalidation (1 ms)
    √ Requirement 9: Real PostgreSQL ACID rollback & authorization verified via isolated runner (2455 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        3.574 s
```

---

### 8. Regression Checks

1. **Full `daily_astrology` Test Suite:**
   - **Command:** `npx jest __tests__/daily_astrology`
   - **Result:** **15 passed, 15 total suites; 260 passed, 260 total tests**.
   - Preserves AST-01 through AST-15 contracts without breakage.

2. **Timezone & Navigation Regression Scripts:**
   - `node scratch/test_ast_14_timezone_contract.mjs`: **9/9 passed**.
   - `node scratch/test_ast_13_timezone_stepping.mjs`: **4/4 passed**.
   - `node scratch/test_ast_11_csv_identity.mjs`: **4/4 passed**.

3. **Database Concurrency Regression Scripts:**
   - `python scratch/test_ast_11_db_overwrite_concurrency.py`: **All scenarios (D through K) passed**.
   - `python scratch/test_astrology_optimistic_concurrency.py`: **All 8 OCC scenarios (A through H) passed**.

4. **TypeScript & ESLint Checks:**
   - `npx tsc --noEmit` in `C:\Projects\kashi-veda-admin`: **0 errors**.
   - `npx eslint lib/actions/astrology-management.ts` in `C:\Projects\kashi-veda-admin`: **0 errors, 0 warnings**.

5. **Production Build Validation:**
   - `npm run build` in `C:\Projects\kashi-veda-admin`:
   - Only the known pre-existing blocker in `app/(dashboard)/reviews/page.tsx` (`Route segment config "dynamic" is not compatible with nextConfig.cacheComponents`) was encountered. All astrology actions, modules, and components compiled without issue.

---

### 9. Limitations

- **Staging / Remote DB Untouched:** Verification was performed using an isolated local PostgreSQL 18.4 test instance emulating Supabase auth context and schema. Staging and production databases were deliberately not connected to or modified, adhering strictly to safety guidelines.
- **Reviews Route Segment Configuration:** The Turbopack cache-components incompatibility in `app/(dashboard)/reviews/page.tsx` is outside AST-16 and remains untouched.

---

### 10. Deployment Status

- **Database Migrations:** Migration 051 has been written to `supabase/migrations/051_atomic_astrology_plan_content_audit_mutations.sql`. It has **NOT** been deployed or pushed to any remote or production database.
- **Application Code:** All changes remain local to `C:\Projects\kashi-veda-admin` and `C:\Projects\KashiVeda`. No deployment was performed.
