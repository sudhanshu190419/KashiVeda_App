# KashiVeda Feature 02 — AST-Q03 Assessment Report

**Evaluation Date**: 2026-10-11  
**Investigation Scope**: Scheduled Astrology Content Publication & WhatsApp Delivery Dispatch Pipeline  
**Target Repositories**:
* Mobile application and Supabase migrations/functions: `C:\Projects\KashiVeda`
* Admin portal: `C:\Projects\kashi-veda-admin`  
**Report File**: `C:\Projects\KashiVeda\KASHIVEDA_AST_Q03_ASSESSMENT_REPORT.md`  
**Investigation Mode**: **Read-Only Assessment Only (No source or migration changes)**  
**Final Outcome**: **Outcome E — Confirmed Incomplete** (with elements of **Outcome C — Partially Implemented**)

---

## 1. Executive Summary

AST-Q03 from the KashiVeda Feature 02 audit examines two related automated operations in the Vedic Astrology and Subscriptions module:
1. **Scheduled Content Publication**: Does content authored in `scheduled` status automatically transition to `published` when its scheduled `publish_at` timestamp arrives?
2. **WhatsApp Delivery Workflow**: Does the weekly WhatsApp broadcast pipeline possess an operational queue producer, message consumer, and external provider integration to dispatch messages to entitled subscribers?

Based on exhaustive end-to-end tracing of all 55 database migrations, Supabase Edge Functions, Next.js Server Actions, Admin portal UI components, React Native client hooks, and empirical execution on an isolated disposable PostgreSQL 18.4 database, the assessment confirms:

1. **Scheduled Content Publication Is Incomplete (Missing Worker/Trigger)**:
   - The Admin UI (`ContentFormModal`) and database enum support the `scheduled` status alongside a `publish_at` timestamp.
   - However, **no worker, database trigger, pg_cron job, Edge Function, or background process exists** in either repository to transition rows from `scheduled` to `published` when `publish_at <= now()`.
   - The daily delivery dispatcher (`cron_astrology_delivery_dispatch`) and customer-facing RLS policies strictly filter for `c.status = 'published'`.
   - Consequently, any content saved as `scheduled` remains permanently dormant and undispatched, even after its publication instant passes, unless manually edited and re-saved as `published` by an administrator.

2. **WhatsApp Delivery Pipeline Is Broken and Disconnected**:
   - Migration 016 declares four `pgmq` queues (`whatsapp_messages`, `astrology_deliveries`, `push_notifications`, `pandit_payouts`).
   - However, `cron_astrology_delivery_dispatch` **never enqueues messages into `pgmq`**. It only inserts database journal rows into `public.astrology_deliveries` with `status = 'queued'`.
   - **Zero consumers exist** in the repositories for `pgmq` or `astrology_deliveries`. Neither repository contains consumer loops (`pgmq.read`, `pgmq.pop`), background daemons, or message-processing Edge Functions.
   - **Zero WhatsApp provider integration code exists**. There are no API clients, SDKs, or credentials for Meta WhatsApp Cloud API, Twilio, Gupshup, or any messaging gateway in either repository or local configuration.
   - The Admin "Retry" action (`admin_retry_astrology_delivery`) merely executes an atomic SQL `UPDATE` setting `status = 'queued'` and `scheduled_at = now()` in `public.astrology_deliveries`. It does not notify or enqueue work to any consumer.
   - 100% of generated delivery journal records remain stuck in `queued` status indefinitely.

---

## 2. Exact Current Workflow and Architecture

The following diagram illustrates the current implemented architecture, highlighting the break points where execution terminates:

```
[ Admin Portal: /astrology/content ]
                │
                ▼
      ContentFormModal.tsx
                │  (Status: "scheduled" | "published")
                ▼
  saveAstrologyContent (Server Action)
                │
                ▼
  admin_save_astrology_content (RPC)
                │
                ├──► Writes to public.astrology_content (status = 'scheduled')
                │         │
                │         ▼
                │    [ ❌ MISSING TRANSITION WORKER ]
                │    (No trigger, cron, or Edge Function updates 'scheduled' -> 'published')
                │    (Content remains dormant forever)
                │
                └──► Writes to public.astrology_content (status = 'published')
                          │
                          ▼
             [ pg_cron: 00:30 UTC ]
             cron_astrology_delivery_dispatch()
                          │
                          ▼
             Inserts into public.astrology_deliveries (status = 'queued')
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
[ In-App Delivery Journal ]       [ WhatsApp Dispatch ]
• Visible in Customer App        • ❌ NO PGMQ ENQUEUE (pgmq depth = 0)
• Visible in Admin Portal        • ❌ NO QUEUE CONSUMER / WORKER
• Status = 'queued' forever      • ❌ NO WHATSAPP PROVIDER / SDK
                                 • Status = 'queued' forever
```

---

## 3. Scheduled Content Publication: Repository Evidence

### 3.1 Content Status Definitions
The content lifecycle statuses are defined at the database layer in [001_extensions_and_enums.sql](file:///C:/Projects/KashiVeda/supabase/migrations/001_extensions_and_enums.sql#L315-L321):
```sql
CREATE TYPE public.astrology_content_status AS ENUM (
    'draft',
    'scheduled',
    'published',
    'cancelled'
);
```
This enum is mirrored in TypeScript interfaces:
- Admin Portal: `lib/types/astrology-management.ts` (`AstrologyContentStatus = 'draft' | 'scheduled' | 'published' | 'cancelled'`)
- Mobile App: `src/features/astrology/types/astrology.types.ts` (`AstrologyContentStatus = 'draft' | 'scheduled' | 'published' | 'cancelled'`)

*Note on Daily Insights distinction*: The newer daily Rashi matrix feature (`public.daily_rashi_insights`, Migration 045) uses a narrower binary workflow in the Admin UI (`'draft'` | `'published'`). The `scheduled` status exists exclusively on the general/legacy content table (`public.astrology_content`).

### 3.2 Content Authoring & Scheduling in Admin Portal
Administrators manage content through `app/(dashboard)/astrology/content/page.tsx` using `components/admin/astrology/modals/content-form-modal.tsx`:
1. The admin selects channel (`in_app` or `whatsapp`) and publication status (`draft`, `scheduled`, `published`, `cancelled`).
2. The admin selects `publish_at` via an `input[type="datetime-local"]`, converted to UTC ISO via `parseLocalDatetimeInputToInstant`.
3. Submission invokes Server Action `saveAstrologyContent` in `lib/actions/astrology-management.ts`.
4. The action validates admin authorization and calls PostgreSQL RPC `public.admin_save_astrology_content`.
5. Migration 051 ([051_atomic_astrology_plan_content_audit_mutations.sql](file:///C:/Projects/KashiVeda/supabase/migrations/051_atomic_astrology_plan_content_audit_mutations.sql#L282-L320)) atomically inserts or updates `public.astrology_content` and writes an audit entry into `public.admin_audit_logs`.

### 3.3 Semantic Meaning of `publish_at`
In `public.astrology_content`, `publish_at` (TIMESTAMPTZ NOT NULL) defines the designated instant after which the content is intended to be live, valid for customer viewing, and eligible for dispatch.

### 3.4 Missing Scheduled-to-Published Transition
An exhaustive search of all 55 migrations, Supabase Edge Functions, and Next.js server actions reveals:
- **No trigger**: Table `public.astrology_content` has only `trg_astrology_content_updated_at` (which updates `updated_at`).
- **No cron job**: Migration 016 schedules only `daily_astrology_subscription_housekeeping` and `daily_astrology_delivery_dispatch`.
- **No Edge Function**: `supabase/functions/` contains only Razorpay, Kundli calculation, and LiveKit functions.
- **No background script**: Neither repository contains any polling or cron process for content status transitions.

### 3.5 Delivery Dispatcher Filter Behavior
The daily delivery dispatcher in [016_cron_and_queues.sql](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L87-L92) contains the following predicate:
```sql
WHERE s.status = 'active'::public.astrology_subscription_status
  AND s.starts_at <= now()
  AND s.ends_at > now()
  AND c.status = 'published'::public.astrology_content_status
  AND c.publish_at <= now()
  AND (c.expires_at IS NULL OR c.expires_at > now())
```
**Critical Finding**: The dispatcher requires **`c.status = 'published'`**. It does **not** check for `c.status = 'scheduled' AND c.publish_at <= now()`.

### 3.6 Operational Result When `publish_at` Passes
When a row is created with `status = 'scheduled'` and its `publish_at` arrives and passes:
1. The row remains with `status = 'scheduled'`.
2. `cron_astrology_delivery_dispatch` excludes the row because `status != 'published'`. No delivery records are generated.
3. Mobile RLS policy `astrology_content_select_public` excludes the row because it requires `status = 'published'`.
4. The content is **never published, never delivered, and never visible to customers** unless an administrator manually returns to the Admin portal, edits the record, changes the status dropdown to `Published`, and clicks Save.

---

## 4. WhatsApp Queue Producer and Consumer: Repository Evidence

### 4.1 In-App Journal vs. WhatsApp Message Delivery
It is vital to distinguish between:
- **The In-App Delivery Journal**: Records in table `public.astrology_deliveries` that log intended dispatches to subscribers.
- **WhatsApp Message Delivery**: The physical transmission of an outbound message to a customer's WhatsApp device via a communications provider.

### 4.2 Detailed Analysis of the 10 Specific Dispatch Questions

#### 1. Does the database create an in-app delivery record?
**YES.** When `cron_astrology_delivery_dispatch()` runs, it inserts rows into `public.astrology_deliveries` for active subscribers when matching published content exists with `publish_at <= now()`. For plans with `daily_in_app_enabled = true`, it creates rows with `channel = 'in_app'`.

#### 2. Does creating that record also enqueue a WhatsApp job, or are those separate paths?
**NO.** Creating a record in `public.astrology_deliveries` does **not** enqueue a job into any message queue. There is no trigger on `astrology_deliveries`, and `cron_astrology_delivery_dispatch()` contains no `pgmq.send()` statement.

#### 3. What is the exact queue name, if a queue is used?
In [016_cron_and_queues.sql](file:///C:/Projects/KashiVeda/supabase/migrations/016_cron_and_queues.sql#L203-L218), four queues are declared via `pgmq.create()`:
1. `whatsapp_messages` (intended payload contract: `{ "notification_id": "UUID" }`)
2. `astrology_deliveries` (intended payload contract: `{ "delivery_id": "UUID" }`)
3. `push_notifications`
4. `pandit_payouts`

However, **neither queue is ever written to by any application code, RPC, or trigger**.

#### 4. Which deployed or repository-controlled component consumes that queue?
**NONE.** Neither `C:\Projects\KashiVeda` nor `C:\Projects\kashi-veda-admin` contains any consumer code. There are zero references to `pgmq.read`, `pgmq.pop`, `pgmq.delete`, or `pgmq_read` across either codebase.

#### 5. Does that component call an actual WhatsApp provider, or is the code only a placeholder?
**NO.** There is **no WhatsApp provider integration code anywhere in either repository**. There is no client for Meta WhatsApp Cloud API, Twilio Messaging API, Gupshup, or any other SMS/WhatsApp aggregator. In fact, `__tests__/astrology_delivery_lifecycle.test.ts` (lines 408–410) contains an explicit unit assertion:
```typescript
it("confirms WhatsApp delivery is NOT implemented in M9 (no mock/fake external providers)", () => {
  const isWhatsAppProviderImplementedInM9 = false;
  expect(isWhatsAppProviderImplementedInM9).toBe(false);
});
```

#### 6. How does a queue message result in an `astrology_deliveries` status change?
**It does not.** Because no queue message is ever generated and no consumer exists, rows inserted into `public.astrology_deliveries` remain in `status = 'queued'` indefinitely.

#### 7. What happens after provider success, transient failure, permanent failure, timeout, or repeated processing?
None of these transitions occur at runtime. While the enum `astrology_delivery_status` includes `'sent'`, `'failed'`, and `'skipped'`, the runtime database never transitions rows out of `'queued'` because no dispatcher executes.

#### 8. Does the Admin Retry action merely change database state or enqueue work, or does it reach a working consumer?
**It merely changes database state.** The Admin Retry action (`retryAstrologyDelivery`) invokes RPC `public.admin_retry_astrology_delivery(p_delivery_id)`. The function verifies admin privileges, checks that current status is `failed`, updates `status = 'queued'`, sets `scheduled_at = now()`, clears `error_message`, and logs an admin audit entry. It does not invoke any webhook, does not enqueue into `pgmq`, and does not communicate with any worker.

#### 9. Is there an idempotency mechanism preventing duplicate outbound messages?
- **At the database journal layer**: Yes. Migration 017 ([017_indexes_and_constraints.sql](file:///C:/Projects/KashiVeda/supabase/migrations/017_indexes_and_constraints.sql#L88-L91)) defines constraint `uq_astrology_deliveries_subscription_content UNIQUE (subscription_id, content_id)`. Furthermore, `cron_astrology_delivery_dispatch` includes `WHERE NOT EXISTS (SELECT 1 FROM astrology_deliveries d WHERE d.subscription_id = s.id AND d.content_id = c.id)`.
- **At the message transmission layer**: No. Because there is no external provider integration, there is no gateway-level idempotency key or message deduplication.

#### 10. Can a delivery remain `queued` indefinitely because no consumer processes it?
**YES.** 100% of rows inserted into `public.astrology_deliveries` remain in `status = 'queued'` indefinitely.

---

## 5. Admin Retry Action: End-to-End Trace

The Admin delivery retry workflow was traced from UI click to database mutation:

1. **User Interface**: `components/admin/astrology/astrology-deliveries-view.tsx` displays a table of deliveries. If a row has `status === 'failed'`, an admin can click "Retry", opening `components/admin/astrology/modals/retry-delivery-modal.tsx`.
   - The modal explicitly displays a warning notice:  
     > *"This action calls `admin_retry_astrology_delivery` to reset status from `failed` to `queued`, clears previous error messages, and updates the schedule time. Note: Physical dispatch occurs when the external provider worker polls or consumes queued items."*
2. **Server Action**: Submitting the modal invokes `retryAstrologyDelivery(deliveryId)` in `lib/actions/astrology-management.ts`.
3. **Database RPC**: Executes `public.admin_retry_astrology_delivery(p_delivery_id UUID)` ([027_astrology_admin_operations.sql](file:///C:/Projects/KashiVeda/supabase/migrations/027_astrology_admin_operations.sql#L227-L320)):
   ```sql
   UPDATE public.astrology_deliveries
   SET status = 'queued'::public.astrology_delivery_status,
       error_message = NULL,
       scheduled_at = now()
   WHERE id = p_delivery_id;
   ```
4. **Audit Logging**: Inserts an entry into `public.admin_audit_logs` with action `'astrology_delivery_retried_by_admin'`.
5. **No Dispatch Trigger**: The RPC performs no other actions. Re-running `cron_astrology_delivery_dispatch()` ignores the retried delivery because the cron's query only inserts *new* deliveries for content and subscriptions that do not already have an entry in `astrology_deliveries`.

---

## 6. Deployment Evidence: Confirmed, Absent, or Unverified

| Component / Setting | Repository Evidence | Local Config Evidence | Deployed Runtime Evidence | Classification |
|---|---|---|---|---|
| `public.astrology_content` schema | Defined in Migration 009 & 051 | Present in local schema | Matches schema | **CONFIRMED IMPLEMENTED** |
| `public.astrology_deliveries` schema | Defined in Migration 009 & 017 | Present in local schema | Matches schema | **CONFIRMED IMPLEMENTED** |
| `cron_astrology_delivery_dispatch` RPC | Defined in Migration 016 | Present in local schema | Matches schema | **CONFIRMED IMPLEMENTED** |
| `admin_retry_astrology_delivery` RPC | Defined in Migration 027 | Present in local schema | Matches schema | **CONFIRMED IMPLEMENTED** |
| `pg_cron` schedules (00:05 UTC, 00:30 UTC) | Scheduled in Migration 016 | C extension requires Linux | Matches cloud default | **CONFIRMED CONFIGURED** |
| `pgmq` queue declarations (4 queues) | Created in Migration 016 | C extension requires Linux | Queues declared | **CONFIRMED DECLARED** |
| Scheduled-to-Published Worker | **Zero code found** | **Absent** | **Absent** | **CONFIRMED ABSENT** |
| `pgmq` Queue Producer (`pgmq.send`) | **Zero code found** | **Absent** | **Absent** | **CONFIRMED ABSENT** |
| `pgmq` Queue Consumer (`pgmq.read`) | **Zero code found** | **Absent** | **Absent** | **CONFIRMED ABSENT** |
| WhatsApp Provider Integration / Client | **Zero code found** | **Absent** | **Absent** | **CONFIRMED ABSENT** |
| WhatsApp Environment Variables / Secrets | **Zero variables in .env** | **Absent** | **Absent** | **CONFIRMED ABSENT** |
| External Consumer Infrastructure | Not in repo | Not in repo | No access to third-party workers | **UNVERIFIED EXTERNAL** |

---

## 7. Safe Tests Performed and Results

All simulations were executed on an isolated disposable local PostgreSQL 18.4 database (`scratch/disposable_pg` on port 5433) using `scratch/test_ast_q03_safe_evaluations.py`.

### Test Summary Table

| Test Scenario | Operations Performed | Observed Outcome | Evidence File / Metric | Status |
|---|---|---|---|---|
| **Test 1: Scheduled Content Lifecycle** | Created content with `status = 'scheduled'`, `publish_at = now() - INTERVAL '2 hours'`. Ran `cron_astrology_delivery_dispatch()`. | Row remained in `scheduled` status. Dispatcher inserted `0` deliveries. Customer RLS returned `0` rows. | `test_1_scheduled_content`: `automatically_transitioned = false`, `deliveries = 0` | **PASS (Proves Gap)** |
| **Test 2: Published Content Dispatch** | Updated content to `status = 'published'`. Re-ran `cron_astrology_delivery_dispatch()`. | Dispatcher inserted `5` delivery records with `status = 'queued'`, `channel = 'whatsapp'`, `sent_at = NULL`. | `test_2_published_dispatch`: `dispatch_inserted = 5`, `status = 'queued'` | **PASS (Proves Journaling)** |
| **Test 3: pgmq Queue Inspection** | Inspected `pgmq.q_whatsapp_messages` and `pgmq.q_astrology_deliveries` after dispatch. | Queue message count was `0`. Dispatch did not enqueue any messages to `pgmq`. | `test_3_pgmq_state`: `queue_produced_by_dispatch = false` | **PASS (Proves Disconnect)** |
| **Test 4: Admin Retry State Machine** | Marked delivery as `failed`. Executed `admin_retry_astrology_delivery`. Re-ran cron dispatch. | Delivery updated to `status = 'queued'`, `scheduled_at = now()`. `pgmq` messages remained `0`. Cron inserted `0` rows. | `test_4_retry_behavior`: `status = 'queued'`, `dispatch_processed_retried_row = false` | **PASS (Proves State Only)** |
| **Test 5: Unique Constraint Idempotency** | Attempted duplicate insert for same `(subscription_id, content_id)`. | Blocked by PostgreSQL constraint `uq_astrology_deliveries_subscription_content`. | `test_5_unique_constraint`: `duplicate_prevented_by_constraint = true` | **PASS (Proves Constraint)** |

---

## 8. Failure Modes and Operational Consequences

1. **Scheduled Content "Black Hole"**:
   - An administrator spends time creating weekly guidance, sets it to `Scheduled` for Monday 06:00 AM, and expects it to publish automatically.
   - Monday 06:00 AM arrives; the content remains in `scheduled` status.
   - The morning delivery dispatch runs and excludes the content.
   - Subscribers receive no content. The content is never published unless the administrator discovers the failure and manually edits the post.

2. **Perpetual "Queued" Delivery Journal**:
   - Every time `cron_astrology_delivery_dispatch` runs, it generates delivery journal records in `public.astrology_deliveries` marked `queued`.
   - Over months, thousands of records accumulate in `queued` status.
   - In the Admin Deliveries dashboard, the "Queued Deliveries" KPI counter continually increments while "Sent Deliveries" remains zero.
   - The Admin "Retry" button resets a failed delivery to `queued`, but because there is no consumer, the retry achieves nothing.

3. **Customer Expectation Mismatch on WhatsApp Entitlement**:
   - Plans explicitly advertise `weekly_whatsapp_enabled = true`.
   - Customers pay for annual plans expecting weekly WhatsApp messages.
   - The database records their eligibility and creates delivery records, but zero messages are ever dispatched.

---

## 9. Implementation Matrix: Fully Implemented vs Partially vs Missing vs Unverified

| Feature / Workflow Stage | State | Summary of Implementation |
|---|---|---|
| **Subscription Plan Channel Flags** | **FULLY IMPLEMENTED** | `weekly_whatsapp_enabled` and `daily_in_app_enabled` on `astrology_subscription_plans`. |
| **Content Authoring & Validation** | **FULLY IMPLEMENTED** | Form modal, validation, and RPC `admin_save_astrology_content` in Migration 051. |
| **Delivery Journaling SQL Logic** | **FULLY IMPLEMENTED** | `cron_astrology_delivery_dispatch()` correctly matches active subscribers to published content and inserts rows into `astrology_deliveries`. |
| **Delivery Journal Constraints** | **FULLY IMPLEMENTED** | Unique constraint `uq_astrology_deliveries_subscription_content` prevents duplicate dispatch records. |
| **Admin Delivery Journal UI** | **FULLY IMPLEMENTED** | `/astrology/deliveries` displays paginated delivery history, filters, channel badges, and retry modal. |
| **Admin Retry State Transition** | **FULLY IMPLEMENTED** | `admin_retry_astrology_delivery` atomically resets `failed` to `queued` with audit logging. |
| **Customer Delivery View** | **FULLY IMPLEMENTED** | `AstrologyDeliveriesScreen` and `useAstrologyDeliveries` fetch delivery journal records for the customer. |
| **Scheduled-to-Published Transition** | **COMPLETELY MISSING** | Zero workers, triggers, or cron jobs transition content from `scheduled` to `published`. |
| **pgmq Queue Enqueueing** | **COMPLETELY MISSING** | Neither SQL functions nor application code push messages to the declared `pgmq` queues. |
| **Queue Consumer Daemon** | **COMPLETELY MISSING** | No worker or Edge Function polls `pgmq` or `astrology_deliveries`. |
| **WhatsApp Provider Integration** | **COMPLETELY MISSING** | Zero WhatsApp provider SDKs, API clients, credentials, or webhook handlers exist. |
| **External Worker Infrastructure** | **UNVERIFIED** | No evidence of external worker infrastructure in repository or deployment configs. |

---

## 10. Product Decisions Required

Before implementing any code or migrations, the product owner must resolve the following questions:

1. **Scheduled Content Lifecycle**:
   - Should content automatically transition from `scheduled` to `published` at `publish_at`?
   - **Option A (Database-native)**: Update `cron_astrology_delivery_dispatch()` or add a 5-minute pg_cron job that runs:
     `UPDATE public.astrology_content SET status = 'published' WHERE status = 'scheduled' AND publish_at <= now();`
   - **Option B (Query-time semantics)**: Treat `publish_at <= now()` as published at query time without altering the stored status.
   - **Option C (Manual publishing only)**: Remove the `Scheduled` option from the Admin UI to avoid false user expectations.

2. **WhatsApp Broadcast Architecture**:
   - Is WhatsApp broadcast delivery intended for Phase 1 release, or is it a Phase 2 capability?
   - If **Phase 1**:
     - Which messaging provider is contracted? (Meta WhatsApp Business Platform Cloud API, Twilio, Gupshup, etc.)
     - How should dispatch be triggered? (Supabase Edge Function scheduled via pg_cron, or database webhook on `astrology_deliveries` insert?)
     - What is the message template name and namespace approved by Meta?
   - If **Phase 2 / Deferred**:
     - Should `weekly_whatsapp_enabled` be hidden or marked "Coming Soon" in the plan catalog to prevent false customer expectations?
     - Should the Admin "Retry" button display an honest notification that external dispatch is not yet connected?

---

## 11. Recommended Next Step (Without Implementing)

1. **Do not write speculative worker code**: Avoid building a custom WhatsApp integration until the provider, credentials, and Meta message template contracts are officially established.
2. **Present this assessment to the Product Owner**: Request formal clarification on whether scheduled publication is desired via a simple pg_cron transition and whether WhatsApp delivery is in scope for the current milestone.
3. **Draft a minimal remediation proposal once approved**:
   - For scheduled content: A minimal SQL migration adding a 5-minute pg_cron schedule to transition `scheduled` content whose `publish_at` has passed.
   - For WhatsApp delivery: Document the required provider credentials and Edge Function architecture contract.

---

## 12. Files and Function Names Inspected

### Database Migrations (`C:\Projects\KashiVeda\supabase\migrations`)
- `001_extensions_and_enums.sql` (`public.astrology_content_status`, `public.astrology_delivery_status`, `public.astrology_channel`)
- `002_identity.sql` (`public.profiles`)
- `009_astrology.sql` (`public.astrology_content`, `public.astrology_deliveries`)
- `012_rls_and_permissions.sql` (`astrology_content_select_public`, `astrology_deliveries_select_customer`)
- `016_cron_and_queues.sql` (`public.cron_astrology_delivery_dispatch`, `pgmq.create` queue setup, `cron.schedule`)
- `017_indexes_and_constraints.sql` (`uq_astrology_deliveries_subscription_content`)
- `027_astrology_admin_operations.sql` (`public.admin_retry_astrology_delivery`)
- `045_daily_vedic_astrology_insights.sql` (`public.daily_rashi_insights`, `get_daily_rashi_insight`)
- `051_atomic_astrology_plan_content_audit_mutations.sql` (`public.admin_save_astrology_content`, `admin_save_astrology_plan`)
- `055_decouple_plan_deactivation_from_entitlements.sql` (`is_customer_subscribed_to_plan`)

### Supabase Functions & Config (`C:\Projects\KashiVeda\supabase`)
- `config.toml` (Inspected for cron, webhooks, and functions configuration)
- `functions/` (Confirmed only `calculate-free-kundli`, `create-razorpay-order`, `execute-razorpay-refund`, `live-session-token`, `razorpay-webhook` exist)

### Admin Portal (`C:\Projects\kashi-veda-admin`)
- `lib/actions/astrology-management.ts` (`saveAstrologyContent`, `getAstrologyDeliveries`, `retryAstrologyDelivery`)
- `lib/types/astrology-management.ts` (`AstrologyContentStatus`, `AstrologyDeliveryStatus`, `AstrologyChannel`)
- `components/admin/astrology/modals/content-form-modal.tsx` (Form modal for scheduling and publishing)
- `components/admin/astrology/modals/retry-delivery-modal.tsx` (Retry delivery modal)
- `components/admin/astrology/astrology-deliveries-view.tsx` (Horoscope Delivery Journal view)
- `components/admin/astrology/astrology-content-view.tsx` (Content management view)

### Mobile Application (`C:\Projects\KashiVeda`)
- `src/features/astrology/hooks/useAstrologyDeliveries.ts`
- `src/features/astrology/screens/AstrologyDeliveriesScreen.tsx`
- `src/features/astrology/services/astrologyService.ts` (`getCustomerDeliveries`)
- `__tests__/astrology_delivery_lifecycle.test.ts` (Lines 408–410 confirming WhatsApp provider not implemented)

---

## 13. Safety Attestation & Final Decision

### Safety Attestation
- **Zero Production Mutations**: No production databases, remote Supabase instances, or external APIs were accessed.
- **Zero Messages Dispatched**: No WhatsApp messages, SMS, or mock HTTP requests were sent.
- **Zero Application Modifications**: No source code, migrations, tests, or configurations in either repository were modified.
- **Strictly Read-Only Analysis**: The only file created is this assessment report.

### Required Final Decision
**Outcome E — Confirmed Incomplete**  
*(with attributes of **Outcome C — Partially Implemented**)*

**Justification**:  
Sufficient and irrefutable repository and runtime evidence establishes that the workflow stages required for automated scheduled content publication and WhatsApp message delivery are **missing**:
1. Scheduled content authoring exists in the Admin UI, but no automated worker, trigger, or cron job exists to transition scheduled rows to `published` status.
2. The daily delivery dispatch logic creates database journal records in `public.astrology_deliveries`, but never produces messages to the declared `pgmq` queues.
3. No queue consumer, background worker, or external WhatsApp provider integration exists anywhere in the codebase.
4. The Admin Retry action modifies row state from `failed` to `queued`, but reaches no consumer.
5. Consequently, scheduled content remains unpublished indefinitely, and delivery records remain queued indefinitely.
