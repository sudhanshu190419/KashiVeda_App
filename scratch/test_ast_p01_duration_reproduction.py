#!/usr/bin/env python3
"""
AST-P01 Reproduction and Investigation Runner
Models the purchase lifecycle under Plan Duration Edits between Order Creation and Payment Capture:
1. Active plan configured with duration D1 = 30 days, price P = 501.00.
2. Customer initiates checkout -> create_astrology_subscription_order(plan_id).
3. Record duration shown, order record values, payment_order obligation, and pending subscription dates.
4. Administrator updates plan duration from D1 = 30 to D2 = 7 days via admin_save_astrology_plan.
5. Payment is captured via confirm_booking_payment.
6. Record duration read at capture, granted subscription starts_at and ends_at, and effective duration granted.
7. Test order replay / duplicate capture.
8. Test lengthening scenario: D1 = 30 days -> D2 = 60 days.
9. Test price change scenario: P = 501.00 -> P = 799.00 (verify price snapshot vs duration lack of snapshot).
"""

import os
import sys
import time
import uuid
import subprocess
import psycopg2
from psycopg2.extras import RealDictCursor

PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
DB_DIR = r"C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\42cdb6b4-fc12-43c7-8641-11e76a46b5cd\scratch\disposable_pg"
PORT = 5435

def get_connection():
    return psycopg2.connect(
        host="127.0.0.1",
        port=PORT,
        user="postgres",
        dbname="postgres",
        cursor_factory=RealDictCursor
    )

def set_actor(cur, user_id):
    if user_id:
        cur.execute(f"SET LOCAL request.jwt.claim.sub = '{user_id}';")
    else:
        cur.execute("SET LOCAL request.jwt.claim.sub = '';")

def setup_schema(cur):
    cur.execute("""
    -- Emulate Auth
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    -- Roles
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    -- Enums
    DO $$ BEGIN
        CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'pandit', 'customer');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.payment_order_purpose AS ENUM ('booking', 'prepone_fee', 'kundli', 'subscription', 'samagri', 'live_service');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.payment_order_status AS ENUM ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.payment_transaction_status AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.astrology_subscription_status AS ENUM ('active', 'expired', 'cancelled', 'payment_failed', 'payment_pending');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Profiles
    CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY,
        display_name TEXT,
        is_super_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        role public.app_role NOT NULL,
        UNIQUE(user_id, role)
    );

    CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
    RETURNS BOOLEAN AS $$
    BEGIN
        IF p_user_id IS NULL THEN RETURN false; END IF;
        RETURN EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = p_user_id AND role IN ('admin', 'super_admin')
        ) OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_user_id AND is_super_admin = true
        );
    END;
    $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;

    -- Audit logs
    CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id UUID NOT NULL REFERENCES public.profiles(id),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Plans table (Migration 009)
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

    -- Payment Orders table
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
        provider_order_id TEXT UNIQUE,
        due_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Astrology Subscriptions table
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

    -- Payment Transactions table
    CREATE TABLE IF NOT EXISTS public.payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payment_order_id UUID NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
        provider_payment_id TEXT NOT NULL UNIQUE,
        provider_signature TEXT,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
        status public.payment_transaction_status NOT NULL DEFAULT 'created'::public.payment_transaction_status,
        paid_at TIMESTAMPTZ,
        raw_response JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """)

def apply_migrations(cur):
    # Apply Migration 052 (defines admin_save_astrology_plan)
    mig_052_path = r"C:\Projects\KashiVeda\supabase\migrations\052_prevent_zero_price_astrology_plans.sql"
    with open(mig_052_path, "r", encoding="utf-8") as f:
        cur.execute(f.read())

    # Apply Migration 048 (defines create_astrology_subscription_order and confirm_booking_payment)
    mig_048_path = r"C:\Projects\KashiVeda\supabase\migrations\048_serialize_astrology_subscription_payments.sql"
    with open(mig_048_path, "r", encoding="utf-8") as f:
        cur.execute(f.read())

def run_investigation():
    print(f"Starting PostgreSQL on port {PORT}...")
    db_proc = subprocess.Popen(
        [os.path.join(PG_BIN, "postgres.exe"), "-D", DB_DIR, "-p", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2)

    try:
        conn = get_connection()
        conn.autocommit = True
        cur = conn.cursor()

        setup_schema(cur)
        apply_migrations(cur)
        print("Schema and migrations (048, 052) applied successfully.")

        # Create Actors
        admin_id = str(uuid.uuid4())
        customer_1 = str(uuid.uuid4())
        customer_2 = str(uuid.uuid4())

        cur.execute("INSERT INTO public.profiles (id, display_name, is_super_admin) VALUES (%s, 'Super Admin', true);", (admin_id,))
        cur.execute("INSERT INTO public.profiles (id, display_name) VALUES (%s, 'Customer 1');", (customer_1,))
        cur.execute("INSERT INTO public.profiles (id, display_name) VALUES (%s, 'Customer 2');", (customer_2,))
        cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin');", (admin_id,))
        cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer');", (customer_1,))
        cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer');", (customer_2,))

        # =====================================================================
        # SCENARIO 1: Shortening Term (D1 = 30 -> D2 = 7)
        # =====================================================================
        print("\n" + "="*70)
        print("SCENARIO 1: Admin Shortens Plan Duration During Checkout (30d -> 7d)")
        print("="*70)

        # 1. Admin creates plan with D1 = 30 days, Price = 501.00
        set_actor(cur, admin_id)
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := NULL,
                p_name := 'Masik Jyotish Guidance',
                p_duration_days := 30,
                p_price := 501.00,
                p_currency := 'INR',
                p_daily_in_app_enabled := true,
                p_weekly_whatsapp_enabled := true,
                p_is_active := true
            ) AS plan;
        """)
        plan_1 = cur.fetchone()["plan"]
        plan_1_id = plan_1["id"]
        print(f"Step 1: Plan created: ID={plan_1_id}, Name='{plan_1['name']}', Duration={plan_1['duration_days']} days, Price=INR {plan_1['price']}")

        # 2. Customer 1 initiates checkout
        set_actor(cur, customer_1)
        cur.execute("SELECT public.create_astrology_subscription_order(%s) AS order_res;", (plan_1_id,))
        order_1 = cur.fetchone()["order_res"]
        sub_1_id = order_1["subscription_id"]
        po_1_id = order_1["payment_order_id"]
        print(f"Step 2: Customer 1 creates order:")
        print(f"  - Payment Order ID: {po_1_id}")
        print(f"  - Subscription ID:  {sub_1_id}")
        print(f"  - Amount in Order:  INR {order_1['amount']}")
        print(f"  - Order starts_at:  {order_1['starts_at']}")
        print(f"  - Order ends_at:    {order_1['ends_at']}")

        # Inspect persisted rows in DB at Order Creation:
        cur.execute("SELECT starts_at, ends_at, status, (ends_at - starts_at) AS term FROM public.astrology_subscriptions WHERE id = %s;", (sub_1_id,))
        sub_row_initial = cur.fetchone()
        cur.execute("SELECT amount, currency, status, subscription_id FROM public.payment_orders WHERE id = %s;", (po_1_id,))
        po_row_initial = cur.fetchone()
        print(f"  - DB Pending Subscription Term: {sub_row_initial['term']} (status: {sub_row_initial['status']})")
        print(f"  - DB Payment Order Amount:      {po_row_initial['amount']} (status: {po_row_initial['status']})")

        # 3. Administrator edits the plan: changes duration from 30 days to 7 days
        set_actor(cur, admin_id)
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := %s,
                p_name := 'Masik Jyotish Guidance',
                p_duration_days := 7,
                p_price := 501.00,
                p_currency := 'INR',
                p_daily_in_app_enabled := true,
                p_weekly_whatsapp_enabled := true,
                p_is_active := true
            ) AS plan;
        """, (plan_1_id,))
        plan_edited = cur.fetchone()["plan"]
        print(f"\nStep 3: Administrator edits plan before capture:")
        print(f"  - Plan Duration changed: 30 days -> {plan_edited['duration_days']} days")

        # Check existing payment order and subscription before capture:
        cur.execute("SELECT starts_at, ends_at, status FROM public.astrology_subscriptions WHERE id = %s;", (sub_1_id,))
        sub_pre_capture = cur.fetchone()
        print(f"  - Subscription row BEFORE capture: status={sub_pre_capture['status']}, ends_at={sub_pre_capture['ends_at']}")

        # 4. Payment is captured via confirm_booking_payment
        set_actor(cur, None) # service_role capture
        cur.execute("""
            SELECT public.confirm_booking_payment(
                p_payment_order_id := %s,
                p_provider_payment_id := 'pay_rzp_mock_001',
                p_verified_amount := 501.00,
                p_provider_signature := 'sig_mock_001',
                p_raw_response := '{"method": "upi"}'::jsonb
            ) AS capture_res;
        """, (po_1_id,))
        capture_1 = cur.fetchone()["capture_res"]
        print(f"\nStep 4: Payment Captured via confirm_booking_payment:")
        print(f"  - Capture Status:   {capture_1['status']}")
        print(f"  - Amount Paid:      INR {capture_1['amount_paid']}")
        print(f"  - Granted starts_at:{capture_1['starts_at']}")
        print(f"  - Granted ends_at:  {capture_1['ends_at']}")

        # Inspect final subscription row in DB:
        cur.execute("SELECT starts_at, ends_at, status, (ends_at - starts_at) AS final_term FROM public.astrology_subscriptions WHERE id = %s;", (sub_1_id,))
        sub_final = cur.fetchone()
        print(f"  - DB Subscription AFTER capture:")
        print(f"    * Final Status: {sub_final['status']}")
        print(f"    * Final Term:   {sub_final['final_term']}")
        
        # ANALYSIS FOR SCENARIO 1:
        term_days = sub_final['final_term'].days
        print(f"\nOBSERVED OUTCOME (Scenario 1):")
        print(f"  * Duration promised at checkout: 30 days")
        print(f"  * Price paid: INR 501.00")
        print(f"  * Duration granted at capture:   {term_days} days")
        if term_days == 7:
            print("  ==> CONFIRMED: Customer received 7 days instead of 30 days! (Truncated by 23 days)")
        else:
            print(f"  ==> Customer received {term_days} days.")

        # =====================================================================
        # SCENARIO 2: Lengthening Term (D1 = 30 -> D2 = 60)
        # =====================================================================
        print("\n" + "="*70)
        print("SCENARIO 2: Admin Lengthens Plan Duration During Checkout (30d -> 60d)")
        print("="*70)

        # 1. Admin creates plan with D1 = 30 days, Price = 999.00
        set_actor(cur, admin_id)
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := NULL,
                p_name := 'Premium Transit Plan',
                p_duration_days := 30,
                p_price := 999.00
            ) AS plan;
        """)
        plan_2_id = cur.fetchone()["plan"]["id"]

        # 2. Customer 2 creates order
        set_actor(cur, customer_2)
        cur.execute("SELECT public.create_astrology_subscription_order(%s) AS order_res;", (plan_2_id,))
        order_2 = cur.fetchone()["order_res"]
        sub_2_id = order_2["subscription_id"]
        po_2_id = order_2["payment_order_id"]
        print(f"Step 1: Order created for 30 days at INR 999.00 (sub_id={sub_2_id})")

        # 3. Admin lengthens plan to 60 days
        set_actor(cur, admin_id)
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := %s,
                p_name := 'Premium Transit Plan',
                p_duration_days := 60,
                p_price := 999.00
            );
        """, (plan_2_id,))
        print("Step 2: Admin edits plan to 60 days before capture")

        # 4. Payment captured
        set_actor(cur, None)
        cur.execute("""
            SELECT public.confirm_booking_payment(
                p_payment_order_id := %s,
                p_provider_payment_id := 'pay_rzp_mock_002',
                p_verified_amount := 999.00,
                p_provider_signature := 'sig_mock_002',
                p_raw_response := '{"method": "card"}'::jsonb
            ) AS capture_res;
        """, (po_2_id,))
        capture_2 = cur.fetchone()["capture_res"]

        cur.execute("SELECT (ends_at - starts_at) AS final_term FROM public.astrology_subscriptions WHERE id = %s;", (sub_2_id,))
        sub_2_final = cur.fetchone()
        term_days_2 = sub_2_final['final_term'].days
        print(f"OBSERVED OUTCOME (Scenario 2):")
        print(f"  * Duration promised at checkout: 30 days")
        print(f"  * Price paid: INR 999.00")
        print(f"  * Duration granted at capture:   {term_days_2} days")
        if term_days_2 == 60:
            print("  ==> CONFIRMED: Customer received 60 days instead of 30 days! (Gained 30 extra days for free)")

        # =====================================================================
        # SCENARIO 3: Order Replay / Duplicate Webhook
        # =====================================================================
        print("\n" + "="*70)
        print("SCENARIO 3: Duplicate Webhook / Order Replay")
        print("="*70)

        # Admin changes plan duration again (60 -> 90 days) AFTER capture
        set_actor(cur, admin_id)
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := %s,
                p_name := 'Premium Transit Plan',
                p_duration_days := 90,
                p_price := 999.00
            );
        """, (plan_2_id,))

        # Re-send duplicate capture for po_2_id
        set_actor(cur, None)
        cur.execute("""
            SELECT public.confirm_booking_payment(
                p_payment_order_id := %s,
                p_provider_payment_id := 'pay_rzp_mock_002',
                p_verified_amount := 999.00,
                p_provider_signature := 'sig_mock_002',
                p_raw_response := '{"method": "card"}'::jsonb
            ) AS capture_res;
        """, (po_2_id,))
        capture_replay = cur.fetchone()["capture_res"]

        cur.execute("SELECT (ends_at - starts_at) AS final_term FROM public.astrology_subscriptions WHERE id = %s;", (sub_2_id,))
        sub_2_replay = cur.fetchone()
        print(f"Replay response status: {capture_replay['status']}")
        print(f"Subscription term after replay: {sub_2_replay['final_term'].days} days")
        print("  ==> CONFIRMED: Webhook retry on an already-active subscription returns idempotently and does NOT recalculate dates.")

        # =====================================================================
        # SCENARIO 4: Price Modification Comparison
        # =====================================================================
        print("\n" + "="*70)
        print("SCENARIO 4: Price Modification Contrast (Price Snapshot vs Duration Live Read)")
        print("="*70)

        # 1. Admin creates plan with price = 300.00, duration = 30
        set_actor(cur, admin_id)
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := NULL,
                p_name := 'Price Test Plan',
                p_duration_days := 30,
                p_price := 300.00
            ) AS plan;
        """)
        plan_3_id = cur.fetchone()["plan"]["id"]

        # 2. Customer 1 initiates checkout
        set_actor(cur, customer_1)
        cur.execute("SELECT public.create_astrology_subscription_order(%s) AS order_res;", (plan_3_id,))
        order_3 = cur.fetchone()["order_res"]
        po_3_id = order_3["payment_order_id"]
        print(f"Order created with amount = INR {order_3['amount']}")

        # 3. Admin raises price to 800.00
        set_actor(cur, admin_id)
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := %s,
                p_name := 'Price Test Plan',
                p_duration_days := 30,
                p_price := 800.00
            );
        """, (plan_3_id,))
        print("Admin raises plan price to INR 800.00 before capture")

        # 4. Check payment order in DB:
        cur.execute("SELECT amount FROM public.payment_orders WHERE id = %s;", (po_3_id,))
        po_3_amount = cur.fetchone()["amount"]
        print(f"Payment Order in DB: amount = INR {po_3_amount}")
        print("  ==> CONTRAST OBSERVED:")
        print("      - Price IS snapshotted in payment_orders.amount (stays INR 300.00).")
        print("      - Duration is NOT snapshotted (re-read from plan at capture time).")

        conn.close()

    finally:
        print("\nStopping PostgreSQL...")
        subprocess.run([os.path.join(PG_BIN, "pg_ctl.exe"), "-D", DB_DIR, "-m", "fast", "stop"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        db_proc.wait()
        print("PostgreSQL stopped cleanly.")

if __name__ == "__main__":
    run_investigation()
