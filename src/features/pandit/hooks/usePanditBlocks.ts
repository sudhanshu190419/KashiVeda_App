// src/features/pandit/hooks/usePanditBlocks.ts
import { useCallback, useEffect, useState } from "react";
import { panditService } from "../services/panditService.ts";
import { PanditUnavailabilityBlock } from "../types/pandit.types.ts";

export const usePanditBlocks = () => {
  const [blocks, setBlocks] = useState<PanditUnavailabilityBlock[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadBlocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await panditService.fetchUnavailabilityBlocks();
      setBlocks(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load unavailable blocks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const addBlock = useCallback(
    async (startsAt: string, endsAt: string, reason?: string) => {
      setSaving(true);
      setError(null);
      try {
        const newBlock = await panditService.createUnavailabilityBlock(startsAt, endsAt, reason);
        setBlocks((prev) => [...prev, newBlock].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
        return newBlock;
      } catch (err: any) {
        const msg = err?.message || "Failed to add unavailable block.";
        setError(msg);
        throw new Error(msg);
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const deleteBlock = useCallback(async (blockId: string) => {
    setSaving(true);
    setError(null);
    try {
      await panditService.deleteUnavailabilityBlock(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } catch (err: any) {
      const msg = err?.message || "Failed to remove block.";
      setError(msg);
      throw new Error(msg);
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    blocks,
    loading,
    saving,
    error,
    loadBlocks,
    addBlock,
    deleteBlock,
  };
};
