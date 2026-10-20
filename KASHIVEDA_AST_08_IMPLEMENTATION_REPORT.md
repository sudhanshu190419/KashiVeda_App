# KashiVeda AST-08 — Admin Daily Astrology Matrix Date/Language Synchronization & Mutation Key Guard Implementation Report

**Date:** October 10, 2026  
**Scope:** Admin Daily Astrology Editorial Matrix (AST-08 Remediation)  
**Target Repository:** `C:\Projects\kashi-veda-admin`  
**Mobile & Backend Reference:** `C:\Projects\KashiVeda`  
**Reference Audit:** `KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md` (Finding AST-08)  
**Status:** Implemented, Tested, and Verified  

---

## 1. Executive Summary

This report documents the implementation and verification of the fix for **AST-08** from the Feature 02 Astrology audit.

In the original Admin Daily Astrology Matrix, the displayed data rows and the selected date/language filter controls were stored as detached React states. When an administrator changed the date or language:
1. Filter controls updated immediately while the table continued displaying stale rows from the previous date/language during network latency.
2. The stale rows remained interactive and editable. When an administrator clicked a cell or opened an editor, the modal derived its write key `(insight_date, language)` from the newly selected controls while populating form fields from the older row snapshot, causing writes to overwrite the wrong date or language.
3. In bulk operations ("Save All as Draft", "Publish Daily Set", and Bulk CSV Import), write keys were constructed by mixing the new filter controls with the old row snapshots.
4. Overlapping asynchronous matrix fetch requests lacked request-generation tokens or cancellation; an older slow response could resolve after a newer response and overwrite the latest matrix.
5. In the Server Action `getDailyRashiInsightsMatrix`, database errors from Supabase were caught and logged without throwing, silently converting database failures into false "12 missing rows" states.

To resolve AST-08, we introduced an explicit **Matrix Identity Coordinator** (`lib/astrology/daily-insights-matrix-coordinator.ts`), bound all loaded matrix state to an explicit identity key, guarded against out-of-order responses using generational tokens, made all stale rows non-editable, invalidated open modals upon filter changes, and strictly bound all mutation operations to the authoritative loaded matrix identity.

---

## 2. Root Causes Confirmed from Current Admin Source

An in-depth inspection of `components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx` and related modals confirmed the exact vulnerabilities identified in the audit:

### 2.1 State Detachment Between Filter Controls and Matrix Data
In `DailyInsightsMatrixView`:
```tsx
const [matrix, setMatrix] = useState<DailyInsightsMatrixResponse>(initialData);
const [selectedDate, setSelectedDate] = useState<string>(initialData.date);
const [selectedLanguage, setSelectedLanguage] = useState<string>(initialData.language);
```
`selectedDate` and `selectedLanguage` updated immediately upon user input, but `matrix` only updated upon completion of the asynchronous transition. No invariant or synchronization predicate linked `(selectedDate, selectedLanguage)` to `(matrix.date, matrix.language)`.

### 2.2 Stale Rows Remained Visible and Fully Editable During Fetch
While a new matrix was loading (`isPending = true`), the table continued rendering rows from the previous date/language. Table cells, row-level "Edit"/"Create" buttons, "Save All as Draft", "Publish Daily Set", and "Bulk Import" remained interactive.

### 2.3 Write Key Reconstructed from Changed Filter Controls
- **Individual Field Modal (`DailyInsightFieldModal`)**: Passed `date={selectedDate}` and `language={selectedLanguage}`, but `existingInsight={activeFieldSlot.insight}` from the older matrix. In `handleSubmit`, the payload used `insight_date: date` and `language: language` combined with `existingInsight` field values.
- **Full Form Modal (`DailyInsightsFormModal`)**: Similarly passed `date={selectedDate}` and `language={selectedLanguage}` while populating state from the older `existingInsight`.
- **Bulk Save as Draft (`handleBulkSaveDrafts`)**: Mapped `matrix.slots` (older date) with `insight_date: selectedDate` (newer date) and `language: selectedLanguage` (newer language). If an admin switched from Oct 10 to Oct 11 and clicked "Save All as Draft" while the fetch was pending, Oct 10's content was committed into Oct 11's database records.
- **Publish Daily Set**: Triggered readiness validation and set publishing against `selectedDate` and `selectedLanguage`, despite the administrator visually inspecting the previous date's rows.
- **CSV Importer (`BulkImportModal`)**: Used `selectedDate` and `selectedLanguage` for conflict detection against `matrix.slots` from the previous date.

### 2.4 Lack of Request Serialization (Out-of-Order Race Condition)
In `handleFetchMatrix`:
```tsx
const handleFetchMatrix = (date: string, lang: string) => {
  startTransition(async () => {
    try {
      const res = await getDailyRashiInsightsMatrix({ date, language: lang });
      setMatrix(res);
    } catch (err) { ... }
  });
};
```
No generation token or cancellation existed. If Request A (Oct 10, slow) resolved after Request B (Oct 11, fast), `setMatrix(res)` from Request A would overwrite Request B, leaving the Admin UI displaying Oct 10 data while the controls indicated Oct 11.

### 2.5 Silent Masking of Database Failures
In `lib/actions/daily-insights-management.ts`:
```tsx
const { data, error } = await supabase.from("daily_rashi_insights").select("*")...;
if (error) {
  console.error("Error querying daily_rashi_insights:", error);
}
```
If a database connection error occurred, `data` was `null`, which defaulted to `[]` and returned a valid response with 12 missing slots (`missingCount: 12`), misleading administrators into believing content was missing rather than reporting a backend failure.

---

## 3. Exact Files Changed and Rationale

| File Path | Description of Changes |
|---|---|
| `C:\Projects\kashi-veda-admin\lib\astrology\daily-insights-matrix-coordinator.ts` | **New file:** Pure, testable matrix identity coordinator module. Defines `getMatrixIdentityKey`, `isMatrixSynced`, `MatrixRequestCoordinator` (request generation tokens), `isModalBoundKeyValid`, `validateWriteKeyIntegrity`, and `validateBulkDraftCoherence`. |
| `C:\Projects\kashi-veda-admin\lib\actions\daily-insights-management.ts` | **Hardened error handling:** Modified `getDailyRashiInsightsMatrix` to explicitly throw an `Error` when Supabase returns a query error, preventing failed database requests from being masqueraded as 12 empty missing slots. |
| `C:\Projects\kashi-veda-admin\components\admin\astrology\daily-insights\daily-insights-matrix-view.tsx` | **Core UI integration:** Added `fetchError` state and `MatrixRequestCoordinator` ref; computed `isSynced` predicate; invalidated all open modals on filter change; blocked all mutation handlers and disabled UI cells/buttons when `!isSynced`; bound bulk saves, set publishing, and modals strictly to `matrix.date` and `matrix.language`; added visual synchronization and error states. |
| `C:\Projects\kashi-veda-admin\components\admin\astrology\daily-insights\daily-insight-field-modal.tsx` | **Write-key guard:** Added `boundMatrixKey` and `currentSelectedKey` props; added mismatch warning banner; disabled save button and rejected `handleSubmit` if modal key does not match current selection. |
| `C:\Projects\kashi-veda-admin\components\admin\astrology\daily-insights\daily-insights-form-modal.tsx` | **Write-key guard:** Added `boundMatrixKey` and `currentSelectedKey` props; added mismatch warning banner; blocked `handleSubmit` on key change. |
| `C:\Projects\kashi-veda-admin\components\admin\astrology\daily-insights\publish-daily-set-modal.tsx` | **Lint & contract cleanup:** Removed unused imports; ensured modal receives authoritative loaded matrix date and language. |
| `C:\Projects\kashi-veda-admin\components\admin\astrology\daily-insights\bulk-import-modal.tsx` | **Lint & context binding:** Removed unused imports; bound importer defaults to authoritative loaded matrix date and language. |

---

## 4. The Matrix Identity Representation

The loaded matrix identity is represented deterministically using canonical formatting:

```ts
export function getMatrixIdentityKey(date: string, language: string = 'en'): string {
  return `${(date || '').trim()}::${(language || 'en').trim().toLowerCase()}`;
}
```

The synchronization state of the matrix is determined by the `isMatrixSynced` predicate:
```ts
export interface MatrixSyncCheckParams {
  selectedDate: string;
  selectedLanguage: string;
  loadedDate?: string | null;
  loadedLanguage?: string | null;
  isPending: boolean;
  hasError: boolean;
}

export function isMatrixSynced(params: MatrixSyncCheckParams): boolean {
  if (params.isPending || params.hasError) {
    return false;
  }
  if (!params.loadedDate || !params.loadedLanguage) {
    return false;
  }
  const selectedKey = getMatrixIdentityKey(params.selectedDate, params.selectedLanguage);
  const loadedKey = getMatrixIdentityKey(params.loadedDate, params.loadedLanguage);
  return selectedKey === loadedKey;
}
```

In `DailyInsightsMatrixView`:
- `selectedKey = getMatrixIdentityKey(selectedDate, selectedLanguage)`
- `loadedKey = getMatrixIdentityKey(matrix.date, matrix.language)`
- `isSynced = isMatrixSynced({ selectedDate, selectedLanguage, loadedDate: matrix.date, loadedLanguage: matrix.language, isPending, hasError: Boolean(fetchError) })`

---

## 5. Request-Generation and Stale-Response Behavior

The `MatrixRequestCoordinator` class provides generational request tracking:

1. **Monotonically Increasing Generation Token**: Calling `startRequest(date, language)` increments `currentGen += 1` and returns the new token.
2. **Immediate Invalidation**: When an administrator selects a new date or language, a new request is started, immediately invalidating any prior in-flight request token.
3. **Out-of-Order Response Drop**: When a response resolves:
   ```ts
   if (token !== coordinatorRef.current.getCurrentGeneration()) {
     return; // Older response ignored
   }
   if (getMatrixIdentityKey(res.date, res.language) !== selectedKeyRef.current) {
     return; // Target mismatch ignored
   }
   ```
4. **Obsolete Error Isolation**: If an older request fails after a newer request has started, the error is discarded:
   ```ts
   if (token !== coordinatorRef.current.getCurrentGeneration()) {
     return; // Obsolete failure ignored
   }
   ```
5. **Unmount Protection**: An `isMountedRef` and cleanup effect call `coordinator.invalidate()` on component unmount, preventing state updates on unmounted instances.

---

## 6. How Stale State is Blocked from Each Mutation Path

When `isSynced` is `false` (during transition, when filter controls differ from loaded rows, or upon fetch failure):

1. **Individual Field Editor**:
   - Table cell click: `onClick={() => isSynced && handleOpenFieldEditor(...)}`.
   - Cell styling: `cursor-not-allowed opacity-60`, tooltip: `"Editing locked while matrix is loading or desynchronized"`.
   - Handler guard: `handleOpenFieldEditor` checks `if (!isSynced) return;`.
2. **Full Insight Form**:
   - Row-level "Create" / "Edit" button: `disabled={!isSynced}`.
   - Handler guard: `handleOpenFullEditor` checks `if (!isSynced) return;`.
3. **Bulk Save All as Draft**:
   - Header button: `disabled={!isSynced || isSavingDrafts || isPending}`.
   - Handler guard: `handleBulkSaveDrafts` verifies `if (!isSynced) return;`.
   - Write key derivation: Payload items explicitly derive `insight_date: matrix.date` and `language: matrix.language` from the loaded matrix rather than `selectedDate`/`selectedLanguage`.
4. **Publish Daily Set**:
   - Header button: `disabled={!isSynced || isPending}`.
   - Handler guard: `handleOpenPublishModal` and `handleConfirmPublishSet` verify `if (!isSynced) return;`.
   - RPC execution: Validates and publishes strictly for `matrix.date` and `matrix.language`.
5. **Bulk CSV Import**:
   - Header button: `disabled={!isSynced || isPending}`.
   - Handler guard: `handleOpenBulkImport` verifies `if (!isSynced) return;`.
   - Target context: Bound to `selectedDate={matrix.date}` and `selectedLanguage={matrix.language}`.

---

## 7. How Open Modals are Invalidated on Filter Changes

1. **Immediate Modal Closure**: In `handleDateChange` and `handleLanguageChange`, all active modal states are cleared synchronously:
   ```ts
   setActiveFieldSlot(null);
   setActiveFullSlot(null);
   setIsPublishModalOpen(false);
   setIsBulkImportOpen(false);
   ```
2. **Modal Binding Tokens**: When opened, modals receive:
   - `boundMatrixKey`: The exact matrix identity (`matrix.date::matrix.language`) at the moment of opening.
   - `currentSelectedKey`: The outer component's current filter identity.
3. **Modal UI Invalidation**: If the outer key changes while a modal is mounted:
   - An alert banner is rendered: `Matrix Selection Changed: This editor is bound to [X], but the matrix is now set to [Y]. Saving is disabled to prevent data corruption.`
   - The Save / Submit button is set to `disabled`.
4. **Submit Guard**: In `handleSubmit`:
   ```ts
   if (isKeyMismatched) {
     setError("Matrix key changed: selected date or language has changed while this editor was open. Please close and reopen from the current matrix.");
     return;
   }
   ```

---

## 8. Test Setup and Execution Results

### 8.1 Dedicated AST-08 Test Suite (`scratch/test_astrology_matrix_coordinator.mjs`)
Executed via Node.js v22 native test runner:
`node --experimental-strip-types --no-warnings scratch/test_astrology_matrix_coordinator.mjs`

| Test ID | Scenario | Result |
|---|---|---|
| **Test A** | Old date response arrives last (Request B completes before Request A) | **PASS** (Obsolete Request A dropped; Oct 11 preserved) |
| **Test B** | 3 Requests (Oct 10 en, Oct 11 en, Oct 11 hi) resolving in various out-of-order sequences | **PASS** (Tested sequences [3,1,2], [2,3,1], [1,2,3]; latest selection always wins) |
| **Test C** | Editing and mutation actions blocked while new matrix loads or is desynchronized | **PASS** (isMatrixSynced returns false for pending, date diff, lang diff) |
| **Test D** | Modal invalidated when selected matrix key changes while modal is open | **PASS** (isModalBoundKeyValid returns false, write validation rejected) |
| **Test E** | Field-edit write key strictly matches row snapshot identity | **PASS** (Target mismatch rejected) |
| **Test F** | Full-form save targets the exact date/language identity as loaded row | **PASS** (Identity verified) |
| **Test G** | Bulk draft save rejects mixed or stale matrix snapshots | **PASS** (validateBulkDraftCoherence rejects inconsistent keys) |
| **Test H** | 12-Rashi publication set cannot be triggered while selected key and loaded matrix disagree | **PASS** (Publishing blocked when desynchronized) |
| **Test I** | Failed current matrix request is not masked as missing rows, keeps editing locked | **PASS** (Error recorded, editing locked, retry available) |
| **Test J** | Obsolete request failure does not overwrite newer successful state | **PASS** (Obsolete failure ignored) |
| **Test K** | Invalidation upon unmount blocks in-flight responses and errors | **PASS** (Clean unmount handling) |
| **Test L** | Successfully loaded empty matrix is treated as synchronized, not an error | **PASS** (Valid empty slots recognized) |
| **Test M** | Canonical key formatting and English/Hindi language handling | **PASS** (Key normalization verified) |

**Result: 13 tests passed, 0 failures.**

### 8.2 Prior Editorial Matrix Regressions
- `scratch/test_editorial_matrix_focus.mjs`: **8/8 tests passed** (0.016s).
- `scratch/test_field_specific_modal.mjs`: **15/15 tests passed** (0.020s).
- `scratch/test_bulk_import_and_field_modal.mjs`: **14/14 tests passed** (0.029s).

### 8.3 TypeScript Compiler Check
Command: `powershell -Command "cd 'C:\Projects\kashi-veda-admin'; npx tsc --noEmit"`  
Result: **0 errors** (Clean compilation across the entire admin application).

### 8.4 ESLint Verification
Command: `powershell -Command "cd 'C:\Projects\kashi-veda-admin'; npx eslint components/admin/astrology/ lib/astrology/ lib/actions/daily-insights-management.ts"`  
Result: **0 errors, 0 warnings** across all modified daily insights files.

### 8.5 Production Build Check (`next build`)
When executing `npm run build` in `C:\Projects\kashi-veda-admin`, Next.js 16.3.8 reported a Turbopack route configuration error in an unrelated route segment:
`./app/(dashboard)/reviews/page.tsx:5:14: Error: Route segment config "dynamic" is not compatible with nextConfig.cacheComponents.`
In accordance with project scope rules, this unrelated route segment was not modified.

---

## 9. Component-Level & Integration Checks Remaining

Because `C:\Projects\kashi-veda-admin` does not have React Testing Library or Playwright installed, pure logical request coordination and key validation was executed via `scratch/test_astrology_matrix_coordinator.mjs`. Full browser-level DOM rendering and live Supabase end-to-end clicks remain to be validated during system-level administrative testing.

---

## 10. Confirmation of Scope Restrictions

1. **AST-09 and Later Findings**: Whole-row optimistic concurrency/version checks (AST-09), partial set publishing error handling (AST-10), and CSV parser redesigns (AST-11/12) were **not** implemented.
2. **Database & Infrastructure Integrity**: No Supabase database migrations were modified or created. No payment, booking, or mobile application code was modified.
3. **AST-01 Security**: The RPC contracts and execution privileges established in AST-01 and AST-07 remain completely intact.
