// src/features/auth/services/authService.ts
import { Session, User } from "@supabase/supabase-js";
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { supabase } from "../../../infrastructure/supabase/client.ts";
import { getGoogleWebClientId } from "../../../infrastructure/supabase/config.ts";

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  isEmailConfirmationRequired?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

let isGoogleConfigured = false;

export const authService = {
  /**
   * Validate email string format.
   */
  isValidEmail(email: string): boolean {
    return Boolean(email && EMAIL_REGEX.test(email.trim()));
  },

  /**
   * Validate password requirements.
   */
  isValidPassword(password: string): boolean {
    return Boolean(password && password.length >= MIN_PASSWORD_LENGTH);
  },

  /**
   * Configure GoogleSignin SDK once with the Web OAuth Client ID.
   * Note: The Web Client ID must be used for native Google Sign-In, NOT the Android client ID.
   */
  configureGoogleSignIn(customWebClientId?: string): boolean {
    const webClientId = customWebClientId || getGoogleWebClientId();

    if (!webClientId || !webClientId.trim()) {
      console.warn("[Auth Diagnostic] Google webClientId configured: false");
      return false;
    }

    try {
      GoogleSignin.configure({
        webClientId: webClientId.trim(),
        offlineAccess: true,
        scopes: ["email", "profile"],
      });
      isGoogleConfigured = true;
      console.log("[Auth Diagnostic] Google webClientId configured: true");
      return true;
    } catch (err: any) {
      console.error("[Auth Diagnostic] GoogleSignin.configure error:", err?.message || err);
      return false;
    }
  },

  /**
   * Performs the native Google Sign-In flow on device and retrieves the Google ID token.
   * Then exchanges the ID token with Supabase using signInWithIdToken.
   * Never requires or exposes a Google client secret on the mobile device.
   */
  async signInWithGoogleNative(customWebClientId?: string): Promise<AuthResponse> {
    const webClientId =
      customWebClientId !== undefined ? customWebClientId : getGoogleWebClientId();

    console.log("[Auth Diagnostic] Google Sign-In flow started.");
    console.log("[Auth Diagnostic] Google webClientId configured:", Boolean(webClientId && webClientId.trim()));

    if (!webClientId || !webClientId.trim()) {
      throw new Error(
        "Google Sign-In requires a configured Google Web Client ID. Please provide EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID or set Google Web Client ID."
      );
    }

    if (!isGoogleConfigured) {
      this.configureGoogleSignIn(webClientId);
    }

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      if (isCancelledResponse(response)) {
        console.log("[Auth Diagnostic] Google sign-in was cancelled by user.");
        throw new Error("Google sign-in was cancelled.");
      }

      let idToken: string | null = null;

      if (isSuccessResponse(response)) {
        idToken = response.data.idToken;
      }

      // Fallback: If idToken was not in response.data, invoke getTokens()
      if (!idToken) {
        console.log("[Auth Diagnostic] idToken missing from signIn response data. Invoking GoogleSignin.getTokens()...");
        const tokens = await GoogleSignin.getTokens();
        idToken = tokens?.idToken || null;
      }

      console.log("[Auth Diagnostic] Google ID token present:", Boolean(idToken && idToken.trim()));
      console.log("[Auth Diagnostic] Google ID token length:", idToken ? idToken.length : 0);

      if (!idToken || !idToken.trim()) {
        throw new Error(
          "Google Sign-In did not return a valid Google ID token. Please verify Google Play Services and OAuth Web Client ID."
        );
      }

      // Exchange the valid native ID token directly with Supabase
      return await this.signInWithGoogle(idToken.trim());
    } catch (error: any) {
      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            console.log("[Auth Diagnostic] Google Sign-In cancelled (code: SIGN_IN_CANCELLED)");
            throw new Error("Google sign-in was cancelled.");
          case statusCodes.IN_PROGRESS:
            console.log("[Auth Diagnostic] Google Sign-In already in progress (code: IN_PROGRESS)");
            throw new Error("Google sign-in is already in progress.");
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            console.log("[Auth Diagnostic] Google Play Services unavailable (code: PLAY_SERVICES_NOT_AVAILABLE)");
            throw new Error("Google Play Services are unavailable or outdated.");
          default:
            console.error(`[Auth Diagnostic] Google Sign-In error code: ${error.code} | message: ${error.message}`);
            throw new Error(error.message || "Google Sign-In failed.");
        }
      }

      if (error?.message?.toLowerCase().includes("cancelled")) {
        throw error;
      }

      console.error("[Auth Diagnostic] Google Sign-In exception:", error?.message || error);
      throw error;
    }
  },

  /**
   * Register a new user with Email + Password.
   * Passes display_name in metadata which trigger public.handle_new_user() converts to public.profiles.
   */
  async signUpWithEmail(
    email: string,
    password: string,
    displayName: string
  ): Promise<AuthResponse> {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      throw new Error("Please enter your full name.");
    }

    if (!this.isValidEmail(trimmedEmail)) {
      throw new Error("Please enter a valid email address.");
    }

    if (!this.isValidPassword(password)) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          display_name: trimmedName,
          full_name: trimmedName,
        },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered") || error.message.toLowerCase().includes("unique")) {
        throw new Error("An account with this email already exists. Please sign in.");
      }
      throw new Error(error.message || "Failed to create account. Please try again.");
    }

    const isEmailConfirmationRequired = Boolean(data.user && !data.session);

    return {
      user: data.user,
      session: data.session,
      isEmailConfirmationRequired,
    };
  },

  /**
   * Authenticate existing user with Email + Password.
   */
  async signInWithEmail(email: string, password: string): Promise<AuthResponse> {
    const trimmedEmail = email.trim().toLowerCase();

    if (!this.isValidEmail(trimmedEmail)) {
      throw new Error("Please enter a valid email address.");
    }

    if (!password) {
      throw new Error("Please enter your password.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      if (
        error.message.toLowerCase().includes("invalid login credentials") ||
        error.message.toLowerCase().includes("invalid credentials")
      ) {
        throw new Error("Invalid email or password. Please check and try again.");
      }
      if (error.message.toLowerCase().includes("email not confirmed")) {
        throw new Error("Your email is not yet confirmed. Please check your inbox for the confirmation link.");
      }
      throw new Error(error.message || "Failed to sign in. Please try again.");
    }

    return {
      user: data.user,
      session: data.session,
    };
  },

  /**
   * Authenticate user with Google ID Token using Supabase native ID-token exchange.
   * Never requires or exposes a Google client secret on the mobile device.
   */
  async signInWithGoogle(idToken?: string): Promise<AuthResponse> {
    if (!idToken || !idToken.trim()) {
      throw new Error("Google Sign-In requires a valid Google ID token.");
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken.trim(),
    });

    if (error) {
      console.error("[Auth Diagnostic] Supabase signInWithIdToken error:", error.message, "status:", (error as any).status);
      if (error.message.toLowerCase().includes("unauthorized") || error.message.toLowerCase().includes("invalid")) {
        throw new Error("Google authentication token was rejected by server.");
      }
      throw new Error(error.message || "Google Sign-In failed. Please try again.");
    }

    return {
      user: data.user,
      session: data.session,
    };
  },

  /**
   * Request password reset email with deep link redirect to kashiveda://reset-password.
   */
  async sendPasswordResetEmail(email: string, redirectTo: string = "kashiveda://reset-password"): Promise<void> {
    const trimmedEmail = email.trim().toLowerCase();

    if (!this.isValidEmail(trimmedEmail)) {
      throw new Error("Please enter a valid email address.");
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo,
    });

    if (error) {
      throw new Error(error.message || "Failed to send reset email. Please try again.");
    }
  },

  /**
   * Update password for an authenticated recovery session.
   */
  async updatePassword(newPassword: string): Promise<void> {
    if (!this.isValidPassword(newPassword)) {
      throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      throw new Error(error.message || "Failed to update password. Please try again.");
    }
  },

  /**
   * Sign out current user.
   */
  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message || "Failed to sign out.");
    }
  },

  /**
   * Securely mark customer account as deleted and terminate authenticated session.
   * Enforced via Supabase RLS (profiles_update_own policy: id = auth.uid()).
   */
  async deleteAccount(): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("No authenticated user session found to delete.");
    }

    // 1. Check for active/in_progress bookings where user is customer
    const { data: activeBookings, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("customer_id", user.id)
      .in("status", ["pending", "confirmed", "in_progress"])
      .limit(1);

    if (!bookingErr && activeBookings && activeBookings.length > 0) {
      throw new Error(
        "Cannot delete account while you have active or in-progress ritual bookings. Please complete or cancel your pending rituals first."
      );
    }

    // 2. Mark profile as deleted (authoritative soft delete using existing profile_status enum)
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ status: "deleted" })
      .eq("id", user.id);

    if (profileErr) {
      throw new Error(profileErr.message || "Failed to mark profile as deleted.");
    }

    // 3. If Pandit profile exists, set public status to unavailable
    await supabase
      .from("pandit_profiles")
      .update({ public_status: "unavailable" })
      .eq("user_id", user.id);

    // 4. Terminate Google Sign-In session if active
    try {
      if (isGoogleConfigured) {
        await GoogleSignin.signOut();
      }
    } catch {
      // Ignore Google signout failure if not signed in via Google
    }

    // 5. Terminate Supabase Auth session
    const { error: signOutErr } = await supabase.auth.signOut();
    if (signOutErr) {
      throw new Error(
        signOutErr.message || "Account marked as deleted, but session revocation encountered an issue."
      );
    }
  },
};
