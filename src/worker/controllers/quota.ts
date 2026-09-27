import type { Context } from "hono";
import type { HonoEnv } from "../types/env";
import {
  DAILY_LIMIT,
  usageKey,
  type Group,
  type IdentityBackend,
} from "../middleware/identity-quota";
import { httpError } from "../middleware/error";
import { ERROR_CODES } from "../lib/constants";
import { getRedis } from "../lib/redis";

const GROUPS: Group[] = ["scan", "voice", "text"];

const realPeek = (env: HonoEnv["Bindings"]): IdentityBackend["peekUsage"] => {
  const redis = getRedis(env);
  return async (key) => (await redis.get<number>(key)) ?? 0;
};

/** Read-only usage status, no unit spent — identityCheck (see index.ts's
 * wiring) already verified/banned/locked and set c.get("identity"); this
 * just peeks all three groups' today counters so the FE can show real
 * remaining/limit numbers on load instead of only after a first scan/
 * voice/text call. */
export const getQuotaStatus = async (c: Context<HonoEnv>) => {
  const identity = c.get("identity");
  if (!identity) throw httpError(401, ERROR_CODES.UNAUTHORIZED, "Missing sheet identity");

  const peek = c.env.__testIdentity?.peekUsage ?? realPeek(c.env);
  const limit = DAILY_LIMIT[identity.tier];
  const entries = await Promise.all(
    GROUPS.map(
      async (group) =>
        [
          group,
          { remaining: Math.max(limit - (await peek(usageKey(identity.uuid, group))), 0), limit },
        ] as const,
    ),
  );

  return c.json({ data: Object.fromEntries(entries) });
};
