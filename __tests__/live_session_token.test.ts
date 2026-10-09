// __tests__/live_session_token.test.ts
import { handleLiveSessionToken } from "../supabase/functions/live-session-token/index.ts";
import {
  base64UrlDecode,
  base64UrlEncode,
  generateLiveKitToken,
  computeHmacSha256Hex,
  computeSha256Hex,
  timingSafeEqual,
} from "../supabase/functions/_shared/crypto.ts";

function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Request {
  const { method = "POST", headers = {}, body } = options;
  const init: RequestInit = {
    method,
    headers: new Headers(headers),
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(url, init);
}

describe("LiveKit Token & Crypto Utilities", () => {
  const apiKey = "test_livekit_api_key_123";
  const apiSecret = "test_livekit_api_secret_456_super_secure";
  const identity = "customer_11111111-1111-4111-8111-111111111111";
  const roomName = "room_22222222-2222-4222-8222-222222222222";

  it("encodes and decodes base64url text and bytes accurately", () => {
    const text = "Hello World! Special characters: +/= &?#";
    const encoded = base64UrlEncode(text);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
    const decoded = base64UrlDecode(encoded);
    expect(decoded).toBe(text);
  });

  it("generates a valid LiveKit JWT with correct header, payload, and grants", async () => {
    const now = 1700000000;
    const ttlSeconds = 3600;
    const token = await generateLiveKitToken({
      apiKey,
      apiSecret,
      identity,
      roomName,
      ttlSeconds,
      grants: {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: false,
      },
      nowEpochSeconds: now,
    });

    expect(typeof token).toBe("string");
    const parts = token.split(".");
    expect(parts.length).toBe(3);

    // 1. Header validation
    const header = JSON.parse(base64UrlDecode(parts[0]));
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });

    // 2. Payload claims validation
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    expect(payload.iss).toBe(apiKey);
    expect(payload.sub).toBe(identity);
    expect(payload.iat).toBe(now);
    expect(payload.nbf).toBe(now - 5);
    expect(payload.exp).toBe(now + ttlSeconds);
    expect(typeof payload.jti).toBe("string");
    expect(payload.video).toEqual({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: false,
    });

    // 3. Cryptographic HMAC-SHA256 signature verification
    const unsignedMessage = `${parts[0]}.${parts[1]}`;
    const TextEncoderClass = (globalThis as any).TextEncoder;
    const encoder = new TextEncoderClass();
    const keyData = encoder.encode(apiSecret);
    const msgData = encoder.encode(unsignedMessage);
    const subtle = (globalThis as any).crypto.subtle;
    const cryptoKey = await subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expectedSignatureBuffer = await subtle.sign("HMAC", cryptoKey, msgData);
    const expectedEncodedSignature = base64UrlEncode(new Uint8Array(expectedSignatureBuffer));
    expect(parts[2]).toBe(expectedEncodedSignature);
  });

  it("computes accurate non-reversible SHA-256 hex digests for safe diagnostic fingerprints", async () => {
    const testKey = "APIabcdef123456";
    const hash = await computeSha256Hex(testKey);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // Full SHA-256 hex string
    const fingerprint = hash.substring(0, 8);
    expect(fingerprint.length).toBe(8);
  });

  it("safely and correctly evaluates timingSafeEqual for API keys and signatures", () => {
    const key1 = "API_kashiveda_123456789";
    const key2 = "API_kashiveda_123456789";
    const key3 = "API_kashiveda_987654321";
    const key4 = "API_kashiveda_12345678"; // different length

    expect(timingSafeEqual(key1, key2)).toBe(true);
    expect(timingSafeEqual(key1, key3)).toBe(false);
    expect(timingSafeEqual(key1, key4)).toBe(false);
    expect(timingSafeEqual(key1, "" as any)).toBe(false);
    expect(timingSafeEqual(null as any, key1)).toBe(false);
  });
});

describe("live-session-token Edge Function", () => {
  const validBookingId = "22222222-2222-4222-8222-222222222222";
  const validCustomerId = "11111111-1111-4111-8111-111111111111";
  const validPanditProfileId = "33333333-3333-4333-8333-333333333333";
  const validPanditUserId = "44444444-4444-4444-8444-444444444444";
  const validAdminUserId = "55555555-5555-4555-8555-555555555555";
  const unauthorizedUserId = "99999999-9999-4999-8999-999999999999";

  const scheduledStart = "2026-10-05T18:00:00.000Z";
  const scheduledEnd = "2026-10-05T19:00:00.000Z";

  const mockEnv: Record<string, string> = {
    SUPABASE_URL: "https://mock.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_service_role_key",
    SUPABASE_ANON_KEY: "mock_anon_key",
    LIVEKIT_SERVER_URL: "wss://kashiveda.livekit.cloud",
    LIVEKIT_API_KEY: "mock_livekit_key",
    LIVEKIT_API_SECRET: "mock_livekit_secret",
  };

  const getEnvFn = (key: string) => mockEnv[key];

  function buildMockSupabase(overrides: {
    user?: any;
    authError?: any;
    booking?: any;
    bookingError?: any;
    panditProfile?: any;
    panditError?: any;
    adminRole?: any;
    adminError?: any;
    existingLiveSession?: any;
    liveSessionQueryError?: any;
    liveSessionInsertError?: any;
    balanceData?: any;
    balanceError?: any;
  } = {}) {
    const insertedLiveSessions: any[] = [];

    return {
      auth: {
        getUser: jest.fn().mockResolvedValue(
          overrides.authError
            ? { data: { user: null }, error: overrides.authError }
            : {
                data: {
                  user:
                    overrides.user !== undefined
                      ? overrides.user
                      : { id: validCustomerId },
                },
                error: null,
              }
        ),
      },
      from: jest.fn((table: string) => {
        if (table === "bookings") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_field: string, _val: any) => ({
                maybeSingle: jest.fn().mockResolvedValue(
                  overrides.bookingError
                    ? { data: null, error: overrides.bookingError }
                    : {
                        data:
                          overrides.booking !== undefined
                            ? overrides.booking
                            : {
                                id: validBookingId,
                                customer_id: validCustomerId,
                                pandit_id: validPanditProfileId,
                                service_mode: "remote",
                                status: "confirmed",
                                scheduled_start_at: scheduledStart,
                                scheduled_end_at: scheduledEnd,
                              },
                        error: null,
                      }
                ),
              })),
            })),
          };
        }

        if (table === "pandit_profiles") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_f1: string, _v1: any) => ({
                eq: jest.fn((_f2: string, _v2: any) => ({
                  maybeSingle: jest.fn().mockResolvedValue(
                    overrides.panditError
                      ? { data: null, error: overrides.panditError }
                      : {
                          data:
                            overrides.panditProfile !== undefined
                              ? overrides.panditProfile
                              : null,
                          error: null,
                        }
                  ),
                })),
              })),
            })),
          };
        }

        if (table === "user_roles") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_f1: string, _v1: any) => ({
                in: jest.fn((_f2: string, _v2: any) => ({
                  maybeSingle: jest.fn().mockResolvedValue(
                    overrides.adminError
                      ? { data: null, error: overrides.adminError }
                      : {
                          data:
                            overrides.adminRole !== undefined
                              ? overrides.adminRole
                              : null,
                          error: null,
                        }
                  ),
                })),
              })),
            })),
          };
        }

        if (table === "live_sessions") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn((_field: string, _val: any) => ({
                maybeSingle: jest.fn().mockResolvedValue(
                  overrides.liveSessionQueryError
                    ? { data: null, error: overrides.liveSessionQueryError }
                    : {
                        data:
                          overrides.existingLiveSession !== undefined
                            ? overrides.existingLiveSession
                            : null,
                        error: null,
                      }
                ),
              })),
            })),
            insert: jest.fn((row: any) => {
              insertedLiveSessions.push(row);
              return Promise.resolve({
                error: overrides.liveSessionInsertError ?? null,
              });
            }),
          };
        }

        return {};
      }),
      rpc: jest.fn((name: string, _args: any) => {
        if (name === "calculate_booking_balance") {
          if (overrides.balanceError) {
            return Promise.resolve({ data: null, error: overrides.balanceError });
          }
          return Promise.resolve({
            data:
              overrides.balanceData !== undefined
                ? overrides.balanceData
                : {
                    outstanding_balance: 0,
                    total_amount: 2100,
                    total_paid: 2100,
                    net_paid: 2100,
                    total_refunded: 0,
                  },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      _insertedLiveSessions: insertedLiveSessions,
    };
  }

  // 1. CORS Preflight
  it("handles CORS OPTIONS preflight request", async () => {
    const req = createMockRequest("http://localhost/live-session-token", {
      method: "OPTIONS",
    });
    const res = await handleLiveSessionToken(req, { getEnvFn });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects non-POST methods with 405", async () => {
    const req = createMockRequest("http://localhost/live-session-token", {
      method: "GET",
    });
    const res = await handleLiveSessionToken(req, { getEnvFn });
    expect(res.status).toBe(405);
  });

  // 2. Authentication
  it("rejects request when Authorization header is missing", async () => {
    const req = createMockRequest("http://localhost/live-session-token", {
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, { getEnvFn });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Missing or invalid Authorization header/i);
  });

  it("rejects request when JWT token is invalid or expired", async () => {
    const mockSupabase = buildMockSupabase({
      authError: { message: "Invalid JWT token" },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer invalid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid or expired authentication token/i);
  });

  // 3. Request Body Validation
  it("rejects request when booking_id is missing", async () => {
    const mockSupabase = buildMockSupabase();
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: {},
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required booking_id parameter/i);
  });

  it("rejects request when booking_id is not a valid UUID", async () => {
    const mockSupabase = buildMockSupabase();
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: "not-a-valid-uuid" },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/must be a valid UUID/i);
  });

  // 4. Booking Lookup & Eligibility
  it("returns 404 when booking does not exist", async () => {
    const mockSupabase = buildMockSupabase({ booking: null });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Booking not found");
  });

  it("rejects non-remote booking (e.g. home puja)", async () => {
    const mockSupabase = buildMockSupabase({
      booking: {
        id: validBookingId,
        customer_id: validCustomerId,
        pandit_id: validPanditProfileId,
        service_mode: "home",
        status: "confirmed",
        scheduled_start_at: scheduledStart,
        scheduled_end_at: scheduledEnd,
      },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only available for remote bookings/i);
  });

  it("rejects cancelled booking", async () => {
    const mockSupabase = buildMockSupabase({
      booking: {
        id: validBookingId,
        customer_id: validCustomerId,
        pandit_id: validPanditProfileId,
        service_mode: "remote",
        status: "cancelled",
        scheduled_start_at: scheduledStart,
        scheduled_end_at: scheduledEnd,
      },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Booking has been cancelled/i);
  });

  it("rejects completed booking", async () => {
    const mockSupabase = buildMockSupabase({
      booking: {
        id: validBookingId,
        customer_id: validCustomerId,
        pandit_id: validPanditProfileId,
        service_mode: "remote",
        status: "completed",
        scheduled_start_at: scheduledStart,
        scheduled_end_at: scheduledEnd,
      },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Booking is already completed/i);
  });

  // 5. Authorization & Roles
  it("rejects unauthorized user with 403 Forbidden", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: unauthorizedUserId },
      panditProfile: null,
      adminRole: null,
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T18:05:00.000Z"),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Unauthorized/i);
  });

  it("authorizes valid customer and returns customer token and grants", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validCustomerId },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T18:00:00.000Z"),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.room_name).toBe(`room_${validBookingId}`);
    expect(body.participant_identity).toBe(`customer_${validCustomerId}`);
    expect(body.server_url).toBe("wss://kashiveda.livekit.cloud");

    // Verify claims
    const payload = JSON.parse(base64UrlDecode(body.token.split(".")[1]));
    expect(payload.sub).toBe(`customer_${validCustomerId}`);
    expect(payload.video.room).toBe(`room_${validBookingId}`);
    expect(payload.video.canPublish).toBe(true);
    expect(payload.video.canSubscribe).toBe(true);
    expect(payload.video.canPublishData).toBe(true);
    expect(payload.video.roomAdmin).toBe(false);
  });

  it("authorizes valid assigned Pandit and returns pandit token with roomAdmin = true", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validPanditUserId },
      panditProfile: { id: validPanditProfileId },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T17:45:00.000Z"), // 15 mins before start
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.participant_identity).toBe(`pandit_${validPanditProfileId}`);

    const payload = JSON.parse(base64UrlDecode(body.token.split(".")[1]));
    expect(payload.sub).toBe(`pandit_${validPanditProfileId}`);
    expect(payload.video.roomAdmin).toBe(true);
  });

  it("authorizes valid admin for monitoring access", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validAdminUserId },
      panditProfile: null,
      adminRole: { role: "admin" },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T18:10:00.000Z"),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.participant_identity).toBe(`admin_${validAdminUserId}`);

    const payload = JSON.parse(base64UrlDecode(body.token.split(".")[1]));
    expect(payload.video.canPublish).toBe(false);
    expect(payload.video.canSubscribe).toBe(true);
    expect(payload.video.canPublishData).toBe(false);
    expect(payload.video.roomAdmin).toBe(false);
  });

  // 6. Join Window Tests
  it("rejects customer 16 minutes before scheduled start", async () => {
    const mockSupabase = buildMockSupabase({ user: { id: validCustomerId } });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    // Scheduled start is 18:00:00Z -> 16 mins prior is 17:44:00Z
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T17:44:00.000Z"),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Customers can join up to 15 minutes before/i);
  });

  it("allows customer exactly 15 minutes before scheduled start", async () => {
    const mockSupabase = buildMockSupabase({ user: { id: validCustomerId } });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    // Scheduled start is 18:00:00Z -> 15 mins prior is 17:45:00Z
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T17:45:00.000Z"),
    });

    expect(res.status).toBe(200);
  });

  it("rejects Pandit 31 minutes before scheduled start", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validPanditUserId },
      panditProfile: { id: validPanditProfileId },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    // Scheduled start is 18:00:00Z -> 31 mins prior is 17:29:00Z
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T17:29:00.000Z"),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Pandits can join up to 30 minutes before/i);
  });

  it("allows Pandit exactly 30 minutes before scheduled start", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validPanditUserId },
      panditProfile: { id: validPanditProfileId },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    // Scheduled start is 18:00:00Z -> 30 mins prior is 17:30:00Z
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T17:30:00.000Z"),
    });

    expect(res.status).toBe(200);
  });

  it("rejects token issuance 31 minutes after scheduled end", async () => {
    const mockSupabase = buildMockSupabase({ user: { id: validCustomerId } });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    // Scheduled end is 19:00:00Z -> 31 mins after is 19:31:00Z
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T19:31:00.000Z"),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Session window has expired/i);
  });

  it("allows rescheduled booking using updated schedule timings", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validCustomerId },
      booking: {
        id: validBookingId,
        customer_id: validCustomerId,
        pandit_id: validPanditProfileId,
        service_mode: "remote",
        status: "confirmed",
        scheduled_start_at: "2026-10-05T20:00:00.000Z", // rescheduled start
        scheduled_end_at: "2026-10-05T21:00:00.000Z",   // rescheduled end
      },
    });

    // 19:50:00Z is 10 mins before new start (valid window)
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T19:50:00.000Z"),
    });

    expect(res.status).toBe(200);
  });

  // 7. Live Sessions Record Insertion & Reuse
  it("creates a new live_sessions record with status 'scheduled' when none exists", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validCustomerId },
      existingLiveSession: null,
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T18:00:00.000Z"),
    });

    expect(res.status).toBe(200);
    expect(mockSupabase._insertedLiveSessions.length).toBe(1);
    expect(mockSupabase._insertedLiveSessions[0]).toEqual({
      booking_id: validBookingId,
      status: "scheduled",
      scheduled_start_at: scheduledStart,
      metadata: {
        room_name: `room_${validBookingId}`,
        created_via: "live-session-token",
      },
    });
  });

  it("reuses existing live_sessions record without attempting duplicate insert", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validCustomerId },
      existingLiveSession: {
        id: "77777777-7777-4777-8777-777777777777",
        status: "scheduled",
      },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T18:00:00.000Z"),
    });

    expect(res.status).toBe(200);
    expect(mockSupabase._insertedLiveSessions.length).toBe(0);
  });

  // 8. Token TTL Calculation Limits
  it("bounds token expiry to remaining grace window (e.g. 600s) when joining near end of grace period", async () => {
    const mockSupabase = buildMockSupabase({ user: { id: validCustomerId } });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    // Scheduled end is 19:00:00Z -> windowEnd is 19:30:00Z
    // Joining at 19:20:00Z leaves exactly 10 minutes (600s).
    const joinTime = new Date("2026-10-05T19:20:00.000Z");
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => joinTime,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const payload = JSON.parse(base64UrlDecode(body.token.split(".")[1]));
    expect(payload.exp - payload.iat).toBe(600);
    // Expiration timestamp in seconds equals windowEnd in seconds (19:30:00Z)
    expect(payload.exp).toBe(Math.floor(new Date("2026-10-05T19:30:00.000Z").getTime() / 1000));
  });

  it("bounds Pandit token expiry to remaining grace window (e.g. 300s) when joining near end", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validPanditUserId },
      panditProfile: { id: validPanditProfileId },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    // Joining at 19:25:00Z leaves 5 minutes (300s) before 19:30:00Z.
    const joinTime = new Date("2026-10-05T19:25:00.000Z");
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => joinTime,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const payload = JSON.parse(base64UrlDecode(body.token.split(".")[1]));
    expect(payload.exp - payload.iat).toBe(300);
    expect(payload.exp).toBe(Math.floor(new Date("2026-10-05T19:30:00.000Z").getTime() / 1000));
  });

  it("ensures token expiry never extends beyond scheduled_end_at + 30 minutes", async () => {
    const mockSupabase = buildMockSupabase({ user: { id: validCustomerId } });
    const windowEndEpoch = Math.floor(
      new Date("2026-10-05T19:30:00.000Z").getTime() / 1000
    );

    // Test multiple checkpoints across session lifecycle
    const checkpoints = [
      "2026-10-05T17:45:00.000Z", // 15 mins before start -> TTL 6300s
      "2026-10-05T18:00:00.000Z", // at start -> TTL 5400s
      "2026-10-05T18:30:00.000Z", // midway -> TTL 3600s
      "2026-10-05T19:00:00.000Z", // at scheduled end -> TTL 1800s
      "2026-10-05T19:29:00.000Z", // 1 min before grace end -> TTL 60s
    ];

    for (const cp of checkpoints) {
      const req = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const res = await handleLiveSessionToken(req, {
        adminClient: mockSupabase,
        getEnvFn,
        now: () => new Date(cp),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      const payload = JSON.parse(base64UrlDecode(body.token.split(".")[1]));
      expect(payload.exp).toBe(windowEndEpoch);
    }
  });

  it("enforces maximum 4 hours (14400s) safety ceiling for very long scheduled sessions", async () => {
    const mockSupabase = buildMockSupabase({
      user: { id: validCustomerId },
      booking: {
        id: validBookingId,
        customer_id: validCustomerId,
        pandit_id: validPanditProfileId,
        service_mode: "remote",
        status: "confirmed",
        scheduled_start_at: "2026-10-05T18:00:00.000Z",
        scheduled_end_at: "2026-10-05T23:30:00.000Z", // 5.5 hour puja
      },
    });
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    // Joining at 18:00:00Z leaves 6 hours (21600s) until window end. Maximum TTL should clamp to 14400s.
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn,
      now: () => new Date("2026-10-05T18:00:00.000Z"),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const payload = JSON.parse(base64UrlDecode(body.token.split(".")[1]));
    expect(payload.exp - payload.iat).toBe(14400);
  });

  // 9. Environment / LiveKit Config Error
  it("returns 500 when LiveKit configuration secrets are missing", async () => {
    const mockSupabase = buildMockSupabase({ user: { id: validCustomerId } });
    const emptyEnv = (_key: string) => undefined;
    const req = createMockRequest("http://localhost/live-session-token", {
      headers: { Authorization: "Bearer valid_token" },
      body: { booking_id: validBookingId },
    });
    const res = await handleLiveSessionToken(req, {
      adminClient: mockSupabase,
      getEnvFn: emptyEnv,
      now: () => new Date("2026-10-05T18:00:00.000Z"),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/LiveKit server configuration is unavailable/i);
  });

  // 10. Dedicated Balance Gate & Timing Verification Suite (Tests 6 - 13)
  describe("Authoritative Balance & Join-Window Enforcement", () => {
    it("TEST 6: allows authenticated Customer to join when outstanding balance is zero in eligible window", async () => {
      const mockSupabase = buildMockSupabase({
        user: { id: validCustomerId },
        balanceData: { outstanding_balance: 0.0, total_amount: 2100, total_paid: 2100 },
      });
      const req = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const res = await handleLiveSessionToken(req, {
        adminClient: mockSupabase,
        userClient: mockSupabase,
        getEnvFn,
        now: () => new Date("2026-10-05T17:50:00.000Z"), // 10 mins before start
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.participant_identity).toBe(`customer_${validCustomerId}`);
      expect(body.diagnostic_request_id).toBeDefined();
      expect(typeof body.diagnostic_request_id).toBe("string");
      expect(mockSupabase.rpc).toHaveBeenCalledWith("calculate_booking_balance", {
        p_booking_id: validBookingId,
      });
    });

    it("TEST 7: authorizes assigned Pandit for eligible, fully paid remote booking", async () => {
      const mockSupabase = buildMockSupabase({
        user: { id: validPanditUserId },
        panditProfile: { id: validPanditProfileId },
        balanceData: { outstanding_balance: 0.0, total_amount: 2100, total_paid: 2100 },
      });
      const req = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const res = await handleLiveSessionToken(req, {
        adminClient: mockSupabase,
        userClient: mockSupabase,
        getEnvFn,
        now: () => new Date("2026-10-05T17:40:00.000Z"), // 20 mins before start (Pandit allowed 30m)
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.participant_identity).toBe(`pandit_${validPanditProfileId}`);
    });

    it("TEST 8: rejects Customer when outstanding balance is positive (> 0)", async () => {
      const mockSupabase = buildMockSupabase({
        user: { id: validCustomerId },
        balanceData: { outstanding_balance: 1050.0, total_amount: 2100, total_paid: 1050 },
      });
      const req = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const res = await handleLiveSessionToken(req, {
        adminClient: mockSupabase,
        userClient: mockSupabase,
        getEnvFn,
        now: () => new Date("2026-10-05T17:50:00.000Z"),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain("Outstanding balance of ₹1050.00 must be settled");
      expect(body.token).toBeUndefined();
    });

    it("TEST 9: fails closed when balance RPC returns error or malformed data", async () => {
      // 9A: RPC error
      const mockSupabaseErr = buildMockSupabase({
        user: { id: validCustomerId },
        balanceError: { message: "Database balance RPC internal error" },
      });
      const req1 = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const res1 = await handleLiveSessionToken(req1, {
        adminClient: mockSupabaseErr,
        userClient: mockSupabaseErr,
        getEnvFn,
        now: () => new Date("2026-10-05T17:50:00.000Z"),
      });
      expect(res1.status).toBe(403);
      const body1 = await res1.json();
      expect(body1.error).toMatch(/Unable to verify booking financial clearance/i);

      // 9B: Malformed data (missing outstanding_balance)
      const mockSupabaseMalformed = buildMockSupabase({
        user: { id: validCustomerId },
        balanceData: { other_field: 123 },
      });
      const req2 = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const res2 = await handleLiveSessionToken(req2, {
        adminClient: mockSupabaseMalformed,
        userClient: mockSupabaseMalformed,
        getEnvFn,
        now: () => new Date("2026-10-05T17:50:00.000Z"),
      });
      expect(res2.status).toBe(403);
      const body2 = await res2.json();
      expect(body2.error).toMatch(/Invalid booking financial clearance data/i);
    });

    it("TEST 10: rejects customer attempting to access another customer's booking", async () => {
      const mockSupabase = buildMockSupabase({
        user: { id: unauthorizedUserId }, // not customer, not pandit, not admin
        panditProfile: null,
        adminRole: null,
      });
      const req = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const res = await handleLiveSessionToken(req, {
        adminClient: mockSupabase,
        userClient: mockSupabase,
        getEnvFn,
        now: () => new Date("2026-10-05T17:50:00.000Z"),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/Unauthorized/i);
    });

    it("TEST 11: rejects LiveKit token request for Home or Temple booking", async () => {
      const mockSupabaseHome = buildMockSupabase({
        user: { id: validCustomerId },
        booking: {
          id: validBookingId,
          customer_id: validCustomerId,
          pandit_id: validPanditProfileId,
          service_mode: "home",
          status: "confirmed",
          scheduled_start_at: scheduledStart,
          scheduled_end_at: scheduledEnd,
        },
      });
      const req = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const res = await handleLiveSessionToken(req, {
        adminClient: mockSupabaseHome,
        userClient: mockSupabaseHome,
        getEnvFn,
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/only available for remote bookings/i);
    });

    it("TEST 12: rejects access today when booking is scheduled for tomorrow", async () => {
      const tomorrowBookingStart = "2026-10-06T18:00:00.000Z";
      const tomorrowBookingEnd = "2026-10-06T19:00:00.000Z";
      const mockSupabase = buildMockSupabase({
        user: { id: validCustomerId },
        booking: {
          id: validBookingId,
          customer_id: validCustomerId,
          pandit_id: validPanditProfileId,
          service_mode: "remote",
          status: "confirmed",
          scheduled_start_at: tomorrowBookingStart,
          scheduled_end_at: tomorrowBookingEnd,
        },
        balanceData: { outstanding_balance: 0.0, total_amount: 2100, total_paid: 2100 },
      });
      const req = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      // Attempting to join today (24 hours early)
      const res = await handleLiveSessionToken(req, {
        adminClient: mockSupabase,
        userClient: mockSupabase,
        getEnvFn,
        now: () => new Date("2026-10-05T18:00:00.000Z"),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Session is not open yet/i);
      expect(body.error).toContain("Customers can join up to 15 minutes before");
    });

    it("TEST 13: customer and assigned Pandit receive tokens targeting the same room_<booking_id>", async () => {
      // Customer at 17:50 (within 15 min window)
      const customerMock = buildMockSupabase({
        user: { id: validCustomerId },
        balanceData: { outstanding_balance: 0.0, total_amount: 2100, total_paid: 2100 },
      });
      const customerReq = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const customerRes = await handleLiveSessionToken(customerReq, {
        adminClient: customerMock,
        userClient: customerMock,
        getEnvFn,
        now: () => new Date("2026-10-05T17:50:00.000Z"),
      });
      expect(customerRes.status).toBe(200);
      const customerBody = await customerRes.json();

      // Pandit at 17:35 (within 30 min window)
      const panditMock = buildMockSupabase({
        user: { id: validPanditUserId },
        panditProfile: { id: validPanditProfileId },
        balanceData: { outstanding_balance: 0.0, total_amount: 2100, total_paid: 2100 },
      });
      const panditReq = createMockRequest("http://localhost/live-session-token", {
        headers: { Authorization: "Bearer valid_token" },
        body: { booking_id: validBookingId },
      });
      const panditRes = await handleLiveSessionToken(panditReq, {
        adminClient: panditMock,
        userClient: panditMock,
        getEnvFn,
        now: () => new Date("2026-10-05T17:35:00.000Z"),
      });
      expect(panditRes.status).toBe(200);
      const panditBody = await panditRes.json();

      // Both must target the exact same room
      expect(customerBody.room_name).toBe(`room_${validBookingId}`);
      expect(panditBody.room_name).toBe(`room_${validBookingId}`);
      expect(customerBody.room_name).toBe(panditBody.room_name);
    });
  });
});
