# KASHIVEDA — POST-DEPLOYMENT VERIFICATION REPORT: MIGRATION 046

**Verification Date:** 2026-10-10  
**Target Function:** `public.is_admin(p_user_id UUID DEFAULT auth.uid())`  
**Target Migration:** `supabase/migrations/046_harden_is_admin_probing_guard.sql`  
**Environment:** Live Supabase Production Endpoint (`https://wfovneedmwetxnzhhobh.supabase.co`)  
**Scope:** Post-Deployment Verification (Read-Only)

---

## 1. Executive Summary

This report documents the final post-deployment verification of database migration `046_harden_is_admin_probing_guard.sql` on the live Supabase production database.

### Summary of Empirical Findings:
1. **Discriminating Test Passed (VERIFIED — PASS):**  
   Using a confirmed, existing administrator test-account identifier supplied directly by the developer, an anonymous HTTPS RPC call was executed:
   - Endpoint: `POST https://wfovneedmwetxnzhhobh.supabase.co/rest/v1/rpc/is_admin`
   - Payload: `{"p_user_id": "<CONFIRMED_EXISTING_ADMIN_UUID>"}` (withheld from report per privacy rules)
   - Response: **HTTP 200 OK**, Body: `false`.
   - **Conclusion:** Prior to migration 046, an anonymous caller supplying a real administrator's UUID would receive `true`, leaking their role. The live production endpoint now returns `false`, definitively proving that **anonymous administrative role probing is prevented against real administrator accounts.**
2. **Baseline Anonymous Calls (VERIFIED — PASS):**  
   - 0-argument anonymous RPC call (`{}`): **HTTP 200 OK**, Body: `false`.
   - Non-existent zero UUID (`00000000-0000-0000-0000-000000000000`): **HTTP 200 OK**, Body: `false`.
3. **Public Catalog Access Preserved (VERIFIED — PASS):**  
   All public catalog queries governed by RLS policies with administrative exceptions continue to execute cleanly with **HTTP 200 OK** (`samagri_items`, `temples`, `puja_services`).
4. **Internal `pg_proc` Inspection & Authenticated Contexts (UNVERIFIED):**  
   Direct SQL catalog queries on `pg_proc` and authenticated customer/admin sessions remain unverified from the local client as live session credentials are not stored locally. Exact manual queries are provided for Supabase SQL Editor execution.

---

## 2. Deployed Function Inspection

### 2.1 Database Connection Status
Direct TCP connection to PostgreSQL is not available in the local development environment. Inspection was conducted via public PostgREST HTTPS endpoints. Direct inspection of PostgreSQL system catalogs (`pg_proc`, `information_schema.routine_privileges`) is classified as **UNVERIFIED** pending operator query execution.

### 2.2 Read-Only Verification SQL for Authorized Operator
An authorized operator should execute the following read-only queries in the **Supabase Dashboard SQL Editor** to inspect catalog definitions:

```sql
-- 1. Inspect function definition, volatility, and SECURITY DEFINER status
SELECT
    p.oid::regprocedure AS function_signature,
    p.prosecdef AS security_definer,
    p.provolatile AS volatility,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_admin';

-- 2. Inspect effective routine execution grants
SELECT
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'is_admin'
ORDER BY grantee, privilege_type;
```

### 2.3 Expected Architecture & Design Checklist
The operator should confirm:
- `function_signature` is `public.is_admin(uuid DEFAULT auth.uid())`.
- `security_definer` is `true`.
- `volatility` is `'s'` (STABLE).
- Function body includes the hardened caller check:
  ```sql
  IF v_caller_id IS NULL OR v_caller_id != v_target_user_id THEN
      IF v_caller_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.user_roles 
          WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
      ) THEN
          RETURN false;
      END IF;
  END IF;
  ```
- `grantee` includes `anon`, `authenticated`, and `service_role`. `PUBLIC` is revoked.

---

## 3. Anonymous Verification

All tests were executed over live HTTPS against `https://wfovneedmwetxnzhhobh.supabase.co` using Node.js fetch with the public anon key and no user JWT.

### 3.1 Test 1: Anonymous Call Without Target Parameter
- **Endpoint:** `POST /rest/v1/rpc/is_admin`
- **Request Body:** `{}`
- **HTTP Status:** `200 OK`
- **Response Body:** `false`
- **Status:** **PASS**

### 3.2 Test 2: Anonymous Call With Arbitrary Zero UUID
- **Endpoint:** `POST /rest/v1/rpc/is_admin`
- **Request Body:** `{"p_user_id": "00000000-0000-0000-0000-000000000000"}`
- **HTTP Status:** `200 OK`
- **Response Body:** `false`
- **Status:** **PASS**

### 3.3 Test 3: Anonymous Call With Confirmed Existing Administrator UUID (Check 1)
- **Context:** The developer provided an authorized, existing administrator production UUID for this discriminating test. Per privacy and safety rules, the UUID is withheld from this report.
- **Endpoint:** `POST /rest/v1/rpc/is_admin`
- **Request Body:** `{"p_user_id": "<CONFIRMED_EXISTING_ADMIN_UUID>"}`
- **HTTP Status:** `200 OK`
- **Response Body:** `false`
- **Status:** **PASS**
- **Evaluation:** Because the target user is an existing administrator, prior unpatched logic would have bypassed the unauthenticated guard and returned `true`. The returned result `false` directly proves that unauthenticated callers cannot discover the administrative role of actual admin accounts.

---

## 4. Authenticated Customer Verification

### 4.1 Status: UNVERIFIED (Automated)
Safety rules strictly prohibit creating dummy customer accounts in production or forging tokens using service-role keys.

### 4.2 Manual Verification Procedure for Authorized Operator
Execute in the Supabase SQL Editor:

```sql
BEGIN;

-- 1. Simulate an authenticated customer session
SET LOCAL ROLE authenticated;
-- Replace with an actual non-admin customer user_id:
SET LOCAL "request.jwt.claims" = '{"role": "authenticated", "sub": "<CUSTOMER_USER_UUID>"}';

-- Check 1: Customer checks own status (MUST return false)
SELECT public.is_admin() AS customer_self_check;
-- EXPECTED: false

-- Check 2: Customer checks an admin's UUID (MUST return false)
SELECT public.is_admin('<ADMIN_USER_UUID>'::uuid) AS customer_probing_check;
-- EXPECTED: false

ROLLBACK;
```

---

## 5. Authenticated Administrator Verification

### 5.1 Status: UNVERIFIED (Automated)
No live production administrator session or credentials were available in the local environment.

### 5.2 Manual Verification Procedure for Authorized Operator
Execute in the Supabase SQL Editor:

```sql
BEGIN;

-- 1. Simulate an authenticated administrator session
SET LOCAL ROLE authenticated;
-- Replace with the known administrator user_id from public.user_roles:
SET LOCAL "request.jwt.claims" = '{"role": "authenticated", "sub": "<ADMIN_USER_UUID>"}';

-- Check 1: Administrator checks own status (MUST return true)
SELECT public.is_admin() AS admin_self_check;
-- EXPECTED: true

-- Check 2: Administrator checks another admin's UUID (MUST return true)
SELECT public.is_admin('<ANOTHER_ADMIN_UUID>'::uuid) AS admin_inspect_admin;
-- EXPECTED: true

-- Check 3: Administrator checks an ordinary customer's UUID (MUST return false)
SELECT public.is_admin('<CUSTOMER_USER_UUID>'::uuid) AS admin_inspect_customer;
-- EXPECTED: false

ROLLBACK;
```

---

## 6. Public Catalog Verification

Live read-only requests were executed with the public anon key to confirm that catalog RLS policies evaluating `public.is_admin()` continue to operate without permissions errors.

### 6.1 Samagri Items Catalog (`public.samagri_items`)
- **Query:** `GET /rest/v1/samagri_items?is_active=eq.true&select=id,name,unit_price,is_active&limit=1`
- **HTTP Status:** `200 OK`
- **Sample Payload:** `[{"id":"ab2999fe-4754-4c16-b6d8-e3e192d62213","name":"Desi Ghee","unit_price":50,"is_active":true}]`
- **Status:** **PASS**

### 6.2 Temples Catalog (`public.temples`)
- **Query:** `GET /rest/v1/temples?select=id,name,city&limit=1`
- **HTTP Status:** `200 OK`
- **Sample Payload:** `[{"id":"e855f136-fa6f-470e-b67b-419bac7c11f0","name":"Kashi Vishwanath Temple","city":"Varanasi"}]`
- **Status:** **PASS**

### 6.3 Puja Services Catalog (`public.puja_services`)
- **Query:** `GET /rest/v1/puja_services?select=id,name,is_active&is_active=eq.true&limit=1`
- **HTTP Status:** `200 OK`
- **Sample Payload:** `[{"id":"bdeff863-337e-418d-be1f-0cb71d0434e1","name":"Griha Test","is_active":true}]`
- **Status:** **PASS**

---

## 7. Backward Compatibility

1. **RPC Signature Consistency:**
   - Overload signature is preserved: `public.is_admin(p_user_id UUID DEFAULT auth.uid())`.
   - Existing database functions calling `public.is_admin()` or `public.is_admin(v_caller_id)` remain fully compatible.
2. **Client Applications:**
   - Mobile application does not invoke `is_admin` via RPC; it queries `public.user_roles` directly.
   - Admin website (`kashi-veda-admin`) interacts with Supabase via Server Actions and table RLS policies, which continue to evaluate correctly.

---

## 8. Results Matrix

| Test ID | Test Description | Expected Result | Actual Result | Status | Evidence |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **SEC-01** | Anonymous call `is_admin()` with no arguments | `false` | `false` | **PASS** | HTTP 200, Body: `false` via PostgREST RPC |
| **SEC-02** | Anonymous call `is_admin(p_user_id)` with zero UUID | `false` | `false` | **PASS** | HTTP 200, Body: `false` via PostgREST RPC |
| **SEC-03** | Anonymous call with known existing admin UUID | `false` | `false` | **PASS** | HTTP 200, Body: `false` (UUID redacted) |
| **DB-01**  | Deployed SQL definition and grants via `pg_proc` | Matches Migration 046 | Not executed directly | **UNVERIFIED** | Awaiting manual operator execution in SQL Editor |
| **AUTH-01**| Authenticated Customer checks self status | `false` | Not executed locally | **UNVERIFIED** | Requires live Customer session |
| **AUTH-02**| Authenticated Customer checks admin UUID | `false` | Not executed locally | **UNVERIFIED** | Requires live Customer session |
| **ADMIN-01**| Authenticated Administrator checks self status | `true` | Not executed locally | **UNVERIFIED** | Requires live Administrator session |
| **ADMIN-02**| Authenticated Administrator checks another admin | `true` | Not executed locally | **UNVERIFIED** | Requires live Administrator session |
| **ADMIN-03**| Authenticated Administrator checks customer | `false` | Not executed locally | **UNVERIFIED** | Requires live Administrator session |
| **CAT-01** | Anonymous read on `public.samagri_items` | Active items (HTTP 200) | Retrieved "Desi Ghee" (HTTP 200) | **PASS** | HTTP 200, 1 row returned |
| **CAT-02** | Anonymous read on `public.temples` | Active items (HTTP 200) | Retrieved "Kashi Vishwanath" (HTTP 200) | **PASS** | HTTP 200, 1 row returned |
| **CAT-03** | Anonymous read on `public.puja_services` | Active items (HTTP 200) | Retrieved "Griha Test" (HTTP 200) | **PASS** | HTTP 200, 1 row returned |

---

## 9. Remaining Issues & Action Items

1. **Manual Operator SQL Execution (Check 2, 4, 5):**  
   The operator should run the SQL scripts in Sections 2, 4, and 5 inside the Supabase Dashboard SQL Editor to verify internal `pg_proc` catalog definition text and authenticated role evaluations.
2. **Zero Failures Encountered:**  
   Every test executed against the live production endpoint passed completely.

---

## 10. Final Assessment

1. **Deployed Function Intended Correction:** **CONFIRMED FOR TESTED PATHS.** The endpoint accepts calls and returns `false` when target UUIDs are provided anonymously.
2. **Anonymous Role Probing Prevention:** **PREVENTED & VERIFIED.** The critical discriminating test against a confirmed production administrator account returned `false` with HTTP 200, proving that anonymous callers cannot discover administrative status.
3. **Authenticated Customer Behavior:** **UNVERIFIED (Automated).** Safe SQL procedure provided.
4. **Authenticated Administrator Behavior:** **UNVERIFIED (Automated).** Safe SQL procedure provided.
5. **Public Catalog Access:** **FUNCTIONAL & VERIFIED.** Active public catalog records remain readable across all catalogs without permission errors.
6. **Broader Production Readiness:** **UNVERIFIED.** Other features (Payments, LiveKit, Pandit Payouts, Kundli) remain to be audited separately.

### Conclusion:
The available empirical evidence is **fully sufficient** to verify that the anonymous administrative role-probing vulnerability (`AUTH-SEC-01`) has been successfully resolved in production by Migration 046 without breaking public catalog access.
