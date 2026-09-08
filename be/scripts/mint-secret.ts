#!/usr/bin/env bun
// Mints a per-sheet signed secret — no HTTP endpoint for this on purpose
// (the app isn't open to wide users yet, see plan). Run manually:
//
//   bun scripts/mint-secret.ts [--premium]
//
// Writes nothing anywhere — the secret itself is the only artifact. Tier
// comes entirely from which signing key produced it (REGULAR_API_KEY =
// standard, PREMIUM_API_KEY = premium — see src/lib/sheet-identity.ts),
// verified by BE trying both keys, no Redis identity record involved. The
// secret also isn't bound to a spreadsheet yet — that happens lazily, on
// first real use, in middleware/identity-quota.ts (Redis, "one uuid, one
// sheet").
//
// Standard-tier secrets normally mint themselves on-demand instead (see
// controllers/auth.ts's POST /v1/auth/google/connect) — this script's
// standard path is mostly for local testing now. --premium is the one
// still-live reason to run this: to upgrade a user, mint one here, then
// overwrite the "syncSecret" cell in that user's Config sheet with it
// (see fe's google-provision.client.ts) — next reconnect/app load picks
// it up, no code or redeploy needed.
//
// Reads REGULAR_API_KEY / PREMIUM_API_KEY from the environment — .dev.vars
// is loaded automatically for local minting; export the real values
// yourself first to mint against production.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// .dev.vars uses the same KEY=VALUE-per-line shape as .env — load it into
// process.env for anything not already set there, so exported real env
// vars (prod minting) always win over the local file.
const loadDevVars = (path = ".dev.vars") => {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] === undefined) process.env[key] = value;
  }
};
loadDevVars();

const tier: "standard" | "premium" = process.argv.includes("--premium") ? "premium" : "standard";
const signingKey = tier === "premium" ? process.env.PREMIUM_API_KEY : process.env.REGULAR_API_KEY;
if (!signingKey) {
  console.error(
    `Missing ${tier === "premium" ? "PREMIUM_API_KEY" : "REGULAR_API_KEY"} in the environment.`,
  );
  process.exit(1);
}

const uuid = randomUUID();
// Same algorithm as src/lib/sheet-identity.ts's computeHash (Web Crypto
// there, node:crypto here) — both must produce an identical hex digest.
const hash = createHmac("sha256", signingKey).update(uuid).digest("hex");
const secret = hash + uuid;

console.log(`Secret (paste into this user's Config sheet's "syncSecret" cell):\n`);
console.log(secret);
console.log(`\nuuid: ${uuid}\ntier: ${tier}`);
console.log(`Binds to whichever spreadsheet first uses it — nothing to do here.`);
