// src/features/discovery/hooks/usePujaCategories.ts
import { useCallback, useEffect, useState } from "react";
import { discoveryService } from "../services/discoveryService.ts";
import { PujaCategory } from "../types/discovery.ts";

export interface UsePujaCategoriesResult {
  categories: PujaCategory[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const usePujaCategories = (): UsePujaCategoriesResult => {
  const [categories, setCategories] = useState<PujaCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await discoveryService.fetchCategories();
      setCategories(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load puja categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  return {
    categories,
    loading,
    error,
    refresh: loadCategories,
  };
};
