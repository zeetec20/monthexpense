# monthexpense

Mobile-first expense logger. Scan a receipt or speak an entry on the client;
a Cloudflare Worker turns the OCR text or voice transcript into strict,
validated expense data (title/amount/date/note, Rupiah-only for this MVP).

## Structure

| Scope | What | README |
|---|---|---|
| [`fe/`](./fe) | Vite + React + TypeScript client. Client-side OCR (PaddleOCR-JS) and voice capture (native STT, falling back to in-browser Whisper WASM), local-only storage (no account, no server DB). | [`fe/README.md`](./fe/README.md) |
| [`be/`](./be) | Cloudflare Worker (Hono) API. Turns OCR text / voice transcripts into `Receipt` JSON via Cloudflare Workers AI, Zod-validated. | [`be/README.md`](./be/README.md) |

FE and BE deploy independently — FE to Cloudflare Pages, BE to Cloudflare Workers — and talk over HTTP (`VITE_RECEIPT_API_URL` / `API_KEY`). Each scope keeps its own `package.json`, lockfile, and `.gitignore`.

## Install

```bash
make install     # bun install in both fe/ and be/
```

or per scope:

```bash
cd fe && bun install && cp .env.example .env      # set VITE_RECEIPT_API_URL
cd be && bun install && cp .dev.vars.example .dev.vars   # set API_KEY
```

## Develop

```bash
make dev-be   # wrangler dev (terminal 1)
make dev-fe   # vite dev server (terminal 2)
```

Need a public URL for a local dev server (webhook testing, testing on a phone)?

```bash
make tunnel-be   # exposes :8787 via a Cloudflare quick tunnel
make tunnel-fe   # exposes :5173 via a Cloudflare quick tunnel
```

Each prints an ephemeral `https://*.trycloudflare.com` URL — no account or config needed, run alongside the matching `dev-*` target.

See each scope's README for build/test/deploy details and API endpoints.

## Secrets

| Var | Declared where |
|---|---|
| `be`: `API_KEY`, `REGULAR_API_KEY`, `PREMIUM_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Cloudflare Worker secret (`wrangler secret put` / dashboard) for deployed; `be/.dev.vars` (gitignored) for local. **Never** in `be/wrangler.jsonc` — see [`be/README.md`](./be/README.md#config) for the full table. |
| `be`: everything else in `wrangler.jsonc` `vars` | Committed, non-sensitive — safe as plain config. |
| `fe`: `VITE_RECEIPT_API_URL`, `VITE_RECEIPT_API_KEY`, `VITE_GOOGLE_CLIENT_ID` | Cloudflare Pages → Settings → Environment variables (per Production/Preview) for deployed; `fe/.env` (gitignored) for local. |

**Per-user tier**, separate from the above: each connected user's own sync secret (standard vs premium) lives in *their* Google Sheet's "Config" tab, not in this repo or any BE database — see [`be/README.md`'s Tiers section](./be/README.md#tiers-and-where-a-users-own-secret-lives).

**Not a real secret once shipped:** any `VITE_*` var is inlined into the built JS by Vite — Cloudflare Pages has no way to keep it private from someone reading the deployed bundle, regardless of how it's filed on the dashboard. `VITE_RECEIPT_API_KEY` currently reuses the backend's `API_KEY` value (the same key `email-cipher.ts` uses for hashing), so that key is effectively public once the frontend is deployed. Not fixed here — flagging so it's a deliberate call, not an oversight.
