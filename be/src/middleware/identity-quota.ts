import type { Context, MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types/env";
import { httpError } from "./error";
import { ERROR_CODES } from "../lib/constants";
import { verifySheetSecret, type Tier } from "../lib/sheet-identity";
import { getRedis } from "../lib/redis";

export type Group = "scan" | "voice" | "text";

/** Everything this middleware needs from the outside world, behind one
 * seam — production gets a real-Redis-backed implementation
 * (realBackend), tests inject `env.__testIdentity` instead (see
 * test/controllers/helpers.ts's fakeIdentityBackend) since the Workers
 * test pool has neither node:crypto to pre-mint a real signed secret as a
 * sync fixture, nor a live Redis to talk to. Same spirit as the existing
 * __testReceiptModel/__testExpenseModel/__testTranscribeModel seams. */
export interface IdentityBackend {
  /** null = neither known signing key produced a match (not a real secret). */
  verify(secret: string): Promise<{ uuid: string; tier: Tier } | null>;
  /** True while this uuid is serving out a ban from a past spreadsheet
   * mismatch (see lockSpreadsheetId) — checked before anything else. */
  isBanned(uuid: string): Promise<boolean>;
  /** Atomically binds this uuid to a spreadsheetId the first time it's
   * seen ("one uuid, one sheet"); every matching request slides the lock's
   * TTL back out. A mismatch bans the uuid and returns false. */
  lockSpreadsheetId(uuid: string, spreadsheetId: string): Promise<boolean>;
  incrementUsage(key: string): Promise<number>;
  /** Read-only peek at today's count — doesn't spend a unit. Backs
   * GET /v1/quota (see controllers/quota.ts), so the FE can show real
   * remaining/limit numbers on load instead of only after a first scan/
   * voice/text call. */
  peekUsage(key: string): Promise<number>;
}

export const DAILY_LIMIT: Record<Tier, number> = { standard: 20, premium: 80 };
const COUNTER_TTL_SECONDS = 90_000; // >1 day margin so a stale key self-cleans
// Sliding — every matching request refreshes this, so an actively-used
// connection never actually expires; only a uuid idle for a full day
// loses its lock and can bind to a new spreadsheet next time.
const LOCK_TTL_SECONDS = 24 * 60 * 60;
// A spreadsheet mismatch (secret reused across sheets) bans the uuid
// outright for this long, not just the one offending request.
const BAN_TTL_SECONDS = 2 * 24 * 60 * 60;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Same key convention used by both identityQuota (INCR) and GET /v1/quota
 * (peek) — keeping it in one place so they can never drift apart. */
export function usageKey(uuid: string, group: Group, date = todayUtc()): string {
  return `usage:${uuid}:${group}:${date}`;
}

function realBackend(env: HonoEnv["Bindings"]): IdentityBackend {
  const redis = getRedis(env);
  return {
    verify: (secret) => verifySheetSecret(secret, { standard: env.REGULAR_API_KEY, premium: env.PREMIUM_API_KEY }),
    isBanned: async (uuid) => (await redis.get(`ban:${uuid}`)) !== null,
    lockSpreadsheetId: async (uuid, spreadsheetId) => {
      const key = `sheet-lock:${uuid}`;
      await redis.set(key, spreadsheetId, { nx: true, ex: LOCK_TTL_SECONDS });
      const bound = await redis.get<string>(key);
      if (bound === spreadsheetId) {
        await redis.expire(key, LOCK_TTL_SECONDS); // refresh — sliding window
        return true;
      }
      await redis.set(`ban:${uuid}`, spreadsheetId, { ex: BAN_TTL_SECONDS });
      return false;
    },
    incrementUsage: async (key) => {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, COUNTER_TTL_SECONDS);
      return count;
    },
    peekUsage: async (key) => (await redis.get<number>(key)) ?? 0,
  };
}

function readHeaders(c: Context<HonoEnv>): { secret: string; spreadsheetId: string } {
  const secret = c.req.header("X-Sheet-Secret");
  const spreadsheetId = c.req.header("X-Spreadsheet-Id");
  if (!secret || !spreadsheetId) {
    throw httpError(401, ERROR_CODES.UNAUTHORIZED, "Missing sheet identity headers");
  }
  return { secret, spreadsheetId };
}

/** verify → ban check → spreadsheet lock, shared by identityQuota (which
 * also meters usage) and identityCheck (which doesn't — see below). */
async function checkIdentity(
  backend: IdentityBackend,
  secret: string,
  spreadsheetId: string,
): Promise<{ uuid: string; tier: Tier }> {
  const verified = await backend.verify(secret);
  if (!verified) {
    throw httpError(401, ERROR_CODES.UNAUTHORIZED, "Invalid sheet secret");
  }

  if (await backend.isBanned(verified.uuid)) {
    throw httpError(401, ERROR_CODES.UNAUTHORIZED, "Sheet secret temporarily banned after a spreadsheet mismatch");
  }

  const locked = await backend.lockSpreadsheetId(verified.uuid, spreadsheetId);
  if (!locked) {
    throw httpError(401, ERROR_CODES.UNAUTHORIZED, "Sheet secret is already bound to a different spreadsheet");
  }

  return verified;
}

/**
 * Applied after the existing `auth` (shared API_KEY) middleware on the
 * three AI-consuming routes — see index.ts. `auth` stays the coarse "is
 * this the real compiled app" gate; this is the per-sheet layer on top:
 * X-Sheet-Secret + X-Spreadsheet-Id identify, tier, and rate-limit one
 * connected Google Sheet. Tier comes entirely from which signing key
 * produced the secret's tag (see lib/sheet-identity.ts) — no Redis
 * identity record at all. The secret isn't bound to a spreadsheet until
 * the first real request, when Redis locks it in; every later request
 * must present that same spreadsheetId.
 */
export const identityQuota = (group: Group): MiddlewareHandler<HonoEnv> => {
  return async (c, next) => {
    const { secret, spreadsheetId } = readHeaders(c);
    const backend = c.env.__testIdentity ?? realBackend(c.env);
    const verified = await checkIdentity(backend, secret, spreadsheetId);

    const count = await backend.incrementUsage(usageKey(verified.uuid, group));
    const limit = DAILY_LIMIT[verified.tier];
    if (count > limit) {
      throw httpError(429, ERROR_CODES.RATE_LIMITED, `Daily ${group} limit reached — try again tomorrow.`);
    }

    c.set("quota", { remaining: limit - count, limit });
    await next();
  };
};

/**
 * Same identity/ban/lock check as identityQuota, but doesn't meter usage —
 * for POST /v1/sheets/validate (see controllers/sheets.ts), used right
 * after connecting so the app can confirm a secret was actually minted by
 * this system before touching any expense data, without spending one of
 * the day's 20/80 scan-or-voice AI calls just to check. Also backs
 * GET /v1/quota (see controllers/quota.ts) — sets "identity" on the
 * context so that controller can peek all three groups' counters.
 */
export const identityCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const { secret, spreadsheetId } = readHeaders(c);
  const backend = c.env.__testIdentity ?? realBackend(c.env);
  const verified = await checkIdentity(backend, secret, spreadsheetId);
  c.set("identity", verified);
  await next();
};
