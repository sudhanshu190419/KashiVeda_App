// src/features/pandit/hooks/usePanditEarnings.ts
import { useCallback, useEffect, useState } from "react";
import {
  PanditEarningsSummary,
  PanditPayoutItem,
  PanditPayoutStatus,
} from "../types/pandit.types.ts";
import { panditPayoutService } from "../services/panditPayoutService.ts";

const PAGE_SIZE = 20;

export type PanditPayoutFilter = "all" | PanditPayoutStatus;

export interface UsePanditEarningsResult {
  summary: PanditEarningsSummary | null;
  payouts: PanditPayoutItem[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  filter: PanditPayoutFilter;
  hasMore: boolean;
  setFilter: (filter: PanditPayoutFilter) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function usePanditEarnings(): UsePanditEarningsResult {
  const [summary, setSummary] = useState<PanditEarningsSummary | null>(null);
  const [payouts, setPayouts] = useState<PanditPayoutItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<PanditPayoutFilter>("all");
  const [hasMore, setHasMore] = useState<boolean>(true);

  const loadData = useCallback(
    async (isRefresh = false, activeFilter: PanditPayoutFilter = filter) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const [summaryData, payoutsData] = await Promise.all([
          panditPayoutService.fetchEarningsSummary(),
          panditPayoutService.fetchPayoutHistory({
            limit: PAGE_SIZE,
            offset: 0,
            status: activeFilter === "all" ? undefined : activeFilter,
          }),
        ]);

        setSummary(summaryData);
        setPayouts(payoutsData);
        setHasMore(payoutsData.length >= PAGE_SIZE);
      } catch (err: any) {
        setError(err?.message || "Failed to load Pandit earnings and payouts.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    loadData(false, filter);
  }, [loadData, filter]);

  const refresh = useCallback(async () => {
    await loadData(true, filter);
  }, [loadData, filter]);

  const setFilter = useCallback((newFilter: PanditPayoutFilter) => {
    setFilterState(newFilter);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;

    try {
      setLoadingMore(true);
      const nextBatch = await panditPayoutService.fetchPayoutHistory({
        limit: PAGE_SIZE,
        offset: payouts.length,
        status: filter === "all" ? undefined : filter,
      });

      if (nextBatch.length < PAGE_SIZE) {
        setHasMore(false);
      }
      setPayouts((prev) => [...prev, ...nextBatch]);
    } catch (err: any) {
      console.warn("Error loading more payouts:", err?.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, loading, payouts.length, filter]);

  return {
    summary,
    payouts,
    loading,
    refreshing,
    loadingMore,
    error,
    filter,
    hasMore,
    setFilter,
    refresh,
    loadMore,
  };
}
