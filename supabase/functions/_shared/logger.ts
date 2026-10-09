// supabase/functions/_shared/logger.ts

export interface LogContext {
  functionName: string;
  eventType?: string;
  paymentOrderId?: string;
  razorpayOrderId?: string;
  providerPaymentId?: string;
  status?: string;
  category?: string;
  error?: string;
  [key: string]: unknown;
}

export const logger = {
  info: (message: string, context: LogContext): void => {
    console.log(
      JSON.stringify({
        level: "INFO",
        timestamp: new Date().toISOString(),
        message,
        ...context,
      })
    );
  },

  warn: (message: string, context: LogContext): void => {
    console.warn(
      JSON.stringify({
        level: "WARN",
        timestamp: new Date().toISOString(),
        message,
        ...context,
      })
    );
  },

  error: (message: string, context: LogContext): void => {
    console.error(
      JSON.stringify({
        level: "ERROR",
        timestamp: new Date().toISOString(),
        message,
        ...context,
      })
    );
  },
};
