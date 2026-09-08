import { describe, it, expect } from "vitest";
import { decryptEmail, computeSecretForEmail } from "../../src/lib/email-cipher";

// Mirrors the FE's src/features/sync/email-cipher.ts encryptEmail — same
// algorithm (AES-GCM, key = SHA-256(apiKey), random 12-byte IV), built
// here directly with Web Crypto rather than importing across repos.
const encryptEmail = async (
  email: string,
  apiKey: string,
): Promise<{ ciphertext: string; iv: string }> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(email),
  );
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
};
const bytesToBase64 = (bytes: Uint8Array): string => {
  return btoa(String.fromCharCode(...bytes));
};

const API_KEY = "test-api-key";

describe("decryptEmail", () => {
  it("round-trips a value encrypted with the same key", async () => {
    const payload = await encryptEmail("someone@example.com", API_KEY);
    await expect(decryptEmail({ API_KEY }, payload)).resolves.toBe("someone@example.com");
  });

  it("rejects a payload encrypted with a different key", async () => {
    const payload = await encryptEmail("someone@example.com", "a-different-key");
    await expect(decryptEmail({ API_KEY }, payload)).rejects.toThrow();
  });

  it("rejects a tampered ciphertext", async () => {
    const payload = await encryptEmail("someone@example.com", API_KEY);
    const bytes = Uint8Array.from(atob(payload.ciphertext), (c) => c.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = { ciphertext: btoa(String.fromCharCode(...bytes)), iv: payload.iv };
    await expect(decryptEmail({ API_KEY }, tampered)).rejects.toThrow();
  });

  it("rejects a tampered IV", async () => {
    const payload = await encryptEmail("someone@example.com", API_KEY);
    const ivBytes = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
    ivBytes[0] = (ivBytes[0] ?? 0) ^ 0xff;
    const tampered = { ciphertext: payload.ciphertext, iv: btoa(String.fromCharCode(...ivBytes)) };
    await expect(decryptEmail({ API_KEY }, tampered)).rejects.toThrow();
  });
});

describe("computeSecretForEmail", () => {
  it("is deterministic — same email always yields the same secret", async () => {
    const env = { REGULAR_API_KEY: API_KEY };
    const a = await computeSecretForEmail(env, "someone@example.com");
    const b = await computeSecretForEmail(env, "someone@example.com");
    expect(a).toBe(b);
  });

  it("embeds base64(email) as the payload after the 64-char hash", async () => {
    const secret = await computeSecretForEmail({ REGULAR_API_KEY: API_KEY }, "someone@example.com");
    expect(secret.slice(64)).toBe(btoa("someone@example.com"));
  });
});
