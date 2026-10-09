import { corsHeaders, jsonResponse } from "../_shared/response.ts";
import {
  getEnv,
  getSupabaseAdminClient,
  getSupabaseUserClient,
} from "../_shared/supabase.ts";
import {
  base64UrlDecode,
  computeSha256Hex,
  generateLiveKitToken,
  LiveKitTokenParams,
  LiveKitVideoGrants,
  timingSafeEqual,
} from "../_shared/crypto.ts";
import { logger } from "../_shared/logger.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_TTL_SECONDS = 14400; // 4 hours maximum safety ceiling

export interface LiveSessionTokenDependencies {
  adminClient?: any;
  userClient?: any;
  getEnvFn?: (key: string) => string | undefined;
  tokenGeneratorFn?: (params: LiveKitTokenParams) => Promise<string>;
  now?: () => Date;
}

/**
 * Supabase Edge Function: live-session-token
 * Authenticates user, verifies Remote Puja booking eligibility, enforces join windows,
 * manages the public.live_sessions database record, and mints an authorized LiveKit Cloud access token.
 */
export async function handleLiveSessionToken(
  req: Request,
  deps: LiveSessionTokenDependencies = {}
): Promise<Response> {
  const diagnosticRequestId = `diag_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const envGetter = deps.getEnvFn ?? getEnv;
  const tokenGenerator = deps.tokenGeneratorFn ?? generateLiveKitToken;
  const getNow = deps.now ?? (() => new Date());

  // 2. Require valid Supabase JWT before accessing backend resources
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  const jwtToken = authHeader.substring(7).trim();
  if (!jwtToken) {
    return jsonResponse({ error: "Missing authentication token" }, 401);
  }

  // 3. Resolve Admin Client for authoritative database access
  let adminClient: any;
  try {
    adminClient = deps.adminClient ?? (await getSupabaseAdminClient(envGetter));
  } catch (clientErr: any) {
    logger.error("Failed to initialize database client", {
      functionName: "live-session-token",
      diagnosticRequestId,
      error: clientErr?.message,
    });
    return jsonResponse({ error: "Internal configuration error" }, 500);
  }

  let authUserId: string;
  try {
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(jwtToken);

    if (authError || !user?.id) {
      return jsonResponse({ error: "Invalid or expired authentication token" }, 401);
    }
    authUserId = user.id;
  } catch (authErr: any) {
    logger.error("Authentication validation threw an unexpected error", {
      functionName: "live-session-token",
      diagnosticRequestId,
      error: authErr?.message,
    });
    return jsonResponse({ error: "Authentication service unavailable" }, 401);
  }

  // 3.1 Resolve User Client for user-scoped operations (e.g. calculate_booking_balance)
  let userClient: any;
  try {
    if (deps.userClient) {
      userClient = deps.userClient;
    } else if (deps.adminClient && typeof deps.adminClient.rpc === "function") {
      userClient = deps.adminClient;
    } else {
      userClient = await getSupabaseUserClient(authHeader, envGetter);
    }
  } catch (userClientErr: any) {
    logger.warn("Could not initialize user-scoped database client", {
      functionName: "live-session-token",
      diagnosticRequestId,
      error: userClientErr?.message,
    });
  }

  // 4. Parse and validate request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON request body" }, 400);
  }

  const bookingId = body?.booking_id;
  if (!bookingId || typeof bookingId !== "string" || !bookingId.trim()) {
    return jsonResponse({ error: "Missing required booking_id parameter" }, 400);
  }

  const sanitizedBookingId = bookingId.trim();
  if (!UUID_REGEX.test(sanitizedBookingId)) {
    return jsonResponse(
      { error: "Invalid booking_id format; must be a valid UUID" },
      400
    );
  }

  // 5. Verify LiveKit server environment configuration & log diagnostics
  const denoDeploymentId =
    envGetter("DENO_DEPLOYMENT_ID") ||
    envGetter("DENO_REGION") ||
    "local_or_unspecified";
  const rawSupabaseUrl = envGetter("SUPABASE_URL") || "";
  let supabaseHost = "unknown";
  if (rawSupabaseUrl) {
    try {
      supabaseHost = new URL(rawSupabaseUrl.trim()).host;
    } catch {
      supabaseHost = rawSupabaseUrl.trim().split("/")[2] || "malformed_url";
    }
  }

  const rawServerUrl = envGetter("LIVEKIT_SERVER_URL");
  const rawApiKey = envGetter("LIVEKIT_API_KEY");
  const rawApiSecret = envGetter("LIVEKIT_API_SECRET");

  const hasServerUrl = Boolean(rawServerUrl && rawServerUrl.trim().length > 0);
  const hasApiKey = Boolean(rawApiKey && rawApiKey.trim().length > 0);
  const hasApiSecret = Boolean(rawApiSecret && rawApiSecret.trim().length > 0);

  let parsedScheme = "unknown";
  let parsedHost = "unknown";
  if (rawServerUrl) {
    try {
      const parsedUrl = new URL(rawServerUrl.trim());
      parsedScheme = parsedUrl.protocol;
      parsedHost = parsedUrl.host;
    } catch {
      parsedHost = rawServerUrl.trim().split("/")[2] || rawServerUrl.trim();
    }
  }

  const apiKeyWhitespace = Boolean(rawApiKey && rawApiKey !== rawApiKey.trim());
  const apiSecretWhitespace = Boolean(rawApiSecret && rawApiSecret !== rawApiSecret.trim());
  const serverUrlWhitespace = Boolean(rawServerUrl && rawServerUrl !== rawServerUrl.trim());

  const serverUrl = rawServerUrl?.trim() ?? "";
  const apiKey = rawApiKey?.trim() ?? "";
  const apiSecret = rawApiSecret?.trim() ?? "";

  let keyFingerprint = "";
  let secretFingerprint = "";
  if (apiKey) {
    try {
      const hash = await computeSha256Hex(apiKey);
      keyFingerprint = hash.substring(0, 8);
    } catch {
      keyFingerprint = "unavailable";
    }
  }
  if (apiSecret) {
    try {
      const hash = await computeSha256Hex(apiSecret);
      secretFingerprint = hash.substring(0, 8);
    } catch {
      secretFingerprint = "unavailable";
    }
  }

  logger.info("LiveKit server environment diagnostic check", {
    functionName: "live-session-token",
    diagnosticRequestId,
    denoDeploymentId,
    supabaseHost,
    hasServerUrl,
    hasApiKey,
    hasApiSecret,
    serverScheme: parsedScheme,
    serverHost: parsedHost,
    apiKeyLength: apiKey.length,
    apiSecretLength: apiSecret.length,
    apiKeyHasWhitespace: apiKeyWhitespace,
    apiSecretHasWhitespace: apiSecretWhitespace,
    serverUrlHasWhitespace: serverUrlWhitespace,
    keyFingerprint,
    secretFingerprint,
  });

  if (!serverUrl || !apiKey || !apiSecret) {
    logger.error("Missing required LiveKit configuration secrets", {
      functionName: "live-session-token",
      diagnosticRequestId,
      denoDeploymentId,
      supabaseHost,
      bookingId: sanitizedBookingId,
      authUserId,
      hasServerUrl,
      hasApiKey,
      hasApiSecret,
    });
    return jsonResponse({ error: "LiveKit server configuration is unavailable" }, 500);
  }

  // 6. Query authoritative booking record
  let booking: {
    id: string;
    customer_id: string;
    pandit_id: string;
    service_mode: string;
    status: string;
    scheduled_start_at: string;
    scheduled_end_at: string;
  } | null = null;

  try {
    const { data, error: bookingErr } = await adminClient
      .from("bookings")
      .select(
        "id, customer_id, pandit_id, service_mode, status, scheduled_start_at, scheduled_end_at"
      )
      .eq("id", sanitizedBookingId)
      .maybeSingle();

    if (bookingErr) {
      logger.error("Database query failed while fetching booking", {
        functionName: "live-session-token",
        bookingId: sanitizedBookingId,
        error: bookingErr.message,
      });
      return jsonResponse(
        { error: "Database error while fetching booking details" },
        500
      );
    }
    booking = data;
  } catch (dbErr: any) {
    logger.error("Unexpected error during booking lookup", {
      functionName: "live-session-token",
      bookingId: sanitizedBookingId,
      error: dbErr?.message,
    });
    return jsonResponse({ error: "Database service error" }, 500);
  }

  if (!booking) {
    return jsonResponse({ error: "Booking not found" }, 404);
  }

  // 7. Validate Service Mode & Booking Status
  if (booking.service_mode !== "remote") {
    return jsonResponse(
      { error: "Live session token is only available for remote bookings" },
      400
    );
  }

  if (booking.status === "cancelled") {
    return jsonResponse({ error: "Booking has been cancelled" }, 400);
  }

  if (booking.status === "completed") {
    return jsonResponse({ error: "Booking is already completed" }, 400);
  }

  const ELIGIBLE_STATUSES = ["confirmed", "upcoming", "in_progress"];
  if (!ELIGIBLE_STATUSES.includes(booking.status)) {
    return jsonResponse(
      { error: `Booking status '${booking.status}' is not eligible for live session` },
      400
    );
  }

  // 8. Participant Authorization & Identity Resolution
  let role: "customer" | "pandit" | "admin" | null = null;
  let participantIdentity = "";
  let grants: LiveKitVideoGrants = {
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };

  // Check 8.1: Customer check
  if (booking.customer_id === authUserId) {
    role = "customer";
    participantIdentity = `customer_${authUserId}`;
    grants = {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: false,
    };
  }

  // Check 8.2: Pandit check (resolve caller's Pandit profile)
  if (!role) {
    try {
      const { data: panditProfile, error: panditErr } = await adminClient
        .from("pandit_profiles")
        .select("id")
        .eq("id", booking.pandit_id)
        .eq("user_id", authUserId)
        .maybeSingle();

      if (panditErr) {
        logger.error("Error verifying pandit profile ownership", {
          functionName: "live-session-token",
          bookingId: sanitizedBookingId,
          authUserId,
          error: panditErr.message,
        });
      } else if (panditProfile) {
        role = "pandit";
        participantIdentity = `pandit_${booking.pandit_id}`;
        grants = {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          roomAdmin: true,
        };
      }
    } catch (panditLookupErr: any) {
      logger.error("Unexpected error during pandit authorization check", {
        functionName: "live-session-token",
        bookingId: sanitizedBookingId,
        authUserId,
        error: panditLookupErr?.message,
      });
    }
  }

  // Check 8.3: Admin check
  if (!role) {
    try {
      const { data: adminRole, error: adminErr } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", authUserId)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();

      if (adminErr) {
        logger.error("Error verifying admin role", {
          functionName: "live-session-token",
          bookingId: sanitizedBookingId,
          authUserId,
          error: adminErr.message,
        });
      } else if (adminRole) {
        role = "admin";
        participantIdentity = `admin_${authUserId}`;
        // Admin monitoring: least privilege
        grants = {
          canPublish: false,
          canSubscribe: true,
          canPublishData: false,
          roomAdmin: false,
        };
      }
    } catch (adminLookupErr: any) {
      logger.error("Unexpected error during admin authorization check", {
        functionName: "live-session-token",
        bookingId: sanitizedBookingId,
        authUserId,
        error: adminLookupErr?.message,
      });
    }
  }

  // Unauthorized caller
  if (!role) {
    return jsonResponse(
      { error: "Unauthorized: Caller is not a participant or administrator for this booking" },
      403
    );
  }

  // 8.4 Balance Gate: Customer must have settled outstanding balance before entering Live Sanctum
  if (role === "customer") {
    try {
      const balanceClient = userClient ?? adminClient;
      if (!balanceClient || typeof balanceClient.rpc !== "function") {
        logger.error("No database client available to verify booking balance", {
          functionName: "live-session-token",
          bookingId: sanitizedBookingId,
          authUserId,
        });
        return jsonResponse(
          { error: "Unable to verify booking balance. Please try again later." },
          500
        );
      }

      const { data: balanceData, error: balanceErr } = await balanceClient.rpc(
        "calculate_booking_balance",
        { p_booking_id: sanitizedBookingId }
      );

      if (balanceErr) {
        logger.error("Failed to evaluate booking balance for live session", {
          functionName: "live-session-token",
          bookingId: sanitizedBookingId,
          authUserId,
          error: balanceErr.message,
        });
        return jsonResponse(
          { error: "Unable to verify booking financial clearance. Please contact support." },
          403
        );
      }

      if (
        !balanceData ||
        balanceData.outstanding_balance === undefined ||
        balanceData.outstanding_balance === null
      ) {
        logger.error("Malformed balance data returned from database RPC", {
          functionName: "live-session-token",
          bookingId: sanitizedBookingId,
          authUserId,
        });
        return jsonResponse(
          { error: "Invalid booking financial clearance data." },
          403
        );
      }

      const outstanding = Number(balanceData.outstanding_balance);
      if (isNaN(outstanding) || outstanding > 0) {
        logger.warn("Customer attempted to join live sanctum with unpaid balance", {
          functionName: "live-session-token",
          bookingId: sanitizedBookingId,
          authUserId,
          outstandingBalance: outstanding,
        });
        return jsonResponse(
          {
            error: `Outstanding balance of ₹${outstanding.toFixed(2)} must be settled before joining the Live Video Sanctum.`,
            outstanding_balance: outstanding,
          },
          403
        );
      }
    } catch (balEx: any) {
      logger.error("Unexpected error checking balance gate", {
        functionName: "live-session-token",
        bookingId: sanitizedBookingId,
        error: balEx?.message,
      });
      return jsonResponse(
        { error: "Unable to verify booking financial clearance." },
        500
      );
    }
  }

  // 9. Join-Window Validation
  const now = getNow();
  const startMs = new Date(booking.scheduled_start_at).getTime();
  const endMs = new Date(booking.scheduled_end_at).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    logger.error("Booking contains invalid scheduled timestamps", {
      functionName: "live-session-token",
      bookingId: sanitizedBookingId,
      scheduled_start_at: booking.scheduled_start_at,
      scheduled_end_at: booking.scheduled_end_at,
    });
    return jsonResponse(
      { error: "Invalid schedule timestamps on booking record" },
      500
    );
  }

  // Customer: 15 min before start; Pandit & Admin: 30 min before start
  const earlyBufferMins = role === "customer" ? 15 : 30;
  const windowStartMs = startMs - earlyBufferMins * 60 * 1000;
  const windowEndMs = endMs + 30 * 60 * 1000; // 30 mins after scheduled end

  if (now.getTime() < windowStartMs) {
    const roleLabel = role === "customer" ? "Customers" : "Pandits";
    return jsonResponse(
      {
        error: `Session is not open yet. ${roleLabel} can join up to ${earlyBufferMins} minutes before the scheduled start time.`,
      },
      400
    );
  }

  if (now.getTime() > windowEndMs) {
    return jsonResponse(
      {
        error: "Session window has expired. Joining is permitted up to 30 minutes after scheduled end time.",
      },
      400
    );
  }

  const roomName = `room_${booking.id}`;

  // 10. Live Session Record Maintenance (public.live_sessions)
  try {
    const { data: existingLiveSession, error: liveSessionQueryErr } =
      await adminClient
        .from("live_sessions")
        .select("id, status")
        .eq("booking_id", booking.id)
        .maybeSingle();

    if (liveSessionQueryErr) {
      logger.warn("Could not query live_sessions table", {
        functionName: "live-session-token",
        bookingId: booking.id,
        error: liveSessionQueryErr.message,
      });
    } else if (!existingLiveSession) {
      // Insert initial scheduled live session row without overwriting settlement data
      const { error: insertErr } = await adminClient
        .from("live_sessions")
        .insert({
          booking_id: booking.id,
          status: "scheduled",
          scheduled_start_at: booking.scheduled_start_at,
          metadata: {
            room_name: roomName,
            created_via: "live-session-token",
          },
        });

      if (insertErr && insertErr.code !== "23505") {
        logger.warn("Could not insert initial live_sessions row", {
          functionName: "live-session-token",
          bookingId: booking.id,
          error: insertErr.message,
        });
      }
    }
  } catch (liveSessionErr: any) {
    logger.warn("Non-fatal exception while managing live_sessions record", {
      functionName: "live-session-token",
      bookingId: booking.id,
      error: liveSessionErr?.message,
    });
  }

  // 11. Calculate Token TTL
  // Effective expiration timestamp is min(scheduled_end_at + 30m, now + 4h)
  const maxAllowedExpiryMs = now.getTime() + MAX_TTL_SECONDS * 1000;
  const effectiveExpiryMs = Math.min(windowEndMs, maxAllowedExpiryMs);
  const remainingMs = effectiveExpiryMs - now.getTime();
  const ttlSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

  // 12. Mint LiveKit Access Token
  const nowEpochSeconds = Math.floor(now.getTime() / 1000);
  const nbfEpochSeconds = nowEpochSeconds - 5;
  const expEpochSeconds = nowEpochSeconds + ttlSeconds;

  const passedParams: LiveKitTokenParams = {
    apiKey,
    apiSecret,
    identity: participantIdentity,
    roomName,
    ttlSeconds,
    grants,
    nowEpochSeconds,
  };

  const apiKeyMatchesPassedKey = timingSafeEqual(apiKey, passedParams.apiKey);

  let token: string;
  try {
    token = await tokenGenerator(passedParams);
  } catch (tokenErr: any) {
    logger.error("Failed to generate LiveKit access token", {
      functionName: "live-session-token",
      diagnosticRequestId,
      denoDeploymentId,
      supabaseHost,
      bookingId: sanitizedBookingId,
      participantIdentity,
      error: tokenErr?.message,
    });
    return jsonResponse({ error: "Failed to generate session access token" }, 500);
  }

  // Verify generated JWT issuer corresponds to configured API key without logging JWT or full claims
  let jwtIssuerMatchesConfiguredKey = false;
  let jwtIssuerLength = 0;
  try {
    const tokenParts = token.split(".");
    if (tokenParts.length === 3) {
      const decodedPayload = JSON.parse(base64UrlDecode(tokenParts[1]));
      if (typeof decodedPayload.iss === "string") {
        jwtIssuerLength = decodedPayload.iss.length;
        jwtIssuerMatchesConfiguredKey = timingSafeEqual(decodedPayload.iss, apiKey);
      }
    }
  } catch (verifyErr: any) {
    logger.warn("Diagnostic check failed while verifying issued token claims", {
      functionName: "live-session-token",
      diagnosticRequestId,
      error: verifyErr?.message,
    });
  }

  logger.info("Live session token issued successfully", {
    functionName: "live-session-token",
    diagnosticRequestId,
    denoDeploymentId,
    supabaseHost,
    bookingId: sanitizedBookingId,
    role,
    participantIdentity,
    apiKeyMatchesPassedKey,
    jwtSigningAlgorithm: "HS256",
    jwtIssuerLength,
    jwtIssuerMatchesConfiguredKey,
    iat: nowEpochSeconds,
    nbf: nbfEpochSeconds,
    exp: expEpochSeconds,
    ttlSeconds,
    hasRoomGrant: Boolean(roomName),
    hasRoomJoinGrant: true,
    canPublish: !!grants?.canPublish,
    canSubscribe: !!grants?.canSubscribe,
    canPublishData: !!grants?.canPublishData,
    isRoomAdmin: !!grants?.roomAdmin,
    keyFingerprint,
    secretFingerprint,
    tokenGenerationSuccess: true,
  });

  // 13. Return clean, non-sensitive response
  return jsonResponse(
    {
      success: true,
      token,
      server_url: serverUrl,
      room_name: roomName,
      participant_identity: participantIdentity,
      diagnostic_request_id: diagnosticRequestId,
    },
    200
  );
}

// Top-level Deno Edge Runtime serve handler
if (
  typeof (globalThis as any).Deno !== "undefined" &&
  (globalThis as any).Deno?.serve
) {
  (globalThis as any).Deno.serve((req: Request) => handleLiveSessionToken(req));
}
