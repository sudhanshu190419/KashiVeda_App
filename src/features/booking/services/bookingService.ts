// src/features/booking/services/bookingService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import { SamagriItem } from "../../discovery/types/discovery.ts";
import {
  BookingBalanceCalculation,
  BookingDetail,
  CancellationRefundPreview,
  CancellationResult,
  CreateBookingParams,
  CreateBookingResponse,
  CustomerAddress,
  LiveSessionCredentials,
  PrasadItem,
  RescheduleResult,
  Temple,
} from "../types/booking.types.ts";

/**
 * Defensive mapping helper for nested pandit profile data from PostgREST.
 * Maps pandit_profiles.profiles (via user_id foreign key) to flat { id, display_name, avatar_url, phone }.
 */
function mapPanditProfile(panditRaw: any) {
  if (!panditRaw) return null;
  const profileRaw = Array.isArray(panditRaw.profiles)
    ? panditRaw.profiles[0]
    : panditRaw.profiles || panditRaw.profile;

  return {
    id: panditRaw.id,
    display_name: profileRaw?.display_name || panditRaw.display_name || "Assigned Pandit",
    avatar_url: profileRaw?.avatar_url || panditRaw.avatar_url || null,
    phone: profileRaw?.phone || panditRaw.phone || null,
  };
}

export const bookingService = {
  /**
   * Authoritative RPC to create and validate a booking in PostgreSQL.
   */
  async createOrValidateBooking(params: CreateBookingParams): Promise<CreateBookingResponse> {
    const { data, error } = await supabase.rpc("create_or_validate_booking", {
      p_pandit_id: params.pandit_id,
      p_puja_service_id: params.puja_service_id,
      p_service_mode: params.service_mode,
      p_scheduled_start_at: params.scheduled_start_at,
      p_address_id: params.address_id || null,
      p_temple_id: params.temple_id || null,
      p_samagri_package_id: params.samagri_package_id || null,
      p_custom_samagri_item_ids:
        params.custom_samagri_item_ids && params.custom_samagri_item_ids.length > 0
          ? params.custom_samagri_item_ids
          : null,
      p_custom_samagri_quantities:
        params.custom_samagri_quantities && params.custom_samagri_quantities.length > 0
          ? params.custom_samagri_quantities
          : null,
      p_prasad_item_ids:
        params.prasad_item_ids && params.prasad_item_ids.length > 0
          ? params.prasad_item_ids
          : null,
      p_prasad_quantities:
        params.prasad_quantities && params.prasad_quantities.length > 0
          ? params.prasad_quantities
          : null,
    });

    if (error) {
      throw new Error(error.message || "Failed to create booking.");
    }

    return data as unknown as CreateBookingResponse;
  },

  /**
   * Fetch saved addresses for the authenticated customer.
   */
  async fetchCustomerAddresses(): Promise<CustomerAddress[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("customer_addresses")
      .select("id, customer_id, label, address_line1, address_line2, city, state, pincode, latitude, longitude, is_default, created_at")
      .eq("customer_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load addresses: ${error.message}`);
    }

    return (data as CustomerAddress[]) || [];
  },

  /**
   * Save a new address for the authenticated customer.
   */
  async saveCustomerAddress(address: {
    label: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    state?: string;
    pincode?: string;
    latitude: number;
    longitude: number;
    is_default?: boolean;
  }): Promise<CustomerAddress> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Authentication required to save address.");
    }

    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({
        customer_id: user.id,
        label: address.label,
        address_line1: address.address_line1,
        address_line2: address.address_line2 || null,
        city: address.city,
        state: address.state || null,
        pincode: address.pincode || null,
        latitude: address.latitude,
        longitude: address.longitude,
        is_default: address.is_default || false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save address: ${error.message}`);
    }

    return data as CustomerAddress;
  },

  /**
   * Fetch active temples from the catalog.
   */
  async fetchTemples(): Promise<Temple[]> {
    const { data, error } = await supabase
      .from("temples")
      .select("id, name, address, city, state, latitude, longitude, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to load temples: ${error.message}`);
    }

    return (data as Temple[]) || [];
  },

  /**
   * Fetch available Prasad offerings.
   */
  async fetchPrasadItems(): Promise<PrasadItem[]> {
    const { data, error } = await supabase
      .from("prasad_items")
      .select("id, name, description, unit_price, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to load prasad offerings: ${error.message}`);
    }

    return (data as PrasadItem[]) || [];
  },

  /**
   * Fetch custom Samagri catalog items.
   */
  async fetchCustomSamagriItems(): Promise<SamagriItem[]> {
    const { data, error } = await supabase
      .from("samagri_items")
      .select("id, name, description, unit, unit_price, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw new Error(`Failed to load samagri catalog: ${error.message}`);
    }

    return (data as SamagriItem[]) || [];
  },

  /**
   * Fetch available time slots for a Pandit on a given date (YYYY-MM-DD).
   * Calls the authoritative get_pandit_available_slots SECURITY DEFINER RPC.
   * Computes slots against Pandit availability rules, unavailability blocks,
   * and existing confirmed/upcoming bookings without exposing sensitive customer records.
   */
  async fetchPanditAvailability(
    panditId: string,
    dateStr: string, // "YYYY-MM-DD"
    durationMinutes: number = 60
  ): Promise<{ availableSlots: string[]; reason?: string }> {
    if (!panditId || !dateStr) {
      return {
        availableSlots: [],
        reason: "Pandit selection and date are required.",
      };
    }

    const { data, error } = await supabase.rpc("get_pandit_available_slots", {
      p_pandit_id: panditId,
      p_date: dateStr,
      p_duration_minutes: durationMinutes || 60,
    });

    if (error) {
      console.warn("Could not fetch pandit availability via RPC:", error.message);
      return {
        availableSlots: [],
        reason: error.message,
      };
    }

    const payload = data as { available_slots?: string[]; reason?: string | null };
    const slots = payload?.available_slots || [];
    return {
      availableSlots: slots,
      reason: payload?.reason || (slots.length === 0 ? "No open time slots available on this date." : undefined),
    };
  },

  /**
   * Fetch customer bookings with pagination and optional status filter.
   */
  async fetchCustomerBookings(options: {
    limit?: number;
    offset?: number;
    statusFilter?: string;
  } = {}): Promise<{ bookings: BookingDetail[]; totalCount: number }> {
    const { limit = 20, offset = 0, statusFilter } = options;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { bookings: [], totalCount: 0 };

    let query = supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        customer_id,
        pandit_id,
        puja_service_id,
        service_mode,
        status,
        scheduled_start_at,
        scheduled_end_at,
        price_snapshot,
        currency,
        advance_percent,
        advance_amount,
        balance_amount,
        total_amount,
        reschedule_count,
        confirmed_at,
        completed_at,
        cancelled_at,
        created_at,
        updated_at,
        puja_service:puja_services(id, name, description, default_duration_minutes),
        pandit:pandit_profiles(
          id,
          profiles:user_id(
            display_name,
            avatar_url,
            phone
          )
        ),
        location:booking_service_locations(
          booking_id,
          location_type,
          address_id,
          address_snapshot,
          city,
          state,
          pincode,
          latitude,
          longitude,
          temple_id,
          temple_name_snapshot
        )
      `, { count: "exact" })
      .eq("customer_id", user.id);

    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "upcoming") {
        query = query.in("status", ["confirmed", "upcoming", "in_progress"]);
      } else if (statusFilter === "completed") {
        query = query.eq("status", "completed");
      } else if (statusFilter === "cancelled") {
        query = query.eq("status", "cancelled");
      } else {
        query = query.eq("status", statusFilter);
      }
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`Failed to load booking history: ${error.message}`);
    }

    const mappedBookings = ((data as any[]) || []).map((row) => ({
      ...row,
      pandit: mapPanditProfile(row.pandit),
    }));

    return {
      bookings: mappedBookings as unknown as BookingDetail[],
      totalCount: count || 0,
    };
  },

  /**
   * Fetch single booking detail including itemized line items and location snapshot.
   */
  async fetchBookingDetail(bookingId: string): Promise<BookingDetail> {
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        customer_id,
        pandit_id,
        puja_service_id,
        service_mode,
        status,
        scheduled_start_at,
        scheduled_end_at,
        price_snapshot,
        currency,
        advance_percent,
        advance_amount,
        balance_amount,
        total_amount,
        reschedule_count,
        confirmed_at,
        completed_at,
        cancelled_at,
        created_at,
        updated_at,
        puja_service:puja_services(id, name, description, default_duration_minutes),
        pandit:pandit_profiles(
          id,
          profiles:user_id(
            display_name,
            avatar_url,
            phone
          )
        ),
        location:booking_service_locations(
          booking_id,
          location_type,
          address_id,
          address_snapshot,
          city,
          state,
          pincode,
          latitude,
          longitude,
          temple_id,
          temple_name_snapshot
        )
      `)
      .eq("id", bookingId)
      .single();

    if (bookingErr || !booking) {
      throw new Error(bookingErr?.message || "Booking not found.");
    }

    // Fetch line items for this booking
    const { data: lineItems } = await supabase
      .from("booking_line_items")
      .select("id, booking_id, item_type, samagri_package_id, samagri_item_id, prasad_item_id, name_snapshot, unit, quantity, unit_price, total_price, is_refundable")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });

    // Fetch authoritative real-time financial balance via PostgreSQL RPC
    const { data: balanceData, error: balanceErr } = await supabase.rpc(
      "calculate_booking_balance",
      { p_booking_id: bookingId }
    );

    if (balanceErr) {
      throw new Error(`Failed to calculate booking balance: ${balanceErr.message}`);
    }

    const outstandingBalance = balanceData
      ? Number(balanceData.outstanding_balance ?? 0)
      : 0;
    const totalPaid = balanceData ? Number(balanceData.total_paid ?? 0) : 0;
    const netPaid = balanceData ? Number(balanceData.net_paid ?? 0) : 0;
    const totalRefunded = balanceData ? Number(balanceData.total_refunded ?? 0) : 0;

    return {
      ...(booking as unknown as BookingDetail),
      pandit: mapPanditProfile((booking as any)?.pandit),
      line_items: (lineItems as any[]) || [],
      outstanding_balance: outstandingBalance,
      total_paid: totalPaid,
      net_paid: netPaid,
      total_refunded: totalRefunded,
    };
  },

  /**
   * Request LiveKit Cloud token for a Remote Puja session via Edge Function.
   */
  async requestLiveSessionToken(bookingId: string): Promise<LiveSessionCredentials> {
    if (!bookingId) {
      throw new Error("Booking ID is required to join live sanctum.");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session || !session.access_token) {
      throw new Error("Authentication required to join live sanctum.");
    }

    const { data, error } = await supabase.functions.invoke("live-session-token", {
      body: { booking_id: bookingId },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      let serverErrorMsg: string | null = null;
      if (error.context && typeof error.context.json === "function") {
        try {
          const errorBody = await error.context.json();
          if (
            errorBody &&
            typeof errorBody.error === "string" &&
            errorBody.error.trim().length > 0
          ) {
            serverErrorMsg = errorBody.error.trim();
          }
        } catch {
          // Ignore JSON parse / stream read errors safely
        }
      }
      throw new Error(serverErrorMsg || error.message || "Failed to initialize live video room.");
    }

    if (!data || !data.token) {
      const errorMsg =
        typeof data?.error === "string" && data.error.trim().length > 0
          ? data.error.trim()
          : "Invalid response from live video service.";
      throw new Error(errorMsg);
    }

    return data as LiveSessionCredentials;
  },

  /**
   * Authoritative RPC to calculate booking financial balance.
   */
  async calculateBookingBalance(bookingId: string): Promise<BookingBalanceCalculation> {
    if (!bookingId) {
      throw new Error("Booking ID is required to calculate balance.");
    }

    const { data, error } = await supabase.rpc("calculate_booking_balance", {
      p_booking_id: bookingId,
    });

    if (error) {
      throw new Error(error.message || "Failed to calculate booking balance.");
    }

    return data as unknown as BookingBalanceCalculation;
  },

  /**
   * Authoritative read-only preview of refund calculation prior to cancellation.
   */
  async previewCancellationRefund(bookingId: string): Promise<CancellationRefundPreview> {
    if (!bookingId) {
      throw new Error("Booking ID is required to preview refund.");
    }

    const { data, error } = await supabase.rpc("preview_cancellation_refund", {
      p_booking_id: bookingId,
    });

    if (error) {
      throw new Error(error.message || "Failed to calculate cancellation refund preview.");
    }

    return data as unknown as CancellationRefundPreview;
  },

  /**
   * Authoritative RPC for customer to cancel booking and initiate refund.
   */
  async cancelBooking(bookingId: string, reason?: string): Promise<CancellationResult> {
    if (!bookingId) {
      throw new Error("Booking ID is required to cancel booking.");
    }

    const { data, error } = await supabase.rpc("cancel_booking_and_calculate_refund", {
      p_booking_id: bookingId,
      p_reason: reason || null,
    });

    if (error) {
      throw new Error(error.message || "Failed to cancel booking.");
    }

    return data as unknown as CancellationResult;
  },

  /**
   * Authoritative RPC for customer 1-time free reschedule.
   */
  async requestBookingReschedule(
    bookingId: string,
    newStartAt: string
  ): Promise<RescheduleResult> {
    if (!bookingId || !newStartAt) {
      throw new Error("Booking ID and new scheduled start time are required.");
    }

    const { data, error } = await supabase.rpc("request_booking_reschedule", {
      p_booking_id: bookingId,
      p_requested_start_at: newStartAt,
    });

    if (error) {
      throw new Error(error.message || "Failed to reschedule booking.");
    }

    return data as unknown as RescheduleResult;
  },
};

