// src/features/booking/hooks/useBookingDetails.ts
import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { bookingService } from "../services/bookingService.ts";
import { BookingDetail } from "../types/booking.types.ts";

export const useBookingDetails = (bookingId: string) => {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef<boolean>(false);

  const loadDetails = useCallback(
    async (isRefresh: boolean = false) => {
      if (!bookingId) {
        setLoading(false);
        return;
      }

      if (isRefresh || hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await bookingService.fetchBookingDetail(bookingId);
        setBooking(data);
        hasLoadedRef.current = true;
      } catch (err: any) {
        setError(err?.message || "Failed to load booking details.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bookingId]
  );

  useFocusEffect(
    useCallback(() => {
      loadDetails();
    }, [loadDetails])
  );

  const refresh = useCallback(() => {
    return loadDetails(true);
  }, [loadDetails]);

  return {
    booking,
    loading,
    refreshing,
    error,
    refresh,
  };
};
