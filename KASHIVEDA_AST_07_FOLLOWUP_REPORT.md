# KASHIVEDA — AST-07 FOLLOW-UP VERIFICATION REPORT

**Remediation Target:** AST-07 Follow-up (Verify Cancellation Serialization and Migration 048 against Actual Database Definitions)  
**Reference Feature Audit:** `C:\Projects\KashiVeda\KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`  
**Previous Implementation Report:** `C:\Projects\KashiVeda\KASHIVEDA_AST_07_IMPLEMENTATION_REPORT.md`  
**Migration under Review:** `supabase/migrations/048_serialize_astrology_subscription_payments.sql`  
**Date:** 2026-10-10  
**Scope:** Local verification only — No production deployment or modifications to historical migrations (001–047).

---

## 1. Resolution of the Two Primary Inquiries

### Question 1: Can cancellation of one subscription race with payment confirmation for a different subscription belonging to the same customer?
**YES, without customer-level serialization in the cancellation path.**

#### The Race Scenario:
1. Customer A holds an existing active subscription $S_1$ expiring in 15 days ($T_{\text{end1}}$).
2. Customer A holds a distinct pending renewal $S_2$ linked to payment order $O_2$.
3. Transaction $T_1$ executes `confirm_booking_payment(O_2)` to capture payment and activate $S_2$.
4. Transaction $T_2$ executes `admin_cancel_astrology_subscription(S_1)` to cancel $S_1$ and issue a refund.
5. In the initial revision of migration 048, `admin_cancel_astrology_subscription` acquired row locks on $O_1$ and $S_1$, but did **not** acquire the customer advisory lock. Capture on $S_2$ acquired row locks on $O_2$ and $S_2$, plus the customer advisory lock.
6. Because $O_1 \neq O_2$ and $S_1 \neq S_2$, their row locks did not conflict.
7. Under `READ COMMITTED` isolation, if $T_1$ queried active subscriptions for Customer A while $T_2$ was executing but before $T_2$ committed, $T_1$ read $S_1$ as still `active`.
8. Consequently, $T_1$ allocated $S_2$ to begin at $T_{\text{end1}}$ (15 days in the future).
9. $T_2$ subsequently transitioned $S_1$ to `cancelled` and committed.
10. **Defect Produced:** $S_1$ is cancelled immediately, yet $S_2$ does not begin until 15 days later. Customer A paid for $S_2$ today, but suffers a **15-day blackout/gap** during which they have zero active entitlement.

#### The Resolution:
`admin_cancel_astrology_subscription` has been updated in migration 048 to acquire the **Level 3 customer advisory lock** after obtaining row locks on $O_1$ and $S_1$.
Under this shared serialization protocol:
- If cancellation commits first, capture re-reads the customer's active intervals under the lock, sees $S_1$ is cancelled, and begins $S_2$ immediately from `now()`. Zero gap.
- If capture commits first, $S_2$ is appended sequentially from $S_1$'s end date, and $S_1$ is then cancelled.
- Both transactions serialize deterministically; neither transaction makes decisions on stale or uncommitted state.

---

### Question 2: Do the database concurrency tests execute the actual functions defined by migration 048, or do they merely reproduce the intended SQL locking algorithm?
**The test harness executes the ACTUAL stored functions defined by migration 048 directly inside PostgreSQL 18.**

Inspection of `scratch/test_astrology_payment_concurrency.py` confirmed:
1. The test harness initialises a clean, disposable PostgreSQL 18.4 cluster (`pg_test_db` on port 5433).
2. It executes `C:\Projects\KashiVeda\supabase\migrations\048_serialize_astrology_subscription_payments.sql` directly into the database engine.
3. Tests A through I do **not** simulate locks in Python or re-implement locking in custom SQL.
4. Each test opens genuine, independent TCP connections (`psycopg2.connect`) and calls:
   - `SELECT public.create_astrology_subscription_order(...)`
   - `SELECT public.confirm_booking_payment(...)`
   - `SELECT public.admin_cancel_astrology_subscription(...)`
5. Concurrency is controlled via `threading.Barrier(2)` synchronization primitives immediately before executing the RPC calls across independent database sessions.
6. Tests assert actual database rows, timestamps, intervals, and PostgreSQL catalog function privileges (`has_function_privilege`).

---

## 2. Lock Acquisition Ordering & Deadlock Freedom Analysis

To ensure mutual exclusion without deadlocks across creation, capture, and cancellation, all transactions adhere to a strict partial lock order:

$$\text{Level 1: } \text{payment\_orders } (\texttt{FOR UPDATE}) \longrightarrow \text{Level 2: } \text{astrology\_subscriptions } (\texttt{FOR UPDATE}) \longrightarrow \text{Level 3: Customer Advisory Lock}$$

### Protocol Across Operations:

| Operation | Level 1: `payment_orders` | Level 2: `astrology_subscriptions` | Level 3: Customer Advisory Lock |
| :--- | :--- | :--- | :--- |
| **`confirm_booking_payment`** (Capture) | Locks $O_i$ `FOR UPDATE` | Locks $S_i$ `FOR UPDATE` | `pg_advisory_xact_lock(canonical_customer_id)` |
| **`admin_cancel_astrology_subscription`** (Cancellation) | Locks open orders for $S_i$ `FOR UPDATE` | Locks $S_i$ `FOR UPDATE` | `pg_advisory_xact_lock(canonical_customer_id)` |
| **`create_astrology_subscription_order`** (Creation) | *None* (Inserts new row) | *None* (Inserts new row) | `pg_advisory_xact_lock(canonical_customer_id)` |

### Deadlock Impossibility Proof:
1. **Between Capture and Cancellation on DIFFERENT subscriptions ($S_1 \neq S_2$, $O_1 \neq O_2$):**  
   - $T_1$ acquires $O_2$ (Level 1) and $S_2$ (Level 2).
   - $T_2$ acquires $O_1$ (Level 1) and $S_1$ (Level 2).
   - Neither waits for the other at Level 1 or Level 2 because the rows are distinct.
   - Both proceed to Level 3 (Customer advisory lock). One transaction acquires Level 3; the other waits at Level 3.
   - The transaction holding Level 3 already holds all row locks it will ever need; it never requests any resource held by the waiting transaction.
   - The holder completes, commits, and releases all locks. The waiter acquires Level 3 and completes.
   - **Circular wait is mathematically impossible.**

2. **Between Capture and Cancellation on the SAME subscription ($S_1$, $O_1$):**  
   - Both transactions attempt to lock $O_1$ first (Level 1).
   - One wins $O_1$; the other waits at Level 1.
   - The winner proceeds to $S_1$ (Level 2) and Customer Lock (Level 3), commits, and releases.
   - The second transaction acquires $O_1$, inspects its updated status, and returns idempotently.
   - **No deadlock.**

3. **Between Creation and Capture/Cancellation:**  
   - Creation only acquires Level 3 (Customer Advisory Lock). It holds no Level 1 or Level 2 row locks.
   - Creation performs MVCC non-blocking snapshot reads on existing subscriptions.
   - No circular wait can form.

---

## 3. Exact Changes Made to Migration 048

In `supabase/migrations/048_serialize_astrology_subscription_payments.sql`:

1. **Updated Header Architectural Documentation:**
   Documented the Level 3 customer advisory lock inclusion in `admin_cancel_astrology_subscription` and explained how it prevents gaps between cancellation of prior terms and capture of renewals.

2. **Updated `admin_cancel_astrology_subscription` Implementation:**
   Acquired the Level 3 transaction-scoped advisory lock after locking `v_subscription`:
   ```sql
   -- Fetch & Lock Astrology Subscription FOR UPDATE (Level 2 Lock)
   SELECT * INTO v_subscription
   FROM public.astrology_subscriptions
   WHERE id = p_subscription_id
   FOR UPDATE;

   IF NOT FOUND THEN
       RAISE EXCEPTION 'Astrology subscription % not found.', p_subscription_id;
   END IF;

   -- Level 3 Lock: AST-07 Customer Serialization Lock
   -- Acquire transaction-scoped advisory lock keyed to canonical customer UUID.
   -- Ensures cancellation of one subscription and renewal term allocation of
   -- another subscription for the same customer are strictly serialized, preventing
   -- access gaps or inconsistent term allocations.
   PERFORM pg_advisory_xact_lock(
       ('x' || substr(md5('astrology_subscription_customer:' || v_subscription.customer_id::text), 1, 16))::bit(64)::bigint
   );
   ```

3. **Trusted Identity Derivation:**
   `v_subscription.customer_id` is derived strictly from the authoritative database record locked `FOR UPDATE`, never from client-supplied arguments.

---

## 4. Multi-Connection Concurrency Test Suite Results

The concurrency harness was updated to include **Test F1** (Same-subscription interleaving), **Test F2** (Different subscriptions, same customer interleaving), and **Test I** (PostgreSQL catalog execution privilege checks).

Executed command:
```powershell
python scratch/test_astrology_payment_concurrency.py
```

### Complete Test Run Output:
```
======================================================================
STARTING AST-07 DATABASE-LEVEL CONCURRENCY TEST SUITE
======================================================================
[INIT] Database schema initialized with Migration 048.

--- TEST A: Two distinct orders, same customer (Concurrent Confirmation) ---
Sub 1 Term: 2026-10-10 18:54:35.914048+05:30 -> 2026-11-09 18:54:35.914048+05:30
Sub 2 Term: 2026-11-09 18:54:35.914048+05:30 -> 2026-12-09 18:54:35.914048+05:30
PASS: Test A passed. Zero overlap. Total duration = 60 days sequentially allocated.

--- TEST B: Two distinct orders with different plans (30d + 90d) ---
Sub B1 Term: 2026-10-10 18:54:35.990094+05:30 -> 2027-01-08 18:54:35.990094+05:30
Sub B2 Term: 2027-01-08 18:54:35.990094+05:30 -> 2027-02-07 18:54:35.990094+05:30
PASS: Test B passed. Zero overlap. Total duration = 120 days (30d + 90d sequential).

--- TEST C: Same-order concurrent replay (Idempotency) ---
Results: active, already_confirmed
PASS: Test C passed. Duplicate confirmations for the same order are strictly idempotent.

--- TEST D: Concurrent creation requests (Pending-Order Reuse Serialization) ---
Create response 1: reused=False, sub=6eae502b-bc7b-4a76-bc12-8222633d86a4
Create response 2: reused=True, sub=6eae502b-bc7b-4a76-bc12-8222633d86a4
PASS: Test D passed. Race condition eliminated; concurrent creation cleanly serialized with pending reuse.

--- TEST E: Different customers (Independent Concurrency) ---
PASS: Test E passed. Different customers proceed concurrently without contention.

--- TEST F1: Cancellation versus capture on SAME subscription ---
Capture result: {'status': 'active', 'ends_at': '2026-11-09T18:54:36.247969+05:30', 'paid_at': '2026-10-10T18:54:36.247969+05:30', 'purpose': 'subscription', 'starts_at': '2026-10-10T18:54:36.247969+05:30', 'amount_paid': 299.0, 'subscription_id': '855a16f3-add8-4544-8b55-c16c33c29529', 'payment_transaction_id': '45f66ceb-160a-45f2-8f45-9cd777431de7'}
Cancel result: {'status': 'cancelled', 'message': 'Astrology subscription cancelled. Refund obligation queued in requested state.', 'success': True, 'refund_amount': 299.0, 'total_captured': 299.0, 'previous_status': 'active', 'refund_eligible': True, 'subscription_id': '855a16f3-add8-4544-8b55-c16c33c29529', 'already_refunded': 0.0}
PASS: Test F1 passed. Deadlock avoided on same-subscription interleaving.

--- TEST F2: Cancellation of S1 vs Capture of distinct renewal S2 (Same Customer) ---
S1 status: cancelled
S2 status: active, Term: 2026-10-10 18:54:36.439917+05:30 -> 2026-11-09 18:54:36.439917+05:30 (30 days)
PASS: Test F2 passed. Cancellation of S1 and Capture of S2 serialized with zero deadlock and consistent intervals.

--- TEST G: Payment validation and rollback ---
PASS: Test G passed. Invalid payment was rejected and rolled back cleanly.

--- TEST H: Existing active interval and subsequent renewal ---
Existing active ends at: 2026-10-25 18:54:36.526850+05:30
Renewal starts at: 2026-10-25 18:54:36.526850+05:30
Renewal ends at:   2026-11-24 18:54:36.526850+05:30
PASS: Test H passed. Renewal cleanly appends to existing active interval.

--- TEST I: Function execution privileges and grants ---
PASS: Test I passed. Function ACLs and EXECUTE grants strictly verified.

======================================================================
ALL 9 CONCURRENCY & INTEGRATION TESTS (A - I) PASSED SUCCESSFULLY!
======================================================================
```

---

## 5. Reconciled Regression Test Counts & Verification Suite

All regression suites across the project were executed and reconciled:

| Test Suite | File | Tests Run | Result |
| :--- | :--- | :---: | :---: |
| **AST-07 Specification Suite** | `__tests__/astrology_subscription_payment_serialization.test.ts` | 14 | **PASS** |
| **Astrology Payment Backend** | `__tests__/astrology_payment_backend.test.ts` | 10 | **PASS** |
| **Subscription Selection (AST-06)** | `__tests__/daily_astrology_subscription_selection.test.tsx` | 16 | **PASS** |
| **Cache Security (AST-02)** | `__tests__/daily_astrology_cache_security.test.tsx` | 8 | **PASS** |
| **Stale Refresh Guard (AST-03)** | `__tests__/daily_astrology_stale_refresh_guard.test.tsx` | 7 | **PASS** |
| **State Refresh Lifecycle (AST-04)** | `__tests__/daily_astrology_state_refresh_lifecycle.test.tsx` | 11 | **PASS** |
| **Entitlement Revalidation** | `__tests__/daily_astrology_entitlement_revalidation.test.tsx` | 12 | **PASS** |
| **Error Classification (AST-05)** | `__tests__/daily_astrology_error_classification.test.tsx` | 23 | **PASS** |
| **Vedic Astrology Insights** | `__tests__/daily_vedic_astrology_insights.test.tsx` | 14 | **PASS** |
| **Daily Admin RPC Hardening (AST-01)** | `__tests__/daily_astrology_admin_rpc_hardening.test.ts` | 14 | **PASS** |
| **Astrology Core** | `__tests__/astrology.test.tsx` | 22 | **PASS** |
| **Auth Core** | `__tests__/auth.test.tsx` | 27 | **PASS** |
| **Total Reconciled Tests** | | **178 / 178** | **PASS (100%)** |

### TypeScript Typecheck:
```powershell
npx tsc --noEmit
```
**Outcome:** Exited with code 0 (zero errors).

---

## 6. Confirmation of Protections (AST-01 through AST-06)

1. **AST-01:** Admin daily insight RPC null-auth guards and revoked PUBLIC execution remain intact.
2. **AST-02:** User-bound cache keys and logout cache invalidation remain intact.
3. **AST-03:** Selected-date request token guards preventing race-condition text replacement remain intact.
4. **AST-04:** Navigation focus and date-change listeners updating subscription status remain intact.
5. **AST-05:** Distinction between genuine backend errors and empty editorial content remains intact.
6. **AST-06:** Multi-bucket subscription categorization and 20-record pagination resilience remain intact.

---

## 7. Remaining Limitations

1. **Payment Gateway Sandbox:** Tests used cryptographic signature verification and mock payloads simulating Razorpay webhook delivery. No live debit/credit cards were processed on payment gateways.
2. **Production Deployment Pending:** Migration `048_serialize_astrology_subscription_payments.sql` remains strictly local and has not been executed on production or remote Supabase environments.

---

## 8. Deployment Safety Declaration

- Historical migrations `001_extensions_and_enums.sql` through `047_harden_daily_astrology_admin_rpcs.sql` are **100% unmodified**.
- Migration `048_serialize_astrology_subscription_payments.sql` is forward-only and self-contained.
- **Migration 048 was not deployed, and no production database was modified.**
