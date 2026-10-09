// src/features/discovery/hooks/usePujaList.ts
import { useCallback, useEffect, useState } from "react";
import { discoveryService, FetchPujaServicesOptions } from "../services/discoveryService.ts";
import { PujaService } from "../types/discovery.ts";

export interface UsePujaListResult {
  pujas: PujaService[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const usePujaList = (options: FetchPujaServicesOptions = {}): UsePujaListResult => {
  const [pujas, setPujas] = useState<PujaService[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { categoryId, search, serviceMode, limit, offset } = options;

  const loadPujas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await discoveryService.fetchPujaServices({
        categoryId,
        search,
        serviceMode,
        limit,
        offset,
      });
      setPujas(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load puja rituals");
    } finally {
      setLoading(false);
    }
  }, [categoryId, search, serviceMode, limit, offset]);

  useEffect(() => {
    loadPujas();
  }, [loadPujas]);

  return {
    pujas,
    loading,
    error,
    refresh: loadPujas,
  };
};
