# KashiVeda AST-16 Follow-Up — Security Hardening Report
## Hardening `SECURITY DEFINER` Search Paths and Execution Permissions

**Target Finding:** AST-16 Follow-up Security Review  
**Repositories:**
- Backend & Database Migrations: `C:\Projects\KashiVeda`
- Admin Application: `C:\Projects\kashi-veda-admin`
**Scope:** AST-16 Hardening only. No deployment to remote or production databases. No modification to migrations 001–050. AST-17 remains untouched.

---

### 1. Executive Verdict & Summary

In accordance with the security review, the two privileged stored procedures introduced for AST-16 in migration `051_atomic_astrology_plan_content_audit_mutations.sql`:
- `public.admin_save_astrology_plan(...)`
- `public.admin_save_astrology_content(...)`

have been systematically hardened:
1. **Search Path Hardening (`SET search_path = ''`):**
   - Replaced `SET search_path = public, auth, pg_temp` with `SET search_path = ''`.
   - Explicitly schema-qualified every database object reference (`public.astrology_subscription_plans`, `public.astrology_content`, `public.admin_audit_logs`, `public.is_admin`, `auth.uid`, `public.astrology_channel`, `public.astrology_content_status`, `pg_catalog.length`, `pg_catalog.now`, `pg_catalog.jsonb_build_object`, `pg_catalog.to_jsonb`, `pg_catalog.text`).
   - Standard syntactic constructs (`COALESCE`, `NULLIF`, `TRIM`) are maintained without prefix as language constructs that cannot be shadowed.
2. **Least-Privilege Execution Grants:**
   - Removed unnecessary `service_role` execution grant.
   - Execution permissions are revoked from `PUBLIC`, `anon`, and `service_role`.
   - Execution is granted strictly to `authenticated` (the only role used by the authenticated cookie-session Next.js Server Actions).
3. **Exploit & Shadowing Resistance:**
   - Created isolated tests proving that even if untrusted shadow functions (such as `pg_temp.btrim` or a rogue `pg_temp.is_admin`) are defined in the session, `SET search_path = ''` completely ignores them and executes securely.
4. **Preserved Atomic Rollback & Invariants:**
   - Trusted identity derivation strictly via `auth.uid()`.
   - Strict `public.is_admin(auth.uid())` authorization guard.
   - 100% atomic in-transaction rollback between business table mutations and `public.admin_audit_logs`.

---

### 2. Search-Path Configuration: Before vs. After

| Function | Previous Setting | Hardened Setting | Rationale |
|---|---|---|---|
| `public.admin_save_astrology_plan` | `SET search_path = public, auth, pg_temp` | `SET search_path = ''` | Eliminates search-path traversal and prevents search-path hijacking or trojan shadowing from writable schemas like `pg_temp` or `public`. |
| `public.admin_save_astrology_content` | `SET search_path = public, auth, pg_temp` | `SET search_path = ''` | Same: forces explicit qualification of all tables, types, and functions. |

#### Analysis of Schema `CREATE` Privileges:
- In PostgreSQL, every connected database session possesses its own temporary schema (`pg_temp`), where temporary tables, views, and functions can be created.
- When `search_path` includes `pg_temp` (or relies on default path traversal), an untrusted caller could define a temporary function or operator that shadows an unqualified function call executed inside a `SECURITY DEFINER` procedure running with elevated owner privileges.
- While PostgreSQL 15+ revokes default `CREATE` on schema `public` from `PUBLIC`, permissions can vary across deployment environments, and extension scripts often grant `ALL` on `public`.
- Setting `SET search_path = ''` is the PostgreSQL gold-standard recommendation: it forces all non-system object resolutions to be explicitly qualified (e.g. `public.`, `auth.`), while PostgreSQL system primitives always resolve from `pg_catalog`.

---

### 3. Exact Object Reference Audit

Every database object referenced by both procedures has been audited for explicit schema qualification:

| Identifier | Qualified Name | Schema | Type |
|---|---|---|---|
| `auth.uid()` | `auth.uid()` | `auth` | Function |
| `public.is_admin(...)` | `public.is_admin(...)` | `public` | Function |
| `astrology_subscription_plans` | `public.astrology_subscription_plans` | `public` | Table |
| `astrology_content` | `public.astrology_content` | `public` | Table |
| `admin_audit_logs` | `public.admin_audit_logs` | `public` | Table |
| `astrology_channel` | `public.astrology_channel` | `public` | Custom Enum Type |
| `astrology_content_status` | `public.astrology_content_status` | `public` | Custom Enum Type |
| `length(...)` | `pg_catalog.length(...)` | `pg_catalog` | Built-in Function |
| `now()` | `pg_catalog.now()` | `pg_catalog` | Built-in Function |
| `jsonb_build_object(...)` | `pg_catalog.jsonb_build_object(...)` | `pg_catalog` | Built-in Function |
| `to_jsonb(...)` | `pg_catalog.to_jsonb(...)` | `pg_catalog` | Built-in Function |
| `::text` | `::pg_catalog.text` | `pg_catalog` | Built-in Type Cast |
| `COALESCE(...)` | `COALESCE(...)` | N/A | SQL Syntactic Construct |
| `NULLIF(...)` | `NULLIF(...)` | N/A | SQL Syntactic Construct |
| `TRIM(...)` | `TRIM(...)` | N/A | SQL Syntactic Construct |

---

### 4. Exact Function Signatures & Execution Grants

#### Function 1: `admin_save_astrology_plan`
```sql
CREATE OR REPLACE FUNCTION public.admin_save_astrology_plan(
    p_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_duration_days INTEGER DEFAULT NULL,
    p_price NUMERIC(12,2) DEFAULT NULL,
    p_currency CHAR(3) DEFAULT 'INR',
    p_daily_in_app_enabled BOOLEAN DEFAULT TRUE,
    p_weekly_whatsapp_enabled BOOLEAN DEFAULT TRUE,
    p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
```

#### Function 2: `admin_save_astrology_content`
```sql
CREATE OR REPLACE FUNCTION public.admin_save_astrology_content(
    p_id UUID DEFAULT NULL,
    p_channel public.astrology_channel DEFAULT 'in_app'::public.astrology_channel,
    p_title TEXT DEFAULT NULL,
    p_body TEXT DEFAULT NULL,
    p_publish_at TIMESTAMPTZ DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_status public.astrology_content_status DEFAULT 'draft'::public.astrology_content_status
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
```

#### Execution Grants:
```sql
-- admin_save_astrology_plan
REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- admin_save_astrology_content
REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_content(UUID, public.astrology_channel, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.astrology_content_status) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_astrology_content(UUID, public.astrology_channel, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.astrology_content_status) TO authenticated;
```

#### Verification of Effective Roles:
- **`PUBLIC`**: Revoked.
- **`anon`**: Revoked.
- **`service_role`**: Revoked (No Edge Function or background service calls these admin mutation endpoints; removing it enforces least-privilege).
- **`authenticated`**: Granted (Required by Next.js Server Actions calling `createClient()` with the admin user's JWT).
- **`admin_audit_logs` direct access**: Remains untouched — direct `INSERT` permissions are **NOT** granted to `authenticated` or any untrusted role.

---

### 5. Migration Handling

- **Current Repository State:** Migration `051_atomic_astrology_plan_content_audit_mutations.sql` is an unpublished local file created during AST-16 remediation. It was never pushed, merged, or deployed to any persistent or remote database.
- **Action Taken:** Updated `C:\Projects\KashiVeda\supabase\migrations\051_atomic_astrology_plan_content_audit_mutations.sql` directly in place. This preserves clean migration history and avoids introducing redundant migrations.

---

### 6. Test Evidence

#### A. Isolated PostgreSQL 18.4 Security & Atomic Integration Runner
- **Command:** `python scratch/test_ast_16_db_atomic_audit.py`
- **Database:** Local isolated PostgreSQL 18.4 on port 5433.
- **Results:** All tests passed with 16/16 assertions.

```text
--- 1. Setting up Base Schema & Applying Migration 051 ---
PASS: Migration 051 applied successfully to PostgreSQL 18.4.

--- TEST 0A: SECURITY DEFINER & Search Path Invariants in pg_proc ---
PASS: admin_save_astrology_content confirmed prosecdef=True, proconfig=['search_path=""']
PASS: admin_save_astrology_plan confirmed prosecdef=True, proconfig=['search_path=""']

--- TEST 0B: Function Execution Privilege Audit ---
PASS: Privileges strictly verified: authenticated=True, anon=False, service_role=False.

--- TEST 0C: Search Path Immunity Against Shadow Objects ---
PASS: Shadow function in pg_temp completely ignored by SET search_path = '' and schema-qualified references.

--- TEST 1: Authenticated Admin Creates Plan Successfully ---
PASS: Plan created and audit record verified atomically: id=20861a75-4c24-40ba-92ef-8c0ad1068702, actor=8a23d65c-6804-493e-9f4d-6b16106978e3

--- TEST 2: Authenticated Admin Updates Plan Successfully ---
PASS: Plan updated with previous values captured in audit log.

--- TEST 3: Authenticated Admin Creates Legacy Content ---
PASS: Legacy content created and audit record verified: id=9a36e6b3-97e4-48a6-b991-007cf621d4fe

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
- **Results:** 9/9 passed (100% pass).

```text
PASS __tests__/daily_astrology_atomic_mutations.test.ts
  AST-16: Atomic Plan & Legacy-Content Mutations With Audit Records
    √ Requirement 1: Migration 051 exists and defines authoritative atomic RPCs (3 ms)
    √ Requirement 2: Migration 051 RPCs enforce SECURITY DEFINER and hardened empty search_path hygiene (3 ms)
    √ Requirement 3: Migration 051 enforces auth.uid() and public.is_admin checks (1 ms)
    √ Requirement 4: Migration 051 revokes execution from PUBLIC/anon/service_role and grants strictly to authenticated (1 ms)
    √ Requirement 5: Migration 051 writes audit logs in-transaction for both create and update operations (1 ms)
    √ Requirement 6: Server Action astrology-management.ts delegates plan mutation to RPC (1 ms)
    √ Requirement 7: Server Action astrology-management.ts delegates content mutation to RPC (1 ms)
    √ Requirement 8: Server Actions handle database errors explicitly and avoid premature revalidation (1 ms)
    √ Requirement 9: Real PostgreSQL ACID rollback & authorization verified via isolated runner (2521 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        3.099 s
```

---

### 7. Regression Validation

1. **Daily Astrology Jest Regression Suite:**
   - **Command:** `npx jest __tests__/daily_astrology`
   - **Result:** **15 test suites passed, 15 total; 260 tests passed, 260 total**.
2. **TypeScript Validation:**
   - **Command:** `npx tsc --noEmit` in `C:\Projects\kashi-veda-admin`
   - **Result:** **0 errors**.
3. **ESLint Validation:**
   - **Command:** `npx eslint lib/actions/astrology-management.ts` in `C:\Projects\kashi-veda-admin`
   - **Result:** **0 errors, 0 warnings**.

---

### 8. Limitations & Deployment Confirmation

- **No Remote Deployment:** All tests were conducted against an isolated local PostgreSQL 18.4 instance. No migration was deployed or pushed to any remote database.
- **Scope Restriction:** AST-16 hardening is complete. AST-17 has not been started. The pre-existing Next.js build issue in `app/(dashboard)/reviews/page.tsx` remains untouched.
