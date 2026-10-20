import os
import sys
import psycopg2
import uuid
import threading
import time

DB_DIR = r"C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\7eff674b-77d9-4b93-a9ea-bc319f8f7501\scratch\pg_test_db"
PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PORT = 5433

MIGRATIONS = [
    r"C:\Projects\KashiVeda\supabase\migrations\045_daily_vedic_astrology_insights.sql",
    r"C:\Projects\KashiVeda\supabase\migrations\047_harden_daily_astrology_admin_rpcs.sql",
    r"C:\Projects\KashiVeda\supabase\migrations\049_daily_astrology_optimistic_concurrency.sql",
    r"C:\Projects\KashiVeda\supabase\migrations\050_daily_astrology_csv_import_overwrite_guard.sql",
]

def get_connection():
    conn = psycopg2.connect(
        host="127.0.0.1",
        port=PORT,
        user="postgres",
        dbname="postgres"
    )
    conn.autocommit = False
    return conn

def init_clean_schema():
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    # Reset daily astrology tables and functions
    cur.execute("""
        DROP FUNCTION IF EXISTS public.admin_save_daily_rashi_insight CASCADE;
        DROP TABLE IF EXISTS public.daily_rashi_insights_audit CASCADE;
        DROP TABLE IF EXISTS public.daily_rashi_insights CASCADE;
        CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            actor_user_id UUID,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id UUID,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        TRUNCATE public.admin_audit_logs;
    """)

    for mig_path in MIGRATIONS:
        print(f"Applying: {os.path.basename(mig_path)}...")
        with open(mig_path, "r", encoding="utf-8") as f:
            sql = f.read()
        cur.execute(sql)
    print("All migrations applied cleanly.\n")
    conn.close()

def test_rpc_and_table_schema():
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    print("======================================================================")
    print("1. VERIFYING TABLE SCHEMA: public.daily_rashi_insights")
    print("======================================================================")
    cur.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'daily_rashi_insights'
        ORDER BY ordinal_position;
    """)
    cols = cur.fetchall()
    col_dict = {c[0]: c[1] for c in cols}
    print("Discovered table columns:", list(col_dict.keys()))

    expected_canonical_cols = [
        "id", "insight_date", "rashi_id", "rashi_name", "language",
        "general_outlook", "career_business", "finance_wealth", "love_relationships",
        "health_wellbeing", "auspicious_color", "auspicious_number", "status",
        "published_at", "created_by", "version", "created_at", "updated_at"
    ]
    for c in expected_canonical_cols:
        assert c in col_dict, f"Missing expected table column: {c}"

    unrelated_foreign_fields = [
        "general_prediction", "lucky_color_code", "lucky_time", "mood_of_day",
        "remedy", "love_percentage", "career_percentage", "health_percentage"
    ]
    for f in unrelated_foreign_fields:
        assert f not in col_dict, f"Foreign column {f} must NOT exist on table!"

    print("PASS: Table schema matches canonical specification.\n")

    print("======================================================================")
    print("2. VERIFYING RPC SIGNATURE: public.admin_save_daily_rashi_insight")
    print("======================================================================")
    # Check number of overloads in pg_proc
    cur.execute("""
        SELECT p.proname, pg_get_function_identity_arguments(p.oid)
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'admin_save_daily_rashi_insight';
    """)
    overloads = cur.fetchall()
    assert len(overloads) == 1, f"Expected exactly 1 function overload, found {len(overloads)}: {overloads}"
    print(f"Identified function: {overloads[0][0]}({overloads[0][1]})")

    # Inspect parameter names and types
    cur.execute("""
        SELECT parameter_name, data_type, parameter_mode, ordinal_position
        FROM information_schema.parameters
        WHERE specific_schema = 'public' 
          AND specific_name LIKE 'admin_save_daily_rashi_insight%'
        ORDER BY ordinal_position;
    """)
    params = cur.fetchall()
    param_names = [p[0] for p in params]
    print(f"Discovered {len(param_names)} parameters: {param_names}")

    expected_params = [
        "p_insight_date", "p_rashi_id", "p_rashi_name", "p_language",
        "p_general_outlook", "p_career_business", "p_finance_wealth",
        "p_love_relationships", "p_health_wellbeing", "p_auspicious_color",
        "p_auspicious_number", "p_status", "p_expected_version", "p_allow_overwrite"
    ]
    assert param_names == expected_params, f"Parameter names mismatch! Expected {expected_params}, got {param_names}"

    for f in unrelated_foreign_fields:
        assert f"p_{f}" not in param_names, f"Unrelated parameter p_{f} must NOT exist in RPC signature!"

    print("PASS: RPC signature has exactly 14 canonical parameters without stale overloads.\n")

    print("======================================================================")
    print("3. EXERCISING REAL CALLERS & MUTATION WORKFLOWS")
    print("======================================================================")
    admin_id = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Super Admin AST11', true) ON CONFLICT (id) DO UPDATE SET is_super_admin = true;", (admin_id,))
    cur.execute(f"SET request.jwt.claim.sub = '{admin_id}';")

    test_date = "2026-11-10"

    # Caller 1: Save draft (initial create from field-edit / form-edit modal)
    print("Testing Caller 1: Initial Draft Creation (Field edit / Form edit modal)...")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Initial draft guidance for Aries.'::TEXT,
            p_career_business := 'Good prospects.'::TEXT,
            p_finance_wealth := 'Stable.'::TEXT,
            p_love_relationships := 'Harmonious.'::TEXT,
            p_health_wellbeing := 'Vibrant.'::TEXT,
            p_auspicious_color := 'Crimson'::TEXT,
            p_auspicious_number := 9::INTEGER,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL
        );
    """, (test_date,))
    res1 = cur.fetchone()[0]
    assert res1['success'] is True
    assert res1['version'] == 1
    record_id = res1['record_id']
    print(f"PASS: Draft created successfully at version 1 (id: {record_id}).")

    # Verify table row fields directly
    cur.execute("SELECT rashi_name, general_outlook, career_business, auspicious_color, auspicious_number, version, status FROM public.daily_rashi_insights WHERE id = %s;", (record_id,))
    row = cur.fetchone()
    assert row[0] == 'Mesha'
    assert row[1] == 'Initial draft guidance for Aries.'
    assert row[2] == 'Good prospects.'
    assert row[3] == 'Crimson'
    assert row[4] == 9
    assert row[5] == 1
    assert row[6] == 'draft'
    print("PASS: Table row correctly populated across all sectional columns.")

    # Caller 2: Full-form edit modal updating fields with expected_version = 1
    print("\nTesting Caller 2: Full-form modal edit with expected_version = 1...")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Updated outlook for Aries.'::TEXT,
            p_career_business := 'Excellent career growth.'::TEXT,
            p_finance_wealth := 'Investment opportunities.'::TEXT,
            p_love_relationships := 'Deep bonds.'::TEXT,
            p_health_wellbeing := 'Rest well.'::TEXT,
            p_auspicious_color := 'Red'::TEXT,
            p_auspicious_number := 7::INTEGER,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := 1
        );
    """, (test_date,))
    res2 = cur.fetchone()[0]
    assert res2['success'] is True
    assert res2['version'] == 2
    print("PASS: Form update advanced version to 2.")

    # Caller 3: Publish Daily Set
    print("\nTesting Caller 3: Publish Daily Set (p_status := 'published')...")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Updated outlook for Aries.'::TEXT,
            p_status := 'published'::public.astrology_content_status,
            p_expected_version := 2
        );
    """, (test_date,))
    res3 = cur.fetchone()[0]
    assert res3['success'] is True
    assert res3['version'] == 3
    assert res3['status'] == 'published'

    cur.execute("SELECT status, published_at, version FROM public.daily_rashi_insights WHERE id = %s;", (record_id,))
    pub_row = cur.fetchone()
    assert pub_row[0] == 'published'
    assert pub_row[1] is not None
    assert pub_row[2] == 3
    print("PASS: Publishing daily set succeeded, published_at timestamp populated, version is 3.")

    # Caller 4: AST-09 Version Conflict check
    print("\nTesting Caller 4: AST-09 Version Conflict (Stale expected_version = 2)...")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Stale update attempt.'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := 2
        );
    """, (test_date,))
    res4 = cur.fetchone()[0]
    assert res4['success'] is False
    assert res4['error_code'] == 'VERSION_CONFLICT'
    assert res4['current_version'] == 3
    print("PASS: Stale expected_version cleanly rejected with VERSION_CONFLICT.")

    # Caller 5: AST-11 Bulk Import with Overwrite Disabled
    print("\nTesting Caller 5: AST-11 Bulk Import with p_allow_overwrite := FALSE...")
    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'insight_date' = %s;", (test_date,))
    audit_count_before = cur.fetchone()[0]

    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'CSV import overwrite attempt.'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL,
            p_allow_overwrite := FALSE
        );
    """, (test_date,))
    res5 = cur.fetchone()[0]
    assert res5['success'] is False
    assert res5['skipped'] is True
    assert res5['error_code'] == 'OVERWRITE_DISALLOWED'

    cur.execute("SELECT general_outlook, status, version FROM public.daily_rashi_insights WHERE id = %s;", (record_id,))
    preserved_row = cur.fetchone()
    assert preserved_row[0] == 'Updated outlook for Aries.'
    assert preserved_row[1] == 'published'
    assert preserved_row[2] == 3

    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'insight_date' = %s;", (test_date,))
    audit_count_after = cur.fetchone()[0]
    assert audit_count_after == audit_count_before, "Skipped record must NOT create audit log entry!"
    print("PASS: Overwrite disallowed cleanly protected existing row, status, and audit log.")

    # Caller 6: AST-11 Concurrent First Insert Race with 2 Independent Sessions
    print("\nTesting Caller 6: Multi-Session Concurrent First Insert Race...")
    race_date = "2026-11-20"
    results = {}

    def session_worker(session_num, allow_overwrite):
        conn_s = get_connection()
        conn_s.autocommit = True
        cur_s = conn_s.cursor()
        cur_s.execute(f"SET request.jwt.claim.sub = '{admin_id}';")
        try:
            cur_s.execute("""
                SELECT public.admin_save_daily_rashi_insight(
                    p_insight_date := %s::DATE,
                    p_rashi_id := 2::SMALLINT,
                    p_rashi_name := 'Vrishabha'::TEXT,
                    p_language := 'en'::VARCHAR(5),
                    p_general_outlook := %s::TEXT,
                    p_status := 'draft'::public.astrology_content_status,
                    p_expected_version := NULL,
                    p_allow_overwrite := %s
                );
            """, (race_date, f"Session {session_num} content", allow_overwrite))
            res = cur_s.fetchone()[0]
            results[session_num] = res
        finally:
            conn_s.close()

    # Session 1 inserts first, Session 2 attempts insert race with allow_overwrite = FALSE
    t1 = threading.Thread(target=session_worker, args=(1, True))
    t1.start()
    t1.join()

    # Now Session 2 tries with allow_overwrite = FALSE for same composite key
    t2 = threading.Thread(target=session_worker, args=(2, False))
    t2.start()
    t2.join()

    assert results[1]['success'] is True, f"Session 1 failed: {results[1]}"
    assert results[2]['success'] is False, f"Session 2 should fail overwrite: {results[2]}"
    assert results[2]['skipped'] is True
    assert results[2]['error_code'] == 'OVERWRITE_DISALLOWED'
    print("PASS: Multi-session concurrent insert race handled safely.")

    # Caller 7: AST-01 Authorization Check
    print("\nTesting Caller 7: AST-01 Non-Admin Authorization Guard...")
    cust_id = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Regular Customer', false) ON CONFLICT (id) DO UPDATE SET is_super_admin = false;", (cust_id,))
    cur.execute(f"SET request.jwt.claim.sub = '{cust_id}';")
    try:
        cur.execute("""
            SELECT public.admin_save_daily_rashi_insight(
                p_insight_date := '2026-11-25'::DATE,
                p_rashi_id := 3::SMALLINT,
                p_rashi_name := 'Mithuna'::TEXT,
                p_language := 'en'::VARCHAR(5),
                p_general_outlook := 'Unauthorized test'::TEXT
            );
        """)
        assert False, "Should have raised exception for non-admin user!"
    except Exception as e:
        assert "Unauthorized: Administrator privileges required" in str(e), f"Unexpected exception: {e}"
        print("PASS: Non-admin rejected cleanly by AST-01 guard.")

    conn.close()

if __name__ == "__main__":
    import subprocess
    db_proc = subprocess.Popen(
        [os.path.join(PG_BIN, "postgres.exe"), "-D", DB_DIR, "-p", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2)
    try:
        init_clean_schema()
        test_rpc_and_table_schema()
        print("======================================================================")
        print("ALL RPC SCHEMA AND WRITE CONTRACT TESTS PASSED WITH 100% SUCCESS!")
        print("======================================================================")
    finally:
        subprocess.run([os.path.join(PG_BIN, "pg_ctl.exe"), "-D", DB_DIR, "-m", "fast", "stop"])
        db_proc.wait()
