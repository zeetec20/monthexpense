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
import { postSheetsValidate } from "./controllers/sheets";
import { getQuotaStatus } from "./controllers/quota";
import { postGoogleConnect } from "./controllers/auth";

const app = new Hono<HonoEnv>();

app.use("*", requestId);
app.onError(errorHandler);

// Public endpoints
app.get("/health", getHealth);

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
app.get("/v1/meta", getMeta);
// identityQuota: per-sheet identity + daily scan/voice quota, layered on
// top of the shared API_KEY gate above — see middleware/identity-quota.ts.
// Not applied to /v1/meta (no AI cost) or /v1/expenses/parse's sibling
// receipts endpoint's own group.
app.post("/v1/receipts/parse", identityQuota("scan"), postReceiptsParse);
// Same handler as above — a pasted receipt/chat text blob is just another
// source of the `{ text }` this controller already accepts (FE's OCR step
// produces the same shape); only the quota bucket differs, so it's tracked
// separately from photo scans instead of sharing "scan"'s counter.
app.post("/v1/receipts/parse-text", identityQuota("text"), postReceiptsParse);
app.post("/v1/expenses/parse", identityQuota("voice"), postExpensesParse);
// identityCheck, not identityQuota("voice") — transcription is an internal
// step of producing one voice expense, not a separate feature use. The
// FE's fallback tier (client-side SpeechRecognition unsupported/failed)
// calls this *and* /v1/expenses/parse for one logical entry; metering both
// against the same "voice" bucket charged 2 units for what the user
// experiences as one voice expense. Only the final parse call counts now.
app.post("/v1/voice/transcribe", identityCheck, postVoiceTranscribe);
// identityCheck: same verify/ban/lock as identityQuota, no usage metered —
// lets the app confirm a secret right after connecting without spending a
// scan/voice quota unit just to check (see controllers/sheets.ts).
app.post("/v1/sheets/validate", identityCheck, postSheetsValidate);
// Read-only usage status (no unit spent) — lets the FE show real
// remaining/limit numbers on load instead of only after a first scan/
// voice/text call (see controllers/quota.ts).
app.get("/v1/quota", identityCheck, getQuotaStatus);
// Decrypts the email FE read from Google's userinfo endpoint and mints
// the deterministic sync secret (see lib/email-cipher.ts) — FE does all
// the actual Drive/Sheets/Apps Script provisioning itself. Does not
// verify Google account ownership (see email-cipher.ts/auth.ts for why —
// a deliberate, accepted tradeoff for now). Same shared auth gate as
// everything above — no identityQuota here, this doesn't touch AI quota
// at all.
app.post("/v1/auth/google/connect", postGoogleConnect);

export default app;
