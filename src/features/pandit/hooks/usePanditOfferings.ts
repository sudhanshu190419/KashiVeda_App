// src/features/pandit/hooks/usePanditOfferings.ts
import { useCallback, useEffect, useState } from "react";
import { panditService } from "../services/panditService.ts";
import { PanditPujaServiceOffering } from "../types/pandit.types.ts";

export const usePanditOfferings = () => {
  const [offerings, setOfferings] = useState<PanditPujaServiceOffering[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadOfferings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await panditService.fetchPanditOfferings();
      setOfferings(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load offerings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOfferings();
  }, [loadOfferings]);

  const updatePrice = useCallback(
    async (
      offeringId: string,
      pricingOrPrice:
        | number
        | {
            home_price?: number | null;
            temple_price?: number | null;
            remote_price?: number | null;
          },
      isActive: boolean
    ) => {
      setSaving(true);
      setError(null);
      try {
        const updated = await panditService.updateOffering(offeringId, pricingOrPrice, isActive);
        setOfferings((prev) =>
          prev.map((o) => (o.id === offeringId ? updated : o))
        );
        return updated;
      } catch (err: any) {
        const msg = err?.message || "Failed to update offering price.";
        setError(msg);
        throw new Error(msg);
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return {
    offerings,
    loading,
    saving,
    error,
    loadOfferings,
    updatePrice,
  };
};
