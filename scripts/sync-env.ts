import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Parses a simple .env formatted file into key-value pairs.
 */
export const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) return {};
  try {
    const content = readFileSync(filePath, "utf-8");
    const result: Record<string, string> = {};
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const cleaned = line.startsWith("export ") ? line.slice(7).trim() : line;
      const eqIndex = cleaned.indexOf("=");
      if (eqIndex === -1) continue;

      const key = cleaned.slice(0, eqIndex).trim();
      let value = cleaned.slice(eqIndex + 1).trim();

      // Strip enclosing single or double quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key) {
        result[key] = value;
      }
    }
    return result;
  } catch (err) {
    console.warn(`[sync-env] Warning: Failed to read ${filePath}:`, err);
    return {};
  }
};

/**
 * Worker-specific secrets and bindings that Wrangler/Miniflare reads from .dev.vars.
 */
export const WORKER_KEYS = [
  "API_KEY",
  "REGULAR_API_KEY",
  "PREMIUM_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "LOCAL_MOCK_AI",
] as const;

/**
 * Synchronizes environment variables from .env / .env.local into .dev.vars
 * for Cloudflare Workers (Miniflare/Wrangler).
 */
export const syncEnvToDevVars = (rootDir = process.cwd()): Record<string, string> => {
  const envPath = resolve(rootDir, ".env");
  const envLocalPath = resolve(rootDir, ".env.local");
  const devVarsPath = resolve(rootDir, ".dev.vars");

  const envVars = parseEnvFile(envPath);
  const envLocalVars = parseEnvFile(envLocalPath);
  const existingDevVars = parseEnvFile(devVarsPath);

  const merged: Record<string, string> = { ...envVars, ...envLocalVars };

  // If no .env or .env.local exists, keep existing .dev.vars untouched
  if (!existsSync(envPath) && !existsSync(envLocalPath)) {
    return existingDevVars;
  }

  // Cross-pollinate API_KEY and VITE_RECEIPT_API_KEY if either is set
  const sharedApiKey =
    merged.API_KEY || merged.VITE_RECEIPT_API_KEY || existingDevVars.API_KEY || "";
  if (sharedApiKey) {
    if (!merged.API_KEY) merged.API_KEY = sharedApiKey;
    if (!merged.VITE_RECEIPT_API_KEY) merged.VITE_RECEIPT_API_KEY = sharedApiKey;
  }

  // Preserve any worker keys that were in .dev.vars but not yet migrated to .env
  const unmigrated: [string, string][] = [];
  for (const key of WORKER_KEYS) {
    if (
      merged[key] === undefined &&
      existingDevVars[key] !== undefined &&
      existingDevVars[key] !== ""
    ) {
      merged[key] = existingDevVars[key];
      unmigrated.push([key, existingDevVars[key]]);
    }
  }

  // If we found legacy worker keys in .dev.vars not yet in .env, append them to .env so .env is truly complete
  if (unmigrated.length > 0 && existsSync(envPath)) {
    try {
      const currentEnvContent = readFileSync(envPath, "utf-8");
      const appendLines = [
        "",
        "# --- Migrated from .dev.vars ---",
        ...unmigrated.map(([k, v]) => `${k}=${v}`),
        "",
      ].join("\n");
      writeFileSync(envPath, currentEnvContent + appendLines, "utf-8");
    } catch (err) {
      console.warn("[sync-env] Notice: Could not append legacy keys to .env:", err);
    }
  }

  // Extract worker lines
  const lines: string[] = [
    "# Auto-generated from .env by scripts/sync-env.ts. Do not edit directly.",
    "# MonthExpense Cloudflare Worker local secrets & bindings.",
    "",
  ];

  for (const key of WORKER_KEYS) {
    if (merged[key] !== undefined && merged[key] !== "") {
      lines.push(`${key}=${merged[key]}`);
    }
  }
  lines.push("");

  const newDevVarsContent = lines.join("\n");

  let currentContent = "";
  if (existsSync(devVarsPath)) {
    try {
      currentContent = readFileSync(devVarsPath, "utf-8");
    } catch {}
  }

  if (currentContent !== newDevVarsContent) {
    writeFileSync(devVarsPath, newDevVarsContent, "utf-8");
  }

  return merged;
};

// If executed directly with bun/node
if (import.meta.main) {
  const merged = syncEnvToDevVars();
  console.log("✓ Successfully synchronized .env to .dev.vars");
  if (merged.API_KEY) {
    console.log("  - API_KEY: (configured)");
  }
  if (merged.VITE_GOOGLE_CLIENT_ID) {
    console.log("  - VITE_GOOGLE_CLIENT_ID: (configured)");
  }
  if (merged.REGULAR_API_KEY) {
    console.log("  - REGULAR_API_KEY: (configured)");
  }
}
