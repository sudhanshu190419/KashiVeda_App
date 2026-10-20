# KashiVeda AST-05 Implementation Report: Error Classification, Fallback Hardening, and Visibility

**Task Reference:** KashiVeda AST-05 — Distinguish Backend Failures From Empty Content and Subscription Denial  
**Date:** October 10, 2026  
**Status:** Completed & Fully Verified  
**Scope:** AST-05 Only (AST-06 through AST-21 strictly excluded)  

---

## 1. Root Causes Confirmed in the Current Source

Prior to remediation, an inspection of the daily astrology stack identified five critical defects where unexpected backend errors masqueraded as successful editorial empty states, incorrect subscription denials, or false offline notices:

1. **Unconditional Fallback Invocation on Any RPC Failure (`dailyRashiService.ts`):**
   - Line 120 previously evaluated `if (error) { return await this.fallbackFetchInsight(...); }` for *every* Supabase RPC error.
   - Database connection timeouts (`57014`), permission denied errors (`42501`), internal server errors (`500` / `XX000`), syntax errors, and network errors returned as error objects were mistakenly treated as proof that the RPC function was missing, triggering the direct-table compatibility fallback inappropriately.

2. **Swallowed Subscription Query Errors in Direct-Table Fallback (`dailyRashiService.ts`):**
   - In `fallbackFetchInsight()`, `const { data: subData } = await supabase.from("astrology_subscriptions")...` omitted the `error: subError` check.
   - When the subscription query failed due to a database glitch or table error, `subData` evaluated to `null`. The code treated this as `isEntitled = false` and returned `"An active Vedic Astrology subscription is required to access Daily Insights."`.
   - A database failure was thus falsely presented to the customer as confirmed subscription expiration/denial.

3. **Query Errors Masquerading as Editorial Empty States (`dailyRashiService.ts`):**
   - In `fallbackFetchInsight()`, the query to `daily_rashi_insights` executed:
     ```ts
     if (insightError || !insightData) {
       return { success: true, is_entitled: true, content: null, ... };
     }
     ```
   - If `insightError` occurred (e.g. table lock, network timeout, schema mismatch), the service silently swallowed the error, marked the response `success: true`, and returned `content: null`.
   - The UI subsequently displayed the editorial empty state ("No Insight for Mesha Today ... currently being prepared by Vedic scholars in Varanasi"), misleading users and masking real database failures.

4. **False Offline State for Non-Network Exceptions (`useDailyRashiInsight.ts`):**
   - In `useDailyRashiInsight.ts`, the `catch (err: any)` block unconditionally called `setIsUnverifiedOffline(true)`.
   - Server crashes, database statement timeouts, or JavaScript exceptions were flagged as offline mode, showing the user an "Offline Mode" notice even when connected.
   - Furthermore, `setError` in `useDailyRashiInsight.ts` was only populated `if (!result.is_entitled && result.error)`, which prevented error state synchronization when `result.success` was false.

5. **Invisible Errors and Missing UI Error State (`AstrologyScreen.tsx` & `DailyRashiInsightCard.tsx`):**
   - In `AstrologyScreen.tsx`, `error: insightError` was destructured from `useDailyRashiInsight()` but was never passed to `<DailyRashiInsightCard />`.
   - `DailyRashiInsightCardProps` did not accept an `error` prop.
   - When an unhandled backend error occurred with `!isEntitled`, the card rendered the subscription paywall (`styles.lockedCard`) as the sole explanation for an unexpected backend failure.
   - No `ErrorState` component was rendered, and no visible "Try Again" retry action was offered for unexpected errors.

---

## 2. Exact Files Changed and Why

1. [dailyRashiService.ts](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts):
   - Added `isRpcNotDeployedError(error)` to detect genuine missing-function errors (`PGRST202`, `42883`, or schema cache missing function messages).
   - Added `isNetworkError(err)` to identify transient network and transport failures (`network`, `failed to fetch`, `offline`, `connection lost`, `etimedout`, etc.).
   - Updated `fetchDailyInsight()`:
     - Throws network errors into the offline recovery block rather than invoking the compatibility fallback.
     - Restricts `fallbackFetchInsight()` execution strictly to missing-RPC deployment conditions.
     - Surfaces all other RPC errors (permissions, timeouts, database errors) as typed failures (`success: false, error: error.message`).
     - Restricted offline cache recovery in `catch` block strictly to `isNetworkError(err)`.
   - Updated `fallbackFetchInsight()`:
     - Checks `subError` explicitly. If the subscription lookup fails, it returns a typed error rather than asserting lack of entitlement.
     - Separates `insightError` from `!insightData`. If the query fails, it returns a typed error rather than fabricating an editorial empty state.

2. [useDailyRashiInsight.ts](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts):
   - Synchronized `error` state: sets `setError(result.error)` when present, or clears it with `setError(null)` on valid results.
   - Updated `catch` block to set `isUnverifiedOffline: dailyRashiService.isNetworkError(err)` so unexpected backend/database exceptions are not misclassified as offline mode.

3. [DailyRashiInsightCard.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx):
   - Added `error?: string | null` to `DailyRashiInsightCardProps`.
   - Added `isSubscriptionNotice(error)` helper to distinguish subscription lock messages from unexpected backend failures.
   - Added dedicated `ErrorState` rendering branch (Outcome E) displaying `"Unable to Load Daily Guidance for {rashi.vedicName}"`, the specific failure message, and a `"Try Again"` retry button.
   - Ensured genuine backend failures do not fall through to the subscription paywall or editorial empty state.

4. [AstrologyScreen.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologyScreen.tsx):
   - Passed `error={insightError}` to `<DailyRashiInsightCard />`.
   - Maintained `onRetry={refreshDailyInsight}` pointing to the guarded refresh path.

---

## 3. The Final Error and Result Classification

The daily astrology system now classifies outcomes into 5 mutually exclusive, predictable states:

| Outcome | Classification | Backend Response | Hook State | UI Rendering |
| :--- | :--- | :--- | :--- | :--- |
| **A** | **Valid Content** | `success: true`<br>`is_entitled: true`<br>`content: DailyRashiInsight` | `loading: false`<br>`error: null`<br>`isEntitled: true`<br>`insight: DailyRashiInsight` | Renders full Horoscope card with AST-02 premium protections and free auspicious attributes. |
| **B** | **Legitimate Absence of Content** | `success: true`<br>`is_entitled: true`<br>`content: null` | `loading: false`<br>`error: null`<br>`isEntitled: true`<br>`insight: null` | Renders `EmptyState`: *"No Insight for {Rashi} Today ... currently being prepared by Vedic scholars in Varanasi"*. No error or paywall. |
| **C** | **Confirmed Lack of Entitlement** | `success: false`<br>`is_entitled: false`<br>`error: "An active Vedic Astrology subscription is required..."` | `loading: false`<br>`error: "...subscription required..."`<br>`isEntitled: false`<br>`insight: null` | Renders `styles.lockedCard`: *"Paid Vedic Guidance"* with feature list and *"Unlock Daily Astrological Insights ✨"* checkout button. |
| **D** | **Transient Transport / Offline Failure** | Network exception or error object with `isNetworkError() == true` | If cached: `isEntitled: false`, `isUnverifiedOffline: true`, `insight: sanitized`<br>If uncached: `isEntitled: false`, `isUnverifiedOffline: true`, `insight: null` | If cached: Sanitized free overview with *"Offline Mode — Subscription Unverified"* banner.<br>If uncached: Offline card with *"Retry Connection 🔄"*. Never claims subscription expired. |
| **E** | **Unexpected Backend / Retrieval Failure** | `success: false`<br>`error: "<message>"` (DB error, 500, timeout, permission 42501, fallback failure) | `loading: false`<br>`error: "<message>"`<br>`isUnverifiedOffline: false`<br>`insight: null` | Renders `ErrorState`: *"Unable to Load Daily Guidance for {Rashi}"*, message, and visible *"Try Again"* button. |

---

## 4. Precise Condition Permitting Compatibility Fallback

The compatibility fallback (`fallbackFetchInsight`) is strictly guarded by `dailyRashiService.isRpcNotDeployedError(error)`. It executes **only** when Supabase returns:

1. PostgREST error code: `"PGRST202"` (*Could not find the function in the schema cache*).
2. PostgreSQL error code: `"42883"` (*undefined_function*).
3. Error message containing:
   - `"could not find the function"`
   - `"function ... does not exist"`
   - `"schema cache"` AND `"function"`

### Prohibited Conditions:
- Permission denied (`42501` / `401` / `403`): **No fallback** (surfaces authorization failure).
- Query timeout (`57014`): **No fallback** (surfaces timeout failure).
- Server 500 / internal error (`XX000`): **No fallback** (surfaces backend error).
- Network / transport error: **No fallback** (routes directly to offline cache recovery).

---

## 5. Representation of Subscription-Query Failures

- When `supabase.from("astrology_subscriptions")` fails in `fallbackFetchInsight()`, the error object `subError` is captured and returned:
  ```ts
  return {
    success: false,
    is_entitled: false,
    is_unverified: false,
    content: null,
    insight_date: date,
    rashi_id: rashiId,
    language,
    error: subError.message || "Failed to verify subscription status.",
  };
  ```
- **Invariants Enforced:**
  - The cache is **not evicted** as if the subscription expired.
  - The error is **not converted** into `"An active Vedic Astrology subscription is required..."`.
  - The error does **not fabricate** empty content.
  - The UI presents Outcome E (`ErrorState` with "Try Again"), ensuring the customer is not shown a paywall for a database lookup error.

---

## 6. Daily Astrology UI States and Retry Behavior

1. **Loading State:**
   - Displays elevated card with activity indicator and *"Reading cosmic planetary transits for {vedicName}..."*.
2. **Error State:**
   - Rendered using the existing `ErrorState` component wrapped in `<Card variant="outlined" />`.
   - Title: `Unable to Load Daily Guidance for {rashi.vedicName}`.
   - Message: Explicit failure reason (e.g. database error, timeout, auth requirement).
   - Action: Visible `"Try Again"` button.
3. **Retry Execution:**
   - Pressing `"Try Again"` invokes `onRetry`, which calls `useDailyRashiInsight.refresh()`.
   - Defaults `force: true`, bypassing deduplication and in-flight caching.
   - Sets `loading: true` and clears `error: null`.
   - Calls the guarded `executeGuardedFetch` path (honoring request-generation, active Rashi, and user session identity).
   - On retry success: transitions immediately to valid content (Outcome A) or legitimate empty state (Outcome B); error remains cleared.
   - On retry failure: updates `error` and returns to `ErrorState`.

---

## 7. Regression Tests Added and Actual Results

A comprehensive 14-test regression suite was created in [__tests__/daily_astrology_error_classification.test.tsx](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_error_classification.test.tsx).

### Test Suite Results (`npm test -- __tests__/daily_astrology_error_classification.test.tsx`):
```
PASS __tests__/daily_astrology_error_classification.test.tsx
  KashiVeda AST-05: Error Classification & Fallback Hardening
    √ Test A — Legitimate empty result displays editorial empty state without error or paywall (644 ms)
    √ Test B — RPC returned error object surfaces genuine failure and does not masquerade as empty content (8 ms)
    √ Test C — RPC thrown exception displays error state with visible retry and is not falsely marked offline (7 ms)
    √ Test D — Compatibility fallback condition executes strictly on missing RPC error (PGRST202) (9 ms)
    √ Test E — Unrelated RPC failure (permission denied 42501) does NOT invoke fallback (6 ms)
    √ Test F — Direct-table fallback query failure surfaces genuine error, not empty content (5 ms)
    √ Test G — Subscription-query error in fallback surfaces genuine error, not expired paywall (6 ms)
    √ Test H — Transient offline failure sanitizes premium fields and displays unverified offline state (19 ms)
    √ Test I — Backend confirms not entitled displays subscription lock and evicts cache (6 ms)
    √ Test J — Visible Retry action on error state triggers guarded refresh (7 ms)
    √ Test K — Successful retry after failure clears error and displays valid content (13 ms)
    √ Test L — Current request failure after Rashi switch does not overwrite current Rashi state (10 ms)
    √ Test M — Lifecycle revalidation bypasses cache and respects confirmed non-entitled backend state (14 ms)
    √ Test N — Auspicious color, number, and multilingual parameters operate without regression (8 ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Time:        2.421 s
```

### Full Regression Suite Verification:
All existing daily astrology and core regression suites were executed:

| Test Suite | Tests Run | Result | Notes |
| :--- | :--- | :--- | :--- |
| `daily_astrology_error_classification.test.tsx` | 14 | **PASS** | Newly added AST-05 test suite. |
| `daily_astrology_cache_security.test.tsx` | 10 | **PASS** | AST-02 cache security invariants. |
| `daily_astrology_stale_refresh_guard.test.tsx` | 9 | **PASS** | AST-03 guarded refresh invariants. |
| `daily_astrology_state_refresh_lifecycle.test.tsx` | 10 | **PASS** | AST-04 lifecycle & date rollover. |
| `daily_astrology_entitlement_revalidation.test.tsx` | 9 | **PASS** | AST-04 follow-up revalidation. |
| `daily_vedic_astrology_insights.test.tsx` | 17 | **PASS** | Core astrology insight contract. |
| `astrology.test.tsx` | 21 | **PASS** | General astrology module suite. |
| `auth.test.tsx` | 31 | **PASS** | Authentication & profile refresh. |
| **Total Automated Tests Executed** | **121** | **100% PASS** | Zero failures, zero flakes. |

### TypeScript Type-Checking:
`npx tsc --noEmit` exited with code `0` (zero compile errors across the entire codebase).

---

## 8. Verification of AST-02, AST-03, and AST-04 Protections

1. **AST-02 Invariants Preserved:**
   - User-scoped cache keys (`u_${userId}:${date}:${rashiId}:${language}`) remain strictly isolated.
   - Legacy unscoped global cache entries are purged and unreadable.
   - Offline fallback strips premium guidance fields (`career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`) via `sanitizeFreeContent()`.
   - Cached entitlement flags never independently unlock premium content.
   - Session boundary logout/switch immediately clears memory cache and state.

2. **AST-03 Invariants Preserved:**
   - Shared guarded request path (`executeGuardedFetch`) protects every fetch.
   - In-flight request ID validation (`latestRequestIdRef.current === requestId`) ensures stale responses and late errors from previously selected Rashis are silently dropped (verified by Test L).
   - Component unmount protection (`isMountedRef.current`) halts state updates cleanly.

3. **AST-04 Invariants Preserved:**
   - Indian midnight rollover scheduling continues to invalidate prior day's insight and re-fetch for the new Indian calendar date.
   - AppState foreground transition and navigation focus revalidation continue to query backend entitlement with deduplication.
   - Date mismatches prevent yesterday's cached content from ever masquerading as today's insight.
   - Compatible with `bypassCache` and `revalidate` options.

---

## 9. Remaining Limitations and Deployment Dependencies

- Compatibility fallback (`fallbackFetchInsight`) exists as a temporary bridge for environments where migration `045_daily_vedic_astrology_insights.sql` has not yet been applied.
- Once migration 045 is deployed across all staging and production environments, the fallback path can be retired in a subsequent maintenance release.
- Client-side error handling is robust against all network and database failure modes.

---

## 10. Confirmation of Audit Scope Restrictions

- **AST-06 through AST-21:** Strictly **NOT** implemented in this phase.
- **Subscription Eligibility Calculations:** Subscription plan selection predicates and duration logic were untouched (reserved for AST-06).
- **Payment & Checkout:** Razorpay, orders, checkout, and webhook logic were not altered.
- **Database Migrations:** No migration was added or modified. Migrations `001–018` and `045–047` remain intact. No database commands were executed.
- **Minimalism:** Minimal necessary changes were introduced in 4 files (`dailyRashiService.ts`, `useDailyRashiInsight.ts`, `DailyRashiInsightCard.tsx`, `AstrologyScreen.tsx`) plus 1 new test file.

---

## 11. Conclusion

AST-05 is completely resolved. Backend errors, network failures, missing content, and subscription locks are now clearly distinguished, accurately rendered, and fully recoverable via manual and lifecycle-driven retries. Under no circumstance does an RPC or query failure masquerade as a successful empty result or a confirmed subscription denial.
