// Env shape mirrors wrangler.jsonc `ai` binding + `vars` + `API_KEY` secret.
// Regenerate/cross-check against `wrangler types` (worker-configuration.d.ts)
// after `bun install` — this file is the hand-maintained narrowing of it.
export interface Env {
  AI: Ai;
  MODEL_NAME: string;
  MAX_INPUT_LENGTH: number;
  MAX_AUDIO_BYTES: number;
  AI_TIMEOUT_MS: number;
  MAX_REPAIR_ATTEMPTS: number;
  API_VERSION: string;
  SERVICE_VERSION: string;
  LOCAL_MOCK_AI: boolean;
  /** Shared app bearer secret (see middleware/auth.ts) and email-in-transit
   * cipher key (see lib/email-cipher.ts's decryptEmail) — proves "this is
   * the real compiled app calling", nothing about which user or tier. */
  API_KEY: string;
  /** Signs standard-tier sheet secrets (see lib/sheet-identity.ts /
   * lib/email-cipher.ts's computeSecretForEmail) — tier is determined
   * entirely by which of REGULAR_API_KEY/PREMIUM_API_KEY produced a
   * matching HMAC, no Redis record needed. Split out from API_KEY so
   * rotating the app's own service key can never silently invalidate
   * every standard-tier user's sync secret. */
  REGULAR_API_KEY: string;
  PREMIUM_API_KEY: string;
  /** Cloudflare's native Rate Limiting binding (see middleware/rate-limit.ts)
   * — guards the shared API_KEY against abuse; no relation to Sheets sync,
   * which this BE doesn't touch at all (moved fully client-side). */
  RATE_LIMITER: RateLimit;
  /** Upstash Redis REST credentials (see lib/redis.ts) — backs the per-sheet
   * quota system (middleware/identity-quota.ts): the spreadsheet lock
   * ("one uuid, one sheet", expiring) and day-bucketed scan/voice usage
   * counters. No identity/tier data lives in Redis at all anymore. */
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  /** Test-only seam: route/integration tests inject a scripted ReceiptModel here. */
  __testReceiptModel?: import("../ai/model").ReceiptModel;
  /** Test-only seam: route/integration tests inject a scripted ExpenseModel here. */
  __testExpenseModel?: import("../ai/model").ExpenseModel;
  /** Test-only seam: route/integration tests inject a scripted TranscribeModel here. */
  __testTranscribeModel?: import("../ai/model").TranscribeModel;
  /** Test-only seam: replaces the real HMAC-verify + Redis identity/quota
   * lookups (middleware/identity-quota.ts) with an in-memory double — the
   * Workers test pool has no node:crypto to pre-mint a real signed secret
   * as a sync test fixture, and no live Redis in tests either. */
  __testIdentity?: import("../middleware/identity-quota").IdentityBackend;
}

/** Hono generics: bindings (env) + per-request context variables. */
export interface HonoEnv {
  Bindings: Env;
  Variables: {
    requestId: string;
    startTime: number;
    /** Set by identityQuota after incrementing the day's counter — the 3
     * AI-consuming controllers attach this to their response so the FE can
     * show/gate on it without waiting for a 429. */
    quota?: { remaining: number; limit: number };
    /** Set by identityCheck (verify/ban/lock, no metering) — lets
     * GET /v1/quota's controller peek all three groups' counters. */
    identity?: { uuid: string; tier: import("../lib/sheet-identity").Tier };
  };
}
