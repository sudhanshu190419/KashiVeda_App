import os
import sys
import time
import uuid
import subprocess
import psycopg2

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
    conn.autocommit = True
    return conn

def setup_schema(cur):
    # Ensure necessary enum types exist
    cur.execute("""
    DO $$ BEGIN
        CREATE TYPE public.payment_order_purpose AS ENUM (
            'booking_advance', 'booking_balance', 'samagri', 'kundli', 'subscription', 'prepone_fee', 'live_service', 'other'
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.payment_order_status AS ENUM (
            'created', 'pending', 'paid', 'failed', 'cancelled', 'expired'
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.payment_transaction_status AS ENUM (
            'created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded'
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.refund_status AS ENUM (
            'requested', 'processing', 'processed', 'failed', 'cancelled'
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)

    # Create payment_orders, payment_transactions, and refunds per migration 007
    cur.execute("""
    CREATE TABLE IF NOT EXISTS public.payment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID,
        kundli_order_id UUID,
        subscription_id UUID,
        purpose public.payment_order_purpose NOT NULL DEFAULT 'subscription',
        amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        status public.payment_order_status NOT NULL DEFAULT 'created',
        provider TEXT NOT NULL DEFAULT 'razorpay',
        provider_order_id TEXT UNIQUE,
        due_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
        provider_payment_id TEXT NOT NULL UNIQUE,
        provider_signature TEXT,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
        status public.payment_transaction_status NOT NULL DEFAULT 'created',
        paid_at TIMESTAMPTZ,
        raw_response JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_transaction_id UUID NOT NULL REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
        booking_cancellation_id UUID,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
        reason TEXT,
        status public.refund_status NOT NULL DEFAULT 'requested',
        provider_refund_id TEXT UNIQUE,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """)

def run_tests():
    conn = get_connection()
    cur = conn.cursor()
    setup_schema(cur)

    order_id = str(uuid.uuid4())
    tx_id = str(uuid.uuid4())
    rf_id = str(uuid.uuid4())

    cur.execute("""
        INSERT INTO public.payment_orders (id, purpose, amount, currency, status, provider, provider_order_id)
        VALUES (%s, 'subscription', 499.00, 'INR', 'paid', 'razorpay', 'order_test_ast15');
    """, (order_id,))

    cur.execute("""
        INSERT INTO public.payment_transactions (id, payment_order_id, provider_payment_id, amount, status, paid_at, created_at)
        VALUES (%s, %s, 'pay_test_ast15', 499.00, 'captured', now(), now());
    """, (tx_id, order_id))

    cur.execute("""
        INSERT INTO public.refunds (id, payment_transaction_id, amount, reason, status, provider_refund_id, created_at)
        VALUES (%s, %s, 499.00, 'Customer requested cancellation', 'processed', 'rfnd_test_ast15', now());
    """, (rf_id, tx_id))

    print("\n--- TEST 1: Defective Query Execution ---")
    try:
        cur.execute("""
            SELECT id, provider_payment_id, amount, status, payment_method, created_at
            FROM public.payment_transactions
            WHERE payment_order_id = %s;
        """, (order_id,))
        print("FAIL: Expected UndefinedColumn exception not raised!")
        sys.exit(1)
    except psycopg2.errors.UndefinedColumn as e:
        print(f"PASS: Defective query failed with expected PostgreSQL exception:")
        print(f"      {e.pgerror.strip()} (code: {e.pgcode})")

    # TEST 2: Corrected Query Execution
    print("\n--- TEST 2: Corrected Query Execution ---")
    cur.execute("""
        SELECT id, provider_payment_id, amount, status, created_at
        FROM public.payment_transactions
        WHERE payment_order_id = %s
        ORDER BY created_at DESC;
    """, (order_id,))
    tx_rows = cur.fetchall()
    assert len(tx_rows) == 1, f"Expected 1 transaction, got {len(tx_rows)}"
    ret_tx_id, ret_prov_id, ret_amt, ret_stat, ret_created = tx_rows[0]
    assert str(ret_tx_id) == tx_id
    assert ret_prov_id == "pay_test_ast15"
    assert float(ret_amt) == 499.00
    assert ret_stat == "captured"
    print(f"PASS: Corrected transaction query succeeded: id={ret_tx_id}, providerPaymentId={ret_prov_id}, amount={ret_amt}, status={ret_stat}")

    # TEST 3: Linked Refunds Query Execution
    print("\n--- TEST 3: Linked Refunds Query Execution ---")
    cur.execute("""
        SELECT id, payment_transaction_id, amount, reason, status, provider_refund_id, created_at
        FROM public.refunds
        WHERE payment_transaction_id = %s
        ORDER BY created_at DESC;
    """, (tx_id,))
    rf_rows = cur.fetchall()
    assert len(rf_rows) == 1, f"Expected 1 refund, got {len(rf_rows)}"
    ret_rf_id, ret_rf_tx_id, ret_rf_amt, ret_rf_reason, ret_rf_stat, ret_rf_prov, ret_rf_created = rf_rows[0]
    assert str(ret_rf_id) == rf_id
    assert str(ret_rf_tx_id) == tx_id
    assert float(ret_rf_amt) == 499.00
    assert ret_rf_stat == "processed"
    print(f"PASS: Corrected refund query succeeded: id={ret_rf_id}, txId={ret_rf_tx_id}, amount={ret_rf_amt}, status={ret_rf_stat}")

    # Clean up test rows
    cur.execute("DELETE FROM public.refunds WHERE id = %s;", (rf_id,))
    cur.execute("DELETE FROM public.payment_transactions WHERE id = %s;", (tx_id,))
    cur.execute("DELETE FROM public.payment_orders WHERE id = %s;", (order_id,))
    conn.close()
    print("\n============================================================")
    print("ALL ISOLATED POSTGRESQL LEDGER TESTS PASSED SUCCESSFULLY!")
    print("============================================================")

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
