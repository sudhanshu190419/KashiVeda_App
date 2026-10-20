// src/features/astrology/services/dailyRashiService.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../../infrastructure/supabase/client.ts";
import { getIndianCalendarDate } from "../../../shared/utils/date.ts";
import {
  DailyRashiInsight,
  DailyRashiInsightResult,
} from "../types/rashi.types.ts";

export const LEGACY_PREFERRED_RASHI_STORAGE_KEY = "@kashiveda_preferred_rashi_id";
export const USER_PREFERRED_RASHI_PREFIX = "@kashiveda_preferred_rashi_id:";
export const GUEST_PREFERRED_RASHI_KEY = "@kashiveda_preferred_rashi_id:guest";
const LEGACY_DAILY_INSIGHT_CACHE_PREFIX = "@kashiveda_daily_insight_";
const DAILY_INSIGHT_CACHE_PREFIX_V2 = "@kashiveda_daily_insight_v2:";

export function getPreferredRashiStorageKey(userId?: string | null): string {
  if (!userId) {
    return GUEST_PREFERRED_RASHI_KEY;
  }
  return `${USER_PREFERRED_RASHI_PREFIX}${userId}`;
}

export type PreferenceSyncStatus =
  | "synced"
  | "remote_only"
  | "local_only"
  | "failed"
  | "guest_saved";

export interface SavePreferredRashiResult {
  status: PreferenceSyncStatus;
  rashiId: number | null;
  userId: string | null;
  error?: string | null;
  cacheWarning?: string | null;
}

class DailyRashiService {
  private memoryCache = new Map<string, DailyRashiInsight | null>();

  constructor() {
    // Proactively clean up legacy un-scoped cache entries on service initialization
    this.cleanupLegacyCache().catch(() => {});
  }

  /**
   * Sanitizes insight content for unverified offline access or unentitled states.
   * Strips premium guidance fields (career, finance, love, health) while preserving free overview.
   */
  sanitizeFreeContent(content: DailyRashiInsight): DailyRashiInsight {
    return {
      ...content,
      career_business: null,
      finance_wealth: null,
      love_relationships: null,
      health_wellbeing: null,
    };
  }

  /**
   * Cleans up legacy globally shared daily insight cache entries.
   * Ensures old un-scoped entries cannot be read or leak across accounts.
   */
  async cleanupLegacyCache(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const legacyKeys = allKeys.filter(
        (key) =>
          key.startsWith(LEGACY_DAILY_INSIGHT_CACHE_PREFIX) &&
          !key.startsWith(DAILY_INSIGHT_CACHE_PREFIX_V2)
      );
      if (legacyKeys.length > 0) {
        await Promise.all(legacyKeys.map((k) => AsyncStorage.removeItem(k)));
      }
      // Neutralize legacy global preferred rashi key to prevent cross-account leak
      await AsyncStorage.removeItem(LEGACY_PREFERRED_RASHI_STORAGE_KEY).catch(() => {});
    } catch {
      // Non-fatal legacy cleanup failure
    }
  }

  /**
   * Determines whether an error returned from Supabase indicates that the
   * authoritative RPC function is not deployed in the database schema.
   */
  isRpcNotDeployedError(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || error.status || "").trim().toUpperCase();
    const message = String(error.message || error.details || "").toLowerCase();

    if (code === "PGRST202" || code === "42883") {
      return true;
    }
    if (
      message.includes("could not find the function") ||
      (message.includes("function") && message.includes("does not exist")) ||
      (message.includes("schema cache") && message.includes("function"))
    ) {
      return true;
    }
    return false;
  }

  /**
   * Determines whether an error represents a transient network or transport failure.
   */
  isNetworkError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err.details || err.error_description || "").toLowerCase();
    const code = String(err.code || "").toUpperCase();
    const name = String(err.name || "").toLowerCase();
    const status = err.status !== undefined ? Number(err.status) : undefined;

    // Explicitly reject definitive database constraints, access violations, syntax errors, and HTTP 4xx
    if (
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 422 ||
      code.startsWith("PGRST") ||
      code.startsWith("23") || // Integrity constraint violations (e.g. 23514 check constraint)
      code.startsWith("42") || // Syntax or access rule violations (e.g. 42501 permission denied)
      code.startsWith("22") || // Data exceptions (e.g. 22P02 invalid input syntax)
      code.startsWith("28") || // Invalid authorization specification
      code === "57014"         // Query canceled (statement timeout)
    ) {
      return false;
    }

    return (
      msg.includes("network") ||
      msg.includes("offline") ||
      msg.includes("failed to fetch") ||
      msg.includes("fetch failed") ||
      msg.includes("internet") ||
      msg.includes("connection lost") ||
      msg.includes("connection closed") ||
      msg.includes("connection error") ||
      msg.includes("connection reset") ||
      msg.includes("connection refused") ||
      msg.includes("socket hang up") ||
      msg.includes("enotfound") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("timed out") ||
      code === "ECONNABORTED" ||
      code === "ENOTFOUND" ||
      code === "ENETUNREACH" ||
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      name === "aborterror" ||
      status === 0
    );
  }

  /**
   * Generates a deterministic cache key scoped to the authenticated user ID (or anon),
   * date, rashi, and language.
   */
  private getCacheKey(userScope: string, date: string, rashiId: number, language = "en"): string {
    return `${userScope}:${date}:${rashiId}:${language}`;
  }

  /**
   * Fetches the authoritative daily Rashi insight from Supabase.
   * Performs server-side subscription entitlement verification via RPC.
   * Caching is strictly scoped to the authenticated user identity.
   */
  async fetchDailyInsight(
    date?: string,
    rashiId?: number,
    language = "en",
    userId?: string | null,
    options?: { bypassCache?: boolean; revalidate?: boolean }
  ): Promise<DailyRashiInsightResult> {
    // Resolve authenticated user ID
    let effectiveUserId: string | null = userId !== undefined ? userId : null;
    if (userId === undefined) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        effectiveUserId = session?.user?.id || null;
      } catch {
        effectiveUserId = null;
      }
    }

    const targetDate = date || getIndianCalendarDate();
    const targetRashiId = rashiId || (await this.getPreferredRashi(effectiveUserId)) || 1;

    const userScope = effectiveUserId ? `u_${effectiveUserId}` : "anon";
    const cacheKey = this.getCacheKey(userScope, targetDate, targetRashiId, language);

    // Strict Entitlement Policy (Option A):
    // The backend is the sole authority for premium entitlement.
    // A local memory cache hit must NEVER independently produce is_entitled: true
    // or return premium content before current server-side verification.

    try {
      // 1. Invoke authoritative RPC: get_daily_rashi_insight
      const { data, error } = await supabase.rpc("get_daily_rashi_insight", {
        p_insight_date: targetDate,
        p_rashi_id: targetRashiId,
        p_language: language,
      });

      if (error) {
        // If error indicates network/transport failure, throw into offline recovery
        if (this.isNetworkError(error)) {
          throw error;
        }

        // Fallback: strictly restricted to missing RPC deployment condition
        if (this.isRpcNotDeployedError(error)) {
          return await this.fallbackFetchInsight(
            targetDate,
            targetRashiId,
            language,
            effectiveUserId,
            cacheKey
          );
        }

        // Any other RPC failure (permission, statement timeout, database/syntax error):
        // Surface genuine backend failure. Do NOT convert into empty content or paywall.
        return {
          success: false,
          is_entitled: false,
          is_unverified: false,
          content: null,
          insight_date: targetDate,
          rashi_id: targetRashiId,
          language,
          error: error.message || "Failed to load daily astrological insight.",
        };
      }

      const rpcResult = data as DailyRashiInsightResult;
      const isEntitled = !!rpcResult?.is_entitled;
      const insightContent = rpcResult?.content || (rpcResult as any)?.insight || null;

      if (rpcResult && isEntitled) {
        if (insightContent) {
          // Cache full entitled content strictly scoped to current user identity
          this.memoryCache.set(cacheKey, insightContent);
          try {
            // Strict Option A: Never persist un-sanitized premium fields to device storage
            const sanitizedForStorage = this.sanitizeFreeContent(insightContent);
            await AsyncStorage.setItem(
              `${DAILY_INSIGHT_CACHE_PREFIX_V2}${cacheKey}`,
              JSON.stringify(sanitizedForStorage)
            );
          } catch {
            // Non-fatal cache storage error
          }
        }

        return {
          success: rpcResult.success ?? true,
          is_entitled: true,
          is_unverified: false,
          content: insightContent,
          insight_date: targetDate,
          rashi_id: targetRashiId,
          language,
          message: rpcResult.message,
        };
      }

      // Customer is confirmed NOT entitled by backend:
      // Immediately evict from in-memory cache and persistent storage so stale entitlement cannot persist
      this.memoryCache.delete(cacheKey);
      try {
        await AsyncStorage.removeItem(`${DAILY_INSIGHT_CACHE_PREFIX_V2}${cacheKey}`);
      } catch {
        // Non-fatal cache deletion error
      }

      return {
        success: rpcResult?.success ?? false,
        is_entitled: false,
        is_unverified: false,
        content: (rpcResult as any)?.content ? this.sanitizeFreeContent((rpcResult as any).content) : null,
        insight_date: targetDate,
        rashi_id: targetRashiId,
        language,
        error:
          rpcResult?.error ||
          "An active Vedic Astrology subscription is required to access Daily Insights.",
      };
    } catch (err: any) {
      // Network failed or device is offline.
      // AST-02 Offline Policy:
      // Cached premium content must NEVER be displayed solely because a previous response was cached.
      // Premium fields must remain hidden and is_entitled must be false.
      if (this.isNetworkError(err)) {
        const offlineCached = await this.getOfflineCachedInsight(
          targetDate,
          targetRashiId,
          language,
          userScope
        );
        if (offlineCached) {
          const sanitized = this.sanitizeFreeContent(offlineCached);
          return {
            success: true,
            is_entitled: false,
            is_unverified: true,
            content: sanitized,
            insight_date: targetDate,
            rashi_id: targetRashiId,
            language,
            error: "Subscription status cannot be verified offline. Showing daily cosmic overview.",
          };
        }
      }

      throw new Error(err?.message || "Failed to load daily astrological insight.");
    }
  }

  /**
   * Fallback retrieval logic when migration 045 RPC is awaiting manual database deployment.
   */
  private async fallbackFetchInsight(
    date: string,
    rashiId: number,
    language: string,
    userId: string | null,
    cacheKey: string
  ): Promise<DailyRashiInsightResult> {
    let callerId = userId;
    if (!callerId) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      callerId = session?.user?.id || null;
    }

    if (!callerId) {
      this.memoryCache.delete(cacheKey);
      try {
        await AsyncStorage.removeItem(`${DAILY_INSIGHT_CACHE_PREFIX_V2}${cacheKey}`);
      } catch {
        // Non-fatal cache deletion error
      }
      return {
        success: false,
        is_entitled: false,
        is_unverified: false,
        content: null,
        insight_date: date,
        rashi_id: rashiId,
        language,
        error: "Authentication required to read Daily Insights.",
      };
    }

    // Check subscription entitlement matching authoritative SQL predicates
    let subQuery = supabase
      .from("astrology_subscriptions")
      .select(
        `
        id,
        starts_at,
        ends_at,
        status,
        astrology_subscription_plans (
          daily_in_app_enabled,
          is_active
        )
      `
      )
      .eq("customer_id", callerId)
      .eq("status", "active");

    if (typeof (subQuery as any).order === "function") {
      subQuery = (subQuery as any).order("ends_at", { ascending: false });
    }

    let subRows: any;
    let subError: any;

    if (typeof (subQuery as any).then !== "function" && typeof (subQuery as any).maybeSingle === "function") {
      const res = await (subQuery as any).maybeSingle();
      subRows = res.data;
      subError = res.error;
    } else {
      const res = await subQuery;
      subRows = res.data;
      subError = res.error;
    }

    if (subError) {
      return {
        success: false,
        is_entitled: false,
        is_unverified: false,
        content: null,
        insight_date: date,
        rashi_id: rashiId,
        language,
        error: subError.message || "Failed to verify subscription status.",
      };
    }

    const nowMs = Date.now();
    const rows: any[] = Array.isArray(subRows) ? subRows : subRows ? [subRows] : [];

    // Evaluate all potentially qualifying records against authoritative SQL predicates:
    // status = 'active' AND starts_at <= now() AND ends_at > now() AND plan.daily_in_app_enabled = true
    // (AST-Q02 Option A: plan.is_active affects new sales only; existing subscribers retain daily insight access)
    const qualifyingSub = rows.find((row) => {
      if (row.status !== "active") return false;
      if (!row.starts_at || !row.ends_at) return false;

      const startMs = new Date(row.starts_at).getTime();
      const endMs = new Date(row.ends_at).getTime();
      if (isNaN(startMs) || isNaN(endMs)) return false;

      if (startMs > nowMs || endMs <= nowMs) return false;

      const plan = row.astrology_subscription_plans;
      if (!plan) return false;
      if (plan.daily_in_app_enabled !== true) return false;

      return true;
    });

    const isEntitled = Boolean(qualifyingSub);

    if (!isEntitled) {
      this.memoryCache.delete(cacheKey);
      try {
        await AsyncStorage.removeItem(`${DAILY_INSIGHT_CACHE_PREFIX_V2}${cacheKey}`);
      } catch {
        // Non-fatal cache deletion error
      }
      return {
        success: false,
        is_entitled: false,
        is_unverified: false,
        content: null,
        insight_date: date,
        rashi_id: rashiId,
        language,
        error: "An active Vedic Astrology subscription is required to access Daily Insights.",
      };
    }

    // Query daily_rashi_insights table directly
    const { data: insightData, error: insightError } = await supabase
      .from("daily_rashi_insights")
      .select("*")
      .eq("insight_date", date)
      .eq("rashi_id", rashiId)
      .eq("language", language)
      .eq("status", "published")
      .maybeSingle();

    if (insightError) {
      return {
        success: false,
        is_entitled: true,
        is_unverified: false,
        content: null,
        insight_date: date,
        rashi_id: rashiId,
        language,
        error: insightError.message || "Failed to load daily astrological insight.",
      };
    }

    if (!insightData) {
      return {
        success: true,
        is_entitled: true,
        is_unverified: false,
        content: null,
        insight_date: date,
        rashi_id: rashiId,
        language,
      };
    }

    const insight = insightData as DailyRashiInsight;
    this.memoryCache.set(cacheKey, insight);
    try {
      // Strict Option A: Never persist un-sanitized premium fields to device storage
      const sanitizedForStorage = this.sanitizeFreeContent(insight);
      await AsyncStorage.setItem(
        `${DAILY_INSIGHT_CACHE_PREFIX_V2}${cacheKey}`,
        JSON.stringify(sanitizedForStorage)
      );
    } catch {
      // Non-fatal cache storage error
    }

    return {
      success: true,
      is_entitled: true,
      is_unverified: false,
      content: insight,
      insight_date: date,
      rashi_id: rashiId,
      language,
    };
  }

  /**
   * Retrieves offline cached insight from AsyncStorage scoped to userScope.
   * Only reads from the secure v2 user-scoped cache prefix.
   */
  private async getOfflineCachedInsight(
    date: string,
    rashiId: number,
    language: string,
    userScope: string
  ): Promise<DailyRashiInsight | null> {
    try {
      const cacheKey = this.getCacheKey(userScope, date, rashiId, language);
      const raw = await AsyncStorage.getItem(`${DAILY_INSIGHT_CACHE_PREFIX_V2}${cacheKey}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Cache read error ignored
    }
    return null;
  }

  /**
   * Retrieves customer preferred Rashi ID from local storage or user profile.
   */
  /**
   * Retrieves customer preferred Rashi ID from authoritative profile or account-scoped cache.
   * Authenticated user precedence:
   * 1. Supabase public.profiles (authoritative). If successful, syncs to user's scoped cache.
   * 2. If profile returns null (no preference), clears user's scoped cache and returns null.
   * 3. If profile read fails (e.g. offline/network failure), falls back ONLY to this user's scoped cache.
   * 4. For unauthenticated guests, reads only from GUEST_PREFERRED_RASHI_KEY.
   * NEVER reads Customer A's cache for Customer B, nor does it read the legacy global key.
   */
  async getPreferredRashi(explicitUserId?: string | null): Promise<number | null> {
    // 1. Proactively neutralize legacy un-scoped key
    try {
      await AsyncStorage.removeItem(LEGACY_PREFERRED_RASHI_STORAGE_KEY);
    } catch {
      // ignore
    }

    // 2. Resolve target user identity
    let targetUserId: string | null = null;
    if (explicitUserId !== undefined) {
      targetUserId = explicitUserId;
    } else {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        targetUserId = session?.user?.id || null;
      } catch {
        targetUserId = null;
      }
    }

    // 3. Unauthenticated / Guest flow: scoped strictly to guest key
    if (!targetUserId) {
      try {
        const guestVal = await AsyncStorage.getItem(GUEST_PREFERRED_RASHI_KEY);
        if (guestVal) {
          const parsed = parseInt(guestVal, 10);
          if (parsed >= 1 && parsed <= 12) {
            return parsed;
          }
        }
      } catch {
        // guest storage read error ignored
      }
      return null;
    }

    // 4. Authenticated flow: Consult authoritative Supabase profile first
    let profileReadFailed = false;
    let profilePreference: number | null = null;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("preferred_rashi_id")
        .eq("id", targetUserId)
        .maybeSingle();

      if (error) {
        profileReadFailed = true;
      } else {
        const rawId = data?.preferred_rashi_id;
        if (typeof rawId === "number" && rawId >= 1 && rawId <= 12) {
          profilePreference = rawId;
        } else {
          profilePreference = null;
        }
      }
    } catch {
      profileReadFailed = true;
    }

    const scopedKey = getPreferredRashiStorageKey(targetUserId);

    if (!profileReadFailed) {
      // Authoritative profile response received
      if (profilePreference !== null) {
        // Synchronize authoritative preference into this account's scoped cache
        try {
          await AsyncStorage.setItem(scopedKey, String(profilePreference));
        } catch {
          // ignore cache write error
        }
        return profilePreference;
      } else {
        // Profile authoritatively indicates NO preference set (null)
        // Clear this account's scoped cache so old cached values never override authoritative null
        try {
          await AsyncStorage.removeItem(scopedKey);
        } catch {
          // ignore cache remove error
        }
        return null;
      }
    }

    // 5. Offline Fallback: Profile read failed (e.g. network offline).
    // Consult ONLY this user's account-scoped cache. Never read other users' caches.
    try {
      const stored = await AsyncStorage.getItem(scopedKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (parsed >= 1 && parsed <= 12) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Saves customer preferred Rashi preference to authoritative public.profiles via RPC
   * and synchronizes to account-scoped local storage.
   *
   * Distinguishes:
   * - "synced": RPC succeeded, local cache synchronized
   * - "local_only": RPC failed, but retained in this account's scoped cache (offline)
   * - "failed": Both RPC and local storage failed (or account changed during save)
   * - "guest_saved": Unauthenticated user, saved to guest-scoped cache
   */
  async savePreferredRashi(
    rashiId: number | null,
    explicitUserId?: string | null
  ): Promise<SavePreferredRashiResult> {
    if (rashiId !== null && (rashiId < 1 || rashiId > 12)) {
      throw new Error("Invalid Rashi identifier. Must be between 1 and 12.");
    }

    // Neutralize legacy global key if present
    try {
      await AsyncStorage.removeItem(LEGACY_PREFERRED_RASHI_STORAGE_KEY);
    } catch {
      // ignore
    }

    // Invalidate in-memory insight cache to force fresh calculation
    this.memoryCache.clear();

    // Determine target user ID
    let targetUserId: string | null = null;
    if (explicitUserId !== undefined) {
      targetUserId = explicitUserId;
    } else {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        targetUserId = session?.user?.id || null;
      } catch {
        targetUserId = null;
      }
    }

    // 1. Guest / Unauthenticated flow
    if (!targetUserId) {
      try {
        if (rashiId === null) {
          await AsyncStorage.removeItem(GUEST_PREFERRED_RASHI_KEY);
        } else {
          await AsyncStorage.setItem(GUEST_PREFERRED_RASHI_KEY, String(rashiId));
        }
        return {
          status: "guest_saved",
          rashiId,
          userId: null,
        };
      } catch (err: any) {
        return {
          status: "failed",
          rashiId,
          userId: null,
          error: err?.message || "Failed to save guest preference",
        };
      }
    }

    // 2. Authenticated user flow: Persist to authoritative profile via RPC
    let rpcSuccess = false;
    let rpcErrorMsg: string | null = null;
    let rpcIsNetwork = false;

    try {
      const { error } = await supabase.rpc("set_customer_preferred_rashi", {
        p_rashi_id: rashiId,
      });

      if (error) {
        rpcSuccess = false;
        rpcErrorMsg = error.message || "Failed to update profile preferred rashi";
        rpcIsNetwork = this.isNetworkError(error);
      } else {
        rpcSuccess = true;
      }
    } catch (err: any) {
      rpcSuccess = false;
      rpcErrorMsg = err?.message || "RPC execution failed";
      rpcIsNetwork = this.isNetworkError(err);
    }

    // Verify account consistency: Ensure user did not switch accounts during async call
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      const currentUserId = currentSession?.user?.id || null;

      if (currentUserId !== targetUserId) {
        // Account changed while save was in flight!
        // Do NOT contaminate the newly logged in account's local cache or active state.
        return {
          status: "failed",
          rashiId,
          userId: targetUserId,
          error: "Account changed while saving preference.",
        };
      }
    } catch {
      // ignore session check error
    }

    // 3. Evaluate RPC outcome and determine local persistence action
    const scopedKey = getPreferredRashiStorageKey(targetUserId);

    if (rpcSuccess) {
      // Remote RPC committed successfully to authoritative user profile.
      // Now synchronize this confirmed value into user-scoped local storage.
      try {
        if (rashiId === null) {
          await AsyncStorage.removeItem(scopedKey);
        } else {
          await AsyncStorage.setItem(scopedKey, String(rashiId));
        }
        return {
          status: "synced",
          rashiId,
          userId: targetUserId,
        };
      } catch (localErr: any) {
        // Remote save succeeded on server, but writing device cache failed.
        // Accurately report remote success and local cache failure without false claim of synced or total failure.
        const localErrorMsg = localErr?.message || "Failed to write user local storage";
        return {
          status: "remote_only",
          rashiId,
          userId: targetUserId,
          error: localErrorMsg,
          cacheWarning: `Remote preference was saved successfully, but local cache update failed: ${localErrorMsg}`,
        };
      }
    }

    // 4. Remote RPC failed: Distinguish transient network failure from definitive operation rejection
    if (rpcIsNetwork) {
      // Genuine network transport failure (offline / unreachable).
      // Retain the selection in the user's scoped local cache for offline usage.
      try {
        if (rashiId === null) {
          await AsyncStorage.removeItem(scopedKey);
        } else {
          await AsyncStorage.setItem(scopedKey, String(rashiId));
        }
        return {
          status: "local_only",
          rashiId,
          userId: targetUserId,
          error: rpcErrorMsg,
        };
      } catch (localErr: any) {
        // Both remote RPC (network) and local storage write failed: genuine total failure
        const localErrorMsg = localErr?.message || "Failed to write user local storage";
        return {
          status: "failed",
          rashiId,
          userId: targetUserId,
          error: `${rpcErrorMsg || "Network failure"}; Local cache write also failed: ${localErrorMsg}`,
        };
      }
    }

    // 5. Definitive non-network RPC failure (authorization, permission, validation, constraint rejection)
    // MUST NOT write to local cache (do not store rejected preferences locally).
    // MUST NOT return local_only or synced.
    return {
      status: "failed",
      rashiId,
      userId: targetUserId,
      error: rpcErrorMsg || "Operation rejected by server",
    };
  }

  private async saveLocalPreferredRashi(
    rashiId: number | null,
    userId?: string | null
  ): Promise<void> {
    const key = getPreferredRashiStorageKey(userId);
    try {
      await AsyncStorage.removeItem(LEGACY_PREFERRED_RASHI_STORAGE_KEY).catch(() => {});
      if (rashiId === null) {
        await AsyncStorage.removeItem(key);
      } else {
        await AsyncStorage.setItem(key, String(rashiId));
      }
    } catch {
      // Local storage write error ignored
    }
  }

  /**
   * Alias for fetchDailyInsight with object parameter.
   */
  async getDailyInsight(params: {
    rashiId?: number;
    date?: string;
    language?: string;
    userId?: string | null;
    bypassCache?: boolean;
    revalidate?: boolean;
  }): Promise<{
    isEntitled: boolean;
    hasSubscription: boolean;
    insight: DailyRashiInsight | null;
    isUnverified?: boolean;
  }> {
    const res = await this.fetchDailyInsight(
      params.date,
      params.rashiId,
      params.language,
      params.userId,
      { bypassCache: params.bypassCache, revalidate: params.revalidate }
    );
    return {
      isEntitled: !!res.is_entitled,
      hasSubscription: !!res.is_entitled,
      insight: res.content || null,
      isUnverified: !!res.is_unverified,
    };
  }

  /**
   * Alias for savePreferredRashi.
   */
  async updatePreferredRashi(
    rashiId: number | null,
    userId?: string | null
  ): Promise<SavePreferredRashiResult> {
    return this.savePreferredRashi(rashiId, userId);
  }

  /**
   * Clears the in-memory insight cache and persisted storage.
   * Avoids deleting unrelated AsyncStorage data by matching only daily insight prefixes.
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const dailyKeys = allKeys.filter(
        (k) =>
          k.startsWith(DAILY_INSIGHT_CACHE_PREFIX_V2) ||
          k.startsWith(LEGACY_DAILY_INSIGHT_CACHE_PREFIX)
      );
      if (dailyKeys.length > 0) {
        await Promise.all(dailyKeys.map((k) => AsyncStorage.removeItem(k)));
      }
    } catch {
      // Storage cleanup failure non-fatal
    }
  }

  /**
   * Alias for clearCache (memory only).
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }

  /**
   * Clears active session in-memory insight cache and applicable daily insight storage on logout or account switch.
   */
  async clearSessionCache(userId?: string | null): Promise<void> {
    this.memoryCache.clear();
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      let targetKeys: string[];
      if (userId) {
        const userPrefix = `${DAILY_INSIGHT_CACHE_PREFIX_V2}u_${userId}:`;
        targetKeys = allKeys.filter((k) => k.startsWith(userPrefix));
      } else {
        targetKeys = allKeys.filter(
          (k) =>
            k.startsWith(DAILY_INSIGHT_CACHE_PREFIX_V2) ||
            k.startsWith(LEGACY_DAILY_INSIGHT_CACHE_PREFIX)
        );
      }
      if (targetKeys.length > 0) {
        await Promise.all(targetKeys.map((k) => AsyncStorage.removeItem(k)));
      }
    } catch {
      // Storage cleanup failure non-fatal
    }
  }
}

export const dailyRashiService = new DailyRashiService();
