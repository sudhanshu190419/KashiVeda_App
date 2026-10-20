// src/features/booking/hooks/useBookingReview.ts
import { useCallback, useEffect, useState } from "react";
import { BookingReview, bookingReviewService } from "../services/bookingReviewService.ts";

export interface UseBookingReviewResult {
  review: BookingReview | null;
  hasReviewed: boolean;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  submitReview: (rating: number, comment?: string | null) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export const useBookingReview = (bookingId?: string, isCompleted?: boolean): UseBookingReviewResult => {
  const [review, setReview] = useState<BookingReview | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadReview = useCallback(async () => {
    if (!bookingId || !isCompleted) {
      setReview(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const existing = await bookingReviewService.fetchBookingReview(bookingId);
      setReview(existing);
    } catch (err: any) {
      setError(err?.message || "Failed to load review status.");
    } finally {
      setLoading(false);
    }
  }, [bookingId, isCompleted]);

  useEffect(() => {
    loadReview();
  }, [loadReview]);

  const submitReview = useCallback(
    async (rating: number, comment?: string | null): Promise<boolean> => {
      if (!bookingId) {
        setError("Booking ID missing.");
        return false;
      }

      try {
        setSubmitting(true);
        setError(null);
        await bookingReviewService.submitReview(bookingId, rating, comment);
        await loadReview();
        return true;
      } catch (err: any) {
        setError(err?.message || "Failed to submit review.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [bookingId, loadReview]
  );

  return {
    review,
    hasReviewed: review != null,
    loading,
    submitting,
    error,
    submitReview,
    refresh: loadReview,
  };
};
