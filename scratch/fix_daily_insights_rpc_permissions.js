const fs = require('fs');
const path = require('path');

const adminDir = 'C:\\Projects\\kashi-veda-admin';
const mobileDir = 'C:\\Projects\\KashiVeda';

// 1. Update lib/actions/daily-insights-management.ts to use the SECURITY DEFINER RPC admin_save_daily_rashi_insight
const actionsContent = `/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";
import {
  CANONICAL_RASHIS,
  type DailyRashiInsightAdminItem,
  type DailyRashiInsightFormData,
  type DailyInsightsMatrixResponse,
  type BulkDraftSaveResult,
  type PublishSetValidationResult,
  type PublishSetResult,
  type MissingRashiDetail,
} from "@/lib/types/daily-insights-management";

// =============================================================================
// 1. GET 12-RASHI MATRIX FOR SPECIFIC DATE & LANGUAGE
// =============================================================================
export async function getDailyRashiInsightsMatrix(params: {
  date: string;
  language?: string;
}): Promise<DailyInsightsMatrixResponse> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const date = params.date;
  const language = params.language || "en";

  // Query daily_rashi_insights for the selected date and language
  const { data, error } = await supabase
    .from("daily_rashi_insights")
    .select("*")
    .eq("insight_date", date)
    .eq("language", language);

  if (error) {
    console.error("Error querying daily_rashi_insights:", error);
  }

  const rows: DailyRashiInsightAdminItem[] = (data || []).map((row: any) => ({
    id: row.id,
    insight_date: row.insight_date,
    rashi_id: row.rashi_id,
    rashi_name: row.rashi_name,
    language: row.language,
    general_outlook: row.general_outlook,
    career_business: row.career_business,
    finance_wealth: row.finance_wealth,
    love_relationships: row.love_relationships,
    health_wellbeing: row.health_wellbeing,
    auspicious_color: row.auspicious_color,
    auspicious_number: row.auspicious_number != null ? String(row.auspicious_number) : null,
    status: row.status,
    published_at: row.published_at,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const insightMap = new Map<number, DailyRashiInsightAdminItem>();
  rows.forEach((item) => {
    insightMap.set(item.rashi_id, item);
  });

  let publishedCount = 0;
  let draftCount = 0;
  let missingCount = 0;

  const slots = CANONICAL_RASHIS.map((rashi) => {
    const insight = insightMap.get(rashi.id) || null;
    if (!insight) {
      missingCount++;
    } else if (insight.status === "published") {
      publishedCount++;
    } else {
      draftCount++;
    }
    return {
      rashi,
      insight,
    };
  });

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
  };
}

// =============================================================================
// 2. SAVE OR PUBLISH INDIVIDUAL DAILY RASHI INSIGHT (VIA AUTHORITATIVE RPC)
// Uses SECURITY DEFINER RPC public.admin_save_daily_rashi_insight
// =============================================================================
export async function saveDailyRashiInsight(
  formData: DailyRashiInsightFormData
): Promise<{ success: boolean; data?: any; error?: string }> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  // Validation
  if (!formData.insight_date || !formData.rashi_id || !formData.language) {
    return { success: false, error: "Date, Rashi, and Language are required." };
  }

  if (formData.rashi_id < 1 || formData.rashi_id > 12) {
    return { success: false, error: "Rashi ID must be between 1 and 12." };
  }

  if (formData.status === "published" && !formData.general_outlook?.trim()) {
    return { success: false, error: "General Outlook is mandatory before publishing an insight." };
  }

  const rashiMeta = CANONICAL_RASHIS.find((r) => r.id === formData.rashi_id);
  const rashiName = rashiMeta ? rashiMeta.vedicName : \`Rashi-\${formData.rashi_id}\`;

  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("admin_save_daily_rashi_insight", {
      p_insight_date: formData.insight_date,
      p_rashi_id: formData.rashi_id,
      p_rashi_name: rashiName,
      p_language: formData.language.trim().toLowerCase(),
      p_general_outlook: (formData.general_outlook || "").trim(),
      p_career_business: formData.career_business ? formData.career_business.trim() : null,
      p_finance_wealth: formData.finance_wealth ? formData.finance_wealth.trim() : null,
      p_love_relationships: formData.love_relationships ? formData.love_relationships.trim() : null,
      p_health_wellbeing: formData.health_wellbeing ? formData.health_wellbeing.trim() : null,
      p_auspicious_color: formData.auspicious_color ? formData.auspicious_color.trim() : null,
      p_auspicious_number: formData.auspicious_number && !isNaN(Number(formData.auspicious_number))
        ? Number(formData.auspicious_number)
        : null,
      p_status: formData.status,
    });

    if (rpcError) {
      console.error("RPC admin_save_daily_rashi_insight error:", rpcError);
      return { success: false, error: rpcError.message };
    }

    revalidatePath("/astrology");
    revalidatePath("/astrology/daily-insights");

    return { success: true, data: rpcData };
  } catch (err: any) {
    return { success: false, error: err.message || "An unexpected error occurred." };
  }
}

// =============================================================================
// 3. BULK SAVE DRAFTS (VIA AUTHORITATIVE RPC)
// =============================================================================
export async function bulkSaveDailyRashiInsightsDrafts(
  items: DailyRashiInsightFormData[]
): Promise<BulkDraftSaveResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  if (!items || items.length === 0) {
    return {
      success: true,
      savedCount: 0,
      failedCount: 0,
      message: "No items provided to save.",
    };
  }

  // Filter out entries that are completely empty across all insight categories
  const validItems = items.filter((item) => {
    const hasGeneral = item.general_outlook && item.general_outlook.trim().length > 0;
    const hasCareer = item.career_business && item.career_business.trim().length > 0;
    const hasFinance = item.finance_wealth && item.finance_wealth.trim().length > 0;
    const hasLove = item.love_relationships && item.love_relationships.trim().length > 0;
    const hasHealth = item.health_wellbeing && item.health_wellbeing.trim().length > 0;
    const hasColor = item.auspicious_color && item.auspicious_color.trim().length > 0;
    const hasNumber = item.auspicious_number && item.auspicious_number.trim().length > 0;

    return hasGeneral || hasCareer || hasFinance || hasLove || hasHealth || hasColor || hasNumber;
  });

  if (validItems.length === 0) {
    return {
      success: true,
      savedCount: 0,
      failedCount: 0,
      message: "No non-empty entries to save as draft.",
    };
  }

  const errors: string[] = [];
  let savedCount = 0;

  // Process each draft via authoritative RPC
  for (const item of validItems) {
    if (item.rashi_id < 1 || item.rashi_id > 12) {
      errors.push(\`Invalid Rashi ID \${item.rashi_id}\`);
      continue;
    }

    const rashiMeta = CANONICAL_RASHIS.find((r) => r.id === item.rashi_id);
    const rashiName = rashiMeta ? rashiMeta.vedicName : \`Rashi-\${item.rashi_id}\`;

    const { error: rpcErr } = await supabase.rpc("admin_save_daily_rashi_insight", {
      p_insight_date: item.insight_date,
      p_rashi_id: item.rashi_id,
      p_rashi_name: rashiName,
      p_language: (item.language || "en").trim().toLowerCase(),
      p_general_outlook: (item.general_outlook || "").trim(),
      p_career_business: item.career_business ? item.career_business.trim() : null,
      p_finance_wealth: item.finance_wealth ? item.finance_wealth.trim() : null,
      p_love_relationships: item.love_relationships ? item.love_relationships.trim() : null,
      p_health_wellbeing: item.health_wellbeing ? item.health_wellbeing.trim() : null,
      p_auspicious_color: item.auspicious_color ? item.auspicious_color.trim() : null,
      p_auspicious_number: item.auspicious_number && !isNaN(Number(item.auspicious_number))
        ? Number(item.auspicious_number)
        : null,
      p_status: "draft",
    });

    if (rpcErr) {
      errors.push(\`Failed to save \${rashiName}: \${rpcErr.message}\`);
    } else {
      savedCount++;
    }
  }

  revalidatePath("/astrology");
  revalidatePath("/astrology/daily-insights");

  const success = errors.length === 0;
  return {
    success,
    savedCount,
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    message: success
      ? \`Successfully saved \${savedCount} Rashi drafts.\`
      : \`Saved \${savedCount} drafts with \${errors.length} errors.\`,
  };
}

// =============================================================================
// 4. VALIDATE & PUBLISH DAILY SET (VIA AUTHORITATIVE RPC)
// Inspects all 12 Rashis for date/language, verifies completeness, publishes.
// =============================================================================
export async function validateDailySetReadiness(params: {
  date: string;
  language?: string;
}): Promise<PublishSetValidationResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const date = params.date;
  const language = params.language || "en";

  const { data } = await supabase
    .from("daily_rashi_insights")
    .select("rashi_id, general_outlook, status")
    .eq("insight_date", date)
    .eq("language", language);

  const existingMap = new Map<number, { general_outlook: string; status: string }>();
  (data || []).forEach((row: any) => {
    existingMap.set(row.rashi_id, {
      general_outlook: row.general_outlook || "",
      status: row.status,
    });
  });

  const missingRashis: MissingRashiDetail[] = [];
  let readyCount = 0;

  CANONICAL_RASHIS.forEach((rashi) => {
    const entry = existingMap.get(rashi.id);
    if (!entry) {
      missingRashis.push({
        rashi_id: rashi.id,
        vedicName: rashi.vedicName,
        englishName: rashi.englishName,
        reason: "missing_record",
      });
    } else if (!entry.general_outlook || entry.general_outlook.trim().length === 0) {
      missingRashis.push({
        rashi_id: rashi.id,
        vedicName: rashi.vedicName,
        englishName: rashi.englishName,
        reason: "missing_general_outlook",
      });
    } else {
      readyCount++;
    }
  });

  return {
    isReadyForPublish: missingRashis.length === 0,
    totalRashis: 12,
    readyCount,
    missingCount: missingRashis.length,
    missingRashis,
  };
}

export async function publishDailyRashiInsightsSet(params: {
  date: string;
  language?: string;
  publishReadyOnly?: boolean;
}): Promise<PublishSetResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const date = params.date;
  const language = params.language || "en";

  // Validate readiness first
  const validation = await validateDailySetReadiness({ date, language });

  if (!validation.isReadyForPublish && !params.publishReadyOnly) {
    const missingNames = validation.missingRashis.map((m) => m.vedicName).join(", ");
    return {
      success: false,
      publishedCount: 0,
      errors: [
        \`Cannot publish complete daily set. \${validation.missingCount} of 12 Rashis are missing required General Outlook: \${missingNames}\`,
      ],
      message: \`Incomplete daily set. \${validation.readyCount}/12 Rashis ready.\`,
    };
  }

  // Query records to publish
  const { data: existingRows } = await supabase
    .from("daily_rashi_insights")
    .select("*")
    .eq("insight_date", date)
    .eq("language", language);

  let publishedCount = 0;
  const errors: string[] = [];

  for (const row of existingRows || []) {
    if (!row.general_outlook || !row.general_outlook.trim()) {
      continue;
    }

    const rashiMeta = CANONICAL_RASHIS.find((r) => r.id === row.rashi_id);
    const rashiName = rashiMeta ? rashiMeta.vedicName : (row.rashi_name || \`Rashi-\${row.rashi_id}\`);

    const { error: rpcErr } = await supabase.rpc("admin_save_daily_rashi_insight", {
      p_insight_date: row.insight_date,
      p_rashi_id: row.rashi_id,
      p_rashi_name: rashiName,
      p_language: row.language,
      p_general_outlook: row.general_outlook,
      p_career_business: row.career_business || null,
      p_finance_wealth: row.finance_wealth || null,
      p_love_relationships: row.love_relationships || null,
      p_health_wellbeing: row.health_wellbeing || null,
      p_auspicious_color: row.auspicious_color || null,
      p_auspicious_number: row.auspicious_number != null ? Number(row.auspicious_number) : null,
      p_status: "published",
    });

    if (rpcErr) {
      errors.push(\`Failed to publish \${rashiName}: \${rpcErr.message}\`);
    } else {
      publishedCount++;
    }
  }

  revalidatePath("/astrology");
  revalidatePath("/astrology/daily-insights");

  if (errors.length > 0 && publishedCount === 0) {
    return {
      success: false,
      publishedCount: 0,
      errors,
      message: "Failed to publish daily set.",
    };
  }

  return {
    success: true,
    publishedCount,
    message: \`Successfully published \${publishedCount} Rashis for \${date} (\${language.toUpperCase()}).\`,
  };
}
`;

fs.writeFileSync(path.join(adminDir, 'lib/actions/daily-insights-management.ts'), actionsContent, 'utf8');
console.log('Saved updated lib/actions/daily-insights-management.ts');

// 2. Update migration 045_daily_vedic_astrology_insights.sql to ensure both table-level GRANT ALL for admin RLS and RPC EXECUTE grants are present
const migrationPath = path.join(mobileDir, 'supabase/migrations/045_daily_vedic_astrology_insights.sql');
let migrationContent = fs.readFileSync(migrationPath, 'utf8');

migrationContent = migrationContent.replace(
  /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.daily_rashi_insights FROM authenticated, anon;\s*GRANT SELECT ON TABLE public\.daily_rashi_insights TO authenticated, anon;/,
  `-- 8. Grants and Permissions (Admin RLS policy daily_rashi_insights_all_admin governs table operations)
GRANT ALL ON TABLE public.daily_rashi_insights TO authenticated;
GRANT SELECT ON TABLE public.daily_rashi_insights TO anon;`
);

fs.writeFileSync(migrationPath, migrationContent, 'utf8');
console.log('Saved updated supabase/migrations/045_daily_vedic_astrology_insights.sql');
console.log('PERMISSION FIX COMPLETED!');
