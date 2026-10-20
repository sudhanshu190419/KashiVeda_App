# KashiVeda AST-P04 Plan Deactivation Delivery Assessment Report

**Assessment Target:** AST-P04 — Subscription Plan Deactivation Consistency Across Delivery Channels and Daily Entitlements  
**Evaluator:** Antigravity (Senior Production Software Engineering Assessment)  
**Date:** October 12, 2026  
**Scope:** Read-Only Source Code, SQL Migration, Dispatcher Predicate, and Channel-Eligibility Assessment  
**Target File:** [`KASHIVEDA_AST_P04_PLAN_DEACTIVATION_DELIVERY_ASSESSMENT_REPORT.md`](file:///C:/Projects/KashiVeda/KASHIVEDA_AST_P04_PLAN_DEACTIVATION_DELIVERY_ASSESSMENT_REPORT.md)

---

## 1. Executive Summary

This assessment investigates finding **AST-P04** from the KashiVeda Daily Astrology and Subscriptions audit. Specifically, it determines:
1. Whether deactivating an astrology subscription plan (`astrology_subscription_plans.is_active = false`) affects existing subscribers' eligibility for in-app delivery and WhatsApp delivery consistently with the governing **AST-Q02** product decision.
2. What exact eligibility predicates are evaluated by the legacy automated delivery dispatcher (`public.cron_astrology_delivery_dispatch`).
3. How the dispatcher's eligibility logic compares with the authoritative daily in-app horoscope entitlement check (`public.get_daily_rashi_insight` and RLS on `daily_rashi_insights`).
4. Whether the discrepancy originally recorded in AST-P04 still persists following the local remediation of AST-Q02 in Migration 055.
5. What distinguishes delivery-journal eligibility from actual external message transmission under the AST-Q03 boundary.

### Key Assessment Findings

* **Resolution of the Pre-AST-Q02 Discrepancy:** The original audit recorded AST-P04 as an inconsistency because Migration 016's delivery dispatcher did not check `plan.is_active = true`, whereas Migration 045's daily in-app entitlement check did require `plan.is_active = true`. Under the approved **AST-Q02 Option A** policy (*"plan deactivation stops new purchases from the public catalog, but does NOT revoke benefits from existing subscribers during their paid term"*), Migration [`055_decouple_plan_deactivation_from_entitlements.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql) removed `plan.is_active = true` from the in-app reading path. As a result, **both subsystems are now aligned**: neither subsystem revokes benefits from existing valid subscribers when a plan is deactivated.
* **Legacy Dispatcher Eligibility Predicates:** In [`016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L62-L107), `public.cron_astrology_delivery_dispatch()` joins `astrology_subscriptions` with `astrology_subscription_plans` and cross-joins `astrology_content`. It strictly requires:
  1. `s.status = 'active'`
  2. `s.starts_at <= now()`
  3. `s.ends_at > now()`
  4. `c.status = 'published'`
  5. `c.publish_at <= now()`
  6. `(c.expires_at IS NULL OR c.expires_at > now())`
  7. Channel match: `(c.channel = 'in_app' AND p.daily_in_app_enabled = true) OR (c.channel = 'whatsapp' AND p.weekly_whatsapp_enabled = true)`
  8. Idempotency: `NOT EXISTS` duplicate delivery record for `(s.id, c.id)`.
* **Separate Content Domains:** The legacy dispatcher operates exclusively on general article broadcasts in `public.astrology_content`. It does **not** dispatch records from the structured 12-Rashi table `public.daily_rashi_insights`, which is queried on demand by mobile clients via `public.get_daily_rashi_insight`.
* **Channel Flags Gate Delivery Independently of Plan Status:** Whether a plan is active or inactive, the individual capability flags (`daily_in_app_enabled` and `weekly_whatsapp_enabled`) strictly control channel eligibility. If a channel flag is disabled, deliveries for that channel are excluded without impacting other permitted channels.
* **AST-Q03 Delivery Boundary Maintained:** The legacy dispatcher only inserts rows into `public.astrology_deliveries` with `status = 'queued'`. For the WhatsApp channel, no external worker or WhatsApp Business API consumer exists in the codebase. Journaling a record does not constitute actual outbound message transmission.

---

## 2. Original AST-P04 Finding and Post-AST-Q02 Context

### 2.1 The Original Finding
In [`KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`](file:///C:/Projects/KashiVeda/KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md#L549), AST-P04 was recorded as:
> *"M:016 legacy delivery selection joins plan channel flags without plan.is_active, unlike daily entitlement. Inactive-plan subscriptions can be queued for delivery while daily reads deny them. Correctness depends on AST-Q02 and separate channel policy."*

At the time of the original audit:
* **Migration 045 (`daily_rashi_insights`):** The Customer SELECT Policy and `get_daily_rashi_insight` required `p.is_active = true`. Deactivating a plan instantly terminated mobile reading rights for paying customers.
* **Migration 016 (`cron_astrology_delivery_dispatch`):** Did **not** require `p.is_active = true`. A deactivated plan continued to generate delivery journal rows.
* This produced an architectural divergence: paying devotees on a grandfathered plan received automated delivery records but were blocked from reading daily horoscopes in the app.

### 2.2 The AST-Q02 Policy Resolution
The Product Owner approved **Option A** for AST-Q02:
* Deactivating a plan (`is_active = false`) removes it from the customer checkout catalog to prevent new subscriptions.
* Existing subscribers who purchased that plan prior to deactivation retain full benefits through the remainder of their valid term (`starts_at <= now() < ends_at`).
* In Migration [`055_decouple_plan_deactivation_from_entitlements.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql), `p.is_active = true` was deliberately removed from:
  1. `public.get_daily_rashi_insight`.
  2. RLS policy `daily_rashi_insights_select_customer`.
* Migration 055 explicitly observed (line 26):
  ```sql
  -- Automated cron delivery dispatch (cron_astrology_delivery_dispatch) remains unchanged and aligned.
  ```

---

## 3. Current Dispatcher Definition and Exact Eligibility Predicates

### 3.1 Authoritative SQL Definition
**Source Location:** [`C:\Projects\KashiVeda\supabase\migrations\016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L62-L107)

```sql
CREATE OR REPLACE FUNCTION public.cron_astrology_delivery_dispatch()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inserted_count INTEGER := 0;
BEGIN
    INSERT INTO public.astrology_deliveries (
        subscription_id,
        content_id,
        channel,
        scheduled_at,
        status
    )
    SELECT 
        s.id AS subscription_id,
        c.id AS content_id,
        c.channel,
        c.publish_at AS scheduled_at,
        'queued'::public.astrology_delivery_status
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
      -- Prevent duplicate delivery entries for the same subscription and content
      AND NOT EXISTS (
          SELECT 1 
          FROM public.astrology_deliveries d 
          WHERE d.subscription_id = s.id 
            AND d.content_id = c.id
      );

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    RETURN v_inserted_count;
END;
$$;
```

### 3.2 Detailed Predicate Breakdown
1. **Subscription-to-Plan Association:** Inner joins `public.astrology_subscription_plans p ON p.id = s.plan_id`. If a plan row does not exist, the subscription is excluded.
2. **Subscription Status:** Strictly requires `s.status = 'active'::public.astrology_subscription_status`. Excludes `payment_pending`, `cancelled`, `expired`, and `payment_failed`.
3. **Start Timestamp Bound:** Strictly requires `s.starts_at <= now()`. Excludes future-start renewal intervals.
4. **End Timestamp Bound:** Strictly requires `s.ends_at > now()`. Excludes expired subscriptions immediately, without waiting for the daily housekeeping cron to mutate `s.status`.
5. **Content Publication Status:** Strictly requires `c.status = 'published'::public.astrology_content_status`. Excludes `draft`, `scheduled`, and `cancelled` content.
6. **Publication Timestamp:** Strictly requires `c.publish_at <= now()`. Excludes content scheduled for future dates.
7. **Content Expiration:** Requires `(c.expires_at IS NULL OR c.expires_at > now())`. Excludes stale or expired broadcasts.
8. **Channel Feature Flags:** Evaluates:
   * For `in_app` content: `p.daily_in_app_enabled = true`.
   * For `whatsapp` content: `p.weekly_whatsapp_enabled = true`.
9. **Plan Active Status (`plan.is_active`):** **Omitted.** The query does not filter on `p.is_active`.
10. **Duplicate Prevention:** Uses a correlated subquery (`NOT EXISTS`) checking `astrology_deliveries` by `(subscription_id, content_id)`. Prevents redundant queuing across repeated cron runs.

---

## 4. Current Daily In-App Entitlement Definition

### 4.1 Authoritative SQL Definition (Post-Migration 055)
**Source Location:** [`C:\Projects\KashiVeda\supabase\migrations\055_decouple_plan_deactivation_from_entitlements.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql#L90-L180)

#### 1. In `public.get_daily_rashi_insight`
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

#### 2. In Customer SELECT Policy on `public.daily_rashi_insights`
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

### 4.2 Comparison of Entitlement Predicates

| Condition | Legacy Delivery Dispatcher (`016`) | Daily In-App RPC (`055`) | Daily In-App RLS (`055`) | Alignment Status |
| :--- | :---: | :---: | :---: | :--- |
| `s.status = 'active'` | Required | Required | Required | **Aligned** |
| `s.starts_at <= now()` | Required | Required | Required | **Aligned** |
| `s.ends_at > now()` | Required | Required | Required | **Aligned** |
| `p.is_active = true` | **Omitted** | **Omitted** | **Omitted** | **Aligned (AST-Q02)** |
| `p.daily_in_app_enabled = true` | Required (for `in_app`) | Required | Required | **Aligned** |
| `p.weekly_whatsapp_enabled = true` | Required (for `whatsapp`) | N/A (In-app only) | N/A (In-app only) | **Aligned** |
| Customer Ownership (`auth.uid()`) | Enforced via `s.id` join | Enforced (`v_caller_id`) | Enforced (`auth.uid()`) | **Aligned** |
| Content Publication (`published`) | Required (`c.status`) | Required (`status`) | Required (`status`) | **Aligned** |
| Content Date / Publish Time | `c.publish_at <= now()` | `insight_date <= today` | `insight_date <= today` | **Aligned** |

---

## 5. Channel-by-Channel Comparison

The system manages three distinct channels/access methods for astrology content:

```
+-------------------------------------------------------------------------------------------------------------------------+
|                                           Astrology Channels & Subsystems                                               |
+-------------------------------------------------------------------------------------------------------------------------+
| Channel / Feature         | Storage Table           | Delivery Mechanism           | Plan Gating Flag                   |
+---------------------------+-------------------------+------------------------------+------------------------------------+
| 1. Daily In-App Horoscope | daily_rashi_insights    | On-Demand Pull (Mobile RPC)  | plan.daily_in_app_enabled = true   |
| 2. Broadcast Insights     | astrology_content       | Journaled Dispatch (Cron 016)| plan.daily_in_app_enabled = true   |
| 3. Weekly WhatsApp Digest | astrology_content       | Journaled Dispatch (Cron 016)| plan.weekly_whatsapp_enabled = true|
+-------------------------------------------------------------------------------------------------------------------------+
```

### 5.1 Channel 1: Daily In-App Horoscope (On-Demand Reading)
* **Access Mode:** Pull-based. Devotee opens the mobile app, views the 12-Rashi selector, and fetches guidance for their sign.
* **Underlying Function:** `public.get_daily_rashi_insight(p_insight_date, p_rashi_id, p_language)`.
* **Plan Deactivation Impact:** Unaffected. As verified in `__tests__/daily_astrology_subscription_selection.test.tsx` (Test F), active subscribers on deactivated plans retain full access.

### 5.2 Channel 2: Broadcast In-App Feed & Deliveries Journal
* **Access Mode:** Push-journaled. `public.cron_astrology_delivery_dispatch()` runs daily at 00:30 UTC, matches published in-app content, and inserts a `queued` row in `public.astrology_deliveries`.
* **Mobile Consumption:** Devotee navigates to "Delivery History" in the app, calling `astrologyService.getCustomerDeliveries()`.
* **Plan Deactivation Impact:** Unaffected. Because `plan.is_active` is omitted, existing subscribers continue receiving journaled records for in-app broadcasts.

### 5.3 Channel 3: Weekly WhatsApp Broadcast
* **Access Mode:** Push-journaled. `public.cron_astrology_delivery_dispatch()` matches published WhatsApp content and inserts a `queued` row in `public.astrology_deliveries`.
* **Plan Deactivation Impact:** Unaffected. Existing subscribers continue to have WhatsApp delivery rows queued as long as `plan.weekly_whatsapp_enabled = true`.
* **Execution Boundary:** As established in AST-Q03, no external worker processes these queued records.

---

## 6. Scenario Results for Active and Inactive Plans

A deterministic simulation ([`scratch/test_ast_p04_channel_eligibility.mjs`](file:///C:/Projects/KashiVeda/scratch/test_ast_p04_channel_eligibility.mjs)) was executed across all required scenarios. The results are summarized below:

| Scenario | Subscription State | Plan Attributes | Daily In-App Read (`055`) | Dispatcher: In-App (`016`) | Dispatcher: WhatsApp (`016`) | Consistency Finding |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **A: Active Plan, Valid Sub** | `status = 'active'`<br>`starts_at <= now < ends_at` | `is_active = true`<br>`daily_in_app = true`<br>`weekly_wa = true` | **Eligible** | **Eligible** (Queued) | **Eligible** (Queued) | Fully consistent. |
| **B: Inactive Plan, Valid Sub** | `status = 'active'`<br>`starts_at <= now < ends_at` | `is_active = false`<br>`daily_in_app = true`<br>`weekly_wa = true` | **Eligible** | **Eligible** (Queued) | **Eligible** (Queued) | **Fully consistent with AST-Q02 Option A.** Both systems preserve benefits. |
| **C: Inactive Plan, Future Start** | `status = 'active'`<br>`starts_at > now` | `is_active = false`<br>`daily_in_app = true`<br>`weekly_wa = true` | **Denied** | **Excluded** | **Excluded** | Consistent. Future intervals denied until start date. |
| **D: Inactive Plan, Expired Sub** | `ends_at <= now`<br>(pre-housekeeping active) | `is_active = false`<br>`daily_in_app = true`<br>`weekly_wa = true` | **Denied** | **Excluded** | **Excluded** | Consistent. Expired intervals excluded immediately. |
| **E: Inactive Plan, Canceled Sub** | `status = 'cancelled'` | `is_active = false`<br>`daily_in_app = true`<br>`weekly_wa = true` | **Denied** | **Excluded** | **Excluded** | Consistent. Canceled records denied. |
| **F: Inactive Plan, Disabled Channel** | `status = 'active'`<br>`valid interval` | `is_active = false`<br>`daily_in_app = true`<br>`weekly_wa = false` | **Eligible** | **Eligible** (Queued) | **Excluded** | Consistent. Channel flag gates WhatsApp independently. |
| **G: Active Plan, Disabled Channel** | `status = 'active'`<br>`valid interval` | `is_active = true`<br>`daily_in_app = false`<br>`weekly_wa = true` | **Denied** | **Excluded** | **Eligible** (Queued) | Consistent. Channel flag gates In-App independently. |
| **H: Content Lifecycle Gating** | Valid Subscription | Active/Inactive Plan | Content `published` required | Content `published` & `publish_at <= now` required | Content `published` & unexpired required | Content status and time bounds strictly enforced. |

---

## 7. Content Publication, Expiry, and Channel-Flag Conditions

The dispatcher enforces three layers of content integrity before selecting a row:
1. **Publication Lifecycle Status:**
   ```sql
   c.status = 'published'::public.astrology_content_status
   ```
   Ensures draft articles, scheduled articles, and canceled articles are never queued for dispatch.
2. **Temporal Validity Window:**
   ```sql
   c.publish_at <= now() AND (c.expires_at IS NULL OR c.expires_at > now())
   ```
   Ensures content scheduled for future dates is not sent prematurely, and content with an expired validity period is suppressed.
3. **Channel Gating Matrix:**
   ```sql
   ((c.channel = 'in_app' AND p.daily_in_app_enabled = true) OR
    (c.channel = 'whatsapp' AND p.weekly_whatsapp_enabled = true))
   ```
   Ensures subscribers are only paired with content corresponding to their purchased features.

---

## 8. AST-Q03 Boundary: Journaling vs. Actual Delivery

It is critical to distinguish between database journaling and external message transmission:

* **What the Dispatcher Does:**
  * Runs as a scheduled PostgreSQL worker via `pg_cron` at `30 0 * * *` (00:30 UTC).
  * Writes authoritative journal rows into `public.astrology_deliveries` with `status = 'queued'`.
* **In-App Channel Delivery:**
  * Fully operational within the application. The customer views these journaled records in the mobile delivery history screen (`AstrologyDeliveriesScreen`).
* **WhatsApp Channel Delivery:**
  * **Not operational.** As established in AST-Q03:
    * No external message consumer or webhook listener is configured.
    * No WhatsApp Business API provider credentials (e.g., Twilio, Gupshup, Meta Cloud API) are integrated.
    * The `whatsapp_messages` queue defined in Migration 016 has no repository-controlled consumer.
  * **Assessment Finding:** Queuing a WhatsApp delivery row in `public.astrology_deliveries` represents **eligibility journaling only**. It provides zero proof of actual WhatsApp message dispatch.

---

## 9. Existing Tests and Safe Verification Results

### 9.1 Existing Automated Test Suites

#### 1. `__tests__/astrology_delivery_lifecycle.test.ts`
* **Test Group 1 (lines 72–142):** Validates the subscription eligibility state machine. Asserts that active subscriptions within their validity window are eligible, while `payment_pending`, `expired`, `cancelled`, and future-start subscriptions are excluded.
* **Test Group 2 (lines 147–218):** Validates content selection rules. Asserts that draft, scheduled, future-dated, expired, or channel-disabled content is excluded, and verifies idempotency against duplicate delivery.
* **Test Group 6 (lines 407–412):** Explicitly specifies:
  ```typescript
  it("confirms WhatsApp delivery is NOT implemented in M9 (no mock/fake external providers)", () => {
    const isWhatsAppProviderImplementedInM9 = false;
    expect(isWhatsAppProviderImplementedInM9).toBe(false);
  });
  ```
* **Status:** All 20 tests pass.

#### 2. `__tests__/daily_astrology_subscription_selection.test.tsx`
* **Test F (lines 500–550):** Specifically verifies **AST-Q02 Option A**:
  ```typescript
  test("Test F (AST-Q02 Option A): Subscription on a disabled plan (plan.is_active = false) retains daily in-app entitlement during valid interval", async () => {
    // Under AST-Q02 Option A, an existing active subscription on an inactive plan retains entitlement
    expect(isEligibleForDailyInAppInsights(subWithDisabledPlan, fixedNowMs)).toBe(true);
  });
  ```
* **Status:** All 16 tests pass.

---

## 10. Confirmed Defects vs. Policy Questions

### 10.1 Are There Any Confirmed Defects in Local Code?
**No.**  
* The legacy delivery dispatcher's omission of `plan.is_active = true` is **not a defect**. Under the approved AST-Q02 policy, existing subscribers must retain benefits on deactivated plans. If the dispatcher had filtered on `plan.is_active = true`, it would have violated AST-Q02 by cutting off deliveries to valid paying customers.
* The daily in-app entitlement logic in Migration 055 also omits `plan.is_active = true`.
* Both subsystems evaluate identical subscription validity predicates (`status = 'active'`, `starts_at <= now()`, `ends_at > now()`, and channel capability flags).

### 10.2 Policy Questions
* **Channel Scope of Plan Deactivation:** Does the Product Owner intend for plan deactivation to treat WhatsApp differently from in-app?
  * The approved AST-Q02 policy states that plan deactivation stops new catalog sales while existing subscriber benefits continue through their valid term.
  * In the absence of an explicit instruction to revoke WhatsApp while preserving in-app, the uniform application of AST-Q02 across both channels is architecturally sound and consistent.

---

## 11. Production Exposure: Confirmed or Unverified

* **Local Repository Status:** Fully verified. Local migrations (016 and 055), TypeScript services, and Jest unit tests are completely consistent.
* **Deployed Production Database Status:** **Unverified.**
  * Per project safety rules (*"Never deploy or push database migrations unless explicitly instructed by the user"*), Migration 055 has not been deployed to production during these audit tasks.
  * In a deployed production environment where Migration 055 has not yet been applied, the production database would still run Migration 045 (which required `p.is_active = true` for daily insights), creating the runtime disparity identified in the original audit.
  * Once Migration 055 is deployed, production behavior will match local behavior and resolve the disparity.

---

## 12. Recommended Next Step, Without Implementing It

1. **Acknowledge AST-P04 Resolution via AST-Q02:**
   Record that AST-P04's reported inconsistency between daily in-app access and automated delivery dispatch is fully resolved by the AST-Q02 Option A remediation in Migration 055.
2. **No Code or Migration Changes Required:**
   The dispatcher in `016_cron_and_queues.sql` requires no modifications. It already exhibits the correct AST-Q02 behavior.
3. **Deployment Prerequisite:**
   Ensure Migration 055 is included when database migrations are approved for staging/production deployment, bringing live database behavior into alignment with local specifications.

---

## 13. Exact Files, Functions, RPCs, and Migrations Inspected

### 13.1 SQL Migrations
* [`supabase/migrations/016_cron_and_queues.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql):
  * `public.cron_astrology_delivery_dispatch()` (lines 62–108).
  * `public.cron_astrology_subscription_housekeeping()` (lines 35–56).
  * Cron schedules for `daily_astrology_delivery_dispatch` (lines 168–174).
* [`supabase/migrations/045_daily_vedic_astrology_insights.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql):
  * Original pre-AST-Q02 entitlement logic in RLS and `get_daily_rashi_insight` (lines 80–180).
* [`supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql):
  * AST-Q02 Option A remediation decoupling `plan.is_active` from `get_daily_rashi_insight` and RLS (lines 88–185).

### 13.2 Application Source Files
* [`src/features/astrology/services/astrologyService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/astrologyService.ts):
  * `isSubscriptionCurrentlyActive`, `isSubscriptionFutureStart`, `isEligibleForDailyInAppInsights` (lines 19–95).
  * `getCustomerDeliveries` (lines 427–460).
* [`src/features/astrology/services/dailyRashiService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts):
  * Direct table fallback entitlement check under AST-Q02 (lines 420–445).

### 13.3 Test Files
* [`__tests__/astrology_delivery_lifecycle.test.ts`](file:///C:/Projects/KashiVeda/__tests__/astrology_delivery_lifecycle.test.ts):
  * Delivery dispatch eligibility, content gating, idempotency, and WhatsApp boundary tests.
* [`__tests__/daily_astrology_subscription_selection.test.tsx`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_subscription_selection.test.tsx):
  * Test F asserting that deactivated plans retain daily in-app entitlement during valid intervals.

---

## 14. Safety Attestation & Final Decision

### 14.1 Safety Attestation
* No production writes, migrations, or live database commands were executed.
* No source code in `C:\Projects\KashiVeda` or `C:\Projects\kashi-veda-admin` was modified.
* No test suites were modified.
* No outbound messages or external delivery workers were triggered.
* Only this assessment report file was created.

### 14.2 Final Decision

**Outcome B — Current local source appears consistent, but runtime exposure is unverified**  
*(With explicit confirmation that local code satisfies Outcome A under the approved AST-Q02 policy)*

**Justification:**  
1. **Local Consistency Confirmed (Outcome A Criteria):** In the local repository, both the legacy delivery dispatcher (`public.cron_astrology_delivery_dispatch`) and the daily in-app entitlement logic (`public.get_daily_rashi_insight` updated by Migration 055) consistently implement the approved AST-Q02 Option A policy:
   * Existing valid subscribers retain their purchased benefits on deactivated plans across all channels.
   * Neither subsystem filters on `plan.is_active = true`.
   * Both subsystems strictly enforce subscription status (`status = 'active'`), start and end validity boundaries (`starts_at <= now() < ends_at`), and channel capability flags (`daily_in_app_enabled`, `weekly_whatsapp_enabled`).
   * New catalog purchases for deactivated plans remain blocked.
2. **Runtime Exposure Unverified (Outcome B Requirement):** Because Migration 055 is a local migration that has not yet been deployed to the live production database, effective deployed behavior on production cannot be verified without performing a live deployment. In a live environment running pre-Migration 055 code, the original discrepancy would still exist.
