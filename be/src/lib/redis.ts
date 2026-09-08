import { Redis } from "@upstash/redis";
import type { Env } from "../types/env";

// Fetch-based, works identically in the Worker runtime and in Bun (see
// scripts/mint-secret.ts) — no persistent connection to manage.
export const getRedis = (
  env: Pick<Env, "UPSTASH_REDIS_REST_URL" | "UPSTASH_REDIS_REST_TOKEN">,
): Redis => {
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
};
