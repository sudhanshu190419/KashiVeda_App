// src/shared/utils/formatters.ts

/**
 * Formats monetary amounts into Indian Rupee currency string (INR).
 */
export function formatCurrency(amount: number | string): string {
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numeric)) {
    return "₹0.00";
  }
  return `₹${numeric.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats ISO timestamps or Date objects into human-readable Indian standard dates.
 */
export function formatDate(dateInput?: string | Date | null): string {
  if (!dateInput) return "—";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Formats ISO timestamps or Date objects into readable 12-hour time strings.
 */
export function formatTime(dateInput?: string | Date | null): string {
  if (!dateInput) return "—";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
