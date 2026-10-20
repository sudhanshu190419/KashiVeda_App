// __tests__/daily_astrology_preference_isolation.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  dailyRashiService,
  LEGACY_PREFERRED_RASHI_STORAGE_KEY,
  USER_PREFERRED_RASHI_PREFIX,
  GUEST_PREFERRED_RASHI_KEY,
} from "../src/features/astrology/services/dailyRashiService.ts";
import {
  useDailyRashiInsight,
  UseDailyRashiInsightResult,
} from "../src/features/astrology/hooks/useDailyRashiInsight.ts";
import {
  mapKundliMoonSignToRashiId,
  getRashiById,
} from "../src/features/astrology/types/rashi.types.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

// Track mock authenticated user dynamically
let mockCurrentAuthUser: { id: string; email?: string } | null = { id: "user-A" };
let mockProfileStore: Record<string, { preferred_rashi_id: number | null }> = {
  "user-A": { preferred_rashi_id: 1 },
  "user-B": { preferred_rashi_id: 5 },
};

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: mockCurrentAuthUser,
    profile: mockCurrentAuthUser
      ? {
          id: mockCurrentAuthUser.id,
          preferred_rashi_id: mockProfileStore[mockCurrentAuthUser.id]?.preferred_rashi_id ?? null,
        }
      : null,
    role: "customer",
    isLoading: false,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
    setProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

const defaultMockRpc = (name: string, params: any) => {
  if (name === "set_customer_preferred_rashi") {
    const activeId = mockCurrentAuthUser?.id;
    if (!activeId) {
      return Promise.reject(new Error("Authentication required to set Rashi preference."));
    }
    if (!mockProfileStore[activeId]) {
      mockProfileStore[activeId] = { preferred_rashi_id: null };
    }
    mockProfileStore[activeId].preferred_rashi_id = params?.p_rashi_id ?? null;
    return Promise.resolve({
      data: { success: true, preferred_rashi_id: params?.p_rashi_id ?? null },
      error: null,
    });
  }

  if (name === "get_daily_rashi_insight") {
    return Promise.resolve({
      data: {
        success: true,
        is_entitled: true,
        content: {
          id: "insight-1",
          insight_date: "2026-10-11",
          rashi_id: params?.p_rashi_id || 1,
          language: "en",
          general_outlook: "Harmonious planetary alignment.",
          lucky_color: "Saffron",
          lucky_number: 7,
          auspicious_time_window: "08:00 AM - 10:00 AM",
          career_business: "Executive negotiation succeeds.",
          finance_wealth: "Gains indicated.",
          love_relationships: "Peaceful family connections.",
          health_wellbeing: "Vitality high.",
          remedy_mantra: "Om Namah Shivaya",
        },
      },
      error: null,
    });
  }

  return Promise.resolve({ data: null, error: null });
};

const defaultMockFrom = (table: string) => {
  if (table === "profiles") {
    return {
      select: jest.fn(() => ({
        eq: jest.fn((_col: string, val: string) => ({
          maybeSingle: jest.fn(() => {
            const record = mockProfileStore[val];
            return Promise.resolve({
              data: record ? { preferred_rashi_id: record.preferred_rashi_id } : null,
              error: null,
            });
          }),
          single: jest.fn(() => {
            const record = mockProfileStore[val];
            return Promise.resolve({
              data: record ? { preferred_rashi_id: record.preferred_rashi_id } : null,
              error: null,
            });
          }),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    };
  }

  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
  };
};

jest.mock("../src/infrastructure/supabase/client.ts", () => {
  const mockAuth = {
    getUser: jest.fn(() =>
      Promise.resolve({
        data: { user: mockCurrentAuthUser },
        error: null,
      })
    ),
    getSession: jest.fn(() =>
      Promise.resolve({
        data: {
          session: mockCurrentAuthUser ? { user: mockCurrentAuthUser } : null,
        },
        error: null,
      })
    ),
  };

  return {
    supabase: {
      auth: mockAuth,
      rpc: jest.fn(defaultMockRpc),
      from: jest.fn(defaultMockFrom),
    },
  };
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AST-19: Prevent Preferred Rashi Leakage & Report Persistence Accurately", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (supabase.rpc as jest.Mock).mockImplementation(defaultMockRpc);
    (supabase.from as jest.Mock).mockImplementation(defaultMockFrom);
    await AsyncStorage.clear();
    dailyRashiService.clearMemoryCache();
    mockCurrentAuthUser = { id: "user-A" };
    mockProfileStore = {
      "user-A": { preferred_rashi_id: 1 },
      "user-B": { preferred_rashi_id: 5 },
    };
  });

  // ===========================================================================
  // GROUP A: Account-specific preference isolation
  // ===========================================================================
  describe("Group A: Account-specific preference isolation", () => {
    test("1-5. Switch from A to B: getPreferredRashi returns B's authoritative profile, keeping caches isolated", async () => {
      // 1. Customer A local scoped preference Rashi 1 (Mesha)
      await AsyncStorage.setItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`, "1");
      // 2. Customer B local scoped preference Rashi 5 (Simha)
      await AsyncStorage.setItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`, "5");

      // Verify A reads A's profile
      const rashiA = await dailyRashiService.getPreferredRashi("user-A");
      expect(rashiA).toBe(1);

      // 3. Switch from A to B on the same installation
      mockCurrentAuthUser = { id: "user-B" };

      // 4. Verify getPreferredRashi returns B's authoritative profile selection (5), not A's cached value (1)
      const rashiB = await dailyRashiService.getPreferredRashi("user-B");
      expect(rashiB).toBe(5);

      // 5. Verify B's local cache remains independent from A's
      const cacheA = await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`);
      const cacheB = await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`);
      expect(cacheA).toBe("1");
      expect(cacheB).toBe("5");
    });

    test("6. Customer A's preference is never used when Customer B has no cached value", async () => {
      // Seed Customer A cache with Rashi 3 (Mithuna)
      await AsyncStorage.setItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`, "3");
      mockProfileStore["user-A"] = { preferred_rashi_id: 3 };

      // Customer B has no local cache; profile has Rashi 9 (Dhanu)
      mockProfileStore["user-B"] = { preferred_rashi_id: 9 };
      mockCurrentAuthUser = { id: "user-B" };

      const rashiB = await dailyRashiService.getPreferredRashi("user-B");
      expect(rashiB).toBe(9);
      expect(rashiB).not.toBe(3);

      // Verify B's scoped cache is populated with 9, leaving A's 3 intact
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`)).toBe("9");
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`)).toBe("3");
    });

    test("7. Profile read returning genuine null preference is handled distinctly from failed profile read", async () => {
      // Customer B previously had cached value 4
      await AsyncStorage.setItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`, "4");
      // Profile now returns authoritative NULL (user reset preference)
      mockProfileStore["user-B"] = { preferred_rashi_id: null };
      mockCurrentAuthUser = { id: "user-B" };

      // Successful read with NULL preference: authoritative NULL clears local cache and returns null
      const nullResult = await dailyRashiService.getPreferredRashi("user-B");
      expect(nullResult).toBeNull();
      // Scoped cache should be cleared so older value 4 never revives
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`)).toBeNull();

      // Now seed cache with 4 again, and simulate profile query FAILURE (network offline)
      await AsyncStorage.setItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`, "4");
      (supabase.from as jest.Mock).mockImplementationOnce(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(() => Promise.reject(new Error("Network connection dropped"))),
          })),
        })),
      }));

      // On read FAILURE, it falls back to this user's OWN scoped cache (4)
      const fallbackResult = await dailyRashiService.getPreferredRashi("user-B");
      expect(fallbackResult).toBe(4);
    });
  });

  // ===========================================================================
  // GROUP B: Legacy global-key handling
  // ===========================================================================
  describe("Group B: Legacy global-key handling", () => {
    test("8-12. Seed legacy global key with Rashi A; B's profile preference overrides it, neutralizing legacy key", async () => {
      // 8. Seed legacy global key with Rashi 2 (Vrishabha)
      await AsyncStorage.setItem(LEGACY_PREFERRED_RASHI_STORAGE_KEY, "2");

      // 9. Customer B logs in with profile preference 8 (Vrischika)
      mockCurrentAuthUser = { id: "user-B" };
      mockProfileStore["user-B"] = { preferred_rashi_id: 8 };

      // 10. Verify legacy value does not override B
      const rashiB = await dailyRashiService.getPreferredRashi("user-B");
      expect(rashiB).toBe(8);

      // 11. Verify legacy value 2 is NOT blindly assigned to B's account-scoped key
      const scopedB = await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`);
      expect(scopedB).toBe("8");
      expect(scopedB).not.toBe("2");

      // 12. Verify legacy key is removed / neutralized
      const legacyKeyVal = await AsyncStorage.getItem(LEGACY_PREFERRED_RASHI_STORAGE_KEY);
      expect(legacyKeyVal).toBeNull();
    });

    test("13. Guest preference remains strictly isolated from authenticated accounts", async () => {
      // 1. Unauthenticated guest selects Rashi 11 (Kumbha)
      mockCurrentAuthUser = null;
      const guestSave = await dailyRashiService.savePreferredRashi(11, null);
      expect(guestSave.status).toBe("guest_saved");
      expect(guestSave.userId).toBeNull();

      // Verify guest key contains 11
      expect(await AsyncStorage.getItem(GUEST_PREFERRED_RASHI_KEY)).toBe("11");

      // 2. Customer A logs in with profile preference 1
      mockCurrentAuthUser = { id: "user-A" };
      mockProfileStore["user-A"] = { preferred_rashi_id: 1 };

      const rashiA = await dailyRashiService.getPreferredRashi("user-A");
      expect(rashiA).toBe(1);
      expect(rashiA).not.toBe(11);

      // Customer A's scoped cache must be 1, guest key must remain 11 without cross-contamination
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`)).toBe("1");
      expect(await AsyncStorage.getItem(GUEST_PREFERRED_RASHI_KEY)).toBe("11");
    });
  });

  // ===========================================================================
  // GROUP C: Account switching and sign-out races
  // ===========================================================================
  describe("Group C: Account switching and sign-out races", () => {
    function HookHarness({ onRender }: { onRender: (hook: UseDailyRashiInsightResult) => void }) {
      const hook = useDailyRashiInsight();
      onRender(hook);
      return null;
    }

    test("14-17. Asynchronous profile read for Customer A resolving after switch to B cannot overwrite B", async () => {
      let latestHook!: UseDailyRashiInsightResult;
      mockCurrentAuthUser = { id: "user-A" };

      // Deferred profile read for Customer A
      const userADeferred = createDeferred<{ data: { preferred_rashi_id: number }; error: any }>();

      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_col: string, val: string) => ({
                maybeSingle: jest.fn(() => {
                  if (val === "user-A") {
                    return userADeferred.promise;
                  }
                  return Promise.resolve({
                    data: { preferred_rashi_id: 6 },
                    error: null,
                  });
                }),
              })),
            })),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(<HookHarness onRender={(h) => (latestHook = h)} />);
      });

      // Switch to Customer B before user-A resolves
      await act(async () => {
        mockCurrentAuthUser = { id: "user-B" };
        mockProfileStore["user-B"] = { preferred_rashi_id: 6 };
        renderer.update(<HookHarness onRender={(h) => (latestHook = h)} />);
      });

      // Customer B resolves to 6 (Kanya)
      expect(latestHook.selectedRashiId).toBe(6);

      // Now Customer A's slow request resolves with 2 (Vrishabha)
      await act(async () => {
        userADeferred.resolve({
          data: { preferred_rashi_id: 2 },
          error: null,
        });
      });

      // Customer B's active preference MUST remain 6!
      expect(latestHook.selectedRashiId).toBe(6);
    });

    test("18. Customer A profile read failing after B succeeds does not overwrite B with error", async () => {
      let latestHook!: UseDailyRashiInsightResult;
      mockCurrentAuthUser = { id: "user-A" };

      const userADeferred = createDeferred<any>();
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_col: string, val: string) => ({
                maybeSingle: jest.fn(() => {
                  if (val === "user-A") return userADeferred.promise;
                  return Promise.resolve({ data: { preferred_rashi_id: 7 }, error: null });
                }),
              })),
            })),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(<HookHarness onRender={(h) => (latestHook = h)} />);
      });

      // Switch to B
      await act(async () => {
        mockCurrentAuthUser = { id: "user-B" };
        renderer.update(<HookHarness onRender={(h) => (latestHook = h)} />);
      });

      expect(latestHook.selectedRashiId).toBe(7);

      // Customer A's old request rejects
      await act(async () => {
        userADeferred.reject(new Error("Customer A network error"));
      });

      expect(latestHook.selectedRashiId).toBe(7);
      expect(latestHook.error).toBeNull();
    });

    test("19-20. Sign out while preference read is pending: old request resolving cannot repopulate cleared state", async () => {
      let latestHook!: UseDailyRashiInsightResult;
      mockCurrentAuthUser = { id: "user-A" };

      const userADeferred = createDeferred<{ data: { preferred_rashi_id: number }; error: any }>();
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_col: string, val: string) => ({
                maybeSingle: jest.fn(() => {
                  if (val === "user-A") return userADeferred.promise;
                  return Promise.resolve({ data: null, error: null });
                }),
              })),
            })),
          };
        }
        return { select: jest.fn().mockReturnThis() };
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(<HookHarness onRender={(h) => (latestHook = h)} />);
      });

      // User signs out
      await act(async () => {
        mockCurrentAuthUser = null;
        renderer.update(<HookHarness onRender={(h) => (latestHook = h)} />);
      });

      // State reset to default
      expect(latestHook.selectedRashiId).toBe(1);

      // Old request resolves with 4
      await act(async () => {
        userADeferred.resolve({
          data: { preferred_rashi_id: 4 },
          error: null,
        });
      });

      // Must remain at unauthenticated default 1
      expect(latestHook.selectedRashiId).toBe(1);
    });

    test("21. In-flight save from Customer A resolving after switch to B cannot mutate B's active cache", async () => {
      mockCurrentAuthUser = { id: "user-A" };

      const rpcDeferred = createDeferred<{ data: any; error: any }>();
      (supabase.rpc as jest.Mock).mockImplementationOnce(() => rpcDeferred.promise);

      // Start save for Customer A
      const savePromise = dailyRashiService.savePreferredRashi(4, "user-A");

      // Switch to Customer B before save resolves
      mockCurrentAuthUser = { id: "user-B" };

      // Now RPC resolves
      rpcDeferred.resolve({ data: { success: true }, error: null });
      const saveResult = await savePromise;

      // Because session changed during save, it returns failed and does not pollute B
      expect(saveResult.status).toBe("failed");
      expect(saveResult.error).toContain("Account changed");

      // Customer B cache must be unaffected
      const cacheB = await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`);
      expect(cacheB).toBeNull();
    });
  });

  // ===========================================================================
  // GROUP D: Persistence success, failure, and retry reporting
  // ===========================================================================
  describe("Group D: Persistence success, failure, and retry reporting", () => {
    test("22. Successful profile RPC updates authoritative profile and reports status: 'synced'", async () => {
      mockCurrentAuthUser = { id: "user-A" };
      const res = await dailyRashiService.savePreferredRashi(3, "user-A");

      expect(res.status).toBe("synced");
      expect(res.rashiId).toBe(3);
      expect(res.userId).toBe("user-A");

      expect(mockProfileStore["user-A"].preferred_rashi_id).toBe(3);
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`)).toBe("3");
    });

    test("23. Network error + successful user-scoped AsyncStorage write produces status: 'local_only'", async () => {
      mockCurrentAuthUser = { id: "user-A" };

      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(new Error("Network request failed"))
      );

      const res = await dailyRashiService.savePreferredRashi(7, "user-A");

      expect(res.status).toBe("local_only");
      expect(res.rashiId).toBe(7);
      expect(res.error).toBe("Network request failed");

      // Local scoped cache retained for offline access
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`)).toBe("7");
    });

    test("24. Network error + AsyncStorage failure returns status: 'failed'", async () => {
      mockCurrentAuthUser = { id: "user-A" };

      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(new Error("Network request failed"))
      );

      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
        new Error("Storage quota exceeded")
      );

      const res = await dailyRashiService.savePreferredRashi(8, "user-A");

      expect(res.status).toBe("failed");
      expect(res.rashiId).toBe(8);
      expect(res.error).toContain("Network request failed");
      expect(res.error).toContain("Storage quota exceeded");
    });

    test("25. Permission / Authorization rejection returns status: 'failed' without writing local cache", async () => {
      mockCurrentAuthUser = { id: "user-A" };

      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          data: null,
          error: {
            message: "Permission denied for function set_customer_preferred_rashi",
            code: "42501",
            status: 403,
          },
        })
      );
      const fromMock = supabase.from as jest.Mock;
      fromMock.mockClear();

      const res = await dailyRashiService.savePreferredRashi(10, "user-A");

      expect(res.status).toBe("failed");
      expect(res.error).toContain("Permission denied");
      // Must NOT attempt unauthorized direct update
      expect(fromMock).not.toHaveBeenCalled();
      // Must NOT write rejected preference into user-scoped cache
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`)).toBeNull();
    });

    test("25b. Validation error / constraint rejection returns status: 'failed' without writing local cache", async () => {
      mockCurrentAuthUser = { id: "user-A" };

      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          data: null,
          error: {
            message: "Invalid Rashi ID. Must be between 1 and 12.",
            code: "23514",
            status: 400,
          },
        })
      );

      const res = await dailyRashiService.savePreferredRashi(10, "user-A");

      expect(res.status).toBe("failed");
      expect(res.error).toContain("Invalid Rashi ID");
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`)).toBeNull();
    });

    test("25c. Non-network RPC database error returns status: 'failed' without writing local cache", async () => {
      mockCurrentAuthUser = { id: "user-A" };

      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          data: null,
          error: {
            message: "canceling statement due to statement timeout",
            code: "57014",
          },
        })
      );

      const res = await dailyRashiService.savePreferredRashi(10, "user-A");

      expect(res.status).toBe("failed");
      expect(res.error).toContain("statement timeout");
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`)).toBeNull();
    });

    test("25d. Non-network exception thrown by client returns status: 'failed' without writing local cache", async () => {
      mockCurrentAuthUser = { id: "user-A" };

      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(new TypeError("Invalid argument supplied to client"))
      );

      const res = await dailyRashiService.savePreferredRashi(10, "user-A");

      expect(res.status).toBe("failed");
      expect(res.error).toContain("Invalid argument supplied to client");
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`)).toBeNull();
    });

    test("25e. Remote RPC succeeds + local cache write fails: reports 'remote_only' accurately", async () => {
      mockCurrentAuthUser = { id: "user-A" };
      await AsyncStorage.clear();

      // RPC succeeds on PostgreSQL
      // But AsyncStorage write throws
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
        new Error("Storage quota exceeded")
      );

      const res = await dailyRashiService.savePreferredRashi(9, "user-A");

      expect(res.status).toBe("remote_only");
      expect(res.rashiId).toBe(9);
      expect(res.userId).toBe("user-A");
      expect(res.error).toContain("Storage quota exceeded");
      expect(res.cacheWarning).toContain("Remote preference was saved successfully");

      // Verify remote profile store has the authoritative selection 9
      expect(mockProfileStore["user-A"].preferred_rashi_id).toBe(9);

      // Verify subsequent profile read restores 9 from authoritative remote profile
      const restored = await dailyRashiService.getPreferredRashi("user-A");
      expect(restored).toBe(9);

      // Verify Customer B's cache and state remain completely unaffected
      const cacheB = await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`);
      expect(cacheB).toBeNull();
    });

    test("26. Profile read errors are represented distinctly rather than converted to missing preference", async () => {
      // Offline with cached value 4
      await AsyncStorage.setItem(`${USER_PREFERRED_RASHI_PREFIX}user-A`, "4");

      (supabase.from as jest.Mock).mockImplementationOnce(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(() => Promise.reject(new Error("Failed to fetch profile"))),
          })),
        })),
      }));

      // Falls back safely to current user's local cache
      const pref = await dailyRashiService.getPreferredRashi("user-A");
      expect(pref).toBe(4);
    });

    test("27-29. Newer selection made while older save pending remains authoritative, and retrySync operates on active selection", async () => {
      let latestHook!: UseDailyRashiInsightResult;
      mockCurrentAuthUser = { id: "user-A" };

      function Harness({ onRender }: { onRender: (h: UseDailyRashiInsightResult) => void }) {
        const hook = useDailyRashiInsight();
        onRender(hook);
        return null;
      }

      await act(async () => {
        ReactTestRenderer.create(<Harness onRender={(h) => (latestHook = h)} />);
      });

      // Save 1 starts and hangs
      const save1Deferred = createDeferred<{ data: any; error: any }>();
      (supabase.rpc as jest.Mock).mockImplementationOnce(() => save1Deferred.promise);

      await act(async () => {
        latestHook.selectRashi(4);
      });

      expect(latestHook.selectedRashiId).toBe(4);

      // User quickly changes to Rashi 5 which succeeds immediately
      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({ data: { success: true }, error: null })
      );

      await act(async () => {
        latestHook.selectRashi(5);
      });

      expect(latestHook.selectedRashiId).toBe(5);
      expect(latestHook.syncStatus).toBe("synced");

      // Save 1 resolves late
      await act(async () => {
        save1Deferred.resolve({ data: { success: true }, error: null });
      });

      // Active preference must remain Rashi 5!
      expect(latestHook.selectedRashiId).toBe(5);
      expect(latestHook.syncStatus).toBe("synced");

      // Now simulate sync failure on Rashi 6 due to network drop
      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.reject(new Error("Network connection dropped"))
      );
      await act(async () => {
        latestHook.selectRashi(6);
      });

      expect(latestHook.selectedRashiId).toBe(6);
      expect(latestHook.syncStatus).toBe("local_only");

      // Retry sync: should retry Rashi 6 for user-A and update to 'synced'
      (supabase.rpc as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({ data: { success: true }, error: null })
      );

      await act(async () => {
        await latestHook.retrySync?.();
      });

      expect(latestHook.selectedRashiId).toBe(6);
      expect(latestHook.syncStatus).toBe("synced");
    });
  });

  // ===========================================================================
  // GROUP E: New installation and compatibility
  // ===========================================================================
  describe("Group E: New installation and compatibility", () => {
    test("30. Fresh installation: No AsyncStorage present, successful profile read restores preference", async () => {
      await AsyncStorage.clear();
      mockCurrentAuthUser = { id: "user-B" };
      mockProfileStore["user-B"] = { preferred_rashi_id: 12 };

      const restored = await dailyRashiService.getPreferredRashi("user-B");
      expect(restored).toBe(12);

      // Scoped cache should be populated
      expect(await AsyncStorage.getItem(`${USER_PREFERRED_RASHI_PREFIX}user-B`)).toBe("12");
    });

    test("31. Legacy global key cannot override a different account's profile preference", async () => {
      await AsyncStorage.setItem(LEGACY_PREFERRED_RASHI_STORAGE_KEY, "1");
      mockCurrentAuthUser = { id: "user-B" };
      mockProfileStore["user-B"] = { preferred_rashi_id: 8 };

      const pref = await dailyRashiService.getPreferredRashi("user-B");
      expect(pref).toBe(8);
      expect(pref).not.toBe(1);
    });

    test("32. Janam Kundli Moon Sign mapping to canonical Rashi IDs 1-12 functions correctly", () => {
      expect(mapKundliMoonSignToRashiId(1)).toBe(1);
      expect(mapKundliMoonSignToRashiId(12)).toBe(12);
      expect(mapKundliMoonSignToRashiId("Aries")).toBe(1);
      expect(mapKundliMoonSignToRashiId("Pisces")).toBe(12);
      expect(mapKundliMoonSignToRashiId("Mesha")).toBe(1);
      expect(mapKundliMoonSignToRashiId("Meena")).toBe(12);

      const rashi = getRashiById(1);
      expect(rashi?.westernName).toBe("Aries");
    });

    test("33. Default behavior preserved when no preference exists (profile returns null)", async () => {
      await AsyncStorage.clear();
      mockCurrentAuthUser = { id: "user-C" };
      mockProfileStore["user-C"] = { preferred_rashi_id: null };

      const pref = await dailyRashiService.getPreferredRashi("user-C");
      expect(pref).toBeNull();
    });
  });
});
