// src/features/kundli/services/kundliService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import {
  ConfirmKundliPayoutResult,
  CreateKundliOrderParams,
  CreateKundliOrderResult,
  KundliDocument,
  KundliOrder,
  KundliOrderStatus,
  KundliPandit,
} from "../types/kundli.types.ts";

export const kundliService = {
  /**
   * Fetch all verified, active Pandits offering Kundli services.
   * Enforces backend constraints: kundli_enabled = true, verification_status = 'approved', public_status = 'available'.
   */
  async getKundliPandits(): Promise<KundliPandit[]> {
    const { data, error } = await supabase
      .from("pandit_profiles")
      .select(`
        id,
        user_id,
        bio,
        years_experience,
        languages,
        kundli_enabled,
        kundli_price,
        kundli_turnaround_days,
        verification_status,
        public_status,
        profiles:user_id (
          display_name,
          avatar_url
        )
      `)
      .eq("kundli_enabled", true)
      .eq("verification_status", "approved")
      .eq("public_status", "available")
      .gt("kundli_price", 0)
      .order("years_experience", { ascending: false });

    if (error) {
      throw new Error(error.message || "Failed to load Kundli astrologers.");
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      display_name: row.profiles?.display_name || "Vedic Astrologer",
      avatar_url: row.profiles?.avatar_url || null,
      bio: row.bio || null,
      experience_years: row.years_experience ?? null,
      languages: row.languages ?? [],
      kundli_enabled: Boolean(row.kundli_enabled),
      kundli_price: Number(row.kundli_price || 0),
      kundli_turnaround_days: row.kundli_turnaround_days ?? null,
      verification_status: row.verification_status,
      public_status: row.public_status,
    }));
  },

  /**
   * Fetch a single Kundli Pandit by ID.
   */
  async getKundliPanditById(panditId: string): Promise<KundliPandit | null> {
    const { data, error } = await supabase
      .from("pandit_profiles")
      .select(`
        id,
        user_id,
        bio,
        years_experience,
        languages,
        kundli_enabled,
        kundli_price,
        kundli_turnaround_days,
        verification_status,
        public_status,
        profiles:user_id (
          display_name,
          avatar_url
        )
      `)
      .eq("id", panditId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load Pandit details.");
    }

    if (!data) return null;

    return {
      id: data.id,
      user_id: data.user_id,
      display_name: (data as any).profiles?.display_name || "Vedic Astrologer",
      avatar_url: (data as any).profiles?.avatar_url || null,
      bio: data.bio || null,
      experience_years: data.years_experience ?? null,
      languages: data.languages ?? [],
      kundli_enabled: Boolean(data.kundli_enabled),
      kundli_price: Number(data.kundli_price || 0),
      kundli_turnaround_days: data.kundli_turnaround_days ?? null,
      verification_status: data.verification_status,
      public_status: data.public_status,
    };
  },

  /**
   * Create a Kundli order via the authoritative database RPC.
   * Atomically creates the kundli_orders record and 100% upfront payment_orders obligation.
   */
  async createKundliOrder(params: CreateKundliOrderParams): Promise<CreateKundliOrderResult> {
    const {
      pandit_id,
      date_of_birth,
      time_of_birth,
      place_of_birth,
      birth_latitude,
      birth_longitude,
      additional_notes,
    } = params;

    if (!pandit_id) {
      throw new Error("Please select a Pandit for your Kundli.");
    }
    if (!date_of_birth || !time_of_birth || !place_of_birth || !place_of_birth.trim()) {
      throw new Error("Date of birth, time of birth, and place of birth are required.");
    }

    const { data, error } = await supabase.rpc("create_kundli_order", {
      p_pandit_id: pandit_id,
      p_date_of_birth: date_of_birth,
      p_time_of_birth: time_of_birth,
      p_place_of_birth: place_of_birth.trim(),
      p_birth_latitude: birth_latitude ?? null,
      p_birth_longitude: birth_longitude ?? null,
      p_additional_notes: additional_notes?.trim() ?? null,
    });

    if (error) {
      throw new Error(error.message || "Failed to create Kundli order.");
    }

    return data as CreateKundliOrderResult;
  },

  /**
   * Fetch customer's own Kundli orders with pagination.
   */
  async getCustomerKundliOrders(
    page: number = 1,
    pageSize: number = 10
  ): Promise<{ orders: KundliOrder[]; count: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from("kundli_orders")
      .select(
        `
        id,
        order_number,
        customer_id,
        pandit_id,
        price,
        currency,
        date_of_birth,
        time_of_birth,
        place_of_birth,
        additional_notes,
        status,
        customer_confirmed_at,
        completed_at,
        created_at,
        updated_at,
        pandit_profiles:pandit_id (
          id,
          kundli_price,
          kundli_turnaround_days,
          profiles:user_id (
            display_name,
            avatar_url
          )
        ),
        kundli_documents (
          id,
          version_number,
          storage_path,
          file_name,
          uploaded_by,
          uploaded_at,
          is_current
        )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message || "Failed to load Kundli orders.");
    }

    const orders: KundliOrder[] = (data || []).map((row: any) => {
      const docs: KundliDocument[] = (row.kundli_documents || []).map((d: any) => ({
        id: d.id,
        kundli_order_id: row.id,
        version_number: d.version_number,
        storage_path: d.storage_path,
        file_name: d.file_name,
        uploaded_by: d.uploaded_by,
        uploaded_at: d.uploaded_at,
        is_current: d.is_current,
      }));

      const currentDoc = docs.find((d) => d.is_current) || docs[0] || null;

      return {
        id: row.id,
        order_number: row.order_number,
        customer_id: row.customer_id,
        pandit_id: row.pandit_id,
        price: Number(row.price),
        currency: row.currency,
        date_of_birth: row.date_of_birth,
        time_of_birth: row.time_of_birth,
        place_of_birth: row.place_of_birth,
        additional_notes: row.additional_notes,
        status: row.status as KundliOrderStatus,
        customer_confirmed_at: row.customer_confirmed_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        pandit: {
          id: row.pandit_id,
          display_name: row.pandit_profiles?.profiles?.display_name || "Vedic Astrologer",
          avatar_url: row.pandit_profiles?.profiles?.avatar_url || null,
          kundli_price: row.pandit_profiles?.kundli_price,
          kundli_turnaround_days: row.pandit_profiles?.kundli_turnaround_days,
        },
        current_document: currentDoc,
        documents: docs,
      };
    });

    return { orders, count: count || orders.length };
  },

  /**
   * Fetch single Kundli order by ID.
   */
  async getKundliOrderById(orderId: string): Promise<KundliOrder | null> {
    const { data, error } = await supabase
      .from("kundli_orders")
      .select(
        `
        id,
        order_number,
        customer_id,
        pandit_id,
        price,
        currency,
        date_of_birth,
        time_of_birth,
        place_of_birth,
        birth_latitude,
        birth_longitude,
        additional_notes,
        status,
        customer_confirmed_at,
        completed_at,
        created_at,
        updated_at,
        pandit_profiles:pandit_id (
          id,
          bio,
          years_experience,
          languages,
          kundli_price,
          kundli_turnaround_days,
          profiles:user_id (
            display_name,
            avatar_url
          )
        ),
        profiles:customer_id (
          id,
          display_name,
          phone,
          email,
          avatar_url
        ),
        kundli_documents (
          id,
          version_number,
          storage_path,
          file_name,
          uploaded_by,
          uploaded_at,
          is_current
        )
      `
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load Kundli order.");
    }

    if (!data) return null;

    const docs: KundliDocument[] = ((data as any).kundli_documents || []).map((d: any) => ({
      id: d.id,
      kundli_order_id: data.id,
      version_number: d.version_number,
      storage_path: d.storage_path,
      file_name: d.file_name,
      uploaded_by: d.uploaded_by,
      uploaded_at: d.uploaded_at,
      is_current: d.is_current,
    }));

    const currentDoc = docs.find((d) => d.is_current) || docs[0] || null;

    return {
      id: data.id,
      order_number: data.order_number,
      customer_id: data.customer_id,
      pandit_id: data.pandit_id,
      price: Number(data.price),
      currency: data.currency,
      date_of_birth: data.date_of_birth,
      time_of_birth: data.time_of_birth,
      place_of_birth: data.place_of_birth,
      birth_latitude: data.birth_latitude,
      birth_longitude: data.birth_longitude,
      additional_notes: data.additional_notes,
      status: data.status as KundliOrderStatus,
      customer_confirmed_at: data.customer_confirmed_at,
      completed_at: data.completed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      pandit: {
        id: data.pandit_id,
        display_name: (data as any).pandit_profiles?.profiles?.display_name || "Vedic Astrologer",
        avatar_url: (data as any).pandit_profiles?.profiles?.avatar_url || null,
        bio: (data as any).pandit_profiles?.bio || null,
        experience_years: (data as any).pandit_profiles?.years_experience,
        languages: (data as any).pandit_profiles?.languages,
        kundli_price: (data as any).pandit_profiles?.kundli_price,
        kundli_turnaround_days: (data as any).pandit_profiles?.kundli_turnaround_days,
      },
      customer: {
        id: data.customer_id,
        display_name: (data as any).profiles?.display_name || "Customer",
        phone: (data as any).profiles?.phone,
        email: (data as any).profiles?.email,
        avatar_url: (data as any).profiles?.avatar_url || null,
      },
      current_document: currentDoc,
      documents: docs,
    };
  },

  /**
   * Fetch assigned Kundli orders for the logged-in Pandit with pagination.
   */
  async getPanditKundliOrders(
    page: number = 1,
    pageSize: number = 10,
    statusFilter?: KundliOrderStatus
  ): Promise<{ orders: KundliOrder[]; count: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("kundli_orders")
      .select(
        `
        id,
        order_number,
        customer_id,
        pandit_id,
        price,
        currency,
        date_of_birth,
        time_of_birth,
        place_of_birth,
        additional_notes,
        status,
        customer_confirmed_at,
        completed_at,
        created_at,
        updated_at,
        profiles:customer_id (
          id,
          display_name,
          avatar_url
        ),
        kundli_documents (
          id,
          version_number,
          storage_path,
          file_name,
          uploaded_by,
          uploaded_at,
          is_current
        )
      `,
        { count: "exact" }
      );

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message || "Failed to load assigned Kundli orders.");
    }

    const orders: KundliOrder[] = (data || []).map((row: any) => {
      const docs: KundliDocument[] = (row.kundli_documents || []).map((d: any) => ({
        id: d.id,
        kundli_order_id: row.id,
        version_number: d.version_number,
        storage_path: d.storage_path,
        file_name: d.file_name,
        uploaded_by: d.uploaded_by,
        uploaded_at: d.uploaded_at,
        is_current: d.is_current,
      }));

      const currentDoc = docs.find((d) => d.is_current) || docs[0] || null;

      return {
        id: row.id,
        order_number: row.order_number,
        customer_id: row.customer_id,
        pandit_id: row.pandit_id,
        price: Number(row.price),
        currency: row.currency,
        date_of_birth: row.date_of_birth,
        time_of_birth: row.time_of_birth,
        place_of_birth: row.place_of_birth,
        additional_notes: row.additional_notes,
        status: row.status as KundliOrderStatus,
        customer_confirmed_at: row.customer_confirmed_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        customer: {
          id: row.customer_id,
          display_name: row.profiles?.display_name || "Customer",
          avatar_url: row.profiles?.avatar_url || null,
        },
        current_document: currentDoc,
        documents: docs,
      };
    });

    return { orders, count: count || orders.length };
  },

  /**
   * Upload completed Kundli PDF document to private storage and insert document metadata.
   * Path convention: {kundli_order_id}/{file_name}
   */
  async uploadKundliDocument(
    orderId: string,
    file: { uri?: string; name: string; type?: string; arrayBuffer?: ArrayBuffer; base64?: string },
    uploaderUserId: string
  ): Promise<KundliDocument> {
    console.log("[KUNDLI_UPLOAD_DEBUG] kundliService.uploadKundliDocument entered", {
      orderId,
      uploaderUserId,
    });
    console.log("[KUNDLI_UPLOAD_DEBUG] File data received:", {
      uri: file?.uri,
      name: file?.name,
      type: file?.type,
      hasArrayBuffer: Boolean(file?.arrayBuffer),
      hasBase64: Boolean(file?.base64),
    });

    if (!orderId || !file || !file.name) {
      console.log("[KUNDLI_UPLOAD_DEBUG] Validation failed: orderId or file or file.name missing");
      throw new Error("Valid order ID and file are required for upload.");
    }

    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${orderId}/${sanitizedFileName}`;

    // 1. Determine next version number for this order
    console.log("[KUNDLI_UPLOAD_DEBUG] Step 1: Previous document lookup starts for order:", orderId);
    let nextVersion = 1;
    try {
      const { data: existingDocs, error: lookupError } = await supabase
        .from("kundli_documents")
        .select("version_number")
        .eq("kundli_order_id", orderId)
        .order("version_number", { ascending: false })
        .limit(1);

      if (lookupError) {
        console.log("[KUNDLI_UPLOAD_DEBUG] STEP 1 (Previous Document Lookup) FAILED:", {
          name: lookupError.name,
          message: lookupError.message,
          code: lookupError.code,
          details: lookupError.details,
          hint: lookupError.hint,
        });
        throw new Error(lookupError.message || "Failed to lookup previous documents.");
      }

      nextVersion = (existingDocs?.[0]?.version_number || 0) + 1;
      console.log("[KUNDLI_UPLOAD_DEBUG] Step 1: Previous document lookup succeeded (existing count:", existingDocs?.length, ", nextVersion:", nextVersion, ")");
    } catch (err: any) {
      console.log("[KUNDLI_UPLOAD_DEBUG] STEP 1 (Previous Document Lookup) FAILED:", {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
      });
      throw err;
    }

    // 2. Prepare file payload for Supabase Storage
    console.log("[KUNDLI_UPLOAD_DEBUG] Step 2: ArrayBuffer payload preparation starts");
    let uploadPayload: ArrayBuffer;
    try {
      if (file.arrayBuffer) {
        uploadPayload = file.arrayBuffer;
      } else if (file.uri) {
        // Read file URI and convert to ArrayBuffer for binary Supabase Storage upload in React Native
        const response = await fetch(file.uri);
        if (!response.ok) {
          throw new Error(`Failed to read selected PDF: HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        uploadPayload = arrayBuffer;
      } else {
        throw new Error("No file content provided for upload.");
      }
      console.log("[KUNDLI_UPLOAD_DEBUG] Step 2: ArrayBuffer payload preparation succeeded (byteLength:", uploadPayload.byteLength, ", isArrayBuffer:", uploadPayload instanceof ArrayBuffer, ")");
    } catch (err: any) {
      console.log("[KUNDLI_UPLOAD_DEBUG] STEP 2 (ArrayBuffer Payload Preparation) FAILED:", {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
      });
      throw err;
    }

    // 3. Upload to private storage bucket 'kundli-documents'
    console.log("[KUNDLI_UPLOAD_DEBUG] Step 3: Supabase Storage ArrayBuffer upload starts (bucket=kundli-documents, path=", storagePath, ")");
    try {
      const { error: storageError } = await supabase.storage
        .from("kundli-documents")
        .upload(storagePath, uploadPayload, {
          contentType: file.type || "application/pdf",
          upsert: true,
        });

      if (storageError) {
        console.log("[KUNDLI_UPLOAD_DEBUG] STEP 3 (Supabase Storage ArrayBuffer Upload) FAILED:", {
          name: storageError.name,
          message: storageError.message,
          stack: (storageError as any)?.stack,
          code: (storageError as any)?.code,
          details: (storageError as any)?.details,
          hint: (storageError as any)?.hint,
        });
        throw new Error(storageError.message || "Failed to upload document file to storage.");
      }
      console.log("[KUNDLI_UPLOAD_DEBUG] Step 3: Supabase Storage ArrayBuffer upload succeeded (path=", storagePath, ")");
    } catch (err: any) {
      console.log("[KUNDLI_UPLOAD_DEBUG] STEP 3 (Supabase Storage ArrayBuffer Upload) FAILED:", {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
      });
      throw err;
    }

    // 4. Mark existing documents as not current if replacing
    console.log("[KUNDLI_UPLOAD_DEBUG] Step 4: Deactivating previous documents starts for order:", orderId);
    try {
      const { error: deactError } = await supabase
        .from("kundli_documents")
        .update({ is_current: false })
        .eq("kundli_order_id", orderId);

      if (deactError) {
        console.log("[KUNDLI_UPLOAD_DEBUG] STEP 4 (Deactivate Previous Documents) FAILED:", {
          name: deactError.name,
          message: deactError.message,
          code: deactError.code,
          details: deactError.details,
          hint: deactError.hint,
        });
        throw new Error(deactError.message || "Failed to update previous document status.");
      }
      console.log("[KUNDLI_UPLOAD_DEBUG] Step 4: Deactivating previous documents succeeded");
    } catch (err: any) {
      console.log("[KUNDLI_UPLOAD_DEBUG] STEP 4 (Deactivate Previous Documents) FAILED:", {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
      });
      throw err;
    }

    // 5. Insert document metadata record
    console.log("[KUNDLI_UPLOAD_DEBUG] Step 5: kundli_documents record insert starts for order:", orderId, "version:", nextVersion);
    let newDoc: any;
    try {
      const { data, error: docError } = await supabase
        .from("kundli_documents")
        .insert({
          kundli_order_id: orderId,
          version_number: nextVersion,
          storage_path: storagePath,
          file_name: sanitizedFileName,
          uploaded_by: uploaderUserId,
          is_current: true,
        })
        .select("id, kundli_order_id, version_number, storage_path, file_name, uploaded_by, uploaded_at, is_current")
        .single();

      if (docError) {
        console.log("[KUNDLI_UPLOAD_DEBUG] STEP 5 (kundli_documents Insert) FAILED:", {
          name: docError.name,
          message: docError.message,
          stack: (docError as any)?.stack,
          code: docError.code,
          details: docError.details,
          hint: docError.hint,
        });
        throw new Error(docError.message || "Failed to save document metadata.");
      }
      newDoc = data;
      console.log("[KUNDLI_UPLOAD_DEBUG] Step 5: kundli_documents record insert succeeded, doc id =", newDoc?.id);
    } catch (err: any) {
      console.log("[KUNDLI_UPLOAD_DEBUG] STEP 5 (kundli_documents Insert) FAILED:", {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
      });
      throw err;
    }

    console.log("[KUNDLI_UPLOAD_DEBUG] kundliService.uploadKundliDocument completed successfully, returning doc:", newDoc?.id);
    return newDoc as KundliDocument;
  },

  /**
   * Generate a secure temporary signed URL (valid for 1 hour) for private Kundli document viewing.
   */
  async getSignedDocumentUrl(storagePath: string): Promise<string> {
    if (!storagePath) {
      throw new Error("Document storage path is required.");
    }

    const { data, error } = await supabase.storage
      .from("kundli-documents")
      .createSignedUrl(storagePath, 3600);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message || "Failed to generate secure document access link.");
    }

    return data.signedUrl;
  },

  /**
   * Customer confirms delivery of Kundli document via authoritative RPC confirm_kundli_and_enable_payout.
   * Atomically transitions order to 'completed' and creates settlement payout record.
   */
  async confirmKundliDelivery(orderId: string): Promise<ConfirmKundliPayoutResult> {
    if (!orderId) {
      throw new Error("Valid Kundli order ID is required.");
    }

    const { data, error } = await supabase.rpc("confirm_kundli_and_enable_payout", {
      p_kundli_order_id: orderId,
    });

    if (error) {
      throw new Error(error.message || "Failed to confirm Kundli delivery.");
    }

    return data as ConfirmKundliPayoutResult;
  },
};
