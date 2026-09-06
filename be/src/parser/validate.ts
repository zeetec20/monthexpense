import type { Receipt } from "../schemas/receipt";

// Relative, not absolute — currencies differ by orders of magnitude (IDR
// thousands vs USD units) and real receipts round by a few units (a real
// Solaria receipt had a printed "Rounding -5" line). Floor of 1 so a
// receipt with tiny totals doesn't get a zero tolerance.
export const withinTolerance = (a: number, b: number): boolean => {
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
};

/** Both language versions of the same warning — these are deterministic,
 * template-generated strings (not model output), so producing both is just
 * a second template per message. FE picks the half matching the app's
 * current language (see ExpenseReviewModal.tsx). */
export interface Bilingual {
  en: string;
  id: string;
}

/**
 * Deterministic arithmetic cross-checks — same category as the
 * quantity/subtotal defaults in normalize.ts: computed from what the model
 * already extracted, never invented. Returns a short warning when the
 * numbers don't reconcile (most useful signal: item totals falling short of
 * a printed subtotal usually means an item was missed), or null when
 * everything checks out or there isn't enough data to check.
 */
export const checkArithmetic = (receipt: Receipt): Bilingual | null => {
  const itemTotals = receipt.items.map((item) => item.total);
  const haveAllItemTotals = receipt.items.length > 0 && itemTotals.every((t): t is number => typeof t === "number");

  if (haveAllItemTotals && receipt.subtotal !== null) {
    const sum = itemTotals.reduce((s, t) => s + (t as number), 0);
    if (!withinTolerance(sum, receipt.subtotal)) {
      return {
        en: `Item totals (${sum}) don't add up to the printed subtotal (${receipt.subtotal}) — an item may be missing.`,
        id: `Total item (${sum}) tidak sesuai dengan subtotal yang tercetak (${receipt.subtotal}) — mungkin ada item yang terlewat.`,
      };
    }
  }

  if (receipt.subtotal !== null && receipt.tax !== null && receipt.total !== null) {
    // Missing discount/service_charge = "not printed" = no contribution
    // (same convention normalize.ts's tax-reconciliation step uses) —
    // requiring both to be non-null to even run this check meant it never
    // fired for the common case of a receipt with no discount/service
    // charge printed at all.
    const discount = receipt.discount ?? 0;
    const serviceCharge = receipt.service_charge ?? 0;
    const expectedTotal = receipt.subtotal + receipt.tax - discount + serviceCharge;
    if (!withinTolerance(expectedTotal, receipt.total)) {
      return {
        en: `Subtotal, tax, discount, and service charge (${expectedTotal}) don't add up to the printed total (${receipt.total}).`,
        id: `Subtotal, pajak, diskon, dan biaya layanan (${expectedTotal}) tidak sesuai dengan total yang tercetak (${receipt.total}).`,
      };
    }
  }

  for (const item of receipt.items) {
    if (item.quantity === null || item.unit_price === null || item.total === null) continue;
    if (!withinTolerance(item.quantity * item.unit_price, item.total)) {
      return {
        en: `"${item.name ?? "An item"}"'s quantity × unit price doesn't match its printed total.`,
        id: `Kuantitas × harga satuan "${item.name ?? "sebuah item"}" tidak sesuai dengan total yang tercetak.`,
      };
    }
  }

  const { cash_received, change } = receipt.payment;
  if (cash_received !== null && change !== null && receipt.total !== null) {
    const expectedTotal = cash_received - change;
    if (!withinTolerance(expectedTotal, receipt.total)) {
      return {
        en: `Cash received minus change (${expectedTotal}) doesn't match the printed total (${receipt.total}).`,
        id: `Tunai diterima dikurangi kembalian (${expectedTotal}) tidak sesuai dengan total yang tercetak (${receipt.total}).`,
      };
    }
  }

  return null;
};

/**
 * Voice-only second pass, chained after checkArithmetic (which only fires
 * when there's enough independent data to cross-check — a plain "one item,
 * nothing else stated" transcript has nothing for it to compare). This
 * checks completeness instead: did the model come back with the pieces the
 * transcript should have given it a chance to fill in. Same deterministic,
 * computed-from-already-extracted-fields spirit — never re-asks the model,
 * never invents a value, just flags what to double-check in the UI.
 */
export const checkVoiceCompleteness = (expense: Receipt): Bilingual | null => {
  if (expense.total === null) {
    return {
      en: "The amount wasn't clear from the recording — please check or edit it.",
      id: "Jumlah tidak jelas dari rekaman — mohon periksa atau edit.",
    };
  }

  if (expense.items.some((item) => item.name === null || item.unit_price === null)) {
    return {
      en: "An item's name or price wasn't clear — please check or edit it.",
      id: "Nama atau harga item tidak jelas — mohon periksa atau edit.",
    };
  }

  // Only flagged when there's something to itemize — a plain "taxi 50 ribu"
  // rarely has a merchant to begin with, so a null merchant there isn't a
  // sign anything was missed the way it is for a purchase-at-a-place.
  if (expense.items.length > 0 && expense.merchant.name === null) {
    return {
      en: "The store or brand name wasn't clear — please check or edit it.",
      id: "Nama toko atau merek tidak jelas — mohon periksa atau edit.",
    };
  }

  return null;
};
