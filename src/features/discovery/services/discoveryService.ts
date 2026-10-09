// src/features/discovery/services/discoveryService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import {
  PanditPujaOffering,
  PanditSummary,
  PujaCategory,
  PujaService,
  Review,
  SamagriPackage,
  ServiceMode,
} from "../types/discovery.ts";

export interface FetchPujaServicesOptions {
  categoryId?: string;
  search?: string;
  serviceMode?: ServiceMode;
  limit?: number;
  offset?: number;
}

export interface FetchPanditsOptions {
  serviceMode?: ServiceMode;
  latitude?: number;
  longitude?: number;
  pujaServiceId?: string;
  templeId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Discovery service for querying categories, rituals, pandits, and reviews
 * via RLS-protected Supabase PostgREST queries and authoritative RPCs.
 */
export const discoveryService = {
  /**
   * Fetch all active puja categories ordered by display_order and name.
   */
  async fetchCategories(): Promise<PujaCategory[]> {
    const { data, error } = await supabase
      .from("puja_categories")
      .select("id, name, description, display_order, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch puja categories: ${error.message}`);
    }

    return (data as PujaCategory[]) || [];
  },

  /**
   * Fetch active puja services with optional category filtering and search.
   */
  async fetchPujaServices(options: FetchPujaServicesOptions = {}): Promise<PujaService[]> {
    const { categoryId, search, serviceMode, limit = 50, offset = 0 } = options;

    let query = supabase
      .from("puja_services")
      .select(`
        id,
        category_id,
        name,
        description,
        default_duration_minutes,
        allowed_modes,
        is_active,
        created_at,
        category:puja_categories(id, name)
      `)
      .eq("is_active", true);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (search && search.trim().length > 0) {
      query = query.ilike("name", `%${search.trim()}%`);
    }

    if (serviceMode) {
      query = query.contains("allowed_modes", [serviceMode]);
    }

    query = query
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch puja services: ${error.message}`);
    }

    return (data as unknown as PujaService[]) || [];
  },

  /**
   * Fetch full details for a single puja service including samagri packages.
   */
  async fetchPujaDetail(pujaId: string): Promise<{
    puja: PujaService;
    samagriPackages: SamagriPackage[];
    offeringsCount: number;
    minPrice: number | null;
    modePrices?: {
      home: number | null;
      temple: number | null;
      remote: number | null;
    };
  }> {
    const { data: puja, error: pujaErr } = await supabase
      .from("puja_services")
      .select(`
        id,
        category_id,
        name,
        description,
        default_duration_minutes,
        allowed_modes,
        is_active,
        created_at,
        category:puja_categories(id, name)
      `)
      .eq("id", pujaId)
      .eq("is_active", true)
      .single();

    if (pujaErr || !puja) {
      throw new Error(pujaErr?.message || "Puja service not found");
    }

    // Fetch predefined samagri packages for this puja
    const { data: packagesData } = await supabase
      .from("samagri_packages")
      .select(`
        id,
        puja_service_id,
        name,
        description,
        is_active,
        items:samagri_package_items(
          quantity,
          item:samagri_items(id, name, description, unit, unit_price)
        )
      `)
      .eq("puja_service_id", pujaId)
      .eq("is_active", true);

    // Fetch pandit offering price summary for this puja
    const { data: offeringsData } = await supabase
      .from("pandit_puja_services")
      .select("price, home_price, temple_price, remote_price")
      .eq("puja_service_id", pujaId)
      .eq("is_active", true);

    let minPrice: number | null = null;
    let minHomePrice: number | null = null;
    let minTemplePrice: number | null = null;
    let minRemotePrice: number | null = null;

    const offeringsCount = offeringsData?.length || 0;
    if (offeringsData && offeringsData.length > 0) {
      const allPrices: number[] = [];
      const homePrices: number[] = [];
      const templePrices: number[] = [];
      const remotePrices: number[] = [];

      offeringsData.forEach((o: any) => {
        const hp = o.home_price != null ? Number(o.home_price) : null;
        const tp = o.temple_price != null ? Number(o.temple_price) : null;
        const rp = o.remote_price != null ? Number(o.remote_price) : null;
        const p = o.price != null ? Number(o.price) : null;

        if (hp != null && !isNaN(hp) && hp > 0) {
          homePrices.push(hp);
          allPrices.push(hp);
        }
        if (tp != null && !isNaN(tp) && tp > 0) {
          templePrices.push(tp);
          allPrices.push(tp);
        }
        if (rp != null && !isNaN(rp) && rp > 0) {
          remotePrices.push(rp);
          allPrices.push(rp);
        }
        if (p != null && !isNaN(p) && p > 0 && allPrices.length === 0) {
          allPrices.push(p);
        }
      });

      if (allPrices.length > 0) minPrice = Math.min(...allPrices);
      if (homePrices.length > 0) minHomePrice = Math.min(...homePrices);
      if (templePrices.length > 0) minTemplePrice = Math.min(...templePrices);
      if (remotePrices.length > 0) minRemotePrice = Math.min(...remotePrices);
    }

    return {
      puja: puja as unknown as PujaService,
      samagriPackages: (packagesData as unknown as SamagriPackage[]) || [],
      offeringsCount,
      minPrice,
      modePrices: {
        home: minHomePrice,
        temple: minTemplePrice,
        remote: minRemotePrice,
      },
    };
  },

  /**
   * Fetch pandit directory using authoritative get_customer_pandits RPC.
   */
  async fetchPandits(options: FetchPanditsOptions = {}): Promise<PanditSummary[]> {
    const {
      serviceMode,
      latitude,
      longitude,
      pujaServiceId,
      templeId,
      limit = 20,
      offset = 0,
    } = options;

    const { data, error } = await supabase.rpc("get_customer_pandits", {
      p_service_mode: serviceMode || null,
      p_latitude: latitude || null,
      p_longitude: longitude || null,
      p_puja_service_id: pujaServiceId || null,
      p_limit: limit,
      p_offset: offset,
      p_temple_id: templeId || null,
    });

    if (error) {
      throw new Error(`Failed to fetch pandit directory: ${error.message}`);
    }

    return (data as PanditSummary[]) || [];
  },

  /**
   * Fetch pandit details including their ritual offerings and published reviews.
   */
  async fetchPanditDetail(panditId: string): Promise<{
    pandit: PanditSummary | null;
    offerings: PanditPujaOffering[];
    reviews: Review[];
  }> {
    // 1. Fetch pandit summary via get_customer_pandits
    const pandits = await this.fetchPandits({ limit: 50 });
    const pandit = pandits.find((p) => p.id === panditId) || null;

    // 2. Fetch specific puja offerings configured by this pandit
    const { data: offeringsData, error: offeringsErr } = await supabase
      .from("pandit_puja_services")
      .select(`
        id,
        pandit_id,
        puja_service_id,
        price,
        home_price,
        temple_price,
        remote_price,
        currency,
        duration_minutes,
        is_active,
        puja_service:puja_services(id, name, default_duration_minutes, allowed_modes)
      `)
      .eq("pandit_id", panditId)
      .eq("is_active", true);

    if (offeringsErr) {
      console.warn("Could not load pandit offerings:", offeringsErr.message);
    }

    // 3. Fetch published reviews for this pandit
    const { data: reviewsData, error: reviewsErr } = await supabase
      .from("reviews")
      .select("id, booking_id, customer_id, pandit_id, rating, comment, visibility_status, created_at")
      .eq("pandit_id", panditId)
      .eq("visibility_status", "published")
      .order("created_at", { ascending: false })
      .limit(20);

    if (reviewsErr) {
      console.warn("Could not load pandit reviews:", reviewsErr.message);
    }

    return {
      pandit,
      offerings: (offeringsData as unknown as PanditPujaOffering[]) || [],
      reviews: (reviewsData as Review[]) || [],
    };
  },

  /**
   * Fetch published reviews for a pandit.
   */
  async fetchReviews(panditId: string, limit: number = 20): Promise<Review[]> {
    const { data, error } = await supabase
      .from("reviews")
      .select("id, booking_id, customer_id, pandit_id, rating, comment, visibility_status, created_at")
      .eq("pandit_id", panditId)
      .eq("visibility_status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch reviews: ${error.message}`);
    }

    return (data as Review[]) || [];
  },
};
