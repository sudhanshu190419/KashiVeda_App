// src/features/kundli/hooks/useKundliOrders.ts
import { useCallback, useEffect, useState } from "react";
import { KundliOrder } from "../types/kundli.types.ts";
import { kundliService } from "../services/kundliService.ts";

export function useKundliOrders(initialPage: number = 1, pageSize: number = 10) {
  const [orders, setOrders] = useState<KundliOrder[]>([]);
  const [count, setCount] = useState<number>(0);
  const [page, setPage] = useState<number>(initialPage);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(
    async (targetPage: number = 1, isRefresh: boolean = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (targetPage === 1) {
          setLoading(true);
        }
        setError(null);
        const result = await kundliService.getCustomerKundliOrders(targetPage, pageSize);
        if (targetPage === 1) {
          setOrders(result.orders);
        } else {
          setOrders((prev) => [...prev, ...result.orders]);
        }
        setCount(result.count);
        setPage(targetPage);
      } catch (err: any) {
        setError(err?.message || "Failed to load Kundli orders.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  const refresh = () => {
    fetchOrders(1, true);
  };

  const fetchNextPage = async () => {
    if (orders.length < count && !loading && !refreshing) {
      await fetchOrders(page + 1);
    }
  };

  const loadPage = (newPage: number) => {
    fetchOrders(newPage);
  };

  return {
    orders,
    count,
    page,
    loading,
    refreshing,
    error,
    loadPage,
    fetchNextPage,
    refresh,
    totalPages: Math.ceil(count / pageSize) || 1,
  };
}
