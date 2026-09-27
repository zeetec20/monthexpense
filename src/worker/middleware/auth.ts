import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types/env";
import { httpError } from "./error";
import { ERROR_CODES } from "../lib/constants";

/** Constant-time string compare — avoids timing side-channel on API key check. */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

// Bearer token check against env.API_KEY. Applied to /v1/* only — /health
// is an unauthenticated liveness probe.
export const auth: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token || !c.env.API_KEY || !timingSafeEqual(token, c.env.API_KEY)) {
    throw httpError(401, ERROR_CODES.UNAUTHORIZED, "Missing or invalid API key");
  }

  await next();
};
