// src/features/astrology/hooks/useCustomerSubscription.ts
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.tsx";
import { astrologyService } from "../services/astrologyService.ts";
import { AstrologySubscription } from "../types/astrology.types.ts";

export function useCustomerSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<AstrologySubscription | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!user?.id) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await astrologyService.getCustomerSubscription(user.id);
      setSubscription(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load current subscription.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const isActive =
    subscription !== null &&
    subscription.status === "active" &&
    Boolean(subscription.ends_at) &&
    new Date(subscription.ends_at as string).getTime() > Date.now();

  const remainingDays =
    subscription && isActive && subscription.ends_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(subscription.ends_at).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 0;

  return {
    subscription,
    isActive,
    remainingDays,
    loading,
    error,
    refresh: fetchSubscription,
  };
}
