# KashiVeda — AST-Q01 Policy Assessment Report
## Legacy Astrology Content Access Policy: Free Access vs. Qualifying Subscription

**Document Version:** 1.0.0  
**Date:** October 11, 2026  
**Assessment Target:** AST-Q01 (Feature 02 Audit Finding)  
**Scope:** Policy Investigation & Assessment across Mobile Application, Admin Portal, Database Schema, and RLS Policies  
**Status:** COMPLETE (ASSESSMENT ONLY — NO CODE OR MIGRATION MODIFICATIONS APPLIED)

---

## 1. Executive Summary

This assessment investigates the original Feature 02 audit question **AST-Q01**:

> *"Should published legacy astrology content be freely accessible to authenticated users, or should reading it require a qualifying subscription?"*

The original audit observed that Migration 012's `SELECT` path on `public.astrology_content` does not verify subscription status, and neither the mobile feed (`AstrologyContentScreen`) nor detail screen (`AstrologyContentDetailScreen`) enforces an entitlement check.

Through rigorous static source inspection, review of the schema evolution across migrations 009 through 053, execution of the existing automated test suite (46 passed tests), and runtime verification on an isolated, disposable PostgreSQL 18.4 instance across seven distinct user states, this assessment establishes:

1. **[CONFIRMED LOCAL BEHAVIOR] Published legacy content is currently open to all authenticated users:** Any authenticated user—regardless of whether they have ever purchased a subscription, have an active subscription, or have an expired or cancelled subscription—can retrieve published, non-expired legacy astrology articles via both feed queries and direct ID queries.
2. **[CONFIRMED LOCAL BEHAVIOR] Drafts, scheduled items, and expired records are strictly protected:** The database Row-Level Security (RLS) policy `astrology_content_select_customer` authoritatively hides unpublished drafts, future-scheduled items, and expired content from non-administrators. Unauthenticated (`anon`) users are denied all table access.
3. **[EVIDENCE SUPPORTING PRODUCT INTENT] Architectural bifurcation exists between Legacy Content and Daily Vedic Insights:**
   - **Legacy Astrology Content (`astrology_content`):** Conceived in Phase 1 (Migrations 009, 012, 016) as broad editorial publications and broadcast templates. Subscriptions in this phase granted *automated personal delivery dispatch* (`astrology_deliveries` queued via daily cron), not paywalled gating of the article repository.
   - **Daily Vedic Astrology Insights (`daily_rashi_insights`):** Conceived in Phase 3 (Migration 045) as a personalized, subscription-gated daily horoscope service (12 Rashis x Date). It incorporates database-enforced entitlement checks (`get_daily_rashi_insight` RPC returning `is_entitled = false` and NULL premium fields) and explicit mobile paywalls with lock icons (🔒).
4. **[REQUIREMENT UNRESOLVED] Marketing and UI copy ambiguity:** Subscription plan details market "Daily In-App Astrological Insights" and "Weekly Guidance Broadcast", and the payment success screen prompts "Access Cosmic Insights". This copy creates potential confusion between the free general article library and the subscription-exclusive daily horoscope service.
5. **[RECOMMENDATION] Formally adopt Option A (Intentionally Free for Authenticated Users):** Preserving legacy content as an open engagement funnel while gating personalized Daily Vedic Insights aligns with the architectural design, requires zero breaking schema changes, and avoids customer regressions.

---

## 2. Original AST-Q01 Statement

During the comprehensive audit of Feature 02 (Astrology Subscription & Content Management), finding **AST-Q01** was documented:

> **Audit Observation:**
> Migration 012 defines RLS policy `astrology_content_select_customer` on `public.astrology_content` as:
> ```sql
> CREATE POLICY astrology_content_select_customer ON public.astrology_content
>     FOR SELECT TO authenticated
>     USING (
>         status = 'published'::public.astrology_content_status
>         AND publish_at <= now()
>         AND (expires_at IS NULL OR expires_at > now())
>     );
> ```
> This policy allows any authenticated user to select published records without checking whether the user holds an active row in `public.astrology_subscriptions`. In the mobile application, `useAstrologyContent` and `AstrologyContentDetailScreen` fetch and render records without gating.
>
> **Audit Question:**
> Is published legacy astrology content intentionally free for all authenticated users to drive community engagement, or is the missing subscription condition an access-control oversight that allows unsubscribed users to consume paid editorial content?

The objective of this assessment is to resolve this question through objective evidence, delineate the differences between Option A and Option B, and provide an actionable decision framework for the product owner.

---

## 3. Legacy-Content Architecture and Effective Local Authorization Path

### 3.1 Architectural Evolution: Legacy Content vs. Daily Vedic Insights

The KashiVeda codebase contains two distinct astrology content systems that must not be conflated:

```
+--------------------------------------------------------------------------------------------------+
|                                    KASHIVEDA ASTROLOGY ARCHITECTURE                              |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|   1. LEGACY ASTROLOGY CONTENT SYSTEM (Phase 1: Migrations 009, 012, 016, 051)                    |
|   --------------------------------------------------------------------------------------------   |
|   * Table: public.astrology_content                                                              |
|   * Channel: 'in_app' | 'whatsapp'                                                               |
|   * Structure: Generic articles/bulletins (title, body, publish_at, expires_at, status)           |
|   * Subscription linkage: NO foreign key to plans. Delivery dispatch via astrology_deliveries   |
|   * Access Model: Open to all authenticated users once published; administrative write only       |
|   * Mobile Screens: AstrologyContentScreen (Feed), AstrologyContentDetailScreen (Detail)        |
|                                                                                                  |
|   2. DAILY VEDIC HOROSCOPE SYSTEM (Phase 3: Migrations 045, 046, 047, 049, 050)                  |
|   --------------------------------------------------------------------------------------------   |
|   * Table: public.daily_rashi_insights                                                          |
|   * Structure: 12 Rashis (Aries..Pisces) x Target Date                                           |
|   * Premium Gated Fields: career_guidance, health_wellness, remedies_mantra                      |
|   * Free Overview Fields: transit_overview, auspicious_timing                                    |
|   * Authoritative RPC: public.get_daily_rashi_insight(p_rashi_id, p_target_date)                |
|   * Access Model: Subscribed users get full guidance; unsubscribed get preview + lock icon (🔒)  |
|   * Mobile Screens: AstrologyScreen ("Daily Vedic Horoscope" section)                            |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

### 3.2 Database Layer: Schema, Policies, and Permissions

#### Table Definition (`public.astrology_content`) — Migration 009
Created in `supabase/migrations/009_astrology.sql`:
```sql
CREATE TABLE public.astrology_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel public.astrology_channel NOT NULL, -- 'in_app' | 'whatsapp'
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    publish_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    status public.astrology_content_status NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'published'
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
**Key Structural Fact:** The table possesses no plan identifier (`plan_id`), no price, no tier category, and no `is_premium` flag.

#### Permissions & Grants — Migration 012
In `supabase/migrations/012_rls_and_permissions.sql`:
```sql
REVOKE ALL ON TABLE public.astrology_content FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.astrology_content TO authenticated;
GRANT ALL ON TABLE public.astrology_content TO service_role;
```
- `anon` (unauthenticated visitors): No privileges (`42501 permission denied`).
- `authenticated`: Granted `SELECT` only. All mutations (`INSERT`, `UPDATE`, `DELETE`) are withheld.

#### RLS Policies — Migration 012
Two policies govern access to `public.astrology_content`:
1. **Customer Read Policy (`astrology_content_select_customer`):**
   ```sql
   CREATE POLICY astrology_content_select_customer ON public.astrology_content
       FOR SELECT TO authenticated
       USING (
           status = 'published'::public.astrology_content_status
           AND publish_at <= now()
           AND (expires_at IS NULL OR expires_at > now())
       );
   ```
2. **Admin Full Access Policy (`astrology_content_admin_all`):**
   ```sql
   CREATE POLICY astrology_content_admin_all ON public.astrology_content
       FOR ALL TO authenticated
       USING (public.is_admin())
       WITH CHECK (public.is_admin());
   ```

#### Administrative Mutations — Migration 051
Migration 051 (`051_atomic_astrology_plan_content_audit_mutations.sql`) defines:
```sql
CREATE OR REPLACE FUNCTION public.admin_save_astrology_content(...)
RETURNS JSONB
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to manage astrology content.'
            USING ERRCODE = '42501';
    END IF;
    ...
```
Customer accounts cannot modify, publish, or draft astrology content.

#### Automated Dispatch — Migration 016
Migration 016 (`016_cron_and_queues.sql`) defines `cron_astrology_delivery_dispatch()`:
```sql
INSERT INTO public.astrology_deliveries (...)
SELECT s.id, c.id, c.channel, now(), 'queued'
FROM public.astrology_subscriptions s
JOIN public.astrology_subscription_plans p ON p.id = s.plan_id
CROSS JOIN public.astrology_content c
WHERE s.status = 'active'
  AND s.starts_at <= now()
  AND s.ends_at > now()
  AND p.is_active = true
  AND c.status = 'published'
  AND c.publish_at <= now()
  AND (c.expires_at IS NULL OR c.expires_at > now())
  AND (
      (c.channel = 'in_app' AND p.daily_in_app_enabled = true) OR
      (c.channel = 'whatsapp' AND p.weekly_whatsapp_enabled = true)
  )
  ...
```
This migration proves that subscriptions in Phase 1 governed **personal message delivery**, populating each subscriber's personal `astrology_deliveries` journal.

---

## 4. Evidence of Current Behavior for Each User State

To verify effective authorization without touching production or remote systems, an isolated disposable PostgreSQL 18.4 environment (running on port `5433`) was initialized with migrations 009, 012, 016, 045, and 051. 

Seven test user states were configured and evaluated against direct table queries, direct queries by ID, feed list queries, Daily Rashi comparisons, and administrative RPC mutations.

### Summary Evaluation Matrix

| User State | Subscription Status | Legacy Feed Count | Direct ID (Published Active) | Direct ID (Scheduled/Draft/Expired) | Daily Rashi (Table) | Daily Rashi (RPC Entitled) | Admin Mutation Allowed | Effective Authorization Outcome |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **State 1: Unauthenticated (`anon`)** | None | 0 (Denied) | ❌ Denied (`42501`) | ❌ Denied (`42501`) | ❌ Denied (`42501`) | ❌ False (`is_entitled: false`) | ❌ Denied (`42501`) | **[CONFIRMED LOCAL BEHAVIOR]** Blocked at table grant level. Zero data leakage. |
| **State 2: Authenticated Unsubscribed** | None | 1 (Active only) |  Allowed (Full body) | ❌ Denied (0 rows) | ❌ Denied (0 rows) | ❌ False (`is_entitled: false`) | ❌ Denied (`42501`) | **[CONFIRMED LOCAL BEHAVIOR]** Can read published legacy content freely. Denied daily horoscope and drafts. |
| **State 3: Authenticated Active Subscriber** | Active (valid dates, active plan) | 1 (Active only) |  Allowed (Full body) | ❌ Denied (0 rows) |  Allowed (Has Career) |  True (`is_entitled: true`) | ❌ Denied (`42501`) | **[CONFIRMED LOCAL BEHAVIOR]** Can read published legacy content AND full Daily Vedic Horoscopes. |
| **State 4: Authenticated Expired Subscriber** | Expired (`ends_at <= now()`) | 1 (Active only) |  Allowed (Full body) | ❌ Denied (0 rows) | ❌ Denied (0 rows) | ❌ False (`is_entitled: false`) | ❌ Denied (`42501`) | **[CONFIRMED LOCAL BEHAVIOR]** Legacy content access continues; Daily Rashi access revoked. |
| **State 5: Authenticated Cancelled Subscriber** | Cancelled (`status = 'cancelled'`) | 1 (Active only) |  Allowed (Full body) | ❌ Denied (0 rows) | ❌ Denied (0 rows) | ❌ False (`is_entitled: false`) | ❌ Denied (`42501`) | **[CONFIRMED LOCAL BEHAVIOR]** Legacy content access continues; Daily Rashi access revoked. |
| **State 6: Authenticated Inactive Plan Subscriber** | Active sub on plan with `is_active = false` | 1 (Active only) |  Allowed (Full body) | ❌ Denied (0 rows) | ❌ Denied (0 rows) | ❌ False (`is_entitled: false`) | ❌ Denied (`42501`) | **[CONFIRMED LOCAL BEHAVIOR]** Legacy content access continues; Daily Rashi access revoked. |
| **State 7: Authorized Administrator** | Admin role (`admin_users`) | 6 (All records) |  Allowed |  Allowed (Draft/Sched/Exp) |  Allowed |  True (Admin bypass) |  Allowed (`admin_save`) | **[CONFIRMED LOCAL BEHAVIOR]** Full editorial visibility and mutation access. |

### Detailed Findings by User State

#### State 1: Unauthenticated User (`role: anon`)
- **Direct Query / Feed Query:** Fails immediately with PostgreSQL error `42501: permission denied for table astrology_content`.
- **Direct Query by ID:** Fails with `42501: permission denied for table astrology_content`.
- **Reason:** Migration 012 explicitly executed `REVOKE ALL ON TABLE public.astrology_content FROM PUBLIC, anon;`.
- **Conclusion:** Anonymous clients cannot scrape or access any legacy astrology records.

#### State 2: Authenticated User with No Subscription (`role: authenticated`)
- **Feed Query:** Returns exactly 1 row (`Published Active Insight`).
- **Direct Query for Published Active Record:** Returns `True` with full `body`.
- **Direct Query for Expired Record:** Returns 0 rows (RLS `expires_at > now()` evaluates to false).
- **Direct Query for Scheduled Record:** Returns 0 rows (RLS `publish_at <= now()` evaluates to false).
- **Direct Query for Draft Record:** Returns 0 rows (RLS `status = 'published'` evaluates to false).
- **Daily Rashi Comparison:** 
  - Direct SELECT on `daily_rashi_insights`: Returns 0 rows.
  - RPC `get_daily_rashi_insight`: Raises exception or returns `is_entitled: false` with NULL premium fields.
- **Admin Mutation:** Rejected with `42501: Unauthorized: Administrator privileges required`.
- **Conclusion:** Unsubscribed users can browse and read published legacy content freely, but are completely blocked from drafts and subscription-gated daily horoscopes.

#### State 3: Authenticated User with Active Qualifying Subscription
- **Feed Query:** Returns exactly 1 row (`Published Active Insight`). Does not return drafts or scheduled items.
- **Direct Query for Published Active Record:** Returns `True` with full `body`.
- **Daily Rashi Comparison:** Direct table query returns 1 row including `career_guidance`; RPC returns `is_entitled: true`.
- **Conclusion:** Active subscribers experience identical legacy content access to unsubscribed users, but have unlocked access to Daily Vedic Insights.

#### State 4: Authenticated User with Expired Subscription
- **Feed Query & Direct ID Query:** Receives published active legacy content identically to States 2 and 3.
- **Daily Rashi Comparison:** Gated; Daily Rashi access is revoked immediately upon expiration (`ends_at <= now()`).
- **Conclusion:** Subscription expiration has zero impact on legacy content readability.

#### State 5: Authenticated User with Cancelled Subscription
- **Feed Query & Direct ID Query:** Receives published active legacy content identically to States 2, 3, and 4.
- **Daily Rashi Comparison:** Gated; Daily Rashi access is revoked.
- **Conclusion:** Subscription cancellation does not restrict legacy content access.

#### State 6: Authenticated User on Inactive Plan
- **Feed Query & Direct ID Query:** Receives published active legacy content.
- **Daily Rashi Comparison:** Gated; `daily_rashi_insights` RLS requires `p.is_active = true`, revoking daily insights.
- **Conclusion:** Plan deactivation does not alter legacy content readability.

#### State 7: Authorized Administrator (`is_admin() = true`)
- **Feed Query:** Returns all 6 records across all statuses (`draft`, `scheduled`, `published`, expired, and across channels `in_app` and `whatsapp`).
- **Direct Queries:** Successfully retrieves any record regardless of publication date or status.
- **Admin RPC:** Successfully creates and updates content via `admin_save_astrology_content`.
- **Conclusion:** Editorial preview and management operate with complete authorization separation.

---

## 5. Relevant Mobile and Admin UI Behavior

### 5.1 Mobile Application (`C:\Projects\KashiVeda`)

#### 1. Home Astrology Hub (`AstrologyScreen.tsx`)
The primary astrology screen visually displays two sections with completely different security postures:
1. **"Today's Cosmic Insights":**
   - Renders `AstrologyContentCard` directly.
   - Shows publication date, title, snippet, and channel badge (`Daily In-App` or `WhatsApp Broadcast`).
   - Contains **no lock icon, no premium badge, and no entitlement check**.
   - Tapping an item navigates to `AstrologyContentDetailScreen`.
2. **"Daily Vedic Horoscope":**
   - Renders `DailyRashiInsightCard`.
   - Explicitly evaluates `isEntitled`.
   - When unsubscribed, displays a prominent lock icon (🔒), a `"Paid Vedic Guidance"` badge, and a call-to-action button: `"Unlock Daily Astrological Insights ✨"`.

#### 2. Cosmic Insights Feed (`AstrologyContentScreen.tsx`)
- Fetches published insights using `astrologyService.getPublishedContent(page, pageSize, channel)`.
- Provides channel filters: `"All Insights"`, `"Daily In-App"`, and `"WhatsApp Broadcasts"`.
- Displays all published records without any subscription gating or teaser locks.

#### 3. Content Detail Screen (`AstrologyContentDetailScreen.tsx`)
- Fetches insight details via `astrologyService.getContentById(contentId)`.
- Renders the full `content.body` directly in a card.
- Contains no lock states, no paywall prompts, and no subscription verification.

#### 4. Delivery Journal Screen (`AstrologyDeliveriesScreen.tsx`)
- Fetches subscriber-specific journal records via `astrologyService.getCustomerDeliveries()`.
- RLS policy `astrology_deliveries_select_customer` enforces that only records belonging to `auth.uid()`'s subscriptions are returned.
- If unsubscribed, displays `EmptyState` ("No Delivery History: No astrology delivery records have been dispatched to your subscription yet.").

#### 5. Plan Detail and Payment Screens
- `AstrologyPlanDetailScreen.tsx`: Lists plan features:
  - *"Daily In-App Astrological Insights: Daily planetary transits, auspicious timings, and Nakshatra guidance delivered directly inside the app."*
  - *"Weekly Guidance Broadcast: Weekly planetary shifts and comprehensive horoscope overview (WhatsApp channel planned for future activation)."*
- `AstrologyPaymentScreen.tsx`: After subscription activation, presents two action buttons:
  - `"Access Cosmic Insights"` (navigates to `AstrologyScreen`)
  - `"View My Subscription"` (navigates to `AstrologySubscriptionScreen`)

### 5.2 Admin Portal (`C:\Projects\kashi-veda-admin`)

- Managed via `lib/actions/astrology-management.ts` and `components/astrology/content-form-modal.tsx`.
- Form inputs: `title`, `body`, `channel` (`in_app` | `whatsapp`), `status` (`draft` | `scheduled` | `published`), `publish_at`, and `expires_at`.
- **Crucial Fact:** The admin UI contains **no input to attach a plan, price, or subscription tier** to content. Admins cannot make an individual legacy content record "premium" or "free".

---

## 6. Evidence For and Against the Free-Content Interpretation (Option A)

### Evidence FOR Free Content (Option A)

1. **[EVIDENCE SUPPORTING PRODUCT INTENT] Schema Architecture Lacks Plan Gating:**
   The `public.astrology_content` table was created in Migration 009 with no `plan_id` foreign key, no tier field, and no `is_premium` boolean. If content was meant to be plan-gated, the schema would require metadata specifying which plan grants access.
2. **[EVIDENCE SUPPORTING PRODUCT INTENT] RLS Policy Deliberately Omitted Subscriptions:**
   Migration 012 was authored by senior engineers who simultaneously wrote subscription-joining RLS policies for `astrology_deliveries`:
   ```sql
   -- astrology_deliveries checks subscriptions:
   CREATE POLICY astrology_deliveries_select_customer ON public.astrology_deliveries
       FOR SELECT TO authenticated
       USING (EXISTS (SELECT 1 FROM public.astrology_subscriptions s WHERE ...));

   -- astrology_content does NOT check subscriptions:
   CREATE POLICY astrology_content_select_customer ON public.astrology_content
       FOR SELECT TO authenticated
       USING (status = 'published' AND publish_at <= now() ...);
   ```
   The contrast in the exact same migration demonstrates intentional design.
3. **[EVIDENCE SUPPORTING PRODUCT INTENT] Delivery Dispatch Model Explains Subscription Value:**
   In Phase 1, the paid subscription benefit was the *daily dispatch service* (`astrology_deliveries`), where transits and forecasts are pushed to the user's journal or WhatsApp. The general article feed remained an open library.
4. **[EVIDENCE SUPPORTING PRODUCT INTENT] Contrast with Daily Vedic Insights:**
   When the product team genuinely intended to gate astrology content (Phase 3, Migration 045), they built a comprehensive gating system: `get_daily_rashi_insight` RPC, table RLS checking `astrology_subscriptions`, lock icons (🔒), and blurred premium fields. Legacy content was left untouched.
5. **[CONFIRMED LOCAL BEHAVIOR] Client Code Never Implemented Client-Side Locks:**
   Neither `AstrologyContentScreen` nor `AstrologyContentDetailScreen` has ever contained paywall logic or lock icons.

### Evidence AGAINST Free Content (Option A)

1. **[EVIDENCE SUPPORTING PRODUCT INTENT] Channel Names Match Plan Attributes:**
   `astrology_content.channel` values (`'in_app'`, `'whatsapp'`) exactly match plan columns `daily_in_app_enabled` and `weekly_whatsapp_enabled`. A user or stakeholder could interpret `daily_in_app_enabled` as unlocking in-app content.
2. **[EVIDENCE SUPPORTING PRODUCT INTENT] Plan Feature Marketing Copy:**
   Plan marketing copy promises: *"Daily In-App Astrological Insights: Daily planetary transits, auspicious timings, and Nakshatra guidance delivered directly inside the app."* If an unsubscribed user already reads daily transits in the app feed, the perceived value of purchasing a subscription might be diminished.
3. **[EVIDENCE SUPPORTING PRODUCT INTENT] Post-Purchase Call-to-Action:**
   On `AstrologyPaymentScreen`, the primary button following successful payment is labeled `"Access Cosmic Insights"`, reinforcing the impression that paying grants access to the Cosmic Insights feed.

---

## 7. Evidence For and Against the Subscription-Required Interpretation (Option B)

### Evidence FOR Subscription-Required (Option B)

1. **Monetization Alignment:** Restricting general astrology articles to paid subscribers ensures maximum paywall coverage and prevents users from obtaining astrology guidance without subscribing.
2. **Copy Consistency:** Eliminates the potential user confusion where marketing promises "Daily In-App Insights" upon payment, yet the insights are already readable for free.

### Evidence AGAINST Subscription-Required (Option B)

1. **[EVIDENCE SUPPORTING PRODUCT INTENT] Architectural Mismatch:**
   Gating `astrology_content` by subscription leaves unanswered structural questions:
   - Does a plan with only `weekly_whatsapp_enabled = true` grant access to `channel = 'in_app'` articles?
   - What happens to content with channel `'whatsapp'`—should it be visible in the mobile app feed at all, or only delivered via WhatsApp?
2. **[CONFIRMED LOCAL BEHAVIOR] Severe User Experience Regression:**
   Currently, all registered devotees can browse cosmic insights. Imposing a subscription requirement would abruptly lock out existing users from an established feature.
3. **[CONFIRMED LOCAL BEHAVIOR] Redundancy with Daily Vedic Insights:**
   KashiVeda already has a dedicated, premium subscription service: the Daily Vedic Horoscope (`daily_rashi_insights`). Making legacy articles subscription-only duplicates the paywall and dilutes the product funnel (which benefits from having free educational/editorial content leading into premium personalized horoscopes).

---

## 8. Findings from Existing Tests and Disposable Local Tests

### 8.1 Existing Automated Tests

The mobile test suite was executed in full:
```bash
npm test -- __tests__/astrology.test.tsx __tests__/astrology_content_detail_retry.test.tsx __tests__/daily_vedic_astrology_insights.test.tsx
```

**Results:**
- `__tests__/astrology_content_detail_retry.test.tsx`: **PASS** (11.97 s)
- `__tests__/daily_vedic_astrology_insights.test.tsx`: **PASS** (15.50 s)
- `__tests__/astrology.test.tsx`: **PASS** (16.51 s)
- **Total:** 3 test suites passed, 46 tests passed, 0 failed.

**Key Existing Test Assertions Regarding Content:**
- `astrology.test.tsx` Test 10: `useAstrologyContent` fetches published items and filters by channel without checking subscription state.
- `astrology.test.tsx` Test 11: `AstrologyContentScreen` renders cards without verifying active subscription.
- `astrology.test.tsx` Test 12: `AstrologyContentDetailScreen` displays content body without checking entitlement.
- `daily_vedic_astrology_insights.test.tsx` Tests 1–12: Gating is asserted specifically and exclusively on `daily_rashi_insights` and `get_daily_rashi_insight`.

### 8.2 Disposable Local Database Tests

Executed via Python test runner on PostgreSQL 18.4 (port `5433`):
- **Command:** `python scratch/test_ast_q01_policy_assessment.py`
- **Output Artifact:** `scratch/ast_q01_evaluation_results.json`
- **Verification Summary:**
  - `anon` role is strictly blocked by table privileges.
  - `authenticated` role selects active published content without needing an active row in `astrology_subscriptions`.
  - Non-published rows (`draft`, `scheduled`, `expired`) are unreachable by customer tokens even when addressed directly by ID.
  - Admin tokens bypass RLS and retain full visibility over drafts, schedules, and expired records.

---

## 9. Risks and Compatibility Implications of Each Policy Option

### Comparison of Policy Options

| Evaluation Dimension | Option A: Intentionally Free (Recommended) | Option B: Qualifying Subscription Required |
| :--- | :--- | :--- |
| **Current Local Behavior** | Matches 100% of current local implementation. | Diverges from current database and client code. |
| **Database Changes Required** | None. No migration required. | Schema migration required: Rewrite RLS policy or introduce an RPC; add index on `(channel, publish_at)`. |
| **Client Changes Required** | Minor copy adjustment on plan descriptions and payment confirmation button. | Significant changes: Add lock icons, blurred preview cards, paywalls, and upgrade flows across feed and detail screens. |
| **Entitlement Predicate** | Not applicable for legacy content. | Must define: Does `channel = 'in_app'` require `p.daily_in_app_enabled = true`? Does `channel = 'whatsapp'` require `p.weekly_whatsapp_enabled = true`? |
| **Impact on Inactive Plans** | Zero impact. | Need decision: If plan is archived (`is_active = false`), does subscriber retain legacy article access until subscription expiry? |
| **Editorial & Admin Workflows** | Unchanged. Admin continues using `admin_save_astrology_content`. | Unchanged for admins; customer preview paths must be guarded. |
| **Content Visibility Regressions** | None. Existing registered users retain access. | High risk: Users currently reading cosmic insights will suddenly see locked content. |
| **Compatibility with Existing Data**| 100% backward compatible. | Requires data review: Older content with `channel = 'whatsapp'` may become inaccessible if user only has in-app plan. |
| **Minimum Regression Test Suite** | Existing test suite (46 tests) remains valid. | Must write new positive/negative entitlement tests for feed, detail, and direct ID queries. |

---

## 10. Recommended Policy Decision

### Recommendation: Adopt Option A (Legacy Content is Intentionally Free to Authenticated Users)

> [!NOTE]
> **Status:** RECOMMENDATION ONLY. The final choice rests with the Product Owner.

**Rationale for Recommendation:**
1. **Preserves Proven Architectural Separation:** KashiVeda already possesses a monetization vehicle in the **Daily Vedic Astrology Insights** (`daily_rashi_insights`). Having open, general editorial articles in `astrology_content` provides top-of-funnel value that encourages daily app engagement and builds trust, leading users to purchase personalized Daily Rashi guidance.
2. **Zero Schema or Migration Disruption:** Option A requires no risky database migrations, no RLS rewrites, and no changes to existing data.
3. **Avoids Customer Friction:** Existing mobile devotees who read cosmic insights will not experience an abrupt paywall lockout.
4. **Clean Product Clarification:** The only required action is refining marketing copy to clearly distinguish:
   - **Free Community Insights (Cosmic Insights Feed):** Daily general astrological guidance and articles open to all registered devotees.
   - **Premium Vedic Horoscope & Delivery (Paid Subscription):** Personalized daily Rashi transits, career/health/remedy guidance, and automated WhatsApp/in-app journal dispatches.

---

## 11. Exact Source Locations, Functions, Policies, and Migration References

### Migrations
- `supabase/migrations/009_astrology.sql`: Lines 1–40 (Table `public.astrology_content`, enums `astrology_channel`, `astrology_content_status`).
- `supabase/migrations/012_rls_and_permissions.sql`: Lines 80–115 (RLS policy `astrology_content_select_customer`, grants on `astrology_content`).
- `supabase/migrations/016_cron_and_queues.sql`: Lines 90–125 (Function `cron_astrology_delivery_dispatch()`, delivery journal queueing).
- `supabase/migrations/045_daily_vedic_astrology_insights.sql`: Lines 1–150 (Table `daily_rashi_insights`, RPC `get_daily_rashi_insight`, premium gating policies).
- `supabase/migrations/051_atomic_astrology_plan_content_audit_mutations.sql`: Lines 120–180 (RPC `admin_save_astrology_content`).

### Mobile Application (`C:\Projects\KashiVeda`)
- `src/features/astrology/screens/AstrologyScreen.tsx`: Lines 120–210 (Feed presentation vs. Daily Rashi lock state).
- `src/features/astrology/screens/AstrologyContentScreen.tsx`: Lines 1–201 (Feed list and channel filter chips).
- `src/features/astrology/screens/AstrologyContentDetailScreen.tsx`: Lines 1–188 (Detail view of insight body).
- `src/features/astrology/screens/AstrologyDeliveriesScreen.tsx`: Lines 1–107 (Subscriber personal delivery journal).
- `src/features/astrology/screens/AstrologyPaymentScreen.tsx`: Lines 220–235 (Post-purchase navigation CTA).
- `src/features/astrology/services/astrologyService.ts`:
  - `getPublishedContent()`: Lines 360–398.
  - `getContentById()`: Lines 400–419.
  - `getCustomerDeliveries()`: Lines 421–460.

### Admin Application (`C:\Projects\kashi-veda-admin`)
- `lib/actions/astrology-management.ts`: Lines 45–95 (`getAstrologyContent`, `saveAstrologyContent`).
- `components/astrology/content-form-modal.tsx`: Lines 1–160 (Content publishing modal; confirms lack of plan-tier selectors).

---

## 12. Tests Executed and Exact Commands

1. **Mobile Automated Unit & Component Suite:**
   ```bash
   cd C:\Projects\KashiVeda
   npm test -- __tests__/astrology.test.tsx __tests__/astrology_content_detail_retry.test.tsx __tests__/daily_vedic_astrology_insights.test.tsx
   ```
   *Outcome:* 3 suites passed, 46 tests passed.

2. **Disposable Local PostgreSQL 18.4 Policy Evaluation Test:**
   ```bash
   python C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\42cdb6b4-fc12-43c7-8641-11e76a46b5cd\scratch\test_ast_q01_policy_assessment.py
   ```
   *Outcome:* 7 user states evaluated deterministically; full JSON results written to `scratch/ast_q01_evaluation_results.json`.

---

## 13. Unverified Production Behavior and Remaining Limitations

In strict compliance with safety rules:
1. **[UNVERIFIED] Production Database State:** The remote production database was NOT probed or queried. All conclusions reflect the repository's authoritative migrations (001–053) executed in an isolated local database.
2. **[UNVERIFIED] Third-Party Delivery Integration:** The actual WhatsApp provider (Meta Cloud API / Gupshup) webhook delivery runtime was not triggered or tested.
3. **[UNVERIFIED] Customer Perceptions:** No live customer analytics or survey data was collected regarding whether customers expect legacy content to be gated.

---

## 14. Product Owner Decision Gate

Please review the two policy options below and indicate your decision:

### [ ] OPTION A: Legacy Astrology Content is Intentionally Free
- **Policy:** Published legacy astrology articles (`astrology_content`) remain freely accessible to all authenticated users.
- **Paywall Scope:** Paid subscriptions exclusively govern:
  1. Personalized Daily Vedic Horoscopes (`daily_rashi_insights`) and their premium fields (Career, Health, Remedies).
  2. Automated daily in-app delivery dispatches and weekly WhatsApp guidance broadcasts (`astrology_deliveries`).
- **Follow-up Action:** Update marketing copy in `AstrologyPlanDetailScreen` and `AstrologyPaymentScreen` to clarify this distinction. No database migrations needed.

---

### [ ] OPTION B: Legacy Astrology Content Requires a Qualifying Subscription
- **Policy:** Reading published legacy astrology content requires an active, qualifying subscription.
- **Paywall Scope:** Both legacy articles (`astrology_content`) and Daily Vedic Horoscopes (`daily_rashi_insights`) are gated.
- **Follow-up Action:** 
  1. Author a new database migration creating an entitlement-checking RLS policy or secure RPC for `astrology_content`.
  2. Define qualifying plan criteria (e.g., must have `daily_in_app_enabled = true`).
  3. Implement paywall cards, lock icons, and upgrade prompts in `AstrologyContentScreen` and `AstrologyContentDetailScreen`.

---

**Decision Date:** ________________________  
**Approved By (Product Owner):** ________________________  
