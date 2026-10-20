// src/features/astrology/hooks/useAstrologyDeliveries.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.tsx";
import { astrologyService } from "../services/astrologyService.ts";
import { AstrologyDelivery } from "../types/astrology.types.ts";

export interface UseAstrologyDeliveriesOptions {
  pageSize?: number;
  userId?: string | null;
}

export interface UseAstrologyDeliveriesReturn {
  deliveries: AstrologyDelivery[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => Promise<void>;
}

/**
 * Deduplicates and merges delivery journal records using their authoritative UUID primary key.
 * Preserves existing items in their original order and appends incoming unique items.
 */
function mergeDeliveryRecords(
  existing: AstrologyDelivery[],
  incoming: AstrologyDelivery[]
): AstrologyDelivery[] {
  if (!existing || existing.length === 0) {
    return incoming;
  }
  if (!incoming || incoming.length === 0) {
    return existing;
  }
  const existingIds = new Set(existing.map((item) => item.id));
  const uniqueIncoming = incoming.filter((item) => !existingIds.has(item.id));
  return [...existing, ...uniqueIncoming];
}

export function useAstrologyDeliveries(
  options: UseAstrologyDeliveriesOptions = {}
): UseAstrologyDeliveriesReturn {
  const { pageSize = 10, userId: explicitUserId } = options;
  const { user } = useAuth();
  const currentUserId = explicitUserId !== undefined ? explicitUserId : (user?.id || null);

  const [deliveries, setDeliveries] = useState<AstrologyDelivery[]>([]);
  const [_page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(Boolean(currentUserId));
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Concurrency and lifecycle synchronization refs
  const isMountedRef = useRef<boolean>(true);
  const generationRef = useRef<number>(0);
  const inFlightRef = useRef<{ page: number; generation: number } | null>(null);
  const currentPageRef = useRef<number>(1);
  const hasMoreRef = useRef<boolean>(false);
  const deliveriesLengthRef = useRef<number>(0);

  useEffect(() => {
    deliveriesLengthRef.current = deliveries.length;
  }, [deliveries]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const executeFetch = useCallback(
    async (targetPage = 1, isRefresh = false, activeGeneration?: number) => {
      const currentGen =
        activeGeneration !== undefined ? activeGeneration : generationRef.current;

      if (!currentUserId) {
        if (isMountedRef.current && generationRef.current === currentGen) {
          setDeliveries([]);
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
        return;
      }

      // 1. Synchronous in-flight guard
      if (inFlightRef.current !== null) {
        return;
      }

      // 2. Synchronous in-flight lock acquisition before async suspension
      inFlightRef.current = { page: targetPage, generation: currentGen };

      if (isRefresh) {
        setRefreshing(true);
        if (deliveriesLengthRef.current === 0) {
          setLoading(true);
        }
      } else if (targetPage === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const result = await astrologyService.getCustomerDeliveries(
          targetPage,
          pageSize
        );

        // 3. Stale-response guard
        if (!isMountedRef.current || generationRef.current !== currentGen) {
          return;
        }

        setDeliveries((prev) =>
          targetPage === 1 ? result.deliveries : mergeDeliveryRecords(prev, result.deliveries)
        );

        const nextHasMore = Boolean(result.hasMore);
        setHasMore(nextHasMore);
        hasMoreRef.current = nextHasMore;

        setPage(targetPage);
        currentPageRef.current = targetPage;
      } catch (err: any) {
        if (!isMountedRef.current || generationRef.current !== currentGen) {
          return;
        }

        setError(err?.message || "Failed to load astrology delivery history.");
      } finally {
        // 4. Release in-flight lock only if still in the same query generation
        if (inFlightRef.current?.generation === currentGen) {
          inFlightRef.current = null;
        }

        // 5. Clear loading flags only if still in the same query generation
        if (isMountedRef.current && generationRef.current === currentGen) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [currentUserId, pageSize]
  );

  // Advance generation, reset pagination, and fetch page 1 whenever currentUserId or pageSize changes
  useEffect(() => {
    generationRef.current += 1;
    const newGen = generationRef.current;

    inFlightRef.current = null;
    currentPageRef.current = 1;
    hasMoreRef.current = false;
    deliveriesLengthRef.current = 0;

    setDeliveries([]);
    setPage(1);
    setHasMore(false);
    setError(null);

    if (!currentUserId) {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      return;
    }

    setLoading(true);
    setRefreshing(false);
    setLoadingMore(false);

    executeFetch(1, false, newGen).catch(() => {});
  }, [currentUserId, executeFetch]);

  const loadMore = useCallback(() => {
    if (!currentUserId) {
      return;
    }
    if (inFlightRef.current !== null) {
      return;
    }
    if (!hasMoreRef.current) {
      return;
    }
    if (loading || refreshing || loadingMore) {
      return;
    }

    const nextPage = currentPageRef.current + 1;
    executeFetch(nextPage, false);
  }, [currentUserId, loading, refreshing, loadingMore, executeFetch]);

  const refresh = useCallback(async () => {
    if (!currentUserId) {
      setDeliveries([]);
      setLoading(false);
      return;
    }
    generationRef.current += 1;
    const newGen = generationRef.current;

    inFlightRef.current = null;
    currentPageRef.current = 1;
    hasMoreRef.current = false;

    return executeFetch(1, true, newGen);
  }, [currentUserId, executeFetch]);

  return {
    deliveries,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}
