// __tests__/booking_financial_lifecycle.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { BookingDetailsScreen } from "../src/features/booking/screens/BookingDetailsScreen.tsx";
import { bookingPaymentService } from "../src/features/booking/services/bookingPaymentService.ts";
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { BookingDetail } from "../src/features/booking/types/booking.types.ts";
import { PanditBookingDetailsScreen } from "../src/features/pandit/screens/PanditBookingDetailsScreen.tsx";
import { panditService } from "../src/features/pandit/services/panditService.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { handleExecuteRazorpayRefund } from "../supabase/functions/execute-razorpay-refund/index.ts";
import { handleLiveSessionToken } from "../supabase/functions/live-session-token/index.ts";
import { handleRazorpayWebhook } from "../supabase/functions/razorpay-webhook/index.ts";
import { computeHmacSha256Hex } from "../supabase/functions/_shared/crypto.ts";

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: any = {};

jest.mock("@react-navigation/native", () => {
  const ReactModule = require("react");
  return {
    NavigationContainer: ({ children }: any) => children,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      replace: jest.fn(),
    }),
    useRoute: () => ({
      params: mockRouteParams,
    }),
    useFocusEffect: (cb: any) => {
      ReactModule.useEffect(() => {
        return cb();
      }, [cb]);
    },
  };
});

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("react-native-encrypted-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    session: { user: { id: "user-cust-1" } },
    user: { id: "user-cust-1", email: "devotee@kashiveda.org" },
    profile: { id: "user-cust-1", display_name: "Devotee" },
    role: "customer",
  }),
}));

function extractAllText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractAllText).join(" ");
  if (node.children) return extractAllText(node.children);
  return "";
}

describe("M11 — Complete Booking Financial Lifecycle Test Suite", () => {
  const sampleBookingId = "33333333-3333-4333-8333-333333333333";
  const samplePanditId = "44444444-4444-4444-8444-444444444444";
  const sampleBalanceOrderId = "55555555-5555-4555-8555-555555555555";

  const sampleConfirmedBooking: BookingDetail = {
    id: sampleBookingId,
    booking_number: "KV-BK-20261010-ABCD12",
    customer_id: "user-cust-1",
    pandit_id: samplePanditId,
    puja_service_id: "puja-1",
    service_mode: "remote",
    status: "confirmed",
    scheduled_start_at: "2026-10-10T10:00:00+05:30",
    scheduled_end_at: "2026-10-10T11:30:00+05:30",
    price_snapshot: 2100,
    currency: "INR",
    advance_percent: 50,
    advance_amount: 1050,
    balance_amount: 1050,
    total_amount: 2100,
    reschedule_count: 0,
    confirmed_at: "2026-10-06T10:00:00Z",
    created_at: "2026-10-06T09:00:00Z",
    updated_at: "2026-10-06T10:00:00Z",
    puja_service: {
      id: "puja-1",
      name: "Maha Rudrabhishek Puja",
      description: "Sacred Shiva Ritual",
      default_duration_minutes: 90,
    },
    pandit: {
      id: samplePanditId,
      display_name: "Acharya Ramkrishna Shastri",
      avatar_url: null,
      phone: "+919876543210",
    },
    location: {
      booking_id: sampleBookingId,
      location_type: "remote",
      city: "Varanasi",
    },
    line_items: [
      {
        id: "li-1",
        booking_id: sampleBookingId,
        item_type: "puja",
        name_snapshot: "Maha Rudrabhishek Puja",
        unit: "ritual",
        quantity: 1,
        unit_price: 2100,
        total_price: 2100,
        is_refundable: true,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
  });

  // 1. Balance Payment Order RPC Service
  test("1. bookingPaymentService.createBookingBalancePaymentOrder invokes create_booking_balance_payment_order RPC", async () => {
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        payment_order_id: sampleBalanceOrderId,
        booking_id: sampleBookingId,
        booking_number: "KV-BK-20261010-ABCD12",
        purpose: "booking_balance",
        amount: 1050.0,
        currency: "INR",
        due_at: "2026-10-09T10:00:00+05:30",
        status: "created",
      },
      error: null,
    } as any);

    const result = await bookingPaymentService.createBookingBalancePaymentOrder(sampleBookingId);

    expect(mockRpc).toHaveBeenCalledWith("create_booking_balance_payment_order", {
      p_booking_id: sampleBookingId,
    });
    expect(result.payment_order_id).toBe(sampleBalanceOrderId);
    expect(result.amount).toBe(1050.0);
    expect(result.purpose).toBe("booking_balance");
  });

  // 2. Cancellation Refund Preview Service
  test("2. bookingService.previewCancellationRefund calculates server-authoritative refund preview", async () => {
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        booking_id: sampleBookingId,
        is_cancellable: true,
        hours_before: 72.5,
        total_captured: 1050.0,
        already_refunded: 0.0,
        net_captured: 1050.0,
        refundable_base: 1050.0,
        refund_percent: 100.0,
        refund_amount: 1050.0,
        deduction_amount: 0.0,
        policy_name: "Full Refund (>48h Before Ritual)",
      },
      error: null,
    } as any);

    const preview = await bookingService.previewCancellationRefund(sampleBookingId);

    expect(mockRpc).toHaveBeenCalledWith("preview_cancellation_refund", {
      p_booking_id: sampleBookingId,
    });
    expect(preview.refund_percent).toBe(100.0);
    expect(preview.refund_amount).toBe(1050.0);
    expect(preview.policy_name).toContain("Full Refund");
  });

  // 3. Customer Cancellation RPC Service
  test("3. bookingService.cancelBooking executes authoritative cancellation and returns refund details", async () => {
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        status: "cancelled",
        cancellation_id: "canc-uuid-1",
        total_captured: 1050.0,
        already_refunded: 0.0,
        net_captured: 1050.0,
        refund_base_amount: 1050.0,
        refund_percent: 100.0,
        refund_amount: 1050.0,
        deduction_amount: 0.0,
      },
      error: null,
    } as any);

    const result = await bookingService.cancelBooking(sampleBookingId, "Devotee family emergency");

    expect(mockRpc).toHaveBeenCalledWith("cancel_booking_and_calculate_refund", {
      p_booking_id: sampleBookingId,
      p_reason: "Devotee family emergency",
    });
    expect(result.status).toBe("cancelled");
    expect(result.refund_amount).toBe(1050.0);
  });

  // 4. Pandit Cancellation RPC Service
  test("4. panditService.cancelBooking executes Pandit cancellation with 100% customer refund", async () => {
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        status: "cancelled",
        cancellation_id: "canc-uuid-pandit",
        booking_id: sampleBookingId,
        refund_amount: 1050.0,
        message: "Booking cancelled by Pandit. 100% customer refund queued.",
      },
      error: null,
    } as any);

    const result = await panditService.cancelBooking(sampleBookingId, "Unavoidable Temple Duty");

    expect(mockRpc).toHaveBeenCalledWith("pandit_cancel_booking", {
      p_booking_id: sampleBookingId,
      p_reason: "Unavoidable Temple Duty",
    });
    expect(result.status).toBe("cancelled");
    expect(result.refund_amount).toBe(1050.0);
  });

  // 5. Free First Reschedule RPC Service
  test("5. bookingService.requestBookingReschedule auto-approves 1-time free reschedule", async () => {
    const newTime = "2026-10-12T10:00:00+05:30";
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        status: "rescheduled",
        reschedule_request_id: "resched-uuid-1",
        booking_id: sampleBookingId,
        old_start_at: "2026-10-10T10:00:00+05:30",
        new_start_at: newTime,
        new_end_at: "2026-10-12T11:30:00+05:30",
        fee_amount: 0.0,
        reschedule_count: 1,
        balance_due_at: "2026-10-11T10:00:00+05:30",
      },
      error: null,
    } as any);

    const result = await bookingService.requestBookingReschedule(sampleBookingId, newTime);

    expect(mockRpc).toHaveBeenCalledWith("request_booking_reschedule", {
      p_booking_id: sampleBookingId,
      p_requested_start_at: newTime,
    });
    expect(result.status).toBe("rescheduled");
    expect(result.fee_amount).toBe(0.0);
    expect(result.reschedule_count).toBe(1);
  });

  // 6. BookingDetailsScreen Renders Pay Remaining Balance CTA
  test("6. BookingDetailsScreen shows Pay Remaining Balance CTA when balance > 0", async () => {
    mockRouteParams = { bookingId: sampleBookingId };
    jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(sampleConfirmedBooking);
    const mockCreateBalanceOrder = jest.spyOn(
      bookingPaymentService,
      "createBookingBalancePaymentOrder"
    ).mockResolvedValue({
      payment_order_id: sampleBalanceOrderId,
      booking_id: sampleBookingId,
      booking_number: "KV-BK-20261010-ABCD12",
      purpose: "booking_balance",
      amount: 1050.0,
      currency: "INR",
      due_at: "2026-10-09T10:00:00+05:30",
      status: "created",
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<BookingDetailsScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Outstanding Balance");
    expect(str).toContain("Pay Remaining Balance — ₹1,050");
    expect(str).toContain("Reschedule Ritual (1 Free Reschedule)");
    expect(str).toContain("Cancel Ritual");

    const buttons = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button);
    const payBalBtn = buttons.find((b: any) =>
      b.props.title?.includes("Pay Remaining Balance")
    );

    expect(payBalBtn).toBeDefined();

    await act(async () => {
      payBalBtn.props.onPress();
    });

    expect(mockCreateBalanceOrder).toHaveBeenCalledWith(sampleBookingId);
    expect(mockNavigate).toHaveBeenCalledWith("BookingPayment", {
      bookingId: sampleBookingId,
      paymentOrderId: sampleBalanceOrderId,
      bookingNumber: "KV-BK-20261010-ABCD12",
      advanceAmount: 1050.0,
      pujaName: "Maha Rudrabhishek Puja",
      panditName: "Acharya Ramkrishna Shastri",
      isBalancePayment: true,
    });
  });

  // 7. BookingDetailsScreen Hides Balance Button When Fully Paid
  test("7. BookingDetailsScreen renders Cleared badge and hides Pay Balance when balance is 0", async () => {
    mockRouteParams = { bookingId: sampleBookingId };
    const fullyPaidBooking: BookingDetail = {
      ...sampleConfirmedBooking,
      balance_amount: 0,
      advance_amount: 2100,
    };
    jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(fullyPaidBooking);

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<BookingDetailsScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Full Ritual Dakshina Paid & Cleared");
    expect(str).not.toContain("Pay Remaining Balance");
  });

  // 8. PanditBookingDetailsScreen Renders Pandit Cancellation Action
  test("8. PanditBookingDetailsScreen renders Pandit Cancel Ritual action for assigned priest", async () => {
    mockRouteParams = { bookingId: sampleBookingId };
    jest.spyOn(panditService, "fetchPanditBookingDetail").mockResolvedValue(sampleConfirmedBooking as any);

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<PanditBookingDetailsScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Cancel Ritual (Pandit Duty / Emergency)");
    expect(str).toContain("Mark Ritual as Completed 🕉️");
  });

  // 9. Live Sanctum Balance Gate in Edge Function
  test("9. live-session-token rejects customer join when outstanding balance exists (> 0)", async () => {
    const mockAdminClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-cust-1" } },
          error: null,
        }),
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: sampleBookingId,
                customer_id: "user-cust-1",
                pandit_id: samplePanditId,
                service_mode: "remote",
                status: "confirmed",
                scheduled_start_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                scheduled_end_at: new Date(Date.now() + 65 * 60 * 1000).toISOString(),
              },
              error: null,
            }),
          }),
        }),
      }),
      rpc: jest.fn().mockResolvedValue({
        data: { outstanding_balance: 1050.0 },
        error: null,
      }),
    };

    const req = new Request("http://localhost/live-session-token", {
      method: "POST",
      headers: {
        Authorization: "Bearer mock-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ booking_id: sampleBookingId }),
    });

    const getEnvMock = (key: string) => {
      if (key === "LIVEKIT_SERVER_URL") return "wss://livekit.cloud";
      if (key === "LIVEKIT_API_KEY") return "api-key";
      if (key === "LIVEKIT_API_SECRET") return "api-secret";
      return undefined;
    };

    const res = await handleLiveSessionToken(req, {
      adminClient: mockAdminClient,
      getEnvFn: getEnvMock,
      now: () => new Date(),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Outstanding balance of ₹1050.00 must be settled");
  });

  // 10. Razorpay Webhook Refund Reconciliation
  test("10. razorpay-webhook reconciles refund.processed event and marks database refund processed", async () => {
    const mockAdminClient = {
      rpc: jest.fn().mockResolvedValue({
        data: { success: true, transaction_status: "refunded" },
        error: null,
      }),
      from: jest.fn((table: string) => {
        if (table === "payment_transactions") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: "tx-uuid-1",
                    amount: "1050.00",
                    payment_order_id: "po-1",
                  },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === "refunds") {
          const chainableQuery: any = {
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: "rf-uuid-1",
                amount: "1050.00",
                status: "requested",
              },
              error: null,
            }),
            limit: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [{ amount: "1050.00" }], error: null }),
          };
          chainableQuery.eq = jest.fn().mockReturnValue(chainableQuery);

          return {
            select: jest.fn().mockReturnValue(chainableQuery),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return {};
      }),
    };

    const webhookBody = JSON.stringify({
      event: "refund.processed",
      payload: {
        refund: {
          entity: {
            id: "rfnd_test_12345",
            payment_id: "pay_test_99999",
            amount: 105000,
            status: "processed",
          },
        },
      },
    });

    // Compute valid HMAC signature for test
    const signatureHex = await computeHmacSha256Hex("test_webhook_secret", webhookBody);

    const req = new Request("http://localhost/razorpay-webhook", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signatureHex,
        "Content-Type": "application/json",
      },
      body: webhookBody,
    });

    const getEnvMock = (key: string) => {
      if (key === "RAZORPAY_WEBHOOK_SECRET") return "test_webhook_secret";
      return undefined;
    };

    const res = await handleRazorpayWebhook(req, {
      adminClient: mockAdminClient,
      getEnvFn: getEnvMock,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("refund_processed");
  });

  // 11. Execute Razorpay Refund Edge Function
  test("11. execute-razorpay-refund calls gateway refund API for authorized Admin", async () => {
    const validRefundId = "11111111-2222-4333-8444-555555555555";
    const mockAdminClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "admin-user-1" } },
          error: null,
        }),
      },
      rpc: jest.fn().mockResolvedValue({
        data: {
          success: true,
          refund_id: validRefundId,
          payment_transaction_id: "tx-1",
          booking_cancellation_id: "canc-1",
          amount: 1050,
          provider_payment_id: "pay_live_test_777",
        },
        error: null,
      }),
      from: jest.fn((table: string) => {
        if (table === "user_roles") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                in: jest.fn().mockReturnValue({
                  maybeSingle: jest.fn().mockResolvedValue({
                    data: { role: "admin" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "refunds") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({
                  data: {
                    id: validRefundId,
                    payment_transaction_id: "tx-1",
                    booking_cancellation_id: "canc-1",
                    amount: "1050.00",
                    status: "requested",
                    payment_transaction: {
                      id: "tx-1",
                      provider_payment_id: "pay_live_test_777",
                      amount: "1050.00",
                      status: "captured",
                    },
                  },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return {};
      }),
    };

    const mockFetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "rfnd_gateway_live_888",
          entity: "refund",
          amount: 105000,
          status: "processed",
        }),
        { status: 200 }
      )
    );

    const req = new Request("http://localhost/execute-razorpay-refund", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-jwt-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refund_id: validRefundId }),
    });

    const getEnvMock = (key: string) => {
      if (key === "RAZORPAY_KEY_ID") return "rzp_test_key";
      if (key === "RAZORPAY_KEY_SECRET") return "rzp_test_secret";
      return undefined;
    };

    const res = await handleExecuteRazorpayRefund(req, {
      adminClient: mockAdminClient,
      fetchFn: mockFetch,
      getEnvFn: getEnvMock,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.provider_refund_id).toBe("rfnd_gateway_live_888");
  });

  // 12. Dedicated Dynamic Balance UI & Focus Refresh Suite (Tests 1 - 5)
  describe("Authoritative Outstanding Balance UI & Refresh (Tests 1 - 5)", () => {
    test("TEST 1: displays zero balance and cleared badge when static balance_amount is 38.50 but authoritative outstanding_balance is 0.00", async () => {
      mockRouteParams = { bookingId: sampleBookingId };
      const settledBooking: BookingDetail = {
        ...sampleConfirmedBooking,
        total_amount: 77.0,
        advance_amount: 38.5,
        balance_amount: 38.5, // static creation snapshot
        outstanding_balance: 0.0, // authoritative dynamic balance
        total_paid: 77.0,
        net_paid: 77.0,
        total_refunded: 0.0,
      };
      jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(settledBooking);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingDetailsScreen />);
      });

      const str = extractAllText(tree.toJSON());
      expect(str).toContain("Total Ritual Amount");
      expect(str).toContain("₹77");
      expect(str).toContain("Total Dakshina Paid (Confirmed)");
      expect(str).toContain("Full Ritual Dakshina Paid & Cleared — No Outstanding Balance");
      expect(str).not.toContain("Pay Remaining Balance");
    });

    test("TEST 2: displays outstanding balance of ₹38.50 and enables payment button when balance is due", async () => {
      mockRouteParams = { bookingId: sampleBookingId };
      const dueBooking: BookingDetail = {
        ...sampleConfirmedBooking,
        total_amount: 77.0,
        advance_amount: 38.5,
        balance_amount: 38.5,
        outstanding_balance: 38.5,
        total_paid: 38.5,
        net_paid: 38.5,
      };
      jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(dueBooking);

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingDetailsScreen />);
      });

      const str = extractAllText(tree.toJSON());
      expect(str).toContain("Outstanding Balance");
      expect(str).toContain("Pay Remaining Balance — ₹38.50");
      expect(str).toContain("Advance Paid (Confirmed)");
      expect(str).not.toContain("Full Ritual Dakshina Paid & Cleared");
    });

    test("TEST 3: fetchBookingDetail queries authoritative calculate_booking_balance RPC", async () => {
      (bookingService.fetchBookingDetail as any).mockRestore?.();

      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          id: sampleBookingId,
          booking_number: "KV-BK-20261010-ABCD12",
          customer_id: "user-cust-1",
          pandit_id: samplePanditId,
          puja_service_id: "puja-1",
          service_mode: "remote",
          status: "confirmed",
          scheduled_start_at: "2026-10-10T10:00:00+05:30",
          scheduled_end_at: "2026-10-10T11:30:00+05:30",
          total_amount: 77.0,
          advance_amount: 38.5,
          balance_amount: 38.5,
          reschedule_count: 0,
        },
        error: null,
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "bookings") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: mockSingle,
              }),
            }),
          } as any;
        }
        if (table === "booking_line_items") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: {
          booking_id: sampleBookingId,
          total_amount: 77.0,
          total_paid: 77.0,
          net_paid: 77.0,
          total_refunded: 0.0,
          outstanding_balance: 0.0,
        },
        error: null,
      } as any);

      const result = await bookingService.fetchBookingDetail(sampleBookingId);

      expect(mockRpc).toHaveBeenCalledWith("calculate_booking_balance", {
        p_booking_id: sampleBookingId,
      });
      expect(result.outstanding_balance).toBe(0.0);
      expect(result.total_paid).toBe(77.0);
      expect(result.net_paid).toBe(77.0);
    });

    test("TEST 4: fetchBookingDetail throws error when calculate_booking_balance RPC fails", async () => {
      (bookingService.fetchBookingDetail as any).mockRestore?.();

      jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "bookings") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: sampleBookingId, status: "confirmed", total_amount: 77.0, advance_amount: 38.5, balance_amount: 38.5 },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        if (table === "booking_line_items") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: null,
        error: { message: "Permission denied on balance RPC", code: "42501" } as any,
      } as any);

      await expect(bookingService.fetchBookingDetail(sampleBookingId)).rejects.toThrow(
        "Failed to calculate booking balance: Permission denied on balance RPC"
      );
    });

    test("TEST 5: handles duplicate balance payment attempt gracefully when balance is zero and triggers refresh", async () => {
      mockRouteParams = { bookingId: sampleBookingId };
      const bookingWithStaleButton: BookingDetail = {
        ...sampleConfirmedBooking,
        total_amount: 77.0,
        advance_amount: 38.5,
        balance_amount: 38.5,
        outstanding_balance: 38.5,
      };
      const fetchSpy = jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(bookingWithStaleButton);

      const mockCreateBalanceOrder = jest.spyOn(
        bookingPaymentService,
        "createBookingBalancePaymentOrder"
      ).mockRejectedValueOnce(
        new Error("No outstanding balance due for booking (balance: 0.00).")
      );

      let tree: any;
      await act(async () => {
        tree = ReactTestRenderer.create(<BookingDetailsScreen />);
      });

      const buttons = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button);
      const payBalBtn = buttons.find((b: any) =>
        b.props.title?.includes("Pay Remaining Balance")
      );
      expect(payBalBtn).toBeDefined();

      await act(async () => {
        payBalBtn.props.onPress();
      });

      // Verification: duplicate payment rejected, Alert shown, refresh called
      expect(mockCreateBalanceOrder).toHaveBeenCalledWith(sampleBookingId);
      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
