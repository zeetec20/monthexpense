import { z } from "zod";

// Canonical receipt domain schema — source of truth for the JSON contract.
// Rule: missing info -> null, never invented. Monetary/quantity fields numeric.
// `items` is always an array (default []), never omitted.

export const ReceiptCategorySchema = z.enum([
  "food_snack",
  "grocery",
  "transportation",
  "bills",
  "subscription",
  "investment",
  "entertainment",
  "other",
]);
export type ReceiptCategory = z.infer<typeof ReceiptCategorySchema>;

export const ReceiptPaymentMethodSchema = z.enum(["cash", "qris", "bank transfer"]);
export type ReceiptPaymentMethod = z.infer<typeof ReceiptPaymentMethodSchema>;

export const ReceiptItemSchema = z.object({
  name: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  discount: z.number().nullable(),
  total: z.number().nullable(),
});
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

export const ReceiptSchema = z.object({
  merchant: z.object({
    name: z.string().nullable(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  transaction: z.object({
    date: z.string().nullable(),
    time: z.string().nullable(),
    receipt_number: z.string().nullable(),
  }),
  items: z.array(ReceiptItemSchema).default([]),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  discount: z.number().nullable(),
  service_charge: z.number().nullable(),
  total: z.number().nullable(),
  payment: z.object({
    // Constrained to the enum via JSON Mode (never free-form) — the model
    // structurally can't emit anything outside {cash, qris, bank transfer}.
    // .default("cash") is just a defensive fallback for an omitted field,
    // not the primary mechanism (see prompt rule 22).
    method: ReceiptPaymentMethodSchema.default("cash"),
    amount: z.number().nullable(),
    // Cash tendered / change given — common pair on printed receipts
    // ("Cash 200,000" / "Change 48,000", "Tunai" / "Kembali") that
    // payment.amount alone doesn't capture. See parser/validate.ts for the
    // cash_received - change ≈ total cross-check.
    cash_received: z.number().nullable(),
    change: z.number().nullable(),
  }),
  metadata: z.object({
    currency: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    // Model-picked (constrained to the enum via JSON Mode) — feeds
    // parser/title.ts's category-aware phrasing, not shown to the client
    // directly (yet).
    category: ReceiptCategorySchema.nullable().default(null),
    // Deterministic, computed post-validation in services/receipt-parser.ts
    // (see parser/validate.ts) — never part of the model's own output, so
    // it always defaults to null here and gets overwritten before response.
    // Both languages always sent together (see validate.ts's Bilingual) —
    // FE picks the half matching its current app language.
    validation_warning: z.object({ en: z.string(), id: z.string() }).nullable().default(null),
  }),
  // Deterministic, computed post-validation in services/receipt-parser.ts —
  // never part of the model's own output (not in prompt.ts's Schema block),
  // so it always defaults to null here and gets overwritten before response.
  suggested_title: z.string().nullable().default(null),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
