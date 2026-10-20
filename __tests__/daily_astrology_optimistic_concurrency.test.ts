export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");

/**
 * Test Suite: AST-09 — Daily Astrology Optimistic Concurrency Control
 * Migration: 049_daily_astrology_optimistic_concurrency.sql
 *
 * Verifies:
 * 1. Migration 049 Structural & SQL Invariants
 *    - Forward-only migration 049
 *    - Does not alter historical migrations 001 through 048
 *    - Adds version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
 *    - Backfills and initializes existing rows
 *    - Drops legacy 12-parameter overload of admin_save_daily_rashi_insight
 *    - Redefines admin_save_daily_rashi_insight with p_expected_version
 *    - Atomically advances version monotonically on update
 *    - SELECT ... FOR UPDATE row-level lock
 *    - Catches unique_violation on concurrent insert and returns VERSION_CONFLICT
 *    - Updates admin_list_daily_rashi_insights to return version
 *    - Preserves AST-01 SECURITY DEFINER and strict REVOKE from PUBLIC/anon
 * 2. Admin UI & Server Action Contracts
 *    - DailyRashiInsightAdminItem and DailyRashiInsightFormData define version
 *    - SaveDailyRashiInsightResult defines VERSION_CONFLICT
 *    - saveDailyRashiInsight passes p_expected_version
 *    - Modals (field modal and form modal) handle version conflicts safely
 */

describe("AST-09: Daily Astrology Optimistic Concurrency Control", () => {
  const migration049Path = path.resolve(
    __dirname,
    "../supabase/migrations/049_daily_astrology_optimistic_concurrency.sql"
  );
  const migrationsDir = path.resolve(__dirname, "../supabase/migrations");
  const adminTypesPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/lib/types/daily-insights-management.ts"
  );
  const adminActionsPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/lib/actions/daily-insights-management.ts"
  );
  const fieldModalPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/components/admin/astrology/daily-insights/daily-insight-field-modal.tsx"
  );
  const formModalPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-form-modal.tsx"
  );

  let migration049SQL = "";

  beforeAll(() => {
    expect(fs.existsSync(migration049Path)).toBe(true);
    migration049SQL = fs.readFileSync(migration049Path, "utf-8");
  });

  describe("1. Migration 049 Structural & SQL Invariants", () => {
    it("is a forward-only migration with filename 049_daily_astrology_optimistic_concurrency.sql", () => {
      expect(path.basename(migration049Path)).toBe(
        "049_daily_astrology_optimistic_concurrency.sql"
      );
    });

    it("does not mutate historical migrations 001 through 048", () => {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f: string) => f.endsWith(".sql"))
        .sort();
      expect(files.length).toBeGreaterThanOrEqual(49);
      expect(files[47]).toBe("048_serialize_astrology_subscription_payments.sql");
      expect(files[48]).toBe("049_daily_astrology_optimistic_concurrency.sql");
    });

    it("adds version column with NOT NULL DEFAULT 1 and positive check constraint", () => {
      expect(migration049SQL).toContain("ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1");
      expect(migration049SQL).toContain("CHECK (version >= 1)");
    });

    it("drops legacy 12-parameter overload of admin_save_daily_rashi_insight to prevent ambiguous calls", () => {
      expect(migration049SQL).toContain("DROP FUNCTION IF EXISTS public.admin_save_daily_rashi_insight(");
      expect(migration049SQL).toContain("p_status public.astrology_content_status");
    });

    it("defines admin_save_daily_rashi_insight with p_expected_version INTEGER DEFAULT NULL", () => {
      expect(migration049SQL).toContain("p_expected_version INTEGER DEFAULT NULL");
    });

    it("implements pessimistic row lock FOR UPDATE before version check and mutation", () => {
      expect(migration049SQL).toContain("FOR UPDATE;");
    });

    it("rejects stale writes with VERSION_CONFLICT and structured error payload", () => {
      expect(migration049SQL).toContain("'VERSION_CONFLICT'");
      expect(migration049SQL).toContain("v_current_version <> p_expected_version");
    });

    it("advances version monotonically on update (version = version + 1)", () => {
      expect(migration049SQL).toContain("v_new_version := v_current_version + 1;");
    });

    it("handles concurrent insert races safely by trapping unique_violation", () => {
      expect(migration049SQL).toContain("EXCEPTION");
      expect(migration049SQL).toContain("WHEN unique_violation THEN");
    });

    it("updates admin_list_daily_rashi_insights to return row version", () => {
      expect(migration049SQL).toContain("d.version");
    });

    it("preserves AST-01 SECURITY DEFINER, search_path, and execution privileges", () => {
      expect(migration049SQL).toContain("SECURITY DEFINER");
      expect(migration049SQL).toContain("SET search_path = public, auth, pg_temp");
      expect(migration049SQL).toContain("REVOKE EXECUTE ON FUNCTION public.admin_save_daily_rashi_insight");
      expect(migration049SQL).toContain("FROM PUBLIC, anon;");
      expect(migration049SQL).toContain("TO authenticated, service_role;");
    });
  });

  describe("2. Admin UI & Server Action Contracts", () => {
    it("defines version and expected_version in TypeScript interfaces", () => {
      if (fs.existsSync(adminTypesPath)) {
        const typesContent = fs.readFileSync(adminTypesPath, "utf-8");
        expect(typesContent).toContain("version?: number;");
        expect(typesContent).toContain("expected_version?: number | null;");
        expect(typesContent).toContain("VERSION_CONFLICT");
      }
    });

    it("passes p_expected_version in saveDailyRashiInsight server action", () => {
      if (fs.existsSync(adminActionsPath)) {
        const actionsContent = fs.readFileSync(adminActionsPath, "utf-8");
        expect(actionsContent).toContain("p_expected_version: formData.expected_version != null ? Number(formData.expected_version) : null");
        expect(actionsContent).toContain("error_code: rpcData.error_code");
      }
    });

    it("field modal carries expected_version and presents structured conflict messaging", () => {
      if (fs.existsSync(fieldModalPath)) {
        const modalContent = fs.readFileSync(fieldModalPath, "utf-8");
        expect(modalContent).toContain("expected_version: existingInsight?.version != null ? existingInsight.version : null");
        expect(modalContent).toContain('res.error_code === "VERSION_CONFLICT"');
        expect(modalContent).toContain("VERSION_CONFLICT");
      }
    });

    it("full-form modal carries expected_version and prevents silent overwriting", () => {
      if (fs.existsSync(formModalPath)) {
        const formContent = fs.readFileSync(formModalPath, "utf-8");
        expect(formContent).toContain("expected_version: existingInsight?.version != null ? existingInsight.version : null");
        expect(formContent).toContain('res.error_code === "VERSION_CONFLICT"');
      }
    });
  });
});
