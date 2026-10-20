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

def run_test():
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    # Re-apply Migration 050 to ensure clean function state
    print("\n--- Applying Migration 050 to PostgreSQL 18.4 ---")
    with open(MIGRATION_050, "r", encoding="utf-8") as f:
        mig_sql = f.read()
    cur.execute(mig_sql)
    print("PASS: Migration 050 applied successfully.")

    admin_id = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Super Admin AST09-11', true) ON CONFLICT (id) DO UPDATE SET is_super_admin = true;", (admin_id,))
    cur.execute(f"SET request.jwt.claim.sub = '{admin_id}';")

    print("======================================================================")
    print("STARTING AST-09 NULL EXPECTED_VERSION COMPATIBILITY TEST")
    print("======================================================================")

    test_date = "2026-11-15"
    rashi_id = 1
    language = "en"

    # Step 1: Inserts an existing daily-insight row at version 1
    print("\n1. Inserting initial daily-insight row at version 1...")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := %s::VARCHAR(5),
            p_general_outlook := 'Original Insight V1'::TEXT,
            p_status := 'published'::public.astrology_content_status,
            p_expected_version := NULL,
            p_allow_overwrite := TRUE
        );
    """, (test_date, rashi_id, language))
    res_init = cur.fetchone()[0]
    assert res_init['success'] is True, f"Initial insert failed: {res_init}"
    assert res_init['version'] == 1, f"Expected version 1, got {res_init['version']}"
    record_id = res_init['record_id']

    # Record baseline audit count
    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'insight_date' = %s;", (test_date,))
    audit_count_v1 = cur.fetchone()[0]

    # Step 2: Calls the actual final RPC with p_expected_version = NULL and p_allow_overwrite = TRUE
    print("\n2. Calling RPC with p_expected_version = NULL and p_allow_overwrite = TRUE on existing row...")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := %s::VARCHAR(5),
            p_general_outlook := 'Attempted Blind Overwrite Without Expected Version'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := NULL,
            p_allow_overwrite := TRUE
        );
    """, (test_date, rashi_id, language))
    res_null_ver = cur.fetchone()[0]

    # Step 3: Confirms the result is success: false with error_code: 'VERSION_CONFLICT'
    print("3. Verifying outcome status...")
    assert res_null_ver['success'] is False, f"Expected success=False, got {res_null_ver}"
    assert res_null_ver['error_code'] == 'VERSION_CONFLICT', f"Expected VERSION_CONFLICT, got {res_null_ver.get('error_code')}"
    assert res_null_ver['current_version'] == 1, f"Expected current_version=1, got {res_null_ver.get('current_version')}"
    assert res_null_ver['expected_version'] is None, f"Expected expected_version=None, got {res_null_ver.get('expected_version')}"
    print(f"PASS: Rejected cleanly with VERSION_CONFLICT: {res_null_ver['error']}")

    # Step 4: Verifies that the row's content, status, and version remain unchanged
    print("\n4. Verifying database row remains untouched...")
    cur.execute("SELECT general_outlook, status, version FROM public.daily_rashi_insights WHERE id = %s;", (record_id,))
    row_after_reject = cur.fetchone()
    assert row_after_reject[0] == 'Original Insight V1', f"Content changed! Got: {row_after_reject[0]}"
    assert row_after_reject[1] == 'published', f"Status changed! Got: {row_after_reject[1]}"
    assert row_after_reject[2] == 1, f"Version changed! Got: {row_after_reject[2]}"
    print("PASS: Database content, published status, and version 1 remain 100% intact.")

    # Step 5: Verifies that no audit entry falsely records a successful update
    print("\n5. Verifying audit log integrity...")
    cur.execute("SELECT count(*) FROM public.admin_audit_logs WHERE details->>'insight_date' = %s;", (test_date,))
    audit_count_after_reject = cur.fetchone()[0]
    assert audit_count_after_reject == audit_count_v1, f"False audit entry created! Before: {audit_count_v1}, After: {audit_count_after_reject}"
    print("PASS: Zero false audit entries created.")

    # Step 6: Confirms that a valid version-1 update still succeeds and advances the row to version 2
    print("\n6. Confirming valid update with p_expected_version = 1 succeeds...")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := %s::VARCHAR(5),
            p_general_outlook := 'Valid Update With Expected Version 1'::TEXT,
            p_status := 'published'::public.astrology_content_status,
            p_expected_version := 1,
            p_allow_overwrite := TRUE
        );
    """, (test_date, rashi_id, language))
    res_valid_update = cur.fetchone()[0]
    assert res_valid_update['success'] is True, f"Expected success=True, got {res_valid_update}"
    assert res_valid_update['version'] == 2, f"Expected version=2, got {res_valid_update['version']}"

    cur.execute("SELECT general_outlook, version FROM public.daily_rashi_insights WHERE id = %s;", (record_id,))
    row_v2 = cur.fetchone()
    assert row_v2[0] == 'Valid Update With Expected Version 1'
    assert row_v2[1] == 2
    print("PASS: Valid update succeeded and advanced row to version 2.")

    # Step 7: Confirms that p_allow_overwrite = FALSE still preserves an existing row
    print("\n7. Confirming p_allow_overwrite = FALSE preserves row even if expected_version is provided...")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := %s::SMALLINT,
            p_rashi_name := 'Mesha'::TEXT,
            p_language := %s::VARCHAR(5),
            p_general_outlook := 'Attempt With Overwrite Disabled'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := 2,
            p_allow_overwrite := FALSE
        );
    """, (test_date, rashi_id, language))
    res_no_overwrite = cur.fetchone()[0]
    assert res_no_overwrite['success'] is False
    assert res_no_overwrite['skipped'] is True
    assert res_no_overwrite['error_code'] == 'OVERWRITE_DISALLOWED'

    cur.execute("SELECT general_outlook, version FROM public.daily_rashi_insights WHERE id = %s;", (record_id,))
    row_v2_preserved = cur.fetchone()
    assert row_v2_preserved[0] == 'Valid Update With Expected Version 1'
    assert row_v2_preserved[1] == 2
    print("PASS: p_allow_overwrite = FALSE cleanly preserved existing row at version 2.")

    conn.close()
    print("\n======================================================================")
    print("ALL AST-09 NULL EXPECTED_VERSION VERIFICATION CHECKS PASSED (100%!)")
    print("======================================================================")

if __name__ == "__main__":
    db_proc = subprocess.Popen(
        [os.path.join(PG_BIN, "postgres.exe"), "-D", DB_DIR, "-p", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2)
    try:
        run_test()
    finally:
        subprocess.run([os.path.join(PG_BIN, "pg_ctl.exe"), "-D", DB_DIR, "-m", "fast", "stop"])
        db_proc.wait()
