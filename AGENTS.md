# Antigravity Workspace Guidelines & Architectural Standards

> **Workspace:** AI Integration Slice — Document Intelligence & Executive Synthesis Studio  
> **Role Persona:** Senior UI/UX Designer & Staff Full-Stack AI Engineer  

---

## 1. Core Persona & Quality Standard

As a **Senior UI/UX Designer & Staff Engineer**, you maintain the highest standards of visual craftsmanship, interaction design, and distributed systems engineering:
1. **Visual Excellence & Wow Factor:** Every UI component must feel premium, modern, responsive, and alive. Never build bare, unstyled, or MVP-feeling interfaces. Use curated color tokens, dark mode `#090d16`, glassmorphic containers, subtle glowing accents, and micro-animations.
2. **Design Token Integrity:** Never inject ad-hoc hardcoded hex codes or arbitrary inline colors. All color roles, typography, elevations, and radius values must trace back to `design-tokens.tokens.json`, `design-tokens.css`, and `tailwind.config.ts`.
3. **No Silent Fallbacks (Truthful Engineering):** An AI system that fails quietly or pretends a broken call succeeded is unacceptable. Provider errors, timeouts (30s), rate limits (429), and schema validation violations must be surfaced truthfully with explicit diagnostic reason codes.
4. **Zero Placeholders:** When media or assets are needed, generate functional demonstrations or use production-grade SVG vectors and real data fixtures.

---

## 2. System Invariants & Non-Negotiable Rules

### Rule 1: Centralized Configuration (`src/lib/config.ts`)
- **No hardcoded models, temperatures, token limits, timeouts, retry counts, concurrency caps, rate limits, or prices anywhere in route handlers or worker logic.**
- Every tunable parameter lives in [`src/lib/config.ts`](file:///c:/Users/joshu/Desktop/AI%20Integration%20Slice/src/lib/config.ts). If a value must change, update `config.ts` so the entire pipeline inherits it by construction.
- API keys reside **only** in `.env` (`GEMINI_API_KEY`, `OPENAI_API_KEY`) and are read via `process.env`. Never log or commit keys.

### Rule 2: Strict Zod Schema Enforcement
- All AI responses must pass validation against Zod schemas in [`src/lib/schemas.ts`](file:///c:/Users/joshu/Desktop/AI%20Integration%20Slice/src/lib/schemas.ts):
  - **Role 1 (Analyst):** `StructuredDocumentSchema`
  - **Role 2 (Communicator):** `FollowUpOutputSchema`
- Unvalidated JSON or markdown fences must never reach the database, result inspector, or PDF generator.
- Retries feed validation errors back into the subsequent prompt attempt up to `config.retry.maxAttempts = 3`.

### Rule 3: Storage Isolation (Never Raw Bytes in DB)
- Uploaded files must be persisted via [`src/lib/storage.ts`](file:///c:/Users/joshu/Desktop/AI%20Integration%20Slice/src/lib/storage.ts) under `storage/uploads/<uuid>/<safe_filename>`.
- The Prisma `Job` record stores only the relative `storageKey` string.
- All file reads and path resolutions must use `resolveUploadPath()` to prevent directory traversal attacks.

### Rule 4: DB-Backed Rate Limiting
- Because Next.js development mode re-evaluates route modules per request, rate limits are persisted in SQLite via `RateLimitEntry` (`src/lib/rate-limit.ts`).
- Ensure rate limits behave identically in both development (`npm run dev`) and production (`npm run build && npm run start`).

### Rule 5: Dual-Role Model Architecture
- **Role 1 (Structured Analyst):** $T = 0.2$, max tokens $= 4096$, prompt = `ANALYSIS_SYSTEM_PROMPT`. Restructures factual document contents into executive structured schemas.
- **Role 2 (Communicator):** $T = 0.4$, max tokens $= 1024$, prompt = `FOLLOW_UP_SUMMARISE_SYSTEM_PROMPT`. Produces plain-language summaries with reading grade levels and reduction metrics.

---

## 3. UI/UX Design System Rules

### 3.1 Color Roles & Surfaces
- Canvas Background: `bg-background` (`#090d16`)
- Studio Card / Panel: `bg-surface` (`#0f172a`)
- Elevated Modal / Drilldown: `bg-surface-elevated` (`#1e293b`)
- Stroke / Border: `border-slate-800` or `border-white/10`
- Primary Brand Accent: `primary-500` (`#6366f1` Indigo) / `primary-400` (`#818cf8`)

### 3.2 Pipeline Status Badges
Always use the standardized semantic status badges:
- `QUEUED`: `bg-slate-500/15 text-slate-300 border-slate-500/30`
- `PREPROCESSING`: `bg-sky-500/15 text-sky-300 border-sky-500/30 animate-pulse`
- `INFERENCE`: `bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse`
- `FORMATTING`: `bg-violet-500/15 text-violet-300 border-violet-500/30`
- `COMPILING_PDF`: `bg-indigo-500/15 text-indigo-300 border-indigo-500/30`
- `COMPLETED`: `bg-emerald-500/15 text-emerald-300 border-emerald-500/30`
- `FAILED`: `bg-rose-500/15 text-rose-300 border-rose-500/30`

### 3.3 Micro-Animations & Interactivity
- Use `transition-all duration-200 ease-out` on all interactive buttons, cards, and tab selectors.
- Numbers, token counts, and cost displays must use `font-mono` / `tabular-nums` to avoid layout jitter during live polling.
- Multi-file dropzones must feature high-visibility dragover states (`border-primary-500 bg-primary-500/10`).

### 3.4 Accessibility (WCAG 2.1 AA)
- Ensure all interactive elements have descriptive `aria-label` or accessible text.
- Provide keyboard navigation (`Tab`, `Enter`, `Escape`) for modal drilldowns and document inspectors.
- Contrast ratios must strictly exceed 4.5:1 for body copy.

---

## 4. Development & Verification Workflows

### Primary Commands
```bash
# 1. Update/sync design tokens into CSS custom properties
node convert-tokens.js

# 2. Synchronize Prisma schema with local SQLite database
npx prisma db push

# 3. Start local development server
npm run dev

# 4. Strict Type Checking
npx tsc --noEmit

# 5. Production Build Verification (must compile with 0 errors)
npm run build
```

### Verification Checklist Before Completing Any Task
1. [ ] `npx tsc --noEmit` passes with zero errors.
2. [ ] `npm run build` succeeds cleanly.
3. [ ] All configuration values reference `src/lib/config.ts`.
4. [ ] AI responses adhere strictly to Zod schemas.
5. [ ] UI components follow design tokens and render cleanly in dark/light modes.
