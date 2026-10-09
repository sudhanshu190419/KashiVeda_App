// src/features/booking/hooks/useBookingHistory.ts
import { useCallback, useEffect, useState } from "react";
import { bookingService } from "../services/bookingService.ts";
import { BookingDetail } from "../types/booking.types.ts";

export const useBookingHistory = (statusFilter: string = "all", limit: number = 20) => {
  const [bookings, setBookings] = useState<BookingDetail[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadBookings = useCallback(
    async (currentOffset: number = 0, isRefresh: boolean = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await bookingService.fetchCustomerBookings({
          limit,
          offset: currentOffset,
          statusFilter,
        });

        if (currentOffset === 0) {
          setBookings(result.bookings);
        } else {
          setBookings((prev) => [...prev, ...result.bookings]);
        }
        setTotalCount(result.totalCount);
        setOffset(currentOffset);
      } catch (err: any) {
        setError(err?.message || "Failed to load booking history.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [limit, statusFilter]
  );

  useEffect(() => {
    loadBookings(0);
  }, [loadBookings]);

  const refresh = useCallback(() => {
    return loadBookings(0, true);
  }, [loadBookings]);

  const loadMore = useCallback(() => {
    if (!loading && !refreshing && bookings.length < totalCount) {
      loadBookings(offset + limit);
    }
  }, [loading, refreshing, bookings.length, totalCount, offset, limit, loadBookings]);

  return {
    bookings,
    totalCount,
    loading,
    refreshing,
    error,
    refresh,
    loadMore,
  };
};
