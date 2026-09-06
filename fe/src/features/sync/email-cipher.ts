// AES-GCM encrypt of the account email before it leaves the browser,
// keyed by SHA-256(RECEIPT_API_KEY) — the same shared key this app
// already sends as its Authorization bearer on every request (see
// config/env.ts), not a new secret to keep in sync. Mirrored by BE's
// src/lib/email-cipher.ts's decryptEmail (same algorithm, can't literally
// share code across the two repos).
//
// ponytail: this obscures the email in transit/logs, it does not prove
// this browser owns the Google account behind it — that check was
// dropped in favor of a single OAuth popup (see google-auth.ts). Anyone
// holding RECEIPT_API_KEY (i.e. anyone with this app's bundle) could
// decrypt or forge one too. Accepted tradeoff for the current free tier.

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function deriveKey(apiKey: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
}

export async function encryptEmail(email: string, apiKey: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKey(apiKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(email));
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}
