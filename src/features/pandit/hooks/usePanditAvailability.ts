// src/features/pandit/hooks/usePanditAvailability.ts
import { useCallback, useEffect, useState } from "react";
import { panditService } from "../services/panditService.ts";
import { PanditAvailabilityRule } from "../types/pandit.types.ts";

export const usePanditAvailability = () => {
  const [rules, setRules] = useState<PanditAvailabilityRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await panditService.fetchAvailabilityRules();
      setRules(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load schedule rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const saveRule = useCallback(
    async (rule: {
      id?: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      is_active: boolean;
    }) => {
      setSaving(true);
      setError(null);
      try {
        const saved = await panditService.saveAvailabilityRule(rule);
        setRules((prev) => {
          const index = prev.findIndex((r) => r.id === saved.id || (r.day_of_week === saved.day_of_week && !rule.id));
          if (index >= 0) {
            const next = [...prev];
            next[index] = saved;
            return next;
          }
          return [...prev, saved].sort((a, b) => a.day_of_week - b.day_of_week);
        });
        return saved;
      } catch (err: any) {
        const msg = err?.message || "Failed to save schedule rule.";
        setError(msg);
        throw new Error(msg);
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const toggleDayActive = useCallback(
    async (rule: PanditAvailabilityRule) => {
      return saveRule({
        id: rule.id,
        day_of_week: rule.day_of_week,
        start_time: rule.start_time,
        end_time: rule.end_time,
        is_active: !rule.is_active,
      });
    },
    [saveRule]
  );

  const deleteRule = useCallback(async (ruleId: string) => {
    setSaving(true);
    setError(null);
    try {
      await panditService.deleteAvailabilityRule(ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err: any) {
      const msg = err?.message || "Failed to delete schedule rule.";
      setError(msg);
      throw new Error(msg);
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    rules,
    loading,
    saving,
    error,
    loadRules,
    saveRule,
    toggleDayActive,
    deleteRule,
  };
};
