import { z } from "zod";

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

const receiptItemSchema = z.object({
  name: nullableString,
  quantity: nullableNumber,
  unit_price: nullableNumber,
  discount: nullableNumber,
  total: nullableNumber,
});

const merchantSchema = z.object({
  name: nullableString,
  address: nullableString,
  phone: nullableString,
});

const transactionSchema = z.object({
  date: nullableString,
  time: nullableString,
  receipt_number: nullableString,
});

const paymentSchema = z.object({
  method: nullableString,
  amount: nullableNumber,
  // Cash tendered / change given — see
  // text-processing-slm/src/parser/validate.ts's cash-vs-total cross-check.
  // .optional() for the same lagging-deploy reason as suggested_title below.
  cash_received: nullableNumber.optional(),
  change: nullableNumber.optional(),
});

const metadataSchema = z.object({
  currency: nullableString,
  confidence: nullableNumber,
  // Model-picked category (see text-processing-slm/src/schemas/receipt.ts's
  // ReceiptCategorySchema) — .optional() for the same lagging-deploy reason
  // as validation_warning below. Was missing entirely until now, which
  // meant the backend's category was silently stripped by zod on every
  // parse (zod drops keys not declared in the schema) — never reached the
  // client at all.
  category: nullableString.optional(),
  // Deterministic arithmetic cross-check ("item totals don't add up to the
  // subtotal — an item may be missing") — see
  // text-processing-slm/src/parser/validate.ts.
  //
  // .optional() (not just .nullable()): the deployed backend can lag behind
  // this client — it hot-reloads instantly, the backend needs a manual
  // `wrangler deploy` — so this key may be entirely absent, not just null,
  // until that catches up. Treat missing the same as null rather than
  // hard-failing the whole scan over one nice-to-have field.
  // Both languages always sent together — ExpenseReviewModal picks the
  // half matching the app's current language.
  validation_warning: z.object({ en: z.string(), id: z.string() }).nullable().optional(),
});

export const receiptSchema = z.object({
  merchant: merchantSchema,
  transaction: transactionSchema,
  items: z.array(receiptItemSchema),

  subtotal: nullableNumber,
  tax: nullableNumber,
  discount: nullableNumber,
  service_charge: nullableNumber,
  total: nullableNumber,

  payment: paymentSchema,

  metadata: metadataSchema,

  // Deterministic ("Lunch at Solaria on 07:00pm"), computed backend-side —
  // see text-processing-slm/src/parser/title.ts. .optional() for the same
  // lagging-deploy reason as metadata.validation_warning above.
  suggested_title: nullableString.optional(),
});

export const receiptResponseSchema = z.object({
  data: receiptSchema,
  // Daily scan/voice/text quota remaining, set by BE's identityQuota
  // middleware (see text-processing-slm/src/middleware/identity-quota.ts)
  // — .optional() for the same lagging-deploy reason as validation_warning
  // above.
  quota: z.object({ remaining: z.number(), limit: z.number() }).optional(),
});

export type Receipt = z.infer<typeof receiptSchema>;
export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;
