import { Hono } from "hono";
import { cors } from "hono/cors";
import type { HonoEnv } from "./types/env";
import { requestId } from "./middleware/request-id";
import { rateLimit } from "./middleware/rate-limit";
import { auth } from "./middleware/auth";
import { identityQuota, identityCheck } from "./middleware/identity-quota";
import { errorHandler } from "./middleware/error";
import { getHealth } from "./controllers/health";
import { getMeta } from "./controllers/meta";
import { postReceiptsParse } from "./controllers/receipts";
import { postExpensesParse } from "./controllers/expenses";
import { postVoiceTranscribe } from "./controllers/voice";
import { postSheetsValidate, postSheetsProxy } from "./controllers/sheets";
import { getQuotaStatus } from "./controllers/quota";
import { postGoogleConnect } from "./controllers/auth";

const app = new Hono<HonoEnv>();

app.use("*", requestId);
app.onError(errorHandler);

// Public endpoints
// Protected endpoints
// ponytail: origin "*" — the Bearer API key is the real access gate, not
// origin. Restrict to specific origins later if this needs to stop
// accepting browser calls from arbitrary sites.
app.use(
  "/v1/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Sheet-Secret", "X-Spreadsheet-Id"],
  }),
);
// Rate limit before auth — a flood of bad-API-key attempts gets throttled
// too, not just valid ones.
app.use("/v1/*", rateLimit);
app.use("/v1/*", auth);

// Chained route definitions for Hono RPC type inference
const routes = app
  .get("/health", getHealth)
  .get("/v1/meta", getMeta)
  // identityQuota: per-sheet identity + daily scan/voice quota, layered on
  // top of the shared API_KEY gate above — see middleware/identity-quota.ts.
  // Not applied to /v1/meta (no AI cost) or /v1/expenses/parse's sibling
  // receipts endpoint's own group.
  .post("/v1/receipts/parse", identityQuota("scan"), postReceiptsParse)
  // Same handler as above — a pasted receipt/chat text blob is just another
  // source of the `{ text }` this controller already accepts (FE's OCR step
  // produces the same shape); only the quota bucket differs, so it's tracked
  // separately from photo scans instead of sharing "scan"'s counter.
  .post("/v1/receipts/parse-text", identityQuota("text"), postReceiptsParse)
  .post("/v1/expenses/parse", identityQuota("voice"), postExpensesParse)
  // identityCheck, not identityQuota("voice") — transcription is an internal
  // step of producing one voice expense, not a separate feature use.
  .post("/v1/voice/transcribe", identityCheck, postVoiceTranscribe)
  // identityCheck: same verify/ban/lock as identityQuota, no usage metered —
  // lets the app confirm a secret right after connecting without spending a
  // scan/voice quota unit just to check (see controllers/sheets.ts).
  .post("/v1/sheets/validate", identityCheck, postSheetsValidate)
  // Fallback proxy for client environments with DNS or network blocks to Google Sheets
  .post("/v1/sheets/proxy", postSheetsProxy)
  // Read-only usage status (no unit spent) — lets the FE show real
  // remaining/limit numbers on load instead of only after a first scan/
  // voice/text call (see controllers/quota.ts).
  .get("/v1/quota", identityCheck, getQuotaStatus)
  // Decrypts the email FE read from Google's userinfo endpoint and mints
  // the deterministic sync secret (see lib/email-cipher.ts).
  .post("/v1/auth/google/connect", postGoogleConnect);

// Fallback to static assets if an unmatched non-API route hits the worker
app.notFound(async (c) => {
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw as any);
    return res as unknown as Response;
  }
  return c.text("Not Found", 404);
});

export type AppType = typeof routes;
export default app;
