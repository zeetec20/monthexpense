import type { Context } from "hono";
import type { HonoEnv } from "../types/env";

// Non-sensitive metadata only. Must not expose secrets/bindings/prompts/infra.
export const getMeta = (c: Context<HonoEnv>) =>
  c.json({
    service: "receipt-parser",
    version: c.env.SERVICE_VERSION,
    model: c.env.MODEL_NAME,
  });
