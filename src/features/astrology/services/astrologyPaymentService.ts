// src/features/astrology/services/astrologyPaymentService.ts
import RazorpayCheckout from "react-native-razorpay";
import { supabase } from "../../../infrastructure/supabase/client.ts";
import { AstrologySubscription, AstrologySubscriptionStatus } from "../types/astrology.types.ts";

export interface RazorpayOrderResponse {
  success?: boolean;
  razorpay_order_id: string;
  amount: number; // in paise
  currency: string;
  key_id: string;
  error?: string;
}

export interface RazorpayPaymentResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature?: string;
}

export interface PollSubscriptionResult {
  confirmed: boolean;
  status: AstrologySubscriptionStatus;
  subscription?: AstrologySubscription | null;
}

export const astrologyPaymentService = {
  /**
   * Invoke the create-razorpay-order Supabase Edge Function with the subscription payment_order_id.
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
   * Stops immediately once status transitions to 'active', 'cancelled', or 'expired'.
   */
  async pollSubscriptionConfirmation(
    subscriptionId: string,
    maxAttempts = 10,
    intervalMs = 2000
  ): Promise<PollSubscriptionResult> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data, error } = await supabase
        .from("astrology_subscriptions")
        .select(
          `
          id,
          customer_id,
          plan_id,
          payment_order_id,
          starts_at,
          ends_at,
          status,
          created_at,
          astrology_subscription_plans (
            id,
            name,
            duration_days,
            price,
            currency,
            daily_in_app_enabled,
            weekly_whatsapp_enabled,
            is_active
          )
        `
        )
        .eq("id", subscriptionId)
        .maybeSingle();

      if (!error && data) {
        const subStatus = data.status as AstrologySubscriptionStatus;
        const sub: AstrologySubscription = {
          id: data.id,
          customer_id: data.customer_id,
          plan_id: data.plan_id,
          payment_order_id: data.payment_order_id,
          starts_at: data.starts_at,
          ends_at: data.ends_at,
          status: subStatus,
          created_at: data.created_at,
          plan: (data as any).astrology_subscription_plans || null,
        };

        if (subStatus === "active") {
          return { confirmed: true, status: "active", subscription: sub };
        }
        if (subStatus === "cancelled") {
          return { confirmed: false, status: "cancelled", subscription: sub };
        }
        if (subStatus === "expired") {
          return { confirmed: false, status: "expired", subscription: sub };
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
      description: "Kashi Veda Vedic Astrology Subscription",
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
