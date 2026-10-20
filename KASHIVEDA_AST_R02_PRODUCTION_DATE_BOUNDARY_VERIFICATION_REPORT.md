# KASHIVEDA — AST-R02 PRODUCTION DATE BOUNDARY VERIFICATION REPORT

**Investigation Target:** AST-R02 — Verification of Deployed India-Calendar-Date Boundary Handling  
**Target Functions:**  
* `public.get_daily_rashi_insight`
* `public.admin_list_daily_rashi_insights`  
**Target Policies:** `daily_rashi_insights_select_customer` on `public.daily_rashi_insights`  
**Reference Security/Audit Advisories:**  
* `AST-R02` (Feature 02 Astrology Audit)  
* `BUG-001` / `DEF-001` (`KASHIVEDA_SYSTEM_AUDIT.md` & `KASHIVEDA_DEEP_BUG_AUDIT.md`)  
**Target Date Semantics:** `(now() AT TIME ZONE 'Asia/Kolkata')::DATE` vs. Legacy `CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'`  
**Evaluation Mode:** Local Source Audit, Safe Disposable PostgreSQL 18 Empirical Evaluation & Production SQL Preparation  
**Date:** 2026-10-12  

---

## 1. Executive Summary & Chosen Outcome

### 1.1 Final Outcome Classification
**Selected Outcome: B — Production evidence unavailable**

#### Formal Justification:
1. **Local Source Correction Fully Verified:** All local database migrations (`045`, `047`, `049`, `055`), client-side date utilities (`src/shared/utils/date.ts`), and admin matrix helpers consistently specify the correct India-date expression `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)`.
2. **Empirical Defect & Proof of Fix Reproduced on Isolated Database:** Testing on an isolated disposable PostgreSQL 18 test cluster proved that under a standard cloud UTC database session, the legacy expression `((CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::DATE)` produces a severe **5-hour 30-minute blackout window** between 00:00:00 IST and 05:29:59 IST every night. During this window, today's published horoscope is falsely rejected as a "future date". The corrected expression `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` operates flawlessly across all session timezones (`UTC`, `Asia/Kolkata`, `America/New_York`).
3. **Production Catalog Evidence Inaccessible:** Direct read-only TCP catalog access (`pg_proc`, `pg_policies`, `supabase_migrations`) to the live deployed Supabase database is not available from the local environment (only client-side publishable keys are present in `.env`).
4. **Safety Compliance Over Speculation:** In strict adherence to engineering safety rules, no live production RPCs were invoked to probe date behavior. Therefore, production status cannot be assumed to match local files and must be formally classified as **UNVERIFIED**.
5. **Actionable Verification Path:** Safe, read-only SQL inspection queries have been prepared for authorized database administrators to execute in the Supabase Dashboard SQL Editor to establish definitive production status.

---

## 2. Original AST-R02 Concern

### 2.1 The Legacy Date-Boundary Flaw (`BUG-001` / `DEF-001`)
The initial implementation of Daily Vedic Astrology in Migration 045 reportedly contained an incorrect India date evaluation pattern:

```sql
CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'
```

#### Why This Failed in PostgreSQL:
In PostgreSQL, `CURRENT_DATE` does not represent a universal timestamp (`timestamptz`); it returns a timezone-naive `DATE` based on the database server session's active time zone (`TimeZone`).

In Supabase Cloud and AWS RDS environments, database servers operate with `TimeZone = 'UTC'`.
* Consider the instant **02:30 AM IST on October 10, 2026**.
* In UTC, the current instant is **21:00 UTC on October 9, 2026**.
* Consequently, `CURRENT_DATE` evaluates to `'2026-10-09'::DATE`.
* When PostgreSQL evaluates `date AT TIME ZONE 'Asia/Kolkata'`, no native `(date, text)` operator exists. Under PostgreSQL type resolution rules, `DATE` implicitly coerces to `TIMESTAMP WITH TIME ZONE` (the preferred datetime type), which sets the time to **midnight in the session timezone**: `'2026-10-09 00:00:00+00'`.
* Applying `AT TIME ZONE 'Asia/Kolkata'` to `'2026-10-09 00:00:00+00'` shifts it to Kolkata wall-clock time: `'2026-10-09 05:30:00'::timestamp`.
* Casting that timestamp to `::DATE` yields `'2026-10-09'`!

### 2.2 Operational Failure Modes

```
Time in India (IST)          00:00:00 IST                              05:30:00 IST
                              │                                          │
UTC Server Clock             18:30:00 UTC                              00:00:00 UTC
                              │                                          │
                              ▼                                          ▼
                      ┌────────────────────────────────────────────────────────┐
                      │            5.5-HOUR DAILY BLACKOUT WINDOW              │
                      │  Database thinks date is Oct 9; Client requests Oct 10  │
                      └────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                      1. get_daily_rashi_insight:
                         "Future insights are not available." (REJECTED)
                      2. daily_rashi_insights_select_customer (RLS):
                         Today's published horoscope HIDDEN from customers
                      3. admin_list_daily_rashi_insights:
                         Defaults to Oct 9 instead of Oct 10
```

1. **Customer Reader RPC (`get_daily_rashi_insight`):**  
   A customer in India opening the app at 01:00 AM IST on October 10 receives a date string `'2026-10-10'` from their mobile device. The database calculates `v_today_ist` as `'2026-10-09'`. The future-date guard evaluates `'2026-10-10' > '2026-10-09'` as `TRUE`, rejecting the query with:
   ```json
   { "success": false, "is_entitled": true, "error": "Future insights are not available." }
   ```
2. **Customer Direct Table Read RLS (`daily_rashi_insights_select_customer`):**  
   The RLS condition `insight_date <= ((CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::DATE)` evaluates to `insight_date <= '2026-10-09'`, hiding all published October 10 insights from customers until 05:30 AM IST.
3. **Admin Editorial Overview (`admin_list_daily_rashi_insights`):**  
   When called with `p_insight_date IS NULL`, the function defaults to yesterday's date, confusing editorial staff between midnight and dawn.

---

## 3. Local Source Definitions Inspected

A comprehensive audit of all relevant database migrations, application source files, and automated tests was conducted.

### 3.1 Inventory of Local Database Objects

| Object | File Path | Line References | Local Date Expression | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`daily_rashi_insights_select_customer`** | `supabase/migrations/045_daily_vedic_astrology_insights.sql` | Lines 75–80 | `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | Hardened |
| **`public.get_daily_rashi_insight`** | `supabase/migrations/045_daily_vedic_astrology_insights.sql` | Lines 129, 133, 171 | `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | Hardened |
| **`public.admin_list_daily_rashi_insights`** | `supabase/migrations/045_daily_vedic_astrology_insights.sql` | Lines 461–463 | `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | Hardened |
| **`public.admin_list_daily_rashi_insights`** | `supabase/migrations/047_harden_daily_astrology_admin_rpcs.sql` | Lines 197–199 | `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | Hardened |
| **`public.admin_list_daily_rashi_insights`** | `supabase/migrations/049_daily_astrology_optimistic_concurrency.sql` | Lines 301–303 | `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | Hardened |
| **`daily_rashi_insights_select_customer`** | `supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql` | Lines 93–97 | `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | Hardened |
| **`public.get_daily_rashi_insight`** | `supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql` | Lines 141, 145, 184 | `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | Hardened |

### 3.2 Exact Local Definition Excerpts

#### A. Customer Reader RPC: `public.get_daily_rashi_insight`
From `supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql` (Lines 136–189):
```sql
BEGIN
    v_caller_id := auth.uid();
    -- Authoritative Indian calendar date calculation:
    v_today_ist := ((now() AT TIME ZONE 'Asia/Kolkata')::DATE);

    -- Validate input parameters: NULL defaults to today in India
    IF p_insight_date IS NULL THEN
        p_insight_date := v_today_ist;
    END IF;

    ...

    -- Prevent customers from querying future dates
    IF NOT v_is_admin AND p_insight_date > v_today_ist THEN
        RETURN jsonb_build_object(
            'success', false,
            'is_entitled', v_is_entitled,
            'error', 'Future insights are not available.'
        );
    END IF;
```

#### B. Admin Editorial Matrix RPC: `public.admin_list_daily_rashi_insights`
From `supabase/migrations/049_daily_astrology_optimistic_concurrency.sql` (Lines 291–307):
```sql
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to inspect daily insights.';
    END IF;

    -- Default to today in India when no explicit date is provided
    IF p_insight_date IS NULL THEN
        p_insight_date := ((now() AT TIME ZONE 'Asia/Kolkata')::DATE);
    END IF;

    IF p_language IS NULL OR TRIM(p_language) = '' THEN
        p_language := 'en';
    END IF;
```

#### C. Row-Level Security Policy: `daily_rashi_insights_select_customer`
From `supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql` (Lines 92–112):
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

### 3.3 Admin Save Function Clarification (`admin_save_daily_rashi_insight`)
Inspection of `public.admin_save_daily_rashi_insight` across Migrations 045, 047, 049, and 050 confirms:
* `admin_save_daily_rashi_insight` validates only that `p_insight_date IS NOT NULL`.
* **It does NOT derive today's date and does NOT reject future dates.**
* This is correct by design: administrators must be able to curate, stage, and publish daily horoscopes for future dates (e.g. scheduling for tomorrow or next week). The date boundary restriction is strictly customer-facing.

---

## 4. Exact Local Date Expressions and Their Intended Semantics

### 4.1 The Correct Mathematical Formula
```sql
((now() AT TIME ZONE 'Asia/Kolkata')::DATE)
```

1. **`now()`**: Returns `TIMESTAMP WITH TIME ZONE` (`timestamptz`), representing the exact UTC physical instant when the transaction started.
2. **`AT TIME ZONE 'Asia/Kolkata'`**: Converts the universal instant into a `TIMESTAMP WITHOUT TIME ZONE` representing the wall-clock time in the Indian Standard Time zone (`UTC + 05:30`).
3. **`::DATE`**: Truncates the wall-clock timestamp to its Gregorian calendar date component (`YYYY-MM-DD`).
4. **Timezone Independence:** Because `now()` is a universal instant and `'Asia/Kolkata'` is an explicit zone definition, this expression yields the exact Indian calendar date regardless of whether the database session's `TimeZone` is set to `UTC`, `Asia/Kolkata`, `America/New_York`, or `GMT`.

### 4.2 Application-Side Date Handling

#### A. Mobile App (`src/shared/utils/date.ts`)
* **`getIndianCalendarDate(date: Date = new Date()): string`**:  
  Uses `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", ... })` to resolve the current date in India independently of the client device's local timezone.
* **`getMsUntilNextIndianMidnight(now: Date = new Date()): number`**:  
  Computes the milliseconds remaining until `00:00:00 IST` using a fixed `+05:30` offset.
* **Mobile Hook (`useDailyRashiInsight.ts`)**:  
  Wires `getMsUntilNextIndianMidnight` into a rollover timer that automatically triggers a background cache invalidation and query refresh when midnight strikes in India.

#### B. Admin Portal (`lib/astrology/daily-insights-matrix-coordinator.ts`)
* **`stepCalendarDate(canonicalDate: string, delta: number): string`**:  
  Splits `YYYY-MM-DD`, creates UTC midnight timestamps, applies day deltas, and extracts `YYYY-MM-DD`. This avoids client-browser DST and timezone bugs during editorial navigation.

---

## 5. Fixed-Instant Date-Boundary Test Matrix

To mathematically prove the difference between expressions and eliminate speculation, empirical testing was executed on an isolated PostgreSQL 18 instance (`disposable_pg`, Port 5433).

### 5.1 Test Methodology
Six deterministic UTC timestamp instants were evaluated across three distinct database session time zones (`UTC`, `Asia/Kolkata`, `America/New_York`):
1. **Instant 1 (`2026-10-09 18:29:00+00`):** 1 minute before midnight in India (23:59 IST, Oct 9).
2. **Instant 2 (`2026-10-09 18:30:00+00`):** Exactly midnight in India (00:00 IST, Oct 10).
3. **Instant 3 (`2026-10-09 18:31:00+00`):** 1 minute after midnight in India (00:01 IST, Oct 10).
4. **Instant 4 (`2026-10-09 23:59:00+00`):** 5 hours 29 minutes after midnight in India (05:29 IST, Oct 10).
5. **Instant 5 (`2026-10-10 00:00:00+00`):** Exactly midnight in UTC (05:30 IST, Oct 10).
6. **Instant 6 (`2026-10-10 18:30:00+00`):** Next Indian midnight (00:00 IST, Oct 11).

### 5.2 Empirical Evaluation Matrix

```
Test Environment: Disposable PostgreSQL 18.0 (Port 5433)
Script: scratch/test_ast_r02_date_semantics.py
Results Artifact: scratch/ast_r02_date_matrix.json
```

| Session `TimeZone` | Input UTC Instant | Kolkata Wall Time | Intended Date Expression `(t AT TZ 'Asia/Kolkata')::DATE` | Legacy Flawed Expression `(t::date AT TZ 'Asia/Kolkata')::DATE` | Session Date `t::date` | Result Evaluation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`UTC`** (Cloud Default) | `2026-10-09 18:29:00+00` | `2026-10-09 23:59:00` | **`2026-10-09`** | `2026-10-09` | `2026-10-09` | Correct (Pre-midnight) |
| **`UTC`** (Cloud Default) | `2026-10-09 18:30:00+00` | `2026-10-10 00:00:00` | **`2026-10-10`** | **`2026-10-09`** | `2026-10-09` | **DEFECT ACTIVE (Flawed lags 1 day)** |
| **`UTC`** (Cloud Default) | `2026-10-09 18:31:00+00` | `2026-10-10 00:01:00` | **`2026-10-10`** | **`2026-10-09`** | `2026-10-09` | **DEFECT ACTIVE (Flawed lags 1 day)** |
| **`UTC`** (Cloud Default) | `2026-10-09 23:59:00+00` | `2026-10-10 05:29:00` | **`2026-10-10`** | **`2026-10-09`** | `2026-10-09` | **DEFECT ACTIVE (Flawed lags 1 day)** |
| **`UTC`** (Cloud Default) | `2026-10-10 00:00:00+00` | `2026-10-10 05:30:00` | **`2026-10-10`** | `2026-10-10` | `2026-10-10` | Correct (UTC midnight catches up) |
| **`UTC`** (Cloud Default) | `2026-10-10 18:30:00+00` | `2026-10-11 00:00:00` | **`2026-10-11`** | **`2026-10-10`** | `2026-10-10` | **DEFECT ACTIVE (Flawed lags 1 day)** |
| **`Asia/Kolkata`** | `2026-10-09 18:29:00+00` | `2026-10-09 23:59:00` | **`2026-10-09`** | `2026-10-09` | `2026-10-09` | Correct |
| **`Asia/Kolkata`** | `2026-10-09 18:30:00+00` | `2026-10-10 00:00:00` | **`2026-10-10`** | `2026-10-10` | `2026-10-10` | Correct (Masked by session TZ) |
| **`Asia/Kolkata`** | `2026-10-09 18:31:00+00` | `2026-10-10 00:01:00` | **`2026-10-10`** | `2026-10-10` | `2026-10-10` | Correct (Masked by session TZ) |
| **`Asia/Kolkata`** | `2026-10-09 23:59:00+00` | `2026-10-10 05:29:00` | **`2026-10-10`** | `2026-10-10` | `2026-10-10` | Correct (Masked by session TZ) |
| **`Asia/Kolkata`** | `2026-10-10 00:00:00+00` | `2026-10-10 05:30:00` | **`2026-10-10`** | `2026-10-10` | `2026-10-10` | Correct |
| **`Asia/Kolkata`** | `2026-10-10 18:30:00+00` | `2026-10-11 00:00:00` | **`2026-10-11`** | `2026-10-11` | `2026-10-11` | Correct (Masked by session TZ) |
| **`America/New_York`** | `2026-10-09 18:30:00+00` | `2026-10-10 00:00:00` | **`2026-10-10`** | **`2026-10-09`** | `2026-10-09` | **DEFECT ACTIVE (Flawed lags 1 day)** |

### 5.3 Key Findings from Matrix Evaluation
1. **The Intended Expression is 100% Deterministic:**  
   Under all session timezones (`UTC`, `Asia/Kolkata`, `America/New_York`), `(t AT TIME ZONE 'Asia/Kolkata')::DATE` transitioned to `2026-10-10` at exactly `18:30:00 UTC` (midnight IST).
2. **The Flawed Expression Causes a 5.5-Hour Blackout in Standard UTC Sessions:**  
   In a UTC database session (the Supabase standard), the flawed expression stays stuck on the previous day until `00:00:00 UTC` (which corresponds to `05:30:00 IST`).
3. **The Flawed Expression Masking Trap:**  
   If a developer tests the flawed expression in a local PostgreSQL session where `TimeZone` defaults to `'Asia/Kolkata'`, the test passes because `CURRENT_DATE` happens to match the local calendar date. When deployed to a cloud server running UTC, the defect manifests immediately.

---

## 6. Comparison of Evidence

| Object | Expected Local Behavior | Actual Deployed Definition Inspected? | Date Behavior Confirmed? | Result / Evidence Source |
| :--- | :--- | :--- | :--- | :--- |
| **`get_daily_rashi_insight`** | India-local current-date default and future-date rejection using `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | **No** (Direct production catalog access unavailable) | **Yes** (Confirmed locally & on disposable PG) | **Status: UNVERIFIED in Production**<br>*Local source: Migration 045 line 129, Migration 055 line 141* |
| **`admin_list_daily_rashi_insights`** | India-local default date using `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` when `p_insight_date IS NULL` | **No** (Direct production catalog access unavailable) | **Yes** (Confirmed locally & on disposable PG) | **Status: UNVERIFIED in Production**<br>*Local source: Migration 045 line 462, Migration 047 line 198, Migration 049 line 302* |
| **`daily_rashi_insights_select_customer`** | Restricts customer access to `insight_date <= ((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` | **No** (Direct production catalog access unavailable) | **Yes** (Confirmed locally & on disposable PG) | **Status: UNVERIFIED in Production**<br>*Local source: Migration 045 line 79, Migration 055 line 96* |

---

## 7. Production Catalog Evidence & Verification Queries

Because direct TCP database connection and service-role keys are not mounted locally, direct inspection of the live PostgreSQL catalog could not be performed from this environment.

### 7.1 Prepared Read-Only SQL Inspection Script for Authorized Database Administrator
The authorized operator should copy and execute the following read-only SQL script in the **Supabase Dashboard SQL Editor** to establish the deployed reality:

```sql
-- =============================================================================
-- AST-R02: PRODUCTION DATE-BOUNDARY VERIFICATION QUERY (READ-ONLY)
-- =============================================================================

-- 1. Inspect Session Time Zone
SHOW TIME ZONE;

-- 2. Inspect Function Date Expressions in pg_proc
SELECT
    p.proname AS function_name,
    p.oid::regprocedure AS identity_signature,
    CASE 
        WHEN pg_get_functiondef(p.oid) ILIKE '%(now() AT TIME ZONE ''Asia/Kolkata'')::DATE%' 
             OR pg_get_functiondef(p.oid) ILIKE '%now() AT TIME ZONE ''Asia/Kolkata''%'
        THEN 'HARDENED: Uses now() AT TIME ZONE Asia/Kolkata'
        WHEN pg_get_functiondef(p.oid) ILIKE '%CURRENT_DATE AT TIME ZONE%'
        THEN 'VULNERABLE: Uses CURRENT_DATE AT TIME ZONE (Flawed 5.5h lag)'
        WHEN pg_get_functiondef(p.oid) ILIKE '%CURRENT_DATE%'
        THEN 'VULNERABLE: Uses bare CURRENT_DATE (UTC server lag)'
        ELSE 'MANUAL REVIEW REQUIRED'
    END AS date_boundary_status,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_daily_rashi_insight', 'admin_list_daily_rashi_insights')
ORDER BY p.proname;

-- 3. Inspect Deployed RLS Policy Date Expressions in pg_policies
SELECT
    schemaname,
    tablename,
    policyname,
    roles,
    cmd,
    CASE 
        WHEN qual ILIKE '%(now() AT TIME ZONE ''Asia/Kolkata'')::DATE%'
             OR qual ILIKE '%now() AT TIME ZONE ''Asia/Kolkata''%'
        THEN 'HARDENED: Uses now() AT TIME ZONE Asia/Kolkata'
        WHEN qual ILIKE '%CURRENT_DATE AT TIME ZONE%'
        THEN 'VULNERABLE: Uses CURRENT_DATE AT TIME ZONE (Flawed 5.5h lag)'
        WHEN qual ILIKE '%CURRENT_DATE%'
        THEN 'VULNERABLE: Uses bare CURRENT_DATE (UTC server lag)'
        ELSE 'MANUAL REVIEW REQUIRED'
    END AS rls_date_status,
    qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'daily_rashi_insights'
  AND policyname = 'daily_rashi_insights_select_customer';

-- 4. Inspect Applied Migration Ledger in supabase_migrations (if table exists)
SELECT 
    version,
    name
FROM supabase_migrations.schema_migrations
WHERE version IN ('045', '047', '049', '050', '055')
ORDER BY version ASC;
```

---

## 8. Differences Between Deployed and Local Definitions

| Dimension | Local Source Repository | Potential Production Deployed State |
| :--- | :--- | :--- |
| **`get_daily_rashi_insight`** | Uses `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` in Migrations 045 and 055. | **Unverified.** If production applied early drafts of Migration 045 before local bug fixes, it may retain `CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'`. |
| **`admin_list_daily_rashi_insights`** | Uses `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` in Migrations 045, 047, 049. | **Unverified.** |
| **`daily_rashi_insights_select_customer`** | Uses `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` in Migrations 045 and 055. | **Unverified.** |
| **Migration 055 Impact** | Decouples plan deactivation from customer reading rights (AST-Q02 Option A). Preserves date expression. | **Unverified.** |

---

## 9. Confirmed Findings vs. Unresolved Assumptions

### 9.1 Confirmed Facts
1. **Mathematical Superiority Proved:** `(now() AT TIME ZONE 'Asia/Kolkata')::DATE` is mathematically correct and provides exact Indian midnight rollover across all PostgreSQL session timezones.
2. **Defect Mechanism Proved:** `CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'` evaluates the UTC date before shifting, creating an unintended 5.5-hour blackout period from 00:00 to 05:30 IST.
3. **Local Consistency Proved:** All local SQL migrations (045, 047, 049, 055), mobile date utilities (`src/shared/utils/date.ts`), and admin matrix navigation utilities implement consistent, timezone-agnostic India date resolution.
4. **Editorial Future Dating Supported:** Administrators are not blocked from staging future editorial content. `admin_save_daily_rashi_insight` intentionally permits future `p_insight_date` values.

### 9.2 Unresolved Assumptions (Production Reality)
1. **Live Catalog Definitions:** It cannot be confirmed from this environment whether live Supabase `pg_proc` contains the corrected `now()` expression or the legacy `CURRENT_DATE` expression.
2. **Live RLS Policy:** It cannot be confirmed whether live `daily_rashi_insights_select_customer` in `pg_policies` contains the corrected `now()` expression.
3. **Migration Ledger State:** It cannot be confirmed whether Migration 045 was applied once and never updated, or whether subsequent migrations (047, 049, 055) were applied.

---

## 10. Evidence Limitations & Next Steps

### 10.1 Evidence Limitations
* In accordance with safety rules, no live database modifications, Edge Function deployments, or production RPC calls were performed.
* Local repository files, filenames, or passing Jest tests cannot serve as authoritative proof that a migration was applied to production.

### 10.2 Precise Additional Evidence Required to Close AST-R02
1. An authorized database administrator must execute the SQL script in Section 7.1 in the Supabase Dashboard SQL Editor.
2. **If all objects return `HARDENED`:** AST-R02 can be closed immediately as verified.
3. **If any object returns `VULNERABLE`:** A forward-only patch migration or execution of the updated function/policy definitions must be scheduled to eliminate the 5.5-hour midnight blackout window in production.

---

## 11. Safety Attestation

In accordance with the Safety-Critical Restrictions mandated for this task:
1. No production database mutations, schema alterations, or migrations were executed.
2. No production RPCs (`get_daily_rashi_insight` or `admin_list_daily_rashi_insights`) were invoked.
3. No anonymous or unauthorized requests were sent to live Supabase endpoints.
4. No production customer content or personal data was accessed.
5. All empirical date-boundary simulations were executed strictly within an isolated disposable PostgreSQL 18 test cluster (`disposable_pg`, Port 5433).

---
*Report compiled autonomously by Antigravity under KashiVeda Engineering Standards.*
