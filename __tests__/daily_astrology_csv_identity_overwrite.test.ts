export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");

/**
 * Test Suite: AST-11 — CSV Identity & Overwrite Enforcement
 * Target: C:\Projects\kashi-veda-admin & C:\Projects\KashiVeda
 *
 * Verifies:
 * 1. Composite key helper & type contracts in lib/types/daily-insights-management.ts
 * 2. Authoritative checkDailyInsightsExistence server action
 * 3. bulkSaveDailyRashiInsightsDrafts overwrite guard & result reconciliation
 * 4. Migration 050 p_allow_overwrite RPC definition and ACLs
 * 5. BulkImportModal UI integration with composite keys and target preview
 */

describe("AST-11: CSV Identity & Overwrite Enforcement", () => {
  const adminTypesPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/lib/types/daily-insights-management.ts"
  );
  const adminActionsPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/lib/actions/daily-insights-management.ts"
  );
  const bulkModalPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/components/admin/astrology/daily-insights/bulk-import-modal.tsx"
  );
  const migration050Path = path.resolve(
    __dirname,
    "../supabase/migrations/050_daily_astrology_csv_import_overwrite_guard.sql"
  );

  let typesContent = "";
  let actionsContent = "";
  let modalContent = "";
  let migration050Content = "";

  beforeAll(() => {
    expect(fs.existsSync(adminTypesPath)).toBe(true);
    expect(fs.existsSync(adminActionsPath)).toBe(true);
    expect(fs.existsSync(bulkModalPath)).toBe(true);
    expect(fs.existsSync(migration050Path)).toBe(true);

    typesContent = fs.readFileSync(adminTypesPath, "utf-8");
    actionsContent = fs.readFileSync(adminActionsPath, "utf-8");
    modalContent = fs.readFileSync(bulkModalPath, "utf-8");
    migration050Content = fs.readFileSync(migration050Path, "utf-8");
  });

  describe("1. Type Contract & Canonical Composite Identity", () => {
    it("defines getDailyInsightCompositeKey normalizing date, rashiId, and language", () => {
      expect(typesContent).toContain("export function getDailyInsightCompositeKey");
      expect(typesContent).toContain("const normDate = (date || \"\").trim();");
      expect(typesContent).toContain("const normLang = (language || \"en\").trim().toLowerCase() || \"en\";");
    });

    it("defines BulkImportRowOutcome and BulkImportRowResult with composite identity", () => {
      expect(typesContent).toContain("export type BulkImportRowOutcome =");
      expect(typesContent).toContain("'inserted'");
      expect(typesContent).toContain("'updated'");
      expect(typesContent).toContain("'skipped'");
      expect(typesContent).toContain("'duplicate'");
      expect(typesContent).toContain("'conflict'");
      expect(typesContent).toContain("'failed'");

      expect(typesContent).toContain("export interface BulkImportRowResult");
      expect(typesContent).toContain("insight_date: string;");
      expect(typesContent).toContain("rashi_id: number;");
      expect(typesContent).toContain("language: string;");
      expect(typesContent).toContain("outcome: BulkImportRowOutcome;");
    });

    it("defines BulkDraftSaveResult with reconciled counts and per-row results list", () => {
      expect(typesContent).toContain("export interface BulkDraftSaveResult");
      expect(typesContent).toContain("totalSubmitted: number;");
      expect(typesContent).toContain("insertedCount: number;");
      expect(typesContent).toContain("updatedCount: number;");
      expect(typesContent).toContain("skippedCount: number;");
      expect(typesContent).toContain("conflictedCount: number;");
      expect(typesContent).toContain("failedCount: number;");
      expect(typesContent).toContain("savedCount: number;");
      expect(typesContent).toContain("results: BulkImportRowResult[];");
    });
  });

  describe("2. Server Action Existence Check & Atomic Overwrite Guard", () => {
    it("exports checkDailyInsightsExistence querying composite keys from daily_rashi_insights", () => {
      expect(actionsContent).toContain("export async function checkDailyInsightsExistence");
      expect(actionsContent).toContain('select("id, insight_date, rashi_id, language, status, version")');
      expect(actionsContent).toContain("getDailyInsightCompositeKey(row.insight_date, row.rashi_id, row.language)");
    });

    it("bulkSaveDailyRashiInsightsDrafts accepts allowOverwrite option and checks batch duplicates", () => {
      expect(actionsContent).toContain("export async function bulkSaveDailyRashiInsightsDrafts");
      expect(actionsContent).toContain("options?: BulkDraftSaveOptions");
      expect(actionsContent).toContain("const allowOverwrite = options?.allowOverwrite ?? true;");
      expect(actionsContent).toContain("seenKeysInBatch.has(compositeKey)");
    });

    it("passes p_allow_overwrite to admin_save_daily_rashi_insight RPC and records OVERWRITE_DISALLOWED as skipped", () => {
      expect(actionsContent).toContain("p_allow_overwrite: allowOverwrite");
      expect(actionsContent).toContain('rpcData.error_code === "OVERWRITE_DISALLOWED"');
      expect(actionsContent).toContain('outcome: "skipped"');
      expect(actionsContent).toContain('skip_reason: "Record already exists and overwrite is disabled."');
    });

    it("derives summary counts directly from per-row results", () => {
      expect(actionsContent).toContain('const insertedCount = results.filter((r) => r.outcome === "inserted").length;');
      expect(actionsContent).toContain('const updatedCount = results.filter((r) => r.outcome === "updated").length;');
      expect(actionsContent).toContain('const skippedCount = results.filter((r) => r.outcome === "skipped").length;');
      expect(actionsContent).toContain('const conflictedCount = results.filter((r) => r.outcome === "conflict").length;');
      expect(actionsContent).toContain('const savedCount = insertedCount + updatedCount;');
    });
  });

  describe("3. Migration 050 Database Overwrite Guard Contract", () => {
    it("drops legacy 13-argument overload to prevent ambiguous resolution", () => {
      expect(migration050Content).toContain("DROP FUNCTION IF EXISTS public.admin_save_daily_rashi_insight(");
      expect(migration050Content).toContain("INTEGER, public.astrology_content_status, INTEGER");
    });

    it("adds p_allow_overwrite BOOLEAN DEFAULT TRUE with row-level lock and OVERWRITE_DISALLOWED", () => {
      expect(migration050Content).toContain("p_allow_overwrite BOOLEAN DEFAULT TRUE");
      expect(migration050Content).toContain("FOR UPDATE;");
      expect(migration050Content).toContain("IF NOT p_allow_overwrite THEN");
      expect(migration050Content).toContain("'error_code', 'OVERWRITE_DISALLOWED'");
      expect(migration050Content).toContain("Record already exists for %s (Rashi %s, %s) and overwrite is disabled.");
    });

    it("guards concurrent insert races with unique_violation and respects p_allow_overwrite", () => {
      expect(migration050Content).toContain("WHEN unique_violation THEN");
      expect(migration050Content).toContain("IF NOT p_allow_overwrite THEN");
      expect(migration050Content).toContain("Record was created concurrently for %s (Rashi %s, %s) and overwrite is disabled.");
    });

    it("preserves AST-01 admin check and AST-09 OCC version check", () => {
      expect(migration050Content).toContain("IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN");
      expect(migration050Content).toContain("IF p_expected_version IS NULL OR v_current_version <> p_expected_version THEN");
      expect(migration050Content).toContain("'error_code', 'VERSION_CONFLICT'");
    });

    it("preserves canonical parameter schema and strictly rejects unrelated foreign parameters", () => {
      // Canonical schema parameters from Migrations 045, 047, 049
      expect(migration050Content).toContain("p_insight_date DATE");
      expect(migration050Content).toContain("p_rashi_id SMALLINT");
      expect(migration050Content).toContain("p_rashi_name TEXT");
      expect(migration050Content).toContain("p_language VARCHAR(5)");
      expect(migration050Content).toContain("p_general_outlook TEXT");
      expect(migration050Content).toContain("p_career_business TEXT DEFAULT NULL");
      expect(migration050Content).toContain("p_finance_wealth TEXT DEFAULT NULL");
      expect(migration050Content).toContain("p_love_relationships TEXT DEFAULT NULL");
      expect(migration050Content).toContain("p_health_wellbeing TEXT DEFAULT NULL");
      expect(migration050Content).toContain("p_auspicious_color TEXT DEFAULT NULL");
      expect(migration050Content).toContain("p_auspicious_number INTEGER DEFAULT NULL");
      expect(migration050Content).toContain("p_status public.astrology_content_status DEFAULT 'draft'::public.astrology_content_status");
      expect(migration050Content).toContain("p_expected_version INTEGER DEFAULT NULL");
      expect(migration050Content).toContain("p_allow_overwrite BOOLEAN DEFAULT TRUE");

      // Verify foreign/unrelated parameters do NOT exist in Migration 050
      const foreignFields = [
        "general_prediction",
        "lucky_color_code",
        "lucky_time",
        "mood_of_day",
        "remedy",
        "love_percentage",
        "career_percentage",
        "health_percentage",
      ];
      for (const field of foreignFields) {
        expect(migration050Content).not.toContain(`p_${field}`);
      }
    });

    it("re-raises unique_violation if collision is unrelated to composite key", () => {
      expect(migration050Content).toContain("IF v_existing_id IS NULL THEN");
      expect(migration050Content).toContain("RAISE;");
    });
  });

  describe("4. Bulk Import Modal UI Integration", () => {
    it("uses getDailyInsightCompositeKey for existingMap and seenCompositeKeys", () => {
      expect(modalContent).toContain("const existingMap = new Map<string,");
      expect(modalContent).toContain("getDailyInsightCompositeKey(item.insight_date, item.rashi_id, item.language)");
      expect(modalContent).toContain("const seenCompositeKeys = new Set<string>();");
      expect(modalContent).toContain("seenCompositeKeys.has(compositeKey)");
    });

    it("calls checkDailyInsightsExistence after CSV parse to authoritatively verify database state", () => {
      expect(modalContent).toContain("checkDailyInsightsExistence(keysToCheck)");
      expect(modalContent).toContain("const exists = !!(dbRecord && dbRecord.exists);");
      expect(modalContent).toContain("isExisting: exists,");
      expect(modalContent).toContain("existingVersion: dbRecord ? dbRecord.version : null,");
    });

    it("renders Target column in preview table displaying insight_date and language", () => {
      expect(modalContent).toContain('<th className="p-2.5">Target</th>');
      expect(modalContent).toContain("{row.insight_date}");
      expect(modalContent).toContain("{row.language}");
    });

    it("passes allowOverwrite option to bulkSaveDailyRashiInsightsDrafts", () => {
      expect(modalContent).toContain("bulkSaveDailyRashiInsightsDrafts(items, { allowOverwrite })");
    });
  });
});
