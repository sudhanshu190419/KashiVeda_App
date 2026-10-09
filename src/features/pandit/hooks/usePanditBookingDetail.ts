// src/features/pandit/hooks/usePanditBookingDetail.ts
import { useCallback, useEffect, useState } from "react";
import { panditService } from "../services/panditService.ts";
import { LiveSessionCredentials, PanditBookingItem } from "../types/pandit.types.ts";

export const usePanditBookingDetail = (bookingId: string) => {
  const [booking, setBooking] = useState<PanditBookingItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<boolean>(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [liveTokenData, setLiveTokenData] = useState<LiveSessionCredentials | null>(null);
  const [loadingToken, setLoadingToken] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (isRefresh: boolean = false) => {
      if (!bookingId) {
        setLoading(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const data = await panditService.fetchPanditBookingDetail(bookingId);
        setBooking(data);
      } catch (err: any) {
        setError(err?.message || "Failed to load booking details.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bookingId]
  );

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const refresh = useCallback(() => {
    return loadDetail(true);
  }, [loadDetail]);

  const completeRitual = useCallback(async () => {
    if (!bookingId) return;
    setCompleting(true);
    setCompleteError(null);

    try {
      await panditService.markBookingCompleted(bookingId);
      // Reload updated status
      await loadDetail(true);
    } catch (err: any) {
      const msg = err?.message || "Failed to mark ritual as completed.";
      setCompleteError(msg);
      throw new Error(msg);
    } finally {
      setCompleting(false);
    }
  }, [bookingId, loadDetail]);

  const fetchLiveRoomToken = useCallback(async () => {
    if (!bookingId) return;
    setLoadingToken(true);
    setTokenError(null);

    try {
      const credentials = await panditService.requestLiveSessionToken(bookingId);
      setLiveTokenData(credentials);
      return credentials;
    } catch (err: any) {
      const msg = err?.message || "Could not connect to live room. Please ensure session window is open.";
      setTokenError(msg);
      throw new Error(msg);
    } finally {
      setLoadingToken(false);
    }
  }, [bookingId]);

  return {
    booking,
    loading,
    refreshing,
    error,
    completing,
    completeError,
    liveTokenData,
    loadingToken,
    tokenError,
    refresh,
    completeRitual,
    fetchLiveRoomToken,
  };
};
