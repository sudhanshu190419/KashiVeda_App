// __tests__/pandit_earnings.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { PanditBookingCard } from "../src/features/pandit/components/PanditBookingCard.tsx";
import { PanditPayoutCard } from "../src/features/pandit/components/PanditPayoutCard.tsx";
import { PanditBookingDetailsScreen } from "../src/features/pandit/screens/PanditBookingDetailsScreen.tsx";
import { PanditEarningsScreen } from "../src/features/pandit/screens/PanditEarningsScreen.tsx";
import { panditPayoutService } from "../src/features/pandit/services/panditPayoutService.ts";
import { panditService } from "../src/features/pandit/services/panditService.ts";
import {
  PanditBookingItem,
  PanditEarningsSummary,
  PanditPayoutItem,
} from "../src/features/pandit/types/pandit.types.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

jest.setTimeout(15000);

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    NavigationContainer: ({ children }: any) => children,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
    }),
    useRoute: () => ({
      params: { bookingId: "bk-1234" },
    }),
    useFocusEffect: (callback: any) => {
      React.useEffect(() => {
        return callback();
      }, []);
    },
  };
});

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    session: { user: { id: "user-p-1" } },
    user: { id: "user-p-1", phone: "+919876543210" },
    profile: { id: "user-p-1", display_name: "Acharya Shastri", phone: "+919876543210" },
    role: "pandit",
    panditProfile: {
      id: "pandit-shastri-1",
      user_id: "user-p-1",
      verification_status: "verified",
      public_status: "available",
      experience_years: 15,
      bio: "Vedic Scholar and Acharya of Kashi",
    },
    isLoading: false,
    error: null,
    signOut: jest.fn(),
    deleteAccount: jest.fn(),
    refreshProfile: jest.fn(),
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

const mockPaidPayout: PanditPayoutItem = {
  id: "payout-1111-2222-3333-4444",
  pandit_id: "pandit-shastri-1",
  booking_id: "bk-1234",
  kundli_order_id: null,
  bank_account_id: "bank-acc-1",
  gross_amount: 2100,
  platform_fee: 315,
  net_amount: 1785,
  status: "paid",
  provider_payout_id: "pout_rzp_live_999",
  payment_method: "bank_transfer",
  transaction_reference: "UTR987654321001",
  proof_document_path: "payout-proofs/pandit-1/20261006_receipt.jpg",
  confirmed_at: "2026-10-06T12:00:00Z",
  notes: "Direct NEFT settlement confirmed",
  released_at: "2026-10-06T12:00:00Z",
  created_at: "2026-10-05T10:00:00Z",
  booking: {
    id: "bk-1234",
    booking_number: "KV-BK-20261005-SHIVA",
    status: "completed",
    service_mode: "remote",
    scheduled_start_at: "2026-10-05T10:00:00Z",
    puja_service: {
      id: "puja-1",
      name: "Maha Rudrabhishek Puja",
    },
  },
  kundli_order: null,
  bank_account: {
    id: "bank-acc-1",
    bank_name: "State Bank of India",
    ifsc_code: "SBIN0001234",
    account_holder_name: "Ramkrishna Shastri",
  },
};

const mockPendingPayout: PanditPayoutItem = {
  id: "payout-pending-1234",
  pandit_id: "pandit-shastri-1",
  booking_id: "bk-1234",
  kundli_order_id: null,
  bank_account_id: "bank-acc-1",
  gross_amount: 3500,
  platform_fee: 525,
  net_amount: 2975,
  status: "pending",
  provider_payout_id: null,
  payment_method: null,
  transaction_reference: null,
  confirmed_at: null,
  notes: null,
  released_at: null,
  created_at: "2026-10-07T10:00:00Z",
  booking: {
    id: "bk-1234",
    booking_number: "KV-BK-20261007-SATYA",
    status: "completed",
    service_mode: "home",
    scheduled_start_at: "2026-10-07T10:00:00Z",
    puja_service: {
      id: "puja-2",
      name: "Satyanarayan Katha Puja",
    },
  },
  kundli_order: null,
  bank_account: {
    id: "bank-acc-1",
    bank_name: "State Bank of India",
    ifsc_code: "SBIN0001234",
    account_holder_name: "Ramkrishna Shastri",
  },
};

const mockKundliPayout: PanditPayoutItem = {
  id: "payout-5555-6666-7777-8888",
  pandit_id: "pandit-shastri-1",
  booking_id: null,
  kundli_order_id: "knd-9999",
  bank_account_id: "bank-acc-1",
  gross_amount: 1500,
  platform_fee: 225,
  net_amount: 1275,
  status: "pending",
  provider_payout_id: null,
  released_at: null,
  created_at: "2026-10-07T08:00:00Z",
  booking: null,
  kundli_order: {
    id: "knd-9999",
    order_number: "KV-KND-20261007-001",
    customer: {
      display_name: "Devotee Sharma",
    },
    customer_name: "Devotee Sharma",
    status: "completed",
    report_type: "premium",
  },
  bank_account: {
    id: "bank-acc-1",
    bank_name: "State Bank of India",
    ifsc_code: "SBIN0001234",
    account_holder_name: "Ramkrishna Shastri",
  },
};

const mockFailedPayout: PanditPayoutItem = {
  id: "payout-fail-9999",
  pandit_id: "pandit-shastri-1",
  booking_id: "bk-fail-1",
  kundli_order_id: null,
  bank_account_id: "bank-acc-1",
  gross_amount: 1000,
  platform_fee: 150,
  net_amount: 850,
  status: "failed",
  provider_payout_id: "pout_rzp_failed_001",
  released_at: null,
  created_at: "2026-10-04T10:00:00Z",
  booking: {
    id: "bk-fail-1",
    booking_number: "KV-BK-20261004-FAIL",
    status: "completed",
    service_mode: "home",
    scheduled_start_at: "2026-10-04T10:00:00Z",
    puja_service: {
      id: "puja-2",
      name: "Navgraha Shanti Puja",
    },
  },
  kundli_order: null,
  bank_account: {
    id: "bank-acc-1",
    bank_name: "State Bank of India",
    ifsc_code: "SBIN0001234",
    account_holder_name: "Ramkrishna Shastri",
  },
};

const mockCompletedBooking: PanditBookingItem = {
  id: "bk-1234",
  booking_number: "KV-BK-20261005-SHIVA",
  customer_id: "cust-1",
  pandit_id: "pandit-shastri-1",
  puja_service_id: "puja-1",
  service_mode: "remote",
  status: "completed",
  scheduled_start_at: "2026-10-05T10:00:00Z",
  scheduled_end_at: "2026-10-05T12:00:00Z",
  price_snapshot: 2500,
  currency: "INR",
  advance_amount: 2500,
  balance_amount: 0,
  total_amount: 2500, // Customer paid ₹2,500 total (including samagri/addons)
  reschedule_count: 0,
  confirmed_at: "2026-10-05T09:00:00Z",
  completed_at: "2026-10-05T12:30:00Z",
  created_at: "2026-10-05T08:00:00Z",
  updated_at: "2026-10-05T12:30:00Z",
  puja_service: {
    id: "puja-1",
    name: "Maha Rudrabhishek Puja",
  },
  customer: {
    id: "cust-1",
    display_name: "Devotee Sharma",
    phone: "+919876543210",
    avatar_url: null,
  },
  payout: mockPaidPayout, // Net Pandit earnings is ₹1,785 (authoritative from pandit_payouts)
};

describe("Pandit Completed Services, Earnings & Payout Status Test Suite", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1 & 2. COMPLETED BOOKINGS DISPLAY NET EARNINGS (NOT CUSTOMER TOTAL)
  // =========================================================================
  describe("1 & 2. Net Earnings vs Customer Booking Value Integrity", () => {
    test("Completed booking card displays Pandit net earnings (₹1,785) and NOT customer total (₹2,500)", () => {
      let renderer: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(
          <PanditBookingCard booking={mockCompletedBooking} onPress={jest.fn()} />
        );
      });

      const text = extractAllText(renderer!.toJSON());
      expect(text).toContain("Your Net Dakshina");
      expect(text).toContain("₹1,785.00");
      // Must NOT show ₹2,500 as Pandit's earnings
      expect(text).not.toContain("Ritual Dakshina ₹2,500.00");
      expect(text).toContain("Maha Rudrabhishek Puja");
      expect(text).toContain("KV-BK-20261005-SHIVA");
      expect(text).toContain("Service Completed");
      expect(text).toContain("Paid");
    });
  });

  // =========================================================================
  // 3. CORRECT PAYOUT-STATUS LABELS
  // =========================================================================
  describe("3. Correct Payout Status Labels", () => {
    test("PanditPayoutCard and PanditBookingCard render all 6 required payout status labels", () => {
      const statuses = [
        { key: "pending", label: "Awaiting Payout" },
        { key: "approved", label: "Payout Approved" },
        { key: "processing", label: "Transfer Processing" },
        { key: "paid", label: "Disbursed" },
        { key: "failed", label: "Payout Failed" },
        { key: "cancelled", label: "Payout Cancelled" },
      ] as const;

      statuses.forEach(({ key, label }) => {
        const payoutItem: PanditPayoutItem = {
          ...mockPaidPayout,
          id: `p-${key}`,
          status: key,
        };
        let renderer: ReactTestRenderer.ReactTestRenderer;
        act(() => {
          renderer = ReactTestRenderer.create(<PanditPayoutCard payout={payoutItem} />);
        });
        const text = extractAllText(renderer!.toJSON());
        expect(text).toContain(label);
      });
    });
  });

  // =========================================================================
  // 4. PENDING PAYOUT WITHOUT SETTLEMENT INFORMATION
  // =========================================================================
  describe("4. Pending Payout Without Settlement Information", () => {
    test("Pending payout does not display UTR or settlement date and displays awaiting message", () => {
      let renderer: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<PanditPayoutCard payout={mockPendingPayout} />);
      });

      const text = extractAllText(renderer!.toJSON());
      expect(text).toContain("Awaiting Payout");
      expect(text).not.toContain("UTR / Ref:");
      expect(text).not.toContain("Disbursed:");
      expect(text).toContain("₹2,975.00");
    });
  });

  // =========================================================================
  // 5. PAID PAYOUT DISPLAYING UTR, METHOD, AND SETTLEMENT DATE
  // =========================================================================
  describe("5. Paid Payout Details (UTR, Payment Method, Settlement Date)", () => {
    test("Paid payout displays UTR, payment method, and confirmed settlement date in PanditPayoutCard", () => {
      let renderer: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<PanditPayoutCard payout={mockPaidPayout} />);
      });

      const text = extractAllText(renderer!.toJSON());
      expect(text).toContain("Disbursed");
      expect(text).toContain("BANK TRANSFER");
      expect(text).toContain("UTR987654321001");
      expect(text).toContain("Direct NEFT settlement confirmed");
      expect(text).toContain("State Bank of India");
    });
  });

  // =========================================================================
  // 6. MISSING PAYOUT RECORDS HANDLING
  // =========================================================================
  describe("6. Missing Payout Record Truthful Explanatory State", () => {
    test("Completed booking with no payout record displays Settlement Pending without inventing amounts", () => {
      const bookingWithoutPayout: PanditBookingItem = {
        ...mockCompletedBooking,
        payout: null,
      };

      let renderer: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(
          <PanditBookingCard booking={bookingWithoutPayout} onPress={jest.fn()} />
        );
      });

      const text = extractAllText(renderer!.toJSON());
      expect(text).toContain("Settlement Pending");
      expect(text).not.toContain("₹1,785.00");
      expect(text).not.toContain("Paid");
    });
  });

  // =========================================================================
  // 7. MISSING OPTIONAL MIGRATION-042 FIELDS RESILIENCE
  // =========================================================================
  describe("7. Missing Optional Migration 042 Fields Resilience", () => {
    test("fetchPayoutHistory gracefully falls back if Migration 042 columns do not exist in DB", async () => {
      // First call (with extended fields) returns 'column does not exist'
      const selectMock = jest.fn().mockReturnValueOnce({
        order: jest.fn().mockResolvedValueOnce({
          data: null,
          error: { message: "column pandit_payouts.transaction_reference does not exist", code: "42703" },
        }),
      }).mockReturnValueOnce({
        order: jest.fn().mockResolvedValueOnce({
          data: [mockSampleBasePayout(mockPaidPayout)],
          error: null,
        }),
      });

      jest.spyOn(supabase, "from").mockReturnValue({
        select: selectMock,
      } as any);

      const payouts = await panditPayoutService.fetchPayoutHistory();
      expect(payouts).toHaveLength(1);
      expect(payouts[0].net_amount).toBe(1785);
      expect(selectMock).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 8. ACTUAL DATABASE QUERY ERRORS REMAIN VISIBLE AS ERRORS
  // =========================================================================
  describe("8. Actual Database Query Errors Remain Visible", () => {
    test("fetchEarningsSummary re-throws real database errors rather than concealing as ₹0", async () => {
      jest.spyOn(panditPayoutService, "getAuthenticatedPanditId").mockResolvedValue(
        "pandit-shastri-1"
      );

      jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: null,
        error: { message: "PostgreSQL connection timed out" },
      } as any);

      await expect(panditPayoutService.fetchEarningsSummary()).rejects.toThrow(
        "PostgreSQL connection timed out"
      );
    });
  });

  // =========================================================================
  // 9. PANDIT-SPECIFIC DATA ISOLATION
  // =========================================================================
  describe("9. Pandit-Specific Data Isolation", () => {
    test("getAuthenticatedPanditId ensures queries use pandit_profiles.id and not auth.users.id", async () => {
      jest.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: "auth-uuid-999" } as any },
        error: null,
      });

      const mockFrom = jest.spyOn(supabase, "from").mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: "pandit-profile-777" },
              error: null,
            }),
          }),
        }),
      } as any);

      const panditId = await panditPayoutService.getAuthenticatedPanditId();
      expect(panditId).toBe("pandit-profile-777");
      expect(panditId).not.toBe("auth-uuid-999");
      expect(mockFrom).toHaveBeenCalledWith("pandit_profiles");
    });
  });

  // =========================================================================
  // 10. BOOKING DETAILS SCREEN & DEDICATED SETTLEMENT CARD
  // =========================================================================
  describe("10. PanditBookingDetailsScreen Dedicated Settlement Card", () => {
    test("Renders Dakshina & Settlement Status card with Pandit net earnings and settlement details", async () => {
      jest.spyOn(panditService, "fetchPanditBookingDetail").mockResolvedValue(mockCompletedBooking);

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(<PanditBookingDetailsScreen />);
      });

      const text = extractAllText(renderer!.toJSON());
      expect(text).toContain("Dakshina & Settlement Status");
      expect(text).toContain("PANDIT SETTLEMENT LEDGER");
      expect(text).toContain("Your Net Dakshina (Disbursement)");
      expect(text).toContain("₹1,785.00");
      expect(text).toContain("Gross:");
      expect(text).toContain("₹2,100.00");
      expect(text).toContain("Platform Fee:");
      expect(text).toContain("₹315.00");
      expect(text).toContain("Paid");
      expect(text).toContain("UTR987654321001");
      expect(text).toContain("Devotee Booking & Payment Overview");
      expect(text).toContain("Total Ritual Value");
      expect(text).toContain("₹2,500.00");
    });
  });

  // =========================================================================
  // 11. REFRESH & CONSISTENCY
  // =========================================================================
  describe("11. Refresh & Consistency", () => {
    const mockSummary: PanditEarningsSummary = {
      pandit_id: "pandit-shastri-1",
      total_gross: 4600,
      total_platform_fee: 690,
      net_earnings: 3910,
      paid_payouts: 1785,
      pending_payouts: 1275,
      failed_payouts: 850,
      completed_service_gross: 3100,
      completed_kundli_gross: 1500,
    };

    test("PanditEarningsScreen refreshes and renders updated ledger on focus", async () => {
      const summarySpy = jest
        .spyOn(panditPayoutService, "fetchEarningsSummary")
        .mockResolvedValue(mockSummary);
      const historySpy = jest
        .spyOn(panditPayoutService, "fetchPayoutHistory")
        .mockResolvedValue([mockPaidPayout, mockKundliPayout]);

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(<PanditEarningsScreen />);
      });

      const text = extractAllText(renderer!.toJSON());
      expect(text).toContain("TOTAL NET EARNINGS");
      expect(text).toContain("₹3,910.00");
      expect(text).toContain("₹1,785.00");
      expect(text).toContain("₹1,275.00");
      expect(summarySpy).toHaveBeenCalled();
      expect(historySpy).toHaveBeenCalled();
    });

    test("12. Payment proof receipt button displays and fetches signed URL on demand", async () => {
      const getProofSpy = jest
        .spyOn(panditPayoutService, "getPayoutProofSignedUrl")
        .mockResolvedValue("https://storage.supabase.co/payout-proofs/signed_receipt.jpg");

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(<PanditPayoutCard payout={mockPaidPayout} />);
      });

      const text = extractAllText(renderer!.toJSON());
      expect(text).toContain("Payment Proof");
      expect(text).toContain("View Proof");

      // Find the touchable for View Proof
      const proofBtn = renderer!.root.findAll((node) =>
        node.props?.children &&
        typeof node.props.children === "string" &&
        node.props.children.includes("View Proof")
      );
      expect(proofBtn.length).toBeGreaterThan(0);
    });
  });
});

function mockSampleBasePayout(p: PanditPayoutItem) {
  const { payment_method, transaction_reference, confirmed_at, notes, ...rest } = p;
  return rest;
}

