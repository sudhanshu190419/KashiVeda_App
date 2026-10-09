// src/features/kundli/hooks/useKundliPandits.ts
import { useCallback, useEffect, useState } from "react";
import { KundliPandit } from "../types/kundli.types.ts";
import { kundliService } from "../services/kundliService.ts";

export function useKundliPandits() {
  const [pandits, setPandits] = useState<KundliPandit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPandits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await kundliService.getKundliPandits();
      setPandits(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load Kundli specialists.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPandits();
  }, [fetchPandits]);

  return { pandits, loading, error, refresh: fetchPandits };
}
