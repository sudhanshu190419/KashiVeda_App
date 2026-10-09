// src/features/discovery/hooks/usePanditDirectory.ts
import { useCallback, useEffect, useState } from "react";
import { discoveryService, FetchPanditsOptions } from "../services/discoveryService.ts";
import { PanditSummary } from "../types/discovery.ts";

export interface UsePanditDirectoryResult {
  pandits: PanditSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const usePanditDirectory = (options: FetchPanditsOptions = {}): UsePanditDirectoryResult => {
  const [pandits, setPandits] = useState<PanditSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { serviceMode, latitude, longitude, pujaServiceId, limit, offset } = options;

  const loadPandits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await discoveryService.fetchPandits({
        serviceMode,
        latitude,
        longitude,
        pujaServiceId,
        limit,
        offset,
      });
      setPandits(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load pandits directory");
    } finally {
      setLoading(false);
    }
  }, [serviceMode, latitude, longitude, pujaServiceId, limit, offset]);

  useEffect(() => {
    loadPandits();
  }, [loadPandits]);

  return {
    pandits,
    loading,
    error,
    refresh: loadPandits,
  };
};
