# KashiVeda AST-02 Implementation Report: Secure Daily Astrology Cache and Subscription Entitlement

**Remediation Date:** 2026-10-10  
**Feature Area:** Mobile Vedic Daily Astrology Insights (`useDailyRashiInsight.ts`, `dailyRashiService.ts`, `DailyRashiInsightCard.tsx`)  
**Scope:** AST-02 only (AST-03 through AST-21 strictly excluded)  
**Database Modification:** None (No migrations deployed, zero production database changes)  

---

## 1. Root Cause Confirmed from Actual Source

Inspection of `src/features/astrology/services/dailyRashiService.ts` and `src/features/astrology/hooks/useDailyRashiInsight.ts` confirmed the following root vulnerabilities:

1. **Globally Scoped Cache Keys:**
   - In `dailyRashiService.ts`, cache keys were formatted as `${date}:${rashiId}:${language}` under the global prefix `@kashiveda_daily_insight_`.
   - The key contained **no user identifier**.
   - If User A (an active subscriber) fetched daily guidance for Aries, the full record containing confidential premium sections (`career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`) was stored in device memory and `AsyncStorage`.
   - When User B logged in on the same device (or when User A logged out), the cache check `this.memoryCache.has(cacheKey)` succeeded and returned User A's premium content immediately.

2. **Cached Authorization Bypassing Backend Validation:**
   - On cache hit, `fetchDailyInsight` returned:
     ```ts
     return { success: true, is_entitled: true, content: cached, ... };
     ```
   - On network error or offline fallback, `getOfflineCachedInsight` returned the raw cached object and set `is_entitled: true`.
   - This fabricated authorization (`is_entitled: true`) without verifying current subscription entitlement with the backend.

3. **Indefinite Storage of Unsanitized Premium Text:**
   - AsyncStorage entries lacked TTL, versioning, or sanitization.
   - An expired subscriber or unentitled user entering offline mode could view full premium astrological guidance indefinitely.

4. **Lifecycle and Concurrency Vulnerabilities:**
   - In `useDailyRashiInsight.ts`, `isEntitled` defaulted to `true`.
   - The hook did not react to logout or account changes; when `user?.id` transitioned or became `null`, the previously loaded insight remained mounted on screen.
   - In-flight requests initiated under User A could resolve after User B signed in, populating React state with User A's data.

---

## 2. Exact Files Changed and Why

| File | Nature of Change | Rationale |
|---|---|---|
| [`src/features/astrology/types/rashi.types.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/types/rashi.types.ts#L215-L225) | Interface update | Added `is_unverified?: boolean` to [`DailyRashiInsightResult`](file:///C:/Projects/KashiVeda/src/features/astrology/types/rashi.types.ts#L215-L225) to differentiate unverified offline states from confirmed non-entitled subscriptions. |
| [`src/features/astrology/services/dailyRashiService.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L10-L220) | Security hardening | Introduced user-scoped cache namespace (`@kashiveda_daily_insight_v2:u_<userId>:...`), legacy cache cleanup mechanism, offline sanitization helper ([`sanitizeFreeContent`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L25-L35)), session cache clearance, and strict offline entitlement policy. |
| [`src/features/astrology/hooks/useDailyRashiInsight.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts#L20-L150) | Lifecycle & race condition guard | Defaulted `isEntitled` to `false`, added `activeUserIdRef` and `latestRequestIdRef` to drop stale in-flight responses across session transitions, and immediately wiped visible state on logout/user switch. |
| [`src/features/astrology/components/DailyRashiInsightCard.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx#L15-L250) | Presentation enforcement | Gated premium sections (Career, Finance, Love, Health) behind explicit `isEntitled &&`, supported free cosmic outlook during offline/preview states, and provided clear offline unverified messaging distinct from subscription expiration paywalls. |
| [`src/features/astrology/screens/AstrologyScreen.tsx`](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologyScreen.tsx#L55-L175) | Integration | Propagated `isUnverifiedOffline` from [`useDailyRashiInsight`](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts#L25) to [`DailyRashiInsightCard`](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx#L24). |
| [`__tests__/daily_astrology_cache_security.test.tsx`](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_cache_security.test.tsx) | New regression test suite | Comprehensive automated suite covering all 12 required AST-02 security scenarios. |

---

## 3. Cache-Key Design and Treatment of Legacy Cache Entries

### 3.1 Secure V2 Cache Identity
The cache namespace is now strictly scoped to the authenticated caller identity:

```text
@kashiveda_daily_insight_v2:${userScope}:${date}:${rashiId}:${language}
```

Where:
- **`userScope`**: `u_${userId}` for authenticated accounts; `"anon"` for unauthenticated public sessions.
- **`date`**: Indian Standard Time calendar date (`YYYY-MM-DD`).
- **`rashiId`**: Canonical integer (1 to 12).
- **`language`**: ISO-639-1 language code (`"en"` or `"hi"`).

Because `userScope` prefixes every entry, User A (`u_abc...`) and User B (`u_xyz...`) cannot collide, access, or read each other's cached insights under any circumstance.

### 3.2 Legacy Cache Isolation and Cleanup
- Legacy cache keys used the prefix `@kashiveda_daily_insight_` without user scoping.
- **Isolation:** [`dailyRashiService.getOfflineCachedInsight`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L320) exclusively queries keys matching the `@kashiveda_daily_insight_v2:` prefix. Legacy un-scoped keys are completely ignored and cannot be read.
- **No Migration:** Legacy entries are **never** migrated into a user's secure v2 cache.
- **Automatic Cleanup:** [`cleanupLegacyCache()`](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L40) scans `AsyncStorage.getAllKeys()` for keys starting with `@kashiveda_daily_insight_` that do not start with `@kashiveda_daily_insight_v2:` and purges them asynchronously.

---

## 4. Offline Entitlement Policy and User-Facing Behavior

### 4.1 Authoritative Offline Entitlement Policy
**Cached premium content must never be displayed solely because a previous response or cached object says `is_entitled: true`.**

The policy enforces the following rules:
1. **Live Backend Source of Truth:** A successful, current backend response (`get_daily_rashi_insight` RPC) is the sole authority for viewing premium content.
2. **Preserve Free Experience Offline:** Cached data preserves the free daily astrology experience (General Cosmic Outlook, Auspicious Color, Lucky Number, and Rashi attributes) while offline.
3. **Hidden Premium Content:** When offline or when the current entitlement cannot be verified, all premium fields (`career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`) are stripped to `null` before reaching the UI.
4. **Accurate Offline Messaging:** When verification fails due to connectivity, the app does **not** falsely claim that the user's subscription has expired. Instead, it informs the devotee that subscription status cannot currently be verified offline.
5. **No Offline Re-Entitlement:** An entitled user who opens the app offline cannot unlock premium guidance until a live network check succeeds.

### 4.2 Content Classification

| Field | Tier | Behavior When Entitlement Unverified / Offline |
|---|---|---|
| `general_outlook` | **Free** | Displayed (allows devotees to read daily cosmic climate) |
| `auspicious_color` | **Free** | Displayed (e.g., Saffron, White) |
| `auspicious_number` | **Free** | Displayed (e.g., 7, 9) |
| `rashi` (Name, Symbol, Ruler, Element) | **Free** | Displayed |
| `career_business` | **Premium** | **Hidden** (`null`) |
| `finance_wealth` | **Premium** | **Hidden** (`null`) |
| `love_relationships` | **Premium** | **Hidden** (`null`) |
| `health_wellbeing` | **Premium** | **Hidden** (`null`) |

---

## 5. Logout, Account Switching, and In-Flight Request Handling

### 5.1 Immediate State Clearing
In [`useDailyRashiInsight.ts`](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts#L35):
- A session-boundary effect tracks `activeUserIdRef.current`.
- When `user?.id` changes (user logs out or switches to another account):
  - `setInsight(null)` clears visible insight data immediately.
  - `setIsEntitled(false)` revokes premium display permissions immediately.
  - `setIsUnverifiedOffline(false)` and `setError(null)` reset status indicators.
  - `dailyRashiService.clearSessionCache()` purges the in-memory cache.

### 5.2 In-Flight Race Condition Protection
- Every request increments `latestRequestIdRef.current`.
- The request closure captures `requestUserId = user?.id || null` and `requestId`.
- When the asynchronous call completes (whether network RPC or AsyncStorage read), the hook verifies:
  ```ts
  if (
    isMounted &&
    latestRequestIdRef.current === requestId &&
    activeUserIdRef.current === currentUserId
  ) {
    // Commit to React state
  }
  ```
- If User A initiates a load and logs out or switches to User B before it finishes, `latestRequestIdRef.current !== requestId` and `activeUserIdRef.current !== currentUserId` evaluate to false; the response is dropped silently without touching User B's UI.

---

## 6. Protection of Each Premium-Content Display Path

| Display Path | Protection Mechanism |
|---|---|
| **Initial Load** | `isEntitled` state defaults to `false`. Loading skeleton displays; no premium data exposed. |
| **Memory Cache Hit** | Cache keys are scoped to `u_${userId}`. Hits only occur within the active verified session for that exact user. Cleared on logout. |
| **Successful Network Response** | RPC validates subscription server-side. If `is_entitled: true`, content renders; if `is_entitled: false`, content is `null`. |
| **Failed Network Request** | Enters offline fallback. Sanitizes content: premium fields are set to `null`, `is_entitled` is set to `false`, and `is_unverified` is set to `true`. |
| **Offline Fallback** | `getOfflineCachedInsight` only reads `u_${userId}` v2 keys. Strips all 4 premium guidance fields via `sanitizeFreeContent()`. |
| **Logout** | State immediately cleared to `null`. Memory cache purged. UI resets to unauthenticated state. |
| **Account Switch** | State immediately wiped. Requests from prior user discarded. Isolated storage read by new user ID. |
| **Expired Subscription** | Backend RPC returns `is_entitled: false, content: null`. Paywall renders; old cached text is never merged back. |
| **Legacy Global Cache on Device** | Un-scoped keys are bypassed by v2 reader and cleaned up asynchronously via `cleanupLegacyCache()`. |
| **JSX Rendering Boundary** | In `DailyRashiInsightCard`, Sections 2–5 are guarded by `{isEntitled && insight.field ? ... : null}`. Even if an unentitled object contained text, it cannot render. |

---

## 7. Tests Added, Commands Executed, and Actual Results

### 7.1 Regression Test Suite: `__tests__/daily_astrology_cache_security.test.tsx`
Covering all 12 specified scenarios:

1. **Scenario 1 — Cross-account isolation:** User A's cached premium insight is never displayed or returned to User B.
2. **Scenario 2 — Logout:** Premium content disappears immediately when the current user logs out.
3. **Scenario 3 — Account switch:** Pending request from User A cannot restore User A's content after User B signs in.
4. **Scenario 4 — Cached entitlement cannot authorize:** A cached response containing `is_entitled: true` does not independently permit premium rendering.
5. **Scenario 5 — Confirmed entitlement:** Current successful backend response confirming entitlement displays all premium fields.
6. **Scenario 6 — Confirmed no entitlement:** Non-entitled backend response keeps premium sections locked even when old cached text exists.
7. **Scenario 7 — Offline fallback:** Free overview is displayed while premium guidance fields remain hidden.
8. **Scenario 8 — Offline messaging:** Devotee is not falsely told their subscription expired merely because offline verification failed.
9. **Scenario 9 — Legacy cache isolation:** Old globally shared cache entries cannot be restored as premium content and are deleted.
10. **Scenario 10 — Cache identity:** Different users, dates, Rashi IDs, and languages produce distinct cache keys without collision.
11. **Scenario 11 — Session transition:** Stale in-flight results from prior sessions are dropped upon identity transition.
12. **Scenario 12 — No regression:** Free content, entitled customers, and multilingual content (Hindi/English) operate as expected.

### 7.2 Exact Commands and Execution Results

#### 1. AST-02 Security Test Suite
```bash
npm test -- __tests__/daily_astrology_cache_security.test.tsx
```
**Result:**
```text
PASS __tests__/daily_astrology_cache_security.test.tsx
  AST-02: Secure Daily Astrology Cache and Subscription Entitlement
    √ 1. Cross-account isolation: User A's cached premium insight is never displayed or returned to User B (22 ms)
    √ 2. Logout: Premium content disappears immediately when the current user logs out (91 ms)
    √ 3. Account switch: A pending cache read or request from User A cannot restore User A's content after User B signs in (9 ms)
    √ 4. Cached entitlement cannot authorize: A cached response containing is_entitled: true does not independently permit premium rendering (4 ms)
    √ 5. Confirmed entitlement: A successful current backend response confirming entitlement permits expected premium fields to display (357 ms)
    √ 6. Confirmed no entitlement: A non-entitled backend response keeps premium sections locked even when old cached premium text exists (9 ms)
    √ 7. Offline fallback: Free content is displayed while premium content remains hidden if entitlement cannot be verified (15 ms)
    √ 8. Offline messaging: The user is not falsely told their subscription has expired merely because verification failed (25 ms)
    √ 9. Legacy cache isolation: An old globally shared cache entry cannot be restored as premium content (2 ms)
    √ 10. Cache identity: Different users, dates, Rashi IDs, and languages cannot unintentionally collide (5 ms)
    √ 11. Session transition: A result started under an earlier user identity is ignored after the identity changes (7 ms)
    √ 12. No regression: Existing expected behavior for free content, authenticated entitled users, and supported languages remains intact

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        2.89 s
```

#### 2. Full Astrology Suite
```bash
npm test -- __tests__/daily_astrology_cache_security.test.tsx __tests__/daily_vedic_astrology_insights.test.tsx __tests__/daily_astrology_admin_rpc_hardening.test.ts __tests__/astrology.test.tsx __tests__/astrology_admin_operations.test.ts __tests__/astrology_delivery_lifecycle.test.ts __tests__/astrology_payment_backend.test.ts
```
**Result:**
```text
Test Suites: 7 passed, 7 total
Tests:       115 passed, 115 total
Snapshots:   0 total
Time:        5.067 s
```

#### 3. Authentication Suite
```bash
npm test -- __tests__/auth.test.tsx
```
**Result:**
```text
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total
Snapshots:   0 total
Time:        8.211 s
```

#### 4. TypeScript Compiler Verification
```bash
npx tsc --noEmit
```
**Result:**
```text
The command exited with code 0 (Zero compiler or type errors across the entire repository).
```

---

## 8. Remaining Limitations and Follow-Up Issues

1. **Client-Side Sanitization Boundary:** Client-side cache sanitization prevents local disclosure of stored premium data. The backend database RPC (`get_daily_rashi_insight`) remains the authoritative server-side security boundary.
2. **Upcoming AST Remediation Phases:**
   - AST-03 (Customer WhatsApp delivery preferences).
   - AST-04 (Subscription checkout and Razorpay idempotency).
   These are explicitly scheduled for subsequent phases and were not modified here.

---

## 9. Confirmation of Scope Restrictions

- **AST-03 through AST-21:** None of these findings were included, modified, or altered.
- **Payment & Checkout:** Zero changes were made to Razorpay integrations, subscription order creation, or payment processing logic.
- **Production Database & Migrations:**
  - Migrations `001` through `046` remain completely untouched.
  - Migration `047` was neither modified nor deployed to any production or remote database.
  - Zero database mutations, DDL executions, or remote schema changes were performed.

---

## 10. Summary of Changes

1. **Scoped Cache:** Migrated daily insight caching from globally shared keys to authenticated user namespaces under `@kashiveda_daily_insight_v2:u_<userId>:...`.
2. **Offline Policy Enforced:** Disallowed cached grants (`is_entitled: true`). On offline fallback, sanitized premium sections (`career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`) to `null` while preserving the free daily cosmic overview.
3. **Session Lifecycle Protection:** Implemented immediate state wipes on logout and account switching, along with request ID and user ID tracking to discard stale asynchronous responses.
4. **Verified Display Boundaries:** Hardened `DailyRashiInsightCard` with explicit entitlement guards, preventing premium guidance from rendering unless confirmed by the backend, and distinguishing offline unverified status from expired subscriptions.
5. **Full Test Coverage:** 12 automated regression tests added and passing; 115 broader astrology tests passing; 0 TypeScript compiler errors.
