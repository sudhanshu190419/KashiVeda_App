// __tests__/auth.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { AuthProvider, useAuth } from "../src/features/auth/AuthContext.tsx";
import { ForgotPasswordScreen } from "../src/features/auth/screens/ForgotPasswordScreen.tsx";
import { LoginScreen } from "../src/features/auth/screens/LoginScreen.tsx";
import { RegisterScreen } from "../src/features/auth/screens/RegisterScreen.tsx";
import { ResetPasswordScreen } from "../src/features/auth/screens/ResetPasswordScreen.tsx";
import { authService } from "../src/features/auth/services/authService.ts";
import { RootNavigator } from "../src/navigation/RootNavigator.tsx";
import { secureAuthStorage, supabase } from "../src/infrastructure/supabase/client.ts";
import EncryptedStorage from "react-native-encrypted-storage";

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
});
