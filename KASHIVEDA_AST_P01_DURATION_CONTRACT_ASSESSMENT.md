# KashiVeda AST-P01 Audit Assessment Report

## Evaluation of Subscription Duration Mutability Between Checkout Initiation and Payment Capture

**Target Finding:** AST-P01 (from `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`)  
**Repositories Inspected:**
* Admin Application: `C:\Projects\kashi-veda-admin`
* Backend, Database Migrations & Mobile Application: `C:\Projects\KashiVeda`  
**Assessment Date:** 2026-10-11  
**Status:** Complete — Empirical Verification Conducted on Isolated Local PostgreSQL 18; Strict Read-Only Mode Maintained (Zero Code or Migration Mutations)

---

## Executive Summary

Audit finding **AST-P01 is confirmed applicable to the current codebase**.

Under the current production migration chain (specifically Migrations `020_astrology_subscription_payments.sql`, `048_serialize_astrology_subscription_payments.sql`, and `052_prevent_zero_price_astrology_plans.sql`), there exists an architectural **asymmetry between price and duration**:

1. **Price follows Checkout-Time Terms (Contract A):** When a customer creates a checkout order, `payment_orders.amount` immutably snapshots the plan's price. When payment is confirmed, `confirm_booking_payment` strictly verifies that `p_verified_amount == v_order.amount`. If an administrator edits the plan price while checkout is in-flight, the customer pays the price originally shown.
2. **Duration follows Capture-Time Terms (Contract B):** `payment_orders` does **not** store `duration_days`. Although `create_astrology_subscription_order` initially computes `starts_at` and `ends_at` based on the plan's duration at order creation, `confirm_booking_payment` re-queries `astrology_subscription_plans` at payment capture, re-reads `duration_days`, recalculates `ends_at`, and **overwrites** the subscription dates.

As an empirical consequence:
* If an administrator reduces a plan's duration (e.g., from 30 days to 7 days) while a customer is completing payment on the gateway, the customer pays the full 30-day price but receives only 7 days of service (**23 days lost; direct consumer harm**).
* Conversely, if an administrator increases a plan's duration (e.g., from 7 days to 60 days), the customer receives 60 days for the 7-day price (**53 days unearned entitlement leakage**).

This assessment provides the technical tracing, empirical proof from an isolated PostgreSQL execution, comparative analysis between Contract A and Contract B, and a recommended architectural path forward.

---

## 1. Current Purchase Lifecycle Data Flow

### Step 1: Client Selection & Display
1. The customer browses plans on [`AstrologyPlanDetailScreen.tsx`](file:///c:/Projects/KashiVeda/src/features/astrology/screens/AstrologyPlanDetailScreen.tsx#L121-L129). The screen loads the active plan record from `astrology_subscription_plans`, displaying its title, features, price, and duration (e.g., "30 Days — ₹501").
2. The user taps "Subscribe Now". [`proceedWithSubscription`](file:///c:/Projects/KashiVeda/src/features/astrology/screens/AstrologyPlanDetailScreen.tsx#L111) calls `astrologyService.createSubscriptionOrder(plan.id)`.

### Step 2: Authoritative Order Creation (`create_astrology_subscription_order`)
Located in [`supabase/migrations/048_serialize_astrology_subscription_payments.sql:80-234`](file:///c:/Projects/KashiVeda/supabase/migrations/048_serialize_astrology_subscription_payments.sql#L80-L234):
1. **Authentication & Validation:** Verifies `v_customer_id := auth.uid()`.
2. **Locking:** Queries `astrology_subscription_plans WHERE id = p_plan_id FOR SHARE`.
3. **AST-07 Advisory Lock:** Acquires customer serialization lock `pg_advisory_xact_lock(...)`.
4. **Idempotency Check:** Reuses unexpired `payment_pending` subscription if created within 30 minutes.
5. **Initial Date Calculation:**
   ```sql
   IF v_active_sub.id IS NOT NULL THEN
       v_starts_at := v_active_sub.ends_at;
       v_ends_at := v_starts_at + (v_plan.duration_days || ' days')::INTERVAL;
   ELSE
       v_starts_at := now();
       v_ends_at := now() + (v_plan.duration_days || ' days')::INTERVAL;
   END IF;
   ```
6. **Inserts Pending Subscription:**
   ```sql
   INSERT INTO public.astrology_subscriptions (
       customer_id, plan_id, starts_at, ends_at, status
   ) VALUES (
       v_customer_id, v_plan.id, v_starts_at, v_ends_at, 'payment_pending'
   ) RETURNING id INTO v_subscription_id;
   ```
7. **Inserts Payment Order:**
   ```sql
   INSERT INTO public.payment_orders (
       subscription_id, purpose, amount, currency, status, provider
   ) VALUES (
       v_subscription_id, 'subscription', v_plan.price, v_plan.currency, 'created', 'razorpay'
   ) RETURNING id INTO v_payment_order_id;
   ```
8. **Returns to Client:** Returns `subscription_id`, `payment_order_id`, `amount`, `currency`, `starts_at`, `ends_at`.
   * **Crucial Observation:** `payment_orders` stores `amount` (`v_plan.price`), but has **no column** for `duration_days` or term duration.

### Step 3: Checkout Presentation
The app navigates to [`AstrologyPaymentScreen.tsx`](file:///c:/Projects/KashiVeda/src/features/astrology/screens/AstrologyPaymentScreen.tsx#L346-L353), displaying:
* **Plan Name:** e.g., "Vedic Monthly Guidance"
* **Coverage Period:** `"{durationDays} Days"` (explicitly passed from client plan data)
* **Total Amount:** `"₹501"`
* The customer opens Razorpay checkout and enters payment credentials.

### Step 4: Administrator Plan Modification (`admin_save_astrology_plan`)
Located in [`supabase/migrations/052_prevent_zero_price_astrology_plans.sql:27-146`](file:///c:/Projects/KashiVeda/supabase/migrations/052_prevent_zero_price_astrology_plans.sql#L27-L146) and invoked via Admin Server Action [`saveAstrologyPlan`](file:///C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts):
* An administrator edits the plan (e.g., changes `duration_days` from 30 to 7).
* The RPC performs an in-place mutation:
  ```sql
  UPDATE public.astrology_subscription_plans
  SET name = v_trimmed_name,
      duration_days = p_duration_days,
      price = p_price,
      ...
  WHERE id = p_id;
  ```
* **No Invalidation or Guard:** The database does not check whether pending payment orders or checkouts are referencing `p_id`.

### Step 5: Payment Capture (`confirm_booking_payment`)
Located in [`supabase/migrations/048_serialize_astrology_subscription_payments.sql:696-780`](file:///c:/Projects/KashiVeda/supabase/migrations/048_serialize_astrology_subscription_payments.sql#L696-L780):
1. Razorpay webhook fires or client calls capture edge function.
2. `confirm_booking_payment` locks `payment_orders` FOR UPDATE.
3. **Price Verification:**
   ```sql
   IF p_verified_amount != v_order.amount THEN
       RAISE EXCEPTION 'Verified captured amount (%) does not match payment order obligation amount (%).', ...;
   END IF;
   ```
4. **Subscription Activation:**
   Locks `astrology_subscriptions WHERE id = v_order.subscription_id FOR UPDATE`.
5. **Re-Read of Plan Table (The Discrepancy):**
   ```sql
   -- Read plan for duration_days
   SELECT * INTO v_plan
   FROM public.astrology_subscription_plans
   WHERE id = v_subscription.plan_id;

   ...
   -- Recalculate dates using CAPTURE-TIME duration_days
   IF v_active_sub.id IS NOT NULL THEN
       v_starts_at := v_active_sub.ends_at;
       v_ends_at := v_starts_at + (v_plan.duration_days || ' days')::INTERVAL;
   ELSE
       v_starts_at := now();
       v_ends_at := now() + (v_plan.duration_days || ' days')::INTERVAL;
   END IF;

   -- Overwrite subscription dates
   UPDATE public.astrology_subscriptions
   SET status = 'active'::public.astrology_subscription_status,
       starts_at = v_starts_at,
       ends_at = v_ends_at
   WHERE id = v_subscription.id;
   ```

---

## 2. Relevant Functions and Migration Chain

| Component / Function | Migration Source | File & Line Reference | Authoritative Behavior |
| :--- | :--- | :--- | :--- |
| `create_astrology_subscription_order` | Migration 020 / 048 | `048_serialize_astrology_subscription_payments.sql:80-234` | Computes initial `ends_at` based on `v_plan.duration_days`; creates `payment_pending` subscription; snapshots `amount` in `payment_orders`. |
| `confirm_booking_payment` | Migration 020 / 048 | `048_serialize_astrology_subscription_payments.sql:696-780` | Locks order; validates `amount == v_order.amount`; **re-queries** `v_plan` from `astrology_subscription_plans`; **recalculates** `ends_at = starts_at + v_plan.duration_days`; updates subscription to `active`. |
| `admin_save_astrology_plan` | Migration 051 / 052 | `052_prevent_zero_price_astrology_plans.sql:27-146` | Atomically updates `name`, `duration_days`, `price` in `astrology_subscription_plans` with AST-16 audit logging and AST-17 positive price check. Mutates `duration_days` in place with zero checks for active checkouts. |
| Admin Plan Edit UI | Next.js Admin | `components/admin/astrology/modals/plan-form-modal.tsx:60-90` | Lets admin change `durationDays` input without warning regarding pending checkouts. |
| Mobile Checkout UI | React Native Client | `src/features/astrology/screens/AstrologyPaymentScreen.tsx:346-353` | Prominently displays `"Coverage Period: {durationDays} Days"` above the Pay Now button. |

---

## 3. Empirical Reproduction Results

To verify behavior without touching production or staging data, a disposable PostgreSQL 18.4 environment was initialized locally on port 5433 with exact copies of Migrations 020, 048, and 052. The test suite (`test_ast_p01_reproduction.py`) modeled four concrete scenarios:

### Scenario 1: Plan Duration Reduced (30 days → 7 days) During Checkout
* **Step 1:** Admin created plan `"Vedic Monthly Guidance"`: Duration $D_1 = 30\text{ days}$, Price $P = \text{₹}501.00$.
* **Step 2:** Customer 1 initiated checkout order:
  * Returned to Client: `starts_at = 2026-10-11T16:41:47`, `ends_at = 2026-11-10T16:41:47` (30 days).
  * Persisted in `astrology_subscriptions`: `status = payment_pending`, duration span = 30 days.
  * Persisted in `payment_orders`: `amount = 501.00`, `status = created`.
  * Displayed on screen: **"Coverage Period: 30 Days — ₹501"**.
* **Step 3:** Admin updated plan duration in database: $D_2 = 7\text{ days}$.
* **Step 4:** Payment gateway confirmed payment of ₹501.00.
* **Step 5: Final Record in Database:**
  * `starts_at = 2026-10-11T16:41:47`
  * `ends_at = 2026-10-18T16:41:47`
  * **Granted Duration: 7 days**
  * **Mismatch / Consumer Loss: 23 days LOST by paying customer.**

### Scenario 2: Webhook Replay / Retry
* **Execution:** Replayed gateway payment confirmation for the order from Scenario 1.
* **Result:** `confirm_booking_payment` detected `v_order.status = 'paid'`, executed the idempotent fast-path, and returned:
  ```json
  {
    "status": "already_confirmed",
    "starts_at": "2026-10-11T16:41:47",
    "ends_at": "2026-10-18T16:41:47"
  }
  ```
* **Finding:** Webhook replays do **not** re-evaluate terms once the order is `paid`. The term is locked to whatever was in the plan table at the exact instant of the *first* capture.

### Scenario 3: Plan Duration Increased (7 days → 60 days) During Checkout
* **Step 1:** Customer 2 created checkout order for a 7-day plan @ ₹501.00.
* **Step 2:** Admin updated plan duration to 60 days while customer was on gateway.
* **Step 3:** Payment captured.
* **Result:** Customer 2 received 60 days of service.
* **Finding: Surplus of +53 days granted without corresponding payment (Business Entitlement Leakage).**

### Scenario 4: Price vs. Duration Asymmetry Contrast
* **Step 1:** Customer created order when plan was ₹999.00 (`payment_orders.amount = 999.00`).
* **Step 2:** Admin lowered plan price to ₹399.00 in database.
* **Step 3:** Gateway verified capture of ₹999.00.
* **Result:** Capture succeeded at ₹999.00.
* **Finding:** Price was immutably snapshotted in `payment_orders.amount`. Duration was **not** snapshotted and floated dynamically.

---

## 4. Applicability of Original Audit Finding

**The audit finding AST-P01 is 100% applicable to the active codebase.**

The current migration chain (048, 051, 052) contains fixes for:
* AST-07 (customer serialization lock)
* AST-16 (atomic audit log RPCs)
* AST-17 (positive price enforcement)

However, **none of these migrations modified the duration re-read in `confirm_booking_payment`** or added a duration snapshot to `payment_orders`. As a result, the vulnerability described in the audit remains fully live.

---

## 5. What is Known vs. What Requires a Product Decision

### What is Known (Authoritative Technical Reality)
1. The database currently implements **Contract B (Capture-time terms)** for subscription duration.
2. The database currently implements **Contract A (Checkout-time terms)** for subscription price.
3. The mobile application currently displays **Contract A** to the customer (`"Coverage Period: {durationDays} Days"` alongside `"Total Amount: ₹{amount}"`).
4. If an admin edits a plan duration while a checkout is pending, the captured subscription silently receives the capture-time duration, contradicting what the user agreed to on the payment screen.
5. Existing subscriptions that are already `active` are unaffected by plan edits (their dates are not modified).

### What Requires a Product Decision
The organization must formally choose which business contract governs astrology subscription purchases:
* **Contract A:** The customer is entitled to the terms displayed at checkout initiation (Duration & Price frozen at order creation).
* **Contract B:** The customer receives whatever terms exist at capture time (Duration floats dynamically).

---

## 6. Detailed Comparison of the Two Contracts

| Evaluation Dimension | Contract A — Checkout-Time Terms (Snapshot) | Contract B — Capture-Time Terms (Live Read) |
| :--- | :--- | :--- |
| **Core Principle** | Terms frozen at order creation. Editing a plan affects only *future* checkouts. | Terms determined when payment clears. In-flight checkouts float with plan edits. |
| **Consumer Expectation** | **Consistent.** Customer receives exactly what was shown on the summary card. | **Broken.** Customer can see "30 Days", pay, and receive "7 Days". |
| **Legal & Compliance (India E-Commerce Rules)** | **Compliant.** Aligns with consumer protection requirements that terms agreed at payment cannot be unilaterally degraded post-agreement. | **High Risk.** Reducing duration without user consent constitutes unfair trade practice or deficient service under Consumer Protection Act. |
| **Price / Duration Alignment** | **Symmetric.** Both price and duration are snapshotted in the order. | **Asymmetric.** Price is locked at order time, but duration floats at capture time. |
| **Admin Operational Flexibility** | Plan duration changes do not retroactively alter pending orders. If a plan requires immediate phase-out, admin deactivates it. | Admin can instantaneously change duration for everyone, including orders currently checking out. |
| **Effect of Shortening Duration (e.g. 30d → 7d)** | Pending order receives 30 days. No consumer harm. | Customer receives 7 days. Severe consumer grievance; refund/dispute risk. |
| **Effect of Lengthening Duration (e.g. 7d → 60d)** | Pending order receives 7 days. Business protects margins. | Customer receives 60 days. Revenue leakage / unearned service entitlement. |
| **UI & Disclosure Requirements** | No changes needed to checkout UI. Current UI already promises this contract. | **Major UI overhaul required.** Checkout must warn: *"Subscription period may change before payment confirmation."* |

---

## 7. Recommended Contract and Explicit Reasoning

### Recommendation: Contract A (Checkout-Time Terms)

We strongly recommend adopting **Contract A**.

### Explicit Reasoning:
1. **Consumer Protection & Payment Integrity:** Under standard consumer protection principles and payment gateway regulations, the checkout summary (`"Coverage Period: 30 Days — ₹501"`) forms a binding agreement. Granting a shorter term than the one presented during checkout is legally problematic and damages customer trust.
2. **Architectural Symmetry:** The payment order already treats price as immutable (`payment_orders.amount`). There is no rational architectural justification for price to be frozen at checkout while duration floats dynamically. Both terms should be snapshotted at the same instant.
3. **Admin Intent:** When administrators edit a plan's duration in the Admin dashboard, their intent is almost universally to change the offering for *future* buyers, not to arbitrarily truncate or inflate terms for someone who is already in the middle of entering their credit card OTP.
4. **Clean Failure Recovery:** If a plan is deprecated or misconfigured, the proper administrative action is to mark `is_active = false`. Pending checkouts can either complete under the terms they initiated or fail gracefully upon expiration (30-minute window).

---

## 8. Proposed Minimal Implementation for Contract A (If Approved)

If the product team selects Contract A, the remediation can be implemented with minimal footprint and zero regression risk to AST-16 or AST-17:

### Option A.1: Persist `duration_days` Snapshot on `payment_orders`
* Add column `duration_days INTEGER` to `public.payment_orders`.
* In `create_astrology_subscription_order`:
  ```sql
  INSERT INTO public.payment_orders (
      subscription_id, purpose, amount, currency, duration_days, status, provider
  ) VALUES (
      v_subscription_id, 'subscription', v_plan.price, v_plan.currency, v_plan.duration_days, 'created', 'razorpay'
  );
  ```
* In `confirm_booking_payment`:
  ```sql
  -- Use snapshotted duration_days from v_order
  v_ends_at := v_starts_at + (v_order.duration_days || ' days')::INTERVAL;
  ```

### Option A.2: Respect `payment_pending` Subscription's Pre-Calculated Term
* In `create_astrology_subscription_order`, `v_ends_at - v_starts_at` is already calculated from the plan's duration at order time.
* In `confirm_booking_payment`, when activating the subscription:
  ```sql
  -- Compute duration interval directly from the pending subscription record:
  v_plan_duration := v_subscription.ends_at - v_subscription.starts_at;
  v_ends_at := v_starts_at + v_plan_duration;
  ```
  *(Requires adjusting start date if renewals queued, while preserving the exact span).*

### Compatibility & Risk Assessment:
* **Historical Compatibility:** For existing completed orders, `confirm_booking_payment` is never re-run.
* **AST-16 / AST-17 Integrity:** Unaffected. `admin_save_astrology_plan` remains atomic, strictly audited, and enforces positive pricing.
* **RPC Signature Stability:** Neither `create_astrology_subscription_order` nor `confirm_booking_payment` requires parameter changes.

---

## 9. Requirements if Contract B is Selected (Alternative)

If the business decides that **Contract B** is the intended behavior:
1. **Checkout Disclosure:** The mobile application (`AstrologyPaymentScreen.tsx`) must display an explicit legal disclosure:
   > *"The final subscription duration is determined at payment capture and may differ from the duration shown during checkout if the plan is updated."*
2. **Post-Payment Receipt Verification:** The post-capture confirmation screen must display both the requested duration and the granted duration so the customer is immediately aware of any change.
3. **Admin Warning Modal:** In `kashi-veda-admin`, when an administrator alters `duration_days` on an active plan, the UI must prompt:
   > *"Warning: Modifying duration will immediately apply to in-flight checkouts currently being processed by customers."*

---

## 10. Audit Governance & File Integrity Confirmation

As mandated by the AST-P01 audit guidelines:
* **Zero production code modified:** No files in `c:\Projects\KashiVeda\src`, `c:\Projects\KashiVeda\supabase\migrations`, or `C:\Projects\kashi-veda-admin` were edited.
* **Zero live database operations:** No migrations were deployed to any remote database. All empirical reproductions ran against an isolated, disposable local PostgreSQL cluster on port 5433 that was cleanly terminated after execution.
* **Zero external API calls:** Razorpay and external gateway endpoints were not contacted.
* **Finding Scope Preserved:** AST-22 and subsequent findings were not started.

---

## Conclusion & Next Step

The code mechanics of AST-P01 are fully understood and empirically verified. The decision to adopt **Contract A (Recommended)** or **Contract B** rests with product leadership. Upon selection, the remediation can be implemented cleanly via a dedicated migration.
