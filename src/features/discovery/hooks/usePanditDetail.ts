// src/features/discovery/hooks/usePanditDetail.ts
import { useCallback, useEffect, useState } from "react";
import { discoveryService } from "../services/discoveryService.ts";
import { PanditPujaOffering, PanditSummary, Review } from "../types/discovery.ts";

export interface UsePanditDetailResult {
  pandit: PanditSummary | null;
  offerings: PanditPujaOffering[];
  reviews: Review[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const usePanditDetail = (panditId: string): UsePanditDetailResult => {
  const [pandit, setPandit] = useState<PanditSummary | null>(null);
  const [offerings, setOfferings] = useState<PanditPujaOffering[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadPanditDetail = useCallback(async () => {
    if (!panditId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await discoveryService.fetchPanditDetail(panditId);
      setPandit(data.pandit);
      setOfferings(data.offerings);
      setReviews(data.reviews);
    } catch (err: any) {
      setError(err?.message || "Failed to load pandit details");
    } finally {
      setLoading(false);
    }
  }, [panditId]);

  useEffect(() => {
    loadPanditDetail();
  }, [loadPanditDetail]);

  return {
    pandit,
    offerings,
    reviews,
    loading,
    error,
    refresh: loadPanditDetail,
  };
};
