import os
import sys
import time
import subprocess
import psycopg2
import uuid

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

def run_db_tests():
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    admin_id = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Super Admin AST10 Hardening', true) ON CONFLICT (id) DO UPDATE SET is_super_admin = true;", (admin_id,))
    cur.execute(f"SET request.jwt.claim.sub = '{admin_id}';")

    date_str = "2026-10-26"
    language = "en"

    print("======================================================================")
    print("STARTING AST-10 HARDENED DATABASE INTEGRATION TEST SUITE (POSTGRESQL 18.4)")
    print("======================================================================")

    # 1. Setup 12 Draft Rows at Version 1
    print("\n--- 1. Setting up 12 Rashi rows in draft status (version 1) ---")
    for rashi_id in range(1, 13):
        cur.execute("""
            SELECT public.admin_save_daily_rashi_insight(
                p_insight_date := %s::DATE,
                p_rashi_id := %s::SMALLINT,
                p_rashi_name := %s::TEXT,
                p_language := %s::VARCHAR(5),
                p_general_outlook := %s::TEXT,
                p_status := 'draft'::public.astrology_content_status,
                p_expected_version := NULL
            );
        """, (date_str, rashi_id, f"Rashi-{rashi_id}", language, f"General guidance for Rashi {rashi_id}."))

    cur.execute("SELECT count(*), max(version) FROM public.daily_rashi_insights WHERE insight_date = %s AND language = %s;", (date_str, language))
    count, max_ver = cur.fetchone()
    assert count == 12, f"Expected 12 rows, found {count}"
    assert max_ver == 1, f"Expected version 1, found {max_ver}"
    print(f"PASS: 12 draft rows created successfully at version 1.")

    # 2. Simulate concurrent modification on Rashi 5 (Simha)
    print("\n--- 2. Simulating concurrent modification on Rashi 5 (Simha) ---")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 5::SMALLINT,
            p_rashi_name := 'Simha'::TEXT,
            p_language := %s::VARCHAR(5),
            p_general_outlook := 'Updated outlook for Simha by Editor A.'::TEXT,
            p_career_business := 'New career advice by Editor A.'::TEXT,
            p_status := 'draft'::public.astrology_content_status,
            p_expected_version := 1
        );
    """, (date_str, language))
    res_simha_edit = cur.fetchone()[0]
    assert res_simha_edit['success'] is True
    assert res_simha_edit['version'] == 2
    print("Editor A updated Rashi 5 to version 2.")

    # 3. Publisher attempts to publish 12 rows holding stale version 1 snapshots
    # Simulate: Rashi 1..4, 6..12 succeed to version 2; Rashi 5 encounters VERSION_CONFLICT; Rashi 2 encounters simulated transient error
    print("\n--- 3. Publishing set: 10 succeed, 1 conflict (Simha), 1 ordinary failure (Vrishabha) ---")
    publish_results = []
    for rashi_id in range(1, 13):
        if rashi_id == 2:
            # Simulate transient failure (e.g., transient lock / transport failure, row remains in DB at v1)
            publish_results.append((rashi_id, {'success': False, 'error_code': 'DB_TRANSPORT_ERROR', 'error': 'Connection timeout'}))
            continue

        expected_version = 1 # Publisher holds stale snapshot
        cur.execute("""
            SELECT public.admin_save_daily_rashi_insight(
                p_insight_date := %s::DATE,
                p_rashi_id := %s::SMALLINT,
                p_rashi_name := %s::TEXT,
                p_language := %s::VARCHAR(5),
                p_general_outlook := %s::TEXT,
                p_status := 'published'::public.astrology_content_status,
                p_expected_version := %s::INTEGER
            );
        """, (date_str, rashi_id, f"Rashi-{rashi_id}", language, f"General guidance for Rashi {rashi_id}.", expected_version))
        rpc_res = cur.fetchone()[0]
        publish_results.append((rashi_id, rpc_res))

    published_count = sum(1 for _, res in publish_results if res.get('success'))
    conflict_count = sum(1 for _, res in publish_results if res.get('error_code') == 'VERSION_CONFLICT')
    ordinary_failed_count = sum(1 for _, res in publish_results if not res.get('success') and res.get('error_code') != 'VERSION_CONFLICT')

    assert published_count == 10, f"Expected 10 published, got {published_count}"
    assert conflict_count == 1, f"Expected 1 conflict, got {conflict_count}"
    assert ordinary_failed_count == 1, f"Expected 1 ordinary failure, got {ordinary_failed_count}"
    print(f"PASS: Initial publication yielded 10 published, 1 conflict (Simha), 1 ordinary failure (Vrishabha).")

    # 4. Enforce Retry Policy: Only ordinary failures are retryable; Conflicts MUST NOT be retried
    print("\n--- 4. Enforcing AST-10 Retry Eligibility Policy ---")
    retryable_ids = [rashi_id for rashi_id, res in publish_results if not res.get('success') and res.get('error_code') != 'VERSION_CONFLICT']
    assert retryable_ids == [2], f"Retryable IDs must strictly be [2], got {retryable_ids}"
    assert 5 not in retryable_ids, "Rashi 5 (Simha) MUST be excluded from automatic retry list"
    print("PASS: Rashi 5 (conflict) strictly excluded from retry list; only Rashi 2 is eligible.")

    # 5. Verify Rashi 5 (Simha) was NOT overwritten and preserves Editor A's content
    cur.execute("SELECT status, version, career_business FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 5 AND language = %s;", (date_str, language))
    simha_status, simha_version, simha_career = cur.fetchone()
    assert simha_status == 'draft', f"Simha must still be draft, found {simha_status}"
    assert simha_version == 2, f"Simha version must be 2, found {simha_version}"
    assert simha_career == 'New career advice by Editor A.', "Simha content must be preserved"
    print("PASS: Rashi 5 was not overwritten by stale publishing attempt.")

    # 6. Retry only the ordinary failure (Rashi 2)
    print("\n--- 6. Retrying only ordinary failure (Rashi 2) using authoritative DB state ---")
    cur.execute("SELECT version, general_outlook FROM public.daily_rashi_insights WHERE insight_date = %s AND rashi_id = 2 AND language = %s;", (date_str, language))
    v2_version, v2_outlook = cur.fetchone()
    assert v2_version == 1, "Rashi 2 version in DB must be 1"

    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 2::SMALLINT,
            p_rashi_name := 'Vrishabha'::TEXT,
            p_language := %s::VARCHAR(5),
            p_general_outlook := %s::TEXT,
            p_status := 'published'::public.astrology_content_status,
            p_expected_version := %s::INTEGER
        );
    """, (date_str, language, v2_outlook, v2_version))
    retry_v2_res = cur.fetchone()[0]
    assert retry_v2_res['success'] is True, f"Rashi 2 retry must succeed: {retry_v2_res}"
    assert retry_v2_res['version'] == 2
    assert retry_v2_res['status'] == 'published'
    print("PASS: Targeted retry of Rashi 2 succeeded to version 2.")

    # 7. Editorial Review & Resolution of Rashi 5
    # The administrator reloads the matrix, reviews Editor A's career advice, and initiates publication with expected version 2
    print("\n--- 7. Administrator reviews Editor A's updates and publishes Rashi 5 ---")
    cur.execute("""
        SELECT public.admin_save_daily_rashi_insight(
            p_insight_date := %s::DATE,
            p_rashi_id := 5::SMALLINT,
            p_rashi_name := 'Simha'::TEXT,
            p_language := %s::VARCHAR(5),
            p_general_outlook := 'Updated outlook for Simha by Editor A.'::TEXT,
            p_career_business := %s::TEXT,
            p_status := 'published'::public.astrology_content_status,
            p_expected_version := 2::INTEGER
        );
    """, (date_str, language, simha_career))
    simha_pub_res = cur.fetchone()[0]
    assert simha_pub_res['success'] is True
    assert simha_pub_res['version'] == 3
    assert simha_pub_res['status'] == 'published'
    print("PASS: Reviewed Simha published successfully to version 3.")

    # 8. Final verification: All 12 rows are now authoritatively published
    cur.execute("SELECT count(*) FROM public.daily_rashi_insights WHERE insight_date = %s AND language = %s AND status = 'published';", (date_str, language))
    final_count = cur.fetchone()[0]
    assert final_count == 12, f"Expected 12 published rows, found {final_count}"
    print("PASS: All 12 rows are authoritatively published in PostgreSQL.")

    conn.close()
    print("\n======================================================================")
    print("ALL AST-10 DATABASE INTEGRATION TESTS PASSED SUCCESSFULLY!")
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
