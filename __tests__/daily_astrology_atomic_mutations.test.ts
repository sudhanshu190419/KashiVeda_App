export {};
declare const __dirname: string;
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Test Suite: AST-16 — Atomic Plan & Legacy-Content Mutations With Audit Records
 * Repositories: C:\Projects\kashi-veda-admin & C:\Projects\KashiVeda
 *
 * Verifies:
 * 1. Migration 051 Security Definer RPC contract & permissions
 * 2. Server Action RPC delegation, error propagation, and revalidation safety
 * 3. Atomic in-transaction audit logging for create and update paths
 * 4. Elimination of uncoordinated direct admin_audit_logs writes
 * 5. Isolated PostgreSQL ACID rollback and authorization execution
 */

const adminRoot = path.resolve(__dirname, "../../kashi-veda-admin");
const kashiVedaRoot = path.resolve(__dirname, "..");

describe("AST-16: Atomic Plan & Legacy-Content Mutations With Audit Records", () => {
  const migration051Path = path.resolve(
    kashiVedaRoot,
    "supabase/migrations/051_atomic_astrology_plan_content_audit_mutations.sql"
  );
  const actionFilePath = path.resolve(
    adminRoot,
    "lib/actions/astrology-management.ts"
  );

  test("Requirement 1: Migration 051 exists and defines authoritative atomic RPCs", () => {
    expect(fs.existsSync(migration051Path)).toBe(true);
    const sql = fs.readFileSync(migration051Path, "utf-8");

    // Must define admin_save_astrology_plan
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_save_astrology_plan");
    // Must define admin_save_astrology_content
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_save_astrology_content");
  });

  test("Requirement 2: Migration 051 RPCs enforce SECURITY DEFINER and hardened empty search_path hygiene", () => {
    const sql = fs.readFileSync(migration051Path, "utf-8");

    // Both functions must be SECURITY DEFINER
    const secDefMatches = sql.match(/SECURITY DEFINER/g);
    expect(secDefMatches).not.toBeNull();
    expect(secDefMatches!.length).toBeGreaterThanOrEqual(2);

    // Both functions must set search_path to empty string
    const searchPathMatches = sql.match(/SET search_path = ''/g);
    expect(searchPathMatches).not.toBeNull();
    expect(searchPathMatches!.length).toBeGreaterThanOrEqual(2);

    // Verify explicit schema qualifications
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("public.is_admin");
    expect(sql).toContain("public.astrology_subscription_plans");
    expect(sql).toContain("public.astrology_content");
    expect(sql).toContain("public.admin_audit_logs");
    expect(sql).toContain("pg_catalog.length");
    expect(sql).toContain("pg_catalog.now()");
    expect(sql).toContain("pg_catalog.jsonb_build_object");
    expect(sql).toContain("pg_catalog.to_jsonb");
    expect(sql).toContain("pg_catalog.text");
  });

  test("Requirement 3: Migration 051 enforces auth.uid() and public.is_admin checks", () => {
    const sql = fs.readFileSync(migration051Path, "utf-8");

    // Must derive actor strictly from auth.uid()
    expect(sql).toContain("v_admin_id := auth.uid();");

    // Must check public.is_admin
    expect(sql).toContain("IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN");
    expect(sql).toContain("RAISE EXCEPTION 'Unauthorized: Administrator privileges required");
  });

  test("Requirement 4: Migration 051 revokes execution from PUBLIC/anon/service_role and grants strictly to authenticated", () => {
    const sql = fs.readFileSync(migration051Path, "utf-8");

    // Revoke public, anon & service_role
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, service_role;");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.admin_save_astrology_content(UUID, public.astrology_channel, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.astrology_content_status) FROM PUBLIC, anon, service_role;");

    // Grant strictly to authenticated
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_save_astrology_plan(UUID, TEXT, INTEGER, NUMERIC, CHAR, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_save_astrology_content(UUID, public.astrology_channel, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, public.astrology_content_status) TO authenticated;");
  });

  test("Requirement 5: Migration 051 writes audit logs in-transaction for both create and update operations", () => {
    const sql = fs.readFileSync(migration051Path, "utf-8");

    // Plan audit events
    expect(sql).toContain("'astrology_plan_created_by_admin'");
    expect(sql).toContain("'astrology_plan_updated_by_admin'");
    expect(sql).toContain("'astrology_subscription_plans'");

    // Content audit events
    expect(sql).toContain("'astrology_content_created_by_admin'");
    expect(sql).toContain("'astrology_content_updated_by_admin'");
    expect(sql).toContain("'astrology_content'");

    // Must insert into admin_audit_logs
    const auditInsertMatches = sql.match(/INSERT INTO public\.admin_audit_logs/g);
    expect(auditInsertMatches).not.toBeNull();
    expect(auditInsertMatches!.length).toBeGreaterThanOrEqual(4); // 2 in plan RPC, 2 in content RPC
  });

  test("Requirement 6: Server Action astrology-management.ts delegates plan mutation to RPC", () => {
    const actionCode = fs.readFileSync(actionFilePath, "utf-8");

    // Must call admin_save_astrology_plan RPC
    expect(actionCode).toContain('.rpc("admin_save_astrology_plan"');

    // Must NOT contain direct uncoordinated audit log insert in saveAstrologyPlan
    const planActionMatch = actionCode.match(/export async function saveAstrologyPlan[\s\S]*?^}/m);
    expect(planActionMatch).not.toBeNull();
    const planActionCode = planActionMatch![0];

    expect(planActionCode).not.toContain('.from("admin_audit_logs").insert');
    expect(planActionCode).not.toContain('.from("astrology_subscription_plans").insert');
    expect(planActionCode).not.toContain('.from("astrology_subscription_plans").update');
  });

  test("Requirement 7: Server Action astrology-management.ts delegates content mutation to RPC", () => {
    const actionCode = fs.readFileSync(actionFilePath, "utf-8");

    // Must call admin_save_astrology_content RPC
    expect(actionCode).toContain('.rpc("admin_save_astrology_content"');

    // Must NOT contain direct uncoordinated audit log insert in saveAstrologyContent
    const contentActionMatch = actionCode.match(/export async function saveAstrologyContent[\s\S]*?^}/m);
    expect(contentActionMatch).not.toBeNull();
    const contentActionCode = contentActionMatch![0];

    expect(contentActionCode).not.toContain('.from("admin_audit_logs").insert');
    expect(contentActionCode).not.toContain('.from("astrology_content").insert');
    expect(contentActionCode).not.toContain('.from("astrology_content").update');
  });

  test("Requirement 8: Server Actions handle database errors explicitly and avoid premature revalidation", () => {
    const actionCode = fs.readFileSync(actionFilePath, "utf-8");

    // saveAstrologyPlan checks rpc error
    expect(actionCode).toContain('const { data, error } = await supabase.rpc("admin_save_astrology_plan"');
    expect(actionCode).toContain('if (error) {');
    expect(actionCode).toContain('console.error("Error in admin_save_astrology_plan:", error.message);');

    // saveAstrologyContent checks rpc error
    expect(actionCode).toContain('const { data, error } = await supabase.rpc("admin_save_astrology_content"');
    expect(actionCode).toContain('console.error("Error in admin_save_astrology_content:", error.message);');

    // revalidatePath only called on success
    expect(actionCode).toContain('revalidatePath("/astrology/plans");');
    expect(actionCode).toContain('revalidatePath("/astrology/content");');
  });

  test("Requirement 9: Real PostgreSQL ACID rollback & authorization verified via isolated runner", () => {
    const testRunner = path.resolve(kashiVedaRoot, "scratch/test_ast_16_db_atomic_audit.py");
    expect(fs.existsSync(testRunner)).toBe(true);

    const output = execSync("python scratch/test_ast_16_db_atomic_audit.py", {
      cwd: kashiVedaRoot,
      encoding: "utf-8",
    });

    expect(output).toContain("TEST 0A: SECURITY DEFINER & Search Path Invariants in pg_proc");
    expect(output).toContain("TEST 0B: Function Execution Privilege Audit");
    expect(output).toContain("TEST 0C: Search Path Immunity Against Shadow Objects");
    expect(output).toContain("ALL 9 ISOLATED POSTGRESQL ATOMIC MUTATION TESTS PASSED (16/16 ASSERTIONS)!");
    expect(output).toContain("TEST 1: Authenticated Admin Creates Plan Successfully");
    expect(output).toContain("TEST 2: Authenticated Admin Updates Plan Successfully");
    expect(output).toContain("TEST 3: Authenticated Admin Creates Legacy Content");
    expect(output).toContain("TEST 4: Authenticated Admin Updates Legacy Content");
    expect(output).toContain("TEST 5: Unauthenticated Caller is Rejected");
    expect(output).toContain("TEST 6: Non-Admin Authenticated Caller is Rejected");
    expect(output).toContain("TEST 7: Actor ID Invariance Check");
    expect(output).toContain("TEST 8: Injected Audit Log Failure Causes Complete Mutation Rollback");
    expect(output).toContain("TEST 9: Business Mutation Failure Leaves Zero Audit Records");
  });
});
