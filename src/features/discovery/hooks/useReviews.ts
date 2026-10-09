// src/features/discovery/hooks/useReviews.ts
import { useCallback, useEffect, useState } from "react";
import { discoveryService } from "../services/discoveryService.ts";
import { Review } from "../types/discovery.ts";

export interface UseReviewsResult {
  reviews: Review[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useReviews = (panditId: string, limit: number = 20): UseReviewsResult => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!panditId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await discoveryService.fetchReviews(panditId, limit);
      setReviews(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }, [panditId, limit]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  return {
    reviews,
    loading,
    error,
    refresh: loadReviews,
  };
};
