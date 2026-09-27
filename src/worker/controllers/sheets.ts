import type { Context } from "hono";
import type { HonoEnv } from "../types/env";
import { httpError } from "../middleware/error";
import { ERROR_CODES } from "../lib/constants";

// No body/AI work at all — by the time this runs, identityCheck (see
// middleware/identity-quota.ts) has already verified the secret, checked
// it isn't banned, and locked/confirmed the spreadsheet binding. Getting
// here at all means it's valid. Used by the app right after connecting,
// so it can confirm a secret was actually minted by this system before
// touching any expense data — without spending a scan/voice quota unit.
export const postSheetsValidate = (c: Context<HonoEnv>) => c.json({ data: { ok: true } });

/**
 * Fallback proxy for Google Sheets API requests when the client's browser,
 * local DNS, or ISP blocks/fails requests to sheets.googleapis.com (e.g. net::ERR_NAME_NOT_RESOLVED).
 * Strictly whitelisted to https://sheets.googleapis.com/v4/spreadsheets.
 */
export const postSheetsProxy = async (c: Context<HonoEnv>) => {
  const body = await c.req
    .json<{
      url?: string;
      method?: string;
      body?: string | Record<string, unknown>;
    }>()
    .catch(() => ({}) as any);

  if (!body.url || !body.url.startsWith("https://sheets.googleapis.com/v4/spreadsheets")) {
    throw httpError(400, ERROR_CODES.INVALID_REQUEST, "Invalid or unauthorized sheets URL");
  }

  const googleToken = c.req.header("X-Google-Token");
  if (!googleToken) {
    throw httpError(401, ERROR_CODES.UNAUTHORIZED, "Missing Google access token");
  }

  const method = body.method?.toUpperCase() ?? "GET";
  const payloadBody =
    body.body ? (typeof body.body === "string" ? body.body : JSON.stringify(body.body)) : undefined;

  const res = await fetch(body.url, {
    method,
    headers: {
      Authorization: googleToken.startsWith("Bearer ") ? googleToken : `Bearer ${googleToken}`,
      ...(payloadBody ? { "Content-Type": "application/json" } : {}),
    },
    body: payloadBody,
  });

  const resBody = await res.text();
  return new Response(resBody, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/json",
    },
  });
};
