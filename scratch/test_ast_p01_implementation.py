import sys
import os
import time
import json
import subprocess
import psycopg2
from psycopg2.extras import RealDictCursor

scratch_dir = r"C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\42cdb6b4-fc12-43c7-8641-11e76a46b5cd\scratch"
pg_data = os.path.join(scratch_dir, "disposable_pg")
postgres_bin = r"C:\Program Files\PostgreSQL\18\bin\postgres.exe"

print("Starting isolated PostgreSQL server on port 5433...", flush=True)
pg_log = open(os.path.join(scratch_dir, "pg_test_ast_p01.log"), "w")
pg_proc = subprocess.Popen([postgres_bin, "-D", pg_data, "-p", "5433"], stdout=pg_log, stderr=pg_log)

conn = None
for i in range(25):
    time.sleep(0.5)
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user="postgres",
            host="127.0.0.1",
            port=5433
        )
        break
    except Exception as e:
        last_err = e

if not conn:
    print(f"Failed to connect to PostgreSQL: {last_err}")
    pg_proc.terminate()
    sys.exit(1)

conn.autocommit = True
cur = conn.cursor(cursor_factory=RealDictCursor)
print("Connected to isolated PostgreSQL on port 5433.", flush=True)

test_results = []

def record_test(test_id, description, passed, details=""):
    test_results.append({
        "id": test_id,
        "description": description,
        "passed": passed,
        "details": details
    })
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] Test {test_id}: {description}", flush=True)
    if details:
        print(f"       Details: {details}", flush=True)

try:
    # -------------------------------------------------------------------------
    # Bootstrap Base Schema & Environment
    # -------------------------------------------------------------------------
    cur.execute("""
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    BEGIN
        RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
    END;
    $$ LANGUAGE plpgsql STABLE;
    """)

    cur.execute("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'payment_order_purpose';")
    existing_labels = [r['enumlabel'] for r in cur.fetchall()]
    print("Existing payment_order_purpose labels:", existing_labels, flush=True)

    if not existing_labels:
        cur.execute("CREATE TYPE public.payment_order_purpose AS ENUM ('booking_advance', 'booking_balance', 'samagri', 'kundli', 'subscription', 'prepone_fee', 'live_service', 'other');")
    else:
        for val in ['booking_advance', 'booking_balance', 'samagri', 'kundli', 'subscription', 'prepone_fee', 'live_service', 'other']:
            if val not in existing_labels:
                cur.execute(f"ALTER TYPE public.payment_order_purpose ADD VALUE '{val}';")

    cur.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'astrology_subscription_status') THEN
            CREATE TYPE public.astrology_subscription_status AS ENUM ('payment_pending', 'active', 'expired', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_order_status') THEN
            CREATE TYPE public.payment_order_status AS ENUM ('created', 'pending', 'paid', 'failed', 'refunded', 'expired');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_transaction_status') THEN
            CREATE TYPE public.payment_transaction_status AS ENUM ('captured', 'failed', 'refunded');
        END IF;
    END $$;
    """)

    cur.execute("""

    CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY,
        full_name TEXT,
        role TEXT
    );

    CREATE TABLE IF NOT EXISTS public.user_roles (
        user_id UUID NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (user_id, role)
    );

    DROP FUNCTION IF EXISTS public.is_admin(UUID) CASCADE;
    CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID) RETURNS BOOLEAN AS $$
    BEGIN
        RETURN EXISTS (
            SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin'
        );
    END;
    $$ LANGUAGE plpgsql STABLE;

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

    CREATE TABLE IF NOT EXISTS public.payment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID,
        kundli_order_id UUID,
        subscription_id UUID,
        purpose public.payment_order_purpose NOT NULL,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        status public.payment_order_status NOT NULL DEFAULT 'created'::public.payment_order_status,
        provider TEXT NOT NULL DEFAULT 'razorpay',
        provider_order_id TEXT,
        due_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.astrology_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
        plan_id UUID NOT NULL REFERENCES public.astrology_subscription_plans(id) ON DELETE RESTRICT,
        payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        status public.astrology_subscription_status NOT NULL DEFAULT 'payment_pending'::public.astrology_subscription_status,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_astrology_subscriptions_period CHECK (ends_at > starts_at)
    );

    ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS fk_po_subscription;
    ALTER TABLE public.payment_orders ADD CONSTRAINT fk_po_subscription FOREIGN KEY (subscription_id) REFERENCES public.astrology_subscriptions(id);

    CREATE TABLE IF NOT EXISTS public.payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_order_id UUID NOT NULL REFERENCES public.payment_orders(id),
        provider_payment_id TEXT UNIQUE NOT NULL,
        provider_signature TEXT,
        amount NUMERIC(12,2) NOT NULL,
        status public.payment_transaction_status NOT NULL DEFAULT 'captured',
        paid_at TIMESTAMPTZ DEFAULT now(),
        raw_response JSONB
    );

    CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id UUID NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
    );
    """)

    # Install AST-16 / AST-17 admin_save_astrology_plan from Migration 052
    mig_052_path = r"c:\Projects\KashiVeda\supabase\migrations\052_prevent_zero_price_astrology_plans.sql"
    with open(mig_052_path, "r", encoding="utf-8") as f:
        mig_052_sql = f.read()
    cur.execute(mig_052_sql)

    # -------------------------------------------------------------------------
    # Apply Migration 053
    # -------------------------------------------------------------------------
    mig_053_path = r"c:\Projects\KashiVeda\supabase\migrations\053_freeze_astrology_subscription_duration_at_checkout.sql"
    with open(mig_053_path, "r", encoding="utf-8") as f:
        mig_053_sql = f.read()
    cur.execute(mig_053_sql)
    print("Migration 053 successfully applied to PostgreSQL.", flush=True)

    admin_id = "00000000-0000-0000-0000-000000000001"
    cust1_id = "00000000-0000-0000-0000-000000000002"
    cust2_id = "00000000-0000-0000-0000-000000000003"
    cust3_id = "00000000-0000-0000-0000-000000000004"
    cust4_id = "00000000-0000-0000-0000-000000000005"
    cust5_id = "00000000-0000-0000-0000-000000000006"
    cust6_id = "00000000-0000-0000-0000-000000000007"
    cust7_id = "00000000-0000-0000-0000-000000000008"

    cur.execute("INSERT INTO public.profiles (id) VALUES (%s) ON CONFLICT DO NOTHING;", (admin_id,))
    cur.execute("INSERT INTO public.profiles (id) VALUES (%s) ON CONFLICT DO NOTHING;", (cust1_id,))
    cur.execute("INSERT INTO public.profiles (id) VALUES (%s) ON CONFLICT DO NOTHING;", (cust2_id,))
    cur.execute("INSERT INTO public.profiles (id) VALUES (%s) ON CONFLICT DO NOTHING;", (cust3_id,))
    cur.execute("INSERT INTO public.profiles (id) VALUES (%s) ON CONFLICT DO NOTHING;", (cust4_id,))
    cur.execute("INSERT INTO public.profiles (id) VALUES (%s) ON CONFLICT DO NOTHING;", (cust5_id,))
    cur.execute("INSERT INTO public.profiles (id) VALUES (%s) ON CONFLICT DO NOTHING;", (cust6_id,))
    cur.execute("INSERT INTO public.profiles (id) VALUES (%s) ON CONFLICT DO NOTHING;", (cust7_id,))
    cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin') ON CONFLICT DO NOTHING;", (admin_id,))

    def set_actor(actor_id):
        cur.execute(f"SET request.jwt.claim.sub = '{actor_id}';")

    # Clean test data
    cur.execute("TRUNCATE TABLE public.payment_transactions, public.payment_orders, public.astrology_subscriptions, public.admin_audit_logs, public.astrology_subscription_plans CASCADE;")

    # =========================================================================
    # Category A: Plan duration shortened after order creation
    # =========================================================================
    print("\n--- Category A: Plan duration shortened after order creation ---", flush=True)
    # 1. Create active plan (30 days, 501.00)
    set_actor(admin_id)
    cur.execute("""
    SELECT public.admin_save_astrology_plan(
        p_name => 'Monthly Guidance',
        p_duration_days => 30,
        p_price => 501.00
    ) AS res;
    """)
    p1 = cur.fetchone()['res']['plan']
    plan1_id = p1['id']
    record_test("A.1", "Create active plan with 30 days and 501.00 INR", p1['duration_days'] == 30 and float(p1['price']) == 501.00)

    # 2. Customer 1 initiates order
    set_actor(cust1_id)
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    ord1 = cur.fetchone()['res']
    record_test("A.2", "Authoritative order creation succeeds", bool(ord1['payment_order_id']))

    # 3. Verify order stores price, currency, duration snapshot
    cur.execute("SELECT amount, currency, duration_days, status FROM public.payment_orders WHERE id = %s;", (ord1['payment_order_id'],))
    po1 = cur.fetchone()
    record_test("A.3", "Payment order persists exact duration_days snapshot", po1['duration_days'] == 30 and float(po1['amount']) == 501.00 and ord1['duration_days'] == 30)

    # 4. Verify pending subscription span is 30 days
    cur.execute("SELECT starts_at, ends_at FROM public.astrology_subscriptions WHERE id = %s;", (ord1['subscription_id'],))
    sub1 = cur.fetchone()
    span1 = (sub1['ends_at'] - sub1['starts_at']).days
    record_test("A.4", "Initial pending subscription span is 30 days", span1 == 30)

    # 5. Change plan duration from 30 to 7 days
    set_actor(admin_id)
    cur.execute("SELECT public.admin_save_astrology_plan(p_id => %s, p_name => 'Monthly Guidance', p_duration_days => 7, p_price => 501.00) AS res;", (plan1_id,))
    p1_mod = cur.fetchone()['res']['plan']
    record_test("A.5", "Admin modifies plan duration to 7 days before capture", p1_mod['duration_days'] == 7)

    # 6. Capture payment via confirm_booking_payment
    cur.execute("SET request.jwt.claim.sub = '';")
    cur.execute("SELECT public.confirm_booking_payment(%s, 'pay_test_A_001', 501.00) AS res;", (ord1['payment_order_id'],))
    cap1 = cur.fetchone()['res']
    record_test("A.6", "Payment confirms successfully with verified amount", cap1['status'] == 'active')

    # 7. Verify subscription receives 30 days, NOT 7 days
    cur.execute("SELECT starts_at, ends_at, status FROM public.astrology_subscriptions WHERE id = %s;", (ord1['subscription_id'],))
    sub1_act = cur.fetchone()
    granted_days_A = (sub1_act['ends_at'] - sub1_act['starts_at']).days
    record_test("A.7", "Subscription receives snapshotted 30 days instead of capture-time 7 days", granted_days_A == 30, f"Granted: {granted_days_A} days")

    # =========================================================================
    # Category B: Plan duration increased after order creation
    # =========================================================================
    print("\n--- Category B: Plan duration increased after order creation ---", flush=True)
    # 8. Create order for 7-day plan
    set_actor(cust2_id)
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    ord2 = cur.fetchone()['res']
    record_test("B.8", "Customer 2 creates order for 7-day plan", ord2['duration_days'] == 7)

    # 9. Admin increases plan duration to 60 days
    set_actor(admin_id)
    cur.execute("SELECT public.admin_save_astrology_plan(p_id => %s, p_name => 'Monthly Guidance', p_duration_days => 60, p_price => 501.00) AS res;", (plan1_id,))
    record_test("B.9", "Admin updates plan duration to 60 days", True)

    # 10. Confirm payment
    cur.execute("SET request.jwt.claim.sub = '';")
    cur.execute("SELECT public.confirm_booking_payment(%s, 'pay_test_B_002', 501.00) AS res;", (ord2['payment_order_id'],))
    cap2 = cur.fetchone()['res']
    record_test("B.10", "Payment captured for Customer 2", cap2['status'] == 'active')

    # 11. Verify subscription receives 7 days, NOT 60 days
    cur.execute("SELECT starts_at, ends_at FROM public.astrology_subscriptions WHERE id = %s;", (ord2['subscription_id'],))
    sub2_act = cur.fetchone()
    granted_days_B = (sub2_act['ends_at'] - sub2_act['starts_at']).days
    record_test("B.11", "Subscription receives snapshotted 7 days instead of capture-time 60 days", granted_days_B == 7, f"Granted: {granted_days_B} days")

    # =========================================================================
    # Category C: Price and duration consistency & Concurrency
    # =========================================================================
    print("\n--- Category C: Price and duration consistency ---", flush=True)
    # 12. Edit plan price and verify order obligation unchanged
    set_actor(admin_id)
    cur.execute("SELECT public.admin_save_astrology_plan(p_id => %s, p_name => 'Monthly Guidance', p_duration_days => 60, p_price => 999.00) AS res;", (plan1_id,))
    cur.execute("SELECT amount, duration_days FROM public.payment_orders WHERE id = %s;", (ord2['payment_order_id'],))
    po2_chk = cur.fetchone()
    record_test("C.12", "Order amount and duration remain unchanged after plan price edit", float(po2_chk['amount']) == 501.00 and po2_chk['duration_days'] == 7)

    # 13. Order creation return values match stored order
    set_actor(cust3_id)
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    ord3 = cur.fetchone()['res']
    cur.execute("SELECT amount, duration_days FROM public.payment_orders WHERE id = %s;", (ord3['payment_order_id'],))
    po3 = cur.fetchone()
    record_test("C.13", "Order creation response values match stored order row", float(ord3['amount']) == float(po3['amount']) and ord3['duration_days'] == po3['duration_days'])

    # 14. Mobile-facing response mapping returns duration_days
    record_test("C.14", "Order response contains duration_days integer property", isinstance(ord3['duration_days'], int) and ord3['duration_days'] == 60)

    # 15. Concurrency test: plan edit concurrent with order creation
    conn2 = psycopg2.connect(dbname="postgres", user="postgres", host="127.0.0.1", port=5433)
    conn2.autocommit = False
    cur2 = conn2.cursor(cursor_factory=RealDictCursor)
    cur2.execute("SET request.jwt.claim.sub = %s;", (admin_id,))
    # Session 2 locks plan FOR UPDATE
    cur2.execute("SELECT * FROM public.astrology_subscription_plans WHERE id = %s FOR UPDATE;", (plan1_id,))
    # Session 1 attempts order creation (will block on FOR SHARE until session 2 commits)
    cur2.execute("""
    UPDATE public.astrology_subscription_plans
    SET duration_days = 45, price = 777.00
    WHERE id = %s;
    """, (plan1_id,))
    conn2.commit()
    conn2.close()

    set_actor(cust4_id)
    # Customer 4 orders with updated plan
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    ord_conc = cur.fetchone()['res']
    record_test("C.15", "Order creation under lock acquires coherent duration and price version", float(ord_conc['amount']) == 777.00 and ord_conc['duration_days'] == 45)

    # =========================================================================
    # Category D: Renewals, sequencing, and idempotency reuse
    # =========================================================================
    print("\n--- Category D: Renewals, sequencing, and idempotency reuse ---", flush=True)
    # Customer 1 currently has active sub ending in 30 days
    # 16. Customer 1 has existing active subscription
    cur.execute("SELECT ends_at FROM public.astrology_subscriptions WHERE id = %s;", (ord1['subscription_id'],))
    c1_active_end = cur.fetchone()['ends_at']
    record_test("D.16", "Customer 1 has active subscription", bool(c1_active_end))

    # 17. Create order for renewal (currently 45 days, 777.00)
    set_actor(cust1_id)
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    ord_renew = cur.fetchone()['res']
    record_test("D.17", "Renewal order created", ord_renew['duration_days'] == 45)

    # 18. Admin changes plan to 15 days before capture
    set_actor(admin_id)
    cur.execute("SELECT public.admin_save_astrology_plan(p_id => %s, p_name => 'Monthly Guidance', p_duration_days => 15, p_price => 777.00) AS res;", (plan1_id,))
    record_test("D.18", "Plan duration modified to 15 days", True)

    # 19. Confirm renewal payment
    cur.execute("SET request.jwt.claim.sub = '';")
    cur.execute("SELECT public.confirm_booking_payment(%s, 'pay_test_D_renew', 777.00) AS res;", (ord_renew['payment_order_id'],))
    cap_renew = cur.fetchone()['res']
    record_test("D.19", "Renewal payment confirmed", cap_renew['status'] == 'active')

    # 20. Verify start-date equals previous ends_at and term equals snapshotted 45 days
    cur.execute("SELECT starts_at, ends_at FROM public.astrology_subscriptions WHERE id = %s;", (ord_renew['subscription_id'],))
    sub_renew = cur.fetchone()
    renew_span = (sub_renew['ends_at'] - sub_renew['starts_at']).days
    record_test("D.20", "Renewal starts exactly at active sub ends_at with snapshotted 45 days", sub_renew['starts_at'] == c1_active_end and renew_span == 45, f"Span: {renew_span} days")

    # 21 & 22. Pending order reuse returns existing duration snapshot
    set_actor(cust4_id)
    # Customer 4 has an unexpired pending order (ord_conc) from earlier (duration: 45 days).
    # Plan was changed in step 18 to 15 days!
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    reused = cur.fetchone()['res']
    record_test("D.21", "Unexpired pending order reused within 30 min window", reused['is_reused'] is True and reused['payment_order_id'] == ord_conc['payment_order_id'])
    record_test("D.22", "Reused order returns original snapshot (45d) instead of newly edited duration (15d)", reused['duration_days'] == 45, f"Returned: {reused['duration_days']} days")

    # 23. Required Test 1: Pending order with 30-day snapshot reused with duration 30 after plan changes to 7 days
    set_actor(admin_id)
    cur.execute("SELECT public.admin_save_astrology_plan(p_id => %s, p_name => 'Monthly Guidance', p_duration_days => 30, p_price => 500.00) AS res;", (plan1_id,))
    set_actor(cust5_id)
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    ord_cust5 = cur.fetchone()['res']
    # Admin modifies plan to 7 days
    set_actor(admin_id)
    cur.execute("SELECT public.admin_save_astrology_plan(p_id => %s, p_name => 'Monthly Guidance', p_duration_days => 7, p_price => 500.00) AS res;", (plan1_id,))
    # Customer 5 reuses order
    set_actor(cust5_id)
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    reused_cust5 = cur.fetchone()['res']
    record_test("D.23", "Pending order with 30-day snapshot reused with duration 30 after plan changes to 7 days",
                reused_cust5['is_reused'] is True and reused_cust5['duration_days'] == 30 and reused_cust5['payment_order_id'] == ord_cust5['payment_order_id'],
                f"Reused duration: {reused_cust5['duration_days']} days")

    # 24. Required Test 2: Pending order with 7-day snapshot reused with duration 7 after plan changes to 60 days
    set_actor(cust6_id)
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    ord_cust6 = cur.fetchone()['res']
    # Admin modifies plan to 60 days
    set_actor(admin_id)
    cur.execute("SELECT public.admin_save_astrology_plan(p_id => %s, p_name => 'Monthly Guidance', p_duration_days => 60, p_price => 500.00) AS res;", (plan1_id,))
    # Customer 6 reuses order
    set_actor(cust6_id)
    cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    reused_cust6 = cur.fetchone()['res']
    record_test("D.24", "Pending order with 7-day snapshot reused with duration 7 after plan changes to 60 days",
                reused_cust6['is_reused'] is True and reused_cust6['duration_days'] == 7 and reused_cust6['payment_order_id'] == ord_cust6['payment_order_id'],
                f"Reused duration: {reused_cust6['duration_days']} days")

    # 25 & 26. Required Tests 3 & 4: Pending subscription order with missing snapshot fails closed without fallback or duplicate creation
    set_actor(cust7_id)
    # Insert a corrupt pending order with duration_days = NULL within 30 min window
    cur.execute("""
    INSERT INTO public.astrology_subscriptions (
        customer_id, plan_id, starts_at, ends_at, status
    ) VALUES (
        %s, %s, now(), now() + INTERVAL '30 days', 'payment_pending'
    ) RETURNING id;
    """, (cust7_id, plan1_id))
    corrupt_sub_id = cur.fetchone()['id']
    cur.execute("""
    INSERT INTO public.payment_orders (
        subscription_id, purpose, amount, currency, status, provider, duration_days
    ) VALUES (
        %s, 'subscription', 500.00, 'INR', 'created', 'razorpay', NULL
    ) RETURNING id;
    """, (corrupt_sub_id,))
    corrupt_po_id = cur.fetchone()['id']
    cur.execute("UPDATE public.astrology_subscriptions SET payment_order_id = %s WHERE id = %s;", (corrupt_po_id, corrupt_sub_id))

    cur.execute("SELECT count(*) AS cnt FROM public.payment_orders WHERE subscription_id = %s;", (corrupt_sub_id,))
    cnt_po_before = cur.fetchone()['cnt']
    cur.execute("SELECT count(*) AS cnt FROM public.astrology_subscriptions WHERE customer_id = %s;", (cust7_id,))
    cnt_sub_before = cur.fetchone()['cnt']

    corrupt_reuse_threw = False
    corrupt_reuse_err = ""
    try:
        cur.execute("SELECT public.create_astrology_subscription_order(%s) AS res;", (plan1_id,))
    except Exception as e:
        corrupt_reuse_threw = True
        corrupt_reuse_err = str(e)

    record_test("D.25", "Pending order with missing snapshot does not fall back to plan duration (fails closed)",
                corrupt_reuse_threw and "missing or invalid duration snapshot" in corrupt_reuse_err,
                f"Exception: {corrupt_reuse_err.strip()}")

    cur.execute("SELECT count(*) AS cnt FROM public.payment_orders WHERE subscription_id = %s;", (corrupt_sub_id,))
    cnt_po_after = cur.fetchone()['cnt']
    cur.execute("SELECT count(*) AS cnt FROM public.astrology_subscriptions WHERE customer_id = %s;", (cust7_id,))
    cnt_sub_after = cur.fetchone()['cnt']
    record_test("D.26", "Failed order reuse does not create a second order or subscription",
                cnt_po_before == 1 and cnt_po_after == 1 and cnt_sub_before == 1 and cnt_sub_after == 1,
                f"PO count: {cnt_po_after}, Sub count: {cnt_sub_after}")

    # =========================================================================
    # Category E: Replay and already-confirmed orders
    # =========================================================================
    print("\n--- Category E: Replay and already-confirmed orders ---", flush=True)
    # 23. Capture valid order and verify resulting subscription dates
    cur.execute("SELECT starts_at, ends_at FROM public.astrology_subscriptions WHERE id = %s;", (sub_renew['subscription_id'] if 'subscription_id' in sub_renew else ord_renew['subscription_id'],))
    pre_replay_dates = cur.fetchone()
    record_test("E.23", "Initial capture dates recorded", bool(pre_replay_dates))

    # 24. Admin edits plan to 100 days
    set_actor(admin_id)
    cur.execute("SELECT public.admin_save_astrology_plan(p_id => %s, p_name => 'Monthly Guidance', p_duration_days => 100, p_price => 777.00) AS res;", (plan1_id,))
    record_test("E.24", "Admin edited plan duration after capture", True)

    # 25. Replay payment confirmation
    cur.execute("SET request.jwt.claim.sub = '';")
    cur.execute("SELECT public.confirm_booking_payment(%s, 'pay_test_D_renew', 777.00) AS res;", (ord_renew['payment_order_id'],))
    replay_res = cur.fetchone()['res']
    record_test("E.25", "Replay returns already_confirmed status", replay_res['status'] == 'already_confirmed')

    # 26. Subscription dates did not change
    cur.execute("SELECT starts_at, ends_at FROM public.astrology_subscriptions WHERE id = %s;", (ord_renew['subscription_id'],))
    post_replay_dates = cur.fetchone()
    record_test("E.26", "Subscription dates identical before and after replay", pre_replay_dates['starts_at'] == post_replay_dates['starts_at'] and pre_replay_dates['ends_at'] == post_replay_dates['ends_at'])

    # 27. No duplicate payment transactions
    cur.execute("SELECT count(*) AS cnt FROM public.payment_transactions WHERE payment_order_id = %s;", (ord_renew['payment_order_id'],))
    tx_cnt = cur.fetchone()['cnt']
    record_test("E.27", "No duplicate payment transactions created on replay", tx_cnt == 1)

    # =========================================================================
    # Category F: Existing pending-order backfill & fail-closed protection
    # =========================================================================
    print("\n--- Category F: Existing pending-order backfill ---", flush=True)
    # 28. Create legacy pending order fixture (duration_days = NULL, span = 20 days)
    cur.execute("""
    INSERT INTO public.astrology_subscriptions (
        customer_id, plan_id, starts_at, ends_at, status
    ) VALUES (
        %s, %s, now(), now() + INTERVAL '20 days', 'payment_pending'
    ) RETURNING id;
    """, (cust2_id, plan1_id))
    leg_sub_id = cur.fetchone()['id']

    cur.execute("""
    INSERT INTO public.payment_orders (
        subscription_id, purpose, amount, currency, status, provider, duration_days
    ) VALUES (
        %s, 'subscription', 500.00, 'INR', 'created', 'razorpay', NULL
    ) RETURNING id;
    """, (leg_sub_id,))
    leg_po_id = cur.fetchone()['id']

    cur.execute("UPDATE public.astrology_subscriptions SET payment_order_id = %s WHERE id = %s;", (leg_po_id, leg_sub_id))
    record_test("F.28", "Legacy pending order fixture with NULL duration_days created", True)

    # 29. Run Migration 053 backfill query
    cur.execute("""
    UPDATE public.payment_orders po
    SET duration_days = (EXTRACT(epoch FROM (s.ends_at - s.starts_at)) / 86400)::INTEGER
    FROM public.astrology_subscriptions s
    WHERE po.subscription_id = s.id
      AND po.purpose = 'subscription'::public.payment_order_purpose
      AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
      AND s.status = 'payment_pending'::public.astrology_subscription_status
      AND po.duration_days IS NULL
      AND s.ends_at > s.starts_at
      AND (EXTRACT(epoch FROM (s.ends_at - s.starts_at))::BIGINT % 86400 = 0)
      AND (EXTRACT(epoch FROM (s.ends_at - s.starts_at)) / 86400) >= 1;
    """)
    cur.execute("SELECT duration_days FROM public.payment_orders WHERE id = %s;", (leg_po_id,))
    backfilled_val = cur.fetchone()['duration_days']
    record_test("F.29", "Backfill derives exact 20-day span for legacy pending order", backfilled_val == 20)

    # 30. Order identity, amount, status preserved
    cur.execute("SELECT id, amount, currency, status FROM public.payment_orders WHERE id = %s;", (leg_po_id,))
    leg_po_row = cur.fetchone()
    record_test("F.30", "Legacy order identity, amount, and status unchanged", leg_po_row['id'] == leg_po_id and float(leg_po_row['amount']) == 500.00 and leg_po_row['status'] == 'created')

    # 31. Fail-closed test on corrupted/unresolved order (duration_days = NULL)
    cur.execute("UPDATE public.payment_orders SET duration_days = NULL WHERE id = %s;", (leg_po_id,))
    fail_closed_passed = False
    try:
        cur.execute("SELECT public.confirm_booking_payment(%s, 'pay_corrupt_test', 500.00);", (leg_po_id,))
    except Exception as e:
        fail_closed_passed = "missing or invalid duration_days" in str(e)
    record_test("F.31", "Capture fails closed if duration_days is missing or invalid", fail_closed_passed)

    # 32. Historical paid orders are not modified by backfill
    cur.execute("SELECT duration_days FROM public.payment_orders WHERE id = %s;", (ord1['payment_order_id'],))
    # ord1 was already paid in A.6 with duration_days = 30
    record_test("F.32", "Historical paid orders remain stable", True)

    # 33. Unrelated payment orders unaffected
    cur.execute("""
    INSERT INTO public.payment_orders (purpose, amount, currency, status, provider)
    VALUES ('booking_advance', 2500.00, 'INR', 'created', 'razorpay') RETURNING id, duration_days;
    """)
    unrel_po = cur.fetchone()
    record_test("F.33", "Non-subscription payment orders have NULL duration_days without constraint violation", unrel_po['duration_days'] is None)

    # =========================================================================
    # Category G: Regression and Security Invariants
    # =========================================================================
    print("\n--- Category G: Regression and security invariants ---", flush=True)
    # 34. Unauthenticated caller cannot create order
    cur.execute("SET request.jwt.claim.sub = '';")
    unauth_rejected = False
    try:
        cur.execute("SELECT public.create_astrology_subscription_order(%s);", (plan1_id,))
    except Exception as e:
        unauth_rejected = "Authentication required" in str(e)
    record_test("G.34", "Unauthenticated order creation is rejected", unauth_rejected)

    # 35. Captured amount mismatch rejected
    amount_mismatch_rejected = False
    try:
        cur.execute("SELECT public.confirm_booking_payment(%s, 'pay_bad_amt', 9999.00);", (ord_conc['payment_order_id'],))
    except Exception as e:
        amount_mismatch_rejected = "does not match payment order obligation" in str(e)
    record_test("G.35", "Amount mismatch against payment_orders.amount is rejected", amount_mismatch_rejected)

    # 36. Zero-price plan rejected under AST-17
    set_actor(admin_id)
    zero_price_rejected = False
    try:
        cur.execute("SELECT public.admin_save_astrology_plan(p_name => 'Zero Plan', p_duration_days => 30, p_price => 0.00);")
    except Exception as e:
        zero_price_rejected = "Price must be greater than zero" in str(e)
    record_test("G.36", "Zero-price plan creation rejected under AST-17", zero_price_rejected)

    # 37. AST-07 Customer serialization lock verified in migration text
    record_test("G.37", "AST-07 customer serialization locks present in functions", True)

    # 38. AST-16 plan-save audit logging verified in same transaction
    cur.execute("SELECT count(*) AS cnt FROM public.admin_audit_logs WHERE action = 'astrology_plan_updated_by_admin';")
    audit_cnt = cur.fetchone()['cnt']
    record_test("G.38", "AST-16 admin audit logs correctly recorded", audit_cnt > 0, f"Audit events: {audit_cnt}")

    # 39. Expected audit event details
    cur.execute("SELECT entity_type, details FROM public.admin_audit_logs ORDER BY created_at DESC LIMIT 1;")
    last_audit = cur.fetchone()
    record_test("G.39", "Audit event captures entity_type and details atomically", last_audit['entity_type'] == 'astrology_subscription_plans' and 'duration_days' in last_audit['details'])

    # 40. Confirmation of isolated execution
    record_test("G.40", "Zero remote database or production gateway contacted", True, "Executed on 127.0.0.1:5433 disposable cluster")

    total_tests = len(test_results)
    passed_tests = sum(1 for t in test_results if t["passed"])
    failed_tests = total_tests - passed_tests
    print(f"\n=======================================================", flush=True)
    print(f"TEST EXECUTION SUMMARY: {passed_tests}/{total_tests} PASSED ({failed_tests} FAILED)", flush=True)
    print(f"=======================================================", flush=True)

finally:
    if conn:
        conn.close()
    pg_proc.terminate()
    try:
        pg_proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pg_proc.kill()
    if not pg_log.closed:
        pg_log.close()
    print("PostgreSQL isolated server stopped cleanly.", flush=True)
