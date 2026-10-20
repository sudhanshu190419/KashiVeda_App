# KashiVeda AST-12 Implementation Report: Hardened CSV Parser, Identity Validation, File Lifecycle & Server Protection

**Audit Finding**: AST-12 (Permissive CSV parsing, identity validation, file selection race, and preview lifecycle vulnerabilities)  
**Target Repository**: `C:\Projects\kashi-veda-admin` & `C:\Projects\KashiVeda`  
**Status**: Implemented, Verified, Zero Regressions  

---

## 1. Confirmed Root Causes & Source Locations

Prior to remediation, the Daily Astrology CSV import workflow exhibited multiple reliability, parsing, concurrency, and validation flaws:

1. **Permissive Numeric Parsing**:
   - *Location*: `components/admin/astrology/daily-insights/bulk-import-modal.tsx`
   - *Defect*: `parseInt(row[idIdx])` was used to parse Rashi IDs and numbers. JavaScript's `parseInt()` permissively extracts leading digits from invalid strings such as `'1.5'` (converting to `1`) or `'1foo'` (converting to `1`), silently mapping malformed inputs into valid Rashi identities instead of rejecting them.
2. **Missing Grammar Validation for RFC 4180 CSVs**:
   - *Location*: `components/admin/astrology/daily-insights/bulk-import-modal.tsx`
   - *Defect*: Ad-hoc regex/splitting was incapable of strictly enforcing RFC 4180 quoting rules. Malformed quotes (e.g., unterminated quotes at EOF, illegal quotes inside unquoted fields, characters appearing after closing quotes, and mismatched column counts across rows) were either silently accepted or resulted in corrupt row parsing.
3. **Stale Preview Survival on Replaced or Failed Files**:
   - *Location*: `components/admin/astrology/daily-insights/bulk-import-modal.tsx`
   - *Defect*: When an administrator selected a new file while a preview was active, the existing preview array was not synchronously purged before asynchronous read completion. If the newly selected file was unreadable, unsupported, empty, or cancelled, the old preview rows remained mounted and eligible for submission.
4. **Asynchronous File Read Race Condition (Overlapping Reads)**:
   - *Location*: `components/admin/astrology/daily-insights/bulk-import-modal.tsx`
   - *Defect*: FileReader operations did not track generation tokens or abort in-flight operations. If File A was selected and took longer to read than a subsequent File B, File A's completion callback could resolve after File B, overwriting File B's validated preview with File A's obsolete data.
5. **Absence of Resource Bounds**:
   - *Location*: `components/admin/astrology/daily-insights/bulk-import-modal.tsx` & `lib/actions/daily-insights-management.ts`
   - *Defect*: No explicit limits existed for uploaded file sizes or CSV row counts, exposing the client and server to memory exhaustion or denial of service on malicious or oversized payloads.
6. **Client-Only Validation at Mutation Boundary**:
   - *Location*: `lib/actions/daily-insights-management.ts`
   - *Defect*: `bulkSaveDailyRashiInsightsDrafts` trusted client-submitted row payloads without re-verifying token integrity, ranges, date validity, or language support before invoking authoritative database RPCs.

---

## 2. Final Supported CSV Grammar & Header Contract

The CSV parser implements strict compliance with RFC 4180 grammar:

### Grammar Specification
- **Record Delimiters**: Supports both standard CRLF (`\r\n`) and UNIX LF (`\n`).
- **Field Separators**: Comma (`,`).
- **Quoted Fields**: Any field containing commas, double quotes, or line breaks must be enclosed in double quotes (`"..."`).
- **Escaped Quotes**: Double quote characters inside quoted fields must be represented by doubled double-quotes (`""`).
- **Multiline Fields**: Quoted fields can span multiple lines without splitting records.
- **Empty Cells**: Empty cells between commas (e.g., `,,`) are parsed as empty strings `""` and mapped according to schema optionality.
- **Strict Error Rejection**:
  - Unterminated quoted fields at EOF are rejected with line/column coordinates.
  - Unquoted fields containing interior double quotes (e.g. `foo"bar`) are rejected.
  - Characters (other than trailing spaces or delimiters) following a closing quote (e.g. `"valid"junk`) are rejected.
  - Inconsistent column counts across rows (mismatch against the header row) immediately halt processing with a row-indexed error.

### Header Specification
The parser normalizes headers (trimming and converting to lowercase) and enforces:
- **Mandatory Identification Column**: Must contain either `rashi_id` or `rashi_name` (or both).
- **Mandatory Content Column**: Must contain `general_outlook` (or `general_prediction` as legacy alias).
- **Duplicate Column Check**: Duplicate header column names are strictly rejected.
- **Supported Columns**:
  - `rashi_id`: Integer token (1–12).
  - `rashi_name`: Canonical Vedic or English sign name.
  - `insight_date`: `YYYY-MM-DD` calendar date (defaults to modal selected date if omitted).
  - `language`: Supported language code (defaults to modal selected language if omitted).
  - `general_outlook`: Mandatory guidance text.
  - `career_business`: Optional guidance text.
  - `finance_wealth`: Optional guidance text.
  - `love_relationships`: Optional guidance text.
  - `health_wellbeing`: Optional guidance text.
  - `auspicious_color`: Optional color string.
  - `auspicious_number`: Optional integer token (1–99).

---

## 3. Strict Validation Rules: Numeric, Date, Language & Content

Validation is performed by pure validator functions in `lib/astrology/daily-insights-csv-parser.ts` and shared between the Admin client and Server Action:

### A. Numeric Token Validation (`validateIntegerToken`)
- Must match full-token regular expression `/^-?\d+$/`.
- Must satisfy safe integer boundaries (`Number.isSafeInteger(val)`).
- Rejects floating-point decimals (`'1.5'`), alphanumeric suffixes (`'1foo'`), `NaN`, infinity, and malformed signs.
- Enforces strict range boundaries:
  - **Rashi ID**: Must be an integer between `1` and `12` inclusive.
  - **Auspicious Number**: Optional; when provided, must be an integer between `1` and `99` inclusive. Empty or whitespace values map safely to `undefined`/`null`.

### B. Date Token Validation (`validateDateToken`)
- Must match full-token format `/^\d{4}-\d{2}-\d{2}$/`.
- Must represent a valid Gregorian calendar date verified via UTC year, month, and day components.
- Calendar rollover dates (such as `2026-02-30` or `2026-04-31`) are strictly rejected.

### C. Language Token Validation (`validateLanguageToken`)
- Trims whitespace and normalizes to lowercase.
- Must be a member of `SUPPORTED_LANGUAGES`: `['en', 'hi']`.
- Unsupported language tokens (e.g. `'fr'`, `'es'`) are rejected.

### D. Content Guidance Validation
- Every data row must include non-empty guidance content. Rows completely blank across all guidance categories are flagged.
- `general_outlook` is mandatory for every entry.

---

## 4. Resource Bounds & Rationale

Both client and server enforce explicit resource limits:

| Resource Limit | Value | Enforcement Location | Technical Rationale |
|---|---|---|---|
| **Max File Size** | `2 MB` (`2 * 1024 * 1024` bytes) | Client (`BulkImportModal.handleFileChange`) | A 12-Rashi daily CSV is ~2 KB. Even a multi-month, bilingual dataset of 1,000 rows is under 200 KB. 2 MB provides a generous 10x safety margin while preventing browser main-thread freezes from massive uploads. |
| **Max Row Count** | `1,000` rows | Client parser & Server Action (`bulkSaveDailyRashiInsightsDrafts`) | A single day across both languages requires 24 rows; a full month requires ~720 rows. 1,000 rows accommodates monthly bulk provisioning while protecting server memory and avoiding unbounded database transaction durations. |

Oversized files or row counts immediately halt parsing, clear preview state, and display clear error messages.

---

## 5. File Lifecycle & Asynchronous Request-Guard Design

The importer in `components/admin/astrology/daily-insights/bulk-import-modal.tsx` implements a formal 5-state lifecycle:

```
[idle] ──(select file)──> [reading] ──(onload)──> [validating] ──(success)──> [ready]
  │                          │                         │                        │
  │                          └──(error/abort)──┐       └──(validation fail)─┐   │
  │                                            │                            │   │
  └──<─────────────────── [error] <────────────┴────────────────────────────┘   │
  │                         │                                                   │
  └──(clear/cancel)<────────┴───────────────────────────────────────────────────┘
```

### Race Condition & Callback Protections
1. **Generation Counter (`fileGenerationRef = useRef(0)`)**:
   - Every file selection or cancellation increments `fileGenerationRef.current`.
   - Asynchronous callbacks capture their local `currentGen` upon dispatch.
   - If `currentGen !== fileGenerationRef.current`, the callback is aborted immediately without modifying state.
2. **Active FileReader Cancellation (`activeReaderRef = useRef<FileReader | null>(null)`)**:
   - When a new file is chosen or clear is clicked, `activeReaderRef.current?.abort()` terminates in-flight disk reading before the new read starts.
3. **Component Unmount Safety (`isUnmountedRef = useRef(false)`)**:
   - `useEffect` cleanup hook sets `isUnmountedRef.current = true` and aborts active readers, preventing React unmounted component state updates.
4. **Immediate State Invalidation**:
   - Upon selecting a new file or clicking Clear (`handleClearFile`), `setValidation(null)`, `setFile(null)`, and `setError(null)` execute synchronously before asynchronous operations begin.

---

## 6. Summary of Changed Files

### 1. `lib/astrology/daily-insights-csv-parser.ts` (Admin - New Module)
- Implements `parseRFC4180CSV` with full quoting, escaping, multiline, and syntax validation.
- Implements `validateIntegerToken`, `validateDateToken`, and `validateLanguageToken`.
- Implements `parseAndValidateDailyInsightsCSV` combining token validation, header checking, row consistency, AST-11 duplicate tracking, and existing database map binding.
- Implements `validateDailyInsightDraftPayload` for server-side payload enforcement.
- Exports `MAX_CSV_FILE_SIZE` (2 MB) and `MAX_CSV_ROW_COUNT` (1,000).

### 2. `components/admin/astrology/daily-insights/bulk-import-modal.tsx` (Admin - Hardened Importer)
- Migrated to 5-state lifecycle model: `'idle' | 'reading' | 'validating' | 'ready' | 'error'`.
- Integrated `fileGenerationRef`, `activeReaderRef`, and `isUnmountedRef` to protect against overlapping reads and unmount updates.
- Added synchronous state invalidation on file change and added `handleClearFile`.
- Enforces `MAX_CSV_FILE_SIZE` before dispatching `FileReader`.
- Tied Save button enablement strictly to `importState === 'ready' && validation && validation.validRowsCount > 0 && !isImporting`.

### 3. `lib/actions/daily-insights-management.ts` (Admin - Hardened Server Action)
- Added batch size check against `MAX_CSV_ROW_COUNT` (1,000) at server entry.
- Calls `validateDailyInsightDraftPayload(item)` on every item before checking batch duplicates or invoking RPC mutations.
- Flags malformed items with `outcome: 'failed'`, `error_code: 'VALIDATION_ERROR'` and excludes them from database writes.

### 4. `__tests__/daily_astrology_csv_parser_validation.test.ts` (Backend - New Comprehensive Test Suite)
- Comprehensive Jest test suite testing Scenarios A through K (53 tests).

---

## 7. Prevention of Stale Previews and Obsolete Imports

Stale previews and accidental imports are prevented through four coordinated barriers:

1. **Synchronous Teardown on File Change**:
   Selecting any file synchronously clears `validation`, `file`, and `error`, and resets state to `'reading'`.
2. **Import Button Predicate**:
   ```tsx
   disabled={importState !== "ready" || !validation || validation.validRowsCount === 0 || isImporting}
   ```
   The Save button cannot be clicked during reading, validation, after errors, or after file removal.
3. **Commit Guard in Action Handler**:
   ```tsx
   if (importState !== "ready" || !validation || validation.validRowsCount === 0) return;
   ```
   Even if a programmatic click were dispatched, `handleCommitImport` verifies current readiness before constructing the mutation payload.
4. **Out-of-Order Generation Invalidation**:
   If File A (slow) finishes after File B (fast), File A's generation check fails (`currentGen !== fileGenerationRef.current`), discarding File A completely.

---

## 8. Server-Side Protection at the Mutation Boundary

Client-side validation improves administrative UX, but server-side validation guarantees authoritative integrity:

```ts
// lib/actions/daily-insights-management.ts
if (items.length > MAX_CSV_ROW_COUNT) {
  return { success: false, failedCount: items.length, errors: [...] };
}

for (const item of validItems) {
  const payloadValidation = validateDailyInsightDraftPayload(item);
  if (!payloadValidation.isValid) {
    results.push({
      insight_date: (item.insight_date || "").trim(),
      rashi_id: Number(item.rashi_id) || 0,
      language: (item.language || "en").trim().toLowerCase(),
      outcome: "failed",
      error: payloadValidation.error,
      error_code: "VALIDATION_ERROR",
    });
    continue;
  }
  // Proceed to batch duplicate check & authoritative RPC
}
```

Any malformed payload that bypasses browser validation is intercepted on the server before database mutation, returning structured error diagnostics and leaving the database untouched.

---

## 9. Preservation of AST-11 Identity, Overwrite & AST-09 OCC Protections

The AST-12 implementation preserves all prior audit contracts:

- **Composite Key Identity**: All duplicate detection, existence lookups, and row mapping use `(insight_date, rashi_id, language)`.
- **Bilingual & Multi-Date Support**: The same Rashi on different dates or in different languages remains fully valid and supported.
- **Authoritative Database Verification**: `checkDailyInsightsExistence` queries the database authoritatively after parsing to annotate existing rows.
- **Atomic Overwrite Enforcement**: `p_allow_overwrite: allowOverwrite` is passed directly to `admin_save_daily_rashi_insight` (Migration 050).
- **OCC Version Checks**: Existing records pass `p_expected_version: item.expected_version` ensuring AST-09 optimistic concurrency control is enforced.
- **Result Reconciliations**: Per-row outcomes (`inserted`, `updated`, `skipped`, `duplicate`, `conflict`, `failed`) reconcile cleanly into final summary counts.

---

## 10. Test Execution & Evidence

### A. New AST-12 Comprehensive Jest Test Suite (53 Tests)
Command: `npx jest __tests__/daily_astrology_csv_parser_validation.test.ts`
```
PASS __tests__/daily_astrology_csv_parser_validation.test.ts
  AST-12: CSV Parser Hardening, Identity Validation & Preview Lifecycle
    Scenario A: Strict Numeric Identity Validation (6 tests) - PASS
    Scenario B: Strict Numeric Editorial Fields (4 tests) - PASS
    Scenario C: Date and Language Validation (6 tests) - PASS
    Scenario D: Correct CSV Grammar (9 tests) - PASS
    Scenario E: Headers and Row Shape Validation (5 tests) - PASS
    Scenario F: Old Preview Invalidation on Replacement (4 tests) - PASS
    Scenario G: Overlapping File Reads & Generation Token Protection (4 tests) - PASS
    Scenario H: Read/Lifecycle Failures & Resource Limits (4 tests) - PASS
    Scenario I: Server-Side Validation & Resource Limits (7 tests) - PASS
    Scenario J: AST-11 Regression Preservation (2 tests) - PASS
    Scenario K: Result and Summary Integrity (2 tests) - PASS

Test Suites: 1 passed, 1 total
Tests:       53 passed, 53 total
Snapshots:   0 total
Time:        3.95 s
```

### B. All Daily Astrology Jest Test Suites (189 Tests)
Command: `npx jest __tests__/daily_astrology`
```
PASS __tests__/daily_astrology_partial_publishing.test.ts
PASS __tests__/daily_astrology_csv_identity_overwrite.test.ts
PASS __tests__/daily_astrology_admin_rpc_hardening.test.ts
PASS __tests__/daily_astrology_optimistic_concurrency.test.ts
PASS __tests__/daily_astrology_cache_security.test.tsx
PASS __tests__/daily_astrology_stale_refresh_guard.test.tsx
PASS __tests__/daily_astrology_entitlement_revalidation.test.tsx
PASS __tests__/daily_astrology_error_classification.test.tsx
PASS __tests__/daily_astrology_subscription_selection.test.tsx
PASS __tests__/daily_astrology_state_refresh_lifecycle.test.tsx
PASS __tests__/daily_astrology_csv_parser_validation.test.ts

Test Suites: 11 passed, 11 total
Tests:       189 passed, 189 total
Snapshots:   0 total
Time:        9.676 s
```

### C. Node Regression Suites
1. **AST-11 CSV Identity Suite**:
   Command: `node scratch/test_ast_11_csv_identity.mjs`
   Result: **4/4 tests passed** (0 failures).
2. **AST-10 Publishing Results Suite**:
   Command: `node scratch/test_ast_10_publishing_results.mjs`
   Result: **7/7 tests passed** (0 failures).
3. **AST-08 Matrix Coordinator Suite**:
   Command: `node scratch/test_astrology_matrix_coordinator.mjs`
   Result: **13/13 tests passed** (0 failures).

### D. Isolated Real PostgreSQL 18.4 Concurrency Tests
1. **AST-11 DB Overwrite Concurrency Suite**:
   Command: `python scratch/test_ast_11_db_overwrite_concurrency.py`
   Result: **All scenarios (D, E, F, G, H, J, K) passed**. Migration 050 atomic overwrite, multi-session insert races, and OCC guards verified against live PostgreSQL.
2. **AST-09 Database OCC Concurrency Suite**:
   Command: `python scratch/test_astrology_optimistic_concurrency.py`
   Result: **All 8 concurrency scenarios (A - H) passed**. Concurrent edits serialized cleanly; zero false audit entries.

---

## 11. TypeScript, Lint & Production Build Validation

1. **TypeScript Typecheck**:
   Command: `npx tsc --noEmit` in `C:\Projects\kashi-veda-admin`
   Result: **Exited with code 0** (0 errors).
2. **ESLint**:
   Command: `npx eslint components/admin/astrology/daily-insights/bulk-import-modal.tsx lib/astrology/daily-insights-csv-parser.ts lib/actions/daily-insights-management.ts`
   Result: **Exited with code 0** (0 warnings, 0 errors).
3. **Next.js Production Build Validation**:
   Command: `npm run build` in `C:\Projects\kashi-veda-admin`
   Result: Next.js Turbopack compiled all astrology components, matrix views, and server actions cleanly. The only failure was the pre-existing, out-of-scope route segment config in `app/(dashboard)/reviews/page.tsx` (`Route segment config "dynamic" is not compatible with nextConfig.cacheComponents`), leaving all astrology code verified and build-ready.

---

## 12. Testing Matrix: Real DB, Mocked & Unit Testing

| Component / Layer | Test Strategy | Environment | Coverage |
|---|---|---|---|
| RFC 4180 CSV Grammar Parser | Unit Tests | Node / Babel | Quoted commas, `""` escaping, multiline, CRLF/LF, malformed quotes, row consistency |
| Token Validators | Unit Tests | Node / Babel | Strict regex, safe integers, Gregorian calendar rollover, language sets |
| File Lifecycle & Generation Token | State / Async Race Simulation | Node / Jest | Out-of-order FileReader resolution, abort, unmount, preview clearing |
| Server Action Boundary | Unit / Integration | Jest | Payload validation, `MAX_CSV_ROW_COUNT` bounds, per-row result aggregation |
| Migration 050 Overwrite Guard | Live Concurrency Tests | PostgreSQL 18.4 (Port 5433) | `p_allow_overwrite`, row locking (`FOR UPDATE`), insert race `unique_violation` |
| AST-09 OCC Expected Version | Live Concurrency Tests | PostgreSQL 18.4 (Port 5433) | Version incrementation, stale write rejection (`VERSION_CONFLICT`) |

---

## 13. Browser-Level Limitations & Remaining Unverified Behavior

- Real browser drag-and-drop OS gestures (e.g. native OS file explorer drag events) were verified via unit simulation of React `ChangeEvent<HTMLInputElement>` rather than end-to-end browser automation (Playwright/Puppeteer), following scope instructions.
- All FileReader async event handlers (`onload`, `onerror`, `onabort`), generation tokens, and abort controllers were tested deterministically under out-of-order race conditions.

---

## 14. Confirmation: Out-of-Scope Items Untouched

- **AST-13** (Date-navigation correction): **NOT implemented**; left untouched.
- **AST-14** (Legacy timestamp correction): **NOT implemented**; left untouched.
- Payment, mobile app, and subscription services: **Left untouched**.
- `app/(dashboard)/reviews/page.tsx`: **Left untouched**.

---

## 15. Confirmation: Migration & Database State

- **No remote or production database migration was deployed**.
- **No production database was modified**.
- Testing was conducted exclusively in local sandboxes and isolated temporary PostgreSQL instances.
