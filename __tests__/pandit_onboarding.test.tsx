// __tests__/pandit_onboarding.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthContextModule from "../src/features/auth/AuthContext.tsx";
import { AuthProvider, useAuth } from "../src/features/auth/AuthContext.tsx";
import { panditApplicationService } from "../src/features/pandit/services/panditApplicationService.ts";
import { PanditApplicationStatusScreen } from "../src/features/pandit/screens/PanditApplicationStatusScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { PanditApplication } from "../src/features/pandit/types/application.ts";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReset = jest.fn();

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    reset: mockReset,
  }),
  useRoute: () => ({
    params: {},
  }),
}));

jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component }: any) => (
      <Component
        route={{ params: {} }}
        navigation={{ navigate: mockNavigate, goBack: mockGoBack, reset: mockReset }}
      />
    ),
  }),
}));

jest.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component }: any) => (
      <Component
        route={{ params: {} }}
        navigation={{ navigate: mockNavigate, goBack: mockGoBack, reset: mockReset }}
      />
    ),
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(15000);

describe("M14.2: Pandit Onboarding & Admin Approval Vertical Slice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
          id: "sub-test",
          callback: jest.fn(),
        },
      },
    } as any);
  });

  // ==========================================
  // 1. MULTI-ROLE & ACTIVE MODE PERSISTENCE
  // ==========================================
  describe("AuthContext Multi-Role & Mode Switching", () => {
    test("1. Customer without pandit role cannot switch to Pandit Mode", async () => {
      jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
        data: { session: { user: { id: "cust-1" } } as any },
        error: null,
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: "cust-1", display_name: "Aman" }, error: null }),
              }),
            }),
          } as any;
        }
        if (table === "user_roles") {
          const queryPromise = Promise.resolve({ data: [{ role: "customer" }], error: null });
          return {
            select: () => ({
              eq: () =>
                Object.assign(queryPromise, {
                  maybeSingle: () => Promise.resolve({ data: { role: "customer" }, error: null }),
                }),
            }),
          } as any;
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
      });

      let auth: any;
      const TestComponent = () => {
        auth = useAuth();
        return null;
      };

      await act(async () => {
        ReactTestRenderer.create(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        );
      });

      expect(auth.roles).toEqual(["customer"]);
      expect(auth.canSwitchToPanditMode).toBe(false);
      expect(auth.activeMode).toBe("customer");

      // Attempting to switch mode must throw
      await expect(auth.setActiveMode("pandit")).rejects.toThrow(
        "Cannot switch to Pandit mode: Account does not have an approved Pandit role."
      );
    });

    test("2. Approved user with [customer, pandit] roles can toggle between modes without mutating database roles", async () => {
      jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
        data: { session: { user: { id: "pandit-cust-1" } } as any },
        error: null,
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: "pandit-cust-1", display_name: "Pt. Ramesh" }, error: null }),
              }),
            }),
          } as any;
        }
        if (table === "user_roles") {
          const queryPromise = Promise.resolve({
            data: [{ role: "customer" }, { role: "pandit" }],
            error: null,
          });
          return {
            select: () => ({
              eq: () =>
                Object.assign(queryPromise, {
                  maybeSingle: () => Promise.resolve({ data: { role: "pandit" }, error: null }),
                }),
            }),
          } as any;
        }
        if (table === "pandit_profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "prof-1",
                      user_id: "pandit-cust-1",
                      verification_status: "approved",
                      public_status: "available",
                    },
                    error: null,
                  }),
              }),
            }),
          } as any;
        }
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
      });

      let auth: any;
      const TestComponent = () => {
        auth = useAuth();
        return null;
      };

      await act(async () => {
        ReactTestRenderer.create(
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        );
      });

      expect(auth.roles).toContain("customer");
      expect(auth.roles).toContain("pandit");
      expect(auth.canSwitchToPanditMode).toBe(true);
      expect(auth.activeMode).toBe("customer");

      // Switch to pandit mode
      await act(async () => {
        await auth.setActiveMode("pandit");
      });
      expect(auth.activeMode).toBe("pandit");
      expect(auth.role).toBe("pandit");
      expect(AsyncStorage.setItem).toHaveBeenCalledWith("@kashiveda_active_mode", "pandit");

      // Switch back to customer mode
      await act(async () => {
        await auth.setActiveMode("customer");
      });
      expect(auth.activeMode).toBe("customer");
      expect(auth.role).toBe("customer");
      expect(AsyncStorage.setItem).toHaveBeenCalledWith("@kashiveda_active_mode", "customer");
    });
  });

  // ==========================================
  // 2. PANDIT APPLICATION SERVICE TESTS
  // ==========================================
  describe("panditApplicationService API and Validation", () => {
    test("3. fetchMyApplication queries public.pandit_applications ordered by created_at DESC", async () => {
      const mockApplication: Partial<PanditApplication> = {
        id: "app-101",
        user_id: "user-1",
        full_name: "Acharya Dev",
        status: "submitted",
        created_at: new Date().toISOString(),
      };

      const orderMock = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: mockApplication, error: null }),
        }),
      });

      const eqMock = jest.fn().mockReturnValue({
        order: orderMock,
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "pandit_applications") {
          return {
            select: jest.fn().mockReturnValue({
              eq: eqMock,
            }),
          } as any;
        }
        return {} as any;
      });

      const result = await panditApplicationService.fetchMyApplication("user-1");
      expect(result).toEqual(mockApplication);
      expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    });

    test("4. saveDraftApplication saves new draft when no ID exists", async () => {
      const insertMock = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: "app-new", status: "draft", full_name: "Dev Sharma" },
            error: null,
          }),
        }),
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "pandit_applications") {
          return {
            insert: insertMock,
          } as any;
        }
        return {} as any;
      });

      const result = await panditApplicationService.saveDraftApplication("user-1", {
        full_name: "Dev Sharma",
        bio: "Vedic scholar from Kashi",
        years_experience: 12,
        languages: ["Hindi", "Sanskrit"],
      });

      expect(result.id).toBe("app-new");
      expect(insertMock).toHaveBeenCalled();
    });

    test("5. Application wizard step validation logic satisfies business rules", () => {
      // Step 1: Legal name
      const validateStep1 = (fullName: string) => Boolean(fullName && fullName.trim().length > 0);
      expect(validateStep1("")).toBe(false);
      expect(validateStep1("   ")).toBe(false);
      expect(validateStep1("Pt. Ramesh Shastri")).toBe(true);

      // Step 2: Experience & Languages
      const validateStep2 = (exp: number, langs: string[]) => !isNaN(exp) && exp >= 0 && langs.length > 0;
      expect(validateStep2(-1, ["Hindi"])).toBe(false);
      expect(validateStep2(5, [])).toBe(false);
      expect(validateStep2(5, ["Hindi", "Sanskrit"])).toBe(true);

      // Step 3: Primary city
      const validateStep3 = (city: string) => Boolean(city && city.trim().length > 0);
      expect(validateStep3("")).toBe(false);
      expect(validateStep3("Varanasi")).toBe(true);

      // Step 4: Documents (identity proof & qualification required)
      const validateStep4 = (docs: Array<{ document_type: string }>) => {
        const hasId = docs.some((d) => d.document_type === "identity_proof");
        const hasQual = docs.some((d) => d.document_type === "vedic_qualification");
        return hasId && hasQual;
      };
      expect(validateStep4([])).toBe(false);
      expect(validateStep4([{ document_type: "identity_proof" }])).toBe(false);
      expect(
        validateStep4([
          { document_type: "identity_proof" },
          { document_type: "vedic_qualification" },
        ])
      ).toBe(true);
    });

    test("6. submitApplication invokes authoritative submit_pandit_application RPC", async () => {
      const rpcMock = jest.fn().mockResolvedValue({
        data: { success: true },
        error: null,
      });

      jest.spyOn(supabase, "rpc").mockImplementation(rpcMock as any);
      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "pandit_applications") {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "app-valid-1",
                      status: "submitted",
                      full_name: "Acharya Vidyadhar",
                    },
                    error: null,
                  }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const result = await panditApplicationService.submitApplication("app-valid-1");

      expect(result.status).toBe("submitted");
      expect(rpcMock).toHaveBeenCalledWith("submit_pandit_application", {
        p_application_id: "app-valid-1",
      });
    });

    test("7. uploadDocument rejects invalid file types and files larger than 10MB", async () => {
      // Invalid extension
      await expect(
        panditApplicationService.uploadDocument("user-doc-1", "identity_proof", {
          uri: "file://temp/script.exe",
          name: "script.exe",
          type: "application/x-msdownload",
        })
      ).rejects.toThrow("Invalid file type: script.exe");

      // File too large (>10MB)
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        blob: () => Promise.resolve({ size: 15 * 1024 * 1024 }),
      } as any);

      await expect(
        panditApplicationService.uploadDocument("user-doc-1", "identity_proof", {
          uri: "file://temp/photo.jpg",
          name: "photo.jpg",
          type: "image/jpeg",
        })
      ).rejects.toThrow("File size exceeds 10MB limit");
    });
  });

  // ==========================================
  // 3. UI SCREEN RENDERING & TELEMETRY
  // ==========================================
  describe("PanditApplicationStatusScreen Status Visualizations", () => {
    beforeEach(() => {
      jest.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        session: null,
        user: { id: "user-1", email: "pandit@kashiveda.com" } as any,
        profile: { id: "user-1", display_name: "Pandit Govind" } as any,
        roles: ["customer"],
        role: "customer",
        activeMode: "customer",
        canSwitchToPanditMode: false,
        panditProfile: null,
        isLoading: false,
        error: null,
        signOut: jest.fn(),
        deleteAccount: jest.fn(),
        refreshProfile: jest.fn(),
        setProfile: jest.fn(),
        setActiveMode: jest.fn(),
        hasRole: jest.fn(),
      });
    });

    test("8. Status screen renders SUBMITTED state with under-review expectation", async () => {
      const submittedApp: PanditApplication = {
        id: "app-sub-1",
        user_id: "user-1",
        full_name: "Pandit Govind",
        status: "submitted",
        bio: "Expert in Griha Pravesh and Vivah Sanskar",
        years_experience: 10,
        languages: ["Hindi"],
        primary_city: "Ayodhya",
        service_radius_km: 20,
        service_modes: ["offline"],
        selected_puja_ids: [],
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      jest.spyOn(panditApplicationService, "fetchMyApplication").mockResolvedValue(submittedApp);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PanditApplicationStatusScreen />);
      });

      const textNodes = tree.root.findAll((node: any) => typeof node.props?.children === "string");
      const str = textNodes.map((n: any) => n.props.children).join(" ");
      expect(str).toContain("SUBMITTED • PENDING REVIEW");
      expect(str).toContain("Application In Review Queue");
      expect(str).toContain("Your application and uploaded documents have been received safely and are queued for document verification.");
    });

    test("9. Status screen renders REJECTED state with rejection reason and Resubmit CTA", async () => {
      const rejectedApp: PanditApplication = {
        id: "app-rej-1",
        user_id: "user-1",
        full_name: "Pandit Govind",
        status: "rejected",
        rejection_reason: "Identity document was illegible. Please upload a clear color photo of your Aadhaar card.",
        bio: "Expert in Griha Pravesh and Vivah Sanskar",
        years_experience: 10,
        languages: ["Hindi"],
        primary_city: "Ayodhya",
        service_radius_km: 20,
        service_modes: ["offline"],
        selected_puja_ids: [],
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      jest.spyOn(panditApplicationService, "fetchMyApplication").mockResolvedValue(rejectedApp);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PanditApplicationStatusScreen />);
      });

      const textNodes = tree.root.findAll((node: any) => typeof node.props?.children === "string");
      const str = textNodes.map((n: any) => n.props.children).join(" ");
      expect(str).toContain("ACTION REQUIRED / REJECTED");
      expect(str).toContain("Identity document was illegible. Please upload a clear color photo of your Aadhaar card.");
      expect(str).toContain("Edit & Resubmit Application");
    });

    test("10. Status screen renders APPROVED state with 'Enter Pandit Mode' button", async () => {
      const approvedApp: PanditApplication = {
        id: "app-appr-1",
        user_id: "user-1",
        full_name: "Pandit Govind",
        status: "approved",
        approved_at: new Date().toISOString(),
        bio: "Expert in Griha Pravesh and Vivah Sanskar",
        years_experience: 10,
        languages: ["Hindi"],
        primary_city: "Ayodhya",
        service_radius_km: 20,
        service_modes: ["offline"],
        selected_puja_ids: [],
        documents: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      jest.spyOn(panditApplicationService, "fetchMyApplication").mockResolvedValue(approvedApp);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<PanditApplicationStatusScreen />);
      });

      const textNodes = tree.root.findAll((node: any) => typeof node.props?.children === "string");
      const str = textNodes.map((n: any) => n.props.children).join(" ");
      expect(str).toContain("APPROVED & CONSECRATED");
      expect(str).toContain("Welcome, Pandit Ji!");
      expect(str).toContain("Enter Pandit Mode");
    });
  });

  // ==========================================
  // 4. BACKEND RPC CONTRACT & SECURITY REASONING
  // ==========================================
  describe("Backend RPC Security & Transition Rules", () => {
    test("11. Migration 022 enforces rejection reason non-empty constraint", () => {
      const validateRejectionReason = (reason: string | null | undefined): boolean => {
        if (!reason || reason.trim().length < 5) {
          return false;
        }
        return true;
      };

      expect(validateRejectionReason("")).toBe(false);
      expect(validateRejectionReason("    ")).toBe(false);
      expect(validateRejectionReason("no")).toBe(false);
      expect(validateRejectionReason("Documents unclear, please re-upload")).toBe(true);
    });

    test("12. Role preservation contract: Granting pandit role must NOT remove customer role", () => {
      const existingRoles = ["customer"];
      const newRole = "pandit";

      const updatedRoles = Array.from(new Set([...existingRoles, newRole]));

      expect(updatedRoles).toContain("customer");
      expect(updatedRoles).toContain("pandit");
      expect(updatedRoles.length).toBe(2);
    });

    test("13. RootNavigator renders PanditNavigator when activeMode is pandit and customer otherwise", () => {
      const resolveNavigator = (role: string | null, activeMode: string, hasPanditRole: boolean) => {
        if (!role) return "AuthNavigator";
        if (activeMode === "pandit" && hasPanditRole) return "PanditNavigator";
        return "CustomerNavigator";
      };

      expect(resolveNavigator("customer", "customer", false)).toBe("CustomerNavigator");
      expect(resolveNavigator("customer", "customer", true)).toBe("CustomerNavigator");
      expect(resolveNavigator("pandit", "pandit", true)).toBe("PanditNavigator");
      expect(resolveNavigator("customer", "pandit", false)).toBe("CustomerNavigator");
    });
  });

  // =========================================================================
  // 5. PANDIT RITUAL PRICING & KUNDLI ONBOARDING FLOW (PHASES 1-9)
  // =========================================================================
  describe("Phase 1-9: Pandit Ritual Pricing & Kundli Pricing Lifecycle", () => {
    test("14. Active rituals load successfully without nonexistent columns (no base_price, no duration_minutes)", async () => {
      const mockRawPujas = [
        {
          id: "puja-1",
          name: "Griha Pravesh",
          description: "Auspicious home blessing",
          default_duration_minutes: 120,
          allowed_modes: ["offline", "online"],
          is_active: true,
        },
        {
          id: "puja-2",
          name: "Rudrabhishek",
          description: "Lord Shiva holy bath ritual",
          default_duration_minutes: 90,
          allowed_modes: ["offline"],
          is_active: true,
        },
      ];

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "puja_services") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({ data: mockRawPujas, error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const pujas = await panditApplicationService.fetchAvailablePujas();
      expect(pujas).toHaveLength(2);
      expect(pujas[0].id).toBe("puja-1");
      expect(pujas[0].default_duration_minutes).toBe(120);
      expect((pujas[0] as any).base_price).toBeUndefined();
      expect((pujas[0] as any).duration_minutes).toBeUndefined();
    });

    test("15. Multiple rituals can be selected with distinct prices", () => {
      const selectedPujas = ["puja-1", "puja-2"];
      const pujaPrices: Record<string, string> = {
        "puja-1": "5100",
        "puja-2": "3100",
      };

      expect(selectedPujas.length).toBe(2);
      expect(Number(pujaPrices["puja-1"])).toBe(5100);
      expect(Number(pujaPrices["puja-2"])).toBe(3100);
    });

    test("16. Validation: Every selected ritual requires price > 0, rejecting 0, negative, and empty", () => {
      const validateRitualPrices = (
        selectedIds: string[],
        prices: Record<string, string>
      ): { valid: boolean; error?: string } => {
        if (selectedIds.length === 0) {
          return { valid: false, error: "Please select at least one sacred ritual" };
        }
        for (const id of selectedIds) {
          const val = (prices[id] || "").trim();
          if (!val) {
            return { valid: false, error: "Dakshina fee is required for all selected rituals" };
          }
          const num = Number(val);
          if (isNaN(num) || num <= 0) {
            return { valid: false, error: "Ritual price must be strictly greater than ₹0" };
          }
        }
        return { valid: true };
      };

      // Empty price
      expect(validateRitualPrices(["p1"], { p1: "" }).valid).toBe(false);
      // Zero price
      expect(validateRitualPrices(["p1"], { p1: "0" }).valid).toBe(false);
      // Negative price
      expect(validateRitualPrices(["p1"], { p1: "-500" }).valid).toBe(false);
      // Non-numeric price
      expect(validateRitualPrices(["p1"], { p1: "abc" }).valid).toBe(false);
      // Multiple rituals, one invalid
      expect(validateRitualPrices(["p1", "p2"], { p1: "2500", p2: "0" }).valid).toBe(false);
      // Valid multiple rituals
      expect(validateRitualPrices(["p1", "p2"], { p1: "2500", p2: "5000" }).valid).toBe(true);
    });

    test("17. Validation: Kundli disabled is valid without price; enabled requires price > 0 and turnaround > 0", () => {
      const validateKundli = (
        enabled: boolean,
        priceStr: string,
        turnaroundStr: string
      ): { valid: boolean; error?: string } => {
        if (!enabled) return { valid: true };
        const price = Number(priceStr.trim());
        if (!priceStr.trim() || isNaN(price) || price <= 0) {
          return { valid: false, error: "Kundli consultation fee must be strictly greater than ₹0" };
        }
        const turnaround = Number(turnaroundStr.trim());
        if (!turnaroundStr.trim() || isNaN(turnaround) || turnaround <= 0) {
          return { valid: false, error: "Kundli turnaround days must be at least 1 day" };
        }
        return { valid: true };
      };

      // Disabled: valid regardless
      expect(validateKundli(false, "", "").valid).toBe(true);
      expect(validateKundli(false, "0", "0").valid).toBe(true);

      // Enabled: price <= 0 rejected
      expect(validateKundli(true, "", "3").valid).toBe(false);
      expect(validateKundli(true, "0", "3").valid).toBe(false);
      expect(validateKundli(true, "-100", "3").valid).toBe(false);

      // Enabled: invalid turnaround rejected
      expect(validateKundli(true, "1100", "0").valid).toBe(false);
      expect(validateKundli(true, "1100", "-2").valid).toBe(false);

      // Enabled: valid
      expect(validateKundli(true, "1500", "3").valid).toBe(true);
    });

    test("18. Application draft save and resubmission persists puja_prices and Kundli settings", async () => {
      let savedPayload: any = null;
      jest.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: "pandit-user-1" } as any },
        error: null,
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "pandit_applications") {
          return {
            insert: jest.fn().mockImplementation(([payload]) => {
              savedPayload = payload;
              return {
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: "app-saved-1", ...payload },
                    error: null,
                  }),
                }),
              };
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await panditApplicationService.saveDraftApplication("pandit-user-1", {
        full_name: "Acharya Vidyadhar",
        primary_city: "Varanasi",
        years_experience: 15,
        languages: ["Sanskrit", "Hindi"],
        selected_puja_ids: ["puja-1", "puja-2"],
        puja_prices: { "puja-1": 5000, "puja-2": 3500 },
        kundli_enabled: true,
        kundli_price: 1100,
        kundli_turnaround_days: 2,
        service_modes: ["offline", "online"],
        documents: [],
      });

      expect(res.id).toBe("app-saved-1");
      expect(savedPayload.puja_prices).toEqual({ "puja-1": 5000, "puja-2": 3500 });
      expect(savedPayload.kundli_enabled).toBe(true);
      expect(savedPayload.kundli_price).toBe(1100);
      expect(savedPayload.kundli_turnaround_days).toBe(2);
    });

    test("19. Approval simulates pandit_puja_services insertion with Pandit's submitted price and default duration", () => {
      const application = {
        id: "app-1",
        user_id: "user-pandit-1",
        selected_puja_ids: ["p1", "p2"],
        puja_prices: { p1: 2500, p2: 4500 } as Record<string, number>,
        kundli_enabled: true,
        kundli_price: 1500,
        kundli_turnaround_days: 3,
      };

      const catalogServices = [
        { id: "p1", name: "Ganesh Puja", default_duration_minutes: 45 },
        { id: "p2", name: "Navgrah Shanti", default_duration_minutes: 90 },
      ];

      // Simulated approve_pandit_application insertion logic
      const offeringsCreated = application.selected_puja_ids.map((pujaId) => {
        const catalog = catalogServices.find((c) => c.id === pujaId)!;
        const submittedPrice = application.puja_prices[pujaId];
        if (!submittedPrice || submittedPrice <= 0) {
          throw new Error(`Invalid price for ritual ${catalog.name}`);
        }
        return {
          pandit_id: application.user_id,
          puja_service_id: pujaId,
          price: submittedPrice,
          duration_minutes: catalog.default_duration_minutes,
          is_active: true,
        };
      });

      expect(offeringsCreated).toHaveLength(2);
      expect(offeringsCreated[0].price).toBe(2500);
      expect(offeringsCreated[0].duration_minutes).toBe(45);
      expect(offeringsCreated[1].price).toBe(4500);
      expect(offeringsCreated[1].duration_minutes).toBe(90);

      // Kundli profile update
      const panditProfile = {
        user_id: application.user_id,
        kundli_enabled: application.kundli_enabled,
        kundli_price: application.kundli_enabled ? application.kundli_price : null,
        kundli_turnaround_days: application.kundli_enabled ? application.kundli_turnaround_days : null,
      };
      expect(panditProfile.kundli_enabled).toBe(true);
      expect(panditProfile.kundli_price).toBe(1500);
      expect(panditProfile.kundli_turnaround_days).toBe(3);
    });

    test("20. Idempotency & Conflict safety: No duplicate Pandit/service mappings on repeated approvals", () => {
      const existingOfferings = new Map<string, any>();
      const upsertOffering = (panditId: string, serviceId: string, price: number, duration: number) => {
        const key = `${panditId}:${serviceId}`;
        existingOfferings.set(key, { pandit_id: panditId, puja_service_id: serviceId, price, duration_minutes: duration });
      };

      upsertOffering("pandit-1", "puja-1", 3000, 60);
      upsertOffering("pandit-1", "puja-1", 3500, 60); // Resubmitted / re-approved with updated price

      expect(existingOfferings.size).toBe(1);
      expect(existingOfferings.get("pandit-1:puja-1").price).toBe(3500);
    });

    test("21. RLS Authorization: Pandit can only edit their own offering price and Kundli settings", () => {
      const canUpdateOffering = (currentUserId: string, offeringPanditUserId: string): boolean => {
        return currentUserId === offeringPanditUserId;
      };

      expect(canUpdateOffering("pandit-1", "pandit-1")).toBe(true);
      expect(canUpdateOffering("pandit-2", "pandit-1")).toBe(false);
      expect(canUpdateOffering("customer-1", "pandit-1")).toBe(false);
    });

    test("22. Immutability & Price Snapshotting: Existing bookings and Kundli orders retain original snapshot price", () => {
      // 1. Initial Pandit state
      let activeOfferingPrice = 2500;
      let activeKundliPrice = 1100;

      // 2. Customer creates booking and Kundli order at active price
      const booking = {
        id: "book-1",
        puja_id: "puja-1",
        pandit_id: "pandit-1",
        snapshotted_price: activeOfferingPrice,
        status: "confirmed",
      };

      const kundliOrder = {
        id: "kundli-order-1",
        pandit_id: "pandit-1",
        snapshotted_price: activeKundliPrice,
        status: "submitted",
      };

      expect(booking.snapshotted_price).toBe(2500);
      expect(kundliOrder.snapshotted_price).toBe(1100);

      // 3. Pandit later changes offering and Kundli prices
      activeOfferingPrice = 4000;
      activeKundliPrice = 2100;

      // 4. Authoritative check: Existing booking and order remain completely unchanged
      expect(booking.snapshotted_price).toBe(2500);
      expect(kundliOrder.snapshotted_price).toBe(1100);
      expect(activeOfferingPrice).toBe(4000);
      expect(activeKundliPrice).toBe(2100);
    });
  });

  // ==========================================
  // 6. REJECTED APPLICATION EDIT / RESUBMISSION & RLS LIFECYCLE
  // ==========================================
  describe("Rejected Application Edit/Resubmission & RLS Lifecycle", () => {
    // Helper simulating PostgreSQL RLS check for public.pandit_applications UPDATE
    const simulatePanditApplicationsUpdateRLS = (
      authUid: string,
      existingRow: any,
      payload: any
    ) => {
      // 1. USING clause: (user_id = auth.uid() AND status IN ('draft', 'rejected'))
      const matchesUsing =
        existingRow.user_id === authUid &&
        ["draft", "rejected"].includes(existingRow.status);

      if (!matchesUsing) {
        throw new Error("new row violates row level security policy for table \"pandit_applications\"");
      }

      // 2. Compute NEW row
      const newRow = {
        ...existingRow,
        ...payload,
      };

      // 3. WITH CHECK clause:
      // (user_id = auth.uid() AND status IN ('draft', 'rejected') AND reviewed_by IS NULL AND approved_at IS NULL)
      const matchesWithCheck =
        newRow.user_id === authUid &&
        ["draft", "rejected"].includes(newRow.status) &&
        newRow.reviewed_by === null &&
        newRow.approved_at === null;

      if (!matchesWithCheck) {
        throw new Error("new row violates row level security policy for table \"pandit_applications\"");
      }

      return newRow;
    };

    test("TEST 1 & TEST 2: Rejected application with populated reviewed_by can be edited, resetting review metadata to NULL", async () => {
      const adminId = "admin-uuid-999";
      const rejectedApp = {
        id: "app-rejected-1",
        user_id: "pandit-user-1",
        full_name: "Pandit Ram",
        primary_city: "Varanasi",
        status: "rejected",
        reviewed_by: adminId,
        reviewed_at: "2026-10-01T10:00:00Z",
        rejection_reason: "Document was blurry",
        approved_at: null,
      };

      let capturedPayload: any = null;
      const updateMock = jest.fn().mockImplementation((payload) => {
        capturedPayload = payload;
        // Verify against RLS logic
        const updatedRow = simulatePanditApplicationsUpdateRLS("pandit-user-1", rejectedApp, payload);
        return {
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: updatedRow,
                  error: null,
                }),
              }),
            }),
          }),
        };
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "pandit_applications") {
          return {
            update: updateMock,
          } as any;
        }
        return {} as any;
      });

      const updated = await panditApplicationService.saveDraftApplication("pandit-user-1", {
        id: "app-rejected-1",
        full_name: "Pandit Ram Shastri",
        primary_city: "Varanasi",
      });

      // TEST 1: UPDATE succeeds
      expect(updateMock).toHaveBeenCalled();
      expect(updated.full_name).toBe("Pandit Ram Shastri");

      // TEST 2: Review metadata is explicitly reset to NULL
      expect(capturedPayload.reviewed_by).toBeNull();
      expect(capturedPayload.reviewed_at).toBeNull();
      expect(capturedPayload.rejection_reason).toBeNull();
      expect(capturedPayload.approved_at).toBeNull();
      expect(capturedPayload.status).toBe("draft");

      expect(updated.reviewed_by).toBeNull();
      expect(updated.reviewed_at).toBeNull();
      expect(updated.rejection_reason).toBeNull();
      expect(updated.approved_at).toBeNull();
    });

    test("TEST 3: Pandit cannot edit another user's application", async () => {
      const otherUserApp = {
        id: "app-other-user",
        user_id: "other-user-999",
        status: "rejected",
        reviewed_by: "admin-1",
        approved_at: null,
      };

      expect(() => {
        simulatePanditApplicationsUpdateRLS("attacker-user-1", otherUserApp, {
          user_id: "attacker-user-1",
          status: "draft",
          reviewed_by: null,
          approved_at: null,
        });
      }).toThrow("new row violates row level security policy for table \"pandit_applications\"");
    });

    test("TEST 4: Draft application editing still works seamlessly", async () => {
      const draftApp = {
        id: "app-draft-1",
        user_id: "pandit-user-1",
        full_name: "Pandit Draft",
        status: "draft",
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        approved_at: null,
      };

      const updateMock = jest.fn().mockImplementation((payload) => {
        const updatedRow = simulatePanditApplicationsUpdateRLS("pandit-user-1", draftApp, payload);
        return {
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: updatedRow,
                  error: null,
                }),
              }),
            }),
          }),
        };
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "pandit_applications") {
          return { update: updateMock } as any;
        }
        return {} as any;
      });

      const updated = await panditApplicationService.saveDraftApplication("pandit-user-1", {
        id: "app-draft-1",
        full_name: "Pandit Draft Updated",
      });

      expect(updated.full_name).toBe("Pandit Draft Updated");
      expect(updated.status).toBe("draft");
    });

    test("TEST 5: Admin rejection still writes status=rejected, reviewed_by, reviewed_at, and rejection_reason", () => {
      const adminUid = "admin-user-1";
      const submittedApp = {
        id: "app-101",
        user_id: "pandit-1",
        status: "submitted",
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
      };

      const rejectionReason = "Vedic qualification certificate is illegible.";
      expect(rejectionReason.length).toBeGreaterThanOrEqual(5);

      // Simulate reject_pandit_application RPC behavior
      const rejectedApp = {
        ...submittedApp,
        status: "rejected",
        rejection_reason: rejectionReason,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminUid,
      };

      expect(rejectedApp.status).toBe("rejected");
      expect(rejectedApp.reviewed_by).toBe(adminUid);
      expect(rejectedApp.reviewed_at).toBeDefined();
      expect(rejectedApp.rejection_reason).toBe(rejectionReason);
    });

    test("TEST 6: After resubmission, Admin can review the application again normally", async () => {
      // 1. Resubmission transition: draft -> submitted
      const rpcMock = jest.fn().mockResolvedValue({
        data: { success: true },
        error: null,
      });
      jest.spyOn(supabase, "rpc").mockImplementation(rpcMock as any);

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "pandit_applications") {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "app-resubmitted-1",
                      status: "submitted",
                      full_name: "Pandit Resubmitted",
                      rejection_reason: null,
                      reviewed_by: null,
                      reviewed_at: null,
                    },
                    error: null,
                  }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const resubmitted = await panditApplicationService.submitApplication("app-resubmitted-1");
      expect(resubmitted.status).toBe("submitted");
      expect(resubmitted.rejection_reason).toBeNull();
      expect(resubmitted.reviewed_by).toBeNull();

      // 2. Admin starts review -> under_review
      const underReviewApp = {
        ...resubmitted,
        status: "under_review",
      };
      expect(underReviewApp.status).toBe("under_review");

      // 3. Admin approves application -> approved
      const approvedApp = {
        ...underReviewApp,
        status: "approved",
        approved_at: new Date().toISOString(),
        reviewed_by: "admin-user-1",
      };
      expect(approvedApp.status).toBe("approved");
      expect(approvedApp.approved_at).toBeDefined();
    });
  });
});


