// src/features/astrology/hooks/useAstrologyContent.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { astrologyService } from "../services/astrologyService.ts";
import { AstrologyChannel, AstrologyContent } from "../types/astrology.types.ts";

export interface UseAstrologyContentOptions {
  pageSize?: number;
  channel?: AstrologyChannel;
}

export interface UseAstrologyContentReturn {
  content: AstrologyContent[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
  refresh: () => Promise<void>;
}

/**
 * Deduplicates and merges astrology content records using their authoritative UUID primary key.
 * Preserves existing items in their original order and appends incoming unique items.
 * Does not collapse distinct items with identical titles or snippets.
 */
function mergeContentRecords(
  existing: AstrologyContent[],
  incoming: AstrologyContent[]
): AstrologyContent[] {
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

export function useAstrologyContent(
  options: UseAstrologyContentOptions = {}
): UseAstrologyContentReturn {
  const { pageSize = 10, channel } = options;

  const [content, setContent] = useState<AstrologyContent[]>([]);
  const [_page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Concurrency and lifecycle synchronization refs
  const isMountedRef = useRef<boolean>(true);
  const generationRef = useRef<number>(0);
  const inFlightRef = useRef<{ page: number; generation: number } | null>(null);
  const currentPageRef = useRef<number>(1);
  const hasMoreRef = useRef<boolean>(false);
  const contentLengthRef = useRef<number>(0);

  useEffect(() => {
    contentLengthRef.current = content.length;
  }, [content]);

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

      // 1. Synchronous in-flight guard: prevent duplicate concurrent requests
      if (inFlightRef.current !== null) {
        return;
      }

      // 2. Synchronous in-flight lock acquisition before async suspension
      inFlightRef.current = { page: targetPage, generation: currentGen };

      if (isRefresh) {
        setRefreshing(true);
        if (contentLengthRef.current === 0) {
          setLoading(true);
        }
      } else if (targetPage === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const result = await astrologyService.getPublishedContent(
          targetPage,
          pageSize,
          channel
        );

        // 3. Stale-response guard: discard response if unmounted or if query context changed
        if (!isMountedRef.current || generationRef.current !== currentGen) {
          return;
        }

        setContent((prev) =>
          targetPage === 1 ? result.items : mergeContentRecords(prev, result.items)
        );

        const nextHasMore = Boolean(result.hasMore);
        setHasMore(nextHasMore);
        hasMoreRef.current = nextHasMore;

        setPage(targetPage);
        currentPageRef.current = targetPage;
      } catch (err: any) {
        // Discard error if unmounted or if query context changed
        if (!isMountedRef.current || generationRef.current !== currentGen) {
          return;
        }

        setError(err?.message || "Failed to load astrology insights.");
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
    [pageSize, channel]
  );

  // Whenever channel or pageSize changes: advance generation, reset pagination, and fetch page 1
  useEffect(() => {
    generationRef.current += 1;
    const newGen = generationRef.current;

    inFlightRef.current = null;
    currentPageRef.current = 1;
    hasMoreRef.current = false;
    contentLengthRef.current = 0;

    setContent([]);
    setPage(1);
    setHasMore(false);
    setError(null);
    setLoading(true);
    setRefreshing(false);
    setLoadingMore(false);

    executeFetch(1, false, newGen).catch(() => {});
  }, [executeFetch]);

  const loadMore = useCallback(() => {
    // Synchronous guards:
    // a) Lock in flight?
    if (inFlightRef.current !== null) {
      return;
    }
    // b) Server indicates no more records exist?
    if (!hasMoreRef.current) {
      return;
    }
    // c) Initial load or refresh still active?
    if (loading || refreshing || loadingMore) {
      return;
    }

    const nextPage = currentPageRef.current + 1;
    executeFetch(nextPage, false);
  }, [loading, refreshing, loadingMore, executeFetch]);

  const refresh = useCallback(async () => {
    generationRef.current += 1;
    const newGen = generationRef.current;

    // Invalidate any active pagination and reset cursor for refreshed page 1
    inFlightRef.current = null;
    currentPageRef.current = 1;
    hasMoreRef.current = false;

    return executeFetch(1, true, newGen);
  }, [executeFetch]);

  return {
    content,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}
