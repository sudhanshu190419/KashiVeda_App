// src/features/astrology/hooks/useAstrologyContent.ts
import { useCallback, useEffect, useState } from "react";
import { astrologyService } from "../services/astrologyService.ts";
import { AstrologyChannel, AstrologyContent } from "../types/astrology.types.ts";

interface UseAstrologyContentOptions {
  pageSize?: number;
  channel?: AstrologyChannel;
}

export function useAstrologyContent(options: UseAstrologyContentOptions = {}) {
  const { pageSize = 10, channel } = options;

  const [content, setContent] = useState<AstrologyContent[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(
    async (targetPage = 1, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else if (targetPage === 1) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await astrologyService.getPublishedContent(
          targetPage,
          pageSize,
          channel
        );

        setContent((prev) =>
          targetPage === 1 ? result.items : [...prev, ...result.items]
        );
        setHasMore(result.hasMore);
        setPage(targetPage);
      } catch (err: any) {
        setError(err?.message || "Failed to load astrology insights.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pageSize, channel]
  );

  useEffect(() => {
    fetchContent(1).catch(() => {});
  }, [fetchContent]);

  const loadMore = useCallback(() => {
    if (!loading && !refreshing && hasMore) {
      fetchContent(page + 1);
    }
  }, [loading, refreshing, hasMore, page, fetchContent]);

  const refresh = useCallback(() => {
    return fetchContent(1, true);
  }, [fetchContent]);

  return {
    content,
    loading,
    refreshing,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}
