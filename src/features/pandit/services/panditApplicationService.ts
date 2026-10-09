// src/features/pandit/services/panditApplicationService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import {
  AvailablePujaService,
  PanditApplication,
  PanditApplicationDocument,
  PanditApplicationDocumentType,
} from "../types/application.ts";

export const panditApplicationService = {
  /**
   * Fetches the current user's latest Pandit application.
   */
  async fetchMyApplication(userId: string): Promise<PanditApplication | null> {
    try {
      const { data, error } = await supabase
        .from("pandit_applications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("Error fetching pandit application:", error.message);
        return null;
      }

      return data as PanditApplication | null;
    } catch (err) {
      console.warn("Unexpected error fetching pandit application:", err);
      return null;
    }
  },

  /**
   * Saves or updates a draft application.
   */
  async saveDraftApplication(
    userId: string,
    data: Partial<PanditApplication>
  ): Promise<PanditApplication> {
    const payload = {
      user_id: userId,
      full_name: data.full_name?.trim() || "",
      date_of_birth: data.date_of_birth || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      bio: data.bio?.trim() || null,
      years_experience: typeof data.years_experience === "number" ? data.years_experience : 0,
      languages: data.languages || [],
      vedic_tradition: data.vedic_tradition?.trim() || null,
      primary_city: data.primary_city?.trim() || "",
      base_address: data.base_address?.trim() || null,
      base_latitude: typeof data.base_latitude === "number" ? data.base_latitude : null,
      base_longitude: typeof data.base_longitude === "number" ? data.base_longitude : null,
      service_radius_km: data.service_radius_km || 25,
      selected_puja_ids: data.selected_puja_ids || [],
      puja_prices: data.puja_prices || {},
      kundli_enabled: Boolean(data.kundli_enabled),
      kundli_price: data.kundli_enabled && typeof data.kundli_price === "number" ? data.kundli_price : null,
      kundli_turnaround_days:
        data.kundli_enabled && typeof data.kundli_turnaround_days === "number"
          ? data.kundli_turnaround_days
          : null,
      service_modes: data.service_modes || ["in_person"],
      selected_temple_ids: data.selected_temple_ids || [],
      documents: data.documents || [],
      status: "draft",
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: updated, error } = await supabase
        .from("pandit_applications")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message || "Failed to update draft application");
      }
      return updated as PanditApplication;
    } else {
      const { data: created, error } = await supabase
        .from("pandit_applications")
        .insert([payload])
        .select()
        .single();

      if (error) {
        throw new Error(error.message || "Failed to create draft application");
      }
      return created as PanditApplication;
    }
  },

  /**
   * Submits an application for administrative review via authoritative RPC.
   */
  async submitApplication(applicationId: string): Promise<PanditApplication> {
    const { error: rpcErr } = await supabase.rpc(
      "submit_pandit_application",
      { p_application_id: applicationId }
    );

    if (rpcErr) {
      throw new Error(rpcErr.message || "Failed to submit application for review");
    }

    // Fetch the updated application row
    const { data: updated, error: fetchErr } = await supabase
      .from("pandit_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (fetchErr || !updated) {
      throw new Error("Application submitted but failed to refresh status");
    }

    return updated as PanditApplication;
  },

  /**
   * Uploads an onboarding document to the private pandit-documents bucket.
   * Path convention: applications/{user_id}/{document_type}_{timestamp}.{ext}
   */
  async uploadDocument(
    userId: string,
    documentType: PanditApplicationDocumentType,
    file: { uri: string; name: string; type: string }
  ): Promise<PanditApplicationDocument> {
    if (!file || !file.uri) {
      throw new Error("Invalid file: URI is required");
    }

    const extension = (file.name?.split(".").pop() || "").toLowerCase();
    const allowedExtensions = ["pdf", "jpg", "jpeg", "png", "webp"];
    if (!allowedExtensions.includes(extension)) {
      throw new Error(`Invalid file type: ${file.name}. Allowed formats: PDF, JPG, PNG, WEBP`);
    }

    const cleanFileName = file.name?.replace(/[^a-zA-Z0-9._-]/g, "_") || `doc.${extension}`;
    const storagePath = `applications/${userId}/${documentType}_${Date.now()}_${cleanFileName}`;

    // Read the file as array buffer or blob
    const response = await fetch(file.uri);
    const blob = await response.blob();

    const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
    if (blob.size > MAX_SIZE_BYTES) {
      throw new Error(`File size exceeds 10MB limit (size: ${(blob.size / (1024 * 1024)).toFixed(1)}MB)`);
    }

    const { error: uploadError } = await supabase.storage
      .from("pandit-documents")
      .upload(storagePath, blob, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    return {
      document_type: documentType,
      storage_path: storagePath,
      original_name: file.name,
      uploaded_at: new Date().toISOString(),
    };
  },

  /**
   * Fetches the official Puja service catalog for service selection.
   */
  async fetchAvailablePujas(): Promise<AvailablePujaService[]> {
    try {
      const { data, error } = await supabase
        .from("puja_services")
        .select("id, name, description, default_duration_minutes, allowed_modes")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) {
        console.warn("Could not load puja services:", error.message);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || null,
        default_duration_minutes: row.default_duration_minutes || 60,
        allowed_modes: (row.allowed_modes as string[]) || ["in_person"],
      }));
    } catch {
      return [];
    }
  },
};
