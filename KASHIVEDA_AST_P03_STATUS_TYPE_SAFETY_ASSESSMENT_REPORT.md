# KashiVeda AST-P03 Status Type Safety Assessment Report

**Assessment Target:** AST-P03 — Mobile & Admin Status Type Safety, SQL Enum Representation, and Exposure Analysis  
**Evaluator:** Antigravity (Senior Production Software Engineering Assessment)  
**Date:** October 12, 2026  
**Scope:** Read-Only Source Code, SQL Migration, Type Definition, and State Machine Assessment  
**Target File:** [`KASHIVEDA_AST_P03_STATUS_TYPE_SAFETY_ASSESSMENT_REPORT.md`](file:///C:/Projects/KashiVeda/KASHIVEDA_AST_P03_STATUS_TYPE_SAFETY_ASSESSMENT_REPORT.md)

---

## 1. Executive Summary

This assessment investigates audit finding **AST-P03** from the KashiVeda Daily Astrology and Subscriptions audit. Specifically, it determines:
1. Whether the mobile application TypeScript status definition in [`src/features/astrology/types/astrology.types.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/types/astrology.types.ts) accurately represents the SQL `public.astrology_subscription_status` enum, and whether the omitted status `payment_failed` can reach application consumers.
2. Whether the Admin portal TypeScript definition for Daily Rashi Insights in [`lib/types/daily-insights-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts) narrows the underlying SQL `public.astrology_content_status` enum, and whether this narrowing creates runtime defects, unreachable branches, or misleading UI states.
3. Whether the payment, order, and subscription state machines produce `payment_failed` rows during checkout failures, retries, or webhooks.
4. How runtime fallbacks behave when encountering database status values that are omitted or narrowed in TypeScript interfaces.
5. What existing tests verify versus what remains unverified or theoretical.

### Key Assessment Findings

* **Mobile Subscription Type Mismatch Confirmed:** The mobile TypeScript union `AstrologySubscriptionStatus` in [`astrology.types.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/types/astrology.types.ts#L11-L15) contains `"payment_pending" | "active" | "expired" | "cancelled"`. It completely omits `"payment_failed"`, which is a valid SQL enum value defined in [`001_extensions_and_enums.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/001_extensions_and_enums.sql#L294-L299). In contrast, the Admin portal's [`lib/types/astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/astrology-management.ts#L1-L6) includes all 5 SQL values.
* **Practical `payment_failed` Exposure is Currently Zero in Automated Flows:** State machine inspection confirms that no current Edge Function, SQL RPC, or background worker sets `astrology_subscriptions.status = 'payment_failed'`. During checkout failures, the Razorpay webhook logs `payment.failed` as an attempt failure while leaving the subscription and payment order open in `'payment_pending'` to allow user retries. While historical, imported, or manually updated records could hold `'payment_failed'`, standard checkout does not generate them.
* **Mobile Runtime Handling of `payment_failed`:**
  * In [`AstrologySubscriptionCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/AstrologySubscriptionCard.tsx#L106-L110), an unhandled status hits a default fallback branch returning `{ label: subscription.status, bg: colors.surfaceSubtle, text: colors.textSecondary }`. The app does not crash; it displays the raw unformatted string `"payment_failed"` in a neutral badge.
  * In [`astrologyPaymentService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyPaymentService.ts#L110-L126), `pollSubscriptionConfirmation` polls for `"active"`, `"cancelled"`, or `"expired"`. If a subscription holds `"payment_failed"`, the polling loop fails to recognize it, loops for all 10 attempts (20 seconds), and ultimately falls back to returning `{ confirmed: false, status: "payment_pending" }`.
* **Admin Daily Insights Type Narrowing Confirmed:** The database column `public.daily_rashi_insights.status` uses the general SQL enum `public.astrology_content_status` (`'draft'`, `'scheduled'`, `'published'`, `'cancelled'`). However, the Admin Daily Insights TypeScript type `DailyInsightStatus` in [`daily-insights-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts#L25) narrows this to `'draft' | 'published'`.
* **Confirmed UI Display Defect in Admin Matrix:** In [`daily-insights-matrix-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx#L990-L1005), the slot status column evaluates:
  ```tsx
  {isPublished ? <Badge>Published</Badge> : isDraft ? <Badge>Draft</Badge> : <Badge>Not Created</Badge>}
  ```
  If a record in `public.daily_rashi_insights` holds `'scheduled'` or `'cancelled'`, the matrix table cell displays **"Not Created"**, despite the record existing in the database with full content. Meanwhile, the top KPI card counts it as a **"Draft"**, creating a visible discrepancy.

---

## 2. Authoritative SQL Status Domains and Values

The PostgreSQL schema declares several distinct status enums across the astrology, payment, and delivery domains:

```
+------------------------------------+---------------------------------------------------------------+
| SQL Enum Name                      | Defined Enum Values                                           |
+------------------------------------+---------------------------------------------------------------+
| public.astrology_subscription_status| 'active', 'expired', 'cancelled', 'payment_failed',           |
|                                    | 'payment_pending' (added in migration 020)                    |
+------------------------------------+---------------------------------------------------------------+
| public.payment_order_status        | 'created', 'pending', 'paid', 'failed', 'cancelled', 'expired'|
+------------------------------------+---------------------------------------------------------------+
| public.payment_transaction_status  | 'created', 'authorized', 'captured', 'failed', 'refunded',    |
|                                    | 'partially_refunded'                                          |
+------------------------------------+---------------------------------------------------------------+
| public.astrology_content_status    | 'draft', 'scheduled', 'published', 'cancelled'               |
+------------------------------------+---------------------------------------------------------------+
| public.astrology_delivery_status   | 'queued', 'sent', 'failed', 'skipped'                         |
+------------------------------------+---------------------------------------------------------------+
| public.astrology_channel           | 'in_app', 'whatsapp'                                          |
+------------------------------------+---------------------------------------------------------------+
```

### 2.1 Domain 1: Customer Astrology Subscription Lifecycle
* **SQL Enum:** `public.astrology_subscription_status`
* **Defined Values:** `'active'`, `'expired'`, `'cancelled'`, `'payment_failed'`, `'payment_pending'`
* **Migrations:**
  * Defined in [`001_extensions_and_enums.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/001_extensions_and_enums.sql#L294-L299) with values `'active'`, `'expired'`, `'cancelled'`, `'payment_failed'`.
  * Extended in [`020_astrology_subscription_payments.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/020_astrology_subscription_payments.sql#L13) via:
    ```sql
    ALTER TYPE public.astrology_subscription_status ADD VALUE IF NOT EXISTS 'payment_pending';
    ```
* **Table Column:** `public.astrology_subscriptions.status` (Default: originally `'active'`, later inserted as `'payment_pending'` during checkout).
* **RPCs/Functions Assigning Transitions:**
  * Checkout creation ([`053_freeze_astrology_subscription_duration_at_checkout.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql#L186-L198)): Inserts record with `'payment_pending'`.
  * Payment confirmation (`confirm_booking_payment` in [`054_reconcile_cancelled_astrology_subscription_payments.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/054_reconcile_cancelled_astrology_subscription_payments.sql#L652)): Transitions from `'payment_pending'` to `'active'`.
  * Daily housekeeping (`cron_astrology_subscription_housekeeping` in [`016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L45)): Transitions unexpired active rows where `ends_at < now()` from `'active'` to `'expired'`.
  * Cancellation RPCs ([`027_astrology_admin_operations.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/027_astrology_admin_operations.sql#L167)): Transitions to `'cancelled'`.
  * **Transition to `'payment_failed'`:** **None.** No RPC or trigger transitions records to `'payment_failed'`.

### 2.2 Domain 2: Payment Orders and Gateway Transactions
* **SQL Enums:**
  * `public.payment_order_status`: `'created'`, `'pending'`, `'paid'`, `'failed'`, `'cancelled'`, `'expired'`
  * `public.payment_transaction_status`: `'created'`, `'authorized'`, `'captured'`, `'failed'`, `'refunded'`, `'partially_refunded'`
* **Key Finding:** In the payment order and transaction enums, the failure value is `'failed'`. The composite identifier `'payment_failed'` belongs exclusively to `public.astrology_subscription_status`.

### 2.3 Domain 3: Astrology Content and Daily Rashi Insights
* **SQL Enum:** `public.astrology_content_status`
* **Defined Values:** `'draft'`, `'scheduled'`, `'published'`, `'cancelled'`
* **Migrations:** Defined in [`001_extensions_and_enums.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/001_extensions_and_enums.sql#L316-L321).
* **Table Columns:**
  * `public.astrology_content.status` (General long-form articles feed).
  * `public.daily_rashi_insights.status` (Structured 12-Rashi daily planetary transits, created in Migration [`045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L42)).
* **Design Note:** Migration 045 reused the existing `public.astrology_content_status` enum for `daily_rashi_insights.status`, inheriting `'scheduled'` and `'cancelled'` even though the Daily Insights authoring workflow only exposes draft and publish capabilities.

---

## 3. Mobile Subscription Type Definitions and Consumers

### 3.1 Mobile TypeScript Definition
**Source Location:** [`C:\Projects\KashiVeda\src\features\astrology\types\astrology.types.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/types/astrology.types.ts#L11-L15)

```typescript
export type AstrologySubscriptionStatus =
  | "payment_pending"
  | "active"
  | "expired"
  | "cancelled";
```

**Comparison with Admin Definition:**
In [`kashi-veda-admin/lib/types/astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/astrology-management.ts#L1-L6):
```typescript
export type AstrologySubscriptionStatus =
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'payment_failed'
  | 'payment_pending';
```
The Admin portal accurately defines all 5 SQL values, whereas the mobile application omits `"payment_failed"`.

### 3.2 Mobile Consumers Trace

#### 1. `astrologyPaymentService.pollSubscriptionConfirmation`
* **Location:** [`src/features/astrology/services/astrologyPaymentService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyPaymentService.ts#L63-L127)
* **Code Trace:**
  ```typescript
  const subStatus = data.status as AstrologySubscriptionStatus;
  // ...
  if (subStatus === "active") {
    return { confirmed: true, status: "active", subscription: sub };
  }
  if (subStatus === "cancelled") {
    return { confirmed: false, status: "cancelled", subscription: sub };
  }
  if (subStatus === "expired") {
    return { confirmed: false, status: "expired", subscription: sub };
  }
  // If attempt < maxAttempts, wait intervalMs and retry...
  // After maxAttempts:
  return { confirmed: false, status: "payment_pending" };
  ```
* **Impact of `payment_failed`:** If a subscription were to have `data.status === 'payment_failed'`, the function does not break early. It performs all 10 polling iterations (taking 20 seconds), and then returns `{ confirmed: false, status: "payment_pending" }`, coercing the failure into a pending state.

#### 2. `astrologyService.getCustomerSubscriptions`
* **Location:** [`src/features/astrology/services/astrologyService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyService.ts#L290-L347)
* **Code Trace:** Executes `recentQuery` on `astrology_subscriptions` ordered by `created_at DESC` with limit 10, with **no status filter**.
* **Impact of `payment_failed`:** Any subscription holding `'payment_failed'` is retrieved and mapped directly to an `AstrologySubscription` object.

#### 3. `selectSubscriptionSummary` & `selectCurrentSubscription`
* **Location:** [`src/features/astrology/services/astrologyService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyService.ts#L101-L176)
* **Code Trace:**
  * `currentlyActive`: filters `status === 'active' AND starts_at <= now < ends_at`. (Excludes `payment_failed`).
  * `futureActive`: filters `status === 'active' AND starts_at > now`. (Excludes `payment_failed`).
  * `pending`: filters `status === 'payment_pending'`. (Excludes `payment_failed`).
  * `newestSubscription`: sorted by `created_at DESC`. A `payment_failed` record can be selected as `newestSubscription`.
  * `selectCurrentSubscription`: returns `currentSubscription || futureSubscription || pendingSubscription || newestSubscription || null`.
* **Impact:** If the user has no active or pending subscription, a `payment_failed` record will be returned as the primary subscription.

#### 4. `useCustomerSubscription` Hook
* **Location:** [`src/features/astrology/hooks/useCustomerSubscription.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useCustomerSubscription.ts#L247-L290)
* **Impact:** `isActive` is `false`, `isFuture` is `false`, `isPending` is `false`.

#### 5. `AstrologySubscriptionCard`
* **Location:** [`src/features/astrology/components/AstrologySubscriptionCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/AstrologySubscriptionCard.tsx#L70-L111)
* **Code Trace:**
  ```typescript
  const getStatusBadge = () => {
    if (isCurrentlyActive) return { label: "Active", bg: colors.successLight, text: colors.success };
    if (isFutureStart) return { label: "Scheduled", bg: colors.surfaceSubtle, text: colors.primary };
    if (subscription.status === "payment_pending") return { label: "Pending Activation", bg: colors.warningLight, text: colors.warning };
    if (isExpired) return { label: "Expired", bg: colors.surfaceSubtle, text: colors.textSecondary };
    if (subscription.status === "cancelled") return { label: "Cancelled", bg: colors.errorLight, text: colors.error };
    return {
      label: subscription.status,
      bg: colors.surfaceSubtle,
      text: colors.textSecondary,
    };
  };
  ```
* **Impact:** Does not throw. Falls into the default return: `{ label: "payment_failed", bg: colors.surfaceSubtle, text: colors.textSecondary }`. Renders the raw snake_case string with a neutral gray background.

---

## 4. `payment_failed` State-Machine Trace

To determine whether `payment_failed` can actually be produced in production, the entire checkout and payment confirmation workflow was traced:

### 4.1 Order & Subscription Creation (Checkout)
* **RPC:** `create_astrology_subscription_checkout` in Migration [`053_freeze_astrology_subscription_duration_at_checkout.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql#L185-L218):
  * Inserts into `public.astrology_subscriptions` with:
    `status = 'payment_pending'::public.astrology_subscription_status`
  * Inserts into `public.payment_orders` with:
    `status = 'created'::public.payment_order_status`

### 4.2 Edge Function Gateway Order Creation
* **Function:** `supabase/functions/create-razorpay-order/index.ts`:
  * Takes `payment_order_id`, calls Razorpay API `orders.create`.
  * Updates `payment_orders.status` from `'created'` to `'pending'`.
  * Subscription status remains `'payment_pending'`.

### 4.3 Webhook Handling on Gateway Failure
* **Function:** `supabase/functions/razorpay-webhook/index.ts` lines 270–299:
  ```typescript
  case "payment.failed": {
    const paymentEntity = payload?.payload?.payment?.entity;
    // ...
    logger.info(
      "Received payment.failed event (attempt failure logged, order remains open)",
      { ... }
    );
    return jsonResponse({ received: true, status: "failed_attempt_logged" }, 200);
  }
  ```
* **Crucial Finding:** When a payment attempt fails at Razorpay:
  1. The webhook **does not modify** `payment_orders.status`.
  2. The webhook **does not modify** `astrology_subscriptions.status`.
  3. The subscription remains in `'payment_pending'`, allowing the customer to retry payment using another payment method.

### 4.4 Payment Confirmation on Success
* **RPC:** `confirm_booking_payment` in Migration [`054_reconcile_cancelled_astrology_subscription_payments.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/054_reconcile_cancelled_astrology_subscription_payments.sql#L609):
  ```sql
  ELSIF v_subscription.status != 'payment_pending'::public.astrology_subscription_status THEN
      RAISE EXCEPTION 'Astrology subscription is not in payment_pending state (current state: %).', v_subscription.status;
  ```
* If a subscription were ever set to `'payment_failed'`, any subsequent payment confirmation for that subscription would abort with an unhandled exception because the RPC strictly requires `'payment_pending'`.

### 4.5 Conclusion on `payment_failed` Generation
* In the current production codebase, **no automated mechanism exists to transition a subscription to `'payment_failed'`**.
* The status exists in PostgreSQL because it was defined in the foundational schema ([`001_extensions_and_enums.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/001_extensions_and_enums.sql)) before the retryable `'payment_pending'` model was adopted in Migration 020.
* However, because PostgreSQL permits `'payment_failed'`, any historical database record, manual administrative intervention, or legacy test fixture could contain it.

---

## 5. Admin Daily-Content Types and Status Handling

### 5.1 The Admin TypeScript Narrowing
In [`kashi-veda-admin/lib/types/daily-insights-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts#L25):
```typescript
export type DailyInsightStatus = 'draft' | 'published';
```
While the database column `public.daily_rashi_insights.status` is of type `public.astrology_content_status`:
```sql
CREATE TYPE public.astrology_content_status AS ENUM (
    'draft',
    'scheduled',
    'published',
    'cancelled'
);
```

### 5.2 Read Path Analysis in Admin Matrix

#### Server Action: `getDailyRashiInsightsMatrix`
In [`daily-insights-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L60-L95):
```typescript
const rows: DailyRashiInsightAdminItem[] = (data || []).map((row: any) => ({
  // ...
  status: row.status,
}));
// ...
const slots = CANONICAL_RASHIS.map((rashi) => {
  const insight = insightMap.get(rashi.id) || null;
  if (!insight) {
    missingCount++;
  } else if (insight.status === "published") {
    publishedCount++;
  } else {
    draftCount++;
  }
  return { rashi, insight };
});
```
* If a row has `status === 'scheduled'` or `status === 'cancelled'`, it falls into `else { draftCount++; }`.
* The summary card counts it as a **Draft**.

#### Matrix Table View Component: `DailyInsightsMatrixView`
In [`daily-insights-matrix-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx#L990-L1005):
```tsx
{/* 6. Status Column */}
<td className="py-3.5 px-4 text-center">
  {isPublished ? (
    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-semibold">
      Published
    </Badge>
  ) : isDraft ? (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-semibold">
      Draft
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-muted text-muted-foreground/80 border-border text-[10px]">
      Not Created
    </Badge>
  )}
</td>
```
* `const isPublished = insight?.status === "published";`
* `const isDraft = insight?.status === "draft";`
* **Confirmed Defect:** If `insight` exists with `status === 'scheduled'` or `status === 'cancelled'`, both `isPublished` and `isDraft` are `false`. The component falls into the final branch and displays **"Not Created"**!
* This creates a clear visual contradiction:
  1. The row displays the zodiac sign's General Outlook text, Career text, and an "Edit" button (indicating a record exists).
  2. The Status column displays **"Not Created"** (the exact same badge used for completely empty slots).
  3. The top summary card reports **Draft: 1**.

### 5.3 Write Path Analysis
In the authoring workflow:
* Individual Edit Modal ([`daily-insights-form-modal.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-form-modal.tsx)): offers only "Save as Draft" and "Publish Insight".
* Bulk Import Modal ([`bulk-import-modal.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx)): saves parsed CSV rows as drafts (`status = 'draft'`).
* Bulk Publish Modal ([`publish-daily-set-modal.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/publish-daily-set-modal.tsx)): transitions ready drafts to `'published'`.
* **Finding:** The Daily Insights authoring workflow intentionally and exclusively operates on `'draft'` and `'published'`. There is no scheduling or cancellation feature in the Daily Insights matrix.

---

## 6. Read-Time vs. Write-Time Status Contracts

The investigation reveals a fundamental difference between write-time product intent and read-time database tolerance:

```
+----------------------------------------------------------------------------------------------------+
|                                    Daily Insights Status Models                                    |
+----------------------------------------------------------------------------------------------------+
| SQL Schema (Database Reality)     : 'draft' | 'scheduled' | 'published' | 'cancelled'              |
| Write Path (Authoring Intent)     : 'draft' | 'published'                                          |
| Read Path (Current TypeScript)    : 'draft' | 'published'  <-- INCOMPLETE READ COVERAGE            |
| Read Path (Defensive Target)      : 'draft' | 'published' | 'scheduled' | 'cancelled'              |
+----------------------------------------------------------------------------------------------------+
```

### Why Narrowing at the Write Path is Appropriate
In Vedic astrology operations, daily insights are organized strictly by calendar date (`insight_date`). Operators curate 12 signs for a specific date and publish the entire set. Unlike general newsfeed articles in `public.astrology_content`, which have publishing timestamps and can be scheduled for future broadcast, daily insights are date-partitioned. Therefore, restricting the authoring form to `'draft'` and `'published'` is an intentional, documented product design.

### Why Narrowing at the Read Path is Unsafe
Because `public.daily_rashi_insights.status` uses the shared `astrology_content_status` enum, any record created via direct SQL, external batch imports, or database replication could contain `'scheduled'` or `'cancelled'`. Narrowing the read type causes the application to:
1. Violate TypeScript type safety at runtime.
2. Mischaracterize non-draft records as drafts in server action summary metrics.
3. Visibly label existing records as "Not Created" in the matrix UI.

---

## 7. Runtime Fallbacks and Exhaustiveness

| Component | Status Evaluated | If Known Status | If Omitted/Unknown Status | Runtime Failure Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Mobile:** `AstrologySubscriptionCard` | `AstrologySubscriptionStatus` | Formatted label & color-coded badge | Falls to `return { label: subscription.status, ... }` | **Low:** Displays raw string (e.g. `"payment_failed"` in gray badge). Does not crash. |
| **Mobile:** `pollSubscriptionConfirmation` | `AstrologySubscriptionStatus` | Breaks loop on `'active'`, `'cancelled'`, `'expired'` | Loops all 10 attempts (20s) and returns `'payment_pending'` | **Medium:** Unnecessary 20s delay, misreports failed state as pending. |
| **Admin:** `DailyInsightsMatrixView` | `DailyInsightStatus` | `'published'` (green), `'draft'` (amber) | Falls to `else` branch returning `<Badge>Not Created</Badge>` | **High:** Misleading operator display. Valid record labeled as "Not Created". |
| **Admin:** `getDailyRashiInsightsMatrix` | `DailyInsightStatus` | `'published'` -> `publishedCount++` | Falls to `else` -> `draftCount++` | **Medium:** Counts scheduled/cancelled records as drafts in KPI summary. |
| **Admin:** `AstrologySubscriptionsView` | `AstrologySubscriptionStatus` | Dedicated cases for all 5 statuses | Dedicated `case "payment_failed":` badge | **None:** Admin subscription view handles all 5 statuses safely. |

---

## 8. Existing Tests and Safe Verification Results

### 8.1 Inspection of Existing Test Suites

#### 1. `daily_astrology_read_failure_and_subscription_counts.test.ts`
* **Source:** [`__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts#L410-L425)
* **Test 19:** Specifically includes `status: "payment_failed"` in its fixture array to ensure count queries exclude non-active rows:
  ```typescript
  const fixtureSubscriptions = [
    { id: "s1", plan_id: planId, status: "active" },
    { id: "s2", plan_id: planId, status: "active" },
    { id: "s3", plan_id: planId, status: "cancelled" },
    { id: "s4", plan_id: planId, status: "expired" },
    { id: "s5", plan_id: planId, status: "payment_pending" },
    { id: "s6", plan_id: planId, status: "payment_failed" },
  ];
  ```
* **Finding:** Confirms that server-side count queries safely handle `payment_failed` without error.

#### 2. `daily_astrology_subscription_selection.test.tsx`
* **Source:** [`__tests__/daily_astrology_subscription_selection.test.tsx`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_subscription_selection.test.tsx#L5-L19)
* **Tests A–P:** Tests `status: "active"`, `"payment_pending"`, `"expired"`, and `"cancelled"`.
* **Finding:** Test J ("Older valid subscription remains active while newer purchase attempt fails or cancels") simulates a failed renewal using `status: "cancelled"`, completely bypassing `payment_failed`. No test in this suite exercises `payment_failed`.

### 8.2 Disposable Local Simulation Results
A deterministic runtime simulation script ([`scratch/test_ast_p03_defensive_behavior.mjs`](file:///C:/Projects/KashiVeda/scratch/test_ast_p03_defensive_behavior.mjs)) was executed to verify component behavior when given omitted statuses:
* **Mobile Badge on `payment_failed`:** Returned `{ label: 'payment_failed', style: 'neutral_fallback' }`.
* **Admin Matrix on `scheduled`:** Returned `"Not Created"`.
* **Admin Matrix on `cancelled`:** Returned `"Not Created"`.
* **Admin Matrix on `draft`:** Returned `"Draft"`.
* **Admin Matrix on `null`:** Returned `"Not Created"`.

---

## 9. Confirmed Defects vs. Defensive Improvements

### 9.1 Confirmed Defects
1. **Admin Matrix Status Column Display Defect:**  
   In [`daily-insights-matrix-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx#L990-L1005), if a record in `public.daily_rashi_insights` holds `'scheduled'` or `'cancelled'`, the UI renders `<Badge>Not Created</Badge>`. This is a confirmed presentation defect that misrepresents valid database records as non-existent.
2. **Mobile Polling Loop Degradation:**  
   In [`astrologyPaymentService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyPaymentService.ts#L110-L126), if a subscription holds `'payment_failed'`, `pollSubscriptionConfirmation` fails to break, blocks the caller for 20 seconds, and reports the subscription as `'payment_pending'`.

### 9.2 Defensive Improvements (Non-Defect Alignments)
1. **Mobile `AstrologySubscriptionStatus` Union Alignment:**  
   Adding `"payment_failed"` to `AstrologySubscriptionStatus` in [`astrology.types.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/types/astrology.types.ts) is a defensive improvement that aligns the mobile type with the SQL schema and the Admin portal's [`astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/astrology-management.ts). In normal checkout flows, this status is not currently emitted.
2. **Read/Write Type Separation in Admin Daily Insights:**  
   Separating `DailyInsightAuthoringStatus = 'draft' | 'published'` (for forms) from `DailyInsightRecordStatus = 'draft' | 'scheduled' | 'published' | 'cancelled'` (for reads) provides complete contract safety without loosening authoring constraints.

---

## 10. Production Exposure: Confirmed or Unverified

* **Mobile `payment_failed` Exposure:** **Unverified / Low Probability.**  
  Automated code paths in `create-razorpay-order`, `razorpay-webhook`, and `confirm_booking_payment` do not write `payment_failed`. It could only exist in production if created by early prototype migrations, manual administrative SQL queries, or third-party data imports.
* **Admin `scheduled` / `cancelled` Daily Insights Exposure:** **Unverified / Low Probability.**  
  Admin authoring workflows and CSV import only insert `'draft'` or `'published'`. A record would only hold `'scheduled'` or `'cancelled'` if inserted via direct SQL or a custom script targeting `public.daily_rashi_insights`.
* **Production Database State:**  
  No authorized production database read connection was available during this assessment. Real record counts for these statuses in production remain unverified.

---

## 11. Recommended Next Step, Without Implementing It

When implementation is scheduled:
1. **Mobile Type Alignment:**
   * In [`src/features/astrology/types/astrology.types.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/types/astrology.types.ts#L11-L15), add `| "payment_failed"` to `AstrologySubscriptionStatus`.
   * In [`astrologyPaymentService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyPaymentService.ts#L110), add an early return:
     ```typescript
     if (subStatus === "payment_failed") {
       return { confirmed: false, status: "payment_failed", subscription: sub };
     }
     ```
   * In [`AstrologySubscriptionCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/AstrologySubscriptionCard.tsx), add a dedicated case:
     ```typescript
     if (subscription.status === "payment_failed") {
       return { label: "Payment Failed", bg: colors.errorLight, text: colors.error };
     }
     ```
2. **Admin Daily Insights Read/Write Separation:**
   * In [`lib/types/daily-insights-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts), define:
     ```typescript
     export type DailyInsightAuthoringStatus = 'draft' | 'published';
     export type DailyInsightStatus = 'draft' | 'scheduled' | 'published' | 'cancelled';
     ```
   * In [`daily-insights-matrix-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx#L990-L1005), update status column rendering to explicitly handle `'scheduled'` (blue badge) and `'cancelled'` (gray badge), reserving `"Not Created"` strictly for `!insight`.
   * In [`daily-insights-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L91), update summary calculations so that non-published/non-draft rows are not incorrectly tallied as drafts.

---

## 12. Exact Files, Functions, Enums, and Migrations Inspected

### 12.1 Mobile Application Files (`C:\Projects\KashiVeda`)
* [`src/features/astrology/types/astrology.types.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/types/astrology.types.ts): `AstrologySubscriptionStatus`, `AstrologyContentStatus`, `AstrologyDeliveryStatus`.
* [`src/features/astrology/services/astrologyPaymentService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyPaymentService.ts): `pollSubscriptionConfirmation`, `createRazorpayOrder`.
* [`src/features/astrology/services/astrologyService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyService.ts): `getCustomerSubscriptions`, `selectSubscriptionSummary`, `selectCurrentSubscription`.
* [`src/features/astrology/hooks/useCustomerSubscription.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useCustomerSubscription.ts): subscription state derivation and lifecycle timers.
* [`src/features/astrology/components/AstrologySubscriptionCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/AstrologySubscriptionCard.tsx): `getStatusBadge` fallback handling.
* [`src/features/astrology/screens/AstrologySubscriptionScreen.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologySubscriptionScreen.tsx): subscription card display.
* [`src/features/astrology/screens/AstrologyScreen.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologyScreen.tsx): hub subscription section.

### 12.2 Admin Portal Files (`C:\Projects\kashi-veda-admin`)
* [`lib/types/daily-insights-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts): `DailyInsightStatus` narrowing.
* [`lib/types/astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/types/astrology-management.ts): `AstrologySubscriptionStatus` (5-value definition).
* [`lib/actions/daily-insights-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts): `getDailyRashiInsightsMatrix` aggregation logic.
* [`components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx): slot status column rendering.
* [`components/admin/astrology/daily-insights/daily-insights-form-modal.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-form-modal.tsx): authoring form status choices.
* [`components/admin/astrology/astrology-subscriptions-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-subscriptions-view.tsx): subscription badges and filter dropdown.

### 12.3 Database Migrations & Edge Functions
* [`supabase/migrations/001_extensions_and_enums.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/001_extensions_and_enums.sql): initial enum declarations.
* [`supabase/migrations/016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql): housekeeping cron workers.
* [`supabase/migrations/020_astrology_subscription_payments.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/020_astrology_subscription_payments.sql): addition of `payment_pending`.
* [`supabase/migrations/045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql): table creation for `daily_rashi_insights`.
* [`supabase/migrations/047_harden_daily_astrology_admin_rpcs.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/047_harden_daily_astrology_admin_rpcs.sql): `admin_save_daily_rashi_insight` RPC.
* [`supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql): checkout creation.
* [`supabase/migrations/054_reconcile_cancelled_astrology_subscription_payments.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/054_reconcile_cancelled_astrology_subscription_payments.sql): `confirm_booking_payment` RPC.
* [`supabase/functions/razorpay-webhook/index.ts`](file:///C:/Projects/KashiVeda/supabase/functions/razorpay-webhook/index.ts): webhook event handler.

### 12.4 Test Files Inspected & Executed
* [`__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts): verified AST-20 count query handling of `payment_failed`.
* [`__tests__/daily_astrology_subscription_selection.test.tsx`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_subscription_selection.test.tsx): verified status selection logic.

---

## 13. Safety Attestation & Final Decision

### 13.1 Safety Attestation
* No production or local source files were modified.
* No test suites were modified.
* No database migrations, schemas, or RPCs were added or altered.
* No live gateways or webhooks were invoked.
* Only this assessment report file was created.

### 13.2 Final Decision

**Outcome C — Confirmed implementation inconsistency**  
*(Accompanied by Outcome B for mobile payment_failed exposure, and Outcome D for Daily Insights read/write contract architecture)*

**Justification:**  
1. **Admin Daily Insights Implementation Inconsistency:** The database column `daily_rashi_insights.status` uses `astrology_content_status` (which contains `'scheduled'` and `'cancelled'`). In [`daily-insights-matrix-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx#L990-L1005), any record holding either status is rendered as **"Not Created"**, demonstrably misrepresenting valid database records as non-existent while the summary KPI card counts them as **"Drafts"**.
2. **Mobile Subscription Status Inconsistency:** SQL `public.astrology_subscription_status` contains 5 values. The Admin portal implements all 5 values. The mobile type [`astrology.types.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/types/astrology.types.ts#L11-L15) implements only 4, omitting `'payment_failed'`. While current checkout workflows do not emit `'payment_failed'`, any record possessing it causes a 20-second timeout in `pollSubscriptionConfirmation` before being coerced to `'payment_pending'`, and renders raw unstyled text in `AstrologySubscriptionCard`.
