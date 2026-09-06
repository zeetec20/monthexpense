import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types/env";
import { httpError } from "./error";
import { ERROR_CODES } from "../lib/constants";

// Cloudflare's native Rate Limiting binding (wrangler.jsonc's "ratelimits"
// block) — no extra storage/quota of our own, purpose-built for this.
// Keyed on IP+User-Agent, not IP alone: a bare CF-Connecting-IP key
// over-blocks, since mobile carriers/corporate networks commonly put many
// real users behind one shared/CGNAT IP — one heavy user on that IP would
// trip the limit for everyone else behind it too. Combining with
// User-Agent narrows the bucket to "this IP + this specific browser/
// device", separating most real users sharing a provider IP (still
// imperfect — two people behind the same IP on the exact same browser/OS
// still share a bucket — but meaningfully better than IP alone, and free).
export const rateLimit: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const ua = (c.req.header("User-Agent") ?? "unknown").slice(0, 128); // bounded key length
  const { success } = await c.env.RATE_LIMITER.limit({ key: `${ip}:${ua}` });

  if (!success) {
    throw httpError(429, ERROR_CODES.RATE_LIMITED, "Too many requests — try again shortly.");
  }

  await next();
};
