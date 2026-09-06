import { computeHash } from "./sheet-identity";
import type { Env } from "../types/env";

// AES-GCM decrypt of the client-sent email, keyed by SHA-256(API_KEY) —
// API_KEY is the same shared secret FE already holds as RECEIPT_API_KEY
// and sends as this app's Authorization bearer on every request. Deliberately
// not REGULAR_API_KEY/PREMIUM_API_KEY (those only ever sign sheet secrets
// and must stay server-only) — this is just "is this the real compiled app"
// obfuscation, unrelated to tier.
//
// ponytail: this is obfuscation, not authentication — GCM's tag rejects
// a tampered ciphertext, but anyone holding this same API_KEY (i.e.
// anyone with the FE bundle) can decrypt or forge one too. It does NOT
// prove the caller owns the Google account behind this email — that
// property was intentionally dropped (see controllers/auth.ts) in favor
// of a single OAuth popup. Upgrade path if this ever needs to be real
// auth again: check the access_token against Google's tokeninfo endpoint
// server-side instead of trusting a client-supplied email at all.

async function deriveKey(apiKey: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function decryptEmail(env: Pick<Env, "API_KEY">, payload: { ciphertext: string; iv: string }): Promise<string> {
  const key = await deriveKey(env.API_KEY);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** hex(HMAC-SHA256(REGULAR_API_KEY, base64(email))) + base64(email) — same
 * shape scripts/mint-secret.ts produces for a random uuid (see
 * sheet-identity.ts), just a deterministic payload instead of a random one.
 * Standard tier only — this on-demand mint path has no way to know a caller
 * deserves premium, unlike the manual scripts/mint-secret.ts --premium
 * flag. Deterministic-by-email is also why a lost/cleared local secret is
 * always recoverable for standard tier by just reconnecting; premium
 * secrets aren't (random uuid payload), which is what the Config sheet's
 * stored copy exists to protect (see fe's google-provision.client.ts). */
export async function computeSecretForEmail(env: Pick<Env, "REGULAR_API_KEY">, email: string): Promise<string> {
  const payload = btoa(email);
  const hash = await computeHash(env.REGULAR_API_KEY, payload);
  return hash + payload;
}
