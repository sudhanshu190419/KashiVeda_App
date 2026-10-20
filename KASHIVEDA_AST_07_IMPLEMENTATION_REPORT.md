# KASHIVEDA — AST-07 IMPLEMENTATION REPORT

**Remediation Target:** AST-07 (Distinct concurrent subscription orders can consume paid terms in parallel)  
**Reference Feature Audit:** `C:\Projects\KashiVeda\KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`  
**Previous Reports:** `KASHIVEDA_AST_06_IMPLEMENTATION_REPORT.md`, `KASHIVEDA_AST_06_FOLLOWUP_REPORT.md`  
**Date:** 2026-10-10  
**Scope:** Local database-level remediation and multi-connection concurrency test harness. No production deployment or modifications to historical migrations (001–047).

---

## 1. Root Cause Analysis Confirmed from Final Local SQL Definitions

In migration `020_astrology_subscription_payments.sql`, two database functions govern subscription purchase order creation and payment confirmation:
1. `public.create_astrology_subscription_order(p_plan_id UUID)`
2. `public.confirm_booking_payment(...)` (`WHEN 'subscription'` purpose branch)

Inspection of their authoritative implementations revealed two critical concurrency serialization defects:

### A. Non-Serialized Term Allocation in Payment Capture
In `confirm_booking_payment`:
- Transaction $T_1$ for payment order $O_1$ acquires a row-level lock on `payment_orders` ($O_1$) `FOR UPDATE` (line 229) and on `astrology_subscriptions` ($S_1$) `FOR UPDATE` (line 641).
- Transaction $T_2$ for distinct payment order $O_2$ acquires a row-level lock on `payment_orders` ($O_2$) `FOR UPDATE` and on `astrology_subscriptions` ($S_2$) `FOR UPDATE`.
- Because $O_1 \neq O_2$ and $S_1 \neq S_2$, **the row locks do not conflict**. Both transactions proceed concurrently without any mutual exclusion.
- Both transactions then execute a non-locking query:
  ```sql
  SELECT * INTO v_active_sub
  FROM public.astrology_subscriptions
  WHERE customer_id = v_subscription.customer_id
    AND id != v_subscription.id
    AND status = 'active'::public.astrology_subscription_status
    AND ends_at > now()
  ORDER BY ends_at DESC
  LIMIT 1;
  ```
- Under PostgreSQL `READ COMMITTED` isolation, neither transaction can see the other transaction's uncommitted subscription state.
- If the customer had no prior active subscription, both transactions see `v_active_sub IS NULL`. Both calculate `v_starts_at := now()` and `v_ends_at := now() + duration_days`.
- If the customer had an active subscription ending at timestamp $T_{exp}$, both transactions see `v_active_sub.ends_at = T_{exp}`. Both calculate `v_starts_at := T_{exp}` and `v_ends_at := T_{exp} + duration_days`.
- Both transactions commit, creating **100% overlapping subscription intervals** instead of sequentially extending the customer's access period. The customer pays for two periods but only receives one period of access.

### B. Race Condition in Pending Order Creation and Reuse
In `create_astrology_subscription_order`:
- Lines 78–89 query for an existing unexpired `payment_pending` subscription and order for the same plan within the 30-minute reuse window using a plain `SELECT` without row or customer locks.
- If two checkout requests arrive simultaneously for the same customer (e.g. rapid double-tap in the mobile app, network retry, or concurrent browser tabs), both transactions execute the reuse query before either has committed an `INSERT`.
- Both transactions find no pending order.
- Both transactions proceed to insert separate `astrology_subscriptions` rows and `payment_orders` rows.
- This creates duplicate pending orders and obligations, which can subsequently be presented to payment gateways and confirmed concurrently, triggering the term-overlap defect above.

---

## 2. The Concurrent Interleaving That Caused Overlapping Terms

The following timeline illustrates the race condition under concurrent payment confirmation:

| Step | Transaction $T_1$ (Order $O_1$, Sub $S_1$, Plan 30d) | Transaction $T_2$ (Order $O_2$, Sub $S_2$, Plan 30d) | Database State (`astrology_subscriptions`) |
| :--- | :--- | :--- | :--- |
| 1 | Webhook 1 arrives for $O_1$ | Webhook 2 arrives for $O_2$ | Sub $S_1$: `payment_pending`<br>Sub $S_2$: `payment_pending` |
| 2 | Locks row $O_1$ `FOR UPDATE` | Locks row $O_2$ `FOR UPDATE` | Locks on distinct rows; **no wait** |
| 3 | Locks row $S_1$ `FOR UPDATE` | Locks row $S_2$ `FOR UPDATE` | Locks on distinct rows; **no wait** |
| 4 | Queries active subs for Customer: finds none (`v_active_sub = NULL`) | Queries active subs for Customer: finds none (`v_active_sub = NULL`) | Neither sees other's uncommitted changes |
| 5 | Computes:<br>`starts_at := 2026-10-10 12:00`<br>`ends_at := 2026-11-09 12:00` | Computes:<br>`starts_at := 2026-10-10 12:00`<br>`ends_at := 2026-11-09 12:00` | Identical start & end dates computed |
| 6 | Updates $S_1$ to `active` with computed dates | Updates $S_2$ to `active` with computed dates | Both pending commits |
| 7 | Commits transaction $T_1$ | Commits transaction $T_2$ | **DEFECT:** $S_1$ and $S_2$ run from 10-Oct to 09-Nov in parallel.<br>Total duration: 30 days instead of 60 days. |

---

## 3. Chosen Customer-Specific Serialization Mechanism

To serialize transactions allocating subscription terms and evaluating pending orders without introducing unnecessary table locks or blocking unrelated customers, we introduced a **transaction-scoped PostgreSQL advisory lock keyed to the canonical customer UUID**:

```sql
PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5('astrology_subscription_customer:' || v_customer_id::text), 1, 16))::bit(64)::bigint
);
```

### Architectural Properties and Invariants:
1. **Transaction-Scoped (`pg_advisory_xact_lock`)**:  
   The lock is held strictly for the duration of the current transaction and is released automatically by the PostgreSQL kernel at transaction `COMMIT` or `ROLLBACK`. It requires no manual release and cannot leak across failures or exceptions.
2. **Canonical Customer Partitioning**:  
   The 64-bit integer lock key is derived deterministically from `v_customer_id`. Transactions operating on different customers generate completely distinct lock keys; unrelated customers proceed in parallel with zero contention.
3. **Independence of Row Existence**:  
   The lock does not require any row in `profiles`, `astrology_subscriptions`, or `payment_orders` to exist beforehand. It functions correctly for new customers who have never subscribed previously.
4. **Decoupled from Profile Table Locking**:  
   Unlike `SELECT ... FROM public.profiles WHERE id = v_customer_id FOR UPDATE`, the advisory lock does not contend with profile updates, phone verifications, avatar changes, or KYC workflows.
5. **Authoritative Post-Lock Re-Evaluation**:  
   After acquiring the advisory lock, the transaction immediately re-reads the latest active subscription for the customer (`ORDER BY ends_at DESC LIMIT 1`). Any term committed by a prior serialized transaction is immediately visible.

---

## 4. Lock Ordering Hierarchy Across Creation, Capture, and Cancellation

To prevent circular wait conditions (deadlocks), a strict global partial lock order is defined and enforced across all transaction paths:

$$\text{Level 1: } \text{payment\_orders} \ (\texttt{FOR UPDATE}) \longrightarrow \text{Level 2: } \text{astrology\_subscriptions} \ (\texttt{FOR UPDATE}) \longrightarrow \text{Level 3: Customer Advisory Lock}$$

### Transaction Path Comparison:

| Operation | Level 1: `payment_orders` | Level 2: `astrology_subscriptions` | Level 3: Customer Advisory Lock | Deadlock Analysis |
| :--- | :--- | :--- | :--- | :--- |
| **`confirm_booking_payment`** (Capture) | Row lock on target $O_i$ `FOR UPDATE` | Row lock on target $S_i$ `FOR UPDATE` | Acquires advisory lock for `customer_id` | Follows $1 \to 2 \to 3$ strictly. |
| **`create_astrology_subscription_order`** (Creation) | *None* (Inserts new row) | *None* (Inserts new row) | Acquires advisory lock for `customer_id` | Acquires Level 3 only. Holds no Level 1 or 2 locks when waiting. Cannot deadlock with capture. |
| **`admin_cancel_astrology_subscription`** (Cancellation) | Locks open `payment_orders` for $S_i$ `FOR UPDATE` | Row lock on target $S_i$ `FOR UPDATE` | *None* | Follows $1 \to 2$ strictly. Lock order harmonized with capture; circular wait between order and subscription rows eliminated. |

---

## 5. New Migration Details

- **Migration Filename:** `C:\Projects\KashiVeda\supabase\migrations\048_serialize_astrology_subscription_payments.sql`
- **Migration Type:** Forward-only PostgreSQL migration.
- **Historical Migrations Changed:** None (Migrations 001–047 remain completely untouched).

### Functions Defined in Migration 048:

| Function | Signature | Security / Search Path | Effective Roles |
| :--- | :--- | :--- | :--- |
| `public.create_astrology_subscription_order` | `(p_plan_id UUID) RETURNS JSONB` | `SECURITY DEFINER`, `search_path = public, extensions` | `REVOKE FROM PUBLIC, anon;`<br>`GRANT TO authenticated, service_role;` |
| `public.confirm_booking_payment` | `(p_payment_order_id UUID, p_provider_payment_id TEXT, p_verified_amount NUMERIC(12,2), p_provider_signature TEXT, p_raw_response JSONB) RETURNS JSONB` | `SECURITY DEFINER`, `search_path = public, extensions` | `REVOKE FROM PUBLIC, anon, authenticated;`<br>`GRANT TO service_role;` |
| `public.admin_cancel_astrology_subscription` | `(p_subscription_id UUID, p_reason TEXT, p_refund_eligible BOOLEAN) RETURNS JSONB` | `SECURITY DEFINER`, `search_path = public, extensions` | `REVOKE FROM PUBLIC, anon;`<br>`GRANT TO authenticated, service_role;` |

---

## 6. How Order Creation and Pending Reuse Is Serialized

In `create_astrology_subscription_order(p_plan_id UUID)`:
1. **Authentication:** Authenticates caller via `v_customer_id := auth.uid()`. Throws exception if unauthenticated.
2. **Plan Validation:** Locks plan row with `FOR SHARE` and validates active status, non-zero price, and positive duration.
3. **Customer Serialization Lock:** Acquires `pg_advisory_xact_lock` for `v_customer_id`.
4. **Idempotency / Reuse Check (Under Lock):**
   ```sql
   SELECT s.id AS subscription_id, po.id AS payment_order_id, po.amount, po.currency, s.starts_at, s.ends_at
   INTO v_existing_pending
   FROM public.astrology_subscriptions s
   JOIN public.payment_orders po ON po.id = s.payment_order_id
   WHERE s.customer_id = v_customer_id
     AND s.plan_id = v_plan.id
     AND s.status = 'payment_pending'::public.astrology_subscription_status
     AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
     AND po.created_at > (now() - INTERVAL '30 minutes')
   ORDER BY s.created_at DESC
   LIMIT 1;
   ```
5. **Reuse Return:** If found, returns existing order with `'is_reused': true`.
6. **Sequential Window Computation:** If not reusable, calculates `v_starts_at` and `v_ends_at` based on customer's latest active subscription under the same lock.
7. **Insertion:** Atomically inserts new `astrology_subscriptions` record and linked `payment_orders` record.
8. **Result:** Concurrent creation requests for the same plan serialize: the first transaction creates the pending order; the second transaction waits, re-checks, and reuses the newly created order.

---

## 7. How Payment Capture Validates and Allocates Subscription Periods

In `confirm_booking_payment(...)` under the `'subscription'` purpose branch:
1. **Order Pre-Validation:** Validates order exists, matches verified captured amount, and validates provider payment transaction idempotency.
2. **Idempotency Guard:** If payment order is already marked `'paid'`, returns `already_confirmed` idempotently.
3. **Row Locks:**
   - Level 1: `payment_orders` row locked `FOR UPDATE`.
   - Level 2: `astrology_subscriptions` row locked `FOR UPDATE`.
4. **Subscription Idempotency Guard:** If subscription status is already `'active'`, returns idempotent confirmation response immediately.
5. **Status Pre-Condition:** Verifies subscription status is `'payment_pending'`.
6. **Customer Serialization Lock:**
   ```sql
   PERFORM pg_advisory_xact_lock(
       ('x' || substr(md5('astrology_subscription_customer:' || v_subscription.customer_id::text), 1, 16))::bit(64)::bigint
   );
   ```
7. **Re-Reading Active Terms Under Lock:**
   ```sql
   SELECT * INTO v_active_sub
   FROM public.astrology_subscriptions
   WHERE customer_id = v_subscription.customer_id
     AND id != v_subscription.id
     AND status = 'active'::public.astrology_subscription_status
     AND ends_at > now()
   ORDER BY ends_at DESC
   LIMIT 1;

   IF v_active_sub.id IS NOT NULL THEN
       v_starts_at := v_active_sub.ends_at;
       v_ends_at := v_starts_at + (v_plan.duration_days || ' days')::INTERVAL;
   ELSE
       v_starts_at := now();
       v_ends_at := now() + (v_plan.duration_days || ' days')::INTERVAL;
   END IF;
   ```
8. **State Transition:** Updates `astrology_subscriptions` to `'active'` with sequentially allocated `starts_at` and `ends_at`.
9. **Atomic Commitment:** Payment transaction capture record and subscription activation commit atomically. The customer advisory lock is automatically released at transaction commit.

---

## 8. Database-Level Concurrency Test Suite Results

A dedicated multi-connection test harness (`scratch/test_astrology_payment_concurrency.py`) was executed against a clean disposable local PostgreSQL 18 instance (`postgresql-18.4`) running on port 5433 with genuine concurrent client connections and thread synchronization barriers.

### Test Execution Summary:

| Scenario | Objective | Interleaving & Concurrency Verification | Result |
| :--- | :--- | :--- | :--- |
| **Test A** | Two distinct orders, same customer | Two independent connections concurrently confirmed Order 1 (30d) and Order 2 (30d) behind a barrier. Sub 1 allocated `T0 -> T0 + 30d`. Sub 2 allocated `T0 + 30d -> T0 + 60d`. Exactly 60 total days sequential allocation. | **PASS** |
| **Test B** | Two distinct orders, different plans | Concurrently confirmed Order 1 (30d) and Order 2 (90d) for same customer. Sub 1 allocated 30d; Sub 2 sequentially appended 90d. Exactly 120 total days sequential duration. | **PASS** |
| **Test C** | Same-order concurrent replay | Duplicate webhook confirmations for same order submitted at identical millisecond. Exactly 1 transaction recorded; subscription activated once; second call returned `already_confirmed`. | **PASS** |
| **Test D** | Concurrent order creation requests | Two concurrent creation requests for same customer and same plan behind a barrier. First thread created order (`is_reused: false`); second thread reused order (`is_reused: true`). Exactly 1 pending order in DB. | **PASS** |
| **Test E** | Different customers | Concurrent confirmations for Customer E1 and Customer E2 executed simultaneously without cross-customer lock contention. | **PASS** |
| **Test F** | Cancellation vs capture | Interleaved concurrent capture and admin cancellation on same subscription. Verified zero deadlocks; global lock ordering ($1 \to 2$) held. | **PASS** |
| **Test G** | Payment validation and rollback | Induced payment amount mismatch (₹100 vs ₹299). Transaction rolled back cleanly; zero transaction records created; subscription remained `payment_pending`. | **PASS** |
| **Test H** | Renewal with existing active subscription | Customer had active subscription expiring in 15 days. Confirmed 30-day renewal order. Renewal `starts_at` began at active `ends_at` ($+15$d) and ended at $+45$d. No access truncated or restarted. | **PASS** |

**Outcome:** 8 out of 8 database-level concurrency tests passed.

---

## 9. Jest Regression Suite Results

All unit and regression test suites across authentication, astrology, and lifecycle management were executed and reconciled:

| Test Suite | File | Tests Passed | Status |
| :--- | :--- | :---: | :---: |
| **AST-07 Specification Suite** | `__tests__/astrology_subscription_payment_serialization.test.ts` | 14 / 14 | **PASS** |
| **Astrology Payment Backend** | `__tests__/astrology_payment_backend.test.ts` | 10 / 10 | **PASS** |
| **Subscription Selection (AST-06)** | `__tests__/daily_astrology_subscription_selection.test.tsx` | 16 / 16 | **PASS** |
| **Cache Security (AST-02)** | `__tests__/daily_astrology_cache_security.test.tsx` | 8 / 8 | **PASS** |
| **Stale Refresh Guard (AST-03)** | `__tests__/daily_astrology_stale_refresh_guard.test.tsx` | 7 / 7 | **PASS** |
| **State Refresh Lifecycle (AST-04)** | `__tests__/daily_astrology_state_refresh_lifecycle.test.tsx` | 11 / 11 | **PASS** |
| **Entitlement Revalidation** | `__tests__/daily_astrology_entitlement_revalidation.test.tsx` | 12 / 12 | **PASS** |
| **Error Classification (AST-05)** | `__tests__/daily_astrology_error_classification.test.tsx` | 23 / 23 | **PASS** |
| **Vedic Astrology Insights** | `__tests__/daily_vedic_astrology_insights.test.tsx` | 14 / 14 | **PASS** |
| **Daily Admin RPC Hardening (AST-01)** | `__tests__/daily_astrology_admin_rpc_hardening.test.ts` | 14 / 14 | **PASS** |
| **Astrology Core Suite** | `__tests__/astrology.test.tsx` | 22 / 22 | **PASS** |
| **Auth Core Suite** | `__tests__/auth.test.tsx` | 27 / 27 | **PASS** |
| **Total Tests Reconciled** | | **178 / 178** | **PASS** |

### TypeScript Typecheck:
`npx tsc --noEmit` executed with **0 errors**.

---

## 10. Unperformed Tests & Limitations

- **Production Gateway Interleaving:** Razorpay live webhook calls were not sent to production endpoints; webhook payload signature verification and payment capture were validated using cryptographic test harness requests and local PostgreSQL transaction harnesses.
- **Production Database Modifications:** Migration 048 was not deployed to any remote Supabase or production database.

---

## 11. Confirmation of Protections (AST-01 through AST-06)

1. **AST-01 Protection Preserved:** Null-auth guards (`auth.uid() IS NULL`) and revoked `PUBLIC`/`anon` privileges in `047_harden_daily_astrology_admin_rpcs.sql` remain completely intact.
2. **AST-02 Protection Preserved:** Cache isolation and non-entitled fallback defenses in `dailyRashiService.ts` remain intact.
3. **AST-03 Protection Preserved:** Request-token generation guards in `useDailyRashiInsight.ts` remain intact.
4. **AST-04 Protection Preserved:** Date rollover, navigation focus, and auth lifecycle invalidations in `useCustomerSubscription.ts` remain intact.
5. **AST-05 Protection Preserved:** Typed error classification in `dailyRashiService.ts` remains intact.
6. **AST-06 Protection Preserved:** Multi-bucket subscription categorization (`currentActive`, `scheduledRenewal`, `pendingCheckout`, `historicalNewest`) and the 20-record pagination fix in `astrologyService.ts` remain intact.

---

## 12. Deployment Safety & Non-Modification Guarantees

- **No historical migration modified:** Migrations `001_extensions_and_enums.sql` through `047_harden_daily_astrology_admin_rpcs.sql` were verified bit-for-bit unmodified.
- **Migration 048 is forward-only:** Prepared for standard execution via `supabase migration up` when approved for deployment.
- **No production database modified:** All database validations were performed in a disposable local PostgreSQL 18 instance.
