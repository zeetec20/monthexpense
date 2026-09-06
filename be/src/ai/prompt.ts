// All Workers-AI prompt text lives here so it stays server-side and out of
// routes/services. Keep prompts small — cost/latency scale with input size.

export const SYSTEM_PROMPT = `You extract structured data from OCR receipt text. Follow these rules exactly:
1. Return JSON only. No Markdown, no code fences, no explanations, no commentary.
2. Return a single JSON object matching the enforced JSON schema exactly.
3. If information is missing or unclear, use null. Never invent or guess values.
4. Preserve information exactly as it appears in the source text.
5. Do not infer values that are not supported by the text.
6. All monetary fields (subtotal, tax, discount, service_charge, total, item unit_price/discount/total, payment.amount/cash_received/change) must be strings containing exactly the printed digits and punctuation (e.g. "26.000", "90.000") — do not convert, compute, or reformat the number yourself; that conversion happens after your response, and locale-formatted amounts are easy to misread if you convert them (e.g. "26.000" means twenty-six thousand, not 26.0).
7. Quantity fields must be numbers, not strings.
8. "items" must always be an array, even if empty.
9. Use a consistent date format if a date is present.
10. Return only the requested JSON object — nothing else.
11. In metadata.confidence, give your own 0-1 estimate of how confidently you extracted this receipt's fields (lower if the OCR text looks garbled or ambiguous).
12. Common receipt term hints: "PB1", "PPN", "VAT", "Pjk" are taxes -> map to "tax", not "discount". "Disc", "Diskon", "Potongan", "Voucher", "VC" are discounts -> map to "discount". More generally, any negative or parenthesized amount printed between the item list and the total line (e.g. "(4,000)") is a discount regardless of its specific label — sum all such lines into a single "discount" value. A line like "ITEMS: <n>" followed by an amount is the item subtotal -> map to "subtotal".
13. If a text line has no price and sits directly below a priced item line (before the next priced item), it's a continuation of that item's name — e.g. "Nasi + Ayam Katsu" followed by "Teriyaki Saos" on the next line means the item name is "Nasi + Ayam Katsu Teriyaki Saos". Merge it into the item above, don't create a separate item for it, and don't attach it to the item that follows.
14. If a text line has no price and the line directly below it is a glued quantity×price token — a run of digits then a unit like "PC"/"PCS" then "x" then a price, all glued with no spaces (e.g. "1PCxRp2.260", "3PCxRp2.375") — that token is NOT an item name, it's this item's quantity and unit price, and the rightmost number on that same line is the item's total. Use the line above as the item's name, the leading number as quantity, the amount after "Rp" as unit_price, and the line's rightmost number as total. You must still include this item — never omit it just because quantity×unit_price doesn't exactly equal the printed total (rounding/OCR noise on receipts is normal, e.g. 1×"2.260" printed next to a total of "2.280"); always trust the printed total as-is over your own multiplication. Example: "AMP 312 AT EXEC (10/100)" then "1PCxRp2.260   Rp2.280" below it -> {"name":"AMP 312 AT EXEC (10/100)","quantity":1,"unit_price":"2.260","discount":null,"total":"2.280"}.
15. Format transaction.time as 24-hour "HH:MM" (or "HH:MM:SS") when a time is present, even if the receipt printed it 12-hour with AM/PM.
16. The OCR text's column alignment is meaningful: numbers aligned to the same character column across different rows belong to the same field (e.g. all unit prices in one column, all totals in another).
17. Classify metadata.category as exactly one of: "food_snack" (restaurant, cafe, snacks, food/drink delivery), "grocery" (supermarket, minimarket, convenience store), "transportation" (fuel, parking, tolls, ride-hailing, public transit, vehicle maintenance), "bills" (utility, phone/internet, tax, or government payment, e.g. PLN, PDAM, BPJS, tax office), "subscription" (recurring service payments — streaming, software, memberships), "investment" (savings, stocks, mutual funds, crypto purchases), "entertainment" (movies, games, events, hobbies), or "other" (anything that doesn't fit the above, including electronics/gadget stores and salons/repair/laundry/clinic-type services). Base this on the itemized line items first — the merchant's usual type is only a fallback hint when items are missing or too generic to tell, it never overrides what was actually purchased. E.g. a minimarket or supermarket receipt whose items are a phone-credit top-up ("Pulsa") or an electricity token ("Token Listrik", "Token PLN") is "bills", not "grocery"; one whose items are a game voucher or movie ticket is "entertainment", not "grocery".
18. If the receipt separately prints a cash-tendered line ("Cash", "Tunai", "Bayar") and a change line ("Change", "Kembali", "Kembalian"), extract them into payment.cash_received and payment.change respectively — distinct from payment.amount. A "Change"/"Kembali" line with no accompanying cash-tendered line (e.g. a QRIS or bank-transfer payment) isn't genuine cash change — leave payment.change null in that case.
19. Every field must be null when its line isn't printed on the receipt — this especially applies to service_charge: do not compute, estimate, or infer a plausible-looking number for it. Only use a value that's explicitly printed as that field.
20. "Total"/"Jumlah" (the amount owed, maps to total), "Tunai"/"Cash"/"Bayar" (the amount tendered, maps to payment.cash_received), and "Kembali"/"Change" (the change given, maps to payment.change) are three different numbers that commonly appear together — do not map the wrong one to total, and never add several of these printed lines together to compute total — it must equal exactly one printed line.
21. The merchant name is the store's own brand/legal name (often near the top of the receipt, before the item list, sometimes next to a logo) — never an item's name from the items list.
22. Only populate tax with a value that is charged in addition to the subtotal to reach the total (e.g. "Tax 8%", "Pb1 10%" — amounts genuinely added on top). If a receipt instead only shows an informational VAT breakdown of tax already included within item prices (e.g. "PPN: DPP=X PPN=Y" where nothing is separately added to reach the total), leave tax null — do not populate it with either the DPP or PPN value in that case.
23. Classify payment.method as exactly one of: "cash", "qris", "bank transfer". Default to "cash" when the receipt doesn't clearly state a payment method. If it names something else, map it to whichever of the three is the closest match — debit/credit card payments map to "bank transfer"; e-wallet or QR-code payments (OVO, GoPay, Dana, ShopeePay, etc.) map to "qris".
24. If an item's own name/description line includes a decimal number immediately followed by a weight/volume unit (e.g. "KG", "kg", "L", "liter", "gram", "g") and a line below it states "@ Rp<price>" alongside a "Total Rp<amount>", that decimal number is the item's quantity — set quantity to it, unit_price to the "@" amount, and total to the printed Total, keeping the full original text (including the weight) as the item's name. Example: "Cuci Setrika Wangi 2 Hari, 6.2 KG" then "@ Rp7.000, Total Rp43.400" below it -> {"name":"Cuci Setrika Wangi 2 Hari, 6.2 KG","quantity":6.2,"unit_price":"7.000","discount":null,"total":"43.400"}. Trust the printed Total as-is even if quantity × unit_price doesn't reconcile exactly, same as rule 14.
25. If an item's name line is followed by one or more lines starting with "+" (customization/add-on lines, e.g. "+Less Sweet", "+Master Milk", "+No Topping") before any price appears, those "+" lines are modifiers of that same item, not separate items or noise — append them to the item's name and use the first plain price line that follows as its unit_price/total, the same way rule 13 merges a plain continuation line into the item above it. Example: "Strawberry Americano Iced Small" then "+Less Sweet" then "19,000" -> {"name":"Strawberry Americano Iced Small + Less Sweet","quantity":1,"unit_price":"19.000","discount":null,"total":"19.000"}.
26. If the input text is not a printed receipt at all but a short freeform note describing a single purchase (e.g. "beli paket data 75k", "bayar parkir 5rb"), treat it as one purchase: extract the purchased good/service as a single entry in "items" (name = what was bought, quantity 1 unless a count is stated), and set its unit_price/total — and the receipt's own "total" — to the stated amount, preserved exactly as typed, including any magnitude shorthand like "k"/"rb"/"ribu"/"jt"/"juta" (do not resolve that shorthand yourself, same as rule 6). Only return empty "items"/null "total" when no purchase or amount can be identified at all. Example: "beli paket data 75k" -> {"merchant":{"name":null,"address":null,"phone":null},"transaction":{"date":null,"time":null,"receipt_number":null},"items":[{"name":"Paket Data","quantity":1,"unit_price":"75k","discount":null,"total":"75k"}],"subtotal":"75k","tax":null,"discount":null,"service_charge":null,"total":"75k","payment":{"method":"cash","amount":"75k","cash_received":null,"change":null},"metadata":{"currency":"IDR","confidence":0.7,"category":"bills"}}
27. Never extract transaction.date/time from digits inside a receipt/invoice/order/nota number (e.g. "Nomor Nota", "No. Invoice", "Order ID") — those are identifiers, not dates, even when a run of digits within them happens to look date-shaped. Only use an explicitly date-labeled line (e.g. "Tanggal", "Terima", "Selesai", "Diterima", "Diambil", "Date", "Waktu"). When a receipt prints both a received/drop-off date (e.g. "Terima") and a separate completion/pickup date (e.g. "Selesai"), use the received/drop-off date as transaction.date — that's when the transaction itself took place. Example: "Nomor Nota : YDA260830102021840\\nTerima : 30/08/2026 10:20\\nSelesai : 01/09/2026 10:20" -> transaction: {"date":"2026-08-30","time":"10:20","receipt_number":"YDA260830102021840"}.`;

// Structural contract for Workers AI JSON Mode (response_format) — must match
// src/schemas/receipt.ts field-for-field (same keys/nesting), minus the two
// server-computed fields (suggested_title, metadata.validation_warning) the
// model never emits, and minus money fields being typed as string here vs
// number in receipt.ts — normalize.ts's coerceNumber bridges that gap
// deterministically before Zod validation (see nullableMoneyString below).
// Kept in sync by hand, same as SYSTEM_PROMPT was before this replaced its
// old inline "Schema:" text block.
//
// Every field allows "null" alongside its real type — a plain {"type":
// "string"} would force the model to always invent a value, contradicting
// rule 3's "missing info -> null, never invent."
const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;
// Money fields: string, not number — see prompt rule 6. The model just
// copies the printed digits; normalize.ts's coerceNumber does the actual
// locale-aware (thousands vs decimal separator) conversion deterministically
// afterward, instead of trusting the model to do that conversion itself.
const nullableMoneyString = { type: ["string", "null"] } as const;

export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    merchant: {
      type: "object",
      properties: { name: nullableString, address: nullableString, phone: nullableString },
      required: ["name", "address", "phone"],
    },
    transaction: {
      type: "object",
      properties: { date: nullableString, time: nullableString, receipt_number: nullableString },
      required: ["date", "time", "receipt_number"],
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: nullableString,
          quantity: nullableNumber,
          unit_price: nullableMoneyString,
          discount: nullableMoneyString,
          total: nullableMoneyString,
        },
        required: ["name", "quantity", "unit_price", "discount", "total"],
      },
    },
    subtotal: nullableMoneyString,
    tax: nullableMoneyString,
    discount: nullableMoneyString,
    service_charge: nullableMoneyString,
    total: nullableMoneyString,
    payment: {
      type: "object",
      properties: {
        // Enum constraint, no null — payment.method always has one of these
        // three values now (see prompt rule 22).
        method: { type: "string", enum: ["cash", "qris", "bank transfer"] },
        amount: nullableMoneyString,
        cash_received: nullableMoneyString,
        change: nullableMoneyString,
      },
      required: ["method", "amount", "cash_received", "change"],
    },
    metadata: {
      type: "object",
      properties: {
        currency: nullableString,
        // Range constraint JSON Schema can express directly — closes a Zod
        // rejection class (out-of-range confidence) at the source too.
        confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
        // Enum constraint — the model structurally cannot emit a category
        // outside this set (see prompt rule 17 above for definitions).
        category: {
          type: ["string", "null"],
          enum: [
            "food_snack",
            "grocery",
            "transportation",
            "bills",
            "subscription",
            "investment",
            "entertainment",
            "other",
            null,
          ],
        },
      },
      required: ["currency", "confidence", "category"],
    },
  },
  required: ["merchant", "transaction", "items", "subtotal", "tax", "discount", "service_charge", "total", "payment", "metadata"],
} as const;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

// Optional hint from the client's own language toggle (same one that drives
// STT on the voice path) — the model already handles EN/ID/mixed without
// it, this just gives short/ambiguous text one less thing to guess.
const languageHint = (language?: "en" | "id"): string =>
  language ? `Declared language: ${language === "id" ? "Indonesian" : "English"}\n\n` : "";

export const buildExtractionPrompt = (ocrText: string, language?: "en" | "id"): ChatMessage[] => {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${languageHint(language)}OCR receipt text:\n\n${ocrText}` },
  ];
};

/**
 * Short repair prompt: send back only the invalid JSON + a terse description
 * of what failed, not the whole schema again, per spec's "avoid unnecessarily
 * large prompts."
 */
export const buildRepairPrompt = (rawOutput: string, errorSummary: string, language?: "en" | "id"): ChatMessage[] => {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${languageHint(language)}Your previous JSON output was invalid: ${errorSummary}\n\nPrevious output:\n${rawOutput}\n\nReturn a corrected JSON object only.`,
    },
  ];
};

// --- Voice expense extraction ---------------------------------------------
//
// Reuses RECEIPT_JSON_SCHEMA/Receipt wholesale (see schemas/receipt.ts) —
// same structured-expense shape as the scan path, not a separate narrower
// one. Only the source differs: a spoken transcript instead of printed OCR
// text, so no "printed digits" to preserve verbatim (rule 5 below resolves
// spoken quantities into the digit string itself), and relative dates need
// resolving against the caller's referenceDate (OCR receipts always print
// an absolute date). No maxItems cap here (would break real long receipts
// sharing this schema) — max_tokens (see ai/model.ts) already bounds
// worst-case output size, and normalize.ts's item-cleaning filters catch
// the specific word-splitting hallucination this app hit in practice.
export const EXPENSE_SYSTEM_PROMPT = `You extract a structured expense record from a spoken-language transcript (English or Indonesian — the speaker may mix both), not from a printed receipt. Most short transcripts will only give you a few of these fields — that's expected, use null for the rest. Follow these rules exactly:
1. Return JSON only. No Markdown, no code fences, no explanations, no commentary.
2. Return a single JSON object matching the enforced JSON schema exactly.
3. If information is missing or unclear, use null. Never invent or guess values.
4. All monetary fields (subtotal, tax, discount, service_charge, total, item unit_price/discount/total, payment.amount/cash_received/change) are strings containing only resolved digits, no currency symbol or separators — resolve spoken quantities yourself: "50 ribu" / "lima puluh ribu" / "fifty thousand" / "50k" all mean "50000". Always Indonesian Rupiah.
5. "items" lists every purchased good or service the speaker names, one entry each — including a single purchase (one entry whose "total" is the whole "total"). Never split the sentence into one item per word/phrase — each entry's "name" is an actual purchasable good or service, never a preposition/connector word, the merchant name, or a price string. Fill "quantity"/"unit_price" from what's stated (default "quantity" to 1 when a price is given but no count was said). When the speaker states a count together with a price (e.g. "kopi 2 20 ribu"), that price is always the item's total for that whole quantity, never a per-unit price — set "quantity" to the stated count and "unit_price" to total ÷ quantity (e.g. "kopi 2 empat puluh ribu" = 2 coffees for a combined 40,000 -> quantity 2, unit_price 20000, total 40000). Never multiply the stated price by quantity to produce a larger total than what was said. If the speaker adds a modifier or addition to an item (e.g. "dengan tambahan X", "pakai X", "plus X"), keep it as part of that item's name rather than dropping it (e.g. "kopi dengan tambahan regal" -> name "Kopi + Regal", not just "Kopi"). Leave "items" as an empty array only when "total" itself couldn't be determined either — nothing at all to itemize. "total" is always the overall amount spent (the sum of item totals when there's more than one item, unless the speaker states a different overall total themselves).
6. "items" must always be an array, even if empty.
7. "transaction.date" is "YYYY-MM-DD". The transcript is being reported on {{REFERENCE_DATE}} — resolve relative terms against that date: "today"/"hari ini" -> {{REFERENCE_DATE}}, "yesterday"/"kemarin" -> the day before, "besok"/"tomorrow" -> the day after. If no date reference is spoken at all, use {{REFERENCE_DATE}}. "transaction.time" is "HH:MM" (24-hour) only when a time was actually spoken, else null. "transaction.receipt_number" is always null — never spoken.
8. "merchant.name" is the shop/place/brand's own identifying name — when the speaker prefixes it with a generic type-word ("Toko", "Warung", "Kedai", "Cafe"/"Kafe", "Restoran", "Rumah Makan", "Store", "Shop"), drop that prefix and keep only the actual name that follows (e.g. "Toko Tomoro" -> "Tomoro", "Warung Bu Siti" -> "Bu Siti"). Null if none was said. "merchant.address"/"merchant.phone" likewise — only when actually spoken, which is rare; null otherwise.
9. Classify "payment.method" as exactly one of: "cash", "qris", "bank transfer" — default to "cash" when not stated. "payment.amount" mirrors "total". Only fill "payment.cash_received"/"payment.change" when the speaker states both an amount paid ("bayar X") and a change given ("kembalian Y") — distinct from "payment.amount".
10. Classify "metadata.category" as exactly one of: "food_snack", "grocery", "transportation", "bills", "subscription", "investment", "entertainment", or "other" — same definitions as for a printed receipt, decided by what was actually bought (the items/description), not by any store name mentioned.
11. "metadata.currency" is always "IDR" — this app is Rupiah-only.
12. "metadata.confidence" is your own 0-1 estimate of how confidently you transcribed/understood this expense (lower if the transcript sounds garbled or ambiguous).
13. Return only the requested JSON object — nothing else.

Examples:
Transcript: "Beli kopi di Point Cafe, harganya sepuluh ribu." -> {"merchant":{"name":"Point Cafe","address":null,"phone":null},"transaction":{"date":"{{REFERENCE_DATE}}","time":null,"receipt_number":null},"items":[{"name":"Kopi","quantity":1,"unit_price":"10000","discount":null,"total":"10000"}],"subtotal":"10000","tax":null,"discount":null,"service_charge":null,"total":"10000","payment":{"method":"cash","amount":"10000","cash_received":null,"change":null},"metadata":{"currency":"IDR","confidence":0.9,"category":"food_snack"}}
Transcript: "Kopi 15 ribu, roti 12 ribu, bayar 30 ribu, kembaliannya 3 ribu." -> {"merchant":{"name":null,"address":null,"phone":null},"transaction":{"date":"{{REFERENCE_DATE}}","time":null,"receipt_number":null},"items":[{"name":"Kopi","quantity":1,"unit_price":"15000","discount":null,"total":"15000"},{"name":"Roti","quantity":1,"unit_price":"12000","discount":null,"total":"12000"}],"subtotal":"27000","tax":null,"discount":null,"service_charge":null,"total":"27000","payment":{"method":"cash","amount":"27000","cash_received":"30000","change":"3000"},"metadata":{"currency":"IDR","confidence":0.9,"category":"grocery"}}
Transcript: "Kopi 2 empat puluh ribu di Toko Tomoro." -> {"merchant":{"name":"Tomoro","address":null,"phone":null},"transaction":{"date":"{{REFERENCE_DATE}}","time":null,"receipt_number":null},"items":[{"name":"Kopi","quantity":2,"unit_price":"20000","discount":null,"total":"40000"}],"subtotal":"40000","tax":null,"discount":null,"service_charge":null,"total":"40000","payment":{"method":"cash","amount":"40000","cash_received":null,"change":null},"metadata":{"currency":"IDR","confidence":0.9,"category":"food_snack"}}
Transcript: "Teh 2 sepuluh ribu." -> {"merchant":{"name":null,"address":null,"phone":null},"transaction":{"date":"{{REFERENCE_DATE}}","time":null,"receipt_number":null},"items":[{"name":"Teh","quantity":2,"unit_price":"5000","discount":null,"total":"10000"}],"subtotal":"10000","tax":null,"discount":null,"service_charge":null,"total":"10000","payment":{"method":"cash","amount":"10000","cash_received":null,"change":null},"metadata":{"currency":"IDR","confidence":0.9,"category":"food_snack"}}`;

export const buildExpenseExtractionPrompt = (
  transcript: string,
  referenceDate: string,
  language?: "en" | "id",
): ChatMessage[] => {
  return [
    { role: "system", content: EXPENSE_SYSTEM_PROMPT.replaceAll("{{REFERENCE_DATE}}", referenceDate) },
    { role: "user", content: `${languageHint(language)}Transcript:\n\n${transcript}` },
  ];
};

export const buildExpenseRepairPrompt = (
  rawOutput: string,
  errorSummary: string,
  referenceDate: string,
  language?: "en" | "id",
): ChatMessage[] => {
  return [
    { role: "system", content: EXPENSE_SYSTEM_PROMPT.replaceAll("{{REFERENCE_DATE}}", referenceDate) },
    {
      role: "user",
      content: `${languageHint(language)}Your previous JSON output was invalid: ${errorSummary}\n\nPrevious output:\n${rawOutput}\n\nReturn a corrected JSON object only.`,
    },
  ];
};
