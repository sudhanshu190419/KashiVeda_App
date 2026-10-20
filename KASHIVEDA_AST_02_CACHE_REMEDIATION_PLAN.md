# KASHIVEDA — FEATURE 02 REMEDIATION PLAN: AST-02 & AST-04

**Target Findings:**  
* **AST-02 (High):** Daily Astrology cache can bypass current entitlement checks and cross account boundaries.  
* **AST-04 (Medium):** Mounted Daily Astrology and subscription state does not reliably follow date, authentication, and entitlement changes.  

**Target Domain:** Mobile Daily Vedic Astrological Insights, Subscription Entitlement Lifecycle, and Client Cache  
**Target Repository:** `C:\Projects\KashiVeda` (React Native Mobile Application)  
**Security Classification:** Architectural & Security Remediation Plan (PLANNING ONLY)  
**Date:** 2026-10-12  

---

## 1. Executive Summary & Problem Scope

### 1.1 Context
In the KashiVeda Feature 02 (Daily Astrology and Subscriptions) architecture, daily Rashi horoscopes contain two distinct tiers of content:
1. **Free / Public Guidance:** General cosmic outlook (`general_outlook`), auspicious color (`auspicious_color`), and lucky number (`auspicious_number`).
2. **Paid Premium Guidance:** Detailed domains covering career and business (`career_business`), wealth and finance (`finance_wealth`), love and relationships (`love_relationships`), and health and vitality (`health_wellbeing`).

Access to the premium guidance is strictly conditioned upon an active customer subscription in PostgreSQL meeting authoritative SQL predicates:
```sql
status = 'active' AND starts_at <= now() AND ends_at > now() AND plan.daily_in_app_enabled = true
```

### 1.2 Core Vulnerabilities (AST-02 & AST-04)
1. **AST-02 (Entitlement Bypass via Cache):**  
   The client-side caching layer in `dailyRashiService.ts` historically stored raw content without separating content validity from subscription entitlement. When an in-memory cache hit occurs, the service currently returns:
   ```typescript
   return {
     success: true,
     is_entitled: true, // Manufactured entitlement!
     is_unverified: false,
     content: cached,
     ...
   };
   ```
   If a user had an active subscription at 11:59 AM and loaded their horoscope, their subscription expiring at 12:00 PM (or being cancelled by Super Admin) will **not** prevent the in-memory cache from continuing to serve full premium content and manufacturing `is_entitled: true` for the rest of the application session without contacting the authoritative backend. Furthermore, persistent storage entries in `AsyncStorage` previously lacked user scoping, allowing cached premium horoscopes to leak across accounts sharing the same physical device.

2. **AST-04 (Stale Mounted State & Desynchronized Hooks):**  
   `AstrologyScreen.tsx` mounts two completely separate hooks that manage interdependent state without synchronization:
   * `useDailyRashiInsight`: Manages the selected Rashi, daily horoscope fetch, and visible card state.
   * `useCustomerSubscription`: Manages the customer's subscription intervals, active status, and expiry timers.
   
   When `useCustomerSubscription`'s boundary timer fires at the exact moment a subscription expires (`ends_at <= now()`), it updates its own `isActive: false`. However, it has no mechanism to notify `useDailyRashiInsight` or invalidate `dailyRashiService`'s memory cache. As a result, the visible horoscope card remains unlocked and entitled until the user manually triggers a hard pull-to-refresh or switches accounts. Similarly, Indian calendar date rollover (midnight in `Asia/Kolkata`) and checkout payment completion were historically handled through ad-hoc, asynchronous effects that could desynchronize visible UI state.

---

## 2. Current Implementation Inspection & Root Cause Analysis

### 2.1 Files Inspected
The following active source files in `C:\Projects\KashiVeda` were inspected line-by-line:
* `src/features/astrology/services/dailyRashiService.ts` (919 lines)
* `src/features/astrology/hooks/useDailyRashiInsight.ts` (450 lines)
* `src/features/astrology/hooks/useCustomerSubscription.ts` (300 lines)
* `src/features/auth/AuthContext.tsx` (396 lines)
* `src/features/astrology/screens/AstrologyScreen.tsx` (327 lines)
* `src/features/astrology/components/DailyRashiInsightCard.tsx` (503 lines)
* `src/shared/utils/date.ts` (60 lines)
* `src/features/astrology/services/astrologyService.ts` (551 lines)
* Existing regression suites in `__tests__/daily_astrology_*.test.*`

### 2.2 Trace of Flow: From Auth to UI Rendering
```
                       ┌────────────────────────────────────────┐
                       │          AuthContext.tsx               │
                       │   (session, user.id, onAuthStateChange)│
                       └───────────────────┬────────────────────┘
                                           │ user?.id
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 AstrologyScreen.tsx                                    │
│                                                                                        │
│   ┌───────────────────────────────┐            ┌───────────────────────────────────┐   │
│   │   useCustomerSubscription     │            │       useDailyRashiInsight        │   │
│   │                               │            │                                   │   │
│   │ • Polls/Fetches subscriptions │            │ • Selected Rashi (1-12)           │   │
│   │ • Evaluates starts_at/ends_at │            │ • Indian Date (Asia/Kolkata)      │   │
│   │ • Boundary Timer for Expiry   │            │ • Midnight Rollover Timer         │   │
│   │ • Sets isActive, isPending    │            │ • Guarded request sequence token  │   │
│   └───────────────┬───────────────┘            └─────────────────┬─────────────────┘   │
│                   │                                              │                     │
│                   │ [NO NOTIFICATION CHANNEL BETWEEN HOOKS!]     │ fetchDailyInsight() │
│                   │                                              ▼                     │
│                   │                            ┌───────────────────────────────────┐   │
│                   │                            │       dailyRashiService.ts        │   │
│                   │                            │                                   │   │
│                   │                            │ 1. Memory Cache Map Check         │   │
│                   │                            │    --> IF HIT: Returns            │   │
│                   │                            │        is_entitled: TRUE!         │   │
│                   │                            │ 2. Supabase RPC:                  │   │
│                   │                            │    get_daily_rashi_insight        │   │
│                   │                            │ 3. Storage: AsyncStorage          │   │
│                   │                            │    prefix: @kashiveda_daily..._v2 │   │
│                   │                            └─────────────────┬─────────────────┘   │
│                   │                                              │                     │
│                   ▼                                              ▼                     │
│   ┌───────────────────────────────┐            ┌───────────────────────────────────┐   │
│   │   AstrologySubscriptionCard   │            │      DailyRashiInsightCard        │   │
│   │   (Membership Status Display) │            │   (Free + Locked/Premium Views)   │   │
│   └───────────────────────────────┘            └───────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Key Root Causes Identified

1. **Conflation of Cache Hit with Entitlement Authorization (`dailyRashiService.ts:199–210`):**
   ```typescript
   if (!shouldBypassCache && this.memoryCache.has(cacheKey)) {
     const cached = this.memoryCache.get(cacheKey)!;
     return {
       success: true,
       is_entitled: true, // BUG: Cache hit assumes user is still entitled!
       is_unverified: false,
       content: cached,
       ...
     };
   }
   ```
   A cache hit confirms only that *the content was fetched at some point in the past*. It does not prove that the user currently possesses an active subscription.

2. **Absence of Entitlement Expiry Metadata in Cache Records:**
   The cache stores the bare `DailyRashiInsight` object. It does not record:
   * When the record was fetched (`cachedAt`).
   * When the customer's subscription is scheduled to expire (`entitlementExpiresAt`).
   * The content status or editorial version hash.

3. **Decoupled Subscription Expiry and Insight Invalidation:**
   `useCustomerSubscription.ts` sets a local timeout (`boundaryTimerRef`) targeting the exact millisecond of subscription expiry (`ends_at`). When it fires, it calls `fetchSubscription({ force: true })`. However, it does not communicate with `useDailyRashiInsight` or `dailyRashiService`. The insight card remains locked in its previous state with `isEntitled = true` until an explicit user action occurs.

4. **Incomplete AuthContext Sign-Out Cleanup:**
   In `AuthContext.tsx` (`signOut` around line 311), active mode is removed from storage, and `user` is set to `null`. However, `dailyRashiService.clearSessionCache()` is **never called by AuthContext**. It is only called reactively if `useDailyRashiInsight` is currently mounted and detects `previousUserId !== currentUserId`. If the user logs out from `ProfileScreen`, the in-memory cache of `dailyRashiService` retains User A's horoscopes in memory.

5. **Storage Leak / Unbounded Retention:**
   While legacy v1 keys (`@kashiveda_daily_insight_...`) are deleted by `cleanupLegacyCache()`, v2 keys (`@kashiveda_daily_insight_v2:u_<uuid>:<date>:<rashi>:<lang>`) are written every day and never pruned. Over months of usage, dead daily records accumulate indefinitely in `AsyncStorage`.

---

## 3. Security Investigation Across 10 Operational Scenarios

The table below contrasts the **current implementation behavior** with the **expected secure production behavior** across all ten specified operational scenarios, strictly distinguishing cache availability from authoritative subscription entitlement.

| # | Scenario | Current Implementation Behavior | Security & Functional Defect | Expected Production Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Subscribed user loads daily horoscope** | RPC executes; returns full content and `is_entitled: true`. Content cached in memory and AsyncStorage under `u_<userId>`. UI shows full 5 sections. | Acceptable initial load, but sets dangerous precedent by caching without entitlement expiration timestamp. | Backend verifies active subscription; stores content in client cache with explicit `entitlementExpiresAt` metadata. Full sections displayed. |
| **2** | **User signs out and another account signs in** | `useDailyRashiInsight` effect resets state on `user.id` change and clears memory cache. User B's cache keys use `u_<userB>`. | **Defect:** If sign-out occurs while `AstrologyScreen` is unmounted, memory cache is NOT cleared by `AuthContext`. AsyncStorage still retains User A's data on disk indefinitely. | `AuthContext.signOut` immediately purges all user-scoped memory caches. Account switch completely isolates local storage. User B cannot access User A's cached entries under any circumstance. |
| **3** | **Subscription expires or is cancelled** | `useCustomerSubscription` boundary timer detects expiry and marks `isActive = false`. However, `useDailyRashiInsight` is not notified. Memory cache hit returns `is_entitled: true`. | **CRITICAL DEFECT:** Mounted horoscope card continues to display full premium sections. Memory cache manufactures entitlement after subscription end. | Boundary timer notifies shared entitlement listener. Memory cache immediately invalidates entitlement. Card transitions to locked/teaser view without requiring manual refresh. |
| **4** | **A plan becomes inactive (`is_active = false`)** | Local code follows AST-Q02 Option A: existing active subscribers retain access until `ends_at`. RPC checks subscription interval. | Handled correctly by SQL/service, but subject to Scenario 3 expiry defects if subscription terminates. | Existing subscribers retain access until their paid interval ends. Upon expiry, downgrade is immediate. |
| **5** | **Administrator unpublishes content (sets to draft)** | If already loaded, in-memory cache returns `content` and `is_entitled: true`. Manual pull-to-refresh calls RPC, which returns empty content. | **Defect:** Draft/unpublished content remains visible in memory until user manually performs a hard refresh. | On navigation focus or revalidation interval, backend confirms status. If unpublished, content is evicted from cache and empty state is rendered. |
| **6** | **Device restarts and cached content is restored** | Memory cache is empty. If online, fresh RPC is called. If offline, AsyncStorage v2 is read and sanitized to free content only (`is_entitled: false`). | Safe against offline premium disclosure, but prevents legitimate paid subscribers from reading offline. | Cold start reads persisted cache envelope. Evaluates stored `entitlementExpiresAt` against device clock and chosen offline policy. |
| **7** | **Request fails while offline** | Service detects network error, reads AsyncStorage, calls `sanitizeFreeContent()`, sets `is_unverified: true`, renders free outlook only. | Restricts premium access completely offline even for valid 1-year subscribers (enforces Option A without policy confirmation). | Behaves strictly according to the approved product offline policy (Option A, B, or C) with clear offline indicator. |
| **8** | **User changes selected Rashi** | `selectRashi()` increments `latestRequestIdRef`, clears current insight, initiates guarded fetch. | Well-guarded against race conditions, but memory cache hit for new Rashi can still serve stale entitlement if expired. | Guarded fetch checks cached envelope's `entitlementExpiresAt`. If expired, executes fresh backend verification. |
| **9** | **India calendar date changes at midnight IST** | `scheduleMidnightRollover()` triggers at 00:00:00 IST, clears previous insight, fetches today's date. | Well-handled in hook, but `useCustomerSubscription` has no midnight timer, and yesterday's cached keys are never deleted from disk. | Midnight rollover triggers synchronized date shift across both hooks. Old historical cache entries are purged from AsyncStorage. |
| **10** | **Return from checkout / App resumes from background** | `useFocusEffect` on `AstrologyScreen` triggers `refreshDailyInsight({ revalidate: true })` and `refreshSub()`. `AppState` listener also revalidates. | Works when returning to screen, but if checkout is verified in background while user stays on screen, hooks do not cross-notify. | Focus and AppState transitions force fresh server entitlement check, immediately promoting card from locked to unlocked upon payment confirmation. |

---

## 4. Product Decision on Offline Access

The original Feature 02 audit identifies offline access as an essential policy decision that must be formally chosen before finalizing the cache architecture. We present three viable options:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 OFFLINE ACCESS OPTIONS                                 │
├────────────────────────────────┬───────────────────────────────┬───────────────────────┤
│    OPTION A: STRICT ONLINE     │     OPTION B: BOUNDED LEASE   │    OPTION C: CALENDAR │
│                                │                               │       DAY GRACE       │
│  • Premium requires current    │  • Premium allowed offline    │  • Premium allowed    │
│    live server verification.   │    ONLY if cached             │    offline for TODAY  │
│  • Offline = Free Overview     │    entitlementExpiresAt > now │    (Asia/Kolkata)     │
│    only (career/finance hidden)│    with max 48h lease cap.    │    with max 24h TTL.  │
│  • Max Security / Zero Leak    │  • High Usability for Travel  │  • Balances UX & Day  │
└────────────────────────────────┴───────────────────────────────┴───────────────────────┘
```

### Option A — No Offline Premium Access (Strict Online Entitlement)
* **Rule:** Premium guidance fields (`career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`) are **never** rendered unless the current session has successfully verified entitlement with Supabase within the active app session.
* **Offline Behavior:** If offline, the client renders the free General Cosmic Outlook, auspicious color, and lucky number, accompanied by an explicit notice: *"Offline Mode — Connect to internet to verify subscription and unlock detailed guidance."*
* **Security:** Maximum (5/5). Eliminates any risk of unauthorized premium viewing after cancellation or expiry.
* **Usability:** Lower (2/5). Devotees traveling or in poor network areas cannot read their paid daily horoscope even if they have an active annual plan.
* **Storage Requirement:** Minimal. Only free overview needs local storage.

### Option B — Bounded Offline Access (Subscription-Lease Model)
* **Rule:** Previously fetched daily insights may be displayed offline for the same authenticated account if and only if:
  1. `userScope === currentUserId` (no account crossing).
  2. `insight_date === currentIndianDate` (today's horoscope only).
  3. `now() < subscription.ends_at` (subscription interval has not expired).
  4. `now() - cachedAt < MAX_OFFLINE_LEASE_MS` (e.g. capped at 48 hours to limit offline window).
* **Offline Behavior:** Full premium content is displayed with an informative badge: *"Viewing Offline (Verified on [Date])"*. If `ends_at` has passed or lease expired, content is sanitized to free overview.
* **Security:** High (4/5). Revocation delay is bounded by the lease duration (maximum 48h) or exact subscription end timestamp.
* **Usability:** Excellent (5/5). Seamless experience for daily subscribers with intermittent connectivity.
* **Storage Requirement:** Moderate. Stores content envelope with expiry metadata.

### Option C — Calendar-Day Grace Period (Same-Day Offline Access)
* **Rule:** If a subscriber successfully unlocks today's horoscope while online, that specific day's content remains readable offline for the remainder of that Indian calendar date (until 23:59:59 IST), provided the subscription was valid at the time of fetch. At midnight IST, the day rolls over and fresh online verification is required.
* **Security:** Moderate-High (4/5). Bounded naturally by the daily lifecycle of the content itself.
* **Usability:** Very Good (4/5). Devotees who open the app in the morning can re-read their horoscope throughout the day without internet.

### Comparative Evaluation Matrix

| Criterion | Option A (Strict Online) | Option B (Bounded Lease) | Option C (Calendar-Day Grace) |
| :--- | :--- | :--- | :--- |
| **Security & Leak Prevention** | **5 / 5** (Zero exposure) | **4 / 5** (Bounded by lease & `ends_at`) | **4 / 5** (Bounded by Indian midnight) |
| **Customer Experience & Offline UX**| **2 / 5** (Locked when offline) | **5 / 5** (Full access during valid term) | **4.5 / 5** (Same-day offline access) |
| **Subscription Revocation Latency**| **Immediate (0 sec)** | Bounded by lease (max 48h) | Bounded by midnight IST (max 24h) |
| **Storage Complexity** | Low | Low-Medium (Envelope metadata) | Low-Medium (Envelope metadata) |
| **Clock Tampering Vulnerability** | None (Server authoritative) | Low (Guarded by server expiry) | Low (Guarded by date boundary) |

### Recommendation
> [!TIP]
> **Recommended Production Default: Option B (Bounded Offline Access capped at 24 hours).**  
> For a religious and astrological service where devotees frequently read horoscopes during morning rituals or rural travel with patchy network coverage, Option A creates user frustration by locking out legitimate annual subscribers. Option B provides an optimal balance: it respects `subscription.ends_at` (downgrading immediately if the subscription has expired) while allowing offline reading of already-fetched content for up to 24 hours.

---

## 5. Focused Technical Architecture & Design

### 5.1 Architecture Principles
1. **Authoritative Backend:** Supabase PostgreSQL (`get_daily_rashi_insight` and table RLS) remains the sole authority for subscription entitlement.
2. **Separation of Concerns:** Content caching is decoupled from entitlement status. The cache stores *content and metadata*, but does **not** grant or assert authorization.
3. **Defense in Depth:** Entitlement is verified at the database layer (RPC/RLS), at the service layer (envelope validation), and at the hook layer (subscription sync).

---

### 5.2 Cache Envelope Schema (`DailyInsightCacheEnvelope`)

Replace the raw `DailyRashiInsight` storage with a strongly typed **Cache Envelope**:

```typescript
export interface DailyInsightCacheEnvelope {
  /** Identity scope: 'u_<userId>' or 'anon' */
  userScope: string;
  /** Indian calendar date of the insight (YYYY-MM-DD) */
  insightDate: string;
  /** Numeric Rashi ID (1 - 12) */
  rashiId: number;
  /** Language code ('en', 'hi') */
  language: string;
  /** Timestamp when this record was fetched from Supabase (ms) */
  cachedAtMs: number;
  /** Exact subscription expiry timestamp from backend (ms), or null if unentitled/guest */
  entitlementExpiresAtMs: number | null;
  /** Whether the user was entitled when this record was retrieved */
  wasEntitledAtFetch: boolean;
  /** Full editorial insight content */
  content: DailyRashiInsight | null;
}
```

---

### 5.3 Storage Key Convention & Cleanup Protocol

#### Key Format:
```
@kashiveda_daily_v3:<userScope>:<YYYY-MM-DD>:<rashiId>:<language>
```
* Authenticated: `@kashiveda_daily_v3:u_019234a5-b67c-...:2026-10-12:1:en`
* Guest / Unauthenticated: `@kashiveda_daily_v3:anon:2026-10-12:1:en`

#### Bounded Retention & Eviction (Max 3 Days):
On service initialization and at midnight rollover, a prune routine scans `AsyncStorage` keys starting with `@kashiveda_daily_`:
1. Any key from legacy v1 (`@kashiveda_daily_insight_`) or v2 (`@kashiveda_daily_insight_v2:`) is deleted.
2. For v3 keys, extract the date segment. If the date is older than **3 calendar days** before today's Indian date, delete it.
3. This guarantees storage consumption remains strictly bounded (< 50 KB total) regardless of years of app usage.

---

### 5.4 Cross-Hook Entitlement Synchronization

To resolve AST-04 and prevent desynchronization between `useCustomerSubscription` and `useDailyRashiInsight`, introduce a lightweight, in-memory **Subscription Event Channel** in `astrologyService.ts`:

```typescript
// Lightweight in-process emitter for subscription lifecycle events
type SubscriptionEventListener = (event: {
  userId: string | null;
  isActive: boolean;
  endsAtMs: number | null;
}) => void;

class SubscriptionEventManager {
  private listeners = new Set<SubscriptionEventListener>();

  subscribe(listener: SubscriptionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event: { userId: string | null; isActive: boolean; endsAtMs: number | null }): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.warn("Error in subscription listener:", err);
      }
    });
  }
}

export const subscriptionEvents = new SubscriptionEventManager();
```

#### How Hooks Interact:
1. When `useCustomerSubscription` determines that subscription status changed (e.g., boundary timer fires at expiry, checkout completes, or foreground refresh runs):
   ```typescript
   subscriptionEvents.notify({
     userId: activeUserId,
     isActive: isCurrentlyActive,
     endsAtMs: activeSub?.ends_at ? new Date(activeSub.ends_at).getTime() : null,
   });
   ```
2. `useDailyRashiInsight` subscribes to `subscriptionEvents`:
   * If `event.isActive === false`: Immediately clears in-memory entitlement flag (`setIsEntitled(false)`), sanitizes visible content to free outlook, and clears memory cache.
   * If `event.isActive === true`: Triggers a background revalidation (`executeGuardedFetch(activeRashi, { revalidate: true })`) to promote the card to unlocked premium guidance.

---

### 5.5 Sign-Out & Account Switch Lifecycle

Modify `AuthContext.tsx` to directly notify the astrology service upon sign-out and account switch:

```typescript
// In AuthContext.tsx -> signOut() and deleteAccount()
const signOut = useCallback(async () => {
  try {
    setIsLoading(true);
    activeUserIdRef.current = null;
    latestRequestIdRef.current++;
    
    // Purge daily astrology session memory cache immediately on sign out
    dailyRashiService.clearSessionCache();
    
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(ASYNC_STORAGE_ACTIVE_MODE_KEY).catch(() => {});
    ...
```

Furthermore, in `dailyRashiService.ts`:
* `clearSessionCache()` clears the in-memory map.
* `clearUserStorage(userId)` removes all AsyncStorage entries matching `@kashiveda_daily_v3:u_<userId>:*`.

---

### 5.6 Asia/Kolkata Midnight Rollover Protocol

1. `useDailyRashiInsight` retains its high-precision timer `getMsUntilNextIndianMidnight()`.
2. When the timer expires (00:00:00 IST + 250ms buffer):
   * Clears currently rendered insight (`setInsight(null)`).
   * Refreshes active Indian date.
   * Triggers background eviction of historical cache entries older than 3 days.
   * Invokes `executeGuardedFetch` for today's new Indian date.
3. If the device resumes from background (`AppState` transition to `active`):
   * Compares `activeInsightDateRef.current` with `getIndianCalendarDate()`.
   * If different, immediately invalidates visible content and fetches the new day.

---

## 6. Regression Testing Strategy

### 6.1 Existing Test Suite Baseline (12 Passing Tests)
The existing suite in `__tests__/daily_astrology_cache_security.test.tsx` currently validates:
* Scenario 1: Cross-account isolation in storage keys.
* Scenario 2: Logout clearing hook state.
* Scenario 3: Account switch invalidating in-flight responses.
* Scenario 4: Cached response cannot authorize independently when offline.
* Scenario 5: Confirmed backend entitlement displays premium fields.
* Scenario 6: Confirmed unentitled response locks premium sections.
* Scenario 7: Offline fallback renders sanitized free overview.
* Scenario 8: Offline messaging does not falsely state subscription expired.
* Scenario 9: Legacy cache isolation and cleanup.
* Scenario 10: Cache key segregation (user, date, rashi, language).
* Scenario 11: In-flight response dropping on session transition.
* Scenario 12: Hindi language content handling.

---

### 6.2 Proposed New Regression Tests (Targeting AST-02 & AST-04 Gaps)

To certify the remediation against all requirements, the following concrete new test suites must be implemented:

```typescript
// Proposed New Suite: __tests__/daily_astrology_entitlement_boundary_cache.test.tsx

describe("AST-02 / AST-04: Entitlement Boundary and Lifecycle Synchronization", () => {
  
  // TEST 1: In-Memory Cache Expiry Bypass (AST-02 Core Bug)
  it("1. Expiry Boundary: A warm in-memory cache does NOT serve premium content once ends_at is reached", async () => {
    // 1. Fetch at T - 5 minutes (entitled)
    // 2. Advance fake timers by 10 minutes past ends_at
    // 3. Fetch same date and Rashi from dailyRashiService without bypassCache
    // 4. ASSERT: Result is_entitled is FALSE; premium sections are stripped.
  });

  // TEST 2: Cross-Hook Expiry Notification (AST-04 Core Bug)
  it("2. Cross-Hook Sync: When useCustomerSubscription detects expiry, useDailyRashiInsight immediately locks without user interaction", async () => {
    // 1. Mount both hooks in a test component with a subscription expiring in 5 seconds
    // 2. Advance time past 5 seconds
    // 3. ASSERT: useCustomerSubscription.isActive becomes false
    // 4. ASSERT: useDailyRashiInsight.isEntitled immediately transitions from true to false
    // 5. ASSERT: DailyRashiInsightCard transitions to locked view
  });

  // TEST 3: AuthContext Sign-Out Purges In-Memory Cache (AST-02 Bug)
  it("3. Sign-Out Isolation: AuthContext.signOut immediately empties dailyRashiService in-memory map", async () => {
    // 1. User A logs in, fetches insight, populating dailyRashiService memory map
    // 2. Trigger AuthContext.signOut()
    // 3. ASSERT: dailyRashiService.hasMemoryCacheForUser('user-a') is false
    // 4. User B logs in offline
    // 5. ASSERT: User B receives NO content and is_entitled is false
  });

  // TEST 4: Content Unpublication by Administrator
  it("4. Content Unpublication: Revalidating an insight that was reverted to draft removes it from memory and disk", async () => {
    // 1. User fetches published insight (cached)
    // 2. Admin unpublishes row (RPC returns content: null, status: draft)
    // 3. Revalidation occurs (focus or refresh)
    // 4. ASSERT: Cache entry is evicted from memory and AsyncStorage
    // 5. ASSERT: Card displays EmptyState ('No Insight for Mesha Today')
  });

  // TEST 5: Indian Midnight Rollover Purges Historical Cache
  it("5. Date Rollover: Rollover timer at 00:00:00 IST evicts yesterday's content and prunes records older than 3 days", async () => {
    // 1. Seed storage with keys for Day - 4, Day - 1, and Today
    // 2. Trigger midnight rollover event
    // 3. ASSERT: Day - 4 key is completely removed from AsyncStorage
    // 4. ASSERT: Card heading updates to new Indian date
  });

  // TEST 6: Checkout Return / Payment Confirmation
  it("6. Checkout Return: Screen focus after successful purchase immediately promotes locked card to unlocked premium view", async () => {
    // 1. Mount AstrologyScreen as unentitled (locked card)
    // 2. Simulate navigation to checkout and back (useFocusEffect)
    // 3. Webhook confirms payment in mock backend
    // 4. ASSERT: Card unlocks and renders full Career, Finance, Love, and Health guidance
  });

  // TEST 7: Offline Bounded Lease Policy Verification
  it("7. Offline Policy: Under approved Option B, offline access is granted during valid subscription term and denied after ends_at", async () => {
    // 1. Seed envelope with endsAtMs in the future
    // 2. Simulate offline network error
    // 3. ASSERT: Premium content rendered with 'Viewing Offline' badge
    // 4. Advance time past endsAtMs
    // 5. Re-fetch offline
    // 6. ASSERT: Premium fields stripped; free outlook rendered with unverified notice
  });
});
```

---

## 7. Compatibility Risks & Edge Cases

| Area | Risk / Edge Case | Mitigation in Design |
| :--- | :--- | :--- |
| **Native Razorpay Checkout** | Polling delays or app backgrounding during payment | `useFocusEffect` and `AppState` listeners force revalidation upon returning from external payment gateways. |
| **Device Clock Skew** | Device clock is set manually into the past or future | Entitlement checking relies on server-generated `starts_at` and `ends_at` timestamps from PostgreSQL; offline lease capped at maximum 24 hours. |
| **High-Frequency Rashi Tapping** | Rapid switching between all 12 Rashis | Strict request token sequencing (`latestRequestIdRef`) and in-flight promise deduplication prevent stale overwrites. |
| **AsyncStorage Quota & Performance** | Excessive storage writes during scrolling | Bounded retention pruning deletes keys older than 3 days, maintaining storage footprint under 50 KB. |
| **Network Flapping (Flaky 3G/4G)** | Network toggles between online and offline | Service distinguishes HTTP 4xx/5xx definitive rejections from transport errors (`isNetworkError`); transient errors fallback safely without wiping valid cache. |

---

## 8. Phased Implementation Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               PHASED IMPLEMENTATION ROADMAP                            │
├────────────────────┬────────────────────┬────────────────────┬─────────────────────────┤
│      PHASE 1       │      PHASE 2       │      PHASE 3       │         PHASE 4         │
│  Cache Envelope &  │ Cross-Hook Sync &  │ Lifecycle & State  │   Regression Testing    │
│  Storage Pruning   │ Expiry Timers      │ Invalidation       │   & Verification        │
│                    │                    │                    │                         │
│ • Implement        │ • Build in-process │ • Connect          │ • Execute new           │
│   DailyInsight-    │   subscription     │   AuthContext      │   test suites           │
│   CacheEnvelope    │   event emitter    │   signOut to cache │ • Verify zero           │
│ • v3 storage key   │ • Wire boundary    │ • Wire focus &     │   regressions on        │
│ • 3-day retention  │   timer to insight │   midnight prune   │   12 existing tests     │
│   cleaner          │   invalidation     │   lifecycle        │ • Document sign-off     │
└────────────────────┴────────────────────┴────────────────────┴─────────────────────────┘
```

### Phase 1: Cache Envelope & Storage Pruning (`dailyRashiService.ts`)
1. Implement `DailyInsightCacheEnvelope` structure.
2. Upgrade storage prefix to `@kashiveda_daily_v3:`.
3. Separate cached content retrieval from entitlement assertion (evaluate `entitlementExpiresAtMs`).
4. Implement automatic pruning of historical keys older than 3 days.

### Phase 2: Cross-Hook Entitlement Synchronization (`astrologyService.ts` & hooks)
1. Implement `subscriptionEvents` emitter in `astrologyService.ts`.
2. Connect `useCustomerSubscription` boundary timer to emit expiration events.
3. Update `useDailyRashiInsight` to listen to `subscriptionEvents` and immediately lock UI upon expiration.

### Phase 3: Auth Lifecycle & Navigation Tightening (`AuthContext.tsx` & `AstrologyScreen.tsx`)
1. Call `dailyRashiService.clearSessionCache()` in `AuthContext.signOut()` and `deleteAccount()`.
2. Ensure `AstrologyScreen.tsx` focus effect triggers synchronized revalidation.

### Phase 4: Automated Testing & Verification
1. Run existing 12 tests in `__tests__/daily_astrology_cache_security.test.tsx`.
2. Implement and execute the new regression test suite in `__tests__/daily_astrology_entitlement_boundary_cache.test.tsx`.
3. Validate zero regressions across discovery, booking, and kundli test suites.

---

## 9. Required Product Decision Before Implementation

> [!IMPORTANT]
> **FORMAL PRODUCT DECISION REQUIRED BEFORE IMPLEMENTATION:**  
> The development team cannot finalize the cache schema or offline fallback logic until product leadership explicitly selects one of the following offline access policies:
> 
> * **Policy A (Strict Online Only):** Paid astrological guidance (career, finance, love, health) is **never** readable offline. If connectivity is lost, only the free General Cosmic Outlook is shown.
> * **Policy B (Bounded Offline Lease — Recommended):** Devotees with an active subscription may read previously fetched horoscopes offline for up to **24 hours**, strictly bounded by their subscription's `ends_at` timestamp.
> * **Policy C (Calendar-Day Grace Period):** Horoscopes fetched while entitled remain readable offline until **23:59:59 IST** of that same calendar day, after which fresh online verification is mandatory.
> 
> *No application code or tests will be modified until this product decision is formally recorded.*
