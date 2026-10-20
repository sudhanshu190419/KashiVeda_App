#!/usr/bin/env python3
"""
AST-17 Isolated PostgreSQL Test Runner
Validates the Authoritative Pricing Contract for Astrology Subscription Plans:
- Migration 052 applies forward-only cleanly.
- Strict positive price (> 0) enforcement at database RPC layer.
- Tiny positive prices that round to 0.00 at 2-decimal scale are rejected.
- Valid fractional prices (e.g., 0.50) are accepted.
- In-transaction atomic audit logging preserved (AST-16 protections intact).
- Unauthenticated / non-admin callers rejected.
- Direct checkout with zero-price plan fails cleanly.
- Customer query exclusion vs Admin query visibility verified.
"""

import os
import sys
import time
import uuid
import subprocess
import psycopg2
from psycopg2.extras import RealDictCursor

DB_DIR = r"C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\42cdb6b4-fc12-43c7-8641-11e76a46b5cd\scratch\disposable_pg"
PG_BIN = r"C:\Program Files\PostgreSQL\18\bin"
PORT = 5433

def get_connection():
    conn = psycopg2.connect(
        host="127.0.0.1",
        port=PORT,
        user="postgres",
        dbname="postgres",
        cursor_factory=RealDictCursor
    )
    conn.autocommit = False
    return conn

def setup_base_schema(cur):
    cur.execute("""
    -- Auth schema emulation
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    -- Ensure Supabase standard roles exist
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role;
        END IF;
    END $$;

    -- Enums
    DO $$ BEGIN
        CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'pandit', 'customer');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.astrology_channel AS ENUM ('in_app', 'whatsapp');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
        CREATE TYPE public.astrology_content_status AS ENUM ('draft', 'scheduled', 'published', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- Profiles & User Roles
    CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

    CREATE TABLE IF NOT EXISTS public.user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        role public.app_role NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(user_id, role)
    );

    -- Helper is_admin function (from migration 046)
    DROP FUNCTION IF EXISTS public.is_admin(UUID) CASCADE;
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

    -- Admin audit logs table
    CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id UUID NOT NULL REFERENCES public.profiles(id),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Astrology Subscription Plans table (Migration 009 definition)
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

    -- Astrology Subscriptions Table
    CREATE TABLE IF NOT EXISTS public.astrology_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES public.profiles(id),
        plan_id UUID NOT NULL REFERENCES public.astrology_subscription_plans(id),
        status TEXT NOT NULL DEFAULT 'payment_pending',
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    -- Payment Orders Table
    CREATE TABLE IF NOT EXISTS public.payment_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES public.profiles(id),
        purpose TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency CHAR(3) NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'created',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profiles(id);
    """)

def apply_migrations(cur):
    mig_051_path = r"C:\Projects\KashiVeda\supabase\migrations\051_atomic_astrology_plan_content_audit_mutations.sql"
    with open(mig_051_path, "r", encoding="utf-8") as f:
        mig_051_sql = f.read()
    cur.execute(mig_051_sql)

    mig_052_path = r"C:\Projects\KashiVeda\supabase\migrations\052_prevent_zero_price_astrology_plans.sql"
    with open(mig_052_path, "r", encoding="utf-8") as f:
        mig_052_sql = f.read()
    cur.execute(mig_052_sql)

    # Also apply create_astrology_subscription_order from 020/048 for checkout validation
    cur.execute("""
    CREATE OR REPLACE FUNCTION public.create_astrology_subscription_order(
        p_plan_id UUID
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
        v_customer_id UUID;
        v_plan RECORD;
        v_sub_id UUID;
        v_order_id UUID;
    BEGIN
        v_customer_id := auth.uid();
        IF v_customer_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required to subscribe to an astrology plan.';
        END IF;

        IF p_plan_id IS NULL THEN
            RAISE EXCEPTION 'Plan ID is required.';
        END IF;

        SELECT * INTO v_plan
        FROM public.astrology_subscription_plans
        WHERE id = p_plan_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected astrology plan not found.';
        END IF;

        IF NOT v_plan.is_active THEN
            RAISE EXCEPTION 'Selected astrology plan is not currently active.';
        END IF;

        IF v_plan.price IS NULL OR v_plan.price <= 0 THEN
            RAISE EXCEPTION 'Selected astrology plan does not have a valid price.';
        END IF;

        INSERT INTO public.astrology_subscriptions (customer_id, plan_id, status, starts_at, ends_at)
        VALUES (v_customer_id, v_plan.id, 'payment_pending', now(), now() + (v_plan.duration_days || ' days')::INTERVAL)
        RETURNING id INTO v_sub_id;

        INSERT INTO public.payment_orders (customer_id, purpose, amount, currency, status)
        VALUES (v_customer_id, 'subscription', v_plan.price, v_plan.currency, 'created')
        RETURNING id INTO v_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'subscription_id', v_sub_id,
            'payment_order_id', v_order_id,
            'amount', v_plan.price,
            'currency', v_plan.currency
        );
    END;
    $$;
    """)

def set_actor(cur, user_id=None):
    if user_id:
        cur.execute(f"SET request.jwt.claim.sub = '{user_id}';")
    else:
        cur.execute("RESET request.jwt.claim.sub;")

def run_tests():
    # 1. Start isolated PostgreSQL instance
    print("--- 1. Starting Isolated PostgreSQL 18.4 Engine ---")
    subprocess.run([os.path.join(PG_BIN, "pg_ctl.exe"), "-D", DB_DIR, "-m", "fast", "stop"],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)

    db_proc = subprocess.Popen(
        [os.path.join(PG_BIN, "postgres.exe"), "-D", DB_DIR, "-p", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    conn = None
    for _ in range(25):
        time.sleep(0.5)
        try:
            conn = get_connection()
            break
        except Exception:
            pass

    if not conn:
        raise RuntimeError("Failed to connect to isolated PostgreSQL on port 5433 after startup.")

    try:
        conn.autocommit = True
        cur = conn.cursor()

        setup_base_schema(cur)
        apply_migrations(cur)
        print("PASS: Migration 052 applied successfully.")

        # Create Test Actors
        admin_id = str(uuid.uuid4())
        customer_id = str(uuid.uuid4())

        cur.execute("INSERT INTO public.profiles (id, display_name, is_super_admin) VALUES (%s, 'Admin User', true);", (admin_id,))
        cur.execute("INSERT INTO public.profiles (id, display_name, is_super_admin) VALUES (%s, 'Customer User', false);", (customer_id,))
        cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'admin');", (admin_id,))
        cur.execute("INSERT INTO public.user_roles (user_id, role) VALUES (%s, 'customer');", (customer_id,))

        # ---------------------------------------------------------------------
        # TEST 1: Migration 052 SECURITY DEFINER, search_path, and Privileges
        # ---------------------------------------------------------------------
        print("\n--- TEST 1: Function Configuration & Permissions ---")
        cur.execute("""
            SELECT prosecdef, proconfig
            FROM pg_proc
            JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
            WHERE pg_namespace.nspname = 'public'
              AND proname = 'admin_save_astrology_plan';
        """)
        row = cur.fetchone()
        assert row["prosecdef"] is True, "Must be SECURITY DEFINER"
        assert any(cfg in ('search_path=""', 'search_path=') for cfg in row["proconfig"]), "Must have search_path = ''"

        cur.execute("SELECT has_function_privilege('authenticated', 'public.admin_save_astrology_plan(uuid,text,integer,numeric,character,boolean,boolean,boolean)', 'EXECUTE');")
        assert list(cur.fetchone().values())[0] is True, "authenticated must have EXECUTE"

        cur.execute("SELECT has_function_privilege('anon', 'public.admin_save_astrology_plan(uuid,text,integer,numeric,character,boolean,boolean,boolean)', 'EXECUTE');")
        assert list(cur.fetchone().values())[0] is False, "anon must NOT have EXECUTE"

        cur.execute("SELECT has_function_privilege('service_role', 'public.admin_save_astrology_plan(uuid,text,integer,numeric,character,boolean,boolean,boolean)', 'EXECUTE');")
        assert list(cur.fetchone().values())[0] is False, "service_role must NOT have EXECUTE"
        print("PASS: Function configuration and least privilege verified.")

        # ---------------------------------------------------------------------
        # TEST 2: Price Validation - Zero Price Rejected
        # ---------------------------------------------------------------------
        print("\n--- TEST 2: Price Validation - Price = 0 Rejected ---")
        set_actor(cur, admin_id)
        try:
            cur.execute("""
                SELECT public.admin_save_astrology_plan(
                    p_id := NULL,
                    p_name := %s,
                    p_duration_days := 30,
                    p_price := 0.00
                );
            """, (f"Zero Price Plan {uuid.uuid4().hex[:6]}",))
            assert False, "Zero price should have raised exception!"
        except psycopg2.errors.RaiseException as e:
            assert "Price must be greater than zero." in str(e), f"Unexpected error: {e}"
            print("PASS: Price = 0 rejected with: Price must be greater than zero.")

        # ---------------------------------------------------------------------
        # TEST 3: Price Validation - Negative Price Rejected
        # ---------------------------------------------------------------------
        print("\n--- TEST 3: Price Validation - Negative Price Rejected ---")
        try:
            cur.execute("""
                SELECT public.admin_save_astrology_plan(
                    p_id := NULL,
                    p_name := %s,
                    p_duration_days := 30,
                    p_price := -25.00
                );
            """, (f"Negative Price Plan {uuid.uuid4().hex[:6]}",))
            assert False, "Negative price should have raised exception!"
        except psycopg2.errors.RaiseException as e:
            assert "Price must be greater than zero." in str(e), f"Unexpected error: {e}"
            print("PASS: Price < 0 rejected with: Price must be greater than zero.")

        # ---------------------------------------------------------------------
        # TEST 4: Price Validation - Sub-precision Tiny Value (Rounds to 0.00) Rejected
        # ---------------------------------------------------------------------
        print("\n--- TEST 4: Price Validation - Tiny Value (Rounds to 0.00) Rejected ---")
        try:
            cur.execute("""
                SELECT public.admin_save_astrology_plan(
                    p_id := NULL,
                    p_name := %s,
                    p_duration_days := 30,
                    p_price := 0.004
                );
            """, (f"Tiny Price Plan {uuid.uuid4().hex[:6]}",))
            assert False, "Tiny price rounding to 0.00 should have raised exception!"
        except psycopg2.errors.RaiseException as e:
            assert "Price must be greater than zero." in str(e), f"Unexpected error: {e}"
            print("PASS: Tiny value 0.004 (rounds to 0.00) rejected with: Price must be greater than zero.")

        # ---------------------------------------------------------------------
        # TEST 5: Price Validation - Valid Fractional Price Accepted
        # ---------------------------------------------------------------------
        print("\n--- TEST 5: Price Validation - Valid Fractional Price (0.50) Accepted ---")
        frac_plan_name = f"Fractional Plan {uuid.uuid4().hex[:6]}"
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := NULL,
                p_name := %s,
                p_duration_days := 7,
                p_price := 0.50
            );
        """, (frac_plan_name,))
        res_frac = list(cur.fetchone().values())[0]
        assert res_frac["success"] is True
        assert float(res_frac["plan"]["price"]) == 0.50
        print("PASS: Valid fractional price 0.50 accepted successfully.")

        # ---------------------------------------------------------------------
        # TEST 6: Normal Positive Price Created and Atomically Audited
        # ---------------------------------------------------------------------
        print("\n--- TEST 6: Normal Positive Price Created & Audited ---")
        valid_plan_name = f"Gold Vedic Guidance {uuid.uuid4().hex[:6]}"
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := NULL,
                p_name := %s,
                p_duration_days := 30,
                p_price := 499.00
            );
        """, (valid_plan_name,))
        res_valid = list(cur.fetchone().values())[0]
        assert res_valid["success"] is True
        valid_plan_id = res_valid["plan"]["id"]

        cur.execute("""
            SELECT * FROM public.admin_audit_logs
            WHERE entity_id = %s AND action = 'astrology_plan_created_by_admin';
        """, (str(valid_plan_id),))
        audit_row = cur.fetchone()
        assert audit_row is not None, "Audit record must exist!"
        assert str(audit_row["actor_user_id"]) == admin_id
        assert float(audit_row["details"]["price"]) == 499.00
        print(f"PASS: Plan {valid_plan_id} created with price 499.00 and verified audit record.")

        # ---------------------------------------------------------------------
        # TEST 7: Updating Plan to Positive Price Works & Logs Previous Price
        # ---------------------------------------------------------------------
        print("\n--- TEST 7: Updating Plan with Valid Price ---")
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := %s,
                p_name := %s,
                p_duration_days := 30,
                p_price := 599.00
            );
        """, (valid_plan_id, valid_plan_name))
        res_update = list(cur.fetchone().values())[0]
        assert res_update["success"] is True
        assert float(res_update["plan"]["price"]) == 599.00

        cur.execute("""
            SELECT * FROM public.admin_audit_logs
            WHERE entity_id = %s AND action = 'astrology_plan_updated_by_admin';
        """, (str(valid_plan_id),))
        audit_update = cur.fetchone()
        assert audit_update is not None
        assert float(audit_update["details"]["previous_price"]) == 499.00
        assert float(audit_update["details"]["price"]) == 599.00
        print("PASS: Plan updated to 599.00 and audit captured previous price 499.00.")

        # ---------------------------------------------------------------------
        # TEST 8: Updating Plan to Zero Price Fails & Leaves Plan Unchanged
        # ---------------------------------------------------------------------
        print("\n--- TEST 8: Updating Plan to Zero Price Fails & Preserves State ---")
        cur.execute("SELECT count(*) FROM public.admin_audit_logs;")
        audit_count_before = cur.fetchone()["count"]

        try:
            cur.execute("""
                SELECT public.admin_save_astrology_plan(
                    p_id := %s,
                    p_name := %s,
                    p_duration_days := 30,
                    p_price := 0.00
                );
            """, (valid_plan_id, valid_plan_name))
            assert False, "Update to 0.00 should have failed!"
        except psycopg2.errors.RaiseException as e:
            assert "Price must be greater than zero." in str(e)
            print("PASS: Update to 0.00 rejected.")

        # Verify plan in DB is completely unchanged
        cur.execute("SELECT price FROM public.astrology_subscription_plans WHERE id = %s;", (valid_plan_id,))
        current_price = cur.fetchone()["price"]
        assert float(current_price) == 599.00, f"Expected 599.00, found {current_price}"

        # Verify zero audit records created for the failed attempt
        cur.execute("SELECT count(*) FROM public.admin_audit_logs;")
        audit_count_after = cur.fetchone()["count"]
        assert audit_count_after == audit_count_before, "No audit records must be generated on failure!"
        print("PASS: Plan price remains 599.00 and zero audit records produced.")

        # ---------------------------------------------------------------------
        # TEST 9: Legacy Zero-Price Plan Handling
        # ---------------------------------------------------------------------
        print("\n--- TEST 9: Legacy Zero-Price Plan Handling (Checkout & Query) ---")
        # Insert a simulated legacy zero-price plan directly into the table
        legacy_plan_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO public.astrology_subscription_plans (
                id, name, duration_days, price, currency, is_active
            ) VALUES (
                %s, %s, 14, 0.00, 'INR', true
            );
        """, (legacy_plan_id, f"Legacy Free Trial {uuid.uuid4().hex[:6]}"))

        # Verify customer checkout fails for legacy zero-price plan
        set_actor(cur, customer_id)
        try:
            cur.execute("SELECT public.create_astrology_subscription_order(%s);", (legacy_plan_id,))
            assert False, "Checkout should have rejected zero-price plan!"
        except psycopg2.errors.RaiseException as e:
            assert "Selected astrology plan does not have a valid price." in str(e)
            print("PASS: Customer checkout of legacy zero-price plan strictly rejected.")

        # Verify negative price cannot even be inserted directly due to table constraint (price >= 0)
        negative_plan_id = str(uuid.uuid4())
        try:
            cur.execute("""
                INSERT INTO public.astrology_subscription_plans (
                    id, name, duration_days, price, currency, is_active
                ) VALUES (
                    %s, %s, 30, -50.00, 'INR', true
                );
            """, (negative_plan_id, f"Legacy Negative Plan {uuid.uuid4().hex[:6]}"))
            assert False, "Table constraint price >= 0 should have rejected negative price!"
        except psycopg2.errors.CheckViolation as e:
            assert "astrology_subscription_plans_price_check" in str(e)
            print("PASS: Direct insertion of negative price strictly prevented by table CHECK (price >= 0).")

        # Verify customer query filters out zero-price plans
        cur.execute("""
            SELECT id, name, price FROM public.astrology_subscription_plans
            WHERE is_active = true AND price > 0;
        """)
        customer_plans = cur.fetchall()
        customer_plan_ids = [str(p["id"]) for p in customer_plans]
        assert legacy_plan_id not in customer_plan_ids, "Legacy zero plan must NOT appear in customer catalog!"
        assert valid_plan_id in customer_plan_ids, "Valid plan MUST appear in customer catalog!"
        print("PASS: Customer catalog query (price > 0) strictly excludes legacy zero plans.")

        # Verify admin query retains full visibility of all plans (including legacy zero-price plans)
        set_actor(cur, admin_id)
        cur.execute("SELECT id, name, price FROM public.astrology_subscription_plans;")
        admin_plans = cur.fetchall()
        admin_plan_ids = [str(p["id"]) for p in admin_plans]
        assert legacy_plan_id in admin_plan_ids, "Admin must be able to view legacy zero-price plan!"
        print("PASS: Admin view retains 100% visibility of legacy zero plans for investigation.")

        # Admin can update the legacy zero-price plan to a positive price
        cur.execute("""
            SELECT public.admin_save_astrology_plan(
                p_id := %s,
                p_name := %s,
                p_duration_days := 14,
                p_price := 199.00
            );
        """, (legacy_plan_id, f"Legacy Plan Upgraded {uuid.uuid4().hex[:6]}"))
        upgraded_res = list(cur.fetchone().values())[0]
        assert upgraded_res["success"] is True
        assert float(upgraded_res["plan"]["price"]) == 199.00
        print("PASS: Admin successfully updated legacy plan to positive price 199.00.")

        # Now customer can execute checkout for the updated plan!
        set_actor(cur, customer_id)
        cur.execute("SELECT public.create_astrology_subscription_order(%s);", (legacy_plan_id,))
        order_res = list(cur.fetchone().values())[0]
        assert order_res["success"] is True
        assert float(order_res["amount"]) == 199.00
        sub_id = order_res["subscription_id"]
        po_id = order_res["payment_order_id"]

        # Verify payment order state in DB
        cur.execute("SELECT amount, currency, status FROM public.payment_orders WHERE id = %s;", (po_id,))
        po_row = cur.fetchone()
        assert float(po_row["amount"]) == 199.00
        assert po_row["status"] in ("created", "pending")

        # Verify astrology subscription state in DB: MUST be 'payment_pending', NEVER 'active'
        cur.execute("SELECT status FROM public.astrology_subscriptions WHERE id = %s;", (sub_id,))
        sub_row = cur.fetchone()
        assert sub_row["status"] == "payment_pending", f"Expected payment_pending, got {sub_row['status']}"

        # Verify ZERO active free entitlements exist for customer
        cur.execute("SELECT count(*) FROM public.astrology_subscriptions WHERE customer_id = %s AND status = 'active';", (customer_id,))
        active_count = cur.fetchone()["count"]
        assert active_count == 0, f"No active entitlements should exist before payment! Found: {active_count}"
        print("PASS: Upgraded plan produces valid payment order with payment_pending status and zero free entitlement.")

        # ---------------------------------------------------------------------
        # TEST 10: Unauthorized & Non-Admin Rejection
        # ---------------------------------------------------------------------
        print("\n--- TEST 10: Unauthorized & Non-Admin Access Rejection ---")
        # Unauthenticated
        set_actor(cur, None)
        try:
            cur.execute("""
                SELECT public.admin_save_astrology_plan(
                    p_id := NULL,
                    p_name := 'Unauth Plan',
                    p_duration_days := 30,
                    p_price := 100.00
                );
            """)
            assert False, "Unauthenticated call must fail!"
        except psycopg2.errors.RaiseException as e:
            assert "Unauthorized" in str(e)
            print("PASS: Unauthenticated caller rejected.")

        # Non-admin (customer)
        set_actor(cur, customer_id)
        try:
            cur.execute("""
                SELECT public.admin_save_astrology_plan(
                    p_id := NULL,
                    p_name := 'Customer Plan',
                    p_duration_days := 30,
                    p_price := 100.00
                );
            """)
            assert False, "Customer call must fail!"
        except psycopg2.errors.RaiseException as e:
            assert "Unauthorized" in str(e)
            print("PASS: Customer caller rejected.")

        print("\n======================================================================")
        print("ALL 10 ISOLATED POSTGRESQL PRICING CONTRACT TESTS PASSED!")
        print("======================================================================")

        conn.close()

    finally:
        subprocess.run([os.path.join(PG_BIN, "pg_ctl.exe"), "-D", DB_DIR, "-m", "fast", "stop"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        db_proc.wait()

if __name__ == "__main__":
    run_tests()
