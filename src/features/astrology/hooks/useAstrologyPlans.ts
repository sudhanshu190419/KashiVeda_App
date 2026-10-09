// src/features/astrology/hooks/useAstrologyPlans.ts
import { useCallback, useEffect, useState } from "react";
import { astrologyService } from "../services/astrologyService.ts";
import { AstrologySubscriptionPlan } from "../types/astrology.types.ts";

export function useAstrologyPlans() {
  const [plans, setPlans] = useState<AstrologySubscriptionPlan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await astrologyService.getActivePlans();
      setPlans(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load astrology plans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return {
    plans,
    loading,
    error,
    refresh: fetchPlans,
  };
}
