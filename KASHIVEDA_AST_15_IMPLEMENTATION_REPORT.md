# KashiVeda AST-15 Implementation Report: Subscription Detail Financial Ledger Query & Error Handling

**Audit Finding**: AST-15 (Subscription detail drops all transactions/refunds on a nonexistent column `payment_method` in `payment_transactions`, and silently disguises query failures as empty financial history)  
**Target Repositories**: `C:\Projects\kashi-veda-admin` & `C:\Projects\KashiVeda`  
**Status**: Implemented, Verified with Isolated PostgreSQL & Unit Suites, Zero Regressions  

---

## 1. Confirmed Root Cause & Exact Source Locations

Prior to remediation, the Admin application's astrology subscription detail view silently failed to load captured payment transactions and refund records, presenting a completely blank financial history to administrators.

### Exact Source Locations
- **Server Action**: `lib/actions/astrology-management.ts`
  - Function: `getAstrologySubscriptionById` (lines 401–542)
  - Defective Transaction Query: Lines 438–442
  - Ignored Query Error & Flawed Refund Condition: Lines 444–456
- **UI Component**: `components/admin/astrology/astrology-subscription-detail-view.tsx`
  - Transactions & Refunds Rendering: Lines 271–337
  - Delivery Journal Rendering: Lines 353–357
- **TypeScript Types**: `lib/types/astrology-management.ts`
  - Interface: `AstrologySubscriptionDetail` (lines 100–135)

### Root Cause Analysis
1. **Invalid Column Reference in Supabase SELECT Query**:
   ```ts
   // Defective legacy code in lib/actions/astrology-management.ts:
   const { data: txData } = await supabase
     .from("payment_transactions")
     .select("id, provider_payment_id, amount, status, payment_method, created_at")
     .eq("payment_order_id", sub.payment_order_id)
     .order("created_at", { ascending: false });
   ```
   The query requested `payment_method` on `payment_transactions`. In PostgreSQL, table `public.payment_transactions` does not have a `payment_method` column. PostgREST immediately rejected the query with PostgreSQL error `42703` (`column payment_transactions.payment_method does not exist`).

2. **Silently Ignored Supabase Query Errors**:
   The action destructured `{ data: txData }` without checking `error`. When the query failed, `txData` was `null`, and the code fell back to:
   ```ts
   transactions = txData || [];
   ```
   This disguised a catastrophic query failure as a valid empty transaction list.

3. **Cascading Drop of Linked Refunds**:
   Because `transactions` was empty (`transactions.length === 0`), the subsequent refund query was skipped entirely:
   ```ts
   if (transactions.length > 0) {
     const txIds = transactions.map((t) => t.id);
     const { data: rfData } = await supabase.from("refunds")...
   }
   ```
   As a consequence, even when payments were captured and refunds were processed, both lists were returned as `[]`.

4. **UI Silence on Missing Data**:
   In `astrology-subscription-detail-view.tsx`, the UI evaluated `{subscription.transactions.length > 0 && (...)}`. If the array was empty (whether due to query error or true absence), the UI simply hid the section, offering no feedback or diagnostic error to the administrator.

---

## 2. Verified Local Schema & The Invalid Field Reference

### Schema Definition: Migration 007 (`007_payments_and_live.sql`)
Lines 52–62 of migration 007 define `public.payment_transactions`:
```sql
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
```

An exhaustive audit of migrations `001` through `050` verified:
- No migration adds a `payment_method` column to `public.payment_transactions`.
- The similarly named field `payment_method` exists on `public.pandit_payouts` (migration 042). It was inadvertently referenced in the subscription action.
- Valid columns on `payment_transactions` available for Admin visibility are:
  `id`, `payment_order_id`, `provider_payment_id`, `amount`, `status`, `paid_at`, `created_at`.
- Sensitive internal columns (`provider_signature`, `raw_response`) are excluded for security.

---

## 3. Corrected Query Fields & Verified Relationships

### Verified Data Flow & Foreign Keys
1. `astrology_subscriptions.payment_order_id` references `payment_orders.id`.
2. `payment_transactions.payment_order_id` references `payment_orders.id`.
3. `refunds.payment_transaction_id` references `payment_transactions.id`.

### Corrected Transaction Query
```ts
const { data: txData, error: txError } = await supabase
  .from("payment_transactions")
  .select("id, provider_payment_id, amount, status, created_at")
  .eq("payment_order_id", sub.payment_order_id)
  .order("created_at", { ascending: false });
```

### Corrected Refund Query
```ts
const txIds = transactions.map((t) => t.id);
const { data: rfData, error: rfError } = await supabase
  .from("refunds")
  .select("id, payment_transaction_id, amount, reason, status, provider_refund_id, created_at")
  .in("payment_transaction_id", txIds)
  .order("created_at", { ascending: false });
```

---

## 4. Files Changed and Purpose

| File | Purpose |
|---|---|
| [lib/types/astrology-management.ts](file:///C:/Projects/kashi-veda-admin/lib/types/astrology-management.ts) | Extended `AstrologySubscriptionDetail` interface with `transactionsError?: string \| null`, `refundsError?: string \| null`, `deliveriesError?: string \| null`, and `paymentTransactionId?: string`. |
| [lib/actions/astrology-management.ts](file:///C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts) | Corrected `getAstrologySubscriptionById`: removed invalid `payment_method`, added explicit error handling for transaction query, refund query, delivery query, and subscription lookup. |
| [components/admin/astrology/astrology-subscription-detail-view.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/astrology-subscription-detail-view.tsx) | Updated UI rendering to distinguish query failures from genuine empty history for transactions, refunds, and deliveries using explicit error banners and empty-state placeholders. |
| [__tests__/daily_astrology_subscription_financial_ledger.test.ts](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_subscription_financial_ledger.test.ts) | Added comprehensive Jest test suite covering Scenarios A through L (12 tests). |
| [scratch/test_ast_15_db_ledger.py](file:///C:/Projects/KashiVeda/scratch/test_ast_15_db_ledger.py) | Added isolated PostgreSQL 18 integration test verifying defective vs. corrected query execution against real database schema. |

---

## 5. Revised Action Result & UI Error-State Behavior

### Server Action Contract (`getAstrologySubscriptionById`)
- **Subscription Query Failure**: Throws an explicit `Error("Failed to load astrology subscription: ...")` instead of returning a misleading `null` (404 not found).
- **Missing Subscription Row**: Returns `null` when no row matches the given ID.
- **Successful Transaction Query**: Populates `transactions: [...]` and sets `transactionsError: null`.
- **Failed Transaction Query**: Sets `transactions: []`, captures `transactionsError: "Payment transaction history could not be loaded."`, and sets `refundsError: "Refund history could not be verified because payment transaction lookup failed."`.
- **Successful Refund Query**: Populates `refunds: [...]` and sets `refundsError: null`.
- **Failed Refund Query**: Preserves the valid `transactions` list, sets `refunds: []`, and captures `refundsError: "Refund history could not be loaded."`.
- **Failed Deliveries Query**: Preserves subscription and financial data, captures `deliveriesError: "Delivery dispatch history could not be loaded."`.

### UI Component Feedback (`astrology-subscription-detail-view.tsx`)
1. **Transactions Section**:
   - `subscription.transactionsError`: Renders a distinct red alert box (`bg-destructive/10 border-destructive/20 text-destructive`) displaying the error message.
   - `subscription.transactions.length > 0`: Renders captured gateway transactions with payment IDs, status badges, and formatted amounts.
   - Genuinely empty: Renders an italicized notice: `"No gateway transactions recorded for this order."`
2. **Refunds Section**:
   - `subscription.refundsError`: Renders a distinct red alert box displaying the error message.
   - `subscription.refunds.length > 0`: Renders refund obligations with refund IDs, reason notes, status badges, and refund amounts.
3. **Delivery Dispatches Section**:
   - `subscription.deliveriesError`: Renders an alert box displaying the delivery dispatch error.
   - `subscription.deliveries.length === 0`: Renders `"No deliveries dispatched for this subscription yet."`

---

## 6. Distinguishing Genuine Empty History from Failed Queries

| Condition | `transactions` | `transactionsError` | `refunds` | `refundsError` | UI Rendered State |
|---|---|---|---|---|---|
| **No Payment Order** | `[]` | `null` | `[]` | `null` | "No server-side payment order linked to this subscription record." |
| **Order Paid, No Transactions** | `[]` | `null` | `[]` | `null` | "No gateway transactions recorded for this order." (Refund query safely skipped) |
| **Captured Transaction, No Refunds** | `[tx]` | `null` | `[]` | `null` | Displays captured transaction; refunds block omitted cleanly. |
| **Captured Transaction + Refund** | `[tx]` | `null` | `[rf]` | `null` | Displays transaction and linked refund obligation. |
| **Transaction Query Failed** (e.g. invalid column) | `[]` | `"Payment transaction history could not be loaded."` | `[]` | `"Refund history could not be verified..."` | Displays error alert banner for transactions. Does NOT claim 0 transactions exist. |
| **Refund Query Failed** | `[tx]` | `null` | `[]` | `"Refund history could not be loaded."` | Displays captured transaction **plus** error alert banner for refunds. |

---

## 7. Test Matrix: Exact Commands & Actual Results

### A. Jest Test Suite (`__tests__/daily_astrology_subscription_financial_ledger.test.ts`)
Command: `npx jest __tests__/daily_astrology_subscription_financial_ledger.test.ts`

| Scenario | Description | Outcome |
|---|---|---|
| **Scenario A** | Valid transactions and refunds returned and mapped correctly | **PASS** |
| **Scenario B** | No transactions exist -> genuine empty history, refund query skipped safely | **PASS** |
| **Scenario C** | Subscription with captured payment displays supported transaction details | **PASS** |
| **Scenario D** | Subscription with a refund returns both with correct linkage | **PASS** |
| **Scenario E** | Multiple transactions and refunds preserved without loss or cross-talk | **PASS** |
| **Scenario F** | Invalid-column query failure (`payment_method`) reported explicitly, not disguised as empty | **PASS** |
| **Scenario G** | Permission-denied transaction query failure reported explicitly | **PASS** |
| **Scenario H** | Refund query failure reported explicitly while preserving valid transaction data | **PASS** |
| **Scenario I** | Refund query skipped ONLY when transaction query completed successfully with empty set | **PASS** |
| **Scenario J** | Missing subscription returns `null`, prerequisite query failures throw explicit errors | **PASS** |
| **Scenario K** | UI source code distinguishes query errors from genuine empty history | **PASS** |
| **Scenario L** | Schema integrity: verifies `payment_transactions` in migration 007 has no `payment_method` | **PASS** |

**Summary**: 12/12 passed (Time: 19.465s).

### B. Isolated PostgreSQL 18 Integration Test (`scratch/test_ast_15_db_ledger.py`)
Command: `python scratch/test_ast_15_db_ledger.py`

```
--- TEST 1: Defective Query Execution ---
PASS: Defective query failed with expected PostgreSQL exception:
      ERROR:  column "payment_method" does not exist
LINE 2: ...  SELECT id, provider_payment_id, amount, status, payment_me...
                                                             ^ (code: 42703)

--- TEST 2: Corrected Query Execution ---
PASS: Corrected transaction query succeeded: id=22133c0e-..., providerPaymentId=pay_test_ast15, amount=499.00, status=captured

--- TEST 3: Linked Refunds Query Execution ---
PASS: Corrected refund query succeeded: id=8a7e82c4-..., txId=22133c0e-..., amount=499.00, status=processed

============================================================
ALL ISOLATED POSTGRESQL LEDGER TESTS PASSED SUCCESSFULLY!
============================================================
```

---

## 8. TypeScript, ESLint, Regression, and Build Results

### TypeScript Compilation
- **Command**: `npx tsc --noEmit` in `C:\Projects\kashi-veda-admin`
- **Output**: Clean exit (0 errors).

### ESLint Check
- **Command**: `npx eslint components/admin/astrology/astrology-subscription-detail-view.tsx lib/actions/astrology-management.ts lib/types/astrology-management.ts`
- **Output**: Clean exit (0 errors, 0 warnings).

### Full Regression Test Suite
- `npx jest __tests__/daily_astrology`: **14 passed, 14 total (251/251 tests passed)**.
- `npx jest __tests__/astrology_subscription_payment_serialization.test.ts`: **14/14 passed**.
- `node scratch/test_ast_14_timezone_contract.mjs`: **9/9 passed** (multi-timezone roundtrip across UTC, IST, PDT).
- `node scratch/test_ast_13_timezone_stepping.mjs`: **4/4 passed** (UTC, IST, PDT calendar stepping).
- `node scratch/test_ast_11_csv_identity.mjs`: **4/4 passed** (CSV composite identity and overwrite checks).
- `python scratch/test_ast_11_db_overwrite_concurrency.py`: **All scenarios passed** (PostgreSQL 18.4 concurrency tests).
- `node scratch/test_ast_10_publishing_results.mjs`: **7/7 passed** (partial-publishing feedback).
- `python scratch/test_astrology_optimistic_concurrency.py`: **8/8 OCC scenarios passed**.
- `node scratch/test_astrology_matrix_coordinator.mjs`: **13/13 passed**.

### Production Build Validation
- **Command**: `npm run build` in `C:\Projects\kashi-veda-admin`
- **Outcome**: All astrology modules, components, and pages compiled cleanly.
- **Unrelated Known Issue**: As noted in previous reports and problem constraints, Next.js build encounters the pre-existing error in `app/(dashboard)/reviews/page.tsx` (`Error: Route segment config "dynamic" is not compatible with nextConfig.cacheComponents`). This file remains untouched per instructions.

---

## 9. Test Environment Breakdown: Mocks vs. Isolated Database

| Test Suite / Script | Environment Type | Purpose |
|---|---|---|
| `__tests__/daily_astrology_subscription_financial_ledger.test.ts` | **Deterministic Unit Mocks** | Verifies Server Action error-handling logic, PostgREST error codes (42703, 42501), UI state conditions, and schema file static assertions. |
| `scratch/test_ast_15_db_ledger.py` | **Real Isolated PostgreSQL 18.4 Database** (`port 5433`) | Spawns isolated PostgreSQL instance, builds migration 007 schema, proves PostgreSQL raises `42703` on defective query, and verifies corrected queries execute cleanly against real tables. |
| `scratch/test_ast_11_db_overwrite_concurrency.py` | **Real Isolated PostgreSQL 18.4 Database** (`port 5433`) | Verifies migration 050 multi-session overwrite guards and concurrency locks. |
| `scratch/test_astrology_optimistic_concurrency.py` | **Real Isolated PostgreSQL 18.4 Database** (`port 5433`) | Verifies migration 049 OCC versions and audit log integrity under multi-session transactions. |

---

## 10. Remaining Limitations & Production Schema Assumptions

1. **Production Schema Verification**:
   The fix was validated against the authoritative migration chain (`001`–`050`) and an isolated PostgreSQL 18.4 test instance. Production database tables were not probed with remote admin credentials; production impact remains conditional on the deployed catalog matching the migration chain.
2. **Pre-Existing Reviews Route Issue**:
   The Turbopack error in `app/(dashboard)/reviews/page.tsx` continues to block standalone Next.js production bundle creation. It was left untouched.

---

## 11. Explicit Confirmation of Subsequent Findings

**AST-16 and later findings were NOT implemented.** Work was strictly confined to AST-15.

---

## 12. Explicit Confirmation of Database & Migration Integrity

- **No migrations deployed or executed**: No Supabase migration was created, altered, or pushed to any remote or production database.
- **No production database modified**: All tests were executed using isolated test transactions or local test processes. Migrations `001` through `050` remain intact and unedited.
