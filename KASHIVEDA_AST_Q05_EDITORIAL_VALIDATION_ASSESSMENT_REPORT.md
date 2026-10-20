# KashiVeda Feature 02 — AST-Q05 Editorial Validation Assessment Report

**Document Status:** Final Assessment Report  
**Investigation Type:** Read-Only Source Code, Validation Contract, and Data Layer Audit  
**Target Finding:** AST-Q05 — Daily Rashi Insight Validation Contract, Editorial Completeness, Text Limits & Auspicious Number  
**Repositories Inspected:**  
- Mobile Application & Backend Migrations: `C:\Projects\KashiVeda`  
- Administrative Web Portal: `C:\Projects\kashi-veda-admin`  
**Date of Assessment:** 2026-10-11  

---

## 1. Executive Summary

### 1.1 Objective & Context
This assessment investigates audit finding **AST-Q05** from the KashiVeda Feature 02 Daily Astrology and Subscriptions audit. Specifically, it establishes the actual validation contract for daily Rashi insight authoring, saving, publication, and mobile presentation. It determines:
1. Which content fields are required versus optional at each architectural layer.
2. Whether partial editorial content (e.g., publishing only a general outlook without career, finance, love, or health guidance) is permitted.
3. What text-length restrictions exist across form inputs, server actions, CSV imports, and database schemas.
4. The exact input, persistence, and presentation contract for `auspicious_number`, including the handling of `NULL`, `0`, negatives, decimals, non-numeric strings, and out-of-range values.

### 1.2 Core Findings Summary
1. **Editorial Completeness Contract (Partial Content Permitted):**
   - **Database Schema:** Only `general_outlook` is marked `NOT NULL` in `public.daily_rashi_insights` ([supabase/migrations/045_daily_vedic_astrology_insights.sql#L33](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L33)). All four thematic sections (`career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`) and both attributes (`auspicious_color`, `auspicious_number`) are nullable.
   - **Database RPCs:** `public.admin_save_daily_rashi_insight` ([supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql#L86](file:///C:/Projects/KashiVeda/supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql#L86)) checks **only** `p_general_outlook` when `p_status = 'published'`. None of the other six content fields are validated or required.
   - **Admin Publication Workflows:** Both single-record publishing and the 12-Rashi set publishing workflow (`publishDailyRashiInsightsSet`) require only `general_outlook.trim().length > 0`. A complete 12-Rashi set can be published with zero career, finance, love, health, or lucky number data.
   - **Mobile Client:** The mobile card ([DailyRashiInsightCard.tsx#L245-L302](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx#L245-L302)) natively supports partial content: each thematic section is individually guarded by truthiness checks (`{insight.career_business ? (...) : null}`) and omitted if null.
2. **Confirmed Lucky Number Contract Inconsistency:**
   - **Bulk CSV Parser Layer:** Strictly validates `auspicious_number` using `validateIntegerToken(token, { min: 1, max: 99, required: false })` ([daily-insights-csv-parser.ts#L535](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts#L535)). The CSV parser **rejects** `0`, negative numbers, decimals, non-integers, and numbers greater than `99`.
   - **Admin Manual Form Layer:** Uses an unconstrained `<Input id="auspicious_number">` with **no validation**. Authors can enter `0`, `-5`, `1000`, or `"seven"`.
   - **Server Action Layer:** `saveDailyRashiInsight` performs only `formData.auspicious_number && !isNaN(Number(...)) ? Number(...) : null` ([daily-insights-management.ts#L169](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L169)). It allows `0`, negative numbers, and numbers `> 99` to reach the database, while non-numeric strings are silently converted to `null` without notifying the author.
   - **Database Layer:** `auspicious_number` is an SQL `INTEGER` with **no CHECK constraint**, allowing any integer between `-2,147,483,648` and `+2,147,483,647`.
   - **Mobile Client Rendering Defect:** [DailyRashiInsightCard.tsx#L193](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx#L193) wraps the auspicious strip in:
     `{(insight.auspicious_color || insight.auspicious_number) && (`.
     When `auspicious_color` is `null` and `auspicious_number` is `0`, JavaScript evaluates `(null || 0)` to `0` (falsy), **completely suppressing the entire auspicious strip**. The inner check (`insight.auspicious_number !== null && insight.auspicious_number !== undefined` at line 206) is bypassed.
3. **Confirmed Draft Validation Inconsistency:**
   - **Bulk CSV Drafts:** `validateDailyInsightDraftPayload` ([daily-insights-csv-parser.ts#L664](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts#L664)) enforces that `general_outlook` **must be non-empty even when saving drafts**.
   - **Single-Record Manual Drafts:** `saveDailyRashiInsight` allows saving drafts with `general_outlook = ""` or `null`. The RPC saves an empty string `''` to the database.
4. **Absence of Text-Length Limits:**
   - There are **zero explicit character limits** on any content field across all layers (DB is `TEXT`, textareas have no `maxLength`, CSV parser does not check string lengths).

---

## 2. Existing Content Data Contract

### 2.1 Table Definition: `public.daily_rashi_insights`
Established in Migration `045_daily_vedic_astrology_insights.sql` and amended in Migrations `049` (optimistic concurrency version) and `050` (atomic overwrite guard):

```sql
CREATE TABLE IF NOT EXISTS public.daily_rashi_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_date DATE NOT NULL,
    rashi_id SMALLINT NOT NULL CHECK (rashi_id BETWEEN 1 AND 12),
    rashi_name TEXT NOT NULL,
    language VARCHAR(5) NOT NULL DEFAULT 'en',
    
    -- Structured Sectional Guidance
    general_outlook TEXT NOT NULL,
    career_business TEXT,
    finance_wealth TEXT,
    love_relationships TEXT,
    health_wellbeing TEXT,
    auspicious_color TEXT,
    auspicious_number INTEGER,
    
    -- Publication Lifecycle & Attribution
    status public.astrology_content_status NOT NULL DEFAULT 'draft'::public.astrology_content_status,
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT uq_daily_rashi_insights_date_rashi_lang UNIQUE (insight_date, rashi_id, language)
);
```

### 2.2 Data Contract Summary Table

| Field Name | SQL Column Type | Nullable? | Default | Check Constraint? | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `insight_date` | `DATE` | `NOT NULL` | None | None | Indian calendar date (YYYY-MM-DD) |
| `rashi_id` | `SMALLINT` | `NOT NULL` | None | `CHECK (rashi_id BETWEEN 1 AND 12)` | Canonical zodiac identifier |
| `rashi_name` | `TEXT` | `NOT NULL` | None | None | Vedic name (e.g., 'Mesha') |
| `language` | `VARCHAR(5)` | `NOT NULL` | `'en'` | None | ISO code ('en', 'hi') |
| `general_outlook` | `TEXT` | **`NOT NULL`** | None | None | **Only mandatory content field** |
| `career_business` | `TEXT` | `NULL` | `NULL` | None | Thematic section 1 (Optional) |
| `finance_wealth` | `TEXT` | `NULL` | `NULL` | None | Thematic section 2 (Optional) |
| `love_relationships` | `TEXT` | `NULL` | `NULL` | None | Thematic section 3 (Optional) |
| `health_wellbeing` | `TEXT` | `NULL` | `NULL` | None | Thematic section 4 (Optional) |
| `auspicious_color` | `TEXT` | `NULL` | `NULL` | None | Free attribute 1 (Optional) |
| `auspicious_number` | `INTEGER` | `NULL` | `NULL` | **None** | Free attribute 2 (Optional) |
| `status` | `public.astrology_content_status` | `NOT NULL` | `'draft'` | None | Enum: `draft`, `scheduled`, `published`, `cancelled` |
| `version` | `INTEGER` | `NOT NULL` | `1` | None | AST-09 OCC monotonic version counter |

---

## 3. Required vs. Optional Field Validation Across Layers

### 3.1 Field-by-Field Analysis

```
┌────────────────────────┬─────────────┬─────────────┬──────────────┬──────────────┬─────────────┐
│ Field Name             │ Database    │ Admin Form  │ Action       │ RPC Valid.   │ CSV Import  │
│                        │ NOT NULL?   │ Required?   │ Required?    │ (Published)  │ Required?   │
├────────────────────────┼─────────────┼─────────────┼──────────────┼──────────────┼─────────────┤
│ general_outlook        │ YES (NOT NULL)│ YES (Publish)│ YES (Publish)│ YES (TRIM)   │ YES (Draft &│
│                        │             │             │              │              │   Publish)  │
│ career_business        │ NO (NULL)   │ NO (Optional)│ NO           │ NO           │ NO          │
│ finance_wealth         │ NO (NULL)   │ NO (Optional)│ NO           │ NO           │ NO          │
│ love_relationships     │ NO (NULL)   │ NO (Optional)│ NO           │ NO           │ NO          │
│ health_wellbeing       │ NO (NULL)   │ NO (Optional)│ NO           │ NO           │ NO          │
│ auspicious_color       │ NO (NULL)   │ NO (Optional)│ NO           │ NO           │ NO          │
│ auspicious_number      │ NO (NULL)   │ NO (Optional)│ NO           │ NO           │ NO          │
└────────────────────────┴─────────────┴─────────────┴──────────────┴──────────────┴─────────────┘
```

### 3.2 Layer 1: Database Mutation RPC (`admin_save_daily_rashi_insight`)
Source: [supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql#L70-L210](file:///C:/Projects/KashiVeda/supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql#L70-L210)

```sql
-- Publication requirement check:
IF p_status = 'published'::public.astrology_content_status AND (p_general_outlook IS NULL OR TRIM(p_general_outlook) = '') THEN
    RAISE EXCEPTION 'General Outlook is mandatory when publishing a daily insight.';
END IF;
```

**Key RPC Validation Observations:**
1. **Mandatory Check Only on Publication:** The RPC verifies `general_outlook` only when `p_status = 'published'`. When `p_status = 'draft'`, `p_general_outlook` is permitted to be `NULL` or empty.
2. **Whitespace-Only Handling for Drafts:**
   - In PostgreSQL, the table has `general_outlook TEXT NOT NULL`.
   - The RPC executes `general_outlook = TRIM(COALESCE(p_general_outlook, ''))`.
   - If a caller passes `NULL` or whitespace-only `" "` for a draft, `TRIM` produces the empty string `''`.
   - Because `''` satisfies `NOT NULL` in PostgreSQL, a draft record is successfully saved with an empty string!
3. **Optional Fields Normalization:**
   - For all five optional string fields (`career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`, `auspicious_color`), the RPC executes:
     `NULLIF(TRIM(COALESCE(p_..., '')), '')`.
   - Whitespace-only values `" "` are cleanly converted to SQL `NULL`.
   - Clearing a previously saved optional field by submitting an empty string correctly overwrites the field to `NULL`.
4. **No Validation on Other Fields:**
   - Even when `p_status = 'published'`, the RPC executes zero checks on `career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`, `auspicious_color`, or `auspicious_number`.
   - The database authoritatively permits publishing records where 6 of the 7 editorial fields are `NULL`.

### 3.3 Layer 2: Admin Server Actions (`daily-insights-management.ts`)
Source: [lib/actions/daily-insights-management.ts](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts)

1. **`saveDailyRashiInsight` ([lines 135-155](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L135-L155)):**
   ```typescript
   if (!formData.insight_date || !formData.rashi_id || !formData.language) {
     return { success: false, error: "Date, Rashi, and Language are required." };
   }
   if (formData.rashi_id < 1 || formData.rashi_id > 12) {
     return { success: false, error: "Rashi ID must be between 1 and 12." };
   }
   if (formData.status === "published" && !formData.general_outlook?.trim()) {
     return { success: false, error: "General Outlook is mandatory before publishing an insight." };
   }
   ```
   - Matches RPC behavior: requires `general_outlook` only if `status === "published"`.
   - Treats all other fields as optional.
2. **`validateDailySetReadiness` ([lines 500-568](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L500-L568)):**
   - Iterates through all 12 Rashis for the selected date and language.
   - Evaluates:
     ```typescript
     if (!entry) {
       missingRashis.push({ rashi_id: rashi.id, reason: "missing_record" });
     } else if (!entry.general_outlook || entry.general_outlook.trim().length === 0) {
       missingRashis.push({ rashi_id: rashi.id, reason: "missing_general_outlook" });
     } else {
       readyCount++;
     }
     ```
   - A Rashi is considered 100% "ready for publication" if and only if it has a non-empty `general_outlook`.
3. **`publishDailyRashiInsightsSet` ([lines 569-650](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L569-L650)):**
   - Publishes all 12 Rashis when `validateDailySetReadiness` reports `isReadyForPublish === true`.
   - Does not require any thematic sections or lucky numbers.

### 3.4 Layer 3: Bulk CSV Parser (`daily-insights-csv-parser.ts`)
Source: [lib/astrology/daily-insights-csv-parser.ts](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts)

1. **Row Validation ([lines 547-560](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts#L547-L560)):**
   ```typescript
   const hasAnyContent =
     rowGeneral.length > 0 || rowCareer.length > 0 || rowFinance.length > 0 ||
     rowLove.length > 0 || rowHealth.length > 0 || rowColor.length > 0 || rowNumber.length > 0;

   if (!hasAnyContent) {
     rowErrors.push(`Row ${i} has no insight content.`);
   } else if (rowGeneral.length === 0) {
     rowErrors.push(`Row ${i} is missing mandatory General Outlook guidance.`);
   }
   ```
   - If a row contains thematic fields but no `general_outlook`, it is rejected.
   - If a row contains `general_outlook` and nothing else, it is **accepted**.
2. **Draft Payload Validator Inconsistency ([lines 663-665](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts#L663-L665)):**
   ```typescript
   if (!item.general_outlook || item.general_outlook.trim() === "") {
     return { isValid: false, error: "General Outlook is required." };
   }
   ```
   - Invoked during `bulkSaveDailyRashiInsightsDrafts`.
   - **Inconsistency:** Unlike manual authoring which allows drafts with empty `general_outlook`, CSV import rejects draft rows if `general_outlook` is empty.

### 3.5 Layer 4: Mobile Application Presentation (`DailyRashiInsightCard.tsx`)
Source: [src/features/astrology/components/DailyRashiInsightCard.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx)

```tsx
{/* Section 1: General Cosmic Outlook (Unconditional Free Content) */}
<Text variant="body">{insight.general_outlook}</Text>

{/* Premium Sections: Each independently conditional */}
{isEntitled && (
  <>
    {insight.career_business ? ( <CareerSection text={insight.career_business} /> ) : null}
    {insight.finance_wealth ? ( <FinanceSection text={insight.finance_wealth} /> ) : null}
    {insight.love_relationships ? ( <LoveSection text={insight.love_relationships} /> ) : null}
    {insight.health_wellbeing ? ( <HealthSection text={insight.health_wellbeing} /> ) : null}
  </>
)}
```
- The mobile UI was deliberately built to render whatever subset of sections is present.
- If a published insight contains only `general_outlook` and `career_business`, the mobile app renders those two sections seamlessly without throwing errors, leaving gaps, or breaking layout.

---

## 4. Text-Length Limits and Validation Consistency

An exhaustive inspection of all layers revealed the following rules regarding string lengths:

### 4.1 Layer-by-Layer Length Limits

1. **HTML Form Controls ([daily-insights-form-modal.tsx#L310-L400](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-form-modal.tsx#L310-L400)):**
   - The `<textarea>` elements have no `maxLength` or `minLength` attributes.
   - The `<Input id="auspicious_color">` has no `maxLength`.
   - The UI includes a character counter (`{generalOutlook.length} characters`), but does not restrict or block input of any length.
2. **Client-Side Validation:**
   - No character count validation in `daily-insights-form-modal.tsx` or `daily-insight-field-modal.tsx`.
3. **Zod / Shared Schema Validation:**
   - **Zero** Zod schemas exist in `kashi-veda-admin` or `KashiVeda`.
4. **Server Actions (`daily-insights-management.ts`):**
   - No string length validation is performed before calling RPCs.
5. **Bulk CSV Parser (`daily-insights-csv-parser.ts`):**
   - Enforces `MAX_CSV_FILE_SIZE = 2 MB` and `MAX_CSV_ROW_COUNT = 1000`.
   - Contains **no minimum or maximum length constraints** on individual text cells.
6. **Database Schema & Constraints:**
   - Columns are defined as PostgreSQL `TEXT`.
   - In PostgreSQL, `TEXT` allows up to 1 GB per field.
   - There are **no CHECK constraints** on character lengths (e.g., `CHECK (char_length(general_outlook) BETWEEN ...)` is absent).
7. **Mobile Client Presentation:**
   - Mobile `<Text>` elements do not define `numberOfLines` or `ellipsizeMode` on insight bodies.
   - The container is wrapped in a `<ScrollView>` via `<ScreenContainer scrollable padded>`, allowing arbitrary text lengths to scroll vertically.

### 4.2 Impact of Absent Text Limits
- **Short Texts:** An author can publish a 1-character general outlook (e.g., `"."` or `"A"`). The database, server actions, and mobile client will accept and render it without error.
- **Excessively Long Texts:** An author can paste an entire 10,000-word essay into `general_outlook`. The database will persist it, and the mobile client will render it inside the scroll view. While it will not crash, it may create an undesirable user experience or cause memory spikes on low-end mobile devices.

---

## 5. Lucky-Number Contract

The following table traces how every possible `auspicious_number` input is handled across each layer of the application:

### 5.1 Auspicious Number Trace Matrix

| Scenario / Input Value | Admin CSV Parser | Admin Manual Form | Server Action (`saveDailyRashiInsight`) | Database RPC & Table | Mobile Client Display (`DailyRashiInsightCard`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`NULL` / Missing / Blank** | **Valid:** Parsed as `""` -> `null` | **Valid:** Input is `""` | `!formData...` -> passes `p_auspicious_number: null` | Stored as `NULL` | Hidden: Line 206 check `!== null && !== undefined` skips rendering. |
| **Zero (`0`)** | **REJECTED:** Error: `"must be at least 1"` | **ACCEPTED:** User enters `"0"` | `"0"` is truthy string -> passes `Number("0") = 0` to RPC | Stored as `0` | **BUGGY / SUPPRESSED:** If `auspicious_color` is null, line 193 evaluates to `0` (falsy), hiding the entire strip. If color exists, line 206 renders `🔢 0`. |
| **Positive `1` to `99`** | **Valid:** Accepted | **Valid:** Accepted | Passes numeric `n` to RPC | Stored as `n` | **Valid:** Renders `🔢 n` in auspicious strip. |
| **Positive `> 99` (e.g. `108`, `1000`)** | **REJECTED:** Error: `"must be at most 99"` | **ACCEPTED:** User enters `"108"` | Passes `Number("108") = 108` to RPC | Stored as `108` | **Renders `🔢 108`** (Mobile accepts any number). |
| **Negative (e.g. `-5`)** | **REJECTED:** Error: `"must be at least 1"` | **ACCEPTED:** User enters `"-5"` | Passes `Number("-5") = -5` to RPC | Stored as `-5` | **Renders `🔢 -5`** (In JS, `-5` is truthy). |
| **Decimal (e.g. `3.14`)** | **REJECTED:** Strict integer regex `/^-?\d+$/` fails | **ACCEPTED by form** | `!isNaN(3.14)` is true -> passes `3.14` | Postgres casts `3.14` to `INTEGER 3` | Renders `🔢 3`. |
| **Non-Numeric (e.g. `"seven"`)** | **REJECTED:** Integer regex fails | **ACCEPTED by form** | `Number("seven")` is `NaN` -> **Silently converts to `null`!** | Stored as `NULL` | Hidden (silent data loss, no error returned to user). |
| **Whitespace String (`"  7  "`)** | **Valid:** Trimmed to `7` | **Valid:** Form holds string | `Number("  7  ") = 7` | Stored as `7` | Renders `🔢 7`. |
| **Extreme Large Integer (`1e15`)** | **REJECTED:** `!Number.isSafeInteger` | **ACCEPTED by form** | Passes to RPC | **DB ERROR:** `integer out of range` (PostgreSQL 32-bit limit) | Request fails. |

### 5.2 Deep Dive: The Mobile Truthiness Rendering Defect
In [DailyRashiInsightCard.tsx#L192-L216](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx#L192-L216):

```tsx
192: {/* Auspicious Attributes Strip (Free attribute) */}
193: {(insight.auspicious_color || insight.auspicious_number) && (
194:   <View style={styles.auspiciousStrip}>
195:     {insight.auspicious_color ? (
196:       <View style={styles.attributeItem}>
197:         <Text variant="overline" color={colors.textSecondary}>Auspicious Color</Text>
198:         <Text variant="captionMedium" color={colors.primaryDark}>🎨 {insight.auspicious_color}</Text>
199:       </View>
200:     ) : null}
201:
202:     {insight.auspicious_number !== null && insight.auspicious_number !== undefined ? (
203:       <View style={styles.attributeItem}>
204:         <Text variant="overline" color={colors.textSecondary}>Lucky Number</Text>
205:         <Text variant="captionMedium" color={colors.secondaryDark}>🔢 {insight.auspicious_number}</Text>
206:       </View>
207:     ) : null}
...
225:   </View>
226: )}
```

**Defect Mechanism:**
1. A developer attempted to fix the `0` rendering bug at line 202 by explicitly checking:
   `insight.auspicious_number !== null && insight.auspicious_number !== undefined`.
2. However, the developer **overlooked the outer container guard** at line 193:
   `{(insight.auspicious_color || insight.auspicious_number) && (`.
3. If `insight.auspicious_color` is `null` (or empty) and `insight.auspicious_number === 0`:
   `null || 0` evaluates to `0`.
   In JavaScript and React Native JSX:
   `0 && <View>` evaluates to `0`.
   The entire `<View style={styles.auspiciousStrip}>` is never rendered.
4. Conversely, if `auspicious_color` is `"Saffron"` and `auspicious_number === 0`:
   `"Saffron" || 0` evaluates to `"Saffron"` (truthy).
   The container renders, line 202 evaluates to `true`, and `🔢 0` is displayed.
5. **Conclusion:** Whether `auspicious_number = 0` displays on mobile is dependent on whether `auspicious_color` is present.

---

## 6. Manual Authoring vs. CSV Import vs. Publication Consistency

The investigation revealed three significant validation discrepancies across authoring flows:

```
[Authoring Workflow Discrepancies]

1. Lucky Number Range:
   - CSV Import: Strictly rejects numbers < 1 or > 99.
   - Manual Single-Record Form: Accepts any integer (e.g., 0, -5, 108, 1000).

2. Draft General Outlook:
   - CSV Import: Rejects rows if general_outlook is missing.
   - Manual Single-Record Form: Permits saving drafts with empty general_outlook.

3. Silent Error Coercion:
   - CSV Import: Explicitly rejects non-numeric tokens with descriptive errors.
   - Manual Single-Record Form: Silently converts invalid text to NULL without error.
```

### 6.1 Discrepancy Breakdown

1. **Lucky Number Domain Mismatch:**
   - In [daily-insights-csv-parser.ts#L535](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts#L535), CSV import explicitly enforces `min: 1` and `max: 99`. An author attempting to bulk-import a CSV containing `0` or `108` receives validation errors.
   - In [daily-insights-form-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-form-modal.tsx) and [daily-insights-management.ts#L169](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L169), manual authoring permits `0` and `108` and saves them to the database.
2. **Draft Readiness Mismatch:**
   - In `daily-insights-csv-parser.ts#L663`, `validateDailyInsightDraftPayload` requires `item.general_outlook` for draft imports.
   - In `daily-insights-management.ts#L148`, `saveDailyRashiInsight` allows saving drafts with `general_outlook = ""`.
3. **Publication Contract Match:**
   - Manual single-record publication (`handleSubmit("published")`), manual bulk publication (`publishDailyRashiInsightsSet`), and the database RPC (`admin_save_daily_rashi_insight`) are **100% consistent**: all three enforce that `general_outlook` must be non-empty and treat the other six content fields as optional.

---

## 7. Existing Tests and Safe Tests Performed

### 7.1 Existing Automated Tests Inspected & Executed

The following automated test suites in `C:\Projects\KashiVeda\__tests__` were executed and analyzed:

1. **`__tests__/daily_astrology_csv_parser_validation.test.ts` (62 tests, PASSED):**
   - Lines 160–176: Verifies `validateIntegerToken` rejects decimals (`"7.5"`) and partial alphanumeric tokens (`"7abc"`).
   - Lines 198–216: Verifies `validateIntegerToken` rejects out-of-range values (`"-5"` and `"1000"`).
   - Lines 218–228: Verifies valid numbers within `1..99` are accepted.
   - Lines 629–642: Verifies `validateDailyInsightDraftPayload` rejects `auspicious_number: 1000`.
   - Lines 648–651: Verifies server-side payload validation runs in `bulkSaveDailyRashiInsightsDrafts`.
2. **`__tests__/daily_astrology_partial_publishing.test.ts` (10 tests, PASSED):**
   - Lines 58–87: Verifies type contracts for partial publishing outcomes (`published`, `failed`, `skipped`, `conflict`, `no_eligible_rows`, `partial_success`).
   - Lines 90–120: Verifies prerequisite error handling in `validateDailySetReadiness` and `publishDailyRashiInsightsSet`.
3. **`__tests__/daily_vedic_astrology_insights.test.tsx` (20 tests, PASSED):**
   - Verifies 12-Rashi definitions, dates, and card rendering with mock lucky numbers (`7`, `9`).
   - **Test Gap Identified:** All UI component tests mock `auspicious_color` alongside `auspicious_number`. Zero existing tests check the display behavior when `auspicious_number === 0` or when `auspicious_color` is null.

### 7.2 Safe Non-Destructive Source Inspection Evidence
- **Database constraints:** Confirmed directly from migrations 045, 047, 049, and 050 that no check constraint exists on `auspicious_number`.
- **Server actions:** Confirmed from `daily-insights-management.ts#L169` that `saveDailyRashiInsight` does not invoke `validateDailyInsightDraftPayload`.
- **Mobile rendering:** Confirmed from `DailyRashiInsightCard.tsx#L193` that outer line 193 uses truthiness.

---

## 8. Confirmed Defects vs. Undefined Product Rules

### 8.1 Confirmed Technical Implementation Defects
1. **Mobile Card Lucky Number Zero Suppression ([DailyRashiInsightCard.tsx#L193](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx#L193)):**
   - Outer guard `{(insight.auspicious_color || insight.auspicious_number) && (` evaluates to `0` (falsy) when `auspicious_color` is null and `auspicious_number` is `0`.
   - This suppresses the entire auspicious strip and contradicts the inner check at line 202 (`!== null && !== undefined`).
2. **Authoring Validation Asymmetry Between Manual Form and CSV Import:**
   - CSV parser rejects `auspicious_number` outside `1..99` ([daily-insights-csv-parser.ts#L535](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts#L535)).
   - Manual form allows any number (including negatives and numbers `> 99`) ([daily-insights-management.ts#L169](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L169)).
3. **Draft Requirement Asymmetry:**
   - CSV draft parser rejects rows missing `general_outlook` ([daily-insights-csv-parser.ts#L663](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts#L663)).
   - Manual single-record form allows saving drafts with empty `general_outlook`.
4. **Silent Failure on Non-Numeric Lucky Number in Server Action:**
   - If an author enters `"lucky"` into the lucky number field, `Number("lucky")` is `NaN`, and `daily-insights-management.ts#L169` silently converts it to `null` and saves it, without returning a validation error.

### 8.2 Undefined Product and Editorial Rules
1. **Editorial Completeness Policy:**
   - Current implementation allows publishing an insight with **only** `general_outlook` populated.
   - It is not formally documented whether this is the intended editorial policy (allowing scholars to release quick overviews) or whether editorial guidelines require all 4 thematic sections (`career`, `finance`, `love`, `health`) to be completed before a horoscope is published.
2. **Text-Length Bounds:**
   - There are currently no minimum or maximum character limits.
   - Product management has not defined whether short strings (e.g., 5 characters) or long essays (e.g., 5,000 characters) are acceptable.
3. **Lucky-Number Domain Policy:**
   - Does Vedic astrology consider `0` a valid lucky number?
   - Should lucky numbers be restricted to single digits (`1–9`), standard numerology (`1–99`), or sacred Vedic counts (`1–108`)?

---

## 9. Product and Editorial Decisions Required

The product owner must decide on the following open policy questions:

### Decision Point 1: Editorial Completeness for Publication
- **Option A — Keep Current Minimal Outlook Policy (Recommended for Editorial Velocity):**  
  `general_outlook` is the only mandatory field for publication. Thematic sections (`career`, `finance`, `love`, `health`) remain optional. If omitted by scholars, the mobile client gracefully hides those sections.
- **Option B — Enforce Complete 5-Section Guidance:**  
  Require all 5 sections (`general_outlook`, `career_business`, `finance_wealth`, `love_relationships`, `health_wellbeing`) before any insight can be published.
- **Option C — Core + At Least One Thematic Section:**  
  Require `general_outlook` plus at least one thematic section.

### Decision Point 2: Text-Length Limits
- **Option A — Define Production Bounds (Recommended):**  
  - `general_outlook`: Minimum 50 characters, Maximum 1,000 characters.
  - Thematic sections (`career`, `finance`, `love`, `health`): Minimum 20 characters, Maximum 600 characters (when populated).
  - `auspicious_color`: Maximum 50 characters.
- **Option B — Unconstrained Freeform Text:**  
  Maintain current behavior with no limits, relying on editorial discretion.

### Decision Point 3: Auspicious Number Range & Contract
- **Option A — Numerology Range `1` to `99` (Recommended):**  
  Align manual authoring and the database with the existing CSV parser:
  - Enforce `1 <= auspicious_number <= 99` across manual forms, server actions, CSV imports, and database CHECK constraints.
  - Reject `0`, negative numbers, and numbers `> 99`.
- **Option B — Single Digits `1` to `9` (Classical Jyotish Navagraha):**  
  Restrict lucky numbers strictly to `1–9`.
- **Option C — Sacred Vedic Range `1` to `108`:**  
  Allow numbers up to `108`.
- **Zero Policy:** Confirm whether `0` is ever considered an auspicious number. If not, reject `0` at all input layers. If `0` is allowed, fix the mobile rendering guard.

---

## 10. Recommended Next Step, Without Implementing It

1. **Submit Decision Points to Product Owner:**  
   Present Decision Points 1 (completeness), 2 (text limits), and 3 (lucky number range) to product management and editorial leadership.
2. **Upon Approval of Policy (Recommended Path: Options 1A, 2A, 3A):**
   - **Mobile UI Fix:** In [DailyRashiInsightCard.tsx#L193](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx#L193), update the outer container guard from:
     ```tsx
     {(insight.auspicious_color || insight.auspicious_number) && (
     ```
     to:
     ```tsx
     {(Boolean(insight.auspicious_color) || (insight.auspicious_number !== null && insight.auspicious_number !== undefined)) && (
     ```
   - **Admin Form Synchronization:** In `daily-insights-management.ts#L169` and `daily-insights-form-modal.tsx`, invoke `validateDailyInsightDraftPayload` or apply `validateIntegerToken(formData.auspicious_number, { min: 1, max: 99, required: false })`.
   - **Unit Tests:** Add unit tests in `daily_vedic_astrology_insights.test.tsx` for `auspicious_number === 0` rendering and boundary conditions.

---

## 11. Exact Files, Functions, RPCs, and Migrations Inspected

### Mobile Application (`C:\Projects\KashiVeda`)
- [src/features/astrology/components/DailyRashiInsightCard.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx) (Lines 192–216: outer auspicious strip truthiness check & lucky number display; Lines 245–302: conditional thematic sections rendering)
- [src/features/astrology/types/rashi.types.ts](file:///C:/Projects/KashiVeda/src/features/astrology/types/rashi.types.ts) (Lines 195–213: `DailyRashiInsight` interface)
- [src/features/astrology/screens/AstrologyScreen.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologyScreen.tsx) (Lines 212–242: daily horoscope section)
- [__tests__/daily_vedic_astrology_insights.test.tsx](file:///C:/Projects/KashiVeda/__tests__/daily_vedic_astrology_insights.test.tsx) (Lines 340–375, 510–540: insight component and mock tests)
- [__tests__/daily_astrology_partial_publishing.test.ts](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_partial_publishing.test.ts) (Lines 1–183: partial publishing test suite)
- [__tests__/daily_astrology_csv_parser_validation.test.ts](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_csv_parser_validation.test.ts) (Lines 160–228, 629–652: numeric token and payload validation tests)

### Database Migrations (`C:\Projects\KashiVeda\supabase\migrations`)
- [045_daily_vedic_astrology_insights.sql](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql) (Lines 25–50: table definition, nullability, constraints)
- [047_harden_daily_astrology_admin_rpcs.sql](file:///C:/Projects/KashiVeda/supabase/migrations/047_harden_daily_astrology_admin_rpcs.sql) (Lines 25–100: admin RPC definitions)
- [049_daily_astrology_optimistic_concurrency.sql](file:///C:/Projects/KashiVeda/supabase/migrations/049_daily_astrology_optimistic_concurrency.sql) (Lines 44–160: OCC versioning on `daily_rashi_insights`)
- [050_daily_astrology_csv_import_overwrite_guard.sql](file:///C:/Projects/KashiVeda/supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql) (Lines 32–100: `admin_save_daily_rashi_insight` publication validation; Lines 142–155, 180–210: string trimming and `NULLIF` normalization)
- [055_decouple_plan_deactivation_from_entitlements.sql](file:///C:/Projects/KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql) (Lines 200–225: authoritative retrieval RPC)

### Administrative Web Portal (`C:\Projects\kashi-veda-admin`)
- [lib/astrology/daily-insights-csv-parser.ts](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts) (Lines 30–80: `validateIntegerToken`; Lines 531–538: `auspicious_number` 1..99 range check; Lines 547–560: mandatory `general_outlook` row validation; Lines 625–670: `validateDailyInsightDraftPayload`)
- [lib/actions/daily-insights-management.ts](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts) (Lines 135–185: `saveDailyRashiInsight` validation and `p_auspicious_number` coercion; Lines 500–568: `validateDailySetReadiness`; Lines 569–650: `publishDailyRashiInsightsSet`)
- [components/admin/astrology/daily-insights/daily-insights-form-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-form-modal.tsx) (Lines 150–160: form submit validation; Lines 310–415: `<textarea>` and `<Input>` form controls)
- [components/admin/astrology/daily-insights/daily-insight-field-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insight-field-modal.tsx) (Lines 40–90: field-specific config; Lines 160–215: field draft submission)
- [components/admin/astrology/daily-insights/publish-daily-set-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/publish-daily-set-modal.tsx) (12-Rashi set publication modal)
- [lib/types/daily-insights-management.ts](file:///C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts) (`DailyRashiInsightAdminItem`, `DailyRashiInsightFormData`)

---

## 12. Safety Attestation

This assessment was conducted strictly in read-only mode in accordance with Kashi Veda Project Rules:
- **No Source Code Changes:** No application files in `C:\Projects\KashiVeda` or `C:\Projects\kashi-veda-admin` were created or altered.
- **No Migration Changes:** No database migrations, SQL schemas, RLS policies, or database functions were modified or created.
- **No Production Probing:** No remote or production queries, writes, or probes were executed.
- **Test Integrity:** No existing test files were altered. Existing test suites were executed read-only and passed without modification.
- **Scope Discipline:** Work was strictly limited to AST-Q05. AST-Q06 and other findings were not touched.
- **Authorized File Creation:** The only file created as part of this task is this report:
  `C:\Projects\KashiVeda\KASHIVEDA_AST_Q05_EDITORIAL_VALIDATION_ASSESSMENT_REPORT.md`.

---

## 13. Final Decision

### Outcome Selection:
**Outcome C — Confirmed implementation inconsistency (accompanied by Outcome D — Editorial or product decision needed).**

### Justification:
1. **Confirmed Implementation Inconsistencies (Outcome C):**
   - **Lucky Number Range Conflict:** The CSV parser strictly rejects `auspicious_number` outside `1..99` (`min: 1, max: 99`), whereas the manual admin form accepts any number (including `0`, negatives, and numbers `> 99`).
   - **Silent Data Coercion:** The server action `saveDailyRashiInsight` silently coerces non-numeric lucky number strings to `null` without returning an error.
   - **Mobile Display Defect:** In `DailyRashiInsightCard.tsx#L193`, the outer truthiness check `(insight.auspicious_color || insight.auspicious_number)` erroneously suppresses the entire auspicious strip when `auspicious_color` is null and `auspicious_number` is `0`, bypassing the explicit inner null check at line 202.
   - **Draft Validation Conflict:** CSV draft imports require `general_outlook`, while manual single-record draft saves allow an empty string.
2. **Open Editorial Policy Questions (Outcome D):**
   - Existing behavior authoritatively permits publishing partial records where only `general_outlook` is present. Whether this satisfies the editorial vision for KashiVeda horoscopes, whether character length caps must be imposed, and whether `0` is an acceptable lucky number require explicit product owner confirmation.
