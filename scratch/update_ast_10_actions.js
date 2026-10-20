const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts');
let content = fs.readFileSync(targetFile, 'utf8');

// Update imports
const oldImport = `  type PublishSetValidationResult,
  type PublishSetResult,
  type MissingRashiDetail,
} from "@/lib/types/daily-insights-management";`;

const newImport = `  type PublishSetValidationResult,
  type PublishSetResult,
  type PublishRowResult,
  type PublishSetOverallStatus,
  type MissingRashiDetail,
} from "@/lib/types/daily-insights-management";`;

if (content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
}

// Find section 4
const section4Start = content.indexOf("// =============================================================================\n// 4. VALIDATE & PUBLISH DAILY SET");

if (section4Start === -1) {
  console.error("Section 4 start not found in daily-insights-management.ts");
  process.exit(1);
}

const newSection4 = `// =============================================================================
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
  const language = (params.language || "en").trim().toLowerCase();

  const { data, error: fetchErr } = await supabase
    .from("daily_rashi_insights")
    .select("rashi_id, general_outlook, status, version")
    .eq("insight_date", date)
    .eq("language", language);

  if (fetchErr) {
    return {
      success: false,
      isReadyForPublish: false,
      totalRashis: 12,
      readyCount: 0,
      missingCount: 0,
      missingRashis: [],
      error: \`Database query failed while validating daily set readiness: \${fetchErr.message}\`,
    };
  }

  const existingMap = new Map<number, { general_outlook: string; status: string; version?: number }>();
  (data || []).forEach((row: any) => {
    existingMap.set(row.rashi_id, {
      general_outlook: row.general_outlook || "",
      status: row.status,
      version: row.version,
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
    success: true,
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
  targetRashiIds?: number[];
}): Promise<PublishSetResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const date = params.date;
  const language = (params.language || "en").trim().toLowerCase();

  // 1. Validate readiness first
  const validation = await validateDailySetReadiness({ date, language });

  if (validation.error) {
    return {
      success: false,
      status: "prerequisite_error",
      date,
      language,
      requestedCount: 0,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [],
      prerequisiteError: validation.error,
      errors: [validation.error],
      message: \`Prerequisite readiness validation error: \${validation.error}\`,
    };
  }

  // If publishing full set (not ready-only, and no specific target IDs) and set is incomplete:
  if (
    !validation.isReadyForPublish &&
    !params.publishReadyOnly &&
    (!params.targetRashiIds || params.targetRashiIds.length === 0)
  ) {
    const missingNames = validation.missingRashis.map((m) => m.vedicName).join(", ");
    const skippedResults: PublishRowResult[] = validation.missingRashis.map((m) => ({
      rashi_id: m.rashi_id,
      rashi_name: m.vedicName,
      vedic_name: m.vedicName,
      insight_date: date,
      language,
      outcome: "skipped",
      status: "not_created",
      skip_reason: m.reason,
      error: \`Missing required content (\${m.reason === "missing_record" ? "not created" : "missing general outlook"})\`,
    }));

    return {
      success: false,
      status: "failure",
      date,
      language,
      requestedCount: 12,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: validation.missingCount,
      results: skippedResults,
      errors: [
        \`Cannot publish complete daily set. \${validation.missingCount} of 12 Rashis are missing required General Outlook: \${missingNames}\`,
      ],
      message: \`Incomplete daily set. \${validation.readyCount}/12 Rashis ready.\`,
    };
  }

  // 2. Query target records to publish
  const { data: existingRows, error: rowsErr } = await supabase
    .from("daily_rashi_insights")
    .select("*")
    .eq("insight_date", date)
    .eq("language", language);

  if (rowsErr) {
    return {
      success: false,
      status: "prerequisite_error",
      date,
      language,
      requestedCount: 0,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [],
      prerequisiteError: rowsErr.message,
      errors: [\`Database query failed while fetching daily insights for publication: \${rowsErr.message}\`],
      message: \`Prerequisite query error: \${rowsErr.message}\`,
    };
  }

  const existingMap = new Map<number, any>();
  (existingRows || []).forEach((row: any) => {
    existingMap.set(row.rashi_id, row);
  });

  // Determine target Rashis
  const targetRashiList =
    params.targetRashiIds && params.targetRashiIds.length > 0
      ? CANONICAL_RASHIS.filter((r) => params.targetRashiIds!.includes(r.id))
      : CANONICAL_RASHIS;

  const results: PublishRowResult[] = [];
  const errors: string[] = [];

  for (const rashi of targetRashiList) {
    const row = existingMap.get(rashi.id);

    // If row doesn't exist or general_outlook is missing
    if (!row || !row.general_outlook || !row.general_outlook.trim()) {
      const skipReason = !row ? "missing_record" : "missing_general_outlook";
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashi.vedicName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: "skipped",
        status: row ? row.status : "not_created",
        version: row?.version ?? null,
        skip_reason: skipReason,
        error: \`Rashi \${rashi.vedicName} lacks mandatory General Outlook guidance for publication.\`,
      });
      continue;
    }

    const rashiName = rashi.vedicName;

    // Call authoritative RPC with AST-09 expected_version
    const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_save_daily_rashi_insight", {
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
      p_expected_version: row.version != null ? Number(row.version) : null,
    });

    if (rpcErr) {
      const errMsg = \`Failed to publish \${rashiName}: \${rpcErr.message}\`;
      errors.push(errMsg);
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashiName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: "failed",
        status: row.status,
        version: row.version ?? null,
        error: rpcErr.message,
        error_code: "DB_TRANSPORT_ERROR",
      });
    } else if (rpcData && !rpcData.success) {
      const isConflict = rpcData.error_code === "VERSION_CONFLICT";
      const errMsg = \`Failed to publish \${rashiName}: \${rpcData.error || (isConflict ? "Version conflict detected" : "Unknown error")}\`;
      errors.push(errMsg);
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashiName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: isConflict ? "conflict" : "failed",
        status: row.status,
        version: row.version ?? null,
        error: rpcData.error || (isConflict ? "Concurrent edit detected" : "Publication failed"),
        error_code: rpcData.error_code || "RPC_ERROR",
      });
    } else {
      results.push({
        rashi_id: rashi.id,
        rashi_name: rashiName,
        vedic_name: rashi.vedicName,
        insight_date: date,
        language,
        outcome: "published",
        status: "published",
        version: rpcData?.version ?? ((row.version || 1) + 1),
      });
    }
  }

  revalidatePath("/astrology");
  revalidatePath("/astrology/daily-insights");

  // Derive summary counts directly from per-row results
  const publishedCount = results.filter((r) => r.outcome === "published").length;
  const failedCount = results.filter((r) => r.outcome === "failed" || r.outcome === "conflict").length;
  const skippedCount = results.filter((r) => r.outcome === "skipped").length;
  const requestedCount = results.length;

  let status: PublishSetOverallStatus;
  let message: string;

  if (failedCount === 0 && skippedCount === 0 && publishedCount > 0) {
    status = "success";
    message = \`Successfully published all \${publishedCount} Rashis for \${date} (\${language.toUpperCase()}).\`;
  } else if (publishedCount > 0) {
    status = "partial_success";
    message = \`Partially published: \${publishedCount} succeeded, \${failedCount} failed, \${skippedCount} skipped for \${date} (\${language.toUpperCase()}).\`;
  } else if (failedCount > 0) {
    status = "failure";
    message = \`Publication failed: all \${failedCount} attempted Rashis failed to publish.\`;
  } else {
    status = "failure";
    message = \`No Rashis published: all \${skippedCount} requested Rashis were skipped because required content is missing.\`;
  }

  return {
    success: status === "success",
    status,
    date,
    language,
    requestedCount,
    publishedCount,
    failedCount,
    skippedCount,
    results,
    errors: errors.length > 0 ? errors : undefined,
    message,
  };
}
`;

content = content.slice(0, section4Start) + newSection4;
fs.writeFileSync(targetFile, content, 'utf8');
console.log("Successfully updated Section 4 in lib/actions/daily-insights-management.ts for AST-10.");
