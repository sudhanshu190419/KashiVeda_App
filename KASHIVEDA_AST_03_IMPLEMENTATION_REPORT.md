# KashiVeda AST-03 Implementation Report: Prevent Stale Manual Refresh Results

**Remediation Date:** 2026-10-10  
**Feature Area:** Mobile Vedic Daily Astrology Insights (`useDailyRashiInsight.ts`)  
**Scope:** AST-03 only (AST-04 through AST-21 strictly excluded)  
**Database Modification:** None (No migrations deployed, zero production database changes)  

---

## 1. Original AST-03 Defect and Reproduced Trigger

### 1.1 Defect Description
In the mobile daily astrology feature, a user selecting a zodiac sign (Rashi) can manually trigger a content refresh (`refresh()`). If the manual refresh for Rashi A (e.g., Mesha / Aries) encounters asynchronous network latency, and the user subsequently switches to Rashi B (e.g., Vrishabha / Taurus), the earlier Aries request could finish *after* Taurus had already loaded and overwrite Taurus's guidance with Aries's content underneath the Taurus heading.

### 1.2 Reproduced Trigger
1. Devotee opens the Daily Horoscope screen with **Aries (Mesha)** selected.
2. Devotee taps refresh, initiating a network call for Rashi ID `1`.
3. Before the Aries response returns, the devotee taps **Taurus (Vrishabha)** (Rashi ID `2`) on the 12-Rashi selector strip.
4. Taurus loads quickly (or completes first).
5. The delayed Aries request completes afterward and commits to React state.
6. **Vulnerability Result:** The card displays Taurus's title ("Vrishabha") while the content body displays Aries's predictions and planetary transits.

---

## 2. Assessment of AST-02 Contributions and Remaining Gaps

### 2.1 What AST-02 Resolved
AST-02 introduced:
- `latestRequestIdRef` to track sequential request generations.
- `activeUserIdRef` to prevent cross-account data leaks across logout and account switching.
- Scoped cache keys (`@kashiveda_daily_insight_v2:u_<userId>:...`).

### 2.2 What Remained Vulnerable (AST-03 Specific Gaps)
Despite AST-02, three distinct race-condition vulnerabilities remained in `useDailyRashiInsight.ts`:
1. **Asynchronous Invalidation Gap in `selectRashi`:**
   - In `selectRashi`, `setSelectedRashiId(newRashiId)` queued a state update, but `latestRequestIdRef.current` was only incremented inside the subsequent `useEffect`.
   - If an in-flight manual refresh for Rashi A resolved before React flushed the next effect, `latestRequestIdRef.current === requestId` was still `true`, allowing Rashi A's response to commit under Rashi B.
2. **Missing Selected-Rashi Identity Binding:**
   - The validation check verified `latestRequestIdRef.current === requestId && activeUserIdRef.current === currentUserId`, but did **not** verify whether the returned response matched the currently selected Rashi ID (`activeRashiIdRef.current === targetRashiId`).
3. **Dual Disconnected Request Paths:**
   - Automatic loading (`executeLoad` in `useEffect`) and manual refresh (`loadInsight` in `useCallback`) maintained separate, duplicated implementations with differing lifecycle checks (`isMounted` was checked in `useEffect` but missing in `loadInsight`).
   - If a devotee triggered a manual refresh and navigated away or unmounted the screen, `loadInsight` could attempt state updates on unmounted components.

---

## 3. Exact Files Changed and Reasoning

| File | Nature of Change | Reasoning |
|---|---|---|
| [`src/features/astrology/hooks/useDailyRashiInsight.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts) | Hook consolidation & context binding | 1. Unified automatic loading and manual refresh into a single guarded fetch function ([`executeGuardedFetch`](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts#L58-L109)).<br>2. Bound each request to its complete context: `requestId`, `requestUserId`, `targetRashiId`, and `isMountedRef`.<br>3. Enforced synchronous invalidation in `selectRashi` (`latestRequestIdRef.current++` and `activeRashiIdRef.current = newRashiId`).<br>4. Added component lifecycle unmount protection (`isMountedRef.current = false`). |
| [`__tests__/daily_astrology_stale_refresh_guard.test.tsx`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_stale_refresh_guard.test.tsx) | New regression test suite | Comprehensive automated suite validating all 7 AST-03 race-condition and lifecycle scenarios (Tests A through G). |

---

## 4. How Automatic Loading and Manual Refresh Share Request Validation

Rather than maintaining separate request loops, both automatic loading and manual refresh now call the single shared function:

```ts
const executeGuardedFetch = useCallback(
  async (targetRashiId: number) => {
    const requestId = ++latestRequestIdRef.current;
    const requestUserId = user?.id || null;
    const requestDate = getIndianCalendarDate();
    const requestLanguage = "en";

    setLoading(true);
    setError(null);

    const isValidContext = () => {
      return (
        isMountedRef.current &&
        latestRequestIdRef.current === requestId &&
        activeUserIdRef.current === requestUserId &&
        activeRashiIdRef.current === targetRashiId
      );
    };

    try {
      const result = await dailyRashiService.fetchDailyInsight(
        requestDate,
        targetRashiId,
        requestLanguage,
        requestUserId
      );

      if (!isValidContext()) {
        return; // Obsolete request or context changed; drop silently
      }

      setIsEntitled(result.is_entitled);
      setIsUnverifiedOffline(!!result.is_unverified);
      setInsight(result.content);

      if (!result.is_entitled && result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      if (!isValidContext()) {
        return; // Obsolete request or context changed; drop silently
      }

      setError(err?.message || "Failed to load daily astrological insight.");
      setIsEntitled(false);
      setIsUnverifiedOffline(true);
    } finally {
      if (isValidContext()) {
        setLoading(false);
      }
    }
  },
  [user?.id]
);
```

### Context Validation Rules:
1. **`isMountedRef.current`:** Drops updates if the component unmounted.
2. **`latestRequestIdRef.current === requestId`:** Drops updates if a newer request (automatic or manual) was initiated.
3. **`activeUserIdRef.current === requestUserId`:** Drops updates if the authenticated devotee logged out or switched accounts.
4. **`activeRashiIdRef.current === targetRashiId`:** Drops updates if the selected Rashi changed before the response arrived.

### Synchronous Invalidation Points:
- **Rashi Switch:** `selectRashi` immediately increments `latestRequestIdRef.current` and sets `activeRashiIdRef.current = newRashiId` synchronously before any asynchronous operations.
- **Logout / Account Switch:** Immediately increments `latestRequestIdRef.current`, sets `activeUserIdRef.current = currentUserId`, and clears visible state.
- **Unmount:** Immediately sets `isMountedRef.current = false` and increments `latestRequestIdRef.current`.

---

## 5. Regression Tests Added and Actual Results

### 5.1 Test Suite: `__tests__/daily_astrology_stale_refresh_guard.test.tsx`

| Test | Scenario Tested | Result |
|---|---|---|
| **Test A** | **Older manual refresh completes last:** Aries refresh started, Taurus selected and finished first, Aries resolves afterward. Verified Taurus content and heading remain intact; Aries content is dropped. | **PASS** |
| **Test B** | **Reverse completion order:** Aries refresh started, Taurus selected, Aries resolves *before* Taurus completes. Verified Aries is discarded and cannot overwrite Taurus. | **PASS** |
| **Test C** | **Obsolete request fails:** Aries refresh rejects with error after Taurus loads successfully. Verified obsolete error does not replace Taurus result or corrupt error/loading state. | **PASS** |
| **Test D** | **Unmount protection:** Aries refresh started, component unmounted, request resolves afterward. Verified no unmounted state warnings and clean remount of subsequent Rashi. | **PASS** |
| **Test E** | **Repeated refreshes for same Rashi:** Two refreshes started for Aries, older refresh #1 resolves after newer refresh #2. Verified latest request snapshot is preserved. | **PASS** |
| **Test F** | **Authentication transition regression:** User A starts refresh, logs out while pending, User A response resolves. Verified User A content is dropped and state remains unauthenticated. | **PASS** |
| **Test G** | **Current request errors:** Current valid request fails. Verified error is surfaced properly and not mistakenly suppressed by the guard. | **PASS** |

### 5.2 Execution Command and Output
```bash
npm test -- __tests__/daily_astrology_stale_refresh_guard.test.tsx
```
```text
PASS __tests__/daily_astrology_stale_refresh_guard.test.tsx
  AST-03: Prevent Stale Manual Refresh Results
    √ Test A: Older manual refresh for Aries completing after Taurus selection cannot overwrite Taurus content (506 ms)
    √ Test B: Reverse completion order: Older Aries request completing before Taurus finishes is discarded and cannot overwrite Taurus (35 ms)
    √ Test C: Obsolete request rejection does not overwrite current result, error state, or loading state (37 ms)
    √ Test D: Unmount protection prevents obsolete pending requests from updating unmounted state or leaking into remounts (24 ms)
    √ Test E: Repeated refreshes for the same Rashi strictly preserve the latest request result when older completes last (36 ms)
    √ Test F: Results from a previous user cannot be committed after logout or account switching (13 ms)
    √ Test G: Legitimate errors from the current valid request are surfaced and not suppressed (32 ms)

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Snapshots:   0 total
Time:        2.618 s
```

---

## 6. Confirmation that AST-02 Protections Remain Intact

The complete set of AST-02 and Daily Astrology test suites was executed concurrently:

```bash
npm test -- __tests__/daily_astrology_cache_security.test.tsx __tests__/daily_astrology_stale_refresh_guard.test.tsx __tests__/daily_vedic_astrology_insights.test.tsx
```
```text
PASS __tests__/daily_astrology_cache_security.test.tsx
PASS __tests__/daily_astrology_stale_refresh_guard.test.tsx
PASS __tests__/daily_vedic_astrology_insights.test.tsx

Test Suites: 3 passed, 3 total
Tests:       39 passed, 39 total (0 failed)
```

Broader astrology test suite across the repository:
```bash
npm test -- __tests__/daily_astrology_cache_security.test.tsx __tests__/daily_astrology_stale_refresh_guard.test.tsx __tests__/daily_vedic_astrology_insights.test.tsx __tests__/daily_astrology_admin_rpc_hardening.test.ts __tests__/astrology.test.tsx __tests__/astrology_admin_operations.test.ts __tests__/astrology_delivery_lifecycle.test.ts __tests__/astrology_payment_backend.test.ts
```
```text
Test Suites: 8 passed, 8 total
Tests:       122 passed, 122 total (0 failed)
Time:        5.797 s
```

TypeScript compiler check:
```bash
npx tsc --noEmit
```
```text
Exit code 0 (Zero compiler errors across the entire codebase).
```

---

## 7. Remaining Limitations

1. **Client-Side Concurrency Scope:** AST-03 guarantees that obsolete responses are never presented to the devotee on screen. Network requests that have already been sent to Supabase over the wire still complete in the background and terminate without committing state.

---

## 8. Confirmation of Scope Restrictions

- **AST-04 through AST-21:** None of these findings were included, modified, or altered.
- **Payment & Checkout:** Zero changes to Razorpay order creation, payment confirmation, or subscription purchase logic.
- **Midnight / Foreground Refresh:** No unrelated refresh mechanisms or automatic timers were introduced.
- **Database & Migrations:**
  - Migrations `001` through `046` remain untouched.
  - Migration `047` was not modified or deployed.
  - Zero database DDL or DML statements were executed on production.

---

## 9. Conclusion

AST-03 is **fully resolved**. Automatic loading and manual refresh share a single guarded execution path. Every asynchronous operation is strictly bound to its request generation, authenticated user identity, selected Rashi ID, and component mount lifecycle. Obsolete responses can no longer contaminate the selected Rashi's heading or content.
