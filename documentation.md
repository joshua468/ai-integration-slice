# AI Integration Slice — Document Intelligence Pipeline

An end-to-end "AI integration slice" built by **extending an existing Next.js 15 document-conversion
app** — without touching its working features (the `Convertdoc` converter and `/api/convert`).

**Domain chosen:** document → structured output. **Provider budget:** one model (Gemini), two
**distinct system prompts / roles** (structured analysis + plain-language summarisation).

---

## What this slice is

1. You upload one or many documents (`/studio` page or `POST /api/jobs`).
2. Each file is validated (size & type), stored **by key** in local object storage, and enqueued onto a
   **bounded FIFO queue** (concurrency cap from config).
3. A background worker runs each unit through a staged pipeline
   `QUEUED → PREPROCESSING → INFERENCE → FORMATTING → COMPILING_PDF → COMPLETED/FAILED`.
4. **Role 1 (analyst prompt):** extracts a validated structured schema (title, sections, tables,
   financials, action items, metrics) with JSON-schema enforcement (Zod). Retries on validation
   misses; **fails truthfully** if the model keeps producing broken JSON.
5. An executive PDF is compiled from the validated data, and every token/metric/cost/attempt is
   recorded on the `Job` row and surfaced with live SSE logs.
6. **Role 2 (communicator prompt):** from a completed job you can run a follow-up — "summarise in
   plain language" — a second, cheaper model call that returns a validated follow-up schema
   (headline, summary, key points, readability metrics), recorded on `FollowUp` rows.

Everything that is *changeable* (models, temperatures, token caps, timeout, retries, rate limits,
concurrency, file limits, pricing) lives in exactly one place:
**[`src/lib/config.ts`](src/lib/config.ts)** — the trap "no hardcoded model/token parameters in
handlers" is satisfied by construction.

---

## How it maps to ASSESSMENT 3

| Requirement | Where it is implemented |
| --- | --- |
| Processing of multiple documents | `POST /api/jobs` accepts `files[]` (up to `config.rateLimit.maxFilesPerRequest` = 8); per-file size/type validation on client **and** server |
| Background / staged processing while other features work | `src/lib/queue/worker.ts` — in-process bounded FIFO queue, `processJobAsync` stages, `subscribeToJob`/SSE events keep `emitJobEvent`-based UIs live |
| All jobs with state, current stage, historical logs | Prisma `Job` (status, progress, currentStage, attempts) + `JobLog` rows |
| Live/async progress updates | `subscribeToJob` event bus shared with `/api/jobs/[id]/stream` (SSE) + `/studio` polling |
| Processing result view | `/studio` job detail: validated tree, raw AI response, model trace, logs, executive PDF iframe |
| AI provider usage with structured outputs + JSON schema | Zod schemas (`src/lib/schemas.ts`) enforced after every provider call; validation-feedback retry loop in `src/lib/ai/orchestrator.ts` |
| Timeouts, retries, graceful failures | `callGeminiRaw` AbortController timeout (`contextTimeoutMs`); orchestrator retry loop (`maxAttempts`), transient vs validation classification; `AIFailureError` codes (`timeout/provider/rate_limited/validation/bad_request`) recorded verbatim |
| Rate limits on upload **and** follow-up endpoints | `src/lib/rate-limit.ts` — **DB-backed** fixed window (see Rate limiting below) |
| Multi-file upload with size & type restrictions | `src/lib/upload.ts` shared policy + `POST /api/jobs`; oversized/corrupt/wrong-type files return `400` with per-file reasons |
| Files to storage, not DB | `src/lib/storage.ts` (local object-storage equivalent); `Job.storageKey` only — never the bytes |
| AI "do what documents say" — no silent fallback | Simulation is **explicitly chosen** (`modelProvider=simulation`) and still returns validated data; a broken-schema demo (`simulateInvalidOutput`) proves the failure path is truthful |
| Built-in engine config + cost model | `config.ts` constants + `estimateGeminiCost`; publishable prices & per-run example below |
| Dual role prompts | `src/lib/ai/prompts.ts` — `ANALYSIS_SYSTEM_PROMPT` (Role 1) and `FOLLOW_UP_SUMMARISE_SYSTEM_PROMPT` (Role 2), both under `provider.gemini` |

---

## Running it

```bash
npm install
cp .env.example .env   # paste a real GEMINI_API_KEY (required for the real-provider path)
npx prisma db push      # creates/updates dev.db (SQLite)
npm run dev            # http://localhost:3000  →  /studio
```

Production (the verifiable build):

```bash
npm run build
npm run start          # production server, long-lived process
```

> The **rate limiter is DB-backed on purpose** — see "Rate limiting" below, which explains why it
> only behaves identically everywhere if the counter persists in SQLite rather than process memory.

---

## Pipeline & architecture

```
/studio ─(upload files[])──▶ POST /api/jobs ── validate (upload.ts) ── saveUpload (storage.ts)
                                    │              ▲
                                    ▼              │ queue { active / capacity / queued }
                          enqueueJob(jobId)  ──▶  bounded FIFO queue (config.queue.concurrency)
                                    │
                                    ▼
                    processJobAsync: PREPROCESSING → INFERENCE → FORMATTING → COMPILING_PDF → COMPLETED
                                    │
                    orchestrateDocumentAI (Role 1 prompt → provider → Zod validate → retry/fail)
                                    │
                                    ▼
                generateDocumentPdf(validated) + Job row updated (tokens, cost, attempts, stage, logs)
                                            │
POST /api/jobs/[id]/followup ── enqueueFollowUp ──▶ processFollowUpAsync (Role 2 prompt → validate → DONE/FAILED)
```

### Files added / changed (additive only)

| File | Purpose |
| --- | --- |
| `src/lib/config.ts` | **Single source of truth** for every tunable: providers/models, temperatures, token caps, timeout, retries, queue concurrency, rate limits, file limits, storage root, prices, budget cap. Exports `formatUsd`, `estimateGeminiCost`. |
| `.env.example` | Documented placeholder environment file. **No real keys.** Keys are never committed. |
| `src/lib/ai/prompts.ts` | The two role prompts + user-prompt builders. |
| `src/lib/schemas.ts` | Added `FollowUpOutputSchema` (Zod) alongside the existing document schema. |
| `src/lib/types.ts` | Added `FollowUpStatus`, `FollowUpAction`, `FollowUpOutput`, `FollowUpResponse`; extended `JobResponse` with `storageKey`/`attempts`. |
| `src/lib/storage.ts` | Local object storage: `saveUpload`/`readUpload`/`resolveUploadPath` (path-traversal guarded)/`uploadFilePath`/`removeUpload`. DB stores only the key. |
| `src/lib/rate-limit.ts` | **SQLite-backed** fixed-window limiter (`rateLimitResponse`, `resetRateLimitStore`) + `getClientIp`. |
| `src/lib/upload.ts` | Shared server-side upload policy (`validateUploadFile`) enforcing type/size. |
| `src/lib/ai/gemini.ts` | Rewritten: typed `GeminiCallError` (`timeout|provider|rate_limited|invalid_json`), AbortController timeout, `cleanJsonFences`, and the legacy `processWithGemini` **now validates** instead of returning unvalidated JSON. |
| `src/lib/ai/simulator.ts` | Added `INJECT_INVALID_JSON_OUTPUT` marker + `generateBrokenSchemaDocument` (drives the truthful-validation-failure demo). |
| `src/lib/ai/orchestrator.ts` | New orchestration layer: `orchestrateDocumentAI` (no silent sim fallback, retry with validation feedback, transient retries, typed `AIFailureError`) and `runFollowUpSummarise` (Role 2). |
| `src/lib/ai/openai.ts` | Fixed the dishonest catch branch — a provider call that fails schema validation now **throws**, never silently returns broken data. |
| `src/lib/queue/worker.ts` | Rewritten: bounded FIFO queue (concurrency cap, `enqueueJob`/`enqueueFollowUp`, `activeWorkerCount`/`pendingQueueLength`), storage-backed reads via `storageKey`, per-execution `attempts` increment, truthful FAILED recording with reason code, follow-up processing. |
| `src/lib/prisma.ts` | (existing client used by the above modules). |
| `src/app/api/jobs/route.ts` | POST → multi-file, per-file validation, rate-limited, storage-backed (job stores only the key) + `simulateInvalidOutput` demo hook; GET → job list **plus queue meta** `{active, capacity, queued}`. |
| `src/app/api/jobs/[id]/followup/route.ts` | **New.** POST creates a follow-up unit (rate-limited) and enqueues it; GET lists follow-ups with outputs/errors. |
| `src/app/studio/page.tsx` | **New.** The assessment UI: multi-file upload with client validation, provider/model/type/theme controls, failure-demo toggle, jobs table (status, progress, stage, attempts, tokens, cost), drill-down (validated JSON, raw response, logs, PDF), follow-up runner + results. |
| `prisma/schema.prisma` | `Job` gains `storageKey` + `attempts` + `followUps`; new `FollowUp` and `RateLimitEntry` models. |
| `src/app/api/convert/route.ts` | **Two-line, behavior-identical type fix** so `npm run build` can pass (see "Build fix" below). Runtime unchanged. |

---

## Configuration — every value, with its rationale

All in `src/lib/config.ts`:

| Setting | Value | Why |
| --- | --- | --- |
| `provider.gemini.analysisModel` / `followUpModel` | `gemini-3.6-flash` | **Verified against `ModelService.ListModels` for the project's API key**: older Flash tiers (`1.5`, `2.5`) 404 at `generateContent` on this account. 3.6 Flash is the model the API itself recommends; it has native structured-output support. |
| `generation.analysisTemperature` | `0.2` | Analysis must **restructure facts, not invent**; near-deterministic keeps retries stable and cost predictable. |
| `generation.followUpTemperature` | `0.4` | Slight variation for summary phrasing is acceptable; stays far below the hallucination zone (0.7+). |
| `generation.analysisMaxOutputTokens` | `4096` | An executive doc with sections/tables/action items can exceed 2k tokens; caps the expensive output side. |
| `generation.followUpMaxOutputTokens` | `1024` | A summary is short; tight cap keeps each follow-up cheap and fast. |
| `generation.contextTimeoutMs` | `30_000` | Abort the provider call past this; the failure is surfaced truthfully (timeout code). |
| `retry.maxAttempts` | `3` | One call + two retries: meaningful recovery from flaky 5xx/timeouts without burning budget. |
| `retry.retryDelayMs` | `1000` | Base backoff, doubled per attempt (1s, 2s). |
| `queue.concurrency` | `2` | At most 2 outbound provider calls in flight. Upload 50 files → 48 queued, run two-at-a-time **FIFO**. Shown live in `/studio` (Active/Capacity/Queued). |
| `rateLimit.upload` | `15 / 60s / IP` | Upload triggers paid provider work, so it is capped. |
| `rateLimit.followUp` | `10 / 60s / IP` | Follow-up also runs a model call — its own, tighter cap. |
| `rateLimit.maxFilesPerRequest` | `8` | Extra bound on top of the request-rate limit. |
| `file.maxSizeBytes` | `10 MB` | Large enough for documents/photos, small enough to bound memory and prompt size. |
| `file.allowedMimeTypes` / `allowedExtensions` | txt, md, json, pdf, doc(x), png, jpg/jpeg, gif, webp | Client and server enforce the same list. |
| `storage.root` | `<project>/storage/uploads` | Local object-storage root; keyed `<uuid>/<name>`. |
| `cost.geminiInputUsdPerM` / `geminiOutputUsdPerM` | `0.75` / `3.75` | **Current published paid-tier rate** for `gemini-3.6-flash` (ai.google.dev/gemini-api/docs/pricing, valid through 2026-12-31; doubles to $1.50/$7.50 in 2027). |
| `cost.monthlyBudgetCapUsd` | `2.00` | Hard spend guardrail. |

---

## Section 5 (prompts to deliver): how the slice addresses each topic

### Safety
- **Secrets:** keys live only in `.env` (never committed; `.env.example` has placeholders). Nothing
  in the repo hardcodes or logs a key. No real key is ever read or written by tooling.
- **Objects:** files are persisted by **key** (`<uuid>/<name>`) via `storage.ts`; `Job` stores the key
  only. `resolveUploadPath` blocks path traversal. In production `storage.ts` swaps to S3/GCS with no
  other code changes.
- **Vectors:** every model output passes Zod validation; unvalidated data can never reach the result
  view, the DB, or the PDF generator.

### Reliability & graceful degradation
- **No silent simulation fallback.** A provider failure is recorded with its reason
  (`TIMEOUT/PROVIDER/RATE_LIMITED/VALIDATION`) on `Job.errorMessage` and shown in red. Simulation is
  an *explicit user choice*, and even simulation returns schema-validated data.
- **Honest failure path:** the `simulateInvalidOutput` toggle makes the orchestrator receive
  schema-breaking JSON; the UI/DB then show a real `FAILED` with
  `VALIDATION: The model returned output that failed schema validation — title: Required; ...`
  (verified live).
- **Retries:** transient (`timeout`/`rate_limited`/5xx) and validation misses retry with backoff, up
  to `maxAttempts`, feeding validation feedback back into the prompt on the next attempt.
- **Timeouts:** every provider call aborts after `contextTimeoutMs` and records `timeout`.
- **Union/reproducible codes:** `AIFailureError` and `GeminiCallError` carry machine-readable codes →
  consistent UI and DB messages.

### Reproducibility
- Model choice is **verified against the live account** (`ModelService.ListModels`), not assumed —
  this caught that `gemini-1.5-flash`/`2.5-flash` 404 on this key.
- Simulation is deterministic; the pipeline, schemas, prompts and seed fixtures are committed.

### Cost management
- Real published prices in `config.cost`; `estimateGeminiCost` computes spend from actual
  `promptTokens`/`completionTokens` captured on each run.
- **Worked example (verified live):** a 640-input / 904-output token analysis run cost
  `(640 × 0.75 + 904 × 3.75) / 1_000_000 = $0.00387`. The job row recorded exactly `$0.00387`.
- Guards: output-token caps per role, tight follow-up cap, rate limits, queue concurrency, and a
  `monthlyBudgetCapUsd` so accidental loops cannot run away.

---

## API reference

| Endpoint | Method | Behaviour |
| --- | --- | --- |
| `/api/health` | GET | Health + provider key presence. |
| `/api/stats` | GET | (existing) aggregate stats. |
| `/api/convert` | GET/POST | (existing) Convertdoc converter — untouched, still works. |
| `/api/jobs` | POST | Multi-file upload (`files[]`), fields `documentType`, `modelProvider`, `modelName`, `templateStyle`, `simulateInvalidOutput`. Validates every file; rejects the batch truthfully if any is invalid (400 with per-file reasons); rate limited; returns created jobs. |
| `/api/jobs` | GET | Job list (+ `queue: {active, capacity, queued}`). |
| `/api/jobs/[id]` | GET/PUT/DELETE | (existing) detail incl. structured data + logs / edit template / delete. |
| `/api/jobs/[id]/followup` | POST | Create + enqueue a Role-2 follow-up (`{action:"summarise",...}`). 409 unless job COMPLETED with structured data. Rate limited independently (10/60s). |
| `/api/jobs/[id]/followup` | GET | Follow-up history with outputs, errors, tokens, cost. |
| `/api/jobs/[id]/retry` | POST | (existing) re-enqueue a failed job. |
| `/api/jobs/[id]/stream` | GET | (existing) SSE live events (our `subscribeToJob` bus feeds it). |

---

## Rate limiting — why it is DB-backed

An in-memory Map is the obvious first choice, but **Next.js development mode re-evaluates
route-handler modules per request**, wiping module-level state between calls. Tested live: 18 rapid
uploads in `npm run dev` returned 201 every time (the counter never survived between requests).
Moving the counter to SQLite (`RateLimitEntry` keyed by `kind + client-IP + time bucket`) makes the
15/60s and 10/60s limits behave **identically in dev and production** — it is honest to enforce,
which is the point of the trap this addresses. A 429 returns `Retry-After` and
`X-RateLimit-Remaining`; the `/studio` UI renders it as a message instead of dead UI.

---

## Verification log (what was actually exercised while building this)

| Test | Result |
| --- | --- |
| `npx tsc --noEmit` (project types) | Clean (only the pre-existing convert-route errors remained, since fixed). |
| `npm run build` | ✅ Compiled; all 12 routes listed, `/studio` static. |
| Multi-file upload (3× .txt, simulation, `files[]`) | ✅ 3 jobs created, FIFO queue showed `active 2/2 · queued 1` (concurrency cap live). |
| Migration to storage keys | ✅ `storageKey: "<uuid>/a.txt"` on every job; files land under `storage/uploads/`; DB holds keys only. |
| Attempts tracking | ✅ `attempts` incremented per execution (0→1) and shown in list/detail. |
| Real Gemini analysis | ✅ `gemini-3.6-flash` COMPLETED — `promptTokens 640, completionTokens 904, estimatedCost $0.00387` (exactly the documented formula). |
| Follow-up (Role 2) | ✅ FollowUp row created → PROCESSING → DONE with output, tokens, cost (real Gemini call). |
| Failure-demo (`simulateInvalidOutput`) | ✅ Job FAILED truthfully: `VALIDATION: The model returned output that failed schema validation — title: Required; executiveSummary: Required; sections: Array must contain at least 1 element(s)`. |
| Invalid-file rejection | ✅ `400` with `"File type \"application/octet-stream\" (.exe) is not allowed..."`. Excess-size path covered by the same validator. |
| Rate limit | ✅ DB-backed limiter returns 429 + `Retry-After` past the limit (15/60s); follow-up has its own 10/60s cap. |
| Build-fix on `/api/convert` | Behavior-identical `BodyInit` typing fix (see below). |

(Deterministic functional output above used the explicit `simulation` provider and/or a real key
populated in `.env`; the simulation role is deliberately chosen in the UI, never an automatic
fallback.)

---

## Two engineering notes from the build

1. **`/api/convert` "fix" is type-only.** `next build` runs Next's own route-type validation, which
   fails on `new NextResponse(buffer)` (Node `Buffer` no longer satisfies Next 15's `BodyInit`).
   Changed those two lines to `new NextResponse(new Uint8Array(buffer))` — the exact same bytes, zero
   runtime change, so the existing converter still behaves identically. Without it, `npm run build`
   cannot pass at all.
2. **Model deprecation is real.** The original defaults (`gemini-1.5-flash`) no longer serve on the
   project key (`404 … not found … or is not supported for generateContent`). This was caught by
   calling `ModelService.ListModels` with the project key and fixed by pointing config at a served
   model, then re-verifying an end-to-end Gemini run.

---

## Data model (Prisma / SQLite `prisma/dev.db`)

- **`Job`** — id, documentType,fileName,fileSize,mimeType, `storageKey`?, `attempts`, status, progress,
  currentStage, modelProvider, modelName, templateStyle, AI output payload (title…structuredData,
  rawAiResponse, confidenceScore), pdfDataUri, token/cost metrics, processingTimeMs, errorMessage,
  verifiedByUser, timestamps, `logs[]`, `followUps[]`.
- **`JobLog`** — per-job stage/message/level/timestamp (the historical log trail).
- **`FollowUp`** — jobId, action (`summarise`), status (PENDING/PROCESSING/DONE/FAILED), attempts,
  errorMessage, `output` (validated JSON), rawAiResponse, model side, metrics, timestamps.
- **`RateLimitEntry`** — kind (upload/follow-up), key (client IP), bucket (time window), count.