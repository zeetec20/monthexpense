import type { Context } from "hono";
import type { HonoEnv } from "../types/env";

// No body/AI work at all — by the time this runs, identityCheck (see
// middleware/identity-quota.ts) has already verified the secret, checked
// it isn't banned, and locked/confirmed the spreadsheet binding. Getting
// here at all means it's valid. Used by the app right after connecting,
// so it can confirm a secret was actually minted by this system before
// touching any expense data — without spending a scan/voice quota unit.
export const postSheetsValidate = (c: Context<HonoEnv>) => c.json({ data: { ok: true } });
