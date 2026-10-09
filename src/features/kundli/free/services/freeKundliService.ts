// src/features/kundli/free/services/freeKundliService.ts
import { supabase } from "../../../../infrastructure/supabase/client.ts";
import { FreeKundliRequest, FreeKundliResponse } from "../types/freeKundli.types.ts";

class FreeKundliService {
  private memoryCache = new Map<string, FreeKundliResponse>();

  /**
   * Generates a deterministic cache key for a birth profile.
   */
  private getCacheKey(req: FreeKundliRequest): string {
    const place = (req.birthPlace || "").toLowerCase().trim();
    const latStr = req.latitude !== undefined ? Number(req.latitude).toFixed(4) : "";
    const lonStr = req.longitude !== undefined ? Number(req.longitude).toFixed(4) : "";
    return `${req.birthDate}:${req.birthTime}:${place}:${latStr}:${lonStr}:${req.timezone || ""}`;
  }

  /**
   * Invokes the calculate-free-kundli Edge Function.
   */
  async calculateFreeKundli(request: FreeKundliRequest): Promise<FreeKundliResponse> {
    // 1. Check local in-memory cache
    const cacheKey = this.getCacheKey(request);
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    // 2. Invoke Supabase Edge Function
    const { data, error } = await supabase.functions.invoke("calculate-free-kundli", {
      body: request,
    });

    if (error) {
      throw new Error(
        error.message || "Failed to calculate Vedic Kundli. Please verify birth details and try again."
      );
    }

    if (!data || !data.ascendant || !data.planets) {
      throw new Error("Server returned an invalid or incomplete Kundli response.");
    }

    const typedResponse = data as FreeKundliResponse;

    // Cache the result in memory
    this.memoryCache.set(cacheKey, typedResponse);
    return typedResponse;
  }

  /**
   * Alias for calculateFreeKundli.
   */
  async calculateKundli(request: FreeKundliRequest): Promise<FreeKundliResponse> {
    return this.calculateFreeKundli(request);
  }

  /**
   * Clears the in-memory cache.
   */
  clearCache(): void {
    this.memoryCache.clear();
  }
}

export const freeKundliService = new FreeKundliService();
