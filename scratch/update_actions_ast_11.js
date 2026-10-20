const fs = require('fs');

const actionsPath = 'C:/Projects/kashi-veda-admin/lib/actions/daily-insights-management.ts';
let content = fs.readFileSync(actionsPath, 'utf8');

// 1. Update imports
const oldImports = `  type BulkDraftSaveResult,
  type PublishSetValidationResult,`;

const newImports = `  type BulkDraftSaveResult,
  type BulkDraftSaveOptions,
  type BulkImportRowResult,
  getDailyInsightCompositeKey,
  type PublishSetValidationResult,`;

if (content.includes(oldImports)) {
  content = content.replace(oldImports, newImports);
  console.log('Updated imports in actions.');
} else {
  console.log('oldImports not found');
}

// 2. Add checkDailyInsightsExistence before bulkSaveDailyRashiInsightsDrafts
const existenceAction = `// =============================================================================
// 2B. CHECK DAILY INSIGHTS EXISTENCE ACROSS COMPOSITE KEYS (AST-11)
// Queries exact (insight_date, rashi_id, language) identities for CSV preview & overwrite verification
// =============================================================================
export async function checkDailyInsightsExistence(
  keys: Array<{ insight_date: string; rashi_id: number; language?: string }>
): Promise<{
  success: boolean;
  records: Record<string, { exists: boolean; version?: number | null; status?: string }>;
  error?: string;
}> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  if (!keys || keys.length === 0) {
    return { success: true, records: {} };
  }

  // Extract unique dates and languages to query
  const dates = Array.from(new Set(keys.map((k) => (k.insight_date || "").trim()).filter(Boolean)));
  const languages = Array.from(
    new Set(keys.map((k) => (k.language || "en").trim().toLowerCase()).filter(Boolean))
  );

  if (dates.length === 0 || languages.length === 0) {
    return { success: true, records: {} };
  }

  const { data, error } = await supabase
    .from("daily_rashi_insights")
    .select("id, insight_date, rashi_id, language, status, version")
    .in("insight_date", dates)
    .in("language", languages);

  if (error) {
    return {
      success: false,
      records: {},
      error: \`Failed to query existing records: \${error.message}\`,
    };
  }

  const records: Record<string, { exists: boolean; version?: number | null; status?: string }> = {};

  (data || []).forEach((row: any) => {
    const key = getDailyInsightCompositeKey(row.insight_date, row.rashi_id, row.language);
    records[key] = {
      exists: true,
      version: row.version != null ? Number(row.version) : null,
      status: row.status,
    };
  });

  return { success: true, records };
}
`;

// 3. Replace bulkSaveDailyRashiInsightsDrafts
const oldBulkSaveStart = `export async function bulkSaveDailyRashiInsightsDrafts(
  items: DailyRashiInsightFormData[]
): Promise<BulkDraftSaveResult> {`;

const oldBulkSaveEnd = `  const success = errors.length === 0;
  return {
    success,
    savedCount,
    failedCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    message: success
      ? \`Successfully saved \${savedCount} Rashi drafts.\`
      : \`Saved \${savedCount} drafts with \${errors.length} errors.\`,
  };
}`;

const newBulkSaveFn = `export async function bulkSaveDailyRashiInsightsDrafts(
  items: DailyRashiInsightFormData[],
  options?: BulkDraftSaveOptions
): Promise<BulkDraftSaveResult> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const allowOverwrite = options?.allowOverwrite ?? true;

  if (!items || items.length === 0) {
    return {
      success: true,
      totalSubmitted: 0,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      conflictedCount: 0,
      failedCount: 0,
      savedCount: 0,
      results: [],
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
      totalSubmitted: items.length,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      conflictedCount: 0,
      failedCount: 0,
      savedCount: 0,
      results: [],
      message: "No non-empty entries to save as draft.",
    };
  }

  const results: BulkImportRowResult[] = [];
  const errors: string[] = [];
  const seenKeysInBatch = new Set<string>();

  // Process each draft via authoritative RPC with atomic overwrite guard (AST-11)
  for (const item of validItems) {
    const date = (item.insight_date || "").trim();
    const language = (item.language || "en").trim().toLowerCase();
    const rashiId = Number(item.rashi_id);

    if (isNaN(rashiId) || rashiId < 1 || rashiId > 12) {
      const errMsg = \`Invalid Rashi ID \${item.rashi_id}\`;
      errors.push(errMsg);
      results.push({
        insight_date: date,
        rashi_id: rashiId,
        language,
        outcome: "failed",
        error: errMsg,
        error_code: "INVALID_RASHI_ID",
      });
      continue;
    }

    const rashiMeta = CANONICAL_RASHIS.find((r) => r.id === rashiId);
    const rashiName = rashiMeta ? rashiMeta.vedicName : \`Rashi-\${rashiId}\`;
    const compositeKey = getDailyInsightCompositeKey(date, rashiId, language);

    // Enforce duplicate protection within the submitted batch
    if (seenKeysInBatch.has(compositeKey)) {
      const errMsg = \`Duplicate composite key in submission batch for \${rashiName} on \${date} (\${language.toUpperCase()})\`;
      errors.push(errMsg);
      results.push({
        insight_date: date,
        rashi_id: rashiId,
        rashi_name: rashiName,
        language,
        outcome: "duplicate",
        error: errMsg,
        error_code: "DUPLICATE_IN_BATCH",
      });
      continue;
    }
    seenKeysInBatch.add(compositeKey);

    const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_save_daily_rashi_insight", {
      p_insight_date: date,
      p_rashi_id: rashiId,
      p_rashi_name: rashiName,
      p_language: language,
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
      p_expected_version: item.expected_version != null ? Number(item.expected_version) : null,
      p_allow_overwrite: allowOverwrite,
    });

    if (rpcErr) {
      const errMsg = \`Failed to save \${rashiName} (\${date}, \${language}): \${rpcErr.message}\`;
      errors.push(errMsg);
      results.push({
        insight_date: date,
        rashi_id: rashiId,
        rashi_name: rashiName,
        language,
        outcome: "failed",
        error: rpcErr.message,
        error_code: "DB_TRANSPORT_ERROR",
      });
    } else if (rpcData && !rpcData.success) {
      if (rpcData.skipped === true || rpcData.error_code === "OVERWRITE_DISALLOWED") {
        results.push({
          insight_date: date,
          rashi_id: rashiId,
          rashi_name: rashiName,
          language,
          outcome: "skipped",
          version: rpcData.current_version ?? null,
          skip_reason: "Record already exists and overwrite is disabled.",
          error_code: "OVERWRITE_DISALLOWED",
        });
      } else if (rpcData.error_code === "VERSION_CONFLICT") {
        const errMsg = \`Version conflict for \${rashiName} (\${date}, \${language}): \${rpcData.error || "Concurrent edit detected"}\`;
        errors.push(errMsg);
        results.push({
          insight_date: date,
          rashi_id: rashiId,
          rashi_name: rashiName,
          language,
          outcome: "conflict",
          version: rpcData.current_version ?? null,
          error: rpcData.error || "Concurrent edit detected",
          error_code: "VERSION_CONFLICT",
        });
      } else {
        const errMsg = \`Failed to save \${rashiName} (\${date}, \${language}): \${rpcData.error || "Unknown RPC error"}\`;
        errors.push(errMsg);
        results.push({
          insight_date: date,
          rashi_id: rashiId,
          rashi_name: rashiName,
          language,
          outcome: "failed",
          error: rpcData.error || "RPC save failed",
          error_code: rpcData.error_code || "RPC_ERROR",
        });
      }
    } else {
      const isInsert = rpcData?.action === "daily_rashi_insight_created_by_admin";
      results.push({
        insight_date: date,
        rashi_id: rashiId,
        rashi_name: rashiName,
        language,
        outcome: isInsert ? "inserted" : "updated",
        version: rpcData?.version ?? null,
      });
    }
  }

  revalidatePath("/astrology");
  revalidatePath("/astrology/daily-insights");

  const insertedCount = results.filter((r) => r.outcome === "inserted").length;
  const updatedCount = results.filter((r) => r.outcome === "updated").length;
  const skippedCount = results.filter((r) => r.outcome === "skipped").length;
  const conflictedCount = results.filter((r) => r.outcome === "conflict").length;
  const failedCount = results.filter((r) => r.outcome === "failed" || r.outcome === "duplicate").length;
  const savedCount = insertedCount + updatedCount;
  const totalSubmitted = results.length;
  const success = failedCount === 0 && conflictedCount === 0;

  let message = "";
  if (success) {
    if (skippedCount > 0) {
      message = \`Import complete: \${savedCount} saved (\${insertedCount} new, \${updatedCount} updated), \${skippedCount} existing records skipped (overwrite disabled).\`;
    } else {
      message = \`Successfully saved \${savedCount} drafts (\${insertedCount} new, \${updatedCount} updated).\`;
    }
  } else {
    message = \`Import completed with issues: \${savedCount} saved, \${skippedCount} skipped, \${conflictedCount} conflicts, \${failedCount} errors.\`;
  }

  return {
    success,
    totalSubmitted,
    insertedCount,
    updatedCount,
    skippedCount,
    conflictedCount,
    failedCount,
    savedCount,
    results,
    errors: errors.length > 0 ? errors : undefined,
    message,
  };
}`;

const actionLines = content.split('\n');
const startIdx = actionLines.findIndex(l => l.includes('export async function bulkSaveDailyRashiInsightsDrafts'));
const endIdx = actionLines.findIndex((l, i) => i > startIdx && l.includes('export async function validateDailySetReadiness'));

if (startIdx >= 0 && endIdx > startIdx) {
  // Find where comment for 3. BULK SAVE DAILY INSIGHTS DRAFTS starts
  const commentIdx = actionLines.findIndex((l, i) => i < startIdx && l.includes('3. BULK SAVE DAILY INSIGHTS DRAFTS'));
  const targetStart = commentIdx >= 0 ? commentIdx : startIdx;
  
  const before = actionLines.slice(0, targetStart).join('\n');
  const after = actionLines.slice(endIdx).join('\n');

  content = before + '\n' + existenceAction + '\n' + '// =============================================================================\n// 3. BULK SAVE DAILY INSIGHTS DRAFTS (VIA AUTHORITATIVE RPC WITH OVERWRITE GUARD)\n// =============================================================================\n' + newBulkSaveFn + '\n\n' + after;
  fs.writeFileSync(actionsPath, content, 'utf8');
  console.log('Successfully updated actions file with checkDailyInsightsExistence and new bulkSaveDailyRashiInsightsDrafts.');
} else {
  console.log('Could not find start/end indices in actions file:', startIdx, endIdx);
}
