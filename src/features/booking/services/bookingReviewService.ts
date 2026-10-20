// src/features/booking/services/bookingReviewService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";


export interface BookingReview {
  id: string;
  booking_id: string;
  pandit_id: string;
  rating: number;
  comment: string | null;
  visibility_status: "published" | "hidden";
  created_at: string;
}

export interface SubmitReviewResult {
  success: boolean;
  review_id?: string;
  booking_id?: string;
  pandit_id?: string;
  rating?: number;
  comment?: string | null;
  visibility_status?: string;
  created_at?: string;
}

export const bookingReviewService = {
  /**
   * Submit a verified 1-5 star review for a completed booking via authoritative database RPC.
   * Enforces customer ownership, booking completed state, and pandit association atomically.
   */
  async submitReview(
    bookingId: string,
    rating: number,
    comment?: string | null
  ): Promise<SubmitReviewResult> {
    if (!bookingId) {
      throw new Error("Booking identifier is required.");
    }
    if (!rating || rating < 1 || rating > 5) {
      throw new Error("Please select a rating between 1 and 5 stars.");
    }

    const trimmed = comment ? comment.trim() : "";
    const cleanedComment = trimmed.length > 0 ? trimmed : null;
    if (cleanedComment && cleanedComment.length > 1000) {
      throw new Error("Review comment cannot exceed 1000 characters.");
    }

    const { data, error } = await supabase.rpc("submit_booking_review", {
      p_booking_id: bookingId,
      p_rating: rating,
      p_comment: cleanedComment,
    });

    if (error) {
      throw new Error(error.message || "Failed to submit ritual review.");
    }

    return (data as SubmitReviewResult) || { success: true };
  },

  /**
   * Fetch the existing review for a specific booking.
   */
  async fetchBookingReview(bookingId: string): Promise<BookingReview | null> {
    if (!bookingId) return null;

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("get_booking_review", {
        p_booking_id: bookingId,
      });

      if (!rpcErr && rpcData) {
        const payload = rpcData as { has_reviewed: boolean; review: BookingReview | null };
        if (payload.has_reviewed && payload.review) {
          return {
            ...payload.review,
            booking_id: bookingId,
          };
        }
        return null;
      }
    } catch {
      // Fallback
    }

    // Direct fallback query for booking owner
    const { data, error } = await supabase
      .from("reviews")
      .select("id, booking_id, pandit_id, rating, comment, visibility_status, created_at")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as BookingReview;
  },
};
