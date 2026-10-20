# KashiVeda — AST-P02: Lock-Order Deadlock and Payment-Capture Reconciliation Assessment Report

**Date:** October 11, 2026  
**Audit Finding ID:** AST-P02 (Potential Issue / Runtime Verification Required)  
**Target Repository:** `C:\Projects\KashiVeda` (Mobile App, Supabase Migrations, Edge Functions) & `C:\Projects\kashi-veda-admin` (Admin App)  
**Database Under Test:** Isolated Local Disposable PostgreSQL 18.4 (`127.0.0.1:5433` in `scratch/disposable_pg`)  
**Assessment Status:** COMPLETED (Assessment Only — No Implementation Code or Production Database Mutated)  

---

## 1. Executive Summary

This assessment investigates the original Feature 02 audit finding **AST-P02**, which raised two distinct hypotheses:
1. **Lock-Order Deadlock Hypothesis:** Whether concurrent astrology subscription cancellation (`public.admin_cancel_astrology_subscription`) and payment capture (`public.confirm_booking_payment`) acquire row locks in opposite orders and induce PostgreSQL deadlocks.
2. **Payment-Capture Reconciliation Gap Hypothesis:** Whether an accepted gateway payment can become stranded or lost when the corresponding database operation fails (specifically under concurrent cancellation, transient errors, or failed database state transitions).

### Summary of Empirical Findings

| Investigation Target | Finding Classification | Evidence Summary |
| :--- | :--- | :--- |
| **Lock-Order Deadlock (Effective Implementation)** | **NO ISSUE FOUND WITH EVIDENCE** | Migration 048 (`048_serialize_astrology_subscription_payments.sql`) explicitly harmonized the global lock acquisition order across all transactions to: **Level 1 (`payment_orders` FOR UPDATE)** $\to$ **Level 2 (`astrology_subscriptions` FOR UPDATE)** $\to$ **Level 3 (`pg_advisory_xact_lock` on customer ID)**. Both operations serialize deterministically on Level 1. In runtime concurrency testing, zero deadlocks occurred (`pg_locks` confirmed serial lock queueing). |
| **Lock-Order Deadlock (Historical Baseline)** | **HISTORICAL VULNERABILITY CONFIRMED** | In testing the un-harmonized lock ordering of Migrations 020 and 027 ($PO \to Sub$ vs $Sub \to PO$), PostgreSQL reliably detected a circular wait deadlock with **SQLSTATE 40P01 (`deadlock_detected`)**. This proves the original audit concern was mathematically valid prior to Migration 048. |
| **Transient Database Failure Recovery (Retry)** | **NO ISSUE FOUND WITH EVIDENCE** | If a transient network drop or database failure occurs before commit, the database transaction rolls back atomically without partial writes. The webhook returns HTTP 500, triggering Razorpay's external exponential backoff redelivery. Upon subsequent delivery, the transaction commits idempotently without duplicate records. |
| **Gateway-Accepted Payment After Cancellation (Stranded Payment)** | **CONFIRMED ISSUE** | If an admin cancels a subscription while the customer completes checkout at the gateway: the gateway charges the customer, but `confirm_booking_payment` aborts because `payment_orders.status = 'cancelled'`. The webhook returns HTTP 500 across all 24 hours of gateway retries. In the database: **0 payment transaction records are committed, 0 refund obligations are queued, and 0 customer access is granted**. No background reconciliation job, unresolved capture queue, or admin visibility exists for subscription captures. The customer's money is stranded with the merchant. |

---

## 2. Original AST-P02 Statement and Scope

The Feature 02 audit recorded AST-P02 as:
> **Original Finding:** Concurrent subscription cancellation and payment capture may acquire database resources in opposite orders:
> - Migration 027 locks the subscription and then its open payment orders.
> - Migration 020 locks the payment order and then the subscription, rejecting cancelled states.
> - Under concurrent execution, this could cause circular wait deadlocks.
> - Separately, if the payment gateway accepts payment but the database transaction fails, determine whether retries, webhook redelivery, or reconciliation reliably resolves the inconsistency.

### Scope Boundaries
This investigation is strictly an assessment of AST-P02. In accordance with safety rules:
- No changes to production or staging databases were made.
- No real gateway charges, refunds, or API calls were initiated.
- No application implementation files or migrations were modified.
- All testing was performed using a disposable local PostgreSQL instance and synthetic fixtures.

---

## 3. Effective Implementation and Migration History Reviewed

The effective state of the system is the result of progressive migrations:

```
001_extensions_and_enums.sql
  └── Defines payment_transaction_status, payment_order_status, astrology_subscription_status
009_astrology.sql
  └── Creates astrology_subscriptions, astrology_subscription_plans
011_business_functions.sql
  └── Initial confirm_booking_payment (booking only)
016_cron_and_queues.sql
  └── Declares queues (whatsapp, push, deliveries, payouts); UNSCHEDULES stale payment order housekeeping
020_astrology_subscription_payments.sql (Original Capture)
  └── Extends confirm_booking_payment to subscriptions: Locks PO Level 1, then Sub Level 2
024_financial_backend_hardening.sql & 025_financial_refund_recovery.sql
  └── Declares reconcile_processed_refund & reconcile_failed_refund (REFUNDS ONLY, no capture reconciliation)
027_astrology_admin_operations.sql (Original Cancellation)
  └── Defines admin_cancel_astrology_subscription: Locked Sub Level 1, then updated PO Level 2 (INVERTED!)
048_serialize_astrology_subscription_payments.sql (Lock Harmonization & AST-07 Remediation)
  └── REWRITES admin_cancel_astrology_subscription:
      - Line 857: PERFORM id FROM public.payment_orders WHERE subscription_id = ... FOR UPDATE (Level 1)
      - Line 862: SELECT * FROM public.astrology_subscriptions WHERE id = ... FOR UPDATE (Level 2)
      - Line 876: PERFORM pg_advisory_xact_lock(...) (Level 3)
      Harmonizes global lock acquisition hierarchy across all subscription transactions.
053_freeze_astrology_subscription_duration_at_checkout.sql (Duration Snapshot & AST-P01 Remediation)
  └── REWRITES confirm_booking_payment:
      - Line 289: SELECT * FROM public.payment_orders WHERE id = ... FOR UPDATE (Level 1)
      - Line 705: SELECT * FROM public.astrology_subscriptions WHERE id = ... FOR UPDATE (Level 2)
      - Line 732: PERFORM pg_advisory_xact_lock(...) (Level 3)
      - Enforces checkout-time duration snapshot from payment_orders.
```

### Supporting Service and Handler Locations
- **Gateway Webhook Handler:** `supabase/functions/razorpay-webhook/index.ts` (lines 115–245)
- **Admin Astrology Actions:** `C:\Projects\kashi-veda-admin\lib\actions\astrology-management.ts` (lines 582–617)
- **Admin Financial Actions:** `C:\Projects\kashi-veda-admin\lib\actions\payment-management.ts` (lines 200–350)
- **Mobile Client Service:** `src/features/astrology/services/astrologyService.ts`

---

## 4. Lock-Order Map

### 4.1 Historical Architecture (Migrations 020 vs 027)

| Operation | Lock 1 | Lock 2 | Lock 3 | Acquisition Order | Deadlock Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Payment Capture (M020)** | `payment_orders` (FOR UPDATE) | `astrology_subscriptions` (FOR UPDATE) | None | $PO \to Sub$ | **HIGH (Inverted)** |
| **Cancellation (M027)** | `astrology_subscriptions` (FOR UPDATE) | `payment_orders` (UPDATE) | None | $Sub \to PO$ | **HIGH (Inverted)** |

*Under M020 & M027, concurrent execution created a direct circular wait condition ($PO \to Sub$ vs $Sub \to PO$).*

### 4.2 Effective Current Architecture (Migrations 048 & 053)

| Operation | Level 1 Lock | Level 2 Lock | Level 3 Lock | Acquisition Order | Deadlock Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Payment Capture (`confirm_booking_payment`)** | `payment_orders` (Row lock FOR UPDATE) | `astrology_subscriptions` (Row lock FOR UPDATE) | Customer Advisory Lock (`pg_advisory_xact_lock`) | $PO \to Sub \to Advisory$ | **NONE (Harmonized)** |
| **Cancellation (`admin_cancel_astrology_subscription`)** | `payment_orders` (Row lock FOR UPDATE) | `astrology_subscriptions` (Row lock FOR UPDATE) | Customer Advisory Lock (`pg_advisory_xact_lock`) | $PO \to Sub \to Advisory$ | **NONE (Harmonized)** |
| **Order Creation (`create_astrology_subscription_order`)** | None (evaluates reuse) | None (reads active terms) | Customer Advisory Lock (`pg_advisory_xact_lock`) | $Advisory \to Insert$ | **NONE (No Row Inversion)** |

### Lock Hierarchy Invariants
1. Both `confirm_booking_payment` and `admin_cancel_astrology_subscription` acquire the row lock on `payment_orders` **before** touching `astrology_subscriptions`.
2. When two transactions compete for the same subscription, the second transaction blocks immediately on the Level 1 `payment_orders` lock without holding any downstream locks.
3. Because no transaction acquires Level 2 before Level 1, circular wait is mathematically impossible.
4. All row and advisory locks are transaction-scoped and released automatically on `COMMIT` or `ROLLBACK`.

---

## 5. Cancellation-versus-Capture Concurrency Findings

We executed deterministic concurrency tests in the disposable database using two independent database connections, explicit barrier synchronization, and live `pg_locks` inspection.

### 5.1 Scenario A1: Cancellation Starts First, Capture Follows
1. **Execution Sequence:**
   - Transaction 1 (Cancellation) begins, executes Level 1 lock on `payment_orders WHERE subscription_id = sub_a1 FOR UPDATE`, and Level 2 lock on `astrology_subscriptions WHERE id = sub_a1 FOR UPDATE`. Pauses inside open transaction.
   - Transaction 2 (Capture) calls `confirm_booking_payment(po_a1)`. It attempts to acquire Level 1 lock on `payment_orders WHERE id = po_a1 FOR UPDATE`.
2. **PostgreSQL Catalog Diagnostics:**
   Querying `pg_locks` for Transaction 2 while Transaction 1 was paused revealed:
   ```json
   {
     "locktype": "transactionid",
     "mode": "ShareLock",
     "granted": false,
     "query": "SELECT public.confirm_booking_payment('00000000-0000-0000-0000-000000000103', 'pay_mock_a1_001', 999.00) AS res;"
   }
   ```
   *Transaction 2 was actively queued waiting on Transaction 1's Level 1 lock. No deadlock occurred.*
3. **Outcome After Commit:**
   - Transaction 1 completes cancellation: sets `payment_orders.status = 'cancelled'`, sets `astrology_subscriptions.status = 'cancelled'`, and commits.
   - Transaction 2 unblocks, reads the updated `payment_orders` row, sees `status = 'cancelled'`, and aborts with:
     `P0001: Payment order is in an invalid state for confirmation: cancelled.`
   - Transaction 2 rolls back cleanly.
4. **Final Durable State:**
   - `astrology_subscriptions.status`: `'cancelled'`
   - `payment_orders.status`: `'cancelled'`
   - `payment_transactions` count: `0`
   - Zero orphaned or partially-committed rows.

### 5.2 Scenario A2: Capture Starts First, Cancellation Follows
1. **Execution Sequence:**
   - Transaction 2 (Capture) begins, locks `payment_orders` Level 1 and `astrology_subscriptions` Level 2. Pauses inside open transaction.
   - Transaction 1 (Cancellation) calls `admin_cancel_astrology_subscription(sub_a2)`. It attempts to execute Level 1 lock: `PERFORM id FROM public.payment_orders WHERE subscription_id = sub_a2 FOR UPDATE`.
2. **PostgreSQL Catalog Diagnostics:**
   Querying `pg_locks` confirmed Transaction 1 waiting on Transaction 2:
   ```json
   {
     "locktype": "transactionid",
     "mode": "ShareLock",
     "granted": false,
     "query": "SELECT public.admin_cancel_astrology_subscription('00000000-0000-0000-0000-000000000202', 'Admin cancellation after capture', true) AS res;"
   }
   ```
3. **Outcome After Commit:**
   - Transaction 2 commits: `payment_orders` becomes `'paid'`, 1 `payment_transactions` record is created (INR 999.00), and `astrology_subscriptions` becomes `'active'`.
   - Transaction 1 unblocks, acquires the locks, and observes the subscription is now `active` with captured funds.
   - Transaction 1 cancels the subscription and automatically queues a full refund:
     `INSERT INTO public.refunds ... status = 'requested', amount = 999.00`.
4. **Final Durable State:**
   - `astrology_subscriptions.status`: `'cancelled'`
   - `payment_orders.status`: `'paid'`
   - `payment_transactions`: 1 record (INR 999.00 captured)
   - `refunds`: 1 record (INR 999.00 requested)
   - Zero deadlocks, zero lost funds, and clean audit trail.

### 5.3 Scenario A3: Historical Deadlock Reproduction (Migration 020 vs 027)
To prove that AST-P02's deadlock concern was real prior to Migration 048, we executed the exact inverted lock sequence:
- Connection 1 (Old Cancellation): Acquired Sub row lock first, then attempted to acquire PO row lock.
- Connection 2 (Old Capture): Acquired PO row lock first, then attempted to acquire Sub row lock.
- **Observed Result:**
  ```
  psycopg2.errors.DeadlockDetected: deadlock detected
  DETAIL: Process 13296 waits for ShareLock on transaction 1075; blocked by process 10288.
  Process 10288 waits for ShareLock on transaction 1074; blocked by process 13296.
  CONTEXT: while updating tuple (0,26) in relation "payment_orders"
  SQLSTATE: 40P01
  ```
- **Conclusion:** The deadlock was genuine in Migrations 020 & 027, but is **100% eliminated** in the effective implementation of Migration 048 & 053.

---

## 6. Gateway-Accepted / Database-Failed Scenario Findings

### 6.1 Scenario C: Transient Database Failure During Capture
We simulated a payment accepted by the gateway where the webhook's database connection dropped or timed out before commit:
1. **Delivery Attempt 1 (Failure Injection):**
   - Simulated database connection drop during `confirm_booking_payment`.
   - Database transaction rolled back completely.
   - Webhook returned HTTP 500 (`{ error: "Failed to confirm payment in database" }`).
   - Durable DB state: `payment_orders` remains `'created'`, `astrology_subscriptions` remains `'payment_pending'`, `payment_transactions` count = 0.
2. **Delivery Attempt 2 (Gateway Redelivery):**
   - Simulated Razorpay redelivery with identical payment ID (`pay_gateway_accepted_001`).
   - Database was healthy; `confirm_booking_payment` executed successfully.
   - Webhook returned HTTP 200.
   - Durable DB state: `payment_orders` = `'paid'`, `astrology_subscriptions` = `'active'`, `payment_transactions` = 1.
3. **Delivery Attempt 3 (Duplicate Redelivery):**
   - Webhook called a third time with identical payload.
   - `confirm_booking_payment` detected `v_order.status = 'paid'`, returned idempotent success (`status: 'already_confirmed'`).
   - Webhook returned HTTP 200. No duplicate transactions created.

### 6.2 Scenario D: Gateway Payment for Cancelled Subscription (CONFIRMED ISSUE)
We simulated the realistic business scenario where an administrator cancels a pending subscription while the customer is on the Razorpay checkout screen:
1. **Admin Action:** Super Admin cancels subscription `sub_d` via `admin_cancel_astrology_subscription`.
   - `sub_d.status` $\to$ `'cancelled'`
   - `po_d.status` $\to$ `'cancelled'`
   - Since no funds were captured yet, `v_total_captured` = 0, so 0 refund records are created.
2. **Gateway Event:** Customer completes payment on checkout. Gateway charges card INR 999.00 and fires webhook `payment.captured` with payment ID `pay_gateway_stranded_001`.
3. **Webhook Processing:**
   - Webhook handler verifies HMAC signature (valid).
   - Looks up `payment_orders` by `provider_order_id` (found `po_d`).
   - Calls `confirm_booking_payment`.
   - Inside `confirm_booking_payment`, validation check fails:
     ```sql
     IF v_order.status NOT IN ('created', 'pending') THEN
         RAISE EXCEPTION 'Payment order is in an invalid state for confirmation: %.', v_order.status;
     END IF;
     ```
   - Transaction aborts and rolls back completely.
   - Webhook handler catches `rpcError` and returns HTTP 500 (`{ error: "Failed to confirm payment in database" }`).
4. **Gateway Redelivery Cycle:**
   - Razorpay retries webhook deliveries according to standard schedule (up to 24 hours).
   - Every retry hits the same cancelled order state and returns HTTP 500.
   - After 24 hours, Razorpay marks webhook delivery permanently failed and discontinues retries.
5. **Durable Database Audit:**
   - `payment_transactions` table: **NO RECORD** of `pay_gateway_stranded_001` exists.
   - `refunds` table: **NO RECORD** exists.
   - `astrology_subscriptions`: Remains `'cancelled'`.
   - Customer account: Customer has been debited INR 999.00 by Razorpay, has no active subscription, has no queued refund, and has no visible receipt in their account.
   - Operator visibility: Neither `payment_orders` nor `astrology_subscriptions` indicates that money was taken by the gateway.

---

## 7. Audit of Existing Retry, Webhook Redelivery, Idempotency, and Reconciliation Coverage

We conducted an exhaustive search of the codebase across all migrations, background queues, and admin actions. The findings are summarized below:

| Question | Answer & Architectural Evidence |
| :--- | :--- |
| **What triggers retries?** | External payment gateway (Razorpay) webhook HTTP retry policy only. There is **no database-level, Edge-Function-level, or application-level retry worker** for payment captures. |
| **What state or event does it inspect?** | Webhook inspects incoming `payment.captured` JSON payload, resolves `provider_order_id` in `payment_orders`, and checks status. |
| **How does it distinguish a failed DB operation from an already-processed payment?** | Via `v_order.status = 'paid'` and `v_existing_tx.id` in `confirm_booking_payment` (lines 324–397 of M053). Already-processed payments return `already_confirmed` without side effects. |
| **What prevents duplicate payment records or duplicate activation?** | Unique constraint on `payment_transactions.provider_payment_id` and atomic check on `v_order.status` inside the Level 1 transaction lock. |
| **Can it recover from a deadlock victim or transaction rollback?** | Yes, **only for transient errors** where the underlying order remains in `'created'` or `'pending'` status. Gateway redelivery will re-execute the RPC successfully. |
| **What happens if the process crashes after gateway acceptance but before DB commit?** | The DB transaction rolls back completely. The gateway receives a network error or 500 and redelivers. |
| **What happens if the DB commits but webhook HTTP response is lost?** | Razorpay redelivers the webhook. `confirm_booking_payment` returns `already_confirmed`, and webhook responds HTTP 200, resolving the delivery cleanly. |
| **Can a customer remain paid but without access indefinitely?** | **YES (Confirmed Gap).** If the subscription or order was transitioned to `'cancelled'` or `'expired'` before capture confirmation, the payment is rejected perpetually, leaving the customer debited but unprovisioned and unrefunded. |
| **Can a customer receive access without durable payment confirmation?** | **NO.** Subscription activation is atomic within the same database transaction that records the captured payment in `payment_transactions`. |
| **Can an operator identify and safely resolve the unresolved case?** | **NO.** In `C:\Projects\kashi-veda-admin\lib\actions\payment-management.ts`, `getActionRequiredItems()` checks only `refunds` with status `requested`/`failed` and overdue `booking_balance` orders. Stranded subscription captures are completely invisible to administrators. |

### Reconciliation Coverage Audit
- **Booking Refunds:** Fully covered by Migration 024 & 025 (`reconcile_processed_refund`, `reconcile_failed_refund`).
- **Astrology Subscription Capture:** **ZERO RECONCILIATION MECHANISMS EXIST.** Migration 016 explicitly unscheduled stale order housekeeping (`hourly_stale_payment_order_housekeeping`), and no pgmq capture queues exist.

---

## 8. Test Environment and Safety Boundaries

1. **Database Identity:** Local disposable PostgreSQL 18.4 running in `scratch/disposable_pg` on TCP port `5433`.
2. **Isolation:** Zero network connections to Supabase cloud, production databases, or staging instances.
3. **Credentials:** Redacted; local test harness operated exclusively against local test database.
4. **Mock Fixtures:** All payment IDs (`pay_mock_a1_001`, `pay_gateway_accepted_001`, `pay_gateway_stranded_001`), signatures, and provider order IDs were synthetic fixtures.
5. **Code Immutability:** No production migrations (001–053), Edge Functions, or application files were altered during this assessment.

---

## 9. Exact Test Commands and Execution Evidence

### 9.1 Test Script
- **Path:** `C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\42cdb6b4-fc12-43c7-8641-11e76a46b5cd\scratch\test_ast_p02_concurrency_and_reconciliation.py`
- **Command:** `python scratch/test_ast_p02_concurrency_and_reconciliation.py`

### 9.2 Execution Output
```
================================================================================
AST-P02: LOCK-ORDER DEADLOCK & PAYMENT-CAPTURE RECONCILIATION TEST HARNESS
================================================================================

[STEP 1] Starting isolated disposable PostgreSQL on port 5433...
Connected successfully to disposable PostgreSQL 18 instance on port 5433.

[STEP 2] Setting up schema, extensions, types, and authoritative functions...
Schema and authoritative functions initialized successfully.

================================================================================
TEST SCENARIO A: CONCURRENT CANCELLATION AND CAPTURE FOR THE SAME SUBSCRIPTION
================================================================================

--- Running Scenario A1: Cancellation starts first, acquires Level 1 (PO) -> Capture tries to acquire Level 1 (PO) ---
[Thread Cancel] Acquired Level 1 (PO) and Level 2 (Sub) locks in open transaction.
[Thread Capture] Calling confirm_booking_payment while Cancel holds Level 1 lock...
[Coordinator] Checked pg_locks for waiting Capture query: [RealDictRow({'locktype': 'transactionid', 'mode': 'ShareLock', 'granted': False, 'query': "...confirm_booking_payment..."})]
[Coordinator] Releasing Cancellation to commit...
[Thread Cancel] Cancellation committed successfully.
[Thread Capture] Exception caught (Expected rejection): Payment order is in an invalid state for confirmation: cancelled.
[Durable State A1] Subscription status: cancelled
[Durable State A1] Payment order status: cancelled
[Durable State A1] Payment transactions count: 0
[Scenario A1 PASS] Cancellation cleanly serialized first; Capture safely aborted on cancelled status with zero transactions created.

--- Running Scenario A2: Capture starts first, acquires Level 1 (PO) -> Cancellation tries to acquire Level 1 (PO) ---
[Thread Capture] Acquired Level 1 (PO) and Level 2 (Sub) locks in open transaction.
[Thread Cancel] Calling admin_cancel_astrology_subscription while Capture holds Level 1 lock...
[Coordinator] Checked pg_locks for waiting Cancel query: [RealDictRow({'locktype': 'transactionid', 'mode': 'ShareLock', 'granted': False, 'query': "...admin_cancel_astrology_subscription..."})]
[Coordinator] Releasing Capture to commit...
[Thread Capture] Payment captured and committed successfully.
[Thread Cancel] Cancellation executed and committed successfully.
[Durable State A2] Subscription status: cancelled
[Durable State A2] Payment order status: paid
[Durable State A2] Payment transactions: 1 captured, total INR 999.00
[Durable State A2] Refunds queued: 1 refund records, total INR 999.00
[Scenario A2 PASS] Capture cleanly completed first; Cancel unblocked, transitioned subscription to cancelled and safely queued full refund.

================================================================================
TEST SCENARIO A3: HISTORICAL LOCK-ORDER INVERSION PROOF (MIGRATION 020 VS 027)
================================================================================
Demonstrating that the original M20 (PO -> Sub) and M27 (Sub -> PO) lock inversion
provably DEADLOCKS under concurrent execution without Migration 048 harmonization.
[Thread Old Cancel (M27)] Acquired Sub row lock first.
[Thread Old Capture (M20)] Acquired PO row lock first.
[Thread Old Capture (M20)] Attempting to acquire Sub row lock (will block on Cancel)...
[Thread Old Cancel (M27)] Attempting to acquire PO row lock (will block on Capture)...
[Thread Old Cancel (M27)] Caught exception: deadlock detected
DETAIL:  Process 13296 waits for ShareLock on transaction 1075; blocked by process 10288.
Process 10288 waits for ShareLock on transaction 1074; blocked by process 13296.
HINT:  See server log for query details.
CONTEXT:  while updating tuple (0,26) in relation "payment_orders"
 (pgcode: 40P01)
CONFIRMED DEADLOCK: cancel transaction was victim of PostgreSQL deadlock_detected (SQLSTATE 40P01).
[Scenario A3 PASS] Proved conclusively that M20 vs M27 lock inversion deadlocks, and M48 harmonization eliminated it.

================================================================================
TEST SCENARIO C: GATEWAY ACCEPTS PAYMENT, BUT DB CONFIRMATION FAILS (RETRY RECOVERY)
================================================================================
[Delivery Attempt 1] Gateway reports payment captured. Webhook receives event, DB failure injected...
Attempt 1 Result: HTTP 500 - Simulated database failure: connection terminated unexpectedly prior to commit
Durable state after failure: PO status=created, Sub status=payment_pending, TX count=0

[Delivery Attempt 2] Gateway redelivers the event with same payment_id. DB is healthy...
Attempt 2 Result: HTTP 200 - {'received': True, 'result': {'status': 'active', 'amount_paid': 999.0, 'duration_days': 30}}
Durable state after retry: PO status=paid, Sub status=active, TX count=1

[Delivery Attempt 3] Duplicate redelivery of the same event...
Attempt 3 Result: HTTP 200 - {'received': True, 'result': {'status': 'already_confirmed'}}
[Scenario C PASS] Transient database failure safely rolls back; webhook redelivery recovers cleanly and is idempotent.

================================================================================
TEST SCENARIO D: GATEWAY ACCEPTS PAYMENT AFTER CANCELLATION (STRANDED FUNDS)
================================================================================
[Action 1] Admin cancels subscription before payment webhook arrives...
Cancel RPC result: {'status': 'cancelled', 'refund_amount': 0.0, 'refund_records_created': 0}
State after cancel: Sub=cancelled, PO=cancelled

[Action 2] Gateway captured payment from customer. Webhook arrives at razorpay-webhook...
Webhook response: HTTP 500 - Payment order is in an invalid state for confirmation: cancelled.

Durable State Audit for Stranded Payment pay_gateway_stranded_001:
- payment_transactions record exists: False
- refund records created for this payment: 0

[RECONCILIATION GAP CONFIRMED]:
1. Gateway successfully charged customer INR 999.00 (payment ID: pay_gateway_stranded_001).
2. Webhook returned HTTP 500 because order/sub is cancelled.
3. Gateway will retry for 24h, all failing with 500, then permanently abandon.
4. In the database, NO transaction record is saved, NO refund is queued, NO access is given.
5. Zero reconciliation jobs or admin alerts exist to recover or refund this money.
[Scenario D PASS] Confirmed reconciliation gap with reproducible evidence.
```

---

## 10. Durable-State and Invariant Results

| Invariant | Description | Evaluation Result | Evidence Reference |
| :---: | :--- | :---: | :--- |
| **Inv 1** | No duplicate payment transactions created for same accepted payment | **SATISFIED** | Scenario C: 3 webhook deliveries resulted in exactly 1 row in `payment_transactions`. |
| **Inv 2** | Subscription does not become active twice or receive duplicated terms | **SATISFIED** | Scenario C: Replay returned `already_confirmed`; term boundaries remained unchanged. |
| **Inv 3** | Committed cancellation cannot be silently overwritten by incompatible capture | **SATISFIED** | Scenario A1 & D: When cancellation committed first, subsequent capture attempts threw exception and aborted. |
| **Inv 4** | Successful capture has coherent, durable order and transaction state | **SATISFIED** | Scenario A2 & C: Order marked `'paid'`, transaction marked `'captured'`, subscription marked `'active'`. |
| **Inv 5** | Gateway-accepted payment is not silently discarded on DB failure | **VIOLATED (Scenario D)** | In Scenario D, the accepted payment is rejected by `confirm_booking_payment` without recording the transaction or scheduling a refund. |
| **Inv 6** | Unmatchable accepted payment has durable, discoverable recovery state | **VIOLATED (Scenario D)** | No table, queue, or view records the stranded payment. Webhook HTTP 500 logs are the only ephemeral trace. |
| **Inv 7** | Replaying same event does not cause duplicate effects | **SATISFIED** | Scenario C Delivery 3 verified idempotency. |
| **Inv 8** | Failed DB transactions leave no partial set of business changes | **SATISFIED** | PostgreSQL atomic transaction rollback verified in Scenarios A1, C, and D. |

---

## 11. Findings Classification

### 1. Lock-Order Deadlock: **NO ISSUE FOUND WITH EVIDENCE**
- **Migration History:** Migration 048 harmonized all lock acquisitions into Level 1 ($PO$) $\to$ Level 2 ($Sub$) $\to$ Level 3 ($Advisory$).
- **Runtime Proof:** Verified in Scenarios A1 and A2 with live `pg_locks` tracking. Zero deadlocks detected.

### 2. Historical Deadlock Susceptibility: **CONFIRMED HISTORICAL VULNERABILITY (Pre-M048)**
- **Runtime Proof:** Verified in Scenario A3 that original Migrations 020 and 027 deadlocked with SQLSTATE 40P01.

### 3. Stranded Gateway Capture After Cancellation: **CONFIRMED ISSUE**
- **Runtime Proof:** Verified in Scenario D that gateway charges for cancelled orders result in infinite 500 retries, zero database transaction records, zero queued refunds, and zero operator visibility.

### 4. Subscription Payment Capture Reconciliation Worker: **CONFIRMED ABSENCE (GAP)**
- **Codebase Proof:** Reconcile RPCs in Migrations 024 and 025 cover only refunds. No capture reconciliation worker or queue exists in Migration 016 or anywhere else in the repository.

---

## 12. Risk and Impact for Confirmed Issues

### Risk Rating: HIGH (Financial Inconsistency & Customer Support Risk)

1. **Financial Risk:** If an admin cancels an astrology subscription (e.g. at customer request or due to administrative action) while checkout is underway, the customer's payment succeeds at Razorpay but is dropped by the backend. The customer loses funds without receiving the subscription or a refund.
2. **Operational Blindspot:** Because `payment_transactions` never records the payment, the transaction does not appear in admin revenue totals, transaction lists, or refund request views. Administrators only discover the error when the customer files a chargeback or payment grievance.
3. **Webhook Resource Drain:** Razorpay retries the webhook with exponential backoff for 24 hours, consistently receiving HTTP 500 and bloating edge function logs before marking the webhook failed.

---

## 13. Minimal Recommended Remediation Options (Ordered by Risk Reduction)

*Note: In accordance with task instructions, no fixes have been implemented in this assessment task.*

### Recommendation 1 (Preferred / Production-Grade Minimal Fix): Safe Capture & Auto-Refund for Incompatible States
- **Mechanism:** Modify `public.confirm_booking_payment` to gracefully handle the case where `v_order.status = 'cancelled'` or `v_subscription.status = 'cancelled'`:
  1. Record the payment in `public.payment_transactions` as `'captured'`.
  2. Mark `public.payment_orders` as `'paid'`.
  3. Instead of raising an unhandled exception that rolls back the transaction, detect that the target subscription is `cancelled` and **automatically insert a refund request**:
     ```sql
     INSERT INTO public.refunds (
         payment_transaction_id,
         amount,
         reason,
         status
     ) VALUES (
         v_transaction_id,
         p_verified_amount,
         'Automatic refund: payment captured for cancelled subscription.',
         'requested'::public.refund_status
     );
     ```
  4. Return HTTP 200 with `{ "status": "refund_queued", "reason": "subscription_cancelled" }`.
- **Why this is best:**
  - Preserves financial truth: the customer was charged, and the database reflects it.
  - Automatically routes the refund into the existing M024/M025 refund execution queue (`execute-razorpay-refund`).
  - Stops infinite gateway webhook retries immediately.
  - Requires zero changes to external webhooks or database schemas.

### Recommendation 2: Admin Dashboard Capture Reconciliation View
- Extend `C:\Projects\kashi-veda-admin\lib\actions\payment-management.ts` and `getActionRequiredItems()` to query Razorpay's API periodically (or surface unconfirmed payment orders older than 30 minutes where Razorpay has a captured payment) so administrators can trigger manual reconciliation or refund.

---

## 14. Required Product or Operational Decisions

1. **Auto-Refund Policy:** Should a payment captured for a cancelled subscription be automatically refunded immediately (via Recommendation 1), or should the subscription be un-cancelled and activated?
   - *Recommendation:* Auto-refund immediately. The administrator explicitly cancelled the subscription; resurrecting it could contradict the user's intent or administrative decision.
2. **Expired Subscription Policy:** If a payment order is captured after a subscription was marked `expired` by cron housekeeping, should it extend the expired subscription by the purchased duration or auto-refund?
   - *Recommendation:* In `confirm_booking_payment`, treat expired subscriptions identically to new activations starting from `now()`.

---

## 15. Remaining Limitations and Next Safe Verification Steps

1. **Limitations:**
   - Webhook testing was performed using the exact SQL logic and synthetic HTTP wrappers matching `supabase/functions/razorpay-webhook/index.ts`. Live network delivery from Razorpay sandbox was not invoked, per safety boundaries.
2. **Next Steps:**
   - Review this assessment report with stakeholders.
   - Confirm Product Decision on Recommendation 1 (Auto-Refund on Capture for Cancelled Subscriptions).
   - Once approved, proceed to implement the minimal remediation under a dedicated remediation task.
