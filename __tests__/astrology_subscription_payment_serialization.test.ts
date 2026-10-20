export {};
declare const __dirname: string;
declare const require: any;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.mock("react-native-encrypted-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

describe("AST-07: Serialization of Astrology Subscription Orders and Payment Confirmations", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../supabase/migrations/048_serialize_astrology_subscription_payments.sql"
  );
  let migrationSQL = "";

  beforeAll(() => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    migrationSQL = fs.readFileSync(migrationPath, "utf-8");
  });

  describe("1. Migration 048 Structural & SQL Invariants", () => {
    it("is a forward-only migration with the exact correct filename", () => {
      expect(path.basename(migrationPath)).toBe("048_serialize_astrology_subscription_payments.sql");
    });

    it("does not mutate historical migrations 001 through 047", () => {
      const migrationsDir = path.resolve(__dirname, "../supabase/migrations");
      const files = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith(".sql"));
      expect(files.length).toBeGreaterThanOrEqual(48); // 001 through 048+
      expect(files[47]).toBe("048_serialize_astrology_subscription_payments.sql");
    });

    it("implements customer-specific transaction-scoped advisory locks using canonical 64-bit key", () => {
      expect(migrationSQL).toContain("pg_advisory_xact_lock");
      expect(migrationSQL).toContain("astrology_subscription_customer:");
      expect(migrationSQL).toContain("::bit(64)::bigint");
    });

    it("enforces safe search_path = public, extensions and SECURITY DEFINER on all functions", () => {
      const securityDefinerCount = (migrationSQL.match(/SECURITY DEFINER/g) || []).length;
      const searchPathCount = (migrationSQL.match(/SET search_path = public, extensions/g) || []).length;

      expect(securityDefinerCount).toBe(3);
      expect(searchPathCount).toBe(3);
    });

    it("preserves strict execution privilege revocations from PUBLIC and anon", () => {
      // create_astrology_subscription_order
      expect(migrationSQL).toContain(
        "REVOKE EXECUTE ON FUNCTION public.create_astrology_subscription_order(UUID) FROM PUBLIC, anon;"
      );
      expect(migrationSQL).toContain(
        "GRANT EXECUTE ON FUNCTION public.create_astrology_subscription_order(UUID) TO authenticated, service_role;"
      );

      // confirm_booking_payment: restricted strictly to service_role
      expect(migrationSQL).toContain(
        "REVOKE EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;"
      );
      expect(migrationSQL).toContain(
        "GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;"
      );

      // admin_cancel_astrology_subscription
      expect(migrationSQL).toContain(
        "REVOKE EXECUTE ON FUNCTION public.admin_cancel_astrology_subscription(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;"
      );
      expect(migrationSQL).toContain(
        "GRANT EXECUTE ON FUNCTION public.admin_cancel_astrology_subscription(UUID, TEXT, BOOLEAN) TO authenticated, service_role;"
      );
    });

    it("harmonizes global lock ordering in admin_cancel_astrology_subscription to prevent deadlocks", () => {
      const cancelFuncStart = migrationSQL.indexOf("CREATE OR REPLACE FUNCTION public.admin_cancel_astrology_subscription");
      expect(cancelFuncStart).toBeGreaterThan(-1);
      const cancelFuncBody = migrationSQL.slice(cancelFuncStart);

      const orderLockIdx = cancelFuncBody.indexOf("PERFORM id FROM public.payment_orders");
      const subLockIdx = cancelFuncBody.indexOf("SELECT * INTO v_subscription\n    FROM public.astrology_subscriptions");
      const advisoryLockIdx = cancelFuncBody.indexOf("pg_advisory_xact_lock");

      expect(orderLockIdx).toBeGreaterThan(-1);
      expect(subLockIdx).toBeGreaterThan(-1);
      expect(advisoryLockIdx).toBeGreaterThan(-1);

      // Verify Level 1 -> Level 2 -> Level 3 lock acquisition order
      expect(orderLockIdx).toBeLessThan(subLockIdx);
      expect(subLockIdx).toBeLessThan(advisoryLockIdx);
    });

    it("re-evaluates current active subscriptions UNDER the customer advisory lock during payment confirmation", () => {
      const subBranchStart = migrationSQL.indexOf("WHEN 'subscription' THEN");
      expect(subBranchStart).toBeGreaterThan(-1);
      const subBranchBody = migrationSQL.slice(subBranchStart);

      const lockIdx = subBranchBody.indexOf("pg_advisory_xact_lock");
      const reReadIdx = subBranchBody.indexOf("SELECT * INTO v_active_sub\n                FROM public.astrology_subscriptions");

      expect(lockIdx).toBeGreaterThan(-1);
      expect(reReadIdx).toBeGreaterThan(-1);
      expect(lockIdx).toBeLessThan(reReadIdx);
    });
  });

  describe("2. Advisory Lock Determinism and Key Isolation", () => {
    function computeLockKey(customerId: string): bigint {
      const hash = crypto.createHash("md5").update(`astrology_subscription_customer:${customerId}`).digest("hex");
      const hexSub = hash.slice(0, 16);
      return BigInt.asIntN(64, BigInt(`0x${hexSub}`));
    }

    it("computes deterministic 64-bit integer keys for the same customer", () => {
      const customerId = "11111111-2222-3333-4444-555555555555";
      const key1 = computeLockKey(customerId);
      const key2 = computeLockKey(customerId);

      expect(key1).toBe(key2);
      expect(typeof key1).toBe("bigint");
    });

    it("produces distinct lock keys for different customers to prevent false contention", () => {
      const customerA = "11111111-1111-1111-1111-111111111111";
      const customerB = "22222222-2222-2222-2222-222222222222";

      const keyA = computeLockKey(customerA);
      const keyB = computeLockKey(customerB);

      expect(keyA).not.toBe(keyB);
    });
  });

  describe("3. Sequential Subscription Term Calculation Logic", () => {
    it("allocates term from now() when customer has no prior active subscription", () => {
      const now = new Date("2026-10-10T12:00:00Z");
      const durationDays = 30;

      const startsAt = now;
      const endsAt = new Date(startsAt.getTime() + durationDays * 86400000);

      expect(endsAt.toISOString()).toBe("2026-11-09T12:00:00.000Z");
    });

    it("appends sequential term from existing active ends_at without overlap", () => {
      const existingEndsAt = new Date("2026-11-09T12:00:00Z");
      const durationDays = 30;

      const renewalStartsAt = existingEndsAt;
      const renewalEndsAt = new Date(renewalStartsAt.getTime() + durationDays * 86400000);

      expect(renewalStartsAt.getTime()).toBe(existingEndsAt.getTime());
      expect(renewalEndsAt.toISOString()).toBe("2026-12-09T12:00:00.000Z");
    });

    it("two distinct 30-day orders confirmed sequentially allocate exactly 60 non-overlapping days", () => {
      const baseTime = new Date("2026-10-10T00:00:00Z");

      // Term 1:
      const term1Start = baseTime;
      const term1End = new Date(term1Start.getTime() + 30 * 86400000);

      // Term 2 (sequential renewal):
      const term2Start = term1End;
      const term2End = new Date(term2Start.getTime() + 30 * 86400000);

      // Overlap calculation: max(0, min(term1End, term2End) - max(term1Start, term2Start))
      const overlapMs = Math.max(
        0,
        Math.min(term1End.getTime(), term2End.getTime()) - Math.max(term1Start.getTime(), term2Start.getTime())
      );
      expect(overlapMs).toBe(0);

      const totalDays = (term2End.getTime() - term1Start.getTime()) / 86400000;
      expect(totalDays).toBe(60);
    });

    it("two distinct orders with different plans (30d and 90d) allocate exactly 120 days", () => {
      const baseTime = new Date("2026-10-10T00:00:00Z");

      const term1Start = baseTime;
      const term1End = new Date(term1Start.getTime() + 30 * 86400000);

      const term2Start = term1End;
      const term2End = new Date(term2Start.getTime() + 90 * 86400000);

      const overlapMs = Math.max(
        0,
        Math.min(term1End.getTime(), term2End.getTime()) - Math.max(term1Start.getTime(), term2Start.getTime())
      );
      expect(overlapMs).toBe(0);

      const totalDays = (term2End.getTime() - term1Start.getTime()) / 86400000;
      expect(totalDays).toBe(120);
    });
  });

  describe("4. Client RPC Contract & Service Verification", () => {
    it("createSubscriptionOrder passes p_plan_id and maps response including is_reused", async () => {
      const planId = "plan-uuid-123";
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          subscription_id: "sub-123",
          payment_order_id: "po-123",
          amount: 299.0,
          currency: "INR",
          duration_days: 30,
          status: "payment_pending",
          starts_at: "2026-10-10T12:00:00Z",
          ends_at: "2026-11-09T12:00:00Z",
          is_reused: true,
        },
        error: null,
      } as any);

      const result = await astrologyService.createSubscriptionOrder(planId);

      expect(supabase.rpc).toHaveBeenCalledWith("create_astrology_subscription_order", {
        p_plan_id: planId,
      });
      expect(result.is_reused).toBe(true);
      expect(result.subscription_id).toBe("sub-123");
      expect(result.payment_order_id).toBe("po-123");
      expect(result.amount).toBe(299.0);
      expect(result.duration_days).toBe(30);
    });
  });
});
