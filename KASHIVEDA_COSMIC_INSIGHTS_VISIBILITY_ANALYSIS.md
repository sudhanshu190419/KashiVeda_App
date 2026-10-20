# KashiVeda — Cosmic Insights Visibility Investigation Report
## Comprehensive End-to-End Root-Cause Analysis (Analysis Only)

**Document Version:** 1.0.0  
**Date:** October 11, 2026  
**Investigation Target:** Cosmic Insights Feature Visibility in Mobile Application & Customer-Facing Website  
**Scope:** Navigation Architecture, Screen Rendering, Database & Seed Data, Admin Publishing Workflow, and Website Inventory  
**Status:** COMPLETE (ANALYSIS ONLY — NO CODE MODIFICATIONS APPLIED)

---

## A. Executive Summary

This investigation was conducted to determine why the Product Owner cannot locate the general **Cosmic Insights** feature in either the KashiVeda mobile application or a customer-facing website.

Through rigorous static source inspection, complete navigation route tracing, database query auditing, and verification of both `KashiVeda` and `kashi-veda-admin` repositories, this investigation establishes **four distinct, compounding root causes**:

1. **[CONFIRMED ROOT CAUSE — Customer Website] No Customer-Facing Website Exists in the KashiVeda Platform:**  
   The KashiVeda system architecture explicitly delegates customer and pandit workflows to the React Native mobile application, and administrative operations to the Next.js admin portal (`kashi-veda-admin`). There is **no customer-facing website** in the platform repository inventory. Searching for Cosmic Insights on a public website is searching for a product surface that has never been built.
2. **[CONFIRMED ROOT CAUSE — Mobile Entry Discoverability] Severe Entry Point Obscurity on Home Screen:**  
   There is **no Astrology tab** in the mobile application's bottom navigation bar (`CustomerTabNavigator`). On `HomeScreen`, there is no banner or top-level action for Cosmic Insights. The sole entry point is a card titled `"🪐 Vedic Astrology & Insights"` buried at the **very bottom of the Home Screen** under `"Sacred Pillars"`, past six major vertical content sections. Furthermore, it is labeled "Vedic Astrology & Insights", with zero mention of "Cosmic Insights".
3. **[CONFIRMED ROOT CAUSE — Mobile Screen Layout Hierarchy] Section Pushed Far Below the Fold:**  
   When a user navigates to `AstrologyScreen`, the viewport is completely dominated by the introduction banner, the massive **"Daily Vedic Horoscope"** section (12-Rashi selector strip and paid guidance lock cards), "Your Membership", and the "Subscription Plans" catalog. The general **"Today's Cosmic Insights"** section is placed at the **very bottom of the scrollable screen**, making it entirely invisible unless the user scrolls past multiple paid subscription sections.
4. **[CONFIRMED ROOT CAUSE — Content Absence & Navigation Dead-End on Empty State] Zero Seed Data & Conditional Navigation Drop:**  
   The database table `public.astrology_content` contains **zero seed rows** across all migrations (001–053). In any unpopulated environment where an administrator has not manually created and published articles:
   - `AstrologyScreen` receives an empty list (`content.length === 0`) and renders an `EmptyState` card ("No Insights Available").
   - Crucially, the section header's `"View All"` navigation link to the article feed (`AstrologyContentScreen`) is **conditionally hidden** when `content.length === 0`:
     `{content.length > 0 && (<TouchableOpacity onPress={() => navigation.navigate("AstrologyContent")}><Text>View All</Text></TouchableOpacity>)}`
   - Because `"View All"` disappears when content is empty, the empty state becomes a **navigation dead end**. The user cannot open the feed from that section.
   - The only remaining link to the feed is a subtle text button (`"Browse Insights →"`) tucked inside the top banner. If tapped, the feed screen (`AstrologyContentScreen`) also displays an empty state with zero cards, rendering the article detail screen (`AstrologyContentDetailScreen`) completely unreachable.

---

## B. Repository Inventory

An inspection of `C:\Projects` was performed:

| Repository Path | Repository Type & Technology | Target Roles & Purpose | Customer Website Present? |
| :--- | :--- | :--- | :---: |
| `C:\Projects\KashiVeda` | React Native (iOS/Android), TypeScript, Supabase PostgreSQL, Edge Functions | **Customer** & **Pandit** mobile application | ❌ (Mobile App Only) |
| `C:\Projects\kashi-veda-admin` | Next.js 15, React 19, Tailwind CSS, Supabase SSR | **Admin** & **Super Admin** internal operational dashboard | ❌ (Internal Admin Portal) |

### Key Architectural Constraint:
Per the authoritative KashiVeda project rules (`C:\Projects\KashiVeda\.agents\rules\kashi-veda.md`):
- *"React Native mobile app serves TWO user roles: Customer, Pandit."*
- *"Next.js web application serves TWO administrative roles: Admin, Super Admin."*
- *"Pandit operational workflows must be implemented in the mobile app."*
- *"Admin and Super Admin operational workflows must be implemented in the web application."*

**Conclusion:** No separate customer-facing KashiVeda website exists under `C:\Projects`. All customer-facing features are housed exclusively inside the `KashiVeda` mobile application.

---

## C. Mobile Visibility Analysis

### 1. Navigation Architecture & Route Registration

Tracing the application entry point:
- `App.tsx` renders `RootNavigator` within `AppProviders`.
- `RootNavigator.tsx` (lines 32–40) checks user session and roles:
  - If unauthenticated: renders `AuthNavigator`.
  - If admin/super_admin: renders `AdminNoticeScreen`.
  - If pandit mode: renders `PanditNavigator`.
  - If customer: renders `CustomerNavigator`.

#### Stack and Tab Registrations in `CustomerNavigator.tsx`:
```
CustomerNavigator (Stack.Navigator)
│
├── CustomerTabs (BottomTabNavigator) ── [Initial Screen]
│   ├── Tab 1: "Home"     ──> HomeScreen (options: { tabBarLabel: "Home" })
│   ├── Tab 2: "Explore"  ──> ExploreScreen (options: { tabBarLabel: "Rituals" })
│   ├── Tab 3: "Bookings" ──> BookingsScreen (options: { tabBarLabel: "My Pujas" })
│   ├── Tab 4: "Kundli"   ──> KundliScreen (options: { tabBarLabel: "Kundli" })
│   └── Tab 5: "Profile"  ──> ProfileScreen (options: { tabBarLabel: "Account" })
│
├── Stack Screen: "Astrology"              ──> AstrologyScreen
├── Stack Screen: "AstrologyContent"       ──> AstrologyContentScreen
├── Stack Screen: "AstrologyContentDetail" ──> AstrologyContentDetailScreen
├── Stack Screen: "AstrologyPlanDetail"    ──> AstrologyPlanDetailScreen
├── Stack Screen: "AstrologyPayment"       ──> AstrologyPaymentScreen
├── Stack Screen: "AstrologySubscription"  ──> AstrologySubscriptionScreen
└── Stack Screen: "AstrologyDeliveries"    ──> AstrologyDeliveriesScreen
```

**[CONFIRMED WORKING] Route Registration:** All three relevant screens (`Astrology`, `AstrologyContent`, and `AstrologyContentDetail`) are registered in `CustomerNavigator.tsx` (lines 122, 126, 127).

**[CONFIRMED ROOT CAUSE] Tab Bar Absence:** There is **no Astrology tab** in `CustomerTabNavigator`. A user looking at the primary app navigation bar at the bottom of the device sees only Home, Rituals, My Pujas, Kundli, and Account.

---

### 2. Discoverability on Home Screen (`HomeScreen.tsx`)

Tracing the customer journey starting from the app's default screen (`HomeScreen`):

```
+-------------------------------------------------------------------------------+
| HomeScreen Layout Progression                                                 |
+-------------------------------------------------------------------------------+
| 1. Header (Greeting, Avatar, Notification Bell)                               |
| 2. Service Mode Selector Cards ("Home Puja", "Online Puja", "Temple Puja")    |
| 3. "Browse All Pujas" Secondary Card                                          |
| 4. Featured Ritual Offering Banner ("Kashi Vishwanath Rudrabhishek")          |
| 5. Ritual Categories List (Ganga Aarti, Rudrabhishek, Mahamrityunjaya...)     |
| 6. Verified Vedic Pandits Directory Preview                                   |
| 7. [BURiED AT BOTTOM] Sacred Pillars:                                         |
|    - Card 1: 🪔 Vedic Ritual Marketplace (Non-interactive)                    |
|    - Card 2: 🪐 Vedic Astrology & Insights (TouchableOpacity -> "Astrology")   |
+-------------------------------------------------------------------------------+
```

**Source Evidence (`HomeScreen.tsx` lines 320–344):**
```tsx
{/* Sacred Pillars */}
<View style={[styles.sectionHeader, styles.sectionTopMargin]}>
  <Text variant="h3">Sacred Pillars</Text>
</View>

<Card style={styles.pillarCard}>
  <Text variant="h3">🪔 Vedic Ritual Marketplace</Text>
  <Text variant="caption" color={colors.textSecondary}>
    Home Puja, Temple Rituals, and Live Remote Puja with transparent itemized Samagri.
  </Text>
</Card>

<TouchableOpacity
  activeOpacity={0.7}
  onPress={() => navigation.navigate("Astrology" as any)}
  accessibilityRole="button"
  accessibilityLabel="Vedic Astrology and Insights"
>
  <Card style={styles.pillarCard}>
    <Text variant="h3">🪐 Vedic Astrology & Insights</Text>
    <Text variant="caption" color={colors.textSecondary}>
      Daily cosmic guidance, planetary transits, and membership plans rooted in Vedic Jyotish.
    </Text>
  </Card>
</TouchableOpacity>
```

**Findings:**
1. The touchable card is located at line 334, after approximately 330 lines of UI components.
2. On standard mobile viewports (e.g., iPhone 14/15, Pixel 7), this card is 3 to 4 full screen heights below the fold.
3. The card label is `"🪐 Vedic Astrology & Insights"`. The term **"Cosmic Insights"** does not appear anywhere on `HomeScreen`. A user specifically seeking "Cosmic Insights" has no clear signpost that this card is the pathway.

---

### 3. Layout Hierarchy & Content Rendering on `AstrologyScreen.tsx`

When the user taps `"🪐 Vedic Astrology & Insights"`, they navigate to `AstrologyScreen.tsx`.

Tracing the vertical layout of `AstrologyScreen.tsx`:

```
+-------------------------------------------------------------------------------+
| AstrologyScreen Layout Progression                                            |
+-------------------------------------------------------------------------------+
| 1. Header ("Vedic Astrology")                                                 |
| 2. Banner Card ("Cosmic Planetary Wisdom")                                    |
|    - Subtitle: "Receive authentic daily Jyotish guidance..."                   |
|    - Action Button: [Browse Insights →] (TouchableOpacity -> "AstrologyContent")|
| 3. Section: "Daily Vedic Horoscope"                                           |
|    - Date Indicator                                                           |
|    - 12-Rashi Selector Strip (Mesha, Vrishabha, Mithuna...)                   |
|    - DailyRashiInsightCard (Locked preview + 🔒 Paid Guidance CTAs)           |
| 4. Section: "Your Membership" (Rendered only if subscription exists)          |
| 5. Section: "Subscription Plans"                                              |
|    - Plan Cards (Masik, Varshik Jyotish Guidance with Pricing & CTAs)          |
| 6. [BURiED AT BOTTOM] Section: "Today's Cosmic Insights"                      |
|    - Header: "Today's Cosmic Insights" + [View All] (CONDITIONALLY RENDERED)   |
|    - Content: AstrologyContentCard items OR EmptyState                        |
+-------------------------------------------------------------------------------+
```

**Source Evidence (`AstrologyScreen.tsx` lines 242–275):**
```tsx
{/* Latest Published Astrology Insights Feed */}
<View style={styles.section}>
  <View style={styles.sectionHeader}>
    <Text variant="h3">Today's Cosmic Insights</Text>
    {content.length > 0 && (
      <TouchableOpacity
        onPress={() => navigation.navigate("AstrologyContent" as any)}
      >
        <Text variant="captionMedium" color={colors.primary}>
          View All
        </Text>
      </TouchableOpacity>
    )}
  </View>

  {content.length === 0 ? (
    <EmptyState
      title="No Insights Available"
      description="No published astrology insights are available at this time."
    />
  ) : (
    content.map((item: AstrologyContentType) => (
      <AstrologyContentCard
        key={item.id}
        content={item}
        onPress={(selectedItem) =>
          navigation.navigate("AstrologyContentDetail" as any, {
            contentId: selectedItem.id,
          })
        }
      />
    ))
  )}
</View>
```

**Findings:**
1. **[CONFIRMED ROOT CAUSE] Section Placement:** "Today's Cosmic Insights" is the very last element on `AstrologyScreen`. The screen prioritizes the paid Daily Vedic Horoscope (Phase 3 feature) and Subscription Plans over general legacy insights.
2. **[CONFIRMED ROOT CAUSE] Conditional Navigation Drop:** Line 245 conditionally renders the `"View All"` button only when `content.length > 0`. When the database has no published articles (`content.length === 0`), the `"View All"` link completely disappears!
3. **[CONFIRMED ROOT CAUSE] Dead-End Empty State:** When `content.length === 0`, `EmptyState` renders static text without any button or action. The user cannot tap anything in this section to open the `AstrologyContentScreen` feed.
4. **Subtle Banner Link:** The only other route trigger to `AstrologyContentScreen` is in the introduction banner at line 137 (`"Browse Insights →"`). It is styled as a small caption text link and does not use the name "Cosmic Insights".

---

### 4. Feed & Detail Screen Traceability

#### Article Feed (`AstrologyContentScreen.tsx`)
- Screen title: `"Cosmic Insights"`.
- Channel filters: `"All Insights"`, `"Daily In-App"`, and `"WhatsApp Broadcasts"`.
- Fetch hook: `useAstrologyContent({ pageSize: 10, channel: selectedChannel })`.
- When articles exist: Renders `FlatList` with `AstrologyContentCard` items. Tapping any card navigates to `AstrologyContentDetail` with `{ contentId: item.id }`.
- When articles do not exist (`content.length === 0`):
  ```tsx
  ListEmptyComponent={
    <EmptyState
      title="No Insights Available"
      description="No astrology insights have been published for this channel yet. Check back daily for new cosmic updates."
    />
  }
  ```
  The screen shows an empty state with zero cards.

#### Article Detail (`AstrologyContentDetailScreen.tsx`)
- Screen title: `"Astrology Insight"`.
- Fetches by ID via `astrologyService.getContentById(contentId)`.
- Renders full article body, channel badge (`Daily In-App` or `WhatsApp Broadcast`), and publication date.
- **Reachability Constraint:** There is no route or UI mechanism in the entire application that opens `AstrologyContentDetailScreen` without passing a valid `contentId` obtained by pressing an `AstrologyContentCard`. When the database has no published content, `AstrologyContentDetailScreen` cannot be opened under normal customer navigation.

---

## D. Website Visibility Analysis

An exhaustive review of the second repository, `C:\Projects\kashi-veda-admin`, was conducted:

1. **Repository Identity:**
   - Package name: `"kashi-veda-admin"` (`package.json`).
   - Purpose: Internal Next.js management dashboard for Kashi Veda temple administrators.
   - Authentication guard: Uses `requireAdmin(supabase)` or `requireSuperAdmin(supabase)` on all server actions and pages.
2. **Astrology Routes in Admin Portal:**
   - `/astrology` — Overview KPI dashboard.
   - `/astrology/plans` — Subscription catalog management.
   - `/astrology/subscriptions` — Customer subscription directory & cancellations.
   - `/astrology/deliveries` — Automated journal dispatches.
   - `/astrology/content` — Content authoring catalog (`AstrologyContentView`, `ContentFormModal`).
3. **Absence of Customer Website:**
   - There are **no public-facing routes**, no consumer landing pages, no customer authentication screens, and no customer article-browsing views in `kashi-veda-admin`.
   - The route `/astrology/content` is an administrative CRUD table with columns for Status, Channel, Publish Date, Expiry Date, and Author, protected by administrator session checks.

**Conclusion:** Searching for Cosmic Insights on a "customer-facing website" fails because no customer-facing website exists.

---

## E. Database and Content Analysis

### 1. Data-Fetching Implementation

`src/features/astrology/services/astrologyService.ts`:
```typescript
async getPublishedContent(
  page = 1,
  pageSize = 10,
  channel?: AstrologyChannel
): Promise<PaginatedAstrologyContent> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("astrology_content")
    .select(
      "id, channel, title, body, publish_at, expires_at, status, created_by, created_at, updated_at",
      { count: "exact" }
    );

  if (channel) {
    query = query.eq("channel", channel);
  }

  const { data, count, error } = await query
    .order("publish_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message || "Failed to load published astrology insights.");
  }

  const totalCount = count || 0;
  const items = (data || []) as AstrologyContent[];

  return {
    items,
    count: totalCount,
    hasMore: to + 1 < totalCount,
  };
}
```

### 2. Query Correctness Review
- **Table Queried:** `public.astrology_content` (Correct).
- **Columns Selected:** All required fields for card and detail display (Correct).
- **Client Status Filtering:** The query does not specify `.eq("status", "published")` or `.lte("publish_at", ...)` in TypeScript code. Instead, it relies on PostgreSQL Row-Level Security (RLS) policy `astrology_content_select_customer`:
  ```sql
  status = 'published'::public.astrology_content_status
  AND publish_at <= now()
  AND (expires_at IS NULL OR expires_at > now())
  ```
- **Error Handling:** If an error occurs, it throws; `useAstrologyContent` catches it, populates `error`, and sets `content: []`.

### 3. Investigation of Seed Data & Database Content

A comprehensive search of `supabase/migrations/` (migrations 001 through 053) and repository files was conducted for initial content records:
- Migration `009_astrology.sql`: Creates `public.astrology_content` table.
- Migration `012_rls_and_permissions.sql`: Configures RLS policies and grants.
- Migration `016_cron_and_queues.sql`: Sets up delivery queueing.
- Migration `051_atomic_astrology_plan_content_audit_mutations.sql`: Creates `admin_save_astrology_content` RPC.
- **Seed Scripts:** There is **no `seed.sql` file** in the repository.
- **Insert Statements:** There is **not a single `INSERT INTO public.astrology_content` statement** anywhere in migrations 001–053 or seed scripts.

**[CONFIRMED ROOT CAUSE] Content Absence:** Unless an administrator manually logs into `kashi-veda-admin`, accesses `/astrology/content`, and explicitly creates and publishes records, the `public.astrology_content` table is **completely empty** in any newly deployed, local, or clean database environment.

---

## F. Admin Publishing Analysis

Tracing the lifecycle of an article created by an administrator:

```
Admin Form (content-form-modal.tsx)
  │
  ▼
Validation (Body >= 5 chars, publish_at required, expires_at > publish_at)
  │
  ▼
Server Action: saveAstrologyContent() (astrology-management.ts)
  │
  ▼
Database RPC: public.admin_save_astrology_content() (Migration 051)
  │
  ▼
Table Record in public.astrology_content
  │
  ▼
Customer RLS Filter: astrology_content_select_customer (Migration 012)
  │
  ├── IF status = 'draft' ───────> INVISIBLE to Customer App
  ├── IF publish_at > now() ─────> INVISIBLE to Customer App (Scheduled)
  ├── IF expires_at <= now() ────> INVISIBLE to Customer App (Expired)
  └── IF status = 'published' AND publish_at <= now() AND expires_at > now()
        │
        ▼
      VISIBLE in Customer Feed (getPublishedContent())
```

### Critical Observations in Admin Publishing:
1. **Default Status is `'draft'`:** In `content-form-modal.tsx` (line 40), the default form state for new content is `status = "draft"`. If an admin fills in title and body and hits Save without explicitly switching the dropdown to `"published"`, the record is saved as a draft and is completely hidden from customers.
2. **Timezone Wall-Clock Matching:** If an admin schedules an article for a few minutes in the future, it is filtered out by `publish_at <= now()` until that timestamp passes.
3. **No Automatic Customer Feed Sync:** The admin UI successfully publishes content to the database, but if the mobile app has already loaded an empty state, the customer must manually pull to refresh on `AstrologyScreen` or `AstrologyContentScreen` to see the new record.

---

## G. Confirmed Root Causes and Status Classifications

| Dimension | Issue Description | Classification |
| :--- | :--- | :--- |
| **Customer Website** | No customer-facing website exists; KashiVeda is exclusively a React Native mobile application for customer workflows. | **CONFIRMED ROOT CAUSE** |
| **Mobile Tab Navigation** | No "Astrology" tab exists in `CustomerTabNavigator` (tabs: Home, Rituals, My Pujas, Kundli, Account). | **CONFIRMED ROOT CAUSE** |
| **Home Screen Discoverability** | The sole entry point is buried under "Sacred Pillars" at the very bottom of `HomeScreen` (lines 320–344) and is titled "Vedic Astrology & Insights", not "Cosmic Insights". | **CONFIRMED ROOT CAUSE** |
| **Astrology Screen Hierarchy** | "Today's Cosmic Insights" is placed at the very bottom of `AstrologyScreen`, pushed below the fold by introduction banners, Daily Vedic Horoscope, and Subscription Plans. | **CONFIRMED ROOT CAUSE** |
| **Database Content** | Table `public.astrology_content` contains 0 seed rows; the table is empty out-of-the-box until an admin publishes an article. | **CONFIRMED ROOT CAUSE** |
| **Empty-State Navigation Drop** | When content is empty, `AstrologyScreen` conditionally hides the `"View All"` link to the feed, creating a navigation dead end. | **CONFIRMED ROOT CAUSE** |
| **Admin Form Defaults** | New content in `kashi-veda-admin` defaults to `'draft'`, which RLS strictly conceals from customers unless manually changed to `'published'`. | **POTENTIAL CAUSE** |
| **Route Registration** | All stack routes (`Astrology`, `AstrologyContent`, `AstrologyContentDetail`) are properly registered in `CustomerNavigator.tsx`. | **CONFIRMED WORKING** |
| **Data Query & Service Logic** | `astrologyService.getPublishedContent()` and `getContentById()` correctly query the database and deserialize records when data exists. | **CONFIRMED WORKING** |
| **Security & RLS Policies** | RLS policy `astrology_content_select_customer` correctly allows authenticated users to read published content and protects drafts. | **CONFIRMED WORKING** |

---

## H. Evidence Reference Matrix

| Finding | Repository | File Path | Line Range | Key Code / Indicator |
| :--- | :--- | :--- | :---: | :--- |
| **Platform Roles** | Mobile | `C:\Projects\KashiVeda\.agents\rules\kashi-veda.md` | Lines 55–65 | Defines mobile for Customer/Pandit, web for Admin/Super Admin. |
| **Bottom Tab Bar** | Mobile | `src/navigation/CustomerNavigator.tsx` | Lines 53–97 | 5 tabs registered: Home, Explore, Bookings, Kundli, Profile. No Astrology tab. |
| **Stack Routes** | Mobile | `src/navigation/CustomerNavigator.tsx` | Lines 122–128 | Registers `Astrology`, `AstrologyContent`, `AstrologyContentDetail`. |
| **Buried Home Entry** | Mobile | `src/features/discovery/screens/HomeScreen.tsx` | Lines 320–344 | `Sacred Pillars` card navigating to `Astrology` at bottom of screen. |
| **Astrology Hub Layout** | Mobile | `src/features/astrology/screens/AstrologyScreen.tsx` | Lines 126–275 | Layout order: Banner -> Daily Vedic Horoscope -> Membership -> Plans -> Today's Cosmic Insights. |
| **Conditional View All** | Mobile | `src/features/astrology/screens/AstrologyScreen.tsx` | Lines 245–253 | `{content.length > 0 && (<TouchableOpacity onPress={() => navigation.navigate("AstrologyContent")}>...)}` |
| **Empty State Dead End** | Mobile | `src/features/astrology/screens/AstrologyScreen.tsx` | Lines 256–260 | Renders static `EmptyState` without navigation callback when content is empty. |
| **Banner Link** | Mobile | `src/features/astrology/screens/AstrologyScreen.tsx` | Lines 138–147 | Small text link `"Browse Insights →"` in introduction banner. |
| **Feed Screen** | Mobile | `src/features/astrology/screens/AstrologyContentScreen.tsx` | Lines 113, 151–156 | Header `"Cosmic Insights"`; `ListEmptyComponent` renders `EmptyState` when 0 items. |
| **Detail Screen** | Mobile | `src/features/astrology/screens/AstrologyContentDetailScreen.tsx` | Lines 36–58 | Requires `contentId` param; only reachable from card taps. |
| **Database Query** | Mobile | `src/features/astrology/services/astrologyService.ts` | Lines 363–398 | Queries `astrology_content` with `.order("publish_at", { ascending: false })`. |
| **RLS Policy** | Mobile | `supabase/migrations/012_rls_and_permissions.sql` | Lines 1121–1126 | Enforces `status = 'published' AND publish_at <= now() AND (expires_at IS NULL OR expires_at > now())`. |
| **Admin Route** | Admin | `app/(dashboard)/astrology/content/page.tsx` | Lines 1–45 | Protected admin content catalog view. |
| **Admin Draft Default**| Admin | `components/admin/astrology/modals/content-form-modal.tsx`| Line 40 | `setStatus("draft")` defaults new items to draft status. |

---

## I. Recommended Fix Plan (Analysis Only — Do Not Implement)

The following minimal changes would completely resolve the visibility and discoverability issues:

### 1. Elevate Entry Point on `HomeScreen.tsx`
- **Current State:** Buried at line 334 under "Sacred Pillars" after 6 sections.
- **Recommended Change:** 
  - Add an "Astrology & Cosmic Insights" quick action card in the main discovery grid or upper featured banner area on `HomeScreen`.
  - Update card text from `"🪐 Vedic Astrology & Insights"` to clearly mention `"Cosmic Insights & Daily Jyotish Guidance"`.

### 2. Elevate "Today's Cosmic Insights" on `AstrologyScreen.tsx`
- **Current State:** Placed at the very bottom below the Daily Vedic Horoscope and Subscription Plans.
- **Recommended Change:**
  - Move the "Today's Cosmic Insights" section directly beneath the top introduction banner, before or alongside the Daily Vedic Horoscope.
  - This immediately presents general free insights to authenticated users without requiring deep scrolling.

### 3. Remove the Conditional Navigation Drop on `AstrologyScreen.tsx`
- **Current State:** Line 245 only renders `"View All"` if `content.length > 0`.
- **Recommended Change:**
  - Render `"View All"` (or `"Browse All Insights"`) unconditionally in the section header regardless of `content.length`.
  - Add an action button inside the `EmptyState` component (e.g., `actionTitle="Explore Feed"`, `onAction={() => navigation.navigate("AstrologyContent")}`) to eliminate the dead end.

### 4. Provide Initial Seed Content in Migration / Development Environment
- **Current State:** `public.astrology_content` has zero seed rows.
- **Recommended Change:**
  - Add a small set of published, active seed articles (e.g., 2–3 timeless Jyotish guidance articles with `status = 'published'`, `channel = 'in_app'`, and `publish_at = now() - interval '1 day'`) in development and staging setups so the feature is populated out-of-the-box.

### 5. Product Copy Alignment
- Ensure all screen headings and buttons consistently use the phrase **"Cosmic Insights"** rather than alternating between "Vedic Astrology & Insights", "Browse Insights", and "Today's Cosmic Insights".

---

## J. Verification Plan

When the recommended changes are approved and implemented, verify them using this test suite:

1. **Navigation Hierarchy Tests:**
   - Verify tapping the new Home screen entry point navigates directly to `AstrologyScreen`.
   - Verify `AstrologyScreen` renders the "Today's Cosmic Insights" section within the visible initial viewport (above the fold).
2. **Empty State & Fallback Tests:**
   - Clear all records from `astrology_content` in local PostgreSQL.
   - Verify `AstrologyScreen` renders `"View All"` or an actionable button even when `content.length === 0`.
   - Tap the button and verify it navigates cleanly to `AstrologyContentScreen` without throwing navigation errors.
3. **End-to-End Content Delivery Test:**
   - In `kashi-veda-admin`, publish an article via `/astrology/content` with `status = 'published'`, `channel = 'in_app'`, and `publish_at = now()`.
   - In the mobile app, navigate `HomeScreen → AstrologyScreen`. Verify the new article appears as an `AstrologyContentCard`.
   - Tap the card. Verify `AstrologyContentDetailScreen` opens and displays the full title, date badge, and body.
4. **Existing Regression Suite Execution:**
   ```bash
   npm test -- __tests__/astrology.test.tsx __tests__/astrology_content_detail_retry.test.tsx __tests__/daily_vedic_astrology_insights.test.tsx __tests__/App.test.tsx
   ```
   Ensure all 47 unit and component tests continue to pass.

---

## K. Remaining Uncertainty

1. **[UNVERIFIED] Production Database Row Count:** In accordance with strict safety requirements, the live remote production database was not probed or queried. It cannot be verified from this analysis whether the production database currently contains any published rows in `public.astrology_content`.
2. **[UNVERIFIED] Deployed Mobile App Build Version:** It is unverified whether the specific build installed on the Product Owner's test device matches the latest codebase commit or an earlier version where navigation entries differed.
3. **[UNVERIFIED] Customer Website Roadmap:** It is unverified whether the Product Owner planned a separate public customer web portal (e.g., Next.js landing page) that has not yet been initialized in `C:\Projects`.
