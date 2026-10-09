// src/features/pandit/hooks/usePanditBookings.ts
import { useCallback, useEffect, useState } from "react";
import { panditService } from "../services/panditService.ts";
import { PanditBookingItem } from "../types/pandit.types.ts";

export type PanditBookingFilter = "today" | "upcoming" | "completed" | "all";

export const usePanditBookings = (initialFilter: PanditBookingFilter = "upcoming") => {
  const [filter, setFilter] = useState<PanditBookingFilter>(initialFilter);
  const [bookings, setBookings] = useState<PanditBookingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);

  const limit = 10;

  const loadBookings = useCallback(
    async (targetFilter: PanditBookingFilter, currentOffset: number, isRefresh: boolean = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else if (currentOffset === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const res = await panditService.fetchPanditBookings(targetFilter, limit, currentOffset);
        if (currentOffset === 0) {
          setBookings(res.bookings);
        } else {
          setBookings((prev) => [...prev, ...res.bookings]);
        }
        setTotalCount(res.totalCount);
        setOffset(currentOffset);
      } catch (err: any) {
        setError(err?.message || "Failed to load bookings.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    loadBookings(filter, 0);
  }, [filter, loadBookings]);

  const changeFilter = useCallback((newFilter: PanditBookingFilter) => {
    setFilter(newFilter);
  }, []);

  const refresh = useCallback(() => {
    return loadBookings(filter, 0, true);
  }, [filter, loadBookings]);

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && bookings.length < totalCount) {
      loadBookings(filter, offset + limit);
    }
  }, [loading, loadingMore, bookings.length, totalCount, filter, offset, limit, loadBookings]);

  return {
    filter,
    changeFilter,
    bookings,
    loading,
    refreshing,
    loadingMore,
    error,
    totalCount,
    hasMore: bookings.length < totalCount,
    refresh,
    loadMore,
  };
};
