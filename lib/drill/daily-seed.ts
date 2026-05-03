/**
 * Daily-mode seed derivation. The seed is a pure function of the calendar
 * date in America/New_York — every friend gets the same problem stream on
 * a given day. The format `daily-YYYY-MM-DD` is also surfaced as the URL
 * slug for `/competitive/daily/[date]`, so it's part of the public API.
 *
 * No imports — pure helpers, importable from server, client, and tests.
 */

export const DAILY_WINDOW_DAYS = 30;

/** YYYY-MM-DD for "today" in America/New_York. */
export function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Calendar-day arithmetic on YYYY-MM-DD strings. Timezone-agnostic. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Round-trip check catches things like 2026-02-30 or 2026-13-01.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * The deterministic seed for a given daily date. The drill engine hashes
 * this string and walks the same generator every friend uses.
 */
export function dailySeedFor(iso: string): string {
  return `daily-${iso}`;
}

/**
 * True iff the date is within the 30-day catch-up window, inclusive of today
 * and going back DAILY_WINDOW_DAYS - 1 days. Future dates rejected.
 */
export function isValidDailyDate(iso: string, todayIso = todayET()): boolean {
  if (!isIsoDate(iso)) return false;
  const minDate = addDaysISO(todayIso, -(DAILY_WINDOW_DAYS - 1));
  return iso >= minDate && iso <= todayIso;
}

/**
 * Last 30 daily dates, oldest first. Used by the /competitive/daily list.
 */
export function last30DailyDates(todayIso = todayET()): string[] {
  const out: string[] = [];
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) {
    out.push(addDaysISO(todayIso, -i));
  }
  return out;
}
