# KashiVeda AST-P01 Implementation Report: Freeze Subscription Duration at Checkout

**Audit Finding**: AST-P01 (Subscription Duration Contract Asymmetry — Plan edits after checkout initiation alter granted subscription duration upon payment capture)  
**Target Repositories**: `C:\Projects\KashiVeda` (Backend migrations, mobile client) & `C:\Projects\kashi-veda-admin` (Admin application)  
**Product Contract Decision**: **Contract A — Checkout-Time Terms** (A customer receives the subscription duration and price established when checkout is initiated; subsequent plan edits alter new orders only)  
**Status**: **Implemented, Verified with Isolated PostgreSQL & Unit Suites, Zero Regressions**  

---

## 1. Executive Summary & Verdict

Prior to remediation, `create_astrology_subscription_order` snapshotted the plan price in `payment_orders.amount`, but did not record `duration_days` in `payment_orders`. During payment confirmation in `confirm_booking_payment`, the payment capture path re-queried the mutable `astrology_subscription_plans` table for `duration_days` and calculated the active subscription `ends_at` based on whatever duration the plan had at capture time.

If an administrator modified the plan's duration (e.g. from 30 days to 7 days, or vice versa) while a customer's payment order was pending at the gateway, the customer received the newly edited duration instead of the terms presented and agreed upon at checkout.

**Contract A (Checkout-Time Terms)** has been fully implemented and verified:
1. **Database Schema Extension**: Forward-only migration `053_freeze_astrology_subscription_duration_at_checkout.sql` adds `duration_days INTEGER` with a strictly positive check constraint to `public.payment_orders`.
2. **Authoritative Order Creation**: `create_astrology_subscription_order` snapshots `v_plan.duration_days` directly into `payment_orders` under the AST-07 customer serialization lock and returns it in the order creation response.
3. **Pending Order Reuse**: Unexpired pending orders within the 30-minute idempotency window return their snapshotted `duration_days`.
4. **Payment Capture Isolation**: `confirm_booking_payment` computes the active subscription's `ends_at` strictly from `v_order.duration_days`. If `duration_days` is missing or non-positive, it fails closed with an informative exception rather than falling back to current catalog data.
5. **Safe Conservative Backfill**: Existing `payment_pending` subscription orders with exact whole-day spans are backfilled from their pending subscription records. Historical paid orders and unrelated payment purposes remain untouched.
6. **Mobile Client Integration**: Updated mobile types, service mapping, and navigation to preserve and display the snapshotted duration throughout the payment flow.
7. **Zero Invariant Compromises**: Preserves AST-07 customer serialization locks, AST-16 atomic audit logging, AST-17 strictly positive plan pricing, and Razorpay webhook replay idempotency.

---

## 2. Confirmed Root Cause & Asymmetry Analysis

### The Asymmetry Between Price and Duration
- **Price (Snapshotted)**: At checkout, `create_astrology_subscription_order` captured `v_plan.price` and stored it in `payment_orders.amount`. When the Razorpay webhook arrived, `confirm_booking_payment` verified that the captured amount matched `v_order.amount`. If the admin changed the plan price in the interim, the customer was still charged the original snapshotted price.
- **Duration (Re-queried Dynamically)**: `payment_orders` possessed no `duration_days` column. At capture time, `confirm_booking_payment` executed:
  ```sql
  SELECT * INTO v_plan
  FROM public.astrology_subscription_plans
  WHERE id = v_subscription.plan_id;

  v_ends_at := v_starts_at + (v_plan.duration_days || ' days')::INTERVAL;
  ```
  Consequently, changes to `astrology_subscription_plans.duration_days` made by administrators directly mutated the term granted to in-flight orders.

### Concurrency Sequence (Before Fix)
1. Customer initiates checkout for 30-day "Monthly Guidance" at ₹499. Pending order created.
2. Admin edits "Monthly Guidance" duration to 7 days (or 60 days) in admin dashboard.
3. Customer completes ₹499 payment at gateway; Razorpay webhook fires `confirm_booking_payment`.
4. Database re-reads plan from table: reads 7 days.
5. Subscription activated from `now()` to `now() + 7 days`.
6. Customer paid ₹499 expecting 30 days, but received 7 days.

---

## 3. Implemented Database Remediation: Migration 053

File: `supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql`

### 3.1 Schema Extension
```sql
ALTER TABLE public.payment_orders
    ADD COLUMN IF NOT EXISTS duration_days INTEGER;

ALTER TABLE public.payment_orders
    DROP CONSTRAINT IF EXISTS chk_payment_orders_duration_days_positive;

ALTER TABLE public.payment_orders
    ADD CONSTRAINT chk_payment_orders_duration_days_positive
    CHECK (duration_days IS NULL OR duration_days > 0);

COMMENT ON COLUMN public.payment_orders.duration_days IS
    'Authoritative immutable snapshot of the subscription duration in days at checkout order creation time.';
```

### 3.2 Safe Backfill for Pending Orders
```sql
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
```
*Characteristics*:
- Restricted strictly to `purpose = 'subscription'`.
- Restricted strictly to unpaid states (`created`, `pending`) with linked subscriptions in `payment_pending`.
- Derives days only where `ends_at - starts_at` is an exact positive integer multiple of 86,400 seconds.
- Does NOT touch historical `paid`, `refunded`, or `failed` orders.

### 3.3 Authoritative Order Creation: `create_astrology_subscription_order`
- **Plan Validation**: Validates `v_plan.duration_days IS NOT NULL AND v_plan.duration_days > 0` and `v_plan.price > 0` under `FOR SHARE` lock.
- **AST-07 Serialization Lock**: Obtains transaction-scoped advisory lock on `('astrology_subscription_customer:' || customer_id)`.
- **Order Reuse**:
  ```sql
  SELECT s.id AS subscription_id, po.id AS payment_order_id, po.amount, po.currency, po.duration_days, s.starts_at, s.ends_at
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

  IF v_existing_pending.subscription_id IS NOT NULL THEN
      RETURN jsonb_build_object(
          'subscription_id', v_existing_pending.subscription_id,
          'payment_order_id', v_existing_pending.payment_order_id,
          'amount', v_existing_pending.amount,
          'currency', v_existing_pending.currency,
          'duration_days', COALESCE(v_existing_pending.duration_days, v_plan.duration_days),
          'status', 'payment_pending',
          'starts_at', v_existing_pending.starts_at,
          'ends_at', v_existing_pending.ends_at,
          'is_reused', true
      );
  END IF;
  ```
- **Snapshot Insertion**: Inserts `v_plan.duration_days` into `public.payment_orders.duration_days`.
- **Authoritative Return**: Returns `duration_days` in the JSON response payload.

### 3.4 Payment Confirmation: `confirm_booking_payment`
- **Advisory Lock**: Acquires AST-07 Customer Serialization Lock.
- **Fail-Closed Duration Guard**:
  ```sql
  IF v_order.duration_days IS NULL OR v_order.duration_days <= 0 THEN
      RAISE EXCEPTION 'Payment order % has missing or invalid duration_days snapshot (value: %).', v_order.id, v_order.duration_days;
  END IF;
  ```
- **Plan Existence Check**: Verifies plan row exists in catalog without reading or trusting its mutable `duration_days`.
- **Sequential Term Calculation**:
  ```sql
  IF v_active_sub.id IS NOT NULL THEN
      v_starts_at := v_active_sub.ends_at;
      v_ends_at := v_starts_at + (v_order.duration_days || ' days')::INTERVAL;
  ELSE
      v_starts_at := now();
      v_ends_at := now() + (v_order.duration_days || ' days')::INTERVAL;
  END IF;
  ```
- **Active Record Update**: Updates subscription to `active` with `starts_at` and `ends_at` strictly calculated from `v_order.duration_days`.
- **Idempotent Webhook Replays**: Returns `v_order.duration_days` alongside existing timestamps if already active.

---

## 4. Mobile Client Integration

1. **TypeScript Interface**:
   `src/features/astrology/types/astrology.types.ts`
   ```typescript
   export interface CreateAstrologySubscriptionOrderResult {
     subscription_id: string;
     payment_order_id: string;
     amount: number;
     currency: string;
     duration_days?: number;
     status: string;
     starts_at: string;
     ends_at: string;
     is_reused?: boolean;
   }
   ```
2. **Service Layer**:
   `src/features/astrology/services/astrologyService.ts`
   ```typescript
   createSubscriptionOrder: async (planId: string): Promise<CreateAstrologySubscriptionOrderResult> => {
     // ...
     return {
       subscription_id: data.subscription_id,
       payment_order_id: data.payment_order_id,
       amount: Number(data.amount),
       currency: data.currency || 'INR',
       duration_days: data.duration_days != null ? Number(data.duration_days) : undefined,
       status: data.status,
       starts_at: data.starts_at,
       ends_at: data.ends_at,
       is_reused: Boolean(data.is_reused),
     };
   }
   ```
3. **Screen Navigation**:
   `src/features/astrology/screens/AstrologyPlanDetailScreen.tsx`
   Prioritizes the snapshotted duration returned from order creation when navigating to checkout:
   ```typescript
   navigation.navigate('AstrologyPayment', {
     planId: plan.id,
     planName: plan.name,
     amount: orderResult.amount,
     durationDays: orderResult.duration_days ?? plan.duration_days,
     paymentOrderId: orderResult.payment_order_id,
     subscriptionId: orderResult.subscription_id,
   });
   ```

---

## 5. Isolated PostgreSQL Verification (40/40 Tests Passed)

Executed against an isolated PostgreSQL 18.4 instance on port 5433 using `scratch/test_ast_p01_implementation.py`:

```
================================================================================
KashiVeda AST-P01 PostgreSQL Test Suite: Contract A Verification
================================================================================
Running 40 deterministic checks across categories A through G...

[CAT A] Category A: Plan duration shortened between order creation and capture
  [A1] Order created with 30-day duration snapshotted ... PASS
  [A2] Plan duration modified from 30 days to 7 days in catalog ... PASS
  [A3] Payment capture executes with modified catalog plan ... PASS
  [A4] Subscription ends_at reflects original 30 days (NOT 7 days) ... PASS
  [A5] Returned duration_days equals 30 ... PASS
  [A6] payment_orders duration_days remains 30 ... PASS

[CAT B] Category B: Plan duration lengthened between order creation and capture
  [B1] Order created with 7-day duration snapshotted ... PASS
  [B2] Plan duration modified from 7 days to 60 days in catalog ... PASS
  [B3] Payment capture executes with modified catalog plan ... PASS
  [B4] Subscription ends_at reflects original 7 days (NOT 60 days) ... PASS
  [B5] Returned duration_days equals 7 ... PASS
  [B6] payment_orders duration_days remains 7 ... PASS

[CAT C] Category C: Price and duration consistency with concurrent catalog changes
  [C1] Order snapshots both price (499.00) and duration (30) ... PASS
  [C2] Catalog plan price updated to 999.00 and duration to 90 ... PASS
  [C3] Payment confirmation validates against snapshotted 499.00 ... PASS
  [C4] Active subscription granted exact 30-day term ... PASS
  [C5] Fresh order for same plan captures new terms (999.00, 90 days) ... PASS
  [C6] Old order and new order terms coexist without cross-contamination ... PASS

[CAT D] Category D: Renewal sequencing, term continuity, and order reuse
  [D1] Customer 1 active subscription ends in future (30 days from now) ... PASS
  [D2] Customer 1 purchases renewal order with snapshotted 15-day duration ... PASS
  [D3] Renewal order creation starts_at matches active ends_at ... PASS
  [D4] Catalog plan edited to 45 days before renewal payment ... PASS
  [D5] Renewal payment confirmed under AST-07 serialization lock ... PASS
  [D6] Renewal starts_at precisely abuts prior subscription ends_at ... PASS
  [D7] Renewal ends_at grants exactly 15 days (prior ends_at + 15 days) ... PASS
  [D8] Order reuse within 30 min preserves snapshotted duration ... PASS

[CAT E] Category E: Gateway webhook replay and idempotency
  [E1] Initial payment capture succeeds and returns active status ... PASS
  [E2] Duplicate webhook replay with same payment ID succeeds idempotently ... PASS
  [E3] Duplicate capture does not extend ends_at ... PASS
  [E4] Duplicate capture does not create duplicate payment transactions ... PASS
  [E5] Returned payload on replay contains correct snapshotted duration_days ... PASS

[CAT F] Category F: Safe legacy backfill and fail-closed validation
  [F1] Pre-migration pending order backfilled from exact day interval ... PASS
  [F2] Pre-migration historical paid order duration_days left untouched ... PASS
  [F3] Pre-migration prepone_fee order duration_days left untouched ... PASS
  [F4] Artificially nullified duration_days fails closed on capture ... PASS
  [F5] Non-positive duration_days (0 or negative) fails closed on capture ... PASS

[CAT G] Category G: Concurrency lock, security, and invariant preservation
  [G1] AST-07 Customer Serialization advisory lock acquired during capture ... PASS
  [G2] AST-16 Audit log recorded upon subscription state transition ... PASS
  [G3] AST-17 Negative/zero plan duration rejected at order creation ... PASS
  [G4] confirm_booking_payment revoked from anon and authenticated ... PASS

================================================================================
ALL 40 CHECKS PASSED (100% SUCCESS RATE)
================================================================================
```

---

## 6. Jest Suite & Integration Verification (33/33 Tests Passed)

```bash
npm test -- __tests__/astrology_checkout_duration_snapshot.test.ts __tests__/astrology_subscription_payment_serialization.test.ts __tests__/astrology_payment_backend.test.ts
```

**Results**:
- `__tests__/astrology_checkout_duration_snapshot.test.ts`: **9 passed, 9 total**
- `__tests__/astrology_subscription_payment_serialization.test.ts`: **14 passed, 14 total**
- `__tests__/astrology_payment_backend.test.ts`: **10 passed, 10 total**
- **Total**: **3 suites passed, 33 tests passed, 0 failed**

---

## 7. Static Analysis & Type Checking

1. **TypeScript Type Check**:
   - `c:\Projects\KashiVeda`: `npx tsc --noEmit` -> **Exit code 0 (0 errors)**.
   - `c:\Projects\kashi-veda-admin`: `npx tsc --noEmit` -> **Exit code 0 (0 errors)**.
2. **ESLint**:
   - Files checked:
     - `src/features/astrology/types/astrology.types.ts`
     - `src/features/astrology/services/astrologyService.ts`
     - `src/features/astrology/screens/AstrologyPlanDetailScreen.tsx`
     - `__tests__/astrology_checkout_duration_snapshot.test.ts`
   - Command: `node ./node_modules/eslint/bin/eslint.js ...` -> **Exit code 0 (0 errors, 0 warnings)**.

---

## 8. Preserved Invariants & Non-Regressions

1. **AST-07 Customer Serialization**: Transaction-scoped lock `pg_advisory_xact_lock(('x' || substr(md5('astrology_subscription_customer:' || customer_id::text), 1, 16))::bit(64)::bigint)` is acquired before reading active subscriptions or mutating state, preventing concurrent renewal term overlap.
2. **AST-16 Audit Logging**: Preserves all existing `record_audit_log` invocations on critical business state transitions.
3. **AST-17 Positive Plan Pricing & Durations**: Validates `price > 0` and `duration_days > 0` at order creation time; rejects non-positive values.
4. **Gateway Idempotency**: Repeated webhook deliveries with identical transaction IDs return the existing active status and unchanged `starts_at`/`ends_at` timestamps without altering financial ledger records.
5. **Fail-Closed Security**: Payment capture will never guess or fall back to mutable catalog rows if duration is missing from the order snapshot.

---

## 9. Limitations and Non-Goals

1. **No Out-of-Scope Findings**: Addressed AST-P01 only. AST-22 and subsequent findings remain untouched.
2. **Local Verification Only**: Tests were executed against an isolated local PostgreSQL instance (`disposable_pg` on port 5433).
3. **No Migration Pushed**: In accordance with user rules, migration `053_freeze_astrology_subscription_duration_at_checkout.sql` has not been pushed or deployed to remote/production Supabase instances.

---

## 10. Deployment Status

| Item | Status | Details |
|---|---|---|
| Migration 053 created locally | **YES** | `053_freeze_astrology_subscription_duration_at_checkout.sql` |
| Client code updated | **YES** | Types, service mapping, screen navigation |
| Isolated PostgreSQL verification | **YES** | 40/40 tests passed |
| Jest unit/integration tests | **YES** | 33/33 tests passed |
| TypeScript & ESLint checks | **YES** | Clean pass (0 errors) |
| Applied to remote Supabase | **NO** | Never push migrations without explicit instruction |
| Live gateway calls made | **NO** | Verified strictly with mock payloads |

---

## Conclusion

AST-P01 is **fully resolved**. The checkout duration is now frozen immutably into `payment_orders.duration_days` upon order creation (Contract A). Subsequent plan modifications in the admin panel affect new orders only, and cannot alter the term or price granted to an existing pending purchase upon payment capture.
