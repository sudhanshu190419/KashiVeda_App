const fs = require('fs');

const utilsPath = 'C:/Projects/kashi-veda-admin/lib/astrology/astrology-datetime-utils.ts';

const utilsCode = `/**
 * Timezone-aware datetime utilities for Astrology Content management (AST-14).
 *
 * Provides bidirectional conversion between stored UTC instants (TIMESTAMPTZ / ISO-8601)
 * and HTML \`datetime-local\` wall-clock representations (YYYY-MM-DDTHH:mm).
 *
 * Guarantees:
 * 1. Preservation of exact original instants (including seconds and milliseconds) when a field is unchanged.
 * 2. Unambiguous conversion between local wall-clock values and UTC instants.
 * 3. Calendar rollover detection and validation of malformed inputs.
 * 4. Dual support for browser-local editing and explicit Asia/Kolkata (IST) workflows.
 */

// =============================================================================
// Browser-Local Datetime Helpers
// =============================================================================

/**
 * Formats a stored UTC instant into a browser-local wall-clock string for \`datetime-local\` inputs.
 * Output format: YYYY-MM-DDTHH:mm
 *
 * @param instantStr ISO-8601 UTC timestamp or parseable datetime string
 * @returns YYYY-MM-DDTHH:mm formatted in local timezone, or empty string if null/invalid
 */
export function formatInstantToLocalDatetimeInput(
  instantStr: string | null | undefined
): string {
  if (!instantStr || typeof instantStr !== "string" || instantStr.trim() === "") {
    return "";
  }

  const d = new Date(instantStr.trim());
  if (isNaN(d.getTime())) {
    return "";
  }

  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  return \`\${yyyy}-\${mm}-\${dd}T\${hh}:\${min}\`;
}

/**
 * Returns current instant formatted as a local YYYY-MM-DDTHH:mm wall-clock string.
 */
export function getLocalCurrentDatetimeInput(): string {
  const now = new Date();
  const yyyy = String(now.getFullYear()).padStart(4, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  return \`\${yyyy}-\${mm}-\${dd}T\${hh}:\${min}\`;
}

/**
 * Parses a browser-local \`datetime-local\` input string back into a UTC ISO-8601 instant.
 *
 * If the input matches the formatted representation of \`originalInstant\`, the original
 * instant is preserved exactly without any modification (preserving seconds and milliseconds).
 *
 * @param localInput YYYY-MM-DDTHH:mm wall-clock input string
 * @param originalInstant Stored instant before form editing (if editing an existing record)
 * @returns ISO-8601 UTC string (e.g. "2026-10-10T06:00:00.000Z"), or null if empty
 */
export function parseLocalDatetimeInputToInstant(
  localInput: string | null | undefined,
  originalInstant?: string | null
): string | null {
  if (!localInput || typeof localInput !== "string" || localInput.trim() === "") {
    return null;
  }

  const trimmed = localInput.trim();

  // If unchanged from original formatted representation, preserve exact original instant string
  if (originalInstant && trimmed === formatInstantToLocalDatetimeInput(originalInstant)) {
    return originalInstant;
  }

  const match = trimmed.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})(?::(\\d{2}))?$/);
  if (!match) {
    throw new Error(
      \`Invalid local datetime format: "\${localInput}". Expected YYYY-MM-DDTHH:mm.\`
    );
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const hours = parseInt(match[4], 10);
  const minutes = parseInt(match[5], 10);
  const seconds = match[6] ? parseInt(match[6], 10) : 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    throw new Error(\`Time components out of valid range in "\${localInput}".\`);
  }

  const d = new Date(year, month, day, hours, minutes, seconds);
  if (isNaN(d.getTime())) {
    throw new Error(\`Invalid date values in "\${localInput}".\`);
  }

  // Verify calendar rollover (e.g. Feb 30 or April 31)
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month ||
    d.getDate() !== day
  ) {
    throw new Error(\`Invalid calendar date in "\${localInput}" (calendar rollover detected).\`);
  }

  return d.toISOString();
}

// =============================================================================
// Asia/Kolkata (IST: UTC+05:30) Datetime Helpers
// =============================================================================

const KOLKATA_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +5 hours 30 minutes in milliseconds

/**
 * Formats a stored UTC instant explicitly into an Asia/Kolkata wall-clock YYYY-MM-DDTHH:mm string,
 * independent of the client's local system timezone.
 */
export function formatInstantToKolkataDatetimeInput(
  instantStr: string | null | undefined
): string {
  if (!instantStr || typeof instantStr !== "string" || instantStr.trim() === "") {
    return "";
  }

  const d = new Date(instantStr.trim());
  if (isNaN(d.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "00";

  const yyyy = getPart("year");
  const mm = getPart("month");
  const dd = getPart("day");
  let hh = getPart("hour");
  if (hh === "24") hh = "00";
  const min = getPart("minute");

  return \`\${yyyy}-\${mm}-\${dd}T\${hh}:\${min}\`;
}

/**
 * Returns the current instant formatted as an Asia/Kolkata YYYY-MM-DDTHH:mm wall-clock string.
 */
export function getKolkataCurrentDatetimeInput(): string {
  return formatInstantToKolkataDatetimeInput(new Date().toISOString());
}

/**
 * Parses an Asia/Kolkata wall-clock YYYY-MM-DDTHH:mm input string into a UTC ISO-8601 instant.
 *
 * If unchanged from original formatted representation, preserves original instant exactly.
 */
export function parseKolkataDatetimeInputToInstant(
  kolkataInput: string | null | undefined,
  originalInstant?: string | null
): string | null {
  if (!kolkataInput || typeof kolkataInput !== "string" || kolkataInput.trim() === "") {
    return null;
  }

  const trimmed = kolkataInput.trim();

  if (originalInstant && trimmed === formatInstantToKolkataDatetimeInput(originalInstant)) {
    return originalInstant;
  }

  const match = trimmed.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})(?::(\\d{2}))?$/);
  if (!match) {
    throw new Error(
      \`Invalid Kolkata datetime format: "\${kolkataInput}". Expected YYYY-MM-DDTHH:mm.\`
    );
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const hours = parseInt(match[4], 10);
  const minutes = parseInt(match[5], 10);
  const seconds = match[6] ? parseInt(match[6], 10) : 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    throw new Error(\`Time components out of valid range in "\${kolkataInput}".\`);
  }

  // Calculate UTC timestamp from India Standard Time (UTC = IST - 05:30)
  const utcMillis = Date.UTC(year, month, day, hours, minutes, seconds) - IST_OFFSET_MS;
  const utcDate = new Date(utcMillis);

  // Validate calendar rollover using UTC components before IST shift
  const verifyDate = new Date(Date.UTC(year, month, day));
  if (
    verifyDate.getUTCFullYear() !== year ||
    verifyDate.getUTCMonth() !== month ||
    verifyDate.getUTCDate() !== day
  ) {
    throw new Error(\`Invalid calendar date in "\${kolkataInput}" (calendar rollover detected).\`);
  }

  return utcDate.toISOString();
}
`;

fs.writeFileSync(utilsPath, utilsCode, 'utf8');
console.log('Created lib/astrology/astrology-datetime-utils.ts successfully');
