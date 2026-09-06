# Expense Notes (FE)

> Frontend scope of [monthexpense](../README.md) — see root README for repo-wide overview and install.

Mobile-first expense logger. Scan a receipt (client-side OCR → Cloudflare Worker parser), or add an entry manually / by voice (native browser speech-to-text first, falling back to an in-browser Whisper WASM model when that's unsupported or fails — e.g. Arc/Dia/Brave/Firefox — both handle English, Indonesian, or code-switched speech; same Worker parses the transcript into title/amount/date/note; Rupiah-only for this MVP). Everything's saved to this device only — no account, no server DB.

## Stack

Vite · Bun · React · TypeScript · Tailwind v4 · shadcn/ui · Zod · `@paddleocr/paddleocr-js` (PP-OCRv5, runs in a Worker) · `@huggingface/transformers` (Whisper WASM fallback for voice entry, also runs in a Worker).

## Develop

```bash
bun install
cp .env.example .env   # point VITE_RECEIPT_API_URL at your parser worker
bun run dev
```

## Build / test

```bash
bun run build
bun test
```

See `receipt-scanner-mvp-architecture.md` for the original scan pipeline spec.
