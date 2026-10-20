# KashiVeda Feature 02 — AST-17 Implementation Report
## Prevent Active Zero-Price Plans That Checkout Cannot Purchase

**Status:** Completed & Verified  
**Date:** 2026-10-11  
**Scope:** AST-17 Only (`KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`)  
**Repositories:**
- Admin Application: `C:\Projects\kashi-veda-admin`
- Backend, Database Migrations & Tests: `C:\Projects\KashiVeda`

---

## 1. Executive Summary

AST-17 remediates a business and transactional mismatch between the Admin plan creation interface and the customer checkout flow:
- Previously, the Admin plan creation modal permitted setting `price = 0`, and the database allowed non-negative (`price >= 0`) records in `public.astrology_subscription_plans`.
- However, the customer checkout and payment processing RPC `public.create_astrology_subscription_order` (introduced in Migration 020 and updated in Migration 048) authoritatively enforces:
  ```sql
  IF v_plan.price IS NULL OR v_plan.price <= 0 THEN
      RAISE EXCEPTION 'Selected astrology plan does not have a valid price.';
  END IF;
  ```
- Additionally, Razorpay order creation requires a non-zero upfront transaction amount.
- Consequently, active zero-price plans created in Admin were unpurchasable by customers, leading to unexpected transaction failures and broken user checkout funnels.

**Resolution:**
We established an authoritative pricing contract requiring `price > 0` at every layer:
1. **Database Layer (Migration 052):** Redefined `public.admin_save_astrology_plan` with strict positive price enforcement (`p_price <= 0 OR pg_catalog.round(p_price, 2) <= 0` raises `'Price must be greater than zero.'`), while preserving all AST-16 transactional security and atomic audit logging guarantees.
2. **Admin Server Action:** Validates price input defensively (rejecting missing, blank, non-numeric, `NaN`, infinite, zero, and sub-precision values that round to 0.00).
3. **Admin Form Modal:** Added client validation (`numPrice > 0`), set `<input min="0.01" step="0.01" />`, preventing accidental zero-price submissions.
4. **Admin Plans View:** Displays warning badge `Unpurchasable (≤ 0)` for any legacy nonpositive price plans, maintaining 100% administrator visibility for editorial correction.
5. **Customer Mobile Service & Screen:** Query filters `price > 0` in `getActivePlans()`, and `AstrologyPlanDetailScreen` marks nonpositive plans as unpurchasable with a clear notice and disabled checkout button.

---

## 2. Finding Analysis & Schema Context

### 2.1 The Pricing Mismatch
- Migration 009 defined:
  ```sql
  CREATE TABLE public.astrology_subscription_plans (
      ...
      price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
      ...
  );
  ```
- Migration 020 & 048 defined:
  ```sql
  IF v_plan.price IS NULL OR v_plan.price <= 0 THEN
      RAISE EXCEPTION 'Selected astrology plan does not have a valid price.';
  END IF;
  ```
- Because the table check constraint only enforced `price >= 0`, administrators could create plans with `price = 0.00`.
- In addition, an input like `0.004` could be passed, which rounds to `0.00` in `NUMERIC(12,2)`.
- When customers selected such plans, the checkout RPC aborted with `'Selected astrology plan does not have a valid price.'`.
- Furthermore, no free subscription fulfillment mechanism exists in the payment pipeline. Allowing zero-price plans misled administrators into believing they were creating functional free-tier offerings.

---

## 3. Architectural & Pricing Decisions

### 3.1 Enforcement Boundary
- **Authoritative Database Gate:** Enforced inside `public.admin_save_astrology_plan`. Any direct database call or Server Action attempting to create or update a plan with `price <= 0` or `round(price, 2) <= 0` is aborted before any state mutation occurs.
- **Table Constraint Preservation:** We intentionally refrained from adding an immediate table-level `CHECK (price > 0)` via migration, ensuring legacy databases containing historical zero-price records remain fully queryable and upgradeable by administrators rather than failing table-level migration checks.

### 3.2 Sub-Precision & Currency Rounding Handling
- In Indian Rupee (INR) and standard fiat currencies, transactions are denominated in 2 decimal places (paise/cents).
- If an admin entered `0.004`, it would evaluate as positive in simple `> 0` comparisons, but round down to `0.00` in `NUMERIC(12,2)`.
- We instituted a dual check:
  ```sql
  IF p_price IS NULL OR p_price <= 0 OR pg_catalog.round(p_price, 2) <= 0 THEN
      RAISE EXCEPTION 'Price must be greater than zero.';
  END IF;
  ```
- The Admin Server Action and modal validate `Math.round(numPrice * 100) / 100 > 0`, returning `'Price must be greater than zero at currency precision.'` if sub-precision rounding evaluates to zero.

### 3.3 Legacy Plan Transparency & Correction Path
- Legacy zero-price plans must not disappear from the Admin console.
- In `components/admin/astrology/astrology-plans-view.tsx`, legacy plans with `price <= 0` are rendered with an explicit badge: `Unpurchasable (≤ 0)`.
- Administrators can open the plan, update the price to a valid positive value, and save it. Once updated, the plan immediately becomes discoverable and purchasable by customers.

---

## 4. Implementation Details

### 4.1 Forward-Only Database Migration (`052_prevent_zero_price_astrology_plans.sql`)
- Located at `C:\Projects\KashiVeda\supabase\migrations\052_prevent_zero_price_astrology_plans.sql`.
- Redefines `public.admin_save_astrology_plan`:
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
  AS $$
  DECLARE
      v_admin_id UUID;
      v_existing_plan RECORD;
      v_result_plan RECORD;
      v_action TEXT;
      v_trimmed_name TEXT;
      v_currency CHAR(3);
  BEGIN
      -- Authorization
      v_admin_id := auth.uid();
      IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
          RAISE EXCEPTION 'Unauthorized: Administrator privileges required to manage subscription plans.';
      END IF;

      -- Validation
      v_trimmed_name := TRIM(COALESCE(p_name, ''));
      IF pg_catalog.length(v_trimmed_name) < 2 THEN
          RAISE EXCEPTION 'Plan name must be at least 2 characters.';
      END IF;

      IF p_duration_days IS NULL OR p_duration_days < 1 THEN
          RAISE EXCEPTION 'Duration must be at least 1 day.';
      END IF;

      -- AST-17 Pricing Contract Guard
      IF p_price IS NULL OR p_price <= 0 OR pg_catalog.round(p_price, 2) <= 0 THEN
          RAISE EXCEPTION 'Price must be greater than zero.';
      END IF;

      v_currency := COALESCE(NULLIF(TRIM(p_currency), ''), 'INR');

      -- Mutation & Audit Log (Atomic single transaction block)
      ...
  ```
- Explicit permissions:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, service_role;
  GRANT EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
  ```

### 4.2 Admin Server Action (`lib/actions/astrology-management.ts`)
- In `saveAstrologyPlan`:
  ```typescript
  const rawPrice: unknown = formData.price;
  if (
    rawPrice === undefined ||
    rawPrice === null ||
    rawPrice === "" ||
    (typeof rawPrice === "string" && rawPrice.trim() === "")
  ) {
    return { success: false, error: "Price is required." };
  }
  const numPrice = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
  if (typeof numPrice !== "number" || Number.isNaN(numPrice) || !Number.isFinite(numPrice)) {
    return { success: false, error: "Price must be a valid number." };
  }
  if (numPrice <= 0) {
    return { success: false, error: "Price must be greater than zero." };
  }
  // Database precision check: NUMERIC(12, 2)
  const roundedPrice = Math.round(numPrice * 100) / 100;
  if (roundedPrice <= 0) {
    return { success: false, error: "Price must be greater than zero at currency precision." };
  }
  ```
- Passes `p_price: roundedPrice` to `admin_save_astrology_plan`.
- Revalidates paths `/astrology` and `/astrology/plans` only upon successful commit.

### 4.3 Admin Form Modal (`components/admin/astrology/modals/plan-form-modal.tsx`)
- In `handleSubmit`:
  ```typescript
  const numPrice = Number(price);
  if (typeof numPrice !== "number" || Number.isNaN(numPrice) || !Number.isFinite(numPrice)) {
    setError("Price must be a valid number.");
    return;
  }
  if (numPrice <= 0) {
    setError("Price must be greater than zero.");
    return;
  }
  if (Math.round(numPrice * 100) / 100 <= 0) {
    setError("Price must be greater than zero at currency precision.");
    return;
  }
  ```
- HTML `<input>` configured with `min="0.01"` and `step="0.01"`.

### 4.4 Admin Plans View (`components/admin/astrology/astrology-plans-view.tsx`)
- In table price cell:
  ```tsx
  <td className="px-4 py-3 font-semibold text-foreground">
    <div className="flex items-center gap-1.5">
      <span>{plan.currency} {plan.price.toLocaleString("en-IN")}</span>
      {plan.price <= 0 && (
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-normal">
          Unpurchasable (≤ 0)
        </Badge>
      )}
    </div>
  </td>
  ```

### 4.5 Customer Mobile Service & Screen
- **`src/features/astrology/services/astrologyService.ts`**:
  ```typescript
  async getActivePlans(): Promise<AstrologySubscriptionPlan[]> {
    const { data, error } = await supabase
      .from("astrology_subscription_plans")
      .select("...")
      .eq("is_active", true)
      .gt("price", 0)
      .order("price", { ascending: true });

    if (error) throw new Error(error.message);

    return (data || [])
      .map(...)
      .filter((plan: AstrologySubscriptionPlan) => typeof plan.price === "number" && plan.price > 0);
  }
  ```
- **`src/features/astrology/screens/AstrologyPlanDetailScreen.tsx`**:
  - Computes `isPurchasable`:
    ```typescript
    const isPurchasable = Boolean(
      plan && plan.is_active && typeof plan.price === "number" && plan.price > 0
    );
    ```
  - Displays unavailable notice if `!isPurchasable`.
  - Disables CTA button: `disabled={subscribing || !isPurchasable}` with title `"Plan Currently Unavailable"`.

---

## 5. Security, Atomicity & AST-16 Invariants

Migration 052 rigorously maintains all AST-16 contracts:
1. **Search Path Hardening:** `SET search_path = ''` with fully schema-qualified identifiers (`pg_catalog.*`, `public.*`, `auth.*`).
2. **Strict Admin Verification:** Checks `v_admin_id := auth.uid();` and `public.is_admin(v_admin_id)`.
3. **Actor Identity Invariance:** Audit record `actor_user_id` is derived strictly from `auth.uid()`, preventing spoofing.
4. **Single Transaction Atomicity:** Business table insert/update and audit log insertion execute in the exact same transaction block. If price validation fails, zero mutations and zero audit logs are produced.
5. **Least Privilege Grants:** `REVOKE EXECUTE ... FROM PUBLIC, anon, service_role;` and `GRANT EXECUTE ... TO authenticated;`.

---

## 6. Test Strategy & Results

### 6.1 Isolated PostgreSQL 18.4 Engine Test (`scratch/test_ast_17_db_pricing.py`)
Executed on dedicated PostgreSQL 18.4 instance on port 5433 with 10 comprehensive scenarios:

| # | Test Scenario | Expected Outcome | Result |
|---|---|---|---|
| 1 | Configuration & Privileges | `SECURITY DEFINER`, `search_path = ''`, `authenticated` only | PASS |
| 2 | Price = 0 Submission | Raised exception: `Price must be greater than zero.` | PASS |
| 3 | Price < 0 Submission | Raised exception: `Price must be greater than zero.` | PASS |
| 4 | Sub-precision `0.004` (rounds to 0.00) | Raised exception: `Price must be greater than zero.` | PASS |
| 5 | Valid Fractional `0.50` | Created successfully with price `0.50` | PASS |
| 6 | Normal Positive `499.00` | Created successfully with price `499.00` and 1 audit record | PASS |
| 7 | Update Plan to `599.00` | Updated successfully; audit record captured `previous_price: 499.00` | PASS |
| 8 | Update Plan to `0.00` | Failed cleanly; plan price remained `599.00`; 0 new audit records | PASS |
| 9 | Legacy Zero-Price Handling | Checkout rejected; filtered from customer catalog; visible in admin | PASS |
| 10 | Unauthorized / Non-Admin | Unauthenticated & customer callers strictly rejected | PASS |

### 6.2 Jest Test Suite (`__tests__/daily_astrology_plan_pricing.test.ts`)
Run command: `npx jest __tests__/daily_astrology_plan_pricing.test.ts`
- Total Test Cases: 8
- Passed: 8 / 8
- Time: 28.9s

### 6.3 Combined Jest Regression Suite
Run command: `npx jest __tests__/daily_astrology_atomic_mutations.test.ts __tests__/daily_astrology_plan_pricing.test.ts --runInBand`
- Test Suites: 2 passed, 2 total
- Tests: 17 passed, 17 total (100% pass rate)

### 6.4 Full Regressions (AST-08 through AST-16)
- AST-14 Timezone Contract: `node scratch/test_ast_14_timezone_contract.mjs` (PASS, 0 skipped, 0 todo)
- AST-13 Timezone Stepping: `node scratch/test_ast_13_timezone_stepping.mjs` (PASS, 0 skipped, 0 todo)
- AST-11 CSV Identity Overwrite: `node scratch/test_ast_11_csv_identity.mjs` (PASS, 0 skipped, 0 todo)
- AST-11 DB Concurrency Runner: `python scratch/test_ast_11_db_overwrite_concurrency.py` (PASS, 100% assertions)
- AST-09 Optimistic Concurrency: `python scratch/test_astrology_optimistic_concurrency.py` (PASS, Scenarios A–H)

---

## 7. Verification & Production Safety

- **No Remote Database Alterations:** All SQL migrations were tested against the local isolated PostgreSQL test engine. No migrations were deployed to any remote Supabase environment.
- **TypeScript & Linter Verification:**
  - `C:\Projects\kashi-veda-admin`: `npx tsc --noEmit` passed with 0 errors.
  - `C:\Projects\kashi-veda-admin`: `npx eslint lib/actions/astrology-management.ts components/admin/astrology/modals/plan-form-modal.tsx components/admin/astrology/astrology-plans-view.tsx` passed with 0 errors and 0 warnings.
  - `C:\Projects\KashiVeda`: `npx tsc --noEmit` passed with 0 errors.

---

## 8. File Change Matrix

| Repository | File Path | Action | Description |
|---|---|---|---|
| `KashiVeda` | `supabase/migrations/052_prevent_zero_price_astrology_plans.sql` | Created | Forward-only migration defining positive price contract on `admin_save_astrology_plan`. |
| `kashi-veda-admin` | `lib/actions/astrology-management.ts` | Modified | Added multi-stage input validation in `saveAstrologyPlan` (missing, non-number, zero, sub-precision). |
| `kashi-veda-admin` | `components/admin/astrology/modals/plan-form-modal.tsx` | Modified | Added client validation for `price > 0` and configured `<input min="0.01" step="0.01">`. |
| `kashi-veda-admin` | `components/admin/astrology/astrology-plans-view.tsx` | Modified | Added `Unpurchasable (≤ 0)` badge for legacy nonpositive plans while maintaining admin visibility. |
| `KashiVeda` | `src/features/astrology/services/astrologyService.ts` | Modified | Added `.gt("price", 0)` query clause and defensive filter to `getActivePlans()`. |
| `KashiVeda` | `src/features/astrology/screens/AstrologyPlanDetailScreen.tsx` | Modified | Enforced `isPurchasable` guard, disabled checkout button, and displayed unavailable notice. |
| `KashiVeda` | `scratch/test_ast_17_db_pricing.py` | Created | Isolated PostgreSQL 18.4 integration test script covering 10 pricing scenarios. |
| `KashiVeda` | `__tests__/daily_astrology_plan_pricing.test.ts` | Created | Comprehensive Jest test suite covering AST-17 requirements and regressions. |
| `KashiVeda` | `KASHIVEDA_AST_17_IMPLEMENTATION_REPORT.md` | Created | Implementation and verification report. |

---

## 9. Regression & Compatibility Assessment

1. **AST-16 Atomicity & Audit Records:** Fully preserved. Migration 052 retains in-transaction logging to `admin_audit_logs`, `auth.uid()` actor derivation, and transaction abort on validation or audit failures.
2. **Existing Valid Plans:** Existing positive-price plans continue to operate without modification across Admin and Customer apps.
3. **Legacy Zero-Price Plans:** Safely hidden from customer catalogs to prevent checkout aborts, while remaining visible to administrators with warning badges for manual pricing remediation.
4. **Checkout Integration:** Aligns frontend and administrative mutation contracts with `create_astrology_subscription_order` and Razorpay provider invariants.

---

## 10. Final Verification Sign-Off

AST-17 has been implemented strictly within scope, validated through both isolated PostgreSQL database transactions and TypeScript/Jest test suites, and adheres to all production security and architecture guidelines.
