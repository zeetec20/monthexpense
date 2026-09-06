import type { Context } from "hono";
import type { HonoEnv } from "../types/env";
import { httpError } from "../middleware/error";
import { ERROR_CODES } from "../lib/constants";
import { computeSecretForEmail, decryptEmail } from "../lib/email-cipher";

/**
 * POST /v1/auth/google/connect — the client's one-click replacement for
 * scripts/mint-secret.ts. Behind the same shared `auth` (Bearer API_KEY)
 * gate as every other /v1/* route.
 *
 * BE does nothing Google-side anymore — the client (FE) gets its own
 * access_token directly via Google Identity Services and performs every
 * Drive/Sheets/Apps Script call itself (see google-provision.client.ts),
 * reading the account's email straight from Google's own userinfo
 * endpoint. FE sends that email here, encrypted with this app's shared
 * API_KEY (see lib/email-cipher.ts) so it isn't sitting in plaintext in
 * request bodies/logs — NOT as proof of anything. This endpoint does not
 * verify the caller actually owns that Google account (that would need
 * an id_token or a server-side check of the access_token against
 * Google, both dropped in favor of a single OAuth popup — a deliberate,
 * accepted tradeoff for now): anyone who knows a target email can obtain
 * that email's deterministic secret. Fine for the current free tier;
 * revisit before this ever gates anything paid or sensitive.
 */
export const postGoogleConnect = async (c: Context<HonoEnv>) => {
  const body = await c.req.json<{ emailCipher?: string; iv?: string }>().catch(() => ({}) as { emailCipher?: string; iv?: string });
  if (!body.emailCipher || !body.iv) throw httpError(400, ERROR_CODES.INVALID_REQUEST, "Missing emailCipher/iv");

  try {
    const email = await decryptEmail(c.env, { ciphertext: body.emailCipher, iv: body.iv });
    const secret = await computeSecretForEmail(c.env, email);
    return c.json({ data: { secret } });
  } catch (err) {
    // Shared errorHandler (middleware/error.ts) gives every non-httpError
    // exception a generic client-facing message on purpose — logging the
    // real reason here (safe: our own strings, never user content) is
    // the only way it's visible at all; check with `wrangler tail`.
    console.error(JSON.stringify({ route: "/v1/auth/google/connect", error: String(err) }));
    throw httpError(401, ERROR_CODES.UNAUTHORIZED, "Could not process this request.");
  }
};
