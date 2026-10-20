# KashiVeda AST-14 Implementation Report: Legacy Astrology Content Form Datetime Preservation & Timezone Handling

**Audit Finding**: AST-14 (Legacy astrology content form publication and expiry datetime handling silently shifts stored UTC instant due to UTC string slicing and local Date interpretation)  
**Target Repositories**: `C:\Projects\kashi-veda-admin` & `C:\Projects\KashiVeda`  
**Status**: Implemented, Multi-Timezone Verified, Zero Regressions  

---

## 1. Confirmed Root Cause & Exact Source Locations

Prior to remediation, the legacy astrology content management form modal in the Admin application silently altered stored publication and expiration timestamps when existing records were viewed and saved.

### Exact Source Location
- **File**: `C:\Projects\kashi-veda-admin\components\admin\astrology\modals\content-form-modal.tsx`
- **Initial State Formulation**: Lines 45–54
- **Default Datetime Generation**: Lines 33–37
- **Submit Handler Parsing & Serialization**: Lines 77–81

### Root Cause Analysis
The defect stemmed from the conflation of UTC ISO-8601 instants (`TIMESTAMPTZ`) with HTML `<input type="datetime-local">` wall-clock strings:

1. **Initial Value Population via UTC Slicing (`slice(0, 16)`)**:
   ```ts
   // Defective legacy code:
   const [publishAt, setPublishAt] = useState(
     contentItem?.publishAt ? contentItem.publishAt.slice(0, 16) : defaultPublishAt
   );
   const [expiresAt, setExpiresAt] = useState(
     contentItem?.expiresAt ? contentItem.expiresAt.slice(0, 16) : ""
   );
   ```
   An ISO instant such as `"2026-10-10T06:00:00.000Z"` represents an absolute moment in UTC. Taking `.slice(0, 16)` stripped the UTC timezone indicator `Z` and extracted the UTC wall-clock representation `"2026-10-10T06:00"`.

2. **Presentation in HTML `datetime-local` Input**:
   An HTML `<input type="datetime-local">` interprets its `value` as the user's **local wall-clock date and time**.
   - In India (`Asia/Kolkata`, UTC+5:30), the instant `2026-10-10T06:00:00Z` is actually **11:30 AM IST**.
   - Because `06:00` was sliced from UTC, the form displayed **06:00 AM**, displaying a time 5 hours and 30 minutes in the past.

3. **Silent Instant Drift on Submission via `new Date(localInput).toISOString()`**:
   ```ts
   // Defective legacy code:
   const payload = {
     ...
     publishAt: new Date(publishAt).toISOString(),
     expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
   };
   ```
   When the administrator clicked **Save** without touching the timestamp:
   - The browser evaluated `new Date("2026-10-10T06:00")`. Per ECMAScript specs, datetime strings without a timezone offset are parsed in the **browser's local timezone**.
   - In India, `2026-10-10 06:00:00 IST` is converted to UTC: `"2026-10-10T00:30:00.000Z"`.
   - **Result**: The publication instant shifted backward by **5 hours and 30 minutes** on every single save.
   - In western timezones (such as `America/Los_Angeles`, UTC-7 in daylight time), `new Date("2026-10-10T06:00")` shifted the instant forward by **7 hours** to `"2026-10-10T13:00:00.000Z"`.

4. **Destructive Loss of Sub-Minute Precision**:
   PostgreSQL `TIMESTAMPTZ` values frequently include seconds and fractional milliseconds (e.g. `2026-10-10T06:00:45.123Z`). Truncating to 16 characters (`YYYY-MM-DDTHH:mm`) permanently erased seconds and milliseconds on save, even if the user only wanted to edit the article's title or body.

---

## 2. Existing Timezone Contract & Design Rationale

### Contract Investigation
1. **Database Schema**:
   - `astrology_content.publish_at`: `TIMESTAMPTZ NOT NULL`
   - `astrology_content.expires_at`: `TIMESTAMPTZ NULL`
   - Check Constraint: `chk_astrology_content_expiry CHECK (expires_at IS NULL OR expires_at > publish_at)`
   The database stores authoritative UTC instants.

2. **Admin Presentation Layer**:
   - In `components/admin/astrology/content/astrology-content-view.tsx` (the table displaying legacy content items), timestamps are rendered via:
     ```tsx
     new Date(item.publishAt).toLocaleString()
     ```
     This formats dates in the administrator's **browser-local wall-clock time**.
   - The modal input labels in `content-form-modal.tsx` are "Publish At *" and "Expires At" with no hardcoded timezone badge.

3. **Established Contract: Browser-Local Wall-Clock Editing**:
   - The application contract for legacy content items is **browser-local wall-clock editing**. Administrators schedule publication and expiration in their own local time, while the database records the exact corresponding UTC instant.
   - To eliminate instant drift, the local wall-clock representation must be formatted from the instant using local date getters, and converted back to an instant using local date constructors.
   - Furthermore, to support explicit India-time operations where required, dedicated `Asia/Kolkata` utilities are also provided in the new utility module.

---

## 3. Previous vs. Corrected Formatting & Conversion Logic

A dedicated utility module was created:
[astrology-datetime-utils.ts](file:///C:/Projects/kashi-veda-admin/lib/astrology/astrology-datetime-utils.ts)

### Comparison Table

| Operation | Defective Legacy Implementation | Corrected AST-14 Implementation |
|---|---|---|
| **Initialize Existing Instant** | `instant.slice(0, 16)` *(Slices UTC string, losing offset and precision)* | `formatInstantToLocalDatetimeInput(instant)` *(Converts instant to local wall-clock `YYYY-MM-DDTHH:mm` via local getters)* |
| **New Entry Default** | `now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 16);` *(Offset math hack)* | `getLocalCurrentDatetimeInput()` *(Direct local wall-clock formatting without UTC ISO manipulation)* |
| **Parse on Submit** | `new Date(localInput).toISOString()` *(Loses sub-minute precision, shifts instant if timezone mismatch)* | `parseLocalDatetimeInputToInstant(localInput, originalInstant)` *(Preserves pristine instant byte-for-byte if unchanged; validates calendar rollover if modified)* |
| **Clear Expiry** | `expiresAt ? ... : null` | `parseLocalDatetimeInputToInstant(expiresAt, contentItem?.expiresAt)` *(Returns `null` for empty/whitespace input)* |
| **Validation** | None (failed at database constraint) | Explicit client validation before submission: `if (parsedExpiresAt && new Date(parsedExpiresAt) <= new Date(parsedPublishAt)) throw new Error(...)` |

### Core Conversion Functions in `astrology-datetime-utils.ts`

```ts
/**
 * Formats an ISO-8601 UTC timestamp instant into a wall-clock string formatted
 * as "YYYY-MM-DDTHH:mm" for HTML <input type="datetime-local"> in the browser's local timezone.
 */
export function formatInstantToLocalDatetimeInput(instant: string | null | undefined): string {
  if (!instant || typeof instant !== "string" || !instant.trim()) return "";
  const d = new Date(instant.trim());
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid ISO timestamp provided for datetime input: "${instant}".`);
  }
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Parses a local datetime-local input string into an authoritative ISO-8601 UTC instant.
 *
 * CRITICAL REGRESSION REQUIREMENT (AST-14):
 * If the input value has NOT been changed from its original representation,
 * the original instant string is preserved verbatim.
 */
export function parseLocalDatetimeInputToInstant(
  localInput: string | null | undefined,
  originalInstant?: string | null
): string | null {
  if (!localInput || typeof localInput !== "string" || !localInput.trim()) {
    return null;
  }
  const trimmed = localInput.trim();

  // 1. Pristine unchanged field check
  if (originalInstant && typeof originalInstant === "string" && originalInstant.trim()) {
    try {
      const formattedOriginal = formatInstantToLocalDatetimeInput(originalInstant.trim());
      if (formattedOriginal === trimmed) {
        return originalInstant.trim();
      }
    } catch {
      // Fall through to strict parsing if original was unparseable
    }
  }

  // 2. Strict format validation
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) {
    throw new Error(`Invalid local datetime format: expected "YYYY-MM-DDTHH:mm", received "${localInput}".`);
  }

  const [, yStr, mStr, dStr, hStr, minStr, sStr, msStr] = match;
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  const h = parseInt(hStr, 10);
  const min = parseInt(minStr, 10);
  const s = sStr ? parseInt(sStr, 10) : 0;
  const ms = msStr ? parseInt(msStr.padEnd(3, "0"), 10) : 0;

  // 3. Calendar rollover validation (e.g., Feb 30)
  const dateObj = new Date(y, m - 1, d, h, min, s, ms);
  if (
    isNaN(dateObj.getTime()) ||
    dateObj.getFullYear() !== y ||
    dateObj.getMonth() !== m - 1 ||
    dateObj.getDate() !== d ||
    dateObj.getHours() !== h ||
    dateObj.getMinutes() !== min
  ) {
    throw new Error(`Invalid calendar datetime "${localInput}" (calendar rollover or invalid component detected).`);
  }

  return dateObj.toISOString();
}
```

---

## 4. Preservation of Unchanged Instants & Sub-Minute Precision

### Pristine Input Detection Mechanism
HTML `<input type="datetime-local">` elements by default provide minute-level granularity (`YYYY-MM-DDTHH:mm`). However, database records populated via API, migrations, or automated ingest frequently have sub-minute precision (e.g., `2026-10-10T06:00:45.123Z`).

To guarantee zero drift and prevent the loss of seconds or milliseconds:
1. When `contentItem` is provided, `originalInstant` is passed to `parseLocalDatetimeInputToInstant(localInput, originalInstant)`.
2. The function formats `originalInstant` using `formatInstantToLocalDatetimeInput(originalInstant)`.
3. If the form's current `localInput` matches this formatted value, **the original instant string is returned verbatim**.
4. Even if an administrator edits the article's title, body, status, category, or tags, saving the form causes **0ms of drift** and retains the full `:45.123Z` precision.

---

## 5. Handling of Null Values, Clearing, Defaults, and Invalid Inputs

1. **New Item Defaults**:
   - `getLocalCurrentDatetimeInput()` formats `new Date()` into local `"YYYY-MM-DDTHH:mm"`.
   - `expiresAt` defaults to `""` (empty string).
2. **Clearing Expiration**:
   - If an existing record had an expiration date and the administrator clears the `<input>`, `expiresAt` becomes `""`.
   - `parseLocalDatetimeInputToInstant("", ...)` returns `null`.
   - The update payload sets `expiresAt: null`, clearing the field authoritatively in the database.
3. **Mandatory Publish Date**:
   - If `publishAt` is cleared or missing, `content-form-modal.tsx` throws an immediate validation error: `"Publish date and time is required."`
4. **Expiry Precedence Constraint**:
   - Enforces the database constraint `chk_astrology_content_expiry`:
     ```ts
     if (parsedExpiresAt && new Date(parsedExpiresAt) <= new Date(parsedPublishAt)) {
       throw new Error("Expiration date and time must be strictly after the publication date and time.");
     }
     ```
5. **Invalid Input Detection**:
   - Malformed strings (e.g., `"2026-10-10"`, `"invalid"`) trigger an explicit `Error: Invalid local datetime format`.
   - Calendar rollovers (e.g., `"2026-02-30T10:00"`) are caught by the component verification check and rejected with `Error: Invalid calendar datetime ... (calendar rollover or invalid component detected)`.

---

## 6. DST Behavior & Timezone Limitations

### Daylight Saving Time Transitions
In timezones that observe Daylight Saving Time (e.g., `America/Los_Angeles`):
- **Unchanged Records**: Because untouched timestamps return `originalInstant` verbatim, DST boundaries have zero effect on existing stored instants.
- **Spring-Forward Gap (Non-existent wall-clock times)**:
  - For example, at 2:00 AM on the second Sunday of March in California, clocks jump to 3:00 AM.
  - If a user enters an edited wall-clock time of `02:30`, ECMAScript's `new Date(y, m-1, d, 2, 30)` rolls the clock forward by the gap offset (producing 3:30 AM PDT). Our component rollover check detects `dateObj.getHours() !== h` and rejects the non-existent wall-clock time with an explicit calendar rollover error.
- **Fall-Back Ambiguity (Duplicate wall-clock times)**:
  - At 2:00 AM on the first Sunday of November, clocks fall back to 1:00 AM.
  - A wall-clock time of `01:30` occurs twice (once in PDT, once in PST). Per ECMAScript standard behavior, `new Date(y, m-1, d, 1, 30)` deterministically resolves to the earlier daylight saving instant.
- **Indian Standard Time (`Asia/Kolkata`)**:
  - IST does not observe Daylight Saving Time (constant UTC+5:30 offset). Conversions in IST are strictly continuous and unambiguous.

---

## 7. Files Changed and Purpose

| File | Purpose |
|---|---|
| [lib/astrology/astrology-datetime-utils.ts](file:///C:/Projects/kashi-veda-admin/lib/astrology/astrology-datetime-utils.ts) | Pure utility library providing bidirectional formatting and parsing between ISO instants and wall-clock datetime strings for both browser-local and explicit `Asia/Kolkata` timezones. Includes pristine instant preservation and rollover validation. |
| [components/admin/astrology/modals/content-form-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/modals/content-form-modal.tsx) | Updated modal to use `formatInstantToLocalDatetimeInput` on load, `getLocalCurrentDatetimeInput` for defaults, `parseLocalDatetimeInputToInstant` with pristine preservation on submit, and client-side expiry check constraint validation. |
| [__tests__/daily_astrology_legacy_content_datetime.test.ts](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_legacy_content_datetime.test.ts) | Comprehensive test suite covering Scenarios A through J (21 unit and regression tests). |
| [scratch/test_ast_14_timezone_contract.mjs](file:///C:/Projects/KashiVeda/scratch/test_ast_14_timezone_contract.mjs) & [scratch/ast_14_tz_worker.mjs](file:///C:/Projects/KashiVeda/scratch/ast_14_tz_worker.mjs) | Deterministic multi-process test runner executing across `UTC`, `Asia/Kolkata`, and `America/Los_Angeles` to verify instant preservation and contrast against the legacy defect. |

---

## 8. Test Matrix: Multi-Timezone Execution & Outcomes

### Deterministic Multi-Timezone Test Runner
Executed via `scratch/test_ast_14_timezone_contract.mjs` spawning child processes with `process.env.TZ`:

```
============================================================
AST-14 MULTI-TIMEZONE VERIFICATION SUITE
============================================================

1. Testing in Timezone: UTC
  [PASS] Formatted input: 2026-10-10T06:00
  [PASS] Preserved instant: 2026-10-10T06:00:00.000Z (Drift: 0 ms)
  [PASS] Sub-minute precision: 2026-10-10T06:00:45.123Z (Preserved: true)

2. Testing in Timezone: Asia/Kolkata
  [PASS] Formatted input: 2026-10-10T11:30
  [PASS] Preserved instant: 2026-10-10T06:00:00.000Z (Drift: 0 ms)
  [PASS] Sub-minute precision: 2026-10-10T06:00:45.123Z (Preserved: true)

3. Testing in Timezone: America/Los_Angeles
  [PASS] Formatted input: 2026-10-09T23:00
  [PASS] Preserved instant: 2026-10-10T06:00:00.000Z (Drift: 0 ms)
  [PASS] Sub-minute precision: 2026-10-10T06:00:45.123Z (Preserved: true)

============================================================
CONTRASTING WITH LEGACY DEFECTIVE LOGIC:
  Original Stored Instant: 2026-10-10T06:00:00.000Z
  Legacy sliced value:     2026-10-10T06:00
  Legacy re-saved in IST:  2026-10-10T00:30:00.000Z (Drift: -5.5 hours!)
  Legacy re-saved in PDT:  2026-10-10T13:00:00.000Z (Drift: +7.0 hours!)
============================================================
ALL TIMEZONE TESTS PASSED: 9/9
```

### Jest Test Suite Coverage (`__tests__/daily_astrology_legacy_content_datetime.test.ts`)
Command: `npx jest __tests__/daily_astrology_legacy_content_datetime.test.ts`

| Scenario | Test Description | Result |
|---|---|---|
| **A. Preserve unchanged instant** | Preserves exact UTC instant `"2026-10-10T06:00:00.000Z"` | **PASS** |
| **B. India-time conversion** | `formatInstantToKolkataDatetimeInput` converts to `"2026-10-10T11:30"` | **PASS** |
| **B. India-time conversion** | `parseKolkataDatetimeInputToInstant` returns unchanged instant | **PASS** |
| **B. India-time conversion** | `parseKolkataDatetimeInputToInstant` converts edited IST wall-clock to UTC | **PASS** |
| **C. Timezone independence** | Formats local wall-clock consistently with local timezone | **PASS** |
| **D. Independent fields** | Preserves both `publishAt` and `expiresAt` when both unchanged | **PASS** |
| **D. Independent fields** | Preserves `publishAt` and handles null `expiresAt` | **PASS** |
| **D. Independent fields** | Preserves `publishAt` when `expiresAt` is cleared to empty string | **PASS** |
| **E. Default timestamp** | `getLocalCurrentDatetimeInput` produces valid `YYYY-MM-DDTHH:mm` | **PASS** |
| **E. Default timestamp** | `getKolkataCurrentDatetimeInput` produces valid IST datetime string | **PASS** |
| **F. Precision preservation** | Preserves nonzero seconds and milliseconds (`2026-10-10T06:00:45.123Z`) | **PASS** |
| **G. Edited timestamp** | Converts edited local wall-clock string to UTC instant | **PASS** |
| **H. Invalid input** | Rejects malformed strings (`"not-a-date"`, `"2026-10-10"`) | **PASS** |
| **H. Invalid input** | Rejects calendar rollover (`"2026-02-30T10:00"`) | **PASS** |
| **H. Invalid input** | Rejects unparseable instant passed to `formatInstantToLocalDatetimeInput` | **PASS** |
| **I. DST behavior** | Preserves unchanged instant during daylight saving boundaries | **PASS** |
| **I. DST behavior** | Rejects non-existent spring-forward wall-clock times in DST | **PASS** |
| **J. Form regression** | Preserves timestamps when unrelated fields are edited | **PASS** |
| **Source Verification** | Confirms `content-form-modal.tsx` no longer contains `slice(0, 16)` | **PASS** |
| **Source Verification** | Confirms `content-form-modal.tsx` no longer uses naive `new Date(publishAt).toISOString()` | **PASS** |
| **Source Verification** | Confirms `content-form-modal.tsx` validates `expiresAt > publishAt` constraint | **PASS** |

**Summary**: 21/21 passed.

---

## 9. Existing Feature Regression Results

All existing regression suites and contracts from AST-01 through AST-13 were executed and passed completely:

| Test Suite | Scope | Result |
|---|---|---|
| `npx jest __tests__/daily_astrology` | Complete Daily Astrology Jest suite (13 test suites) | **PASS** (13 passed, 239/239 tests) |
| `node scratch/test_ast_13_timezone_stepping.mjs` | AST-13 Timezone-independent calendar date navigation | **PASS** (4/4 tests) |
| `node scratch/test_ast_12_csv_preview_lifecycle.mjs` | AST-12 CSV parsing, preview lifecycle, and validation | **PASS** (3/3 tests) |
| `node scratch/test_ast_11_csv_identity.mjs` | AST-11 Composite CSV identity & overwrite enforcement | **PASS** (4/4 tests) |
| `python scratch/test_ast_11_db_overwrite_concurrency.py` | AST-11 Live DB overwrite guard & concurrency | **PASS** (All scenarios passed) |
| `node scratch/test_ast_10_publishing_results.mjs` | AST-10 Partial-publishing result handling | **PASS** (7/7 tests) |
| `python scratch/test_astrology_optimistic_concurrency.py` | AST-09 Optimistic Concurrency Control (OCC) | **PASS** (8/8 scenarios passed) |
| `node scratch/test_astrology_matrix_coordinator.mjs` | AST-08 Matrix state coordination | **PASS** (13/13 tests) |

---

## 10. TypeScript, ESLint, and Build Validation

### TypeScript Compilation
- **Command**: `npx tsc --noEmit` in `C:\Projects\kashi-veda-admin`
- **Output**: Clean exit (0 errors).

### ESLint Check
- **Command**: `npx eslint components/admin/astrology/modals/content-form-modal.tsx lib/astrology/astrology-datetime-utils.ts` in `C:\Projects\kashi-veda-admin`
- **Output**: Clean exit (0 errors, 0 warnings).

### Production Build Check
- **Command**: `npm run build` in `C:\Projects\kashi-veda-admin`
- **Outcome**: All astrology components and modules compiled cleanly into Next.js routes.
- **Unrelated Known Issue**: As documented in the audit prompt, Next.js build encounters the pre-existing error in `app/(dashboard)/reviews/page.tsx` (`Type error: Route has an invalid "default" export: Type is not a valid Page component`). This file was strictly left untouched.

---

## 11. Remaining Limitations & Unverified Behavior

1. **HTML `datetime-local` Native Step**:
   The native `<input type="datetime-local">` control without a `step="1"` attribute only allows picking hours and minutes. While our pristine tracking preserves existing seconds/milliseconds perfectly when unchanged, if a user deliberately modifies a timestamp using the browser input, the newly selected value will have 00 seconds and 000 milliseconds. This is standard behavior for datetime pickers.
2. **Pre-Existing Reviews Page Issue**:
   The TypeScript error in `app/(dashboard)/reviews/page.tsx` continues to prevent a complete standalone Next.js production build bundle from completing. This is unrelated to the astrology system and was preserved untouched.

---

## 12. Explicit Confirmation of Subsequent Findings

**AST-15 and later findings were NOT implemented.** Work was strictly confined to AST-14.

---

## 13. Explicit Confirmation of Database & Migration Integrity

- **No migrations deployed or executed**: No Supabase migration was created, altered, or pushed to any remote or local database.
- **No production database modified**: All tests were executed using mocked environments, deterministic node runners, or local test transactions.
- Migrations `001` through `050` remain intact and unedited.
