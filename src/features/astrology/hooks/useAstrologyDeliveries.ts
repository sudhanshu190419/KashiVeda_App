// src/features/astrology/hooks/useAstrologyDeliveries.ts
import { useCallback, useEffect, useState } from "react";
import { astrologyService } from "../services/astrologyService.ts";
import { AstrologyDelivery } from "../types/astrology.types.ts";

interface UseAstrologyDeliveriesOptions {
  pageSize?: number;
}

export function useAstrologyDeliveries(options: UseAstrologyDeliveriesOptions = {}) {
  const { pageSize = 10 } = options;

  const [deliveries, setDeliveries] = useState<AstrologyDelivery[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeliveries = useCallback(
    async (targetPage = 1, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else if (targetPage === 1) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await astrologyService.getCustomerDeliveries(
          targetPage,
          pageSize
        );

        setDeliveries((prev) =>
          targetPage === 1 ? result.deliveries : [...prev, ...result.deliveries]
        );
        setHasMore(result.hasMore);
        setPage(targetPage);
      } catch (err: any) {
        setError(err?.message || "Failed to load astrology delivery history.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    fetchDeliveries(1).catch(() => {});
  }, [fetchDeliveries]);

  const loadMore = useCallback(() => {
    if (!loading && !refreshing && hasMore) {
      fetchDeliveries(page + 1);
    }
  }, [loading, refreshing, hasMore, page, fetchDeliveries]);

  const refresh = useCallback(() => {
    return fetchDeliveries(1, true);
  }, [fetchDeliveries]);

  return {
    deliveries,
    loading,
    refreshing,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}
