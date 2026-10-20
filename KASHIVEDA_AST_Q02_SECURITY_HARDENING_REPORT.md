# KashiVeda AST-Q02 — Migration 055 Security Hardening Report

**Evaluation Date**: 2026-10-11  
**Target Function**: `public.is_customer_subscribed_to_plan(p_plan_id UUID)`  
**Target Migration**: `C:\Projects\KashiVeda\supabase\migrations\055_decouple_plan_deactivation_from_entitlements.sql`  
**Security Status**: **HARDENED & VERIFIED (PASS)**  
**Environment**: Disposable Local PostgreSQL 18.4 (Port 5433) — strictly zero production, remote Supabase, or live gateway execution.

---

## 1. Executive Summary

During the initial AST-Q02 implementation (Option A: Plan deactivation prevents new purchases but preserves existing valid subscriber access), Migration 055 introduced a `SECURITY DEFINER` helper function to allow subscribers to view their purchased plan's metadata via Row Level Security (RLS) on `astrology_subscription_plans`, even when that plan is marked inactive (`is_active = false`).

A focused security review was conducted on the initial definition of this helper function:
`public.is_customer_subscribed_to_plan(p_plan_id UUID, p_user_id UUID)`

The review identified three distinct security issues in the initial draft:
1. **Arbitrary Caller-Identity Probing Vulnerability**: The function accepted `p_user_id` as an input parameter. Under `SECURITY DEFINER` execution, any authenticated user could pass a victim's UUID and determine with Boolean certainty whether that victim held an active or past subscription to an inactive plan.
2. **Permissive Search Path**: The initial helper specified `SET search_path = public, pg_temp`, creating potential search path hijack risks inconsistent with the project's AST-16 security-hardening standard (`SET search_path = ''`).
3. **Execution Grants & RLS Policy Interdependence**: Evaluating the helper's minimum required privileges against PostgreSQL RLS query-planning rules revealed that revoking `EXECUTE` from `anon` broke catalog browsing (`SELECT * FROM astrology_subscription_plans`) for unauthenticated visitors.

All three issues have been remediated in place in Migration 055 before deployment:
- The helper signature was reduced to a single parameter: `public.is_customer_subscribed_to_plan(p_plan_id UUID)`.
- Caller identity is strictly bound to `auth.uid()` inside the function body.
- When `auth.uid() IS NULL`, the function returns `false` immediately without executing table queries.
- `SET search_path = ''` was applied with fully qualified identifiers.
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC` was enforced, with `EXECUTE` safely granted to `authenticated` and `anon`.

All 10 required verification checks passed on the disposable database, with zero regressions to TypeScript types, ESLint rules, or existing test suites.

---

## 2. Original Implementation vs. Hardened Implementation

### 2.1 Original Implementation (Draft Review)

```sql
-- Initial definition before security hardening
CREATE OR REPLACE FUNCTION public.is_customer_subscribed_to_plan(
    p_plan_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.astrology_subscriptions s
        WHERE s.plan_id = p_plan_id
          AND s.customer_id = p_user_id
    );
$$;
```

**Flaws in Original Implementation**:
1. **User Identity Spoofing**: Trusted caller-supplied `p_user_id` rather than authoritative `auth.uid()`.
2. **Search Path Exposure**: `search_path = public, pg_temp` left room for temporary table or function shadowing.
3. **Information Disclosure**: Enabled cross-user membership discovery through direct RPC invocation.

### 2.2 Hardened Implementation (Migration 055 Final)

```sql
-- Final security-hardened definition in Migration 055
DROP POLICY IF EXISTS "astrology_subscription_plans_select_public" ON public.astrology_subscription_plans;
DROP FUNCTION IF EXISTS public.is_customer_subscribed_to_plan(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_customer_subscribed_to_plan(UUID);

CREATE OR REPLACE FUNCTION public.is_customer_subscribed_to_plan(
    p_plan_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE 
        WHEN auth.uid() IS NULL THEN false
        ELSE EXISTS (
            SELECT 1 
            FROM public.astrology_subscriptions s
            WHERE s.plan_id = p_plan_id
              AND s.customer_id = auth.uid()
        )
    END;
$$;

COMMENT ON FUNCTION public.is_customer_subscribed_to_plan(UUID) IS
    'AST-Q02 Security-Hardened: Determines whether the authenticated caller (auth.uid()) is subscribed to p_plan_id. Derives caller identity strictly from auth.uid() to prevent user probing.';

REVOKE ALL ON FUNCTION public.is_customer_subscribed_to_plan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_customer_subscribed_to_plan(UUID) TO authenticated, anon;

CREATE POLICY "astrology_subscription_plans_select_public"
    ON public.astrology_subscription_plans FOR SELECT
    USING (
        is_active = true
        OR public.is_admin()
        OR (
            auth.uid() IS NOT NULL
            AND public.is_customer_subscribed_to_plan(id)
        )
    );
```

---

## 3. Evaluation of Caller-Identity Risk and Role-Level Tests

Tests were executed against a verified disposable local PostgreSQL 18.4 database (`scratch/disposable_pg` on port 5433).

### Test Cases Evaluated

| Test Case | Scenario Description | Initial 2-Arg Function | Hardened 1-Arg Function | Classification |
|---|---|---|---|---|
| **Case 1** | Anonymous caller invokes helper directly | Returned `False` (or error if null uid) | Returns `false` unconditionally; zero leaks | **PASS** |
| **Case 2** | Authenticated user calls helper for their own subscribed plan | Returned `True` | Returns `true` | **PASS** |
| **Case 3** | Authenticated user probes another user's subscription via victim's UUID | **VULNERABILITY CONFIRMED**: Returned `True`, leaking victim's subscription status | **PROBING ELIMINATED**: Signature has no target user parameter; derives caller from `auth.uid()` only; returns `false` | **PASS** |
| **Case 4** | Authenticated user probes a plan neither user subscribes to | Returned `False` | Returns `false` | **PASS** |
| **Case 5** | Inactive plan probed by user with cancelled, expired, or pending sub | Returned `True` (historical existence) | Returns `true` for own account; RLS shows plan metadata needed for history/receipts; does NOT grant insight access | **PASS** |
| **Case 6** | Authorized administrator reads inactive plan details | Permitted | Permitted via `public.is_admin()` policy clause | **PASS** |

### Reproduction Evidence for Case 3 (Prior Vulnerability)
- Probe query: `SELECT public.is_customer_subscribed_to_plan(gold_plan_id, victim_cust_a_id);`
- Executed as: `cust_b` (role: `authenticated`)
- Initial result: `True` (Confirmed cross-user enumeration vulnerability).
- Hardened result: Customer B can only execute `SELECT public.is_customer_subscribed_to_plan(gold_plan_id);`, which queries Customer B's own records and returns `false`.

---

## 4. PostgreSQL RLS & Execution Privilege Verification

### 4.1 Why `anon` Requires `EXECUTE` for Table RLS Queries
A critical PostgreSQL behavior was identified during privilege testing:
1. PostgreSQL compiles and checks permissions for **all functions referenced in an RLS policy** when a role executes a query on that table.
2. The policy on `astrology_subscription_plans` is:
   ```sql
   USING (
       is_active = true
       OR public.is_admin()
       OR (
           auth.uid() IS NOT NULL
           AND public.is_customer_subscribed_to_plan(id)
       )
   )
   ```
3. When `EXECUTE` was revoked from `anon`, an unauthenticated user running `SELECT * FROM astrology_subscription_plans WHERE is_active = true;` failed with:
   `ERROR: permission denied for function is_customer_subscribed_to_plan`
4. Even though `auth.uid() IS NOT NULL` short-circuits at runtime, PostgreSQL's query optimizer validates that `anon` has privilege to execute the function symbol at parse/plan time.
5. **Resolution**: Granting `EXECUTE` to `authenticated, anon` is completely safe because:
   - When called by `anon`, `auth.uid()` is `NULL`.
   - The hardened function body contains `WHEN auth.uid() IS NULL THEN false`.
   - The query returns `false` without ever reading `astrology_subscriptions`.
   - Anonymous users only see active plans (`is_active = true`).

---

## 5. Required Verification Results (Section 8 Checks)

All 10 required verification points from Section 8 of the prompt were automated and verified against the disposable database (`scratch/verify_ast_q02_security_hardening.py`):

| Check # | Requirement | Observed Result | Classification |
|---|---|---|---|
| **Check 1** | Anonymous users cannot probe or leak info via helper; catalog SELECT works | Direct helper call returns `false`. Catalog SELECT returns 14 active plans and 0 inactive plans. | **PASS** |
| **Check 2** | Authenticated users cannot probe another user's subscription | Calling helper as Cust B for Gold plan returns `false`. Target user ID parameter cannot be supplied. | **PASS** |
| **Check 3** | Helper correctly identifies current user's intended plan relationship | Calling helper as Cust A (who holds Gold plan) returns `true`. | **PASS** |
| **Check 4** | Existing subscribers retrieve plan metadata for their own account | Cust A SELECT on `astrology_subscription_plans` successfully retrieves `Gold Plan H055` metadata. | **PASS** |
| **Check 5** | Inactive plans remain hidden from prospective buyers | Cust B querying inactive plans receives 0 rows. Gold plan is completely invisible to prospective buyers. | **PASS** |
| **Check 6** | Existing valid subscribers retain Daily Vedic Horoscope access | Cust A calls `get_daily_rashi_insight`: `success: true, is_entitled: true`, full insight content returned. Direct SELECT count = 1. | **PASS** |
| **Check 7** | Expired and cancelled subscriptions remain ineligible | Cust D (expired): `is_entitled: false`. Cust C (cancelled): `is_entitled: false`. Direct SELECT count = 0. | **PASS** |
| **Check 8** | New purchases of inactive plans are rejected | Cust B attempting to order Gold plan receives `RAISE EXCEPTION 'Selected astrology plan is not currently active.'`. Ordering active Silver plan succeeds. | **PASS** |
| **Check 9** | Daily insight RPC and RLS policy behave consistently | Direct SELECT and RPC agree across all customer states (Cust A entitled, Cust B/C/D denied). | **PASS** |
| **Check 10** | AST-P01 checkout snapshots and AST-P02 reconciliation unaffected | `duration_days` snapshot on `payment_orders` preserved (365 days). `confirm_booking_payment` RPC intact. | **PASS** |

**Overall Verification Status**: **PASS**

---

## 6. Test Suites and Quality Tooling Results

### 6.1 TypeScript Checks
- **Mobile Application** (`C:\Projects\KashiVeda`):
  - Command: `npx tsc --noEmit`
  - Exit Code: `0`
  - Output: 0 type errors.
- **Admin Portal** (`C:\Projects\kashi-veda-admin`):
  - Command: `npx tsc --noEmit`
  - Exit Code: `0`
  - Output: 0 type errors.

### 6.2 Targeted ESLint
- **Astrology Subscription Selection Test**:
  - Command: `npx eslint __tests__/daily_astrology_subscription_selection.test.tsx`
  - Exit Code: `0` (0 errors, 0 warnings).
- **Astrology UI Components & Services**:
  - Command: `npx eslint src/features/astrology/screens/AstrologyPlanDetailScreen.tsx src/features/astrology/components/AstrologySubscriptionCard.tsx src/features/astrology/services/astrologyService.ts`
  - Exit Code: `0` (0 errors, 0 warnings).

### 6.3 Jest Regression Test Suites
- **Subscription Selection Suite**:
  - Command: `npm test -- __tests__/daily_astrology_subscription_selection.test.tsx`
  - Exit Code: `0`
  - Results: **16 passed, 16 total** (1.7s).
- **All Astrology Test Suites**:
  - Command: `npm test -- __tests__/astrology`
  - Exit Code: `0`
  - Suites Passed:
    1. `__tests__/astrology_subscription_payment_serialization.test.ts`
    2. `__tests__/astrology_admin_operations.test.ts`
    3. `__tests__/astrology_payment_backend.test.ts`
    4. `__tests__/astrology_delivery_lifecycle.test.ts`
    5. `__tests__/astrology_content_detail_retry.test.tsx`
    6. `__tests__/astrology_checkout_duration_snapshot.test.ts`
    7. `__tests__/astrology.test.tsx`
  - Results: **7 passed, 106 passed tests, 0 failures**.

---

## 7. Migration File Integrity & Forward-Only Discipline

- **Historical Migrations**: Migrations `001` through `054` were **strictly unmodified**.
- **Migration 055**: `supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql` contains the complete, self-contained, idempotent, security-hardened DDL.
- **Client Application Call Sites**: Checked both the mobile codebase and admin web portal. Neither client makes direct calls to `is_customer_subscribed_to_plan`. The function is strictly an internal RLS policy helper.

---

## 8. Remaining Uncertainties

None. The authorization model, RLS evaluation semantics, search path constraints, and entitlement flows have been verified directly in the PostgreSQL execution engine under realistic session contexts (`anon` and `authenticated`).

---

## 9. Safety and Compliance Attestation

1. **Zero Remote / Production Deployments**: No commands were executed against remote Supabase projects or live databases.
2. **Zero Financial Operations**: No real payments, cards, UPI IDs, or refunds were invoked; all tests used synthetic test fixtures.
3. **No Unrequested Scope**: This task was restricted strictly to the security hardening of `public.is_customer_subscribed_to_plan`. No new audit findings or tasks (such as AST-Q03) were initiated.
