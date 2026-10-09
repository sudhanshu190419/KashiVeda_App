// src/features/booking/services/bookingPaymentService.ts
import RazorpayCheckout from "react-native-razorpay";
import { supabase } from "../../../infrastructure/supabase/client.ts";
import {
  BalancePaymentOrderResponse,
  Booking,
  BookingStatus,
  RazorpayOrderResponse,
} from "../types/booking.types.ts";

export interface RazorpayPaymentResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature?: string;
}

export const bookingPaymentService = {
  /**
   * Authoritative RPC to create or reuse a payment order for the remaining booking balance.
   */
  async createBookingBalancePaymentOrder(bookingId: string): Promise<BalancePaymentOrderResponse> {
    if (!bookingId) {
      throw new Error("Booking ID is required to create balance payment order.");
    }

    const { data, error } = await supabase.rpc("create_booking_balance_payment_order", {
      p_booking_id: bookingId,
    });

    if (error) {
      throw new Error(error.message || "Failed to initialize balance payment order.");
    }

    return data as unknown as BalancePaymentOrderResponse;
  },

  /**
   * Invoke the create-razorpay-order Supabase Edge Function.
   * Sends payment_order_id with authenticated Supabase JWT.
   */
  async createRazorpayOrder(paymentOrderId: string): Promise<RazorpayOrderResponse> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session || !session.access_token) {
      throw new Error("Authentication session required to create payment order.");
    }

    const { data, error } = await supabase.functions.invoke("create-razorpay-order", {
      body: { payment_order_id: paymentOrderId },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to initialize payment gateway order.");
    }

    if (!data || !data.razorpay_order_id) {
      throw new Error(data?.error || "Invalid response from payment gateway service.");
    }

    return data as RazorpayOrderResponse;
  },

  /**
   * Bounded polling to verify authoritative webhook confirmation from PostgreSQL.
   * Stops immediately once status transitions to 'confirmed' or a terminal state.
   */
  async pollBookingConfirmation(
    bookingId: string,
    maxAttempts: number = 10,
    intervalMs: number = 2000
  ): Promise<{ confirmed: boolean; status: BookingStatus; booking?: Booking }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_number, status, advance_amount, total_amount, confirmed_at, scheduled_start_at, scheduled_end_at")
        .eq("id", bookingId)
        .maybeSingle();

      if (!error && data) {
        const booking = data as unknown as Booking;
        if (booking.status === "confirmed") {
          return { confirmed: true, status: "confirmed", booking };
        }
        if (["cancelled", "disputed"].includes(booking.status)) {
          return { confirmed: false, status: booking.status, booking };
        }
      }

      if (attempt < maxAttempts) {
        await new Promise<void>((resolve) => setTimeout(() => resolve(), intervalMs));
      }
    }

    return { confirmed: false, status: "payment_pending" };
  },

  /**
   * Launches Razorpay checkout interface.
   */
  async openRazorpayCheckout(
    orderData: RazorpayOrderResponse,
    customerInfo: { name?: string; email?: string; phone?: string } = {}
  ): Promise<RazorpayPaymentResult> {
    const options = {
      description: "Kashi Veda Ritual Booking Advance",
      image: "https://kashiveda.org/assets/logo.png",
      currency: orderData.currency || "INR",
      key: orderData.key_id,
      amount: orderData.amount,
      order_id: orderData.razorpay_order_id,
      name: "Kashi Veda",
      prefill: {
        name: customerInfo.name || "Devotee",
        email: customerInfo.email || "",
        contact: customerInfo.phone || "",
      },
      theme: { color: "#8B1E0F" },
    };

    try {
      const data = await RazorpayCheckout.open(options);
      if (!data || !data.razorpay_payment_id) {
        throw new Error("Payment gateway did not return a valid payment ID.");
      }
      return {
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_order_id: data.razorpay_order_id || orderData.razorpay_order_id,
        razorpay_signature: data.razorpay_signature,
      };
    } catch (err: any) {
      if (
        err?.code === 0 ||
        err?.description?.toLowerCase().includes("cancel") ||
        err?.message?.toLowerCase().includes("cancel")
      ) {
        throw new Error("Payment was cancelled by the user.");
      }
      throw new Error(
        err?.description || err?.message || "Payment processing failed. Please try again."
      );
    }
  },
};
