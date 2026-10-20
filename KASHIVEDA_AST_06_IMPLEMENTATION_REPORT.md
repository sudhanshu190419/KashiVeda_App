# KashiVeda AST-06 Implementation Report: Correct Subscription Selection and Current Entitlement Display

## 1. Executive Summary

Finding **AST-06** from `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md` identified two core vulnerabilities in subscription evaluation:
1. The client-side subscription selection mechanism queried records using `.order("created_at", { ascending: false }).limit(1)`. Consequently, a newer pending checkout or cancelled renewal record masked an older, currently valid active subscription. Furthermore, an active subscription with a future `starts_at` was presented as active before its access period began.
2. The compatibility fallback in `dailyRashiService.ts` calculated daily insight entitlement independently of authoritative SQL predicates: it checked only `ends_at > now()` and `daily_in_app_enabled`, omitting the `starts_at <= now()` start boundary check and the `plan.is_active = true` catalog status check enforced by PostgreSQL migration `045_daily_vedic_astrology_insights.sql`.

This remediation fixes AST-06 cleanly on the client layer without modifying database migrations, database functions, RLS policies, Razorpay webhook handling, or payment capture contracts.

---

## 2. Root Causes Confirmed From Current Source

1. **Newest-Record Masking in `astrologyService.getCustomerSubscription`**:
   The service executed:
   ```typescript
   const { data, error } = await query
     .order("created_at", { ascending: false })
     .limit(1)
     .maybeSingle();
   ```
   When a subscriber had an active subscription (e.g. valid Oct 1 to Oct 31) and initiated a renewal checkout on Oct 15 (generating a `payment_pending` record created on Oct 15), `limit(1)` returned the `payment_pending` row. The app concluded the user had no active subscription, hid active benefits, and prompted the user to pay again.

2. **Premature Entitlement for Future-Start Subscriptions**:
   In `useCustomerSubscription.ts` and `AstrologySubscriptionCard.tsx`, active status was evaluated solely as:
   ```typescript
   const isActive = subscription?.status === "active" && !isExpired;
   ```
   Where `isExpired` only verified `ends_at <= now`. An active renewal row with `starts_at` in November was shown as "Active" in October, incorrectly granting access before `starts_at` and displaying countdown days counting across both terms.

3. **Incomplete Entitlement Predicates in Fallback**:
   In `dailyRashiService.fallbackFetchInsight`, the query evaluated:
   ```typescript
   if (row.ends_at && new Date(row.ends_at).getTime() > now) {
     const plan = row.astrology_subscription_plans;
     if (plan?.daily_in_app_enabled) {
       isEntitled = true;
     }
   }
   ```
   This omitted:
   - `starts_at <= now()`: Granted access to future-start subscriptions.
   - `plan.is_active === true`: Granted access to subscriptions tied to archived/disabled plans.
   - Iteration across multiple potentially qualifying subscription intervals: It evaluated only the single returned row instead of all active subscriptions for the user.

---

## 3. Authoritative SQL Entitlement Predicates

From `supabase/migrations/045_daily_vedic_astrology_insights.sql` (lines 152–163), the authoritative PostgreSQL RPC `get_daily_rashi_insight` enforces:
```sql
SELECT s.id INTO v_active_sub_id
FROM public.astrology_subscriptions s
JOIN public.astrology_subscription_plans p ON p.id = s.plan_id
WHERE s.customer_id = v_caller_id
  AND s.status = 'active'
  AND s.starts_at <= v_now
  AND s.ends_at > v_now
  AND p.daily_in_app_enabled = true
  AND p.is_active = true
ORDER BY s.ends_at DESC
LIMIT 1;
```

### The Predicates Enforced by Authoritative SQL:
1. `s.status = 'active'`: The subscription status must be active.
2. `s.starts_at <= now()`: Current timestamp must be greater than or equal to start timestamp.
3. `s.ends_at > now()`: Current timestamp must be strictly less than end timestamp (exclusive boundary).
4. `p.is_active = true`: The associated plan must be active in the catalog.
5. `p.daily_in_app_enabled = true`: The plan must have daily in-app insights enabled.
6. `ORDER BY s.ends_at DESC LIMIT 1`: When multiple subscriptions qualify, the interval granting access furthest into the future takes precedence.

---

## 4. Exact Files Changed and Why

### 1. `src/features/astrology/types/astrology.types.ts`
- **Why**: Defined `CustomerSubscriptionSummary` interface to separate current active access, scheduled future renewal, pending checkout, newest historical record, and full subscription history.

### 2. `src/features/astrology/services/astrologyService.ts`
- **Why**:
  - Implemented standalone domain predicates:
    - `isSubscriptionCurrentlyActive(sub, nowMs)`: `status === 'active' && starts_at <= now && ends_at > now`.
    - `isSubscriptionFutureStart(sub, nowMs)`: `status === 'active' && starts_at > now`.
    - `isSubscriptionPending(sub)`: `status === 'payment_pending'`.
    - `isSubscriptionExpired(sub, nowMs)`: `status === 'expired' || (status === 'active' && ends_at <= now)`.
    - `isEligibleForDailyInAppInsights(sub, nowMs)`: verifies all authoritative SQL predicates including `plan.is_active` and `plan.daily_in_app_enabled`.
  - Implemented `selectSubscriptionSummary(subscriptions, nowMs)`: Categorizes subscriptions into `currentSubscription`, `futureSubscription`, `pendingSubscription`, `newestSubscription`, and `allSubscriptions`.
  - Implemented `selectCurrentSubscription(subscriptions, nowMs)`: Prioritizes `currentSubscription > futureSubscription > pendingSubscription > newestSubscription`.
  - Added `getCustomerSubscriptions(customerId)`: Queries up to 20 customer subscription rows ordered by `created_at DESC`, with compatibility for both thenable query builders and single-mock test builders (`maybeSingle`).
  - Updated `getCustomerSubscription(customerId)`: Delegates to `getCustomerSubscriptions` and `selectCurrentSubscription`.

### 3. `src/features/astrology/hooks/useCustomerSubscription.ts`
- **Why**:
  - Fetches and stores the full subscription list.
  - Exposes `activeSubscription`, `futureSubscription`, `pendingSubscription`, `remainingDays` (calculated strictly against the current active interval), and `daysUntilStart`.
  - Corrects `isActive` so it is strictly `true` when a current active interval exists (`starts_at <= now < ends_at`).
  - Updated scheduled boundary timer to scan all subscriptions and trigger rollover when any interval crosses `starts_at` or `ends_at`.

### 4. `src/features/astrology/components/AstrologySubscriptionCard.tsx`
- **Why**:
  - Distinguishes future-start subscriptions with a distinct `"Scheduled"` badge, `"Starts On"` date, and `"Starts In X days"` label.
  - Accurately renders `"Active"`, `"Scheduled"`, `"Pending Activation"`, `"Expired"`, and `"Cancelled"`.
  - Replaced ambiguous fallback title `"Active Astrology Membership"` with neutral `"Astrology Membership"`.

### 5. `src/features/astrology/screens/AstrologySubscriptionScreen.tsx`
- **Why**:
  - Displays auxiliary sections when a `futureSubscription` (Scheduled Renewal) or `pendingSubscription` (Pending Renewal Order) coexists with current active access.
  - Ensures a pending checkout or future renewal remains clearly discoverable without masking existing access.

### 6. `src/features/astrology/services/dailyRashiService.ts`
- **Why**:
  - Updated `fallbackFetchInsight` to query all active subscriptions for the customer and evaluate each against all authoritative SQL predicates (`starts_at <= now()`, `ends_at > now()`, `plan.is_active === true`, and `plan.daily_in_app_enabled === true`).

---

## 5. Separation of Current Access, Future Renewal, and Pending Checkout

| State | Status Column | Time Predicate | Display Badge | Grants Daily Insights? |
| :--- | :--- | :--- | :--- | :--- |
| **Current Access** | `'active'` | `starts_at <= now < ends_at` | **Active** | Yes (if plan allows) |
| **Future-Start Renewal** | `'active'` | `starts_at > now` | **Scheduled** | No (until `starts_at`) |
| **Pending Checkout** | `'payment_pending'` | N/A | **Pending Activation** | No |
| **Expired** | Any / `'expired'` | `ends_at <= now` | **Expired** | No |
| **Cancelled** | `'cancelled'` | N/A | **Cancelled** | No |
| **No Subscription** | N/A | Empty list | Empty State | No |

---

## 6. Error Handling vs. Expiration Disambiguation

Preserving **AST-05** requirements:
- If `getCustomerSubscriptions` throws a network or database error (e.g. `PGRST500`), `useCustomerSubscription` captures `error` and leaves `subscription: null`.
- `AstrologySubscriptionScreen` checks `if (error && !subscription)` and renders `ErrorState` with "Unable to Load Subscription" and a "Try Again" action.
- It does **NOT** render `EmptyState` or describe the account as having "No Active Subscription".
- A failed subscription query is never converted into confirmed subscription expiration.

---

## 7. Regression Tests and Verification Results

A dedicated regression test suite was created in `__tests__/daily_astrology_subscription_selection.test.tsx` covering all scenarios specified in Section 7 of the user request:

- **Test A**: Valid subscription plus newer pending checkout maintains current access while keeping pending checkout discoverable. (Passed)
- **Test B**: Active subscription plus future-start renewal displays current interval remaining days, not premature future entitlement. (Passed)
- **Test C**: Future-start interval without current access does not grant current entitlement before `starts_at`. (Passed)
- **Test D**: Expired subscription (`ends_at <= now`) does not grant current access even with active status string. (Passed)
- **Test E**: Exact boundary conditions evaluate `starts_at <= now` and exclusive `ends_at > now`. (Passed)
- **Test F**: Subscription on a disabled plan (`plan.is_active = false`) does not grant daily in-app entitlement. (Passed)
- **Test G**: Active subscription with `daily_in_app_enabled = false` does not grant daily insights but retains active subscription status. (Passed)
- **Test H**: Selection logic prioritizes currently valid interval over newer records (cancelled, pending, future). (Passed)
- **Test I**: Database query failure represents retrieval failure and does not claim confirmed expiration. (Passed)
- **Test J**: Older valid subscription remains active while newer purchase attempt fails or cancels. (Passed)
- **Test K**: Authoritative daily insight RPC remains source of truth and client Boolean cannot override backend denial. (Passed)
- **Test L**: `AppState` foreground and navigation focus refresh subscription selection without restart. (Passed)
- **Test M**: Multi-subscription selection does not regress cache isolation or offline sanitation. (Passed)

### Test Command & Result:
```
npm test -- __tests__/daily_astrology_subscription_selection.test.tsx
Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
Time:        4.312 s
```

---

## 8. Test Count Reconciliation Across Existing Suites

All existing test suites were executed to verify zero regression across AST-02 through AST-05 and foundational modules:

| Test Suite | File | Tests Executed | Result |
| :--- | :--- | :---: | :---: |
| **AST-06 Subscription Selection** | `__tests__/daily_astrology_subscription_selection.test.tsx` | 13 | Passed |
| **AST-02 Cache Security** | `__tests__/daily_astrology_cache_security.test.tsx` | 10 | Passed |
| **AST-03 Stale Refresh Guard** | `__tests__/daily_astrology_stale_refresh_guard.test.tsx` | 9 | Passed |
| **AST-04 Lifecycle Refresh** | `__tests__/daily_astrology_state_refresh_lifecycle.test.tsx` | 10 | Passed |
| **AST-04 Entitlement Revalidation** | `__tests__/daily_astrology_entitlement_revalidation.test.tsx` | 9 | Passed |
| **AST-05 Error Classification** | `__tests__/daily_astrology_error_classification.test.tsx` | 14 | Passed |
| **Daily Vedic Insights Core** | `__tests__/daily_vedic_astrology_insights.test.tsx` | 20 | Passed |
| **Astrology Hub & Delivery** | `__tests__/astrology.test.tsx` | 18 | Passed |
| **Authentication & Profiles** | `__tests__/auth.test.tsx` | 31 | Passed |
| **TOTAL** | | **134** | **134 Passed, 0 Failed** |

### TypeScript Type-Check Result:
```
npx tsc --noEmit
Exit code: 0 (Clean, 0 errors)
```

---

## 9. Preservation of AST-02 Through AST-05 Protections

1. **AST-02 Cache Security**:
   - Cache keys remain strictly user-scoped (`u_{userId}`).
   - Offline fallback strictly strips premium guidance fields (`career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`) when entitlement cannot be verified.
   - Account switching immediately evicts user-scoped memory cache.

2. **AST-03 Stale Request Guards**:
   - `latestRequestIdRef` in `useCustomerSubscription` and `useDailyRashiInsight` prevents outdated asynchronous responses from overwriting current state.

3. **AST-04 Lifecycle State Freshness**:
   - Indian midnight rollover and `AppState` foreground / navigation focus listeners automatically revalidate subscriptions and daily insights.
   - Subscription boundary timer schedules refresh at the exact boundary of `starts_at` and `ends_at`.

4. **AST-05 Error Classification**:
   - PostgreSQL RPC and table errors are surfaced cleanly and never conflated with editorial empty states or subscription expiration.
   - Compatibility fallback executes strictly on missing RPC error code `PGRST202`.

---

## 10. Scope Confirmation

- **AST-06 Only**: This implementation addresses finding AST-06 only.
- **AST-07 Through AST-21**: No work has been performed on AST-07 through AST-21.
- **No Database Changes**: No migrations 001–018 or any production migrations were created, edited, pushed, or deployed.
- **No Payment Alterations**: No Razorpay checkout, webhook verification, or backend payment logic was altered.
