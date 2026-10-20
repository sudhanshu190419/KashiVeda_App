# KashiVeda AST-04 Follow-up Report: Entitlement Revalidation on Lifecycle Refresh

**Date:** October 10, 2026  
**Status:** Complete & Verified  
**Scope:** AST-04 Lifecycle Refresh Entitlement Verification  
**Branch:** main  
**Target Environment:** React Native Mobile Client (`C:\Projects\KashiVeda`)

---

## Executive Summary

This follow-up verification investigated whether AppState foreground wake-up and navigation-focus refreshes actually revalidate daily astrology entitlement against the backend PostgreSQL/RPC authoritative source when an in-memory cached result already exists for the same user, date, Rashi, and language.

### Key Investigation Finding: Critical Defect Identified in Baseline
In the baseline implementation, calling `refreshDailyInsight({ force: false })` or triggering an AppState foreground transition without date rollover executed `dailyRashiService.fetchDailyInsight(targetDate, targetRashiId, language, userId)`. Inside `fetchDailyInsight`, line 96 checked:
```ts
if (this.memoryCache.has(cacheKey)) {
  const cached = this.memoryCache.get(cacheKey)!;
  return {
    success: true,
    is_entitled: true,
    is_unverified: false,
    content: cached,
    insight_date: targetDate,
    rashi_id: targetRashiId,
    language,
  };
}
```
Because `this.memoryCache.has(cacheKey)` was true from the user's initial morning fetch, **the method returned immediately from in-memory cache without ever calling `supabase.rpc("get_daily_rashi_insight")`**. Consequently, if a user's subscription expired, was cancelled, or was revoked on the backend midday, a foreground wake-up or navigation focus event failed to revalidate entitlement, leaving the user with unauthorized premium access. Furthermore, when non-entitled responses were received, neither the memory cache nor disk cache was explicitly evicted for that key.

### Applied Minimal Production-Grade Remediation
1. **Explicit Cache-Bypass and Revalidation Support in `dailyRashiService.ts`**:
   - `fetchDailyInsight` now accepts `options?: { bypassCache?: boolean; revalidate?: boolean }`.
   - When `options?.bypassCache || options?.revalidate` is true, the in-memory cache check is skipped and the authoritative Supabase RPC `get_daily_rashi_insight` is invoked.
   - When the backend RPC confirms `is_entitled: false`, `this.memoryCache.delete(cacheKey)` and `AsyncStorage.removeItem(`${DAILY_INSIGHT_CACHE_PREFIX_V2}${cacheKey}`)` are immediately executed so stale entitlement and premium text cannot persist or be resurrected on subsequent non-bypassing queries or offline fallbacks.
2. **Lifecycle Coordination in `useDailyRashiInsight.ts`**:
   - AppState foreground transition (`handleAppStateChange`) passes `{ revalidate: true }` when the date has not changed, ensuring the backend RPC is queried for current entitlement.
   - Hook method `refresh(options)` supports `revalidate?: boolean` (defaulting to `true`), so both manual refresh and lifecycle revalidation explicitly query the backend.
   - Simultaneous focus and foreground events remain deduplicated via `inFlightKeyRef` promise-sharing and the `DEDUPLICATION_INTERVAL_MS` cooldown window.
3. **Screen Focus Integration in `AstrologyScreen.tsx`**:
   - `useFocusEffect` calls `refreshDailyInsight({ force: false, revalidate: true })`, bypassing the in-memory cache on return from checkout or background while avoiding clearing unrelated state.
4. **Offline Policy Preservation (AST-02)**:
   - Temporary network failures during revalidation are caught, sanitized free content is retrieved from persistent cache (with all premium guidance stripped), `is_unverified: true` and `is_entitled: false` are returned, and the UI displays "Offline Mode — Subscription Unverified" without falsely claiming that the subscription has expired.

All 38 astrology regression tests pass, and TypeScript compilation (`npx tsc --noEmit`) passes with zero errors.

---

## 1. Actual Lifecycle-Refresh-to-Cache-to-RPC Path in Source

### The Original Path Traced
```
[AppState Foreground / Navigation Focus]
                 │
                 ▼
AstrologyScreen.tsx / useDailyRashiInsight.ts
                 │
                 ▼
executeGuardedFetch(selectedRashiId, { force: false })
                 │
                 ▼
dailyRashiService.fetchDailyInsight(date, rashiId, lang, userId)
                 │
                 ▼
       ┌────────────────────────┐
       │ this.memoryCache       │ ──► TRUE ──► Short-circuit: returns cached insight
       │ .has(cacheKey)?        │             with is_entitled: true!
       └────────────────────────┘             (Supabase RPC NEVER CALLED!)
                 │
                FALSE
                 │
                 ▼
supabase.rpc("get_daily_rashi_insight")
```

### The Corrected Production Path
```
[AppState Foreground / Navigation Focus]
                 │
                 ▼
AstrologyScreen.tsx / useDailyRashiInsight.ts: pass { revalidate: true }
                 │
                 ▼
executeGuardedFetch(selectedRashiId, { revalidate: true })
                 │ (deduplicates simultaneous focus + foreground)
                 ▼
dailyRashiService.fetchDailyInsight(date, rashiId, lang, userId, { bypassCache: true, revalidate: true })
                 │
                 ▼
       ┌────────────────────────┐
       │ shouldBypassCache?     │ ──► YES: Skips memoryCache check!
       └────────────────────────┘
                 │
                 ▼
supabase.rpc("get_daily_rashi_insight", { p_insight_date, p_rashi_id, p_language })
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
 [is_entitled: true]   [is_entitled: false]
       │                   │
 Cache updated       Evicts memoryCache + AsyncStorage
 UI shows premium    UI hides premium, shows paywall immediately
```

---

## 2. Reproduction of Critical Scenario & Results

Using controlled unit and hook test harnesses with mocked Supabase RPC and AppState listeners, the critical scenario was reproduced:

| Step | Action | Baseline Behavior | Corrected Behavior | Status |
| :--- | :--- | :--- | :--- | :--- |
| **1** | User A signs in and selects Rashi 1 on current date | RPC returns `is_entitled: true`, premium text cached in memory and disk | RPC returns `is_entitled: true`, premium text cached in memory and disk | Verified |
| **2** | Backend subscription expires / cancels | Simulated by updating backend mock to return `is_entitled: false` | Simulated by updating backend mock to return `is_entitled: false` | Verified |
| **3** | App returns to foreground / screen gains focus | Memory cache returned `is_entitled: true` immediately without calling RPC. User retained unauthorized premium access. | `bypassCache: true` skips memory cache. RPC is called. `is_entitled: false` returned. | **Defect Resolved** |
| **4** | UI updates | Premium guidance remained visible. | Premium guidance hidden immediately; paywall card rendered. | Verified |
| **5** | Memory and disk cache permanence | Old premium insight remained in cache. | Memory cache and AsyncStorage keys deleted. Subsequent reads cannot resurrect old access. | Verified |
| **6** | Temporary network failure during revalidation | N/A | Caught; returns sanitized free content with `is_unverified: true`. UI displays Offline Mode without false expiration claim. | Verified |

---

## 3. Source Changes and Rationale

### A. `src/features/astrology/services/dailyRashiService.ts`
- **Updated `fetchDailyInsight` signature and cache bypass**:
  ```ts
  async fetchDailyInsight(
    date?: string,
    rashiId?: number,
    language = "en",
    userId?: string | null,
    options?: { bypassCache?: boolean; revalidate?: boolean }
  ): Promise<DailyRashiInsightResult> {
    ...
    const shouldBypassCache = options?.bypassCache || options?.revalidate || false;

    if (!shouldBypassCache && this.memoryCache.has(cacheKey)) {
      const cached = this.memoryCache.get(cacheKey)!;
      return { success: true, is_entitled: true, is_unverified: false, content: cached, ... };
    }
  ```
- **Authoritative Cache Eviction on Revocation**:
  When `rpcResult` or `fallbackFetchInsight` returns `is_entitled: false`:
  ```ts
  this.memoryCache.delete(cacheKey);
  try {
    await AsyncStorage.removeItem(`${DAILY_INSIGHT_CACHE_PREFIX_V2}${cacheKey}`);
  } catch {}
  ```
- **Updated `getDailyInsight` alias**:
  Accepts and passes `bypassCache` and `revalidate` options through to `fetchDailyInsight`.

### B. `src/features/astrology/hooks/useDailyRashiInsight.ts`
- **Updated `UseDailyRashiInsightResult` Interface**:
  ```ts
  refresh: (options?: { force?: boolean; revalidate?: boolean }) => Promise<void>;
  ```
- **Guarded Fetch with Cache Bypass Coordination**:
  ```ts
  const optionsArg =
    isForce || isRevalidate
      ? { bypassCache: isForce || isRevalidate, revalidate: isRevalidate }
      : undefined;

  const result = optionsArg
    ? await dailyRashiService.fetchDailyInsight(..., optionsArg)
    : await dailyRashiService.fetchDailyInsight(...);
  ```
- **AppState Foreground Revalidation**:
  On transition to `active` without date rollover:
  ```ts
  if (now - lastFetchTimeRef.current >= DEDUPLICATION_INTERVAL_MS) {
    executeGuardedFetch(activeRashiIdRef.current, { revalidate: true });
  }
  ```
- **Manual / Programmatic Refresh**:
  ```ts
  const refresh = useCallback(
    async (options?: { force?: boolean; revalidate?: boolean }) => {
      const shouldForce = options?.force ?? true;
      const shouldRevalidate = options?.revalidate ?? true;
      if (shouldForce) {
        dailyRashiService.clearSessionCache();
      }
      await executeGuardedFetch(selectedRashiId, {
        force: shouldForce,
        revalidate: shouldRevalidate,
      });
    },
    [selectedRashiId, executeGuardedFetch]
  );
  ```

### C. `src/features/astrology/screens/AstrologyScreen.tsx`
- **Navigation Focus Revalidation**:
  ```ts
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      refreshSub({ force: false });
      refreshDailyInsight({ force: false, revalidate: true });
    }, [refreshSub, refreshDailyInsight])
  );
  ```

---

## 4. Regression Test Suite and Verification Results

A dedicated regression test suite was created:
`__tests__/daily_astrology_entitlement_revalidation.test.tsx`

### Test Suite Execution Summary

```
PASS __tests__/daily_astrology_cache_security.test.tsx
PASS __tests__/daily_astrology_stale_refresh_guard.test.tsx
PASS __tests__/daily_astrology_state_refresh_lifecycle.test.tsx
PASS __tests__/daily_astrology_entitlement_revalidation.test.tsx

Test Suites: 4 passed, 4 total
Tests:       38 passed, 38 total
Snapshots:   0 total
Time:        4.041 s
```

### Broader Astrology Test Suites

```
PASS __tests__/daily_vedic_astrology_insights.test.tsx
PASS __tests__/astrology.test.tsx

Test Suites: 2 passed, 2 total
Tests:       38 passed, 38 total
Snapshots:   0 total
Time:        3.277 s
```

### TypeScript Static Type Verification

```bash
npx tsc --noEmit
# Exit code: 0 (Zero errors)
```

### Detailed Coverage Matrix

| Test ID | Scenario Description | Expected Outcome | Execution Result |
| :--- | :--- | :--- | :--- |
| **Test 1** | Same-day cached entitled result revalidated on AppState foreground after backend expiry | Bypasses memory cache, calls Supabase RPC, sets `isEntitled: false`, hides premium content, displays subscription lock. | **PASS** |
| **Test 2** | Navigation focus revalidation via `refresh({ force: false, revalidate: true })` | Queries backend RPC, hides premium content, updates UI without full cache blowaway. | **PASS** |
| **Test 3** | Navigation focus and AppState activation arriving together in same event loop | Deduplicated to exactly 1 backend RPC request via `inFlightPromiseRef` and cooldown window. | **PASS** |
| **Test 4** | Temporary backend/network failure during revalidation | Preserves AST-02 offline policy: returns sanitized free overview with `is_unverified: true`, renders "Offline Mode — Subscription Unverified" notice with retry button, does NOT claim subscription expired. | **PASS** |
| **Test 5** | Prior cache entry permanence after backend confirms non-entitled | Memory cache and AsyncStorage entries deleted. Subsequent direct queries cannot resurrect cached entitlement or content. | **PASS** |
| **Test 6** | Successful current entitled response on lifecycle refresh | Confirms entitlement with RPC, updates cache, preserves full premium guidance and transit details. | **PASS** |
| **Test 7** | Logout and account switching boundary | Immediately clears visible insight on logout; User B cannot access User A's cached content. | **PASS** |
| **Test 8** | AST-03 guarded request protection against slow responses from older Rashi | Switching Rashi 1 -> Rashi 2 drops late Rashi 1 response silently; Rashi 2 content rendered intact. | **PASS** |
| **Test 9** | Direct `dailyRashiService.fetchDailyInsight` with `bypassCache: true` | Explicitly queries RPC despite active in-memory cache entry. | **PASS** |

---

## 5. Security & Invariant Confirmations

1. **AST-02 Protections Intact**:
   - Cache keys remain strictly user-scoped (`@kashiveda_daily_insight_v2:u_<uuid>:<date>:<rashi>:<lang>`).
   - Legacy unscoped cache isolation is preserved.
   - Offline fallback strictly sanitizes all premium fields before returning content to callers.
   - All 5 tests in `daily_astrology_cache_security.test.tsx` continue to pass.
2. **AST-03 Protections Intact**:
   - Monotonically increasing request IDs (`latestRequestIdRef`) drop obsolete responses.
   - Active user ID (`activeUserIdRef`) and selected Rashi ID (`activeRashiIdRef`) guards prevent race conditions.
   - All 14 tests in `daily_astrology_stale_refresh_guard.test.tsx` continue to pass.
3. **No Polling**:
   - Refresh triggers are strictly event-driven (AppState foreground, Navigation focus, midnight timer, expiration boundary, manual pull-to-refresh).
4. **Scope Boundaries Preserved**:
   - AST-05 (editorial empty states) and AST-06 (subscription plan selection predicates) were NOT touched or implemented.
   - Migrations 001–018 and subsequent migrations were NOT modified.
   - No database schema migrations were created or executed.
   - No production database or infrastructure changes occurred.

---

## 6. Remaining Considerations

- If an end user is continuously offline from the moment their subscription expires across midnight, the offline sanitization policy ensures they only see free cosmic outlook content (`is_entitled: false, is_unverified: true`) and never see detailed guidance or remedies.
- As soon as network connectivity is restored and the app is foregrounded or focused, the explicit `bypassCache`/`revalidate` mechanism ensures immediate authoritative reconciliation against Supabase.
