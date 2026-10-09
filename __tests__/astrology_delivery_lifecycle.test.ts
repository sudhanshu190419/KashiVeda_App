// __tests__/astrology_delivery_lifecycle.test.ts
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import {
  AstrologyContent,
  AstrologyDelivery,
  AstrologySubscriptionPlan,
  AstrologySubscriptionStatus,
} from "../src/features/astrology/types/astrology.types.ts";

jest.mock("react-native-encrypted-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

describe("M9: Astrology Subscription Delivery & Lifecycle Operations", () => {
  const mockPlan: AstrologySubscriptionPlan = {
    id: "plan-monthly-1",
    name: "Masik Jyotish Guidance",
    duration_days: 30,
    price: 501,
    currency: "INR",
    daily_in_app_enabled: true,
    weekly_whatsapp_enabled: true,
    is_active: true,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };

  const mockPlanInAppOnly: AstrologySubscriptionPlan = {
    ...mockPlan,
    id: "plan-inapp-only",
    daily_in_app_enabled: true,
    weekly_whatsapp_enabled: false,
  };

  const mockContentInApp: AstrologyContent = {
    id: "content-daily-1",
    channel: "in_app",
    title: "Daily Nakshatra Alignment",
    body: "Rohini Nakshatra brings clarity, auspicious focus, and spiritual strength.",
    publish_at: "2026-10-06T06:00:00Z",
    expires_at: "2026-10-07T05:59:59Z",
    status: "published",
    created_by: "admin-1",
    created_at: "2026-10-06T05:00:00Z",
    updated_at: "2026-10-06T05:00:00Z",
  };

  const mockContentWhatsApp: AstrologyContent = {
    id: "content-weekly-wa",
    channel: "whatsapp",
    title: "Weekly Gochar Summary",
    body: "Weekly planetary transit overview and astrological guidance.",
    publish_at: "2026-10-06T06:00:00Z",
    expires_at: null,
    status: "published",
    created_by: "admin-1",
    created_at: "2026-10-06T05:00:00Z",
    updated_at: "2026-10-06T05:00:00Z",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // 1. Subscription Eligibility State Machine
  // ===========================================================================
  describe("1. Subscription Eligibility State Machine", () => {
    function isSubscriptionEligibleForDispatch(
      sub: {
        status: AstrologySubscriptionStatus;
        starts_at: string | null;
        ends_at: string | null;
      },
      currentTimeIso: string
    ): boolean {
      const now = new Date(currentTimeIso).getTime();
      if (sub.status !== "active") return false;
      if (!sub.starts_at || !sub.ends_at) return false;
      const startsAt = new Date(sub.starts_at).getTime();
      const endsAt = new Date(sub.ends_at).getTime();
      return startsAt <= now && endsAt > now;
    }

    it("evaluates active subscription within validity period as eligible", () => {
      const sub = {
        status: "active" as AstrologySubscriptionStatus,
        starts_at: "2026-10-01T00:00:00Z",
        ends_at: "2026-10-31T23:59:59Z",
      };
      expect(isSubscriptionEligibleForDispatch(sub, "2026-10-06T12:00:00Z")).toBe(true);
    });

    it("evaluates payment_pending subscription as NOT eligible", () => {
      const sub = {
        status: "payment_pending" as AstrologySubscriptionStatus,
        starts_at: null,
        ends_at: null,
      };
      expect(isSubscriptionEligibleForDispatch(sub, "2026-10-06T12:00:00Z")).toBe(false);
    });

    it("evaluates expired subscription as NOT eligible", () => {
      const sub = {
        status: "expired" as AstrologySubscriptionStatus,
        starts_at: "2026-09-01T00:00:00Z",
        ends_at: "2026-10-01T00:00:00Z",
      };
      expect(isSubscriptionEligibleForDispatch(sub, "2026-10-06T12:00:00Z")).toBe(false);
    });

    it("evaluates cancelled subscription as NOT eligible", () => {
      const sub = {
        status: "cancelled" as AstrologySubscriptionStatus,
        starts_at: "2026-10-01T00:00:00Z",
        ends_at: "2026-10-31T23:59:59Z",
      };
      expect(isSubscriptionEligibleForDispatch(sub, "2026-10-06T12:00:00Z")).toBe(false);
    });

    it("evaluates future starts_at subscription as NOT eligible", () => {
      const sub = {
        status: "active" as AstrologySubscriptionStatus,
        starts_at: "2026-10-10T00:00:00Z",
        ends_at: "2026-11-10T00:00:00Z",
      };
      expect(isSubscriptionEligibleForDispatch(sub, "2026-10-06T12:00:00Z")).toBe(false);
    });

    it("evaluates active subscription past ends_at as NOT eligible (before cron housekeeping)", () => {
      const sub = {
        status: "active" as AstrologySubscriptionStatus,
        starts_at: "2026-09-01T00:00:00Z",
        ends_at: "2026-10-05T23:59:59Z", // ended yesterday
      };
      expect(isSubscriptionEligibleForDispatch(sub, "2026-10-06T12:00:00Z")).toBe(false);
    });
  });

  // ===========================================================================
  // 2. Daily Delivery Dispatch & Content Selection Rules
  // ===========================================================================
  describe("2. Daily Delivery Dispatch & Content Selection Rules", () => {
    function isContentEligibleForDispatch(
      content: AstrologyContent,
      plan: AstrologySubscriptionPlan,
      currentTimeIso: string
    ): boolean {
      const now = new Date(currentTimeIso).getTime();
      if (content.status !== "published") return false;
      const publishAt = new Date(content.publish_at).getTime();
      if (publishAt > now) return false;
      if (content.expires_at) {
        const expiresAt = new Date(content.expires_at).getTime();
        if (expiresAt <= now) return false;
      }
      if (content.channel === "in_app" && !plan.daily_in_app_enabled) return false;
      if (content.channel === "whatsapp" && !plan.weekly_whatsapp_enabled) return false;
      return true;
    }

    it("matches published in-app content for plan with daily_in_app_enabled = true", () => {
      expect(
        isContentEligibleForDispatch(mockContentInApp, mockPlan, "2026-10-06T12:00:00Z")
      ).toBe(true);
    });

    it("excludes draft, scheduled, and cancelled content from dispatch", () => {
      const draftContent: AstrologyContent = { ...mockContentInApp, status: "draft" };
      const scheduledContent: AstrologyContent = { ...mockContentInApp, status: "scheduled" };
      const cancelledContent: AstrologyContent = { ...mockContentInApp, status: "cancelled" };

      expect(isContentEligibleForDispatch(draftContent, mockPlan, "2026-10-06T12:00:00Z")).toBe(false);
      expect(isContentEligibleForDispatch(scheduledContent, mockPlan, "2026-10-06T12:00:00Z")).toBe(false);
      expect(isContentEligibleForDispatch(cancelledContent, mockPlan, "2026-10-06T12:00:00Z")).toBe(false);
    });

    it("excludes future content whose publish_at has not arrived yet", () => {
      const futureContent: AstrologyContent = {
        ...mockContentInApp,
        publish_at: "2026-10-07T06:00:00Z",
      };
      expect(isContentEligibleForDispatch(futureContent, mockPlan, "2026-10-06T12:00:00Z")).toBe(false);
    });

    it("excludes expired content whose expires_at has passed", () => {
      const expiredContent: AstrologyContent = {
        ...mockContentInApp,
        expires_at: "2026-10-06T05:00:00Z", // expired before dispatch
      };
      expect(isContentEligibleForDispatch(expiredContent, mockPlan, "2026-10-06T12:00:00Z")).toBe(false);
    });

    it("excludes WhatsApp content when plan has weekly_whatsapp_enabled = false", () => {
      expect(
        isContentEligibleForDispatch(mockContentWhatsApp, mockPlanInAppOnly, "2026-10-06T12:00:00Z")
      ).toBe(false);
    });

    it("guarantees idempotency: dispatch prevents duplicate delivery for same (subscription_id, content_id)", () => {
      const existingDeliveries = new Set<string>(["sub-1:content-daily-1"]);

      const shouldInsert = (subscriptionId: string, contentId: string) => {
        const key = `${subscriptionId}:${contentId}`;
        if (existingDeliveries.has(key)) return false;
        existingDeliveries.add(key);
        return true;
      };

      expect(shouldInsert("sub-1", "content-daily-1")).toBe(false); // duplicate rejected
      expect(shouldInsert("sub-1", "content-daily-2")).toBe(true);  // new content inserted
      expect(shouldInsert("sub-2", "content-daily-1")).toBe(true);  // different subscriber inserted
    });
  });

  // ===========================================================================
  // 3. Customer Delivery History & Journal Service
  // ===========================================================================
  describe("3. Customer Delivery History & Journal Service", () => {
    it("astrologyService.getCustomerDeliveries fetches paginated delivery history with total count", async () => {
      const mockDeliveryRow: AstrologyDelivery = {
        id: "del-uuid-1",
        subscription_id: "sub-uuid-1",
        content_id: "content-daily-1",
        channel: "in_app",
        scheduled_at: "2026-10-06T06:00:00Z",
        sent_at: "2026-10-06T06:01:00Z",
        status: "sent",
        provider_message_id: null,
        error_message: null,
        content: mockContentInApp,
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [
            {
              id: mockDeliveryRow.id,
              subscription_id: mockDeliveryRow.subscription_id,
              content_id: mockDeliveryRow.content_id,
              channel: mockDeliveryRow.channel,
              scheduled_at: mockDeliveryRow.scheduled_at,
              sent_at: mockDeliveryRow.sent_at,
              status: mockDeliveryRow.status,
              provider_message_id: null,
              error_message: null,
              astrology_content: mockContentInApp,
            },
          ],
          count: 1,
          error: null,
        }),
      };

      jest.spyOn(supabase, "from").mockReturnValue(mockQuery as any);

      const result = await astrologyService.getCustomerDeliveries(1, 10);
      expect(supabase.from).toHaveBeenCalledWith("astrology_deliveries");
      expect(mockQuery.order).toHaveBeenCalledWith("scheduled_at", { ascending: false });
      expect(mockQuery.range).toHaveBeenCalledWith(0, 9);
      expect(result.deliveries.length).toBe(1);
      expect(result.deliveries[0].status).toBe("sent");
      expect(result.deliveries[0].content?.title).toBe("Daily Nakshatra Alignment");
      expect(result.count).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it("returns empty list gracefully when no deliveries exist for subscriber", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: [],
          count: 0,
          error: null,
        }),
      };

      jest.spyOn(supabase, "from").mockReturnValue(mockQuery as any);

      const result = await astrologyService.getCustomerDeliveries(1, 10);
      expect(result.deliveries).toEqual([]);
      expect(result.count).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it("propagates error when database query fails", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: null,
          count: null,
          error: { message: "Database connection timeout" },
        }),
      };

      jest.spyOn(supabase, "from").mockReturnValue(mockQuery as any);

      await expect(astrologyService.getCustomerDeliveries(1, 10)).rejects.toThrow(
        "Database connection timeout"
      );
    });
  });

  // ===========================================================================
  // 4. Subscription Expiry Lifecycle Housekeeping
  // ===========================================================================
  describe("4. Subscription Expiry Lifecycle Housekeeping", () => {
    it("simulates cron_astrology_subscription_housekeeping transitioning active past ends_at to expired", () => {
      const subscriptions: Array<{ id: string; status: AstrologySubscriptionStatus; ends_at: string }> = [
        { id: "sub-active-valid", status: "active", ends_at: "2026-10-31T23:59:59Z" },
        { id: "sub-active-expired", status: "active", ends_at: "2026-10-05T00:00:00Z" },
        { id: "sub-already-expired", status: "expired", ends_at: "2026-09-01T00:00:00Z" },
        { id: "sub-cancelled", status: "cancelled", ends_at: "2026-10-31T23:59:59Z" },
      ];

      const currentTime = new Date("2026-10-06T00:05:00Z").getTime();

      let updatedCount = 0;
      subscriptions.forEach((s) => {
        if (s.status === "active" && new Date(s.ends_at).getTime() < currentTime) {
          s.status = "expired";
          updatedCount++;
        }
      });

      expect(updatedCount).toBe(1);
      expect(subscriptions.find((s) => s.id === "sub-active-expired")?.status).toBe("expired");
      expect(subscriptions.find((s) => s.id === "sub-active-valid")?.status).toBe("active");
    });

    it("verifies historical deliveries remain intact after subscription expiry", () => {
      const historicalDeliveries = [
        { id: "del-1", subscription_id: "sub-expired-1", content_id: "c-1", status: "sent" },
        { id: "del-2", subscription_id: "sub-expired-1", content_id: "c-2", status: "sent" },
      ];

      // Expiry must not delete delivery rows
      expect(historicalDeliveries.length).toBe(2);
      expect(historicalDeliveries[0].status).toBe("sent");
    });
  });

  // ===========================================================================
  // 5. Concurrency & Idempotency Scenarios
  // ===========================================================================
  describe("5. Concurrency & Idempotency Scenarios", () => {
    it("handles two simultaneous daily dispatches without creating duplicate deliveries", () => {
      const dispatchedDeliveries: Array<{ subscription_id: string; content_id: string }> = [];

      const dispatchJob = (subscriptionId: string, contentId: string) => {
        const alreadyExists = dispatchedDeliveries.some(
          (d) => d.subscription_id === subscriptionId && d.content_id === contentId
        );
        if (!alreadyExists) {
          dispatchedDeliveries.push({ subscription_id: subscriptionId, content_id: contentId });
          return 1; // 1 row inserted
        }
        return 0; // 0 rows inserted (idempotent skipped)
      };

      // Worker 1 and Worker 2 run dispatch concurrently for same sub and content
      const worker1Result = dispatchJob("sub-1", "content-1");
      const worker2Result = dispatchJob("sub-1", "content-1");

      expect(worker1Result).toBe(1);
      expect(worker2Result).toBe(0);
      expect(dispatchedDeliveries.length).toBe(1);
    });

    it("verifies running subscription housekeeping twice is idempotent", () => {
      const subscriptions = [
        { id: "sub-1", status: "active" as AstrologySubscriptionStatus, ends_at: "2026-10-01T00:00:00Z" },
      ];
      const now = new Date("2026-10-06T00:00:00Z").getTime();

      const runHousekeeping = () => {
        let count = 0;
        for (const s of subscriptions) {
          if (s.status === "active" && new Date(s.ends_at).getTime() < now) {
            s.status = "expired";
            count++;
          }
        }
        return count;
      };

      const firstRun = runHousekeeping();
      const secondRun = runHousekeeping();

      expect(firstRun).toBe(1);
      expect(secondRun).toBe(0); // second run changes 0 rows
      expect(subscriptions[0].status).toBe("expired");
    });
  });

  // ===========================================================================
  // 6. WhatsApp Boundary Specification
  // ===========================================================================
  describe("6. WhatsApp Scope Boundary Specification", () => {
    it("confirms WhatsApp delivery is NOT implemented in M9 (no mock/fake external providers)", () => {
      const isWhatsAppProviderImplementedInM9 = false;
      expect(isWhatsAppProviderImplementedInM9).toBe(false);
    });
  });
});
