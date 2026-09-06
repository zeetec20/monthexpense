// Pure string/object transforms. No Hono/Cloudflare imports — testable
// under plain Node/vitest without a workerd runtime.

import { withinTolerance } from "./validate";

/**
 * Pre-LLM OCR normalization. Lightweight only: unicode/line-ending/whitespace
 * cleanup. Explicitly avoids flattening layout — tabular OCR structure
 * (e.g. "ITEM  QTY  PRICE" rows) is preserved because it helps the model.
 */
export const normalizeOcrText = (input: string): string => {
  return input
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // collapse 3+ blank lines down to a single blank line
    .replace(/\n{3,}/g, "\n\n")
    // trim trailing whitespace on each line, keep leading (column alignment)
    .replace(/[ \t]+$/gm, "")
    .trim();
};

const MONEY_CHARS = /[^\d.,-]/g;

// Trailing magnitude shorthand ("75k", "75 rb", "1.5jt") — never printed on
// a real receipt, but a typed casual purchase note (e.g. Text-receipt
// entry's "beli paket data 75k") comes through verbatim per prompt rule 6,
// which deliberately never asks the model to resolve it. This is where that
// resolution actually happens, same job EXPENSE_SYSTEM_PROMPT's rule 4 does
// in-model for voice's "50k"/"50 ribu" phrasing.
const SHORTHAND_RE = /^(.*?)\s*(ribu|rb|juta|jt|k)$/i;

/** Coerce a model-emitted numeric-ish value ("Rp4,000", "4000", 4000) to a number, else null. */
export const coerceNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let input = value.trim();
  let multiplier = 1;
  const shorthand = input.match(SHORTHAND_RE);
  if (shorthand) {
    const [, base, suffix] = shorthand as unknown as [string, string, string];
    multiplier = /^(ribu|rb|k)$/i.test(suffix) ? 1_000 : 1_000_000;
    input = base;
  }

  const stripped = input.replace(MONEY_CHARS, "");
  if (stripped === "" || stripped === "-") return null;
  // "4.000,50" (thousands=. decimal=,) vs "4,000.50" (thousands=, decimal=.):
  // prefer the last separator as the decimal point when both are present.
  let normalized = stripped;
  const lastComma = stripped.lastIndexOf(",");
  const lastDot = stripped.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? stripped.replace(/\./g, "").replace(",", ".")
        : stripped.replace(/,/g, "");
  } else if (lastComma > -1) {
    // single comma: treat as thousands separator unless it looks decimal (2 trailing digits)
    normalized = /,\d{1,2}$/.test(stripped) ? stripped.replace(",", ".") : stripped.replace(/,/g, "");
  } else if (lastDot > -1) {
    // dot(s), no comma: real money amounts never have exactly 3 fractional
    // digits, so one-or-more 3-digit groups after a dot ("26.000",
    // "1.234.567") is unambiguously thousands-grouping (Indonesian/EU
    // convention), not a decimal point. Anything else ("26.5", "26.00")
    // stays a literal decimal, unchanged.
    if (/^\d{1,3}(\.\d{3})+$/.test(stripped)) {
      normalized = stripped.replace(/\./g, "");
    }
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num * multiplier : null;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Best-effort normalize a date string to ISO YYYY-MM-DD; null if not confidently parseable. */
export const coerceDate = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const s = value.trim();

  // already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY (ambiguous — assume DD/MM/YYYY, common outside US)
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m as unknown as [string, string, string, string];
    const dd = d.padStart(2, "0");
    const mm = mo.padStart(2, "0");
    if (Number(mm) <= 12 && Number(dd) <= 31) return `${y}-${mm}-${dd}`;
  }

  // "12 Jan 2024" / "12-Jan-2024"
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{4})$/);
  if (m) {
    const [, d, monRaw, y] = m as unknown as [string, string, string, string];
    const mon = MONTHS[monRaw.slice(0, 3).toLowerCase()];
    if (mon) return `${y}-${mon}-${d.padStart(2, "0")}`;
  }

  return null;
};

/** Standardize a currency string to an ISO 4217 code where recognizable, else null. */
const coerceCurrency = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const s = value.trim();
  if (/^[A-Za-z]{3}$/.test(s)) return s.toUpperCase();
  const symbolMap: Record<string, string> = {
    "rp": "IDR", "$": "USD", "us$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY",
  };
  return symbolMap[s.toLowerCase()] ?? null;
};

/**
 * A priced line item with no printed quantity column almost always means one
 * unit — default rather than leave it unknown. `total` then derives from
 * quantity*unit_price when the model didn't extract it directly.
 */
const deriveItemDefaults = (item: Record<string, unknown>): Record<string, unknown> => {
  const unit_price = "unit_price" in item ? coerceNumber(item.unit_price) : null;
  const quantity = ("quantity" in item ? coerceNumber(item.quantity) : null) ?? (unit_price !== null ? 1 : null);
  const total =
    ("total" in item ? coerceNumber(item.total) : null) ??
    (quantity !== null && unit_price !== null ? quantity * unit_price : null);
  return {
    ...item,
    quantity,
    unit_price,
    discount: "discount" in item ? coerceNumber(item.discount) : null,
    total,
  };
};

// Known bad-output shape: on some inputs the model echoes its own JSON
// schema field names back as fake item entries (e.g. an item literally
// named "note" or "unit_price") instead of stopping the array — observed
// even on a clean, well-formed transcript, so it's not just noise
// confusion. Verifiable without another LLM call: a real purchased item is
// never literally named one of these. Case-insensitive since the model's
// casing isn't consistent. Covers both RECEIPT_JSON_SCHEMA's own field
// names and the old flat voice-only ones (harmless overlap).
const SCHEMA_KEYWORDS = new Set([
  "title", "amount", "date", "note", "items", "unit_price", "quantity", "name", "total",
  "merchant", "transaction", "subtotal", "tax", "discount", "service_charge", "payment",
  "metadata", "method", "cash_received", "change", "currency", "confidence", "category",
  "receipt_number",
]);

// Related failure mode, worse in practice: the model splits a single
// sentence into one "item" per word instead of stopping at an empty array
// (observed: "Beli kopi 1 Rp20.000 di Berkah Jaya" -> ~20 items including
// "di", "Beli", the merchant name, and the price string itself, repeated
// several times each — a repetition-loop hallucination, not noise). None of
// these are ever a real purchased item's name. Applies to receipts too —
// no legitimate printed receipt item is named "di" or "the" either.
const ITEM_STOPWORDS = new Set([
  "di", "ke", "dan", "yang", "dengan", "dari", "untuk", "atau", "pada", "itu", "ini",
  "the", "a", "an", "at", "in", "on", "of", "and", "or", "to", "for", "with", "from",
]);

// A bare number/price string ("Rp20.000", "20000", "1") is never itself an
// item's name — it's the model echoing a token from the transcript instead
// of the thing that was bought.
const PRICE_TOKEN_RE = /^(rp\.?\s?)?[\d.,]+$/i;

// Same idea, glued quantity×price shape from OCR receipts where a "qty PC x
// price" line runs together with no spaces (e.g. "1PCxRp2.260") — safety net
// for prompt.ts rule 14, which is the real fix (this can only drop the item,
// never recover the real name that got lost above it).
const QTY_PRICE_TOKEN_RE = /^\d+\s*pcs?\s*x\s*(rp\.?\s?)?[\d.,]+$/i;

const isJunkItemName = (name: unknown): boolean => {
  if (typeof name !== "string") return false;
  const trimmed = name.trim().toLowerCase();
  if (trimmed === "") return true;
  return (
    SCHEMA_KEYWORDS.has(trimmed) ||
    ITEM_STOPWORDS.has(trimmed) ||
    PRICE_TOKEN_RE.test(trimmed) ||
    QTY_PRICE_TOKEN_RE.test(trimmed)
  );
};

// A real purchased item always costs *something* — the model leaves price
// null (rule 3) when it's genuinely unsure, it doesn't fabricate a literal
// 0. An item priced exactly 0/0 is the same hallucination-loop noise as the
// name-based junk above, just not catchable by name alone (e.g. "hari ini").
const isZeroValueJunk = (item: Record<string, unknown>): boolean => item.unit_price === 0 && item.total === 0;

const itemDedupeKey = (item: Record<string, unknown>): string =>
  JSON.stringify([typeof item.name === "string" ? item.name.trim().toLowerCase() : item.name, item.unit_price, item.total]);

/**
 * Filters junk items, coerces numeric fields, and dedupes exact-repeat
 * triples — shared by every path that produces an `items` array (receipt
 * OCR and voice transcript alike). A repetition-loop hallucination also
 * tends to repeat the exact same (name, price, total) triple verbatim —
 * deduped here rather than by name alone, since two genuinely distinct
 * items can share a name.
 */
const cleanItems = (rawItems: unknown): unknown[] => {
  if (!Array.isArray(rawItems)) return [];
  const seen = new Set<string>();
  const items: unknown[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (isJunkItemName(item.name)) continue;
    const normalized = deriveItemDefaults(item);
    if (isZeroValueJunk(normalized)) continue;
    const key = itemDedupeKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(normalized);
  }
  return items;
};

/**
 * Post-LLM normalization applied to the raw parsed candidate object *before*
 * Zod validation, so numeric/date/currency strings the model emits get
 * coerced into the shapes the schema expects rather than failing validation
 * outright. Operates defensively — any unexpected shape is left as-is for
 * Zod to reject.
 */
export const normalizeReceiptCandidate = (candidate: unknown): unknown => {
  if (typeof candidate !== "object" || candidate === null) return candidate;
  const c = candidate as Record<string, unknown>;
  const out: Record<string, unknown> = { ...c };

  const moneyFields = ["subtotal", "tax", "discount", "service_charge", "total"];
  for (const field of moneyFields) {
    if (field in out) out[field] = coerceNumber(out[field]);
  }

  out.items = cleanItems(out.items);

  // Subtotal is often only implied (e.g. an "ITEMS: n  <sum>" line the model
  // didn't map to subtotal) — compute it from item totals when every item
  // has one, rather than leave a derivable value null.
  if ((out.subtotal === null || out.subtotal === undefined) && Array.isArray(out.items) && out.items.length > 0) {
    const totals = (out.items as Array<Record<string, unknown>>).map((i) => i.total);
    if (totals.every((t) => typeof t === "number")) {
      out.subtotal = (totals as number[]).reduce((sum, t) => sum + t, 0);
    }
  }

  // A literal total of 0 is never a real completed purchase (no free
  // transactions) — almost always OCR/layout noise bleeding a nearby field
  // into the Total line. Recompute from subtotal instead of trusting 0
  // outright, before the tax-ambiguity check below — which would otherwise
  // reason about a total of 0 and derive a nonsensical discount from it.
  let totalRecoveredFromZero = false;
  if (out.total === 0 && typeof out.subtotal === "number" && out.subtotal > 0) {
    const discountForZeroTotal = typeof out.discount === "number" ? out.discount : 0;
    const serviceChargeForZeroTotal = typeof out.service_charge === "number" ? out.service_charge : 0;
    // Deliberately not adding tax back on: this app's receipts are
    // predominantly tax-inclusive (see rule 22) — subtotal alone is
    // usually already the real payable amount, and adding tax here would
    // double-count it (confirmed wrong on two real receipts). But we also
    // can't be *sure* tax is informational here (unlike a normally-printed
    // total, a recovered one carries real doubt) — totalRecoveredFromZero
    // below skips the tax-ambiguity block so a genuinely-additive tax on a
    // receipt like this doesn't get silently discarded; checkArithmetic
    // will flag the subtotal+tax/total mismatch instead of us guessing.
    out.total = out.subtotal - discountForZeroTotal + serviceChargeForZeroTotal;
    totalRecoveredFromZero = true;
  }

  // Whether a printed tax figure (e.g. a PPN/DPP disclosure) is additive or
  // already baked into the prices shown is a judgment call the model doesn't
  // reliably get right from a prompt rule alone — but it's checkable: compare
  // how close the total lands with vs without tax added on. discount/
  // service_charge default to 0 when null ("not printed" = no contribution,
  // same convention checkArithmetic uses) rather than blocking the check —
  // most receipts have no service charge at all.
  //
  // Deliberately a comparison, not "does it reconcile within tolerance": the
  // model's other fields (subtotal, discount) are themselves sometimes noisy
  // (typos, mis-summed voucher lines), so demanding an exact reconciliation
  // fails even on genuinely tax-inclusive receipts. Whichever fit is closer
  // wins; ties null the tax (matches rule 18 — don't keep a value that isn't
  // clearly justified).
  //
  // ponytail: can't distinguish "informational tax" from "real additive tax +
  // an unrecorded discount that happens to land closer without tax" — no
  // signal to tell those apart without the raw OCR text. Fine for now.
  if (
    !totalRecoveredFromZero &&
    typeof out.subtotal === "number" &&
    typeof out.total === "number" &&
    typeof out.tax === "number" &&
    out.tax !== 0
  ) {
    const discount = typeof out.discount === "number" ? out.discount : 0;
    const serviceCharge = typeof out.service_charge === "number" ? out.service_charge : 0;
    const withoutTax = out.subtotal - discount + serviceCharge;
    const withTax = withoutTax + out.tax;
    if (Math.abs(out.total - withoutTax) <= Math.abs(out.total - withTax)) {
      out.tax = null;
      // Now that tax is out of the equation, subtotal - discount + service =
      // total is the true relationship, and discount is its only unknown we
      // don't already trust — solve for it directly rather than trust the
      // model's own sum of multiple voucher/discount lines (same failure
      // mode as the tax judgment call: simple addition it gets wrong).
      out.discount = out.subtotal - out.total + serviceCharge;
    }
  }

  // Known bad-output shape: the model sometimes picks the first priced item
  // as merchant.name instead of the store header. Verifiable without an LLM
  // call — if merchant.name is literally one of the item names, it's wrong.
  // Null it (buildSuggestedTitle falls back cleanly) rather than title the
  // expense after an item.
  if (
    typeof out.merchant === "object" &&
    out.merchant !== null &&
    Array.isArray(out.items)
  ) {
    const merchant = out.merchant as Record<string, unknown>;
    const name = typeof merchant.name === "string" ? merchant.name.trim().toLowerCase() : null;
    const isItemName = name !== null && (out.items as Array<Record<string, unknown>>).some(
      (item) => typeof item.name === "string" && item.name.trim().toLowerCase() === name,
    );
    if (isItemName) {
      out.merchant = { ...merchant, name: null };
    }
  }

  if (typeof out.transaction === "object" && out.transaction !== null) {
    const t = out.transaction as Record<string, unknown>;
    out.transaction = { ...t, date: coerceDate(t.date) };
  }

  if (typeof out.payment === "object" && out.payment !== null) {
    const p = out.payment as Record<string, unknown>;
    const cash_received = "cash_received" in p ? coerceNumber(p.cash_received) : null;
    out.payment = {
      ...p,
      amount: "amount" in p ? coerceNumber(p.amount) : null,
      cash_received,
      // "Change" only means anything alongside a cash-tendered amount
      // (rule 18) — a QRIS/bank-transfer payment has no cash_received, so
      // it can't have genuine physical change either; a printed "Change"
      // line there is either a POS template artifact or OCR/layout noise
      // bleeding a nearby field in (same category as the total=0 issue).
      change: cash_received !== null && "change" in p ? coerceNumber(p.change) : null,
    };
  }

  // Known bad-output shape: the model sometimes sums several different
  // printed money lines together into "total" instead of reading the one
  // literal Total line (e.g. subtotal + cash tendered + change, ~2x the real
  // total) — especially on rough OCR text. Verifiable without an LLM call:
  // cash_received - change is an independent identity that should equal
  // total. Only correct when it also agrees with the subtotal->total chain —
  // two independent signals corroborating each other beats trusting the
  // model's own (possibly summed-wrong) total, but a single signal alone
  // isn't enough grounds to overwrite it (the payment fields could be the
  // wrong ones instead).
  if (
    typeof out.total === "number" &&
    typeof out.payment === "object" &&
    out.payment !== null
  ) {
    const { cash_received, change } = out.payment as Record<string, unknown>;
    if (typeof cash_received === "number" && typeof change === "number") {
      const expectedFromCash = cash_received - change;
      if (!withinTolerance(expectedFromCash, out.total)) {
        const discount = typeof out.discount === "number" ? out.discount : 0;
        const serviceCharge = typeof out.service_charge === "number" ? out.service_charge : 0;
        const tax = typeof out.tax === "number" ? out.tax : 0;
        if (typeof out.subtotal === "number") {
          const expectedFromSubtotal = out.subtotal - discount + serviceCharge + tax;
          if (withinTolerance(expectedFromSubtotal, expectedFromCash)) {
            out.total = expectedFromCash;
          }
        }
      }
    }
  }

  // Stronger case than the cash-corroborated one above: when tax, discount,
  // and service_charge are all absent/zero, total isn't just usually equal
  // to subtotal on that receipt — it's structurally required to be (same
  // identity checkArithmetic uses, but with every other term at zero there's
  // no free variable left that could explain a difference). No payment data
  // needed to corroborate; the equation alone settles it. Catches e.g. a
  // single OCR-misread digit on the printed Total line that the model just
  // copied through.
  //
  // ponytail: if a receipt genuinely has real tax/discount/service that the
  // model also failed to extract (wrongly left null), this pulls total down
  // to match subtotal incorrectly — same accepted trade-off as the tax-null
  // and payment.amount-sync fixes above (a silently-wrong total is the more
  // commonly observed failure).
  if (
    typeof out.subtotal === "number" &&
    typeof out.total === "number" &&
    (out.tax === null || out.tax === undefined || out.tax === 0) &&
    (out.discount === null || out.discount === undefined || out.discount === 0) &&
    (out.service_charge === null || out.service_charge === undefined || out.service_charge === 0) &&
    !withinTolerance(out.subtotal, out.total)
  ) {
    out.total = out.subtotal;
  }

  // This schema has no split-payment concept — payment.amount is always
  // meant to be the same number as total (the amount paid for the whole
  // transaction). The model sometimes extracts them independently and gets
  // one wrong (e.g. the same summing bug above can hit amount too) — once
  // total is known/corrected, trust it over a disagreeing payment.amount
  // rather than show two different numbers for the same thing in the UI.
  if (
    typeof out.total === "number" &&
    typeof out.payment === "object" &&
    out.payment !== null
  ) {
    const p = out.payment as Record<string, unknown>;
    if (typeof p.amount !== "number" || !withinTolerance(p.amount, out.total)) {
      out.payment = { ...p, amount: out.total };
    }
  }

  if (typeof out.metadata === "object" && out.metadata !== null) {
    const m = out.metadata as Record<string, unknown>;
    out.metadata = { ...m, currency: coerceCurrency(m.currency) };
  }

  return out;
};
