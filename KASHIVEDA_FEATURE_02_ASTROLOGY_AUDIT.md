# KASHIVEDA — FEATURE 02: DAILY ASTROLOGY AND SUBSCRIPTIONS DEEP AUDIT

Audit date: 2026-10-10. Scope: the current local Mobile and Admin repositories and the backend contracts needed by this feature. This is an investigation, not an implementation or production certification.

Evidence notation: **M** = `C:\Projects\KashiVeda`; **A** = `C:\Projects\kashi-veda-admin`. Paths below are relative to those roots. Function/component names are provided so that evidence remains findable if line numbers move. Findings describe the inspected local implementation; production impact is conditional on the deployed definitions and configuration unless explicitly verified.

## 1. Executive Summary

Both repositories were readable and inspected together. Daily Rashi insights and the older astrology content/delivery system are distinct implementations sharing subscription plans and subscriptions. Treating them as one content pipeline would conceal important differences in entitlement and publishing.

The feature is **not ready for an unconditional production sign-off**. The most important findings are:

1. **AST-01, Critical, confirmed local security defect:** migration 045's two Admin daily-insight RPCs deliberately skip authorization when `auth.uid()` is null. They are security-definer functions and the migration does not revoke the default PUBLIC execution privilege. Under standard PostgreSQL defaults, anonymous callers can read editorial drafts and write insights without an audit identity. Effective production ACLs were not inspected; production exploitability is therefore unverified, not asserted.
2. **AST-02, High, confirmed:** the daily cache returns premium content with `is_entitled: true` before checking the current user or subscription. It has no entitlement expiry or user key. An offline test of the actual service reproduced a cached authorized response after the simulated session became unauthenticated.
3. **AST-08/09/11, High, confirmed:** Admin matrix/request mismatch, whole-row field saves, and CSV identity handling can overwrite the wrong record or newer content. These have distinct causes and need distinct regression tests.
4. **AST-07, High, confirmed concurrency defect in local SQL:** separate subscription orders lock separate rows; simultaneous captures can allocate overlapping subscription terms. Repeated confirmation of the *same* order is protected. A real concurrent PostgreSQL execution remains necessary to validate the fix.
5. **AST-10, Medium, confirmed:** partial set publishing reports success while discarding failed-row errors. An offline invocation of the actual Server Action returned success after one publish succeeded and eleven failed.

Additional confirmed problems include stale/out-of-order mobile responses, incorrect subscription summaries, error-to-empty conversion, an absent financial column in the Admin subscription detail query, missing plan/content audit evidence, and browser-timezone errors in Admin date handling.

The previously reported **SQL IST date correction is present in the final local definitions** of migration 045. The mobile India-date helper also passed the deterministic boundary checks described below. **Deployment of this correction was not verified.** Migration 046's prior verification does not verify migration 045 or replace a deployed-function/policy inspection.

Five existing mobile suites passed: **86 tests, 5 suites, 0 snapshots**, with outbound network disabled and Jest cache disabled. These tests do not prove production SQL, concurrency, native checkout, Admin CSV handling, or deployed RLS. Additional non-mutating checks reproduced several defects using actual source modules and injected dependencies.

Only this requested report was created. No application source, existing tests, configuration, migrations, or database records were changed. No purchase, refund, deployment, migration, or production security probe was performed.

## 2. Actual Feature Architecture

### Mobile

React Native screens are registered in `src/navigation/CustomerNavigator.tsx`; route contracts are in `src/shared/types/navigation.ts`. The feature is under `src/features/astrology/`, with screen-local hooks and service modules rather than a shared subscription/cache query framework.

The Astrology hub combines four independently loaded areas: daily Rashi insight, the current subscription summary, available plans, and legacy astrology content. A spinner shown only when all contributing requests are loading is not a guarantee that every section is ready. Pull-to-refresh calls multiple refresh functions; its indicator is tied to the legacy content hook rather than the entire group.

`dailyRashiService.ts` calls the daily RPC and has a direct-table compatibility fallback plus in-memory/AsyncStorage caches. `astrologyService.ts` reads plans, subscriptions, legacy content and deliveries and calls the order-creation RPC. `astrologyPaymentService.ts` invokes the Razorpay order Edge Function, opens the native SDK, and polls the subscription record. The native SDK is actually installed; there is no simulated production payment-success path in the inspected flow.

### Admin

Next.js App Router pages under `app/(dashboard)/astrology/` load Server Actions in `lib/actions/astrology-management.ts` and `lib/actions/daily-insights-management.ts`. Client views and modals live under `components/admin/astrology/`. Actions use the cookie/session Supabase server client and `requireAdmin`; subscription cancellation also requires Super Admin. They do not use an Admin-browser service-role key.

Daily matrix reads are **direct table queries**, not calls to `admin_list_daily_rashi_insights`. Daily writes call `admin_save_daily_rashi_insight`. This distinction matters: the unused-by-this-UI listing RPC is still an exposed backend capability and must be secured independently.

### Backend and authority

PostgreSQL stores editorial content, plans, subscription intervals, payment orders and captured transactions. Daily entitlement is an SQL `EXISTS` check over current active subscriptions and eligible plans. Payment capture and subscription activation occur atomically in the subscription branch of `confirm_booking_payment`, as last redefined in migration 020.

The relevant Edge Functions are `create-razorpay-order`, `razorpay-webhook`, and the refund execution path used by Admin subscription cancellation. Their payment authority comes from database records and verified gateway events, not the mobile SDK callback. Only subscription-related branches were followed; this was not another general financial audit.

There are two content stores:

| Store | Identity and delivery | Access rule |
| --- | --- | --- |
| `daily_rashi_insights` | Exact India calendar date + numeric Rashi + language; five sections and lucky values | Published, nonfuture date, qualifying subscription; Admin broader access |
| `astrology_content` | Channel, body, publish/expiry timestamps, editorial status | Published and time-valid for authenticated readers; no subscription predicate in its customer SELECT policy |
| `astrology_deliveries` | Subscription + legacy content + channel | Owner/Admin reads; scheduled SQL creates delivery records |

No path was found that automatically transforms a daily Rashi row into a legacy content/delivery row. LiveKit, booking flows and unrelated Kundli calculations are outside this audit; the Kundli-to-Rashi preference/navigation handoff was inspected because it is a direct caller.

## 3. Mobile Astrology Inventory

All screen/component paths in this section are beneath M:`src/features/astrology/` unless specified.

| Route / screen | Purpose, hierarchy and state | Calls / database | Response and UI behavior; relevant tests |
| --- | --- | --- | --- |
| `Astrology` / `screens/AstrologyScreen.tsx` | Hub containing `RashiSelector`, `DailyRashiInsightCard`, subscription card, plan cards and legacy content cards. Selected Rashi, insight, entitlement, loading/error state are in the daily hook. Other sections have independent hook state. | `useDailyRashiInsight`, `useCustomerSubscription`, `useAstrologyPlans`, `useAstrologyContent`; daily RPC, plans, subscriptions, legacy content | Premium card locked if unentitled; full five sections if entitled; null insight becomes editorial empty state. Daily error is obtained but not rendered. Hub/card/selector tests in `daily_vedic_astrology_insights.test.tsx` and `astrology.test.tsx`. |
| `AstrologyPlanDetail` / `screens/AstrologyPlanDetailScreen.tsx` | Plan loading/error/purchase state, preferred Rashi and personalization modal. Receives plan ID. | `getPlanById`, preferred-Rashi service, `createSubscriptionOrder`; plans, profile preference, order RPC | Active plan details and authoritative order response lead to payment route. Missing/error state supported. Optional Rashi save precedes purchase for daily plans. Tests mock plan/order responses. |
| `AstrologyPayment` / `screens/AstrologyPaymentScreen.tsx` | State machine: idle, initializing, verifying, confirmed, cancelled, timeout, failed. Receives subscription/order IDs plus display metadata. | `createRazorpayOrder`, native Razorpay SDK, `pollSubscriptionConfirmation`; Edge Function and own subscription SELECT | SDK success starts polling, not entitlement mutation. Initial 12 attempts at 2-second spacing, additional check uses 6. Timeout has a check-again route; polling errors collapse into pending/timeout. Tests mock SDK and backend confirmation. |
| `AstrologySubscription` / `screens/AstrologySubscriptionScreen.tsx` | My Subscription and plan/renew navigation; subscription/loading/error/refresh state | `useCustomerSubscription` -> newest subscription with plan join | Displays one latest-created row, which may be pending while another row still grants access. Future active rows are displayed as already active. No durable pending-checkout resume control. Pending/active/expired/cancelled UI covered with mocks. |
| `AstrologyContent` / `screens/AstrologyContentScreen.tsx` | Legacy channel feed, page/items/count/hasMore/filter/error/refresh state | `useAstrologyContent` -> paginated `astrology_content` | Customer RLS filters published/time-valid content. No Rashi or daily-language query. Pagination/filter races are not covered by current tests. |
| `AstrologyContentDetail` / `screens/AstrologyContentDetailScreen.tsx` | Legacy title/body detail, loading/error/content state | `getContentById` -> legacy content | Error action labelled retry returns to the prior screen instead of retrying the detail fetch. Mock detail loading/render tests exist. |
| `AstrologyDeliveries` / `screens/AstrologyDeliveriesScreen.tsx` | Delivery history/status/channel, page/refresh/loading/error state | `useAstrologyDeliveries` -> own deliveries joined to legacy content | Read-only history. Queued/sent/failed/skipped display; no customer retry mutation. Lifecycle tests predominantly simulate scheduling rather than execute SQL. |

Supporting contracts are in `types/rashi.types.ts` and `types/astrology.types.ts`. `RashiPersonalizationModal` and `RashiSelector` use canonical numeric IDs. Home links into the hub. `src/features/kundli/free/screens/FreeKundliResultScreen.tsx` maps the calculated moon sign to that canonical Rashi, saves the preference, and navigates to Astrology.

The mobile screen currently always requests language `en`. Sanskrit/Hindi Rashi labels are not a Hindi content-selection workflow. No language toggle is wired to the daily hook. General outlook, career/business, finance/wealth, love/relationships, health/well-being, auspicious colour and number are rendered from the daily response; optional absent sections remain absent. The locked card is an access prompt rather than a backend-generated section-by-section preview.

Auth changes refresh some account/profile state in the shared AuthContext, but this feature does not subscribe its daily fetch to that lifecycle. The Feature 01 foreground profile refresh is not a daily insight/subscription refresh.

## 4. Admin Astrology Inventory

| Route | Main view / operation | Actual persistence and feedback |
| --- | --- | --- |
| `/astrology` | `astrology-overview-view.tsx`; plan/subscription/content/delivery counts and recent records | `getAstrologyOverview` in `astrology-management.ts` runs head/count queries and limited recent-record queries. Query errors can become zero/empty metrics. It does not compute captured revenue. The separate plan-list action fetches active subscription plan IDs to calculate per-plan subscriber counts; that calculation is subject to API row caps. |
| `/astrology/daily-insights` | `daily-insights-matrix-view.tsx`; date/language selection, 12 slots, field editing, complete editing, draft save, publish set, CSV modal/template | `getDailyRashiInsightsMatrix` reads table by date/language. `saveDailyRashiInsight` and bulk/set actions call daily-save RPC. Editing can race with matrix loads. |
| `/astrology/plans` | `astrology-plans-view.tsx`, `modals/plan-form-modal.tsx`; name/duration/price/currency/daily/WhatsApp/active flags | Admin action validates basic values, directly inserts/updates plan. A separate best-effort audit insert is awaited but its returned error is ignored. Zero price is accepted here but rejected by checkout RPC. |
| `/astrology/subscriptions` | `astrology-subscriptions-view.tsx`; paginated/filterable subscription list | Direct read with related customer/plan/order fields; pagination defaults to 20 and is bounded. No client mutation of entitlement. |
| `/astrology/subscriptions/[id]` | `astrology-subscription-detail-view.tsx`; interval, plan, order, transactions, refunds, deliveries; cancellation modal | `getAstrologySubscriptionById`; transaction query currently references absent `payment_method`, so transaction/refund evidence disappears on the local schema. Super Admin cancellation invokes `admin_cancel_astrology_subscription`. |
| `/astrology/content` | `astrology-content-view.tsx`, `modals/content-form-modal.tsx`; legacy channel/body/status/publish/expiry editing | Direct table save plus separate audit attempt. Uses timestamp fields, unlike daily DATE. `datetime-local` initialization mishandles UTC timestamps. Scheduled status exists without a discovered scheduled-to-published worker. |
| `/astrology/deliveries` | `astrology-deliveries-view.tsx`, `modals/retry-delivery-modal.tsx` | Paginated history; Admin retry invokes `admin_retry_astrology_delivery`, which queues eligible failed deliveries and writes audit evidence in SQL. It does not itself send WhatsApp content. |

Daily modals are in `components/admin/astrology/daily-insights/`: `daily-insight-field-modal.tsx`, `daily-insights-form-modal.tsx`, `publish-daily-set-modal.tsx`, and `bulk-import-modal.tsx`. Client type definitions and the second canonical Rashi array are in `lib/types/daily-insights-management.ts`.

Single-field saves explicitly set `status: "draft"` (field modal around lines 151–180), including after the published-content warning. Full-form draft/publish buttons and bulk draft saves also express explicit status changes. This audit does not classify an explicit save-as-draft operation as accidental publishing. Existing cached mobile content may nevertheless remain visible after that unpublication.

## 5. Complete Content-Delivery Workflow

1. Admin selects a calendar date and `en`/`hi`. The route initially calculates the date using `Intl.DateTimeFormat` with `Asia/Kolkata`. The matrix action queries all rows for the exact date/language and constructs the 12 canonical slots.
2. Field/full-form or CSV input builds `DailyRashiInsightFormData`: date, Rashi ID, language, section fields, lucky values, status. The field modal submits the complete previous row with one field changed, not a patch.
3. `saveDailyRashiInsight` calls `requireAdmin`, validates basic required identity values and general outlook for publish, supplies the canonical Rashi name, normalizes language and converts the lucky number. Client `id` is not the write identity.
4. `admin_save_daily_rashi_insight` validates date, Rashi range, name and published general text. It looks up the **composite date/Rashi/language key**, inserts or updates the whole row, sets published time when publishing, and records an audit row when an authenticated Admin ID exists. The SQL null-auth defect is independent of the legitimate Server Action path.
5. Revalidation/refetch reloads the Admin matrix. There is no mobile push/cache invalidation triggered by this save.
6. Mobile `useDailyRashiInsight` computes India today's date using `src/shared/utils/date.ts`, supplies the selected numeric ID and hardcoded `en` to `dailyRashiService.fetchDailyInsight`.
7. The service first checks the process-memory cache. On a miss it calls `get_daily_rashi_insight(p_insight_date, p_rashi_id, p_language)`. PostgreSQL validates identity/date and entitlement, and queries the exact published record for a customer. An Admin is intentionally allowed broader access in this reader.
8. On RPC success the service transforms the JSON result. Successful entitled nonempty content is cached in memory and AsyncStorage. Returned RPC errors invoke the direct-table compatibility fallback. Thrown exceptions take a different persisted-cache recovery branch.
9. The hook sets `isEntitled` and `insight`. The card shows locked, content, or editorial-empty state. The heading is based on the selected Rashi, so an obsolete manual-refresh response can put another Rashi's body beneath that heading.

| Scenario requested | Actual outcome / limitation |
| --- | --- |
| Draft saved | Customer RPC/table RLS excludes it. Admin can inspect it. A previously cached published version can remain visible. |
| Published | Fresh authorized exact-key fetch can see it; no cache invalidation notification. Only nonblank general outlook is required by SQL. |
| Edited after publication | Full publish replaces fields and publishes; individual field save changes status to draft. Concurrent snapshot writes can discard another editor's changes. |
| Unpublished/status changed | Fresh customer reads exclude it; existing memory/persistent data is not revoked. |
| No Rashi content | Exact lookup returns successful empty response. This is an intentional empty state, not inherently a bug. |
| English exists, Hindi absent | Direct `hi` request is empty; no language fallback. Current mobile only calls `en`. |
| Yesterday exists, today absent | Today is empty; no fallback to yesterday. An already mounted screen may still show yesterday until refreshed. |
| Rashi changes during ordinary effect fetch | Effect cleanup prevents that obsolete effect response from applying. Manual refresh uses a separate unguarded path, which is defective. |
| Language changes during fetch | Mobile language switching is not implemented. Admin date/language fetches can resolve out of order. Service cache keys do distinguish languages. |
| Backend error | Daily fallback may turn errors into no-content or no-subscription. Main screen does not expose the daily error. |
| No records | Nonempty cache misses remain empty and are not cached. A later explicit refresh can discover publication. |
| Retry | Daily Check Again clears memory and requests again; disk data survives. Legacy detail retry navigates back. |
| App foreground | No daily/subscription focus/foreground invalidation. Shared authentication foreground work does not solve this. |
| Offline | Existing memory result returns as fresh/entitled. Persisted fallback is reached only for thrown errors; normal Supabase error results can bypass it. No stale/offline badge. |
| Published row differs from cache | Same-key memory content has no TTL/version check; manual refresh clears only memory. There is no bounded convergence guarantee. |

## 6. Subscription Lifecycle

### Plan, order and payment

`astrologyService.getActivePlans` selects active plans and sorts by price. Plan detail loads the selected ID under plan RLS. The client submits only the plan ID to `create_astrology_subscription_order`; amount and ownership are derived in SQL. Migration 020 validates auth, active plan, positive price and duration. It can reuse a same-customer/same-plan pending order created within 30 minutes, otherwise inserts a `payment_pending` subscription and a `subscription` purpose payment order, linking both records in one transaction.

The initial proposed interval follows the latest active end when one exists. These dates are not a paid entitlement: the subscription remains pending. The actual capture branch recalculates dates.

`AstrologyPaymentScreen` invokes `create-razorpay-order` with the payment order ID and JWT. The Edge Function authenticates ownership, reads the database amount/currency and returns gateway order ID, paise amount and public key ID. Gateway secrets remain server-side. The native callback is not trusted to activate a subscription. The webhook validates its gateway signature, resolves the order and verified amount, then calls the service-role-only `confirm_booking_payment` RPC.

That SQL function locks the payment order, validates amount and provider transaction identity, inserts/updates authoritative financial records, and activates the associated pending subscription in the same transaction. A failure rolls back database capture/activation together; external gateway acceptance cannot be rolled back by PostgreSQL and requires reconciliation. Duplicate confirmation of an already paid matching order is guarded. The distinct-order concurrency gap is AST-07.

### Entitlement, renewal and expiry

The authoritative daily entitlement is: authenticated owner, at least one subscription with `status='active'`, `starts_at <= now()`, `ends_at > now()`, joined to a plan with `is_active=true` and `daily_in_app_enabled=true`. Admin is an explicit alternative in the content reader/policies. Exact equality at expiry is denied. A future-start active renewal does **not** grant daily access yet; another currently valid row can still grant it.

Capture schedules an additional term after the latest active end. It reads the plan's current `duration_days`, rather than an immutable checkout-duration snapshot. UI status calculations omit the start boundary and plan flags, and the subscription query selects newest creation rather than current entitlement. These are separate from the correct fresh SQL time predicate.

`cron_astrology_subscription_housekeeping` marks ended active subscriptions expired. Local migration 016 schedules this daily at **00:05 UTC**, not at each customer's exact end. SQL entitlement already checks the timestamp and therefore does not depend on that housekeeping being timely. Status-only Admin counts and mounted mobile UI can still lag it.

### Cancellation, refunds and recovery

There is no customer self-cancel or automatic recurring debit workflow in the inspected feature. Admin subscription cancellation requires Super Admin and a reason. Migration 027's `admin_cancel_astrology_subscription` locks the subscription, handles eligible full refund obligations from captured payments when requested, cancels open orders/subscription, and audits in the same SQL transaction. Refund execution is a separate gateway operation; cancellation does not establish refund completion. The financial refund executor must remain authoritative; no new refund policy is proposed here.

The mobile polls its own subscription after checkout. Twelve attempts do not guarantee webhook arrival before timeout. Check Again can recover while the payment screen remains available. On reopening, the subscription query can discover activation, but the latest pending-row problem and the lack of hub focus refresh remain. There is no client-side subscription activation write, so an ordinary failed or dismissed checkout alone cannot grant backend entitlement.

Follow-up runtime checks are required for gateway acceptance with interrupted mobile connectivity, delayed/duplicate webhooks, two distinct simultaneous subscription payments, cancellation racing capture, and a paid renewal whose start lies in the future. None was initiated against production.

## 7. Database Schema and Function Map

The migration history was searched through local migration 046; important final definitions were read rather than inferred from TypeScript. Numbers below refer to files under M:`supabase/migrations/`.

| Object | Purpose | Read By | Written By | Authorization | Dependencies | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `astrology_subscription_plans` | Name-unique plan, positive integer duration, numeric(12,2) nonnegative price, CHAR(3) currency, daily/WhatsApp/active flags | Mobile plans, entitlement SQL, Admin | Admin direct saves | Active public plan SELECT; Admin management RLS | Updated-at trigger | 009 schema; 012 RLS; A astrology actions |
| `astrology_subscriptions` | Customer/plan FKs, optional payment-order FK, nonnull timestamptz start/end with end > start, enum status | Owner mobile, Admin, entitlement, cron | Order/capture/cancel/expiry functions | Owner/Admin SELECT; no customer direct write grant | Profiles, plans, payment orders | 009; 012; 016; 020; 027 |
| `payment_orders` subscription branch | Database amount/currency/status/provider order; subscription target | Owner polling/order Edge, Admin | Order RPC, capture/cancel paths | Existing finance RLS and protected mutations | Subscription FK; target constraints | 007/009/017/020 plus later finance hardening |
| `payment_transactions` | Captured/provider transaction evidence | Capture/refund functions, Admin detail | Authoritative backend | Restricted financial writes; selected safe Admin fields | Payment order FK; provider payment identity | 007 and final capture 020; A detail query at 440 |
| `refunds` subscription use | Separate refund obligation/execution status | Admin, executor/webhook | Super Admin cancellation RPC and protected financial lifecycle | Server-authoritative execution | Captured transaction FK | 027; relevant refund functions |
| `daily_rashi_insights` | UUID row, DATE, SMALLINT 1–12, name, VARCHAR(5) language, text sections, INTEGER lucky number, content enum, publishing/audit timestamps | Daily RPC/fallback; Admin matrix | Daily save RPC; Admin table policy | Customer published/nonfuture/current eligible subscription SELECT; Admin ALL | Unique date/Rashi/language; lookup and admin indexes; updated-at trigger | 045 |
| `profiles.preferred_rashi_id` | Nullable smallint 1–12 preference | Daily service, Kundli handoff | Preference RPC | Own authenticated user via RPC | Profiles/auth | 045, profile grants in auth migrations |
| `astrology_content` | Legacy channel/body and publish/expiry timestamps | Mobile feed/detail, Admin, dispatch SQL | Admin direct saves | Authenticated published/time-valid SELECT, Admin ALL | Creator profile, updated-at trigger | 009/012 |
| `astrology_deliveries` | Subscription/content/channel/status/send/error history | Owner mobile, Admin | Dispatch and Admin retry | Owner/Admin SELECT; protected mutation functions | Unique subscription/content added 017; FK subscription cascade/content restrict | 009/012/016/017/027 |
| `admin_audit_logs` | Operational evidence | Admin | Daily/cancel/retry SQL; attempted direct plan/content saves | Authenticated Admin SELECT, no client INSERT permission/policy | Auth identity, target records | 012 policies/grants; 027/045; A actions |
| `get_daily_rashi_insight` | Exact-key content + entitlement JSON | Daily service | Not a data mutation | Explicit auth; Admin alternative; customer subscription/time/status check | Daily table, subscriptions, plans, `is_admin` | Final definition only 045 |
| `set_customer_preferred_rashi` | Save own preferred numeric sign | Daily service/Kundli handoff | Authenticated RPC | Auth UID + range validation | Profiles | 045 |
| `admin_save_daily_rashi_insight` | Full-key insert/update and editorial audit | Admin actions | Security-definer SQL | **Null-auth guard flaw; PUBLIC execution not revoked** | Daily table, audit, admin helper | 045 around 283–434 |
| `admin_list_daily_rashi_insights` | Date/language editorial rows JSON | Available RPC; not used by current Admin matrix | Read only | **Same null-auth flaw** | Daily table/admin helper | 045 around 441–506 |
| `create_astrology_subscription_order` | Pending subscription + authoritative order | Mobile plan detail | Security-definer SQL | Authenticated caller, active eligible plan | Plans/subscriptions/orders | Final 020 |
| `confirm_booking_payment` subscription branch | Verified capture + interval activation atomically | Webhook only | Security-definer SQL | EXECUTE explicitly revoked PUBLIC/anon/authenticated; service_role only | Order/transaction/subscription/plan | Earlier 011 replaced by final 020 |
| `admin_cancel_astrology_subscription` | Cancel + optional full refund obligation + audit | Super Admin action | Security-definer SQL | Super Admin check in SQL and action | Sub/order/transactions/refunds/audit | 027 |
| `admin_retry_astrology_delivery` | Failed delivery -> queued, audited | Admin retry action | Security-definer SQL | Admin check | Deliveries/audit | 027 |
| `cron_astrology_subscription_housekeeping` | Ended active -> expired | Scheduled job | Service-only SQL | PUBLIC execution revoked | Subscriptions, pg_cron | 016 |
| `cron_astrology_delivery_dispatch` | Queue legacy content for eligible subscriptions | Daily job | Service-only SQL | PUBLIC execution revoked | Legacy content, subscriptions/plans, deliveries | 016; uniqueness 017 |

Important details:

- Subscription enum originally includes `active`, `expired`, `cancelled`, `payment_failed`; 020 adds `payment_pending`. Mobile `AstrologySubscriptionStatus` omits `payment_failed`. This is a latent contract mismatch: no current failed-checkout path was found that necessarily sets this value.
- Content enum includes `draft`, `scheduled`, `published`, `cancelled`. Daily Admin types narrow this to draft/published although the database uses the broader enum. Broader enum support does not by itself expose nonpublished records to customers.
- Delivery enum is queued/sent/failed/skipped. Channel is in_app/whatsapp. Payment purpose used here is subscription; it is not a booking status.
- Daily general outlook is NOT NULL, but blank draft text is allowed. Publishing RPC requires nonblank general outlook. The table itself does not enforce a full published-content completeness predicate, and Admin direct table privileges are broader than the Server Action validation.
- Numeric Rashi IDs are constrained; canonical names are application constants, not a foreign-key lookup table. Language is a short string, not an en/hi enum. Uniqueness prevents two rows with the same complete daily key but does not validate semantic language/name consistency.
- Subscription indexes cover customer, plan, payment order, status and ends. Legacy content indexes cover channel/status/publication combinations. Daily lookup index follows date/Rashi/language/status. No entitlement-bound cache expiry is implied by these indexes.
- A later `payment_method` addition in 042 belongs to **pandit_payouts**, not payment_transactions. It does not make the Admin subscription transaction query valid.
- Migration 012's blanket function revocation affects functions existing then. It is not an `ALTER DEFAULT PRIVILEGES` rule for functions created in 045. No local default-privilege change repairing that was found. Migration 046 changes auth helpers, not the null-UID conditional in 045.

These are **local schema definitions**. No production `pg_proc`, `pg_policies`, effective grants, triggers, cron catalog, or live schema comparison was performed in this investigation.

## 8. Twelve-Rashi and Language Consistency

| ID | Vedic name | English sign |
| --- | --- | --- |
| 1 | Mesha | Aries |
| 2 | Vrishabha | Taurus |
| 3 | Mithuna | Gemini |
| 4 | Karka | Cancer |
| 5 | Simha | Leo |
| 6 | Kanya | Virgo |
| 7 | Tula | Libra |
| 8 | Vrishchika | Scorpio |
| 9 | Dhanu | Sagittarius |
| 10 | Makara | Capricorn |
| 11 | Kumbha | Aquarius |
| 12 | Meena | Pisces |

M:`src/features/astrology/types/rashi.types.ts` and A:`lib/types/daily-insights-management.ts` agree on these IDs and ordering. RPC arguments, direct filters, selector state and cache keys use the numeric ID. No canonical off-by-one mapping defect was found. The obsolete-response and CSV composite-key bugs can still display/overwrite the wrong content without a mapping error.

Admin supports en/hi selection and stores the requested language; mobile sends en. SQL defaults a blank/null language to en but does not validate a supported-language set. Admin lowercases/trims writes; reads use exact language matching. There is no automatic translation or alternate-language fallback.

Both projects agree on the five main section field names and colour/number fields. SQL lucky number is INTEGER; Admin form/read types often use strings and convert at save; mobile uses the numeric response. Decimal or nonfinite input is not consistently rejected before reaching SQL. SQL requires start/end timestamps although the mobile subscription interface makes them optional/nullable, weakening compile-time guarantees. These are validation/type gaps, not evidence of database nulls in those required columns.

## 9. Date and Timezone Audit

### Current local behavior

The final local `get_daily_rashi_insight`, `admin_list_daily_rashi_insights` default date, and daily SELECT policy use **`(now() AT TIME ZONE 'Asia/Kolkata')::DATE`**. `admin_save_daily_rashi_insight` persists the supplied DATE; it does not derive today's date or forbid legitimate future editorial scheduling. Customer reads reject/hide future daily dates. The Admin route also derives its initial date in India time.

`src/shared/utils/date.ts` uses an explicit Asia/Kolkata formatter and a fixed UTC+05:30 epoch fallback. Both are independent of the device's local timezone for a given correct clock instant. The earlier suggestion that adding 5.5 hours to an epoch was inherently double-applying the device timezone is not correct. Device clock skew remains an ordinary runtime assumption; no system clocks were altered.

### PostgreSQL expression semantics

`now()` has type timestamptz; converting it with `AT TIME ZONE 'Asia/Kolkata'` yields timestamp-without-time-zone representing Kolkata wall time. Casting that to DATE gives the intended India calendar date independently of the database session timezone. `now()` is the transaction-start instant, which is appropriate for these short request transactions. See [PostgreSQL date/time functions](https://www.postgresql.org/docs/17/functions-datetime.html).

The old bare expression `CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'` must not be explained as though CURRENT_DATE were already a timestamptz containing the present instant. CURRENT_DATE is a **date in the session timezone**. For the standard built-in overloads, its implicit conversions and the preferred datetime type select the timestamptz overload: the date becomes midnight in the session timezone, then is rendered in Kolkata. In a UTC session this produces the UTC calendar date at 05:30, and a final DATE remains the UTC date. It is therefore yesterday during 00:00–05:29 IST. With an Asia/Kolkata session its date can appear correct, masking the problem. Explicitly casting the input to timestamp-without-time-zone first chooses a different overload and is not the same expression. Catalog evidence: PostgreSQL 17 [implicit date casts](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/include/catalog/pg_cast.dat) and [preferred timestamptz type](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/include/catalog/pg_type.dat).

This is a type/overload analysis, not a claim that a PostgreSQL server was executed here. A staging SQL assertion should record `TimeZone`, `pg_typeof` for each intermediate expression and the resulting dates. Testing only a string replacement or a mocked DATE does not prove these semantics.

### Deterministic boundary matrix

The actual mobile helper was loaded through the installed TypeScript transpiler and evaluated with fixed instants in a temporary in-memory harness. The same results occurred with process timezones UTC, Asia/Kolkata and America/Los_Angeles. No file or system clock was changed.

| Fixed UTC instant | India wall time | Correct/current helper date | Old expression's DATE with UTC session |
| --- | --- | --- | --- |
| 2026-10-09 18:29Z | Oct 9 23:59 | 2026-10-09 | 2026-10-09 |
| 2026-10-09 18:30Z | Oct 10 00:00 | 2026-10-10 | 2026-10-09 |
| 2026-10-09 18:31Z | Oct 10 00:01 | 2026-10-10 | 2026-10-09 |
| 2026-10-09 23:59Z | Oct 10 05:29 | 2026-10-10 | 2026-10-09 |
| 2026-10-10 00:00Z | Oct 10 05:30 | 2026-10-10 | 2026-10-10 |
| 2026-10-10 00:01Z | Oct 10 05:31 | 2026-10-10 | 2026-10-10 |
| 2026-10-10 17:30Z | Oct 10 23:00 | 2026-10-10 | 2026-10-10 |
| 2026-10-10 18:30Z | Oct 11 00:00 | 2026-10-11 | 2026-10-10 |

The new SQL expression has the correct expected date in this matrix. Its values here were derived from documented PostgreSQL semantics; only the client helper was executed. Testing deployment requires actual function/policy definitions or safe staging/authorized catalog checks.

Separate timezone defects remain in Admin: matrix next/previous-day logic parses a UTC date then uses local date getters/setters, and the legacy datetime form strips UTC metadata before treating values as local. These are AST-13 and AST-14, not regressions in the fixed India-date helper. Cache keys contain the correct date when a request occurs, but no request is scheduled merely because midnight passed. Subscription SQL uses absolute start/end instants, not CURRENT_DATE; the mobile omission of starts_at is a different defect.

**Local IST correction: YES. Production deployment of that correction: NOT VERIFIED.** The earlier Feature 01 production report establishes only its stated auth checks; it explicitly lacks direct function-catalog access and does not certify these astrology objects.

## 10. Cache and Asynchronous State Audit

| Concern | Actual implementation and consequence |
| --- | --- |
| Memory key | `date:rashiId:language`; correct segregation of those three dimensions, no user/entitlement/version dimension. |
| Persistent key | `@kashiveda_daily_insight_` plus request key; AsyncStorage persists across app restarts and user changes. |
| Cache read | Memory is read before authentication/RPC. A hit manufactures successful entitlement. |
| Cache write | Successful entitled nonempty RPC content only. Empty responses are not cached, so a fresh retry can find newly published content. |
| Lifetime | No TTL, expiry instant, content revision or bounded retention purge. Daily key separation prevents a fresh request from returning yesterday's key, but mounted content need not request again. |
| Refresh | `clearCache()` clears only the memory map. Persistent stale content survives and may reappear on a thrown error. |
| Failure behavior | Returned RPC errors take the fallback queries; only thrown errors attempt persisted content. No explicit offline/stale indicator. Failed results do not overwrite a valid cache with an empty record. |
| User changes | Daily fetch effect depends on selected Rashi only. Auth sign-out does not purge this cache. Preferred Rashi storage is also global, not per user. |
| Entitlement changes | No subscription activation/expiry/revocation dependency. A cached body can remain after cancellation, plan deactivation, expiry or unpublication. |
| Normal selector requests | Effect cleanup guards obsolete ordinary Rashi requests and unmounts. This specific path is correctly guarded. |
| Manual refresh | Separate `loadInsight` callback has no generation or unmount guard. An older refresh can overwrite a newer selector result. |
| Legacy feed/deliveries | Append requests are not uniformly marked loading; repeated load-more can duplicate the same page. Feed filter changes lack a latest-response guard. |
| Admin matrix | No latest-request token or atomic matrix/key binding. Selected controls can diverge from the data snapshot and modals use the controls' key. |

The offline service experiment populated the real cache with an entitled response, changed the injected session/RPC to denied, then fetched the same key: it still returned the paid body and true entitlement, with only one total RPC call. A second experiment cleared memory, left persisted content and returned a normal RPC error plus no session: it produced unauthenticated/empty rather than an offline cached response. This establishes both the security problem and the inconsistent offline branch without accessing a real account.

## 11. Admin Editing, Publishing, and Import Validation

### Editing and publishing

The legitimate write action checks Admin authentication. SQL validates numeric Rashi range and published general outlook. Optional sections can be blank; no evidence establishes that all five sections are mandatory. Character limits are not enforced consistently by UI/action/SQL. A product maximum is a requirement question, not a reason to invent arbitrary limits during this audit.

An individual field edit submits all stored fields and `status='draft'`. Without an updated-at/version precondition, another editor's intervening fields are overwritten. A set publish first reads readiness and rows, then sends full snapshots through the same RPC, so concurrent edits between read and publish can also be lost. The unique daily key prevents duplicate rows but does not prevent lost updates. Concurrent first inserts can fail on the unique constraint; no silent duplicate insertion is implied.

`publishDailyRashiInsightsSet` is sequential and non-atomic. Partial success is not inherently invalid, but its final success response drops failed-row errors if at least one row succeeded. Matrix/readiness query errors are also not consistently returned as failures. An empty database should yield 12 genuinely missing slots; a denied/failed query must not be represented as that same state.

### CSV trace

`bulk-import-modal.tsx` reads a client file (2 MB UI limit), runs a custom CSV parser, identifies normalized header aliases, maps rows, constructs a preview, and sends valid selected rows to `bulkSaveDailyRashiInsights`. The Server Action loops sequentially, skips wholly blank content items, and invokes daily-save with draft status. Successful preceding rows remain persisted if a later row fails. This is a partial import implementation, not an atomic transaction.

| Case | Actual handling |
| --- | --- |
| Commas, quoted commas, CRLF, doubled quotes, multiline cells | Parser has handling for these. |
| Unclosed quoted field | Accepted rather than rejected; actual parser reproduced this. |
| Headers | Flexible aliases; missing-header rejection is too weak to guarantee required columns. |
| Rashi ID | `parseInt`; strings such as `1.5` or `1foo` become 1. Range check alone is insufficient. |
| Dates and languages | Per-row values may override modal selection; no strict date/en-hi validation before preview. Database parsing can reject later. |
| Duplicate input | Duplicate detection uses only Rashi ID; valid same-Rashi rows for different date/language are rejected. |
| Existing data | Existing map is only the currently loaded matrix keyed by Rashi ID; it does not describe all row keys in the file. |
| Overwrite disabled | Client can filter known existing rows, but server receives no enforceable overwrite precondition. A row for another date/language can overwrite an existing record unseen by the selected matrix. |
| Blank/missing fields | Whole-row save can clear previously populated optional fields. Imports always save draft, including previously published rows. Whether this replacement is desired needs explicit UI policy. |
| Lucky number | Numeric conversion lacks consistent integer/finite validation; accepted preview may later fail SQL integer coercion. |
| Invalid rows | Valid rows can still be imported. This is acceptable if clearly reported; inserted/updated/skipped/rejected totals are not authoritative per-key outcomes. |
| Partial server failure | Saved rows remain; modal reports errors but does not adequately summarize saved count or refresh persisted partial results. |
| File replacement | Previous validation is not cleared immediately; invalid/empty replacement can leave old valid rows importable under a new file selection. FileReader results also lack selection-generation guards. |
| Large requests | UI limit is client-only; bulk Server Action has no corresponding row/work bound. Admin-only access reduces exposure but not accidental excessive operations. |
| Template | Generates the 12 canonical rows using selected date/language; download is a client operation. No real CSV was imported during this audit. |

No database duplicate can bypass the unique daily key through this importer. The risks are wrong-key overwrite, unintended rejection, hidden partial results and invalid preview, not a claim that uniqueness is absent.

## 12. Entitlement and Security Review

**Working Within Verified Scope:** fresh customer daily RPC and table SELECT definitions both require current subscription time bounds, active eligible plan, published status and nonfuture India date. A customer cannot obtain another customer's subscription rows through the inspected owner SELECT policy. Customer direct subscription creation/update is not granted. Fresh SQL access does not treat a pending order or SDK success as entitlement. Security-definer routines examined specify search paths; correct search paths do not compensate for missing authorization.

**Confirmed local security problem:** 045 Admin save/list use `IF v_admin_id IS NOT NULL AND NOT public.is_admin(v_admin_id) THEN ...`. A null UID does not raise. New functions receive PUBLIC EXECUTE unless explicitly revoked/default privileges changed; granting authenticated execution does not remove PUBLIC. PostgreSQL documents both the default and security-definer behavior in [CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html). Therefore the local migration is insecure under standard deployment defaults, even though the Admin website itself calls `requireAdmin`. Do not test this by anonymous production mutation. Inspect effective ACLs and use an isolated disposable database for negative tests.

**Confirmed client security problem:** premium content cached under a non-user key is returned without checking entitlement. This is a client disclosure of already downloaded content, not proof of a fresh unauthorized customer SELECT bypass. It can cross accounts sharing one installation and persist through entitlement changes. Decide and implement an explicit offline licensing policy; do not silently equate cached content with current authorization.

Legacy `astrology_content` has no subscription predicate. Whether this is a security defect depends on whether that feed is intentionally free for authenticated users; the daily premium policy cannot be assumed to apply to it. Likewise plan inactivation currently removes daily entitlement immediately, including paid intervals; product policy must confirm that this is intended.

Admin cancellation checks Super Admin in both action and SQL. Daily legitimate mutations derive audit identity from auth in SQL. Plan/legacy-content mutations use separate client-session audit inserts that are denied under local grants and silently ignored; AST-16 covers the missing evidence. No provider signature, raw gateway response or secret key was identified in the inspected astrology screen/plan action outputs. The native payment result interface has an optional gateway signature as SDK output, but no Admin astrology ledger reads or serializes the database `provider_signature`/`raw_response` fields. This is a scoped finding, not a full application secret scan.

Production effective RLS/ACLs, deployment versions, cron enablement, gateway configuration and real authenticated cross-account behavior remain **Runtime Verification Required**.

## 13. Confirmed Bugs

All entries in this section are **Confirmed Bug** in the inspected local implementation. Confidence concerns the stated local defect, not whether a customer has encountered it in production. A staging/runtime check is still required where specified. Severity is based on the concrete affected operation. Recommendations are proposals only.

### AST-01 — Null-auth callers pass daily Admin RPC authorization

- **Severity / confidence / feature:** Critical / High / daily editorial access security.
- **Evidence:** M:`supabase/migrations/045_daily_vedic_astrology_insights.sql`, `admin_save_daily_rashi_insight` around 283–434, `admin_list_daily_rashi_insights` around 441–506, grants around 508 onward. Both use the null-UID conditional quoted in section 12. No later local definition repairs it.
- **Current versus expected:** null UID skips rejection, and security-definer execution bypasses the ordinary caller's row access. New-function PUBLIC EXECUTE is not revoked. Expected: unauthenticated/customer calls cannot use Admin editorial capabilities; the functions' own names, rejection message and legitimate `requireAdmin` callers establish that intent.
- **Trigger / impact:** standard PostgreSQL function defaults plus deployed 045 definitions, an anonymous RPC call with valid parameters. Draft reading and content insertion/replacement are possible without an audit identity. The save path allows nullable creator and logs only when Admin ID is nonnull. Production effective grants are unknown.
- **Safe verification:** inspect deployed function ACLs/definitions read-only with authorized catalog access; execute anon/customer/Admin negative and positive cases only in a disposable database. Do not attempt production writes.
- **Correction / regression tests:** reject null/non-Admin callers, explicitly revoke PUBLIC/anon execution with exact signatures, grant intended roles, and preserve transactional audit. Test null UID, normal customer, Admin, service context if needed, drafts and unauthorized writes. Confirm rollback/no audit spoofing.
- **Dependencies:** Supabase RPC exposure/default privileges and auth helper; 046 does not fix a condition that never calls that helper. A future approved corrective migration is needed if production matches; do not reapply or edit 045/046 as an audit action.

### AST-02 — Cache manufactures premium entitlement and crosses account boundaries

- **Severity / confidence / feature:** High / High / daily premium/offline content.
- **Evidence:** M:`src/features/astrology/services/dailyRashiService.ts`, cache key/read/write and `clearCache`; AuthContext sign-out does not clear this storage.
- **Current versus expected:** same-key memory hit returns `is_entitled: true` with no session/subscription check or expiry. Persisted fallback is similarly unbounded. SQL requires a current qualifying subscription, so cached authorization cannot be permanent or transferable to another user.
- **Trigger / impact:** fetch while entitled, then expire/cancel/deactivate plan or change account, and request the same date/Rashi/language; cached premium remains available. Unpublication also does not revoke the cached body. The actual service reproduction returned it after session removal without another RPC.
- **Safe verification:** inject fake sessions/time/RPC as in the offline check, including app restart with stored content. No paid account needed.
- **Correction / tests:** define offline access policy; bind cached data to user and a bounded entitlement validity/revalidation rule, invalidate on auth/entitlement changes, and expire/delete persistent entries. Test expiry equality, logout/login to another account, cancellation, plan inactivation, unpublish, offline and reconnect. Do not attempt to make client flags the backend authority.
- **Dependencies:** auth lifecycle notification, SQL entitlement and product decision on offline premium retention.

### AST-03 — Manual refresh can put one Rashi's text under another Rashi

- **Severity / confidence / feature:** High / High / daily asynchronous rendering.
- **Evidence:** M:`src/features/astrology/hooks/useDailyRashiInsight.ts`, guarded effect around 62 versus unguarded `loadInsight` around 98 and `refresh` around 142; `DailyRashiInsightCard` heading uses selected metadata.
- **Current versus expected:** ordinary effect cleanup is correct, but manual refresh always applies its result. All request paths should apply only a response matching the current selection/request generation.
- **Trigger / impact:** refresh A, select B, B finishes, old refresh A finishes last. A body replaces B content while the heading remains B. An obsolete refresh failure can also overwrite current error/loading state; unmount has no manual-path guard.
- **Safe verification:** controlled promises in a hook test, no network.
- **Correction / tests:** use one guarded request path/token for effect and refresh. Test both completion orders, unmount and failed obsolete response; assert response identity as well as UI heading.
- **Dependencies:** daily service and selection lifecycle; independent of correct numeric Rashi mapping.

### AST-04 — Mounted daily/subscription state does not follow day, auth or entitlement changes

- **Severity / confidence / feature:** Medium / High / lifecycle refresh.
- **Evidence:** M:`src/features/astrology/hooks/useDailyRashiInsight.ts` fetch dependencies contain only selected Rashi; M:`src/features/astrology/hooks/useCustomerSubscription.ts`; hub/payment navigation; shared auth foreground refresh only updates account/profile state.
- **Current versus expected:** no midnight, focus, foreground or subscription-activation invalidation; start/end comparisons are recalculated only when component state happens to render. A daily view and post-purchase entitlement should reflect the current day/account when revisited.
- **Trigger / impact:** leave hub mounted across midnight/expiry, return from checkout/background, or change account without changing selected ID. Yesterday's text or locked/active labels can persist until manual refresh/remount. AST-02 additionally makes some refreshes stale.
- **Safe verification:** fake time, navigation focus and auth changes in hooks; staging foreground cycle.
- **Correction / tests:** refresh on relevant focus/auth/subscription changes and India-date rollover; use bounded expiry state. Test midnight, checkout return and foreground after end time. Avoid a broad auth rewrite.
- **Dependencies:** cache fix and navigation lifecycle events.

### AST-05 — Daily retrieval hides backend failure as editorial emptiness or subscription denial

- **Severity / confidence / feature:** Medium / High / errors and offline recovery.
- **Evidence:** M:`src/features/astrology/services/dailyRashiService.ts`, RPC result transformation and `fallbackFetchInsight` around 108 onward; M:`src/features/astrology/screens/AstrologyScreen.tsx` unused daily `insightError`.
- **Current versus expected:** any RPC error triggers migration-compatibility fallback; subscription-query errors are ignored; insight-query error becomes successful empty content. RPC business error/message fields are not retained consistently. Expected: no-record and failure remain distinguishable, with a real retry/stale indication.
- **Trigger / impact:** denied/failed RPC or direct table read, network error returned as a Supabase result. Customer sees content being prepared or must subscribe rather than a failure. Normal returned errors also bypass persisted offline recovery, while thrown errors use it.
- **Safe verification:** source-module injections for returned error, thrown error, null result and legitimate no-row result; one normal-error offline case was executed.
- **Correction / tests:** limit compatibility fallback to its intended missing-contract condition, preserve typed failure versus empty results, check all query errors and render daily error/retry. Test no content, permission failure, timeout, offline cached/uncached and successful retry.
- **Dependencies:** deployed 045 availability and explicit cache policy.

### AST-06 — Subscription summaries choose the wrong record and omit start eligibility

- **Severity / confidence / feature:** Medium / High / current subscription and entitlement display.
- **Evidence:** M:`src/features/astrology/services/astrologyService.ts` `getCustomerSubscription`, created-at descending/limit 1; M:`src/features/astrology/hooks/useCustomerSubscription.ts`; M:`src/features/astrology/components/AstrologySubscriptionCard.tsx`; daily fallback entitlement; `astrologyPaymentService.pollSubscriptionConfirmation`.
- **Current versus expected:** newest pending/cancelled row masks a valid older interval; future-start status-active renewal is presented as active now. Fallback ignores starts_at and plan is_active despite selecting them. SQL correctly checks all those predicates and any qualifying row.
- **Trigger / impact:** an active subscriber opens a renewal and abandons checkout; or has a future paid renewal. UI and backend disagree about current access/remaining days. Fallback can call future entitlement true but receive no content from correctly enforced RLS; this is not by itself a fresh SQL content leak.
- **Safe verification:** fixtures containing current active + newer pending, future active only, disabled plan and overlapping records.
- **Correction / tests:** distinguish current entitlement, scheduled renewal and pending checkout; choose current qualifying intervals without losing pending recovery information. Include starts_at/plan flags for UI summaries; preserve SQL authority. Test exact start/end boundaries and multiple rows.
- **Dependencies:** subscription lifecycle contract; cache invalidation after purchase. Product wording for a paid future renewal should distinguish payment success from access starting now.

### AST-07 — Distinct concurrent subscription orders can consume paid terms in parallel

- **Severity / confidence / feature:** High / High for missing serialization; runtime interleaving not executed / paid renewal allocation.
- **Evidence:** M:`supabase/migrations/020_astrology_subscription_payments.sql`, pending reuse SELECT around 77–100; subscription capture branch around 637–697. The order and target subscription are locked, but the customer's interval allocation is not serialized.
- **Current versus expected:** two order-creation calls can both miss the pending row and insert separate orders. Even legitimately distinct orders can be captured together; both activation transactions can read the same previous active end (or no active row) and allocate overlapping intervals. The sequential code explicitly intends to append a term, so overlap contradicts that rule.
- **Trigger / impact:** simultaneous create requests and/or simultaneous captures for two distinct pending subscriptions owned by the same customer. Both payments can be recorded while purchased durations overlap instead of extending sequentially. Duplicate capture of one order is a different case and is protected.
- **Safe verification:** two controlled SQL connections against a disposable schema with barriers before interval selection; assert total allocated duration and idempotency. No financial gateway needed.
- **Correction / tests:** serialize creation/reuse and capture interval allocation on a stable customer key/row, then re-read current intervals within the lock; preserve existing money validation. Test two orders, two plans, same-order replay, renewal and cancellation lock ordering.
- **Dependencies:** SQL transaction/locking behavior. Do not solve this solely with a disabled purchase button or assume a plan FOR SHARE lock serializes customers.

### AST-08 — Matrix controls and loaded rows can refer to different dates/languages

- **Severity / confidence / feature:** High / High / Admin daily editing.
- **Evidence:** A:`components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx`, selected date/language state, `handleFetchMatrix`, field/full modal props and bulk draft payloads.
- **Current versus expected:** selecting a new key retains the old matrix while loading; responses are not guarded against newer requests. Modal keys come from selected controls while existing field snapshots come from matrix rows. Expected: editable data is atomically tied to its loaded key.
- **Trigger / impact:** edit during date/language load or resolve an older matrix request last. Saving can copy old-date/old-language content into the newly selected key, or overwrite unrelated target content. The Server Action ignoring submitted row ID makes the composite payload key decisive.
- **Safe verification:** UI test with deferred matrix promises and modal save assertions, covering A->B->C response reordering.
- **Correction / tests:** bind matrix and key together, guard latest responses, and disable mutations while displayed data does not match the selected key. Test full edit, field edit, bulk draft, publish and CSV opening.
- **Dependencies:** Server Action composite-key contract; not fixed merely by adding a loading spinner.

### AST-09 — Field editing and publishing overwrite concurrent updates

- **Severity / confidence / feature:** High / High / editorial data integrity.
- **Evidence:** A:`daily-insight-field-modal.tsx` around 151–180; `lib/actions/daily-insights-management.ts` set-publish full-row payload; M:045 save RPC whole-row update.
- **Current versus expected:** a nominal one-field edit submits every other field from an old snapshot. No version precondition is checked. The modal's stated intent to preserve unrelated fields is not met under concurrent edits.
- **Trigger / impact:** editors A/B load same row; A saves career, B saves general using prior career. B silently restores old career. Set publish can similarly restore stale content and status. First-insert races fail on uniqueness rather than create duplicates.
- **Safe verification:** sequential stale snapshots in an isolated database or mocked action test, followed by a real database optimistic-conflict test.
- **Correction / tests:** add a compare-version precondition or a narrowly scoped field/status mutation that preserves current fields; report conflicts rather than silently overwrite. Test two different field edits, publish-versus-edit, stale full-form save and unpublish.
- **Dependencies:** shared save RPC/action contract; maintain atomic audit and existing draft behavior.

### AST-10 — Partial publish success discards failures

- **Severity / confidence / feature:** Medium / High / publishing feedback.
- **Evidence:** A:`lib/actions/daily-insights-management.ts`, `publishDailyRashiInsightsSet` around 343–391. Failure is returned only when errors exist and publishedCount is zero.
- **Current versus expected:** one success among failures yields `success: true` and only a success message. Expected: all requested outcomes, including partial failures, are accurately returned and shown.
- **Trigger / impact:** at least one per-row RPC fails and another succeeds. The executed actual-action check with 12 ready rows produced one published success and hid eleven errors. An unchecked row-query error can also lead to misleading zero-publication success.
- **Safe verification:** inject per-row RPC errors and failed readiness/row reads, as done offline.
- **Correction / tests:** return saved/failed/skipped identities and messages, fail query errors, preserve intentional partial execution and refresh actual persisted state. Test 0/all/some successes and a retry of only failed rows.
- **Dependencies:** publish modal result rendering; no requirement to redesign this as atomic if partial behavior is explicit.

### AST-11 — CSV identity and overwrite checks do not use the database key

- **Severity / confidence / feature:** High / High / bulk content integrity.
- **Evidence:** A:`bulk-import-modal.tsx`, `existingMap` around 103–105, duplicate tracking, `isExisting` around 275 and import mapping around 340; A bulk action; M:045 composite-key save.
- **Current versus expected:** duplicate/existence maps use Rashi ID only, while CSV permits row date/language and database writes key on all three. Overwrite is a client filtering choice, not an enforced server precondition.
- **Trigger / impact:** a file contains same Rashi on different valid dates/languages (wrong rejection); or imports another date with an existing database row absent from the visible matrix (overwrite despite overwrite disabled); or concurrent editor creates a row after preview. Wrong skips and loss of published/edited text are possible.
- **Safe verification:** pure validation fixtures plus isolated action/RPC tests with two dates/two languages and concurrent insert.
- **Correction / tests:** choose an explicit import scope, use complete keys everywhere, validate server-side existence and enforce no-overwrite atomically when requested. Show actual row key and authoritative inserted/updated/skipped/rejected counts. Test cross-date/language, duplicate exact keys and stale previews.
- **Dependencies:** import UI, bulk action and SQL conflict behavior; preserve database uniqueness.

### AST-12 — CSV preview can retain an old file and accepts malformed identity input

- **Severity / confidence / feature:** Medium / High / import validation.
- **Evidence:** A:`bulk-import-modal.tsx`, `handleFileChange` around 150, ID parse around 216, validation state around 300, custom `parseCSV`.
- **Current versus expected:** validation is not immediately reset for a new file; early errors/empty replacement can leave old rows importable. `parseInt('1.5')`/`parseInt('1foo')` becomes 1. Unclosed quotes are accepted. Strict identity/parsing validation must precede an authoritative-looking preview.
- **Trigger / impact:** preview valid file A, select invalid/empty B and import; A data may be imported. A malformed numeric ID silently targets a different valid identity. The actual parser accepted an unterminated quoted cell in the offline check.
- **Safe verification:** in-memory parser cases and component FileReader fixtures; never import production data.
- **Correction / tests:** reset preview on selection, bind asynchronous results to the current file, reject malformed CSV, validate complete integer IDs/dates/language/numbers on both sides, and bound server work. Test cancellation, wrong extension/size, empty file, overlapping reads and invalid numeric tokens.
- **Dependencies:** authoritative import result contract from AST-11. Existing intentional partial imports may remain.

### AST-13 — Admin previous/next day uses mixed UTC/local date operations

- **Severity / confidence / feature:** Medium / High / matrix date navigation.
- **Evidence:** A:`daily-insights-matrix-view.tsx`, `handleStepDay` around 110–116.
- **Current versus expected:** `new Date('YYYY-MM-DD')` is UTC midnight, then local get/setDate and local formatting are used. Expected: moving one calendar day always changes the selected calendar string by one.
- **Trigger / impact:** an Admin browser in a negative UTC offset. Executing the actual expression in America/Los_Angeles moved 2026-10-10 forward to 2026-10-10, not October 11. Navigation can stay put or skip a date in the opposite direction.
- **Safe verification:** process/browser timezone fixtures without changing OS clock.
- **Correction / tests:** keep date-only arithmetic consistently UTC or consistently date-only. Test UTC, India, negative offset, DST boundaries and month/year changes.
- **Dependencies:** none on SQL IST correction; do not change the already-correct India today helper to fix this.

### AST-14 — Legacy publish/expiry editing shifts stored instants

- **Severity / confidence / feature:** Medium / High / Admin legacy content publication.
- **Evidence:** A:`components/admin/astrology/modals/content-form-modal.tsx`, existing timestamp `slice(0,16)` at 42–43 and default initialization at 51, followed by `new Date(localInput).toISOString()` on save.
- **Current versus expected:** a UTC value is presented as local wall time without conversion, then converted back as if it were local. Expected: saving unchanged publication/expiry fields preserves the instant; new default reflects local wall time if datetime-local is used.
- **Trigger / impact:** edit/save in a non-UTC browser. In India, `2026-10-10T06:00:00Z` becomes input `06:00`, then saves `00:30Z`, shifting publication/expiry 5.5 hours earlier. Default now initialization has the same UTC-to-local mismatch.
- **Safe verification:** controlled datetime conversion and UI tests in multiple browser zones; no content writes needed.
- **Correction / tests:** correctly format stored instants for datetime-local and convert once on submission, or explicitly use an India-time editor. Test unchanged edit, new default, both fields and DST zones.
- **Dependencies:** legacy content time-based RLS; separate from daily DATE fields.

### AST-15 — Subscription detail drops all transactions/refunds on a nonexistent column

- **Severity / confidence / feature:** Medium / High against local schema / Admin subscription financial visibility.
- **Evidence:** A:`lib/actions/astrology-management.ts:440`, SELECT includes `payment_method` from `payment_transactions`; 007 schema and later migration search show no such transaction column. 042's similarly named field is on payouts.
- **Current versus expected:** PostgREST returns a column error; action destructures data without error, sets transactions empty, and skips refunds because it has no transaction IDs. Expected: show the real ledger or a query failure, not a false empty history.
- **Trigger / impact:** any subscription with a payment_order_id against the local-defined schema. Admin cannot see its captured payments/refunds in this feature's detail page. This does not erase financial records or prove that M17 itself has the same query.
- **Safe verification:** schema-bound read in staging or mocked missing-column response with error assertion; inspect deployed column catalog before claiming deployed impact.
- **Correction / tests:** select actual supported fields and propagate transaction/refund query failures. Test paid/refunded/no-transaction subscriptions and denied/invalid-column reads.
- **Dependencies:** financial schema contract, Admin detail type/rendering. Do not add a redundant database column merely to preserve this invalid query.

### AST-16 — Plan and legacy-content saves lack their promised audit record

- **Severity / confidence / feature:** Medium / High against local grants / Admin mutation audit.
- **Evidence:** A:`lib/actions/astrology-management.ts`, audit inserts around 233,269,696,731; M:012 audit SELECT-only grants/policy, later local grant search.
- **Current versus expected:** authenticated direct plan/content mutation can succeed under Admin RLS; separate audit INSERT is denied and its returned error ignored, then action returns success. Expected: configured audit evidence of these Admin changes with trusted actor identity.
- **Trigger / impact:** normal plan/content save using the cookie-session client and local grants. Editorial/plan history is missing; failures are not atomic with the mutation. Catching thrown errors does not catch a Supabase result.error that is ignored.
- **Safe verification:** inspect effective permissions and run a transaction-rolled-back staging save under an Admin JWT; injected denied audit result test.
- **Correction / tests:** use a narrowly authorized transaction-bound SQL mutation/audit path, deriving identity from auth, or an equivalent authoritative trigger. Do not grant broad browser audit insertion to accept arbitrary actors. Assert exactly one audit event and mutation rollback on audit failure.
- **Dependencies:** plan/content mutation interfaces; existing daily/cancel/retry SQL audit pattern can be reused conceptually.

### AST-17 — Admin accepts an active free plan that checkout cannot purchase

- **Severity / confidence / feature:** Medium / High / plan configuration.
- **Evidence:** A:`lib/actions/astrology-management.ts:206`, rejects price < 0; M:009 table permits >= 0; M:020 order function rejects <= 0.
- **Current versus expected:** zero-price active plan is saved/listed, but choosing it always fails order creation. Expected: offered plans have a valid supported acquisition path.
- **Trigger / impact:** Admin configures zero price. Customer sees an unusable plan. This audit does not invent a free-trial business rule.
- **Safe verification:** validation fixture plus read of SQL condition; no checkout required.
- **Correction / tests:** until free acquisition is explicitly required, align Admin validation with the existing positive-price contract and handle any existing zero plans deliberately. Test zero, negative, fractional positive and invalid numbers.
- **Dependencies:** product clarification if free plans are intentional; do not silently add free entitlement issuance.

### AST-18 — Legacy feed/delivery pagination can append duplicate pages; filters can race

- **Severity / confidence / feature:** Medium / High / mobile history/feed.
- **Evidence:** M:`src/features/astrology/hooks/useAstrologyContent.ts`, M:`src/features/astrology/hooks/useAstrologyDeliveries.ts`, page append/loading state and callback dependencies.
- **Current versus expected:** next-page calls are not consistently marked in flight, so repeated load-more triggers can request/append the same next page. Feed filter changes can accept older outstanding results. Expected: one result per requested page and current filter.
- **Trigger / impact:** rapid end-of-list events on a slow connection; channel change while a prior query is pending. Duplicate cards or wrong-channel results are visible.
- **Safe verification:** deferred promise hook tests with repeated loadMore and filter transitions.
- **Correction / tests:** guard append requests and request identity, reset paging on filter change, and merge by actual identity when appropriate. Test error/retry without duplicate append and deterministic pagination order.
- **Dependencies:** existing paginated service responses; not a reason to replace the whole data layer.

### AST-19 — Preferred Rashi leaks between accounts on the same installation

- **Severity / confidence / feature:** Medium / High / personalization.
- **Evidence:** M:`dailyRashiService.ts`, `@kashiveda_preferred_rashi_id`, `getPreferredRashi`, `savePreferredRashi`; sign-out cleanup; profile RPC fallback.
- **Current versus expected:** global AsyncStorage preference is consulted before the account profile, with no user namespace. Saving local state can report success even if RPC and attempted direct profile update fail. Expected: an authenticated account's preference is not replaced by another user's device cache.
- **Trigger / impact:** user A chooses a sign then user B logs in on the device; A's local choice can override B's stored profile. A failed sync may disappear on another device with no warning.
- **Safe verification:** two fake user IDs with distinct profile preferences and local cache; force both persistence paths to return errors.
- **Correction / tests:** namespace/clear preference by user and report sync state accurately, using the supported RPC rather than an ignored unauthorized fallback. Test account switch, sign-out, new device and retry.
- **Dependencies:** direct Kundli-to-Rashi caller and auth lifecycle; avoid unrelated authentication changes.

### AST-20 — Admin read failures become believable missing rows/zero metrics

- **Severity / confidence / feature:** Medium / High / editorial and subscription operational visibility.
- **Evidence:** A:`lib/actions/daily-insights-management.ts:42` matrix `(data || [])`; readiness reads; A:`lib/actions/astrology-management.ts` overview count defaults and active-plan aggregation.
- **Current versus expected:** query errors are logged/ignored and converted into a 12-missing matrix or zero/empty metrics. `getAstrologyPlans` fetches all status-active subscription plan IDs and counts them in JavaScript, subject to Supabase response limits; the overview's separate head/count queries do not have that truncation defect. Expected: distinguish unavailable from empty and compute complete per-plan counts.
- **Trigger / impact:** permission/network/schema error; or active result count above configured API maximum (local configuration is 1000). Editors may replace supposedly missing content; business sees understated figures. The actual matrix action returned 12 missing slots under an injected DB error.
- **Safe verification:** injected errors and a staging dataset above row cap; no fabricated financial fixtures in production.
- **Correction / tests:** propagate read errors, label operational metrics accurately, and move complete per-plan count calculations into bounded authoritative queries/RPCs if needed. Test empty versus error and >cap counts. Preserve the overview's existing head/count approach where it is appropriate.
- **Dependencies:** overview UI error rendering and metric definition clarification.

### AST-21 — Legacy content detail Retry does not retry

- **Severity / confidence / feature:** Low / High / mobile error recovery.
- **Evidence:** M:`src/features/astrology/screens/AstrologyContentDetailScreen.tsx`, error-state retry handler calls navigation back.
- **Current versus expected:** pressing retry leaves the detail screen rather than reloading its record. Expected is established by the action's retry label.
- **Trigger / impact:** transient detail-query failure; user must navigate again to recover.
- **Safe verification:** component test with first request rejected, second succeeding; assert a second request on Retry.
- **Correction / tests:** call the existing load path or label the navigation action honestly. Test retry/unmount states.
- **Dependencies:** none beyond current detail service.

## 14. Potential Issues and Requirement Questions

These are deliberately separate from confirmed local bugs. Each has an explicit verification or decision gate.

| ID / category / severity / confidence | Evidence and current behavior | Trigger, expected-policy question and impact | Safe verification / recommended next step / regression coverage / dependencies |
| --- | --- | --- | --- |
| AST-P01 — Potential Issue; Medium; High evidence of behavior, uncertain policy | M:020 capture reads current plan.duration_days again; A plan editor allows duration changes | Pending checkout followed by plan edit can buy a different term than displayed. Does a paid purchase promise checkout-time duration or capture-time plan terms? Money amount itself remains order-authoritative. | Decide contract; staging plan-change-between-order-and-capture test. If checkout terms are promised, snapshot/reuse purchased terms rather than mutable plan values. Depends on plan-change policy; avoid retroactive changes to existing subscriptions. |
| AST-P02 — Potential Issue / Runtime Verification Required; High; Medium | M:027 cancellation locks subscription then open orders; M:020 capture locks order then subscription and rejects incompatible cancelled states | Concurrent cancel/capture can deadlock; gateway acceptance after cancellation can require reconciliation even when SQL rejects activation. Does existing retry/reconciliation cover this subscription case operationally? | Controlled two-connection staging test plus mocked accepted-gateway/failed-DB event. Verify consistent lock order, retry behavior and visible unresolved capture. Depends on financial webhook/reconciliation; no production payment initiated. |
| AST-Q01 — Requirement Clarification Needed; Medium if premium intended; High observation | M:012 legacy content SELECT has no subscription condition; mobile feed/detail do not add one | Authenticated unsubscribed user can read time-valid published legacy content. Is this feed intentionally free, distinct from daily Rashi premium? | Confirm product policy before changing access. Add explicit free/premium contract tests either way; staging direct SELECT/RPC negative tests if premium. Do not assume daily policy applies automatically. |
| AST-Q02 — Requirement Clarification Needed; Medium; High observation | M:045 entitlement checks plan.is_active; Admin can deactivate plans | An already paid current subscriber loses daily access when plan is deactivated. Is inactive a sale-availability flag or an entitlement-revocation flag? | Product decision then fixture for paid interval plus inactive plan; preserve contractual access if required. Depends on plan lifecycle, not client workaround. |
| AST-Q03 — Requirement Clarification Needed / incomplete workflow; Medium; High observation | M:016 dispatch uses legacy published content; no scheduled->published worker or delivery consumer Edge Function found; Admin offers scheduled status/retry | Scheduled records remain excluded unless manually published; retry queues but no repository implementation proves actual dispatch to WhatsApp. Is external infrastructure deployed, or are these intentionally unfinished options? | Inventory authorized deployed jobs/workers read-only; staging scheduled and queued->sent flows. Disable/describe unsupported capabilities or implement only after scope approval. SQL queue declaration is not a delivery implementation. |
| AST-Q04 — Requirement Clarification Needed; Medium; High observation | Mobile daily hook hardcodes en; Admin en/hi content exists | Hindi-only publication is not reachable through a mobile language selector. Is bilingual content selection required for this release? | Decide then add selected language to UI, hook/request identity and refresh tests. Service key already includes it; no need to redesign Rashi IDs. |
| AST-Q05 — Requirement Clarification Needed; Low; High observation | 045 requires only general outlook for publish; optional text fields; lucky number INTEGER without a positive bound; card truthy lucky wrapper | Is partial editorial content valid, what are text limits and valid lucky-number range? Number 0 alone can be omitted by current display truthiness, but its intended validity is unknown. | Define limits/range/completeness then share validation tests across form/action/SQL. Do not invent mandatory five-section or astrology-number policy. |
| AST-P03 — Potential Issue; Low; High observation | M:`src/features/astrology/types/astrology.types.ts` omits SQL payment_failed; daily Admin type narrows SQL content statuses | Existing historical/imported payment_failed record or a broader daily status reaches code with incomplete type/label handling | Inspect authorized data counts and test each SQL enum without mutating records. Align type/defensive rendering. No proof current checkout produces payment_failed. |
| AST-P04 — Potential Issue; Medium; Medium | M:016 legacy delivery selection joins plan channel flags without plan.is_active, unlike daily entitlement | Inactive-plan subscriptions can be queued for delivery while daily reads deny them. Correctness depends on AST-Q02 and separate channel policy. | Fixture contrasting daily and delivery entitlement; confirm intended inactive-plan behavior before sharing predicates. External worker behavior remains unknown. |
| AST-R01 — Runtime Verification Required; Critical exposure if local ACL flaw deployed; High local evidence | Effective deployed 045 functions, ACLs, policies and their owners not inspected | Production may match the insecure local definitions or have manual/default-privilege mitigations. 046 deployment does not decide this. | Obtain authorized read-only catalog evidence; negative tests in staging. Record exact deployed definitions/version. No anonymous production mutation as a proof. |
| AST-R02 — Runtime Verification Required; Medium; High local date evidence | Corrected local India-date expressions; previous report did not inspect deployed astrology catalog | Production could retain old expression despite source edit or 046 deployment | Compare deployed reader/list function and SELECT policy definitions; run safe controlled SQL in staging for table in section 9. Do not reapply migrations merely to verify. |
| AST-Q06 — Requirement Clarification Needed; Low; High observation | Admin overview and per-plan counts use subscription status, not the current start/end interval; subscription rows are counted rather than distinct customer IDs | Future-start active renewals and expired-by-time rows awaiting housekeeping can be counted as active subscribers. Should these labels mean active-status records or distinct customers entitled now? | Confirm metric definition; test one customer with multiple intervals, future renewal and expired-by-time active row. Depends on scoped astrology reporting, not a broad financial dashboard redesign. |

## 15. Test Coverage Assessment

### Executed checks

Inspected package scripts, Jest configuration and mocks before running. Used the already-installed dependencies; no installs or test edits. Ran existing suites in-band with `--no-cache --silent --runTestsByPath` through an in-process Node harness that replaced `net.Socket.prototype.connect` and global fetch with throwing network guards. Test-specific mocked clients/fetches remain local. Final result: **5 suites passed, 86 tests passed, 0 snapshots, 49.493 seconds**.

Paths under M:`__tests__/`:

| Suite | What actual assertions cover | What it does not establish |
| --- | --- | --- |
| `daily_vedic_astrology_insights.test.tsx` | Canonical 12 Rashi IDs/names, service response handling with mocked Supabase, repeated cache hit, preference, selector/card/locked UI, personalization, hub/plan/Kundli handoff; date string/display shape | Real SQL entitlement/RLS, midnight semantics, Hindi end-to-end, user/expiry cache invalidation, Admin publishing, concurrent responses. Some RPC fixtures use compatibility `insight`/`has_subscription` fields rather than the real SQL JSON shape. |
| `astrology.test.tsx` | Mocked plan/subscription/content/delivery screens, empty/error states and purchase states including success/timeout/cancel/pending | Real native gateway configuration, webhook arrival, subscription SQL activation or races, multiple-row entitlement choice. |
| `astrology_payment_backend.test.ts` | Edge handler logic with injected clients/fetch, gateway signature and amount/ownership/provider reuse cases | Real PostgreSQL transactions/locks, deployed secrets/RLS or actual gateway acceptance. A mocked RPC success cannot prove subscription activation. |
| `astrology_delivery_lifecycle.test.ts` | Local eligibility helpers, service mock behavior, expiry/dispatch state simulations | Real cron scheduling or concurrency. A sequential array-based simulated duplicate check is not two overlapping SQL dispatches; a constant asserting provider not implemented is not integration coverage. |
| `astrology_admin_operations.test.ts` | Locally implemented cancellation/retry state-machine expectations and mocked refund behavior | Actual Next Server Actions, deployed SQL signatures, audit ACLs or schema. Some signature/schema assertions are hardcoded strings/objects rather than reading migration definitions; they did not catch the absent transaction column. |

Representative exact test references make the coverage limits concrete:

- `daily_vedic_astrology_insights.test.tsx:230`, "defines exact 12 canonical Rashis from Mesha (1) to Meena (12)" checks the mapping constants; line 254 checks all numeric moon-sign mappings. Neither executes 12 real database reads.
- The same file at 298, "resolves date to YYYY-MM-DD in Asia/Kolkata timezone", checks format; it is not the midnight matrix in section 9. Lines 314/355/376 test entitled, unentitled and no-published-content responses from mocks; line 397 explicitly tests returning cached content without a new RPC, but not entitlement revocation.
- The same file at 486/525 tests full-section and paywall rendering from props; line 546 tests personalization selection/skip; these do not independently establish backend permissions.
- `astrology_payment_backend.test.ts:112`, "handles idempotent order reuse when user has an unexpired pending order", accepts mocked RPC reuse rather than exercising concurrent SQL. Lines 339/370/401 test handler capture/signature behavior, amount mismatch and duplicate-webhook handling with injected backend dependencies.

Additional **executed non-mutating source checks** used TypeScript transpileModule/vm and injected dependencies entirely in memory:

1. Actual India-date helper: eight instants, three process timezones; all matched expected India dates.
2. Actual Admin date-step expression: reproduced next-day failure in America/Los_Angeles.
3. Actual daily service: cached premium remained entitled after simulated session removal; no second RPC.
4. Actual daily service: normal returned RPC error plus absent session did not use persisted offline cache.
5. Actual `publishDailyRashiInsightsSet`: one success/eleven failures returned success and hid failures.
6. Actual matrix action: injected database error became 12 missing slots.
7. Actual custom CSV parser: accepted an unterminated quoted field.

These checks prove those source paths under controlled dependencies, not production deployment. No fixture file or test file was created. An initial shell quoting attempt failed before test execution; the final guarded test run above completed normally. A few discovery commands used Windows-incompatible file-glob arguments and were rerun against actual directories/paths; absent output from those failed commands was not used as evidence of absent code.

### Missing Test Coverage

| Coverage ID / severity | Missing behavior and concrete test needed | Relevant source / dependency |
| --- | --- | --- |
| AST-T01 / Critical | Direct anon/customer/Admin execution privileges and draft read/write denial for 045; actual effective ACL negative tests | 045, 046 helper, PostgreSQL/Supabase staging |
| AST-T02 / High | Cache user isolation, expiry/revocation, persistent restart, offline policy, unpublish and reconnect | Daily service, auth lifecycle, subscription SQL |
| AST-T03 / High | Every Rashi service request mapping, en/hi exact selection, empty/draft/published/current/future cases against SQL rather than fixtures | Daily reader/RLS and Admin writes |
| AST-T04 / High | Two distinct simultaneous subscription creations/captures and sequential term allocation; replay/idempotency | 020, two database sessions |
| AST-T05 / High | Stale matrix edits, concurrent different-field saves, no-overwrite import with full composite keys | Admin daily views/actions and save RPC |
| AST-T06 / Medium | SQL pg_typeof/timezone matrix; mobile foreground/midnight and devices in other zones | Date helper/045 policies/navigation |
| AST-T07 / Medium | Current versus future/pending/multiple/expired subscriptions, inactive plans and exact start/end equality | Subscription service/hook, fallback and SQL |
| AST-T08 / Medium | CSV malformed headers/quotes/IDs/dates/numbers, duplicate complete keys, two files, partial counts and errors | Bulk modal/action |
| AST-T09 / Medium | Mobile and Admin request completion ordering; repeated page loading; failure versus empty | Daily hook, feed/delivery hooks, matrix |
| AST-T10 / Medium | Actual Admin audit atomicity and schema-valid transaction/refund detail queries | Astrology actions, audit grants, payment schema |
| AST-T11 / Medium | Native checkout, delayed webhook after timeout/restart, cancellation/capture race, future renewal messaging | Payment screen/Edge Functions/020/027 |
| AST-T12 / Medium | Real scheduled publication and delivery execution, if supported | 016 cron, external/deployed workers not verified |

Admin `package.json` has dev/build/start/lint scripts but no feature test runner/script. The existing Admin Kundli utility is outside this scope and was not executed. Build/lint were not run: they are not sufficient substitutes for the specific behavioral tests and a build can create workspace artifacts. No database/RPC integration or E2E test was represented as executed.

## 16. Prioritized Implementation Plan

Implementation remains **unapproved**. The following is the smallest coherent sequence; it is not permission to apply it. Read-only deployed evidence should precede assumptions about an already-fixed production state.

| Order / finding IDs | Exact files or objects to change after approval | Why / expected result | Regression tests / dependencies / compatibility risks |
| --- | --- | --- | --- |
| 1 — AST-01, R01 | New targeted corrective migration for `admin_save_daily_rashi_insight` and `admin_list_daily_rashi_insights` authorization/EXECUTE ACL; do not edit/reapply 045/046 | Close anonymous editorial capability and preserve trusted audit actor | AST-T01 with null UID/customer/Admin/service cases. Inspect deployed defaults first. Risk: an undocumented service caller relying on null UID must be explicitly designed/authorized, not implicitly trusted. |
| 2 — AST-02/04/19 | M dailyRashiService, useDailyRashiInsight, useCustomerSubscription and direct callers; narrowly hook into existing auth/focus lifecycle | User-bound cache/preference, bounded entitlement, current date and post-purchase state | AST-T02/06/07, account switch/offline/unpublish. Decide offline licensing before cache TTL semantics. Compatibility: retire old global storage entries deliberately; do not migrate one user's preference to another. |
| 3 — AST-03/05/06 | M daily hook/service/card/hub; astrologyService subscription selection; subscription card/screen/payment wording | One guarded load path, honest error/empty states and current-versus-scheduled/pending subscription display | Deferred-promise and multi-subscription fixtures. Keep SQL authoritative; coordinate with cache changes. Risk: don't hide pending recovery while correcting current entitlement selection. |
| 4 — AST-07 and P02 | Protected order creation/capture subscription branches in a new approved migration; check cancel lock ordering | Serialize per-customer term allocation and maintain payment idempotency | Two-connection SQL tests plus replay/cancel tests before staging gateway validation. Risk: transaction ordering/deadlocks and throughput; lock scope should be customer-specific. Existing captured records require review, not automatic rewriting. |
| 5 — AST-08/09 | A matrix/field/full/publish components, daily-insights-management action; save RPC concurrency contract if needed | Tie editors to loaded key and reject/preserve concurrent updates | AST-T05/09. Risk: full-form saves and imports must share the same version/conflict contract; keep explicit draft behavior/audit. |
| 6 — AST-11/12/10/20 | A bulk-import-modal, publish-daily-set-modal, daily-insights-management types/actions; atomic no-overwrite backend support if needed | Valid complete keys, safe preview, accurate partial outcomes, failure distinct from empty | CSV/key/file-generation/error tests and no-overwrite database test. Risk: restricting files to one selected key scope is a user-visible import contract change; choose and document it. Preserve valid partial imports unless product requests atomicity. |
| 7 — AST-15/16/17 | A astrology-management, subscription detail view/types, plan/content save SQL path if needed, plan-form validation | Schema-valid financial display, trusted transactional audit, only purchasable offered plans | AST-T10 and zero-price test. No new payment_method column. Risk: current zero-price plans need explicit handling and audit migration changes require approval. |
| 8 — AST-13/14/18/21 | A matrix date helper and content-form-modal; M legacy content/delivery hooks and detail screen | Correct calendar/timestamp editing and reliable pagination/retry | Multiple-TZ/no-op timestamp tests; deferred page/filter tests. Risk: do not reinterpret already stored UTC timestamps or shift existing data. |
| 9 — P01/P03/P04, Q01–Q06 | Only files/objects implicated by answered product questions | Resolve purchased term snapshot, inactive/free/legacy premium rules, Hindi UI, scheduling/delivery availability and metrics | Tests derived from the agreed rule. Do not build translation, recurring billing, delivery providers or broad schema changes merely because placeholders exist. |

### Expected manual/staging E2E flows after fixes

1. Admin drafts one Rashi in English; unsubscribed and subscribed customers cannot see the draft. Publish, fetch exact India date/ID, verify all stored fields; publish Hindi separately and verify exact language behavior according to approved UI scope.
2. Empty current day with yesterday populated remains a truthful current-day empty state. Backend failure instead shows error/retry. Publish after an empty response and confirm refresh sees new content.
3. Edit/unpublish a viewed row; verify cache obeys the agreed freshness/offline contract and never silently claims current entitlement for another account.
4. Switch Rashi rapidly while pulling to refresh; assert heading, response identity and date agree for both completion orders. Background over midnight and return in another device timezone.
5. Select/purchase plan in Razorpay test mode; verify authoritative order amount, captured transaction and one paid subscription; kill/reopen during webhook delay and recover without granting access from SDK success alone.
6. Current subscription plus abandoned pending renewal; current content remains accessible and pending checkout remains discoverable. Paid future renewal shows its real start; exact expiry removes access according to backend time.
7. Concurrent distinct test-mode orders/captures: two purchased terms are allocated sequentially. Same-order webhook replay does not add another term.
8. Super Admin cancellation, with and without permitted refund; cancellation and refund states are distinct. Test late capture and verify visible reconciliation rather than false successful entitlement.
9. Two Admin editors change different fields; stale save conflicts or preserves the other change. Switch matrix key during loading and confirm edits cannot target a mismatched key.
10. CSV duplicate exact key, same Rashi different dates/languages, malformed quote/ID/date/number, no-overwrite, invalid replacement file and partial RPC failures. Verify persisted rows and every reported count.
11. Admin plan/content save produces trusted audit evidence; denied audit write cannot silently accompany success. Subscription detail displays actual transactions/refunds or an explicit error.
12. Authorized read-only production verification after deployment: deployed function/policy/ACL definitions, cron/worker configuration and safe SELECT results. Do not use production financial mutations or anonymous content writes as audit probes.

## 17. Verification Coverage and Limitations

### Access and inspected paths

- **Mobile repository accessible: YES.** Actual feature source, package/test configuration, five test suites, migration history through 046 and relevant Edge Function branches were read.
- **Admin repository accessible: YES.** Actual astrology App Router paths, views/modals, actions, types and session/role helpers were read.
- Cross-repository inspection compared actual SQL keys/types/authorization with both callers. TypeScript alone was not treated as a database definition.

Primary source groups inspected:

- M:`src/features/astrology/{screens,components,hooks,services,types}/` and the specific files enumerated in sections 2–3 and findings; logical rendering/state/service paths were prioritized over style declarations.
- M:`src/shared/utils/date.ts`, navigation route registration/types, Home astrology navigation, Kundli result-to-Rashi handoff, Supabase client and relevant AuthContext lifecycle/cache cleanup dependencies.
- M:`supabase/migrations/001_extensions_and_enums.sql`, `007` financial schema, `009_astrology.sql`, `011_business_functions.sql`, `012` RLS/grants, `016_cron_and_queues.sql`, `017` relationship/idempotency hardening, `020_astrology_subscription_payments.sql`, `027_astrology_admin_operations.sql`, `042` payout payment-method distinction, `045_daily_vedic_astrology_insights.sql`, `046` auth hardening. Later migration definitions/grants were searched to resolve final object history rather than assuming earliest definitions prevailed. Relevant 024/025 finance hardening and refund paths were followed only as needed for subscription cancellation/payment contracts.
- M:`supabase/functions/create-razorpay-order/`, `razorpay-webhook/`, relevant refund executor/shared dependencies, and configuration. Scope was subscription order ownership, capture/activation and cancellation/refund handoff, not unrelated booking/payout business logic.
- A:`app/(dashboard)/astrology/`, `components/admin/astrology/`, `lib/actions/astrology-management.ts`, `lib/actions/daily-insights-management.ts`, `lib/types/astrology-management.ts`, `lib/types/daily-insights-management.ts`, and related Admin auth/Supabase server helpers.
- M:`__tests__/daily_vedic_astrology_insights.test.tsx`, `astrology.test.tsx`, `astrology_payment_backend.test.ts`, `astrology_delivery_lifecycle.test.ts`, `astrology_admin_operations.test.ts`, plus package/Jest setup; A package scripts.

The six user-supplied historical reports were used as reference context through relevant passages/searches, not re-audited as independent truth. Current code contradicts or narrows some prior claims: Admin matrix reads the table directly; the fixed epoch-offset date fallback is valid; 046 helper hardening does not fix a caller that skips the helper for null UID. The Feature 01 production report does not verify the astrology deployment.

### Checks not performed and information unavailable

- No production connection/catalog inspection, JWT privilege probe, real customer cross-account read, purchase, refund, record update, migration or deployment.
- No deployed-function/policy text, effective function/default privileges, production schema diff, real data distribution, cron-job catalog, delivery worker deployment or gateway delivery logs were available as verified evidence for this report.
- No real PostgreSQL server execution of timezone overloads or concurrent subscription transactions. SQL behavior was traced from final definitions and primary PostgreSQL semantics; the deterministic client/date/action/parser checks are separately labelled executed.
- No native-device E2E, browser-driven Admin edits/imports, offline device persistence test, actual language-switch UI flow, or real webhook-delay/cancellation race. The manual/staging plan explicitly covers these.
- No new test files, fixtures, packages or configuration were introduced. Existing mocked tests passing is not evidence that any deployment is bug-free.
- No guarantee of every optional style/accessibility or unrelated application behavior; the audit followed the requested feature's important state, validation, persistence, security, date and payment paths.

### Final assessment

The local IST computation is corrected, canonical 12-Rashi mapping is consistent, fresh SQL daily entitlement is meaningfully enforced, and payment activation remains backend-authoritative. Those verified areas coexist with actionable defects in Admin RPC authorization, cache entitlement, editorial data integrity, concurrent subscription allocation and error reporting.

First verify/close the exposed Admin RPC capability and premium cache boundary, then repair subscription serialization and editorial write safety before expanding this feature. Resolve explicit product questions without inventing new financial, offline, language or publishing policy. Runtime sign-off remains pending the targeted database, gateway, native lifecycle and Admin E2E checks listed above.

**Change record:** the only requested workspace deliverable created by this audit is `C:\Projects\KashiVeda\KASHIVEDA_FEATURE_02_ASTROLOGY_AUDIT.md`. No application source code, existing tests, configuration, migrations or database records were modified. All corrections await user review and approval.
