// __tests__/daily_astrology_pagination_races.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { useAstrologyContent, UseAstrologyContentOptions, UseAstrologyContentReturn } from "../src/features/astrology/hooks/useAstrologyContent.ts";
import { useAstrologyDeliveries, UseAstrologyDeliveriesOptions, UseAstrologyDeliveriesReturn } from "../src/features/astrology/hooks/useAstrologyDeliveries.ts";
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { AstrologyChannel, AstrologyContent, AstrologyDelivery } from "../src/features/astrology/types/astrology.types.ts";

let mockCurrentAuthUser: { id: string } | null = { id: "cust-1" };

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: mockCurrentAuthUser,
    profile: mockCurrentAuthUser ? { id: mockCurrentAuthUser.id } : null,
    role: "customer",
    isLoading: false,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
    setProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const makeContent = (id: string, title: string, channel: AstrologyChannel = "in_app"): AstrologyContent => ({
  id,
  channel,
  title,
  body: `Planetary guidance for ${title}`,
  publish_at: "2026-10-11T06:00:00.000Z",
  expires_at: "2026-10-12T06:00:00.000Z",
  status: "published",
  created_by: "admin-1",
  created_at: "2026-10-11T00:00:00.000Z",
  updated_at: "2026-10-11T00:00:00.000Z",
});

const makeDelivery = (id: string, contentId: string, channel: AstrologyChannel = "in_app"): AstrologyDelivery => ({
  id,
  subscription_id: "sub-1",
  content_id: contentId,
  channel,
  scheduled_at: "2026-10-11T06:00:00.000Z",
  sent_at: "2026-10-11T06:05:00.000Z",
  status: "sent",
  provider_message_id: `msg-${id}`,
  error_message: null,
});

describe("AST-18: Prevent Duplicate Pagination and Stale Astrology Feed Results", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockCurrentAuthUser = { id: "cust-1" };
  });

  // =========================================================================
  // GROUP A: Duplicate load-more prevention (useAstrologyContent)
  // =========================================================================
  describe("Group A: Duplicate load-more prevention (useAstrologyContent)", () => {
    function ContentHarness({ options, onRender }: { options: UseAstrologyContentOptions; onRender: (val: UseAstrologyContentReturn) => void }) {
      const hook = useAstrologyContent(options);
      onRender(hook);
      return null;
    }

    test("repeated loadMore calls while page 2 is pending trigger service exactly once", async () => {
      let latestHook!: UseAstrologyContentReturn;
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");

      // Page 1 resolves immediately
      getPublishedContentSpy.mockResolvedValueOnce({
        items: [makeContent("c-1", "Insight 1")],
        count: 10,
        hasMore: true,
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ContentHarness options={{ pageSize: 2 }} onRender={(h) => (latestHook = h)} />
        );
      });

      expect(latestHook.content.length).toBe(1);
      expect(latestHook.hasMore).toBe(true);
      expect(getPublishedContentSpy).toHaveBeenCalledTimes(1);
      expect(getPublishedContentSpy).toHaveBeenCalledWith(1, 2, undefined);

      // Setup deferred for page 2
      const page2Deferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => page2Deferred.promise);

      // Fire loadMore 5 times synchronously before resolution
      await act(async () => {
        latestHook.loadMore();
        latestHook.loadMore();
        latestHook.loadMore();
        latestHook.loadMore();
        latestHook.loadMore();
      });

      // Assert that service was invoked ONLY ONCE for page 2
      expect(getPublishedContentSpy).toHaveBeenCalledTimes(2);
      expect(getPublishedContentSpy).toHaveBeenLastCalledWith(2, 2, undefined);

      // Resolve page 2
      await act(async () => {
        page2Deferred.resolve({
          items: [makeContent("c-2", "Insight 2")],
          count: 10,
          hasMore: true,
        });
      });

      // Assert records are appended exactly once
      expect(latestHook.content.map((c) => c.id)).toEqual(["c-1", "c-2"]);
      expect(latestHook.hasMore).toBe(true);

      // Subsequent loadMore requests next logical page (page 3)
      const page3Deferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => page3Deferred.promise);

      await act(async () => {
        latestHook.loadMore();
      });

      expect(getPublishedContentSpy).toHaveBeenCalledTimes(3);
      expect(getPublishedContentSpy).toHaveBeenLastCalledWith(3, 2, undefined);

      await act(async () => {
        page3Deferred.resolve({
          items: [makeContent("c-3", "Insight 3")],
          count: 10,
          hasMore: false,
        });
      });

      expect(latestHook.content.map((c) => c.id)).toEqual(["c-1", "c-2", "c-3"]);
      expect(latestHook.hasMore).toBe(false);

      act(() => {
        renderer.unmount();
      });
    });
  });

  // =========================================================================
  // GROUP B: Failed-page retry (useAstrologyContent)
  // =========================================================================
  describe("Group B: Failed-page retry (useAstrologyContent)", () => {
    function ContentHarness({ options, onRender }: { options: UseAstrologyContentOptions; onRender: (val: UseAstrologyContentReturn) => void }) {
      const hook = useAstrologyContent(options);
      onRender(hook);
      return null;
    }

    test("failed page 2 request preserves page 1, allows retry, and appends without duplicates", async () => {
      let latestHook!: UseAstrologyContentReturn;
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");

      // Page 1 succeeds
      getPublishedContentSpy.mockResolvedValueOnce({
        items: [makeContent("c-1", "Insight 1")],
        count: 5,
        hasMore: true,
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ContentHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
        );
      });

      expect(latestHook.content.length).toBe(1);
      expect(latestHook.hasMore).toBe(true);

      // Page 2 fails
      const page2FailDeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => page2FailDeferred.promise);

      await act(async () => {
        latestHook.loadMore();
      });

      await act(async () => {
        page2FailDeferred.reject(new Error("Network connection dropped."));
      });

      // Page 1 content must remain intact and error is reported
      expect(latestHook.content.map((c) => c.id)).toEqual(["c-1"]);
      expect(latestHook.error).toBe("Network connection dropped.");
      expect(latestHook.hasMore).toBe(true);

      // Retry page 2
      const page2RetryDeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => page2RetryDeferred.promise);

      await act(async () => {
        latestHook.loadMore();
      });

      expect(getPublishedContentSpy).toHaveBeenCalledTimes(3);
      expect(getPublishedContentSpy).toHaveBeenLastCalledWith(2, 1, undefined);

      await act(async () => {
        page2RetryDeferred.resolve({
          items: [makeContent("c-2", "Insight 2")],
          count: 5,
          hasMore: false,
        });
      });

      // Content successfully updated with page 2 and error cleared
      expect(latestHook.content.map((c) => c.id)).toEqual(["c-1", "c-2"]);
      expect(latestHook.error).toBeNull();
      expect(latestHook.hasMore).toBe(false);

      act(() => {
        renderer.unmount();
      });
    });
  });

  // =========================================================================
  // GROUP C: Filter-switch race condition (useAstrologyContent)
  // =========================================================================
  describe("Group C: Filter-switch race condition (useAstrologyContent)", () => {
    function ContentHarness({ options, onRender }: { options: UseAstrologyContentOptions; onRender: (val: UseAstrologyContentReturn) => void }) {
      const hook = useAstrologyContent(options);
      onRender(hook);
      return null;
    }

    test("request for filter A resolving after filter B does not overwrite or contaminate B", async () => {
      let latestHook!: UseAstrologyContentReturn;
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");

      const filterADeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => filterADeferred.promise);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ContentHarness options={{ channel: "in_app" }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Filter A is pending
      expect(getPublishedContentSpy).toHaveBeenCalledWith(1, 10, "in_app");
      expect(latestHook.loading).toBe(true);

      // User switches to Filter B ("whatsapp")
      const filterBDeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => filterBDeferred.promise);

      await act(async () => {
        renderer.update(
          <ContentHarness options={{ channel: "whatsapp" }} onRender={(h) => (latestHook = h)} />
        );
      });

      expect(getPublishedContentSpy).toHaveBeenCalledWith(1, 10, "whatsapp");

      // Filter B resolves first
      await act(async () => {
        filterBDeferred.resolve({
          items: [makeContent("w-1", "WhatsApp 1", "whatsapp")],
          count: 1,
          hasMore: false,
        });
      });

      expect(latestHook.content.map((c) => c.id)).toEqual(["w-1"]);
      expect(latestHook.loading).toBe(false);

      // Now Filter A's older request resolves
      await act(async () => {
        filterADeferred.resolve({
          items: [makeContent("a-1", "In-App 1", "in_app")],
          count: 5,
          hasMore: true,
        });
      });

      // Assert Filter A's data was discarded completely and did NOT contaminate B
      expect(latestHook.content.map((c) => c.id)).toEqual(["w-1"]);
      expect(latestHook.hasMore).toBe(false);
      expect(latestHook.loading).toBe(false);
    });

    test("request for filter A failing after filter B succeeds does not overwrite B with error", async () => {
      let latestHook!: UseAstrologyContentReturn;
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");

      const filterADeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => filterADeferred.promise);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ContentHarness options={{ channel: "in_app" }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Switch to B
      const filterBDeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => filterBDeferred.promise);

      await act(async () => {
        renderer.update(
          <ContentHarness options={{ channel: "whatsapp" }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Filter B resolves
      await act(async () => {
        filterBDeferred.resolve({
          items: [makeContent("w-1", "WhatsApp 1", "whatsapp")],
          count: 1,
          hasMore: false,
        });
      });

      expect(latestHook.error).toBeNull();
      expect(latestHook.content.length).toBe(1);

      // Filter A rejects with an error
      await act(async () => {
        filterADeferred.reject(new Error("Old filter A network failure"));
      });

      // Assert old error is ignored and does NOT taint current state
      expect(latestHook.error).toBeNull();
      expect(latestHook.content.map((c) => c.id)).toEqual(["w-1"]);
    });
  });

  // =========================================================================
  // GROUP D: Pagination-context isolation across filter switches
  // =========================================================================
  describe("Group D: Pagination-context isolation across filter switches", () => {
    function ContentHarness({ options, onRender }: { options: UseAstrologyContentOptions; onRender: (val: UseAstrologyContentReturn) => void }) {
      const hook = useAstrologyContent(options);
      onRender(hook);
      return null;
    }

    test("page 2 of filter A resolving after switch to filter B does not append to B or distort cursor", async () => {
      let latestHook!: UseAstrologyContentReturn;
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");

      // Filter A page 1 resolves
      getPublishedContentSpy.mockResolvedValueOnce({
        items: [makeContent("a-1", "In-App 1", "in_app")],
        count: 5,
        hasMore: true,
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ContentHarness options={{ channel: "in_app", pageSize: 1 }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Trigger loadMore for Filter A (page 2) and leave pending
      const page2ADeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => page2ADeferred.promise);

      await act(async () => {
        latestHook.loadMore();
      });

      // Switch to Filter B ("whatsapp")
      const page1BDeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => page1BDeferred.promise);

      await act(async () => {
        renderer.update(
          <ContentHarness options={{ channel: "whatsapp", pageSize: 1 }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Resolve Filter B page 1
      await act(async () => {
        page1BDeferred.resolve({
          items: [makeContent("b-1", "WhatsApp 1", "whatsapp")],
          count: 5,
          hasMore: true,
        });
      });

      expect(latestHook.content.map((c) => c.id)).toEqual(["b-1"]);

      // Resolve Filter A page 2
      await act(async () => {
        page2ADeferred.resolve({
          items: [makeContent("a-2", "In-App 2", "in_app")],
          count: 5,
          hasMore: true,
        });
      });

      // Assert Filter A page 2 was dropped and did not leak into B
      expect(latestHook.content.map((c) => c.id)).toEqual(["b-1"]);

      // Trigger loadMore on Filter B: must request page 2 of Filter B!
      const page2BDeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => page2BDeferred.promise);

      await act(async () => {
        latestHook.loadMore();
      });

      expect(getPublishedContentSpy).toHaveBeenLastCalledWith(2, 1, "whatsapp");

      await act(async () => {
        page2BDeferred.resolve({
          items: [makeContent("b-2", "WhatsApp 2", "whatsapp")],
          count: 5,
          hasMore: false,
        });
      });

      expect(latestHook.content.map((c) => c.id)).toEqual(["b-1", "b-2"]);
    });
  });

  // =========================================================================
  // GROUP E: Ordering and identity deduplication
  // =========================================================================
  describe("Group E: Ordering and identity deduplication (useAstrologyContent)", () => {
    function ContentHarness({ options, onRender }: { options: UseAstrologyContentOptions; onRender: (val: UseAstrologyContentReturn) => void }) {
      const hook = useAstrologyContent(options);
      onRender(hook);
      return null;
    }

    test("deduplicates repeated record IDs across pages without collapsing distinct records with identical titles", async () => {
      let latestHook!: UseAstrologyContentReturn;
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");

      // Page 1 returns records c-1 and c-2 (c-2 has title "Daily Planetary Guidance")
      getPublishedContentSpy.mockResolvedValueOnce({
        items: [
          makeContent("c-1", "Daily Planetary Guidance"),
          makeContent("c-2", "Daily Planetary Guidance"),
        ],
        count: 5,
        hasMore: true,
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ContentHarness options={{ pageSize: 2 }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Both c-1 and c-2 exist even though titles are identical
      expect(latestHook.content.map((c) => c.id)).toEqual(["c-1", "c-2"]);

      // Page 2 returns c-2 (duplicate overlap from boundary shift) and c-3 (new)
      getPublishedContentSpy.mockResolvedValueOnce({
        items: [
          makeContent("c-2", "Daily Planetary Guidance"),
          makeContent("c-3", "Daily Planetary Guidance"),
        ],
        count: 5,
        hasMore: false,
      });

      await act(async () => {
        latestHook.loadMore();
      });

      // Result must contain c-1, c-2, c-3 in exact deterministic order without repeating c-2
      expect(latestHook.content.map((c) => c.id)).toEqual(["c-1", "c-2", "c-3"]);
      expect(latestHook.hasMore).toBe(false);

      act(() => {
        renderer.unmount();
      });
    });

    test("handles empty final page and halts pagination", async () => {
      let latestHook!: UseAstrologyContentReturn;
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");

      getPublishedContentSpy.mockResolvedValueOnce({
        items: [makeContent("c-1", "Insight 1")],
        count: 1,
        hasMore: true,
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ContentHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Page 2 returns empty list and hasMore = false
      getPublishedContentSpy.mockResolvedValueOnce({
        items: [],
        count: 1,
        hasMore: false,
      });

      await act(async () => {
        latestHook.loadMore();
      });

      expect(latestHook.content.map((c) => c.id)).toEqual(["c-1"]);
      expect(latestHook.hasMore).toBe(false);

      // Further loadMore does not make additional service calls
      await act(async () => {
        latestHook.loadMore();
      });

      expect(getPublishedContentSpy).toHaveBeenCalledTimes(2);

      act(() => {
        renderer.unmount();
      });
    });
  });

  // =========================================================================
  // GROUP F: Lifecycle and refresh invalidation (useAstrologyContent)
  // =========================================================================
  describe("Group F: Lifecycle and refresh invalidation (useAstrologyContent)", () => {
    function ContentHarness({ options, onRender }: { options: UseAstrologyContentOptions; onRender: (val: UseAstrologyContentReturn) => void }) {
      const hook = useAstrologyContent(options);
      onRender(hook);
      return null;
    }

    test("unmount while request is pending does not throw state update warnings", async () => {
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");
      const pendingDeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => pendingDeferred.promise);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <ContentHarness options={{}} onRender={() => {}} />
        );
      });

      // Unmount the component
      act(() => {
        renderer.unmount();
      });

      // Resolve the promise after unmount
      await act(async () => {
        pendingDeferred.resolve({
          items: [makeContent("c-1", "Insight 1")],
          count: 1,
          hasMore: false,
        });
      });

      // Test passes without unhandled rejection or unmounted state warnings
    });

    test("refresh invalidates older outstanding pagination request", async () => {
      let latestHook!: UseAstrologyContentReturn;
      const getPublishedContentSpy = jest.spyOn(astrologyService, "getPublishedContent");

      // Page 1 succeeds
      getPublishedContentSpy.mockResolvedValueOnce({
        items: [makeContent("c-1", "Insight 1")],
        count: 5,
        hasMore: true,
      });

      await act(async () => {
        ReactTestRenderer.create(
          <ContentHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Trigger loadMore (page 2) and leave pending
      const page2Deferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => page2Deferred.promise);

      await act(async () => {
        latestHook.loadMore();
      });

      // User triggers pull-to-refresh
      const refreshDeferred = createDeferred<{ items: AstrologyContent[]; count: number; hasMore: boolean }>();
      getPublishedContentSpy.mockImplementationOnce(() => refreshDeferred.promise);

      await act(async () => {
        latestHook.refresh();
      });

      expect(latestHook.refreshing).toBe(true);

      // Old page 2 resolves
      await act(async () => {
        page2Deferred.resolve({
          items: [makeContent("c-2", "Insight 2")],
          count: 5,
          hasMore: true,
        });
      });

      // Old page 2 data was dropped
      expect(latestHook.content.map((c) => c.id)).toEqual(["c-1"]);

      // Refresh resolves with fresh page 1 data
      await act(async () => {
        refreshDeferred.resolve({
          items: [makeContent("c-fresh", "Fresh Insight 1")],
          count: 5,
          hasMore: true,
        });
      });

      expect(latestHook.content.map((c) => c.id)).toEqual(["c-fresh"]);
      expect(latestHook.refreshing).toBe(false);
    });
  });

  // =========================================================================
  // GROUP G: Delivery journal pagination and race protection (useAstrologyDeliveries)
  // =========================================================================
  describe("Group G: Delivery journal pagination & race protection (useAstrologyDeliveries)", () => {
    function DeliveryHarness({ options, onRender }: { options: UseAstrologyDeliveriesOptions; onRender: (val: UseAstrologyDeliveriesReturn) => void }) {
      const hook = useAstrologyDeliveries(options);
      onRender(hook);
      return null;
    }

    test("duplicate loadMore calls trigger getCustomerDeliveries exactly once", async () => {
      let latestHook!: UseAstrologyDeliveriesReturn;
      const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");

      // Page 1 succeeds
      getDeliveriesSpy.mockResolvedValueOnce({
        deliveries: [makeDelivery("d-1", "c-1")],
        count: 5,
        hasMore: true,
      });

      await act(async () => {
        ReactTestRenderer.create(
          <DeliveryHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
        );
      });

      expect(latestHook.deliveries.length).toBe(1);

      // Page 2 pending
      const page2Deferred = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
      getDeliveriesSpy.mockImplementationOnce(() => page2Deferred.promise);

      // Fire loadMore 4 times
      await act(async () => {
        latestHook.loadMore();
        latestHook.loadMore();
        latestHook.loadMore();
        latestHook.loadMore();
      });

      // Assert only 1 call for page 2
      expect(getDeliveriesSpy).toHaveBeenCalledTimes(2);
      expect(getDeliveriesSpy).toHaveBeenLastCalledWith(2, 1);

      await act(async () => {
        page2Deferred.resolve({
          deliveries: [makeDelivery("d-2", "c-2")],
          count: 5,
          hasMore: false,
        });
      });

      expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-1", "d-2"]);
      expect(latestHook.hasMore).toBe(false);
    });

    test("failed page 2 preserves page 1 deliveries and is retryable", async () => {
      let latestHook!: UseAstrologyDeliveriesReturn;
      const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");

      getDeliveriesSpy.mockResolvedValueOnce({
        deliveries: [makeDelivery("d-1", "c-1")],
        count: 5,
        hasMore: true,
      });

      await act(async () => {
        ReactTestRenderer.create(
          <DeliveryHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Page 2 fails
      const page2FailDeferred = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
      getDeliveriesSpy.mockImplementationOnce(() => page2FailDeferred.promise);

      await act(async () => {
        latestHook.loadMore();
      });

      await act(async () => {
        page2FailDeferred.reject(new Error("Delivery fetch failed"));
      });

      expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-1"]);
      expect(latestHook.error).toBe("Delivery fetch failed");

      // Retry page 2
      const page2SuccessDeferred = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
      getDeliveriesSpy.mockImplementationOnce(() => page2SuccessDeferred.promise);

      await act(async () => {
        latestHook.loadMore();
      });

      expect(getDeliveriesSpy).toHaveBeenCalledTimes(3);
      expect(getDeliveriesSpy).toHaveBeenLastCalledWith(2, 1);

      await act(async () => {
        page2SuccessDeferred.resolve({
          deliveries: [makeDelivery("d-2", "c-2")],
          count: 5,
          hasMore: false,
        });
      });

      expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-1", "d-2"]);
      expect(latestHook.error).toBeNull();
    });

    test("deduplicates overlapping delivery IDs across pages", async () => {
      let latestHook!: UseAstrologyDeliveriesReturn;
      const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");

      getDeliveriesSpy.mockResolvedValueOnce({
        deliveries: [makeDelivery("d-1", "c-1"), makeDelivery("d-2", "c-2")],
        count: 5,
        hasMore: true,
      });

      await act(async () => {
        ReactTestRenderer.create(
          <DeliveryHarness options={{ pageSize: 2 }} onRender={(h) => (latestHook = h)} />
        );
      });

      // Page 2 returns overlapping d-2 and new d-3
      getDeliveriesSpy.mockResolvedValueOnce({
        deliveries: [makeDelivery("d-2", "c-2"), makeDelivery("d-3", "c-3")],
        count: 5,
        hasMore: false,
      });

      await act(async () => {
        latestHook.loadMore();
      });

      expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-1", "d-2", "d-3"]);
      expect(latestHook.hasMore).toBe(false);
    });

    test("unmount while deliveries request is in-flight does not throw state update error", async () => {
      const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");
      const pendingDeferred = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
      getDeliveriesSpy.mockImplementationOnce(() => pendingDeferred.promise);

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <DeliveryHarness options={{}} onRender={() => {}} />
        );
      });

      act(() => {
        renderer.unmount();
      });

      await act(async () => {
        pendingDeferred.resolve({
          deliveries: [makeDelivery("d-1", "c-1")],
          count: 1,
          hasMore: false,
        });
      });
    });

    // =========================================================================
    // GROUP H: Account-context isolation & sign-out protection (useAstrologyDeliveries)
    // =========================================================================
    describe("Group H: Account-context isolation & sign-out protection (useAstrologyDeliveries)", () => {
      test("account switch: Customer A pending request resolving after Customer B succeeds cannot overwrite or contaminate B", async () => {
        let latestHook!: UseAstrologyDeliveriesReturn;
        const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");

        // 1. Authenticate as Customer A
        mockCurrentAuthUser = { id: "cust-A" };
        const customerAPending = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
        getDeliveriesSpy.mockImplementationOnce(() => customerAPending.promise);

        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await act(async () => {
          renderer = ReactTestRenderer.create(
            <DeliveryHarness options={{ pageSize: 5 }} onRender={(h) => (latestHook = h)} />
          );
        });

        // Customer A request is pending
        expect(getDeliveriesSpy).toHaveBeenCalledTimes(1);
        expect(latestHook.loading).toBe(true);
        expect(latestHook.deliveries).toEqual([]);

        // 2 & 3. Switch to Customer B using established auth mock
        mockCurrentAuthUser = { id: "cust-B" };
        const customerBPending = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
        getDeliveriesSpy.mockImplementationOnce(() => customerBPending.promise);

        await act(async () => {
          renderer.update(
            <DeliveryHarness options={{ pageSize: 5 }} onRender={(h) => (latestHook = h)} />
          );
        });

        // Customer B request started under new generation
        expect(getDeliveriesSpy).toHaveBeenCalledTimes(2);

        // 4. Complete Customer B request
        await act(async () => {
          customerBPending.resolve({
            deliveries: [makeDelivery("d-B1", "c-B1")],
            count: 1,
            hasMore: false,
          });
        });

        expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-B1"]);
        expect(latestHook.loading).toBe(false);
        expect(latestHook.error).toBeNull();
        expect(latestHook.hasMore).toBe(false);

        // 5. Resolve Customer A's old request afterward
        await act(async () => {
          customerAPending.resolve({
            deliveries: [makeDelivery("d-A1", "c-A1"), makeDelivery("d-A2", "c-A2")],
            count: 2,
            hasMore: true,
          });
        });

        // 6. Verify Customer A's deliveries cannot appear in B's delivery history
        // and cannot overwrite B's loading, error, or pagination state
        expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-B1"]);
        expect(latestHook.loading).toBe(false);
        expect(latestHook.error).toBeNull();
        expect(latestHook.hasMore).toBe(false);
      });

      test("account switch: Customer A pending request failing after Customer B succeeds cannot overwrite B with error", async () => {
        let latestHook!: UseAstrologyDeliveriesReturn;
        const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");

        // Customer A starts request and remains pending
        mockCurrentAuthUser = { id: "cust-A" };
        const customerAPending = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
        getDeliveriesSpy.mockImplementationOnce(() => customerAPending.promise);

        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await act(async () => {
          renderer = ReactTestRenderer.create(
            <DeliveryHarness options={{ pageSize: 5 }} onRender={(h) => (latestHook = h)} />
          );
        });

        // Switch to Customer B
        mockCurrentAuthUser = { id: "cust-B" };
        getDeliveriesSpy.mockResolvedValueOnce({
          deliveries: [makeDelivery("d-B1", "c-B1")],
          count: 1,
          hasMore: false,
        });

        await act(async () => {
          renderer.update(
            <DeliveryHarness options={{ pageSize: 5 }} onRender={(h) => (latestHook = h)} />
          );
        });

        expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-B1"]);
        expect(latestHook.error).toBeNull();

        // Customer A's request rejects with network failure
        await act(async () => {
          customerAPending.reject(new Error("Customer A network timeout"));
        });

        // Customer B must remain completely intact without error overwrite
        expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-B1"]);
        expect(latestHook.loading).toBe(false);
        expect(latestHook.error).toBeNull();
      });

      test("account switch during pagination: Customer A page 2 resolving after switch to B cannot append to B or distort cursor", async () => {
        let latestHook!: UseAstrologyDeliveriesReturn;
        const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");

        // Customer A loads page 1
        mockCurrentAuthUser = { id: "cust-A" };
        getDeliveriesSpy.mockResolvedValueOnce({
          deliveries: [makeDelivery("d-A1", "c-A1")],
          count: 10,
          hasMore: true,
        });

        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await act(async () => {
          renderer = ReactTestRenderer.create(
            <DeliveryHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
          );
        });

        expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-A1"]);

        // Customer A starts page 2
        const page2CustomerADeferred = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
        getDeliveriesSpy.mockImplementationOnce(() => page2CustomerADeferred.promise);

        await act(async () => {
          latestHook.loadMore();
        });

        expect(getDeliveriesSpy).toHaveBeenCalledTimes(2);

        // Switch to Customer B
        mockCurrentAuthUser = { id: "cust-B" };
        getDeliveriesSpy.mockResolvedValueOnce({
          deliveries: [makeDelivery("d-B1", "c-B1")],
          count: 1,
          hasMore: false,
        });

        await act(async () => {
          renderer.update(
            <DeliveryHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
          );
        });

        expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-B1"]);
        expect(latestHook.hasMore).toBe(false);

        // Customer A's page 2 now resolves
        await act(async () => {
          page2CustomerADeferred.resolve({
            deliveries: [makeDelivery("d-A2", "c-A2")],
            count: 10,
            hasMore: true,
          });
        });

        // Must not append d-A2 to Customer B
        expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-B1"]);
        expect(latestHook.hasMore).toBe(false);
        expect(latestHook.loading).toBe(false);
        expect(latestHook.loadingMore).toBe(false);
      });

      test("sign-out: outstanding user-specific response cannot repopulate cleared delivery state", async () => {
        let latestHook!: UseAstrologyDeliveriesReturn;
        const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");

        // 1. Authenticate as Customer A and mount
        mockCurrentAuthUser = { id: "cust-A" };
        const customerAPending = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
        getDeliveriesSpy.mockImplementationOnce(() => customerAPending.promise);

        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await act(async () => {
          renderer = ReactTestRenderer.create(
            <DeliveryHarness options={{ pageSize: 5 }} onRender={(h) => (latestHook = h)} />
          );
        });

        expect(latestHook.loading).toBe(true);

        // 2. Sign out
        mockCurrentAuthUser = null;
        await act(async () => {
          renderer.update(
            <DeliveryHarness options={{ pageSize: 5 }} onRender={(h) => (latestHook = h)} />
          );
        });

        // State immediately cleared
        expect(latestHook.deliveries).toEqual([]);
        expect(latestHook.loading).toBe(false);
        expect(latestHook.refreshing).toBe(false);
        expect(latestHook.loadingMore).toBe(false);
        expect(latestHook.hasMore).toBe(false);
        expect(latestHook.error).toBeNull();

        // 3. Resolve Customer A's old request afterward
        await act(async () => {
          customerAPending.resolve({
            deliveries: [makeDelivery("d-A1", "c-A1"), makeDelivery("d-A2", "c-A2")],
            count: 2,
            hasMore: false,
          });
        });

        // 4. Verify sign-out does not allow old response to repopulate cleared delivery state
        expect(latestHook.deliveries).toEqual([]);
        expect(latestHook.loading).toBe(false);
        expect(latestHook.error).toBeNull();
        expect(latestHook.hasMore).toBe(false);
      });

      test("sign-out during pagination: Customer A pending page 2 cannot repopulate cleared state after sign-out", async () => {
        let latestHook!: UseAstrologyDeliveriesReturn;
        const getDeliveriesSpy = jest.spyOn(astrologyService, "getCustomerDeliveries");

        // Customer A loads page 1
        mockCurrentAuthUser = { id: "cust-A" };
        getDeliveriesSpy.mockResolvedValueOnce({
          deliveries: [makeDelivery("d-A1", "c-A1")],
          count: 5,
          hasMore: true,
        });

        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await act(async () => {
          renderer = ReactTestRenderer.create(
            <DeliveryHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
          );
        });

        expect(latestHook.deliveries.map((d) => d.id)).toEqual(["d-A1"]);

        // Page 2 in-flight
        const page2Pending = createDeferred<{ deliveries: AstrologyDelivery[]; count: number; hasMore: boolean }>();
        getDeliveriesSpy.mockImplementationOnce(() => page2Pending.promise);

        await act(async () => {
          latestHook.loadMore();
        });

        expect(latestHook.loadingMore).toBe(true);

        // Sign out while page 2 is in-flight
        mockCurrentAuthUser = null;
        await act(async () => {
          renderer.update(
            <DeliveryHarness options={{ pageSize: 1 }} onRender={(h) => (latestHook = h)} />
          );
        });

        expect(latestHook.deliveries).toEqual([]);
        expect(latestHook.loading).toBe(false);
        expect(latestHook.loadingMore).toBe(false);

        // Old page 2 resolves
        await act(async () => {
          page2Pending.resolve({
            deliveries: [makeDelivery("d-A2", "c-A2")],
            count: 5,
            hasMore: false,
          });
        });

        expect(latestHook.deliveries).toEqual([]);
        expect(latestHook.loading).toBe(false);
        expect(latestHook.loadingMore).toBe(false);
        expect(latestHook.error).toBeNull();
      });
    });
  });
});
