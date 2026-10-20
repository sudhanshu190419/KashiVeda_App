// __tests__/astrology_content_detail_retry.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { astrologyService } from "../src/features/astrology/services/astrologyService.ts";
import { AstrologyContentDetailScreen } from "../src/features/astrology/screens/AstrologyContentDetailScreen.tsx";
import { ErrorState, LoadingState } from "../src/shared/components/ui/index.ts";
import { AstrologyContent } from "../src/features/astrology/types/astrology.types.ts";

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();

let mockRouteParams: any = { contentId: "content-insight-101" };

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
  useFocusEffect: jest.fn(),
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

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ type: "success", data: {} })),
    signOut: jest.fn(() => Promise.resolve()),
    getTokens: jest.fn(() => Promise.resolve({ idToken: "token" })),
  },
  statusCodes: {},
  isErrorWithCode: jest.fn(() => false),
  isCancelledResponse: jest.fn(() => false),
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: { id: "cust-user-1", email: "devotee@kashiveda.org" },
    profile: { id: "cust-user-1", display_name: "Devotee" },
    role: "customer",
    isLoading: false,
    error: null,
    signOut: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

function extractAllText(node: any): string {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractAllText).join(" ");
  if (node.props && node.props.children) {
    return extractAllText(node.props.children);
  }
  if (node.children) {
    return extractAllText(node.children);
  }
  return "";
}

// Deferred promise helper for deterministic async tests
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AST-21: Astrology Content Detail Retry Execution", () => {
  const sampleContent: AstrologyContent = {
    id: "content-insight-101",
    channel: "in_app",
    title: "Shani Gochar in Kumbha Rashi",
    body: "Saturn transits into Aquarius bringing discipline and profound spiritual transformation.",
    publish_at: "2026-10-15T00:00:00Z",
    expires_at: "2026-10-25T00:00:00Z",
    status: "published",
    created_by: "admin-1",
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { contentId: "content-insight-101" };
  });

  // ===========================================================================
  // A. SUCCESSFUL RETRY (Tests 1-8)
  // ===========================================================================
  describe("A. Successful Retry", () => {
    test("1-8. Initial failure renders ErrorState with Retry; tapping Retry stays on screen, refetches same ID, and renders content", async () => {
      const getContentSpy = jest.spyOn(astrologyService, "getContentById");

      // 1 & 2: First request fails
      getContentSpy.mockRejectedValueOnce(new Error("503 Gateway Unavailable"));

      let tree: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
      });

      // 3. ErrorState and Retry button are displayed
      expect(getContentSpy).toHaveBeenCalledTimes(1);
      expect(getContentSpy).toHaveBeenLastCalledWith("content-insight-101");

      const textBeforeRetry = extractAllText(tree!.toJSON());
      expect(textBeforeRetry).toContain("Insight Not Available");
      expect(textBeforeRetry).toContain("503 Gateway Unavailable");
      expect(textBeforeRetry).toContain("Try Again");

      const errorStateInstance = tree!.root.findByType(ErrorState);
      expect(errorStateInstance).toBeDefined();

      // 7. Make second request succeed
      getContentSpy.mockResolvedValueOnce(sampleContent);

      // 4. Tap Retry
      await act(async () => {
        errorStateInstance.props.onRetry();
      });

      // 5. Verify screen did NOT navigate back
      expect(mockGoBack).not.toHaveBeenCalled();

      // 6. Verify service called again with the same record ID
      expect(getContentSpy).toHaveBeenCalledTimes(2);
      expect(getContentSpy).toHaveBeenLastCalledWith("content-insight-101");

      // 8. Expected record content is displayed and error state is cleared
      const textAfterRetry = extractAllText(tree!.toJSON());
      expect(textAfterRetry).toContain("Shani Gochar in Kumbha Rashi");
      expect(textAfterRetry).toContain("Saturn transits into Aquarius");
      expect(textAfterRetry).not.toContain("Insight Not Available");
      expect(textAfterRetry).not.toContain("503 Gateway Unavailable");
    });
  });

  // ===========================================================================
  // B. RETRY FAILURE & REPEAT RECOVERY (Tests 9-13)
  // ===========================================================================
  describe("B. Retry Failure and Multi-Attempt Recovery", () => {
    test("9-13. Repeated failures remain visible and Retry remains available for subsequent attempts", async () => {
      const getContentSpy = jest.spyOn(astrologyService, "getContentById");

      // 9. Initial request fails
      getContentSpy.mockRejectedValueOnce(new Error("Initial Network Timeout"));

      let tree: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
      });

      expect(getContentSpy).toHaveBeenCalledTimes(1);
      let text = extractAllText(tree!.toJSON());
      expect(text).toContain("Initial Network Timeout");

      // 10. Tap Retry and make second request fail too
      getContentSpy.mockRejectedValueOnce(new Error("Second Service Failure"));

      let errorState = tree!.root.findByType(ErrorState);
      await act(async () => {
        errorState.props.onRetry();
      });

      expect(mockGoBack).not.toHaveBeenCalled();
      expect(getContentSpy).toHaveBeenCalledTimes(2);

      // 11 & 12. Error state remains visible and Retry is still available
      text = extractAllText(tree!.toJSON());
      expect(text).toContain("Insight Not Available");
      expect(text).toContain("Second Service Failure");
      expect(text).toContain("Try Again");

      // 13. Tap Retry a 3rd time; this time it succeeds
      getContentSpy.mockResolvedValueOnce(sampleContent);

      errorState = tree!.root.findByType(ErrorState);
      await act(async () => {
        errorState.props.onRetry();
      });

      expect(getContentSpy).toHaveBeenCalledTimes(3);
      expect(getContentSpy).toHaveBeenLastCalledWith("content-insight-101");

      text = extractAllText(tree!.toJSON());
      expect(text).toContain("Shani Gochar in Kumbha Rashi");
      expect(text).not.toContain("Insight Not Available");
    });
  });

  // ===========================================================================
  // C. LOADING AND REQUEST INTEGRITY (Tests 14-20)
  // ===========================================================================
  describe("C. Loading and Request Integrity", () => {
    test("14-16. Loading indicator displays while retry is pending and clears on success or failure", async () => {
      const getContentSpy = jest.spyOn(astrologyService, "getContentById");

      // First call fails immediately
      getContentSpy.mockRejectedValueOnce(new Error("Transient Error"));

      let tree: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
      });

      // Prepare deferred promise for retry
      const deferred = createDeferred<AstrologyContent>();
      getContentSpy.mockReturnValueOnce(deferred.promise);

      // Tap Retry
      const errorState = tree!.root.findByType(ErrorState);
      act(() => {
        errorState.props.onRetry();
      });

      // 14. Verify LoadingState appears while retry is pending
      const loadingInstance = tree!.root.findByType(LoadingState);
      expect(loadingInstance).toBeDefined();
      expect(extractAllText(tree!.toJSON())).toContain("Loading insight...");

      // 15. Resolve retry with success; verify LoadingState is cleared
      await act(async () => {
        deferred.resolve(sampleContent);
      });

      expect(tree!.root.findAllByType(LoadingState)).toHaveLength(0);
      expect(extractAllText(tree!.toJSON())).toContain("Shani Gochar in Kumbha Rashi");
    });

    test("16. Loading indicator clears after retry failure as well", async () => {
      const getContentSpy = jest.spyOn(astrologyService, "getContentById");
      getContentSpy.mockRejectedValueOnce(new Error("Error 1"));

      let tree: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
      });

      const deferred = createDeferred<AstrologyContent>();
      getContentSpy.mockReturnValueOnce(deferred.promise);

      const errorState = tree!.root.findByType(ErrorState);
      act(() => {
        errorState.props.onRetry();
      });

      // Loading state is active
      expect(tree!.root.findAllByType(LoadingState)).toHaveLength(1);

      // Reject retry
      await act(async () => {
        deferred.reject(new Error("Retry Failed"));
      });

      // Loading state cleared and error state restored
      expect(tree!.root.findAllByType(LoadingState)).toHaveLength(0);
      expect(extractAllText(tree!.toJSON())).toContain("Retry Failed");
    });

    test("17. Repeated rapid taps do not create redundant simultaneous requests if request is already in flight", async () => {
      const getContentSpy = jest.spyOn(astrologyService, "getContentById");
      getContentSpy.mockRejectedValueOnce(new Error("First Error"));

      let tree: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
      });

      expect(getContentSpy).toHaveBeenCalledTimes(1);

      const deferred = createDeferred<AstrologyContent>();
      getContentSpy.mockReturnValue(deferred.promise);

      const errorState = tree!.root.findByType(ErrorState);

      // Rapidly invoke onRetry multiple times while promise is pending
      act(() => {
        errorState.props.onRetry();
        errorState.props.onRetry();
        errorState.props.onRetry();
      });

      // Even with 3 rapid taps, only ONE retry request was initiated (total calls = 2: initial + 1 retry)
      expect(getContentSpy).toHaveBeenCalledTimes(2);

      // Settle the request
      await act(async () => {
        deferred.resolve(sampleContent);
      });

      expect(extractAllText(tree!.toJSON())).toContain("Shani Gochar in Kumbha Rashi");
    });

    test("18. Every retry uses currently selected record ID", async () => {
      mockRouteParams = { contentId: "custom-planet-888" };
      const getContentSpy = jest.spyOn(astrologyService, "getContentById");
      getContentSpy.mockRejectedValueOnce(new Error("Failed"));

      let tree: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
      });

      expect(getContentSpy).toHaveBeenLastCalledWith("custom-planet-888");

      getContentSpy.mockResolvedValueOnce({
        ...sampleContent,
        id: "custom-planet-888",
        title: "Ketu Gochar",
      });

      const errorState = tree!.root.findByType(ErrorState);
      await act(async () => {
        errorState.props.onRetry();
      });

      expect(getContentSpy).toHaveBeenLastCalledWith("custom-planet-888");
      expect(extractAllText(tree!.toJSON())).toContain("Ketu Gochar");
    });

    test("19. Stale request from previous route ID cannot overwrite current record", async () => {
      const getContentSpy = jest.spyOn(astrologyService, "getContentById");
      const deferred1 = createDeferred<AstrologyContent>();
      const deferred2 = createDeferred<AstrologyContent>();

      getContentSpy.mockReturnValueOnce(deferred1.promise);

      mockRouteParams = { contentId: "insight-A" };
      let tree: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
      });

      // Screen updates route params to insight-B while insight-A is still pending
      getContentSpy.mockReturnValueOnce(deferred2.promise);
      mockRouteParams = { contentId: "insight-B" };

      await act(async () => {
        // Force re-render with new route params
        tree.update(<AstrologyContentDetailScreen />);
      });

      // Resolve older request (insight-A) late
      await act(async () => {
        deferred1.resolve({ ...sampleContent, id: "insight-A", title: "Old Insight A" });
      });

      // Resolve newer request (insight-B)
      await act(async () => {
        deferred2.resolve({ ...sampleContent, id: "insight-B", title: "New Insight B" });
      });

      const text = extractAllText(tree!.toJSON());
      expect(text).toContain("New Insight B");
      expect(text).not.toContain("Old Insight A");
    });

    test("20. Obsolete request completing after unmount does not mutate state or cause unmount warnings", async () => {
      const getContentSpy = jest.spyOn(astrologyService, "getContentById");
      const deferred = createDeferred<AstrologyContent>();
      getContentSpy.mockReturnValueOnce(deferred.promise);

      let tree: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(<AstrologyContentDetailScreen />);
      });

      // Unmount while request is in flight
      act(() => {
        tree.unmount();
      });

      // Resolve promise after unmount; must resolve cleanly without React errors or exceptions
      await act(async () => {
        deferred.resolve(sampleContent);
      });

      expect(getContentSpy).toHaveBeenCalledTimes(1);
    });
  });
});
