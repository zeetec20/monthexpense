# Receipt LLM Parser — Cloudflare Worker Architecture

## 1. Overview

A stateless REST API that accepts OCR text and uses Cloudflare Workers AI to transform it into a strict, validated receipt JSON structure.

The service is intentionally limited to:

- REST API
- OCR text input
- LLM-based extraction
- Strict JSON schema validation
- Output normalization
- Authentication
- Basic request protection
- Cloudflare Workers deployment
- Hono
- Bun for local development/tooling

The service does **not** handle image uploads, OCR processing, databases, queues, object storage, or client-specific logic.

---

## 2. Architecture

```text
                HTTP Client
                    |
                    | POST /v1/receipts/parse
                    | { "text": "OCR text..." }
                    v
        +---------------------------+
        |   Cloudflare Worker       |
        |                           |
        |           Hono            |
        |             |             |
        |             v             |
        |      Authentication       |
        |             |             |
        |             v             |
        |      Input Validation     |
        |             |             |
        |             v             |
        |      OCR Normalization    |
        |             |             |
        |             v             |
        |       Prompt Builder      |
        |             |             |
        |             v             |
        |       Workers AI          |
        |             |             |
        |             v             |
        |       JSON Extraction     |
        |             |             |
        |             v             |
        |       Schema Validation   |
        |             |             |
        |        +----+----+         |
        |        |         |         |
        |      valid     invalid     |
        |        |         |         |
        |        |      Repair       |
        |        |         |         |
        |        |      Validate     |
        |        |         |         |
        |        +----+----+         |
        |             |             |
        |             v             |
        |       Response JSON       |
        +-------------+-------------+
                      |
                      v
                 HTTP Client
```

The core principle is:

> Treat LLM output as untrusted input. Never return model output directly to the caller.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Cloudflare Workers | Serverless execution |
| HTTP framework | Hono | REST API routing and middleware |
| AI | Cloudflare Workers AI | LLM inference |
| Validation | Zod | Request and response validation |
| Package manager/tooling | Bun | Local development and dependency management |
| Deployment | Wrangler | Cloudflare deployment/configuration |
| Secrets | Cloudflare Worker Secrets | API authentication secret |
| Storage | None | Keep the service stateless |
| Database | None | Not required for the initial architecture |
| Queue | None | Requests are synchronous |
| Object storage | None | The API receives text, not images |

---

## 4. Project Structure

```text
receipt-parser/
├── src/
│   ├── index.ts
│   │
│   ├── routes/
│   │   ├── health.ts
│   │   ├── meta.ts
│   │   └── receipts.ts
│   │
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── error.ts
│   │   └── request-id.ts
│   │
│   ├── ai/
│   │   ├── model.ts
│   │   └── prompt.ts
│   │
│   ├── parser/
│   │   ├── extract-json.ts
│   │   ├── normalize.ts
│   │   └── repair.ts
│   │
│   ├── schemas/
│   │   ├── receipt.ts
│   │   └── request.ts
│   │
│   ├── services/
│   │   └── receipt-parser.ts
│   │
│   ├── lib/
│   │   └── constants.ts
│   │
│   └── types/
│       └── env.ts
│
├── test/
│   ├── parser/
│   ├── schemas/
│   └── routes/
│
├── wrangler.jsonc
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore
```

### Responsibilities

#### `routes/`

HTTP-specific concerns:

- Parse request
- Validate request body
- Invoke application service
- Format HTTP response

Routes should remain thin.

#### `services/`

Application/business logic.

For example:

```text
ReceiptParserService
    |
    +-- normalize OCR
    +-- build prompt
    +-- call AI
    +-- parse JSON
    +-- validate schema
    +-- repair if necessary
    +-- return Receipt
```

#### `ai/`

All Workers AI-specific code.

This prevents Cloudflare AI implementation details from leaking throughout the application.

#### `parser/`

Pure parsing and normalization logic.

This code should not depend on Hono or Cloudflare APIs where possible.

#### `schemas/`

Canonical API and domain schemas.

The schema is the source of truth for the JSON contract.

---

# 5. REST API

## `GET /health`

Used for basic service health checks.

Response:

```json
{
  "ok": true
}
```

This endpoint should not invoke the LLM.

---

## `GET /v1/meta`

Returns non-sensitive service metadata.

Example:

```json
{
  "service": "receipt-parser",
  "version": "1.0.0",
  "model": "configured-model"
}
```

Do not expose secrets, internal bindings, prompts, or infrastructure information.

---

## `POST /v1/receipts/parse`

Main extraction endpoint.

### Request

```json
{
  "text": "INDOMARET\nAQUA 600ML 2 4000\nTOTAL 8000"
}
```

### Request requirements

- `Content-Type: application/json`
- `text` must be a string
- `text` must not be empty
- Apply a maximum input length
- Reject malformed JSON
- Reject unsupported content types

Example maximum:

```text
15,000 characters
```

The limit should be configurable.

### Response

```json
{
  "data": {
    "merchant": {
      "name": "Indomaret",
      "address": null,
      "phone": null
    },
    "transaction": {
      "date": null,
      "time": null,
      "receipt_number": null
    },
    "items": [
      {
        "name": "Aqua 600ML",
        "quantity": 2,
        "unit_price": 4000,
        "discount": 0,
        "total": 8000
      }
    ],
    "subtotal": 8000,
    "tax": 0,
    "discount": 0,
    "service_charge": 0,
    "total": 8000,
    "payment": {
      "method": null,
      "amount": null
    },
    "metadata": {
      "currency": "IDR",
      "confidence": 0.95
    }
  }
}
```

---

# 6. Receipt Domain Schema

The schema should be conservative and predictable.

```text
Receipt
├── merchant
│   ├── name
│   ├── address
│   └── phone
│
├── transaction
│   ├── date
│   ├── time
│   └── receipt_number
│
├── items[]
│   ├── name
│   ├── quantity
│   ├── unit_price
│   ├── discount
│   └── total
│
├── subtotal
├── tax
├── discount
├── service_charge
├── total
│
├── payment
│   ├── method
│   └── amount
│
└── metadata
    ├── currency
    └── confidence
```

### Schema principles

1. Missing information should be `null`.
2. Never invent missing information.
3. Monetary values should be numeric.
4. Quantity should be numeric.
5. Dates should use a consistent format.
6. Currency should use a standardized currency code.
7. `items` should always be an array.
8. Optional fields should be nullable rather than inconsistently omitted.
9. The schema must be validated after LLM inference.
10. The API contract must be independent from the model's output format.

---

# 7. LLM Boundary

The LLM should be treated as an external, unreliable dependency.

```text
Application
    |
    | structured prompt
    v
Workers AI
    |
    | untrusted response
    v
Parser
    |
    v
Schema Validator
    |
    v
Application
```

Never:

```text
Workers AI
    |
    v
JSON.stringify(response)
    |
    v
HTTP response
```

Always validate the model response before returning it.

---

# 8. Prompt Design

The system prompt should define the extraction behavior.

Recommended principles:

- JSON only
- No Markdown
- No explanations
- No hallucination
- Missing values become `null`
- Preserve source information
- Do not infer unsupported values
- Follow the schema exactly
- Monetary fields must be numbers
- Return only the requested object

Conceptually:

```text
SYSTEM

You are a receipt data extraction engine.

Convert OCR text into the supplied receipt schema.

Rules:

1. Return JSON only.
2. Never return Markdown.
3. Never return explanations.
4. Never invent information.
5. Missing values must be null.
6. Preserve information from the OCR text.
7. Monetary values must be numeric.
8. Follow the schema exactly.
9. Do not add fields that are not part of the schema.
10. Return a single JSON object.
```

Then provide the OCR text separately.

Avoid unnecessarily large prompts because inference cost and latency increase with input size.

---

# 9. OCR Text Normalization

Before inference, perform lightweight normalization.

Recommended operations:

```text
normalize Unicode
normalize line endings
trim leading/trailing whitespace
collapse excessive whitespace
remove repeated blank lines
preserve line ordering
```

Do not aggressively transform the OCR text.

Receipt layout information can be useful to the model.

For example, avoid converting:

```text
ITEM       QTY       PRICE
AQUA       2         4000
ROTI       1         12000
```

into a completely flattened string.

---

# 10. JSON Extraction Pipeline

The model may return JSON surrounded by unwanted text.

The parser should handle safe cases:

```text
Raw model output
       |
       v
Remove Markdown fences
       |
       v
Locate JSON object
       |
       v
JSON.parse()
       |
       v
Zod validation
```

If parsing fails, do not attempt arbitrary text manipulation.

Return a controlled internal error or perform one bounded repair attempt.

---

# 11. Repair Strategy

Use at most one repair attempt.

```text
                    LLM
                     |
                     v
                JSON parser
                     |
             +-------+-------+
             |               |
           valid           invalid
             |               |
             v               v
          validate        repair LLM
             |               |
             |               v
             |            validate
             |               |
             +-------+-------+
                     |
                     v
                final result
```

If repair fails:

```json
{
  "error": {
    "code": "INVALID_MODEL_OUTPUT",
    "message": "The receipt could not be parsed."
  }
}
```

Avoid unlimited retries.

This protects both latency and Workers AI usage.

---

# 12. Error Contract

Use consistent error responses.

Example:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request body is invalid."
  }
}
```

Recommended error codes:

```text
INVALID_REQUEST
UNAUTHORIZED
PAYLOAD_TOO_LARGE
UNSUPPORTED_MEDIA_TYPE
AI_UNAVAILABLE
AI_TIMEOUT
INVALID_MODEL_OUTPUT
SCHEMA_VALIDATION_FAILED
INTERNAL_ERROR
```

Do not expose:

- model internals
- prompts
- stack traces
- secrets
- Cloudflare binding details
- raw AI failures

in production responses.

---

# 13. Authentication

For a personal API, a static API key is sufficient initially.

Request:

```http
Authorization: Bearer <API_KEY>
```

Store the key as a Cloudflare Worker Secret.

Do not commit the key to:

- Git
- `.env` files tracked by source control
- `wrangler.jsonc`
- frontend source code
- logs

Authentication should be implemented as Hono middleware.

---

# 14. Request Protection

Because Workers AI usage is limited, protect the inference endpoint.

Recommended controls:

```text
Authentication
       |
       v
Content-Type validation
       |
       v
Input size limit
       |
       v
Request rate limit
       |
       v
AI inference
```

At minimum:

- API authentication
- maximum OCR length
- maximum request body size
- bounded AI retries
- request timeout
- reject empty input

For a personal service, avoid adding Durable Objects or a database unless real usage requires them.

---

# 15. Stateless Design

The Worker should not persist request state.

```text
Request
   |
   v
Worker
   |
   +-- validate
   +-- normalize
   +-- AI
   +-- validate
   |
   v
Response
```

No:

```text
Database
Redis
Queue
R2
Durable Object
```

This makes the service:

- simple
- cheap
- easy to deploy
- easy to replace
- horizontally scalable
- compatible with the Cloudflare Workers execution model

---

# 16. Workers AI Abstraction

Do not call the AI binding throughout the application.

Create one abstraction:

```ts
interface ReceiptModel {
  parse(input: string): Promise<unknown>;
}
```

Then implement:

```text
ReceiptModel
    |
    └── WorkersAIReceiptModel
```

This provides model isolation.

Changing:

```text
Model A
    ↓
Model B
```

should only require changing the AI adapter/configuration rather than the entire application.

---

# 17. Configuration

Keep configuration centralized.

Example categories:

```text
MODEL_NAME
MAX_INPUT_LENGTH
AI_TIMEOUT_MS
MAX_REPAIR_ATTEMPTS
API_VERSION
SERVICE_VERSION
```

Separate:

### Secrets

```text
API_KEY
```

from:

### Non-secret configuration

```text
MODEL_NAME
MAX_INPUT_LENGTH
```

Do not hard-code environment-specific configuration throughout the source code.

---

# 18. Observability

Because the service is stateless, logs are the primary operational tool.

Log:

```text
request_id
route
status
latency
input_length
model
error_code
```

Do not log:

- full OCR text
- full receipt data
- authorization headers
- API keys
- sensitive receipt information

A request ID should be generated for every request and returned in a response header:

```http
X-Request-ID: <id>
```

This makes production debugging much easier.

---

# 19. Testing Strategy

The parser should be testable without Workers AI.

Separate the system into:

```text
HTTP layer
     |
Application layer
     |
AI adapter
     |
Parser/validator
```

### Unit tests

Test:

- OCR normalization
- JSON extraction
- Markdown fence removal
- schema validation
- numeric normalization
- date normalization
- malformed model responses
- missing fields

### Integration tests

Test:

```text
HTTP request
    ↓
Hono route
    ↓
mock AI
    ↓
schema validation
    ↓
HTTP response
```

Do not make real AI calls for every test.

### Evaluation dataset

Maintain a small corpus of representative receipt OCR samples:

```text
test/fixtures/
├── indomaret.txt
├── alfamart.txt
├── restaurant.txt
├── supermarket.txt
├── thermal-receipt.txt
├── poor-ocr.txt
└── handwritten-like.txt
```

Use this dataset to compare models and prompt changes.

---

# 20. Model Evaluation

Do not choose a model purely because it produces valid JSON.

Measure:

```text
JSON validity
Schema validity
Merchant accuracy
Item extraction accuracy
Quantity accuracy
Price accuracy
Total accuracy
Date accuracy
Latency
Neuron usage
```

The most important metric for this project is likely:

```text
field-level extraction accuracy
```

rather than general language quality.

A smaller model that reliably extracts:

```text
name
quantity
price
total
```

may be preferable to a larger model with higher inference cost.

---

# 21. Security Principles

Follow these rules:

1. Never trust LLM output.
2. Never trust client input.
3. Validate every request.
4. Validate every model response.
5. Never log credentials.
6. Avoid logging receipt contents.
7. Limit request size.
8. Limit inference retries.
9. Keep secrets in Worker Secrets.
10. Keep the API stateless.
11. Return controlled errors.
12. Keep AI prompts server-side.
13. Do not expose internal model configuration unnecessarily.
14. Pin dependency versions where practical.
15. Keep the Worker dependency footprint small.

---

# 22. Performance Principles

The primary performance path is:

```text
HTTP
 ↓
validation
 ↓
normalization
 ↓
AI inference
 ↓
validation
 ↓
HTTP
```

Do not add unnecessary middleware or services.

Optimize:

- prompt size
- OCR input size
- model selection
- output size
- retry count
- JSON parsing
- schema validation

The dominant latency will generally be AI inference, not Hono routing.

---

# 23. Cloudflare Deployment

The production deployment should be:

```text
Bun
 |
 | install / test
 v
Wrangler
 |
 v
Cloudflare Workers
 |
 +── Hono
 +── Workers AI
 +── Worker Secrets
```

Use Wrangler for local development and deployment.

Keep the application Worker-native by relying on Web APIs rather than Bun-specific server APIs.

Avoid building the application around:

```ts
Bun.serve()
```

because production runs in the Cloudflare Workers runtime.

---

# 24. Recommended API Versioning

Use explicit API versions:

```text
/v1/receipts/parse
```

Avoid:

```text
/parse
```

This makes future schema changes safer.

For example:

```text
/v1/receipts/parse
/v2/receipts/parse
```

can coexist if the receipt contract eventually changes incompatibly.

---

# 25. Recommended Response Contract

Keep successful responses predictable:

```json
{
  "data": {}
}
```

Keep errors predictable:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request body is invalid."
  }
}
```

Do not mix these formats:

```json
{}
```

```json
{
  "result": {}
}
```

```json
{
  "data": {}
}
```

A single response envelope makes the REST API easier to consume.

---

# 26. Final Architecture

```text
                         REST CLIENT
                             |
                             |
                     POST /v1/receipts/parse
                             |
                             v
              +----------------------------+
              |    Cloudflare Worker       |
              |                            |
              |           Hono             |
              |             |              |
              |             v              |
              |      Authentication        |
              |             |              |
              |             v              |
              |      Request Validation    |
              |             |              |
              |             v              |
              |      OCR Normalization     |
              |             |              |
              |             v              |
              |       Receipt Service       |
              |             |              |
              |             v              |
              |        Prompt Builder       |
              |             |              |
              |             v              |
              |       Workers AI            |
              |             |              |
              |             v              |
              |      JSON Extraction        |
              |             |              |
              |             v              |
              |      Schema Validation      |
              |             |              |
              |        +----+----+          |
              |        |         |          |
              |      valid     invalid      |
              |        |         |          |
              |        |      one repair    |
              |        |         |          |
              |        |      validate      |
              |        |         |          |
              |        +----+----+          |
              |             |              |
              |             v              |
              |       Response Envelope    |
              +-------------+--------------+
                            |
                            v
                       REST CLIENT
```

## 27. Design Decision Summary

| Decision | Recommendation |
|---|---|
| Runtime | Cloudflare Workers |
| Framework | Hono |
| Development | Bun |
| AI | Cloudflare Workers AI |
| API style | REST |
| Architecture | Stateless |
| Input | OCR text |
| Image handling | None |
| OCR | None |
| Database | None |
| Queue | None |
| Storage | None |
| Authentication | Bearer API key |
| Validation | Zod |
| LLM output | Untrusted |
| JSON handling | Parse → validate → normalize |
| Repair | Maximum one attempt |
| Retry | Strictly bounded |
| Logging | Metadata only |
| API version | `/v1` |
| Primary endpoint | `POST /v1/receipts/parse` |
| Health endpoint | `GET /health` |
| Metadata endpoint | `GET /v1/meta` |

## 28. Core Principle

The service should remain a thin, deterministic orchestration layer around an inherently probabilistic model:

```text
             LLM
              |
       probabilistic
              |
              v
       +-------------+
       | Application |
       | validation  |
       +-------------+
              |
        deterministic
              |
              v
        Strict JSON
```

The LLM is responsible for **interpreting OCR text**.

The application is responsible for **correctness, structure, validation, security, and API behavior**.

This separation is the foundation of the architecture.
