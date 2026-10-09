// src/features/kundli/services/kundliPaymentService.ts
import RazorpayCheckout from "react-native-razorpay";
import { supabase } from "../../../infrastructure/supabase/client.ts";
import { KundliOrderStatus } from "../types/kundli.types.ts";

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

export const kundliPaymentService = {
  /**
   * Invoke the create-razorpay-order Supabase Edge Function with the payment_order_id.
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
   * Stops immediately once status transitions to 'paid' or subsequent active/terminal state.
   */
  async pollKundliPaymentConfirmation(
    kundliOrderId: string,
    maxAttempts: number = 10,
    intervalMs: number = 2000
  ): Promise<{ confirmed: boolean; status: KundliOrderStatus }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data, error } = await supabase
        .from("kundli_orders")
        .select("id, status, price")
        .eq("id", kundliOrderId)
        .maybeSingle();

      if (!error && data) {
        const currentStatus = data.status as KundliOrderStatus;
        if (["paid", "in_progress", "document_uploaded", "customer_confirmed", "completed"].includes(currentStatus)) {
          return { confirmed: true, status: currentStatus };
        }
        if (["cancelled", "disputed"].includes(currentStatus)) {
          return { confirmed: false, status: currentStatus };
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
      description: "Kashi Veda Handwritten Kundli 100% Upfront Payment",
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
