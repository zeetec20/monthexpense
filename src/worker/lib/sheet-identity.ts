// Per-sheet signed secret: hex(HMAC-SHA256(signingKey, payload)) + payload.
// SHA-256 hex is a fixed 64 chars, payload is whatever's left — no
// separator needed since the hash half has a known fixed length. Tier is
// which of two known signing keys (REGULAR_API_KEY = standard,
// PREMIUM_API_KEY = premium) actually produced the tag — whichever
// matches proves both
// authenticity ("minted by this app") and tier, with no Redis record
// needed at all. Payload used to always be a random UUID (minted by
// scripts/mint-secret.ts, node:crypto); it can now also be base64(email)
// (minted on-demand by controllers/auth.ts's Google login flow) — either
// way security comes entirely from the HMAC tag, not from the payload
// being random, so a variable-length payload is exactly as safe. Verified
// here via Web Crypto (Workers runtime).
const HASH_HEX_LENGTH = 64;

export type Tier = "standard" | "premium";

const toHex = (buffer: ArrayBuffer): string => {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const hmacKey = async (signingKey: string): Promise<CryptoKey> => {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
};

export const computeHash = async (signingKey: string, payload: string): Promise<string> => {
  const key = await hmacKey(signingKey);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
};

/** Constant-time string compare — same reasoning as middleware/auth.ts's
 * timingSafeEqual, duplicated here rather than shared across two small
 * unrelated files. */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Splits a client-presented secret and tries it against both known
 * signing keys — standard first, then premium. Returns the embedded
 * payload (a uuid or a base64(email), see the file comment above) plus
 * whichever tier matched, or null if it matches neither (malformed,
 * forged, or signed under a since-rotated key). Never throws. */
export const verifySheetSecret = async (
  secret: string,
  keys: { standard: string; premium: string },
): Promise<{ uuid: string; tier: Tier } | null> => {
  if (secret.length <= HASH_HEX_LENGTH) return null;
  const hashPart = secret.slice(0, HASH_HEX_LENGTH);
  const uuid = secret.slice(HASH_HEX_LENGTH);

  if (timingSafeEqual(hashPart, await computeHash(keys.standard, uuid)))
    return { uuid, tier: "standard" };
  if (timingSafeEqual(hashPart, await computeHash(keys.premium, uuid)))
    return { uuid, tier: "premium" };
  return null;
};
