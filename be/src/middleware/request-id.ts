import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "../types/env";

// Must run first in the chain (before auth) so even auth failures get a
// request ID for log correlation.
export const requestId: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const id = crypto.randomUUID();
  c.set("requestId", id);
  c.set("startTime", Date.now());
  await next();
  c.res.headers.set("X-Request-ID", id);
};
