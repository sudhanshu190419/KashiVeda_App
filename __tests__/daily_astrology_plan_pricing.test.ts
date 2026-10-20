export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Test Suite: AST-17 — Prevent Active Zero-Price Plans That Checkout Cannot Purchase
 * Repositories: C:\Projects\kashi-veda-admin & C:\Projects\KashiVeda
 *
 * Verifies:
 * 1. Price validation contract (zero, negative, NaN, blank, sub-precision rounding, valid fractional, normal positive)
 * 2. Forward-only Migration 052 redefines admin_save_astrology_plan with authoritative price guard (> 0)
 * 3. Preservation of AST-16 invariants (SECURITY DEFINER, empty search_path, auth.uid(), atomic audit logging)
 * 4. Admin Server Action saveAstrologyPlan validation and error messages
 * 5. Admin Plan Form modal and Plans View table visibility and warning badges
 * 6. Customer-facing query filtering (gt("price", 0)) and Mobile Plan Detail screen purchasability guard
 * 7. Isolated PostgreSQL 18.4 database execution and checkout contract enforcement
 */

const adminRoot = path.resolve(__dirname, "../../kashi-veda-admin");
const kashiVedaRoot = path.resolve(__dirname, "..");

describe("AST-17: Prevent Active Zero-Price Plans That Checkout Cannot Purchase", () => {
  const migration052Path = path.resolve(
    kashiVedaRoot,
    "supabase/migrations/052_prevent_zero_price_astrology_plans.sql"
  );
  const actionFilePath = path.resolve(
    adminRoot,
    "lib/actions/astrology-management.ts"
  );
  const planModalPath = path.resolve(
    adminRoot,
    "components/admin/astrology/modals/plan-form-modal.tsx"
  );
  const plansViewPath = path.resolve(
    adminRoot,
    "components/admin/astrology/astrology-plans-view.tsx"
  );
  const mobileServicePath = path.resolve(
    kashiVedaRoot,
    "src/features/astrology/services/astrologyService.ts"
  );
  const mobileDetailScreenPath = path.resolve(
    kashiVedaRoot,
    "src/features/astrology/screens/AstrologyPlanDetailScreen.tsx"
  );

  test("Requirement 1 & 2: Migration 052 exists and enforces positive price contract in database RPC", () => {
    expect(fs.existsSync(migration052Path)).toBe(true);
    const sql = fs.readFileSync(migration052Path, "utf-8");

    // Must redefine admin_save_astrology_plan
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_save_astrology_plan");

    // Must check p_price <= 0 and rounding to scale
    expect(sql).toContain("IF p_price IS NULL OR p_price <= 0 OR pg_catalog.round(p_price, 2) <= 0 THEN");
    expect(sql).toContain("RAISE EXCEPTION 'Price must be greater than zero.';");
  });

  test("Requirement 3: Migration 052 preserves all AST-16 security & audit invariants", () => {
    const sql = fs.readFileSync(migration052Path, "utf-8");

    // SECURITY DEFINER and hardened search_path
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = ''");

    // Trusted actor & authorization
    expect(sql).toContain("v_admin_id := auth.uid();");
    expect(sql).toContain("IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN");

    // Schema qualified object references
    expect(sql).toContain("public.astrology_subscription_plans");
    expect(sql).toContain("public.admin_audit_logs");
    expect(sql).toContain("pg_catalog.now()");
    expect(sql).toContain("pg_catalog.jsonb_build_object");
    expect(sql).toContain("pg_catalog.round");

    // Atomic in-transaction audit logging
    expect(sql).toContain("'astrology_plan_created_by_admin'");
    expect(sql).toContain("'astrology_plan_updated_by_admin'");

    // Least privilege execution grants
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;");
  });

  test("Requirement 4: Admin Server Action saveAstrologyPlan strictly validates price input", () => {
    expect(fs.existsSync(actionFilePath)).toBe(true);
    const code = fs.readFileSync(actionFilePath, "utf-8");

    // Check price validation rules in saveAstrologyPlan
    expect(code).toContain('rawPrice === undefined ||');
    expect(code).toContain('rawPrice === null ||');
    expect(code).toContain('return { success: false, error: "Price is required." };');
    expect(code).toContain('Number.isNaN(numPrice)');
    expect(code).toContain('return { success: false, error: "Price must be a valid number." };');
    expect(code).toContain('if (numPrice <= 0)');
    expect(code).toContain('return { success: false, error: "Price must be greater than zero." };');
    expect(code).toContain('const roundedPrice = Math.round(numPrice * 100) / 100;');
    expect(code).toContain('if (roundedPrice <= 0)');
    expect(code).toContain('return { success: false, error: "Price must be greater than zero at currency precision." };');

    // Passes roundedPrice to RPC
    expect(code).toContain('p_price: roundedPrice,');
  });

  test("Requirement 5: Admin Plan Form modal validates price and restricts input step/min", () => {
    expect(fs.existsSync(planModalPath)).toBe(true);
    const code = fs.readFileSync(planModalPath, "utf-8");

    expect(code).toContain('if (numPrice <= 0)');
    expect(code).toContain('setError("Price must be greater than zero.");');
    expect(code).toContain('if (Math.round(numPrice * 100) / 100 <= 0)');
    expect(code).toContain('setError("Price must be greater than zero at currency precision.");');
    expect(code).toContain('min="0.01"');
    expect(code).toContain('step="0.01"');
  });

  test("Requirement 6: Admin Plans View preserves administrator visibility for legacy plans with warning badge", () => {
    expect(fs.existsSync(plansViewPath)).toBe(true);
    const code = fs.readFileSync(plansViewPath, "utf-8");

    // Table renders price and checks if plan.price <= 0
    expect(code).toContain('plan.price <= 0 &&');
    expect(code).toContain('Unpurchasable (≤ 0)');
  });

  test("Requirement 7: Customer astrologyService.getActivePlans filters out nonpositive price plans", () => {
    expect(fs.existsSync(mobileServicePath)).toBe(true);
    const code = fs.readFileSync(mobileServicePath, "utf-8");

    // Query filters gt("price", 0)
    expect(code).toContain('.eq("is_active", true)');
    expect(code).toContain('.gt("price", 0)');

    // In-memory defensive filter
    expect(code).toContain('typeof plan.price === "number" && plan.price > 0');
  });

  test("Requirement 8: Customer AstrologyPlanDetailScreen prevents purchasing unpurchasable zero-price plans", () => {
    expect(fs.existsSync(mobileDetailScreenPath)).toBe(true);
    const code = fs.readFileSync(mobileDetailScreenPath, "utf-8");

    // isPurchasable calculation
    expect(code).toContain('const isPurchasable = Boolean(');
    expect(code).toContain('plan && plan.is_active && typeof plan.price === "number" && plan.price > 0');

    // handleSubscribeClick guard
    expect(code).toContain('if (!plan || subscribing || !isPurchasable) return;');

    // Notice card & CTA button disabled state
    expect(code).toContain('!isPurchasable && (');
    expect(code).toContain('This astrology subscription plan is currently unavailable for purchase.');
    expect(code).toContain('Plan Currently Unavailable');
    expect(code).toContain('disabled={subscribing || !isPurchasable}');
  });

  test("Requirement 9: Real PostgreSQL 18.4 Isolated Test Runner passes all 10 pricing contract scenarios", () => {
    const testRunner = path.resolve(kashiVedaRoot, "scratch/test_ast_17_db_pricing.py");
    expect(fs.existsSync(testRunner)).toBe(true);

    const output = execSync("python scratch/test_ast_17_db_pricing.py", {
      cwd: kashiVedaRoot,
      encoding: "utf-8",
    });

    expect(output).toContain("TEST 1: Function Configuration & Permissions");
    expect(output).toContain("TEST 2: Price Validation - Price = 0 Rejected");
    expect(output).toContain("TEST 3: Price Validation - Negative Price Rejected");
    expect(output).toContain("TEST 4: Price Validation - Tiny Value (Rounds to 0.00) Rejected");
    expect(output).toContain("TEST 5: Price Validation - Valid Fractional Price (0.50) Accepted");
    expect(output).toContain("TEST 6: Normal Positive Price Created & Audited");
    expect(output).toContain("TEST 7: Updating Plan with Valid Price");
    expect(output).toContain("TEST 8: Updating Plan to Zero Price Fails & Preserves State");
    expect(output).toContain("TEST 9: Legacy Zero-Price Plan Handling (Checkout & Query)");
    expect(output).toContain("TEST 10: Unauthorized & Non-Admin Access Rejection");
    expect(output).toContain("ALL 10 ISOLATED POSTGRESQL PRICING CONTRACT TESTS PASSED!");
  });
});
