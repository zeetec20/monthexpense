import type { Context } from "hono";
import type { HonoEnv } from "../types/env";

// Basic liveness probe. Must NOT invoke the LLM. Unauthenticated.
export const getHealth = (c: Context<HonoEnv>) => c.json({ ok: true });
