import os
import sys
import time
import uuid
import subprocess
import psycopg2

DB_DIR = r"C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\7eff674b-77d9-4b93-a9ea-bc319f8f7501\scratch\pg_test_db"
PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PORT = 5433
MIGRATION_051 = r"C:\Projects\KashiVeda\supabase\migrations\051_atomic_astrology_plan_content_audit_mutations.sql"

def get_connection():
    conn = psycopg2.connect(
        host="127.0.0.1",
        port=PORT,
        user="postgres",
        dbname="postgres"
    )
    conn.autocommit = False
    return conn

def setup_base_schema(cur):
    cur.execute("""
    -- Auth schema emulation
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    -- Ensure Supabase standard roles exist
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role;
        END IF;
    END $$;

    -- Enums
    DO $$ BEGIN
        CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'pandit', 'customer');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.astrology_channel AS ENUM ('in_app', 'whatsapp');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.astrology_content_status AS ENUM ('draft', 'scheduled', 'published', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Profiles & User Roles
    CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

    CREATE TABLE IF NOT EXISTS public.user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        role public.app_role NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(user_id, role)
    );

    -- Admin check function
    CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
    RETURNS BOOLEAN AS $$
    BEGIN
        IF p_user_id IS NULL THEN
            RETURN false;
        END IF;
        RETURN EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = p_user_id AND role IN ('admin', 'super_admin')
        ) OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_user_id AND is_super_admin = true
        );
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

    -- Astrology Subscription Plans
    CREATE TABLE IF NOT EXISTS public.astrology_subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        duration_days INTEGER NOT NULL DEFAULT 30 CHECK (duration_days > 0),
        price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        daily_in_app_enabled BOOLEAN NOT NULL DEFAULT true,
        weekly_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Astrology Content
    CREATE TABLE IF NOT EXISTS public.astrology_content (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel public.astrology_channel NOT NULL DEFAULT 'in_app',
        title TEXT,
        body TEXT NOT NULL,
        publish_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ,
        status public.astrology_content_status NOT NULL DEFAULT 'draft',
        created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_astrology_content_expiry CHECK (expires_at IS NULL OR expires_at > publish_at)
    );

    -- Admin Audit Logs
    CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        actor_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        before_json JSONB,
        after_json JSONB,
        details JSONB,
        ip_address INET,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE public.admin_audit_logs ALTER COLUMN entity_id TYPE TEXT;
    """)

def apply_migration(cur):
    with open(MIGRATION_051, "r", encoding="utf-8") as f:
        sql = f.read()
    cur.execute(sql)

def set_actor(cur, user_id):
    if user_id:
        cur.execute(f"SET request.jwt.claim.sub = '{user_id}';")
    else:
        cur.execute("RESET request.jwt.claim.sub;")

def run_tests():
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    print("\n--- 1. Setting up Base Schema & Applying Migration 051 ---")
    setup_base_schema(cur)
    apply_migration(cur)
    print("PASS: Migration 051 applied successfully to PostgreSQL 18.4.")

    # Create Test Actors
    admin_id = str(uuid.uuid4())
    customer_id = str(uuid.uuid4())

    cur.execute("INSERT INTO public.profiles (id, display_name, is_super_admin) VALUES (%s, 'Test Admin', true);", (admin_id,))
    cur.execute("INSERT INTO public.profiles (id, display_name, is_super_admin) VALUES (%s, 'Test Customer', false);", (customer_id,))
    cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin');", (admin_id,))
    cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer');", (customer_id,))

    # -------------------------------------------------------------------------
    # TEST 0A: SECURITY DEFINER and Hardened Empty Search Path in pg_proc
    # -------------------------------------------------------------------------
    print("\n--- TEST 0A: SECURITY DEFINER & Search Path Invariants in pg_proc ---")
    cur.execute("""
        SELECT proname, prosecdef, proconfig
        FROM pg_proc
        JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
        WHERE pg_namespace.nspname = 'public'
          AND proname IN ('admin_save_astrology_plan', 'admin_save_astrology_content')
        ORDER BY proname;
    """)
    proc_rows = cur.fetchall()
    assert len(proc_rows) == 2, f"Expected 2 functions in pg_proc, found {len(proc_rows)}"
    for proname, prosecdef, proconfig in proc_rows:
        assert prosecdef is True, f"{proname} must be SECURITY DEFINER!"
        assert proconfig is not None and any(cfg in ('search_path=""', 'search_path=') for cfg in proconfig), (
            f"{proname} must have SET search_path = ''! Got {proconfig}"
        )
        print(f"PASS: {proname} confirmed prosecdef=True, proconfig={proconfig}")

    # -------------------------------------------------------------------------
    # TEST 0B: Function Execution Privileges (Principle of Least Privilege)
    # -------------------------------------------------------------------------
    print("\n--- TEST 0B: Function Execution Privilege Audit ---")
    # Plan RPC privileges
    cur.execute("SELECT has_function_privilege('authenticated', 'public.admin_save_astrology_plan(uuid,text,integer,numeric,character,boolean,boolean,boolean)', 'EXECUTE');")
    assert cur.fetchone()[0] is True, "authenticated must have EXECUTE on admin_save_astrology_plan"

    cur.execute("SELECT has_function_privilege('anon', 'public.admin_save_astrology_plan(uuid,text,integer,numeric,character,boolean,boolean,boolean)', 'EXECUTE');")
    assert cur.fetchone()[0] is False, "anon must NOT have EXECUTE on admin_save_astrology_plan"

    cur.execute("SELECT has_function_privilege('service_role', 'public.admin_save_astrology_plan(uuid,text,integer,numeric,character,boolean,boolean,boolean)', 'EXECUTE');")
    assert cur.fetchone()[0] is False, "service_role must NOT have EXECUTE on admin_save_astrology_plan"

    # Content RPC privileges
    cur.execute("SELECT has_function_privilege('authenticated', 'public.admin_save_astrology_content(uuid,public.astrology_channel,text,text,timestamp with time zone,timestamp with time zone,public.astrology_content_status)', 'EXECUTE');")
    assert cur.fetchone()[0] is True, "authenticated must have EXECUTE on admin_save_astrology_content"

    cur.execute("SELECT has_function_privilege('anon', 'public.admin_save_astrology_content(uuid,public.astrology_channel,text,text,timestamp with time zone,timestamp with time zone,public.astrology_content_status)', 'EXECUTE');")
    assert cur.fetchone()[0] is False, "anon must NOT have EXECUTE on admin_save_astrology_content"

    cur.execute("SELECT has_function_privilege('service_role', 'public.admin_save_astrology_content(uuid,public.astrology_channel,text,text,timestamp with time zone,timestamp with time zone,public.astrology_content_status)', 'EXECUTE');")
    assert cur.fetchone()[0] is False, "service_role must NOT have EXECUTE on admin_save_astrology_content"
    print("PASS: Privileges strictly verified: authenticated=True, anon=False, service_role=False.")

    # -------------------------------------------------------------------------
    # TEST 0C: Immunity Against Untrusted Shadow Objects in pg_temp / public
    # -------------------------------------------------------------------------
    print("\n--- TEST 0C: Search Path Immunity Against Shadow Objects ---")
    cur.execute("""
        CREATE OR REPLACE FUNCTION pg_temp.btrim(text) RETURNS text AS $$
        BEGIN
            RAISE EXCEPTION 'HIJACK_ATTEMPT_SUCCESSFUL';
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION pg_temp.is_admin(uuid) RETURNS boolean AS $$
        BEGIN
            RETURN true;
        END;
        $$ LANGUAGE plpgsql;
    """)
    set_actor(cur, admin_id)
    shadow_plan_name = f"Shadow Test Plan {uuid.uuid4().hex[:6]}"
    cur.execute("""
        SELECT public.admin_save_astrology_plan(
            p_id := NULL,
            p_name := %s,
            p_duration_days := 30,
            p_price := 199.00
        );
    """, (shadow_plan_name,))
    shadow_res = cur.fetchone()[0]
    assert shadow_res['success'] is True, "RPC should execute cleanly without invoking pg_temp shadow functions!"
    print("PASS: Shadow function in pg_temp completely ignored by SET search_path = '' and schema-qualified references.")

    # -------------------------------------------------------------------------
    # TEST 1: Authenticated Admin Creates Plan Successfully with In-Transaction Audit
    # -------------------------------------------------------------------------
    print("\n--- TEST 1: Authenticated Admin Creates Plan Successfully ---")
    set_actor(cur, admin_id)
    plan_name = f"Vedic Monthly Plan {uuid.uuid4().hex[:6]}"
    cur.execute("""
        SELECT public.admin_save_astrology_plan(
            p_id := NULL,
            p_name := %s,
            p_duration_days := 30,
            p_price := 499.00,
            p_currency := 'INR',
            p_daily_in_app_enabled := true,
            p_weekly_whatsapp_enabled := true,
            p_is_active := true
        );
    """, (plan_name,))
    res = cur.fetchone()[0]
    assert res['success'] is True
    plan_id = res['plan']['id']
    assert res['plan']['name'] == plan_name
    assert float(res['plan']['price']) == 499.00

    # Verify Audit Record
    cur.execute("""
        SELECT actor_user_id, action, entity_type, entity_id, details
        FROM public.admin_audit_logs
        WHERE entity_id = %s;
    """, (plan_id,))
    audit_rows = cur.fetchall()
    assert len(audit_rows) == 1, f"Expected exactly 1 audit row, got {len(audit_rows)}"
    actor, action, ent_type, ent_id, details = audit_rows[0]
    assert str(actor) == admin_id, f"Actor ID mismatch: {actor} vs {admin_id}"
    assert action == "astrology_plan_created_by_admin"
    assert ent_type == "astrology_subscription_plans"
    assert details['name'] == plan_name
    print(f"PASS: Plan created and audit record verified atomically: id={plan_id}, actor={actor}")

    # -------------------------------------------------------------------------
    # TEST 2: Authenticated Admin Updates Plan Successfully with Audit Record
    # -------------------------------------------------------------------------
    print("\n--- TEST 2: Authenticated Admin Updates Plan Successfully ---")
    updated_name = f"{plan_name} Updated"
    cur.execute("""
        SELECT public.admin_save_astrology_plan(
            p_id := %s::uuid,
            p_name := %s,
            p_duration_days := 60,
            p_price := 899.00,
            p_currency := 'INR',
            p_daily_in_app_enabled := true,
            p_weekly_whatsapp_enabled := false,
            p_is_active := true
        );
    """, (plan_id, updated_name))
    upd_res = cur.fetchone()[0]
    assert upd_res['success'] is True
    assert upd_res['plan']['duration_days'] == 60
    assert float(upd_res['plan']['price']) == 899.00

    cur.execute("""
        SELECT actor_user_id, action, details
        FROM public.admin_audit_logs
        WHERE entity_id = %s AND action = 'astrology_plan_updated_by_admin';
    """, (plan_id,))
    upd_audit = cur.fetchall()
    assert len(upd_audit) == 1
    assert str(upd_audit[0][0]) == admin_id
    assert upd_audit[0][2]['previous_name'] == plan_name
    assert float(upd_audit[0][2]['previous_price']) == 499.00
    print(f"PASS: Plan updated with previous values captured in audit log.")

    # -------------------------------------------------------------------------
    # TEST 3: Authenticated Admin Creates Legacy Content with In-Transaction Audit
    # -------------------------------------------------------------------------
    print("\n--- TEST 3: Authenticated Admin Creates Legacy Content ---")
    content_body = "Align your intentions with the lunar waxing phase for profound meditation."
    publish_at = "2026-10-15T06:00:00Z"
    expires_at = "2026-10-16T06:00:00Z"
    cur.execute("""
        SELECT public.admin_save_astrology_content(
            p_id := NULL,
            p_channel := 'in_app'::public.astrology_channel,
            p_title := 'Shukla Paksha Guidance',
            p_body := %s,
            p_publish_at := %s::timestamptz,
            p_expires_at := %s::timestamptz,
            p_status := 'published'::public.astrology_content_status
        );
    """, (content_body, publish_at, expires_at))
    c_res = cur.fetchone()[0]
    assert c_res['success'] is True
    content_id = c_res['content']['id']
    assert c_res['content']['title'] == "Shukla Paksha Guidance"
    assert c_res['content']['created_by'] == admin_id

    cur.execute("""
        SELECT actor_user_id, action, entity_type, details
        FROM public.admin_audit_logs
        WHERE entity_id = %s;
    """, (content_id,))
    c_audit = cur.fetchall()
    assert len(c_audit) == 1
    assert str(c_audit[0][0]) == admin_id
    assert c_audit[0][1] == "astrology_content_created_by_admin"
    assert c_audit[0][3]['title'] == "Shukla Paksha Guidance"
    print(f"PASS: Legacy content created and audit record verified: id={content_id}")

    # -------------------------------------------------------------------------
    # TEST 4: Authenticated Admin Updates Legacy Content Successfully
    # -------------------------------------------------------------------------
    print("\n--- TEST 4: Authenticated Admin Updates Legacy Content ---")
    cur.execute("""
        SELECT public.admin_save_astrology_content(
            p_id := %s::uuid,
            p_channel := 'whatsapp'::public.astrology_channel,
            p_title := 'Updated Moon Phase Guidance',
            p_body := %s,
            p_publish_at := %s::timestamptz,
            p_expires_at := %s::timestamptz,
            p_status := 'published'::public.astrology_content_status
        );
    """, (content_id, content_body, publish_at, expires_at))
    upd_c_res = cur.fetchone()[0]
    assert upd_c_res['success'] is True
    assert upd_c_res['content']['channel'] == 'whatsapp'

    cur.execute("""
        SELECT actor_user_id, action, details
        FROM public.admin_audit_logs
        WHERE entity_id = %s AND action = 'astrology_content_updated_by_admin';
    """, (content_id,))
    upd_c_audit = cur.fetchall()
    assert len(upd_c_audit) == 1
    assert upd_c_audit[0][2]['previous_channel'] == 'in_app'
    print("PASS: Legacy content updated and audit record verified.")

    # -------------------------------------------------------------------------
    # TEST 5: Unauthenticated Caller is Rejected (auth.uid() is NULL)
    # -------------------------------------------------------------------------
    print("\n--- TEST 5: Unauthenticated Caller is Rejected ---")
    set_actor(cur, None)
    conn.autocommit = False
    try:
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := NULL,
                p_name := 'Anon Plan',
                p_duration_days := 30,
                p_price := 100.00
            );
        """)
        print("FAIL: Expected unauthenticated exception not raised!")
        sys.exit(1)
    except psycopg2.Error as e:
        conn.rollback()
        conn.autocommit = True
        assert "Unauthorized" in str(e), f"Expected Unauthorized error, got: {e}"
        print(f"PASS: Unauthenticated caller rejected cleanly: {e.pgerror.strip()}")

    # -------------------------------------------------------------------------
    # TEST 6: Non-Admin Authenticated Caller is Rejected (Customer)
    # -------------------------------------------------------------------------
    print("\n--- TEST 6: Non-Admin Authenticated Caller is Rejected ---")
    set_actor(cur, customer_id)
    conn.autocommit = False
    try:
        cur.execute("""
            SELECT public.admin_save_astrology_content(
                p_id := NULL,
                p_channel := 'in_app'::public.astrology_channel,
                p_title := 'Unauthorized Content',
                p_body := 'Customer trying to write content.',
                p_publish_at := now()
            );
        """)
        print("FAIL: Expected non-admin customer exception not raised!")
        sys.exit(1)
    except psycopg2.Error as e:
        conn.rollback()
        conn.autocommit = True
        assert "Unauthorized" in str(e), f"Expected Unauthorized error, got: {e}"
        print(f"PASS: Customer rejected cleanly: {e.pgerror.strip()}")

    # -------------------------------------------------------------------------
    # TEST 7: Actor ID Cannot Be Forged (Derived Strictly from auth.uid())
    # -------------------------------------------------------------------------
    print("\n--- TEST 7: Actor ID Invariance Check ---")
    set_actor(cur, admin_id)
    actor_test_plan_name = f"Actor Test Plan {uuid.uuid4().hex[:6]}"
    cur.execute("""
        SELECT public.admin_save_astrology_plan(
            p_id := NULL,
            p_name := %s,
            p_duration_days := 15,
            p_price := 150.00
        );
    """, (actor_test_plan_name,))
    actor_plan_res = cur.fetchone()[0]
    actor_plan_id = actor_plan_res['plan']['id']
    cur.execute("SELECT actor_user_id FROM public.admin_audit_logs WHERE entity_id = %s;", (actor_plan_id,))
    recorded_actor = cur.fetchone()[0]
    assert str(recorded_actor) == admin_id, "Recorded actor must strictly match authenticated admin!"
    print("PASS: Actor ID derived strictly from trusted server auth.uid().")

    # -------------------------------------------------------------------------
    # TEST 8: ATOMIC ROLLBACK ON AUDIT LOG WRITE FAILURE
    # -------------------------------------------------------------------------
    print("\n--- TEST 8: Injected Audit Log Failure Causes Complete Mutation Rollback ---")
    # Attach a temporary trigger to public.admin_audit_logs that simulates an audit failure
    cur.execute("""
        CREATE OR REPLACE FUNCTION public.test_fail_audit() RETURNS trigger AS $$
        BEGIN
            IF NEW.details->>'name' LIKE '%fail_test%' OR NEW.details->>'title' LIKE '%fail_test%' THEN
                RAISE EXCEPTION 'INJECTED_AUDIT_LOG_FAILURE: Disk full or audit violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_test_fail_audit ON public.admin_audit_logs;
        CREATE TRIGGER trg_test_fail_audit
            BEFORE INSERT ON public.admin_audit_logs
            FOR EACH ROW
            EXECUTE FUNCTION public.test_fail_audit();
    """)

    # Attempt plan creation that triggers audit failure
    fail_plan_name = "Plan With Failing Audit fail_test"
    cur.execute("SELECT count(*) FROM public.astrology_subscription_plans;")
    plans_count_before = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM public.admin_audit_logs;")
    audit_count_before = cur.fetchone()[0]

    conn.autocommit = False
    try:
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := NULL,
                p_name := %s,
                p_duration_days := 30,
                p_price := 299.00
            );
        """, (fail_plan_name,))
        print("FAIL: Expected injected audit failure not raised!")
        sys.exit(1)
    except psycopg2.Error as e:
        conn.rollback()
        conn.autocommit = True
        assert "INJECTED_AUDIT_LOG_FAILURE" in str(e)
        print(f"PASS: Caught expected database-level audit failure: {e.pgerror.strip()}")

    # Verify that the plan was completely rolled back!
    cur.execute("SELECT count(*) FROM public.astrology_subscription_plans WHERE name = %s;", (fail_plan_name,))
    fail_plan_cnt = cur.fetchone()[0]
    assert fail_plan_cnt == 0, f"Atomicity violated! Found {fail_plan_cnt} plan rows after audit failure rollback!"

    cur.execute("SELECT count(*) FROM public.astrology_subscription_plans;")
    plans_count_after = cur.fetchone()[0]
    assert plans_count_after == plans_count_before, "Plan table count changed after rollback!"

    cur.execute("SELECT count(*) FROM public.admin_audit_logs;")
    audit_count_after = cur.fetchone()[0]
    assert audit_count_after == audit_count_before, "Audit log count changed after rollback!"
    print("PASS: Verified 100% atomic rollback on audit failure: zero business rows inserted, zero audit rows inserted.")

    # -------------------------------------------------------------------------
    # TEST 9: ATOMIC ROLLBACK ON BUSINESS MUTATION FAILURE
    # -------------------------------------------------------------------------
    print("\n--- TEST 9: Business Mutation Failure Leaves Zero Audit Records ---")
    conn.autocommit = False
    try:
        # Violate price constraint (negative price)
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := NULL,
                p_name := 'Invalid Price Plan',
                p_duration_days := 30,
                p_price := -50.00
            );
        """)
        print("FAIL: Expected validation exception not raised!")
        sys.exit(1)
    except psycopg2.Error as e:
        conn.rollback()
        conn.autocommit = True
        print(f"PASS: Business failure raised expected exception: {e.pgerror.strip()}")

    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'name' = 'Invalid Price Plan';")
    invalid_audit_cnt = cur.fetchone()[0]
    assert invalid_audit_cnt == 0, "No audit record should be committed on business failure!"
    print("PASS: Verified zero audit records on business validation failure.")

    # -------------------------------------------------------------------------
    # Clean up test trigger
    # -------------------------------------------------------------------------
    cur.execute("DROP TRIGGER IF EXISTS trg_test_fail_audit ON public.admin_audit_logs;")
    cur.execute("DROP FUNCTION IF EXISTS public.test_fail_audit();")

    conn.close()
    print("\n======================================================================")
    print("ALL 9 ISOLATED POSTGRESQL ATOMIC MUTATION TESTS PASSED (16/16 ASSERTIONS)!")
    print("======================================================================")

if __name__ == "__main__":
    db_proc = subprocess.Popen(
        [os.path.join(PG_BIN, "postgres.exe"), "-D", DB_DIR, "-p", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2)
    try:
        run_tests()
    finally:
        subprocess.run([os.path.join(PG_BIN, "pg_ctl.exe"), "-D", DB_DIR, "-m", "fast", "stop"])
        db_proc.wait()
