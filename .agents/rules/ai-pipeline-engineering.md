# Rule: AI Pipeline Engineering, Schema Rigor & Reliability

## Scope & Purpose
Applies to all backend API routes (`src/app/api/**/*`), AI provider integrations (`src/lib/ai/**/*`), queue worker orchestration (`src/lib/queue/**/*`), schemas (`src/lib/schemas.ts`), and configuration (`src/lib/config.ts`).

---

## 1. Zero Silent Fallbacks & Truthful Error Architecture

1. **No Fake Successes:** Under no circumstances should an AI failure (e.g. Gemini 503, 429, timeout, or schema error) quietly fall back to fake mock data.
2. **Explicit Simulation Mode:** Simulation is only active when explicitly selected by the user (`modelProvider: "simulation"`). Even simulation mode must pass through Zod schema validation.
3. **Typed Failure Codes (`AIFailureError`):** Every failure must be classified into a typed machine-readable code:
   - `TIMEOUT`: Request exceeded `config.generation.contextTimeoutMs` (30s).
   - `RATE_LIMITED`: Provider returned 429 quota exhaustion.
   - `PROVIDER`: Upstream API 5xx or connection termination.
   - `VALIDATION`: Model output failed Zod schema parsing after retry attempts.
   - `BAD_REQUEST`: Malformed prompt or invalid parameters.
4. **Failure Recording:** The typed error and diagnostic message must be persisted directly to `Job.errorMessage` and displayed prominently in red/rose tones in the UI.

---

## 2. Strict Zod Schema & Retry Feedback Loop

1. **Schema Definitions (`src/lib/schemas.ts`):**
   - Role 1 (Structured Analyst): `StructuredDocumentSchema` (title, executiveSummary, sections, tables, actionItems, financials, metrics).
   - Role 2 (Follow-up Communicator): `FollowUpOutputSchema` (headline, summary, keyPoints, tone, readabilityLevel, metrics).
2. **Clean JSON Fences:** Always strip markdown code blocks (````json ... ````) before attempting `JSON.parse()`.
3. **Self-Healing Retry Loop (`src/lib/ai/orchestrator.ts`):**
   - Max attempts: `config.retry.maxAttempts` (default 3).
   - Exponential backoff: `config.retry.retryDelayMs` (1s, 2s).
   - On Zod validation failure, format the exact validation errors (`issue.path.join('.') + ': ' + issue.message`) and append them as diagnostic feedback to the next model prompt.

---

## 3. Distributed Queue & Storage Safety

1. **Bounded FIFO Queue:** Outbound AI inference calls are strictly capped by `config.queue.concurrency` (default 2) to protect API rate limits and avoid exceeding provider token quotas.
2. **Object Storage Isolation:**
   - Raw document bytes must never be stored in Prisma SQLite table columns.
   - Persist files to disk using `saveUpload()` under `storage/uploads/<uuid>/<safe_name>`.
   - Store only the relative `storageKey` on the `Job` record.
   - Always sanitize and resolve paths via `resolveUploadPath()` to block directory traversal attacks.

---

## 4. DB-Backed Rate Limiting

1. **Persistence:** Rate limits are backed by SQLite `RateLimitEntry` to prevent state loss during Next.js route re-evaluations in dev mode.
2. **Endpoints & Windows:**
   - `POST /api/jobs`: `config.rateLimit.upload` (15 requests / 60s per IP).
   - `POST /api/jobs/[id]/followup`: `config.rateLimit.followUp` (10 requests / 60s per IP).
   - Batch size cap: `config.rateLimit.maxFilesPerRequest` (8 files max per upload).
3. **Headers:** Return `429 Too Many Requests` with `Retry-After` and `X-RateLimit-Remaining` headers.

---

## 5. Telemetry & Cost Accounting

1. **Token Tracking:** Capture exact `promptTokens`, `completionTokens`, and `totalTokens` on every execution.
2. **Cost Calculation Formula (`src/lib/config.ts`):**
   $$\text{Spend} = \frac{\text{promptTokens} \times 0.75 + \text{completionTokens} \times 3.75}{1,000,000}$$
3. **Display Formatting:** Use `formatUsd(cost)` to render standard four-decimal figures (e.g., `$0.0038`) or exponential notation for sub-cent micro-costs.
