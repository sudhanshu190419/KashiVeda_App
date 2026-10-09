// src/features/pandit/services/panditTempleService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import { Temple } from "../../booking/types/booking.types.ts";
import {
  PanditTempleAssociation,
  RequestNewTempleParams,
  TempleAdditionRequest,
} from "../types/temple.types.ts";

export const panditTempleService = {
  /**
   * Fetches all active temples from the central directory.
   */
  async fetchActiveTemples(): Promise<Temple[]> {
    const { data, error } = await supabase
      .from("temples")
      .select("id, name, address, city, state, latitude, longitude, is_active, created_at")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch active temples: ${error.message}`);
    }

    return (data as Temple[]) || [];
  },

  /**
   * Fetches the current Pandit's requested and approved temple associations.
   */
  async fetchMyTempleAssociations(panditId: string): Promise<PanditTempleAssociation[]> {
    const { data, error } = await supabase
      .from("pandit_temples")
      .select(`
        id,
        pandit_id,
        temple_id,
        status,
        is_active,
        rejection_reason,
        reviewed_at,
        created_at,
        temple:temples(id, name, address, city, state, latitude, longitude)
      `)
      .eq("pandit_id", panditId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch temple associations: ${error.message}`);
    }

    return (data as unknown as PanditTempleAssociation[]) || [];
  },

  /**
   * Requests association with an active temple from the master catalog.
   */
  async requestTempleAssociation(
    panditId: string,
    templeId: string
  ): Promise<PanditTempleAssociation> {
    const { data, error } = await supabase
      .from("pandit_temples")
      .insert([
        {
          pandit_id: panditId,
          temple_id: templeId,
          status: "pending",
          is_active: true,
        },
      ])
      .select(`
        id,
        pandit_id,
        temple_id,
        status,
        is_active,
        rejection_reason,
        reviewed_at,
        created_at,
        temple:temples(id, name, address, city, state, latitude, longitude)
      `)
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("You have already requested or are associated with this temple.");
      }
      throw new Error(`Failed to request temple association: ${error.message}`);
    }

    return data as unknown as PanditTempleAssociation;
  },

  /**
   * Fetches the current Pandit's suggestions for new temples.
   */
  async fetchMyTempleRequests(panditId: string): Promise<TempleAdditionRequest[]> {
    const { data, error } = await supabase
      .from("temple_addition_requests")
      .select("*")
      .eq("pandit_id", panditId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch temple requests: ${error.message}`);
    }

    return (data as TempleAdditionRequest[]) || [];
  },

  /**
   * Submits a suggestion for a new temple to be reviewed by administrators.
   */
  async requestNewTemple(
    panditId: string,
    params: RequestNewTempleParams
  ): Promise<TempleAdditionRequest> {
    if (!params.name.trim()) {
      throw new Error("Temple name is required.");
    }
    if (!params.city.trim()) {
      throw new Error("City is required.");
    }

    const { data, error } = await supabase
      .from("temple_addition_requests")
      .insert([
        {
          pandit_id: panditId,
          name: params.name.trim(),
          address: params.address?.trim() || null,
          city: params.city.trim(),
          state: params.state?.trim() || "Uttar Pradesh",
          status: "pending",
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to submit temple request: ${error.message}`);
    }

    return data as TempleAdditionRequest;
  },

  /**
   * Removes or cancels a pending or rejected association request.
   */
  async removeTempleAssociation(associationId: string): Promise<void> {
    const { error } = await supabase
      .from("pandit_temples")
      .delete()
      .eq("id", associationId);

    if (error) {
      throw new Error(`Failed to remove temple association: ${error.message}`);
    }
  },
};
