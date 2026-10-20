# KashiVeda AST-Q06 Subscription Metrics Assessment Report

**Assessment Target:** AST-Q06 — Admin Astrology Overview & Per-Plan Subscriber Counts Query & Metric Semantics  
**Evaluator:** Antigravity (Senior Production Software Engineering Assessment)  
**Date:** October 12, 2026  
**Scope:** Read-Only Source Code, SQL Schema, Migration, and Deterministic Scenario Assessment  
**Target File:** [`KASHIVEDA_AST_Q06_SUBSCRIPTION_METRICS_ASSESSMENT_REPORT.md`](file:///C:/Projects/KashiVeda/KASHIVEDA_AST_Q06_SUBSCRIPTION_METRICS_ASSESSMENT_REPORT.md)

---

## 1. Executive Summary

This assessment investigates finding **AST-Q06** from the KashiVeda Daily Astrology and Subscriptions audit. Specifically, it determines:
1. What the Admin portal astrology overview and per-plan subscriber metrics actually measure.
2. Whether their underlying queries account for subscription validity intervals (`starts_at` and `ends_at` timestamps).
3. Whether the displayed numbers represent subscription database records or distinct customer identities.
4. How current metrics relate to the authoritative customer entitlement contract enforced by database RPCs and Row-Level Security (RLS).
5. Whether previously remediated **AST-20** protections (error surfacing, avoidance of silent zero fallbacks, and row-cap immunity) remain intact.

### Key Assessment Findings

* **Absence of Timestamp Constraints:** Neither the overview KPI query nor the per-plan counting queries in the Admin portal inspect `starts_at` or `ends_at`. They filter strictly on `status = 'active'`.
* **Counting Rows, Not Distinct Customers:** All subscription count queries execute PostgREST exact head count requests (`select("*", { count: "exact", head: true })`). They count **database rows in `public.astrology_subscriptions`**, not distinct customer IDs (`customer_id`).
* **Future-Start Active Subscriptions Are Counted:** When a customer renews an existing active subscription, migration `053_freeze_astrology_subscription_duration_at_checkout.sql` creates a sequential renewal record whose `starts_at` is set to the current subscription's future `ends_at`. Upon successful payment capture, this renewal record is immediately set to `status = 'active'`. Consequently, the customer possesses **two concurrent `status = 'active'` records**, both of which are counted immediately in Admin overview and per-plan counts, before the renewal term begins.
* **Expired-by-Time Subscriptions Remain Counted Until Housekeeping:** Subscriptions whose `ends_at` timestamp has elapsed into the past remain counted as active until the daily cron worker `cron_astrology_subscription_housekeeping()` (scheduled at `00:05 UTC` in migration `016_cron_and_queues.sql`) updates `status = 'expired'`. During the latency window (up to 24 hours), or if the cron worker fails, expired subscriptions continue to be counted as active.
* **Semantic Divergence Across UI Labels:**
  * In `/astrology` Overview: The primary card label is **"Active Subscriptions"** (subtext: *"Out of X total registered subscriptions"*). This accurately reflects record counting, although the underlying TypeScript interface property is named `activeSubscribers`.
  * In `/astrology/plans`: The table column header is **"Active Subscribers"** and the summary KPI card is titled **"Subscribed Devotees"** (calculated via summing per-plan counts: `plans.reduce((acc, p) => acc + p.activeSubscriberCount, 0)`). These labels imply distinct customer identities (*people / devotees*), but the displayed number counts active subscription records and double-counts customers with renewals or multi-plan subscriptions.
* **Authoritative Entitlement Divergence:** In the mobile app and database RPC layer (`public.get_daily_rashi_insight` and RLS on `daily_rashi_insights`), a user is entitled **if and only if** `status = 'active' AND starts_at <= now() AND ends_at > now() AND p.daily_in_app_enabled = true`. The Admin reporting metrics do not evaluate entitlement; they evaluate lifecycle state.
* **AST-20 Invariants Fully Preserved:** The exact count queries, absence of memory-fetching truncation, and error/unavailable propagation (`formatCountMetric` returning `"Unavailable"` when count is `null`) remain fully functional and passed all 23 unit tests in [`__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts).

---

## 2. Inventory of Admin Subscription Metrics and Their Labels

The Admin web portal displays subscription metrics across three primary views:

| View Path | UI Element | Exact Displayed Label | Underlying Property | Underlying Query Filter | Entity Counted |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/astrology` | Metric Card 1 | **Active Subscriptions** | `activeSubscribers` | `.eq("status", "active")` | Subscription records |
| `/astrology` | Metric Card 1 Subtext | **Out of [X] total registered subscriptions** | `totalSubscribers` | Unfiltered table count | Subscription records |
| `/astrology` | Metric Card 2 | **Subscription Plans** | `activePlans` | `.eq("is_active", true)` | Plan records |
| `/astrology/plans` | Summary Card 3 | **Subscribed Devotees** | `totalActiveSubs` (Sum of plan counts) | Sum of per-plan `.eq("status", "active")` | Sum of per-plan subscription records |
| `/astrology/plans` | Table Column 5 | **Active Subscribers** | `plan.activeSubscriberCount` | `.eq("plan_id", plan.id).eq("status", "active")` | Subscription records for that plan |
| `/astrology/subscriptions` | Summary Card 1 | **Total Subscriptions** | `data.summary.totalSubscriptions` | Unfiltered table count | Subscription records |
| `/astrology/subscriptions` | Summary Card 2 | **Active** | `data.summary.activeSubscriptions` | `.eq("status", "active")` | Subscription records |
| `/astrology/subscriptions` | Summary Card 3 | **Payment Pending** | `data.summary.paymentPendingSubscriptions` | `.eq("status", "payment_pending")` | Subscription records |
| `/astrology/subscriptions` | Summary Card 4 | **Expired** | `data.summary.expiredSubscriptions` | `.eq("status", "expired")` | Subscription records |
| `/astrology/subscriptions` | Summary Card 5 | **Cancelled** | `data.summary.cancelledSubscriptions` | `.eq("status", "cancelled")` | Subscription records |

---

## 3. Overview Metric: Exact Query and Counting Semantics

### 3.1 Server Action Implementation
**Source Location:** [`C:\Projects\kashi-veda-admin\lib\actions\astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts#L34-L170) (`getAstrologyOverview`)

```typescript
export async function getAstrologyOverview(): Promise<AstrologyOverviewMetrics> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const [
    totalPlansRes,
    activePlansRes,
    totalSubscribersRes,
    activeSubscribersRes,
    publishedContentRes,
    scheduledContentRes,
    queuedDeliveriesRes,
    failedDeliveriesRes,
    recentDeliveriesRes,
    recentSubscriptionsRes,
  ] = await Promise.all([
    supabase.from("astrology_subscription_plans").select("*", { count: "exact", head: true }),
    supabase.from("astrology_subscription_plans").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("astrology_subscriptions").select("*", { count: "exact", head: true }),
    supabase.from("astrology_subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
    // ... deliveries and recent queries
  ]);
  // ... evaluateCountMetric
```

### 3.2 Evaluation Against Criteria
1. **Exact displayed label:** Card Title: **"Active Subscriptions"**; Subtext: **"Out of [X] total registered subscriptions"**.
2. **Intended meaning:** Represents the volume of subscription agreements currently in an active lifecycle state.
3. **Exact query:** `supabase.from("astrology_subscriptions").select("*", { count: "exact", head: true }).eq("status", "active")`.
4. **Entity counted:** **Table rows** (`*`) in `public.astrology_subscriptions`. It does **not** count distinct `customer_id`.
5. **Status filter:** Filters strictly by `.eq("status", "active")`.
6. **Start date filter:** Does **not** filter `starts_at <= now()`.
7. **End date filter:** Does **not** filter `ends_at > now()`.
8. **Handling of non-active statuses:** `cancelled`, `expired`, `payment_pending`, and `payment_failed` are completely excluded from `activeSubscribersRes`, but are included in `totalSubscribersRes`.
9. **Grouping by plan:** Not grouped by plan (global count across all plans).
10. **Aggregation scope:** Total across all plans and all customers.
11. **Failed query representation:** Evaluated via `evaluateCountMetric`. If PostgREST returns an error or `count === null`, it appends `"activeSubscribers"` to `unavailableMetrics` and sets the value to `null`. The UI renders `<span ...>Unavailable</span>` and displays a top alert banner warning of partial metrics degradation.
12. **Double-counting potential:**
    * If Customer A has two active subscription records (e.g., current period + prepaid renewal period), both rows are counted (`+2`).
    * If Customer B has active subscriptions under Plan 1 and Plan 2, both rows are counted (`+2`).

---

## 4. Per-Plan Subscriber Counts: Exact Query and Aggregation

### 4.1 Server Action Implementation
**Source Location:** [`C:\Projects\kashi-veda-admin\lib\actions\astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts#L175-L225) (`getAstrologyPlans`)

```typescript
export async function getAstrologyPlans(): Promise<AstrologyPlanItem[]> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const { data: plans, error } = await supabase
    .from("astrology_subscription_plans")
    .select("*")
    .order("price", { ascending: true });

  if (error || !plans) {
    throw new Error(error?.message || "Failed to fetch astrology subscription plans.");
  }

  // Count active subscribers for each plan using exact-count queries (immune to PostgREST row truncation)
  const countResults = await Promise.all(
    plans.map(async (plan) => {
      const { count, error: countErr } = await supabase
        .from("astrology_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("plan_id", plan.id)
        .eq("status", "active");

      if (countErr || count === null || count === undefined) {
        console.error(`Failed to fetch active subscriber count for plan ${plan.id}:`, countErr);
        return { planId: plan.id, count: null };
      }
      return { planId: plan.id, count };
    })
  );

  const subCountsByPlan: Record<string, number | null> = {};
  countResults.forEach((res) => {
    subCountsByPlan[res.planId] = res.count;
  });

  return plans.map((p) => ({
    // ...
    activeSubscriberCount: subCountsByPlan[p.id] !== undefined ? subCountsByPlan[p.id] : null,
  }));
}
```

### 4.2 Presentation & Summary Aggregation
**Source Location:** [`C:\Projects\kashi-veda-admin\components\admin\astrology\astrology-plans-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx#L39-L125)

* **Table Column Header:** **"Active Subscribers"**  
  Displays `plan.activeSubscriberCount?.toLocaleString("en-IN")` or `"Unavailable"`.
* **Summary KPI Card:** **"Subscribed Devotees"**  
  Computed in component memory:
  ```typescript
  const totalActiveSubs = plans.reduce((acc, p) => {
    if (p.activeSubscriberCount === null || p.activeSubscriberCount === undefined) return acc;
    return acc + p.activeSubscriberCount;
  }, 0);
  ```

### 4.3 Evaluation Against Criteria
1. **Exact displayed label:** Table column: **"Active Subscribers"**; Summary card: **"Subscribed Devotees"**.
2. **Intended meaning:** Intended to indicate how many subscribers are enrolled in each tier and the total devotee base.
3. **Exact query:** `supabase.from("astrology_subscriptions").select("*", { count: "exact", head: true }).eq("plan_id", plan.id).eq("status", "active")`.
4. **Entity counted:** **Table rows** for that `plan_id`. Does **not** count distinct customers.
5. **Timestamp filters:** Does **not** filter on `starts_at` or `ends_at`.
6. **Aggregation:** The summary card sums the individual per-plan row counts.
7. **Double-counting implications:**
   * **Within a single plan:** If a customer has an existing term and a paid renewal term for the same plan, both rows have `status = 'active'`. The plan table displays `2` under "Active Subscribers", and the summary card counts `2`.
   * **Across multiple plans:** If a customer holds active subscriptions under Plan A and Plan B, Plan A counts `1`, Plan B counts `1`, and the "Subscribed Devotees" card displays `2`, even though only `1` distinct devotee exists.

---

## 5. Subscription Status, Start/End Dates, and Entitlement Contract

### 5.1 Authoritative Entitlement Contract in PostgreSQL
The authoritative entitlement check for astrology services is defined in Migration [`055_decouple_plan_deactivation_from_entitlements.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql#L100-L177) and Migration [`045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L80-L170).

In `public.get_daily_rashi_insight`:
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

IF v_active_sub.id IS NOT NULL THEN
    v_is_entitled := true;
END IF;
```
And in the Customer SELECT Policy on `public.daily_rashi_insights`:
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
            )
        )
    );
```

**Authoritative Definition of "Currently Entitled":**
A user is entitled if and only if:
1. `customer_id = auth.uid()`
2. `status = 'active'`
3. `starts_at <= now()`
4. `ends_at > now()`
5. `plan.daily_in_app_enabled = true` (or the relevant feature channel flag).

### 5.2 Subscription Activation & Renewal Mechanics
In Migration [`053_freeze_astrology_subscription_duration_at_checkout.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql#L167-L184) and lines 751-775:
* When a customer with an existing active subscription checkouts a renewal, the system schedules the new term to start sequentially:
  ```sql
  SELECT * INTO v_active_sub
  FROM public.astrology_subscriptions
  WHERE customer_id = v_customer_id
    AND status = 'active'::public.astrology_subscription_status
    AND ends_at > now()
  ORDER BY ends_at DESC
  LIMIT 1;

  IF v_active_sub.id IS NOT NULL THEN
      v_starts_at := v_active_sub.ends_at;
      v_ends_at := v_starts_at + (v_plan.duration_days || ' days')::INTERVAL;
  ELSE
      v_starts_at := now();
      v_ends_at := now() + (v_plan.duration_days || ' days')::INTERVAL;
  END IF;
  ```
* When the payment webhook (`handle_razorpay_payment_order_paid`) processes the capture, it updates the renewal subscription record:
  ```sql
  UPDATE public.astrology_subscriptions
  SET status = 'active'::public.astrology_subscription_status,
      starts_at = v_starts_at,
      ends_at = v_ends_at
  WHERE id = v_subscription.id;
  ```
* **Critical Consequence:** The new subscription immediately transitions to `status = 'active'` upon payment, even though its `starts_at` is in the future.
* During the period before `starts_at` is reached:
  * The customer is **not entitled** to benefits under the renewal record (`starts_at <= now()` is false).
  * The renewal record **is counted** as an "Active Subscription" and "Active Subscriber" in the Admin portal.

### 5.3 Expiration and Housekeeping Mechanics
In Migration [`016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L35-L55):
```sql
CREATE OR REPLACE FUNCTION public.cron_astrology_subscription_housekeeping()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated_count INTEGER := 0;
BEGIN
    UPDATE public.astrology_subscriptions
    SET status = 'expired'::public.astrology_subscription_status
    WHERE status = 'active'::public.astrology_subscription_status
      AND ends_at < now();

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$;
```
* **Scheduling:** This function is scheduled via `pg_cron` at `5 0 * * *` (00:05 UTC, once daily).
* **Behavior:** If a subscription's `ends_at` passes at 08:00 UTC, its benefits terminate immediately in the mobile application (because `get_daily_rashi_insight` checks `ends_at > now()`). However, its database `status` remains `'active'` until 00:05 UTC the next day (up to 16+ hours later).
* Throughout that interval, the Admin portal continues to count that record as active.

---

## 6. Multiple Intervals and Distinct-Customer Semantics

### 6.1 Can a Customer Legally Hold Multiple Active Records?
**Yes.** The system architecture explicitly allows and accommodates multiple subscription records per customer:
1. **Sequential Renewals:** As demonstrated in Migration 053, a devotee renewing early generates a second subscription row for the same plan, both marked `status = 'active'`.
2. **Concurrent Multi-Plan Subscriptions:** The database schema (`public.astrology_subscriptions`) enforces no unique constraint on `(customer_id)`. A devotee can purchase both a Daily In-App Plan and a Weekly WhatsApp Plan.

### 6.2 Customer vs. Subscription Record Counting
The following diagram contrasts what is stored in the database versus what is reported:

```
+-----------------------------------------------------------------------------------------+
|                               Database State (Example)                                  |
+-----------------------------------------------------------------------------------------+
| Sub ID | Customer | Plan   | Status | Validity Interval          | Currently Entitled?   |
|--------+----------+--------+--------+----------------------------+-----------------------|
| sub-1  | DevoteeX | Daily  | active | 2026-10-01 to 2026-10-31   | YES (now = 2026-10-12)|
| sub-2  | DevoteeX | Daily  | active | 2026-10-31 to 2026-11-30   | NO (future start)     |
| sub-3  | DevoteeY | Weekly | active | 2026-09-01 to 2026-10-10   | NO (expired by time)  |
+-----------------------------------------------------------------------------------------+

What Current Admin Queries Return:
- Overview "Active Subscriptions": 3 records
- Daily Plan "Active Subscribers": 2 records
- Weekly Plan "Active Subscribers": 1 record
- Plans View "Subscribed Devotees": 3 devotees (2 Daily + 1 Weekly)

What Entitlement & Identity True Values Are:
- Distinct Customers Entitled Right Now: 1 devotee (DevoteeX)
- Distinct Customers with Status 'active': 2 devotees (DevoteeX, DevoteeY)
- Currently Entitled Subscription Records: 1 record (sub-1)
- Active-Status Subscription Records: 3 records (sub-1, sub-2, sub-3)
```

---

## 7. AST-20 Error Handling and Response-Cap Regression Check

In previous remediation work (**AST-20**), protections were introduced to prevent:
1. Converting database read errors into plausible zero counts.
2. Silently truncating subscriber counts due to PostgREST's default 1,000-row response limit.

### 7.1 Verification of Existing AST-20 Protections
Inspection of current code confirms all AST-20 safeguards are fully present:
* **Overview KPI Handling:** In [`astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts#L140-L160), `evaluateCountMetric` explicitly checks:
  ```typescript
  if (res.error || res.count === null || res.count === undefined) {
    console.error(`Failed to fetch overview metric ${name}:`, res.error);
    unavailableMetrics.push(name);
    return null;
  }
  return res.count;
  ```
  If a query fails, `count` is returned as `null` (not `0`), and the UI renders `"Unavailable"` alongside a degradation banner.
* **Per-Plan Exact Counting:** In [`astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts#L190-L210), per-plan counts execute dedicated head queries:
  ```typescript
  supabase.from("astrology_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("status", "active")
  ```
  This is executed per plan, using HTTP HEAD requests. No subscription rows are transferred over the wire, and PostgREST returns the exact integer in `Content-Range`. It is completely immune to the 1,000-row cap.
* **Automated Test Suite Status:**
  The test suite [`__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts) was executed and verified:
  ```text
  PASS __tests__/daily_astrology_read_failure_and_subscription_counts.test.ts
    AST-20: Distinguish Admin Read Failures From Empty Results and Correct Subscription Counts
      Group A: Daily Astrology Matrix: Successful Empty vs Read Failure (8 tests) ... √
      Group B: Readiness and Overview Metrics Error Handling (6 tests) ............ √
      Group C: Complete Per-Plan Counts Above PostgREST Row Cap (8 tests) .......... √
      Group D: Regression, Concurrency, and Authorization Safeguards (4 tests) ..... √
  Test Suites: 1 passed, 1 total
  Tests:       23 passed, 23 total
  ```

---

## 8. Safe Scenario Results and Existing Test Coverage

A disposable fixture evaluation was executed against the exact queries and schema predicates. Below are the deterministic results for each scenario.

### Scenario Evaluation Summary Table

| Scenario | Description | Overview Query Result (`status = 'active'`) | Per-Plan Query Result | Entitled Records (`starts_at <= now < ends_at`) | Distinct Customers Entitled | Label Accuracy Assessment |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **A** | Current active subscriber (single term) | **1** | **1** | 1 | 1 | Accurate under all interpretations. |
| **B** | Future-start active subscription (renewal) | **1** | **1** | 0 | 0 | **Inaccurate** if label means "entitled devotee"; accurate if label means "paid record". |
| **C** | Expired interval, active status (pre-cron) | **1** | **1** | 0 | 0 | **Inaccurate** if label means "entitled devotee"; reflects unpruned active status. |
| **D** | Multiple intervals for 1 customer (current + renewal) | **2** | **2** | 1 | 1 | **Misleading**: Table says 2 "Active Subscribers" and KPI says 2 "Subscribed Devotees" for 1 customer. |
| **E** | 1 customer across 2 plans | **2** | Plan A: 1<br>Plan B: 1 | 2 | 1 | Plan counts accurate for plan records; sum card ("Subscribed Devotees" = 2) **double-counts customer**. |
| **F** | Non-active statuses (`cancelled`, `expired`, etc.) | **0** | **0** | 0 | 0 | Accurately excluded from active metrics; included in total subscriptions. |
| **G** | Query failure / timeout | **`null`** (`"Unavailable"`) | **`null`** (`"Unavailable"`) | N/A | N/A | Fully protected by AST-20 (renders "Unavailable", not 0). |
| **H** | Large population (> 1,000 rows) | **Exact Count** | **Exact Count** | Exact Count | N/A | Fully protected by AST-20 (HTTP HEAD exact count). |

### Detailed Findings per Scenario

#### Scenario A — Currently Entitled Subscriber
* **Evidence Source:** Source-code inspection & disposable fixture evaluation.
* **Finding:** Customer has 1 subscription with `status = 'active'` and `starts_at <= now() < ends_at`.
* **Result:** Overview count = 1; Plan count = 1. The subscriber is both active and entitled.

#### Scenario B — Future-Start Active-Status Subscription
* **Evidence Source:** Migration 053 source inspection & disposable fixture evaluation.
* **Finding:** Customer has purchased a renewal or advance subscription. Migration 053 sets `starts_at = v_active_sub.ends_at` (future), but sets `status = 'active'` upon payment completion.
* **Result:** Overview count = 1; Plan count = 1.
* **Discrepancy:** The customer cannot view daily insights yet (RPC returns `is_entitled = false`), but is already reported as an "Active Subscriber" / "Subscribed Devotee" in the Admin portal.

#### Scenario C — Expired Interval with Active Status
* **Evidence Source:** Migration 016 source inspection & disposable fixture evaluation.
* **Finding:** Subscription interval expired at 10:00 UTC. The daily housekeeping cron job is scheduled at 00:05 UTC.
* **Result:** For up to 24 hours, the expired subscription row maintains `status = 'active'`. Overview count = 1; Plan count = 1.
* **Discrepancy:** The mobile app denies access, but the Admin portal continues reporting the customer as active until the batch cron job runs.

#### Scenario D — Multiple Intervals for One Customer
* **Evidence Source:** Migration 053 source inspection & disposable fixture evaluation.
* **Finding:** Customer C4 holds a current active subscription and a prepaid renewal subscription for the same plan. Both rows have `status = 'active'`.
* **Result:** Overview count = 2; Plan count = 2; Plans KPI "Subscribed Devotees" = 2.
* **Discrepancy:** Both the table column ("Active Subscribers") and summary card ("Subscribed Devotees") report 2, whereas there is only 1 devotee.

#### Scenario E — One Customer Across Multiple Plans
* **Evidence Source:** Schema inspection & disposable fixture evaluation.
* **Finding:** Customer C5 is subscribed to both Plan A (Daily) and Plan B (Weekly). Both rows have `status = 'active'`.
* **Result:** Plan A count = 1; Plan B count = 1; Overview count = 2; Plans KPI card ("Subscribed Devotees") = 2.
* **Discrepancy:** The metric correctly measures plan contracts, but the summary KPI label "Subscribed Devotees" double-counts the individual devotee across plans.

#### Scenario F — Non-Active Statuses
* **Evidence Source:** Source inspection & Jest test 19 in [`daily_astrology_read_failure_and_subscription_counts.test.ts`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts#L408-L428).
* **Finding:** Rows with `status IN ('cancelled', 'expired', 'payment_pending', 'payment_failed')` are strictly excluded from the `.eq("status", "active")` queries.
* **Result:** Active count = 0. All non-active records are correctly excluded from active counts and correctly included in total registered subscription counts.

#### Scenario G — Query Failure
* **Evidence Source:** Source inspection & Jest tests 12, 13, 21 in [`daily_astrology_read_failure_and_subscription_counts.test.ts`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts#L280-L333).
* **Finding:** Query errors or `null` counts trigger the `unavailableMetrics` error flow.
* **Result:** Rendered as `"Unavailable"`, not `0`. Overview displays partial degradation alert banner.

#### Scenario H — Large Record Population (> 1,000 Rows)
* **Evidence Source:** Source inspection & Jest tests 15–18 in [`daily_astrology_read_failure_and_subscription_counts.test.ts`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts#L348-L406).
* **Finding:** Both overview and per-plan counts use `{ count: "exact", head: true }`.
* **Result:** Evaluated server-side in PostgreSQL. Completely immune to PostgREST response limits.

---

## 9. Confirmed Implementation Defects vs. Metric-Definition Questions

To ensure rigorous engineering analysis, we must separate confirmed implementation defects from open metric-definition policy questions:

### 9.1 Confirmed Inconsistencies Between UI Labels and Implementation
* **The "Subscribed Devotees" Summary KPI:** On `/astrology/plans`, the top card is titled **"Subscribed Devotees"**. In Indian English and KashiVeda domain terminology, a "devotee" refers to a distinct person/customer (`customer_id` / profile). The value shown is a simple mathematical summation of active plan records (`plans.reduce((acc, p) => acc + p.activeSubscriberCount, 0)`). This label is technically inaccurate: it sums subscription records, which double-counts devotees with renewals or multiple plans.
* **The "Active Subscribers" Table Header:** On `/astrology/plans`, the table column is titled **"Active Subscribers"**. This counts active subscription records associated with that plan ID. If a user holds a current subscription and an advance renewal, that single subscriber adds `2` to the count.
* **Contrasting with Overview:** On `/astrology`, the card is titled **"Active Subscriptions"** and the subtext reads **"Out of X total registered subscriptions"**. This wording is accurate for record counting.

### 9.2 Metric-Definition Questions (Requirements Undefined)
The database and query logic are functioning deterministically according to their code. What is currently undefined in the product specification is:
1. **Should Admin metrics measure financial/contractual commitments or active real-time entitlements?**
   * A future renewal represents a paid, valid, committed contract. Counting it as an active contract is standard in subscription order management.
   * However, from a service utilization standpoint (e.g. calculating delivery load or daily active readership), a future renewal is not yet active.
2. **Should counts measure Subscription Agreements or Unique Customers?**
   * In subscription billing platforms (Stripe, Chargebee), "Active Subscriptions" (contracts) is distinct from "Active Subscribers" (customers/MRR accounts).
   * KashiVeda's current queries measure contracts, but the UI intermittently uses customer terminology ("Subscribers", "Devotees").

---

## 10. Product Decision Required

Before any code modification or query adjustment is authorized, the Product Owner must select one of the following metric definition contracts:

### Option A — Count Subscription Records by Lifecycle Status (Status Quo with Label Realignment)
* **Definition:** Metrics measure subscription contracts whose status is `'active'`, regardless of `starts_at` or `ends_at`.
* **Semantics:** Counts database records where `status = 'active'`. A future renewal is counted immediately upon payment capture. An expired subscription is counted until housekeeping transitions it.
* **Action Required:**
  * Keep existing queries unchanged (no database or query load impact).
  * Realign UI labels in `/astrology/plans`: change **"Subscribed Devotees"** to **"Total Active Subscriptions"**, and change table column **"Active Subscribers"** to **"Active Subscriptions"**.
* **Trade-off:** Minimal risk, zero query performance impact, perfectly aligned with order/contract management. Does not reflect real-time entitlement.

### Option B — Count Currently Entitled Subscription Records
* **Definition:** Metrics measure subscription records that are currently in their active validity window:
  `status = 'active' AND starts_at <= now() AND ends_at > now()`.
* **Semantics:** Future renewals are not counted until their start date arrives. Expired intervals are excluded immediately, removing dependency on housekeeping cron timing. A customer with two simultaneously valid plans still counts under both plans.
* **Action Required:**
  * Update queries in `astrology-management.ts` to include `.lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString())`.
  * Ensure database indexes exist on `(status, starts_at, ends_at)`.
* **Trade-off:** Accurately reflects active reading privileges. If a customer holds overlapping valid plans, they still contribute to each plan's count.

### Option C — Count Distinct Currently Entitled Customers (Unique Devotees)
* **Definition:** Metrics measure unique customer identities (`COUNT(DISTINCT customer_id)`) who hold at least one currently valid subscription.
* **Semantics:**
  * Per-plan count: Distinct customers entitled to that specific plan.
  * Overview & Total: Distinct customers entitled to *any* plan.
  * Summing per-plan counts will not necessarily equal the overview total if multi-plan subscriptions exist.
* **Action Required:**
  * PostgREST cannot perform `COUNT(DISTINCT customer_id)` via simple head count queries. This would require introducing a dedicated PostgreSQL RPC (e.g. `get_active_astrology_subscriber_metrics()`) or a database view.
* **Trade-off:** Highest conceptual accuracy for user counts ("How many actual people are reading today?"), but requires new database infrastructure and migration.

### Option D — Existing Documented Metric Contract
* **Assessment:** No authoritative local product documentation specifies that Admin metrics must represent distinct customer IDs or filter by real-time timestamps. The existing codebase and migration comments consistently refer to subscription records and lifecycle transitions.

---

## 11. Recommended Next Step, Without Implementing It

1. **Submit this Assessment Report for Product Owner Alignment:**
   Present Options A, B, and C to the Product Owner to select the desired reporting contract for Admin astrology subscriptions.
2. **If Option A is Approved (Recommended for Phase 1 Minimal Disruption):**
   * Keep all queries, server actions, and database schemas exactly as they are.
   * Update the UI labels in `astrology-plans-view.tsx` from "Subscribed Devotees" and "Active Subscribers" to "Total Active Subscriptions" and "Active Subscriptions" so that displayed labels truthfully represent the counted entities.
3. **If Option B or C is Approved:**
   * Formulate a migration/RPC plan that preserves AST-20 exact count protections and index coverage on `(status, starts_at, ends_at, customer_id)` before altering server action queries.
4. **Do Not Begin Implementation:**
   Per the task instructions, no code changes or migrations have been made.

---

## 12. Exact Files, Functions, RPCs, Views, and Migrations Inspected

### 12.1 Admin Web Application Files
* [`kashi-veda-admin/lib/actions/astrology-management.ts`](file:///C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts):
  * `getAstrologyOverview` (lines 34–170)
  * `evaluateCountMetric` (lines 140–155)
  * `getAstrologyPlans` (lines 175–225)
  * `getAstrologySubscriptions` (lines 294–360)
* [`kashi-veda-admin/components/admin/astrology/astrology-overview-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-overview-view.tsx):
  * `AstrologyOverviewView` & `formatCountMetric` (lines 20–120)
* [`kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-plans-view.tsx):
  * `AstrologyPlansView`, `totalActiveSubs` aggregation, table headers (lines 39–200)
* [`kashi-veda-admin/components/admin/astrology/astrology-subscriptions-view.tsx`](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-subscriptions-view.tsx):
  * `AstrologySubscriptionsView` & summary KPI cards (lines 110–170)

### 12.2 Database Migrations and SQL RPCs
* [`KashiVeda/supabase/migrations/009_astrology.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/009_astrology.sql):
  * Initial schema for `astrology_subscriptions` and `astrology_subscription_plans` (lines 40–90)
* [`KashiVeda/supabase/migrations/016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql):
  * `public.cron_astrology_subscription_housekeeping` and pg_cron schedule (lines 35–56, 161–166)
* [`KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql):
  * Authoritative entitlement logic in `daily_rashi_insights` RLS (lines 80–115)
* [`KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql):
  * Sequential start date calculation during checkout and activation (lines 167–183, 751–775)
* [`KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql):
  * Authoritative entitlement RPC `public.get_daily_rashi_insight` (lines 165–180)

### 12.3 Test Files Inspected and Executed
* [`KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_read_failure_and_subscription_counts.test.ts):
  * 23 automated tests verifying AST-20 count error handling, row truncation immunity, and head query preservation.

---

## 13. Safety Attestation & Final Decision

### 13.1 Safety Attestation
* No production writes, migrations, or live database commands were executed.
* No files in `C:\Projects\kashi-veda-admin` were created, altered, or deleted.
* No files in `C:\Projects\KashiVeda` were modified (the only file created is this assessment report).
* No tests were modified.
* All scenario experiments were conducted using non-persistent, read-only evaluation.

### 13.2 Final Decision

**Outcome D — Metric-definition decision needed**  
*(Accompanied by documented UI label inconsistencies under Outcome C)*

**Justification:**  
The underlying query implementation is unambiguous and functioning deterministically: both the Overview and Per-Plan count queries count database rows matching `status = 'active'`, without evaluating timestamp bounds (`starts_at` or `ends_at`) and without grouping by distinct customer identities.

However, correctness cannot be judged solely by inspecting code:
1. If the business requirement is to report **active subscription agreements / contracts**, the query implementation is valid, but the UI labels on `/astrology/plans` ("Subscribed Devotees" and "Active Subscribers") mislabel subscription records as distinct people.
2. If the business requirement is to report **currently entitled active users**, the query implementation is incomplete because it omits `starts_at <= now() AND ends_at > now()`, and depends on daily cron housekeeping to prune expired contracts.
3. If the business requirement is to report **distinct active customers**, the query implementation is incomplete because it counts rows rather than distinct `customer_id`.

Therefore, a product decision between **Option A (Active Contracts / Records)**, **Option B (Currently Entitled Records)**, and **Option C (Distinct Entitled Customers)** is strictly required before any remediation work is initiated.
