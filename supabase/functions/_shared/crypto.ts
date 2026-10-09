// supabase/functions/_shared/crypto.ts

/**
 * Computes an HMAC-SHA256 digest over the message and returns the lowercase hex string.
 * Uses Web Crypto API (crypto.subtle), which is universally supported in Deno, modern Node, and Browsers.
 */
export async function computeHmacSha256Hex(
  secret: string,
  message: string
): Promise<string> {
  const TextEncoderClass = (globalThis as any).TextEncoder;
  const encoder = new TextEncoderClass();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available in the current environment");
  }

  const cryptoKey = await subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await subtle.sign("HMAC", cryptoKey, msgData);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes a SHA-256 digest over the input string and returns the lowercase hex string.
 */
export async function computeSha256Hex(value: string): Promise<string> {
  const TextEncoderClass = (globalThis as any).TextEncoder;
  const encoder = new TextEncoderClass();
  const data = encoder.encode(value);

  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API (crypto.subtle) is not available in the current environment");
  }

  const hashBuffer = await subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time comparison of two ASCII strings to prevent timing attacks.
 */
/* eslint-disable no-bitwise */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}
/* eslint-enable no-bitwise */

/**
 * Verifies that the X-Razorpay-Signature header matches the HMAC-SHA256 of the raw body.
 */
export async function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined
): Promise<boolean> {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  try {
    const expectedHex = await computeHmacSha256Hex(secret, rawBody);
    return timingSafeEqual(expectedHex.toLowerCase(), signature.trim().toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Encodes string or Uint8Array to base64url format (RFC 7515).
 */
export function base64UrlEncode(data: Uint8Array | string): string {
  let base64: string;
  const bytes =
    typeof data === "string" ? new (globalThis as any).TextEncoder().encode(data) : data;

  if (typeof (globalThis as any).Buffer !== "undefined") {
    base64 = (globalThis as any).Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = (globalThis as any).btoa(binary);
  }

  return base64.replace(/[=]/g, "").replace(/[+]/g, "-").replace(/[/]/g, "_");
}

/**
 * Decodes base64url string to UTF-8 text.
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/[-]/g, "+").replace(/[_]/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  if (typeof (globalThis as any).Buffer !== "undefined") {
    return (globalThis as any).Buffer.from(base64, "base64").toString("utf-8");
  }
  const binary = (globalThis as any).atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new (globalThis as any).TextDecoder().decode(bytes);
}

export interface LiveKitVideoGrants {
  room?: string;
  roomJoin?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  roomAdmin?: boolean;
  [key: string]: any;
}

export interface LiveKitTokenParams {
  apiKey: string;
  apiSecret: string;
  identity: string;
  roomName: string;
  ttlSeconds: number;
  grants: LiveKitVideoGrants;
  metadata?: string;
  nowEpochSeconds?: number;
}

/**
 * Generates an official LiveKit-compatible AccessToken JWT using standard Web Crypto API.
 * Compatible with Deno Edge Runtime, Node.js, and Browsers.
 */
export async function generateLiveKitToken(
  params: LiveKitTokenParams
): Promise<string> {
  const {
    apiKey,
    apiSecret,
    identity,
    roomName,
    ttlSeconds,
    grants,
    metadata,
    nowEpochSeconds,
  } = params;

  const now = nowEpochSeconds ?? Math.floor(Date.now() / 1000);

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const payload: Record<string, any> = {
    iss: apiKey,
    sub: identity,
    jti: (globalThis as any).crypto?.randomUUID
      ? (globalThis as any).crypto.randomUUID()
      : `jwt_${now}_${Math.random().toString(36).substring(2, 9)}`,
    iat: now,
    nbf: now - 5,
    exp: now + ttlSeconds,
    video: {
      room: roomName,
      roomJoin: true,
      canPublish: grants.canPublish ?? true,
      canSubscribe: grants.canSubscribe ?? true,
      canPublishData: grants.canPublishData ?? true,
      ...(grants.roomAdmin !== undefined ? { roomAdmin: grants.roomAdmin } : {}),
    },
  };

  if (metadata) {
    payload.metadata = metadata;
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "Web Crypto API (crypto.subtle) is not available in the current environment"
    );
  }

  const TextEncoderClass = (globalThis as any).TextEncoder;
  const encoder = new TextEncoderClass();
  const keyData = encoder.encode(apiSecret);
  const msgData = encoder.encode(unsignedToken);

  const cryptoKey = await subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await subtle.sign("HMAC", cryptoKey, msgData);
  const signatureBytes = new Uint8Array(signatureBuffer);
  const encodedSignature = base64UrlEncode(signatureBytes);

  return `${unsignedToken}.${encodedSignature}`;
}

