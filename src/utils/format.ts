/**
 * utils/format.ts — Pure date/number formatting helpers
 *
 * Rules for this file:
 * - No React imports
 * - No framework dependencies
 * - No side effects
 * - Pure functions only
 */

/**
 * Formats an ISO date string to a human-readable datetime string.
 * Example: "2024-01-15T10:30:00Z" → "15/01/2024 10:30 AM"
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " " +
    d
      .toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .toUpperCase()
  );
}

/**
 * Formats a Date object to "YYYY-MM-DD" for use in <input type="date" />.
 * Example: new Date("2024-01-15") → "2024-01-15"
 */
export function formatDateForInput(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Returns a Date object for N days ago from today.
 * @example daysAgo(7) // 7 days before today
 */
export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Formats a number as grams with up to 3 decimal places.
 * Example: 12.5 → "12.500 g"
 */
export function formatGrams(value: number | undefined | null, decimals = 3): string {
  if (value == null || isNaN(value)) return "—";
  return `${value.toFixed(decimals)} g`;
}
