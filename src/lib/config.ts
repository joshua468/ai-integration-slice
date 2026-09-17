import path from 'path';

/**
 * Central configuration for the AI Slice pipeline.
 * Every changeable value lives here and nowhere else (the trap is hardcoding
 * model names / token caps / temperatures inside handlers). Change a value here
 * and the whole system follows.
 *
 * The API key itself is NOT here — it lives in `.env` (GEMINI_API_KEY) and is
 * read at call time from process.env. Nothing in this project hardcodes a key.
 */
export const config = {
  /** Provider selection and model identifiers. */
  provider: {
    /** HTTP-route this provider if a key is present; falls back to an explicit "simulation" choice. */
    gemini: {
      // gemini-3.6-flash: recommended by the account's ModelService.ListModels result
      // and the model the API itself suggests for this key (older Flash tiers 404 at
      // generateContent). Strong structured-JSON behaviour, low latency, mid price.
      analysisModel: 'gemini-3.6-flash',
      followUpModel: 'gemini-3.6-flash',
    },
    openai: {
      analysisModel: 'gpt-4o-mini',
      followUpModel: 'gpt-4o-mini',
    },
  },

  /** Model parameters — each is justified in one line below. */
  generation: {
    // 0.2 — near-deterministic: analysis must restructure facts, not invent; low temperature keeps output stable and cost predictable across retries.
    analysisTemperature: 0.2,
    // 0.4 — slight variation for summarisation phrasing is acceptable, but 0.4 stays far from the creative/hallucination zone (0.7+).
    followUpTemperature: 0.4,
    // 4096 — an executive document with sections, tables, action items and metrics can exceed 2k tokens; this caps the expensive output side.
    analysisMaxOutputTokens: 4096,
    // 1024 — a summary is a short structure (headline + a few key points); a tight cap makes each follow-up cheap and fast.
    followUpMaxOutputTokens: 1024,
    // 30s — the provider must respond within this or the call is aborted; failures beyond this are surfaced truthfully to the user.
    contextTimeoutMs: 30_000,
  },

  /** Defined retry for transient failures and schema-validation misses. */
  retry: {
    // 3 — one call plus two retries: meaningful recovery from flaky 5xx/timeouts without burning the API budget.
    maxAttempts: 3,
    // 1000ms — base backoff; doubled between attempts (1s, 2s) to give rate limits time to reset.
    retryDelayMs: 1_000,
  },

  /** Queue concurrency — protecting the provider budget (see Section 5). */
  queue: {
    // 2 — at most two simultaneous outbound provider calls. Uploading 50 files queues 48 and runs them two at a time, FIFO.
    concurrency: 2,
  },

  /** In-memory rate limits keyed by client IP. */
  rateLimit: {
    // 15 upload requests / 60s per IP — the endpoint that triggers processing is the expensive one, so it is capped.
    upload: { windowMs: 60_000, max: 15 },
    // 10 follow-up requests / 60s per IP — the follow-up endpoint also runs a model call, so it has its own tighter cap.
    followUp: { windowMs: 60_000, max: 10 },
    // 8 — files per upload request, an extra bound on top of the request rate limit.
    maxFilesPerRequest: 8,
  },

  /** Upload accept policy enforced on both client and server. */
  file: {
    // 10 MB — large enough for documents/photos, small enough to bound memory and prompt size.
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: [
      'text/plain',
      'text/markdown',
      'application/json',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
    ],
    allowedExtensions: ['.txt', '.md', '.markdown', '.json', '.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.gif', '.webp'],
  },

  /** Local object-storage equivalent (see Section 5). The DB stores only the key. */
  storage: {
    // Uploads live under <project>/storage/uploads, keyed <uuid>/<original-name>.
    root: path.join(process.cwd(), 'storage', 'uploads'),
  },

  /**
   * Cost model — real published paid-tier prices (Google Gemini API, gemini-3.6-flash,
   * as documented on ai.google.dev/gemini-api/docs/pricing, valid through Dec 31 2026):
   *   input  $0.75 / 1M tokens
   *   output $3.75 / 1M tokens
   * (These double to $1.50 / $7.50 from Jan 1 2027.) See README Section 5 for the
   * per-run calculation.
   */
  cost: {
    geminiInputUsdPerM: 0.75,
    geminiOutputUsdPerM: 3.75,
    // A hard monthly spend guardrail for cost control on explicit-cost demo runs.
    monthlyBudgetCapUsd: 2.0,
  },
} as const;

/** Format a USD estimate for display. */
export function formatUsd(value: number): string {
  if (value === 0) return '$0.0000';
  if (value < 0.0001) return `$${value.toExponential(1)}`;
  return `$${value.toFixed(4)}`;
}

/** Estimate Gemini spend from token usage. */
export function estimateGeminiCost(promptTokens: number, completionTokens: number): number {
  return (promptTokens * config.cost.geminiInputUsdPerM + completionTokens * config.cost.geminiOutputUsdPerM) / 1_000_000;
}

export const maxFileSizeBytes = config.file.maxSizeBytes;
export const maxFilesPerRequest = config.rateLimit.maxFilesPerRequest;