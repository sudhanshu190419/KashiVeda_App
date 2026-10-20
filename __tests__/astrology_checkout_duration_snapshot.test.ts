export {};
declare const __dirname: string;
declare const require: any;
const fs = require("fs");
const path = require("path");
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { AstrologyPlanDetailScreen } from "../src/features/astrology/screens/AstrologyPlanDetailScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";

const mockNavigate = jest.fn();
let mockRouteParams: any = { planId: "plan_test_123" };

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("react-native-encrypted-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

describe("AST-P01: Checkout-Time Subscription Duration Snapshot Contract", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../supabase/migrations/053_freeze_astrology_subscription_duration_at_checkout.sql"
  );
  let migrationSQL = "";

  beforeAll(() => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    migrationSQL = fs.readFileSync(migrationPath, "utf-8");
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. Migration 053 Schema & SQL Invariants", () => {
    it("is a forward-only migration named 053_freeze_astrology_subscription_duration_at_checkout.sql", () => {
      expect(path.basename(migrationPath)).toBe("053_freeze_astrology_subscription_duration_at_checkout.sql");
    });

    it("adds duration_days column to payment_orders with a positive check constraint", () => {
      expect(migrationSQL).toContain("ALTER TABLE public.payment_orders");
      expect(migrationSQL).toContain("ADD COLUMN IF NOT EXISTS duration_days INTEGER");
      expect(migrationSQL).toContain("chk_payment_orders_duration_days_positive");
      expect(migrationSQL).toContain("CHECK (duration_days IS NULL OR duration_days > 0)");
    });

    it("safe backfill targets only existing payment_pending subscription orders with exact day spans", () => {
      expect(migrationSQL).toContain("UPDATE public.payment_orders po");
      expect(migrationSQL).toContain("s.status = 'payment_pending'::public.astrology_subscription_status");
      expect(migrationSQL).toContain("po.status IN ('created'::public.payment_order_status, 'pending'::public.payment_order_status)");
      expect(migrationSQL).toContain("po.duration_days IS NULL");
      expect(migrationSQL).toContain("(EXTRACT(epoch FROM (s.ends_at - s.starts_at))::BIGINT % 86400 = 0)");
    });

    it("create_astrology_subscription_order snapshots plan duration_days into payment_orders", () => {
      expect(migrationSQL).toContain("INSERT INTO public.payment_orders (");
      expect(migrationSQL).toContain("duration_days,");
      expect(migrationSQL).toContain("v_plan.duration_days,");
      expect(migrationSQL).toContain("'duration_days', v_plan.duration_days");
    });

    it("pending order reuse returns existing duration_days snapshot without catalog fallback", () => {
      expect(migrationSQL).toContain("SELECT s.id AS subscription_id, po.id AS payment_order_id, po.amount, po.currency, po.duration_days, s.starts_at, s.ends_at");
      expect(migrationSQL).toContain("'duration_days', v_existing_pending.duration_days");
      expect(migrationSQL).not.toContain("COALESCE(v_existing_pending.duration_days, v_plan.duration_days)");
    });

    it("pending order reuse fails closed if snapshot is missing or non-positive", () => {
      expect(migrationSQL).toContain("IF v_existing_pending.duration_days IS NULL OR v_existing_pending.duration_days <= 0 THEN");
      expect(migrationSQL).toContain("RAISE EXCEPTION 'Pending subscription order % has missing or invalid duration snapshot");
    });

    it("confirm_booking_payment computes ends_at strictly from v_order.duration_days", () => {
      const confirmFn = migrationSQL.slice(
        migrationSQL.indexOf("CREATE OR REPLACE FUNCTION public.confirm_booking_payment")
      );
      expect(confirmFn).toContain("v_ends_at := v_starts_at + (v_order.duration_days || ' days')::INTERVAL;");
      expect(confirmFn).not.toContain("v_plan.duration_days");
    });

    it("confirm_booking_payment fails closed if v_order.duration_days is missing or non-positive", () => {
      expect(migrationSQL).toContain("IF v_order.duration_days IS NULL OR v_order.duration_days <= 0 THEN");
      expect(migrationSQL).toContain("RAISE EXCEPTION 'Payment order % has missing or invalid duration_days snapshot");
    });

    it("preserves AST-07 customer advisory lock and AST-16/17 security posture", () => {
      expect(migrationSQL).toContain("pg_advisory_xact_lock");
      expect(migrationSQL).toContain("astrology_subscription_customer:");
      expect(migrationSQL).toContain("REVOKE EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;");
      expect(migrationSQL).toContain("GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC, TEXT, JSONB) TO service_role;");
    });
  });

  describe("2. Client Service and Response Validation", () => {
    it("carries duration_days through service mapping unchanged for a fresh order", async () => {
      const mockRpcResponse = {
        data: {
          subscription_id: "sub_111",
          payment_order_id: "po_222",
          amount: 501,
          currency: "INR",
          duration_days: 30,
          status: "payment_pending",
          starts_at: "2026-10-11T12:00:00Z",
          ends_at: "2026-11-10T12:00:00Z",
          is_reused: false,
        },
        error: null,
      };

      const rpcSpy = jest.spyOn(supabase, "rpc").mockResolvedValueOnce(mockRpcResponse as any);
      const result = await astrologyService.createSubscriptionOrder("plan_123");

      expect(rpcSpy).toHaveBeenCalledWith("create_astrology_subscription_order", {
        p_plan_id: "plan_123",
      });
      expect(result.duration_days).toBe(30);
      expect(result.amount).toBe(501);
      expect(result.currency).toBe("INR");
      expect(result.subscription_id).toBe("sub_111");
      expect(result.is_reused).toBe(false);

      rpcSpy.mockRestore();
    });

    it("carries duration_days through service mapping unchanged for a reused pending order", async () => {
      const mockRpcResponse = {
        data: {
          subscription_id: "sub_reused_1",
          payment_order_id: "po_reused_1",
          amount: 499,
          currency: "INR",
          duration_days: 45,
          status: "payment_pending",
          starts_at: "2026-10-11T12:00:00Z",
          ends_at: "2026-11-25T12:00:00Z",
          is_reused: true,
        },
        error: null,
      };

      jest.spyOn(supabase, "rpc").mockResolvedValueOnce(mockRpcResponse as any);
      const result = await astrologyService.createSubscriptionOrder("plan_123");

      expect(result.is_reused).toBe(true);
      expect(result.duration_days).toBe(45);
      expect(result.amount).toBe(499);
    });

    it("rejects an RPC response with a missing duration_days snapshot", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          subscription_id: "sub_111",
          payment_order_id: "po_222",
          amount: 501,
          currency: "INR",
          status: "payment_pending",
        },
        error: null,
      } as any);

      await expect(astrologyService.createSubscriptionOrder("plan_123")).rejects.toThrow(
        "Invalid subscription order: duration snapshot is missing or non-positive"
      );
    });

    it("rejects an RPC response with a null or zero duration_days snapshot", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          subscription_id: "sub_111",
          payment_order_id: "po_222",
          amount: 501,
          currency: "INR",
          duration_days: 0,
          status: "payment_pending",
        },
        error: null,
      } as any);

      await expect(astrologyService.createSubscriptionOrder("plan_123")).rejects.toThrow(
        "Invalid subscription order: duration snapshot is missing or non-positive"
      );
    });

    it("rejects an RPC response with a negative duration_days snapshot", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          subscription_id: "sub_111",
          payment_order_id: "po_222",
          amount: 501,
          currency: "INR",
          duration_days: -7,
          status: "payment_pending",
        },
        error: null,
      } as any);

      await expect(astrologyService.createSubscriptionOrder("plan_123")).rejects.toThrow(
        "Invalid subscription order: duration snapshot is missing or non-positive"
      );
    });

    it("rejects an RPC response with a non-integer duration_days snapshot", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          subscription_id: "sub_111",
          payment_order_id: "po_222",
          amount: 501,
          currency: "INR",
          duration_days: 30.5,
          status: "payment_pending",
        },
        error: null,
      } as any);

      await expect(astrologyService.createSubscriptionOrder("plan_123")).rejects.toThrow(
        "Invalid subscription order: duration snapshot is missing or non-positive"
      );
    });

    it("rejects an RPC response with missing identifiers or non-positive amount", async () => {
      jest.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          subscription_id: "",
          payment_order_id: "po_222",
          amount: 0,
          currency: "INR",
          duration_days: 30,
        },
        error: null,
      } as any);

      await expect(astrologyService.createSubscriptionOrder("plan_123")).rejects.toThrow(
        "missing subscription or payment order identifier"
      );
    });
  });

  describe("3. Mobile Screen Presentation and Navigation Integrity", () => {
    const mockPlan = {
      id: "plan_test_123",
      name: "30-Day Vedic Astrology",
      duration_days: 7, // Catalog plan was modified to 7 days!
      price: 999,
      currency: "INR",
      daily_in_app_enabled: true,
      weekly_whatsapp_enabled: false,
      is_active: true,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-10T00:00:00Z",
    };

    it("navigates to AstrologyPayment with order's snapshotted duration (30d), ignoring modified plan catalog (7d)", async () => {
      jest.spyOn(astrologyService, "getPlanById").mockResolvedValue(mockPlan);
      // Order was created with 30-day snapshot
      jest.spyOn(astrologyService, "createSubscriptionOrder").mockResolvedValue({
        subscription_id: "sub_order_snap",
        payment_order_id: "po_order_snap",
        amount: 499,
        currency: "INR",
        duration_days: 30, // Authoritative order snapshot!
        status: "payment_pending",
        starts_at: null,
        ends_at: null,
        is_reused: false,
      });

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(React.createElement(AstrologyPlanDetailScreen));
      });

      // Find CTA button and press
      const ButtonComponent = require("../src/shared/components/ui/Button.tsx").Button;
      const buttons = tree.root.findAllByType(ButtonComponent);
      const subscribeBtn = buttons[buttons.length - 1];

      await act(async () => {
        subscribeBtn.props.onPress();
      });

      // Confirm in Rashi modal
      const modalButtons = tree.root.findAllByType(ButtonComponent);
      const confirmBtn =
        modalButtons.find(
          (b: any) =>
            b.props.title?.includes("Continue") ||
            b.props.title?.includes("Confirm") ||
            b.props.title?.includes("Later")
        ) || modalButtons[modalButtons.length - 1];

      await act(async () => {
        confirmBtn.props.onPress();
      });

      expect(mockNavigate).toHaveBeenCalledWith("AstrologyPayment", {
        subscriptionId: "sub_order_snap",
        paymentOrderId: "po_order_snap",
        planId: mockPlan.id,
        planName: mockPlan.name,
        amount: 499,
        currency: "INR",
        durationDays: 30, // Passed exactly 30, NOT mockPlan.duration_days (7)!
      });
    });

    it("fails before navigating if order creation rejects missing duration snapshot", async () => {
      jest.spyOn(astrologyService, "getPlanById").mockResolvedValue(mockPlan);
      jest.spyOn(astrologyService, "createSubscriptionOrder").mockRejectedValue(
        new Error("Invalid subscription order: duration snapshot is missing or non-positive.")
      );

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(React.createElement(AstrologyPlanDetailScreen));
      });

      const ButtonComponent = require("../src/shared/components/ui/Button.tsx").Button;
      const buttons = tree.root.findAllByType(ButtonComponent);
      const subscribeBtn = buttons[buttons.length - 1];

      await act(async () => {
        subscribeBtn.props.onPress();
      });

      const modalButtons = tree.root.findAllByType(ButtonComponent);
      const confirmBtn =
        modalButtons.find(
          (b: any) =>
            b.props.title?.includes("Continue") ||
            b.props.title?.includes("Confirm") ||
            b.props.title?.includes("Later")
        ) || modalButtons[modalButtons.length - 1];

      await act(async () => {
        confirmBtn.props.onPress();
      });

      // Navigation must NEVER occur with invalid terms
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
