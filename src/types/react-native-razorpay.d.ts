// src/types/react-native-razorpay.d.ts
declare module "react-native-razorpay" {
  export interface RazorpayOptions {
    description?: string;
    image?: string;
    currency: string;
    key: string;
    amount: number | string;
    name: string;
    order_id: string;
    prefill?: {
      email?: string;
      contact?: string;
      name?: string;
    };
    theme?: {
      color?: string;
    };
    notes?: Record<string, string>;
    [key: string]: any;
  }

  export interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  export interface RazorpayErrorResponse {
    code: number;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: {
      order_id?: string;
      payment_id?: string;
    };
  }

  const RazorpayCheckout: {
    open: (options: RazorpayOptions) => Promise<RazorpaySuccessResponse>;
    on: (event: string, callback: (...args: any[]) => void) => void;
    [key: string]: any;
  };

  export default RazorpayCheckout;
}
