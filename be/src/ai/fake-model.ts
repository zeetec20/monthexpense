import type { ReceiptModel, ExpenseModel, TranscribeModel } from "./model";

/**
 * Test/local-dev double for ReceiptModel. Used when LOCAL_MOCK_AI=true
 * (wrangler dev has no local Workers AI simulation — --remote burns real
 * neurons) and injected directly in route/service tests so no real AI call
 * ever happens in CI.
 *
 * Default behavior returns a minimal valid receipt so `wrangler dev` "just
 * works" end to end without a live binding. Tests override `parseImpl`/
 * `repairImpl` per case (valid, fenced, malformed, unfixable, hanging).
 */
export const createFakeReceiptModel = (): ReceiptModel & {
  parseImpl: (ocrText: string) => Promise<unknown>;
  repairImpl: (rawOutput: string, errorSummary: string) => Promise<unknown>;
} => {
  return {
    parseImpl: async () =>
      JSON.stringify({
        merchant: { name: "Mock Store", address: null, phone: null },
        transaction: { date: null, time: null, receipt_number: null },
        items: [],
        subtotal: null,
        tax: null,
        discount: null,
        service_charge: null,
        total: null,
        payment: { amount: null },
        metadata: { currency: null, confidence: null },
      }),

    repairImpl: async (rawOutput) => rawOutput,

    parse(ocrText) {
      return this.parseImpl(ocrText);
    },

    repair(rawOutput, errorSummary) {
      return this.repairImpl(rawOutput, errorSummary);
    },
  };
};

/** Same double as createFakeReceiptModel, for the voice-expense path — same Receipt shape, see ai/prompt.ts's EXPENSE_SYSTEM_PROMPT. */
export const createFakeExpenseModel = (): ExpenseModel & {
  parseImpl: (transcript: string, referenceDate: string, language?: "en" | "id") => Promise<unknown>;
  repairImpl: (rawOutput: string, errorSummary: string, referenceDate: string, language?: "en" | "id") => Promise<unknown>;
} => {
  return {
    parseImpl: async () =>
      JSON.stringify({
        merchant: { name: null, address: null, phone: null },
        transaction: { date: null, time: null, receipt_number: null },
        items: [],
        subtotal: null,
        tax: null,
        discount: null,
        service_charge: null,
        total: null,
        payment: { amount: null, cash_received: null, change: null },
        metadata: { currency: "IDR", confidence: null },
      }),

    repairImpl: async (rawOutput) => rawOutput,

    parse(transcript, referenceDate, language) {
      return this.parseImpl(transcript, referenceDate, language);
    },

    repair(rawOutput, errorSummary, referenceDate, language) {
      return this.repairImpl(rawOutput, errorSummary, referenceDate, language);
    },
  };
};

/** Same double pattern, for the raw audio-to-text path — no parse/repair loop to fake, just one call. */
export const createFakeTranscribeModel = (): TranscribeModel & {
  transcribeImpl: (audioBase64: string, language?: "en" | "id") => Promise<string>;
} => {
  return {
    transcribeImpl: async () => "mock transcript",
    transcribe(audioBase64, language) {
      return this.transcribeImpl(audioBase64, language);
    },
  };
};
