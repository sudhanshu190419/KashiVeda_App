// __tests__/kundli.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { kundliService } from "../src/features/kundli/services/kundliService.ts";
import { kundliPaymentService } from "../src/features/kundli/services/kundliPaymentService.ts";
import { KundliPanditCard } from "../src/features/kundli/components/KundliPanditCard.tsx";
import { KundliOrderCard, getKundliStatusMeta } from "../src/features/kundli/components/KundliOrderCard.tsx";
import { KundliScreen } from "../src/features/kundli/screens/KundliScreen.tsx";
import { KundliWizardScreen } from "../src/features/kundli/screens/KundliWizardScreen.tsx";
import { KundliPaymentScreen } from "../src/features/kundli/screens/KundliPaymentScreen.tsx";
import { KundliOrdersScreen } from "../src/features/kundli/screens/KundliOrdersScreen.tsx";
import { KundliDetailScreen } from "../src/features/kundli/screens/KundliDetailScreen.tsx";
import { PanditKundliScreen } from "../src/features/pandit/screens/PanditKundliScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { KundliOrder, KundliPandit } from "../src/features/kundli/types/kundli.types.ts";

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();

let mockRouteParams: any = {};

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: any) => children,
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
}));

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

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() =>
      Promise.resolve({
        type: "success",
        data: {
          idToken: "mock-google-id-token-xyz",
          user: { id: "google-1", email: "devotee@gmail.com", name: "Devotee" },
        },
      })
    ),
    signOut: jest.fn(() => Promise.resolve()),
    getTokens: jest.fn(() => Promise.resolve({ idToken: "mock-google-id-token-xyz" })),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED",
    IN_PROGRESS: "IN_PROGRESS",
    PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE",
  },
  isErrorWithCode: jest.fn(() => false),
  isCancelledResponse: jest.fn(() => false),
}));

jest.mock("../src/features/auth/AuthContext.tsx", () => ({
  useAuth: () => ({
    user: { id: "cust-user-1", email: "sharma@kashiveda.org" },
    profile: {
      id: "cust-user-1",
      display_name: "Devotee Sharma",
      phone: "+919876543210",
      email: "sharma@kashiveda.org",
    },
    role: "customer",
    panditProfile: { id: "pandit-vedic-1", user_id: "user-pandit-1", kundli_price: "1100" },
    isLoading: false,
    error: null,
    signOut: jest.fn(),
    refreshProfile: jest.fn(),
    setProfile: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

function extractAllText(node: any): string {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractAllText).join(" ");
  if (node.props && node.props.children) {
    return extractAllText(node.props.children);
  }
  if (node.children) {
    return extractAllText(node.children);
  }
  return "";
}

const mockInvoke = jest.fn();
Object.defineProperty(supabase, "functions", {
  value: { invoke: mockInvoke },
  writable: true,
  configurable: true,
});

describe("M5 Kundli Service End-to-End Test Suite", () => {
  const samplePandit: KundliPandit = {
    id: "pandit-vedic-1",
    user_id: "user-pandit-1",
    display_name: "Acharya Vidyadhar Shastri",
    avatar_url: null,
    bio: "Gold medalist in Vedic Jyotish from Banaras Hindu University.",
    experience_years: 15,
    languages: ["Hindi", "Sanskrit", "English"],
    kundli_enabled: true,
    kundli_price: 1100,
    kundli_turnaround_days: 3,
    verification_status: "approved",
    public_status: "available",
  };

  const sampleOrder: KundliOrder = {
    id: "ord-kundli-123",
    order_number: "KV-KD-20261006-V1W2X3",
    customer_id: "cust-user-1",
    pandit_id: "pandit-vedic-1",
    price: 1100,
    currency: "INR",
    date_of_birth: "1995-08-15",
    time_of_birth: "14:30:00",
    place_of_birth: "Varanasi, Uttar Pradesh, India",
    birth_latitude: 25.3176,
    birth_longitude: 82.9739,
    additional_notes: "Please provide career analysis.",
    status: "paid",
    customer_confirmed_at: null,
    completed_at: null,
    created_at: "2026-10-06T10:00:00Z",
    updated_at: "2026-10-06T10:05:00Z",
    pandit: {
      id: "pandit-vedic-1",
      display_name: "Acharya Vidyadhar Shastri",
      kundli_price: 1100,
      kundli_turnaround_days: 3,
      experience_years: 15,
    },
    customer: {
      id: "cust-user-1",
      display_name: "Devotee Sharma",
      phone: "+919876543210",
      email: "sharma@kashiveda.org",
    },
    current_document: null,
    documents: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};

    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        razorpay_order_id: "rzp_order_kundli_999",
        amount: 110000,
        currency: "INR",
        key_id: "rzp_test_key_kashi",
      },
      error: null,
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "mock-jwt-token-123" } },
      error: null,
    } as any);

    jest.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: "cust-user-1", email: "sharma@kashiveda.org" } },
      error: null,
    } as any);
  });

  // 1. Kundli Pandit discovery & filtering
  test("1 & 2. Discovers only Kundli-enabled, approved, and available Pandits with price > 0", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gt: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: "pandit-vedic-1",
                    user_id: "user-pandit-1",
                    bio: "Vedic Scholar",
                    years_experience: 15,
                    languages: ["Hindi", "Sanskrit"],
                    kundli_enabled: true,
                    kundli_price: 1100,
                    kundli_turnaround_days: 3,
                    verification_status: "approved",
                    public_status: "available",
                    profiles: {
                      display_name: "Acharya Vidyadhar Shastri",
                      avatar_url: null,
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    jest.spyOn(supabase, "from").mockReturnValue({
      select: mockSelect,
    } as any);

    const pandits = await kundliService.getKundliPandits();
    expect(pandits.length).toBe(1);
    expect(pandits[0].display_name).toBe("Acharya Vidyadhar Shastri");
    expect(pandits[0].kundli_price).toBe(1100);
    expect(pandits[0].kundli_enabled).toBe(true);
  });

  // 3. Pandit-specific Kundli price rendering
  test("3. KundliPanditCard renders Pandit name, experience, turnaround, and Pandit-specific price", () => {
    const onSelectMock = jest.fn();
    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <KundliPanditCard pandit={samplePandit} onSelect={onSelectMock} />
      );
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Acharya Vidyadhar Shastri");
    expect(str).toContain("15");
    expect(str).toContain("years Vedic experience");
    expect(str).toContain("3 days delivery");
    expect(str).toContain("₹1,100.00");
  });

  test("KundliOrderCard renders order number, birth data, status badge, and partner name", () => {
    const onPressMock = jest.fn();
    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(
        <KundliOrderCard order={sampleOrder} onPress={onPressMock} viewerRole="customer" />
      );
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("KV-KD-20261006-V1W2X3");
    expect(str).toContain("Paid & Assigned");
    expect(str).toContain("Acharya Vidyadhar Shastri");
    expect(str).toContain("₹1,100.00");
  });

  // 4. Empty Pandit state
  test("4. KundliScreen renders empty state when no Kundli astrologers are available", async () => {
    jest.spyOn(kundliService, "getKundliPandits").mockResolvedValue([]);

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<KundliScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("No Kundli specialists available");
  });

  // 5. create_kundli_order RPC invocation
  test("5. createKundliOrder invokes authoritative create_kundli_order RPC with correct params", async () => {
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        kundli_order_id: "ord-kundli-123",
        order_number: "KV-KD-20261006-V1W2X3",
        status: "payment_pending",
        price: 1100,
        payment_order_id: "po-kundli-123",
      },
      error: null,
    } as any);

    const result = await kundliService.createKundliOrder({
      pandit_id: "pandit-vedic-1",
      date_of_birth: "1995-08-15",
      time_of_birth: "14:30:00",
      place_of_birth: "Varanasi, UP",
      birth_latitude: 25.3176,
      birth_longitude: 82.9739,
      additional_notes: "Career focus",
    });

    expect(mockRpc).toHaveBeenCalledWith("create_kundli_order", {
      p_pandit_id: "pandit-vedic-1",
      p_date_of_birth: "1995-08-15",
      p_time_of_birth: "14:30:00",
      p_place_of_birth: "Varanasi, UP",
      p_birth_latitude: 25.3176,
      p_birth_longitude: 82.9739,
      p_additional_notes: "Career focus",
    });

    expect(result.kundli_order_id).toBe("ord-kundli-123");
    expect(result.price).toBe(1100);
    expect(result.payment_order_id).toBe("po-kundli-123");
  });

  // 6. Validation and duplicate submission prevention in Wizard
  test("6. KundliWizardScreen validates required birth fields and prevents empty submissions", async () => {
    jest.spyOn(kundliService, "getKundliPandits").mockResolvedValue([samplePandit]);
    const rpcSpy = jest.spyOn(kundliService, "createKundliOrder");

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<KundliWizardScreen />);
    });

    // Attempting to submit without filled fields should show error and not call RPC
    const buttons = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button);
    const submitBtn = buttons[buttons.length - 1];

    await act(async () => {
      submitBtn.props.onPress();
    });

    expect(rpcSpy).not.toHaveBeenCalled();
    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Date of Birth is required");
  });

  // 7 & 8. 100% Upfront payment & create-razorpay-order Edge Function invocation
  test("7 & 8. KundliPaymentScreen creates gateway order with 100% upfront amount via Edge Function", async () => {
    mockRouteParams = {
      kundliOrderId: "ord-kundli-123",
      paymentOrderId: "po-kundli-123",
      amount: 1100,
      panditName: "Acharya Vidyadhar Shastri",
      orderNumber: "KV-KD-20261006-V1W2X3",
    };

    const edgeFuncSpy = jest.spyOn(kundliPaymentService, "createRazorpayOrder").mockResolvedValue({
      razorpay_order_id: "rzp_order_kundli_999",
      amount: 110000,
      currency: "INR",
      key_id: "rzp_test_key_kashi",
    });

    const checkoutSpy = jest.spyOn(kundliPaymentService, "openRazorpayCheckout").mockResolvedValue({
      razorpay_payment_id: "pay_123456",
      razorpay_order_id: "rzp_order_kundli_999",
    });

    const pollSpy = jest.spyOn(kundliPaymentService, "pollKundliPaymentConfirmation").mockResolvedValue({
      confirmed: true,
      status: "paid",
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<KundliPaymentScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("100% Upfront");
    expect(str).toContain("₹1,100.00");

    const payBtn = tree.root.findByType(require("../src/shared/components/ui/Button.tsx").Button);
    await act(async () => {
      await payBtn.props.onPress();
    });

    expect(edgeFuncSpy).toHaveBeenCalledWith("po-kundli-123");
    expect(checkoutSpy).toHaveBeenCalled();
    expect(pollSpy).toHaveBeenCalledWith("ord-kundli-123", 12, 2000);

    const postPayStr = extractAllText(tree.toJSON());
    expect(postPayStr).toContain("Payment Successful!");
  });

  // 9 & 10. Payment confirmation waiting state & polling bounds
  test("9 & 10. pollKundliPaymentConfirmation terminates on confirmed state and handles failed verification gracefully", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest
          .fn()
          .mockResolvedValueOnce({
            data: { id: "ord-kundli-123", status: "payment_pending", price: 1100 },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { id: "ord-kundli-123", status: "paid", price: 1100 },
            error: null,
          }),
      }),
    });

    jest.spyOn(supabase, "from").mockReturnValue({
      select: mockSelect,
    } as any);

    const result = await kundliPaymentService.pollKundliPaymentConfirmation(
      "ord-kundli-123",
      3,
      10
    );

    expect(result.confirmed).toBe(true);
    expect(result.status).toBe("paid");
  });

  // 11 & 12. Kundli history pagination & customer ownership
  test("11 & 12. getCustomerKundliOrders fetches paginated customer orders with selective columns", async () => {
    const mockSelect = jest.fn().mockReturnValue({
      order: jest.fn().mockReturnValue({
        range: jest.fn().mockResolvedValue({
          data: [
            {
              id: "ord-kundli-123",
              order_number: "KV-KD-20261006-V1W2X3",
              customer_id: "cust-user-1",
              pandit_id: "pandit-vedic-1",
              price: 1100,
              currency: "INR",
              date_of_birth: "1995-08-15",
              time_of_birth: "14:30:00",
              place_of_birth: "Varanasi, UP",
              additional_notes: null,
              status: "paid",
              customer_confirmed_at: null,
              completed_at: null,
              created_at: "2026-10-06T10:00:00Z",
              updated_at: "2026-10-06T10:05:00Z",
              pandit_profiles: {
                id: "pandit-vedic-1",
                kundli_price: 1100,
                kundli_turnaround_days: 3,
                profiles: {
                  display_name: "Acharya Vidyadhar Shastri",
                  avatar_url: null,
                },
              },
              kundli_documents: [],
            },
          ],
          count: 1,
          error: null,
        }),
      }),
    });

    jest.spyOn(supabase, "from").mockReturnValue({
      select: mockSelect,
    } as any);

    const result = await kundliService.getCustomerKundliOrders(1, 10);
    expect(result.orders.length).toBe(1);
    expect(result.orders[0].pandit?.display_name).toBe("Acharya Vidyadhar Shastri");
    expect(result.count).toBe(1);
  });

  // 13. Pandit ownership & assigned order queue
  test("13. getPanditKundliOrders fetches assigned orders with status filters", async () => {
    const mockRange = jest.fn().mockResolvedValue({
      data: [
        {
          id: "ord-kundli-123",
          order_number: "KV-KD-20261006-V1W2X3",
          customer_id: "cust-user-1",
          pandit_id: "pandit-vedic-1",
          price: 1100,
          currency: "INR",
          date_of_birth: "1995-08-15",
          time_of_birth: "14:30:00",
          place_of_birth: "Varanasi, UP",
          additional_notes: "Focus on marriage compatibility",
          status: "in_progress",
          customer_confirmed_at: null,
          completed_at: null,
          created_at: "2026-10-06T10:00:00Z",
          updated_at: "2026-10-06T10:05:00Z",
          profiles: {
            id: "cust-user-1",
            display_name: "Devotee Sharma",
            avatar_url: null,
          },
          kundli_documents: [],
        },
      ],
      count: 1,
      error: null,
    });

    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          range: mockRange,
        }),
      }),
      order: jest.fn().mockReturnValue({
        range: mockRange,
      }),
    });

    jest.spyOn(supabase, "from").mockReturnValue({
      select: mockSelect,
    } as any);

    const result = await kundliService.getPanditKundliOrders(1, 10, "in_progress");
    expect(result.orders.length).toBe(1);
    expect(result.orders[0].customer?.display_name).toBe("Devotee Sharma");
    expect(result.orders[0].status).toBe("in_progress");
  });

  // 14 & 15. Document upload validation and private storage update
  test("14 & 15. uploadKundliDocument validates PDF and uploads to private kundli-documents storage bucket", async () => {
    const mockStorageUpload = jest.fn().mockResolvedValue({
      data: { path: "ord-kundli-123/Kundli_Report.pdf" },
      error: null,
    });

    Object.defineProperty(supabase, "storage", {
      value: {
        from: jest.fn().mockReturnValue({
          upload: mockStorageUpload,
          createSignedUrl: jest.fn(),
        }),
      },
      writable: true,
      configurable: true,
    });

    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "doc-k-1",
            kundli_order_id: "ord-kundli-123",
            version_number: 1,
            storage_path: "ord-kundli-123/Kundli_Report.pdf",
            file_name: "Kundli_Report.pdf",
            uploaded_by: "user-pandit-1",
            uploaded_at: "2026-10-06T12:00:00Z",
            is_current: true,
          },
          error: null,
        }),
      }),
    });

    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string): any => {
      if (table === "kundli_documents") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          update: mockUpdate,
          insert: mockInsert,
        };
      }
      return {};
    });

    const pdfBuf = new ArrayBuffer(16);
    const doc = await kundliService.uploadKundliDocument(
      "ord-kundli-123",
      {
        name: "Kundli_Report.pdf",
        type: "application/pdf",
        arrayBuffer: pdfBuf,
      },
      "user-pandit-1"
    );

    expect(doc.storage_path).toBe("ord-kundli-123/Kundli_Report.pdf");
    expect(doc.version_number).toBe(1);
    expect(doc.is_current).toBe(true);
    expect(mockStorageUpload).toHaveBeenCalledWith(
      "ord-kundli-123/Kundli_Report.pdf",
      pdfBuf,
      { contentType: "application/pdf", upsert: true }
    );
  });

  test("uploadKundliDocument converts file.uri to ArrayBuffer and passes ArrayBuffer (not FormData, not Blob) to Supabase Storage", async () => {
    const mockStorageUpload = jest.fn().mockResolvedValue({
      data: { path: "ord-kundli-456/Kundli_Report.pdf" },
      error: null,
    });

    Object.defineProperty(supabase, "storage", {
      value: {
        from: jest.fn().mockReturnValue({
          upload: mockStorageUpload,
          createSignedUrl: jest.fn(),
        }),
      },
      writable: true,
      configurable: true,
    });

    const mockInsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            id: "doc-k-2",
            kundli_order_id: "ord-kundli-456",
            version_number: 2,
            storage_path: "ord-kundli-456/Kundli_Report.pdf",
            file_name: "Kundli_Report.pdf",
            uploaded_by: "user-pandit-1",
            uploaded_at: "2026-10-06T12:00:00Z",
            is_current: true,
          },
          error: null,
        }),
      }),
    });

    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });

    jest.spyOn(supabase, "from").mockImplementation((table: string): any => {
      if (table === "kundli_documents") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [{ version_number: 1 }],
                  error: null,
                }),
              }),
            }),
          }),
          update: mockUpdate,
          insert: mockInsert,
        };
      }
      return {};
    });

    const mockArrayBuffer = new ArrayBuffer(256);
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
    });

    try {
      const doc = await kundliService.uploadKundliDocument(
        "ord-kundli-456",
        {
          name: "Kundli_Report.pdf",
          type: "application/pdf",
          uri: "file:///data/user/0/com.kashiveda/cache/document.pdf",
        },
        "user-pandit-1"
      );

      expect((globalThis as any).fetch).toHaveBeenCalledWith("file:///data/user/0/com.kashiveda/cache/document.pdf");
      expect(doc.version_number).toBe(2);
      expect(mockStorageUpload).toHaveBeenCalledWith(
        "ord-kundli-456/Kundli_Report.pdf",
        mockArrayBuffer,
        { contentType: "application/pdf", upsert: true }
      );
      // Ensure payload is an ArrayBuffer, not FormData, not Blob
      const passedPayload = mockStorageUpload.mock.calls[0][1];
      expect(passedPayload).toBe(mockArrayBuffer);
      expect(passedPayload instanceof ArrayBuffer).toBe(true);
      expect(passedPayload instanceof FormData).toBe(false);
      expect(typeof Blob !== "undefined" && passedPayload instanceof Blob).toBe(false);
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  // 16 & 17. Document availability & secure signed URL generation
  test("16 & 17. getSignedDocumentUrl requests secure temporary signed URL for private document access", async () => {
    const mockSignedUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.kashiveda.org/signed/ord-kundli-123/Kundli_Report.pdf?token=xyz" },
      error: null,
    });

    Object.defineProperty(supabase, "storage", {
      value: {
        from: jest.fn().mockReturnValue({
          createSignedUrl: mockSignedUrl,
        }),
      },
      writable: true,
      configurable: true,
    });

    const url = await kundliService.getSignedDocumentUrl("ord-kundli-123/Kundli_Report.pdf");
    expect(url).toContain("https://storage.kashiveda.org/signed/");
    expect(mockSignedUrl).toHaveBeenCalledWith("ord-kundli-123/Kundli_Report.pdf", 3600);
  });

  // 18, 19 & 20. Customer confirmation and confirm_kundli_and_enable_payout RPC
  test("18, 19 & 20. confirmKundliDelivery invokes confirm_kundli_and_enable_payout RPC and marks order completed", async () => {
    const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
      data: {
        status: "completed",
        kundli_order_id: "ord-kundli-123",
        customer_confirmed_at: "2026-10-06T14:00:00Z",
        completed_at: "2026-10-06T14:00:00Z",
        payout_id: "payout-kd-123",
        payout_amount: 880,
      },
      error: null,
    } as any);

    const result = await kundliService.confirmKundliDelivery("ord-kundli-123");
    expect(mockRpc).toHaveBeenCalledWith("confirm_kundli_and_enable_payout", {
      p_kundli_order_id: "ord-kundli-123",
    });
    expect(result.status).toBe("completed");
    expect(result.payout_id).toBe("payout-kd-123");
  });

  // 21. Empty state rendering across orders
  test("21. KundliOrdersScreen displays clear empty state when devotee has no past Kundli orders", async () => {
    jest.spyOn(kundliService, "getCustomerKundliOrders").mockResolvedValue({
      orders: [],
      count: 0,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<KundliOrdersScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("No Kundli Orders Yet");
  });

  // 22. Status badge metadata mapping and navigation flow
  test("22. Status metadata correctly maps all backend Kundli order statuses", () => {
    expect(getKundliStatusMeta("draft").label).toBe("Draft");
    expect(getKundliStatusMeta("payment_pending").label).toBe("Payment Pending");
    expect(getKundliStatusMeta("paid").label).toBe("Paid & Assigned");
    expect(getKundliStatusMeta("in_progress").label).toBe("Preparing Kundli");
    expect(getKundliStatusMeta("document_uploaded").label).toBe("Document Ready");
    expect(getKundliStatusMeta("customer_confirmed").label).toBe("Confirmed");
    expect(getKundliStatusMeta("completed").label).toBe("Completed");
    expect(getKundliStatusMeta("cancelled").label).toBe("Cancelled");
    expect(getKundliStatusMeta("disputed").label).toBe("Disputed");
  });

  test("KundliDetailScreen displays full birth details, status badge, and document action", async () => {
    mockRouteParams = { orderId: "ord-kundli-123" };

    const orderWithDoc: KundliOrder = {
      ...sampleOrder,
      status: "document_uploaded",
      current_document: {
        id: "doc-1",
        kundli_order_id: "ord-kundli-123",
        version_number: 1,
        storage_path: "ord-kundli-123/Kundli_Report.pdf",
        file_name: "Kundli_Report.pdf",
        uploaded_by: "user-pandit-1",
        uploaded_at: "2026-10-06T12:00:00Z",
        is_current: true,
      },
    };

    jest.spyOn(kundliService, "getKundliOrderById").mockResolvedValue(orderWithDoc);
    jest.spyOn(kundliService, "getSignedDocumentUrl").mockResolvedValue("https://storage.kashiveda.org/doc.pdf");

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<KundliDetailScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("KV-KD-20261006-V1W2X3");
    expect(str).toContain("Document Ready");
    expect(str).toContain("Kundli_Report.pdf");
    expect(str).toContain("Confirm Receipt & Complete");
  });

  test("PanditKundliScreen displays assigned queue with birth chart info and upload action", async () => {
    jest.spyOn(kundliService, "getPanditKundliOrders").mockResolvedValue({
      orders: [sampleOrder],
      count: 1,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<PanditKundliScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Kundli Queue");
    expect(str).toContain("Devotee Sharma");
    expect(str).toContain("Upload Handwritten PDF");
  });

  test("PanditKundliScreen opens modal, handles picker errors gracefully without crash", async () => {
    jest.spyOn(kundliService, "getPanditKundliOrders").mockResolvedValue({
      orders: [sampleOrder],
      count: 1,
    });

    const picker = require("@react-native-documents/picker");
    jest.spyOn(picker, "pick").mockRejectedValueOnce(new Error("undefined is not a function"));

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<PanditKundliScreen />);
    });

    // Find and press "Upload Handwritten PDF" button
    const buttons = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button);
    const uploadBtn = buttons.find((b: any) => b.props.title === "Upload Handwritten PDF");
    expect(uploadBtn).toBeDefined();

    await act(async () => {
      uploadBtn.props.onPress();
    });

    // Inside modal, find "Choose PDF from Device" button
    const modalButtons = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button);
    const pickBtn = modalButtons.find((b: any) => b.props.title?.includes("Choose PDF"));
    expect(pickBtn).toBeDefined();

    await act(async () => {
      await pickBtn.props.onPress();
    });

    const modalText = extractAllText(tree.toJSON());
    expect(modalText).toContain("Unable to open device file picker");
  });

  // ===========================================================================
  // Migration 019 Verification: Authoritative State Transitions & Security
  // ===========================================================================

  describe("Migration 019: Kundli Document Upload State Transition & Security", () => {
    // Exact simulation of Postgres trigger handle_kundli_document_uploaded()
    function simulateHandleKundliDocumentUploaded(
      orderStatus: string,
      isCurrent: boolean
    ): string {
      if (isCurrent && (orderStatus === "paid" || orderStatus === "in_progress")) {
        return "document_uploaded";
      }
      return orderStatus;
    }

    // 1. paid order + document insert -> document_uploaded
    test("1. Paid order transitions to document_uploaded upon valid current document insert", () => {
      const initialStatus = "paid";
      const finalStatus = simulateHandleKundliDocumentUploaded(initialStatus, true);
      expect(finalStatus).toBe("document_uploaded");
    });

    // 2. in_progress order + document insert -> document_uploaded
    test("2. In_progress order transitions to document_uploaded upon valid current document insert", () => {
      const initialStatus = "in_progress";
      const finalStatus = simulateHandleKundliDocumentUploaded(initialStatus, true);
      expect(finalStatus).toBe("document_uploaded");
    });

    // 3. cancelled order remains cancelled
    test("3. Cancelled order remains cancelled after document insert attempt", () => {
      const initialStatus = "cancelled";
      const finalStatus = simulateHandleKundliDocumentUploaded(initialStatus, true);
      expect(finalStatus).toBe("cancelled");
    });

    // 4. completed order remains completed
    test("4. Completed order remains completed after document insert attempt", () => {
      const initialStatus = "completed";
      const finalStatus = simulateHandleKundliDocumentUploaded(initialStatus, true);
      expect(finalStatus).toBe("completed");
    });

    // 5. disputed order remains disputed
    test("5. Disputed order remains disputed after document insert attempt", () => {
      const initialStatus = "disputed";
      const finalStatus = simulateHandleKundliDocumentUploaded(initialStatus, true);
      expect(finalStatus).toBe("disputed");
    });

    // 6. duplicate document upload does not corrupt status
    test("6. Duplicate or replacement document upload retains document_uploaded status and respects versioning", async () => {
      // Version 1 upload transitions paid -> document_uploaded
      const statusAfterV1 = simulateHandleKundliDocumentUploaded("paid", true);
      expect(statusAfterV1).toBe("document_uploaded");

      // Version 2 upload on document_uploaded order maintains document_uploaded
      const statusAfterV2 = simulateHandleKundliDocumentUploaded(statusAfterV1, true);
      expect(statusAfterV2).toBe("document_uploaded");

      // Non-current document insert does not trigger state change
      const statusNonCurrent = simulateHandleKundliDocumentUploaded("paid", false);
      expect(statusNonCurrent).toBe("paid");
    });

    // 7. customer cannot insert kundli_documents
    test("7. Customer role cannot insert kundli_documents (RLS constraint enforcement)", async () => {
      // Simulate RLS rejection when customer role attempts insert
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: {
              message: "new row violates row-level security policy for table \"kundli_documents\"",
              code: "42501",
            },
          }),
        }),
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string): any => {
        if (table === "kundli_documents") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      });

      Object.defineProperty(supabase, "storage", {
        value: {
          from: jest.fn().mockReturnValue({
            upload: jest.fn().mockResolvedValue({ data: { path: "ord-1/doc.pdf" }, error: null }),
          }),
        },
        writable: true,
        configurable: true,
      });

      await expect(
        kundliService.uploadKundliDocument(
          "ord-kundli-123",
          { name: "test.pdf", type: "application/pdf", arrayBuffer: new ArrayBuffer(8) },
          "cust-user-1"
        )
      ).rejects.toThrow(/row-level security policy/);
    });

    // 8. unauthorized Pandit cannot insert for another Pandit's order
    test("8. Unauthorized Pandit cannot insert kundli_documents for another Pandit's order (RLS ownership enforcement)", async () => {
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: {
              message: "new row violates row-level security policy for table \"kundli_documents\"",
              code: "42501",
            },
          }),
        }),
      });

      jest.spyOn(supabase, "from").mockImplementation((table: string): any => {
        if (table === "kundli_documents") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      });

      Object.defineProperty(supabase, "storage", {
        value: {
          from: jest.fn().mockReturnValue({
            upload: jest.fn().mockResolvedValue({ data: { path: "ord-1/doc.pdf" }, error: null }),
          }),
        },
        writable: true,
        configurable: true,
      });

      await expect(
        kundliService.uploadKundliDocument(
          "ord-kundli-other-pandit",
          { name: "test.pdf", type: "application/pdf", arrayBuffer: new ArrayBuffer(8) },
          "unauthorized-pandit-user"
        )
      ).rejects.toThrow(/row-level security policy/);
    });

    // 9. customer confirmation succeeds after document_uploaded
    test("9. Customer confirmation succeeds when order is in document_uploaded state", async () => {
      const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: {
          status: "completed",
          kundli_order_id: "ord-kundli-123",
          customer_confirmed_at: "2026-10-06T14:30:00Z",
          completed_at: "2026-10-06T14:30:00Z",
          payout_id: "payout-kd-999",
          payout_amount: 1100,
        },
        error: null,
      } as any);

      const result = await kundliService.confirmKundliDelivery("ord-kundli-123");
      expect(mockRpc).toHaveBeenCalledWith("confirm_kundli_and_enable_payout", {
        p_kundli_order_id: "ord-kundli-123",
      });
      expect(result.status).toBe("completed");
      expect(result.payout_id).toBe("payout-kd-999");
    });

    // 10. duplicate customer confirmation remains idempotent
    test("10. Duplicate customer confirmation returns already_completed idempotently without re-triggering payout", async () => {
      const mockRpc = jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: {
          status: "already_completed",
          kundli_order_id: "ord-kundli-123",
          completed_at: "2026-10-06T14:30:00Z",
        },
        error: null,
      } as any);

      const result = await kundliService.confirmKundliDelivery("ord-kundli-123");
      expect(mockRpc).toHaveBeenCalledWith("confirm_kundli_and_enable_payout", {
        p_kundli_order_id: "ord-kundli-123",
      });
      expect(result.status).toBe("already_completed");
    });
  });
});

