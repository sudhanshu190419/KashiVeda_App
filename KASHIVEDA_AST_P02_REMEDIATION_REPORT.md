# KashiVeda — AST-P02 Remediation Report
## Payment Captured After Subscription Cancellation

**Classification:** Confirmed Financial-Reconciliation Defect Remediation  
**Target Finding:** AST-P02 (Feature 02 Astrology Audit & Assessment Report)  
**Date:** 2026-10-11  
**Remediation Policy:** If the gateway verifiably captures a valid payment for an astrology subscription whose order or subscription was cancelled prior to confirmation, durably record the payment in `public.payment_transactions` and atomically queue a full refund request in `public.refunds`. Do not reactivate the cancelled subscription.  
**Scope:** AST-P02 remediation only. Forward-only migration `054_reconcile_cancelled_astrology_subscription_payments.sql` and Edge Function webhook synchronization.

---

## 1. Executive Summary

| Item | Details |
| :--- | :--- |
| **Defect Remediated** | Payment captured by gateway for a cancelled astrology subscription was rejected by `public.confirm_booking_payment`, causing persistent webhook retries (HTTP 500), complete SQL rollback, zero payment transactions recorded, zero refund requests queued, and total loss of administrative visibility over stranded customer funds. |
| **Root Cause** | Historical versions of `public.confirm_booking_payment` (including migration 053) enforced strict guardrails `IF v_order.status NOT IN ('created', 'pending') THEN RAISE EXCEPTION ...` and `ELSIF v_subscription.status != 'payment_pending' THEN RAISE EXCEPTION ...`. Any capture received after admin cancellation aborted the entire transaction. |
| **Corrected Behavior** | Implemented Migration 054 (`054_reconcile_cancelled_astrology_subscription_payments.sql`). When a verified captured payment is confirmed for a cancelled subscription or cancelled payment order: <br>1. Payment is durably recorded in `public.payment_transactions` with status `'captured'`.<br>2. Payment order status is retained as `'cancelled'`.<br>3. Subscription status remains `'cancelled'` with no access granted and dates untouched.<br>4. A full refund obligation is atomically inserted into `public.refunds` with status `'requested'`.<br>5. Redelivered capture events return idempotent outcome `'already_refunded'`. |
| **Edge Function Alignment** | Updated `supabase/functions/razorpay-webhook/index.ts` line 241 to recognize `already_refunded` as an idempotent duplicate capture and acknowledge Razorpay with HTTP 200. |
| **Test Verification** | 8 deterministic scenarios executed on disposable local PostgreSQL 18.4 (port 5433); Jest test suites (82 backend/financial tests, 32 serialization/snapshot tests); full TypeScript verification. All 8 scenarios and regression suites **PASSED**. |
| **Production Safety** | **100% Isolated Local Execution.** No production/staging database access; no remote migrations applied or pushed; no deployment; no real gateway API calls or financial disbursements. |

---

## 2. Root Cause & Original Finding Reference

### 2.1 Audit & Assessment Reference
- **Original Audit Finding:** `AST-P02` in `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`.
- **Confirmed Assessment:** `KASHIVEDA_AST_P02_ASSESSMENT_REPORT.md` (Sections 1–8).

### 2.2 Mechanism of the Failure
Before migration 054, `public.confirm_booking_payment` evaluated incoming captures under the assumption that all valid orders are in `'created'` or `'pending'` status:

```sql
-- Migration 053 / Historical implementation
IF v_order.status NOT IN ('created', 'pending') THEN
    RAISE EXCEPTION 'Payment order is in an invalid state for confirmation: %.', v_order.status;
END IF;
```

When an administrator executed `admin_cancel_astrology_subscription` while a customer was in the Razorpay checkout modal:
1. `admin_cancel_astrology_subscription` acquired locks and updated `astrology_subscriptions.status = 'cancelled'` and `payment_orders.status = 'cancelled'`.
2. The customer authorized the payment at the gateway, which succeeded and triggered the `payment.captured` webhook.
3. The webhook invoked `public.confirm_booking_payment`.
4. `confirm_booking_payment` evaluated `v_order.status` (`'cancelled'`) and raised an unhandled exception.
5. PostgreSQL aborted and rolled back the transaction completely.
6. The webhook logged an error and returned HTTP 500 to Razorpay.
7. Razorpay repeatedly retried delivery for 24 hours until expiry.
8. **Outcome:** Customer was charged; merchant retained the money; zero rows existed in `payment_transactions`; zero rows existed in `refunds`; the admin dashboard showed zero action items; the subscription remained cancelled.

---

## 3. Source Functions & Files Modified

### 3.1 Backend Database Migration
**File Created:**  
[`C:\Projects\KashiVeda\supabase\migrations\054_reconcile_cancelled_astrology_subscription_payments.sql`](file:///C:/Projects/KashiVeda/supabase/migrations/054_reconcile_cancelled_astrology_subscription_payments.sql)

**Function Modified:**  
`public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB)`

**Key Changes in RPC:**
1. **Section 6 (Idempotency & Re-delivery Protection):**  
   Added a pre-check for existing payment transactions on cancelled subscription orders. If a transaction exists and has a linked refund, returns `{ status: 'already_refunded', refund_id: ..., amount_refunded: ... }`. If a transaction exists but the refund obligation was missing, recovers the missing refund row atomically and returns `refund_queued`.
2. **Section 7 (Cancelled Subscription Capture Reconciliation Branch):**  
   Detects `IF v_order.purpose = 'subscription' AND (v_order.status = 'cancelled' OR v_subscription.status = 'cancelled') THEN`:
   - Inserts `public.payment_transactions` (`status = 'captured'`).
   - Retains `public.payment_orders.status = 'cancelled'`.
   - Ensures `public.astrology_subscriptions.status = 'cancelled'` (no access granted).
   - Inserts `public.refunds` (`status = 'requested'`, amount = captured amount).
   - Inserts structured audit record in `public.admin_audit_logs` (guarded by `IF auth.uid() IS NOT NULL THEN`).
   - Returns `{ status: 'refund_queued', ... }`.
3. **Preservation of Invariants:**  
   Preserved all AST-07 serialization locks, AST-P01 duration snapshot enforcement, puja booking balance/advance handling, and Kundli order paths.

### 3.2 Edge Function Webhook Handler
**File Modified:**  
[`C:\Projects\KashiVeda\supabase\functions\razorpay-webhook\index.ts`](file:///C:/Projects/KashiVeda/supabase/functions/razorpay-webhook/index.ts)

**Change:**  
Updated lines 241–254 to recognize `rpcResult?.status === "already_refunded"` alongside `"already_confirmed"`:
```ts
if (
  rpcResult?.status === "already_confirmed" ||
  rpcResult?.status === "already_refunded"
) {
  logger.info("Payment already confirmed or refunded (idempotent duplicate capture)", {
    functionName: "razorpay-webhook",
    paymentOrderId: order.id,
    providerPaymentId,
    razorpayOrderId,
    status: rpcResult?.status,
  });
  return jsonResponse(
    { success: true, status: rpcResult?.status },
    200
  );
}
```

---

## 4. Migration & Schema Changes

### 4.1 Forward-Only Migration
- **Migration Number:** `054`
- **Migration Name:** `054_reconcile_cancelled_astrology_subscription_payments.sql`
- **Historical Migrations Untouched:** Migrations `001` through `053` were completely preserved without any modification.

### 4.2 Schema Invariants & Enum Validation
No new tables, columns, constraints, or enums were created. All data structures utilize the existing audited schema:

| Table | Column | Value Written | Schema Constraints & Foreign Keys |
| :--- | :--- | :--- | :--- |
| `public.payment_transactions` | `status` | `'captured'` | Valid enum `payment_transaction_status` |
| `public.payment_orders` | `status` | `'cancelled'` | Valid enum `payment_order_status` |
| `public.astrology_subscriptions` | `status` | `'cancelled'` | Valid enum `astrology_subscription_status` |
| `public.refunds` | `status` | `'requested'` | Valid enum `refund_status` |
| `public.refunds` | `amount` | `p_verified_amount` | Matches verified captured payment |
| `public.refunds` | `booking_cancellation_id` | `NULL` | Nullable column; subscription refunds do not reference puja cancellations |
| `public.refunds` | `payment_transaction_id` | `v_transaction_id` | Foreign key to `payment_transactions(id)` |

---

## 5. Detailed Corrected Capture Behavior

### 5.1 Verification Workflow
```mermaid
sequenceDiagram
    autonumber
    participant Gateway as Razorpay Gateway
    participant Webhook as razorpay-webhook (Edge Function)
    participant RPC as public.confirm_booking_payment
    participant DB as PostgreSQL (Atomic Tx)

    Gateway->>Webhook: POST /razorpay-webhook (payment.captured)
    Webhook->>Webhook: Validate HMAC-SHA256 signature
    Webhook->>Webhook: Verify amount against payment_orders
    Webhook->>RPC: confirm_booking_payment(order_id, pay_id, amount)
    RPC->>DB: Level 1 Lock: SELECT * FROM payment_orders FOR UPDATE
    RPC->>DB: Level 2 Lock: SELECT * FROM astrology_subscriptions FOR UPDATE
    RPC->>DB: Level 3 Lock: SELECT pg_advisory_xact_lock(customer_id)
    alt Order / Subscription is CANCELLED
        RPC->>DB: INSERT INTO payment_transactions (status='captured')
        RPC->>DB: UPDATE payment_orders SET status='cancelled'
        RPC->>DB: Keep astrology_subscriptions status='cancelled'
        RPC->>DB: INSERT INTO refunds (status='requested', amount=verified_amount)
        RPC-->>Webhook: RETURN { status: "refund_queued", ... }
        Webhook-->>Gateway: HTTP 200 OK (Reconciled & Queued)
    else Order is CREATED / PENDING
        RPC->>DB: Standard Activation: status='active', duration snapshot applied
        RPC-->>Webhook: RETURN { status: "active", ... }
        Webhook-->>Gateway: HTTP 200 OK
    end
```

### 5.2 Key Corrected Invariants
1. **No Access Restoration:** A cancelled subscription is NEVER reactivated. `starts_at` and `ends_at` are unchanged.
2. **Authoritative Ledger:** Every rupee captured by Razorpay is matched by a durable row in `payment_transactions` (`status = 'captured'`).
3. **Atomic Refund Obligation:** The refund obligation in `public.refunds` is created in the exact same database transaction as the transaction record. It is impossible to commit the captured payment without committing the refund request.
4. **Order Status Contract:** `payment_orders.status` remains `'cancelled'`. The order was not fulfilled; access was denied; the order obligation is terminated.

---

## 6. Refund Workflow Integration & Failure Recovery

### 6.1 Refund Lifecycle
```mermaid
stateDiagram-v2
    [*] --> requested: confirm_booking_payment (auto-refund)
    requested --> processing: claim_refund_for_execution (Admin / Edge Function)
    processing --> processed: Gateway Success (reconcile_processed_refund)
    processing --> failed: Gateway Rejection / Webhook refund.failed (reconcile_failed_refund)
    failed --> processing: Operator Retry (claim_refund_for_execution)
    processed --> [*]
```

### 6.2 Existing Refund Engine Compatibility
1. **`claim_refund_for_execution`:**  
   In Migration 025, `claim_refund_for_execution` accepts any refund in `'requested'` or `'failed'` status. It transitions status to `'processing'` and returns the `provider_payment_id` by following the foreign key `refunds.payment_transaction_id -> payment_transactions.provider_payment_id`.
2. **`execute-razorpay-refund` Edge Function:**  
   The Edge Function receives `refund_id`, claims it via RPC, invokes Razorpay Refund API with the idempotency header `X-Razorpay-Idempotency: refund_<refund_id>`, and calls `reconcile_processed_refund` on success or records failure.
3. **Gateway Failure Handling:**  
   If the gateway rejects the refund (e.g. insufficient merchant account balance):
   - Direct execution failure transitions `refunds.status = 'failed'`.
   - Webhook `refund.failed` calls `reconcile_failed_refund(p_provider_refund_id, p_error_code, p_error_description)` which sets `status = 'failed'` and updates `updated_at`.
   - Crucially, `status = 'failed'` is eligible for re-claiming by `claim_refund_for_execution`, enabling operators to retry disbursement after addressing gateway account balance.
4. **Authoritative Completion:**  
   Once Razorpay completes disbursement, `reconcile_processed_refund` sets `refunds.status = 'processed'` and updates `payment_transactions.status = 'refunded'`.

### 6.3 Administrative Observability
In `C:\Projects\kashi-veda-admin\lib\actions\payment-management.ts`:
- **`getActionRequiredItems`:** Queries `public.refunds` where `status IN ('requested', 'processing', 'failed')`.
  - When `r.status === "requested"`: Displays as `actionType: "refund_requested"`, `severity: "warning"`, title: *"Refund Execution Awaited"*.
  - When `r.status === "failed"`: Displays as `actionType: "refund_failed"`, `severity: "critical"`, title: *"Gateway Refund Failed"*, with `canRetry: true`.
  - When `r.status === "processing"` (> 15 minutes): Displays as `actionType: "refund_stuck_processing"`, `severity: "critical"`, title: *"Refund Requires Recovery"*, with `isRecoverable: true`.
- **`getRefundRecords`:** Full administrative list of all historical and active refund obligations, with filtering by status (`requested`, `processing`, `processed`, `failed`) and search by transaction UUID or provider payment ID.

---

## 7. Idempotency & Transaction Boundaries

### 7.1 Multi-Layer Idempotency Guarantees
1. **Layer 1 — Provider Payment Identifier Registry:**  
   `public.confirm_booking_payment` enforces that a `p_provider_payment_id` cannot be registered to a different `payment_order_id`. If already registered to another order, an immediate exception is raised (`line 62`).
2. **Layer 2 — Subscription Re-delivery Idempotency:**  
   If the same `payment.captured` event is delivered again:
   - The function checks if `payment_transactions` already contains `p_provider_payment_id` for this `p_payment_order_id`.
   - It checks `public.refunds` for a linked refund.
   - If found, it returns `status: 'already_refunded'`, along with the existing `refund_id` and current `refund_status`.
   - Zero additional rows are created in `payment_transactions` or `refunds`.
3. **Layer 3 — State Preservation on Replay:**  
   If the refund has already advanced to `'processed'`, redelivering the capture event does NOT regress the refund status back to `'requested'`. It preserves `'processed'`.
4. **Layer 4 — Missing Refund Self-Healing:**  
   If historical or corrupted data left a captured transaction on a cancelled order without a corresponding refund row, Section 6 automatically creates the missing refund obligation and returns `is_recovered: true`.

### 7.2 Transaction Boundaries
The entire operation in `confirm_booking_payment` runs inside a single PostgreSQL ACID transaction. If an unexpected error or server disconnect occurs prior to `COMMIT`, the transaction rolls back completely:
- 0 rows inserted in `payment_transactions`.
- 0 rows inserted in `refunds`.
- Payment order and subscription remain in their prior state.
- Webhook catches failure and responds with HTTP 500, prompting Razorpay to retry delivery once the database is healthy.

---

## 8. Lock-Order & Concurrency Verification

### 8.1 Preserved Global Lock Hierarchy
Migration 054 strictly maintains the lock hierarchy established in Migration 048 to prevent deadlock between cancellation and payment confirmation:

$$\text{Level 1: } \text{public.payment_orders (FOR UPDATE)} \longrightarrow \text{Level 2: } \text{public.astrology_subscriptions (FOR UPDATE)} \longrightarrow \text{Level 3: } \text{pg\_advisory\_xact\_lock(customer\_id)}$$

Both `confirm_booking_payment` and `admin_cancel_astrology_subscription` acquire locks in this exact identical sequence:
1. `payment_orders` locked first via `FOR UPDATE`.
2. `astrology_subscriptions` locked second via `FOR UPDATE`.
3. Customer advisory lock acquired third.

### 8.2 Runtime Concurrency Interleavings Tested

#### Interleaving 6A: Cancellation Commits First
- **Execution:** Connection A (Cancel) acquires Level 1 and Level 2 locks on open order and subscription. Connection B (Capture) attempts to confirm payment and blocks waiting for Level 1 lock.
- **Lock Wait Observed:** Verified via `pg_locks` that Connection B is waiting on tuple lock granted to Connection A.
- **Outcome:** Connection A commits cancellation (`astrology_subscriptions.status = 'cancelled'`, `payment_orders.status = 'cancelled'`). Connection B unblocks, re-reads order as `'cancelled'`, enters Section 7, durably writes transaction `'captured'`, queues refund `'requested'`, and keeps subscription `'cancelled'`. **PASS**.

#### Interleaving 6B: Capture Commits First
- **Execution:** Connection B (Capture) acquires Level 1 and Level 2 locks on open order and subscription. Connection A (Cancel) attempts to cancel subscription and blocks on Level 1.
- **Outcome:** Connection B commits standard capture (`astrology_subscriptions.status = 'active'`, `payment_orders.status = 'paid'`). Connection A unblocks, inspects active subscription, cancels it according to cancellation business rules, and issues a standard cancellation refund. **PASS**.

**Result:** Zero deadlocks detected under concurrent execution.

---

## 9. Expired-Order Behavior & Unresolved Product Decisions

### 9.1 Baseline Expiry Behavior Audit
In accordance with Section 3.E and Section 6 (Scenario 8) of the user instructions, the behavior of expired payment orders was audited against the baseline schema without altering expiry policy.

**Observed Runtime Behavior:**
When `confirm_booking_payment` is called for an order in status `'expired'`, line 368 triggers:
```sql
IF v_order.status NOT IN ('created', 'pending') THEN
    RAISE EXCEPTION 'Payment order is in an invalid state for confirmation: %.', v_order.status;
END IF;
```
Execution aborts, transaction rolls back, and the capture is rejected.

### 9.2 Identified Financial Gap for Expired Orders
If a customer begins checkout, allows the checkout order window to expire (e.g. after order TTL expiry), and then completes payment at Razorpay, the same financial gap occurs:
- The payment was captured by the gateway.
- `confirm_booking_payment` rejects the order because its status is `'expired'`.
- Webhooks repeatedly fail.
- No payment transaction is recorded, and no refund is queued.

### 9.3 Product Decisions Required
Remediating the expired state requires an explicit product decision between two conflicting business policies:
1. **Policy Option A (Auto-Refund on Expiry):**  
   Treat `'expired'` orders identically to `'cancelled'` orders: capture the payment in `payment_transactions`, keep the order `'expired'`, and automatically queue a full refund in `public.refunds`.  
   *Use Case:* Recommended if the catalog plan price or subscription validity was time-sensitive and the customer missed the checkout window.
2. **Policy Option B (Revive and Activate from Capture Time):**  
   Revive the expired order, set `status = 'paid'`, and activate the subscription starting from `now()` using the checkout-time duration snapshot frozen in `payment_orders.duration_days`.  
   *Use Case:* Recommended if checkout timeout is purely operational (e.g. 15-minute Razorpay modal session) and the customer genuinely intended to subscribe.

**Conclusion:** Migration 054 deliberately scopes the auto-refund remediation strictly to `'cancelled'` subscriptions as approved. Expired order behavior remains unchanged until an explicit business policy decision is rendered.

---

## 10. Test Environment & Safety Boundaries

### 10.1 Disposable PostgreSQL Instance
- **Host / Port:** `127.0.0.1:5433` (isolated port, distinct from standard port 5432).
- **Data Directory:** `C:\Users\Sudhanshu\.gemini\antigravity-ide\brain\42cdb6b4-fc12-43c7-8641-11e76a46b5cd\scratch\disposable_pg`.
- **Engine Version:** PostgreSQL 18.4 (x86_64).
- **Lifecycle:** Initialized, applied migrations 001–054, executed test scenarios, and shut down cleanly with 0 leftover background processes.

### 10.2 Strict Safety Invariant Verification
- **Production Database:** NEVER connected or modified.
- **Remote Migrations:** NO migrations pushed to remote Supabase instances.
- **Application Deployments:** NO Edge Functions or web/mobile bundles deployed.
- **Real Financial APIs:** ZERO real charges, refunds, or Razorpay network requests made. Only synthetic fixtures (`pay_scenario1_001`, `order_mock_sc1`, `rfnd_simulated_fail_001`, etc.) were used.

---

## 11. Exact Test Commands, Results, & Execution Evidence

### 11.1 AST-P02 Verification Suite (`scratch/test_ast_p02_remediation.py`)
**Command Executed:**
```powershell
python scratch/test_ast_p02_remediation.py
```
**Exit Code:** `0`  
**Output Summary:**
```json
{
  "Scenario 1": "PASS",
  "Scenario 2": "PASS",
  "Scenario 3": "PASS",
  "Scenario 4": "PASS",
  "Scenario 5": "PASS",
  "Scenario 6": "PASS",
  "Scenario 7": "PASS",
  "Scenario 8": "PASS"
}
```

#### Detailed Scenario Breakdown:
- **Scenario 1 (Cancelled Order, Verified Capture):**  
  Synthetic cancelled subscription (`sub_1`) and cancelled order (`po_1`) processed via `confirm_booking_payment`.  
  *Result:* Returned `{ status: 'refund_queued', amount_refunded: 999.00, refund_status: 'requested', subscription_status: 'cancelled' }`. Transaction recorded as `'captured'`; refund recorded as `'requested'`; subscription remained `'cancelled'`; audit log inserted. **PASS**.
- **Scenario 2 (Duplicate Capture Event Idempotency):**  
  Replayed exact capture payload.  
  *Result:* Returned `{ status: 'already_refunded' }`. Count of `payment_transactions` remained `1`; count of `refunds` remained `1`. Simulated refund status update to `'processed'`; subsequent redelivery returned `{ status: 'already_refunded', refund_status: 'processed' }` without regressing state. **PASS**.
- **Scenario 3 (Database Failure Rollback & Webhook Retry):**  
  Injected connection termination / operational error before `COMMIT`. Verified 0 partial rows persisted. Gateway redelivered after connection recovery; reconciliation succeeded completely. **PASS**.
- **Scenario 4 (Refund Execution Failure Simulation & Operator Recovery):**  
  Admin claimed refund via `claim_refund_for_execution` (`status = 'processing'`). Simulated Razorpay API failure via `reconcile_failed_refund` (`status = 'failed'`). Operator retried claim and completed via `reconcile_processed_refund` (`status = 'processed'`, transaction status `'refunded'`). **PASS**.
- **Scenario 5 (Normal Payment Regression):**  
  Eligible pending subscription order (`po_5`) confirmed. Subscription activated (`status = 'active'`, `duration_days = 30`); order set to `'paid'`; 0 refund requests created. **PASS**.
- **Scenario 6 (Concurrent Cancellation & Capture):**  
  - *Interleaving 6A (Cancel First):* Cancel committed; capture unblocked and queued refund cleanly. **PASS**.  
  - *Interleaving 6B (Capture First):* Capture committed and activated subscription; cancel unblocked and executed cancellation refund. **PASS**.
- **Scenario 7 (Security & Financial Invariants):**  
  - Amount mismatch ($500.00 vs $999.00) rejected with exception. **PASS**.  
  - Provider payment reuse across orders rejected with exception. **PASS**.
- **Scenario 8 (Expired Order Behavior Audit):**  
  Verified that expired order confirmation is rejected under baseline policy. **PASS**.

---

### 11.2 Regression Test Suites

#### Astrology Serialization & Duration Snapshots
**Command Executed:**
```powershell
npm test -- __tests__/astrology_checkout_duration_snapshot.test.ts __tests__/astrology_subscription_payment_serialization.test.ts
```
**Exit Code:** `0`  
**Result:** 2 test suites passed, 32 tests passed (AST-P01 duration snapshot freezing and AST-07 serialization preserved).

#### Financial Hardening & Edge Function Suites
**Command Executed:**
```powershell
npm test -- __tests__/payment_edge_functions.test.ts __tests__/financial_backend_hardening.test.ts __tests__/daily_astrology_subscription_financial_ledger.test.ts
```
**Exit Code:** `0`  
**Result:** 3 test suites passed, 82 tests passed.

#### Static Analysis & Lint Checks
1. **TypeScript Validation (Mobile & Backend):**  
   Command: `npx tsc --noEmit` in `C:\Projects\KashiVeda`  
   Exit Code: `0` (Zero TypeScript diagnostics).
2. **ESLint on Modified Edge Function:**  
   Command: `npx eslint supabase/functions/razorpay-webhook/index.ts --no-ignore` in `C:\Projects\KashiVeda`  
   Exit Code: `0` (Zero errors, zero warnings).
3. **TypeScript Validation (Admin Web App):**  
   Command: `npx tsc --noEmit` in `C:\Projects\kashi-veda-admin`  
   Exit Code: `0` (Zero TypeScript diagnostics across admin actions).

---

## 12. Classification of Remediation Criteria

| Criterion | Evaluation | Evidence Type | Status |
| :--- | :--- | :--- | :--- |
| **Cancelled Capture Auto-Refund** | Payment captured on cancelled subscription records transaction and queues refund | Runtime test (Scenario 1) | **PASS** |
| **No Access on Cancelled Sub** | Subscription remains cancelled; no dates extended | Runtime test (Scenario 1 & 6A) | **PASS** |
| **Capture Replay Idempotency** | Duplicate webhooks return `already_refunded` without duplicate records | Runtime test (Scenario 2) | **PASS** |
| **Crash & Rollback Safety** | Transaction failures leave 0 partial records; redelivery recovers cleanly | Runtime test (Scenario 3) | **PASS** |
| **Refund Failure & Retry** | Failed refund visible, retryable via `claim_refund_for_execution` | Runtime test (Scenario 4) | **PASS** |
| **Admin Observability** | Refund visible in `getActionRequiredItems` and `getRefundRecords` | Static code inspection (`payment-management.ts`) | **PASS** |
| **Lock Hierarchy & Concurrency** | Zero deadlocks observed in both 6A and 6B interleavings | Runtime concurrency test (Scenario 6) | **PASS** |
| **Normal Payment Invariants** | Active subscriptions activate with checkout-time duration snapshot intact | Runtime test (Scenario 5) + Jest suite | **PASS** |
| **Security & Invariants** | Signature, amount match, and cross-order guards enforced | Runtime test (Scenario 7) | **PASS** |
| **Expired Order Audit** | Expiry behavior audited and documented without unauthorized change | Runtime test (Scenario 8) | **PASS** |

---

## 13. Remaining Risks & Limitations

1. **Asynchronous Gateway Refund Disbursement:**  
   Creating a row in `public.refunds` with status `'requested'` durably records the merchant's refund obligation, but does not disburse funds back to the customer's bank card until `execute-razorpay-refund` (or an administrative operator) calls the Razorpay Refund API. Automated refund workers or admin monitoring of the "Action Required" queue remain essential for prompt disbursement.
2. **Expired-Order Policy Pending:**  
   As documented in Section 9, payments captured for orders in `'expired'` status remain rejected by baseline business rules. An explicit product decision (auto-refund vs. subscription revival) should be scheduled for a future release.
3. **Admin Build Pre-existing Warning:**  
   The admin Next.js build encountered an unrelated pre-existing route configuration error in `./app/(dashboard)/reviews/page.tsx` (`dynamic = "force-dynamic"` incompatibility with `cacheComponents`). Static TypeScript checking (`tsc --noEmit`) confirmed all payment management code is 100% type-safe.

---

## 14. Explicit Safety Certification

I explicitly certify that:
1. **No production or staging database** was accessed, connected to, or modified during this remediation.
2. **No remote database migration** was pushed, executed, or deployed.
3. **No Edge Functions, web applications, or mobile binaries** were deployed to external hosting environments.
4. **No real payment charges or refunds** were processed; all tests ran exclusively against synthetic fixtures on a disposable local PostgreSQL 18.4 database.
5. Historical migrations 001 through 053 were left untouched, and the fix was implemented as forward-only migration 054.
