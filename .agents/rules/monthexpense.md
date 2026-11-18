# MonthExpense: Architecture, Features & Project Invariants

Comprehensive technical reference and development guidelines for the MonthExpense project.

---

## 1. Architecture Overview

MonthExpense is a local-first, privacy-respecting personal expense tracker with an embedded fullstack architecture:

- **Frontend Client (`src/`)**:
  - React 19, Tailwind CSS v4, Radix UI & Shadcn primitives, Lucide icons.
  - Vite 6 with `@cloudflare/vite-plugin` for unified client + worker compilation.
  - Progressive Web App (`vite-plugin-pwa`) with on-demand service worker updates via `/version.json`.
- **Backend Worker (`src/worker/`)**:
  - Hono v4 running inside Cloudflare Workers (`nodejs_compat`).
  - Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast`, Whisper STT).
  - Upstash Redis REST API for sheet identity locking and rate limiting.
  - Static Assets binding (`c.env.ASSETS`) serving the compiled React client.
- **Type-Safe RPC Seam (`src/lib/api-client.ts`)**:
  - End-to-end typed client via Hono RPC `hc<AppType>(baseUrl)`.

---

## 2. Core Features & Domain Map

### A. Input Modalities

1. **Physical Receipt Scanner (`src/features/ocr/`, `src/features/receipt/`)**:
   - In-browser OCR via `@paddleocr/paddleocr-js` and `@techstark/opencv-js` (WASM).
   - Image preprocessing (`cropToPaper`, deskew, OOM fallback to 1024px).
   - Worker endpoint `POST /v1/receipts/parse` uses Workers AI under structured JSON Mode to extract line items, merchant, tax, discount, total, and suggested category.
2. **Voice Entry (`src/features/voice/`, `src/features/expense/voice.api.ts`)**:
   - Dual-path STT: Native browser `SpeechRecognition` with fallback to `POST /v1/voice/transcribe` (Whisper).
   - `POST /v1/expenses/parse` extracts structured expense inputs from spoken transcripts.
3. **Pasted Struk Teks (`src/components/expense/TextReceiptEntry.tsx`)**:
   - `POST /v1/receipts/parse-text` processes raw text from chat/e-commerce receipts (GoJek, Grab, Shopee) with independent daily quota tracking.
4. **Manual Entry (`src/components/expense/ManualEntryForm.tsx`)**:
   - Pure client-side form for rapid offline entry.

### B. Storage & Synchronization

1. **Local-First Device Storage (`src/features/expense/expense.store.ts`, `src/features/wallet/wallet.store.ts`)**:
   - Device `localStorage` is primary for expenses, wallets, and offline sync queues.
2. **Google Sheets Sync (`src/features/sync/`)**:
   - Talks directly to Google Sheets REST API from the browser via Google Identity Services (`google.accounts.oauth2`).
   - Auto-provisions spreadsheet tabs: `Transactions`, `Wallets`, `Config`, `Tren Pengeluaran`.
   - Offline queue (`sync-queue.ts`) flushes mutations upon reconnection.
   - HMAC-signed sync secret (`email-cipher.ts`) verified by Worker middleware (`identity-quota.ts`) to enforce daily AI caps (Standard: 20, Premium: 80).

### C. Analytics & Management

1. **Interactive Analytics (`src/components/analytics/`)**:
   - 5-day spending trend buckets (`thisMonth`, `last1m` rolling), monthly comparisons (`last3m`, `last6m`, `thisYear`), category distributions.
2. **Recurring Bills & Debts (`src/features/expense/schedule.ts`)**:
   - Schedules and debt tracking. Settled debts are excluded from net spending calculations.
3. **Multi-Wallet (`src/features/wallet/`)**:
   - Custom wallet balances with animal avatars and monthly spending cards.
4. **Bilingual i18n (`src/i18n/translations.ts`)**:
   - Complete Indonesian (`id`) and English (`en`) localization.

---

## 3. Strict Coding & Development Invariants

### Code Style & Formatting (Enforced by Biome)

- **Const Arrow Functions ONLY**: Every function and React component MUST use `const myFunc = (...) => ...`. `function` declarations are banned by Biome rule `useArrowFunction` and `useConsistentFunctionStyle` (except in third-party shims or UI overrides).
- **Domain-Explicit Naming**: Never write generic names like `parse()`, `readData()`, or `handleOpen()`. Use `parseReceiptText()`, `readConnectedSheetSecret()`, `requestEntryFlow()`.
- **Top-Level Re-Exports**: Re-exports (`export type { ... } from ...`) must immediately follow file imports, never inside logic blocks.
- **Single Mutation**: Derive values first and execute setters/mutations once at the end.

### Client-Side Build & Environment Invariants

- **Vite `define` Required**: All public client environment variables (`VITE_GOOGLE_CLIENT_ID`, `VITE_RECEIPT_API_KEY`):
  1. MUST be defined in `vite.config.ts`'s `define` block.
  2. MUST supply robust fallbacks in both `vite.config.ts` and `src/config/env.ts` so production/CI builds without `.env` never produce empty strings that break OAuth or API auth.
- **Error Diagnostics in Entry Hooks**: Every input hook (`useTextReceipt`, `useReceiptScanner`, `useVoiceExpense`) MUST capture `${error.name}: ${error.message}` in a `detail?: string` field and render it below translated error messages.
- **Bounded Async Operations**: Never make raw unbounded `fetch` calls in user-facing hooks. Always attach client-side timeouts or abort controllers to prevent buttons getting stuck on `"Memproses..."`.

### Gitflow & Deployment Policy

- **Never Auto-Push**: Stage explicit files individually (never `git add -A`). Commit with Conventional Commits. Always output the manual `git push origin <branch>` command for the user.
- **Mobile PWA Verification**: Mobile PWAs verify `/version.json` against the remote server. When troubleshooting mobile or PWA issues, verify whether local commits have been pushed to remote (`git log origin/<branch>..HEAD`).

### Testing & Quality Gates

- Client unit tests: `bun test`
- Cloudflare worker integration tests: `bun run test:worker`
- TypeScript check: `bun run typecheck`
- Linter & formatting: `bun run lint` and `bun run format:check`
- Production build: `bun run build`
