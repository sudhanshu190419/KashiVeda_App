# KashiVeda AST-19 Implementation Report: Preferred Rashi Leakage & Persistence Accuracy

## 1. Verdict

Finding **AST-19** from `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md` has been successfully and deterministically remediated.

* **Problem A (Preference Leakage Between Accounts):** Confirmed and fixed. Previously, `dailyRashiService.ts` stored user preferences under a single global AsyncStorage key (`@kashiveda_preferred_rashi_id`). On subsequent logins by another customer on the same device, this global local cache was consulted before or in place of the new account's profile preference, causing Customer A's Rashi to override Customer B's personalization. Furthermore, `useDailyRashiInsight` did not clear or reset the selected Rashi when signing out or switching accounts. This has been resolved by introducing strictly user-scoped cache keys (`@kashiveda_preferred_rashi_id:<userId>`), neutralizing the legacy global key, ensuring profile precedence, and resetting in-memory hook state across session boundaries.
* **Problem B (False Success When Persistence Fails):** Confirmed and fixed. Previously, `dailyRashiService.savePreferredRashi` swallowed errors from the database RPC and attempted an unauthorized direct table update (`supabase.from("profiles").update(...)`), returning a blind `Promise<void>` that reported success even when remote synchronization failed. This misled users and callers into believing the preference was synchronized. This has been resolved by removing unauthorized direct update fallbacks, calling the authoritative RPC (`set_customer_preferred_rashi`), and returning an explicit structured result (`SavePreferredRashiResult`) with statuses: `"synced"`, `"local_only"`, `"failed"`, or `"guest_saved"`. Callers such as `useDailyRashiInsight` now surface synchronization status and provide a dedicated `retrySync()` action.

---

## 2. Root Cause Analysis

1. **Global Un-Scoped Storage Key:**
   `dailyRashiService.ts` previously defined a single static storage key:
   ```ts
   const PREFERRED_RASHI_STORAGE_KEY = "@kashiveda_preferred_rashi_id";
   ```
   Reads and writes did not distinguish between Customer A, Customer B, or an unauthenticated guest.

2. **Inverted Precedence on Preference Read:**
   When `getPreferredRashi()` was invoked, it read the local global key first. If found, it immediately returned that cached ID without consulting the authenticated user's `profiles.preferred_rashi_id`. Thus, when Customer B signed in on a device previously used by Customer A, Customer A's Rashi was returned.

3. **Missing Session Boundary Reset in Hook:**
   `useDailyRashiInsight` retained `selectedRashiId` in React state across user session transitions when the newly signed-in user had a `null` profile preference. Customer A's selection lingered in the component.

4. **Silent Error Swallowing & False Success Contract:**
   `savePreferredRashi` returned `Promise<void>`. It attempted `set_customer_preferred_rashi`, caught failures, attempted a direct update on `public.profiles` (which violates RLS/RPC encapsulation), caught those failures, saved to local storage, and returned `void`. The caller had no way of knowing whether the preference was synchronized remotely or persisted only on the device.

---

## 3. Source-of-Truth Contract

We established an explicit, deterministic precedence hierarchy:

```
+-------------------------------------------------------------------------+
| Authenticated User Precedence Contract                                   |
|                                                                         |
| 1. Supabase public.profiles (Authoritative)                             |
|    - If query succeeds with valid Rashi (1..12):                         |
|      -> Sync to `@kashiveda_preferred_rashi_id:<userId>` and return ID.  |
|    - If query succeeds with null (explicit no-preference):              |
|      -> Clear `@kashiveda_preferred_rashi_id:<userId>` and return null. |
|                                                                         |
| 2. Scoped Offline Fallback (Transport / Network Failure ONLY):          |
|    - If profile read rejects/fails (e.g., offline):                      |
|      -> Fall back ONLY to `@kashiveda_preferred_rashi_id:<userId>`.     |
|      -> NEVER fall back to other users' caches or the legacy key.        |
|                                                                         |
| 3. Guest / Unauthenticated Fallback:                                     |
|    - If user is null:                                                   |
|      -> Read ONLY `@kashiveda_preferred_rashi_id:guest`.                 |
|      -> Completely segregated from authenticated accounts.              |
+-------------------------------------------------------------------------+
```

* **Authoritative Profile:** An authenticated user's profile is authoritative over any locally cached value.
* **Distinct Null Handling:** A genuine `null` in the user's profile explicitly clears the user's local cache so that stale device values can never revive. A network query failure is handled distinctly by falling back only to the matching account's local cache.
* **Customer Isolation:** Customer A's scoped cache can never be read as Customer B's preference.

---

## 4. Storage Migration & Legacy Key Neutralization

* **Storage Key Format:**
  * Authenticated user key: `@kashiveda_preferred_rashi_id:<userId>`
  * Guest key: `@kashiveda_preferred_rashi_id:guest`
  * Legacy key: `@kashiveda_preferred_rashi_id`
* **Neutralization Policy:**
  * The legacy global key is permanently removed during `dailyRashiService` initialization (`cleanupLegacyCache()`), on every `getPreferredRashi()` read, and on every `savePreferredRashi()` write.
  * **Zero Blind Attribution:** The legacy global value is **never** attributed or migrated to whichever account signs in next. Because the legacy key was globally shared, its original owner cannot be verified with certainty. Blindly attributing it to a newly logging-in user would perpetuate the leak.

---

## 5. Persistence Behavior & Return Contract

### Return Contract
`dailyRashiService.savePreferredRashi` and `dailyRashiService.updatePreferredRashi` now return `Promise<SavePreferredRashiResult>`:

```ts
export type PreferenceSyncStatus =
  | "synced"       // RPC succeeded and scoped local cache updated
  | "local_only"   // RPC failed (e.g. offline), but retained in account-scoped local storage
  | "failed"       // RPC failed AND local storage failed (or session switched mid-save)
  | "guest_saved"; // Unauthenticated guest saved to guest key

export interface SavePreferredRashiResult {
  status: PreferenceSyncStatus;
  rashiId: number | null;
  userId: string | null;
  error?: string | null;
}
```

### Persistence Execution
1. Validates `rashiId` (canonical bounds 1–12 or null).
2. Neutralizes legacy global key.
3. Invalidates in-memory insight cache.
4. Identifies target user identity (`targetUserId`).
5. For authenticated users:
   - Calls the supported database RPC: `set_customer_preferred_rashi` with `{ p_rashi_id: rashiId }`.
   - **No unauthorized fallback:** Removed any direct `supabase.from("profiles").update(...)` attempts.
   - **Session consistency check:** Confirms that the active session user ID matches `targetUserId`. If the user switched accounts while the asynchronous RPC was pending, the save is aborted with `status: "failed"` to prevent polluting the new account's state or cache.
   - Writes to the user's account-scoped key (`@kashiveda_preferred_rashi_id:<userId>`).
   - Returns `"synced"` on RPC success, `"local_only"` on RPC failure with local success, or `"failed"`.
6. For guests: Saves strictly to `@kashiveda_preferred_rashi_id:guest` and returns `"guest_saved"`.

### Retry Behavior
In `useDailyRashiInsight`:
* Exposes `syncStatus: PreferenceSyncStatus | undefined`.
* Exposes `retrySync: () => Promise<void>`.
* `retrySync()` operates strictly on the active user identity (`activeUserIdRef.current`) and the current in-memory Rashi selection (`activeRashiIdRef.current`).
* On success, updates `syncStatus` to `"synced"`.
* If a new selection was made while a prior save was in flight, generation token `latestSaveIdRef` ensures older results cannot overwrite newer selections.

---

## 6. Race Condition & Auth Lifecycle Protection

1. **Asynchronous Read Race (`initRashi`):**
   When `getPreferredRashi()` is triggered on mount or auth change, `latestRequestIdRef` acts as a cancellation token. If the user logs out or switches accounts before Customer A's slow profile response resolves, the token mismatch causes the late result to be dropped without mutating the active account's state.
2. **In-Flight Save Race (`savePreferredRashi`):**
   `dailyRashiService.savePreferredRashi` re-checks `supabase.auth.getSession()` after the async RPC returns. If the active user changed during execution, Customer A's write will not touch Customer B's storage cache.
3. **Session Boundary State Reset:**
   In `useDailyRashiInsight`, when `user?.id` changes or becomes `null`:
   - `selectedRashiId` resets to `initialRashiId || 1`.
   - `syncStatus` resets to `undefined`.
   - `activeRashiIdRef.current` resets to `initialRashiId || 1`.
   - `activeUserIdRef.current` updates to the new user.
   - All visible insight and error states are cleared.

---

## 7. Files Changed

| File Path | Description of Changes |
| :--- | :--- |
| [dailyRashiService.ts](file:///c:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts) | Implemented account-scoped keys (`@kashiveda_preferred_rashi_id:<userId>`), guest key, legacy key neutralization, profile-first authoritative precedence in `getPreferredRashi()`, explicit `SavePreferredRashiResult` return contract, removal of unauthorized direct profile update fallback, and session consistency guards. |
| [useDailyRashiInsight.ts](file:///c:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts) | Added `syncStatus` and `retrySync` to hook interface, immediate state clearing and default reset across session transitions, request cancellation tokens in `initRashi`, and generation counters in `selectRashi`. |
| [FreeKundliResultScreen.tsx](file:///c:/Projects/KashiVeda/src/features/kundli/free/screens/FreeKundliResultScreen.tsx) | Updated Kundli-to-Rashi caller to check `SavePreferredRashiResult.status` and log non-blocking warnings on failure. |
| [daily_astrology_preference_isolation.test.tsx](file:///c:/Projects/KashiVeda/__tests__/daily_astrology_preference_isolation.test.tsx) | New dedicated AST-19 test suite containing 19 deterministic tests covering all 33 required scenarios across Groups A through E. |
| [daily_vedic_astrology_insights.test.tsx](file:///c:/Projects/KashiVeda/__tests__/daily_vedic_astrology_insights.test.tsx) | Aligned mock profile state and RPC handling with authoritative profile precedence; all 20 existing tests pass. |
| [daily_astrology_entitlement_revalidation.test.tsx](file:///c:/Projects/KashiVeda/__tests__/daily_astrology_entitlement_revalidation.test.tsx) | Updated `savePreferredRashi` mock return value to match `SavePreferredRashiResult` type contract and removed unused imports. |
| [daily_astrology_state_refresh_lifecycle.test.tsx](file:///c:/Projects/KashiVeda/__tests__/daily_astrology_state_refresh_lifecycle.test.tsx) | Updated `savePreferredRashi` mock return value to match `SavePreferredRashiResult` type contract and resolved unused variables. |

---

## 8. Test Evidence

### Dedicated AST-19 Test Suite
```bash
npx jest __tests__/daily_astrology_preference_isolation.test.tsx
```
**Results:**
```
PASS __tests__/daily_astrology_preference_isolation.test.tsx
  AST-19: Prevent Preferred Rashi Leakage & Report Persistence Accurately
    Group A: Account-specific preference isolation
      √ 1-5. Switch from A to B: getPreferredRashi returns B's authoritative profile, keeping caches isolated (4 ms)
      √ 6. Customer A's preference is never used when Customer B has no cached value (1 ms)
      √ 7. Profile read returning genuine null preference is handled distinctly from failed profile read (1 ms)
    Group B: Legacy global-key handling
      √ 8-12. Seed legacy global key with Rashi A; B's profile preference overrides it, neutralizing legacy key (1 ms)
      √ 13. Guest preference remains strictly isolated from authenticated accounts (1 ms)
    Group C: Account switching and sign-out races
      √ 14-17. Asynchronous profile read for Customer A resolving after switch to B cannot overwrite B (65 ms)
      √ 18. Customer A profile read failing after B succeeds does not overwrite B with error (14 ms)
      √ 19-20. Sign out while preference read is pending: old request resolving cannot repopulate cleared state (3 ms)
      √ 21. In-flight save from Customer A resolving after switch to B cannot mutate B's active cache (2 ms)
    Group D: Persistence success, failure, and retry reporting
      √ 22. Successful profile RPC updates authoritative profile and reports status: 'synced' (1 ms)
      √ 23. RPC failure + successful user-scoped AsyncStorage write produces status: 'local_only'
      √ 24. RPC failure + AsyncStorage failure returns status: 'failed'
      √ 25. Verify no direct profile update is attempted as an unauthorized fallback (1 ms)
      √ 26. Profile read errors are represented distinctly rather than converted to missing preference
      √ 27-29. Newer selection made while older save pending remains authoritative, and retrySync operates on active selection (6 ms)
    Group E: New installation and compatibility
      √ 30. Fresh installation: No AsyncStorage present, successful profile read restores preference
      √ 31. Legacy global key cannot override a different account's profile preference (1 ms)
      √ 32. Janam Kundli Moon Sign mapping to canonical Rashi IDs 1-12 functions correctly (1 ms)
      √ 33. Default behavior preserved when no preference exists (profile returns null) (1 ms)

Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
Snapshots:   0 total
Time:        1.608 s
```

---

## 9. Regression Results

### 1. Daily Astrology Test Suites
```bash
npx jest __tests__/daily_astrology --runInBand
```
**Results:**
```
Test Suites: 18 passed, 18 total
Tests:       305 passed, 305 total
Snapshots:   0 total
Time:        17.196 s
```

### 2. Daily Vedic Astrology Insights Test Suite
```bash
npx jest __tests__/daily_vedic_astrology_insights.test.tsx
```
**Results:**
```
Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
Snapshots:   0 total
Time:        2.279 s
```

### 3. Affected Test Suites Run
```bash
npx jest __tests__/daily_astrology_preference_isolation.test.tsx __tests__/daily_astrology_entitlement_revalidation.test.tsx __tests__/daily_astrology_state_refresh_lifecycle.test.tsx
```
**Results:**
```
Test Suites: 3 passed, 3 total
Tests:       38 passed, 38 total
Snapshots:   0 total
Time:        6.036 s
```

### 4. TypeScript Compilation Check
* Mobile application (`C:\Projects\KashiVeda`):
  ```bash
  npx tsc --noEmit
  ```
  **Result:** Exited with code 0 (0 errors).
* Admin web application (`C:\Projects\kashi-veda-admin`):
  ```bash
  npx tsc --noEmit
  ```
  **Result:** Exited with code 0 (0 errors).

### 5. ESLint Code Quality Verification
```bash
npx eslint src/features/astrology/services/dailyRashiService.ts src/features/astrology/hooks/useDailyRashiInsight.ts src/features/kundli/free/screens/FreeKundliResultScreen.tsx __tests__/daily_astrology_preference_isolation.test.tsx __tests__/daily_vedic_astrology_insights.test.tsx __tests__/daily_astrology_entitlement_revalidation.test.tsx __tests__/daily_astrology_state_refresh_lifecycle.test.tsx
```
**Result:** Exited with code 0 (0 errors).

---

## 10. Limitations & Considerations

1. **Guest-to-Authenticated Linkage:**
   In compliance with security rules, unauthenticated guest selections stored in `@kashiveda_preferred_rashi_id:guest` are not auto-migrated into a newly created or logged-in user profile. If product requirements ever call for an explicit "claim guest preference" prompt, it can be provided via a deliberate opt-in modal after authentication.
2. **Offline Retry Lifetime:**
   The `retrySync` action is managed in-memory within the active hook lifecycle. It does not spawn a background synchronization daemon, adhering to the rule that distributed background frameworks should not be introduced for this narrow correction.

---

## 11. Deployment Status

* **Application Code:** Maintained locally in workspace `C:\Projects\KashiVeda`. No production deployment was performed.
* **Database Migrations:** No new migrations were created. No migrations were pushed or deployed to the production database.
* **Next Task:** AST-19 is complete. Work on AST-20 or subsequent findings has not been initiated.
