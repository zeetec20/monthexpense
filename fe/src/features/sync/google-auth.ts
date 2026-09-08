import { GOOGLE_CLIENT_ID, RECEIPT_API_URL, RECEIPT_API_KEY } from "@/config/env";
import { encryptEmail } from "./email-cipher";

// Drive + Sheets scopes plus userinfo.email — one popup grants everything
// this app needs (access_token + enough to read the account's own email
// straight from Google), no separate id_token flow. See fetchGoogleEmail
// below and BE's controllers/auth.ts for the tradeoff this buys: BE never
// learns anything Google-signed, just an obfuscated-in-transit email — it
// can't prove the caller owns the account, only avoid the email sitting in
// plaintext. No more script.projects/script.deployments (Apps Script is
// gone — this app talks to Sheets API directly now, see sheets-sync.api.ts)
// — plain `spreadsheets` instead, a smaller/less-sensitive scope.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// No @types package for Google Identity Services exists upstream — this
// is the minimal ambient shape for the handful of calls this file
// actually makes, not a full binding.
interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: {
          access_token?: string;
          error?: string;
          expires_in?: number;
        }) => void;
      }): { requestAccessToken(overrideConfig?: { prompt?: string }): void };
    };
  };
}
declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

/** index.html loads GIS with `async defer` — it may not be ready the
 * instant a user clicks "Continue with Google" on a slow connection. */
const waitForGis = (): Promise<GoogleIdentityServices> => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      if (window.google?.accounts) {
        resolve(window.google);
        return;
      }
      if (Date.now() - start > 10_000) {
        reject(googleAuthError("Google sign-in didn't load. Check your connection and try again."));
        return;
      }
      setTimeout(poll, 100);
    })();
  });
};

/** Tags a failure as "silent Google token renewal didn't work" — same
 * `.code` pattern sheets-sync.api.ts's sheetGoneError uses for
 * SHEET_DELETED. sync.store.ts's handleAuthError matches on this to drop
 * the app back to disconnected/ConnectGate instead of retrying forever
 * against a session that's actually gone (guarded there by `online`, so
 * a plain network outage isn't mistaken for an expired session). */
const googleAuthError = (message: string): Error & { code: string } => {
  const err = new Error(message) as Error & { code: string };
  err.code = "GOOGLE_AUTH_FAILED";
  return err;
};

/** The GIS call below opens a popup whose callback is the only way its
 * Promise settles — if the browser (or an extension) silently blocks the
 * popup, that callback never fires and the Promise hangs forever with no
 * error. Race it against a timeout so that always turns into an
 * actionable rejection instead of a dead spinner. */
const withPopupTimeout = <T>(
  executor: (resolve: (value: T) => void, reject: (reason: Error) => void) => void,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          googleAuthError(
            "Google sign-in popup didn't respond. Allow popups for this site and try again.",
          ),
        ),
      15_000,
    );
    executor(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    );
  });
};

interface TokenResult {
  accessToken: string;
  expiresIn: number;
}

const requestToken = (): Promise<TokenResult> => {
  return waitForGis().then((google) =>
    withPopupTimeout<TokenResult>((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(googleAuthError(response.error || "Could not get Google Drive/Sheets access."));
          } else {
            resolve({ accessToken: response.access_token, expiresIn: response.expires_in ?? 3600 });
          }
        },
      });
      // prompt: "" — "only prompt the first time this app needs access from
      // this browser" (GIS's own semantics): a returning session that's
      // already granted access reuses that grant silently, no chooser/consent
      // UI. Reduces re-prompting for the common case (this app + this
      // browser, already granted before) — doesn't guarantee suppressing
      // Google's account chooser outright if the browser genuinely has
      // multiple simultaneously active Google sessions and nothing to fall
      // back on; that disambiguation is Google's own browser-level UX, not
      // something a `prompt` value can force away.
      client.requestAccessToken({ prompt: "" });
    }),
  );
};

// localStorage, not sessionStorage: still short-lived (~1hr, self-expiring
// via its own stored expiresAt below regardless of storage lifetime) but
// now survives closing the tab/PWA entirely, not just a same-tab reload.
// Without this, closing and reopening the app always threw away a token
// that might still have had most of its hour left, forcing a fresh silent
// renewal on every single open. No more sensitive than the secret/
// spreadsheetId this app already keeps in localStorage.
const TOKEN_CACHE_KEY = "expense-notes.google-token.v1";

const readCachedToken = (): { accessToken: string; expiresAt: number } | null => {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const cache = (result: TokenResult): string => {
  const entry = {
    accessToken: result.accessToken,
    expiresAt: Date.now() + result.expiresIn * 1000,
  };
  try {
    localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ponytail: best-effort — worst case this reload needs one more silent renew
  }
  return entry.accessToken;
};

/** OAuth token client — the one and only Google popup in this flow.
 * Resolves an access_token scoped to Drive/Sheets + email, used directly
 * by google-provision.client.ts for every Google API call this app makes,
 * and by fetchGoogleEmail below. Never sent to BE. Also seeds the token
 * cache (see getFreshAccessToken) so the very first Sheets API call right
 * after login doesn't need a second round trip. */
export const requestGoogleAccessToken = async (): Promise<string> => {
  return cache(await requestToken());
};

/** Every direct Sheets API call (sheets-sync.api.ts) routes through this
 * instead of requestGoogleAccessToken directly — returns the cached token
 * while it still has >60s left. Deliberately does NOT try to silently mint
 * a fresh one when the cache is empty/expired: initTokenClient's
 * requestAccessToken always opens a real popup under the hood, even with
 * prompt:"" — browsers only reliably allow that inside a live user
 * gesture (a click), and every caller of this function runs after an
 * await, outside one. Attempting it here just gets silently blocked
 * unless the user separately pre-approved popups for this site in browser
 * settings. Throws instead — sync.store.ts's handleAuthError catches this
 * (GOOGLE_AUTH_FAILED) and shows a modal asking the user to click
 * "Continue with Google" themselves, which calls requestGoogleAccessToken
 * directly from that click and gets a real, allowed popup. */
export const getFreshAccessToken = async (): Promise<string> => {
  const cachedToken = readCachedToken();
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken.accessToken;
  throw googleAuthError("Google sign-in needs to be refreshed.");
};

/** Reads the signed-in account's own email directly from Google using the
 * access_token — replaces the separate id_token/One Tap step that used to
 * supply this. */
export const fetchGoogleEmail = async (accessToken: string): Promise<string> => {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok)
    throw new Error(`Could not read your Google account's email (${response.status}).`);
  const { email } = (await response.json()) as { email?: string };
  if (!email) throw new Error("Google didn't return an email for this account.");
  return email;
};

/** Encrypts the email (see email-cipher.ts) and sends it to BE, which
 * decrypts it and mints the deterministic sync secret — see
 * text-processing-slm's controllers/auth.ts. */
export const exchangeEmailForSecret = async (email: string): Promise<string> => {
  const { ciphertext, iv } = await encryptEmail(email, RECEIPT_API_KEY);
  const response = await fetch(`${RECEIPT_API_URL}/v1/auth/google/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RECEIPT_API_KEY}` },
    body: JSON.stringify({ emailCipher: ciphertext, iv }),
  });
  if (!response.ok) {
    // BE returns a generic message for most failures on purpose (its
    // shared errorHandler policy), but deliberately lets a few specific,
    // already-actionable messages through — show whatever it sent,
    // falling back to a generic string only if the body itself didn't
    // parse (network failure, non-JSON response, etc.).
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message || "Google sign-in failed. Please try again.");
  }
  const { data } = (await response.json()) as { data: { secret: string } };
  return data.secret;
};
