import { describe, it, expect } from "vitest";
import { computeHash, verifySheetSecret } from "../../src/lib/sheet-identity";

const STANDARD_KEY = "test-standard-key";
const PREMIUM_KEY = "test-premium-key";
const KEYS = { standard: STANDARD_KEY, premium: PREMIUM_KEY };

const mint = async (signingKey: string): Promise<{ secret: string; uuid: string }> => {
  const uuid = "11111111-2222-3333-4444-555555555555";
  const hash = await computeHash(signingKey, uuid);
  return { secret: hash + uuid, uuid };
};

describe("verifySheetSecret", () => {
  it("recognizes a secret signed with the standard key as standard tier", async () => {
    const { secret, uuid } = await mint(STANDARD_KEY);
    expect(await verifySheetSecret(secret, KEYS)).toEqual({ uuid, tier: "standard" });
  });

  it("recognizes a secret signed with the premium key as premium tier", async () => {
    const { secret, uuid } = await mint(PREMIUM_KEY);
    expect(await verifySheetSecret(secret, KEYS)).toEqual({ uuid, tier: "premium" });
  });

  it("rejects a secret signed under neither known key (couldn't have come from this app)", async () => {
    const { secret } = await mint("some-other-key");
    expect(await verifySheetSecret(secret, KEYS)).toBeNull();
  });

  it("rejects a tampered hash portion", async () => {
    const { secret } = await mint(STANDARD_KEY);
    const tampered = "0".repeat(64) + secret.slice(64);
    expect(await verifySheetSecret(tampered, KEYS)).toBeNull();
  });

  it("rejects a malformed/wrong-length secret", async () => {
    expect(await verifySheetSecret("too-short", KEYS)).toBeNull();
    expect(await verifySheetSecret("", KEYS)).toBeNull();
  });

  it("accepts a variable-length payload, e.g. base64(email) instead of a uuid", async () => {
    const payload = btoa("someone@example.com");
    const hash = await computeHash(STANDARD_KEY, payload);
    expect(await verifySheetSecret(hash + payload, KEYS)).toEqual({
      uuid: payload,
      tier: "standard",
    });
  });
});
