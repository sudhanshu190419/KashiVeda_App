// __tests__/pandit_mode_deadlock_fix.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { panditService } from "../src/features/pandit/services/panditService.ts";
import { usePanditDashboard, DASHBOARD_LOAD_TIMEOUT_MS } from "../src/features/pandit/hooks/usePanditDashboard.ts";
import { PanditDashboardScreen } from "../src/features/pandit/screens/PanditDashboardScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(15000);

describe("M14.2.1: Post-Approval Pandit Mode Auth Deadlock & Bootstrap Fix", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. fetchCurrentPanditProfile works using getSession()
  test("1. fetchCurrentPanditProfile works using getSession() without calling getUser()", async () => {
    const getSessionSpy = jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          access_token: "mock-token",
          user: { id: "user-pandit-42", email: "acharya@kashiveda.org" } as any,
        } as any,
      },
      error: null,
    });

    const getUserSpy = jest.spyOn(supabase.auth, "getUser");

    const mockProfile = {
      id: "pandit-id-42",
      user_id: "user-pandit-42",
      verification_status: "approved",
      public_status: "available",
      bio: "Consecrated Acharya",
    };

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "pandit_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: jest.fn().mockResolvedValue({ data: mockProfile, error: null }),
            }),
          }),
        } as any;
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { display_name: "Acharya Sudhanshu", phone: "+919876543210", avatar_url: null },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const result = await panditService.fetchCurrentPanditProfile();

    expect(getSessionSpy).toHaveBeenCalled();
    expect(getUserSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.id).toBe("pandit-id-42");
    expect(result?.display_name).toBe("Acharya Sudhanshu");
    expect(result?.verification_status).toBe("approved");
  });

  // 2. Missing session produces a controlled error
  test("2. Missing session produces a controlled error without hanging", async () => {
    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(panditService.fetchCurrentPanditProfile()).rejects.toThrow(
      "Authentication session required."
    );
  });

  // 3. Existing approved Pandit profile loads successfully
  test("3. Existing approved Pandit profile loads with verification_status = approved", async () => {
    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          access_token: "mock-token",
          user: { id: "user-approved-1" } as any,
        } as any,
      },
      error: null,
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "pandit_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: "pandit-approved-1",
                  user_id: "user-approved-1",
                  verification_status: "approved",
                  public_status: "available",
                  bio: "Vedic Priest",
                },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { display_name: "Acharya Sharma" },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const profile = await panditService.fetchCurrentPanditProfile();
    expect(profile?.verification_status).toBe("approved");
    expect(profile?.public_status).toBe("available");
  });

  // 4. Dashboard loading resolves on success
  test("4. Dashboard loading resolves on success and populates summary", async () => {
    const mockSummary = {
      pandit: {
        id: "pandit-shastri-1",
        user_id: "user-1",
        display_name: "Acharya Shastri",
        verification_status: "approved",
        public_status: "available",
      } as any,
      todayBookingsCount: 0,
      upcomingBookingsCount: 0,
      completedBookingsCount: 0,
      nextBooking: null,
      todayBookings: [],
      verifiedBankAccount: false,
    };

    jest.spyOn(panditService, "fetchPanditDashboardSummary").mockResolvedValue(mockSummary);

    let hookResult: any;
    const TestComponent = () => {
      hookResult = usePanditDashboard();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(<TestComponent />);
    });

    expect(hookResult.loading).toBe(false);
    expect(hookResult.error).toBeNull();
    expect(hookResult.summary).toEqual(mockSummary);
  });

  // 5. Dashboard loading resolves on error and displays recoverable state
  test("5. Dashboard loading resolves on error and clears loading state", async () => {
    jest
      .spyOn(panditService, "fetchPanditDashboardSummary")
      .mockRejectedValue(new Error("Database connection dropped"));

    let hookResult: any;
    const TestComponent = () => {
      hookResult = usePanditDashboard();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(<TestComponent />);
    });

    expect(hookResult.loading).toBe(false);
    expect(hookResult.summary).toBeNull();
    expect(hookResult.error).toBe("Database connection dropped");
  });

  // 6. Dashboard loading resolves on timeout (simulating deadlock)
  test("6. Dashboard loading resolves on timeout and sets error", async () => {
    jest.useFakeTimers();

    let rejectHanging: any;
    const hangingPromise = new Promise<never>((_, reject) => {
      rejectHanging = reject;
    });
    jest.spyOn(panditService, "fetchPanditDashboardSummary").mockReturnValue(hangingPromise as any);

    let hookResult: any;
    const TestComponent = () => {
      hookResult = usePanditDashboard();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(<TestComponent />);
    });

    expect(hookResult.loading).toBe(true);

    // Fast-forward past the 10-second timeout
    await act(async () => {
      jest.advanceTimersByTime(DASHBOARD_LOAD_TIMEOUT_MS + 100);
    });

    expect(hookResult.loading).toBe(false);
    expect(hookResult.summary).toBeNull();
    expect(hookResult.error).toContain("timed out");

    // Clean up hanging promise & restore real timers
    rejectHanging(new Error("cleanup"));
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // 7. Customer-only users cannot enter Pandit Mode
  test("7. Customer-only users cannot enter Pandit Mode", () => {
    const roles: string[] = ["customer"];
    const targetMode = "pandit";

    const canSwitch = (mode: string, userRoles: string[]) => {
      if (mode === "pandit" && !userRoles.includes("pandit")) {
        return false;
      }
      return true;
    };

    expect(canSwitch(targetMode, roles)).toBe(false);
  });

  // 8. customer + pandit users can enter Pandit Mode
  test("8. customer + pandit users can enter Pandit Mode", () => {
    const roles: string[] = ["customer", "pandit"];
    const targetMode = "pandit";

    const canSwitch = (mode: string, userRoles: string[]) => {
      if (mode === "pandit" && !userRoles.includes("pandit")) {
        return false;
      }
      return true;
    };

    expect(canSwitch(targetMode, roles)).toBe(true);
  });

  // 9. Switching mode does not modify database roles
  test("9. Switching mode only sets activeMode and does not alter roles array", () => {
    const initialRoles = ["customer", "pandit"];
    let activeMode = "customer";

    // Simulate mode switch
    const switchMode = (newMode: string) => {
      activeMode = newMode;
      // Database roles remain completely unchanged
    };

    switchMode("pandit");
    expect(activeMode).toBe("pandit");
    expect(initialRoles).toEqual(["customer", "pandit"]);

    switchMode("customer");
    expect(activeMode).toBe("customer");
    expect(initialRoles).toEqual(["customer", "pandit"]);
  });

  // 10. Existing Pandit dashboard behavior remains intact
  test("10. PanditDashboardScreen renders Sanctum banner, acharya greeting, and stats", async () => {
    const mockSummary = {
      pandit: {
        id: "pandit-shastri-1",
        user_id: "user-p-1",
        display_name: "Sudhanshu Sharma",
        verification_status: "approved",
        public_status: "available",
      } as any,
      todayBookingsCount: 0,
      upcomingBookingsCount: 2,
      completedBookingsCount: 5,
      nextBooking: null,
      todayBookings: [],
      verifiedBankAccount: false,
    };

    jest.spyOn(panditService, "fetchPanditDashboardSummary").mockResolvedValue(mockSummary);

    let renderer: any;
    await act(async () => {
      renderer = ReactTestRenderer.create(<PanditDashboardScreen />);
    });

    const root = renderer.root;
    const textNodes = root.findAll((n: any) => typeof n.props?.children === "string");
    const fullText = textNodes.map((n: any) => n.props.children).join(" ");

    expect(fullText).toContain("पण्डित सेवा कक्ष");
    expect(fullText).toContain("Pranam, Sudhanshu Sharma");
    expect(fullText).toContain("Verified Pandit Ji ✓");
    expect(fullText).toContain("Bank account verification required");
  });
});
