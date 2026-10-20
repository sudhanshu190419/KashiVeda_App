// src/features/astrology/hooks/useDailyRashiInsight.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuth } from "../../auth/AuthContext.tsx";
import {
  getIndianCalendarDate,
  getMsUntilNextIndianMidnight,
} from "../../../shared/utils/date.ts";
import { dailyRashiService, PreferenceSyncStatus } from "../services/dailyRashiService.ts";
import {
  CANONICAL_RASHIS,
  DailyRashiInsight,
  getRashiById,
  RashiDefinition,
} from "../types/rashi.types.ts";
import { astrologyEventBus, AstrologyEventPayload } from "../services/astrologyEventBus.ts";

const DEDUPLICATION_INTERVAL_MS = 2000;

export interface UseDailyRashiInsightResult {
  selectedRashiId: number;
  selectedRashi: RashiDefinition;
  insight: DailyRashiInsight | null;
  isEntitled: boolean;
  isUnverifiedOffline: boolean;
  loading: boolean;
  isChangingRashi: boolean;
  error: string | null;
  selectRashi: (rashiId: number) => Promise<void>;
  refresh: (options?: { force?: boolean; revalidate?: boolean }) => Promise<void>;
  syncStatus?: PreferenceSyncStatus;
  retrySync?: () => Promise<void>;
}

export function useDailyRashiInsight(initialRashiId?: number): UseDailyRashiInsightResult {
  const { user } = useAuth();

  const [selectedRashiId, setSelectedRashiId] = useState<number>(initialRashiId || 1);
  const [insight, setInsight] = useState<DailyRashiInsight | null>(null);
  const [isEntitled, setIsEntitled] = useState<boolean>(false);
  const [isUnverifiedOffline, setIsUnverifiedOffline] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isChangingRashi, setIsChangingRashi] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<PreferenceSyncStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const latestSaveIdRef = useRef<number>(0);

  // Concurrency, session-identity, selected-rashi, date, and lifecycle synchronization refs
  const isMountedRef = useRef<boolean>(true);
  const activeUserIdRef = useRef<string | null>(user?.id || null);
  const activeRashiIdRef = useRef<number>(initialRashiId || 1);
  const activeInsightDateRef = useRef<string | null>(null);
  const latestRequestIdRef = useRef<number>(0);
  const lastFetchTimeRef = useRef<number>(0);
  const inFlightKeyRef = useRef<string | null>(null);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const rolloverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus | string>(AppState.currentState || "active");

  // 0. Component Lifecycle Protection
  useEffect(() => {
    isMountedRef.current = true;
    const reqRef = latestRequestIdRef;
    const timerRef = rolloverTimerRef;
    return () => {
      isMountedRef.current = false;
      reqRef.current++;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // 1. Session Boundary Protection: Immediate state clearing on logout or account switch
  useEffect(() => {
    const previousUserId = activeUserIdRef.current;
    const currentUserId = user?.id || null;
    activeUserIdRef.current = currentUserId;
    latestRequestIdRef.current++;

    if (previousUserId !== currentUserId) {
      // Clear visible daily astrology state immediately so the prior user's content cannot remain
      setInsight(null);
      setIsEntitled(false);
      setIsUnverifiedOffline(false);
      setError(null);
      activeInsightDateRef.current = null;
      lastFetchTimeRef.current = 0;
      inFlightKeyRef.current = null;
      inFlightPromiseRef.current = null;
      dailyRashiService.clearSessionCache();
      setSelectedRashiId(initialRashiId || 1);
      activeRashiIdRef.current = initialRashiId || 1;
      setSyncStatus(undefined);
    }
  }, [user?.id, initialRashiId]);

  // 2. Single Guarded Request Path: Shared by automatic loading, midnight rollover, and refresh
  const executeGuardedFetch = useCallback(
    async (
      targetRashiId: number,
      options?: { force?: boolean; revalidate?: boolean }
    ) => {
      const isForce = options?.force ?? false;
      const isRevalidate = options?.revalidate ?? false;
      const now = Date.now();
      const currentIndianDate = getIndianCalendarDate();
      const dateChanged = activeInsightDateRef.current !== currentIndianDate;
      const requestUserId = user?.id || null;
      const requestKey = `${requestUserId}:${targetRashiId}:${currentIndianDate}`;

      // Deduplication check: only deduplicate if identical rashi, date, and user is already in-flight
      // or was fetched within the deduplication window (unless force refresh or date changed)
      if (!isForce && !dateChanged) {
        if (inFlightKeyRef.current === requestKey && inFlightPromiseRef.current) {
          return inFlightPromiseRef.current;
        }
        if (
          activeRashiIdRef.current === targetRashiId &&
          activeInsightDateRef.current === currentIndianDate &&
          now - lastFetchTimeRef.current < DEDUPLICATION_INTERVAL_MS
        ) {
          return;
        }
      }

      const requestId = ++latestRequestIdRef.current;
      const requestDate = currentIndianDate;
      const requestLanguage = "en";

      // If the Indian calendar date rolled over, invalidate previous day's content immediately
      if (activeInsightDateRef.current && activeInsightDateRef.current !== requestDate) {
        setInsight(null);
        activeInsightDateRef.current = null;
      }

      setLoading(true);
      setError(null);
      lastFetchTimeRef.current = now;
      inFlightKeyRef.current = requestKey;

      const isValidContext = () => {
        return (
          isMountedRef.current &&
          latestRequestIdRef.current === requestId &&
          activeUserIdRef.current === requestUserId &&
          activeRashiIdRef.current === targetRashiId
        );
      };

      const fetchPromise = (async () => {
        try {
          const optionsArg =
            isForce || isRevalidate
              ? { bypassCache: isForce || isRevalidate, revalidate: isRevalidate }
              : undefined;

          const result = optionsArg
            ? await dailyRashiService.fetchDailyInsight(
                requestDate,
                targetRashiId,
                requestLanguage,
                requestUserId,
                optionsArg
              )
            : await dailyRashiService.fetchDailyInsight(
                requestDate,
                targetRashiId,
                requestLanguage,
                requestUserId
              );

          if (!isValidContext()) {
            return; // Obsolete request or context changed; drop silently
          }

          activeInsightDateRef.current = requestDate;
          setIsEntitled(result.is_entitled);
          setIsUnverifiedOffline(!!result.is_unverified);
          setInsight(result.content);

          if (result.error) {
            setError(result.error);
          } else {
            setError(null);
          }
        } catch (err: any) {
          if (!isValidContext()) {
            return; // Obsolete request or context changed; drop silently
          }

          activeInsightDateRef.current = null;
          setInsight(null);
          setError(err?.message || "Failed to load daily astrological insight.");
          setIsEntitled(false);
          setIsUnverifiedOffline(dailyRashiService.isNetworkError(err));
        } finally {
          if (isValidContext()) {
            setLoading(false);
          }
          inFlightPromiseRef.current = null;
          inFlightKeyRef.current = null;
        }
      })();

      inFlightPromiseRef.current = fetchPromise;
      return fetchPromise;
    },
    [user?.id]
  );

  // 3. Indian Midnight Rollover Scheduling: Bounded one-shot timer targeting next 00:00:00 IST
  const scheduleMidnightRollover = useCallback(() => {
    if (rolloverTimerRef.current) {
      clearTimeout(rolloverTimerRef.current);
      rolloverTimerRef.current = null;
    }
    if (!isMountedRef.current) return;

    const msUntilMidnight = getMsUntilNextIndianMidnight();
    const delay = Math.max(500, msUntilMidnight + 250);

    const timer = setTimeout(() => {
      if (!isMountedRef.current) return;

      const currentIndianDate = getIndianCalendarDate();
      if (activeInsightDateRef.current !== currentIndianDate) {
        setInsight(null);
        activeInsightDateRef.current = null;
        executeGuardedFetch(activeRashiIdRef.current, { force: true });
      }

      scheduleMidnightRollover();
    }, delay);

    if (typeof (timer as any)?.unref === "function") {
      (timer as any).unref();
    }
    rolloverTimerRef.current = timer;
  }, [executeGuardedFetch]);

  useEffect(() => {
    scheduleMidnightRollover();
    return () => {
      if (rolloverTimerRef.current) {
        clearTimeout(rolloverTimerRef.current);
        rolloverTimerRef.current = null;
      }
    };
  }, [scheduleMidnightRollover]);

  // 3b. Real-Time Subscription Lifecycle & Entitlement Synchronization
  useEffect(() => {
    const handleSubscriptionPurchased = () => {
      if (!isMountedRef.current) return;
      dailyRashiService.clearSessionCache(activeUserIdRef.current);
      executeGuardedFetch(activeRashiIdRef.current, { force: true, revalidate: true });
    };

    const handleSubscriptionExpired = () => {
      if (!isMountedRef.current) return;
      // Strict Option A: Immediately revoke visible entitlement and sanitize displayed sections
      setIsEntitled(false);
      setInsight((prev) => (prev ? dailyRashiService.sanitizeFreeContent(prev) : null));
      dailyRashiService.clearSessionCache(activeUserIdRef.current);
      executeGuardedFetch(activeRashiIdRef.current, { force: true, revalidate: true });
    };

    const handleSubscriptionChanged = (payload?: AstrologyEventPayload) => {
      if (!isMountedRef.current) return;
      if (payload?.isActive === false) {
        handleSubscriptionExpired();
      } else if (payload?.isActive === true) {
        handleSubscriptionPurchased();
      }
    };

    const handleEntitlementInvalidated = () => {
      if (!isMountedRef.current) return;
      setIsEntitled(false);
      setInsight(null);
      dailyRashiService.clearSessionCache(activeUserIdRef.current);
      executeGuardedFetch(activeRashiIdRef.current, { force: true, revalidate: true });
    };

    const unsub1 = astrologyEventBus.subscribe("SUBSCRIPTION_PURCHASED", handleSubscriptionPurchased);
    const unsub2 = astrologyEventBus.subscribe("SUBSCRIPTION_EXPIRED", handleSubscriptionExpired);
    const unsub3 = astrologyEventBus.subscribe("SUBSCRIPTION_CHANGED", handleSubscriptionChanged);
    const unsub4 = astrologyEventBus.subscribe("ENTITLEMENT_INVALIDATED", handleEntitlementInvalidated);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [executeGuardedFetch]);

  // 4. Foreground AppState Lifecycle Synchronization: Handle wake-up and background date shifts
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const prevAppState = appStateRef.current;
      const isTransitionToActive =
        (prevAppState === "inactive" || prevAppState === "background") &&
        nextAppState === "active";
      appStateRef.current = nextAppState;

      if (isTransitionToActive && isMountedRef.current) {
        // Recalculate rollover timer for the active session
        scheduleMidnightRollover();

        const currentIndianDate = getIndianCalendarDate();
        const dateChanged = activeInsightDateRef.current !== currentIndianDate;

        if (dateChanged) {
          // Date rolled over while in background: clear immediately and fetch new date
          setInsight(null);
          activeInsightDateRef.current = null;
          executeGuardedFetch(activeRashiIdRef.current, { force: true });
        } else {
          // Revalidate backend entitlement on foreground if not fetched recently (deduplicated)
          const now = Date.now();
          if (now - lastFetchTimeRef.current >= DEDUPLICATION_INTERVAL_MS) {
            executeGuardedFetch(activeRashiIdRef.current, { revalidate: true });
          }
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [scheduleMidnightRollover, executeGuardedFetch]);

  // 5. Initialize Preferred Rashi on mount or user change
  useEffect(() => {
    const targetUserId = user?.id || null;
    let cancelled = false;

    async function initRashi() {
      if (initialRashiId && initialRashiId >= 1 && initialRashiId <= 12) {
        if (!cancelled && isMountedRef.current) {
          activeRashiIdRef.current = initialRashiId;
          setSelectedRashiId(initialRashiId);
        }
        return;
      }

      try {
        const preferredId = await dailyRashiService.getPreferredRashi(targetUserId);
        if (
          !cancelled &&
          isMountedRef.current &&
          activeUserIdRef.current === targetUserId
        ) {
          if (preferredId && preferredId >= 1 && preferredId <= 12) {
            activeRashiIdRef.current = preferredId;
            setSelectedRashiId(preferredId);
          } else {
            activeRashiIdRef.current = 1;
            setSelectedRashiId(1);
          }
        }
      } catch {
        if (
          !cancelled &&
          isMountedRef.current &&
          activeUserIdRef.current === targetUserId
        ) {
          activeRashiIdRef.current = 1;
          setSelectedRashiId(1);
        }
      }
    }

    initRashi();
    return () => {
      cancelled = true;
    };
  }, [initialRashiId, user?.id]);

  // 6. Automatic loading when selected Rashi or user identity changes
  useEffect(() => {
    activeRashiIdRef.current = selectedRashiId;
    executeGuardedFetch(selectedRashiId);
  }, [selectedRashiId, user?.id, executeGuardedFetch]);

  // 7. User selects a different Rashi: Immediate invalidation of prior in-flight requests
  const selectRashi = useCallback(
    async (newRashiId: number) => {
      if (newRashiId < 1 || newRashiId > 12 || newRashiId === selectedRashiId) return;

      // Invalidate any in-flight requests immediately
      latestRequestIdRef.current++;
      activeRashiIdRef.current = newRashiId;
      lastFetchTimeRef.current = 0; // Reset throttle for new selection
      inFlightKeyRef.current = null;
      inFlightPromiseRef.current = null;

      setIsChangingRashi(true);
      setSelectedRashiId(newRashiId);
      setInsight(null); // Clear previous rashi content immediately
      setError(null);

      const saveId = ++latestSaveIdRef.current;
      const targetUserId = user?.id || null;

      try {
        const saveResult = await dailyRashiService.savePreferredRashi(newRashiId, targetUserId);
        if (
          isMountedRef.current &&
          latestSaveIdRef.current === saveId &&
          activeUserIdRef.current === targetUserId
        ) {
          setSyncStatus(saveResult.status);
        }
      } catch {
        if (
          isMountedRef.current &&
          latestSaveIdRef.current === saveId &&
          activeUserIdRef.current === targetUserId
        ) {
          setSyncStatus("failed");
        }
      } finally {
        if (isMountedRef.current && latestSaveIdRef.current === saveId) {
          setIsChangingRashi(false);
        }
      }
    },
    [selectedRashiId, user?.id]
  );

  // 8. Manual retry of preference synchronization
  const retrySync = useCallback(async () => {
    const targetUserId = user?.id || null;
    if (!targetUserId || syncStatus === "synced") return;

    const currentRashi = activeRashiIdRef.current;
    const saveId = ++latestSaveIdRef.current;

    try {
      const saveResult = await dailyRashiService.savePreferredRashi(currentRashi, targetUserId);
      if (
        isMountedRef.current &&
        latestSaveIdRef.current === saveId &&
        activeUserIdRef.current === targetUserId
      ) {
        setSyncStatus(saveResult.status);
      }
    } catch {
      if (
        isMountedRef.current &&
        latestSaveIdRef.current === saveId &&
        activeUserIdRef.current === targetUserId
      ) {
        setSyncStatus("failed");
      }
    }
  }, [syncStatus, user?.id]);

  // 9. Manual refresh: Clears memory cache and forces guarded fetch for current selection
  const refresh = useCallback(
    async (options?: { force?: boolean; revalidate?: boolean }) => {
      const shouldForce = options?.force ?? true;
      const shouldRevalidate = options?.revalidate ?? true;
      if (shouldForce) {
        dailyRashiService.clearMemoryCache();
      }
      await executeGuardedFetch(selectedRashiId, {
        force: shouldForce,
        revalidate: shouldRevalidate,
      });
    },
    [selectedRashiId, executeGuardedFetch]
  );

  const selectedRashi = getRashiById(selectedRashiId) || CANONICAL_RASHIS[0];

  return {
    selectedRashiId,
    selectedRashi,
    insight,
    isEntitled,
    isUnverifiedOffline,
    loading,
    isChangingRashi,
    error,
    selectRashi,
    refresh,
    syncStatus,
    retrySync,
  };
}
