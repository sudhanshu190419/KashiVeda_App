-- =============================================================================
-- KASHIVEDA — FEATURE 02 PRODUCTION RUNTIME VERIFICATION SCRIPT (READ-ONLY)
-- Target Advisory References: AST-R01 & AST-R02
-- Target Domain: Daily Vedic Astrology Insights & Subscriptions
-- Execution Target: Supabase Dashboard SQL Editor (Authorized DBA / Operator)
-- Safety Classification: STRICTLY READ-ONLY (No Procedural Blocks, No DDL, No DML, No RPC Invocation)
-- =============================================================================
--
-- OPERATOR NOTICE:
-- This script contains only pure SELECT queries inspecting PostgreSQL system catalogs
-- (pg_proc, pg_class, pg_policies, pg_namespace, pg_roles, information_schema).
-- It contains NO procedural DO blocks, NO data modification (DML), NO schema modification (DDL),
-- NO configuration alterations, and NO function-invocation tests against application RPCs.
-- It does NOT retrieve customer horoscope records or personal data.
--
-- INSTRUCTIONS FOR AUTHORIZED DATABASE ADMINISTRATOR:
-- 1. Open your browser and navigate to the Supabase Dashboard.
-- 2. Confirm you are in the correct production project before executing queries.
-- 3. Open the SQL Editor and execute each numbered section below.
-- 4. Export or copy the complete tabular output for review according to the
--    accompanying guide: KASHIVEDA_FEATURE_02_READ_ONLY_PRODUCTION_VERIFICATION_GUIDE.md.
-- =============================================================================


-- =============================================================================
-- SECTION 1: DATABASE ENVIRONMENT & TIMEZONE CONTEXT
-- Purpose: Record the connected database, database user, PostgreSQL version,
--          active session timezone, and both session-rendered and explicit UTC/IST timestamps.
-- =============================================================================

SELECT 
    current_database() AS connected_database,
    current_user AS connected_user,
    current_setting('TimeZone') AS server_session_timezone,
    version() AS postgres_engine_version,
    now() AS session_transaction_timestamp,
    (now() AT TIME ZONE 'UTC') AS server_transaction_timestamp_utc,
    (now() AT TIME ZONE 'Asia/Kolkata') AS current_kolkata_wall_time,
    ((now() AT TIME ZONE 'Asia/Kolkata')::DATE) AS current_kolkata_calendar_date;


-- =============================================================================
-- SECTION 2: SCHEMA-LEVEL PRIVILEGES ON 'public'
-- Purpose: Inspect schema ownership, stored schema ACLs, and effective USAGE
--          privileges on schema 'public' for core Supabase roles.
--
-- NOTE:
-- In PostgreSQL, executing a function requires BOTH USAGE on the containing schema
-- AND EXECUTE on the specific function. Both layers must be audited together.
-- =============================================================================

SELECT
    n.nspname AS schema_name,
    pg_get_userbyid(n.nspowner) AS schema_owner,
    n.nspacl::text AS schema_acl,
    -- Effective USAGE privileges
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_schema_privilege('anon', n.nspname, 'usage') ELSE NULL END AS anon_has_schema_usage,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_schema_privilege('authenticated', n.nspname, 'usage') ELSE NULL END AS authenticated_has_schema_usage,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
         THEN has_schema_privilege('service_role', n.nspname, 'usage') ELSE NULL END AS service_role_has_schema_usage,
    -- Effective CREATE privileges (defensive check)
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_schema_privilege('anon', n.nspname, 'create') ELSE NULL END AS anon_has_schema_create,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_schema_privilege('authenticated', n.nspname, 'create') ELSE NULL END AS authenticated_has_schema_create
FROM pg_namespace n
WHERE n.nspname = 'public';


-- =============================================================================
-- SECTION 3 (PART A): FUNCTION CATALOG & OVERLOAD INSPECTION (AST-R01 & AST-R02)
-- Purpose: Inspect every deployed overload of the privileged and public Daily Astrology
--          RPCs in schema 'public'.
--
-- Evaluates:
-- 1. Identity signatures, arguments, and return types (detects old/duplicate overloads).
-- 2. Function owner, SECURITY DEFINER status, and runtime search_path configuration.
-- 3. Stored ACLs and effective EXECUTE permissions for anon, authenticated, and service_role.
-- 4. Complete function definition text (pg_get_functiondef) for human review of:
--    - AST-R01: Strict null-caller check (auth.uid() IS NULL OR NOT is_admin)
--    - AST-R01: Preservation of authoritative audit logging
--    - AST-R02: Date calculation formula ((now() AT TIME ZONE 'Asia/Kolkata')::DATE)
--    - AST-R02: NULL-date defaults and customer future-date rejection guards
-- =============================================================================

SELECT
    p.oid AS function_oid,
    n.nspname AS schema_name,
    p.proname AS function_name,
    p.oid::regprocedure::text AS identity_signature,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_function_result(p.oid) AS return_type,
    pg_get_userbyid(p.proowner) AS function_owner,
    p.prosecdef AS is_security_definer,
    p.provolatile AS volatility_code, -- 'i' = immutable, 's' = stable, 'v' = volatile
    p.proconfig AS runtime_settings,   -- e.g. ['search_path=public, auth, pg_temp']
    p.proacl::text AS stored_acl,
    -- Effective EXECUTE privileges for core roles
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_function_privilege('anon', p.oid, 'execute') ELSE NULL END AS anon_can_execute,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_function_privilege('authenticated', p.oid, 'execute') ELSE NULL END AS authenticated_can_execute,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
         THEN has_function_privilege('service_role', p.oid, 'execute') ELSE NULL END AS service_role_can_execute,
    -- Complete deployed definition text for authoritative review
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'admin_save_daily_rashi_insight',
      'admin_list_daily_rashi_insights',
      'get_daily_rashi_insight'
  )
ORDER BY p.proname, identity_signature;


-- =============================================================================
-- SECTION 4: ADMINISTRATIVE HELPER FUNCTION INSPECTION (AST-R01 DEPENDENCY)
-- Purpose: Inspect public.is_admin(UUID) to ensure the role-evaluation helper
--          relied upon by the Admin RPC guards is properly deployed, hardened
--          against unauthenticated probing, and runs with expected privileges.
-- =============================================================================

SELECT
    p.oid AS function_oid,
    p.oid::regprocedure::text AS identity_signature,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_function_result(p.oid) AS return_type,
    pg_get_userbyid(p.proowner) AS function_owner,
    p.prosecdef AS is_security_definer,
    p.proconfig AS runtime_settings,
    p.proacl::text AS stored_acl,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_function_privilege('anon', p.oid, 'execute') ELSE NULL END AS anon_can_execute,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_function_privilege('authenticated', p.oid, 'execute') ELSE NULL END AS authenticated_can_execute,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
         THEN has_function_privilege('service_role', p.oid, 'execute') ELSE NULL END AS service_role_can_execute,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_admin'
ORDER BY identity_signature;


-- =============================================================================
-- SECTION 5 (PART B): TABLE CATALOG CONFIGURATION & PERMISSIONS
-- Purpose: Inspect physical catalog configuration of public.daily_rashi_insights.
--
-- Evaluates:
-- 1. Whether Row-Level Security is actively enabled (relrowsecurity).
-- 2. Whether Row-Level Security is forced for table owners (relforcerowsecurity).
-- 3. Stored relation ACLs and effective SELECT/INSERT/UPDATE table privileges.
-- =============================================================================

SELECT
    c.oid AS table_oid,
    n.nspname AS schema_name,
    c.relname AS table_name,
    pg_get_userbyid(c.relowner) AS table_owner,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    c.relacl::text AS stored_table_acl,
    -- Effective direct table SELECT privileges
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_table_privilege('anon', c.oid, 'select') ELSE NULL END AS anon_can_select,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_table_privilege('authenticated', c.oid, 'select') ELSE NULL END AS authenticated_can_select,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
         THEN has_table_privilege('service_role', c.oid, 'select') ELSE NULL END AS service_role_can_select,
    -- Effective direct table INSERT privileges
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_table_privilege('anon', c.oid, 'insert') ELSE NULL END AS anon_can_insert,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_table_privilege('authenticated', c.oid, 'insert') ELSE NULL END AS authenticated_can_insert,
    -- Effective direct table UPDATE privileges
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_table_privilege('anon', c.oid, 'update') ELSE NULL END AS anon_can_update,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_table_privilege('authenticated', c.oid, 'update') ELSE NULL END AS authenticated_can_update,
    -- Effective direct table DELETE privileges
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_table_privilege('anon', c.oid, 'delete') ELSE NULL END AS anon_can_delete,
    CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_table_privilege('authenticated', c.oid, 'delete') ELSE NULL END AS authenticated_can_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'daily_rashi_insights';


-- =============================================================================
-- SECTION 6 (PART B): COMPLETE ROW-LEVEL SECURITY POLICY INVENTORY
-- Purpose: Retrieve ALL deployed policies on public.daily_rashi_insights.
--
-- IMPORTANT:
-- This query does NOT filter by policy name. Filtering by a pre-assumed policy name
-- is dangerous because it would conceal legacy, conflicting, or additional policies
-- that may override or compromise access boundaries.
-- =============================================================================

SELECT
    schemaname,
    tablename,
    policyname,
    permissive,                          -- 'PERMISSIVE' vs 'RESTRICTIVE'
    roles::text AS applicable_roles,     -- Array of target roles (e.g. {public}, {authenticated})
    cmd AS command,                      -- 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'
    qual AS using_expression,            -- Read/Row filtering predicate (USING expression)
    with_check AS with_check_expression  -- Write validation predicate (WITH CHECK expression)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'daily_rashi_insights'
ORDER BY policyname, cmd;


-- =============================================================================
-- SECTION 7 (PART C): CONVENIENCE HEURISTIC FLAGS (INDICATIVE ONLY)
-- Purpose: Quick diagnostic summary highlighting presence/absence of key security
--          and date patterns.
--
-- CAUTION TO OPERATOR:
-- These regex and substring flags are provided strictly as a high-level triage aid.
-- A substring match is NOT proof of security or correctness. The operator must
-- examine the complete definitions returned in Section 3 and Section 6.
-- =============================================================================

SELECT
    p.proname AS function_name,
    p.oid::regprocedure::text AS identity_signature,
    -- AST-R01 Guard Indicators
    CASE 
        WHEN pg_get_functiondef(p.oid) ~* 'v_admin_id\s+IS\s+NULL\s+OR\s+NOT\s+public\.is_admin' 
        THEN 'STRICT_NULL_GUARD_DETECTED'
        WHEN pg_get_functiondef(p.oid) ~* 'v_admin_id\s+IS\s+NOT\s+NULL\s+AND\s+NOT\s+public\.is_admin' 
        THEN 'FLAWED_NULL_BYPASS_GUARD_DETECTED'
        ELSE 'MANUAL_REVIEW_REQUIRED'
    END AS ast_r01_guard_heuristic,
    -- AST-R02 Date Expression Indicators
    CASE 
        WHEN pg_get_functiondef(p.oid) ~* 'now\(\)\s+AT\s+TIME\s+ZONE\s+''Asia/Kolkata''' 
        THEN 'CORRECT_NOW_AT_TIME_ZONE_DETECTED'
        WHEN pg_get_functiondef(p.oid) ~* 'CURRENT_DATE\s+AT\s+TIME\s+ZONE\s+''Asia/Kolkata''' 
        THEN 'LEGACY_CURRENT_DATE_AT_TIME_ZONE_DETECTED'
        WHEN pg_get_functiondef(p.oid) ~* 'CURRENT_DATE' 
        THEN 'BARE_CURRENT_DATE_DETECTED'
        ELSE 'NO_DIRECT_DATE_EXPRESSION'
    END AS ast_r02_date_heuristic
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'admin_save_daily_rashi_insight',
      'admin_list_daily_rashi_insights',
      'get_daily_rashi_insight'
  )
ORDER BY p.proname, identity_signature;


-- =============================================================================
-- SECTION 8 (PART D): OPTIONAL MIGRATION LEDGER EVIDENCE
-- Purpose: Check for migration tracking tables and retrieve applied versions.
--
-- REMINDER:
-- Migration ledger records are supporting evidence only. They indicate what migration
-- scripts ran in the past, but do NOT guarantee that subsequent manual DDL, schema
-- resets, or direct modifications did not alter the live definitions.
-- =============================================================================

-- Step 8A: Verify whether the Supabase migration ledger relation exists
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_ledger_relation;

-- Step 8B: Query applied migrations using exact repository versions and names
-- (Execute ONLY if Step 8A returns a non-null relation name; otherwise skip)
SELECT 
    version,
    name
FROM supabase_migrations.schema_migrations
WHERE version IN ('045', '046', '047', '048', '049', '050', '051', '052', '053', '054', '055')
   OR name IN (
       '045_daily_vedic_astrology_insights',
       '046_harden_is_admin_probing_guard',
       '047_harden_daily_astrology_admin_rpcs',
       '048_serialize_astrology_subscription_payments',
       '049_daily_astrology_optimistic_concurrency',
       '050_daily_astrology_csv_import_overwrite_guard',
       '051_atomic_astrology_plan_content_audit_mutations',
       '052_prevent_zero_price_astrology_plans',
       '053_freeze_astrology_subscription_duration_at_checkout',
       '054_reconcile_cancelled_astrology_subscription_payments',
       '055_decouple_plan_deactivation_from_entitlements'
   )
ORDER BY version ASC;

-- =============================================================================
-- END OF READ-ONLY PRODUCTION VERIFICATION SCRIPT
-- =============================================================================
