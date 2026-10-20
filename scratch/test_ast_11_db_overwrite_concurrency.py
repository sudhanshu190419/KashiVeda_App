import os
import sys
import time
import subprocess
import psycopg2
import uuid

DB_DIR = r"C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\7eff674b-77d9-4b93-a9ea-bc319f8f7501\scratch\pg_test_db"
PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PORT = 5433
MIGRATION_050 = r"C:\Projects\KashiVeda\supabase\migrations\050_daily_astrology_csv_import_overwrite_guard.sql"

def get_connection():
    conn = psycopg2.connect(
        host="127.0.0.1",
        port=PORT,
        user="postgres",
        dbname="postgres"
    )
    conn.autocommit = False
    return conn

def run_db_tests():
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    # Apply Migration 050 to the isolated database
    print("\n--- Applying Migration 050 to PostgreSQL 18.4 ---")
    with open(MIGRATION_050, "r", encoding="utf-8") as f:
        mig_sql = f.read()
    cur.execute(mig_sql)
    print("PASS: Migration 050 applied successfully.")

    admin_id = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Super Admin AST11', true) ON CONFLICT (id) DO UPDATE SET is_super_admin = true;", (admin_id,))
    cur.execute(f"SET request.jwt.claim.sub = '{admin_id}';")
    cur.execute("DELETE FROM public.daily_rashi_insights WHERE insight_date >= '2026-11-01';")
    cur.execute("DELETE FROM public.admin_audit_logs WHERE details->>'insight_date' >= '2026-11-01';")

    print("======================================================================")
    print("STARTING AST-11 DATABASE INTEGRATION TEST SUITE (POSTGRESQL 18.4)")
    print("======================================================================")

    # =========================================================================
    # SCENARIO D: Exact existing identity with overwrite disabled
    # =========================================================================
    print("\n--- Scenario D: Exact existing identity with overwrite disabled ---")
    date_d = "2026-11-01"
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Original Editorial Text'::TEXT,
            p_status := 'published'::public.astrology_content_status,
            p_expected_version := NULL
        );
    """, (date_d,))
    res_d_init = cur.fetchone()[0]
    assert res_d_init['success'] is True
    assert res_d_init['version'] == 1

    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'insight_date' = %s;", (date_d,))
    audit_count_before = cur.fetchone()[0]

    # Attempt import with overwrite disabled
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Attempted CSV Overwrite'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL,
            p_allow_overwrite := FALSE
        );
    """, (date_d,))
    res_d_skip = cur.fetchone()[0]
    assert res_d_skip['success'] is False, "Must report success: false"
    assert res_d_skip['skipped'] is True, "Must report skipped: true"
    assert res_d_skip['error_code'] == 'OVERWRITE_DISALLOWED', "Must report OVERWRITE_DISALLOWED"

    # Verify content, status, and version are 100% unchanged
    cur.execute("SELECT general_outlook, status, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 1 AND language = 'en';", (date_d,))
    outlook_d, status_d, version_d = cur.fetchone()
    assert outlook_d == 'Original Editorial Text', f"Content must be preserved, got {outlook_d}"
    assert status_d == 'published', f"Status must remain published, got {status_d}"
    assert version_d == 1, f"Version must remain 1, got {version_d}"

    # Verify ZERO new audit log entries
    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'insight_date' = %s;", (date_d,))
    audit_count_after = cur.fetchone()[0]
    assert audit_count_after == audit_count_before, "Skipped overwrite must produce zero audit log entries"
    print("PASS: Scenario D passed. Existing row protected; zero false audit entries.")

    # =========================================================================
    # SCENARIO E: Existing row absent from visible matrix
    # =========================================================================
    print("\n--- Scenario E: Existing row absent from visible matrix ---")
    date_e = "2026-11-02"
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 2::SMALLINT,
            p_rashi_name := 'Vrishabha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Row Absent From Matrix'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL
        );
    """, (date_e,))

    # Attempt save with p_allow_overwrite := FALSE
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 2::SMALLINT,
            p_rashi_name := 'Vrishabha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Malicious Overwrite'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL,
            p_allow_overwrite := FALSE
        );
    """, (date_e,))
    res_e = cur.fetchone()[0]
    assert res_e['skipped'] is True
    assert res_e['error_code'] == 'OVERWRITE_DISALLOWED'
    print("PASS: Scenario E passed. Server/DB check enforces overwrite guard regardless of UI matrix presence.")

    # =========================================================================
    # SCENARIO F: Overwrite enabled with valid expected version
    # =========================================================================
    print("\n--- Scenario F: Overwrite enabled with valid expected version ---")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Updated Editorial Text'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := 1,
            p_allow_overwrite := TRUE
        );
    """, (date_d,))
    res_f = cur.fetchone()[0]
    assert res_f['success'] is True, f"Expected success, got {res_f}"
    assert res_f['version'] == 2, f"Expected version 2, got {res_f['version']}"

    cur.execute("SELECT general_outlook, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 1 AND language = 'en';", (date_d,))
    outlook_f, version_f = cur.fetchone()
    assert outlook_f == 'Updated Editorial Text'
    assert version_f == 2
    print("PASS: Scenario F passed. Overwrite succeeded and advanced version to 2.")

    # =========================================================================
    # SCENARIO G: Concurrent create after preview (Multi-Session Test)
    # =========================================================================
    print("\n--- Scenario G: Concurrent create after preview (Multi-Session Test) ---")
    date_g = "2026-11-03"
    rashi_g = 4 # Karka

    # Session B connects independently and inserts the record
    conn_b = get_connection()
    conn_b.autocommit = True
    cur_b = conn_b.cursor()
    admin_b = str(uuid.uuid4())
    cur_b.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Admin B', true) ON CONFLICT (id) DO UPDATE SET is_super_admin = true;", (admin_b,))
    cur_b.execute(f"SET request.jwt.claim.sub = '{admin_b}';")

    cur_b.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Karka'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Session B Created This'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL
        );
    """, (date_g, rashi_g))
    res_b = cur_b.fetchone()[0]
    assert res_b['success'] is True
    assert res_b['version'] == 1

    # Session A now attempts insert with p_allow_overwrite := FALSE (thinking it's brand new)
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Karka'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Session A Import Stale Preview'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL,
            p_allow_overwrite := FALSE
        );
    """, (date_g, rashi_g))
    res_g_a = cur.fetchone()[0]
    assert res_g_a['success'] is False
    assert res_g_a['skipped'] is True
    assert res_g_a['error_code'] == 'OVERWRITE_DISALLOWED'

    # Verify Session B's content is preserved
    cur.execute("SELECT general_outlook, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = %s AND language = 'en';", (date_g, rashi_g))
    outlook_g, version_g = cur.fetchone()
    assert outlook_g == 'Session B Created This'
    assert version_g == 1
    conn_b.close()
    print("PASS: Scenario G passed. Concurrent creation handled safely without overwriting.")

    # =========================================================================
    # SCENARIO H: Concurrent update after preview (Multi-Session Test)
    # =========================================================================
    print("\n--- Scenario H: Concurrent update after preview (Multi-Session Test) ---")
    date_h = "2026-11-04"
    rashi_h = 5 # Simha

    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Simha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Initial Simha Outlook'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL
        );
    """, (date_h, rashi_h))

    # Independent Session B updates Simha to version 2
    conn_b2 = get_connection()
    conn_b2.autocommit = True
    cur_b2 = conn_b2.cursor()
    cur_b2.execute(f"SET request.jwt.claim.sub = '{admin_b}';")

    cur_b2.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Simha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Session B Mid-Air Edit'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := 1,
            p_allow_overwrite := TRUE
        );
    """, (date_h, rashi_h))
    res_b2 = cur_b2.fetchone()[0]
    assert res_b2['success'] is True
    assert res_b2['version'] == 2

    # Session A tries to overwrite with stale expected_version 1
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Simha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Session A Stale Overwrite'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := 1,
            p_allow_overwrite := TRUE
        );
    """, (date_h, rashi_h))
    res_h_a = cur.fetchone()[0]
    assert res_h_a['success'] is False
    assert res_h_a['error_code'] == 'VERSION_CONFLICT'

    # Verify Session B's content is preserved
    cur.execute("SELECT general_outlook, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = %s AND language = 'en';", (date_h, rashi_h))
    outlook_h, version_h = cur.fetchone()
    assert outlook_h == 'Session B Mid-Air Edit'
    assert version_h == 2
    conn_b2.close()
    print("PASS: Scenario H passed. Stale overwrite cleanly rejected with VERSION_CONFLICT.")

    # =========================================================================
    # SCENARIO J: Authorization and audit regression
    # =========================================================================
    print("\n--- Scenario J: Authorization and audit regression ---")
    customer_id = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Regular Customer', false) ON CONFLICT (id) DO UPDATE SET is_super_admin = false;", (customer_id,))
    cur.execute(f"SET request.jwt.claim.sub = '{customer_id}';")

    try:
        cur.execute("""
            SELECT public.admin_save_daily_rashi_insight(
                p_insight_date := '2026-11-05'::DATE,
                p_rashi_id := 1::SMALLINT,
                p_rashi_name := 'Mesha'::TEXT,
                p_language := 'en'::VARCHAR(5),
                p_general_outlook := 'Unauthorized attempt'::TEXT,
                p_status := 'draft'::public.astrology_content_status
            );
        """)
        assert False, "Should have thrown unauthorized exception"
    except Exception as e:
        assert "Unauthorized" in str(e), f"Expected Unauthorized exception, got {e}"
        print("PASS: Unauthorized non-admin rejected cleanly by AST-01 guard.")

    # =========================================================================
    # SCENARIO K: NULL expected version with allow_overwrite = TRUE on existing row
    # =========================================================================
    print("\n--- Scenario K: NULL expected version with allow_overwrite = TRUE on existing row ---")
    cur.execute(f"SET request.jwt.claim.sub = '{admin_id}';")
    date_k = "2026-11-06"
    # Create row at v1
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Initial Version 1'::TEXT,
            p_status := 'published'::public.astrology_content_status,
            p_expected_version := NULL,
            p_allow_overwrite := TRUE
        );
    """, (date_k,))
    res_k_init = cur.fetchone()[0]
    assert res_k_init['success'] is True
    assert res_k_init['version'] == 1

    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'insight_date' = %s;", (date_k,))
    audit_k_before = cur.fetchone()[0]

    # Attempt blind update with p_expected_version = NULL and p_allow_overwrite = TRUE
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 1::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := 'en'::VARCHAR(5),
            p_general_outlook := 'Blind Overwrite Attempt'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL,
            p_allow_overwrite := TRUE
        );
    """, (date_k,))
    res_k_blind = cur.fetchone()[0]
    assert res_k_blind['success'] is False, "Must reject blind overwrite"
    assert res_k_blind['error_code'] == 'VERSION_CONFLICT', f"Expected VERSION_CONFLICT, got {res_k_blind}"
    assert res_k_blind['current_version'] == 1

    # Row must remain unchanged
    cur.execute("SELECT general_outlook, status, version FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 1 AND language = 'en';", (date_k,))
    row_k = cur.fetchone()
    assert row_k[0] == 'Initial Version 1'
    assert row_k[1] == 'published'
    assert row_k[2] == 1

    # Zero false audit entries
    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'insight_date' = %s;", (date_k,))
    audit_k_after = cur.fetchone()[0]
    assert audit_k_after == audit_k_before, "Must not create audit entry on rejected conflict"
    print("PASS: Scenario K passed. NULL expected version rejected with VERSION_CONFLICT on existing row.")

    conn.close()
    print("\n======================================================================")
    print("ALL AST-11 DATABASE INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("======================================================================")

if __name__ == '__main__':
    db_proc = subprocess.Popen(
        [os.path.join(PG_BIN, "postgres.exe"), "-D", DB_DIR, "-p", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2)
    try:
        run_db_tests()
    finally:
        subprocess.run([os.path.join(PG_BIN, "pg_ctl.exe"), "-D", DB_DIR, "-m", "fast", "stop"])
        db_proc.wait()
