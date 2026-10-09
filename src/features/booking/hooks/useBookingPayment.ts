// src/features/booking/hooks/useBookingPayment.ts
import { useCallback, useState } from "react";
import { bookingPaymentService } from "../services/bookingPaymentService.ts";
import { Booking, RazorpayOrderResponse } from "../types/booking.types.ts";

export type PaymentFlowStatus =
  | "idle"
  | "creating_order"
  | "ready_for_payment"
  | "processing_payment"
  | "polling_confirmation"
  | "confirmed"
  | "failed";

export interface UseBookingPaymentProps {
  bookingId: string;
  paymentOrderId: string;
  bookingNumber?: string;
  advanceAmount?: number;
}

export const useBookingPayment = ({
  bookingId,
  paymentOrderId,
}: UseBookingPaymentProps) => {
  const [status, setStatus] = useState<PaymentFlowStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<RazorpayOrderResponse | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  const startPayment = useCallback(
    async (customerInfo: { name?: string; email?: string; phone?: string } = {}) => {
      setStatus("creating_order");
      setError(null);

      try {
        // 1. Create Razorpay order via Edge Function
        const rzpOrder = await bookingPaymentService.createRazorpayOrder(paymentOrderId);
        setOrderData(rzpOrder);
        setStatus("ready_for_payment");

        // 2. Open Razorpay Checkout SDK
        setStatus("processing_payment");
        await bookingPaymentService.openRazorpayCheckout(rzpOrder, customerInfo);

        // 3. Poll PostgreSQL for authoritative webhook confirmation
        setStatus("polling_confirmation");
        const pollResult = await bookingPaymentService.pollBookingConfirmation(bookingId);

        if (pollResult.confirmed && pollResult.booking) {
          setConfirmedBooking(pollResult.booking);
          setStatus("confirmed");
        } else {
          // Webhook might still be in-flight; show pending status rather than claiming failure
          setStatus("polling_confirmation");
        }
      } catch (err: any) {
        const msg = err?.message || "Payment could not be completed. Please try again.";
        setError(msg);
        setStatus("failed");
      }
    },
    [bookingId, paymentOrderId]
  );

  const checkConfirmationManually = useCallback(async () => {
    setStatus("polling_confirmation");
    try {
      const pollResult = await bookingPaymentService.pollBookingConfirmation(bookingId, 5, 1500);
      if (pollResult.confirmed && pollResult.booking) {
        setConfirmedBooking(pollResult.booking);
        setStatus("confirmed");
      } else {
        setError("Payment is still being confirmed by the bank. Please check your bookings in a moment.");
        setStatus("failed");
      }
    } catch (err: any) {
      setError(err?.message || "Error checking confirmation.");
      setStatus("failed");
    }
  }, [bookingId]);

  return {
    status,
    error,
    orderData,
    confirmedBooking,
    startPayment,
    checkConfirmationManually,
  };
};
