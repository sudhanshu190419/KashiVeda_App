const fs = require('fs');
const path = require('path');

const adminRoot = 'C:/Projects/kashi-veda-admin';

// =============================================================================
// 1. lib/types/daily-insights-management.ts
// =============================================================================
const typesPath = path.join(adminRoot, 'lib/types/daily-insights-management.ts');
let typesCode = fs.readFileSync(typesPath, 'utf8');

// Add version to DailyRashiInsightAdminItem
if (!typesCode.includes('version?: number;')) {
  typesCode = typesCode.replace(
    '  status: DailyInsightStatus;\n  published_at?: string | null;',
    '  status: DailyInsightStatus;\n  published_at?: string | null;\n  version?: number;'
  );
  if (!typesCode.includes('version?: number;')) {
    typesCode = typesCode.replace(
      '  status: DailyInsightStatus;\r\n  published_at?: string | null;',
      '  status: DailyInsightStatus;\r\n  published_at?: string | null;\r\n  version?: number;'
    );
  }
}

// Add expected_version to DailyRashiInsightFormData
if (!typesCode.includes('expected_version?: number | null;')) {
  typesCode = typesCode.replace(
    '  status: DailyInsightStatus;\n}',
    '  status: DailyInsightStatus;\n  expected_version?: number | null;\n}'
  );
  if (!typesCode.includes('expected_version?: number | null;')) {
    typesCode = typesCode.replace(
      '  status: DailyInsightStatus;\r\n}',
      '  status: DailyInsightStatus;\r\n  expected_version?: number | null;\r\n}'
    );
  }
}

// Add SaveDailyRashiInsightResult
if (!typesCode.includes('SaveDailyRashiInsightResult')) {
  typesCode += `
export interface SaveDailyRashiInsightResult {
  success: boolean;
  data?: any;
  error?: string;
  error_code?: 'VERSION_CONFLICT' | 'RECORD_NOT_FOUND' | string;
  current_version?: number;
  expected_version?: number | null;
}
`;
}

fs.writeFileSync(typesPath, typesCode, 'utf8');

// =============================================================================
// 2. lib/actions/daily-insights-management.ts
// =============================================================================
const actionsPath = path.join(adminRoot, 'lib/actions/daily-insights-management.ts');
let actionsCode = fs.readFileSync(actionsPath, 'utf8');

// In getDailyRashiInsightsMatrix, map version:
if (!actionsCode.includes('version: row.version != null ? Number(row.version) : 1,')) {
  actionsCode = actionsCode.replace(
    '    published_at: row.published_at,\n    created_by: row.created_by,',
    '    published_at: row.published_at,\n    created_by: row.created_by,\n    version: row.version != null ? Number(row.version) : 1,'
  );
  if (!actionsCode.includes('version: row.version != null ? Number(row.version) : 1,')) {
    actionsCode = actionsCode.replace(
      '    published_at: row.published_at,\r\n    created_by: row.created_by,',
      '    published_at: row.published_at,\r\n    created_by: row.created_by,\r\n    version: row.version != null ? Number(row.version) : 1,'
    );
  }
}

// In saveDailyRashiInsight, update RPC parameters & return value handling
actionsCode = actionsCode.replace(
  'export async function saveDailyRashiInsight(\n  formData: DailyRashiInsightFormData\n): Promise<{ success: boolean; data?: any; error?: string }> {',
  'export async function saveDailyRashiInsight(\n  formData: DailyRashiInsightFormData\n): Promise<{\n  success: boolean;\n  data?: any;\n  error?: string;\n  error_code?: string;\n  current_version?: number;\n  expected_version?: number | null;\n}> {'
);
if (!actionsCode.includes('expected_version?: number | null;')) {
  actionsCode = actionsCode.replace(
    'export async function saveDailyRashiInsight(\r\n  formData: DailyRashiInsightFormData\r\n): Promise<{ success: boolean; data?: any; error?: string }> {',
    'export async function saveDailyRashiInsight(\r\n  formData: DailyRashiInsightFormData\r\n): Promise<{\r\n  success: boolean;\r\n  data?: any;\r\n  error?: string;\r\n  error_code?: string;\r\n  current_version?: number;\r\n  expected_version?: number | null;\r\n}> {'
  );
}

// Pass p_expected_version in saveDailyRashiInsight
const saveRpcCallTarget = `      p_auspicious_number: formData.auspicious_number && !isNaN(Number(formData.auspicious_number))
        ? Number(formData.auspicious_number)
        : null,
      p_status: formData.status,
    });`;

const saveRpcCallReplacement = `      p_auspicious_number: formData.auspicious_number && !isNaN(Number(formData.auspicious_number))
        ? Number(formData.auspicious_number)
        : null,
      p_status: formData.status,
      p_expected_version: formData.expected_version != null ? Number(formData.expected_version) : null,
    });`;

actionsCode = actionsCode.replace(saveRpcCallTarget, saveRpcCallReplacement);

// Handle rpcData success === false (conflict)
const saveRpcReturnTarget = `    if (rpcError) {
      console.error("RPC admin_save_daily_rashi_insight error:", rpcError);
      return { success: false, error: rpcError.message };
    }

    revalidatePath("/astrology");
    revalidatePath("/astrology/daily-insights");

    return { success: true, data: rpcData };`;

const saveRpcReturnReplacement = `    if (rpcError) {
      console.error("RPC admin_save_daily_rashi_insight error:", rpcError);
      return { success: false, error: rpcError.message };
    }

    if (rpcData && !rpcData.success) {
      return {
        success: false,
        error: rpcData.error,
        error_code: rpcData.error_code,
        current_version: rpcData.current_version,
        expected_version: rpcData.expected_version,
      };
    }

    revalidatePath("/astrology");
    revalidatePath("/astrology/daily-insights");

    return { success: true, data: rpcData };`;

actionsCode = actionsCode.replace(saveRpcReturnTarget, saveRpcReturnReplacement);

// In bulkSaveDailyRashiInsightsDrafts, pass p_expected_version and handle conflict
const bulkRpcTarget = `      p_auspicious_number: item.auspicious_number && !isNaN(Number(item.auspicious_number))
        ? Number(item.auspicious_number)
        : null,
      p_status: "draft",
    });

    if (rpcErr) {
      errors.push(\`Failed to save \${rashiName}: \${rpcErr.message}\`);
    } else {
      savedCount++;
    }`;

const bulkRpcReplacement = `      p_auspicious_number: item.auspicious_number && !isNaN(Number(item.auspicious_number))
        ? Number(item.auspicious_number)
        : null,
      p_status: "draft",
      p_expected_version: item.expected_version != null ? Number(item.expected_version) : null,
    });

    if (rpcErr) {
      errors.push(\`Failed to save \${rashiName}: \${rpcErr.message}\`);
    } else if (rpcData && !rpcData.success) {
      errors.push(\`Failed to save \${rashiName}: \${rpcData.error || 'Version conflict detected'}\`);
    } else {
      savedCount++;
    }`;

actionsCode = actionsCode.replace(
  'const { error: rpcErr } = await supabase.rpc("admin_save_daily_rashi_insight", {',
  'const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_save_daily_rashi_insight", {'
);
actionsCode = actionsCode.replace(bulkRpcTarget, bulkRpcReplacement);

// In publishDailyRashiInsightsSet, pass p_expected_version and handle conflict
const publishRpcTarget = `      p_auspicious_number: row.auspicious_number != null ? Number(row.auspicious_number) : null,
      p_status: "published",
    });

    if (rpcErr) {
      errors.push(\`Failed to publish \${rashiName}: \${rpcErr.message}\`);
    } else {
      publishedCount++;
    }`;

const publishRpcReplacement = `      p_auspicious_number: row.auspicious_number != null ? Number(row.auspicious_number) : null,
      p_status: "published",
      p_expected_version: row.version != null ? Number(row.version) : null,
    });

    if (rpcErr) {
      errors.push(\`Failed to publish \${rashiName}: \${rpcErr.message}\`);
    } else if (rpcData && !rpcData.success) {
      errors.push(\`Failed to publish \${rashiName}: \${rpcData.error || 'Version conflict detected'}\`);
    } else {
      publishedCount++;
    }`;

actionsCode = actionsCode.replace(
  'const { error: rpcErr } = await supabase.rpc("admin_save_daily_rashi_insight", {',
  'const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_save_daily_rashi_insight", {'
);
actionsCode = actionsCode.replace(publishRpcTarget, publishRpcReplacement);

fs.writeFileSync(actionsPath, actionsCode, 'utf8');

// =============================================================================
// 3. components/admin/astrology/daily-insights/daily-insight-field-modal.tsx
// =============================================================================
const fieldModalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insight-field-modal.tsx');
let fieldModalCode = fs.readFileSync(fieldModalPath, 'utf8');

// Include expected_version in payload
const fieldPayloadTarget = `      const payload: DailyRashiInsightFormData = {
        id: existingInsight?.id,
        insight_date: date,`;

const fieldPayloadReplacement = `      const payload: DailyRashiInsightFormData = {
        id: existingInsight?.id,
        expected_version: existingInsight?.version != null ? existingInsight.version : null,
        insight_date: date,`;

fieldModalCode = fieldModalCode.replace(fieldPayloadTarget, fieldPayloadReplacement);

// Handle VERSION_CONFLICT in response
const fieldResTarget = `      const res = await saveDailyRashiInsight(payload);
      if (!res.success) {
        setError(res.error || "Failed to save field draft.");
        setIsSubmitting(false);
        return;
      }`;

const fieldResReplacement = `      const res = await saveDailyRashiInsight(payload);
      if (!res.success) {
        if (res.error_code === "VERSION_CONFLICT") {
          setError(
            \`Conflict: This insight was modified by another editor (version \${res.current_version || "newer"} vs your snapshot version \${existingInsight?.version || "1"}). Your typed changes are preserved above. Please copy your text, close this modal, reload the matrix, and apply your changes to the latest version.\`
          );
        } else {
          setError(res.error || "Failed to save field draft.");
        }
        setIsSubmitting(false);
        return;
      }`;

fieldModalCode = fieldModalCode.replace(fieldResTarget, fieldResReplacement);
fs.writeFileSync(fieldModalPath, fieldModalCode, 'utf8');

// =============================================================================
// 4. components/admin/astrology/daily-insights/daily-insights-form-modal.tsx
// =============================================================================
const formModalPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-form-modal.tsx');
let formModalCode = fs.readFileSync(formModalPath, 'utf8');

// Include expected_version in payload
const formPayloadTarget = `      const res = await saveDailyRashiInsight({
        id: existingInsight?.id,
        insight_date: date,`;

const formPayloadReplacement = `      const res = await saveDailyRashiInsight({
        id: existingInsight?.id,
        expected_version: existingInsight?.version != null ? existingInsight.version : null,
        insight_date: date,`;

formModalCode = formModalCode.replace(formPayloadTarget, formPayloadReplacement);

// Handle VERSION_CONFLICT in response
const formResTarget = `      if (!res.success) {
        setError(res.error || "Failed to save daily insight.");
        setIsSubmitting(false);
        return;
      }`;

const formResReplacement = `      if (!res.success) {
        if (res.error_code === "VERSION_CONFLICT") {
          setError(
            \`Conflict: This insight was modified by another editor (version \${res.current_version || "newer"} vs your snapshot version \${existingInsight?.version || "1"}). Your entered content is preserved below. Please reload the matrix to view the latest content before resubmitting.\`
          );
        } else {
          setError(res.error || "Failed to save daily insight.");
        }
        setIsSubmitting(false);
        return;
      }`;

formModalCode = formModalCode.replace(formResTarget, formResReplacement);
fs.writeFileSync(formModalPath, formModalCode, 'utf8');

// =============================================================================
// 5. components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx
// =============================================================================
const matrixPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx');
let matrixCode = fs.readFileSync(matrixPath, 'utf8');

// In handleBulkSaveDrafts, pass expected_version
const bulkMapTarget = `      .map((slot) => ({
        id: slot.insight?.id,
        insight_date: matrix.date,`;

const bulkMapReplacement = `      .map((slot) => ({
        id: slot.insight?.id,
        expected_version: slot.insight?.version != null ? slot.insight.version : null,
        insight_date: matrix.date,`;

matrixCode = matrixCode.replace(bulkMapTarget, bulkMapReplacement);
fs.writeFileSync(matrixPath, matrixCode, 'utf8');

// =============================================================================
// 6. components/admin/astrology/daily-insights/bulk-import-modal.tsx
// =============================================================================
const bulkImportPath = path.join(adminRoot, 'components/admin/astrology/daily-insights/bulk-import-modal.tsx');
let bulkImportCode = fs.readFileSync(bulkImportPath, 'utf8');

// Pass expected_version in bulk import mapping
const bulkImportTarget = `        return {
          id: existing?.id,
          insight_date: row.insight_date || selectedDate,`;

const bulkImportReplacement = `        return {
          id: existing?.id,
          expected_version: existing?.version != null ? existing.version : null,
          insight_date: row.insight_date || selectedDate,`;

bulkImportCode = bulkImportCode.replace(bulkImportTarget, bulkImportReplacement);
fs.writeFileSync(bulkImportPath, bulkImportCode, 'utf8');

console.log('Successfully applied AST-09 optimistic concurrency updates across Admin code!');
