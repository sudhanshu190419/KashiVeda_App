# KashiVeda AST-07 — Final Capture-First Concurrency Verification Report

**Date:** October 10, 2026  
**Scope:** Astrology Subscription Payments & Cancellation Concurrency (AST-07 Follow-Up)  
**Target Migration:** `supabase/migrations/048_serialize_astrology_subscription_payments.sql`  
**Test Harness:** `scratch/test_astrology_payment_concurrency.py`  
**Engine Under Test:** PostgreSQL 18.4 (Disposable Isolated Test Database)  
**Production Status:** Undeployed (Local Test Environment Only)

---

## 1. Executive Summary

This report completes the final concurrency verification for **AST-07** by deterministically proving the **capture-first ordering** of concurrent subscription renewal and cancellation operations for two distinct subscriptions ($S_1$, $S_2$) belonging to the same customer.

Prior verification demonstrated that adding the Level 3 Customer Advisory Lock to `admin_cancel_astrology_subscription` prevents deadlocks when cancellation races with payment confirmation. However, the initial race interleaving observed cancellation acquiring the lock first (cancel-first). This follow-up enforced the reverse ordering (capture-first) using a deterministic synchronization trigger in the disposable PostgreSQL database.

### Key Verification Findings
1. **Deterministic Serialization Proved:** T1 (`confirm_booking_payment`) acquires the Customer Advisory Lock first, calculates $S_2$'s renewal interval from $S_1$'s active `ends_at`, and pauses. T2 (`admin_cancel_astrology_subscription`) starts and is confirmed **actively waiting** on the Customer Advisory Lock via `pg_locks` (`granted = false`).
2. **Zero Deadlocks & Clean Handoff:** When T1 commits, T1's advisory lock is automatically released; T2 immediately unblocks, acquires the lock, cancels $S_1$, and commits without conflict.
3. **Accurate State & Interval Invariants:** $S_1$ is marked `cancelled` with refund obligations queued; $S_2$ is confirmed `active` with an allocated term exactly equal to 30 days starting at $S_1$'s original expiration date.
4. **Access-Gap Behavior Documented:** In the capture-first ordering, an access gap naturally exists between the time $S_1$ is cancelled and $S_2$'s scheduled start date. This matches existing cancellation semantics: cancellation functions target only the specified subscription ID and do not unilaterally alter or pull forward other distinct subscription contracts.
5. **No Production Impact:** Migration 048 remains undeployed. Historical migrations 001–047 remain untouched.

---

## 2. Deterministic Capture-First Interleaving & Test Design

### 2.1 The Race Condition Scenario
- **Customer:** Customer F3 (`cust_f3`).
- **Subscription $S_1$:** An existing, active subscription expiring in 15 days (`s1_orig_ends_at = 2026-10-25 19:16:02.155320+05:30`).
- **Subscription $S_2$:** A distinct pending renewal linked to payment order $O_2$.
- **Concurrent Operations:**
  - **T1:** `public.confirm_booking_payment(O2, ...)` (Capturing payment for renewal $S_2$).
  - **T2:** `public.admin_cancel_astrology_subscription(S1, ...)` (Admin cancelling existing subscription $S_1$).

### 2.2 Test-Only Synchronization Mechanism (Test F3)
To eliminate timing nondeterminism, a controlled coordination gate was established in the disposable test database:
1. **Gate Lock:** A test coordinator session acquires advisory lock `999999` (`SELECT pg_advisory_lock(999999);`).
2. **Disposable Trigger:** A temporary trigger function (`public._test_pause_f3_trigger`) is installed on `public.astrology_subscriptions`:
   ```sql
   CREATE OR REPLACE FUNCTION public._test_pause_f3_trigger()
   RETURNS TRIGGER AS $$
   BEGIN
       IF NEW.id = 'sub_f3_2_uuid'::uuid THEN
           -- Block until coordinator releases gate lock 999999
           PERFORM pg_advisory_lock(999999);
           PERFORM pg_advisory_unlock(999999);
       END IF;
       RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER trg_test_pause_f3
       AFTER UPDATE ON public.astrology_subscriptions
       FOR EACH ROW
       EXECUTE FUNCTION public._test_pause_f3_trigger();
   ```
3. **Execution Sequence:**
   - **Step 1:** Worker T1 calls `confirm_booking_payment(O2)`. Under the 3-level lock hierarchy of Migration 048, T1 acquires:
     - Level 1: Row lock on `payment_orders` ($O_2$).
     - Level 2: Row lock on `astrology_subscriptions` ($S_2$).
     - Level 3: Transaction-scoped Customer Advisory Lock for `cust_f3`.
   - **Step 2:** T1 evaluates active subscriptions, finds $S_1$ active until `s1_orig_ends_at`, and updates $S_2$ with `starts_at = s1_orig_ends_at` and `ends_at = s1_orig_ends_at + 30 days`.
   - **Step 3:** The update on $S_2$ fires `trg_test_pause_f3`. Inside the trigger, T1 attempts to acquire lock `999999` and blocks with its transaction open, **holding the Customer Advisory Lock**.
   - **Step 4:** The coordinator confirms T1 is waiting on lock `999999`.
   - **Step 5:** Worker T2 starts `admin_cancel_astrology_subscription(S1)`. T2 acquires the row lock on $S_1$, then attempts to acquire the Level 3 Customer Advisory Lock for `cust_f3`.
   - **Step 6:** T2 blocks because the Customer Advisory Lock is held by T1.
   - **Step 7:** The coordinator queries `pg_locks` for T2's backend PID and verifies T2 is actively waiting on the advisory lock.
   - **Step 8:** The coordinator releases gate lock `999999`.
   - **Step 9:** T1 resumes, completes transaction insertion, commits, and releases the Customer Advisory Lock.
   - **Step 10:** T2 acquires the Customer Advisory Lock, marks $S_1$ cancelled, records refund obligations, and commits.
   - **Step 11:** The coordinator drops `trg_test_pause_f3` and `_test_pause_f3_trigger`.

*Note: No instrumentation, delays, or test hooks were added to Migration 048. All synchronization was managed externally in the test environment.*

---

## 3. Lock-Wait Evidence from PostgreSQL System Catalog

During step 7 of Test F3, while T1 was paused inside its open transaction holding the customer advisory lock, the coordinator queried `pg_locks` for T2's backend process ID (`pid = 27132`):

```sql
SELECT locktype, classid, objid, granted, pid
FROM pg_locks
WHERE locktype = 'advisory' AND pid = 27132 AND NOT granted;
```

### Observed PostgreSQL Catalog Result:
```
[EVIDENCE 1] T1 acquired Customer Advisory Lock and is holding it inside open transaction.
[EVIDENCE 2] T2 (PID 27132) is confirmed WAITING on Customer Advisory Lock:
             ('advisory', 4007134197, 672019302, False, 27132)
[COORDINATION] Released gate lock; allowing T1 to commit and hand off Customer lock to T2.
```

### Interpretation of Catalog Fields:
- `locktype`: `'advisory'` — Identifies an advisory lock.
- `classid`: `4007134197` — High 32 bits of the canonical 64-bit advisory lock key derived from `cust_f3`.
- `objid`: `672019302` — Low 32 bits of the canonical 64-bit advisory lock key.
- `granted`: `False` — Confirms that T2 was **blocked** and unable to proceed.
- `pid`: `27132` — Matches the dedicated PostgreSQL backend worker running T2.

This provides definitive system-catalog evidence that the Customer Advisory Lock serialized the two transactions and that T2 did not proceed with cancellation until T1 committed.

---

## 4. Final Database Records and Timestamps

Following the commit of both operations, database records were inspected:

### Subscription Records (`astrology_subscriptions`):
| Field | Subscription $S_1$ (Target of T2) | Subscription $S_2$ (Target of T1) |
|---|---|---|
| **Subscription ID** | `sub_f3_1` | `sub_f3_2` |
| **Status** | `'cancelled'` | `'active'` |
| **Starts At** | `2026-09-25 19:16:02.155320+05:30` | `2026-10-25 19:16:02.155320+05:30` |
| **Ends At** | `2026-10-25 19:16:02.155320+05:30` (orig) | `2026-11-24 19:16:02.155320+05:30` |
| **Duration** | 30 days (cancelled at day 15) | Exactly 30 days |
| **Payment Order ID** | `order_f3_1` (`paid`) | `order_f3_2` (`paid`) |

### Financial & Refund Records:
- **Order $O_2$:** Status is `paid`.
- **Payment Transactions:** Exactly one payment transaction captured for $O_2$ with verified amount `299.00`.
- **Cancellation Payload ($S_1$):**
  - `status`: `'cancelled'`
  - `refund_eligible`: `true`
  - `refund_amount`: `299.00`
  - `total_captured`: `299.00`
  - `already_refunded`: `0.00`
  - Refund obligation queued in requested state.

### Idempotency Replay Test:
Replaying `confirm_booking_payment(O2, ...)` with the same provider payment ID after both transactions had committed returned `active` / `already_confirmed`. The payment transaction count remained strictly `1`, and subscription intervals were unmodified.

---

## 5. Access-Gap Analysis & Product Policy Review

### 5.1 The Observed State Under Capture-First Ordering
In the capture-first sequence:
1. At $T_1$, $S_1$ is active with 15 days remaining. Renewal $S_2$ is confirmed and scheduled to begin at $S_1$'s `ends_at` ($+15$ days).
2. At $T_2$, an administrator cancels $S_1$ with immediate effect and queues a full refund.
3. As of the cancellation moment (`now()`), $S_1$ is `cancelled`, but $S_2$'s `starts_at` remains $+15$ days in the future.
4. Consequently, between `now()` and $+15$ days, the customer has **no active subscription access**, followed by 30 days of active access starting at $+15$ days.

### 5.2 Existing Product & Architectural Semantics
- **Contract Isolation:** In `admin_cancel_astrology_subscription`, the function signature is `(p_subscription_id uuid, p_reason text, p_refund_eligible boolean)`. The implementation cancels strictly the targeted subscription ID. It does not search for, reschedule, or mutate other distinct subscriptions belonging to the customer.
- **Client Presentation:** The mobile application logic in `selectSubscriptionSummary` (`src/features/astrology/services/astrologyService.ts`) correctly categorizes $S_2$ as a `futureSubscription` because its `starts_at` is greater than `now()`.
- **Intent Alignment:** When a customer purchases a future renewal and subsequently requests or undergoes cancellation and refund of their *current* term, automatically moving future paid terms forward without customer consent could violate user expectations or financial reporting (e.g. consuming a future entitlement early).

### 5.3 Product Policy Finding
> **Preserve Existing Semantics:** Immediate cancellation of $S_1$ while retaining $S_2$'s original scheduled start timestamp is the authoritative and intended behavior of the current database contract. No unapproved policy modifications should be made to pull forward future subscriptions.

If product stakeholders later require future subscriptions to automatically activate immediately upon prior-term cancellation:
- It must be specified as an explicit product requirement.
- It would require an additional database RPC or cancellation trigger that explicitly recalculates `starts_at = now()` and `ends_at = now() + (plan_duration)` for any pending/future subscriptions belonging to that customer.
- Under AST-07, retaining $S_2$'s scheduled start date remains authoritative and correct.

---

## 6. Complete Verification Results

### 6.1 Database Concurrency Suite (`scratch/test_astrology_payment_concurrency.py`)
Executed against PostgreSQL 18.4 on port 5433:

| Test ID | Scenario Description | Result |
|---|---|---|
| **Test A** | Two distinct orders, same customer (Concurrent Confirmation) | **PASS** (Zero overlap, 60 sequential days) |
| **Test B** | Two distinct orders with different plans (30d + 90d) | **PASS** (120 sequential days) |
| **Test C** | Same-order concurrent replay (Idempotency) | **PASS** (Strictly idempotent duplicate handling) |
| **Test D** | Concurrent creation requests (Pending-Order Reuse Serialization) | **PASS** (Clean serialization, no duplicate orders) |
| **Test E** | Different customers (Independent Concurrency) | **PASS** (Zero contention across customers) |
| **Test F1** | Cancellation vs capture on the SAME subscription | **PASS** (Zero deadlocks, deterministic resolution) |
| **Test F2** | Cancellation of S1 vs Capture of S2 (Cancel-First Interleaving) | **PASS** (Zero deadlocks, consistent intervals) |
| **Test F3** | Cancellation of S1 vs Capture of S2 (Capture-First Interleaving) | **PASS** (Deterministic lock-wait verified via `pg_locks`) |
| **Test G** | Payment validation and rollback on amount mismatch | **PASS** (Rollback clean, state uncorrupted) |
| **Test H** | Renewal interval calculation appending to active term | **PASS** (Clean continuation without gap) |
| **Test I** | Function execution privileges and grants | **PASS** (Strict security definer & ACL isolation) |

**Overall Concurrency Suite:** 11/11 Scenarios Passed (9 Main Suites A–I).

### 6.2 Jest Regression Suites
- `__tests__/astrology_subscription_payment_serialization.test.ts`: **14/14 tests passed** (0.875s).
- Full Project Regression Suite: **44 test suites passed, 799 tests passed, 0 failures**.

### 6.3 TypeScript Compiler Check
- Command: `npx tsc --noEmit`
- Result: **0 errors** (Clean compilation).

---

## 7. Migration Safety & Production Integrity

- **Historical Migrations:** Migrations `001` through `047` were verified and remain bit-for-bit identical to their audited versions.
- **Migration 048:** Located at `supabase/migrations/048_serialize_astrology_subscription_payments.sql`. It contains forward-only DDL and functions with the 3-level lock hierarchy:
  1. Level 1: `payment_orders` row lock.
  2. Level 2: `astrology_subscriptions` row lock.
  3. Level 3: Transaction-scoped Customer Advisory Lock (`pg_advisory_xact_lock`).
- **Production Status:** Migration 048 has **not** been pushed or applied to any production or remote database, in strict compliance with project rules.

---

## 8. Conclusion

The AST-07 capture-first concurrency verification has succeeded completely. By capturing real `pg_locks` evidence of T2 blocking on T1's advisory lock, the serialization guarantees of Migration 048 have been proven in both interleaving directions (cancel-first and capture-first) without deadlocks, without data corruption, and with full fidelity to existing product contracts.
