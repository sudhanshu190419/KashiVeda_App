# KASHIVEDA — FEATURE 02 PRODUCTION RUNTIME VERIFICATION GUIDE

**Target Audit Findings:**  
* **AST-R01:** Production Security Verification of Daily Astrology Admin RPCs  
* **AST-R02:** Production Verification of India-Calendar-Date Boundary Handling  
**Target Domain:** Daily Vedic Astrological Insights & Subscriptions  
**Companion SQL Script:** [`KASHIVEDA_FEATURE_02_READ_ONLY_PRODUCTION_VERIFICATION.sql`](file:///C:/Projects/KashiVeda/KASHIVEDA_FEATURE_02_READ_ONLY_PRODUCTION_VERIFICATION.sql)  
**Target Audience:** Authorized Database Administrator / DevOps Engineer  
**Security Classification:** STRICTLY READ-ONLY ASSESSMENT (Prepared for Operator Execution)  
**Date:** 2026-10-12  

---

## 1. Executive Summary & Operator Context

### 1.1 Purpose of This Guide
During the KashiVeda Feature 02 (Daily Astrology and Subscriptions) security audit, two critical runtime verification questions were identified:
1. **AST-R01 (Privileged Admin RPC Authorization):** Initial Migration 045 definitions of `public.admin_save_daily_rashi_insight` and `public.admin_list_daily_rashi_insights` contained a null-sensitive authorization guard (`IF v_admin_id IS NOT NULL AND NOT is_admin(...) THEN`) and retained default PostgreSQL `PUBLIC` execution privileges. Under `SECURITY DEFINER`, an unauthenticated caller could bypass the guard, reading unpublished drafts across all 12 Rashis and inserting/overwriting content without audit trails. While local Migrations 047, 049, and 050 hardened these functions, the live production deployment status remains **UNVERIFIED**.
2. **AST-R02 (India-Date Boundary Semantics):** Initial implementations evaluated India calendar dates using `CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'`. Because cloud database servers run with session `TimeZone = 'UTC'`, this expression evaluates yesterday's date during the early morning hours in India (00:00 to 05:30 AM IST), falsely rejecting customer requests for today's horoscope as a "future date". The intended mathematical expression is `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)`. Local migrations contain the fix, but production deployed status remains **UNVERIFIED**.

### 1.2 Important Scope and Verification Status Disclaimers
* **This Script Has NOT Been Executed Against Production:** In strict accordance with project safety rules, Antigravity has not connected to, queried, or executed any statements against the live production database.
* **Local Code & Tests Do Not Establish Production Deployment:** The presence of migration files (`047`, `049`, `050`, `055`) in git history or passing Jest tests in local repositories does not prove that those migrations were executed on the live Supabase database.
* **Findings Remain Unverified:** AST-R01 and AST-R02 remain formally **UNVERIFIED** until an authorized database administrator executes the verification queries and inspects the actual catalog output. Neither finding should be declared fixed or closed prior to reviewing live catalog evidence.
* **No Corrective Migrations Based on Guessed State:** If an issue is observed, do not select or apply a corrective migration merely because the migration ledger reports a particular version. The actual deployed signatures, argument lists, and definitions must first be established.

---

## 2. Safety-Critical Rules for the Operator

> [!CAUTION]
> **STRICT SAFETY INSTRUCTIONS — READ BEFORE EXECUTING:**
> 1. **Zero RPC Invocations:** Do **NOT** invoke `admin_save_daily_rashi_insight`, `admin_list_daily_rashi_insights`, or `get_daily_rashi_insight` in production to "test" whether unauthorized calls are blocked. Exploitation tests against production are strictly forbidden.
> 2. **Zero Production Mutations:** Do **NOT** execute `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `GRANT`, `REVOKE`, or `SET` statements.
> 3. **No Procedural Execution:** The companion script contains pure `SELECT` catalog queries. Do not execute procedural blocks or write loops.
> 4. **No Customer Content Retrieval:** Do **NOT** run `SELECT * FROM public.daily_rashi_insights`. All queries must inspect system catalogs (`pg_proc`, `pg_class`, `pg_policies`, `pg_namespace`, `information_schema`) only.
> 5. **No Secret Exposure:** Do **NOT** include database passwords, JWT tokens, service-role keys, or connection strings in query outputs or shared reports.
> 6. **No Speculative Deployments:** If an issue is found, do **NOT** improvise an immediate hotfix in the SQL editor. Record the exact catalog output and follow the structured incident protocol in Section 8.

---

## 3. Step-by-Step Execution Instructions

### Step 1: Confirm Project Identity in Supabase Dashboard
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Confirm the active project matches the official production instance (verify project reference and URL against approved operational runbooks).
3. Confirm you have authorized administrator privileges to inspect system catalogs.

### Step 2: Open the SQL Editor
1. In the left navigation bar, click on **SQL Editor**.
2. Click **+ New Query** to open a blank editor tab.
3. Rename the tab to `AST-R01_R02_Runtime_Verification`.

### Step 3: Execute Queries Statement by Statement
Open [`KASHIVEDA_FEATURE_02_READ_ONLY_PRODUCTION_VERIFICATION.sql`](file:///C:/Projects/KashiVeda/KASHIVEDA_FEATURE_02_READ_ONLY_PRODUCTION_VERIFICATION.sql).  
Execute each section independently and export the tabular results:

* **Section 1:** Database Environment & Timezone Context
* **Section 2:** Schema-Level Privileges on Schema `public`
* **Section 3 (Part A):** Function Catalog & Overload Inspection (Target RPCs)
* **Section 4:** Administrative Helper Function Inspection (`public.is_admin`)
* **Section 5 (Part B):** Table Catalog Configuration & Permissions (`public.daily_rashi_insights`)
* **Section 6 (Part B):** Complete Row-Level Security Policy Inventory
* **Section 7 (Part C):** Indicative Heuristic Flags (Diagnostic Triage Aid)
* **Section 8 (Part D):** Optional Migration History Ledger Check (Step 8A then Step 8B)

### Step 4: Preserve and Export Results
* Export the output of each query as CSV or copy the tabular text output into your records.
* In particular, ensure the full text of `function_definition` (`pg_get_functiondef`) and all RLS `using_expression` / `with_check_expression` values are captured completely without truncation.

---

## 4. AST-R01 Evaluation Guide: Privileged Admin RPCs

When reviewing the output of **Section 2 (Schema Privileges) and Section 3 (Function Catalog)**, evaluate the following four criteria:

### 4.1 Schema USAGE vs. Function EXECUTE Privileges
In PostgreSQL, executing a function requires **two independent permission layers**:
1. **Schema USAGE:** The calling database role must possess `USAGE` on the containing schema (`public`) to resolve object names.
2. **Function EXECUTE:** The calling database role must possess `EXECUTE` on the target function.

#### How to Interpret Section 2 & Section 3 Together:
* In Supabase, the `public` schema has default `USAGE` granted to `anon` and `authenticated`. Section 2 confirms whether this is true in your instance (`anon_has_schema_usage = TRUE`).
* If `anon` has schema `USAGE`, access control relies entirely on **function-level EXECUTE privileges** and **internal PL/pgSQL authorization guards**.
* Conversely, if a role lacked schema `USAGE`, it could not invoke functions regardless of function grants.
* **Key Takeaway:** Do not treat schema USAGE or function EXECUTE in isolation. Review both layers alongside the function's internal guard logic.

### 4.2 Signature & Overload Inventory
Check the number of rows returned for each function name in Section 3:

```
Target Function Names:
- public.admin_save_daily_rashi_insight
- public.admin_list_daily_rashi_insights
- public.get_daily_rashi_insight
```

#### What to Check:
* **`admin_list_daily_rashi_insights`:** Exactly **one** overload should exist: `(date, character varying)`.
* **`admin_save_daily_rashi_insight`:** Check the identity arguments:
  - **12 Parameters (Base / Migration 047):** `(p_insight_date date, p_rashi_id smallint, p_rashi_name text, p_language character varying, p_general_outlook text, p_career_business text, p_finance_wealth text, p_love_relationships text, p_health_wellbeing text, p_auspicious_color text, p_auspicious_number integer, p_status astrology_content_status)`
  - **13 Parameters (Migration 049 OCC):** Adds `p_expected_version integer`
  - **14 Parameters (Migration 050 Overwrite Guard):** Adds `p_expected_version integer, p_allow_overwrite boolean`
* **CRITICAL DANGER FLAG:** If **multiple overloads** of `admin_save_daily_rashi_insight` exist simultaneously (e.g. both a 12-parameter and a 14-parameter variant), PostgREST routing may permit unauthenticated clients to reach the older overload. Record all overloads present, including their argument lists and effective privileges.

### 4.3 Authorization Guard Code Inspection (`pg_get_functiondef`)
Inspect the executable body of both `admin_save_daily_rashi_insight` and `admin_list_daily_rashi_insights`. Locate the caller identification and authorization check:

#### Safe Guard Pattern (HARDENED):
```sql
v_admin_id := auth.uid();
-- Rejects NULL caller AND rejects authenticated non-admin caller:
IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required...';
END IF;
```
* **Evaluation:** If `auth.uid()` is `NULL` (anonymous PostgREST call), `v_admin_id IS NULL` is `TRUE`, immediately raising the exception. If an ordinary customer or pandit calls, `NOT public.is_admin(...)` is `TRUE`, immediately raising the exception. **PASS.**

#### Vulnerable Guard Pattern (UNPATCHED / FLAWED):
```sql
v_admin_id := auth.uid();
-- FLAW: When auth.uid() is NULL, v_admin_id IS NOT NULL evaluates to FALSE!
IF v_admin_id IS NOT NULL AND NOT public.is_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator privileges required...';
END IF;
```
* **Evaluation:** An anonymous caller with `auth.uid() = NULL` evaluates `FALSE AND ...` &rarr; `FALSE`. The exception is bypassed. **FAIL — CRITICAL VULNERABILITY.**

### 4.4 Stored ACLs and Effective Privileges
Review columns `anon_can_execute`, `authenticated_can_execute`, `service_role_can_execute`, and `stored_acl`:

| Function Name | `anon_can_execute` | `authenticated_can_execute` | `service_role_can_execute` | Assessment |
| :--- | :--- | :--- | :--- | :--- |
| `admin_save_daily_rashi_insight` | **`FALSE`** | **`TRUE`** | **`TRUE`** | **SAFE** (PostgreSQL ACL Layer blocks anonymous calls) |
| `admin_save_daily_rashi_insight` | **`TRUE`** | `TRUE` | `TRUE` | **WARNING** (Anonymous execution allowed at ACL layer; relies on internal guard to block unauthorized callers) |
| `admin_list_daily_rashi_insights` | **`FALSE`** | **`TRUE`** | **`TRUE`** | **SAFE** (PostgreSQL ACL Layer blocks anonymous calls) |
| `admin_list_daily_rashi_insights` | **`TRUE`** | `TRUE` | `TRUE` | **WARNING** (Anonymous execution allowed at ACL layer; relies on internal guard to block unauthorized callers) |
| `get_daily_rashi_insight` | **`TRUE`** | **`TRUE`** | **`TRUE`** | **NORMAL** (Public customer reader; internally validates subscription) |

> [!IMPORTANT]
> If `anon_can_execute = TRUE` **AND** the function body contains the vulnerable guard (`v_admin_id IS NOT NULL AND NOT is_admin(...)`), this represents a **serious exposure indicator** unless the schema's effective permissions (such as `USAGE` on schema `public`) and relevant API exposure are also established. Operators must not introduce production exploit testing to probe or verify this condition.

### 4.5 `SECURITY DEFINER` Implications and Defense in Depth
Because both administrative functions are declared `SECURITY DEFINER`, they execute with the privileges of the function owner (`postgres`):
* **Bypass of Ordinary Caller-Level RLS:** When executing under the owner's elevated privileges, `SECURITY DEFINER` functions can bypass ordinary caller-level table Row-Level Security policies on `daily_rashi_insights`.
* **First-Layer Access Controls:** Effective schema `USAGE` on schema `public` and function `EXECUTE` permissions serve as important first-layer access controls, preventing unauthorized roles from reaching the function at the database level.
* **Internal Authorization Guard:** The internal authorization guard (`IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN ...`) must independently reject unauthenticated callers (`auth.uid() IS NULL`) and authenticated non-administrators.
* **Defense in Depth:** These controls provide defense in depth; no single permission flag, stored ACL setting, or guard-text match alone proves that the deployed function is secure.
* **Holistic Catalog Review Required:** The actual production function definition, owner, security configuration (including `SECURITY DEFINER` and search path), and effective privileges must be reviewed together.

### 4.6 Audit Trail Integrity
In `admin_save_daily_rashi_insight`, verify how `public.admin_audit_logs` is written:
* In hardened definitions, `v_admin_id` is guaranteed non-null, so `actor_user_id` is always recorded with the authentic administrator UUID.
* In vulnerable definitions, the insert into `admin_audit_logs` was wrapped in `IF v_admin_id IS NOT NULL THEN ... END IF;`, meaning anonymous mutations left zero audit records.

---

## 5. AST-R02 Evaluation Guide: India-Calendar-Date Handling

When reviewing the output of **Section 1, Section 3, and Section 6**, evaluate date-boundary handling:

### 5.1 Server Session Timezone (`Section 1`)
Section 1 displays both session-rendered and explicit UTC/IST values:
* `server_session_timezone`: in Supabase Cloud, this will typically return `'UTC'`.
* `session_transaction_timestamp`: `now()` rendered in the session time zone.
* `server_transaction_timestamp_utc`: `(now() AT TIME ZONE 'UTC')`, strictly converted to UTC.
* `current_kolkata_wall_time`: `(now() AT TIME ZONE 'Asia/Kolkata')`, wall-clock time in India.
* `current_kolkata_calendar_date`: `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)`.

### 5.2 Date Calculation Formula in Functions (`Section 3`)
Inspect the definition of `public.get_daily_rashi_insight` and `public.admin_list_daily_rashi_insights`:

#### Correct Formula (HARDENED):
```sql
v_today_ist := ((now() AT TIME ZONE 'Asia/Kolkata')::DATE);
```
* **Semantics:** `now()` is a universal `TIMESTAMPTZ` instant. Shifting it with `AT TIME ZONE 'Asia/Kolkata'` renders the wall-clock timestamp in India (`UTC + 5:30`). Casting to `::DATE` yields the exact Indian calendar date regardless of the server's session timezone. **PASS.**

#### Defective Formula (LEGACY / FLAWED):
```sql
v_today_ist := CURRENT_DATE AT TIME ZONE 'Asia/Kolkata';
-- or:
v_today_ist := (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::DATE;
```
* **Semantics:** `CURRENT_DATE` evaluates the date in the session timezone (UTC). Between 00:00 AM and 05:30 AM IST (18:30 to 23:59 UTC), `CURRENT_DATE` returns yesterday's UTC date. Shifting that date to Kolkata keeps it stuck on yesterday until 05:30 AM IST. **FAIL.**

### 5.3 NULL-Date Defaults and Future-Date Guards
1. **`get_daily_rashi_insight` (Customer Reader):**
   * **NULL Default:** Must set `IF p_insight_date IS NULL THEN p_insight_date := v_today_ist; END IF;`.
   * **Future Date Guard:** Must enforce:
     ```sql
     IF NOT v_is_admin AND p_insight_date > v_today_ist THEN
         RETURN jsonb_build_object('success', false, 'is_entitled', v_is_entitled, 'error', 'Future insights are not available.');
     END IF;
     ```
2. **`admin_list_daily_rashi_insights` (Admin Matrix):**
   * **NULL Default:** Must set `IF p_insight_date IS NULL THEN p_insight_date := ((now() AT TIME ZONE 'Asia/Kolkata')::DATE); END IF;`.
   * **Explicit Date:** When an administrator supplies an explicit past or future date, it must query that exact date without rejecting it.
3. **`admin_save_daily_rashi_insight` (Editorial Save):**
   * **Future Dates Permitted:** Confirm that `admin_save_daily_rashi_insight` does **NOT** reject future dates. Administrators must be able to stage horoscopes for tomorrow or next week in advance.

---

## 6. RLS Policies & Table Configuration Guide

When reviewing **Section 5 and Section 6**, evaluate table permissions and row-level security:

### 6.1 Table RLS Status (`Section 5`)
* **`rls_enabled`:** Must be **`TRUE`** (`relrowsecurity = true`).
* **`rls_forced`:** Typically `FALSE` in Supabase unless explicitly configured.
* **Direct Table Grants:**
  - `anon_can_select`: Typically `TRUE` in Supabase (governed by RLS policies).
  - `anon_can_insert`, `anon_can_update`, `anon_can_delete`: Must be **`FALSE`**.

### 6.2 Complete Policy Inventory (`Section 6`)

> [!WARNING]
> Do NOT assume that `daily_rashi_insights_select_customer` is the only policy!  
> In PostgreSQL, if multiple `PERMISSIVE` policies exist for the same command (`SELECT`), access is granted if **ANY** policy evaluates to true. A shadow or legacy policy (e.g. `allow_all_read`) would completely nullify subscription and date protections.

Review all policies returned:

#### Policy 1: Customer SELECT Policy (`daily_rashi_insights_select_customer`)
Inspect `using_expression`. Confirm it enforces:
1. `status = 'published'::public.astrology_content_status`
2. `insight_date <= ((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` (Date boundary protection)
3. Either `public.is_admin()` OR an active subscription check (`EXISTS (SELECT 1 FROM astrology_subscriptions ...)`).

#### Policy 2: Admin Policy (`daily_rashi_insights_all_admin`)
* Command: `ALL`
* `USING` and `WITH CHECK`: Must both enforce `public.is_admin()`.

#### Shadow Policy Check:
* Record every additional or unexpected policy. Inspect its `cmd` (command), target `roles`, permissive/restrictive mode, and predicates.
* Verify that **NO other policy** exists on `public.daily_rashi_insights` granting unrestricted `SELECT` or `ALL` access to `PUBLIC` or `anon`.

---

## 7. Migration Ledger Interpretation Guide

Section 8 contains an optional inspection of `supabase_migrations.schema_migrations`:

### Step 8A Execution:
Execute the relation check query first:
```sql
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_ledger_relation;
```
* **If result is NULL:** The table does not exist in this environment. **Skip Step 8B completely.** Continue with the catalog results from Sections 1–6.
* **If result is `'supabase_migrations.schema_migrations'`:** The table exists. You may execute Step 8B.

### Step 8B Filtering:
Query 8B uses exact repository version numbers and filenames from the Feature 02 range:
* Versions: `'045'`, `'046'`, `'047'`, `'048'`, `'049'`, `'050'`, `'051'`, `'052'`, `'053'`, `'054'`, `'055'`.
* Names: `045_daily_vedic_astrology_insights` through `055_decouple_plan_deactivation_from_entitlements`.

### How to Weight Ledger Evidence:
* If Migration 047 (or 049/050) is recorded in the ledger, this is **supporting evidence** that a migration script was run.
* However, ledger evidence is **subordinate** to the actual catalog output in Sections 3–6. If manual DDL, schema resets, or uncommitted edits occurred, the catalog output in Section 3 is the authoritative truth.
* **Do NOT choose a corrective migration based solely on ledger versions.** First establish the exact deployed signatures and definitions from Section 3.

---

## 8. Incident Response & Safety Protocol

> [!CAUTION]
> **NO PRODUCTION MUTATION OR MIGRATION AUTHORIZED:**  
> The verification script (`KASHIVEDA_FEATURE_02_READ_ONLY_PRODUCTION_VERIFICATION.sql`) is strictly read-only and **does NOT authorize any production mutation, schema change, or migration application**. Findings AST-R01 and AST-R02 remain formally **UNVERIFIED** until actual production catalog evidence has been reviewed.

If the operator's inspection reveals that production contains an unhardened authorization guard, legacy date boundary logic, unrevoked execution privileges, or unexpected overloads:

```
                  Inspection Output Reviewed
                              │
             Is any function or policy flawed?
                              │
              ┌───────────────┴───────────────┐
             YES                              NO
              │                               │
              ▼                               ▼
    ┌───────────────────┐           ┌───────────────────┐
    │  DO NOT PROBE OR  │           │ All Checks Pass:  │
    │  EXPLOIT THE RPC  │           │ Submit Findings   │
    └───────────────────┘           │ for Review        │
              │                     └───────────────────┘
              ▼
    ┌───────────────────┐
    │  Preserve Complete│
    │  Catalog Proof    │
    └───────────────────┘
              │
              ▼
    ┌───────────────────┐
    │ Compare Deployed  │
    │ vs Local HEAD     │
    └───────────────────┘
              │
              ▼
    ┌───────────────────┐
    │ Author Tailored   │
    │ Forward Fix & Test│
    └───────────────────┘
```

### Safe Corrective Procedure:
1. **Preserve Complete Read-Only Catalog Results:** Retain and archive the complete read-only catalog query outputs from Sections 1 through 8, ensuring all function definitions (`pg_get_functiondef`) and RLS policy expressions are preserved in full.
2. **Inspect Every Relevant Overload:** Inspect every relevant overload and its actual authorization guard, date logic, owner, security mode (`SECURITY DEFINER`), search path, and effective permissions.
3. **Identify Exact Differences:** Identify the exact differences between production and the intended local definitions.
4. **Prepare Tailored Forward-Only Migration or Plan:** If a defect is confirmed, prepare a separate, forward-only corrective migration or controlled redeployment plan that explicitly accommodates the actual deployed signatures and existing functionality (do not apply historical migrations 047 or 050 based solely on parameter count or feature version).
5. **Review and Test Separately:** Review and test that proposed corrective change separately in an isolated staging environment before any authorized production deployment.
6. **Zero Production Exploit Testing:** Operators must not introduce production exploit testing or invoke application RPCs to test vulnerabilities.

---

## 9. Operator Sign-Off Template

After completing the execution of `KASHIVEDA_FEATURE_02_READ_ONLY_PRODUCTION_VERIFICATION.sql`, the authorized operator should fill out the sign-off table below and commit it to project documentation:

```markdown
### Production Catalog Inspection Sign-Off

**Operator Name:** ______________________________________  
**Execution Timestamp:** ________________________________  
**Supabase Project Ref:** _______________________________  
**Connected Database:** _________________________________  
**Session Timezone:** ___________________________________  

| Audit Target | Inspection Checkpoint | Observed Catalog Result | Status (PASS / FAIL / REVIEW) |
| :--- | :--- | :--- | :--- |
| **Schema** | Schema `public` USAGE for `anon` | [ TRUE / FALSE ] | ____________ |
| **AST-R01** | `admin_save_daily_rashi_insight` Overload Count | [ 1 / Multiple: Specify ] | ____________ |
| **AST-R01** | `admin_save_daily_rashi_insight` Identity Signature | [ 12 / 13 / 14 params ] | ____________ |
| **AST-R01** | `admin_save` Authorization Guard Text | [ Strict `IS NULL OR NOT` / Vulnerable ] | ____________ |
| **AST-R01** | `admin_save` Execution Privileges (`anon_can_execute`) | [ FALSE / TRUE ] | ____________ |
| **AST-R01** | `admin_list_daily_rashi_insights` Guard Text | [ Strict `IS NULL OR NOT` / Vulnerable ] | ____________ |
| **AST-R01** | `admin_list` Execution Privileges (`anon_can_execute`) | [ FALSE / TRUE ] | ____________ |
| **AST-R02** | `get_daily_rashi_insight` Date Expression | [ `now() AT TIME ZONE` / `CURRENT_DATE` ] | ____________ |
| **AST-R02** | `admin_list_daily_rashi_insights` Date Expression | [ `now() AT TIME ZONE` / `CURRENT_DATE` ] | ____________ |
| **AST-R02** | Customer RLS Date Restriction Expression | [ `now() AT TIME ZONE` / `CURRENT_DATE` ] | ____________ |
| **Table** | `daily_rashi_insights` RLS Enabled | [ TRUE / FALSE ] | ____________ |
| **Table** | Shadow / Unexpected Policies Present | [ NONE / List names ] | ____________ |
| **Ledger** | Relation Check `to_regclass` Result | [ Relation Name / NULL ] | ____________ |
| **Ledger** | Highest Migration Recorded | [ Specify version or N/A ] | ____________ |

**Final Recommendation:**  
[ ] Deployed production state verified as HARDENED. Close AST-R01 and AST-R02.  
[ ] Deployed production state exhibits defect or inconsistency. Escalate for controlled remediation.  
```

---
*Guide prepared autonomously by Antigravity under KashiVeda Production Engineering Standards.*
