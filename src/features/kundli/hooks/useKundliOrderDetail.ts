// src/features/kundli/hooks/useKundliOrderDetail.ts
import { useCallback, useEffect, useState } from "react";
import { KundliOrder } from "../types/kundli.types.ts";
import { kundliService } from "../services/kundliService.ts";

export function useKundliOrderDetail(orderId: string) {
  const [order, setOrder] = useState<KundliOrder | null>(null);
  const [signedDocUrl, setSignedDocUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [docLoading, setDocLoading] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await kundliService.getKundliOrderById(orderId);
      setOrder(data);

      if (data?.current_document?.storage_path) {
        try {
          setDocLoading(true);
          const signed = await kundliService.getSignedDocumentUrl(
            data.current_document.storage_path
          );
          setSignedDocUrl(signed);
        } catch (docErr: any) {
          console.warn("Could not generate signed document URL:", docErr?.message);
        } finally {
          setDocLoading(false);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load Kundli order details.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const confirmDelivery = async () => {
    if (!orderId || confirming) return;
    try {
      setConfirming(true);
      setError(null);
      const result = await kundliService.confirmKundliDelivery(orderId);
      await fetchOrder();
      return result;
    } catch (err: any) {
      setError(err?.message || "Failed to confirm Kundli delivery.");
      throw err;
    } finally {
      setConfirming(false);
    }
  };

  return {
    order,
    signedDocUrl,
    loading,
    docLoading,
    confirming,
    error,
    refresh: fetchOrder,
    confirmDelivery,
  };
}
