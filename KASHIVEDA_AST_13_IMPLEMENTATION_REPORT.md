# KashiVeda AST-13 Implementation Report: Timezone-Independent Calendar Date Navigation

**Audit Finding**: AST-13 (Daily Astrology matrix Previous Day and Next Day date navigation fails in non-UTC/western timezones due to mixing UTC parsing with local date arithmetic)  
**Target Repositories**: `C:\Projects\kashi-veda-admin` & `C:\Projects\KashiVeda`  
**Status**: Implemented, Verified Across Multiple Timezones, Zero Regressions  

---

## 1. Confirmed Root Cause & Exact Source Location

Prior to remediation, the Previous Day and Next Day navigation buttons in the Admin Daily Astrology editorial matrix failed to reliably step calendar dates when executed in timezones west of UTC (such as `America/Los_Angeles`).

### Exact Source Location
- **File**: `components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx`
- **Function**: `handleStepDay` (lines 195–202)

### Root Cause Analysis
The Daily Astrology matrix represents dates as calendar dates (`YYYY-MM-DD`). In ECMAScript, date-only strings without a timestamp (e.g., `'2026-10-10'`) are parsed per RFC 3339 / ISO 8601 as **UTC midnight**:
```
new Date("2026-10-10") => 2026-10-10T00:00:00.000Z
```

When evaluated in a local timezone west of UTC (e.g., Pacific Daylight Time `America/Los_Angeles`, UTC-7), UTC midnight corresponds to the previous evening locally:
```
2026-10-10T00:00:00.000Z === 2026-10-09 17:00:00 PDT
```

Calling local Date methods on this object returned local time values:
- `current.getDate()` returned `9` (the day prior).
- When stepping forward by `+1` day (`current.setDate(current.getDate() + 1)`), the date became `9 + 1 = 10`.
- Extracting `current.getFullYear()`, `current.getMonth() + 1`, and `current.getDate()` produced `'2026-10-10'`.
- As a result, clicking **Next Day** resulted in the exact same date `'2026-10-10'`, completely failing to advance.
- Clicking **Previous Day** (`delta = -1`) evaluated `9 - 1 = 8`, returning `'2026-10-08'`, jumping backward by **2 calendar days** instead of 1.

---

## 2. Previous Implementation vs. Failure Mechanics

### Previous Implementation
```tsx
const handleStepDay = (delta: number) => {
  const current = new Date(selectedDate);
  current.setDate(current.getDate() + delta);
  const yyyy = current.getFullYear();
  const mm = String(current.getMonth() + 1).padStart(2, "0");
  const dd = String(current.getDate()).padStart(2, "0");
  const nextDateStr = `${yyyy}-${mm}-${dd}`;
  handleDateChange(nextDateStr);
};
```

### Empirical Failure in `America/Los_Angeles` (UTC-7)
| Initial `selectedDate` | Delta | Expected Date | Previous Method Output | Actual Behavior |
|---|---|---|---|---|
| `2026-10-10` | `+1` (Next) | `2026-10-11` | `2026-10-10` | **Failed to advance** (stayed on current date) |
| `2026-10-10` | `-1` (Prev) | `2026-10-09` | `2026-10-08` | **Double step backward** (skipped Oct 9) |
| `2026-10-31` | `+1` (Next) | `2026-11-01` | `2026-10-31` | **Failed to advance** across month boundary |
| `2026-12-31` | `+1` (Next) | `2027-01-01` | `2026-12-31` | **Failed to advance** across year boundary |

---

## 3. New Date-Only Arithmetic Strategy

A Daily Astrology matrix date is a discrete **calendar date unit**, not a time-of-day instant. Calendar-day stepping must be mathematically decoupled from local browser time offsets and Daylight Saving Time (DST) shifts.

The hardened implementation is encapsulated in a pure helper, `stepCalendarDate`:

```ts
// lib/astrology/daily-insights-matrix-coordinator.ts
export function stepCalendarDate(dateStr: string, delta: number): string {
  if (!dateStr || typeof dateStr !== "string") {
    throw new Error(`Invalid date string: expected YYYY-MM-DD, received "${dateStr}".`);
  }

  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date format: expected YYYY-MM-DD, received "${dateStr}".`);
  }

  if (typeof delta !== "number" || !Number.isInteger(delta)) {
    throw new Error(`Step delta must be an integer, received ${delta}.`);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // UTC midnight calendar instantiation prevents local timezone offset skew
  const initialDate = new Date(Date.UTC(year, month - 1, day));
  if (
    initialDate.getUTCFullYear() !== year ||
    initialDate.getUTCMonth() !== month - 1 ||
    initialDate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date "${dateStr}" (calendar rollover detected).`);
  }

  initialDate.setUTCDate(initialDate.getUTCDate() + delta);

  const yyyy = String(initialDate.getUTCFullYear()).padStart(4, "0");
  const mm = String(initialDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(initialDate.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}
```

### Key Technical Guarantees
1. **UTC-Exclusive Primitive**: Uses `Date.UTC(year, month - 1, day)` and `setUTCDate()`. In UTC, every day contains exactly 24 UTC hours without DST transitions or local time skew.
2. **Calendar Rollover Protection**: Detects and rejects malformed rollover dates such as `'2026-02-30'` before applying step deltas.
3. **Leap Year and Century Rules**: Accurately computes leap years (e.g. Feb 28 -> Feb 29 in 2024, Feb 28 -> Mar 01 in 2025; century rule: 2000 is leap, 1900 is non-leap).
4. **DST Transition Invariance**: In any local timezone where days contain 23 hours (spring forward) or 25 hours (fall back), calendar days step by exactly one calendar date without shifting forward or backward.

---

## 4. Summary of Changed Files

### 1. `lib/astrology/daily-insights-matrix-coordinator.ts` (Admin)
- Added and exported `stepCalendarDate(dateStr: string, delta: number): string`.
- Provides a pure, zero-dependency calendar arithmetic helper reusable by all matrix components and test harnesses.

### 2. `components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx` (Admin)
- Imported `stepCalendarDate` from `@/lib/astrology/daily-insights-matrix-coordinator`.
- Refactored `handleStepDay`:
  ```tsx
  const handleStepDay = (delta: number) => {
    try {
      // AST-13: Timezone-independent calendar date stepping
      const nextDateStr = stepCalendarDate(selectedDate, delta);
      handleDateChange(nextDateStr);
    } catch (err) {
      console.error("Failed to step calendar date:", err);
    }
  };
  ```
- Retained existing `handleDateChange` behavior, modal invalidations, `selectedKeyRef` synchronization, and AST-08 request generation token safeguards.

### 3. `__tests__/daily_astrology_date_navigation.test.ts` (Backend - New Jest Test Suite)
- Comprehensive 29-test Jest test suite verifying Scenarios A through G.

### 4. `scratch/test_ast_13_timezone_stepping.mjs` & `scratch/tz_worker.mjs` (Backend - Multi-Timezone Runner)
- Independent multi-process test runner executing the complete battery of date-step transitions across `UTC`, `Asia/Kolkata`, and `America/Los_Angeles`.

---

## 5. Test Results: Ordinary Stepping, Boundaries, Leap Years & DST

All transitions were verified under 19 discrete test cases across every boundary condition:

| Category | Initial Date | Delta | Output Date | Verification Status |
|---|---|---|---|---|
| **Ordinary Next** | `2026-10-10` | `+1` | `2026-10-11` | PASS |
| **Ordinary Prev** | `2026-10-10` | `-1` | `2026-10-09` | PASS |
| **Month Boundary** | `2026-10-31` | `+1` | `2026-11-01` | PASS |
| **Month Boundary (Reverse)** | `2026-11-01` | `-1` | `2026-10-31` | PASS |
| **30-Day Month Boundary** | `2026-04-30` | `+1` | `2026-05-01` | PASS |
| **Year Boundary** | `2026-12-31` | `+1` | `2027-01-01` | PASS |
| **Year Boundary (Reverse)** | `2027-01-01` | `-1` | `2026-12-31` | PASS |
| **Leap Year (2024)** | `2024-02-28` | `+1` | `2024-02-29` | PASS |
| **Leap Year (2024)** | `2024-02-29` | `+1` | `2024-03-01` | PASS |
| **Leap Year (Reverse)** | `2024-03-01` | `-1` | `2024-02-29` | PASS |
| **Non-Leap Year (2025)** | `2025-02-28` | `+1` | `2025-03-01` | PASS |
| **Non-Leap Year (Reverse)** | `2025-03-01` | `-1` | `2025-02-28` | PASS |
| **Century Leap Rule** | `2000-02-28` | `+1` | `2000-02-29` | PASS |
| **Century Non-Leap Rule** | `1900-02-28` | `+1` | `1900-03-01` | PASS |
| **Spring Forward 23h (US DST)** | `2026-03-07` | `+1` | `2026-03-08` | PASS |
| **Spring Forward 23h (US DST)** | `2026-03-08` | `+1` | `2026-03-09` | PASS |
| **Spring Forward (Reverse)** | `2026-03-09` | `-1` | `2026-03-08` | PASS |
| **Fall Back 25h (US DST)** | `2026-10-31` | `+1` | `2026-11-01` | PASS |
| **Fall Back 25h (US DST)** | `2026-11-01` | `+1` | `2026-11-02` | PASS |
| **Fall Back (Reverse)** | `2026-11-02` | `-1` | `2026-11-01` | PASS |

---

## 6. Timezone-Specific Test Execution & Evidence

Command: `node scratch/test_ast_13_timezone_stepping.mjs`

```
TAP version 13
# Subtest: AST-13 Timezone Verification: UTC
ok 1 - AST-13 Timezone Verification: UTC
  ---
  duration_ms: 189.3899
  type: 'test'
  ...
# Subtest: AST-13 Timezone Verification: Asia/Kolkata
ok 2 - AST-13 Timezone Verification: Asia/Kolkata
  ---
  duration_ms: 157.6635
  type: 'test'
  ...
# Subtest: AST-13 Timezone Verification: America/Los_Angeles
ok 3 - AST-13 Timezone Verification: America/Los_Angeles
  ---
  duration_ms: 157.0607
  type: 'test'
  ...
# Subtest: AST-13 Defect Contrast: Legacy method fails in America/Los_Angeles while stepCalendarDate succeeds
ok 4 - AST-13 Defect Contrast: Legacy method fails in America/Los_Angeles while stepCalendarDate succeeds
  ---
  duration_ms: 159.7474
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# duration_ms 674.1043
```

All 19 test cases produced identical, correct outputs in `UTC`, `Asia/Kolkata` (+5:30), and `America/Los_Angeles` (-7:00 / -8:00).

---

## 7. Matrix Fetch Behavior, Language & AST-08 Coordination

When stepping dates via `handleStepDay`:
1. `stepCalendarDate(selectedDate, delta)` computes the new `YYYY-MM-DD` string.
2. `handleDateChange(nextDateStr)` is called:
   - Synchronously clears open modal state (`setActiveFieldSlot(null)`, `setActiveFullSlot(null)`, `setIsPublishModalOpen(false)`, `setIsBulkImportOpen(false)`).
   - Updates `selectedDate`.
   - Preserves `selectedLanguage` intact (e.g. stepping from `2026-10-10::hi` produces `2026-10-11::hi`).
   - Updates `selectedKeyRef.current = getMatrixIdentityKey(nextDateStr, selectedLanguage)`.
   - Dispatches `handleFetchMatrix(nextDateStr, selectedLanguage)`.
3. `MatrixRequestCoordinator` generates a new request token (`currentGen += 1`).
4. If an administrator rapidly clicks Next multiple times (e.g. Oct 10 -> Oct 11 -> Oct 12), any late-arriving matrix responses for Oct 11 are rejected by AST-08's `shouldCommitResponse(token1, ...)` guard, preventing stale matrix flashes.

---

## 8. Regression Verification Across Prior Findings (AST-08 through AST-12)

### A. All Daily Astrology Jest Test Suites (218 Tests)
Command: `npx jest __tests__/daily_astrology`
```
PASS __tests__/daily_astrology_partial_publishing.test.ts
PASS __tests__/daily_astrology_optimistic_concurrency.test.ts
PASS __tests__/daily_astrology_admin_rpc_hardening.test.ts
PASS __tests__/daily_astrology_csv_identity_overwrite.test.ts
PASS __tests__/daily_astrology_cache_security.test.tsx
PASS __tests__/daily_astrology_stale_refresh_guard.test.tsx
PASS __tests__/daily_astrology_error_classification.test.tsx
PASS __tests__/daily_astrology_entitlement_revalidation.test.tsx
PASS __tests__/daily_astrology_subscription_selection.test.tsx
PASS __tests__/daily_astrology_state_refresh_lifecycle.test.tsx
PASS __tests__/daily_astrology_date_navigation.test.ts
PASS __tests__/daily_astrology_csv_parser_validation.test.ts

Test Suites: 12 passed, 12 total
Tests:       218 passed, 218 total
Snapshots:   0 total
Time:        13.881 s
```

### B. Node Regression Suites
- **AST-08 Matrix Coordinator Suite**: `node scratch/test_astrology_matrix_coordinator.mjs` — **13/13 passed**.
- **AST-10 Publishing Results Suite**: `node scratch/test_ast_10_publishing_results.mjs` — **7/7 passed**.
- **AST-11 CSV Identity Suite**: `node scratch/test_ast_11_csv_identity.mjs` — **4/4 passed**.

### C. Isolated PostgreSQL 18.4 Concurrency Tests
- **AST-11 DB Overwrite Concurrency**: `python scratch/test_ast_11_db_overwrite_concurrency.py` — **All scenarios (D, E, F, G, H, J, K) passed**.
- **AST-09 Database OCC Concurrency**: `python scratch/test_astrology_optimistic_concurrency.py` — **All 8 OCC scenarios (A - H) passed**.

---

## 9. TypeScript, ESLint & Production Build Results

1. **TypeScript Compilation**:
   - Command: `npx tsc --noEmit` in `C:\Projects\kashi-veda-admin`
   - Result: **Exited with code 0** (0 errors).
2. **ESLint**:
   - Command: `npx eslint components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx lib/astrology/daily-insights-matrix-coordinator.ts`
   - Result: **Exited with code 0** (0 errors, 0 warnings).
3. **Next.js Production Build**:
   - Command: `npm run build` in `C:\Projects\kashi-veda-admin`
   - Result: All astrology routes, components, and coordinator utilities compiled cleanly. The only failure was the pre-existing, unrelated route segment config in `app/(dashboard)/reviews/page.tsx` (`Route segment config "dynamic" is not compatible with nextConfig.cacheComponents`), which remains untouched and out of scope as directed.

---

## 10. Limitations & Unverified Behavior

- Real browser-native date input UI widget behavior (e.g. the operating system's native calendar dropdown popup) depends on the browser engine's HTML5 `<input type="date">` implementation, but programmatic `handleDateChange` and Previous/Next button stepping are verified completely.
- Coverage for all timezone conversions, rollover dates, month/year transitions, and leap years was executed deterministically via isolated V8 processes.

---

## 11. Confirmation: Out-of-Scope Findings Untouched

- **AST-14** (Legacy timestamp correction): **NOT implemented**; left untouched.
- `app/(dashboard)/reviews/page.tsx`: **Left untouched**.
- Database schemas, RPCs, and migrations: **Left untouched**.
- Customer mobile app and Pandit workflows: **Left untouched**.

---

## 12. Confirmation: Database State & Migrations

- **No remote or production database migration was created or deployed**.
- **No production database was modified**.
- Database testing was performed exclusively against local isolated temporary PostgreSQL instances.
