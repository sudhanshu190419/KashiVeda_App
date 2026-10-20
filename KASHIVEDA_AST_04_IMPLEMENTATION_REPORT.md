# KashiVeda AST-04 Implementation Report: Refresh State on Date, Authentication, and Entitlement Changes

**Project:** KashiVeda Mobile Application (`C:\Projects\KashiVeda`)  
**Audit Reference:** `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md` (Finding AST-04)  
**Authoritative Standards:** Production Concurrency, State Invalidation, Timezone Independence, Account Scoping, Zero-Unsolicited-Polling  
**Status:** **RESOLVED & VERIFIED**

---

## 1. Root Cause Confirmed from Current Source

Inspection of `useDailyRashiInsight.ts`, `useCustomerSubscription.ts`, `AstrologyScreen.tsx`, and `AstrologySubscriptionScreen.tsx` prior to remediation revealed five distinct lifecycle gaps where state remained mounted and stale:

1. **Indian Midnight Rollover (`Asia/Kolkata`):**
   - In `useDailyRashiInsight.ts`, insights were requested on mount, during Rashi switches, or via manual user refresh.
   - When the clock passed 00:00:00 IST (Indian midnight), no timer or date watcher was scheduled.
   - The screen remained mounted displaying yesterday's astrological insight (`insight.insight_date`) labeled under today's date heading without invalidating content or requesting the new day's insight.

2. **Application Background to Foreground Wake-Up:**
   - While `AuthContext.tsx` contained an `AppState` listener for user roles and profiles, neither `useDailyRashiInsight` nor `useCustomerSubscription` listened to `AppState` transitions.
   - If the app was backgrounded across Indian midnight or while external subscription activation/expiration occurred, returning to the app left stale daily insight content and outdated subscription status mounted indefinitely.

3. **Post-Checkout Navigation Return:**
   - In `AstrologyPaymentScreen.tsx`, successful payment confirmation navigated the user to `AstrologyScreen` or `AstrologySubscriptionScreen`.
   - However, if `AstrologyScreen` was already mounted in the stack, it lacked a React Navigation `useFocusEffect` lifecycle listener.
   - Consequently, the screen retained stale `subscription === null` and `isEntitled === false`, keeping the daily horoscope card locked behind the paywall until manual pull-to-refresh or app restart.

4. **Authentication & Session Boundary Gaps in Subscriptions:**
   - In `useCustomerSubscription.ts`, `fetchSubscription` lacked immediate state clearing and identity guards.
   - When `user?.id` transitioned on logout or account switch, the previous user's subscription summary remained rendered while the new user's query loaded.
   - A slow asynchronous response started under the previous user could resolve late and overwrite the newly logged-in user's subscription state.

5. **Subscription Time Boundaries (`starts_at` / `ends_at`):**
   - Active customer subscriptions have an authoritative `ends_at` timestamp.
   - While the screen remained mounted across expiration, the summary continued displaying `status: "active"` and non-zero `remainingDays` until manually refreshed.

---

## 2. Exact Files Changed and Why

### 1. `src/shared/utils/date.ts`
- **Change:** Implemented and exported `getMsUntilNextIndianMidnight(now: Date = new Date()): number`.
- **Why:** Calculates the exact milliseconds until the next 00:00:00 IST (Indian midnight) in a strictly timezone-independent manner using the constant IST UTC offset (`+05:30` / `+19,800,000` ms) with zero reliance on device local timezone or locale configuration.

### 2. `src/features/astrology/hooks/useDailyRashiInsight.ts`
- **Change:**
  1. Added `activeInsightDateRef` to track the calendar date of the currently loaded insight.
  2. Implemented bounded one-shot Indian midnight rollover timer (`scheduleMidnightRollover`) with automatic unref and cleanup.
  3. Integrated React Native `AppState` foreground listener (`AppState.addEventListener("change", ...)`) to check for date shifts and trigger revalidation upon wake-up.
  4. Implemented request-key deduplication (`${requestUserId}:${targetRashiId}:${currentIndianDate}`) and a 2000ms cooldown window to prevent bursts of duplicate requests when foreground and focus events arrive concurrently.
  5. Enhanced session-boundary cleanup on auth change to synchronously clear `activeInsightDateRef`, `lastFetchTimeRef`, in-flight promises, and session cache.
  6. Provided `refresh(options?: { force?: boolean })` where manual refresh forces cache clearing while lifecycle calls respect deduplication.
- **Why:** Ensures the daily horoscope card automatically transitions across midnight, clears yesterday's content immediately on date rollover, reacts to foreground returns, and prevents duplicate request bursts.

### 3. `src/features/astrology/hooks/useCustomerSubscription.ts`
- **Change:**
  1. Added `isMountedRef`, `activeUserIdRef`, `latestRequestIdRef`, `lastFetchTimeRef`, and in-flight tracking refs.
  2. Implemented immediate synchronous state clearing (`setSubscription(null); setError(null)`) upon user logout or account switch, ignoring any obsolete in-flight responses.
  3. Added `AppState` foreground listener to revalidate subscription state when returning from background.
  4. Implemented bounded one-shot boundary timer (`boundaryTimerRef`) targeted specifically at the next `starts_at` or `ends_at` timestamp, re-fetching updated status without high-frequency polling.
  5. Supported deduplication and forced vs. passive revalidation in `fetchSubscription` and `refresh`.
- **Why:** Resolves subscription stale-state after checkout, on boundary expiration, across foreground transitions, and across user account switches.

### 4. `src/features/astrology/screens/AstrologyScreen.tsx`
- **Change:**
  1. Integrated `@react-navigation/native`'s `useFocusEffect` with `isFirstFocusRef` guard.
  2. Revalidates both customer subscription (`refreshSub({ force: false })`) and daily insight entitlement (`refreshDailyInsight({ force: false })`) whenever the screen regains focus (e.g. returning from `AstrologyPaymentScreen`).
- **Why:** Guarantees that returning from checkout re-queries the backend and unlocks the daily astrology card without requiring an app restart or manual pull-to-refresh.

### 5. `src/features/astrology/screens/AstrologySubscriptionScreen.tsx`
- **Change:**
  1. Integrated `useFocusEffect` with `isFirstFocusRef` guard to revalidate subscription upon gaining focus.
- **Why:** Ensures the subscription management details screen displays the newly active plan immediately after completing checkout.

### 6. `__tests__/daily_astrology_state_refresh_lifecycle.test.tsx`
- **Change:** Created a comprehensive 10-test suite covering Tests A through J as required by AST-04.

---

## 3. Date-Rollover Behavior (Indian Calendar Date)

- **Formula & Timezone Independence:**
  Indian Standard Time (IST) is UTC + 5h 30m (+19,800,000 ms). India has no Daylight Saving Time.
  For any epoch timestamp `utcMs = now.getTime()`, IST elapsed time since epoch is `istMs = utcMs + 19,800,000`.
  The milliseconds elapsed into the current IST day is `istTimeOfDay = ((istMs % 86,400,000) + 86,400,000) % 86,400,000`.
  The milliseconds until 00:00:00 IST is `msUntilMidnight = 86,400,000 - istTimeOfDay`.
- **One-Shot Boundary Scheduling:**
  `useDailyRashiInsight` schedules a single one-shot `setTimeout` for `msUntilMidnight + 250ms` (to ensure crossing the boundary).
  When the timer fires:
  1. `getIndianCalendarDate()` is evaluated.
  2. If the current Indian date differs from `activeInsightDateRef.current`, yesterday's insight is **immediately cleared** (`setInsight(null); activeInsightDateRef.current = null`).
  3. `executeGuardedFetch` is executed for the new Indian date.
  4. The next one-shot timer is scheduled.
- **Fail-Safe Invalidation:**
  If the new-day fetch fails (e.g., offline or network timeout):
  - Yesterday's insight is **never** presented as today's content.
  - State renders `DailyRashiInsightCard` offline mode with a retry button.
  - The user is **never** falsely told their subscription has expired merely because network verification failed.

---

## 4. Foreground and Navigation-Focus Refresh Behavior

- **AppState Foreground Lifecycle:**
  When React Native `AppState` transitions from `"background"` or `"inactive"` to `"active"`:
  1. `scheduleMidnightRollover()` recalculates the midnight timer against the current clock.
  2. The current Indian calendar date is compared against `activeInsightDateRef.current`.
  3. If the date changed while backgrounded: immediate invalidation and fetch for the new date.
  4. If the date did not change: revalidation is triggered if outside the 2000ms deduplication cooldown.
  5. `useCustomerSubscription` re-reads subscription state from Supabase.
- **Navigation Focus Coordination (`useFocusEffect`):**
  When `AstrologyScreen` regains focus (e.g., returning from checkout):
  - `refreshSub({ force: false })` queries the latest subscription state.
  - `refreshDailyInsight({ force: false })` revalidates daily insight.
  - Initial mount is guarded via `isFirstFocusRef` to prevent double-fetching on initial load.
- **Deduplication:**
  If `AppState` transition to `"active"` and navigation `focus` occur in the same event tick:
  - The first call executes and sets `lastFetchTimeRef.current = Date.now()`.
  - The second call detects `now - lastFetchTimeRef.current < 2000ms` and `inFlightKeyRef` matching, cleanly skipping duplicate requests.

---

## 5. Authentication and Account-Switch Handling

- **Immediate State Wiping:**
  When `user?.id` changes (login, logout, or account switch):
  - In `useDailyRashiInsight`:
    - `setInsight(null)`
    - `setIsEntitled(false)`
    - `setIsUnverifiedOffline(false)`
    - `setError(null)`
    - `activeInsightDateRef.current = null`
    - `latestRequestIdRef.current++` (invalidates prior in-flight requests)
    - `dailyRashiService.clearSessionCache()`
  - In `useCustomerSubscription`:
    - `setSubscription(null)`
    - `setError(null)`
    - `latestRequestIdRef.current++` (invalidates prior in-flight queries)
- **Late Response Guarding:**
  Every asynchronous result is checked against:
  ```ts
  isMountedRef.current &&
  latestRequestIdRef.current === requestId &&
  activeUserIdRef.current === requestUserId
  ```
  Any delayed response from User A that arrives after logout or after User B signs in is silently discarded.

---

## 6. Post-Checkout Entitlement Revalidation

- **Lifecycle Path:**
  1. User views locked daily horoscope on `AstrologyScreen` (`isEntitled: false`, `subscription: null`).
  2. User navigates to `AstrologyPlanDetailScreen` and then `AstrologyPaymentScreen`.
  3. Payment succeeds and is confirmed active by polling the PostgreSQL database.
  4. User navigates back to `AstrologyScreen`.
  5. `useFocusEffect` triggers `refreshSub()` and `refreshDailyInsight()`.
  6. Backend confirms active subscription; `subscription` updates in state.
  7. Backend RPC `get_daily_rashi_insight` re-evaluates entitlement against the active subscription, returning `is_entitled: true`.
  8. `DailyRashiInsightCard` immediately unlocks and renders full Vedic horoscope guidance.
- **Pending Activation Semantics:**
  If payment confirmation is still pending in the database when the user returns, `isEntitled` remains `false`. No premature client-side entitlement is fabricated.

---

## 7. Subscription-Boundary Handling

- **Timestamp Availability:**
  `AstrologySubscription` contains authoritative `starts_at` and `ends_at` ISO timestamps.
- **One-Shot Boundary Timer:**
  In `useCustomerSubscription`:
  - If `starts_at` is in the future: target boundary is `starts_at`.
  - If `ends_at` is in the future: target boundary is `ends_at`.
  - `delay = nextBoundaryMs - now + 250ms`.
  - A single one-shot timer is set for `delay` (capped at 24 hours to prevent Node/V8 timer overflow).
  - When the timer fires: `fetchSubscription({ force: true })` executes, fetching the updated state from Supabase.
  - If unmounting or subscription record changes, the timer is cleared immediately.
- **Zero Frequent Polling:**
  No polling loop runs while waiting for subscription boundaries.

---

## 8. Tests Added, Commands Run, and Actual Results

### Test Suite: `__tests__/daily_astrology_state_refresh_lifecycle.test.tsx`

| Test | Objective | Result |
| :--- | :--- | :--- |
| **Test A** | Indian midnight rollover: detects date rollover, clears yesterday's insight, requests new date | **PASS** (377 ms) |
| **Test B** | Device timezone independence: resolves correct Indian calendar date across global timezones and boundaries | **PASS** (3 ms) |
| **Test C** | Foreground after midnight: rechecks Indian date and reloads content | **PASS** (18 ms) |
| **Test D** | Foreground subscription refresh: re-executes query and reflects latest backend response | **PASS** (10 ms) |
| **Test E** | Return after checkout: revalidates subscription and reconciles daily insight entitlement upon confirmation | **PASS** (897 ms) |
| **Test F** | Login, logout, and account switch: immediately clears previous state and drops obsolete responses | **PASS** (9 ms) |
| **Test G** | Subscription boundary: fires bounded one-shot refresh at expiration without periodic polling | **PASS** (4 ms) |
| **Test H** | Focus and foreground deduplication: prevents burst of duplicate requests | **PASS** (4 ms) |
| **Test I** | Request failure during rollover: clears yesterday's content and avoids false expiration claim | **PASS** (14 ms) |
| **Test J** | AST-03 regression: confirms earlier Rashi cannot overwrite selected Rashi during refresh | **PASS** (17 ms) |

### Verification Commands & Results

1. **AST-04 Lifecycle Test Suite:**
   ```bash
   npm test -- __tests__/daily_astrology_state_refresh_lifecycle.test.tsx
   ```
   **Outcome:** `PASS` (10 passed, 10 total)

2. **AST-03 Stale Refresh Guard Suite:**
   ```bash
   npm test -- __tests__/daily_astrology_stale_refresh_guard.test.tsx
   ```
   **Outcome:** `PASS` (7 passed, 7 total)

3. **AST-02 Cache Security Suite:**
   ```bash
   npm test -- __tests__/daily_astrology_cache_security.test.tsx
   ```
   **Outcome:** `PASS` (12 passed, 12 total)

4. **AST-01 Admin RPC Hardening Suite:**
   ```bash
   npm test -- __tests__/daily_astrology_admin_rpc_hardening.test.ts
   ```
   **Outcome:** `PASS` (17 passed, 17 total)

5. **Daily Vedic Astrology Insights Suite:**
   ```bash
   npm test -- __tests__/daily_vedic_astrology_insights.test.tsx
   ```
   **Outcome:** `PASS` (20 passed, 20 total)

6. **M6 Astrology Content & Subscription Suite:**
   ```bash
   npm test -- __tests__/astrology.test.tsx
   ```
   **Outcome:** `PASS` (18 passed, 18 total)

7. **Authentication Test Suite:**
   ```bash
   npm test -- __tests__/auth.test.tsx
   ```
   **Outcome:** `PASS` (31 passed, 31 total)

8. **TypeScript Compiler Check:**
   ```bash
   npx tsc --noEmit
   ```
   **Outcome:** Exited with code `0` (Zero compiler errors).

---

## 9. Remaining Limitations and Unresolved Issues (AST-05 & AST-06)

1. **AST-05 (Editorial Empty States & Backend Error Handling):**
   - General backend editorial empty state messages, editorial fallback text for unpublished dates, and editorial error rendering belong to AST-05 and remain untouched.
2. **AST-06 (Subscription Selection & Eligibility Predicates):**
   - Current query in `astrologyService.getCustomerSubscription` sorts by `created_at DESC LIMIT 1`. If multiple subscriptions exist (e.g., historical expired and a newer payment_pending), selection predicates and plan channel matching belong strictly to AST-06 and were not modified.
3. **AST-07 (Payment Concurrency & Idempotency):**
   - Payment webhook processing, Razorpay signature Raw-body verification, and order concurrency belong to AST-07.

---

## 10. Confirmation of Scope Restrictions

- **AST-05 through AST-21 were NOT implemented in this phase.**
- **No changes to database schemas, SQL functions, or migrations were made.**
- **No remote functions or production database deployments were executed.**
- **AST-02 user-scoped cache security and AST-03 single guarded request protections remain 100% intact and passing.**
- **No high-frequency polling loops were introduced.**

---

## 11. Conclusion

AST-04 is fully resolved. The daily astrology screen and subscription summary reflect the current Indian date, user identity, checkout state, and backend entitlement dynamically and reliably without stale data, race conditions, or unnecessary backend load.
