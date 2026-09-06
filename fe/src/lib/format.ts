import { format as formatDateFns } from "date-fns";

export function formatCurrency(value: number | null, currency: string | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: currency ?? "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

// Local calendar date, not UTC — Date#toISOString() is always UTC, so for
// any positive-UTC-offset timezone (e.g. WIB, UTC+7) `.slice(0, 10)` on it
// reports *yesterday* during the first few hours of the local day. Dates
// have no time-of-day component anywhere in this app, so every "today"/
// "this month" key should read the local calendar date directly instead
// of round-tripping through UTC.
export function localDateKey(date: Date = new Date()): string {
  return formatDateFns(date, "yyyy-MM-dd");
}

export function localMonthKey(date: Date = new Date()): string {
  return localDateKey(date).slice(0, 7);
}

export function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    date,
  );
}
