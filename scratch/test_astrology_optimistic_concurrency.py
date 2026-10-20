import os
import sys
import time
import uuid
import datetime
import threading
import subprocess
import psycopg2
import psycopg2.extras

DB_DIR = r"C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\7eff674b-77d9-4b93-a9ea-bc319f8f7501\scratch\pg_test_db"
PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PORT = 5433

def get_connection():
    conn = psycopg2.connect(
        host="127.0.0.1",
        port=PORT,
        user="postgres",
        dbname="postgres"
    )
    conn.autocommit = False
    return conn

def setup_schema():
    conn = psycopg2.connect(host="127.0.0.1", port=PORT, user="postgres", dbname="postgres")
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("""
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;
    """)

    # Create Supabase roles if they do not exist
    cur.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role;
        END IF;
    END
    $$;
    """)

    # Setup prerequisite enums, functions, and profiles table
    cur.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'astrology_content_status') THEN
            CREATE TYPE public.astrology_content_status AS ENUM ('draft', 'published', 'archived');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'astrology_subscription_status') THEN
            CREATE TYPE public.astrology_subscription_status AS ENUM ('active', 'expired', 'cancelled', 'payment_pending');
        END IF;
    END $$;

    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = now();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT,
        is_super_admin BOOLEAN DEFAULT false
    );

    CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
    RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public, auth, pg_temp
    AS $$
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_user_id AND is_super_admin = true
        );
    $$;

    CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id UUID NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id UUID,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.astrology_subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        duration_days INTEGER NOT NULL CHECK (duration_days > 0),
        price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        daily_in_app_enabled BOOLEAN NOT NULL DEFAULT true,
        weekly_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.astrology_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES public.profiles(id),
        plan_id UUID NOT NULL REFERENCES public.astrology_subscription_plans(id),
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        status public.astrology_subscription_status NOT NULL DEFAULT 'payment_pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_period CHECK (ends_at > starts_at)
    );
    """)

    # Read and apply Migration 045, 047, 049
    mig_045_path = r"supabase\migrations\045_daily_vedic_astrology_insights.sql"
    mig_047_path = r"supabase\migrations\047_harden_daily_astrology_admin_rpcs.sql"
    mig_049_path = r"supabase\migrations\049_daily_astrology_optimistic_concurrency.sql"

    with open(mig_045_path, 'r', encoding='utf-8') as f:
        mig_045_sql = f.read()
    with open(mig_047_path, 'r', encoding='utf-8') as f:
        mig_047_sql = f.read()
    with open(mig_049_path, 'r', encoding='utf-8') as f:
        mig_049_sql = f.read()

    # Execute Migration 045, 047, 049
    cur.execute(mig_045_sql)
    cur.execute(mig_047_sql)
    cur.execute(mig_049_sql)

    # Insert admin profile
    cur.execute("""
    INSERT INTO public.profiles (id, full_name, is_super_admin)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Admin Test User', true)
    ON CONFLICT (id) DO UPDATE SET is_super_admin = true;
    """)

    conn.close()
    print("[INIT] Database schema initialized with Migrations 045, 047, and 049.")

def call_save_insight(cursor, insight_date, rashi_id, rashi_name, language, general_outlook,
                      career_business=None, finance_wealth=None, love_relationships=None,
                      health_wellbeing=None, auspicious_color=None, auspicious_number=None,
                      status='draft', expected_version=None):
    cursor.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := %s::TEXT,
            p_language := %s::VARCHAR(5),
            p_general_outlook := %s::TEXT,
            p_career_business := %s::TEXT,
            p_finance_wealth := %s::TEXT,
            p_love_relationships := %s::TEXT,
            p_health_wellbeing := %s::TEXT,
            p_auspicious_color := %s::TEXT,
            p_auspicious_number := %s::INTEGER,
            p_status := %s::public.astrology_content_status,
            p_expected_version := %s::INTEGER
        );
    """, (insight_date, rashi_id, rashi_name, language, general_outlook,
          career_business, finance_wealth, love_relationships,
          health_wellbeing, auspicious_color, auspicious_number,
          status, expected_version))
    return cursor.fetchone()[0]

def run_tests():
    setup_schema()

    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    admin_id = str(uuid.uuid4())
    customer_id = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Super Admin', true);", (admin_id,))
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Regular Customer', false);", (customer_id,))

    def set_admin_session(c):
        cr = c.cursor()
        cr.execute(f"SET request.jwt.claim.sub = '{admin_id}';")

    def set_customer_session(c):
        cr = c.cursor()
        cr.execute(f"SET request.jwt.claim.sub = '{customer_id}';")

    today_str = "2026-10-15"

    print("\n======================================================================")
    print("STARTING AST-09 DATABASE-LEVEL OCC CONCURRENCY TEST SUITE")
    print("======================================================================")

    # -------------------------------------------------------------------------
    # TEST F: Valid create and update
    # -------------------------------------------------------------------------
    print("\n--- TEST F: Valid create and subsequent updates advance version ---")
    conn_f = get_connection()
    set_admin_session(conn_f)
    cur_f = conn_f.cursor()

    res_f1 = call_save_insight(
        cur_f, today_str, 1, 'Mesha', 'en',
        general_outlook='Initial general outlook for Mesha.',
        career_business='Initial career guidance.',
        status='draft',
        expected_version=None
    )
    conn_f.commit()

    assert res_f1['success'] is True, f"Creation failed: {res_f1}"
    assert res_f1['version'] == 1, f"Expected version 1, got {res_f1['version']}"

    # Update with expected_version = 1 -> advances to version 2
    res_f2 = call_save_insight(
        cur_f, today_str, 1, 'Mesha', 'en',
        general_outlook='Updated general outlook v2.',
        career_business='Updated career guidance v2.',
        status='draft',
        expected_version=1
    )
    conn_f.commit()

    assert res_f2['success'] is True, f"Update v2 failed: {res_f2}"
    assert res_f2['version'] == 2, f"Expected version 2, got {res_f2['version']}"

    # Update with expected_version = 2 -> advances to version 3
    res_f3 = call_save_insight(
        cur_f, today_str, 1, 'Mesha', 'en',
        general_outlook='Updated general outlook v3.',
        career_business='Updated career guidance v3.',
        status='published',
        expected_version=2
    )
    conn_f.commit()

    assert res_f3['success'] is True, f"Update v3 failed: {res_f3}"
    assert res_f3['version'] == 3, f"Expected version 3, got {res_f3['version']}"
    assert res_f3['status'] == 'published'
    conn_f.close()
    print("PASS: Test F passed. Row successfully created at v1 and advanced monotonically to v2 and v3.")

    # -------------------------------------------------------------------------
    # TEST A: Concurrent edits to different fields (Stale Write Rejected)
    # -------------------------------------------------------------------------
    print("\n--- TEST A: Concurrent edits to different fields (Stale Write Prevention) ---")
    date_a = "2026-10-16"
    set_admin_session(conn)
    # Setup initial row at v1
    call_save_insight(
        cur, date_a, 2, 'Vrishabha', 'en',
        general_outlook='Original general outlook.',
        career_business='Original career outlook.',
        status='draft',
        expected_version=None
    )

    # Editor A and Editor B both read version 1
    # Editor A updates career_business with expected_version 1
    conn_a = get_connection()
    set_admin_session(conn_a)
    cur_a = conn_a.cursor()
    res_a = call_save_insight(
        cur_a, date_a, 2, 'Vrishabha', 'en',
        general_outlook='Original general outlook.',
        career_business='Editor A new career guidance.',
        status='draft',
        expected_version=1
    )
    conn_a.commit()
    conn_a.close()

    assert res_a['success'] is True
    assert res_a['version'] == 2
    print(f"Editor A committed career edit -> row advanced to version {res_a['version']}")

    # Editor B attempts to save general_outlook using the original snapshot (expected_version: 1)
    conn_b = get_connection()
    set_admin_session(conn_b)
    cur_b = conn_b.cursor()
    res_b = call_save_insight(
        cur_b, date_a, 2, 'Vrishabha', 'en',
        general_outlook='Editor B new general outlook.',
        career_business='Original career outlook.', # Stale career value from snapshot!
        status='draft',
        expected_version=1 # Stale expected version!
    )
    conn_b.commit()
    conn_b.close()

    assert res_b['success'] is False, f"Editor B should have been rejected, got {res_b}"
    assert res_b['error_code'] == 'VERSION_CONFLICT', f"Expected VERSION_CONFLICT, got {res_b['error_code']}"
    assert res_b['current_version'] == 2, f"Expected current_version 2, got {res_b['current_version']}"
    print(f"Editor B stale write rejected with VERSION_CONFLICT: {res_b['error']}")

    # Verify that database row retains Editor A's career guidance and was NOT overwritten by B!
    cur.execute("SELECT general_outlook, career_business, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 2 AND language = 'en';", (date_a,))
    final_gen, final_car, final_ver = cur.fetchone()
    assert final_car == 'Editor A new career guidance.', f"Editor A's career was overwritten! Got: {final_car}"
    assert final_gen == 'Original general outlook.', f"General outlook should not have updated. Got: {final_gen}"
    assert final_ver == 2, f"Version should remain 2. Got: {final_ver}"
    print("PASS: Test A passed. Stale write cleanly rejected; Editor A's changes preserved without data loss.")

    # -------------------------------------------------------------------------
    # TEST B: Publish-versus-edit race
    # -------------------------------------------------------------------------
    print("\n--- TEST B: Publish-versus-edit race ---")
    date_b = "2026-10-17"
    # Initial row at v1
    call_save_insight(
        cur, date_b, 3, 'Mithuna', 'en',
        general_outlook='Mithuna general text.',
        health_wellbeing='Initial health advice.',
        status='draft',
        expected_version=None
    )

    # Publisher loads at v1. Before publisher submits, Editor modifies health advice at v1 -> advances to v2
    conn_editor = get_connection()
    set_admin_session(conn_editor)
    cur_ed = conn_editor.cursor()
    res_ed = call_save_insight(
        cur_ed, date_b, 3, 'Mithuna', 'en',
        general_outlook='Mithuna general text.',
        health_wellbeing='URGENT: Updated planetary health advisory.',
        status='draft',
        expected_version=1
    )
    conn_editor.commit()
    conn_editor.close()
    assert res_ed['success'] is True
    assert res_ed['version'] == 2

    # Publisher attempts publication using old snapshot (expected_version: 1)
    conn_pub = get_connection()
    set_admin_session(conn_pub)
    cur_pub = conn_pub.cursor()
    res_pub = call_save_insight(
        cur_pub, date_b, 3, 'Mithuna', 'en',
        general_outlook='Mithuna general text.',
        health_wellbeing='Initial health advice.', # Stale health advice!
        status='published',
        expected_version=1
    )
    conn_pub.commit()
    conn_pub.close()

    assert res_pub['success'] is False
    assert res_pub['error_code'] == 'VERSION_CONFLICT'

    # Verify database still has Editor's health advice and remains draft v2
    cur.execute("SELECT status, health_wellbeing, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 3 AND language = 'en';", (date_b,))
    row_b = cur.fetchone()
    assert row_b[0] == 'draft'
    assert row_b[1] == 'URGENT: Updated planetary health advisory.'
    assert row_b[2] == 2
    print("PASS: Test B passed. Publisher's stale snapshot did not restore old health advice or publish without review.")

    # -------------------------------------------------------------------------
    # TEST C: Stale full-form save
    # -------------------------------------------------------------------------
    print("\n--- TEST C: Stale full-form save ---")
    date_c = "2026-10-18"
    call_save_insight(
        cur, date_c, 4, 'Karka', 'en',
        general_outlook='Karka v1 outlook.',
        status='draft',
        expected_version=None
    )

    # Another session updates to v2
    conn_c1 = get_connection()
    set_admin_session(conn_c1)
    cur_c1 = conn_c1.cursor()
    call_save_insight(
        cur_c1, date_c, 4, 'Karka', 'en',
        general_outlook='Karka v2 outlook.',
        status='draft',
        expected_version=1
    )
    conn_c1.commit()
    conn_c1.close()

    # Stale full-form submit at v1
    conn_c2 = get_connection()
    set_admin_session(conn_c2)
    cur_c2 = conn_c2.cursor()
    res_c2 = call_save_insight(
        cur_c2, date_c, 4, 'Karka', 'en',
        general_outlook='Karka stale overwrite attempt.',
        status='draft',
        expected_version=1
    )
    conn_c2.commit()
    conn_c2.close()

    assert res_c2['success'] is False
    assert res_c2['error_code'] == 'VERSION_CONFLICT'
    print("PASS: Test C passed. Stale full-form save rejected with VERSION_CONFLICT.")

    # -------------------------------------------------------------------------
    # TEST D: Stale unpublish
    # -------------------------------------------------------------------------
    print("\n--- TEST D: Stale unpublish ---")
    date_d = "2026-10-19"
    call_save_insight(
        cur, date_d, 5, 'Simha', 'en',
        general_outlook='Simha published outlook.',
        status='published',
        expected_version=None
    )

    # Session B updates auspicious color, advancing to v2 (still published)
    conn_d1 = get_connection()
    set_admin_session(conn_d1)
    cur_d1 = conn_d1.cursor()
    call_save_insight(
        cur_d1, date_d, 5, 'Simha', 'en',
        general_outlook='Simha published outlook.',
        auspicious_color='Gold',
        status='published',
        expected_version=1
    )
    conn_d1.commit()
    conn_d1.close()

    # Session A tries to unpublish to draft with stale expected_version: 1
    conn_d2 = get_connection()
    set_admin_session(conn_d2)
    cur_d2 = conn_d2.cursor()
    res_d2 = call_save_insight(
        cur_d2, date_d, 5, 'Simha', 'en',
        general_outlook='Simha published outlook.',
        status='draft',
        expected_version=1
    )
    conn_d2.commit()
    conn_d2.close()

    assert res_d2['success'] is False
    assert res_d2['error_code'] == 'VERSION_CONFLICT'

    cur.execute("SELECT status, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 5 AND language = 'en';", (date_d,))
    st_d, ver_d = cur.fetchone()
    assert st_d == 'published'
    assert ver_d == 2
    print("PASS: Test D passed. Stale unpublish safely rejected; status and newer edits preserved.")

    # -------------------------------------------------------------------------
    # TEST E: Concurrent first insert
    # -------------------------------------------------------------------------
    print("\n--- TEST E: Concurrent first insert (Insert Race Handling) ---")
    date_e = "2026-10-20"
    barrier_e = threading.Barrier(2)
    results_e = [None, None]
    errors_e = [None, None]

    def worker_e(idx):
        try:
            c = get_connection()
            set_admin_session(c)
            cr = c.cursor()
            barrier_e.wait()
            results_e[idx] = call_save_insight(
                cr, date_e, 6, 'Kanya', 'en',
                general_outlook=f"Worker {idx} content",
                status='draft',
                expected_version=None
            )
            c.commit()
            c.close()
        except Exception as ex:
            errors_e[idx] = ex

    t1 = threading.Thread(target=worker_e, args=(0,))
    t2 = threading.Thread(target=worker_e, args=(1,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors_e[0] is None, f"Worker 0 exception: {errors_e[0]}"
    assert errors_e[1] is None, f"Worker 1 exception: {errors_e[1]}"

    successes = [r for r in results_e if r and r.get('success') is True]
    conflicts = [r for r in results_e if r and r.get('error_code') == 'VERSION_CONFLICT']

    assert len(successes) == 1, f"Expected exactly 1 success, got {len(successes)}"
    assert len(conflicts) == 1, f"Expected exactly 1 conflict, got {len(conflicts)}"

    # Check database: exactly 1 record exists! Zero duplicate records!
    cur.execute("SELECT count(*) FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 6 AND language = 'en';", (date_e,))
    cnt_e = cur.fetchone()[0]
    assert cnt_e == 1, f"Expected 1 record, got {cnt_e}"

    print(f"Winner: success={successes[0]['success']}, version={successes[0]['version']}")
    print(f"Loser: error_code={conflicts[0]['error_code']}, message={conflicts[0]['error']}")
    print("PASS: Test E passed. Concurrent inserts serialized without database crash, returning structured conflict.")

    # -------------------------------------------------------------------------
    # TEST G: Retry after conflict
    # -------------------------------------------------------------------------
    print("\n--- TEST G: Retry after conflict ---")
    date_g = "2026-10-21"
    call_save_insight(
        cur, date_g, 7, 'Tula', 'en',
        general_outlook='Tula initial text.',
        status='draft',
        expected_version=None
    )

    # Intermediate update to v2
    call_save_insight(
        cur, date_g, 7, 'Tula', 'en',
        general_outlook='Tula intermediate text.',
        status='draft',
        expected_version=1
    )

    # Stale attempt fails
    conn_g = get_connection()
    set_admin_session(conn_g)
    cur_g = conn_g.cursor()
    conflict_res = call_save_insight(
        cur_g, date_g, 7, 'Tula', 'en',
        general_outlook='Tula editor attempt.',
        status='draft',
        expected_version=1
    )
    assert conflict_res['error_code'] == 'VERSION_CONFLICT'

    # Editor reloads current version (v2) and resubmits with p_expected_version = 2
    retry_res = call_save_insight(
        cur_g, date_g, 7, 'Tula', 'en',
        general_outlook='Tula editor successfully retried with v2.',
        status='draft',
        expected_version=2
    )
    conn_g.commit()
    conn_g.close()

    assert retry_res['success'] is True
    assert retry_res['version'] == 3

    cur.execute("SELECT general_outlook, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 7 AND language = 'en';", (date_g,))
    fin_text_g, fin_ver_g = cur.fetchone()
    assert fin_text_g == 'Tula editor successfully retried with v2.'
    assert fin_ver_g == 3
    print("PASS: Test G passed. Retrying with latest version cleanly succeeds.")

    # -------------------------------------------------------------------------
    # TEST H: Authorization and audit regression
    # -------------------------------------------------------------------------
    print("\n--- TEST H: Authorization and audit regression ---")
    date_h = "2026-10-22"

    # 1. Unauthorized caller (customer)
    conn_cust = get_connection()
    set_customer_session(conn_cust)
    cur_cust = conn_cust.cursor()
    auth_failed = False
    try:
        call_save_insight(
            cur_cust, date_h, 8, 'Vrishchika', 'en',
            general_outlook='Unauthorized hack attempt.',
            status='draft',
            expected_version=None
        )
        conn_cust.commit()
    except Exception as ex:
        auth_failed = True
        conn_cust.rollback()
        assert "Administrator privileges required" in str(ex)
    finally:
        conn_cust.close()

    assert auth_failed, "Customer should be rejected with unauthorized exception"
    print("Authorization check: Customer rejected cleanly.")

    # 2. Audit logs integrity: verify that a VERSION_CONFLICT does NOT create an audit log!
    cur.execute("SELECT count(*) FROM public.admin_audit_logs;")
    audit_count_before = cur.fetchone()[0]

    # Attempt a stale write that conflicts
    conn_h = get_connection()
    set_admin_session(conn_h)
    cur_h = conn_h.cursor()
    stale_h_res = call_save_insight(
        cur_h, today_str, 1, 'Mesha', 'en',
        general_outlook='Stale conflict test.',
        status='draft',
        expected_version=999 # Deliberately wrong version!
    )
    conn_h.commit()
    conn_h.close()

    assert stale_h_res['error_code'] == 'VERSION_CONFLICT'

    cur.execute("SELECT count(*) FROM public.admin_audit_logs;")
    audit_count_after = cur.fetchone()[0]

    assert audit_count_after == audit_count_before, f"Audit log count changed! Expected {audit_count_before}, got {audit_count_after}"
    print("Audit log integrity: Zero false audit records created on rejected conflict.")

    conn.close()
    print("\n======================================================================")
    print("ALL 8 CONCURRENCY & INTEGRATION SCENARIOS (A - H) PASSED SUCCESSFULLY!")
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
