import { describe, expect, it } from "bun:test";
import { parseEnvFile, syncEnvToDevVars } from "../../scripts/sync-env";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("syncEnvToDevVars", () => {
  it("parses key-value pairs and strips quotes correctly", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "env-test-"));
    const envFile = join(tmpDir, ".env");
    writeFileSync(
      envFile,
      `
# Comments should be ignored
API_KEY="my-secret-key"
VITE_GOOGLE_CLIENT_ID='google-id-123'
REGULAR_API_KEY=regular-key
EMPTY_KEY=
export EXPORTED_VAR=exported-val
      `.trim(),
    );

    const parsed = parseEnvFile(envFile);
    expect(parsed.API_KEY).toBe("my-secret-key");
    expect(parsed.VITE_GOOGLE_CLIENT_ID).toBe("google-id-123");
    expect(parsed.REGULAR_API_KEY).toBe("regular-key");
    expect(parsed.EMPTY_KEY).toBe("");
    expect(parsed.EXPORTED_VAR).toBe("exported-val");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("synchronizes worker variables to .dev.vars", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "env-sync-test-"));
    const envFile = join(tmpDir, ".env");
    writeFileSync(
      envFile,
      `
API_KEY=shared-api-key
VITE_GOOGLE_CLIENT_ID=google-client-id
REGULAR_API_KEY=reg-key
PREMIUM_API_KEY=prem-key
UPSTASH_REDIS_REST_URL=https://redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=redis-token
LOCAL_MOCK_AI=true
      `.trim(),
    );

    const merged = syncEnvToDevVars(tmpDir);
    expect(merged.API_KEY).toBe("shared-api-key");
    expect(merged.VITE_RECEIPT_API_KEY).toBe("shared-api-key");

    const devVarsContent = readFileSync(join(tmpDir, ".dev.vars"), "utf-8");
    expect(devVarsContent).toContain("API_KEY=shared-api-key");
    expect(devVarsContent).toContain("REGULAR_API_KEY=reg-key");
    expect(devVarsContent).toContain("PREMIUM_API_KEY=prem-key");
    expect(devVarsContent).toContain("UPSTASH_REDIS_REST_URL=https://redis.upstash.io");
    expect(devVarsContent).toContain("UPSTASH_REDIS_REST_TOKEN=redis-token");
    expect(devVarsContent).toContain("LOCAL_MOCK_AI=true");
    // Client-only keys should not be written to .dev.vars
    expect(devVarsContent).not.toContain("VITE_GOOGLE_CLIENT_ID");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("propagates VITE_RECEIPT_API_KEY to API_KEY if API_KEY is missing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "env-legacy-test-"));
    const envFile = join(tmpDir, ".env");
    writeFileSync(envFile, "VITE_RECEIPT_API_KEY=legacy-client-key\n");

    const merged = syncEnvToDevVars(tmpDir);
    expect(merged.API_KEY).toBe("legacy-client-key");
    expect(merged.VITE_RECEIPT_API_KEY).toBe("legacy-client-key");

    const devVarsContent = readFileSync(join(tmpDir, ".dev.vars"), "utf-8");
    expect(devVarsContent).toContain("API_KEY=legacy-client-key");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
