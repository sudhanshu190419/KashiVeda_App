# KashiVeda AST-P01 Final Checkout-Time Duration Consistency Verification Report

**Audit Target**: AST-P01 Final Verification (Closing Fallback Paths in Order Reuse & Client-Side Navigation)  
**Product Contract**: **Contract A — Checkout-Time Terms** (Frozen, immutable terms snapshotted at checkout)  
**Target Repositories**: `C:\Projects\KashiVeda` & `C:\Projects\kashi-veda-admin`  
**Date**: 2026-10-11  
**Status**: **Verified & Complete — Zero Regressions, Zero Fallbacks**  

---

## 1. Executive Summary

This report documents the final remediation and verification closing the two remaining fallback paths that compromised **Contract A (Checkout-Time Terms)**:
1. **Database Order Reuse Fallback Eliminated**: In `public.create_astrology_subscription_order`, the reuse branch previously used `COALESCE(v_existing_pending.duration_days, v_plan.duration_days)`. This has been completely removed. The RPC now strictly returns `v_existing_pending.duration_days`. If an existing pending order has a missing (`NULL`) or non-positive (`<= 0`) duration snapshot, the RPC fails closed with an authoritative exception. It never substitutes catalog duration and never creates duplicate orders.
2. **Client-Side Duration Fallback Eliminated**: In `AstrologyPlanDetailScreen.tsx`, navigation previously evaluated `orderResult.duration_days ?? plan.duration_days`. This fallback has been removed. The screen now passes `orderResult.duration_days` directly.
3. **Strict Client-Side Validation**: `CreateAstrologySubscriptionOrderResult.duration_days` is now a required, non-nullable integer (`duration_days: number`). The service layer validates the RPC response at runtime, immediately throwing an error if `duration_days` is missing, null, non-integer, or non-positive before navigation can occur.
4. **Verification**: 44/44 tests passed in an isolated PostgreSQL 18.4 database, and 77/77 tests passed across all relevant Jest suites, with zero TypeScript or ESLint errors.
5. **Operational Safety**: No migrations were pushed, no remote environments were touched, and no live payments were made.

---

## 2. The Correction to Pending-Order Reuse

### 2.1 The Defect in Prior Implementation
The initial implementation of `create_astrology_subscription_order` contained a fallback in its pending order reuse branch:
```sql
-- DEFECTIVE (Prior Implementation):
IF v_existing_pending.subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object(
        'subscription_id', v_existing_pending.subscription_id,
        'payment_order_id', v_existing_pending.payment_order_id,
        'amount', v_existing_pending.amount,
        'currency', v_existing_pending.currency,
        'duration_days', COALESCE(v_existing_pending.duration_days, v_plan.duration_days), -- FALLBACK COMPROMISE
        'status', 'payment_pending',
        'starts_at', v_existing_pending.starts_at,
        'ends_at', v_existing_pending.ends_at,
        'is_reused', true
    );
END IF;
```
If an administrator edited the catalog plan while an order with a missing snapshot was pending, `COALESCE` substituted the new catalog plan duration, presenting altered terms to the customer.

### 2.2 The Authoritative Correction (Migration 053)
The reuse branch now strictly validates the pending order's snapshot and removes `COALESCE`:
```sql
-- CORRECTED (Authoritative Contract A in Migration 053):
IF v_existing_pending.subscription_id IS NOT NULL THEN
    -- Contract A: Never fall back to mutable catalog plan duration for an existing pending order.
    -- If the pending order's snapshot is missing or invalid, fail closed rather than substituting catalog terms
    -- or creating a duplicate order while an unresolved pending order exists.
    IF v_existing_pending.duration_days IS NULL OR v_existing_pending.duration_days <= 0 THEN
        RAISE EXCEPTION 'Pending subscription order % has missing or invalid duration snapshot (value: %). Cannot reuse order without authoritative terms.',
            v_existing_pending.payment_order_id, v_existing_pending.duration_days;
    END IF;

    RETURN jsonb_build_object(
        'subscription_id', v_existing_pending.subscription_id,
        'payment_order_id', v_existing_pending.payment_order_id,
        'amount', v_existing_pending.amount,
        'currency', v_existing_pending.currency,
        'duration_days', v_existing_pending.duration_days,
        'status', 'payment_pending',
        'starts_at', v_existing_pending.starts_at,
        'ends_at', v_existing_pending.ends_at,
        'is_reused', true
    );
END IF;
```

### 2.3 Key Operational Invariants Enforced
1. **Exact Snapshot Preserved**: If the reused order has a valid positive `duration_days` snapshot, that exact snapshot is returned regardless of subsequent catalog plan edits.
2. **Fail-Closed Protection**: If `duration_days` is NULL or non-positive, an exception is thrown.
3. **No Duplicate Order Creation**: Because the exception is raised inside the reuse block, control never reaches the `INSERT` statements. No second order or subscription row is generated while an unresolved gateway order exists.
4. **AST-07 Lock Preserved**: The advisory lock `pg_advisory_xact_lock(('x' || substr(md5('astrology_subscription_customer:' || v_customer_id::text), 1, 16))::bit(64)::bigint)` serializes all operations for the customer before this check occurs.

---

## 3. Handling Invalid Legacy Pending Snapshots and Migration Backfill

### 3.1 Migration 053 Backfill Policy
Migration 053 includes a safe backfill for existing pending subscription orders created before `duration_days` was stored:
```sql
UPDATE public.payment_orders po
SET duration_days = (EXTRACT(epoch FROM (s.ends_at - s.starts_at)) / 86400)::INTEGER
FROM public.astrology_subscriptions s
WHERE (po.subscription_id = s.id OR s.payment_order_id = po.id)
  AND po.purpose = 'subscription'::public.payment_order_purpose
  AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
  AND s.status = 'payment_pending'::public.astrology_subscription_status
  AND po.duration_days IS NULL
  AND s.ends_at > s.starts_at
  AND (EXTRACT(epoch FROM (s.ends_at - s.starts_at))::BIGINT % 86400 = 0)
  AND (EXTRACT(epoch FROM (s.ends_at - s.starts_at)) / 86400) >= 1;
```

### 3.2 Handling Unresolved Pending Orders
If an order's `(ends_at - starts_at)` is corrupted or not an exact positive integer multiple of 86,400 seconds, the backfill intentionally leaves `po.duration_days` as `NULL` rather than guessing terms.

**Detection Pre-Flight Query**:
```sql
SELECT po.id, po.subscription_id, po.created_at, s.starts_at, s.ends_at
FROM public.payment_orders po
LEFT JOIN public.astrology_subscriptions s ON (s.id = po.subscription_id OR s.payment_order_id = po.id)
WHERE po.purpose = 'subscription'::public.payment_order_purpose
  AND po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)
  AND po.duration_days IS NULL;
```

**Two-Tier Fail-Safe Defense**:
1. **On Reuse**: `create_astrology_subscription_order` raises an exception preventing the customer from proceeding to checkout with unverified terms.
2. **On Capture**: If the gateway webhook fires, `confirm_booking_payment` raises an exception (`Payment order % has missing or invalid duration_days snapshot`), preventing an active subscription from being granted without authoritative terms.
3. **Expiration**: After 30 minutes, un-backfilled pending orders fall outside the reuse window, allowing the customer to initiate a fresh checkout with valid snapshots.

---

## 4. Removal of Client-Side Fallback & Runtime Validation

### 4.1 Type Interface Hardening
`src/features/astrology/types/astrology.types.ts`:
```typescript
export interface CreateAstrologySubscriptionOrderResult {
  subscription_id: string;
  payment_order_id: string;
  amount: number;
  currency: string;
  duration_days: number; // Strictly required positive integer
  status: AstrologySubscriptionStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  is_reused?: boolean;
}
```

### 4.2 Runtime Service Validation
`src/features/astrology/services/astrologyService.ts`:
```typescript
async createSubscriptionOrder(planId: string): Promise<CreateAstrologySubscriptionOrderResult> {
  if (!planId) {
    throw new Error("Plan ID is required to create a subscription order.");
  }

  const { data, error } = await supabase.rpc("create_astrology_subscription_order", {
    p_plan_id: planId,
  });

  if (error) {
    throw new Error(error.message || "Failed to create astrology subscription order.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Invalid response received from order creation service.");
  }

  if (!data.subscription_id || !data.payment_order_id) {
    throw new Error("Invalid subscription order: missing subscription or payment order identifier.");
  }

  const durationDays = Number(data.duration_days);
  if (
    data.duration_days === undefined ||
    data.duration_days === null ||
    !Number.isInteger(durationDays) ||
    durationDays <= 0
  ) {
    throw new Error(
      `Invalid subscription order: duration snapshot is missing or non-positive (received: ${data.duration_days}).`
    );
  }

  const amount = Number(data.amount);
  if (data.amount === undefined || data.amount === null || isNaN(amount) || amount <= 0) {
    throw new Error(
      `Invalid subscription order: payment amount is invalid or non-positive (received: ${data.amount}).`
    );
  }

  return {
    subscription_id: data.subscription_id,
    payment_order_id: data.payment_order_id,
    amount,
    currency: data.currency || "INR",
    duration_days: durationDays,
    status: data.status,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    is_reused: Boolean(data.is_reused),
  };
}
```

### 4.3 Screen Navigation
`src/features/astrology/screens/AstrologyPlanDetailScreen.tsx`:
```typescript
const orderResult = await astrologyService.createSubscriptionOrder(plan.id);

navigation.navigate("AstrologyPayment", {
  subscriptionId: orderResult.subscription_id,
  paymentOrderId: orderResult.payment_order_id,
  planId: plan.id,
  planName: plan.name,
  amount: orderResult.amount,
  currency: orderResult.currency,
  durationDays: orderResult.duration_days, // No fallback to plan.duration_days
});
```

---

## 5. Comprehensive Test Execution & Actual Evidence

### 5.1 Isolated PostgreSQL 18.4 Test Suite (44/44 Tests Passed)
Executed via `scratch/test_ast_p01_implementation.py` on port 5433:

| Test ID | Description | Result | Details |
|---|---|---|---|
| **A.1** | Create active plan with 30 days and 501.00 INR | **PASS** | Plan created via `admin_save_astrology_plan` |
| **A.2** | Authoritative order creation succeeds | **PASS** | Order ID returned |
| **A.3** | Payment order persists exact duration_days snapshot | **PASS** | `duration_days = 30`, `amount = 501.00` |
| **A.4** | Initial pending subscription span is 30 days | **PASS** | `ends_at - starts_at = 30 days` |
| **A.5** | Admin modifies plan duration to 7 days before capture | **PASS** | Plan updated to 7 days |
| **A.6** | Payment confirms successfully with verified amount | **PASS** | Status `active` |
| **A.7** | Subscription receives snapshotted 30 days instead of capture-time 7 days | **PASS** | Granted: 30 days |
| **B.8** | Customer 2 creates order for 7-day plan | **PASS** | Snapshotted: 7 days |
| **B.9** | Admin updates plan duration to 60 days | **PASS** | Plan updated to 60 days |
| **B.10** | Payment captured for Customer 2 | **PASS** | Captured with verified amount |
| **B.11** | Subscription receives snapshotted 7 days instead of capture-time 60 days | **PASS** | Granted: 7 days |
| **C.12** | Order amount and duration remain unchanged after plan price edit | **PASS** | Terms unchanged |
| **C.13** | Order creation response values match stored order row | **PASS** | Coherent values |
| **C.14** | Order response contains duration_days integer property | **PASS** | Valid integer property |
| **C.15** | Order creation under lock acquires coherent duration and price version | **PASS** | 777.00 INR, 45 days |
| **D.16** | Customer 1 has active subscription | **PASS** | Verified active |
| **D.17** | Renewal order created | **PASS** | Duration: 45 days |
| **D.18** | Plan duration modified to 15 days | **PASS** | Catalog modified |
| **D.19** | Renewal payment confirmed | **PASS** | Confirmed under lock |
| **D.20** | Renewal starts exactly at active sub ends_at with snapshotted 45 days | **PASS** | Abuts prior ends_at; Span: 45 days |
| **D.21** | Unexpired pending order reused within 30 min window | **PASS** | `is_reused = true` |
| **D.22** | Reused order returns original snapshot (45d) instead of newly edited duration (15d) | **PASS** | Returned: 45 days |
| **D.23** | **Pending order with 30-day snapshot reused with duration 30 after plan changes to 7 days** | **PASS** | **Reused duration: 30 days** |
| **D.24** | **Pending order with 7-day snapshot reused with duration 7 after plan changes to 60 days** | **PASS** | **Reused duration: 7 days** |
| **D.25** | **Pending order with missing snapshot does not fall back to plan duration (fails closed)** | **PASS** | **Exception raised: "missing or invalid duration snapshot"** |
| **D.26** | **Failed order reuse does not create a second order or subscription** | **PASS** | **PO count: 1, Sub count: 1** |
| **E.23** | Initial capture dates recorded | **PASS** | Dates noted |
| **E.24** | Admin edited plan duration after capture | **PASS** | Plan modified to 100 days |
| **E.25** | Replay returns already_confirmed status | **PASS** | Idempotent replay |
| **E.26** | Subscription dates identical before and after replay | **PASS** | Dates identical |
| **E.27** | No duplicate payment transactions created on replay | **PASS** | Transaction count: 1 |
| **F.28** | Legacy pending order fixture with NULL duration_days created | **PASS** | Fixture created |
| **F.29** | Backfill derives exact 20-day span for legacy pending order | **PASS** | Backfilled: 20 days |
| **F.30** | Legacy order identity, amount, and status unchanged | **PASS** | Unchanged |
| **F.31** | Capture fails closed if duration_days is missing or invalid | **PASS** | Exception raised |
| **F.32** | Historical paid orders remain stable | **PASS** | Untouched |
| **F.33** | Non-subscription payment orders have NULL duration_days without constraint violation | **PASS** | `booking_advance` has NULL |
| **G.34** | Unauthenticated order creation is rejected | **PASS** | Auth required |
| **G.35** | Amount mismatch against payment_orders.amount is rejected | **PASS** | Amount verified |
| **G.36** | Zero-price plan creation rejected under AST-17 | **PASS** | Rejected |
| **G.37** | AST-07 customer serialization locks present in functions | **PASS** | Lock verified |
| **G.38** | AST-16 admin audit logs correctly recorded | **PASS** | 8 audit events |
| **G.39** | Audit event captures entity_type and details atomically | **PASS** | Verified |
| **G.40** | Zero remote database or production gateway contacted | **PASS** | Isolated 127.0.0.1:5433 |

**Result Summary**: **44/44 PASSED (100% Success Rate, 0 Failed)**.

---

### 5.2 Jest Test Suites (77/77 Tests Passed)
Executed command:
```bash
npm test -- __tests__/astrology_checkout_duration_snapshot.test.ts __tests__/astrology.test.tsx __tests__/astrology_subscription_payment_serialization.test.ts __tests__/astrology_payment_backend.test.ts __tests__/daily_astrology_atomic_mutations.test.ts __tests__/daily_astrology_plan_pricing.test.ts
```

**Results**:
- `__tests__/astrology_checkout_duration_snapshot.test.ts`: **18 passed, 18 total**
  - Migration 053 schema & invariants: 9 passed
  - Client service response validation (missing, zero, negative, non-integer duration rejection): 7 passed
  - Mobile screen presentation and navigation integrity (authoritative duration passed, failed order prevents navigation): 2 passed
- `__tests__/astrology.test.tsx`: **20 passed, 20 total**
- `__tests__/astrology_subscription_payment_serialization.test.ts`: **14 passed, 14 total**
- `__tests__/astrology_payment_backend.test.ts`: **10 passed, 10 total**
- `__tests__/daily_astrology_atomic_mutations.test.ts`: **7 passed, 7 total**
- `__tests__/daily_astrology_plan_pricing.test.ts`: **8 passed, 8 total**
- **Total**: **6 suites passed, 77 tests passed, 0 failed**

---

## 6. Static Analysis & Lint Verification

1. **TypeScript Type Checking**:
   - `c:\Projects\KashiVeda`: `npx tsc --noEmit` -> **Exit code 0 (0 errors)**.
   - `c:\Projects\kashi-veda-admin`: `npx tsc --noEmit` -> **Exit code 0 (0 errors)**.
2. **ESLint Verification**:
   - Files linted:
     - `src/features/astrology/types/astrology.types.ts`
     - `src/features/astrology/services/astrologyService.ts`
     - `src/features/astrology/screens/AstrologyPlanDetailScreen.tsx`
     - `__tests__/astrology_checkout_duration_snapshot.test.ts`
     - `__tests__/astrology_subscription_payment_serialization.test.ts`
     - `__tests__/astrology_payment_backend.test.ts`
   - Command: `node ./node_modules/eslint/bin/eslint.js ...` -> **Exit code 0 (0 errors, 0 warnings)**.

---

## 7. Operational & Deployment Risk Assessment

1. **Unresolved Pending Orders Risk**:
   - If an order exists in `created` or `pending` state where `ends_at - starts_at` is invalid, the order will fail closed on reuse or capture.
   - *Mitigation*: Run the pre-flight verification query before migration deployment. Any stale un-backfillable pending order older than 30 minutes can be safely marked `expired` or `failed` by an administrator.
2. **Gateway Mismatch Protection**:
   - Because `duration_days` is validated prior to navigating to Razorpay and again during capture confirmation, a customer can never complete checkout under terms different from what the backend will grant.
3. **AST-07 Concurrency Safety**:
   - Concurrent renewals, captures, and cancellations serialize on the transaction-scoped advisory lock, preventing term gaps or double-counting.

---

## 8. Deployment and Compliance Attestation

In accordance with project engineering rules:
- **No application code was deployed** to production or staging.
- **No database migration was pushed** to remote Supabase instances.
- **No production database was accessed or modified**.
- **No real payment gateway calls were initiated** (all gateway operations were tested using mock webhooks and local fixtures).
- **All changes remain strictly local** within the repository.

---

## Conclusion

The checkout-time subscription duration contract (**Contract A**) is **fully established and verified without fallbacks**:
- Order creation snapshots duration into `payment_orders.duration_days`.
- Order reuse returns that exact snapshot or fails closed.
- Capture grants that exact snapshot or fails closed.
- Client types, service mapping, and navigation enforce that exact snapshot without catalog fallback.
- AST-P01 is complete. Do not begin another audit finding.
