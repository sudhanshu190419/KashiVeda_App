# KashiVeda — AST-Q02: Subscription Plan Deactivation and Existing Subscriber Entitlements

## Assessment Report

**Audit Target:** AST-Q02 — Daily Vedic Horoscope entitlement dependency on `astrology_subscription_plans.is_active`  
**Classification:** Assessment & Policy Analysis (No Code / Schema Modifications)  
**Repositories Inspected:**
- Mobile App & Supabase Migrations: [`C:\Projects\KashiVeda`](file:///C:/Projects/KashiVeda)
- Admin Web Application: [`C:\Projects\kashi-veda-admin`](file:///C:/Projects/kashi-veda-admin)  
**Audited Migration Range:** Migrations 001 through 054  
**Date of Assessment:** October 11, 2026  

---

## 1. Executive Summary

This assessment investigates original Feature 02 audit finding **AST-Q02**, which identified that Migration 045's Daily Vedic Horoscope entitlement predicate enforces `astrology_subscription_plans.is_active = true`. Consequently, when an administrator deactivates a subscription plan in the admin portal (`is_active = false`), existing customers who purchased that plan and hold an unexpired, fully paid subscription immediately lose access to their Daily Vedic Horoscope.

### Key Empirical Findings

1. **Immediate Feature Lockout ([CONFIRMED LOCAL BEHAVIOR](file:///C:/Projects/KashiVeda/scratch/ast_q02_test_results.json)):**  
   When an administrator toggles a plan's `is_active` to `false`, any subscriber linked to that plan immediately receives `is_entitled = false` from [`public.get_daily_rashi_insight`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L109-L233) and is blocked by the RLS policy on [`public.daily_rashi_insights`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L75-L94). The mobile application evicts cached guidance and displays a locked paywall card (🔒 *"Paid Vedic Guidance"*).

2. **Database & UI Contradiction ([CONFIRMED LOCAL BEHAVIOR](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologySubscriptionScreen.tsx#L80-L100)):**  
   Plan deactivation does **not** update or cancel records in [`public.astrology_subscriptions`](file:///C:/Projects/KashiVeda/supabase/migrations/009_astrology.sql#L42-L60). The subscription remains `status = 'active'` with an intact, future `ends_at` date. On the mobile *"My Subscription"* screen, the customer sees an **"Active"** green badge and *"25 Days Remaining"*, while on the daily insight screen, they are locked out with an upsell prompt to purchase another subscription.

3. **Architectural Delivery Inconsistency ([CONFIRMED LOCAL BEHAVIOR](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L62-L108)):**  
   The scheduled cron worker [`public.cron_astrology_delivery_dispatch`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L62-L108) (Migration 016) validates `s.status = 'active'`, `s.starts_at <= now()`, `s.ends_at > now()`, and `p.daily_in_app_enabled = true`, but **does not check** `p.is_active`. As a result, the automated backend continues dispatching push/in-app/WhatsApp delivery items to subscribers of deactivated plans, while the customer is barred from viewing daily guidance in the app interface.

4. **Product Intent Conflict ([REQUIREMENT UNRESOLVED](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx#L90-L95)):**  
   The admin portal documentation in [`astrology-plans-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx#L92) explicitly informs administrators: *"Changes made to plan attributes apply authoritatively to new subscriber checkouts."* This aligns with the contractual freeze principle established in AST-P01 (Contract A). However, Migration 045's SQL predicate treats `is_active` as an immediate revocation flag.

### Core Recommendation

Adopt **Option A: Deactivation Affects New Sales Only**.  
Plan deactivation should govern **catalog purchase availability**, ensuring new orders cannot be placed for inactive plans, while existing customers who have already paid retain access for their purchased validity window (`starts_at <= now < ends_at`).

---

## 2. Original AST-Q02 Statement

From [`KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`](file:///C:/Projects/KashiVeda/KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md#L544):

> **AST-Q02 — Requirement Clarification Needed; Medium; High observation**  
> *Issue:* Migration 045 Daily Vedic Horoscope entitlement logic checks `astrology_subscription_plans.is_active`. The admin application allows administrators to deactivate subscription plans.  
> *Concern:* An already paid current subscriber loses daily access when the plan is deactivated. Is `is_active` a sale-availability flag or an entitlement-revocation flag?  
> *Action:* Product decision required, followed by verification of paid intervals with inactive plans, preserving contractual access if required.

---

## 3. Effective Subscription-Plan Lifecycle Implementation

### 3.1 Admin Mutation Pipeline

Subscription plans are managed from [`C:\Projects\kashi-veda-admin`](file:///C:/Projects/kashi-veda-admin):

1. **Admin UI Entry Point:**  
   In [`astrology-plans-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx#L185-L215), plans are displayed with duration, price, channel flags, active subscriber counts, and an `Active` / `Inactive` badge.
2. **Form Modal:**  
   In [`plan-form-modal.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/modals/plan-form-modal.tsx#L165-L175), administrators edit plan attributes. The toggle is labeled:
   ```tsx
   <label htmlFor="isActive" className="text-xs text-foreground cursor-pointer select-none font-semibold">
     Plan Active for Customer Subscriptions
   </label>
   ```
   There is no warning that unchecking this box terminates service for existing subscribers.
3. **Server Action:**  
   In [`lib/actions/astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts#L225-L270), `saveAstrologyPlan()` invokes the authoritative database RPC:
   ```ts
   const { data, error } = await supabase.rpc("admin_save_astrology_plan", {
     p_id: formData.id || null,
     p_name: name,
     p_duration_days: formData.duration_days,
     p_price: roundedPrice,
     p_currency: formData.currency || "INR",
     p_daily_in_app_enabled: formData.daily_in_app_enabled ?? true,
     p_weekly_whatsapp_enabled: formData.weekly_whatsapp_enabled ?? false,
     p_is_active: formData.is_active ?? true,
   });
   ```
4. **Database Mutation RPC:**  
   Defined in [`052_prevent_zero_price_astrology_plans.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/052_prevent_zero_price_astrology_plans.sql#L30-L177):
   ```sql
   UPDATE public.astrology_subscription_plans
   SET
       name = v_trimmed_name,
       duration_days = p_duration_days,
       price = p_price,
       currency = v_currency,
       daily_in_app_enabled = COALESCE(p_daily_in_app_enabled, true),
       weekly_whatsapp_enabled = COALESCE(p_weekly_whatsapp_enabled, true),
       is_active = COALESCE(p_is_active, true),
       updated_at = pg_catalog.now()
   WHERE id = p_id
   RETURNING * INTO v_result_plan;
   ```
   The mutation writes an audit entry to [`public.admin_audit_logs`](file:///C:/Projects/KashiVeda/supabase/migrations/052_prevent_zero_price_astrology_plans.sql#L101-L124) recording `'astrology_plan_updated_by_admin'` with `is_active` and `previous_is_active`.

### 3.2 What Deactivation Does and Does NOT Do

| Operation | Implementation Reality | Impact |
| :--- | :--- | :--- |
| **Updates `astrology_subscription_plans.is_active`** | **Yes** (set to `false`) | Flag stored in catalog table |
| **Prevents new orders** | **Yes** via [`create_astrology_subscription_order`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql#L113-L115) | New buyers rejected with error |
| **Hides plan from public catalog** | **Yes** via RLS on [`astrology_subscription_plans`](file:///C:/Projects/KashiVeda/supabase/migrations/012_rls_and_permissions.sql#L1098-L1100) | Public queries return active only |
| **Modifies existing `astrology_subscriptions` rows** | **NO** | Rows remain untouched |
| **Changes subscription `status` to `cancelled`** | **NO** | Status remains `'active'` |
| **Issues payment refund or credit note** | **NO** | No financial event triggered |
| **Notifies affected customers** | **NO** | No notifications dispatched |
| **Revokes Daily Horoscope access** | **YES (Unintended Side-Effect)** | RPC & RLS check `p.is_active = true` |

---

## 4. Relevant Entitlement Functions and Policies

### 4.1 Authoritative RPC: `public.get_daily_rashi_insight`
Defined in [`045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L109-L233) (unchanged through Migration 054):

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
  AND p.is_active = true                     -- <--- Hard dependency on plan active flag
ORDER BY s.ends_at DESC
LIMIT 1;

IF v_active_sub.id IS NOT NULL THEN
    v_is_entitled := true;
END IF;
```

When `p.is_active = false`, `v_active_sub.id` is `NULL`. The function returns:
```json
{
  "success": false,
  "is_entitled": false,
  "error": "An active Vedic Astrology subscription is required to access Daily Insights.",
  "insight_date": "2026-10-11",
  "rashi_id": 1
}
```

### 4.2 Row-Level Security: `daily_rashi_insights_select_customer`
Defined in [`045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L75-L94):

```sql
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
                  AND p.is_active = true     -- <--- Hard dependency on plan active flag
            )
        )
    );
```

Direct queries against `daily_rashi_insights` by a subscriber whose plan is inactive yield **0 rows**.

### 4.3 Mobile Client Service Predicate: `isEligibleForDailyInAppInsights`
Defined in [`src/features/astrology/services/astrologyService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyService.ts#L84-L93):

```ts
export function isEligibleForDailyInAppInsights(
  sub: AstrologySubscription | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!isSubscriptionCurrentlyActive(sub, nowMs)) return false;
  const plan = sub?.plan;
  if (!plan) return false;

  return plan.is_active === true && plan.daily_in_app_enabled === true;
}
```

And in fallback query logic in [`dailyRashiService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L433-L437):
```ts
const plan = row.astrology_subscription_plans;
if (!plan) return false;
if (plan.is_active !== true) return false;
if (plan.daily_in_app_enabled !== true) return false;
```

### 4.4 Catalog Read Policy on `astrology_subscription_plans`
Defined in [`012_rls_and_permissions.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/012_rls_and_permissions.sql#L1098-L1100):
```sql
CREATE POLICY "astrology_subscription_plans_select_public"
    ON public.astrology_subscription_plans FOR SELECT
    USING (is_active = true OR public.is_admin());
```
Public users (including regular customers) can only read plans where `is_active = true`. Once deactivated, the plan disappears from the customer's catalog view.

### 4.5 Delivery Dispatch Cron Worker: `public.cron_astrology_delivery_dispatch`
Defined in [`016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L62-L108):
```sql
SELECT 
    s.id AS subscription_id, c.id AS content_id, c.channel, c.publish_at, 'queued'
FROM public.astrology_subscriptions s
JOIN public.astrology_subscription_plans p ON p.id = s.plan_id
CROSS JOIN public.astrology_content c
WHERE s.status = 'active'::public.astrology_subscription_status
  AND s.starts_at <= now()
  AND s.ends_at > now()
  AND c.status = 'published'::public.astrology_content_status
  AND c.publish_at <= now()
  AND (c.expires_at IS NULL OR c.expires_at > now())
  AND (
      (c.channel = 'in_app'::public.astrology_channel AND p.daily_in_app_enabled = true) OR
      (c.channel = 'whatsapp'::public.astrology_channel AND p.weekly_whatsapp_enabled = true)
  )
```
> [!IMPORTANT]
> The delivery dispatch cron **does NOT check `p.is_active = true`**. It continues dispatching astrology guidance records to subscriptions on inactive plans.

---

## 5. Concrete Scenario Results

The scenarios below were executed in an isolated disposable PostgreSQL 18 instance running port `5433` (Data: [`scratch/disposable_pg`](file:///C:/Users/Sudhanshu/.gemini/antigravity-ide/brain/42cdb6b4-fc12-43c7-8641-11e76a46b5cd/scratch/disposable_pg)). All results are recorded in [`scratch/ast_q02_test_results.json`](file:///C:/Users/Sudhanshu/.gemini/antigravity-ide/brain/42cdb6b4-fc12-43c7-8641-11e76a46b5cd/scratch/ast_q02_test_results.json).

```
================================================================================
EMPIRICAL TEST MATRIX — AST-Q02 SCENARIOS A THROUGH E
================================================================================
```

| Scenario | Condition | `get_daily_rashi_insight` | RLS Direct Query | Sub Status in DB | Mobile UI Presentation | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A: Existing Active Sub** | Plan `is_active = true`, term valid (starts -5d, ends +25d) | `is_entitled = true` | 1 row returned | `active` | Fully unlocked guidance | **CONFIRMED LOCAL BEHAVIOR** |
| **B: Plan Deactivated Mid-Term** | Admin sets `is_active = false`, term valid (+25d left) | `is_entitled = false` | 0 rows (blocked by RLS) | `active` | 🔒 Paywall lock; but *"My Sub"* shows "Active" | **CONFIRMED LOCAL BEHAVIOR** |
| **C: New Purchase Attempt** | Plan `is_active = false`, customer calls order RPC | Order creation raises exception | N/A | No sub created | Error: *"Selected astrology plan is not currently active"* | **CONFIRMED LOCAL BEHAVIOR** |
| **C: Pending Order Capture** | Order created before deactivation; paid after deactivation | Order capture fails / or if captured: `is_entitled = false` | 0 rows | `active` | Paid immediately, but instantly locked | **CONFIRMED LOCAL BEHAVIOR** |
| **D: Normal Expiration** | `ends_at <= now()`, plan active OR inactive | `is_entitled = false` | 0 rows | `expired` | Locked (expected expiration behavior) | **CONFIRMED LOCAL BEHAVIOR** |
| **E: Advance Renewal** | Current Plan 1 Active, Renewal Plan 2 Inactive | `is_entitled = true` (via Plan 1) | 1 row | `active` | Entitled today; locked when renewal begins | **CONFIRMED LOCAL BEHAVIOR** |
| **E: Both Plans Inactive** | Plan 1 & Plan 2 both `is_active = false` | `is_entitled = false` | 0 rows | `active` | Locked today despite 100 paid days remaining | **CONFIRMED LOCAL BEHAVIOR** |

### Scenario Breakdown

#### Scenario A — Existing paid subscription on active plan
- **Test Setup:** Customer A (`00000000-0000-0000-0000-00000000a002`) holds a 30-day subscription to Plan 1 (`Monthly Jyotish Guidance Q02`, `is_active = true`, `daily_in_app_enabled = true`). Subscription started 5 days ago, ends 25 days in future.
- **Observed Results:**
  - `public.get_daily_rashi_insight`: `success = true, is_entitled = true`.
  - Direct SELECT on `daily_rashi_insights`: 1 row returned.
  - Delivery dispatch cron: Successfully queues deliveries.
  - Mobile UI: Card displays personalized astrological transits and career/finance sections.

#### Scenario B — Plan deactivated during the paid interval
- **Test Setup:** Admin updates Plan 1 to `is_active = false` via [`admin_save_astrology_plan`](file:///C:/Projects/KashiVeda/supabase/migrations/052_prevent_zero_price_astrology_plans.sql#L30-L177). Customer A's subscription record is not modified (`status = 'active'`, `ends_at` still 25 days in the future).
- **Observed Results:**
  - `public.get_daily_rashi_insight`: `success = false, is_entitled = false, error = "An active Vedic Astrology subscription is required to access Daily Insights."`.
  - Direct SELECT on `daily_rashi_insights`: 0 rows returned (RLS rejects query).
  - Cache behavior in [`dailyRashiService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L283-L288): Immediately evicts memory cache and removes AsyncStorage item to prevent "stale entitlement".
  - Mobile UI in [`DailyRashiInsightCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx#L107-L130): Renders paywall with 🔒 icon, *"Paid Vedic Guidance"*, and upsell button *"Explore Subscription Plans"*.
  - Disconnect: Customer's *"My Subscription"* screen still reports status as **Active** with **25 Days Remaining**.
  - Disconnect: Automated delivery cron continues dispatching records in `astrology_deliveries`.

#### Scenario C — New customer attempts to purchase an inactive plan
- **Test Setup:** Customer B calls [`create_astrology_subscription_order`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql#L83-L235) for deactivated Plan 1.
- **Observed Results:**
  - Transaction immediately aborts with:
    `"Selected astrology plan is not currently active."` (Migration 053 line 114).
  - No payment order or subscription row is generated.
  - Preserves catalog lockdown: Deactivated plans cannot be purchased by new users.

#### Scenario D — Subscription expires normally
- **Test Setup:** Customer D has an active subscription whose `ends_at` passed 5 days ago. Housekeeping cron runs. Plan is reactivated.
- **Observed Results:**
  - Housekeeping cron transitions status from `active` to `expired`.
  - `get_daily_rashi_insight` returns `is_entitled = false`.
  - Reactivating the plan (`is_active = true`) does **not** grant access (`is_entitled = false`).
  - Normal calendar expiration operates strictly independently of plan lifecycle.

#### Scenario E — Multiple subscriptions or advance renewals
- **Test Setup:** Customer E holds current subscription to Plan 1 (valid next 10 days) and advance renewal subscription to Plan 2 (starts in 10 days, ends in 100 days).
- **Observed Results:**
  - With Plan 1 active and Plan 2 inactive: Customer E is entitled today because Plan 1 satisfies the query.
  - When Plan 1 is also deactivated: Customer E immediately loses all access, despite holding two paid subscriptions spanning 100 days into the future.
  - If Plan 2 remains inactive when day 10 arrives, Customer E's renewal period begins without access to Daily Insights.

---

## 6. Evaluation of Product Policy Options

### Option A — Deactivation Affects New Sales Only (Catalog Sunset Policy)

Under Option A:
- `is_active = false` designates that the plan is no longer offered in the sales catalog.
- Existing customers who purchased the plan retain all subscription benefits until their purchased interval (`ends_at`) elapses.
- Normal expiration (`ends_at <= now()`) and explicit customer cancellations continue to terminate access.
- Terms are not extended, and price/duration snapshots remain frozen.

#### Evidence Supporting Option A
1. **Contract A Alignment (AST-P01):** The product team established Contract A to guarantee that checkout terms are frozen and respected. Deactivating a plan after taking the customer's money should not prematurely revoke the purchased service.
2. **Admin Portal Intent:** In [`astrology-plans-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx#L92), the card description explicitly documents:
   > *"Changes made to plan attributes apply authoritatively to new subscriber checkouts."*
   This proves the admin interface was designed under the assumption that changes apply forward to new buyers, not backward to existing subscribers.
3. **Harmonization with Delivery Cron (Migration 016):** Migration 016's delivery dispatch cron already honors active subscribers on inactive plans. Option A eliminates the architectural split between push deliveries and in-app viewing.
4. **Data Model Integrity:** In `astrology_subscriptions`, the row is marked `status = 'active'` with future dates. Option A ensures database entitlement matches database status.
5. **Consumer Protection & Good Faith:** In prepaid subscriptions, revoking access without notice, reason, or refund violates consumer expectations and platform trust.

---

### Option B — Deactivation Immediately Revokes Existing Subscriber Access (Emergency Kill-Switch)

Under Option B:
- `is_active = false` acts as an immediate kill-switch that strips feature access from all subscribers associated with that plan.

#### Evidence Supporting Option B
1. **Literal SQL Implementation:** Migration 045 line 91 and line 161 literally joined `p.is_active = true`.
2. **Client Unit Test:** Test F in [`daily_astrology_subscription_selection.test.tsx`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_subscription_selection.test.tsx#L504-L530) explicitly validated that a subscription on a plan where `is_active = false` returned `isEligibleForDailyInAppInsights = false`.

#### Significant Problems with Option B
1. **No Refund or Reconciliation Mechanism:** Setting `is_active = false` creates no refund request, triggers no gateway credit, and provides no recovery path.
2. **Misleading User Experience:** The mobile app's *"My Subscription"* screen tells the customer their subscription is active and counts down remaining days, while the daily insight screen tells them they have no subscription.
3. **No Administrative Safeguards:** The admin toggle in [`plan-form-modal.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/modals/plan-form-modal.tsx#L165) contains no warning, confirmation modal, or impact preview showing how many active subscribers will be affected.
4. **Arbitrary Impact on Unrelated Subscribers:** If an admin needs to retire an old "Introductory Rs 199" plan to launch a "Standard Rs 499" plan, deactivating the old plan unintentionally punishes every user who purchased the introductory plan yesterday.

---

## 7. Customer Impact Comparison

| Dimension | Option A (New Sales Only) | Option B (Immediate Revocation) |
| :--- | :--- | :--- |
| **Customer Experience** | Seamless fulfillment of purchased days. Subscription expires naturally on `ends_at`. | Sudden loss of access. Confusing paywall appears while subscription card says "Active". |
| **Trust & Retention** | High. Customers receive exactly what they paid for. | Severely damaged. Customers feel cheated by premature cutoff without refund. |
| **Customer Support Load** | Minimal. Inactive plans simply cannot be repurchased. | High volume of complaints, dispute charges, and refund demands. |
| **Admin Operations** | Admins can safely phase out outdated plans without worrying about disrupting active devotees. | Admins cannot deactivate old plans until every single subscriber's term has expired. |
| **Financial State** | Balanced. Revenue earned matches service rendered. | Unearned revenue retained without delivering service; potential consumer rights liability. |

---

## 8. Compatibility with AST-P01 and AST-P02

### AST-P01 (Contract A — Checkout-Time Terms)
- AST-P01 established that price and duration are snapshotted in `payment_orders` at checkout time and cannot be retroactively altered by catalog edits.
- Option A is directly compatible with AST-P01: Catalog plan deactivation changes what new buyers can select, but does not alter the valid entitlement window of an existing order.
- Verified in Scenario Preservation test: Payment Order snapshot (`duration_days = 30`, `amount = 499.00`) remains strictly preserved before and after plan deactivation.

### AST-P02 (Cancelled-Subscription Reconciliation)
- AST-P02 handles payments captured after a subscription has been explicitly cancelled.
- Plan deactivation is an administrative catalog action, not a customer cancellation.
- If a customer cancels their subscription, AST-P02 ensures their payment and subscription records reflect `status = 'cancelled'`.
- Option A does not interfere with AST-P02's cancelled-payment reconciliation.

### AST-Q01 (Legacy Content Policy)
- AST-Q01 established that legacy Cosmic Insights articles are accessible to authenticated users without requiring a subscription.
- Plan deactivation has zero effect on legacy Cosmic Insights articles. Daily Vedic Horoscope retains its distinct subscription entitlement predicate.

---

## 9. Source Code References

| Component | File Path | Line Range | Role / Finding |
| :--- | :--- | :--- | :--- |
| **Daily Insight RPC** | [`supabase/migrations/045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql) | Lines 150–168 | RPC joins `p.is_active = true`, causing lockout on inactive plan |
| **Daily Insight RLS** | [`supabase/migrations/045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql) | Lines 75–94 | RLS policy enforces `p.is_active = true` for customer reads |
| **Delivery Cron** | [`supabase/migrations/016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql) | Lines 84–96 | Cron dispatches deliveries **without** checking `p.is_active` |
| **Order Creation RPC** | [`supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql) | Lines 113–115 | Correctly checks `v_plan.is_active` to block new purchases |
| **Plan Mutation RPC** | [`supabase/migrations/052_prevent_zero_price_astrology_plans.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/052_prevent_zero_price_astrology_plans.sql) | Lines 85–96 | Updates `is_active` without touching subscription rows |
| **Admin UI Notice** | [`kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx) | Lines 90–95 | States changes apply to new checkouts only |
| **Admin Form Modal** | [`kashi-veda-admin/components/admin/astrology/modals/plan-form-modal.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/modals/plan-form-modal.tsx) | Lines 165–175 | Plan active toggle with no customer revocation notice |
| **Mobile Service Predicate** | [`src/features/astrology/services/astrologyService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyService.ts) | Lines 84–93 | Evaluates `plan.is_active === true` on client |
| **Mobile Fallback Query** | [`src/features/astrology/services/dailyRashiService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts) | Lines 433–437 | Offline fallback mirrors `plan.is_active === true` check |
| **Mobile Lock Presentation** | [`src/features/astrology/components/DailyRashiInsightCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx) | Lines 107–130 | Displays paywall card when `!isEntitled` |
| **Mobile Subscription Card** | [`src/features/astrology/components/AstrologySubscriptionCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/AstrologySubscriptionCard.tsx) | Lines 25–60 | Displays "Active" badge based purely on `status` and dates |

---

## 10. Test Commands and Actual Results

### Disposable Database Scenario Suite
Command:
```bash
python C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\42cdb6b4-fc12-43c7-8641-11e76a46b5cd\scratch\test_ast_q02_plan_deactivation.py
```
Output Summary:
```
============================================================
SCENARIO A: Existing Paid Subscription on Active Plan
============================================================
rpc_success: true, rpc_is_entitled: true, direct_insight_count: 1, cron_delivery_inserted: 33

============================================================
SCENARIO B: Plan Deactivated During Paid Interval
============================================================
Plan 1 deactivated. Result plan is_active: False
rpc_success: false, rpc_is_entitled: false, error: "An active Vedic Astrology subscription is required to access Daily Insights."
direct_insight_count: 0 (Blocked by RLS)
cron_delivery_inserted_while_plan_inactive: 13 (Continued delivery)
sub_db_state: status: "active", starts_at: -5d, ends_at: +25d

============================================================
SCENARIO C: New Purchase Attempts on Inactive Plan
============================================================
Customer B order creation error: "Selected astrology plan is not currently active."

============================================================
SCENARIO D: Subscription Expires Normally
============================================================
housekeeping_expired_cnt: 1
access_while_plan_inactive: rpc_is_entitled: false
access_after_plan_reactivated: rpc_is_entitled: false

============================================================
SCENARIO E: Multiple Subscriptions and Future-Start Renewals
============================================================
initial_access (Current Plan 1 Active, Renewal Plan 2 Inactive): rpc_is_entitled: true
both_inactive_access: rpc_is_entitled: false
```

### Relevant Unit Test Suites
```bash
npm test -- __tests__/daily_astrology_subscription_selection.test.tsx
# Result: 16 passed, 16 total (1.938 s)

npm test -- __tests__/astrology_checkout_duration_snapshot.test.tsx
# Result: 18 passed, 18 total (2.175 s)

npm test -- __tests__/daily_vedic_astrology_insights.test.tsx __tests__/daily_astrology_entitlement_revalidation.test.tsx
# Result: 29 passed, 29 total (2.949 s)
```

---

## 11. Remaining Uncertainty

1. **Remote Production State ([UNVERIFIED](file:///C:/Projects/KashiVeda/supabase/migrations)):**  
   All tests were run against local code and an isolated disposable PostgreSQL 18 instance. Production database state, live subscribers on currently inactive plans, and actual Razorpay capture payloads remain unverified.
2. **Third-Party WhatsApp Dispatch Behavior ([UNVERIFIED](file:///C:/Projects/KashiVeda/supabase/functions)):**  
   The delivery cron queues delivery records in `astrology_deliveries`. How external providers handle messages queued for subscribers whose plans were deactivated after queueing was not tested against live provider endpoints.

---

## 12. Recommended Product Policy (RECOMMENDATION)

> [!TIP]
> **Recommendation:** Adopt **Option A — Deactivation Affects New Sales Only**.

### Rationale
1. **Commercial Fairness:** Devotees who purchased a 30-day or 1-year subscription in good faith must receive the full benefit of their paid validity period.
2. **Architectural Coherence:** Eliminates the contradiction where the backend cron worker delivers guidance via push/WhatsApp while the mobile client displays a locked paywall.
3. **Operational Clarity:** Allows administrators to retire, restructure, or re-price subscription tiers at any time without having to audit active subscriber lists or coordinate mass refunds.
4. **Consistency with AST-P01:** Upholds Contract A, ensuring that catalog changes modify terms available to future buyers while preserving terms contracted at checkout.

---

## 13. Decision Section for the Product Owner

Please select one of the following two policies:

### Decision Choice A: Adopt Option A (Grandfathering / New Sales Only)
- Existing subscribers retain Daily Vedic Horoscope access until their individual subscription `ends_at` timestamp.
- Inactive plans cannot be purchased by new customers.
- Subscriptions expire naturally when their term ends.
- *Recommended by Engineering.*

### Decision Choice B: Adopt Option B (Immediate Entitlement Revocation)
- Setting `is_active = false` immediately terminates Daily Vedic Horoscope access for all active subscribers on that plan.
- Requires engineering to build:
  1. Administrative impact warnings showing active subscriber counts before deactivation.
  2. Automatic transition of affected `astrology_subscriptions` rows to a dedicated `revoked` or `cancelled` status.
  3. Pro-rata refund requests or wallet credits for unfulfilled intervals.
  4. Updating Migration 016's delivery cron to halt automated dispatches to inactive plans.

---

## 14. Smallest Safe Implementation Plans

### If the Product Owner Chooses Option A (Recommended)

1. **Database Migration (`055_decoupled_plan_deactivation_entitlements.sql`):**
   - In [`public.get_daily_rashi_insight`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L150-L168), remove `AND p.is_active = true` from the entitlement check:
     ```sql
     WHERE s.customer_id = v_caller_id
       AND s.status = 'active'::public.astrology_subscription_status
       AND s.starts_at <= now()
       AND s.ends_at > now()
       AND p.daily_in_app_enabled = true
       -- Removed: AND p.is_active = true
     ```
   - In RLS policy `daily_rashi_insights_select_customer`, remove `AND p.is_active = true` from the `EXISTS` clause.
   - Retain `is_active = true` in [`create_astrology_subscription_order`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql#L113-L115) to guarantee inactive plans remain unpurchasable.
2. **Mobile Client Updates:**
   - In [`src/features/astrology/services/astrologyService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyService.ts#L84-L93) (`isEligibleForDailyInAppInsights`):
     Remove `plan.is_active === true`.
   - In [`src/features/astrology/services/dailyRashiService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L435) (`fallbackFetchInsight`):
     Remove `if (plan.is_active !== true) return false`.
3. **Unit Test Updates:**
   - Update Test F in [`__tests__/daily_astrology_subscription_selection.test.tsx`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_subscription_selection.test.tsx#L504) to assert that an active, unexpired subscription to a deactivated plan grants daily in-app entitlement until its interval concludes.

### If the Product Owner Chooses Option B (Immediate Revocation)

1. **Database Migration:**
   - Update [`public.cron_astrology_delivery_dispatch`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L84) to add `AND p.is_active = true`, eliminating the delivery disconnect.
   - In [`admin_save_astrology_plan`](file:///C:/Projects/KashiVeda/supabase/migrations/052_prevent_zero_price_astrology_plans.sql#L85), trigger automatic subscription status transitions (e.g. to `revoked`) and record refund obligations for unserved days.
2. **Admin Portal UI:**
   - In [`plan-form-modal.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/modals/plan-form-modal.tsx), add a confirmation dialog displaying: *"Warning: Deactivating this plan will immediately terminate access for X active devotees and initiate refund reconciliation."*
3. **Mobile Client Presentation:**
   - Update [`AstrologySubscriptionCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/AstrologySubscriptionCard.tsx) to display a **"Plan Discontinued"** badge instead of "Active" when `plan.is_active === false`.

---
*Assessment completed in analysis mode. No application code, database migrations, or remote infrastructure were modified.*
