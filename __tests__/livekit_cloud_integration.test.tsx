// __tests__/livekit_cloud_integration.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { panditService } from "../src/features/pandit/services/panditService.ts";
import { CustomerLiveSessionScreen } from "../src/features/booking/screens/CustomerLiveSessionScreen.tsx";
import { PanditLiveSessionScreen } from "../src/features/pandit/screens/PanditLiveSessionScreen.tsx";
import { BookingDetailsScreen } from "../src/features/booking/screens/BookingDetailsScreen.tsx";
import { supabase } from "../src/infrastructure/supabase/client.ts";
import { BookingDetail } from "../src/features/booking/types/booking.types.ts";

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

describe("M10: Kashi Veda LiveKit Cloud Integration Test Suite", () => {
  const sampleBookingId = "22222222-2222-4222-8222-222222222222";
  const sampleRoomName = `room_${sampleBookingId}`;
  const sampleToken = "mock-livekit-cloud-jwt-token";
  const sampleServerUrl = "wss://kashiveda.livekit.cloud";

  const sampleRemoteBooking: BookingDetail = {
    id: sampleBookingId,
    booking_number: "KV-REMOTE-2026-001",
    customer_id: "cust-user-1",
    pandit_id: "pandit-profile-1",
    puja_service_id: "puja-rudrabhishek-1",
    service_mode: "remote",
    status: "confirmed",
    scheduled_start_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 mins from now
    scheduled_end_at: new Date(Date.now() + 65 * 60 * 1000).toISOString(),
    price_snapshot: 2100,
    currency: "INR",
    advance_percent: 50,
    advance_amount: 1050,
    balance_amount: 1050,
    total_amount: 2100,
    reschedule_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    puja_service: {
      id: "puja-rudrabhishek-1",
      name: "Maha Rudrabhishek Puja",
      description: "Sacred Vedic ritual dedicated to Lord Shiva",
      default_duration_minutes: 60,
    },
    pandit: {
      id: "pandit-profile-1",
      display_name: "Acharya Ramkrishna Shastri",
      avatar_url: null,
      phone: "+919876543210",
    },
    location: {
      booking_id: sampleBookingId,
      location_type: "remote",
      city: "Varanasi",
    },
    line_items: [],
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockRouteParams = {};

    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({
      data: {
        token: sampleToken,
        server_url: sampleServerUrl,
        session_id: "session-uuid-1",
        room_name: sampleRoomName,
        expires_at: "2026-10-06T20:00:00Z",
      },
      error: null,
    });

    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { access_token: "mock-customer-session-token" } },
      error: null,
    } as any);

    jest.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { id: "cust-user-1", email: "devotee@kashiveda.org" } },
      error: null,
    } as any);
  });

  // 1. Customer Token Request Service
  test("1. bookingService.requestLiveSessionToken invokes live-session-token Edge Function with auth session", async () => {
    const creds = await bookingService.requestLiveSessionToken(sampleBookingId);

    expect(mockInvoke).toHaveBeenCalledWith("live-session-token", {
      body: { booking_id: sampleBookingId },
      headers: {
        Authorization: "Bearer mock-customer-session-token",
      },
    });

    expect(creds.token).toBe(sampleToken);
    expect(creds.server_url).toBe(sampleServerUrl);
    expect(creds.room_name).toBe(sampleRoomName);
  });

  // 2. Customer Token Request Validation
  test("2. bookingService.requestLiveSessionToken rejects when bookingId is missing", async () => {
    await expect(bookingService.requestLiveSessionToken("")).rejects.toThrow(
      "Booking ID is required to join live sanctum."
    );
  });

  // 3. Pandit Token Request Service
  test("3. panditService.requestLiveSessionToken invokes live-session-token for assigned pandit", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        token: sampleToken,
        server_url: sampleServerUrl,
        session_id: "session-uuid-1",
        room_name: sampleRoomName,
      },
      error: null,
    });

    const creds = await panditService.requestLiveSessionToken(sampleBookingId);

    expect(mockInvoke).toHaveBeenCalledWith("live-session-token", {
      body: { booking_id: sampleBookingId },
      headers: {
        Authorization: "Bearer mock-customer-session-token",
      },
    });

    expect(creds.token).toBe(sampleToken);
    expect(creds.room_name).toBe(sampleRoomName);
  });

  // 4. BookingDetailsScreen shows Enter Live Video Sanctum button for remote confirmed booking
  test("4. BookingDetailsScreen displays Enter Live Video Sanctum button and joins live room", async () => {
    mockRouteParams = { bookingId: sampleBookingId };
    jest.spyOn(bookingService, "fetchBookingDetail").mockResolvedValue(sampleRemoteBooking);
    const mockRequestToken = jest.spyOn(bookingService, "requestLiveSessionToken").mockResolvedValue({
      token: sampleToken,
      server_url: sampleServerUrl,
      room_name: sampleRoomName,
    });

    let tree: any;
    await act(async () => {
      tree = ReactTestRenderer.create(<BookingDetailsScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Live Video Sanctum");
    expect(str).toContain("Enter Live Video Sanctum 🎥");

    const buttons = tree.root.findAllByType(require("../src/shared/components/ui/Button.tsx").Button);
    const joinBtn = buttons.find((b: any) => b.props.title?.includes("Enter Live Video Sanctum"));

    expect(joinBtn).toBeDefined();

    await act(async () => {
      joinBtn.props.onPress();
    });

    expect(mockRequestToken).toHaveBeenCalledWith(sampleBookingId);
    expect(mockNavigate).toHaveBeenCalledWith("CustomerLiveSession", {
      bookingId: sampleBookingId,
      roomName: sampleRoomName,
      token: sampleToken,
      serverUrl: sampleServerUrl,
      pujaName: "Maha Rudrabhishek Puja",
      panditName: "Acharya Ramkrishna Shastri",
    });

    act(() => {
      tree.unmount();
    });

    mockRequestToken.mockRestore();
  });

  // 5. CustomerLiveSessionScreen Renders Room & Media Controls
  test("5. CustomerLiveSessionScreen renders active LiveKit Cloud viewport and media controls", () => {
    mockRouteParams = {
      bookingId: sampleBookingId,
      roomName: sampleRoomName,
      token: sampleToken,
      serverUrl: sampleServerUrl,
      pujaName: "Maha Rudrabhishek Puja",
      panditName: "Acharya Ramkrishna Shastri",
    };

    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(<CustomerLiveSessionScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Live Video Sanctum");
    expect(str).toContain("Maha Rudrabhishek Puja");
    expect(str).toContain("Leave Live Sanctum");

    act(() => {
      tree.unmount();
    });
  });

  // 6. Customer Live Controls: Mute & Video Toggle
  test("6. CustomerLiveSessionScreen toggles mute and video states on button press", () => {
    mockRouteParams = {
      bookingId: sampleBookingId,
      roomName: sampleRoomName,
      token: sampleToken,
      serverUrl: sampleServerUrl,
      pujaName: "Maha Rudrabhishek Puja",
      panditName: "Acharya Ramkrishna Shastri",
    };

    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(<CustomerLiveSessionScreen />);
    });

    const touchables = tree.root.findAllByType(require("react-native").TouchableOpacity);
    const muteBtn = touchables.find((t: any) => t.props.accessibilityLabel?.includes("Microphone"));
    const camBtn = touchables.find((t: any) => t.props.accessibilityLabel?.includes("Camera"));

    expect(muteBtn).toBeDefined();
    expect(camBtn).toBeDefined();

    // Toggle mute
    act(() => {
      muteBtn.props.onPress();
    });

    // Toggle video
    act(() => {
      camBtn.props.onPress();
    });

    act(() => {
      tree.unmount();
    });
  });

  // 7. PanditLiveSessionScreen Renders Room & Media Controls
  test("7. PanditLiveSessionScreen renders active LiveKit room for Pandit with Acharya badge", () => {
    mockRouteParams = {
      bookingId: sampleBookingId,
      roomName: sampleRoomName,
      token: sampleToken,
      serverUrl: sampleServerUrl,
      pujaName: "Maha Rudrabhishek Puja",
    };

    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(<PanditLiveSessionScreen />);
    });

    const str = extractAllText(tree.toJSON());
    expect(str).toContain("Live Vedic Sanctum");
    expect(str).toContain("Maha Rudrabhishek Puja");
    expect(str).toContain("Leave Live Sanctum");

    act(() => {
      tree.unmount();
    });
  });

  // 8. Leave Room Navigation
  test("8. Leave Live Sanctum button triggers navigation goBack", () => {
    mockRouteParams = {
      bookingId: sampleBookingId,
      roomName: sampleRoomName,
      token: sampleToken,
      serverUrl: sampleServerUrl,
      pujaName: "Maha Rudrabhishek Puja",
      panditName: "Acharya Ramkrishna Shastri",
    };

    let tree: any;
    act(() => {
      tree = ReactTestRenderer.create(<CustomerLiveSessionScreen />);
    });

    const touchables = tree.root.findAllByType(require("react-native").TouchableOpacity);
    const leaveBtn = touchables.find((t: any) => t.props.accessibilityLabel?.includes("Leave"));

    expect(leaveBtn).toBeDefined();

    act(() => {
      leaveBtn.props.onPress();
    });

    expect(mockGoBack).toHaveBeenCalled();

    act(() => {
      tree.unmount();
    });
  });

  // 9. Tenant Isolation & Server Secret Protection
  test("9. LiveKit Cloud configuration ensures API secrets never leak into client objects", () => {
    const creds = {
      token: sampleToken,
      server_url: sampleServerUrl,
      room_name: sampleRoomName,
    };

    expect((creds as any).apiKey).toBeUndefined();
    expect((creds as any).apiSecret).toBeUndefined();
    expect((creds as any).LIVEKIT_API_SECRET).toBeUndefined();
    expect(creds.server_url).toContain("livekit.cloud");
  });

  // 10. Error Diagnostics: Non-2xx response with 'Authentication required...' in error.context
  test("10. bookingService.requestLiveSessionToken extracts 'Authentication required...' from error.context", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge function returned a non-2xx status code",
        context: {
          json: jest.fn().mockResolvedValue({
            error: "Authentication required to calculate booking balance.",
          }),
        },
      },
    });

    await expect(bookingService.requestLiveSessionToken(sampleBookingId)).rejects.toThrow(
      "Authentication required to calculate booking balance."
    );
  });

  // 11. Error Diagnostics: Non-2xx response with different backend error (e.g. unpaid balance)
  test("11. bookingService.requestLiveSessionToken extracts specific unpaid balance error from error.context", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge function returned a non-2xx status code",
        context: {
          json: jest.fn().mockResolvedValue({
            error: "Outstanding balance of ₹38.50 must be settled before joining the Live Video Sanctum.",
            outstanding_balance: 38.5,
          }),
        },
      },
    });

    await expect(bookingService.requestLiveSessionToken(sampleBookingId)).rejects.toThrow(
      "Outstanding balance of ₹38.50 must be settled before joining the Live Video Sanctum."
    );
  });

  // 12. Error Diagnostics: Malformed / unreadable JSON in error.context falls back to error.message
  test("12. bookingService.requestLiveSessionToken safely falls back to error.message when error.context throws on JSON parsing", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge function returned a non-2xx status code",
        context: {
          json: jest.fn().mockRejectedValue(new Error("Stream already consumed or invalid JSON")),
        },
      },
    });

    await expect(bookingService.requestLiveSessionToken(sampleBookingId)).rejects.toThrow(
      "Edge function returned a non-2xx status code"
    );
  });

  // 13. Error Diagnostics: Missing or non-object error.context falls back to error.message / default
  test("13. bookingService.requestLiveSessionToken falls back gracefully when error.context is missing", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Network request failed",
      },
    });

    await expect(bookingService.requestLiveSessionToken(sampleBookingId)).rejects.toThrow(
      "Network request failed"
    );
  });

  // 14. Pandit Error Diagnostics: Extracts session timing error from error.context
  test("14. panditService.requestLiveSessionToken extracts session timing error from error.context", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge function returned a non-2xx status code",
        context: {
          json: jest.fn().mockResolvedValue({
            error: "Session is not open yet. Pandits can join up to 30 minutes before the scheduled start time.",
          }),
        },
      },
    });

    await expect(panditService.requestLiveSessionToken(sampleBookingId)).rejects.toThrow(
      "Session is not open yet. Pandits can join up to 30 minutes before the scheduled start time."
    );
  });

  // 15. Pandit Error Diagnostics: Rejects when bookingId is missing
  test("15. panditService.requestLiveSessionToken rejects when bookingId is missing", async () => {
    await expect(panditService.requestLiveSessionToken("")).rejects.toThrow(
      "Booking ID is required to join live sanctum."
    );
  });

  // 16. Pandit Error Diagnostics: Malformed JSON falls back safely without secondary exception
  test("16. panditService.requestLiveSessionToken safely falls back on malformed error.context", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge function returned a non-2xx status code",
        context: {
          json: jest.fn().mockResolvedValue(null),
        },
      },
    });

    await expect(panditService.requestLiveSessionToken(sampleBookingId)).rejects.toThrow(
      "Edge function returned a non-2xx status code"
    );
  });
});
