// src/shared/utils/date.ts

/**
 * Returns current calendar date in India Standard Time (Asia/Kolkata) as YYYY-MM-DD.
 */
export function getIndianCalendarDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // Fallback if Intl timeZone is unavailable
    const offsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + offsetMs);
    return istDate.toISOString().split("T")[0];
  }
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculates milliseconds until the next Indian midnight (00:00:00 IST).
 * Completely timezone-agnostic: IST has a fixed +05:30 offset from UTC with no DST.
 */
export function getMsUntilNextIndianMidnight(now: Date = new Date()): number {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const istTimeOfDay = ((istMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
  const msUntilMidnight = MS_PER_DAY - istTimeOfDay;
  return msUntilMidnight === 0 ? MS_PER_DAY : msUntilMidnight;
}

/**
 * Formats a calendar date string (YYYY-MM-DD) or Date object into human-readable Indian format.
 * e.g. "Saturday, 10 October 2026"
 */
export function formatIndianDisplayDate(dateInput?: string | Date | null): string {
  if (!dateInput) return "—";
  try {
    const date =
      typeof dateInput === "string"
        ? new Date(dateInput.includes("T") ? dateInput : `${dateInput}T12:00:00+05:30`)
        : dateInput;
    if (isNaN(date.getTime())) return typeof dateInput === "string" ? dateInput : "—";

    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  } catch {
    return typeof dateInput === "string" ? dateInput : "—";
  }
}
