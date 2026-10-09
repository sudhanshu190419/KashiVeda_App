// src/features/pandit/hooks/usePanditDashboard.ts
import { useCallback, useEffect, useState } from "react";
import { panditService } from "../services/panditService.ts";
import { PanditDashboardSummary } from "../types/pandit.types.ts";

export const DASHBOARD_LOAD_TIMEOUT_MS = 10000;

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);
  });

  return Promise.race([
    promise.then((res) => {
      if (timerId) clearTimeout(timerId);
      return res;
    }),
    timeoutPromise,
  ]);
};

export const usePanditDashboard = () => {
  const [summary, setSummary] = useState<PanditDashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await withTimeout(
        panditService.fetchPanditDashboardSummary(),
        DASHBOARD_LOAD_TIMEOUT_MS,
        "Connecting to Pandit Sanctum timed out. Please check your connection and tap Retry."
      );
      setSummary(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load dashboard overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const refresh = useCallback(() => {
    return loadDashboard(true);
  }, [loadDashboard]);

  return {
    summary,
    loading,
    refreshing,
    error,
    refresh,
  };
};
