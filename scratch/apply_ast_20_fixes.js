// Scratch script to apply AST-20 fixes to kashi-veda-admin
const fs = require('fs');
const path = require('path');

const ADMIN_ROOT = 'C:/Projects/kashi-veda-admin';

// =============================================================================
// 1. lib/types/daily-insights-management.ts
// =============================================================================
{
  const filePath = path.join(ADMIN_ROOT, 'lib/types/daily-insights-management.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Add DailyMatrixReadStatus and update DailyInsightsMatrixResponse
  if (!content.includes('export type DailyMatrixReadStatus')) {
    content = content.replace(
      'export interface DailyInsightsMatrixResponse {',
      `export type DailyMatrixReadStatus =
  | 'loading'
  | 'complete'
  | 'incomplete'
  | 'empty'
  | 'unavailable';

export interface DailyInsightsMatrixResponse {
  readStatus: DailyMatrixReadStatus;
  error?: string | null;`
    );
  }

  // Update PublishSetValidationResult
  if (!content.includes('isUnavailable?: boolean;')) {
    content = content.replace(
      'export interface PublishSetValidationResult {\n  success?: boolean;\n  isReadyForPublish: boolean;\n  totalRashis: number;\n  readyCount: number;\n  missingCount: number;',
      `export interface PublishSetValidationResult {
  success?: boolean;
  isReadyForPublish: boolean;
  isUnavailable?: boolean;
  totalRashis: number;
  readyCount: number | null;
  missingCount: number | null;`
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated lib/types/daily-insights-management.ts');
}

// =============================================================================
// 2. lib/actions/daily-insights-management.ts
// =============================================================================
{
  const filePath = path.join(ADMIN_ROOT, 'lib/actions/daily-insights-management.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Make sure DailyMatrixReadStatus is imported if needed, or it's from the types file
  if (!content.includes('DailyMatrixReadStatus')) {
    content = content.replace(
      'DailyInsightsMatrixResponse,',
      'DailyInsightsMatrixResponse,\n  DailyMatrixReadStatus,'
    );
  }

  // Update getDailyRashiInsightsMatrix to compute readStatus
  const oldReturnStr = `  return {
    date,
    language,
    slots,
    summary: {
      totalRashis: 12,
      publishedCount,
      draftCount,
      missingCount,
    },
  };`;

  const newReturnStr = `  let readStatus: DailyMatrixReadStatus;
  if (publishedCount === 12) {
    readStatus = "complete";
  } else if (publishedCount === 0 && draftCount === 0) {
    readStatus = "empty";
  } else {
    readStatus = "incomplete";
  }

  return {
    date,
    language,
    slots,
    summary: {
      totalRashis: 12,
      publishedCount,
      draftCount,
      missingCount,
    },
    readStatus,
    error: null,
  };`;

  if (content.includes(oldReturnStr)) {
    content = content.replace(oldReturnStr, newReturnStr);
  }

  // Update validateDailySetReadiness on fetchErr
  const oldFetchErr = `  if (fetchErr) {
    return {
      success: false,
      isReadyForPublish: false,
      totalRashis: 12,
      readyCount: 0,
      missingCount: 0,
      missingRashis: [],
      error: \`Database query failed while validating daily set readiness: \${fetchErr.message}\`,
    };
  }`;

  const newFetchErr = `  if (fetchErr) {
    return {
      success: false,
      isReadyForPublish: false,
      isUnavailable: true,
      totalRashis: 12,
      readyCount: null,
      missingCount: null,
      missingRashis: [],
      error: \`Database query failed while validating daily set readiness: \${fetchErr.message}\`,
    };
  }`;

  if (content.includes(oldFetchErr)) {
    content = content.replace(oldFetchErr, newFetchErr);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated lib/actions/daily-insights-management.ts');
}

// =============================================================================
// 3. app/(dashboard)/astrology/daily-insights/page.tsx
// =============================================================================
{
  const filePath = path.join(ADMIN_ROOT, 'app/(dashboard)/astrology/daily-insights/page.tsx');
  const newPageContent = `import { getDailyRashiInsightsMatrix } from "@/lib/actions/daily-insights-management";
import { DailyInsightsMatrixView } from "@/components/admin/astrology/daily-insights/daily-insights-matrix-view";
import type { DailyInsightsMatrixResponse } from "@/lib/types/daily-insights-management";
import { CANONICAL_RASHIS } from "@/lib/types/daily-insights-management";

// Asia/Kolkata date resolution
function getIndianTodayDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export default async function DailyInsightsPage() {
  const today = getIndianTodayDate();
  let initialData: DailyInsightsMatrixResponse;

  try {
    initialData = await getDailyRashiInsightsMatrix({ date: today, language: "en" });
  } catch (err: any) {
    console.error("Failed to load initial daily insights matrix:", err);
    initialData = {
      date: today,
      language: "en",
      slots: CANONICAL_RASHIS.map((rashi) => ({ rashi, insight: null })),
      summary: {
        totalRashis: 12,
        publishedCount: 0,
        draftCount: 0,
        missingCount: 0,
      },
      readStatus: "unavailable",
      error: err?.message || "Failed to load daily insights matrix due to a database query failure.",
    };
  }

  return <DailyInsightsMatrixView initialData={initialData} />;
}
`;
  fs.writeFileSync(filePath, newPageContent, 'utf8');
  console.log('Updated app/(dashboard)/astrology/daily-insights/page.tsx');
}

// =============================================================================
// 4. lib/types/astrology-management.ts
// =============================================================================
{
  const filePath = path.join(ADMIN_ROOT, 'lib/types/astrology-management.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Update AstrologyPlanItem
  content = content.replace(
    'activeSubscriberCount?: number;',
    'activeSubscriberCount?: number | null;'
  );

  // Update AstrologyOverviewMetrics
  const oldOverviewMetrics = `export interface AstrologyOverviewMetrics {
  totalPlans: number;
  activePlans: number;
  totalSubscribers: number;
  activeSubscribers: number;
  publishedContentCount: number;
  scheduledContentCount: number;
  queuedDeliveries: number;
  failedDeliveries: number;
  recentDeliveries: AstrologyDeliveryListItem[];
  recentSubscriptions: AstrologySubscriptionListItem[];
}`;

  const newOverviewMetrics = `export interface AstrologyOverviewMetrics {
  totalPlans: number | null;
  activePlans: number | null;
  totalSubscribers: number | null;
  activeSubscribers: number | null;
  publishedContentCount: number | null;
  scheduledContentCount: number | null;
  queuedDeliveries: number | null;
  failedDeliveries: number | null;
  unavailableMetrics?: string[];
  recentDeliveries: AstrologyDeliveryListItem[];
  recentSubscriptions: AstrologySubscriptionListItem[];
}`;

  if (content.includes(oldOverviewMetrics)) {
    content = content.replace(oldOverviewMetrics, newOverviewMetrics);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated lib/types/astrology-management.ts');
}

// =============================================================================
// 5. lib/actions/astrology-management.ts
// =============================================================================
{
  const filePath = path.join(ADMIN_ROOT, 'lib/actions/astrology-management.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace getAstrologyPlans counting logic
  const oldPlansSection = `  // Count active subscribers for each plan
  const { data: activeSubs } = await supabase
    .from("astrology_subscriptions")
    .select("plan_id")
    .eq("status", "active");

  const subCountsByPlan: Record<string, number> = {};
  (activeSubs || []).forEach((s) => {
    subCountsByPlan[s.plan_id] = (subCountsByPlan[s.plan_id] || 0) + 1;
  });

  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    duration_days: p.duration_days,
    price: Number(p.price),
    currency: p.currency,
    daily_in_app_enabled: p.daily_in_app_enabled,
    weekly_whatsapp_enabled: p.weekly_whatsapp_enabled,
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at,
    activeSubscriberCount: subCountsByPlan[p.id] || 0,
  }));`;

  const newPlansSection = `  // Count active subscribers for each plan using exact-count queries (immune to PostgREST row truncation)
  const countResults = await Promise.all(
    plans.map(async (plan) => {
      const { count, error: countErr } = await supabase
        .from("astrology_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("plan_id", plan.id)
        .eq("status", "active");

      if (countErr || count === null || count === undefined) {
        console.error(\`Failed to fetch active subscriber count for plan \${plan.id}:\`, countErr);
        return { planId: plan.id, count: null };
      }
      return { planId: plan.id, count };
    })
  );

  const subCountsByPlan: Record<string, number | null> = {};
  countResults.forEach((res) => {
    subCountsByPlan[res.planId] = res.count;
  });

  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    duration_days: p.duration_days,
    price: Number(p.price),
    currency: p.currency,
    daily_in_app_enabled: p.daily_in_app_enabled,
    weekly_whatsapp_enabled: p.weekly_whatsapp_enabled,
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at,
    activeSubscriberCount: subCountsByPlan[p.id] !== undefined ? subCountsByPlan[p.id] : null,
  }));`;

  if (content.includes(oldPlansSection)) {
    content = content.replace(oldPlansSection, newPlansSection);
  } else {
    console.warn('Could not find oldPlansSection to replace in lib/actions/astrology-management.ts');
  }

  // Replace getAstrologyOverview counts logic
  const oldOverviewDestruct = `  const [
    { count: totalPlansCount },
    { count: activePlansCount },
    { count: totalSubscribersCount },
    { count: activeSubscribersCount },
    { count: publishedContentCount },
    { count: scheduledContentCount },
    { count: queuedDeliveriesCount },
    { count: failedDeliveriesCount },
    recentDeliveriesRes,
    recentSubscriptionsRes,
  ] = await Promise.all([`;

  const newOverviewDestruct = `  const [
    totalPlansRes,
    activePlansRes,
    totalSubscribersRes,
    activeSubscribersRes,
    publishedContentRes,
    scheduledContentRes,
    queuedDeliveriesRes,
    failedDeliveriesRes,
    recentDeliveriesRes,
    recentSubscriptionsRes,
  ] = await Promise.all([`;

  if (content.includes(oldOverviewDestruct)) {
    content = content.replace(oldOverviewDestruct, newOverviewDestruct);
  }

  const oldOverviewReturn = `  return {
    totalPlans: totalPlansCount || 0,
    activePlans: activePlansCount || 0,
    totalSubscribers: totalSubscribersCount || 0,
    activeSubscribers: activeSubscribersCount || 0,
    publishedContentCount: publishedContentCount || 0,
    scheduledContentCount: scheduledContentCount || 0,
    queuedDeliveries: queuedDeliveriesCount || 0,
    failedDeliveries: failedDeliveriesCount || 0,
    recentDeliveries,
    recentSubscriptions,
  };`;

  const newOverviewReturn = `  const unavailableMetrics: string[] = [];

  function evaluateCountMetric(res: { count: number | null; error: any }, name: string): number | null {
    if (res.error || res.count === null || res.count === undefined) {
      console.error(\`Failed to fetch overview metric \${name}:\`, res.error);
      unavailableMetrics.push(name);
      return null;
    }
    return res.count;
  }

  const totalPlans = evaluateCountMetric(totalPlansRes, "totalPlans");
  const activePlans = evaluateCountMetric(activePlansRes, "activePlans");
  const totalSubscribers = evaluateCountMetric(totalSubscribersRes, "totalSubscribers");
  const activeSubscribers = evaluateCountMetric(activeSubscribersRes, "activeSubscribers");
  const publishedContentCount = evaluateCountMetric(publishedContentRes, "publishedContentCount");
  const scheduledContentCount = evaluateCountMetric(scheduledContentRes, "scheduledContentCount");
  const queuedDeliveries = evaluateCountMetric(queuedDeliveriesRes, "queuedDeliveries");
  const failedDeliveries = evaluateCountMetric(failedDeliveriesRes, "failedDeliveries");

  return {
    totalPlans,
    activePlans,
    totalSubscribers,
    activeSubscribers,
    publishedContentCount,
    scheduledContentCount,
    queuedDeliveries,
    failedDeliveries,
    unavailableMetrics: unavailableMetrics.length > 0 ? unavailableMetrics : undefined,
    recentDeliveries,
    recentSubscriptions,
  };`;

  if (content.includes(oldOverviewReturn)) {
    content = content.replace(oldOverviewReturn, newOverviewReturn);
  } else {
    console.warn('Could not find oldOverviewReturn to replace in lib/actions/astrology-management.ts');
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated lib/actions/astrology-management.ts');
}

// =============================================================================
// 6. components/admin/astrology/astrology-overview-view.tsx
// =============================================================================
{
  const filePath = path.join(ADMIN_ROOT, 'components/admin/astrology/astrology-overview-view.tsx');
  let content = fs.readFileSync(filePath, 'utf8');

  // Add helper for rendering metric
  if (!content.includes('function formatCountMetric')) {
    const helperCode = `
function formatCountMetric(val: number | null | undefined): React.ReactNode {
  if (val === null || val === undefined) {
    return <span className="text-muted-foreground/70 italic text-lg font-normal">Unavailable</span>;
  }
  return val.toLocaleString("en-IN");
}
`;
    content = content.replace(
      'interface AstrologyOverviewViewProps {',
      `${helperCode}\ninterface AstrologyOverviewViewProps {`
    );
  }

  // Update card displays
  content = content.replace(
    '<div className="text-2xl font-bold text-foreground">{data.activeSubscribers}</div>',
    '<div className="text-2xl font-bold text-foreground">{formatCountMetric(data.activeSubscribers)}</div>'
  );
  content = content.replace(
    'Out of {data.totalSubscribers} total registered subscriptions',
    'Out of {data.totalSubscribers !== null && data.totalSubscribers !== undefined ? data.totalSubscribers.toLocaleString("en-IN") : "—"} total registered subscriptions'
  );

  content = content.replace(
    '<div className="text-2xl font-bold text-foreground">{data.activePlans}</div>',
    '<div className="text-2xl font-bold text-foreground">{formatCountMetric(data.activePlans)}</div>'
  );
  content = content.replace(
    '{data.totalPlans} total configured offerings',
    '{data.totalPlans !== null && data.totalPlans !== undefined ? data.totalPlans.toLocaleString("en-IN") : "—"} total configured offerings'
  );

  content = content.replace(
    '<div className="text-2xl font-bold text-foreground">{data.queuedDeliveries}</div>',
    '<div className="text-2xl font-bold text-foreground">{formatCountMetric(data.queuedDeliveries)}</div>'
  );

  content = content.replace(
    '<div className="text-2xl font-bold text-destructive">{data.failedDeliveries}</div>',
    '<div className="text-2xl font-bold text-destructive">{formatCountMetric(data.failedDeliveries)}</div>'
  );

  // Add banner if unavailableMetrics exists
  if (!content.includes('data.unavailableMetrics')) {
    const bannerCode = `{data.unavailableMetrics && data.unavailableMetrics.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Partial Metrics Degradation:</strong> The following operational metric(s) could not be queried: <strong>{data.unavailableMetrics.join(", ")}</strong>. Displayed as Unavailable.
            </span>
          </div>
        </div>
      )}
      `;
    content = content.replace(
      '{/* Operational KPI Metric Cards */}',
      `${bannerCode}\n      {/* Operational KPI Metric Cards */}`
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated components/admin/astrology/astrology-overview-view.tsx');
}

// =============================================================================
// 7. components/admin/astrology/astrology-plans-view.tsx
// =============================================================================
{
  const filePath = path.join(ADMIN_ROOT, 'components/admin/astrology/astrology-plans-view.tsx');
  let content = fs.readFileSync(filePath, 'utf8');

  // Update totalActiveSubs computation
  content = content.replace(
    '  const totalActiveSubs = plans.reduce((acc, p) => acc + (p.activeSubscriberCount || 0), 0);',
    `  const totalActiveSubs = plans.reduce((acc, p) => {
    if (p.activeSubscriberCount === null || p.activeSubscriberCount === undefined) return acc;
    return acc + p.activeSubscriberCount;
  }, 0);
  const hasUnavailableCounts = plans.some((p) => p.activeSubscriberCount === null || p.activeSubscriberCount === undefined);`
  );

  // Update Subscribed Devotees Card
  content = content.replace(
    '<div className="text-2xl font-bold text-foreground">{totalActiveSubs}</div>',
    `<div className="text-2xl font-bold text-foreground">
              {hasUnavailableCounts ? (
                <span className="text-lg font-normal text-muted-foreground italic">
                  {totalActiveSubs.toLocaleString("en-IN")}+ (Partial)
                </span>
              ) : (
                totalActiveSubs.toLocaleString("en-IN")
              )}
            </div>`
  );

  // Update Table activeSubscriberCount cell
  content = content.replace(
    `                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {plan.activeSubscriberCount || 0}
                      </div>`,
    `                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {plan.activeSubscriberCount !== null && plan.activeSubscriberCount !== undefined ? (
                          plan.activeSubscriberCount.toLocaleString("en-IN")
                        ) : (
                          <span className="text-muted-foreground/80 italic text-xs font-normal">Unavailable</span>
                        )}
                      </div>`
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated components/admin/astrology/astrology-plans-view.tsx');
}
