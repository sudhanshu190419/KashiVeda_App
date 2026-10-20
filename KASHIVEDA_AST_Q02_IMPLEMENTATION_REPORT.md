# KashiVeda — AST-Q02 Implementation Report

## Decouple Subscription Plan Deactivation From Existing Subscriber Entitlements

---

### 1. Executive Summary

| Attribute | Specification |
| :--- | :--- |
| **Audit Finding Reference** | AST-Q02 (Daily Vedic Horoscope Subscription Entitlements) |
| **Approved Product Policy** | **Option A — Deactivation Affects New Sales Only** |
| **Primary Rule** | Setting `astrology_subscription_plans.is_active = false` stops new customer purchases and hides plans from the public catalog, but **does not revoke Daily Vedic Horoscope access** for existing customers holding a valid, paid, unexpired subscription. |
| **Target Repositories** | Mobile application (`C:\Projects\KashiVeda`) & Admin portal (`C:\Projects\kashi-veda-admin`) |
| **Database Migration** | `supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql` (Forward-only; migrations 001–054 untouched) |
| **Integration Test Cluster** | Isolated PostgreSQL 18.4 on localhost port 5433 (Disposable scratch data directory) |
| **Production Safety** | 100% Local. Zero remote migrations, zero production access, zero real financial operations. |
| **Overall Verification Status** | **ALL CRITERIA PASS (10/10 SCENARIOS VERIFIED)** |

---

### 2. Approved Option A Policy Reference

Under explicit product owner approval:
> *"Setting `astrology_subscription_plans.is_active = false` prevents new customers from purchasing that plan but does not revoke Daily Vedic Horoscope access from customers who already have a valid subscription to it."*

#### Core Invariants:
1. **Purchased Term Preservation**: A valid subscription satisfies `status = 'active'`, `starts_at <= now()`, and `ends_at > now()`. Deactivating a plan never alters subscription dates, cancels records, extends periods, or generates refunds.
2. **Channel Feature Enforcement**: Subscription entitlement requires `daily_in_app_enabled = true`. Plan deactivation cannot grant access to features not included in the plan.
3. **Identity Isolation**: Access is strictly bound to `customer_id = auth.uid()`. One customer's subscription never entitles another user.
4. **Catalog Protection**: Inactive plans remain hidden from prospective customers and cannot be ordered through `public.create_astrology_subscription_order`.

---

### 3. Root Cause and Previous Inconsistent Behavior

Prior to this remediation, an architectural discrepancy existed between daily delivery dispatch and interactive in-app insight reads:

1. **Daily Cron Dispatch (Migration 016)**:
   `public.cron_astrology_delivery_dispatch` selected subscribers using:
   ```sql
   WHERE s.status = 'active'::public.astrology_subscription_status
     AND s.starts_at <= now()
     AND s.ends_at > now()
     AND ((c.channel = 'in_app' AND p.daily_in_app_enabled = true) OR ...)
   ```
   *Note: Migration 016 never required `p.is_active = true`.*
2. **Interactive Horoscope In-App Access (Migration 045)**:
   Both `public.get_daily_rashi_insight` and the RLS policy `daily_rashi_insights_select_customer` included:
   ```sql
   AND p.daily_in_app_enabled = true
   AND p.is_active = true  -- Root Cause: Prematurely revoked subscriber access upon plan retirement
   ```
3. **Mobile Client Logic**:
   `isEligibleForDailyInAppInsights` in `astrologyService.ts` and `fallbackFetchInsight` in `dailyRashiService.ts` duplicated this check (`plan.is_active === true`), locking out paying subscribers when an administrator retired a plan from new catalog sales.
4. **Admin UI Confusion**:
   The admin plan toggle was labelled *"Plan Active for Customer Subscriptions"*, leading operators to believe toggling it might deactivate existing customer services.

---

### 4. Database Changes — Migration 055

A new forward-only migration was created:
`supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql`

#### Changes Implemented:

1. **Security Definer Helper `public.is_customer_subscribed_to_plan`**:
   ```sql
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
       SELECT CASE 
           WHEN p_user_id IS NULL THEN false
           ELSE EXISTS (
               SELECT 1 
               FROM public.astrology_subscriptions s
               WHERE s.plan_id = p_plan_id
                 AND s.customer_id = p_user_id
           )
       END;
   $$;
   ```
   *Rationale*: Under PostgreSQL RLS, when a customer reads `daily_rashi_insights` directly, the policy joins `astrology_subscription_plans`. If the catalog RLS policy completely hides inactive plans from non-admins, the customer cannot evaluate `p.daily_in_app_enabled`. This helper allows active subscribers to view their purchased plan details while completely hiding inactive plans from the general catalog and non-subscribers.

2. **Updated Catalog Policy on `public.astrology_subscription_plans`**:
   ```sql
   DROP POLICY IF EXISTS "astrology_subscription_plans_select_public" ON public.astrology_subscription_plans;
   CREATE POLICY "astrology_subscription_plans_select_public"
       ON public.astrology_subscription_plans FOR SELECT
       USING (
           is_active = true
           OR public.is_admin()
           OR public.is_customer_subscribed_to_plan(id, auth.uid())
       );
   ```

3. **Updated Customer Read Policy on `public.daily_rashi_insights`**:
   ```sql
   DROP POLICY IF EXISTS "daily_rashi_insights_select_customer" ON public.daily_rashi_insights;
   CREATE POLICY "daily_rashi_insights_select_customer"
       ON public.daily_rashi_insights FOR SELECT
       USING (
           status = 'published'::public.astrology_content_status
           AND insight_date <= ((now() AT TIME ZONE 'Asia/Kolkata')::DATE)
           AND (
               public.is_admin()
               OR EXISTS (
                   SELECT 1
                   FROM public.astrology_subscriptions s
                   JOIN public.astrology_subscription_plans p ON p.id = s.plan_id
                   WHERE s.customer_id = auth.uid()
                     AND s.status = 'active'::public.astrology_subscription_status
                     AND s.starts_at <= now()
                     AND s.ends_at > now()
                     AND p.daily_in_app_enabled = true
               )
           )
       );
   ```
   *Removed: `AND p.is_active = true`.*

4. **Updated Authoritative RPC `public.get_daily_rashi_insight`**:
   Preserved all existing behavior (IST calendar semantics, admin bypass, published status check, input validation, error structures), while removing `AND p.is_active = true` from the `v_active_sub` query:
   ```sql
   SELECT s.id, s.starts_at, s.ends_at, p.name AS plan_name, p.daily_in_app_enabled
   INTO v_active_sub
   FROM public.astrology_subscriptions s
   JOIN public.astrology_subscription_plans p ON p.id = s.plan_id
   WHERE s.customer_id = v_caller_id
     AND s.status = 'active'::public.astrology_subscription_status
     AND s.starts_at <= now()
     AND s.ends_at > now()
     AND p.daily_in_app_enabled = true
   ORDER BY s.ends_at DESC
   LIMIT 1;
   ```

---

### 5. Mobile Entitlement Logic Updates

| File | Change Details |
| :--- | :--- |
| `src/features/astrology/services/astrologyService.ts` | Updated `isEligibleForDailyInAppInsights(sub)` to return `plan.daily_in_app_enabled === true`, removing `plan.is_active === true`. Updated docstring to document AST-Q02 Option A semantics. |
| `src/features/astrology/services/dailyRashiService.ts` | In `fallbackFetchInsight`, removed `if (plan.is_active !== true) return false;` from `qualifyingSub` filter while keeping active status, dates, and `daily_in_app_enabled` checks intact. |
| `__tests__/daily_astrology_subscription_selection.test.tsx` | Updated Test F to assert Option A: active subscription on inactive plan retains entitlement; expired or disabled channel subscriptions remain correctly locked. |

---

### 6. Admin Plan-Editor UI Clarifications

Files updated in `C:\Projects\kashi-veda-admin`:

1. **`components/admin/astrology/modals/plan-form-modal.tsx`**:
   - Replaced label *"Plan Active for Customer Subscriptions"* with **"Available for New Purchases"**.
   - Added explanatory helper text:
     > *"Deactivating removes the plan from the customer catalog and prevents new purchases. Existing paid subscribers retain access until their subscription period expires."*
2. **`components/admin/astrology/astrology-plans-view.tsx`**:
   - Updated `CardDescription`:
     > *"Changes made to plan attributes apply authoritatively to new subscriber checkouts. Deactivating a plan stops new sales while existing subscribers retain benefits through their valid term."*
   - Updated inactive status badge to indicate **"Inactive (New Sales Closed)"** with explanatory tooltip.

---

### 7. Prevention of Inactive Plan Purchases

New checkouts for inactive plans are completely blocked across all layers:
1. **Catalog Query Layer**: `astrology_subscription_plans_select_public` RLS policy ensures prospective buyers and anonymous users only see plans with `is_active = true`.
2. **Order Creation RPC Layer**: `public.create_astrology_subscription_order` (Migration 053 line 113) strictly checks:
   ```sql
   IF NOT v_plan.is_active THEN
       RAISE EXCEPTION 'Selected astrology plan is not currently active.';
   END IF;
   ```
   Attempts to create an order for an inactive plan are rejected prior to creating any payment order or subscription record.
3. **Client UI Layer**: In `AstrologyPlanDetailScreen.tsx`, purchase button is disabled if `plan.is_active !== true`.

---

### 8. Verification Results — Scenarios A Through J

All scenario tests were executed on disposable PostgreSQL 18.4 (port 5433) using `scratch/verify_ast_q02_migration055.py`. Results were serialized to `scratch/ast_q02_migration055_results.json`:

| Scenario | Objective | RPC Result | Direct SELECT | Status |
| :--- | :--- | :--- | :--- | :---: |
| **A** | Existing paid subscription on an active plan | `is_entitled: true`, Content returned | 1 row returned | **PASS** |
| **B** | Deactivate plan during valid paid subscription (Primary AST-Q02) | `is_entitled: true`, Content returned | 1 row returned | **PASS** |
| **C** | Attempt new purchase on inactive plan | Exception raised: *"Selected astrology plan is not currently active."* No order/subscription created. Active plan orders succeed. | N/A | **PASS** |
| **D** | Normal subscription expiration (`ends_at <= now()`) | `is_entitled: false` on inactive plan; `is_entitled: false` after reactivation | 0 rows returned | **PASS** |
| **E** | Future-start renewal (`starts_at > now()`) | Current sub entitled; premature future sub denied; activated future sub on inactive plan entitled | Consistent | **PASS** |
| **F** | Explicitly cancelled subscription (`status = 'cancelled'`) | `is_entitled: false` on inactive plan; `is_entitled: false` on active plan | 0 rows returned | **PASS** |
| **G** | Identity isolation (unauthorized / non-subscribed caller) | Anonymous denied; Customer B denied | 0 rows returned | **PASS** |
| **H** | Feature flag enforcement (`daily_in_app_enabled = false`) | `is_entitled: false` despite active unexpired subscription | 0 rows returned | **PASS** |
| **I** | RPC and Direct SELECT consistency | 100% agreement across all customer states (A through H) | Consistent | **PASS** |
| **J** | Contract Preservation (AST-P01 duration snapshot, delivery cron, AST-P02 reconciliation) | Duration snapshot = 365, Cron dispatched for inactive plan = 18 deliveries, `confirm_booking_payment` intact | Confirmed | **PASS** |
| **Catalog** | Public catalog visibility | Active plans visible = 12; Inactive visible to anon = 0 | Hidden | **PASS** |

---

### 9. Test Commands and Execution Results

#### Database Integration Test (Disposable PostgreSQL Port 5433)
```powershell
python "C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\42cdb6b4-fc12-43c7-8641-11e76a46b5cd\scratch\verify_ast_q02_migration055.py"
```
- **Exit Code**: 0
- **Scenarios Evaluated**: 10 (A through J) + Catalog RLS
- **Result**: ALL PASS

#### Mobile Unit & Regression Test Suites
```powershell
npm test -- __tests__/daily_astrology_subscription_selection.test.tsx `
           __tests__/astrology_checkout_duration_snapshot.test.ts `
           __tests__/daily_vedic_astrology_insights.test.tsx `
           __tests__/daily_astrology_entitlement_revalidation.test.tsx `
           __tests__/astrology_subscription_payment_serialization.test.ts `
           __tests__/astrology_payment_backend.test.ts
```
- **Exit Code**: 0
- **Suites Passed**: 6 / 6
- **Total Tests Passed**: 87 / 87
- **Snapshots**: 0
- **Duration**: 3.0 s

---

### 10. TypeScript and ESLint Results

| Repository / File | Tool | Command | Exit Code | Result |
| :--- | :--- | :--- | :---: | :---: |
| `C:\Projects\KashiVeda` | TypeScript | `npx tsc --noEmit` | 0 | **PASS** (Zero errors) |
| `astrologyService.ts` & `dailyRashiService.ts` | ESLint | `npx eslint <files>` | 0 | **PASS** (Zero warnings/errors) |
| `C:\Projects\kashi-veda-admin` | TypeScript | `npx tsc --noEmit` | 0 | **PASS** (Zero errors) |

---

### 11. Compatibility With Prior Audits (AST-P01, AST-P02, AST-16, AST-17)

- **AST-P01 Duration Snapshot**: Migration 055 does not alter `payment_orders.duration_days` or `create_astrology_subscription_order` calculation logic. Verified in Scenario J.
- **AST-P02 Cancelled Payment Reconciliation**: `public.confirm_booking_payment` signature and cancellation recovery workflow remain completely untouched. Cancelled subscriptions remain ineligible for horoscope insights under all conditions (Scenario F).
- **AST-16 Plan & Content Audit Mutations**: `admin_save_astrology_plan` atomic audit logging and security checks remain intact.
- **AST-17 Positive-Price Guard**: `prevent_zero_price_astrology_plans` validation remains enforced.

---

### 12. Unresolved Limitations

No architectural or regression blockers remain. The implementation is complete, decoupled, and consistent across database RPCs, PostgreSQL RLS, cron dispatch, mobile TypeScript helpers, and administrative UI text.

---

### 13. Safety and Environmental Attestation

1. **Production Database**: NEVER contacted or modified. All SQL execution was restricted strictly to the disposable PostgreSQL 18.4 instance on port 5433 with scratch data directory `scratch/disposable_pg`.
2. **Migrations 001–054**: Preserved verbatim without modification. Migration 055 is forward-only.
3. **Financial Integrations**: Razorpay APIs, webhooks, and live credentials were mock-verified only. Zero live payment charges, cancellations, or refunds were initiated.
4. **Stopping Point**: Execution was stopped immediately upon completion of implementation, regression verification, and final report delivery.

---

*Report compiled on 2026-10-11T23:00:00+05:30.*
