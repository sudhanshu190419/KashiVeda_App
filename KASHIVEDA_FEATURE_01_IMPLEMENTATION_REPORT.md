# KASHIVEDA — FEATURE 01: AUTHENTICATION AND AUTHORIZATION IMPLEMENTATION REPORT

**Implementation Date:** 2026-10-10  
**Status:** Local Verification Complete (Pending Staging Deployment)  
**Target Codebases:**  
- Mobile App: `C:\Projects\KashiVeda`  
- Database Migrations: `supabase/migrations/`  
**Prior Audits:**  
- [KASHIVEDA_FEATURE_01_AUTH_AUDIT.md](file:///C:/Projects/KashiVeda/KASHIVEDA_FEATURE_01_AUTH_AUDIT.md)  
- [KASHIVEDA_AUTH_FOLLOWUP_AUDIT.md](file:///C:/Projects/KashiVeda/KASHIVEDA_AUTH_FOLLOWUP_AUDIT.md)

---

## 1. Summary of Implemented Changes

Three targeted, production-grade improvements have been implemented and validated:

1. **Database Role-Probing Hardening (Migration 046):**  
   Created forward migration `supabase/migrations/046_harden_is_admin_probing_guard.sql` to close `AUTH-SEC-01`. The function `public.is_admin(p_user_id UUID DEFAULT auth.uid())` now strictly forbids unauthenticated callers from supplying target UUIDs to probe administrative privileges, while preserving backward compatibility with catalog RLS policies.
2. **Foreground Profile & Role Synchronization:**  
   Added a managed React Native `AppState` change listener in `src/features/auth/AuthContext.tsx`. When the mobile app returns from `background` or `inactive` to `active`, authenticated user profiles and roles automatically refresh, throttled to at most once every 30 seconds.
3. **Asynchronous Authentication Race-Condition Protection:**  
   Protected `fetchUserData()` in `src/features/auth/AuthContext.tsx` with monotonic request tracking (`latestRequestIdRef`) and active user tracking (`activeUserIdRef`). Stale, delayed, or cancelled profile queries from a prior session or previous user can no longer overwrite active React state after logout or account switching.

---

## 2. New Migration: 046_harden_is_admin_probing_guard.sql

### 2.1 The Precise Security Issue Addressed
- **Advisory ID:** `AUTH-SEC-01`
- **Root Cause:** In migration 012 and migration 040, `public.is_admin(UUID)` was granted `EXECUTE` to `anon` and `authenticated` so catalog RLS policies could evaluate admin rows. However, the internal security guard:
  ```sql
  IF v_caller_id IS NOT NULL AND v_caller_id != v_target_user_id THEN ...
  ```
  assumed `v_caller_id` was non-null. When an unauthenticated caller invoked the RPC endpoint `POST /rest/v1/rpc/is_admin` with `{"p_user_id": "<target-uuid>"}`, `auth.uid()` was `NULL`. The guard evaluated to `FALSE` and was bypassed, allowing anonymous users to determine whether arbitrary UUIDs possessed an `admin` or `super_admin` role.

### 2.2 Hardened SQL Definition
Created in [supabase/migrations/046_harden_is_admin_probing_guard.sql](file:///C:/Projects/KashiVeda/supabase/migrations/046_harden_is_admin_probing_guard.sql):
```sql
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_target_user_id UUID;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    v_target_user_id := COALESCE(p_user_id, v_caller_id);

    -- If target is NULL (e.g. unauthenticated 0-argument call), cannot be admin
    IF v_target_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Security Guard: Prevent arbitrary-user probing by unprivileged or unauthenticated callers.
    -- If evaluating another user (or if an unauthenticated caller supplies an explicit target UUID),
    -- caller MUST be authenticated AND possess an 'admin' or 'super_admin' role in public.user_roles.
    IF v_caller_id IS NULL OR v_caller_id != v_target_user_id THEN
        IF v_caller_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = v_caller_id AND role IN ('admin', 'super_admin')
        ) THEN
            RETURN false;
        END IF;
    END IF;

    -- Authorized evaluation (self-check or administrative query)
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = v_target_user_id 
          AND role IN ('admin', 'super_admin')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated, service_role;
```

---

## 3. Changes to `AuthContext.tsx`

Located in [src/features/auth/AuthContext.tsx](file:///C:/Projects/KashiVeda/src/features/auth/AuthContext.tsx):

### 3.1 Foreground Synchronization via `AppState`
1. Added `AppState` subscription:
   ```typescript
   const FOREGROUND_REFRESH_THROTTLE_MS = 30_000;
   const lastForegroundRefreshRef = useRef<number>(0);
   const appStateRef = useRef<AppStateStatus | string>(AppState.currentState || "active");
   ```
2. Implemented safe transition detection:
   ```typescript
   useEffect(() => {
     const handleAppStateChange = (nextAppState: AppStateStatus) => {
       const prevAppState = appStateRef.current;
       const isTransitionToActive =
         (prevAppState === "inactive" || prevAppState === "background") &&
         nextAppState === "active";
       appStateRef.current = nextAppState;

       if (isTransitionToActive) {
         const currentUserId = activeUserIdRef.current;
         if (!currentUserId) return;

         const now = Date.now();
         if (now - lastForegroundRefreshRef.current >= FOREGROUND_REFRESH_THROTTLE_MS) {
           lastForegroundRefreshRef.current = now;
           fetchUserData(currentUserId, { isBackgroundRefresh: true });
         }
       }
     };

     const subscription = AppState.addEventListener("change", handleAppStateChange);
     return () => {
       subscription.remove();
     };
   }, [fetchUserData]);
   ```
3. Handled background refresh errors non-disruptively:
   - Passed `{ isBackgroundRefresh: true }` so transient network hiccups during foreground sync log a warning without surfacing a blocking UI error banner or clearing existing profiles.
4. Preserved existing valid Pandit mode:
   - When updating roles, checked if previous mode was already `"pandit"` and the user continues to hold the role, preventing unwanted mode resets to Customer.

---

## 4. The Race-Condition Protection Mechanism

### 4.1 Architecture & Implementation
We introduced two synchronized references in `AuthContext`:
1. `activeUserIdRef = useRef<string | null>(null)`: Holds the authoritative ID of the currently authenticated session.
2. `latestRequestIdRef = useRef<number>(0)`: Increments monotonically with every query invocation.

### 4.2 Cancellation Check (`isObsolete`)
At every asynchronous boundary inside `fetchUserData()` (after loading `profiles`, after loading `user_roles`, after loading `pandit_profiles`):
```typescript
const requestId = ++latestRequestIdRef.current;

const isObsolete = () => {
  return (
    !isMountedRef.current ||
    activeUserIdRef.current !== userId ||
    latestRequestIdRef.current !== requestId
  );
};
```
If `isObsolete()` returns `true`, the query function immediately returns, discarding results.

### 4.3 Invalidation on Logout and Account Switching
In `signOut()`, `deleteAccount()`, and `onAuthStateChange(SIGNED_OUT)`:
```typescript
activeUserIdRef.current = null;
latestRequestIdRef.current++; // Instantly invalidates all in-flight queries
```
- **Scenario A (Logout Race):** If User A logs out while a network request is pending, `activeUserIdRef` becomes `null`. When the response arrives, `isObsolete()` triggers and drops the payload. React state remains completely clean.
- **Scenario B (Rapid Account Switch):** If User A logs out and User B logs in before Request A resolves, `activeUserIdRef` is updated to User B and `latestRequestIdRef` increments. When Request A resolves, `activeUserIdRef.current !== 'user-A'`, so User A's data is safely discarded.
- **Scenario C (Out-of-Order Responses):** If Request 1 is delayed and Request 2 finishes first for the same user, Request 1's `requestId !== latestRequestIdRef.current`, preventing stale state from overwriting newer state.

---

## 5. Tests Added

In [__tests__/auth.test.tsx](file:///C:/Projects/KashiVeda/__tests__/auth.test.tsx), 9 new integration/unit tests were added (Tests 22–30):

| Test ID | Test Description | Focus Area |
| :---: | :--- | :--- |
| **22** | Logged-in user receives profile refresh on foreground transition | Fix 2: Foreground Sync |
| **23** | Unauthenticated user does not trigger foreground profile refresh | Fix 2: Unauth Guard |
| **24** | Repeated foreground events within 30 seconds are throttled | Fix 2: 30s Throttle |
| **25** | AppState listener is removed on unmount | Fix 2: Cleanup |
| **26** | Foreground refresh network errors do not crash auth state | Fix 2: Fault Tolerance |
| **27** | Refreshed role updates state dynamically on foreground (Pandit promotion) | Fix 2: Dynamic Role Update |
| **28** | Pending profile request cannot restore state after logout | Fix 3: Logout Race Guard |
| **29** | Delayed response from User A cannot overwrite User B state | Fix 3: Account Switch Guard |
| **30** | Stale request cannot overwrite newer response for the same user | Fix 3: Out-of-Order Guard |

---

## 6. Tests Executed and Actual Results

### 6.1 Authentication Test Suite (`npx jest __tests__/auth.test.tsx`)
- **Command:** `npx jest __tests__/auth.test.tsx`
- **Result:** **31 passed, 31 total (100% pass rate)**
- **Execution Time:** ~6.3 seconds

### 6.2 TypeScript Compilation Check (`npx tsc --noEmit`)
- **Command:** `npx tsc --noEmit`
- **Result:** **Exit code 0 (Zero type errors)**

### 6.3 Full Repository Test Suite (`npm test`)
- **Command:** `npm test`
- **Result:** **36 test suites passed, 36 total; 700 tests passed, 700 total (100% pass rate)**
- **Execution Time:** ~35.5 seconds
- **Regressions:** None.

---

## 7. Regressions or Unresolved Problems

- **Application Code Regressions:** None. All 700 tests passed without regressions.
- **Unresolved Problems:** None within Feature 01 scope.

---

## 8. Database Behavior That Remains Unverified

- **Remote Cloud Deployed Status:** Migration 046 exists as a local migration artifact. It has **NOT** been applied to Supabase Cloud or any shared staging/production database.
- **Production Privilege Verification:** The active production PostgreSQL catalog definitions and grants for `is_admin` cannot be verified from local files alone.

---

## 9. Exact Files Changed

1. `supabase/migrations/046_harden_is_admin_probing_guard.sql` (Created new migration)
2. `src/features/auth/AuthContext.tsx` (Modified: Added AppState listener, throttle, and race guards)
3. `__tests__/auth.test.tsx` (Modified: Added useFocusEffect mock and tests 22–30)
4. `KASHIVEDA_FEATURE_01_IMPLEMENTATION_REPORT.md` (Created this report)

---

## 10. Safe Staging Deployment and Verification Checklist

Before deploying Migration 046 to production, perform the following verification steps on staging:

```sql
-- STEP 1: Verify current definition before applying migration
SELECT proname, prosecdef, pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'is_admin' AND pronamespace = 'public'::regnamespace;

-- STEP 2: Apply migration 046 in Staging Database
-- Run supabase/migrations/046_harden_is_admin_probing_guard.sql

-- STEP 3: Verify probing immunity as anonymous user
-- (Simulate PostgREST call without auth token)
SET ROLE anon;
SELECT public.is_admin('00000000-0000-0000-0000-000000000000'::uuid);
-- EXPECTED RESULT: false

SELECT public.is_admin();
-- EXPECTED RESULT: false

-- STEP 4: Verify public catalog read continues to work for anon
SELECT id, name, price FROM public.samagri_items WHERE is_active = true LIMIT 1;
-- EXPECTED RESULT: Successfully returns rows without "permission denied for function is_admin"

-- STEP 5: Verify authenticated admin check works
RESET ROLE;
-- Connect as authenticated admin user:
-- SELECT public.is_admin('<any-target-uuid>');
-- EXPECTED RESULT: true if target is admin, false otherwise.
```
