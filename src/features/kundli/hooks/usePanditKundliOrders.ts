// src/features/kundli/hooks/usePanditKundliOrders.ts
import { useCallback, useEffect, useState } from "react";
import { KundliDocument, KundliOrder, KundliOrderStatus } from "../types/kundli.types.ts";
import { kundliService } from "../services/kundliService.ts";

export function usePanditKundliOrders(statusFilter?: KundliOrderStatus) {
  const [orders, setOrders] = useState<KundliOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [uploadingOrderId, setUploadingOrderId] = useState<string | null>(null);

  const pageSize = 10;

  const fetchOrders = useCallback(
    async (pageToFetch: number = 1, isRefresh: boolean = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (pageToFetch === 1) {
          setLoading(true);
        }
        setError(null);

        const result = await kundliService.getPanditKundliOrders(
          pageToFetch,
          pageSize,
          statusFilter
        );

        if (pageToFetch === 1) {
          setOrders(result.orders);
        } else {
          setOrders((prev) => [...prev, ...result.orders]);
        }
        setTotalCount(result.count);
        setPage(pageToFetch);
      } catch (err: any) {
        setError(err?.message || "Failed to load Pandit Kundli orders.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  const refresh = () => fetchOrders(1, true);

  const fetchNextPage = async () => {
    if (orders.length < totalCount && !loading && !refreshing) {
      await fetchOrders(page + 1);
    }
  };

  const uploadDocument = async (
    orderId: string,
    file: { uri?: string; name: string; type?: string; arrayBuffer?: ArrayBuffer; base64?: string },
    uploaderUserId: string
  ): Promise<KundliDocument> => {
    console.log("[KUNDLI_UPLOAD_DEBUG] usePanditKundliOrders: uploadDocument entered", {
      orderId,
      fileName: file?.name,
      uploaderUserId,
    });
    console.log("[KUNDLI_UPLOAD_DEBUG] usePanditKundliOrders: orderId =", orderId);
    console.log("[KUNDLI_UPLOAD_DEBUG] usePanditKundliOrders: fileName =", file?.name);
    try {
      setUploadingOrderId(orderId);
      setError(null);
      console.log("[KUNDLI_UPLOAD_DEBUG] usePanditKundliOrders: calling kundliService.uploadKundliDocument");
      const doc = await kundliService.uploadKundliDocument(orderId, file, uploaderUserId);
      console.log("[KUNDLI_UPLOAD_DEBUG] usePanditKundliOrders: kundliService.uploadKundliDocument succeeded, doc id =", doc?.id);
      await fetchOrders(1, true);
      return doc;
    } catch (err: any) {
      console.log("[KUNDLI_UPLOAD_DEBUG] usePanditKundliOrders: upload error:", {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
      });
      setError(err?.message || "Failed to upload Kundli document.");
      throw err;
    } finally {
      setUploadingOrderId(null);
    }
  };

  return {
    orders,
    loading,
    refreshing,
    error,
    page,
    totalCount,
    statusFilter,
    uploadingOrderId,
    refresh,
    fetchNextPage,
    uploadDocument,
  };
}
