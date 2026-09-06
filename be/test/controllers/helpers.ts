import type { Env } from "../../src/types/env";
import type { ReceiptModel, ExpenseModel, TranscribeModel } from "../../src/ai/model";
import type { IdentityBackend } from "../../src/middleware/identity-quota";

export const TEST_API_KEY = "test-api-key";
export const TEST_REGULAR_API_KEY = "test-regular-api-key";
export const TEST_PREMIUM_API_KEY = "test-premium-api-key";
export const TEST_SPREADSHEET_ID = "test-spreadsheet-id";
export const TEST_SHEET_SECRET = "test-sheet-secret";
export const TEST_UUID = "test-uuid";

/** Always-recognizes the fixed TEST_SHEET_SECRET as a standard-tier
 * identity, and locks onto whatever spreadsheetId it's first given (real
 * lockSpreadsheetId semantics, just backed by an in-memory Map instead of
 * Redis) — see middleware/identity-quota.ts's __testIdentity seam. Real
 * HMAC verification isn't exercised here (that's
 * src/lib/sheet-identity.test.ts's job) — the Workers test pool has no
 * node:crypto to pre-mint a real signed secret as a sync fixture. */
export function fakeIdentityBackend(overrides: Partial<IdentityBackend> = {}): IdentityBackend {
  const locked = new Map<string, string>();
  return {
    verify: async (secret) => (secret === TEST_SHEET_SECRET ? { uuid: TEST_UUID, tier: "standard" } : null),
    isBanned: async () => false,
    lockSpreadsheetId: async (uuid, spreadsheetId) => {
      const existing = locked.get(uuid);
      if (existing === undefined) {
        locked.set(uuid, spreadsheetId);
        return true;
      }
      return existing === spreadsheetId;
    },
    incrementUsage: async () => 1,
    peekUsage: async () => 0,
    ...overrides,
  };
}

/** Always-succeeds double by default — most controller tests aren't
 * exercising rate limiting, they just need the binding to exist. See
 * middleware/rate-limit.test.ts for a double that actually enforces a cap. */
export function fakeRateLimiter(alwaysSucceed = true): Env["RATE_LIMITER"] {
  return { limit: async () => ({ success: alwaysSucceed }) };
}

/** Minimal executionCtx double sufficient for app.fetch(request, env, ctx). */
export const testCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

export function buildTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    AI: {} as Ai,
    MODEL_NAME: "@cf/meta/llama-3.1-8b-instruct",
    MAX_INPUT_LENGTH: 15000,
    MAX_AUDIO_BYTES: 3_000_000,
    AI_TIMEOUT_MS: 15000,
    MAX_REPAIR_ATTEMPTS: 1,
    API_VERSION: "v1",
    SERVICE_VERSION: "1.0.0",
    LOCAL_MOCK_AI: false,
    API_KEY: TEST_API_KEY,
    REGULAR_API_KEY: TEST_REGULAR_API_KEY,
    PREMIUM_API_KEY: TEST_PREMIUM_API_KEY,
    RATE_LIMITER: fakeRateLimiter(),
    UPSTASH_REDIS_REST_URL: "http://localhost/unused",
    UPSTASH_REDIS_REST_TOKEN: "unused",
    __testIdentity: fakeIdentityBackend(),
    ...overrides,
  };
}

export function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${TEST_API_KEY}`,
    "Content-Type": "application/json",
    "X-Sheet-Secret": TEST_SHEET_SECRET,
    "X-Spreadsheet-Id": TEST_SPREADSHEET_ID,
  };
}

export function envWithModel(model: ReceiptModel, overrides: Partial<Env> = {}): Env {
  return buildTestEnv({ __testReceiptModel: model, ...overrides });
}

export function envWithExpenseModel(model: ExpenseModel, overrides: Partial<Env> = {}): Env {
  return buildTestEnv({ __testExpenseModel: model, ...overrides });
}

export function envWithTranscribeModel(model: TranscribeModel, overrides: Partial<Env> = {}): Env {
  return buildTestEnv({ __testTranscribeModel: model, ...overrides });
}
