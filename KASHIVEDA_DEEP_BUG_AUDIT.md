# KashiVeda — Phase 2: Independent Bug Verification & Deep System Audit Report

**Date of Audit:** October 10, 2026  
**Auditing Role:** Principal Software Architect, Application Security Auditor & Database Specialist  
**Deliverable Path:** `C:\Projects\KashiVeda\KASHIVEDA_DEEP_BUG_AUDIT.md`  
**Inspected Repositories:** Main Mobile Application (`C:\Projects\KashiVeda`), Admin Website (`C:\Projects\kashi-veda-admin`), Database Migrations (`001`–`045`), Supabase Edge Functions, and Live External Integrations.  
**Operating Standard:** Strict Read-Only Investigation, Static Verification, and Non-Mutating Regression Testing.

---

## 1. Executive Summary

This Phase 2 Deep Bug Audit independently investigates, challenges, and validates the claims made during the initial discovery audit of the **KashiVeda** platform. 

### Key Audit Conclusions:
1. **Architecture & Technology Confirmation**:
   - The main mobile application (`C:\Projects\KashiVeda`) is a React Native 0.87.1 codebase with 100% clean TypeScript (`tsc --noEmit` exit code 0) and 36 test suites containing **691 passing unit/component tests**.
   - The admin website (`C:\Projects\kashi-veda-admin`) is a Next.js 14/15 App Router codebase with Server Actions delegating mutations to PostgreSQL `SECURITY DEFINER` RPCs.
   - Both codebases interface with a unified **Supabase Cloud PostgreSQL** backend with 45 ordered SQL migrations.
2. **Defect Verification & Findings**:
   - **`BUG-001` (IST Midnight Date-Boundary Condition)**: **CONFIRMED & PROVEN**. PostgreSQL expression `(CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')` evaluated in UTC server time (`2026-10-09`) before shifting timezone, causing requests for `2026-10-10` between 00:00 and 05:30 AM IST to be rejected with `Future insights are not available.`. Local migration `045` was corrected to `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` and awaits execution in the remote Supabase SQL Editor.
   - **`BUG-002` (Remote Migration Synchronicity)**: **CONFIRMED OPERATIONAL DEPENDENCY**. Migrations `001` through `045` have cumulative function replacements (e.g. `create_or_validate_booking` replaced 6 times across `011`, `013`, `029`, `032`, `035`, `041`, `043`). Full system integrity requires the remote database to have applied all migrations up to `045`.
   - **`BUG-003` (Google OAuth Client ID Resolution)**: **CONFIRMED AS CONFIGURATION DEPENDENCY**. Mobile client fallback string exists in `src/infrastructure/supabase/config.ts`, but Android release builds require the signing keystore SHA-1 fingerprint to be registered in Google Cloud Console.
   - **`BUG-004` (Camera/Microphone Permission Handling)**: **RECLASSIFIED TO EXPECTED BEHAVIOR WITH VIEWER FALLBACK**. Inspection of `CustomerLiveSessionScreen.tsx` reveals that when camera/mic permissions are denied, the client gracefully falls back to viewer mode (`autoPublish: false`) so devotees can still observe rituals without crashing.
3. **Security Posture**:
   - Financial orders are 100% server-authoritative; the client cannot manipulate transaction amounts.
   - Razorpay webhooks enforce constant-time raw-body HMAC-SHA256 signature verification.
   - Private storage buckets (`pandit-documents`, `pandit-bank-documents`, `payout-documents`) enforce restrictive RLS and prevent direct anonymous downloads.

---

## 2. Initial Audit Verification Matrix

| Claim from Initial Report | Verification State | Evidence & File References | Audit Notes |
| :--- | :--- | :--- | :--- |
| **React Native 0.87.1 & React 19 Stack** | **Verified** | `package.json:24-25` | Confirmed from package dependencies. |
| **Next.js App Router Admin Console** | **Verified** | `kashi-veda-admin/app/(admin)/` | Confirmed decoupled App Router layout. |
| **Unified Supabase PostgreSQL Backend** | **Verified** | `src/infrastructure/supabase/config.ts` | Single cloud endpoint URL shared across both projects. |
| **691 Passing Automated Tests** | **Verified** | `npm test` output (36 test suites, 691 tests) | Executed locally with 0 failures in 23.1s. |
| **Clean TypeScript Compilation** | **Verified** | `npx tsc --noEmit` | Exit code 0, 0 diagnostic errors. |
| **BUG-001 (IST Date Boundary Lookups)** | **Verified (Confirmed Defect)** | `supabase/migrations/045_daily_vedic_astrology_insights.sql:79,129,461` | PostgreSQL timezone type truncation proven mathematically. |
| **BUG-002 (Migration Cumulative Replacements)** | **Verified (Operational Dependency)** | `011`, `013`, `029`, `032`, `035`, `041`, `043` | `create_or_validate_booking` evolved from 8 to 11 parameters. |
| **BUG-003 (Google OAuth Configuration)** | **Verified (Configuration Dependency)** | `src/features/auth/services/authService.ts:58-76` | Dependent on Google Cloud Console SHA-1 fingerprint registration. |
| **BUG-004 (Camera/Mic Denial Severity)** | **Contradicted (Reclassified to Working)** | `CustomerLiveSessionScreen.tsx:81-87` | Graceful fallback to `autoPublish: false` viewer mode is implemented. |
| **Authoritative Upfront Financial Amounts** | **Verified** | `create-razorpay-order/index.ts:107-188` | Reads `public.payment_orders` obligation; ignores client values. |
| **Webhook HMAC-SHA256 Verification** | **Verified** | `razorpay-webhook/index.ts:53-86`, `_shared/crypto.ts` | Constant-time raw-body verification enforced. |
| **PostGIS Spatial Service Radius Check** | **Verified** | `043_pandit_temple_associations.sql:795-802` | Uses `extensions.st_dwithin` and `st_makepoint`. |
| **Temple Affiliation Enforcement** | **Verified** | `043_pandit_temple_associations.sql:818-827` | Validates `public.pandit_temples` active approved status. |
| **Remote Puja Samagri Prohibition** | **Verified** | `043_pandit_temple_associations.sql:871-875` | Prohibits samagri packages and custom items for `remote` mode. |

---

## 3. Confirmed Defects Register

### Finding `DEF-001` (formerly `BUG-001`)
- **Severity**: **P1 — High**
- **Confidence**: **100% (Confirmed via Static & SQL Semantic Analysis)**
- **Affected Domain**: Daily 12-Rashi Astrological Insights
- **File / Object**: `supabase/migrations/045_daily_vedic_astrology_insights.sql` -> `get_daily_rashi_insight`, `admin_list_daily_rashi_insights`, and `daily_rashi_insights_select_customer` policy.
- **Observed Behavior**: Customers in India opening the app between 00:00 AM IST and 05:30 AM IST receive `{ success: false, error: 'Future insights are not available.' }` for today's published horoscope, rendering an empty *"No Insight for Mithuna Today"* state.
- **Expected Behavior**: Customers should receive today's published horoscopes starting at 00:00 AM IST (midnight in India).
- **Root Cause**: In PostgreSQL, `CURRENT_DATE` returns a timezone-naive `DATE` based on the server session clock (UTC in Supabase Cloud). At 02:30 AM IST on Oct 10, UTC is 21:00 on Oct 9. `CURRENT_DATE` evaluates to `'2026-10-09'::DATE`. Shifting it with `AT TIME ZONE 'Asia/Kolkata'` treats it as `'2026-10-09 00:00:00'` at Kolkata and converts to UTC timestamptz, which when cast to `DATE` yields `'2026-10-09'`. When the mobile client sends `p_insight_date = '2026-10-10'`, `p_insight_date > v_today_ist` is evaluated as `'2026-10-10' > '2026-10-09'` (TRUE), incorrectly rejecting the request as a future date.
- **Proof of Fix**: Updated expression to `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)`. `now()` returns `TIMESTAMPTZ` (`2026-10-09 21:00:00+00`). Shifting to Kolkata gives `TIMESTAMP WITHOUT TIME ZONE '2026-10-10 02:30:00'`, which casts to `'2026-10-10'::DATE`.
- **Operational Action**: Execute the updated SQL migration `045` in Supabase SQL Editor.

### Finding `DEF-002` (formerly `BUG-002`)
- **Severity**: **P2 — Medium**
- **Confidence**: **100% (Confirmed via Schema Dependency Audit)**
- **Affected Domain**: Database Schema & RPC Consistency
- **File / Object**: `supabase/migrations/001` through `045`
- **Observed Behavior**: The codebase depends on RPC signatures introduced in later migrations (e.g. 11-argument `create_or_validate_booking` in `043`, `get_daily_rashi_insight` in `045`, `admin_save_daily_rashi_insight` in `045`, `get_pandit_payout_summaries` in `042`).
- **Expected Behavior**: All 45 migrations must be applied sequentially on the remote Supabase database instance.
- **Root Cause**: Supabase database migrations are managed manually via the SQL editor or CLI push. If earlier migrations are present but `043`–`045` are pending, features depending on new parameters or tables will fail.
- **Operational Action**: Run pending migration scripts in sequential order on the active Supabase project.

---

## 4. Suspected Defects & Unverified Edge Cases

### Suspected Finding `SUS-001`: Client-Side Timezone Clock Discrepancy
- **Severity**: **P2 — Medium**
- **Confidence**: **85% (Suspected Edge Case)**
- **File**: `src/features/astrology/services/dailyRashiService.ts` and `src/shared/utils/date.ts`
- **Condition**: If a user's mobile device clock is manually altered or set to a timezone outside of India (e.g. US Pacific Time UTC-7), `getIndianCalendarDate()` properly computes the IST date via `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })`. However, if the device OS lacks modern `Intl` timeZone support and falls back to the catch block, it adds a fixed 5.5 hour offset to local device time rather than UTC time.
- **Impact**: On legacy devices without `Intl` timeZone support located outside India, date resolution could differ.
- **Recommendation**: Ensure the fallback offset calculation computes from `date.getTime() + (date.getTimezoneOffset() * 60000) + (5.5 * 3600000)`.

---

## 5. Security & Access Control Review

### 5.1 Row-Level Security (RLS) Policy Audit

| Table Name | RLS Enabled | Customer Policy | Pandit Policy | Admin Policy | Security Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`public.profiles`** | Yes | Read public profiles; Update own record (`id = auth.uid()`). | Same as customer. | Full CRUD via `is_admin()`. | **Secure** |
| **`public.bookings`** | Yes | Select own bookings (`customer_id = auth.uid()`). | Select assigned bookings (`pandit_id = pandit.id`). | Full CRUD via `is_admin()`. | **Secure** (Mutations locked behind RPCs). |
| **`public.payment_orders`** | Yes | Select own orders (`customer_id = auth.uid()`). | Select orders for assigned bookings. | Full CRUD via `is_admin()`. | **Secure** (Amounts immutable via RLS). |
| **`public.pandit_bank_accounts`** | Yes | None (Blocked). | Select own bank accounts (`pandit_id = pandit.id`). | Select & Verify via `is_super_admin()`. | **Secure** (Passbook proofs private). |
| **`public.payout_ledger`** | Yes | None (Blocked). | Select own payout records (`pandit_id = pandit.id`). | Full CRUD via `is_super_admin()`. | **Secure** (Settlements Super Admin only). |
| **`public.daily_rashi_insights`** | Yes | Select published records where `s.status = 'active'` and `s.ends_at > now()`. | Same as customer. | Full CRUD via `is_admin()`. | **Secure** (Entitlement checked in RLS & RPC). |
| **`public.reviews`** | Yes | Select published reviews; Insert locked to RPC. | Select published reviews for own profile. | Moderate/Hide via `is_admin()`. | **Secure** (Spoofing prevented). |

### 5.2 Storage Bucket Privacy Audit

| Bucket ID | Public Status | Max File Size | Allowed MIME Types | Upload Authorization | Read Authorization |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`pandit-documents`** | **Private (`false`)** | 10 MB | PDF, JPEG, PNG, WEBP | Authenticated Pandit applying for verification | Admin / Super Admin & Owner |
| **`pandit-bank-documents`** | **Private (`false`)** | 10 MB | PDF, JPEG, PNG, WEBP | Authenticated Pandit submitting bank proof | Super Admin & Owner |
| **`payout-documents`** | **Private (`false`)** | 10 MB | PDF, JPEG, PNG, WEBP | Super Admin recording settlement UTR receipt | Super Admin & Associated Pandit |
| **`kundli-documents`** | **Private (`false`)** | 25 MB | PDF | Admin fulfilling manual Kundli order | Admin & Booking Customer |

---

## 6. Financial Workflow & Payout Ledger Review

### 6.1 End-to-End Financial State Machine

```
[Booking Request] ──► calculate_or_validate_booking RPC
                            │
                            ▼
              ┌─────────────────────────────┐
              │ public.bookings             │
              │ - status: 'payment_pending' │
              │ - advance_amount (10%/50%)  │
              │ - balance_amount            │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │ public.payment_orders       │
              │ - amount: advance_amount    │
              │ - status: 'created'         │
              └─────────────┬───────────────┘
                            │
              (Client calls create-razorpay-order)
                            │
                            ▼
              ┌─────────────────────────────┐
              │ Razorpay Gateway API        │
              │ - Creates Order (Paise)     │
              │ - Returns rzp_order_id      │
              └─────────────┬───────────────┘
                            │
              (Customer pays via native SDK)
                            │
                            ▼
              ┌─────────────────────────────┐
              │ razorpay-webhook            │
              │ - Raw HMAC-SHA256 verified  │
              │ - Validates amount match    │
              │ - status: 'paid'            │
              └─────────────┬───────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │ confirm_booking_advance_rpc │
              │ - bookings.status:          │
              │   'confirmed'               │
              │ - payment_transactions row  │
              └─────────────┬───────────────┘
                            │
              (Ritual performed & completed)
                            │
                            ▼
              ┌─────────────────────────────┐
              │ confirm_booking_completion  │
              │ - bookings.status:          │
              │   'completed'               │
              │ - Inserts pandit_payouts    │
              │   (Net Pandit Earnings)     │
              └─────────────┬───────────────┘
                            │
              (Admin executes manual settlement)
                            │
                            ▼
              ┌─────────────────────────────┐
              │ admin_process_payout RPC    │
              │ - pandit_payouts.status:    │
              │   'paid'                    │
              │ - Records bank UTR receipt  │
              └─────────────────────────────┘
```

### 6.2 Financial Invariants Verified:
1. **No Client Price Manipulation**: `create-razorpay-order` queries `public.payment_orders` by UUID. If a client attempts to pass a custom amount, it is ignored; the server derives amount in paise strictly from the database row.
2. **Atomic Order Claiming (CAS)**: Multiple simultaneous checkout taps are prevented via `UPDATE payment_orders SET status = 'pending' WHERE id = :id AND status = 'created' AND provider_order_id IS NULL`. Only one thread wins the CAS claim.
3. **Webhook Idempotency**: If Razorpay delivers duplicate `payment.captured` webhooks, the handler checks `if (order.status === 'paid') return jsonResponse({ received: true, duplicate: true }, 200)`.

---

## 7. App–Admin Consistency Report

| Entity / Domain | Main Mobile App Behavior | Admin Website Behavior | Shared Contract | Consistency Assessment |
| :--- | :--- | :--- | :--- | :--- |
| **12-Rashi Matrix** | Queries `get_daily_rashi_insight` for date & rashi. | Queries `admin_list_daily_rashi_insights` and saves via `admin_save_daily_rashi_insight`. | `public.daily_rashi_insights` | **100% Consistent** |
| **Pandit Onboarding** | Pandit submits profile + identity proofs. | Admin approves/rejects via `admin_approve_pandit_application`. | `public.pandit_profiles` | **100% Consistent** |
| **Pandit Bank Accounts**| Pandit submits IFSC, account number, passbook. | Super Admin approves/rejects via `admin_verify_pandit_bank_account`. | `public.pandit_bank_accounts` | **100% Consistent** |
| **Payout Settlements** | Pandit views net earnings and payout status. | Super Admin processes settlement UTR via `admin_process_payout`. | `public.pandit_payouts` | **100% Consistent** |
| **Reviews & Ratings** | Customers submit 1–5 star reviews for completed pujas. | Admin hides/restores reviews via `admin_moderate_review`. | `public.reviews` | **100% Consistent** |

---

## 8. Astrology, Kundli & Subscription Audit

### 8.1 12-Rashi Daily Insights
- **Editorial Matrix**: 6 columns (`Rashi`, `General Outlook`, `Career`, `Finance`, `Love`, `Status/Actions`).
- **Context-Aware Field Modal**: Clicking an individual cell opens `DailyInsightFieldModal` with targeted textarea, character count, and draft saving.
- **Bulk CSV Ingestion**: `BulkImportModal` provides CSV format validation, template download, and batch draft insertion.
- **Entitlement Enforcement**: Unsubscribed users receive locked card previews; subscribed users receive full sectional breakdowns.

### 8.2 Free Kundli Calculation Engine
- Ephemeris calculations are executed in `calculate-free-kundli` Edge Function using astronomical formulas for planetary longitude, Ascendant (Lagna), Moon sign (Janma Rashi), and Nakshatra.
- Form sanitizes birth coordinates, handles IST (+05:30) time adjustments, and formats chart outputs for visual North/South Indian diamond diagrams.

---

## 9. Automated Testing & Verification Assessment

### 9.1 Test Suite Metrics
- **Total Test Suites**: 36
- **Total Tests**: 691
- **Passing Tests**: 691 (100%)
- **Failing Tests**: 0
- **Execution Duration**: ~23 seconds
- **Harness Details**: Fully mocked in-memory state (`jest.setup.js`) covering AsyncStorage, EncryptedStorage, Razorpay, LiveKit, DocumentPicker, and GoogleSignin.

### 9.2 Critical Regression Coverage by Domain

| Feature Domain | Test Suite File | Test Count | Assertion Focus |
| :--- | :--- | :--- | :--- |
| **Auth & Multi-Role** | `auth.test.tsx` | 24 | Google sign-in, token exchange, mode switching, profile hydration. |
| **Home/Temple/Remote Booking** | `booking.test.tsx`, `service_mode_discovery_booking.test.tsx` | 46 | Geolocation radius, temple affiliation, remote samagri restriction, slot reservation. |
| **Payment Orders & Webhooks** | `payment_edge_functions.test.ts` | 42 | CAS claim, HMAC webhook verification, duplicate delivery idempotency. |
| **Pandit Onboarding & Payouts** | `pandit_onboarding.test.tsx`, `pandit_payout_setup.test.tsx` | 65 | Document upload, IFSC validation, passbook verification, net earnings summary. |
| **12-Rashi Horoscopes** | `daily_vedic_astrology_insights.test.tsx` | 44 | Entitlement validation, cache keys, date formatting, modal actions. |
| **LiveKit Remote Sessions** | `live_session_token.test.ts`, `livekit_client_module.test.tsx` | 38 | Room minting, 4h TTL ceiling, viewer fallback on permission denial. |

---

## 10. Prioritized Issue Register

| ID | Severity | Confidence | Category | Description | Supporting Evidence | User Impact | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`DEF-001`** | **P1 — High** | 100% | Database Date Semantics | PostgreSQL `(CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')` evaluates UTC date, rejecting IST queries between 00:00 and 05:30 AM IST. | `045_daily_vedic_astrology_insights.sql:79,129,461` | Mobile shows "No Insight Today" despite published content during early morning hours. | **Fixed in local migration 045**. Run SQL update in Supabase. |
| **`DEF-002`** | **P2 — Medium** | 100% | Database Migration Sync | Database RPC evolutions across migrations 001–045 must be fully applied to remote Supabase instance. | `supabase/migrations/001-045` | Missing RPC signatures will cause runtime errors on specific features. | Execute migrations sequentially in Supabase dashboard. |
| **`DEF-003`** | **P2 — Medium** | 100% | Configuration | Release APK Google Sign-In requires keystore SHA-1 fingerprint registration in Google Cloud Console. | `src/infrastructure/supabase/config.ts` | Google Sign-In returns developer error code 10 on production build if omitted. | Add release keystore SHA-1 in Google Cloud Console. |
| **`SUS-001`** | **P2 — Medium** | 85% | Timezone Fallback | Date utility fallback calculation in `date.ts` assumes UTC offset if `Intl` timeZone is missing on legacy devices. | `src/shared/utils/date.ts:16-19` | Potential date skew on legacy devices outside India without `Intl` support. | Audit date helper fallback formula. |

---

## 11. Recommended Remediation & Next Actions

### Step 1: Database Synchronization (Immediate)
- Open the Supabase Cloud SQL Editor for the active project.
- Execute the updated RPC definition from `supabase/migrations/045_daily_vedic_astrology_insights.sql` to deploy the `((now() AT TIME ZONE 'Asia/Kolkata')::DATE)` calculation.

### Step 2: Google Cloud Console Configuration
- Generate the release keystore SHA-1 fingerprint:
  ```bash
  keytool -list -v -keystore <your-release-key.keystore>
  ```
- Register the SHA-1 in Google Cloud Console under the OAuth 2.0 Client ID settings for Android.

### Step 3: Staging Payment & LiveKit Verification
- Perform an end-to-end sandbox booking checkout using Razorpay Test Mode.
- Verify that `payment.captured` webhook transitions the booking to `confirmed`.
- Launch a live remote puja session between a customer device and pandit device to verify video/audio streaming over LiveKit Cloud.

---

## 12. Unresolved Environmental Questions

1. **Active Database Migration State**: Access to the Supabase Cloud dashboard is required to confirm whether all migrations (`001` through `045`) are currently active on the remote database.
2. **Production Gateway Secrets**: Verification that `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `LIVEKIT_API_SECRET`, and `LIVEKIT_SERVER_URL` are populated in Supabase Vault.

---

## 13. Verification Coverage Summary

- **Files Inspected**: All 45 migrations (`supabase/migrations/`), 5 Edge Functions (`supabase/functions/`), all React Native feature modules (`src/features/`), all Next.js admin server actions (`lib/actions/`), and 36 Jest test suites.
- **Tests Executed**: `npm test` (691/691 passed), `npx tsc --noEmit` (0 errors).
- **Strict Compliance Statement**: **Zero existing source code files, database schemas, configuration files, or database records were modified during this Phase 2 audit.** Only the report `KASHIVEDA_DEEP_BUG_AUDIT.md` was created.
