# Receipt Parser (BE)

> Backend scope of [monthexpense](../README.md) — see root README for repo-wide overview and install.

Stateless Cloudflare Worker that turns raw OCR receipt text into strict,
Zod-validated JSON via Cloudflare Workers AI. Full architecture rationale:
[`receipt-llm-cloudflare-architecture.md`](./receipt-llm-cloudflare-architecture.md).

## Setup

```bash
bun install
bun run types              # generates worker-configuration.d.ts from wrangler.jsonc
cp .dev.vars.example .dev.vars   # set API_KEY for local dev
```

## Develop

```bash
bun run dev          # wrangler dev — set LOCAL_MOCK_AI=true in .dev.vars so
                      # app code never calls the real model
bun run dev:remote    # wrangler dev --remote — real Workers AI, real neuron usage
```

> `wrangler dev` always opens a remote proxy session for the `ai` binding at
> startup — even with `LOCAL_MOCK_AI=true` — and requires `wrangler login` /
> a `CLOUDFLARE_API_TOKEN` to do so. This is a Wrangler/Workers AI platform
> constraint (Workers AI has no local simulation), not something app code
> controls. `LOCAL_MOCK_AI=true` only guarantees the app never _calls_ the
> model once the dev server is up — it doesn't remove the need to
> authenticate to start `wrangler dev` at all. For fully offline iteration
> with zero Cloudflare credentials, use `bun run test` (vitest simulates the
> binding locally without a remote proxy).

## Test

```bash
bun run test          # vitest run, via @cloudflare/vitest-pool-workers (real workerd runtime)
bun run test:watch
bun run typecheck
```

> If `bun run test` fails with `crypto.getRandomValues is not a function` /
> `crypto.hash is not a function`, that's a Bun-runtime/Vite incompatibility on
> this machine, not a project issue — run vitest under Node 20.12+/22+ instead,
> e.g. `node node_modules/vitest/vitest.mjs run`.

Unit tests (`test/parser/`, `test/schemas/`, `test/services/`) are pure —
no Workers AI involved. Integration tests (`test/controllers/`) call
`app.fetch(request, env, ctx)` directly with a `createFakeReceiptModel()`
result injected via `env.__testReceiptModel`, so no test ever hits real
Workers AI or costs neurons.

## Deploy

```bash
wrangler secret put API_KEY                    # once per environment
wrangler secret put REGULAR_API_KEY
wrangler secret put PREMIUM_API_KEY
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
bun run deploy:dry-run          # validate config
bun run deploy
```

## Config

| Var                                                   | Meaning                                                                                                                                                                                                                                               | Where declared                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `API_KEY`                                             | Bearer auth for `/v1/*`; also key material for `lib/email-cipher.ts`'s email-in-transit cipher. "Is this the real compiled app calling" — unrelated to which user or tier.                                                                            | **Secret** — `wrangler secret put` / dashboard, `.dev.vars` locally |
| `REGULAR_API_KEY`                                     | Signs standard-tier sheet secrets (`lib/email-cipher.ts`'s `computeSecretForEmail`, `scripts/mint-secret.ts`'s default path). Split from `API_KEY` so rotating the app's own service key can't silently invalidate every standard user's sync secret. | **Secret** — same as above                                          |
| `PREMIUM_API_KEY`                                     | Signs premium-tier sheet secrets — only ever produced by `scripts/mint-secret.ts --premium`, no HTTP path grants premium.                                                                                                                             | **Secret** — same as above                                          |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST endpoint (`lib/redis.ts`).                                                                                                                                                                                                         | **Secret** — same as above                                          |
| `MODEL_NAME`                                          | Workers AI model id, e.g. `@cf/meta/llama-3.1-8b-instruct`. Change this one value to swap models — `ReceiptModel` isolates the rest of the app from it.                                                                                               | `wrangler.jsonc` `vars` (committed, non-sensitive)                  |
| `MAX_INPUT_LENGTH`                                    | Max chars accepted in `POST /v1/receipts/parse` `text` field.                                                                                                                                                                                         | `wrangler.jsonc` `vars`                                             |
| `MAX_AUDIO_BYTES`                                     | Max decoded size accepted in `POST /v1/voice/transcribe` `audio` (base64) field.                                                                                                                                                                      | `wrangler.jsonc` `vars`                                             |
| `AI_TIMEOUT_MS`                                       | Per-AI-call timeout (`Promise.race`; doesn't cancel the backend call, just stops waiting).                                                                                                                                                            | `wrangler.jsonc` `vars`                                             |
| `MAX_REPAIR_ATTEMPTS`                                 | Bounded repair-loop attempts when model output fails schema validation.                                                                                                                                                                               | `wrangler.jsonc` `vars`                                             |
| `API_VERSION`, `SERVICE_VERSION`                      | Exposed via `GET /v1/meta`.                                                                                                                                                                                                                           | `wrangler.jsonc` `vars`                                             |
| `LOCAL_MOCK_AI`                                       | `true` swaps in `createFakeReceiptModel()`'s result. Keep `false` in `wrangler.jsonc` (deployed default); override to `true` in `.dev.vars` for offline local work.                                                                                   | `wrangler.jsonc` `vars` (default), `.dev.vars` (local override)     |

The 5 secrets are **never** written to `wrangler.jsonc` — only to Cloudflare's
encrypted secret store (deployed) and `.dev.vars` (gitignored, local). After
changing which vars exist, re-run `bun run types` to regenerate
`worker-configuration.d.ts`.

### Tiers and where a user's own secret lives

No user table, no Redis identity record — tier is entirely "which of
`REGULAR_API_KEY`/`PREMIUM_API_KEY` produced this secret's HMAC tag" (see
`lib/sheet-identity.ts`). Standard secrets mint themselves automatically on
first Google connect (`POST /v1/auth/google/connect`); premium doesn't have
an HTTP path on purpose — mint one with `scripts/mint-secret.ts --premium`
and hand it to the user.

The per-user secret itself isn't stored here at all — FE keeps its working
copy in `localStorage`, and also writes a durable copy into that user's own
"Config" sheet (`syncSecret` cell) so it survives a cleared browser/new
device without downgrading a premium user back to standard on reconnect.
That sheet cell is storage, not a trust boundary: BE still independently
re-verifies whatever secret it's handed against its own two keys, so a user
editing that cell by hand can't forge a tier. To upgrade someone, mint a
premium secret and overwrite their Config sheet's cell with it — no BE
change needed.

## Endpoints

- `GET /health` — `{"ok":true}`, unauthenticated, no AI call.
- `GET /v1/meta` — `{"service","version","model"}`, requires `Authorization: Bearer <API_KEY>`.
- `POST /v1/receipts/parse` — `{"text":"..."}` → `{"data":{...Receipt}}` or `{"error":{"code","message"}}`.
- `POST /v1/expenses/parse` — `{"text":"...", "referenceDate":"YYYY-MM-DD", "language":"en"|"id"}` (a spoken-language transcript, English or Indonesian; `language` is an optional hint from the client's toggle, the model handles EN/ID/mixed either way) → `{"data":{...Receipt}}` or `{"error":{"code","message"}}` — **the exact same `Receipt` shape `/v1/receipts/parse` returns** (see `schemas/receipt.ts`), just extracted from a spoken transcript instead of OCR text (`ai/prompt.ts`'s `EXPENSE_SYSTEM_PROMPT`). `items` has one entry per purchased good/service named (even a single purchase), empty only when `total` itself couldn't be determined. `metadata.validation_warning` is server-computed (never model text) — `parser/validate.ts`'s `checkArithmetic` (same as receipts) chained with the voice-only `checkVoiceCompleteness` (fires when there isn't enough independent data to cross-check but the total/an item/the merchant still wasn't clearly caught). Rupiah-only for this MVP — no currency field.
- `POST /v1/voice/transcribe` — `{"audio":"<base64>", "language":"en"|"id"}` (raw audio file bytes, e.g. webm/opus from `MediaRecorder`) → `{"data":{"text":"..."}}` or `{"error":{"code","message"}}`. Thin passthrough to `@cf/openai/whisper-large-v3-turbo` — no parse/repair loop, just speech-to-text. The middle tier of the client's voice-entry hybrid (native browser STT → this → local WASM Whisper fallback).

## Known scope decisions

- **No app-level rate limiting.** The architecture forbids KV/D1/Durable
  Objects/Redis, so no per-key counter can persist across requests/isolates
  in-Worker. Rate limiting is expected to live at the Cloudflare
  dashboard/WAF layer, outside this codebase.
- **Repair loop is per-call bounded, not global.** Each AI call (initial
  parse + each repair attempt) gets its own `AI_TIMEOUT_MS`; worst-case
  latency is `(1 + MAX_REPAIR_ATTEMPTS) × AI_TIMEOUT_MS`.
