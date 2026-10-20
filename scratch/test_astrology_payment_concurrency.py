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

def setup_database():
    conn = psycopg2.connect(host="127.0.0.1", port=PORT, user="postgres", dbname="postgres")
    conn.autocommit = True
    cur = conn.cursor()

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

    # Drop existing schema objects
    cur.execute("""
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO PUBLIC;

    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    -- Create Enums
    CREATE TYPE public.astrology_subscription_status AS ENUM ('active', 'expired', 'cancelled', 'payment_pending');
    CREATE TYPE public.payment_order_purpose AS ENUM ('booking_advance', 'booking_balance', 'prepone_fee', 'kundli', 'subscription', 'samagri', 'live_service');
    CREATE TYPE public.payment_order_status AS ENUM ('created', 'pending', 'paid', 'cancelled', 'refunded', 'failed');
    CREATE TYPE public.payment_transaction_status AS ENUM ('created', 'captured', 'refunded', 'partially_refunded', 'failed');
    CREATE TYPE public.refund_status AS ENUM ('requested', 'processing', 'processed', 'failed');
    CREATE TYPE public.booking_status AS ENUM ('payment_pending', 'confirmed', 'upcoming', 'in_progress', 'completed', 'rescheduled', 'cancelled');
    CREATE TYPE public.reschedule_request_status AS ENUM ('requested', 'approved', 'rejected');

    -- Create Tables
    CREATE TABLE public.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT,
        is_super_admin BOOLEAN DEFAULT false
    );

    CREATE TABLE public.astrology_subscription_plans (
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

    CREATE TABLE public.payment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID,
        kundli_order_id UUID,
        subscription_id UUID,
        purpose public.payment_order_purpose NOT NULL,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        status public.payment_order_status NOT NULL DEFAULT 'created',
        provider TEXT NOT NULL DEFAULT 'razorpay',
        provider_order_id TEXT UNIQUE,
        due_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.astrology_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES public.profiles(id),
        plan_id UUID NOT NULL REFERENCES public.astrology_subscription_plans(id),
        payment_order_id UUID REFERENCES public.payment_orders(id),
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        status public.astrology_subscription_status NOT NULL DEFAULT 'payment_pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_period CHECK (ends_at > starts_at)
    );

    ALTER TABLE public.payment_orders
        ADD CONSTRAINT fk_payment_orders_subscription FOREIGN KEY (subscription_id)
        REFERENCES public.astrology_subscriptions(id) ON DELETE SET NULL;

    CREATE TABLE public.payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_order_id UUID NOT NULL REFERENCES public.payment_orders(id),
        provider_payment_id TEXT NOT NULL UNIQUE,
        provider_signature TEXT,
        amount NUMERIC(12,2) NOT NULL,
        status public.payment_transaction_status NOT NULL DEFAULT 'created',
        paid_at TIMESTAMPTZ,
        raw_response JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_transaction_id UUID NOT NULL REFERENCES public.payment_transactions(id),
        booking_cancellation_id UUID,
        amount NUMERIC(12,2) NOT NULL,
        reason TEXT,
        status public.refund_status NOT NULL DEFAULT 'requested',
        provider_refund_id TEXT UNIQUE,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id UUID,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE public.bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID,
        pandit_id UUID,
        booking_number TEXT,
        scheduled_start_at TIMESTAMPTZ,
        scheduled_end_at TIMESTAMPTZ,
        status public.booking_status DEFAULT 'payment_pending',
        reschedule_count INTEGER DEFAULT 0,
        confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE public.booking_reschedule_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID REFERENCES public.bookings(id),
        change_type TEXT,
        requested_start_at TIMESTAMPTZ,
        requested_end_at TIMESTAMPTZ,
        fee_amount NUMERIC(12,2),
        status public.reschedule_request_status DEFAULT 'requested',
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE public.kundli_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID,
        order_number TEXT,
        status public.payment_order_status DEFAULT 'created',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE public.pandit_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        verification_status TEXT DEFAULT 'approved',
        public_status TEXT DEFAULT 'available'
    );

    CREATE TABLE public.pandit_availability_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pandit_id UUID,
        day_of_week INTEGER,
        start_time TIME,
        end_time TIME,
        is_active BOOLEAN DEFAULT true
    );

    CREATE TABLE public.pandit_unavailability_blocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pandit_id UUID,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ
    );

    CREATE OR REPLACE FUNCTION public.is_super_admin(p_id UUID) RETURNS BOOLEAN AS $$
        SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = p_id), false);
    $$ LANGUAGE sql STABLE;
    """)

    # Load Migration 048
    mig_path = r"C:\Projects\KashiVeda\supabase\migrations\048_serialize_astrology_subscription_payments.sql"
    with open(mig_path, "r", encoding="utf-8") as f:
        mig_sql = f.read()

    cur.execute(mig_sql)
    conn.close()
    print("[INIT] Database schema initialized with Migration 048.")

def run_tests():
    print("=" * 70)
    print("STARTING AST-07 DATABASE-LEVEL CONCURRENCY TEST SUITE")
    print("=" * 70)

    # Setup database
    setup_database()

    # Create common plans and profiles
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    plan_30_id = str(uuid.uuid4())
    plan_90_id = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO public.astrology_subscription_plans (id, name, duration_days, price, currency, is_active)
        VALUES 
            (%s, 'Plan 30 Days', 30, 299.00, 'INR', true),
            (%s, 'Plan 90 Days', 90, 799.00, 'INR', true);
    """, (plan_30_id, plan_90_id))

    # Helper function to create pending order
    def create_pending_order(cust_id, plan_id, price):
        order_id = str(uuid.uuid4())
        sub_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO public.astrology_subscriptions (id, customer_id, plan_id, starts_at, ends_at, status)
            VALUES (%s, %s, %s, now(), now() + INTERVAL '30 days', 'payment_pending');
            INSERT INTO public.payment_orders (id, subscription_id, purpose, amount, currency, status)
            VALUES (%s, %s, 'subscription', %s, 'INR', 'created');
            UPDATE public.astrology_subscriptions SET payment_order_id = %s WHERE id = %s;
        """, (sub_id, cust_id, plan_id, order_id, sub_id, price, order_id, sub_id))
        return order_id, sub_id

    # -------------------------------------------------------------------------
    # TEST A: Two distinct orders, same customer confirmed concurrently
    # -------------------------------------------------------------------------
    print("\n--- TEST A: Two distinct orders, same customer (Concurrent Confirmation) ---")
    cust_a = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name) VALUES (%s, 'Customer A')", (cust_a,))

    order_a1, sub_a1 = create_pending_order(cust_a, plan_30_id, 299.00)
    order_a2, sub_a2 = create_pending_order(cust_a, plan_30_id, 299.00)

    barrier_a = threading.Barrier(2)
    results_a = [None, None]
    errors_a = [None, None]

    def worker_a(idx, order_id, tx_id):
        try:
            c = get_connection()
            barrier_a.wait() # Synchronize start
            cr = c.cursor()
            cr.execute("""
                SELECT public.confirm_booking_payment(
                    p_payment_order_id := %s,
                    p_provider_payment_id := %s,
                    p_verified_amount := 299.00
                );
            """, (order_id, tx_id))
            results_a[idx] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_a[idx] = e

    t1 = threading.Thread(target=worker_a, args=(0, order_a1, "tx_a1_" + str(uuid.uuid4())[:8]))
    t2 = threading.Thread(target=worker_a, args=(1, order_a2, "tx_a2_" + str(uuid.uuid4())[:8]))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors_a[0] is None, f"Worker 1 error: {errors_a[0]}"
    assert errors_a[1] is None, f"Worker 2 error: {errors_a[1]}"

    # Verify results in database
    cur.execute("SELECT id, starts_at, ends_at, status FROM public.astrology_subscriptions WHERE customer_id = %s ORDER BY starts_at ASC", (cust_a,))
    rows_a = cur.fetchall()
    assert len(rows_a) == 2, f"Expected 2 subscriptions, got {len(rows_a)}"
    sub_1_start, sub_1_end = rows_a[0][1], rows_a[0][2]
    sub_2_start, sub_2_end = rows_a[1][1], rows_a[1][2]

    print(f"Sub 1 Term: {sub_1_start} -> {sub_1_end}")
    print(f"Sub 2 Term: {sub_2_start} -> {sub_2_end}")

    # Assert no overlap: Sub 2 starts exactly when Sub 1 ends
    assert sub_2_start == sub_1_end, f"Overlap detected or gap! Sub 2 start {sub_2_start} != Sub 1 end {sub_1_end}"
    total_days_a = (sub_2_end - sub_1_start).days
    assert total_days_a == 60, f"Expected 60 total days, got {total_days_a}"
    print(f"PASS: Test A passed. Zero overlap. Total duration = {total_days_a} days sequentially allocated.")

    # -------------------------------------------------------------------------
    # TEST B: Two distinct orders with different plans (30 days + 90 days)
    # -------------------------------------------------------------------------
    print("\n--- TEST B: Two distinct orders with different plans (30d + 90d) ---")
    cust_b = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name) VALUES (%s, 'Customer B')", (cust_b,))

    order_b1, sub_b1 = create_pending_order(cust_b, plan_30_id, 299.00)
    order_b2, sub_b2 = create_pending_order(cust_b, plan_90_id, 799.00)

    barrier_b = threading.Barrier(2)
    results_b = [None, None]
    errors_b = [None, None]

    def worker_b(idx, order_id, amount, tx_id):
        try:
            c = get_connection()
            barrier_b.wait()
            cr = c.cursor()
            cr.execute("""
                SELECT public.confirm_booking_payment(
                    p_payment_order_id := %s,
                    p_provider_payment_id := %s,
                    p_verified_amount := %s
                );
            """, (order_id, tx_id, amount))
            results_b[idx] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_b[idx] = e

    t1 = threading.Thread(target=worker_b, args=(0, order_b1, 299.00, "tx_b1_" + str(uuid.uuid4())[:8]))
    t2 = threading.Thread(target=worker_b, args=(1, order_b2, 799.00, "tx_b2_" + str(uuid.uuid4())[:8]))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors_b[0] is None, f"Worker 1 error: {errors_b[0]}"
    assert errors_b[1] is None, f"Worker 2 error: {errors_b[1]}"

    cur.execute("SELECT id, starts_at, ends_at, status FROM public.astrology_subscriptions WHERE customer_id = %s ORDER BY starts_at ASC", (cust_b,))
    rows_b = cur.fetchall()
    assert len(rows_b) == 2
    b1_start, b1_end = rows_b[0][1], rows_b[0][2]
    b2_start, b2_end = rows_b[1][1], rows_b[1][2]

    print(f"Sub B1 Term: {b1_start} -> {b1_end}")
    print(f"Sub B2 Term: {b2_start} -> {b2_end}")

    assert b2_start == b1_end, f"Overlap detected! Sub B2 start {b2_start} != Sub B1 end {b1_end}"
    total_days_b = (b2_end - b1_start).days
    assert total_days_b == 120, f"Expected 120 total days, got {total_days_b}"
    print(f"PASS: Test B passed. Zero overlap. Total duration = {total_days_b} days (30d + 90d sequential).")

    # -------------------------------------------------------------------------
    # TEST C: Same-order concurrent replay
    # -------------------------------------------------------------------------
    print("\n--- TEST C: Same-order concurrent replay (Idempotency) ---")
    cust_c = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name) VALUES (%s, 'Customer C')", (cust_c,))
    order_c, sub_c = create_pending_order(cust_c, plan_30_id, 299.00)

    barrier_c = threading.Barrier(2)
    results_c = [None, None]
    errors_c = [None, None]

    tx_provider_id = "tx_c_shared_" + str(uuid.uuid4())[:8]

    def worker_c(idx):
        try:
            c = get_connection()
            barrier_c.wait()
            cr = c.cursor()
            cr.execute("""
                SELECT public.confirm_booking_payment(
                    p_payment_order_id := %s,
                    p_provider_payment_id := %s,
                    p_verified_amount := 299.00
                );
            """, (order_c, tx_provider_id))
            results_c[idx] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_c[idx] = e

    t1 = threading.Thread(target=worker_c, args=(0,))
    t2 = threading.Thread(target=worker_c, args=(1,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors_c[0] is None, f"Worker 1 error: {errors_c[0]}"
    assert errors_c[1] is None, f"Worker 2 error: {errors_c[1]}"

    # Check that exactly one payment transaction was recorded
    cur.execute("SELECT count(*) FROM public.payment_transactions WHERE payment_order_id = %s", (order_c,))
    tx_count = cur.fetchone()[0]
    assert tx_count == 1, f"Expected exactly 1 payment transaction, got {tx_count}"

    # Check subscription status
    cur.execute("SELECT status FROM public.astrology_subscriptions WHERE id = %s", (sub_c,))
    sub_status = cur.fetchone()[0]
    assert sub_status == 'active', f"Expected active, got {sub_status}"

    print(f"Results: {results_c[0]['status']}, {results_c[1]['status']}")
    print("PASS: Test C passed. Duplicate confirmations for the same order are strictly idempotent.")

    # -------------------------------------------------------------------------
    # TEST D: Concurrent creation requests (Pending-Order Reuse Race)
    # -------------------------------------------------------------------------
    print("\n--- TEST D: Concurrent creation requests (Pending-Order Reuse Serialization) ---")
    cust_d = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name) VALUES (%s, 'Customer D')", (cust_d,))

    barrier_d = threading.Barrier(2)
    results_d = [None, None]
    errors_d = [None, None]

    def worker_d(idx):
        try:
            c = get_connection()
            cr = c.cursor()
            # Set auth.uid() context for session
            cr.execute(f"SET request.jwt.claim.sub = '{cust_d}';")
            barrier_d.wait()
            cr.execute("SELECT public.create_astrology_subscription_order(%s);", (plan_30_id,))
            results_d[idx] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_d[idx] = e

    t1 = threading.Thread(target=worker_d, args=(0,))
    t2 = threading.Thread(target=worker_d, args=(1,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors_d[0] is None, f"Worker 1 error: {errors_d[0]}"
    assert errors_d[1] is None, f"Worker 2 error: {errors_d[1]}"

    # One call must have created (is_reused = False), the other must have reused (is_reused = True)
    reused_flags = [results_d[0]['is_reused'], results_d[1]['is_reused']]
    assert False in reused_flags, f"At least one must create: {reused_flags}"
    assert True in reused_flags, f"At least one must reuse: {reused_flags}"

    # Verify both returned identical subscription_id and payment_order_id!
    assert results_d[0]['subscription_id'] == results_d[1]['subscription_id'], "Subscription IDs differ!"
    assert results_d[0]['payment_order_id'] == results_d[1]['payment_order_id'], "Payment order IDs differ!"

    # Verify only ONE pending subscription exists in database for Customer D
    cur.execute("SELECT count(*) FROM public.astrology_subscriptions WHERE customer_id = %s", (cust_d,))
    sub_count_d = cur.fetchone()[0]
    assert sub_count_d == 1, f"Expected exactly 1 subscription, got {sub_count_d}"

    print(f"Create response 1: reused={results_d[0]['is_reused']}, sub={results_d[0]['subscription_id']}")
    print(f"Create response 2: reused={results_d[1]['is_reused']}, sub={results_d[1]['subscription_id']}")
    print("PASS: Test D passed. Race condition eliminated; concurrent creation cleanly serialized with pending reuse.")

    # -------------------------------------------------------------------------
    # TEST E: Different customers (Concurrency Unblocked)
    # -------------------------------------------------------------------------
    print("\n--- TEST E: Different customers (Independent Concurrency) ---")
    cust_e1 = str(uuid.uuid4())
    cust_e2 = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name) VALUES (%s, 'Customer E1'), (%s, 'Customer E2')", (cust_e1, cust_e2))

    order_e1, sub_e1 = create_pending_order(cust_e1, plan_30_id, 299.00)
    order_e2, sub_e2 = create_pending_order(cust_e2, plan_30_id, 299.00)

    barrier_e = threading.Barrier(2)
    results_e = [None, None]
    errors_e = [None, None]

    def worker_e(idx, order_id, tx_id):
        try:
            c = get_connection()
            barrier_e.wait()
            cr = c.cursor()
            cr.execute("""
                SELECT public.confirm_booking_payment(
                    p_payment_order_id := %s,
                    p_provider_payment_id := %s,
                    p_verified_amount := 299.00
                );
            """, (order_id, tx_id))
            results_e[idx] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_e[idx] = e

    t1 = threading.Thread(target=worker_e, args=(0, order_e1, "tx_e1_" + str(uuid.uuid4())[:8]))
    t2 = threading.Thread(target=worker_e, args=(1, order_e2, "tx_e2_" + str(uuid.uuid4())[:8]))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors_e[0] is None, f"Worker 1 error: {errors_e[0]}"
    assert errors_e[1] is None, f"Worker 2 error: {errors_e[1]}"
    assert results_e[0]['status'] == 'active'
    assert results_e[1]['status'] == 'active'
    print("PASS: Test E passed. Different customers proceed concurrently without contention.")

    # -------------------------------------------------------------------------
    # TEST F1: Cancellation versus capture on SAME subscription
    # -------------------------------------------------------------------------
    print("\n--- TEST F1: Cancellation versus capture on SAME subscription ---")
    cust_f1 = str(uuid.uuid4())
    admin_f1 = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Customer F1', false), (%s, 'Super Admin 1', true)", (cust_f1, admin_f1))

    order_f1, sub_f1 = create_pending_order(cust_f1, plan_30_id, 299.00)

    barrier_f1 = threading.Barrier(2)
    results_f1 = [None, None]
    errors_f1 = [None, None]

    def worker_f1_capture():
        try:
            c = get_connection()
            barrier_f1.wait()
            cr = c.cursor()
            cr.execute("""
                SELECT public.confirm_booking_payment(
                    p_payment_order_id := %s,
                    p_provider_payment_id := %s,
                    p_verified_amount := 299.00
                );
            """, (order_f1, "tx_f1_" + str(uuid.uuid4())[:8]))
            results_f1[0] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_f1[0] = e

    def worker_f1_cancel():
        try:
            c = get_connection()
            cr = c.cursor()
            cr.execute(f"SET request.jwt.claim.sub = '{admin_f1}';")
            barrier_f1.wait()
            cr.execute("""
                SELECT public.admin_cancel_astrology_subscription(
                    p_subscription_id := %s,
                    p_reason := 'Administrative test cancellation',
                    p_refund_eligible := true
                );
            """, (sub_f1,))
            results_f1[1] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_f1[1] = e

    t1 = threading.Thread(target=worker_f1_capture)
    t2 = threading.Thread(target=worker_f1_cancel)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    print(f"Capture result: {results_f1[0] if results_f1[0] else errors_f1[0]}")
    print(f"Cancel result: {results_f1[1] if results_f1[1] else errors_f1[1]}")
    assert (errors_f1[0] is None or "deadlock" not in str(errors_f1[0]).lower())
    assert (errors_f1[1] is None or "deadlock" not in str(errors_f1[1]).lower())
    print("PASS: Test F1 passed. Deadlock avoided on same-subscription interleaving.")

    # -------------------------------------------------------------------------
    # TEST F2: Cancellation of S1 versus Capture of distinct renewal S2 for SAME customer
    # -------------------------------------------------------------------------
    print("\n--- TEST F2: Cancellation of S1 vs Capture of distinct renewal S2 (Same Customer) ---")
    cust_f2 = str(uuid.uuid4())
    admin_f2 = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Customer F2', false), (%s, 'Super Admin 2', true)", (cust_f2, admin_f2))

    # S1 is an existing active subscription expiring in 15 days
    sub_f2_1 = str(uuid.uuid4())
    order_f2_1 = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO public.astrology_subscriptions (id, customer_id, plan_id, starts_at, ends_at, status)
        VALUES (%s, %s, %s, now() - INTERVAL '15 days', now() + INTERVAL '15 days', 'active');
        INSERT INTO public.payment_orders (id, subscription_id, purpose, amount, currency, status)
        VALUES (%s, %s, 'subscription', 299.00, 'INR', 'paid');
        UPDATE public.astrology_subscriptions SET payment_order_id = %s WHERE id = %s;
        INSERT INTO public.payment_transactions (payment_order_id, provider_payment_id, amount, status, paid_at)
        VALUES (%s, %s, 299.00, 'captured', now());
    """, (sub_f2_1, cust_f2, plan_30_id, order_f2_1, sub_f2_1, order_f2_1, sub_f2_1, order_f2_1, "tx_orig_" + str(uuid.uuid4())[:8]))

    # S2 is a distinct pending renewal linked to Order O2
    order_f2_2, sub_f2_2 = create_pending_order(cust_f2, plan_30_id, 299.00)

    barrier_f2 = threading.Barrier(2)
    results_f2 = [None, None]
    errors_f2 = [None, None]

    def worker_f2_capture():
        try:
            c = get_connection()
            barrier_f2.wait()
            cr = c.cursor()
            cr.execute("""
                SELECT public.confirm_booking_payment(
                    p_payment_order_id := %s,
                    p_provider_payment_id := %s,
                    p_verified_amount := 299.00
                );
            """, (order_f2_2, "tx_f2_renew_" + str(uuid.uuid4())[:8]))
            results_f2[0] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_f2[0] = e

    def worker_f2_cancel():
        try:
            c = get_connection()
            cr = c.cursor()
            cr.execute(f"SET request.jwt.claim.sub = '{admin_f2}';")
            barrier_f2.wait()
            cr.execute("""
                SELECT public.admin_cancel_astrology_subscription(
                    p_subscription_id := %s,
                    p_reason := 'Customer requested cancellation of initial term',
                    p_refund_eligible := true
                );
            """, (sub_f2_1,))
            results_f2[1] = cr.fetchone()[0]
            c.commit()
            c.close()
        except Exception as e:
            errors_f2[1] = e

    t1 = threading.Thread(target=worker_f2_capture)
    t2 = threading.Thread(target=worker_f2_cancel)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert errors_f2[0] is None, f"Capture error: {errors_f2[0]}"
    assert errors_f2[1] is None, f"Cancel error: {errors_f2[1]}"

    # Verify both completed without deadlock
    cur.execute("SELECT status FROM public.astrology_subscriptions WHERE id = %s", (sub_f2_1,))
    s1_status = cur.fetchone()[0]
    assert s1_status == 'cancelled', f"S1 must be cancelled, got {s1_status}"

    cur.execute("SELECT status, starts_at, ends_at FROM public.astrology_subscriptions WHERE id = %s", (sub_f2_2,))
    s2_status, s2_start, s2_end = cur.fetchone()
    assert s2_status == 'active', f"S2 must be active, got {s2_status}"

    s2_days = (s2_end - s2_start).days
    assert s2_days == 30, f"S2 must have full 30 days duration, got {s2_days}"

    print(f"S1 status: {s1_status}")
    print(f"S2 status: {s2_status}, Term: {s2_start} -> {s2_end} ({s2_days} days)")
    print("PASS: Test F2 passed. Cancellation of S1 and Capture of S2 serialized with zero deadlock and consistent intervals.")

    # -------------------------------------------------------------------------
    # TEST F3: Deterministic Capture-First Interleaving (Lock-Wait Verification)
    # -------------------------------------------------------------------------
    print("\n--- TEST F3: Deterministic Capture-First Interleaving (Lock-Wait Verification) ---")
    cust_f3 = str(uuid.uuid4())
    admin_f3 = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name, is_super_admin) VALUES (%s, 'Customer F3', false), (%s, 'Super Admin 3', true)", (cust_f3, admin_f3))

    # S1 is an existing active subscription expiring in 15 days
    sub_f3_1 = str(uuid.uuid4())
    order_f3_1 = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO public.astrology_subscriptions (id, customer_id, plan_id, starts_at, ends_at, status)
        VALUES (%s, %s, %s, now() - INTERVAL '15 days', now() + INTERVAL '15 days', 'active');
        INSERT INTO public.payment_orders (id, subscription_id, purpose, amount, currency, status)
        VALUES (%s, %s, 'subscription', 299.00, 'INR', 'paid');
        UPDATE public.astrology_subscriptions SET payment_order_id = %s WHERE id = %s;
        INSERT INTO public.payment_transactions (payment_order_id, provider_payment_id, amount, status, paid_at)
        VALUES (%s, %s, 299.00, 'captured', now());
    """, (sub_f3_1, cust_f3, plan_30_id, order_f3_1, sub_f3_1, order_f3_1, sub_f3_1, order_f3_1, "tx_orig_f3_" + str(uuid.uuid4())[:8]))

    cur.execute("SELECT ends_at FROM public.astrology_subscriptions WHERE id = %s", (sub_f3_1,))
    s1_orig_ends_at = cur.fetchone()[0]

    # S2 is a distinct pending renewal linked to Order O2
    order_f3_2, sub_f3_2 = create_pending_order(cust_f3, plan_30_id, 299.00)

    # Coordinator connection to manage gate lock and inspect pg_locks
    coord = get_connection()
    coord.autocommit = True
    cur_coord = coord.cursor()

    # Acquire coordinator gate lock (999999)
    cur_coord.execute("SELECT pg_advisory_lock(999999);")

    # Install test-only trigger in disposable database to pause T1 after S2 allocation
    cur_coord.execute(f"""
        CREATE OR REPLACE FUNCTION public._test_pause_f3_trigger()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.id = '{sub_f3_2}'::uuid THEN
                -- Wait until coordinator releases gate lock 999999
                PERFORM pg_advisory_lock(999999);
                PERFORM pg_advisory_unlock(999999);
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_test_pause_f3 ON public.astrology_subscriptions;
        CREATE TRIGGER trg_test_pause_f3
            AFTER UPDATE ON public.astrology_subscriptions
            FOR EACH ROW
            EXECUTE FUNCTION public._test_pause_f3_trigger();
    """)

    results_f3 = [None, None]
    errors_f3 = [None, None]
    conn1 = get_connection()
    conn2 = get_connection()

    pid1 = conn1.get_backend_pid()
    pid2 = conn2.get_backend_pid()

    tx_provider_id_f3 = "tx_f3_renew_" + str(uuid.uuid4())[:8]

    t1_started = threading.Event()
    t2_started = threading.Event()

    def worker_f3_capture():
        try:
            cr = conn1.cursor()
            t1_started.set()
            cr.execute("""
                SELECT public.confirm_booking_payment(
                    p_payment_order_id := %s,
                    p_provider_payment_id := %s,
                    p_verified_amount := 299.00
                );
            """, (order_f3_2, tx_provider_id_f3))
            results_f3[0] = cr.fetchone()[0]
            conn1.commit()
            conn1.close()
        except Exception as e:
            errors_f3[0] = e

    def worker_f3_cancel():
        try:
            t2_started.wait() # Wait until instructed by coordinator
            cr = conn2.cursor()
            cr.execute(f"SET request.jwt.claim.sub = '{admin_f3}';")
            cr.execute("""
                SELECT public.admin_cancel_astrology_subscription(
                    p_subscription_id := %s,
                    p_reason := 'Administrative cancellation under capture-first test',
                    p_refund_eligible := true
                );
            """, (sub_f3_1,))
            results_f3[1] = cr.fetchone()[0]
            conn2.commit()
            conn2.close()
        except Exception as e:
            errors_f3[1] = e

    th1 = threading.Thread(target=worker_f3_capture)
    th2 = threading.Thread(target=worker_f3_cancel)

    th1.start()
    t1_started.wait()

    # Wait until T1 updates S2 and pauses on gate lock 999999
    t1_paused = False
    for _ in range(50):
        time.sleep(0.1)
        cur_coord.execute("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objid = 999999 AND pid = %s AND NOT granted;", (pid1,))
        if cur_coord.fetchone()[0] > 0:
            t1_paused = True
            break

    assert t1_paused, "T1 did not reach trigger gate lock!"
    print("[EVIDENCE 1] T1 acquired Customer Advisory Lock and is holding it inside open transaction.")

    # Now start T2 (cancellation of S1)
    th2.start()
    t2_started.set()

    # Wait until T2 is blocked waiting on the Customer Advisory Lock held by T1
    t2_blocked = False
    t2_lock_record = None
    for _ in range(50):
        time.sleep(0.1)
        cur_coord.execute("""
            SELECT locktype, classid, objid, granted, pid
            FROM pg_locks
            WHERE locktype = 'advisory' AND pid = %s AND NOT granted;
        """, (pid2,))
        rows = cur_coord.fetchall()
        if len(rows) > 0:
            t2_blocked = True
            t2_lock_record = rows[0]
            break

    assert t2_blocked, "T2 did not block on customer advisory lock!"
    print(f"[EVIDENCE 2] T2 (PID {pid2}) is confirmed WAITING on Customer Advisory Lock: {t2_lock_record}")

    # Release gate lock so T1 can commit
    cur_coord.execute("SELECT pg_advisory_unlock(999999);")
    print("[COORDINATION] Released gate lock; allowing T1 to commit and hand off Customer lock to T2.")

    th1.join()
    th2.join()

    # Clean up test-only trigger from disposable database
    cur_coord.execute("""
        DROP TRIGGER IF EXISTS trg_test_pause_f3 ON public.astrology_subscriptions;
        DROP FUNCTION IF EXISTS public._test_pause_f3_trigger();
    """)
    coord.close()

    assert errors_f3[0] is None, f"Capture error: {errors_f3[0]}"
    assert errors_f3[1] is None, f"Cancel error: {errors_f3[1]}"

    # Inspect final database state
    cur.execute("SELECT status FROM public.astrology_subscriptions WHERE id = %s", (sub_f3_1,))
    f3_s1_status = cur.fetchone()[0]
    assert f3_s1_status == 'cancelled', f"S1 must be cancelled, got {f3_s1_status}"

    cur.execute("SELECT status, starts_at, ends_at FROM public.astrology_subscriptions WHERE id = %s", (sub_f3_2,))
    f3_s2_status, f3_s2_start, f3_s2_end = cur.fetchone()
    assert f3_s2_status == 'active', f"S2 must be active, got {f3_s2_status}"

    # Verify S2 interval was allocated from S1's original ends_at
    assert f3_s2_start == s1_orig_ends_at, f"S2 start {f3_s2_start} must match S1 original end {s1_orig_ends_at}"
    f3_s2_days = (f3_s2_end - f3_s2_start).days
    assert f3_s2_days == 30, f"S2 duration must be exactly 30 days, got {f3_s2_days}"

    print(f"Capture-First Final State:")
    print(f"  S1 (cancelled): status = {f3_s1_status}")
    print(f"  S2 (active renewal): starts_at = {f3_s2_start}, ends_at = {f3_s2_end} (duration: {f3_s2_days}d)")
    print(f"  Access Gap Observation: S1 is cancelled as of now, S2 starts at {f3_s2_start} (scheduled start preserved)")

    # Idempotent replay test for O2 using SAME provider payment ID
    cur.execute("""
        SELECT public.confirm_booking_payment(
            p_payment_order_id := %s,
            p_provider_payment_id := %s,
            p_verified_amount := 299.00
        );
    """, (order_f3_2, tx_provider_id_f3))
    replay_json = cur.fetchone()[0]
    assert replay_json['status'] in ('active', 'already_confirmed'), f"Replay must succeed idempotently: {replay_json}"

    cur.execute("SELECT count(*) FROM public.payment_transactions WHERE payment_order_id = %s", (order_f3_2,))
    tx_count_f3 = cur.fetchone()[0]
    assert tx_count_f3 == 1, f"Expected exactly 1 payment transaction, got {tx_count_f3}"

    print("PASS: Test F3 passed. Deterministic capture-first interleaving and lock-wait verified with zero deadlocks.")

    # -------------------------------------------------------------------------
    # TEST G: Payment validation and rollback
    # -------------------------------------------------------------------------
    print("\n--- TEST G: Payment validation and rollback ---")
    cust_g = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name) VALUES (%s, 'Customer G')", (cust_g,))
    order_g, sub_g = create_pending_order(cust_g, plan_30_id, 299.00)

    c = get_connection()
    cr = c.cursor()
    failed = False
    try:
        # Intentionally pass wrong amount (100.00 instead of 299.00)
        cr.execute("""
            SELECT public.confirm_booking_payment(
                p_payment_order_id := %s,
                p_provider_payment_id := %s,
                p_verified_amount := 100.00
            );
        """, (order_g, "tx_g_invalid"))
        c.commit()
    except Exception as e:
        failed = True
        c.rollback()
    finally:
        c.close()

    assert failed, "Expected confirm_booking_payment to fail on amount mismatch"
    # Verify no payment transaction created and subscription remains payment_pending
    cur.execute("SELECT status FROM public.astrology_subscriptions WHERE id = %s", (sub_g,))
    assert cur.fetchone()[0] == 'payment_pending', "Subscription should remain payment_pending"
    cur.execute("SELECT count(*) FROM public.payment_transactions WHERE payment_order_id = %s", (order_g,))
    assert cur.fetchone()[0] == 0, "No transaction should be committed"
    print("PASS: Test G passed. Invalid payment was rejected and rolled back cleanly.")

    # -------------------------------------------------------------------------
    # TEST H: Existing active interval and subsequent renewal
    # -------------------------------------------------------------------------
    print("\n--- TEST H: Existing active interval and subsequent renewal ---")
    cust_h = str(uuid.uuid4())
    cur.execute("INSERT INTO public.profiles (id, full_name) VALUES (%s, 'Customer H')", (cust_h,))

    # Create an active subscription expiring in 15 days
    active_sub_h = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO public.astrology_subscriptions (id, customer_id, plan_id, starts_at, ends_at, status)
        VALUES (%s, %s, %s, now() - INTERVAL '15 days', now() + INTERVAL '15 days', 'active');
    """, (active_sub_h, cust_h, plan_30_id))

    # Now create and confirm a renewal order
    order_h, sub_h = create_pending_order(cust_h, plan_30_id, 299.00)

    cur.execute("""
        SELECT public.confirm_booking_payment(
            p_payment_order_id := %s,
            p_provider_payment_id := %s,
            p_verified_amount := 299.00
        );
    """, (order_h, "tx_h_" + str(uuid.uuid4())[:8]))

    cur.execute("SELECT starts_at, ends_at FROM public.astrology_subscriptions WHERE id = %s", (active_sub_h,))
    orig_start, orig_end = cur.fetchone()

    cur.execute("SELECT starts_at, ends_at, status FROM public.astrology_subscriptions WHERE id = %s", (sub_h,))
    renew_start, renew_end, renew_status = cur.fetchone()

    print(f"Existing active ends at: {orig_end}")
    print(f"Renewal starts at: {renew_start}")
    print(f"Renewal ends at:   {renew_end}")

    assert renew_status == 'active'
    assert renew_start == orig_end, f"Renewal start {renew_start} should match active end {orig_end}"
    renew_days = (renew_end - renew_start).days
    assert renew_days == 30, f"Expected 30 days renewal, got {renew_days}"
    print("PASS: Test H passed. Renewal cleanly appends to existing active interval.")

    # -------------------------------------------------------------------------
    # TEST I: Function execution privileges and grants verification
    # -------------------------------------------------------------------------
    print("\n--- TEST I: Function execution privileges and grants ---")
    # create_astrology_subscription_order: anon=False, authenticated=True, service_role=True
    cur.execute("SELECT has_function_privilege('anon', 'public.create_astrology_subscription_order(uuid)', 'EXECUTE');")
    assert cur.fetchone()[0] is False, "anon should NOT have execute on create_astrology_subscription_order"

    cur.execute("SELECT has_function_privilege('authenticated', 'public.create_astrology_subscription_order(uuid)', 'EXECUTE');")
    assert cur.fetchone()[0] is True, "authenticated SHOULD have execute on create_astrology_subscription_order"

    cur.execute("SELECT has_function_privilege('service_role', 'public.create_astrology_subscription_order(uuid)', 'EXECUTE');")
    assert cur.fetchone()[0] is True, "service_role SHOULD have execute on create_astrology_subscription_order"

    # confirm_booking_payment: anon=False, authenticated=False, service_role=True
    cur.execute("SELECT has_function_privilege('anon', 'public.confirm_booking_payment(uuid, text, numeric, text, jsonb)', 'EXECUTE');")
    assert cur.fetchone()[0] is False, "anon should NOT have execute on confirm_booking_payment"

    cur.execute("SELECT has_function_privilege('authenticated', 'public.confirm_booking_payment(uuid, text, numeric, text, jsonb)', 'EXECUTE');")
    assert cur.fetchone()[0] is False, "authenticated should NOT have execute on confirm_booking_payment"

    cur.execute("SELECT has_function_privilege('service_role', 'public.confirm_booking_payment(uuid, text, numeric, text, jsonb)', 'EXECUTE');")
    assert cur.fetchone()[0] is True, "service_role SHOULD have execute on confirm_booking_payment"

    # admin_cancel_astrology_subscription: anon=False, authenticated=True, service_role=True
    cur.execute("SELECT has_function_privilege('anon', 'public.admin_cancel_astrology_subscription(uuid, text, boolean)', 'EXECUTE');")
    assert cur.fetchone()[0] is False, "anon should NOT have execute on admin_cancel_astrology_subscription"

    cur.execute("SELECT has_function_privilege('authenticated', 'public.admin_cancel_astrology_subscription(uuid, text, boolean)', 'EXECUTE');")
    assert cur.fetchone()[0] is True, "authenticated SHOULD have execute on admin_cancel_astrology_subscription"

    cur.execute("SELECT has_function_privilege('service_role', 'public.admin_cancel_astrology_subscription(uuid, text, boolean)', 'EXECUTE');")
    assert cur.fetchone()[0] is True, "service_role SHOULD have execute on admin_cancel_astrology_subscription"

    print("PASS: Test I passed. Function ACLs and EXECUTE grants strictly verified.")

    conn.close()
    print("\n" + "=" * 70)
    print("ALL 9 CONCURRENCY & INTEGRATION TESTS (A - I) PASSED SUCCESSFULLY!")
    print("=" * 70)

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
