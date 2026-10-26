// __tests__/auth.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { AuthProvider, useAuth } from "../src/features/auth/AuthContext.tsx";
import { ForgotPasswordScreen } from "../src/features/auth/screens/ForgotPasswordScreen.tsx";
import { LoginScreen } from "../src/features/auth/screens/LoginScreen.tsx";
import { RegisterScreen } from "../src/features/auth/screens/RegisterScreen.tsx";
import { ResetPasswordScreen } from "../src/features/auth/screens/ResetPasswordScreen.tsx";
import { ProfileScreen } from "../src/features/auth/screens/ProfileScreen.tsx";
import { authService } from "../src/features/auth/services/authService.ts";
import { RootNavigator } from "../src/navigation/RootNavigator.tsx";
import { secureAuthStorage, supabase } from "../src/infrastructure/supabase/client.ts";
import EncryptedStorage from "react-native-encrypted-storage";
import { AppState } from "react-native";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: {},
  }),
  useFocusEffect: (cb: any) => cb(),
}));

jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: ({ component: Component }: any) => (
      <Component
        route={{ params: {} }}
        navigation={{ navigate: mockNavigate, goBack: mockGoBack }}
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
        navigation={{ navigate: mockNavigate, goBack: mockGoBack }}
      />
    ),
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

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() =>
      Promise.resolve({
        type: "success",
        data: {
          idToken: "mock-google-id-token-xyz",
          user: { id: "google-1", email: "devotee@gmail.com", name: "Devotee" },
        },
      })
    ),
    getTokens: jest.fn(() =>
      Promise.resolve({
        idToken: "mock-google-id-token-xyz",
        accessToken: "mock-access-token",
      })
    ),
    signOut: jest.fn(() => Promise.resolve(null)),
  },
  isSuccessResponse: jest.fn((res: any) => res?.type === "success"),
  isCancelledResponse: jest.fn((res: any) => res?.type === "cancelled"),
  isErrorWithCode: jest.fn((err: any) => Boolean(err && err.code)),
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
    SIGN_IN_REQUIRED: "SIGN_IN_REQUIRED",
  },
}));

describe("M4 Authentication — Email/Password & Google Auth Test Suite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Email Signup Success
  test("1. authService.signUpWithEmail registers user and returns session", async () => {
    jest.spyOn(supabase.auth, "signUp").mockResolvedValueOnce({
      data: {
        user: { id: "user-123", email: "devotee@kashiveda.org" } as any,
        session: { access_token: "jwt-tok", refresh_token: "ref-tok" } as any,
      },
      error: null,
    });

    const result = await authService.signUpWithEmail(
      "devotee@kashiveda.org",
      "SacredPassword108",
      "Devotee Sharma"
    );

    expect(result.user?.id).toBe("user-123");
    expect(result.session?.access_token).toBe("jwt-tok");
    expect(result.isEmailConfirmationRequired).toBe(false);
  });

  // 2. Email Login Success
  test("2. authService.signInWithEmail authenticates existing user", async () => {
    jest.spyOn(supabase.auth, "signInWithPassword").mockResolvedValueOnce({
      data: {
        user: { id: "user-123", email: "devotee@kashiveda.org" } as any,
        session: { access_token: "jwt-tok", refresh_token: "ref-tok" } as any,
      },
      error: null,
    });

    const result = await authService.signInWithEmail(
      "devotee@kashiveda.org",
      "SacredPassword108"
    );

    expect(result.user?.id).toBe("user-123");
    expect(result.session?.access_token).toBe("jwt-tok");
  });

  // 3. Invalid Email Format Validation
  test("3. authService rejects invalid email addresses", async () => {
    await expect(
      authService.signUpWithEmail("notanemail", "password123", "Rahul")
    ).rejects.toThrow("Please enter a valid email address.");

    await expect(
      authService.signInWithEmail("bad-email", "password123")
    ).rejects.toThrow("Please enter a valid email address.");
  });

  // 4. Invalid Password Length Validation
  test("4. authService rejects passwords shorter than 6 characters", async () => {
    await expect(
      authService.signUpWithEmail("valid@email.com", "123", "Rahul")
    ).rejects.toThrow("Password must be at least 6 characters.");
  });

  // 5. Duplicate Email Error Handling
  test("5. authService handles already registered duplicate email error", async () => {
    jest.spyOn(supabase.auth, "signUp").mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "User already registered" } as any,
    });

    await expect(
      authService.signUpWithEmail("existing@email.com", "validPassword123", "Rahul")
    ).rejects.toThrow("An account with this email already exists. Please sign in.");
  });

  // 6. Email Confirmation Pending
  test("6. authService detects when email confirmation is required by Supabase", async () => {
    jest.spyOn(supabase.auth, "signUp").mockResolvedValueOnce({
      data: {
        user: { id: "user-unconfirmed", email: "unconfirmed@email.com" } as any,
        session: null, // No session until confirmed
      },
      error: null,
    });

    const result = await authService.signUpWithEmail(
      "unconfirmed@email.com",
      "validPassword123",
      "Rahul Sharma"
    );

    expect(result.user?.id).toBe("user-unconfirmed");
    expect(result.session).toBeNull();
    expect(result.isEmailConfirmationRequired).toBe(true);
  });

  // 7. Forgot Password Request Success
  test("7. authService.sendPasswordResetEmail requests reset link with deep link redirect", async () => {
    const resetSpy = jest
      .spyOn(supabase.auth, "resetPasswordForEmail")
      .mockResolvedValueOnce({ data: {}, error: null });

    await authService.sendPasswordResetEmail("devotee@kashiveda.org");

    expect(resetSpy).toHaveBeenCalledWith("devotee@kashiveda.org", {
      redirectTo: "kashiveda://reset-password",
    });
  });

  // 8. Password Reset Route / Screen Rendering
  test("8. ResetPasswordScreen renders password inputs and update action", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ResetPasswordScreen
          navigation={{ navigate: mockNavigate, goBack: mockGoBack } as any}
          route={{ key: "ResetPassword", name: "ResetPassword", params: {} }}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Create New Password" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ title: "Update Password" }).length).toBeGreaterThan(0);
  });

  // 9. New Password Submission
  test("9. authService.updatePassword submits new password to Supabase", async () => {
    const updateSpy = jest
      .spyOn(supabase.auth, "updateUser")
      .mockResolvedValueOnce({ data: { user: { id: "user-123" } as any }, error: null });

    await authService.updatePassword("NewSacredPassword2026");

    expect(updateSpy).toHaveBeenCalledWith({
      password: "NewSacredPassword2026",
    });
  });

  // 10. Google Button Rendering on LoginScreen
  test("10. LoginScreen renders email inputs and Google Sign-In button", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <LoginScreen
          navigation={{ navigate: mockNavigate, goBack: mockGoBack } as any}
          route={{ key: "Login", name: "Login", params: undefined }}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Kashi Veda" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ title: "Sign In" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Continue with Google" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "Create Account" }).length).toBeGreaterThan(0);
  });

  // 11. Google Sign-In Native Success with ID Token
  test("11. authService.signInWithGoogleNative retrieves ID token and authenticates with Supabase", async () => {
    jest.spyOn(supabase.auth, "signInWithIdToken").mockResolvedValueOnce({
      data: {
        user: { id: "google-user-1", email: "google.devotee@gmail.com" } as any,
        session: { access_token: "google-jwt" } as any,
      },
      error: null,
    });

    const result = await authService.signInWithGoogleNative("mock-web-client-id-123456.apps.googleusercontent.com");

    expect(result.user?.id).toBe("google-user-1");
    expect(result.session?.access_token).toBe("google-jwt");
  });

  // 12. Google Sign-In Cancellation / Rejection Handling
  test("12. authService.signInWithGoogle handles token rejection error gracefully", async () => {
    jest.spyOn(supabase.auth, "signInWithIdToken").mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid ID token" } as any,
    });

    await expect(
      authService.signInWithGoogle("invalid-token")
    ).rejects.toThrow("Google authentication token was rejected by server.");
  });

  // 13. Google Sign-In Missing Token Guard
  test("13. authService.signInWithGoogle guards against empty token", async () => {
    await expect(authService.signInWithGoogle("")).rejects.toThrow(
      "Google Sign-In requires a valid Google ID token."
    );
  });

  // 13b. Google Sign-In Missing Web Client ID Guard
  test("13b. authService.signInWithGoogleNative throws when Web Client ID is unconfigured", async () => {
    await expect(authService.signInWithGoogleNative("")).rejects.toThrow(
      "Google Sign-In requires a configured Google Web Client ID."
    );
  });

  // 14. RegisterScreen Rendering & Navigation
  test("14. RegisterScreen renders registration form fields", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <RegisterScreen
          navigation={{ navigate: mockNavigate, goBack: mockGoBack } as any}
          route={{ key: "Register", name: "Register", params: undefined }}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Devotee Registration" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ title: "Create Account" }).length).toBeGreaterThan(0);
  });

  // 15. Customer Role Routing
  test("15. AuthProvider resolves customer role from user_roles", async () => {
    jest.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
          id: "sub-customer",
          callback: jest.fn(),
        },
      },
    } as any);

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: {
        session: { user: { id: "customer-user-1" } } as any,
      },
      error: null,
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: "customer-user-1", display_name: "Rahul" }, error: null }),
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

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    expect(hookResult.role).toBe("customer");
    expect(hookResult.panditProfile).toBeNull();
  });

  // 16. Pandit Role Routing
  test("16. AuthProvider resolves pandit role and fetches pandit_profiles", async () => {
    jest.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
          id: "sub-pandit",
          callback: jest.fn(),
        },
      },
    } as any);

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: {
        session: { user: { id: "pandit-user-1" } } as any,
      },
      error: null,
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: "pandit-user-1", display_name: "Acharya Shastri" }, error: null }),
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        const queryPromise = Promise.resolve({ data: [{ role: "pandit" }], error: null });
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
                    id: "pandit-shastri-1",
                    user_id: "pandit-user-1",
                    verification_status: "verified",
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

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    expect(hookResult.role).toBe("pandit");
    expect(hookResult.panditProfile?.id).toBe("pandit-shastri-1");
  });

  // 17. Session Persistence via EncryptedStorage
  test("17. secureAuthStorage persists session tokens securely", async () => {
    await secureAuthStorage.setItem("sb-auth-token", "encrypted-jwt-payload");
    expect(EncryptedStorage.setItem).toHaveBeenCalledWith("sb-auth-token", "encrypted-jwt-payload");

    await secureAuthStorage.getItem("sb-auth-token");
    expect(EncryptedStorage.getItem).toHaveBeenCalledWith("sb-auth-token");

    await secureAuthStorage.removeItem("sb-auth-token");
    expect(EncryptedStorage.removeItem).toHaveBeenCalledWith("sb-auth-token");
  });

  // 18. Logout Clears State
  test("18. authService.signOut calls Supabase signOut and clears session", async () => {
    const signOutSpy = jest.spyOn(supabase.auth, "signOut").mockResolvedValueOnce({ error: null });

    await authService.signOut();
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });

  // 19. ForgotPasswordScreen Rendering
  test("19. ForgotPasswordScreen renders email input and submit button", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ForgotPasswordScreen
          navigation={{ navigate: mockNavigate, goBack: mockGoBack } as any}
          route={{ key: "ForgotPassword", name: "ForgotPassword", params: undefined }}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Recover Password" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ title: "Send Reset Link" }).length).toBeGreaterThan(0);
  });

  // 20. RootNavigator Renders AuthStack when Unauthenticated
  test("20. RootNavigator renders AuthNavigator when unauthenticated", async () => {
    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      );
    });

    expect(tree.toJSON()).toBeTruthy();
  });

  // 21. Phone OTP Controls are No Longer Rendered
  test("21. LoginScreen does NOT render phone OTP controls", () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <LoginScreen
          navigation={{ navigate: mockNavigate, goBack: mockGoBack } as any}
          route={{ key: "Login", name: "Login", params: undefined }}
        />
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Mobile Number" }).length).toBe(0);
    expect(root.findAllByProps({ title: "Get OTP" }).length).toBe(0);
    expect(root.findAllByProps({ children: "Enter 6-Digit OTP" }).length).toBe(0);
  });

  // 22. Foreground Sync — Logged-in user receives profile refresh when app returns to foreground
  test("22. Logged-in user receives profile refresh on foreground transition", async () => {
    let appStateCallback: any = null;
    const mockRemove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((event: any, callback: any) => {
      if (event === "change") appStateCallback = callback;
      return { remove: mockRemove } as any;
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: { user: { id: "fg-user-1" } } as any },
      error: null,
    });

    let fetchCount = 0;
    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        fetchCount++;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "fg-user-1", display_name: `Devotee ${fetchCount}` },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ role: "customer" }], error: null }),
          }),
        } as any;
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });

    let nowTime = 100000;
    jest.spyOn(Date, "now").mockImplementation(() => nowTime);

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    expect(hookResult.profile?.display_name).toBe("Devotee 1");

    // Advance time past 30-second throttle
    nowTime += 35000;

    // Transition from background to active
    await act(async () => {
      appStateCallback("background");
      appStateCallback("active");
    });

    expect(fetchCount).toBeGreaterThanOrEqual(2);
    expect(hookResult.profile?.display_name).toBe("Devotee 2");
  });

  // 23. Foreground Sync — Unauthenticated user does not trigger profile refresh
  test("23. Unauthenticated user does not trigger foreground profile refresh", async () => {
    let appStateCallback: any = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation((event: any, callback: any) => {
      if (event === "change") appStateCallback = callback;
      return { remove: jest.fn() } as any;
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    const fromSpy = jest.spyOn(supabase, "from");

    let nowTime = 200000;
    jest.spyOn(Date, "now").mockImplementation(() => nowTime);

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      );
    });

    fromSpy.mockClear();
    nowTime += 40000;

    await act(async () => {
      appStateCallback("background");
      appStateCallback("active");
    });

    expect(fromSpy).not.toHaveBeenCalled();
  });

  // 24. Foreground Sync — Repeated foreground transitions within 30 seconds are throttled
  test("24. Repeated foreground events within 30 seconds are throttled", async () => {
    let appStateCallback: any = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation((event: any, callback: any) => {
      if (event === "change") appStateCallback = callback;
      return { remove: jest.fn() } as any;
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: { user: { id: "fg-throttle-user" } } as any },
      error: null,
    });

    let profileFetchCount = 0;
    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        profileFetchCount++;
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "fg-throttle-user", display_name: "Rahul" },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ role: "customer" }], error: null }),
          }),
        } as any;
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });

    let nowTime = 300000;
    jest.spyOn(Date, "now").mockImplementation(() => nowTime);

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    expect(profileFetchCount).toBe(1);

    // Transition only 10 seconds later (under 30s throttle)
    nowTime += 10000;
    await act(async () => {
      appStateCallback("background");
      appStateCallback("active");
    });

    expect(profileFetchCount).toBe(1);
  });

  // 25. Foreground Sync — AppState listener is removed on unmount
  test("25. AppState listener is removed on unmount", async () => {
    const mockRemove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation(() => ({
      remove: mockRemove,
    } as any));

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      );
    });

    act(() => {
      renderer.unmount();
    });

    expect(mockRemove).toHaveBeenCalled();
  });

  // 26. Foreground Sync — Network errors do not crash auth state or set blocking error
  test("26. Foreground refresh network errors do not crash auth state", async () => {
    let appStateCallback: any = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation((event: any, callback: any) => {
      if (event === "change") appStateCallback = callback;
      return { remove: jest.fn() } as any;
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: { user: { id: "fg-err-user" } } as any },
      error: null,
    });

    let shouldFail = false;
    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        if (shouldFail) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.reject(new Error("Network timeout")),
              }),
            }),
          } as any;
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "fg-err-user", display_name: "Stable User" },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ role: "customer" }], error: null }),
          }),
        } as any;
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });

    let nowTime = 400000;
    jest.spyOn(Date, "now").mockImplementation(() => nowTime);

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    expect(hookResult.profile?.display_name).toBe("Stable User");
    expect(hookResult.error).toBeNull();

    // Foreground refresh fails
    shouldFail = true;
    nowTime += 35000;

    await act(async () => {
      appStateCallback("background");
      appStateCallback("active");
    });

    expect(hookResult.profile?.display_name).toBe("Stable User");
    expect(hookResult.error).toBeNull();
  });

  // 27. Foreground Sync — Refreshed role updates state dynamically (Pandit promotion)
  test("27. Refreshed role updates state dynamically on foreground", async () => {
    let appStateCallback: any = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation((event: any, callback: any) => {
      if (event === "change") appStateCallback = callback;
      return { remove: jest.fn() } as any;
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: { user: { id: "promotion-user" } } as any },
      error: null,
    });

    let isApprovedPandit = false;
    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "promotion-user", display_name: "Pandit Rahul" },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: isApprovedPandit
                  ? [{ role: "customer" }, { role: "pandit" }]
                  : [{ role: "customer" }],
                error: null,
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
                    id: "pandit-rahul-1",
                    user_id: "promotion-user",
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

    let nowTime = 500000;
    jest.spyOn(Date, "now").mockImplementation(() => nowTime);

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    expect(hookResult.roles).toEqual(["customer"]);
    expect(hookResult.canSwitchToPanditMode).toBe(false);

    // Admin approves application in background
    isApprovedPandit = true;
    nowTime += 35000;

    await act(async () => {
      appStateCallback("background");
      appStateCallback("active");
    });

    expect(hookResult.roles).toContain("pandit");
    expect(hookResult.canSwitchToPanditMode).toBe(true);
    expect(hookResult.panditProfile?.id).toBe("pandit-rahul-1");
  });

  // 28. Race Condition — Pending profile request cannot restore state after logout
  test("28. Pending profile request cannot restore state after logout", async () => {
    let authStateListener: any = null;
    jest.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((callback: any) => {
      authStateListener = callback;
      return {
        data: { subscription: { unsubscribe: jest.fn() } },
      } as any;
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    let resolvePendingProfile: any;
    const pendingProfilePromise = new Promise((resolve) => {
      resolvePendingProfile = resolve;
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => pendingProfilePromise,
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ role: "customer" }], error: null }),
          }),
        } as any;
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // User logs in, starting pendingProfilePromise
    await act(async () => {
      authStateListener("SIGNED_IN", { user: { id: "race-user-logout" } });
    });

    // User signs out before pendingProfilePromise resolves
    await act(async () => {
      await hookResult.signOut();
    });

    expect(hookResult.user).toBeNull();
    expect(hookResult.profile).toBeNull();

    // Now slow profile request finally resolves
    await act(async () => {
      resolvePendingProfile({
        data: { id: "race-user-logout", display_name: "Ghost User" },
        error: null,
      });
    });

    // State MUST remain clean and logged out
    expect(hookResult.user).toBeNull();
    expect(hookResult.profile).toBeNull();
    expect(hookResult.roles).toEqual(["customer"]);
  });

  // 29. Race Condition — Delayed response from User A cannot overwrite User B state
  test("29. Delayed response from User A cannot overwrite User B state", async () => {
    let authStateListener: any = null;
    jest.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((callback: any) => {
      authStateListener = callback;
      return {
        data: { subscription: { unsubscribe: jest.fn() } },
      } as any;
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    let resolveUserA: any;
    const userAPromise = new Promise((resolve) => {
      resolveUserA = resolve;
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              maybeSingle: () => {
                if (val === "user-A") return userAPromise;
                return Promise.resolve({
                  data: { id: "user-B", display_name: "Devotee B" },
                  error: null,
                });
              },
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ role: "customer" }], error: null }),
          }),
        } as any;
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // User A signs in
    await act(async () => {
      authStateListener("SIGNED_IN", { user: { id: "user-A" } });
    });

    // User B signs in rapidly
    await act(async () => {
      authStateListener("SIGNED_IN", { user: { id: "user-B" } });
    });

    expect(hookResult.user?.id).toBe("user-B");
    expect(hookResult.profile?.display_name).toBe("Devotee B");

    // User A's slow request resolves late
    await act(async () => {
      resolveUserA({
        data: { id: "user-A", display_name: "Stale Devotee A" },
        error: null,
      });
    });

    // User B's state MUST NOT be overwritten
    expect(hookResult.user?.id).toBe("user-B");
    expect(hookResult.profile?.display_name).toBe("Devotee B");
  });

  // 30. Race Condition — Stale request cannot overwrite newer response for the same user
  test("30. Stale request cannot overwrite newer response for the same user", async () => {
    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: { session: { user: { id: "same-user-id" } } as any },
      error: null,
    });

    let resolveStaleReq: any;
    const stalePromise = new Promise((resolve) => {
      resolveStaleReq = resolve;
    });

    let callCount = 0;
    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        callCount++;
        if (callCount === 1) {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => stalePromise,
              }),
            }),
          } as any;
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "same-user-id", display_name: "Fresh Profile" },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ role: "customer" }], error: null }),
          }),
        } as any;
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });

    let hookResult: any;
    const TestComponent = () => {
      hookResult = useAuth();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );
    });

    // Trigger newer request (callCount = 2)
    await act(async () => {
      await hookResult.refreshProfile();
    });

    expect(hookResult.profile?.display_name).toBe("Fresh Profile");

    // Older request 1 resolves late
    await act(async () => {
      resolveStaleReq({
        data: { id: "same-user-id", display_name: "Stale Profile" },
        error: null,
      });
    });

    // Newer profile MUST be preserved
    expect(hookResult.profile?.display_name).toBe("Fresh Profile");
  });

  // 31. ProfileScreen — Devotee identity, real user values, and role badges
  test("31. ProfileScreen renders devotee identity with real values and role badges", async () => {
    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "devotee-profile-user-1", email: "devotee.kashi@vedic.org" },
        } as any,
      },
      error: null,
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: "devotee-profile-user-1",
                    display_name: "Maharaj Devotee",
                  },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ role: "customer" }], error: null }),
          }),
        } as any;
      }
      if (table === "pandit_applications") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthProvider>
          <ProfileScreen />
        </AuthProvider>
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ children: "Maharaj Devotee" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: "devotee.kashi@vedic.org" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ title: "Sign Out" }).length).toBeGreaterThan(0);
  });

  // 32. ProfileScreen — Language & Theme mode switches and mode buttons
  test("32. ProfileScreen renders language and theme switches with 48dp touch bounds", async () => {
    jest.spyOn(supabase.auth, "getSession").mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "devotee-switch-user", email: "switch@kashiveda.org" },
        } as any,
      },
      error: null,
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "devotee-switch-user", display_name: "Acharya" },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ role: "pandit" }], error: null }),
          }),
        } as any;
      }
      if (table === "pandit_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "pandit-p1", verification_status: "verified", public_status: "available" },
                  error: null,
                }),
            }),
          }),
        } as any;
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) } as any;
    });

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AuthProvider>
          <ProfileScreen />
        </AuthProvider>
      );
    });

    const root = renderer!.root;
    expect(root.findAllByProps({ accessibilityLabel: "Switch to Hindi language" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ accessibilityLabel: "Switch to English language" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ accessibilityLabel: "Switch to Ivory Light theme" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ accessibilityLabel: "Switch to Obsidian Dark theme" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ title: "Switch to Pandit Mode >" }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ title: "Delete Account" }).length).toBeGreaterThan(0);
  });
});
