// src/features/auth/AuthContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
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
import { dailyRashiService } from "../astrology/services/dailyRashiService.ts";
import { astrologyEventBus } from "../astrology/services/astrologyEventBus.ts";

const ASYNC_STORAGE_ACTIVE_MODE_KEY = "@kashiveda_active_mode";
const FOREGROUND_REFRESH_THROTTLE_MS = 30_000;

interface FetchUserDataOptions {
  isBackgroundRefresh?: boolean;
}

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

  // Synchronization and race-condition protection refs
  const isMountedRef = useRef<boolean>(true);
  const activeUserIdRef = useRef<string | null>(null);
  const latestRequestIdRef = useRef<number>(0);
  const lastForegroundRefreshRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus | string>(AppState.currentState || "active");

  const fetchUserData = useCallback(
    async (userId: string, options?: FetchUserDataOptions) => {
      const isBackgroundRefresh = options?.isBackgroundRefresh ?? false;
      const requestId = ++latestRequestIdRef.current;

      const isObsolete = () => {
        return (
          !isMountedRef.current ||
          activeUserIdRef.current !== userId ||
          latestRequestIdRef.current !== requestId
        );
      };

      try {
        if (!isBackgroundRefresh) {
          setError(null);
        }

        // 1. Fetch user profile
        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("id, display_name, phone, email, avatar_url, status, created_at, updated_at")
          .eq("id", userId)
          .maybeSingle();

        if (isObsolete()) return;

        if (profileErr) {
          console.warn("Could not load user profile:", profileErr.message);
        }

        // If user profile is marked deleted, immediately terminate session
        if (profileData?.status === "deleted") {
          activeUserIdRef.current = null;
          latestRequestIdRef.current++;
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
          setRoles(["customer"]);
          setActiveMode("customer");
          setPanditProfile(null);
          setError("This account has been deleted.");
          return;
        }

        setProfile(profileData || null);

        // 2. Authoritative multi-role resolution from public.user_roles (array query)
        const { data: roleRows, error: roleErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (isObsolete()) return;

        if (roleErr) {
          console.warn("Could not load user roles:", roleErr.message);
        }

        const assignedRoles = (roleRows || []).map((r) => r.role as UserRole);
        const effectiveRoles: UserRole[] = assignedRoles.length > 0 ? assignedRoles : ["customer"];
        setRoles(effectiveRoles);

        // 3. Resolve active mode from persistence while preserving valid existing mode
        try {
          const storedMode = await AsyncStorage.getItem(ASYNC_STORAGE_ACTIVE_MODE_KEY);
          if (isObsolete()) return;

          setActiveMode((prevMode) => {
            if (prevMode === "pandit" && effectiveRoles.includes("pandit")) {
              return "pandit";
            }
            if (storedMode === "pandit" && effectiveRoles.includes("pandit")) {
              return "pandit";
            }
            if (!effectiveRoles.includes("customer") && effectiveRoles.includes("pandit")) {
              return "pandit";
            }
            return "customer";
          });
        } catch (storageErr) {
          console.warn("Could not read active mode from storage:", storageErr);
          if (isObsolete()) return;

          setActiveMode((prevMode) => {
            if (prevMode === "pandit" && effectiveRoles.includes("pandit")) {
              return "pandit";
            }
            if (!effectiveRoles.includes("customer") && effectiveRoles.includes("pandit")) {
              return "pandit";
            }
            return "customer";
          });
        }

        // 4. If Pandit role is present, load Pandit profile details
        if (effectiveRoles.includes("pandit")) {
          const { data: panditData, error: panditErr } = await supabase
            .from("pandit_profiles")
            .select(
              "id, user_id, bio, years_experience, verification_status, public_status, kundli_enabled, kundli_price, kundli_turnaround_days, base_latitude, base_longitude, service_radius_km"
            )
            .eq("user_id", userId)
            .maybeSingle();

          if (isObsolete()) return;

          if (panditErr) {
            console.warn("Could not load pandit profile:", panditErr.message);
          }
          setPanditProfile(panditData || null);
        } else {
          setPanditProfile(null);
        }
      } catch (err: any) {
        if (isObsolete()) return;
        console.error("Unexpected error in fetchUserData:", err);
        if (!isBackgroundRefresh) {
          setError(err?.message || "Failed to load user information");
        }
      }
    },
    []
  );

  const refreshProfile = useCallback(async () => {
    if (activeUserIdRef.current) {
      await fetchUserData(activeUserIdRef.current);
    } else if (user?.id) {
      activeUserIdRef.current = user.id;
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

  // Manage foreground app state synchronization
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const prevAppState = appStateRef.current;
      const isTransitionToActive =
        (prevAppState === "inactive" || prevAppState === "background") &&
        nextAppState === "active";
      appStateRef.current = nextAppState;

      if (isTransitionToActive) {
        const currentUserId = activeUserIdRef.current;
        if (!currentUserId) return;

        const now = Date.now();
        if (now - lastForegroundRefreshRef.current >= FOREGROUND_REFRESH_THROTTLE_MS) {
          lastForegroundRefreshRef.current = now;
          fetchUserData(currentUserId, { isBackgroundRefresh: true });
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [fetchUserData]);

  useEffect(() => {
    isMountedRef.current = true;

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

        if (isMountedRef.current) {
          setSession(data.session);
          setUser(data.session?.user || null);

          if (data.session?.user?.id) {
            activeUserIdRef.current = data.session.user.id;
            lastForegroundRefreshRef.current = Date.now();
            await fetchUserData(data.session.user.id);
          } else {
            activeUserIdRef.current = null;
          }
        }
      } catch (err: any) {
        if (isMountedRef.current) {
          console.error("Session restoration error:", err);
          setError(err?.message || "Failed to restore session");
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // 2. Subscribe to Supabase auth state transitions
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMountedRef.current) return;

      setSession(newSession);
      setUser(newSession?.user || null);

      if (newSession?.user?.id) {
        activeUserIdRef.current = newSession.user.id;
        lastForegroundRefreshRef.current = Date.now();
        await fetchUserData(newSession.user.id);
      } else {
        const departingUserId = activeUserIdRef.current;
        activeUserIdRef.current = null;
        latestRequestIdRef.current++;
        astrologyEventBus.emit("ENTITLEMENT_INVALIDATED", { userId: departingUserId });
        dailyRashiService.clearSessionCache(departingUserId).catch(() => {});
        setProfile(null);
        setRoles(["customer"]);
        setActiveMode("customer");
        setPanditProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMountedRef.current = false;
      activeUserIdRef.current = null;
      subscription.unsubscribe();
    };
  }, [fetchUserData]);

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      const departingUserId = activeUserIdRef.current;
      activeUserIdRef.current = null;
      latestRequestIdRef.current++;

      // Strict Entitlement Policy (Option A): Purge daily insight caches and notify listeners immediately
      astrologyEventBus.emit("ENTITLEMENT_INVALIDATED", { userId: departingUserId });
      await dailyRashiService.clearSessionCache(departingUserId).catch(() => {});

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
      const departingUserId = activeUserIdRef.current;
      activeUserIdRef.current = null;
      latestRequestIdRef.current++;

      astrologyEventBus.emit("ENTITLEMENT_INVALIDATED", { userId: departingUserId });
      await dailyRashiService.clearSessionCache(departingUserId).catch(() => {});

      await authService.deleteAccount();
      await AsyncStorage.removeItem(ASYNC_STORAGE_ACTIVE_MODE_KEY).catch(() => {});
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
