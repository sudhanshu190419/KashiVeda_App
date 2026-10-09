// src/features/auth/AuthContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "../../infrastructure/supabase/client.ts";
import {
  AppUserMode,
  AuthContextType,
  PanditProfile,
  Profile,
  UserRole,
} from "./types/auth.ts";
import { authService } from "./services/authService.ts";

const ASYNC_STORAGE_ACTIVE_MODE_KEY = "@kashiveda_active_mode";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>(["customer"]);
  const [activeMode, setActiveMode] = useState<AppUserMode>("customer");
  const [panditProfile, setPanditProfile] = useState<PanditProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      setError(null);

      // 1. Fetch user profile
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, display_name, phone, email, avatar_url, status, created_at, updated_at")
        .eq("id", userId)
        .maybeSingle();

      if (profileErr) {
        console.warn("Could not load user profile:", profileErr.message);
      }

      // If user profile is marked deleted, immediately terminate session
      if (profileData?.status === "deleted") {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setError("This account has been deleted.");
        return;
      }

      setProfile(profileData || null);

      // 2. Authoritative multi-role resolution from public.user_roles (array query)
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (roleErr) {
        console.warn("Could not load user roles:", roleErr.message);
      }

      const assignedRoles = (roleRows || []).map((r) => r.role as UserRole);
      const effectiveRoles: UserRole[] = assignedRoles.length > 0 ? assignedRoles : ["customer"];
      setRoles(effectiveRoles);

      // 3. Resolve active mode from persistence
      try {
        const storedMode = await AsyncStorage.getItem(ASYNC_STORAGE_ACTIVE_MODE_KEY);
        if (storedMode === "pandit" && effectiveRoles.includes("pandit")) {
          setActiveMode("pandit");
        } else if (!effectiveRoles.includes("customer") && effectiveRoles.includes("pandit")) {
          setActiveMode("pandit");
        } else {
          setActiveMode("customer");
        }
      } catch (storageErr) {
        console.warn("Could not read active mode from storage:", storageErr);
        if (!effectiveRoles.includes("customer") && effectiveRoles.includes("pandit")) {
          setActiveMode("pandit");
        } else {
          setActiveMode("customer");
        }
      }

      // 4. If Pandit role is present, load Pandit profile details
      if (effectiveRoles.includes("pandit")) {
        const { data: panditData, error: panditErr } = await supabase
          .from("pandit_profiles")
          .select("id, user_id, bio, years_experience, verification_status, public_status, kundli_enabled, kundli_price, kundli_turnaround_days, base_latitude, base_longitude, service_radius_km")
          .eq("user_id", userId)
          .maybeSingle();

        if (panditErr) {
          console.warn("Could not load pandit profile:", panditErr.message);
        }
        setPanditProfile(panditData || null);
      } else {
        setPanditProfile(null);
      }
    } catch (err: any) {
      console.error("Unexpected error in fetchUserData:", err);
      setError(err?.message || "Failed to load user information");
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchUserData(user.id);
    }
  }, [user?.id, fetchUserData]);

  const setActiveModeHandler = useCallback(
    async (newMode: AppUserMode) => {
      if (newMode === "pandit" && !roles.includes("pandit")) {
        throw new Error(
          "Cannot switch to Pandit mode: Account does not have an approved Pandit role."
        );
      }

      setActiveMode(newMode);
      try {
        await AsyncStorage.setItem(ASYNC_STORAGE_ACTIVE_MODE_KEY, newMode);
      } catch (err) {
        console.warn("Failed to persist active mode:", err);
      }
    },
    [roles]
  );

  const hasRole = useCallback(
    (targetRole: UserRole): boolean => {
      return roles.includes(targetRole);
    },
    [roles]
  );

  useEffect(() => {
    let isMounted = true;

    // 0. Pre-configure native Google Sign-In SDK
    authService.configureGoogleSignIn();

    // 1. Restore persisted session on launch
    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        const { data, error: sessionErr } = await supabase.auth.getSession();

        if (sessionErr) {
          throw sessionErr;
        }

        if (isMounted) {
          setSession(data.session);
          setUser(data.session?.user || null);

          if (data.session?.user?.id) {
            await fetchUserData(data.session.user.id);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Session restoration error:", err);
          setError(err?.message || "Failed to restore session");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // 2. Subscribe to Supabase auth state transitions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;

      setSession(newSession);
      setUser(newSession?.user || null);

      if (newSession?.user?.id) {
        await fetchUserData(newSession.user.id);
      } else {
        setProfile(null);
        setRoles(["customer"]);
        setActiveMode("customer");
        setPanditProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      await supabase.auth.signOut();
      await AsyncStorage.removeItem(ASYNC_STORAGE_ACTIVE_MODE_KEY).catch(() => {});
      setSession(null);
      setUser(null);
      setProfile(null);
      setRoles(["customer"]);
      setActiveMode("customer");
      setPanditProfile(null);
    } catch (err: any) {
      console.error("SignOut error:", err);
      setError(err?.message || "Failed to sign out");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await authService.deleteAccount();
      await AsyncStorage.removeItem(ASYNC_STORAGE_ACTIVE_MODE_KEY);
      setSession(null);
      setUser(null);
      setProfile(null);
      setRoles(["customer"]);
      setActiveMode("customer");
      setPanditProfile(null);
    } catch (err: any) {
      console.error("DeleteAccount error:", err);
      setError(err?.message || "Failed to delete account");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Compute effective single role for backward compatibility
  const effectiveRole: UserRole | null = roles.includes("admin") || roles.includes("super_admin")
    ? (roles.includes("super_admin") ? "super_admin" : "admin")
    : (activeMode === "pandit" || !roles.includes("customer")) && roles.includes("pandit")
    ? "pandit"
    : "customer";

  const canSwitchToPanditMode =
    roles.includes("pandit") &&
    (panditProfile?.verification_status === "approved" ||
      panditProfile?.verification_status === "verified");

  const value: AuthContextType = {
    session,
    user,
    profile,
    roles,
    role: effectiveRole,
    activeMode,
    canSwitchToPanditMode,
    panditProfile,
    isLoading,
    error,
    signOut,
    deleteAccount,
    refreshProfile,
    setProfile,
    setActiveMode: setActiveModeHandler,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
