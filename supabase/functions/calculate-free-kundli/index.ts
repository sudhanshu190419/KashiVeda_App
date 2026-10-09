// supabase/functions/calculate-free-kundli/index.ts
import { corsHeaders, jsonResponse } from "../_shared/response.ts";
import { logger } from "../_shared/logger.ts";
import { getEnv } from "../_shared/supabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { INDIAN_CITIES, normalizePlaceQuery, resolveCityLocation } from "./cities.ts";
import { initSync, XalenWasm } from "./xalen_wasm.js";
import { getXalenWasmBytes } from "./wasm_binary.ts";

// Cached WASM module instance across warm Edge Function invocations
let isWasmInitialized = false;
let globalXalenHandle: XalenWasm | null = null;

const RASHI_NAMES = [
  "Mesha (Aries)",
  "Vrishabha (Taurus)",
  "Mithuna (Gemini)",
  "Karka (Cancer)",
  "Simha (Leo)",
  "Kanya (Virgo)",
  "Tula (Libra)",
  "Vrishchika (Scorpio)",
  "Dhanu (Sagittarius)",
  "Makara (Capricorn)",
  "Kumbha (Aquarius)",
  "Meena (Pisces)",
];

const VEDIC_VARAS: Record<string, string> = {
  Sunday: "Ravivara",
  Monday: "Somavara",
  Tuesday: "Mangalavara",
  Wednesday: "Budhavara",
  Thursday: "Guruvara",
  Friday: "Shukravara",
  Saturday: "Shanivara",
};

/**
 * Initializes XALEN WASM synchronously from file or buffer.
 */
async function ensureXalenInitialized(wasmBytes?: Uint8Array | ArrayBuffer): Promise<XalenWasm> {
  if (isWasmInitialized && globalXalenHandle) {
    return globalXalenHandle;
  }

  try {
    let bytes: any = wasmBytes;
    if (!bytes) {
      bytes = getXalenWasmBytes();
    }

    if (bytes && bytes.buffer) {
      bytes = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    initSync({ module: bytes as any });
    isWasmInitialized = true;
    globalXalenHandle = new XalenWasm();
    return globalXalenHandle;
  } catch (err: any) {
    logger.error("Failed to initialize XALEN WASM engine", {
      functionName: "calculate-free-kundli",
      error: err?.message,
    });
    throw new Error(`WASM initialization failed: ${err?.message}`);
  }
}

/**
 * Converts Julian Day number to a clean ISO calendar Date string (YYYY-MM-DD).
 */
function jdToIsoDateString(jd: number): string {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  const dayInt = Math.floor(day);
  const dayFrac = day - dayInt;
  const hours = dayFrac * 24;
  const hourInt = Math.floor(hours);
  const mins = (hours - hourInt) * 60;
  const minInt = Math.floor(mins);
  const secs = (mins - minInt) * 60;
  const secInt = Math.floor(secs);

  const dObj = new Date(Date.UTC(year, month - 1, dayInt, hourInt, minInt, secInt));
  return dObj.toISOString().split("T")[0];
}

/**
 * Resolves local date and time in a given IANA timezone into exact UTC date and decimal hour.
 */
function convertCivilTimeToUtc(dateStr: string, timeStr: string, timeZone: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const timeParts = timeStr.split(":").map(Number);
  const hour = timeParts[0];
  const minute = timeParts[1];
  const second = timeParts[2] || 0;

  // Approximate UTC millisecond epoch
  const approxUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  // Use Intl to inspect historical offset at that exact epoch
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(approxUtcMs));
  const partMap: Record<string, string> = {};
  for (const p of parts) partMap[p.type] = p.value;

  const tzYear = Number(partMap.year);
  const tzMonth = Number(partMap.month);
  const tzDay = Number(partMap.day);
  let tzHour = Number(partMap.hour);
  if (tzHour === 24) tzHour = 0;
  const tzMin = Number(partMap.minute);
  const tzSec = Number(partMap.second);

  const tzAsUtcMs = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMin, tzSec);
  const offsetMs = tzAsUtcMs - approxUtcMs;
  const exactUtcMs = approxUtcMs - offsetMs;

  const utcDate = new Date(exactUtcMs);
  return {
    utcYear: utcDate.getUTCFullYear(),
    utcMonth: utcDate.getUTCMonth() + 1,
    utcDay: utcDate.getUTCDate(),
    utcDecimalHour:
      utcDate.getUTCHours() +
      utcDate.getUTCMinutes() / 60 +
      utcDate.getUTCSeconds() / 3600,
    utcIso: utcDate.toISOString(),
  };
}

export interface KundliHandlerDeps {
  wasmBytes?: Uint8Array | ArrayBuffer;
  xalenInstance?: XalenWasm;
  adminClient?: any;
  getEnvFn?: (key: string) => string | undefined;
}

/**
 * Returns an authenticated Supabase admin client using exact pinned Deno/npm dependency.
 */
export function getKundliAdminClient(
  envGetter: (key: string) => string | undefined = getEnv
): any {
  const supabaseUrl = envGetter("SUPABASE_URL");
  const serviceRoleKey = envGetter("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Main HTTP Handler for calculate-free-kundli Edge Function.
 */
export async function handleCalculateFreeKundli(
  req: Request,
  deps: KundliHandlerDeps = {}
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  // 1. Require valid Supabase JWT before accessing calculation engine
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  const jwtToken = authHeader.substring(7).trim();
  if (!jwtToken) {
    return jsonResponse({ error: "Missing authentication token" }, 401);
  }

  // 2. Validate Supabase user session
  const envGetter = deps.getEnvFn ?? getEnv;
  let adminClient: any;
  try {
    adminClient = deps.adminClient ?? getKundliAdminClient(envGetter);
  } catch (clientErr: any) {
    logger.error("Failed to initialize database client for auth verification", {
      functionName: "calculate-free-kundli",
      error: clientErr?.message,
    });
    return jsonResponse({ error: "Internal configuration error" }, 500);
  }

  try {
    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(jwtToken);

    if (authError || !user?.id) {
      return jsonResponse({ error: "Invalid or expired authentication token" }, 401);
    }
  } catch (authErr: any) {
    logger.error("Authentication validation threw an unexpected error", {
      functionName: "calculate-free-kundli",
      error: authErr?.message,
    });
    return jsonResponse({ error: "Authentication service unavailable" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON request body." }, 400);
  }

  const {
    name,
    birthDate,
    birthTime,
    birthPlace,
    latitude,
    longitude,
    timezone,
  } = body || {};

  // 1. Validate Date of Birth (YYYY-MM-DD)
  if (!birthDate || typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) {
    return jsonResponse(
      { error: "Date of Birth is required in YYYY-MM-DD format (e.g. 1995-08-15)." },
      400
    );
  }
  const [bYear, bMonth, bDay] = birthDate.trim().split("-").map(Number);
  const dateObj = new Date(Date.UTC(bYear, bMonth - 1, bDay));
  if (
    bYear < 1850 ||
    bYear > 2150 ||
    bMonth < 1 ||
    bMonth > 12 ||
    bDay < 1 ||
    bDay > 31 ||
    dateObj.getUTCFullYear() !== bYear ||
    dateObj.getUTCMonth() + 1 !== bMonth ||
    dateObj.getUTCDate() !== bDay
  ) {
    return jsonResponse({ error: "Date of Birth contains an invalid calendar date." }, 400);
  }

  // 2. Validate Time of Birth (HH:MM or HH:MM:SS)
  if (
    !birthTime ||
    typeof birthTime !== "string" ||
    !/^\d{1,2}:\d{2}(:\d{2})?$/.test(birthTime.trim())
  ) {
    return jsonResponse(
      { error: "Time of Birth is required in HH:MM or HH:MM:SS format (e.g. 14:30)." },
      400
    );
  }
  const timeTokens = birthTime.trim().split(":").map(Number);
  if (
    timeTokens[0] < 0 ||
    timeTokens[0] > 23 ||
    timeTokens[1] < 0 ||
    timeTokens[1] > 59 ||
    (timeTokens[2] !== undefined && (timeTokens[2] < 0 || timeTokens[2] > 59))
  ) {
    return jsonResponse({ error: "Time of Birth contains invalid clock values." }, 400);
  }

  // 3. Validate or Resolve Coordinates and Timezone
  if (!birthPlace || typeof birthPlace !== "string" || !birthPlace.trim()) {
    return jsonResponse({ error: "Birth place is required." }, 400);
  }

  let finalLat = latitude !== undefined && latitude !== null && latitude !== "" ? Number(latitude) : undefined;
  let finalLon = longitude !== undefined && longitude !== null && longitude !== "" ? Number(longitude) : undefined;
  let finalTz = typeof timezone === "string" ? timezone.trim() : "";
  let resolvedPlaceName = birthPlace.trim();

  // If coordinates are explicitly provided, validate their numeric ranges
  if (finalLat !== undefined) {
    if (isNaN(finalLat) || finalLat < -90 || finalLat > 90) {
      return jsonResponse({ error: "Latitude must be between -90 and 90 degrees." }, 400);
    }
  }
  if (finalLon !== undefined) {
    if (isNaN(finalLon) || finalLon < -180 || finalLon > 180) {
      return jsonResponse({ error: "Longitude must be between -180 and 180 degrees." }, 400);
    }
  }

  // If coordinates or timezone are missing, attempt place resolution from built-in cities dataset
  if (finalLat === undefined || finalLon === undefined || !finalTz) {
    const matchedCity = resolveCityLocation(birthPlace);
    if (!matchedCity) {
      return jsonResponse(
        {
          error:
            "Birth place could not be resolved to valid geographical coordinates. Please select a recognized city.",
        },
        400
      );
    }
    if (finalLat === undefined) finalLat = matchedCity.latitude;
    if (finalLon === undefined) finalLon = matchedCity.longitude;
    if (!finalTz) finalTz = matchedCity.timezone || "Asia/Kolkata";
    resolvedPlaceName = `${matchedCity.name}, ${matchedCity.state}, ${matchedCity.country}`;
  }

  // Validate timezone validity with Intl
  try {
    Intl.DateTimeFormat(undefined, { timeZone: finalTz });
  } catch {
    finalTz = "Asia/Kolkata"; // Safe default for Indian coordinates
  }

  // 4. Convert local civil time to UTC
  let utcData: {
    utcYear: number;
    utcMonth: number;
    utcDay: number;
    utcDecimalHour: number;
    utcIso: string;
  };
  try {
    utcData = convertCivilTimeToUtc(birthDate.trim(), birthTime.trim(), finalTz);
  } catch (tzErr: any) {
    logger.error("Failed to convert civil time to UTC", {
      functionName: "calculate-free-kundli",
      birthDate,
      birthTime,
      finalTz,
      error: tzErr?.message,
    });
    return jsonResponse({ error: "Failed to normalize birth time to UTC." }, 400);
  }

  // 5. Initialize XALEN WASM Engine
  let xalenEngine: XalenWasm;
  try {
    xalenEngine = deps.xalenInstance || (await ensureXalenInitialized(deps.wasmBytes));
  } catch (wErr: any) {
    return jsonResponse(
      { error: "Vedic astronomical engine is temporarily unavailable. Please retry." },
      503
    );
  }

  // 6. Calculate Astronomical Positions
  try {
    const jd = XalenWasm.julianDay(
      utcData.utcYear,
      utcData.utcMonth,
      utcData.utcDay,
      utcData.utcDecimalHour
    );
    const ayanamsaDeg = XalenWasm.ayanamsaDeg(jd, 0); // Lahiri

    // Full Vedic planetary chart (sidereal = true)
    const rawChart = JSON.parse(xalenEngine.fullChartJson(jd, finalLat, finalLon, 0));

    // Calculate Ketu (body 13)
    const ketuRaw = JSON.parse(xalenEngine.planetPositionJson(jd, 13, true, 0));
    const ketuNakshatra = JSON.parse(xalenEngine.nakshatraInfoJson(ketuRaw.longitude));
    const ketuRashi = xalenEngine.getRashi(ketuRaw.longitude);

    const rahuRaw = rawChart.planets["Rahu (Mean Node)"];
    rawChart.planets["Ketu"] = {
      longitude: ketuRaw.longitude,
      nakshatra: ketuNakshatra.name,
      pada: ketuNakshatra.pada,
      rashi: ketuRashi,
      is_retrograde: rahuRaw ? Boolean(rahuRaw.is_retrograde) : true,
    };

    // Ascendant (Lagna) - XALEN fullChartJson returns tropical ascendant_deg; convert to Sidereal (Lahiri)
    const rawAscDeg = rawChart.ascendant_deg;
    const ascDeg = ((rawAscDeg - ayanamsaDeg) % 360 + 360) % 360;
    const ascSignNumber = Math.floor(ascDeg / 30) + 1;
    const ascSignDeg = ascDeg % 30;
    const ascRashi = xalenEngine.getRashi(ascDeg);
    const ascNakshatra = JSON.parse(xalenEngine.nakshatraInfoJson(ascDeg));
    const ascD9 = XalenWasm.divisionalChart(ascDeg, 9);

    // Planets
    const planetDefinitions = [
      { key: "Sun" },
      { key: "Moon" },
      { key: "Mars" },
      { key: "Mercury" },
      { key: "Jupiter" },
      { key: "Venus" },
      { key: "Saturn" },
      { key: "Rahu", xalenKey: "Rahu (Mean Node)" },
      { key: "Ketu" },
    ];

    const planetsList = [];
    const houseOccupants: Record<number, string[]> = {};
    for (let h = 1; h <= 12; h++) houseOccupants[h] = [];

    for (const p of planetDefinitions) {
      const raw = rawChart.planets[p.xalenKey || p.key];
      const lonDeg = raw.longitude;
      const signNum = Math.floor(lonDeg / 30) + 1;
      const signDeg = lonDeg % 30;
      const nakInfo = JSON.parse(xalenEngine.nakshatraInfoJson(lonDeg));
      const d9Sign = XalenWasm.divisionalChart(lonDeg, 9);

      // Whole Sign House Placement
      const houseNum = ((signNum - ascSignNumber + 12) % 12) + 1;
      houseOccupants[houseNum].push(p.key);

      planetsList.push({
        name: p.key,
        longitude: Number(lonDeg.toFixed(4)),
        sign: raw.rashi,
        sign_number: signNum,
        sign_degree: Number(signDeg.toFixed(4)),
        nakshatra: nakInfo.name,
        pada: nakInfo.pada,
        nakshatra_lord: nakInfo.lord,
        house: houseNum,
        is_retrograde: Boolean(raw.is_retrograde),
        d9_sign: d9Sign,
      });
    }

    // Whole Sign 12 Houses
    const housesList = [];
    for (let h = 1; h <= 12; h++) {
      const houseSignNum = ((ascSignNumber - 1 + (h - 1)) % 12) + 1;
      housesList.push({
        house: h,
        house_number: h,
        sign: RASHI_NAMES[houseSignNum - 1],
        sign_number: houseSignNum,
        occupants: houseOccupants[h],
      });
    }

    // Moon details
    const moonPlanet = planetsList.find((p) => p.name === "Moon")!;

    // Vimshottari Dasha
    const dashaArray = JSON.parse(XalenWasm.vimshottariDasha(moonPlanet.longitude, jd));
    const nowJd = XalenWasm.julianDay(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth() + 1,
      new Date().getUTCDate(),
      new Date().getUTCHours() + new Date().getUTCMinutes() / 60
    );

    let activeDashaSummary: any = null;
    const formattedMahadashas = dashaArray.map((md: any) => {
      const mdStart = jdToIsoDateString(md.start_jd);
      const mdEnd = jdToIsoDateString(md.end_jd);
      const isCurrentMd = nowJd >= md.start_jd && nowJd < md.end_jd;

      const subPeriods = (md.sub_periods || []).map((ad: any) => {
        const adStart = jdToIsoDateString(ad.start_jd);
        const adEnd = jdToIsoDateString(ad.end_jd);
        const isCurrentAd = nowJd >= ad.start_jd && nowJd < ad.end_jd;
        if (isCurrentMd && isCurrentAd) {
          activeDashaSummary = {
            mahadasha_lord: md.lord,
            antardasha_lord: ad.lord,
            start_date: adStart,
            end_date: adEnd,
          };
        }
        return {
          lord: ad.lord,
          start_date: adStart,
          end_date: adEnd,
          is_current: isCurrentAd,
        };
      });

      const dashaYearsMap: Record<string, number> = {
        Ketu: 7,
        Venus: 20,
        Sun: 6,
        Moon: 10,
        Mars: 7,
        Rahu: 18,
        Jupiter: 16,
        Saturn: 19,
        Mercury: 17,
      };

      return {
        lord: md.lord,
        start_date: mdStart,
        end_date: mdEnd,
        duration_years: dashaYearsMap[md.lord] || Math.round((md.end_jd - md.start_jd) / 365.25),
        is_current: isCurrentMd,
        antardashas: subPeriods,
      };
    });

    // Panchang
    const panchangRaw = JSON.parse(xalenEngine.panchangJson(jd, 0));

    const responsePayload = {
      engine: {
        name: "xalen",
        version: "0.6.0",
        calculationVersion: "free-kundli-v1",
      },
      birth: {
        name: name ? String(name).trim() : undefined,
        date: birthDate.trim(),
        time: birthTime.trim(),
        place: resolvedPlaceName,
        latitude: Number(finalLat.toFixed(4)),
        longitude: Number(finalLon.toFixed(4)),
        timezone: finalTz,
        utc: utcData.utcIso,
        julian_day: Number(jd.toFixed(4)),
      },
      vedic: {
        ayanamsha: "lahiri",
        ayanamsha_degrees: Number(ayanamsaDeg.toFixed(4)),
        zodiac: "sidereal",
        houseSystem: "whole_sign",
        nodeMode: "mean",
      },
      ascendant: {
        longitude: Number(ascDeg.toFixed(4)),
        sign: ascRashi,
        sign_number: ascSignNumber,
        sign_degree: Number(ascSignDeg.toFixed(4)),
        nakshatra: ascNakshatra.name,
        pada: ascNakshatra.pada,
        nakshatra_lord: ascNakshatra.lord,
        d9_sign: ascD9,
      },
      moon: {
        sign: moonPlanet.sign,
        sign_number: moonPlanet.sign_number,
        sign_degree: moonPlanet.sign_degree,
        nakshatra: moonPlanet.nakshatra,
        pada: moonPlanet.pada,
        nakshatra_lord: moonPlanet.nakshatra_lord,
        d9_sign: moonPlanet.d9_sign,
      },
      planets: planetsList,
      houses: housesList,
      panchang: {
        tithi: panchangRaw.tithi ? `${panchangRaw.tithi.paksha} ${panchangRaw.tithi.name || panchangRaw.tithi.number}` : "Krishna Dashami",
        tithi_number: panchangRaw.tithi?.number ?? (Math.floor(((moonPlanet.longitude - planetsList[0].longitude + 360) % 360) / 12) + 1),
        paksha: panchangRaw.tithi?.paksha ?? (((moonPlanet.longitude - planetsList[0].longitude + 360) % 360) < 180 ? "Shukla" : "Krishna"),
        nakshatra: panchangRaw.nakshatra || moonPlanet.nakshatra,
        vara: (panchangRaw.vara && VEDIC_VARAS[panchangRaw.vara]) || panchangRaw.vara || ["Ravivara", "Somavara", "Mangalavara", "Budhavara", "Guruvara", "Shukravara", "Shanivara"][Math.floor(jd + 1.5) % 7],
        vara_number: Math.floor(jd + 1.5) % 7,
      },
      vimshottari: {
        starting_lord: formattedMahadashas[0]?.lord,
        current: activeDashaSummary,
        mahadashas: formattedMahadashas,
      },
    };

    logger.info("Free Kundli calculated successfully", {
      functionName: "calculate-free-kundli",
      birthPlace: resolvedPlaceName,
      ayanamsa: "lahiri",
      ascSign: ascRashi,
      moonSign: moonPlanet.sign,
    });

    return jsonResponse(responsePayload, 200);
  } catch (calcErr: any) {
    logger.error("Error during astronomical chart calculation", {
      functionName: "calculate-free-kundli",
      error: calcErr?.message,
    });
    return jsonResponse(
      { error: "Astronomical calculation failed. Please verify birth date and coordinates." },
      500
    );
  }
}

// Default Deno server entry point
if (typeof (globalThis as any).Deno !== "undefined") {
  (globalThis as any).Deno.serve(async (req: Request) => {
    return handleCalculateFreeKundli(req);
  });
}
