// src/features/discovery/hooks/usePujaDetail.ts
import { useCallback, useEffect, useState } from "react";
import { discoveryService } from "../services/discoveryService.ts";
import { PujaService, SamagriPackage } from "../types/discovery.ts";

export interface UsePujaDetailResult {
  puja: PujaService | null;
  samagriPackages: SamagriPackage[];
  offeringsCount: number;
  minPrice: number | null;
  modePrices?: {
    home?: number | null;
    temple?: number | null;
    remote?: number | null;
  };
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const usePujaDetail = (pujaId: string): UsePujaDetailResult => {
  const [puja, setPuja] = useState<PujaService | null>(null);
  const [samagriPackages, setSamagriPackages] = useState<SamagriPackage[]>([]);
  const [offeringsCount, setOfferingsCount] = useState<number>(0);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [modePrices, setModePrices] = useState<{
    home?: number | null;
    temple?: number | null;
    remote?: number | null;
  }>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadPujaDetail = useCallback(async () => {
    if (!pujaId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await discoveryService.fetchPujaDetail(pujaId);
      setPuja(data.puja);
      setSamagriPackages(data.samagriPackages);
      setOfferingsCount(data.offeringsCount);
      setMinPrice(data.minPrice);
      setModePrices(data.modePrices || {});
    } catch (err: any) {
      setError(err?.message || "Failed to load puja details");
    } finally {
      setLoading(false);
    }
  }, [pujaId]);

  useEffect(() => {
    loadPujaDetail();
  }, [loadPujaDetail]);

  return {
    puja,
    samagriPackages,
    offeringsCount,
    minPrice,
    modePrices,
    loading,
    error,
    refresh: loadPujaDetail,
  };
};
