// Deterministic, not LLM-generated — keeps phrasing consistent
// ("Lunch at Solaria on 07:00pm") instead of relying on free-text model
// output for something this mechanical. The model only picks a category
// (see prompt rule 16 / RECEIPT_JSON_SCHEMA's enum) — the phrase built from
// it is fixed here.

const MEAL_PERIODS: { start: number; end: number; label: string }[] = [
  { start: 5, end: 11, label: "Breakfast" },
  { start: 11, end: 15, label: "Lunch" },
  { start: 15, end: 17, label: "Afternoon snack" },
  { start: 17, end: 22, label: "Dinner" },
];

const mealPeriodFor = (hour: number): string => {
  return MEAL_PERIODS.find((p) => hour >= p.start && hour < p.end)?.label ?? "Late night snack";
};

// Non-food categories get a fixed label regardless of time of day — a
// grocery run at 8pm isn't "Dinner." "food_snack"/null fall through to the
// meal-period logic below instead (still the best default for a plain
// food-service receipt, and a safe generic fallback when unclassified).
// "other" gets its own neutral label rather than falling through too — it's
// the catch-all for plainly-not-food purchases, so a midnight hardware-store
// run shouldn't get titled "Late night snack."
const CATEGORY_LABELS: Partial<Record<string, string>> = {
  grocery: "Groceries",
  transportation: "Transportation",
  bills: "Bill payment",
  subscription: "Subscription",
  investment: "Investment",
  entertainment: "Entertainment",
  other: "Expense",
};

/** "19:47" / "10:26:06" -> { hour: 19, formatted: "07:47pm" }; null if unparseable. */
const parseTime = (time: string): { hour: number; formatted: string } | null => {
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, hStr, min] = m;
  const hour = Number(hStr);
  if (hour > 23) return null;
  const period = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 || 12;
  return { hour, formatted: `${String(h12).padStart(2, "0")}:${min}${period}` };
};

interface TitleInput {
  merchant: { name: string | null };
  transaction: { time: string | null };
  metadata: { category: string | null };
  // Optional: receipts always have a merchant name, so this never matters
  // for them in practice. Voice often doesn't ("taxi 50 ribu" names no
  // place) — falls back to the one named item instead of a bare "Expense".
  items?: { name: string | null }[];
}

export const buildSuggestedTitle = ({
  merchant,
  transaction,
  metadata,
  items,
}: TitleInput): string | null => {
  // Ambiguous which one to name when there's more than one item and no
  // merchant — leaves it null rather than picking arbitrarily.
  const itemName = items?.length === 1 ? items[0]!.name : null;
  const subject = merchant.name ?? itemName;
  if (!subject) return null;

  const parsed = transaction.time ? parseTime(transaction.time) : null;
  const prefix =
    (metadata.category && CATEGORY_LABELS[metadata.category]) ||
    (parsed ? mealPeriodFor(parsed.hour) : "Expense");
  const lead = merchant.name ? `${prefix} at ${subject}` : `${prefix}: ${subject}`;

  return parsed ? `${lead} on ${parsed.formatted}` : lead;
};
