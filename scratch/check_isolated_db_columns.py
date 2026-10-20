import os
import subprocess
import time
import psycopg2

DB_DIR = r"C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\7eff674b-77d9-4b93-a9ea-bc319f8f7501\scratch\pg_test_db"
PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PORT = 5433

db_proc = subprocess.Popen(
    [os.path.join(PG_BIN, "postgres.exe"), "-D", DB_DIR, "-p", str(PORT)],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL
)
time.sleep(2)
try:
    conn = psycopg2.connect(host="127.0.0.1", port=PORT, user="postgres", dbname="postgres")
    cur = conn.cursor()
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payment_transactions' ORDER BY ordinal_position;")
    rows = cur.fetchall()
    print("Columns of payment_transactions in isolated test DB:")
    for col, dtype in rows:
        print(f"  - {col} ({dtype})")
    
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'refunds' ORDER BY ordinal_position;")
    r_rows = cur.fetchall()
    print("\nColumns of refunds in isolated test DB:")
    for col, dtype in r_rows:
        print(f"  - {col} ({dtype})")
    conn.close()
finally:
    subprocess.run([os.path.join(PG_BIN, "pg_ctl.exe"), "-D", DB_DIR, "-m", "fast", "stop"])
    db_proc.wait()
