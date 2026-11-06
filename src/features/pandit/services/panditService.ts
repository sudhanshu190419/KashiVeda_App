// src/features/pandit/services/panditService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import {
  LiveSessionCredentials,
  PanditAvailabilityRule,
  PanditBookingItem,
  PanditDashboardSummary,
  PanditProfile,
  PanditPujaServiceOffering,
  PanditUnavailabilityBlock,
} from "../types/pandit.types.ts";

export const panditService = {
  /**
   * Fetch current authenticated Pandit's profile.
   */
  async fetchCurrentPanditProfile(): Promise<PanditProfile | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      throw new Error("Authentication session required.");
    }

    const { data: panditData, error: panditErr } = await supabase
      .from("pandit_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (panditErr) {
      throw new Error(`Failed to load Pandit profile: ${panditErr.message}`);
    }

    if (!panditData) {
      return null;
    }

    // Fetch user profile info (name, phone, avatar)
    const { data: profileData } = await supabase
      .from("profiles")
      .select("display_name, phone, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    return {
      ...(panditData as PanditProfile),
      display_name: profileData?.display_name || "Pandit Ji",
      phone: profileData?.phone || undefined,
      avatar_url: profileData?.avatar_url || null,
    };
  },

  /**
   * Update Pandit profile attributes (bio, experience, languages, public status, Kundli settings).
   */
  async updatePanditProfile(
    updates: Partial<
      Pick<
        PanditProfile,
        | "bio"
        | "years_experience"
        | "languages"
        | "public_status"
        | "kundli_enabled"
        | "kundli_price"
        | "kundli_turnaround_days"
      >
    >
  ): Promise<PanditProfile> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      throw new Error("Authentication required to update profile.");
    }

    const { data, error } = await supabase
      .from("pandit_profiles")
      .update(updates)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }

    return data as PanditProfile;
  },

  /**
   * Update Pandit Kundli capability, pricing, and turnaround settings.
   */
  async updateKundliSettings(
    enabled: boolean,
    price?: number | null,
    turnaroundDays?: number | null
  ): Promise<PanditProfile> {
    if (enabled && (!price || price <= 0)) {
      throw new Error("Kundli price must be strictly greater than zero when Kundli is enabled.");
    }
    if (enabled && turnaroundDays != null && turnaroundDays <= 0) {
      throw new Error("Kundli turnaround days must be greater than zero.");
    }

    return this.updatePanditProfile({
      kundli_enabled: enabled,
      kundli_price: enabled ? price : null,
      kundli_turnaround_days: enabled ? turnaroundDays || 3 : null,
    });
  },

  /**
   * Fetch Pandit dashboard summary in an optimized batch.
   */
  async fetchPanditDashboardSummary(): Promise<PanditDashboardSummary> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) {
      throw new Error("Pandit profile not found for this account.");
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const todayStartIso = `${todayStr}T00:00:00+05:30`;
    const todayEndIso = `${todayStr}T23:59:59+05:30`;
    const nowIso = now.toISOString();

    // Parallel execution of independent dashboard overview queries
    const [
      { data: todayBookingsData },
      { count: upcomingCount },
      { count: completedCount },
      { data: nextBookingData },
      { data: bankData },
    ] = await Promise.all([
      // 1. Today's Bookings
      supabase
        .from("bookings")
        .select(
          `id, booking_number, customer_id, pandit_id, puja_service_id, service_mode, status,
           scheduled_start_at, scheduled_end_at, price_snapshot, currency, advance_amount,
           balance_amount, total_amount, reschedule_count, confirmed_at, completed_at, created_at, updated_at,
           puja_service:puja_services(id, name, description, default_duration_minutes),
           customer:profiles!bookings_customer_id_fkey(id, display_name, phone, avatar_url)`
        )
        .eq("pandit_id", pandit.id)
        .gte("scheduled_start_at", todayStartIso)
        .lte("scheduled_start_at", todayEndIso)
        .order("scheduled_start_at", { ascending: true }),

      // 2. Count upcoming bookings
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("pandit_id", pandit.id)
        .in("status", ["confirmed", "upcoming", "rescheduled"])
        .gte("scheduled_start_at", nowIso),

      // 3. Count completed bookings
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("pandit_id", pandit.id)
        .eq("status", "completed"),

      // 4. Next upcoming booking
      supabase
        .from("bookings")
        .select(
          `id, booking_number, customer_id, pandit_id, puja_service_id, service_mode, status,
           scheduled_start_at, scheduled_end_at, price_snapshot, currency, advance_amount,
           balance_amount, total_amount, reschedule_count, confirmed_at, completed_at, created_at, updated_at,
           puja_service:puja_services(id, name, description, default_duration_minutes),
           customer:profiles!bookings_customer_id_fkey(id, display_name, phone, avatar_url)`
        )
        .eq("pandit_id", pandit.id)
        .in("status", ["confirmed", "upcoming", "rescheduled", "in_progress"])
        .gte("scheduled_start_at", nowIso)
        .order("scheduled_start_at", { ascending: true })
        .limit(1)
        .maybeSingle(),

      // 5. Check verified default bank account
      supabase
        .from("pandit_bank_accounts")
        .select("id")
        .eq("pandit_id", pandit.id)
        .eq("is_default", true)
        .eq("verification_status", "verified")
        .maybeSingle(),
    ]);

    const todayBookings = (todayBookingsData as unknown as PanditBookingItem[]) || [];

    return {
      pandit,
      todayBookingsCount: todayBookings.length,
      upcomingBookingsCount: upcomingCount || 0,
      completedBookingsCount: completedCount || 0,
      nextBooking: (nextBookingData as unknown as PanditBookingItem) || null,
      todayBookings,
      verifiedBankAccount: !!bankData,
    };
  },

  /**
   * Fetch paginated list of bookings for the Pandit with filtering.
   * Attaches authoritative payout record from pandit_payouts for completed services.
   */
  async fetchPanditBookings(
    filter: "today" | "upcoming" | "completed" | "all" = "all",
    limit: number = 10,
    offset: number = 0
  ): Promise<{ bookings: PanditBookingItem[]; totalCount: number }> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) {
      throw new Error("Pandit profile required.");
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const todayStartIso = `${todayStr}T00:00:00+05:30`;
    const todayEndIso = `${todayStr}T23:59:59+05:30`;
    const nowIso = now.toISOString();

    let query = supabase
      .from("bookings")
      .select(
        `id, booking_number, customer_id, pandit_id, puja_service_id, service_mode, status,
         scheduled_start_at, scheduled_end_at, price_snapshot, currency, advance_amount,
         balance_amount, total_amount, reschedule_count, confirmed_at, completed_at, created_at, updated_at,
         puja_service:puja_services(id, name, description, default_duration_minutes),
         customer:profiles!bookings_customer_id_fkey(id, display_name, phone, avatar_url)`,
        { count: "exact" }
      )
      .eq("pandit_id", pandit.id);

    if (filter === "today") {
      query = query
        .gte("scheduled_start_at", todayStartIso)
        .lte("scheduled_start_at", todayEndIso)
        .order("scheduled_start_at", { ascending: true });
    } else if (filter === "upcoming") {
      query = query
        .in("status", ["confirmed", "upcoming", "rescheduled", "in_progress"])
        .gte("scheduled_start_at", nowIso)
        .order("scheduled_start_at", { ascending: true });
    } else if (filter === "completed") {
      query = query
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
    } else {
      query = query.order("scheduled_start_at", { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`Failed to load Pandit bookings: ${error.message}`);
    }

    const rawBookings = (data || []) as any[];
    const bookingIds = rawBookings.map((b) => b.id);

    // Fetch authoritative payout records for these bookings (especially completed bookings)
    let payoutMap = new Map<string, any>();
    if (bookingIds.length > 0) {
      const selectWithExtended = `
        id, pandit_id, booking_id, kundli_order_id, bank_account_id,
        gross_amount, platform_fee, net_amount, status, provider_payout_id,
        payment_method, transaction_reference, proof_document_path, confirmed_at, notes, released_at, created_at,
        bank_account:pandit_bank_accounts (id, bank_name, ifsc_code, account_holder_name)
      `;
      const selectBase = `
        id, pandit_id, booking_id, kundli_order_id, bank_account_id,
        gross_amount, platform_fee, net_amount, status, provider_payout_id,
        released_at, created_at,
        bank_account:pandit_bank_accounts (id, bank_name, ifsc_code, account_holder_name)
      `;

      let payoutRows: any[] | null = null;
      const { data: extRows, error: pErr } = await supabase
        .from("pandit_payouts")
        .select(selectWithExtended)
        .in("booking_id", bookingIds);

      payoutRows = extRows;

      if (
        pErr &&
        (pErr.message?.toLowerCase().includes("does not exist") ||
          pErr.code === "42703" ||
          pErr.code === "PGRST204")
      ) {
        const fallback = await supabase
          .from("pandit_payouts")
          .select(selectBase)
          .in("booking_id", bookingIds);
        payoutRows = fallback.data as any;
      }

      if (payoutRows) {
        payoutRows.forEach((row: any) => {
          if (row.booking_id) {
            payoutMap.set(row.booking_id, row);
          }
        });
      }
    }

    const enrichedBookings: PanditBookingItem[] = rawBookings.map((bk) => ({
      ...bk,
      payout: payoutMap.get(bk.id) || null,
    }));

    return {
      bookings: enrichedBookings,
      totalCount: count || 0,
    };
  },

  /**
   * Fetch full details for a single booking assigned to the Pandit,
   * including authoritative payout ledger details.
   */
  async fetchPanditBookingDetail(bookingId: string): Promise<PanditBookingItem> {
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select(
        `id, booking_number, customer_id, pandit_id, puja_service_id, service_mode, status,
         scheduled_start_at, scheduled_end_at, price_snapshot, currency, advance_amount,
         balance_amount, total_amount, reschedule_count, confirmed_at, completed_at, created_at, updated_at,
         puja_service:puja_services(id, name, description, default_duration_minutes),
         customer:profiles!bookings_customer_id_fkey(id, display_name, phone, avatar_url)`
      )
      .eq("id", bookingId)
      .single();

    if (bErr || !booking) {
      throw new Error("Booking record not found or access restricted.");
    }

    // Parallel fetch: location, line items, and authoritative payout record
    const selectWithExtended = `
      id, pandit_id, booking_id, kundli_order_id, bank_account_id,
      gross_amount, platform_fee, net_amount, status, provider_payout_id,
      payment_method, transaction_reference, proof_document_path, confirmed_at, notes, released_at, created_at,
      bank_account:pandit_bank_accounts (id, bank_name, ifsc_code, account_holder_name)
    `;
    const selectBase = `
      id, pandit_id, booking_id, kundli_order_id, bank_account_id,
      gross_amount, platform_fee, net_amount, status, provider_payout_id,
      released_at, created_at,
      bank_account:pandit_bank_accounts (id, bank_name, ifsc_code, account_holder_name)
    `;

    const [
      { data: locationData },
      { data: lineItemsData },
      payoutResult,
      balanceResult,
    ] = await Promise.all([
      supabase
        .from("booking_service_locations")
        .select("*")
        .eq("booking_id", bookingId)
        .maybeSingle(),
      supabase
        .from("booking_line_items")
        .select("*")
        .eq("booking_id", bookingId)
        .order("item_type", { ascending: true }),
      supabase
        .from("pandit_payouts")
        .select(selectWithExtended)
        .eq("booking_id", bookingId)
        .maybeSingle(),
      supabase.rpc("calculate_booking_balance", {
        p_booking_id: bookingId,
      }),
    ]);

    let payoutItem: any = payoutResult.data || null;
    if (
      payoutResult.error &&
      (payoutResult.error.message?.toLowerCase().includes("does not exist") ||
        payoutResult.error.code === "42703" ||
        payoutResult.error.code === "PGRST204")
    ) {
      const fallback = await supabase
        .from("pandit_payouts")
        .select(selectBase)
        .eq("booking_id", bookingId)
        .maybeSingle();
      payoutItem = fallback.data || null;
    }

    const balanceData = balanceResult?.data;
    const outstandingBalance =
      balanceData?.outstanding_balance !== undefined && balanceData?.outstanding_balance !== null
        ? Number(balanceData.outstanding_balance)
        : Number(booking.balance_amount ?? 0);
    const totalPaid =
      balanceData?.total_paid !== undefined && balanceData?.total_paid !== null
        ? Number(balanceData.total_paid)
        : Number(booking.advance_amount ?? 0);
    const netPaid =
      balanceData?.net_paid !== undefined && balanceData?.net_paid !== null
        ? Number(balanceData.net_paid)
        : totalPaid;
    const totalRefunded =
      balanceData?.total_refunded !== undefined && balanceData?.total_refunded !== null
        ? Number(balanceData.total_refunded)
        : 0;

    return {
      ...(booking as unknown as PanditBookingItem),
      location: locationData || undefined,
      line_items: lineItemsData || [],
      payout: payoutItem as any,
      outstanding_balance: outstandingBalance,
      total_paid: totalPaid,
      net_paid: netPaid,
      total_refunded: totalRefunded,
    };
  },

  /**
   * Mark ritual as completed via authoritative database RPC.
   * Enforces verified bank account and creates payout record atomically.
   */
  async markBookingCompleted(bookingId: string): Promise<{
    status: string;
    booking_id: string;
    completed_at: string;
    payout_id: string;
    payout_amount: number;
  }> {
    const { data, error } = await supabase.rpc("mark_booking_completed", {
      p_booking_id: bookingId,
    });

    if (error) {
      throw new Error(error.message || "Failed to mark ritual completed.");
    }

    return data as {
      status: string;
      booking_id: string;
      completed_at: string;
      payout_id: string;
      payout_amount: number;
    };
  },

  /**
   * Authoritative RPC for Pandit to cancel an assigned booking and grant 100% customer refund.
   */
  async cancelBooking(
    bookingId: string,
    reason: string
  ): Promise<{
    status: string;
    cancellation_id?: string;
    booking_id: string;
    refund_amount?: number;
    message: string;
  }> {
    if (!bookingId) {
      throw new Error("Booking ID is required.");
    }

    const { data, error } = await supabase.rpc("pandit_cancel_booking", {
      p_booking_id: bookingId,
      p_reason: reason || "Cancelled by Pandit",
    });

    if (error) {
      throw new Error(error.message || "Failed to cancel booking.");
    }

    return data as {
      status: string;
      cancellation_id?: string;
      booking_id: string;
      refund_amount?: number;
      message: string;
    };
  },

  /**
   * Fetch recurring weekly availability rules for current Pandit.
   */
  async fetchAvailabilityRules(): Promise<PanditAvailabilityRule[]> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) return [];

    const { data, error } = await supabase
      .from("pandit_availability_rules")
      .select("*")
      .eq("pandit_id", pandit.id)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      throw new Error(`Failed to load availability rules: ${error.message}`);
    }

    return (data as PanditAvailabilityRule[]) || [];
  },

  /**
   * Create or update a weekly availability rule.
   */
  async saveAvailabilityRule(rule: {
    id?: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
  }): Promise<PanditAvailabilityRule> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) {
      throw new Error("Pandit profile required.");
    }

    if (rule.end_time <= rule.start_time) {
      throw new Error("End time must be later than start time.");
    }

    // If id is not explicitly passed, check if a rule already exists for this day_of_week
    // to update rather than creating a duplicate row
    let ruleId = rule.id;
    if (!ruleId) {
      const { data: existing } = await supabase
        .from("pandit_availability_rules")
        .select("id")
        .eq("pandit_id", pandit.id)
        .eq("day_of_week", rule.day_of_week)
        .maybeSingle();

      if (existing?.id) {
        ruleId = existing.id;
      }
    }

    if (ruleId) {
      const { data, error } = await supabase
        .from("pandit_availability_rules")
        .update({
          day_of_week: rule.day_of_week,
          start_time: rule.start_time,
          end_time: rule.end_time,
          is_active: rule.is_active,
        })
        .eq("id", ruleId)
        .eq("pandit_id", pandit.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update schedule rule: ${error.message}`);
      }
      return data as PanditAvailabilityRule;
    }

    const { data, error } = await supabase
      .from("pandit_availability_rules")
      .insert({
        pandit_id: pandit.id,
        day_of_week: rule.day_of_week,
        start_time: rule.start_time,
        end_time: rule.end_time,
        timezone: "Asia/Kolkata",
        is_active: rule.is_active,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create schedule rule: ${error.message}`);
    }

    return data as PanditAvailabilityRule;
  },

  /**
   * Delete an availability rule.
   */
  async deleteAvailabilityRule(ruleId: string): Promise<void> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) return;

    const { error } = await supabase
      .from("pandit_availability_rules")
      .delete()
      .eq("id", ruleId)
      .eq("pandit_id", pandit.id);

    if (error) {
      throw new Error(`Failed to delete rule: ${error.message}`);
    }
  },

  /**
   * Fetch one-off unavailability blocks for current Pandit.
   */
  async fetchUnavailabilityBlocks(): Promise<PanditUnavailabilityBlock[]> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) return [];

    const { data, error } = await supabase
      .from("pandit_unavailability_blocks")
      .select("*")
      .eq("pandit_id", pandit.id)
      .order("starts_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to load unavailable blocks: ${error.message}`);
    }

    return (data as PanditUnavailabilityBlock[]) || [];
  },

  /**
   * Create an unavailability block.
   * Rejects if end <= start or if overlapping active confirmed booking exists.
   */
  async createUnavailabilityBlock(
    startsAt: string,
    endsAt: string,
    reason?: string
  ): Promise<PanditUnavailabilityBlock> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) {
      throw new Error("Pandit profile required.");
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (endDate <= startDate) {
      throw new Error("Block end time must be after start time.");
    }

    // Check for conflicting active bookings in this period
    const { data: conflicts } = await supabase
      .from("bookings")
      .select("id, booking_number, scheduled_start_at")
      .eq("pandit_id", pandit.id)
      .in("status", ["confirmed", "upcoming", "in_progress", "rescheduled"])
      .lte("scheduled_start_at", endsAt)
      .gte("scheduled_end_at", startsAt)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      throw new Error(
        `Cannot block this time window: You have a confirmed ritual (${conflicts[0].booking_number}) scheduled during this time.`
      );
    }

    const { data, error } = await supabase
      .from("pandit_unavailability_blocks")
      .insert({
        pandit_id: pandit.id,
        starts_at: startsAt,
        ends_at: endsAt,
        reason: reason?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create unavailable block: ${error.message}`);
    }

    return data as PanditUnavailabilityBlock;
  },

  /**
   * Delete an unavailability block.
   */
  async deleteUnavailabilityBlock(blockId: string): Promise<void> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) return;

    const { error } = await supabase
      .from("pandit_unavailability_blocks")
      .delete()
      .eq("id", blockId)
      .eq("pandit_id", pandit.id);

    if (error) {
      throw new Error(`Failed to delete block: ${error.message}`);
    }
  },

  /**
   * Fetch Pandit's supported Puja offerings and customized prices.
   */
  async fetchPanditOfferings(): Promise<PanditPujaServiceOffering[]> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) return [];

    const { data, error } = await supabase
      .from("pandit_puja_services")
      .select(
        `id, pandit_id, puja_service_id, price, home_price, temple_price, remote_price, currency, duration_minutes, is_active, created_at, updated_at,
         puja_service:puja_services(id, name, description, default_duration_minutes, allowed_modes, starting_price)`
      )
      .eq("pandit_id", pandit.id)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to load offerings: ${error.message}`);
    }

    return (data as unknown as PanditPujaServiceOffering[]) || [];
  },

  /**
   * Update Pandit offering mode-specific prices and active status.
   */
  async updateOffering(
    offeringId: string,
    pricingOrPrice:
      | number
      | {
          home_price?: number | null;
          temple_price?: number | null;
          remote_price?: number | null;
        },
    isActive: boolean
  ): Promise<PanditPujaServiceOffering> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) {
      throw new Error("Pandit profile required.");
    }

    let updatePayload: {
      price?: number;
      home_price?: number | null;
      temple_price?: number | null;
      remote_price?: number | null;
      is_active: boolean;
    };

    if (typeof pricingOrPrice === "number") {
      if (pricingOrPrice < 0) {
        throw new Error("Price cannot be negative.");
      }
      updatePayload = {
        price: pricingOrPrice,
        home_price: pricingOrPrice,
        temple_price: pricingOrPrice,
        remote_price: pricingOrPrice,
        is_active: isActive,
      };
    } else {
      const { home_price, temple_price, remote_price } = pricingOrPrice;

      if (home_price != null && home_price <= 0) {
        throw new Error("Home price must be strictly greater than zero.");
      }
      if (temple_price != null && temple_price <= 0) {
        throw new Error("Temple price must be strictly greater than zero.");
      }
      if (remote_price != null && remote_price <= 0) {
        throw new Error("Remote price must be strictly greater than zero.");
      }

      if (isActive && !home_price && !temple_price && !remote_price) {
        throw new Error("At least one service mode must be configured with a valid price.");
      }

      const effectivePrice = home_price || temple_price || remote_price || 0;

      updatePayload = {
        price: effectivePrice,
        home_price: home_price ?? null,
        temple_price: temple_price ?? null,
        remote_price: remote_price ?? null,
        is_active: isActive,
      };
    }

    const { data, error } = await supabase
      .from("pandit_puja_services")
      .update(updatePayload)
      .eq("id", offeringId)
      .eq("pandit_id", pandit.id)
      .select(
        `id, pandit_id, puja_service_id, price, home_price, temple_price, remote_price, currency, duration_minutes, is_active, created_at, updated_at,
         puja_service:puja_services(id, name, description, default_duration_minutes, allowed_modes, starting_price)`
      )
      .single();

    if (error) {
      throw new Error(`Failed to update offering: ${error.message}`);
    }

    return data as unknown as PanditPujaServiceOffering;
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
   * Update Pandit operational service location and radius.
   * Authoritative method to configure or update operational coordinates.
   */
  async updateServiceLocation(location: {
    latitude: number;
    longitude: number;
    radius_km?: number;
    city?: string;
  }): Promise<void> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      throw new Error("Authentication required to update service location.");
    }

    const { error } = await supabase.rpc("pandit_update_service_location", {
      p_latitude: location.latitude,
      p_longitude: location.longitude,
      p_radius_km: location.radius_km || null,
      p_city: location.city || null,
    });

    if (error) {
      // Fallback: direct update to pandit_profiles and pandit_service_areas if RPC not yet deployed
      const pandit = await this.fetchCurrentPanditProfile();
      if (!pandit) throw new Error("Pandit profile required.");

      await supabase
        .from("pandit_profiles")
        .update({
          base_latitude: location.latitude,
          base_longitude: location.longitude,
          service_radius_km: location.radius_km || pandit.service_radius_km,
        })
        .eq("id", pandit.id);

      await supabase
        .from("pandit_service_areas")
        .update({
          latitude: location.latitude,
          longitude: location.longitude,
          city: location.city || undefined,
          radius_km: location.radius_km || undefined,
        })
        .eq("pandit_id", pandit.id)
        .eq("is_active", true);
    }
  },

  /**
   * Fetch current authenticated Pandit's operational service location.
   */
  async fetchServiceLocation(): Promise<{
    city: string;
    latitude: number | null;
    longitude: number | null;
    radius_km: number;
    is_configured: boolean;
  }> {
    const pandit = await this.fetchCurrentPanditProfile();
    if (!pandit) throw new Error("Pandit profile required.");

    const { data: area } = await supabase
      .from("pandit_service_areas")
      .select("city, latitude, longitude, radius_km")
      .eq("pandit_id", pandit.id)
      .eq("is_active", true)
      .maybeSingle();

    const lat = area?.latitude ?? pandit.base_latitude;
    const lng = area?.longitude ?? pandit.base_longitude;
    const radius = area?.radius_km ?? pandit.service_radius_km ?? 25;
    const city = area?.city || "Varanasi";

    const is_configured =
      lat != null &&
      lng != null &&
      !isNaN(Number(lat)) &&
      !isNaN(Number(lng)) &&
      Number(lat) >= -90 &&
      Number(lat) <= 90 &&
      Number(lng) >= -180 &&
      Number(lng) <= 180;

    return {
      city,
      latitude: lat != null ? Number(lat) : null,
      longitude: lng != null ? Number(lng) : null,
      radius_km: Number(radius) || 25,
      is_configured,
    };
  },
};
