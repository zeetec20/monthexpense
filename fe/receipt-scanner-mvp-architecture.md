# Receipt Scanner MVP — Vite + PaddleOCR + Receipt Parser Architecture

## 1. Overview

This project is a mobile-first receipt scanner built with:

- Vite
- Bun
- TypeScript
- Zod
- PaddleOCR.js
- PP-OCRv5
- ONNX Runtime Web
- Web Worker
- Cloudflare Worker receipt parser API
- Browser Camera API
- React

Primary flow:

```text
Mobile Browser
    │
    ├── Camera / File
    │
    ▼
Image Processing
    │
    ▼
PaddleOCR.js / PP-OCRv5
    │
    ▼
OCR text
    │
    ▼
POST /v1/receipts/parse
    │
    ▼
Cloudflare Worker
    │
    ▼
Structured Receipt JSON
    │
    ▼
Zod validation
    │
    ▼
Receipt Modal
```

The MVP intentionally does not include authentication, database storage, receipt history, or server-side OCR.

---

## 2. Technology Stack

| Area | Technology |
|---|---|
| Runtime / package manager | Bun |
| Build tool | Vite |
| Language | TypeScript |
| UI | React |
| OCR | PaddleOCR.js |
| OCR model | PP-OCRv5 |
| OCR runtime | ONNX Runtime Web |
| OCR execution | Web Worker |
| Validation | Zod |
| HTTP client | Native `fetch()` |
| Camera | Browser MediaDevices API / file input |
| Deployment | Static hosting |
| Parser backend | Cloudflare Worker |
| API format | JSON |

No Axios, React Query, Redux, or Zustand is required for this MVP.

---

# 3. MVP Scope

## Included

1. Open camera.
2. Capture receipt.
3. Preview captured image.
4. Run OCR locally.
5. Extract OCR text.
6. Send OCR text to receipt parser API.
7. Validate API response with Zod.
8. Display structured receipt in a modal.
9. Close modal and scan another receipt.

## Not included

- User authentication
- Database
- Receipt history
- User accounts
- Cloud image storage
- Server-side OCR
- Offline receipt synchronization
- Advanced receipt editing
- Analytics
- Payment/subscription

---

# 4. Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                        Mobile Browser                         │
│                                                               │
│  Camera                                                       │
│    │                                                          │
│    ▼                                                          │
│  Image Processing                                             │
│    │                                                          │
│    ▼                                                          │
│  PaddleOCR.js / PP-OCRv5                                      │
│    │                                                          │
│    │ Web Worker + ONNX Runtime Web                            │
│    ▼                                                          │
│  OCR Text                                                     │
│    │                                                          │
│    ▼                                                          │
│  Receipt Parser Client                                        │
│    │                                                          │
└────┼──────────────────────────────────────────────────────────┘
     │ HTTPS
     │ POST /v1/receipts/parse
     │ { text: "..." }
     ▼
┌───────────────────────────────────────────────────────────────┐
│                 Cloudflare Worker                             │
│                                                               │
│                 Receipt Parser / LLM                          │
│                         │                                     │
│                         ▼                                     │
│                  Structured JSON                               │
└─────────────────────────┬─────────────────────────────────────┘
                          │
                          ▼
                    Zod validation
                          │
                          ▼
                   Receipt object
                          │
                          ▼
                    Receipt Modal
```

The important architectural boundary is:

```text
OCR = client-side
Parsing = server-side
```

The original receipt image never needs to leave the device.

Only OCR text is sent to the parser API.

---

# 5. Project Structure

```text
receipt-scanner/
│
├── public/
│   └── ...
│
├── src/
│   │
│   ├── app/
│   │   ├── App.tsx
│   │   └── app.css
│   │
│   ├── components/
│   │   ├── camera/
│   │   │   ├── CameraView.tsx
│   │   │   └── CameraCaptureButton.tsx
│   │   │
│   │   ├── scanner/
│   │   │   ├── Scanner.tsx
│   │   │   ├── ScannerPreview.tsx
│   │   │   └── ScannerStatus.tsx
│   │   │
│   │   └── receipt/
│   │       ├── ReceiptModal.tsx
│   │       ├── ReceiptHeader.tsx
│   │       ├── ReceiptItems.tsx
│   │       ├── ReceiptSummary.tsx
│   │       └── ReceiptPayment.tsx
│   │
│   ├── features/
│   │   ├── ocr/
│   │   │   ├── ocr.client.ts
│   │   │   ├── ocr.worker.ts
│   │   │   ├── ocr.types.ts
│   │   │   └── ocr.config.ts
│   │   │
│   │   └── receipt/
│   │       ├── receipt.api.ts
│   │       ├── receipt.schema.ts
│   │       └── receipt.types.ts
│   │
│   ├── lib/
│   │   ├── image/
│   │   │   ├── resize.ts
│   │   │   ├── orientation.ts
│   │   │   └── preprocess.ts
│   │   │
│   │   └── http/
│   │       └── api-client.ts
│   │
│   ├── hooks/
│   │   ├── useCamera.ts
│   │   └── useReceiptScanner.ts
│   │
│   ├── config/
│   │   └── env.ts
│   │
│   └── main.tsx
│
├── .env
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

# 6. Environment Configuration

`.env`:

```env
VITE_RECEIPT_API_URL=https://receipt-parser.jusles363.workers.dev
```

`.env.example`:

```env
VITE_RECEIPT_API_URL=https://receipt-parser.example.workers.dev
```

Do not put secrets into Vite environment variables.

Anything prefixed with `VITE_` is available to the browser.

---

# 7. Receipt Parser API

The existing curl is:

```bash
curl -L -X POST 'https://receipt-parser.jusles363.workers.dev/v1/receipts/parse' \
-H 'Content-Type: application/json' \
-d '{
  "text": "ALFAMART..."
}'
```

For the MVP, remove the Authorization header.

The browser request is:

```http
POST /v1/receipts/parse
Content-Type: application/json
```

Body:

```json
{
  "text": "ALFAMART\nJl. Gatot Subroto Kav 12\n..."
}
```

The Cloudflare Worker is therefore public for the MVP.

Basic Cloudflare rate limiting / abuse protection is recommended even without authentication.

---

# 8. Receipt API Client

`src/features/receipt/receipt.api.ts`

```ts
import { receiptResponseSchema } from "./receipt.schema";

const API_URL = import.meta.env.VITE_RECEIPT_API_URL;

export async function parseReceipt(text: string) {
  const response = await fetch(
    `${API_URL}/v1/receipts/parse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Receipt parser failed: ${response.status}`,
    );
  }

  const json: unknown = await response.json();

  return receiptResponseSchema.parse(json);
}
```

This is the browser equivalent of the curl request.

Only this module should know the API endpoint.

---

# 9. Zod Receipt Schema

`src/features/receipt/receipt.schema.ts`

```ts
import { z } from "zod";

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

const receiptItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  discount: nullableNumber,
  total: z.number(),
});

const merchantSchema = z.object({
  name: z.string(),
  address: nullableString,
  phone: nullableString,
});

const transactionSchema = z.object({
  date: nullableString,
  time: nullableString,
  receipt_number: nullableString,
});

const paymentSchema = z.object({
  method: nullableString,
  amount: nullableNumber,
});

const metadataSchema = z.object({
  currency: nullableString,
  confidence: nullableNumber,
});

export const receiptSchema = z.object({
  merchant: merchantSchema,
  transaction: transactionSchema,
  items: z.array(receiptItemSchema),

  subtotal: nullableNumber,
  tax: nullableNumber,
  discount: nullableNumber,
  service_charge: nullableNumber,
  total: nullableNumber,

  payment: paymentSchema,

  metadata: metadataSchema,
});

export const receiptResponseSchema = z.object({
  data: receiptSchema,
});

export type Receipt = z.infer<typeof receiptSchema>;
export type ReceiptResponse = z.infer<
  typeof receiptResponseSchema
>;
```

Zod provides runtime validation and TypeScript inference.

---

# 10. OCR Architecture

PaddleOCR should run locally.

```text
React Main Thread
       │
       │ image
       ▼
Web Worker
       │
       ├── PaddleOCR.js
       ├── ONNX Runtime Web
       └── PP-OCRv5
       │
       ▼
OCR Result
       │
       ▼
Main Thread
```

Using a worker prevents OCR inference from blocking React rendering and UI interaction.

---

# 11. OCR Client

`src/features/ocr/ocr.client.ts`

Conceptually:

```ts
import { PaddleOCR } from "@paddleocr/paddleocr-js";

let ocrPromise: Promise<PaddleOCR> | undefined;

export function getOCR() {
  if (!ocrPromise) {
    ocrPromise = PaddleOCR.create({
      lang: "en",
      ocrVersion: "PP-OCRv5",
      worker: true,
    });
  }

  return ocrPromise;
}

export async function recognizeReceipt(image: Blob) {
  const ocr = await getOCR();

  const [result] = await ocr.predict(image);

  return result;
}
```

Keep PaddleOCR configuration isolated so the OCR implementation can be replaced later without affecting the UI.

---

# 12. OCR Result Normalization

Do not expose the raw PaddleOCR result throughout the application.

Create an adapter:

```text
PaddleOCR result
       │
       ▼
normalizeOcrResult()
       │
       ▼
Application OCR result
```

Recommended internal format:

```ts
export interface OcrLine {
  text: string;
  confidence: number | null;
}

export interface OcrDocument {
  text: string;
  lines: OcrLine[];
}
```

The parser primarily consumes:

```ts
document.text
```

Example:

```text
ALFAMART
Jl. Gatot Subroto Kav 12
Jakarta

No: 887712
14-Mar-2024  09:05

SUSU ULTRA 250ML 4 4500 18000
ROTI TAWAR 1 12000 12000
KOPI KAPAL API SACHET 5 1500 7500

Subtotal 37500
Diskon 2000
PPN 390
TOTAL 35890

DEBIT BCA 35890
```

That string is sent to the receipt parser.

---

# 13. Image Processing

Before OCR:

```text
Camera image
     │
     ▼
Orientation correction
     │
     ▼
Resize
     │
     ▼
Optional compression
     │
     ▼
PaddleOCR
```

For the MVP, use a maximum dimension around 2500px.

Example:

```text
4032 × 3024
      │
      ▼
2500 × 1875
```

This reduces memory and inference time while retaining enough detail for receipt OCR.

Do not retain multiple large image copies unnecessarily, especially on iOS.

---

# 14. Mobile Camera

## MVP approach

Use the native browser camera picker:

```tsx
<input
  type="file"
  accept="image/*"
  capture="environment"
/>
```

Advantages:

- Simple
- Android compatible
- iOS compatible
- Uses native camera UI
- Minimal implementation

This should be the first implementation.

---

# 15. Custom Camera — Future Enhancement

Later, a custom camera can use:

```ts
navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: {
      ideal: "environment",
    },
  },
});
```

Flow:

```text
Camera stream
     │
     ▼
<video>
     │
     │ capture
     ▼
<canvas>
     │
     ▼
Blob
     │
     ▼
OCR
```

This enables a custom receipt scanning experience with an on-screen document frame.

It is not required for the MVP.

---

# 16. Scanner State Machine

Use a single state instead of many unrelated booleans.

```ts
type ScannerState =
  | {
      status: "idle";
      receipt: null;
    }
  | {
      status: "ocr";
      receipt: null;
    }
  | {
      status: "parsing";
      receipt: null;
    }
  | {
      status: "success";
      receipt: Receipt;
    }
  | {
      status: "error";
      receipt: null;
      message: string;
    };
```

The application flow becomes:

```text
IDLE
 │
 │ capture
 ▼
OCR
 │
 │ OCR completed
 ▼
PARSING
 │
 │ API completed
 ▼
SUCCESS
 │
 ▼
RECEIPT MODAL
```

---

# 17. Scanner Hook

`src/hooks/useReceiptScanner.ts`

The hook should expose:

```ts
interface UseReceiptScanner {
  status: ScannerStatus;
  receipt: Receipt | null;
  error: Error | null;

  scan(image: Blob): Promise<void>;
  reset(): void;
}
```

Core implementation:

```ts
async function scan(image: Blob) {
  setState({
    status: "ocr",
    receipt: null,
  });

  const ocrResult = await recognizeReceipt(image);

  const document = normalizeOcrResult(ocrResult);

  setState({
    status: "parsing",
    receipt: null,
  });

  const response = await parseReceipt(document.text);

  setState({
    status: "success",
    receipt: response.data,
  });
}
```

This hook is the orchestration layer.

---

# 18. Receipt Modal

The modal receives structured receipt data.

```ts
interface ReceiptModalProps {
  receipt: Receipt;
  open: boolean;
  onClose: () => void;
}
```

It should not know:

- how OCR works
- how the API works
- how images are processed
- where the Cloudflare Worker is hosted

It only renders a `Receipt`.

---

# 19. Receipt Modal UI

Recommended structure:

```text
┌─────────────────────────────────┐
│ Receipt                     ×   │
├─────────────────────────────────┤
│ ALFAMART                        │
│ Jl. Gatot Subroto Kav 12        │
│ Jakarta                         │
│                                 │
│ 14 Mar 2024 · 09:05             │
│ Receipt #887712                 │
├─────────────────────────────────┤
│ Items                           │
│                                 │
│ SUSU ULTRA 250ML                │
│ 4 × Rp 4.500             18.000 │
│                                 │
│ ROTI TAWAR                      │
│ 1 × Rp 12.000            12.000 │
│                                 │
│ KOPI KAPAL API SACHET           │
│ 5 × Rp 1.500              7.500 │
├─────────────────────────────────┤
│ Subtotal                Rp37.500│
│ Discount                 -Rp2.000│
│ Tax                         Rp390│
│                                 │
│ TOTAL                   Rp35.890│
├─────────────────────────────────┤
│ DEBIT BCA              Rp35.890 │
└─────────────────────────────────┘
```

The modal should display structured data, not raw OCR text.

---

# 20. Currency Formatting

Keep monetary values numeric in the API.

Format only in the UI:

```ts
export function formatIDR(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
```

Example:

```ts
formatIDR(35890);
```

Result:

```text
Rp35.890
```

---

# 21. Date Formatting

Keep API dates normalized:

```text
2024-03-14
```

Format them in the UI:

```text
14 Mar 2024
```

Do not store presentation-specific strings in the API.

---

# 22. Complete Runtime Flow

The core operation should effectively be:

```text
Image
  │
  ▼
Preprocess
  │
  ▼
PaddleOCR
  │
  ▼
normalizeOcrResult()
  │
  ▼
OCR text
  │
  │ HTTPS
  ▼
Cloudflare Worker
  │
  ▼
Receipt parser / LLM
  │
  ▼
JSON
  │
  ▼
Zod validation
  │
  ▼
Receipt object
  │
  ▼
Receipt Modal
```

---

# 23. Error Handling

## Camera error

Display:

```text
Unable to access camera.

Please allow camera permission and try again.
```

## OCR error

Display:

```text
Unable to read the receipt.

Please make sure the receipt is clear and try again.
```

## Parser error

Display:

```text
Unable to process this receipt.

Please try scanning it again.
```

Do not expose raw errors such as:

```text
TypeError: Failed to fetch
```

or:

```text
ZodError: [...]
```

to users.

Log technical errors during development.

---

# 24. Network Behavior

OCR works locally:

```text
Image
  │
  ▼
PaddleOCR
  │
  ▼
OCR text
```

Receipt parsing requires network connectivity:

```text
OCR text
  │
  ▼
Cloudflare Worker
```

Therefore:

```text
Offline:
  OCR       → works
  Parsing   → unavailable

Online:
  OCR       → works
  Parsing   → works
```

For the MVP, no offline queue is required.

---

# 25. CORS

The Cloudflare Worker must allow requests from the frontend.

For a simple MVP:

```http
Access-Control-Allow-Origin: *
```

A stricter production configuration should use the exact frontend origin:

```http
Access-Control-Allow-Origin: https://your-domain.com
```

Because the MVP has no browser authentication, wildcard CORS can be acceptable temporarily.

---

# 26. Security Model

The frontend must not contain secrets.

Do not create:

```env
VITE_API_SECRET=...
```

Vite variables are bundled into the client.

If the Cloudflare Worker eventually needs an LLM provider API key:

```text
Browser
   │
   │ OCR text only
   ▼
Cloudflare Worker
   │
   │ private API secret
   ▼
LLM provider
```

Never:

```text
Browser
   │
   │ LLM API secret
   ▼
LLM provider
```

The secret must stay inside the Cloudflare Worker.

---

# 27. Performance Strategy

Because OCR runs on the user's device:

1. Resize large images.
2. Use PP-OCRv5 mobile models.
3. Run inference in a Web Worker.
4. Limit worker threads where appropriate.
5. Release image resources after processing.
6. Cache model assets.
7. Avoid retaining multiple large image copies.

Recommended pipeline:

```text
Camera
  │
  ▼
Normalized image
  │
  ▼
Worker
  │
  ▼
OCR
  │
  ▼
Release image
  │
  ▼
Text
```

---

# 28. OCR Model Initialization

The first OCR operation can take longer because the runtime and model assets need to initialize.

Distinguish:

```text
Loading OCR engine...
```

from:

```text
Reading receipt...
```

First scan:

```text
Loading OCR engine...
Preparing OCR model...
Reading receipt...
```

Subsequent scans:

```text
Reading receipt...
```

This makes the UX clearer.

---

# 29. UI States

Recommended states:

```text
Idle
 │
 ▼
Camera
 │
 ▼
Processing OCR
 │
 ▼
Parsing receipt
 │
 ▼
Receipt ready
 │
 ▼
Modal
```

Example main screen:

```text
┌──────────────────────────────────┐
│                                  │
│          Receipt Scanner         │
│                                  │
│      Scan your receipt and       │
│      extract the details.        │
│                                  │
│       ┌──────────────────┐       │
│       │   Scan Receipt   │       │
│       └──────────────────┘       │
│                                  │
└──────────────────────────────────┘
```

---

# 30. No Global State

For the MVP, avoid:

```text
Redux
Zustand
Jotai
Recoil
```

React state is sufficient.

The important application state is:

```ts
Receipt | null
```

and:

```ts
ScannerStatus
```

The scanner hook can own this state.

---

# 31. Module Boundaries

## OCR module

```text
features/ocr/
├── ocr.client.ts
├── ocr.worker.ts
├── ocr.config.ts
└── ocr.types.ts
```

Only this module knows about PaddleOCR.

Components should use:

```ts
recognizeReceipt(image)
```

not:

```ts
PaddleOCR.create(...)
```

## Receipt module

```text
features/receipt/
├── receipt.api.ts
├── receipt.schema.ts
└── receipt.types.ts
```

Only this module knows the parser endpoint.

Components should use:

```ts
parseReceipt(text)
```

not:

```ts
fetch("https://receipt-parser...")
```

---

# 32. Dependency Graph

```text
App
 │
 ▼
Scanner
 │
 ├── Camera
 ├── Preview
 └── Status
 │
 ▼
useReceiptScanner()
 │
 ├── recognizeReceipt()
 │      │
 │      └── PaddleOCR
 │
 └── parseReceipt()
        │
        └── Receipt API
               │
               ▼
              Zod
               │
               ▼
            Receipt
               │
               ▼
         ReceiptModal
```

---

# 33. Mobile Compatibility

Target:

```text
Android
  ├── Chrome
  └── Firefox

iOS
  └── Safari

Desktop
  ├── Chrome
  ├── Firefox
  └── Safari
```

The core application remains the same across platforms.

No Android-specific OCR implementation is required.

No iOS-specific OCR implementation is required.

PaddleOCR runs through the browser runtime.

---

# 34. PWA

A PWA is optional but recommended as a second phase.

Add:

```text
manifest.json
service worker
icons
```

Users can install the application on Android and iOS.

The PWA still uses:

```text
Vite
React
TypeScript
PaddleOCR.js
```

PWA support should not block the first MVP.

---

# 35. Deployment

Build:

```bash
bun run build
```

Output:

```text
dist/
```

Deploy the static `dist/` directory to a static hosting provider.

Backend:

```text
https://receipt-parser.jusles363.workers.dev
```

Architecture:

```text
                Internet
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
    Vite Static App    Cloudflare Worker
          │                 │
          │ local OCR       │ parser
          │                 │
          └───────┐   ┌─────┘
                  │   │
                  ▼   ▼
                 User
```

---

# 36. Implementation Milestones

## Phase 1 — OCR

```text
[ ] Create Vite project
[ ] Configure Bun
[ ] Configure TypeScript
[ ] Install PaddleOCR.js
[ ] Configure PP-OCRv5
[ ] Configure Web Worker
[ ] Implement image picker
[ ] Extract OCR text
```

## Phase 2 — Parser

```text
[ ] Configure VITE_RECEIPT_API_URL
[ ] Implement receipt.api.ts
[ ] POST /v1/receipts/parse
[ ] Remove Authorization header
[ ] Implement Zod schema
[ ] Validate response
[ ] Implement error handling
```

## Phase 3 — UI

```text
[ ] Scanner screen
[ ] Capture button
[ ] OCR loading state
[ ] Parser loading state
[ ] Receipt modal
[ ] Merchant section
[ ] Transaction section
[ ] Items section
[ ] Summary section
[ ] Payment section
```

## Phase 4 — Mobile

```text
[ ] Camera capture
[ ] Environment camera
[ ] Image resizing
[ ] iOS testing
[ ] Android testing
[ ] Memory testing
```

## Phase 5 — Polish

```text
[ ] PWA
[ ] OCR model caching
[ ] Better camera UI
[ ] Receipt scanning frame
[ ] Better error messages
[ ] Performance optimization
```

---

# 37. Final Architecture

```text
                         VITE APP
              ┌──────────────────────────┐
              │                          │
              │        React UI           │
              │                          │
              │   Scanner → Modal        │
              │          │               │
              │          ▼               │
              │   useReceiptScanner      │
              │       │          │       │
              │       ▼          ▼       │
              │     OCR        Parser    │
              │       │          │       │
              │       ▼          │       │
              │  PaddleOCR       │       │
              │  PP-OCRv5        │       │
              │  Web Worker      │       │
              │       │          │       │
              │       └────┐     │       │
              │            ▼     │       │
              │          text    │       │
              └────────────┼─────┼───────┘
                           │     │
                           │ HTTPS
                           ▼     │
                  ┌─────────────────────┐
                  │ Cloudflare Worker   │
                  │                     │
                  │ /v1/receipts/parse │
                  │                     │
                  │ Receipt Parser      │
                  └──────────┬──────────┘
                             │
                             ▼
                       Structured JSON
                             │
                             ▼
                       Zod validation
                             │
                             ▼
                        Receipt object
                             │
                             ▼
                       Receipt Modal
```

---

# 38. Core Design Decisions

| Decision | MVP choice |
|---|---|
| OCR location | Client-side browser |
| OCR model | PP-OCRv5 |
| OCR runtime | ONNX Runtime Web |
| OCR execution | Web Worker |
| Image source | Camera / file |
| Receipt parsing | Cloudflare Worker |
| Authentication | None |
| API client | Native fetch |
| API validation | Zod |
| State management | React state |
| HTTP library | None |
| Database | None |
| Receipt storage | None |
| Server-side OCR | None |
| Original image upload | None |
| PWA | Optional |
| Backend image processing | None |

---

# 39. Core Principle

The entire MVP should follow one simple boundary:

```text
              DEVICE
                 │
                 │ image
                 ▼
             PaddleOCR
                 │
                 │ text
                 ▼
              NETWORK
                 │
                 ▼
        Cloudflare Worker
                 │
                 │ structured JSON
                 ▼
              DEVICE
                 │
                 ▼
           Receipt Modal
```

This architecture keeps OCR private and local, keeps the backend lightweight, avoids unnecessary infrastructure, and allows the OCR and receipt-parser implementations to evolve independently.
