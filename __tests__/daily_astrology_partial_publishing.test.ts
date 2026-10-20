export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");

/**
 * Test Suite: AST-10 — Daily Astrology Partial-Publish Result Reporting
 * Target: C:\Projects\kashi-veda-admin
 *
 * Verifies:
 * 1. Type contracts in lib/types/daily-insights-management.ts (including no_eligible_rows)
 * 2. Prerequisite query error handling in validateDailySetReadiness and publishDailyRashiInsightsSet
 * 3. Accurate per-row outcome categorization (published, failed, skipped, conflict)
 * 4. Summary counts derivation and reconciliation
 * 5. Partial success honesty (status === 'partial_success', success === false)
 * 6. AST-09 expected-version and VERSION_CONFLICT preservation
 * 7. Exclusion of AST-09 VERSION_CONFLICT from automatic retry
 * 8. Protection against re-publishing already successful rows
 * 9. Dedicated 'no_eligible_rows' status and messaging when all rows are skipped
 * 10. Modal UI result rendering, conflict warning, and retry action targeting only ordinary failures
 */

describe("AST-10: Daily Astrology Partial-Publish Result Reporting", () => {
  const adminTypesPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/lib/types/daily-insights-management.ts"
  );
  const adminActionsPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/lib/actions/daily-insights-management.ts"
  );
  const publishModalPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/components/admin/astrology/daily-insights/publish-daily-set-modal.tsx"
  );
  const matrixViewPath = path.resolve(
    __dirname,
    "../../kashi-veda-admin/components/admin/astrology/daily-insights/daily-insights-matrix-view.tsx"
  );

  let typesContent = "";
  let actionsContent = "";
  let modalContent = "";
  let matrixViewContent = "";

  beforeAll(() => {
    expect(fs.existsSync(adminTypesPath)).toBe(true);
    expect(fs.existsSync(adminActionsPath)).toBe(true);
    expect(fs.existsSync(publishModalPath)).toBe(true);
    expect(fs.existsSync(matrixViewPath)).toBe(true);

    typesContent = fs.readFileSync(adminTypesPath, "utf-8");
    actionsContent = fs.readFileSync(adminActionsPath, "utf-8");
    modalContent = fs.readFileSync(publishModalPath, "utf-8");
    matrixViewContent = fs.readFileSync(matrixViewPath, "utf-8");
  });

  describe("1. Type Contract Verification", () => {
    it("defines PublishRowOutcome and PublishRowResult with comprehensive details", () => {
      expect(typesContent).toContain("export type PublishRowOutcome = 'published' | 'failed' | 'skipped' | 'conflict';");
      expect(typesContent).toContain("export interface PublishRowResult");
      expect(typesContent).toContain("outcome: PublishRowOutcome;");
      expect(typesContent).toContain("error_code?: 'VERSION_CONFLICT'");
      expect(typesContent).toContain("skip_reason?:");
    });

    it("defines PublishSetOverallStatus including no_eligible_rows, partial_success, and prerequisite_error", () => {
      expect(typesContent).toContain(
        "export type PublishSetOverallStatus = 'success' | 'partial_success' | 'failure' | 'no_eligible_rows' | 'prerequisite_error';"
      );
    });

    it("defines PublishSetResult with reconciled summary counts and per-row results list", () => {
      expect(typesContent).toContain("status: PublishSetOverallStatus;");
      expect(typesContent).toContain("requestedCount: number;");
      expect(typesContent).toContain("publishedCount: number;");
      expect(typesContent).toContain("failedCount: number;");
      expect(typesContent).toContain("skippedCount: number;");
      expect(typesContent).toContain("results: PublishRowResult[];");
      expect(typesContent).toContain("prerequisiteError?: string;");
    });

    it("defines error property on PublishSetValidationResult for prerequisite failure reporting", () => {
      expect(typesContent).toContain("export interface PublishSetValidationResult");
      expect(typesContent).toContain("error?: string;");
    });
  });

  describe("2. Server Action Error Handling & Concurrency Invariants", () => {
    it("explicitly handles query fetchErr in validateDailySetReadiness without disguising as missing rows", () => {
      expect(actionsContent).toContain("const { data, error: fetchErr } = await supabase");
      expect(actionsContent).toContain("if (fetchErr) {");
      expect(actionsContent).toContain("error: `Database query failed while validating daily set readiness: ${fetchErr.message}`");
    });

    it("explicitly handles rowsErr in publishDailyRashiInsightsSet as prerequisite_error", () => {
      expect(actionsContent).toContain("const { data: existingRows, error: rowsErr } = await supabase");
      expect(actionsContent).toContain("if (rowsErr) {");
      expect(actionsContent).toContain('status: "prerequisite_error"');
      expect(actionsContent).toContain("prerequisiteError: rowsErr.message");
    });

    it("derives summary counts directly from results array to prevent contradictory counters", () => {
      expect(actionsContent).toContain('const publishedCount = results.filter((r) => r.outcome === "published").length;');
      expect(actionsContent).toContain('const failedCount = results.filter((r) => r.outcome === "failed" || r.outcome === "conflict").length;');
      expect(actionsContent).toContain('const skippedCount = results.filter((r) => r.outcome === "skipped").length;');
      expect(actionsContent).toContain("const requestedCount = results.length;");
    });

    it("strictly sets status === 'partial_success' and success === false when mixed outcomes occur", () => {
      expect(actionsContent).toContain('status = "partial_success";');
      expect(actionsContent).toContain('success: status === "success"');
    });

    it("sets status === 'no_eligible_rows' when all requested rows are skipped due to missing content", () => {
      expect(actionsContent).toContain('status = "no_eligible_rows";');
      expect(actionsContent).toContain("No signs were eligible for publication");
    });

    it("distinguishes failures from skips in message when mixed non-publishing outcomes occur", () => {
      expect(actionsContent).toContain("Publication failed: ${failedCount} attempted signs failed and ${skippedCount} signs were skipped.");
    });

    it("preserves AST-09 optimistic concurrency by passing expected_version and recording VERSION_CONFLICT", () => {
      expect(actionsContent).toContain("p_expected_version: row.version != null ? Number(row.version) : null");
      expect(actionsContent).toContain('rpcData.error_code === "VERSION_CONFLICT"');
      expect(actionsContent).toContain('outcome: isConflict ? "conflict" : "failed"');
    });

    it("never resubmits already published rows during targeted retries", () => {
      expect(actionsContent).toContain('if (params.targetRashiIds && params.targetRashiIds.length > 0 && row && row.status === "published")');
      expect(actionsContent).toContain('outcome: "published"');
    });

    it("supports targeted retry via targetRashiIds parameter", () => {
      expect(actionsContent).toContain("targetRashiIds?: number[];");
      expect(actionsContent).toContain("params.targetRashiIds && params.targetRashiIds.length > 0");
    });
  });

  describe("3. Publish Modal & Matrix View UI Integration", () => {
    it("modal displays Partial Outcome banner when status is partial_success", () => {
      expect(modalContent).toContain('publishResult.status === "partial_success"');
      expect(modalContent).toContain("Partial Outcome:");
      expect(modalContent).toContain("publishResult.publishedCount");
      expect(modalContent).toContain("publishResult.failedCount");
    });

    it("modal displays dedicated No Eligible Signs to Publish banner when status is no_eligible_rows", () => {
      expect(modalContent).toContain('publishResult.status === "no_eligible_rows"');
      expect(modalContent).toContain("No Eligible Signs to Publish");
      expect(modalContent).not.toContain("all attempted signs failed");
    });

    it("modal displays dedicated Version Conflict notice and explains manual review is required", () => {
      expect(modalContent).toContain("conflictCount > 0");
      expect(modalContent).toContain("had version conflicts");
      expect(modalContent).toContain("These signs cannot be automatically retried. Please close this modal, reload the matrix to review the latest content, and publish again.");
    });

    it("modal excludes version conflicts from retryable failures and only retries ordinary failures", () => {
      expect(modalContent).toContain('r.outcome === "failed" && r.error_code !== "VERSION_CONFLICT"');
      expect(modalContent).toContain("retryableFailedRashiIds.length > 0 && onRetryFailed");
      expect(modalContent).toContain("Retry Failed Signs");
      expect(modalContent).toContain("onRetryFailed(retryableFailedRashiIds)");
    });

    it("modal renders per-row badges for published, conflict, failed, and skipped signs", () => {
      expect(modalContent).toContain('item.outcome === "published"');
      expect(modalContent).toContain('item.outcome === "conflict"');
      expect(modalContent).toContain('item.outcome === "failed"');
      expect(modalContent).toContain('item.outcome === "skipped"');
    });

    it("matrix view guards retry callback against conflicted and published signs", () => {
      expect(matrixViewContent).toContain("handleRetryFailedRashis");
      expect(matrixViewContent).toContain("row && row.outcome === 'failed' && row.error_code !== 'VERSION_CONFLICT'");
      expect(matrixViewContent).toContain("!matrixRow || matrixRow.status !== 'published'");
      expect(matrixViewContent).toContain("setPublishResult(compositeResult);");
    });
  });
});
