# KashiVeda Feature 02 — AST-Q04 Language Selection Assessment Report

**Document Status:** Final Assessment Report  
**Investigation Type:** Read-Only Source Code, Data Contract, and Localization Trace  
**Target Finding:** AST-Q04 — Language Selection & Hindi Content Availability for Daily Vedic Horoscope  
**Repositories Inspected:**  
- Mobile Application & Backend Migrations: `C:\Projects\KashiVeda`  
- Administrative Web Portal: `C:\Projects\kashi-veda-admin`  
**Date of Assessment:** 2026-10-11  

---

## 1. Executive Summary

### 1.1 Objective & Context
This assessment investigates audit finding **AST-Q04** from the KashiVeda Feature 02 Daily Astrology and Subscriptions audit. Specifically, it assesses whether the mobile application can reliably display Hindi daily Rashi insights when Hindi content is published, how language is selected end-to-end, and whether the current implementation supports the languages offered by the Admin content workflow.

### 1.2 Core Findings Summary
1. **Architectural Asymmetry:** A stark asymmetry exists between backend/administrative systems and the mobile customer client:
   - **Database Schema:** Fully bilingual. `public.daily_rashi_insights` stores language as `VARCHAR(5) NOT NULL DEFAULT 'en'`, and the composite unique constraint `uq_daily_rashi_insights_date_rashi_lang` `(insight_date, rashi_id, language)` allows English (`en`) and Hindi (`hi`) records to coexist indefinitely without conflict.
   - **Admin Portal (`kashi-veda-admin`):** Fully bilingual. The Admin UI features an explicit two-way toggle between **English** and **हिन्दी (Hindi)**, supports date and language matrix loading, enables single-slot modal authoring in Hindi, validates and executes bulk 12-Rashi set publication in Hindi, and supports bilingual bulk CSV uploads.
   - **Mobile Service Layer (`dailyRashiService.ts`):** Fully bilingual-ready. The service accepts a `language` parameter, forms deterministic cache keys containing language (`${userScope}:${date}:${rashiId}:${language}`), separates in-memory and `AsyncStorage` caches by language, and passes `p_language` to the database RPC.
   - **Mobile Hook & UI Layer (`useDailyRashiInsight.ts`, `AstrologyScreen.tsx`):** **Hardcoded English-only.** The mobile hook `useDailyRashiInsight` hardcodes `const requestLanguage = "en";` ([src/features/astrology/hooks/useDailyRashiInsight.ts#L130](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts#L130)). The hook does not take a language parameter, and the mobile screens (`AstrologyScreen.tsx`, `DailyRashiInsightCard.tsx`, `RashiSelector.tsx`) contain zero language switches, toggles, or locale-derived overrides.
2. **Hindi Content Reachability:**
   - Any Hindi daily insights authored and published in the Admin portal are **completely unreachable by mobile customers**.
   - If editorial authors publish only Hindi content on a given date, mobile customers querying that day and Rashi receive `content: null` and see an empty state banner stating that insights are being prepared by scholars in Varanasi, despite complete Hindi guidance already existing in the database.
3. **No Automatic Database Fallback:**
   - The authoritative RPC `public.get_daily_rashi_insight` and the service fallback `fallbackFetchInsight` perform **strict exact-match filtering** (`WHERE language = p_language`).
   - If Hindi is requested (e.g., via direct service invocation) and only English is published, the RPC returns `content: NULL`. It does **not** silently fall back to English.
   - Conversely, when English is requested (as the mobile hook hardcodes) and only Hindi is published, the RPC returns `content: NULL`. It does **not** fall back to Hindi.
4. **Separation from Legacy Content:**
   - The legacy general astrology broadcast system (`public.astrology_content`, created in Migration 009) has no `language` column and no `rashi_id` column. Bilingual content authoring exists exclusively within the dedicated Phase 2A Daily Rashi feature (`public.daily_rashi_insights`, Migration 045).
5. **Absence of Mobile Localization Infrastructure:**
   - The React Native mobile app has no i18n package (`react-i18next`, `@formatjs/intl`, or `react-native-localize` are absent from `package.json`).
   - `src/app/config.ts` hardcodes `defaultLocale: "en-IN"`.
   - The `public.profiles` database table stores `preferred_rashi_id`, but has no `preferred_language` or `locale` column.

---

## 2. Existing Language and Localization Architecture

### 2.1 Mobile Application Localization Stack
Inspection of the mobile codebase (`C:\Projects\KashiVeda`) reveals that the application does not have an internationalization or localization framework:
- **Dependencies ([package.json](file:///C:/Projects/KashiVeda/package.json)):** No localization packages are installed. React Native standard components are imported directly without localization providers.
- **Application Configuration ([src/app/config.ts#L1-L11](file:///C:/Projects/KashiVeda/src/app/config.ts#L1-L11)):**
  ```typescript
  export const appConfig = {
    name: "KashiVeda",
    version: "1.0.0",
    webAdminUrl: "https://admin.kashiveda.org",
    websiteUrl: "https://kashiveda.org",
    supportEmail: "support@kashiveda.org",
    defaultLocale: "en-IN",
    currency: "INR",
  } as const;
  ```
- **Text & UI Strings:** All static UI text throughout the application is written in English. Traditional Vedic terminology (e.g., *Mesha*, *Vrishabha*, *Shukra*, *Mangal*, and Sanskrit benedictions like *॥ ग्रहाणां चरितं शुभम् ॥*) are directly hardcoded as UTF-8 string literals within component JSX files.
- **Device Locale Integration:** The mobile application does not read, listen to, or adapt to the native device locale (`NativeModules.I18nManager` or native locale APIs are not referenced for content retrieval).

### 2.2 Customer Profile Data Model
Inspection of `public.profiles` across migrations `002_identity.sql` and `045_daily_vedic_astrology_insights.sql`:
- **Existing Columns:** `id`, `display_name`, `email`, `phone`, `avatar_url`, `status`, `created_at`, `updated_at`, `preferred_rashi_id`.
- **Missing Columns:** There is **no** `preferred_language`, `language`, or `locale` column on `public.profiles`.
- **Preference Persistence:** While the system includes client and database RPC support for persisting a customer's preferred Janma Rashi (`preferred_rashi_id` via `public.set_customer_preferred_rashi`), there is no corresponding database mechanism or RPC for customer language preferences.

### 2.3 Admin Application Localization Architecture
In sharp contrast to the mobile app, the Next.js administrative portal (`C:\Projects\kashi-veda-admin`) treats English and Hindi as two first-class supported content channels for daily astrological insights:
- **Matrix View ([kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx#L565-L587](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx#L565-L587)):** Includes an interactive segmented switch allowing authors to toggle between English (`en`) and हिन्दी (`hi`).
- **Matrix Coordinator ([kashi-veda-admin/lib/astrology/daily-insights-matrix-coordinator.ts](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-matrix-coordinator.ts)):** Manages request generations keyed by `${date}::${language}` to prevent race conditions during rapid date/language switches.
- **Bulk CSV Parser ([kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts)):** Normalizes and validates the `language` column, supporting both `'en'` and `'hi'`.

---

## 3. Mobile Language Selection: End-to-End Trace

The following diagram illustrates the complete end-to-end data flow and identifies the exact boundary where language selection becomes hardcoded:

```
[Customer Mobile UI]
  AstrologyScreen.tsx
    │
    │ Calls useDailyRashiInsight() with no language parameters
    ▼
[Mobile Hook Layer]
  useDailyRashiInsight.ts
    │
    ├─► Line 111: requestKey = `${requestUserId}:${targetRashiId}:${currentIndianDate}` (Language omitted!)
    ├─► Line 130: const requestLanguage = "en";  <=== [HARDCODED BOTTLENECK]
    │
    │ Calls dailyRashiService.fetchDailyInsight(date, rashiId, "en", userId)
    ▼
[Mobile Service Layer]
  dailyRashiService.ts
    │
    ├─► Line 161: getCacheKey(userScope, date, rashiId, language = "en")
    │             Cache Key: `${userScope}:${date}:${rashiId}:en`
    │
    │ Invokes RPC: get_daily_rashi_insight
    ▼
[Database RPC]
  public.get_daily_rashi_insight(p_insight_date, p_rashi_id, p_language => 'en')
    │
    ├─► Checks entitlement on public.astrology_subscriptions (Language-independent)
    ├─► SELECT ... FROM public.daily_rashi_insights
    │   WHERE insight_date = p_insight_date
    │     AND rashi_id = p_rashi_id
    │     AND language = 'en'  <=== [STRICT FILTER: Only English rows matched]
    │     AND status = 'published';
    │
    ▼
[Result Returned to UI]
  - If English published: Renders English insight in DailyRashiInsightCard.
  - If ONLY Hindi published: Returns content: NULL -> Renders "No Insight Today" empty state.
  - Hindi content remains completely unreachable by mobile devotees.
```

### 3.1 Step-by-Step Flow Analysis

1. **Origin of Language Selection:**
   - Language selection originates neither from user settings nor from device locales. It is defined as a fixed constant inside [useDailyRashiInsight.ts#L130](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts#L130).
2. **User Selection in Mobile UI:**
   - The user **cannot** select Hindi or English in the mobile UI.
   - [AstrologyScreen.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologyScreen.tsx) contains no dropdown, switch, or tab control for language.
   - [DailyRashiInsightCard.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx) displays whatever string fields exist on `insight` (or empty/locked states), but does not expose any language controls.
   - [RashiSelector.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/components/RashiSelector.tsx) allows switching between the 12 Rashis (1–12), but has no language controls.
3. **Screen to Hook Parameter Passing:**
   - [AstrologyScreen.tsx#L55-L65](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologyScreen.tsx#L55-L65) calls `useDailyRashiInsight()` with zero arguments.
   - The hook function signature is:
     ```typescript
     export function useDailyRashiInsight(initialRashiId?: number): UseDailyRashiInsightResult
     ```
     It does not accept a language parameter.
4. **Hardcoding & Overwriting:**
   - Inside `useDailyRashiInsight.ts` within `executeGuardedFetch`:
     ```typescript
     128: const requestId = ++latestRequestIdRef.current;
     129: const requestDate = currentIndianDate;
     130: const requestLanguage = "en";
     ```
   - The hook explicitly hardcodes `"en"` and passes it to the service:
     ```typescript
     160: await dailyRashiService.fetchDailyInsight(
     161:   requestDate,
     162:   targetRashiId,
     163:   requestLanguage,
     164:   requestUserId,
     165:   optionsArg
     166: );
     ```
5. **In-Flight Deduplication Vulnerability in Hook:**
   - In `useDailyRashiInsight.ts#L111`:
     ```typescript
     const requestKey = `${requestUserId}:${targetRashiId}:${currentIndianDate}`;
     ```
   - Notice that `language` is **omitted** from `requestKey`. If the hook were naively refactored to accept a dynamic language prop without changing line 111, switching languages rapidly for the same Rashi and date would falsely trigger in-flight request deduplication (`inFlightKeyRef.current === requestKey`), dropping the second language request.

---

## 4. Daily Insight Data Contract and Language Filtering

### 4.1 Schema Definition: `public.daily_rashi_insights`
The authoritative data model was established in Migration `045_daily_vedic_astrology_insights.sql` ([supabase/migrations/045_daily_vedic_astrology_insights.sql#L25-L50](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql#L25-L50)):

```sql
CREATE TABLE IF NOT EXISTS public.daily_rashi_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_date DATE NOT NULL,
    rashi_id SMALLINT NOT NULL CHECK (rashi_id BETWEEN 1 AND 12),
    rashi_name TEXT NOT NULL,
    language VARCHAR(5) NOT NULL DEFAULT 'en',
    
    -- Structured Sectional Insights
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Integrity: Exactly one record per (date, rashi, language)
    CONSTRAINT uq_daily_rashi_insights_date_rashi_lang UNIQUE (insight_date, rashi_id, language)
);
```

### 4.2 Data Contract Properties
1. **Language Column & Permitted Values:**
   - Type: `VARCHAR(5) NOT NULL DEFAULT 'en'`.
   - The database does not enforce an ENUM or CHECK constraint on specific language codes.
   - However, the application layer (Admin CSV parser, Admin actions, and client types) standardizes on ISO 639-1 two-letter lowercase codes: `'en'` (English) and `'hi'` (Hindi).
2. **Composite Uniqueness:**
   - `CONSTRAINT uq_daily_rashi_insights_date_rashi_lang UNIQUE (insight_date, rashi_id, language)`.
   - Date, Rashi, and Language form the composite natural key.
   - For any single calendar date (e.g., `2026-10-15`) and Rashi (e.g., `1` / Mesha), there can exist both an `'en'` record and an `'hi'` record simultaneously. They do not collide or overwrite each other.
3. **Indexes:**
   - `idx_daily_rashi_insights_lookup ON public.daily_rashi_insights (insight_date, rashi_id, language, status)` ensures index-backed, single-seek retrieval for any date, Rashi, and language query.

### 4.3 Database RPC Language Filtering
The authoritative retrieval RPC is `public.get_daily_rashi_insight(p_insight_date, p_rashi_id, p_language)` (defined in Migration 045 and maintained in Migration 055):

```sql
SELECT 
    id, insight_date, rashi_id, rashi_name, language,
    general_outlook, career_business, finance_wealth,
    love_relationships, health_wellbeing, auspicious_color,
    auspicious_number, status, published_at, created_at, updated_at
INTO v_insight
FROM public.daily_rashi_insights
WHERE insight_date = p_insight_date
  AND rashi_id = p_rashi_id
  AND language = p_language
  AND (status = 'published'::public.astrology_content_status OR v_is_admin);

IF NOT FOUND THEN
    RETURN jsonb_build_object(
        'success', true,
        'is_entitled', true,
        'content', NULL,
        'insight_date', p_insight_date,
        'rashi_id', p_rashi_id,
        'language', p_language,
        'message', 'No published daily insight found for the requested date and Rashi.'
    );
END IF;
```

**Key RPC Behaviors:**
- **Exact Filtering:** The SQL query evaluates `WHERE ... AND language = p_language`.
- **Absence of Fallback:** If `p_language = 'en'` is queried and only `language = 'hi'` records exist, `NOT FOUND` is reached. The RPC returns `content: NULL`. It **does not** fall back to Hindi or any other language.
- **Input Normalization:** If `p_language` is `NULL` or empty, the RPC defaults `p_language := 'en'`.

### 4.4 Service Fallback Query
In `dailyRashiService.fallbackFetchInsight` ([src/features/astrology/services/dailyRashiService.ts#L463-L470](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L463-L470)), the direct table fallback query behaves identically to the RPC:

```typescript
const { data: insightData, error: insightError } = await supabase
  .from("daily_rashi_insights")
  .select("*")
  .eq("insight_date", date)
  .eq("rashi_id", rashiId)
  .eq("language", language)
  .eq("status", "published")
  .maybeSingle();
```
It strictly filters by `.eq("language", language)` and returns `content: null` if no matching row is found.

---

## 5. Daily Insights vs. Legacy Astrology Content

A critical distinction must be maintained between the two astrology systems in KashiVeda:

| Feature / Attribute | Dedicated Daily Rashi Insights (`public.daily_rashi_insights`) | Legacy Curated Astrology (`public.astrology_content`) |
| :--- | :--- | :--- |
| **Originating Migration** | Migration `045_daily_vedic_astrology_insights.sql` (Phase 2A) | Migration `009_astrology.sql` (Phase 1) |
| **Domain Scope** | 12-Rashi daily planetary horoscope matrix (Mesha–Meena) | General cosmic transits, devotional articles, weekly guidance |
| **Language Column** | `language VARCHAR(5) NOT NULL DEFAULT 'en'` | **No language column** |
| **Zodiac Dimension** | `rashi_id SMALLINT NOT NULL (1–12)` | **No rashi_id column** (broadcast content) |
| **Natural Identifier** | `(insight_date, rashi_id, language)` | `id UUID` (Primary Key) |
| **Dispatch Channel** | In-app mobile screen only (`AstrologyScreen.tsx`) | In-app feed + WhatsApp queue (`astrology_deliveries`) |
| **Admin Matrix** | Dedicated 12-Rashi interactive bilingual matrix view | Traditional CRUD list / modal for article broadcasts |
| **Multilingual Status** | **Bilingual schema & Admin support (`en`, `hi`)** | **Unilingual (English-only)** |

**Assessment Finding:** AST-Q04 applies **exclusively** to `public.daily_rashi_insights`. The legacy `public.astrology_content` feed does not support language codes at the schema or service level.

---

## 6. Admin Language Authoring and Publication

Inspection of `C:\Projects\kashi-veda-admin` reveals a fully developed editorial workflow for both English and Hindi daily insights:

### 6.1 Matrix View & Language Switcher
In [daily-insights-matrix-view.tsx#L565-L587](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx#L565-L587):
- Authors can toggle between `English` and `हिन्दी (Hindi)`.
- When switching language:
  ```typescript
  const handleLanguageChange = (newLang: string) => {
    setActiveFieldSlot(null);
    setActiveFullSlot(null);
    setIsPublishModalOpen(false);
    setIsBulkImportOpen(false);
    setSelectedLanguage(newLang);
    selectedKeyRef.current = getMatrixIdentityKey(selectedDate, newLang);
    handleFetchMatrix(selectedDate, newLang);
  };
  ```
  The matrix immediately closes any open modals (preventing cross-language edit corruption), updates the key coordinator to `${selectedDate}::${newLang}`, and loads the 12-Rashi matrix for the selected language.

### 6.2 Authoring and Saving Daily Insights
In [lib/actions/daily-insights-management.ts#L138-L175](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L138-L175):
- The `saveDailyRashiInsight` action validates:
  ```typescript
  if (!formData.insight_date || !formData.rashi_id || !formData.language) {
    return { success: false, error: "Date, Rashi, and Language are required." };
  }
  ```
- It invokes the database mutation RPC `admin_save_daily_rashi_insight` passing:
  ```typescript
  p_language: formData.language.trim().toLowerCase()
  ```
- The mutation RPC locks the row `WHERE insight_date = p_insight_date AND rashi_id = p_rashi_id AND language = p_language FOR UPDATE` ([supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql#L98-L101](file:///C:/Projects/KashiVeda/supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql#L98-L101)).

### 6.3 Publishing Daily Sets
In [lib/actions/daily-insights-management.ts#L365-L420](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts#L365-L420) and [components/admin/astrology/daily-insights/publish-daily-set-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/publish-daily-set-modal.tsx):
- "Publish Daily Set" validates that all 12 Rashis have at least `general_outlook` filled for the target date and language.
- It iterates through all 12 Rashis and sets `p_status: 'published'` for each record with `p_language: language`.
- Authors can publish an English set, a Hindi set, or both independently.

### 6.4 Bulk CSV Import
In [lib/astrology/daily-insights-csv-parser.ts#L250-L270](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts#L250-L270) and [components/admin/astrology/daily-insights/bulk-import-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx):
- The bulk CSV import tool includes a `language` column.
- The parser validates that `language` matches `en` or `hi`.
- Authors can download a pre-populated CSV template populated with all 12 Rashis for the currently selected language (`daily_insights_${selectedDate}_${selectedLanguage}.csv`).

---

## 7. Cache Keys, Refresh Behavior, and Fallbacks

### 7.1 Cache Key Architecture
In `dailyRashiService.ts` ([src/features/astrology/services/dailyRashiService.ts#L161-L163](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts#L161-L163)):

```typescript
private getCacheKey(userScope: string, date: string, rashiId: number, language = "en"): string {
  return `${userScope}:${date}:${rashiId}:${language}`;
}
```

**Cache Characteristics:**
1. **Key Isolation:** The in-memory `Map` (`this.memoryCache`) and persistent `AsyncStorage` (`@kashiveda_daily_insight_v2:${cacheKey}`) strictly incorporate `language`.
   - English Key: `@kashiveda_daily_insight_v2:u_<userId>:2026-10-15:1:en`
   - Hindi Key: `@kashiveda_daily_insight_v2:u_<userId>:2026-10-15:1:hi`
2. **Cache Collision Immunity:** English and Hindi cache entries cannot overwrite or satisfy each other. A cached English response will never be served to a Hindi lookup.
3. **Session Cleansing:** When a user logs out or switches accounts, `clearSessionCache()` and `clearMemoryCache()` purge all entries regardless of language.

### 7.2 Entitlement Orthogonality
- Paid subscription entitlement (`is_entitled`) is verified against `public.astrology_subscriptions` for the authenticated customer.
- Entitlement is completely **orthogonal to language**. An active subscriber is entitled to view all published languages for their subscribed dates and Rashis. Language selection does not affect subscription verification.

### 7.3 Hypothetical Stale Rendering on Language Switch
If a language selector were added to `AstrologyScreen.tsx` without modifying `useDailyRashiInsight.ts`:
- In `useDailyRashiInsight.ts`, state variable `insight` is stored in React state (`const [insight, setInsight] = useState<DailyRashiInsight | null>(null);`).
- `setInsight(null)` is called on Rashi change (`selectRashi`), on session change (logout/login), and on midnight rollover (`dateChanged`).
- However, there is no language state or language change handler in `useDailyRashiInsight.ts`.
- If language changed without clearing `insight`, the previously loaded English insight would remain rendered on screen while the Hindi request was in-flight. If the Hindi fetch failed, the screen would continue displaying the stale English insight unless explicitly cleared.

---

## 8. Safe Tests and Scenario Evaluation

All 10 required evaluation scenarios were assessed using read-only source code inspection and existing automated unit/integration tests:

| # | Scenario | Mechanism / Source Reference | Observed / Proven Behavior | Assessment Result |
| :--- | :--- | :--- | :--- | :--- |
| **1** | English requested, English content exists | RPC `get_daily_rashi_insight('D', R, 'en')` | Returns `content: {...}`, cached under `...:en`, rendered in `DailyRashiInsightCard`. | **Verified & Working** (Tested in `daily_vedic_astrology_insights.test.tsx#L363`) |
| **2** | Hindi requested, Hindi content exists | RPC `get_daily_rashi_insight('D', R, 'hi')` | Works at service layer (`dailyRashiService.fetchDailyInsight`). **Unreachable** in mobile app due to hardcoded `"en"`. | **Blocked in Mobile Client** (Service tested in `daily_astrology_cache_security.test.tsx#L574`) |
| **3** | Both translations exist for same date & Rashi | Unique constraint `uq_daily_rashi_insights_date_rashi_lang` | Both records coexist in DB. Admin edits both. Mobile only retrieves English. | **Verified Coexistence; Mobile English-Only** |
| **4** | Selected language has no published content | RPC `WHERE language = p_language` | Returns `content: NULL`. Mobile displays `EmptyState` ("No Insight Today"). **No silent fallback**. | **Verified Strict Filtering; No Fallback** |
| **5** | Language changes while screen is open | Admin: `handleLanguageChange` / Mobile: N/A | Admin closes modals & reloads matrix. Mobile has no selector or handler. | **Admin Supported; Mobile Not Implemented** |
| **6** | Prior English response cached before Hindi requested | `dailyRashiService.getCacheKey` | Keys are distinct (`...:en` vs `...:hi`). Cache does not cross-contaminate. | **Verified Cache Isolation** |
| **7** | Request for selected language fails | Network error or DB failure in `dailyRashiService` | Renders `ErrorState` or offline unverified card. Does not invent false data. | **Verified Safe Failure Handling** |
| **8** | App starts with Hindi device locale, no explicit preference | `src/app/config.ts#L8` (`defaultLocale: "en-IN"`) | Native locale is completely ignored. App defaults to English. | **Verified Device Locale Ignored** |
| **9** | User has explicit language preference differing from locale | `public.profiles` schema inspection | No `preferred_language` column exists. Preference cannot be saved or expressed. | **Verified No Profile Language Support** |
| **10** | Subscription entitlement valid/invalid across languages | RPC subscription check in `045` / `055` | Entitlement is verified against subscription table; identical across languages. | **Verified Entitlement Orthogonality** |

### 8.1 Existing Automated Test Coverage
The existing automated test suites in `C:\Projects\KashiVeda\__tests__` were executed and analyzed:
1. `__tests__/daily_astrology_cache_security.test.tsx`: **12/12 PASSED**. Includes scenario 10 and 12 verifying that `dailyRashiService.fetchDailyInsight` can handle `"hi"` and that cache keys contain `:hi`.
2. `__tests__/daily_astrology_state_refresh_lifecycle.test.tsx`: **10/10 PASSED**. Verifies midnight rollover and subscription lifecycle, but assumes English for all test runs.
3. `__tests__/daily_vedic_astrology_insights.test.tsx`: **20/20 PASSED**. Verifies Rashi selection, dates, RPC integration, and card rendering, hardcoding `language: "en"` across all tests.
4. **Test Gap:** There are **zero mobile UI or hook tests** testing Hindi content retrieval, language switching, or bilingual error states in the customer experience.

---

## 9. Confirmed Bugs vs. Requirement Questions

It is critical to distinguish between technical defects and open product requirements:

### 9.1 What Is a Confirmed Technical Gap / Defect
1. **Hook In-Flight Deduplication Key Omission ([useDailyRashiInsight.ts#L111](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts#L111)):**
   - The in-flight deduplication key is defined as `${requestUserId}:${targetRashiId}:${currentIndianDate}`, omitting `language`.
   - If multi-language fetching is enabled in the hook in the future, concurrent requests for different languages will collide in the deduplication guard.
2. **Broken Editorial Expectation:**
   - Editorial scholars can spend hours writing, translating, reviewing, and publishing daily Hindi guidance in the Admin portal under the belief that Hindi-speaking devotees are reading it. In reality, that content is 100% invisible to all mobile users.

### 9.2 What Is a Requirement Question (Product Decision)
1. **Is Hindi Daily Vedic Horoscope a Required Feature for the Current Mobile Release?**
   - The original AST-Q04 finding noted that it is not yet established whether bilingual content selection is required for the current release.
   - If the product vision intended the initial mobile release to be English-only, then hardcoding `const requestLanguage = "en";` is not a defect—it is a feature freeze boundary.
   - Conversely, if Feature 02 was specified to launch as a bilingual Hindi/English customer experience, then mobile language selection is incomplete.
2. **How Should Language Be Selected by the Devotee?**
   - Option A: Explicit in-screen toggle ([English | हिन्दी]) directly on the Daily Vedic Horoscope card/screen.
   - Option B: Global customer account preference stored on `public.profiles` and configured in Account Settings.
   - Option C: Automatic device locale detection (`hi-IN` vs `en-IN`) with manual override.
   - Option D: Defer mobile Hindi to a future release and add a warning banner in Admin informing authors that Hindi content is currently staging-only.
3. **What Is the Expected Fallback Behavior When Content Is Missing?**
   - If a devotee selects Hindi, but Vedic scholars have only published English content for that day, should the system:
     - Fall back to English and show the English guidance?
     - Or show the "Insights are being prepared" empty state and adhere strictly to Hindi?

---

## 10. Product Decisions Required

The product owner must decide on the following options before any implementation begins:

### Option A: In-Screen English/Hindi Toggle on Daily Horoscope
- **Description:** Add a segmented control (`[English | हिन्दी]`) to `AstrologyScreen.tsx` immediately above or within `DailyRashiInsightCard.tsx`.
- **User Impact:** Devotees can easily switch languages for today's horoscope with one tap, independent of overall app settings.
- **Architectural Scope:**
  - Update `useDailyRashiInsight` to accept `selectedLanguage` and expose `selectLanguage(lang: "en" | "hi")`.
  - Include `language` in `requestKey` and reset `insight` on language change.
  - Add UI segmented button component to `AstrologyScreen.tsx`.
  - Add comprehensive unit and integration tests.

### Option B: App-Wide Customer Language Preference
- **Description:** Implement a global language preference for the customer's account.
- **User Impact:** Setting language once in Profile / Settings applies to Daily Astrology and future localized features.
- **Architectural Scope:**
  - Database migration: Add `preferred_language VARCHAR(5) DEFAULT 'en'` to `public.profiles`.
  - RPC: Add `public.set_customer_preferred_language(p_language)`.
  - Mobile UI: Add Language Picker in `ProfileScreen.tsx`.
  - Mobile Hook: `useDailyRashiInsight` reads language from `useAuth().profile?.preferred_language || "en"`.

### Option C: English-Only for Mobile MVP (Admin Clarification)
- **Description:** Maintain the mobile application as English-only for the current release. Update the Admin portal to clearly communicate that Hindi daily insights are currently staging/preview-only and not yet served to mobile customers.
- **User Impact:** Zero risk to mobile release timeline; sets clear expectations for content authors.
- **Architectural Scope:**
  - Zero mobile code changes.
  - Admin UI update: Add badge or tooltip on Hindi matrix tab: *"Hindi mobile display is scheduled for Phase 2B; published Hindi insights are currently archived."*

### Option D: Device Locale Automatic Detection
- **Description:** Mobile app inspects device system language on launch. If device locale starts with `hi`, request `hi`; otherwise `en`.
- **User Impact:** Automatic for Hindi users without needing manual configuration.
- **Architectural Scope:**
  - Install and configure a device locale library or native module.
  - Define fallback rules when device is in Hindi but published content is English.

---

## 11. Recommended Next Step, Without Implementing It

1. **Present Product Decisions to Product Owner:**
   - Present Options A, B, C, and D alongside the editorial trade-offs identified in this report.
   - Request an explicit product decision on:
     a) Whether mobile Hindi horoscope display is in-scope for the current release.
     b) If in-scope, whether language selection should be an in-screen toggle (Option A) or account-wide setting (Option B).
     c) The desired fallback rule when a translation is missing (strict null vs. English fallback).
2. **If Option C is Chosen:**
   - No mobile code modifications.
   - Update Admin documentation and UI to mark Hindi as Phase 2B staging.
3. **If Option A is Chosen (Minimum Viable Multilingual Remediation):**
   - Modify `useDailyRashiInsight.ts`:
     - Accept optional `initialLanguage?: "en" | "hi"` parameter.
     - Include `language` in `requestKey` at line 111.
     - Add `selectedLanguage` state and `selectLanguage` callback.
     - Ensure `setInsight(null)` is called when language changes to prevent stale content rendering.
   - Modify `AstrologyScreen.tsx` & `DailyRashiInsightCard.tsx`:
     - Add bilingual toggle tab (`English` / `हिन्दी`).
   - Add automated Jest unit tests covering language switching, Hindi rendering, and cache segregation.

---

## 12. Exact Files, Functions, and Migrations Inspected

### Mobile Application (`C:\Projects\KashiVeda`)
- [package.json](file:///C:/Projects/KashiVeda/package.json) (Dependencies verification: absence of i18n libraries)
- [src/app/config.ts](file:///C:/Projects/KashiVeda/src/app/config.ts) (Lines 1–11: `defaultLocale: "en-IN"`)
- [src/features/astrology/hooks/useDailyRashiInsight.ts](file:///C:/Projects/KashiVeda/src/features/astrology/hooks/useDailyRashiInsight.ts) (Lines 111: `requestKey`; Lines 128–131: `requestLanguage = "en"`; Lines 154–173: `fetchDailyInsight` call)
- [src/features/astrology/screens/AstrologyScreen.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/screens/AstrologyScreen.tsx) (Lines 55–65: hook invocation; Lines 212–242: daily horoscope section)
- [src/features/astrology/components/DailyRashiInsightCard.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/components/DailyRashiInsightCard.tsx) (Lines 25–48: props; Lines 151–162: empty state; Lines 165–200: insight rendering)
- [src/features/astrology/components/RashiSelector.tsx](file:///C:/Projects/KashiVeda/src/features/astrology/components/RashiSelector.tsx) (Lines 13–83: Rashi chips without language controls)
- [src/features/astrology/services/dailyRashiService.ts](file:///C:/Projects/KashiVeda/src/features/astrology/services/dailyRashiService.ts) (Lines 161–163: `getCacheKey`; Lines 170–250: `fetchDailyInsight`; Lines 463–471: fallback table query)
- [src/features/astrology/types/rashi.types.ts](file:///C:/Projects/KashiVeda/src/features/astrology/types/rashi.types.ts) (Lines 200–225: `DailyRashiInsight` interface)
- [src/features/astrology/types/astrology.types.ts](file:///C:/Projects/KashiVeda/src/features/astrology/types/astrology.types.ts) (Lines 68–79: legacy `AstrologyContent` interface)
- [src/features/auth/screens/ProfileScreen.tsx](file:///C:/Projects/KashiVeda/src/features/auth/screens/ProfileScreen.tsx) (Lines 72–219: customer profile without language settings)
- [__tests__/daily_vedic_astrology_insights.test.tsx](file:///C:/Projects/KashiVeda/__tests__/daily_vedic_astrology_insights.test.tsx) (Lines 350–450: unit tests defaulting to `en`)
- [__tests__/daily_astrology_cache_security.test.tsx](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_cache_security.test.tsx) (Lines 490–588: cache isolation and Hindi service mock)
- [__tests__/daily_astrology_state_refresh_lifecycle.test.tsx](file:///C:/Projects/KashiVeda/__tests__/daily_astrology_state_refresh_lifecycle.test.tsx) (Lifecycle refresh tests)

### Database Migrations (`C:\Projects\KashiVeda\supabase\migrations`)
- [002_identity.sql](file:///C:/Projects/KashiVeda/supabase/migrations/002_identity.sql) (Lines 28–40: `public.profiles` definition)
- [009_astrology.sql](file:///C:/Projects/KashiVeda/supabase/migrations/009_astrology.sql) (Lines 66–78: legacy `public.astrology_content` definition)
- [045_daily_vedic_astrology_insights.sql](file:///C:/Projects/KashiVeda/supabase/migrations/045_daily_vedic_astrology_insights.sql) (Lines 25–50: `public.daily_rashi_insights` table & `uq_daily_rashi_insights_date_rashi_lang`; Lines 109–233: `get_daily_rashi_insight` RPC)
- [050_daily_astrology_csv_import_overwrite_guard.sql](file:///C:/Projects/KashiVeda/supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql) (Lines 32–102: `admin_save_daily_rashi_insight` RPC)
- [055_decouple_plan_deactivation_from_entitlements.sql](file:///C:/Projects/KashiVeda/supabase/migrations/055_decouple_plan_deactivation_from_entitlements.sql) (Lines 190–245: `get_daily_rashi_insight` RPC)

### Administrative Portal (`C:\Projects\kashi-veda-admin`)
- [lib/types/daily-insights-management.ts](file:///C:/Projects/kashi-veda-admin/lib/types/daily-insights-management.ts) (Admin types and `getDailyInsightCompositeKey`)
- [lib/actions/daily-insights-management.ts](file:///C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts) (`getDailyRashiInsightsMatrix`, `saveDailyRashiInsight`, `publishDailyRashiSet`)
- [components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx) (Lines 565–587: English / Hindi toggle buttons; lines 190–200: `handleLanguageChange`)
- [components/admin/astrology/daily-insights/publish-daily-set-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/publish-daily-set-modal.tsx) (Publishing set for date & language)
- [components/admin/astrology/daily-insights/bulk-import-modal.tsx](file:///C:/Projects/kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx) (Bulk CSV import with language column)
- [lib/astrology/daily-insights-csv-parser.ts](file:///C:/Projects/kashi-veda-admin/lib/astrology/daily-insights-csv-parser.ts) (CSV parsing and language validation)

---

## 13. Safety Attestation

This assessment was conducted strictly in read-only mode in accordance with Kashi Veda Project Rules:
- **No Source Code Changes:** No application files in `C:\Projects\KashiVeda` or `C:\Projects\kashi-veda-admin` were created or altered.
- **No Migration Changes:** No database migrations, SQL schemas, RLS policies, or database functions were modified or created.
- **No Remote or Production Writes:** No production queries, writes, or probes were executed.
- **Test Integrity:** No existing test files were altered. Existing test suites were executed read-only and passed without modification.
- **Scope Discipline:** Work was strictly limited to AST-Q04. AST-Q05 and other findings were not touched.
- **Authorized File Creation:** The only file created as part of this task is this report:
  `C:\Projects\KashiVeda\KASHIVEDA_AST_Q04_LANGUAGE_SELECTION_ASSESSMENT_REPORT.md`.

---

## 14. Final Decision

### Outcome Selection:
**Outcome D — Requirement decision needed (accompanied by Outcome C — Partially implemented at the mobile client layer).**

### Justification:
1. **Language values and bilingual content workflow exist in the backend and Admin portal**, proving that the system was architected to accommodate both English and Hindi daily insights.
2. **However, a required step in presentation and retrieval is missing from the mobile application:** the mobile hook hardcodes `const requestLanguage = "en";` and the mobile UI provides no language selector or profile preference.
3. **Crucially, the mobile application cannot be declared "defective" under Outcome E without an authoritative product specification** establishing whether bilingual content was a mandatory requirement for the Phase 2A mobile release or an intentionally deferred feature for Phase 2B.
4. **Therefore, Outcome D is the only sound engineering conclusion:** The implemented behavior cannot be judged correct or incorrect until the product owner explicitly decides between Option A (in-screen toggle), Option B (account setting), Option C (English-only mobile MVP), or Option D (device locale detection).
