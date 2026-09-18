# Rule: UI/UX Design System, Design Tokens & Component Aesthetics

## Scope & Purpose
Applies to all frontend interfaces (`src/app/**/*.{tsx,jsx,css}`, `src/components/**/*.{tsx,jsx}`), design token definitions (`design-tokens.tokens.json`), and stylesheets (`design-tokens.css`, `src/app/globals.css`).

---

## 1. Design Token Pipeline Invariant

1. **Single Origin:** Tokens originate in `design-tokens.tokens.json` (Figma Tokens / Tokens Studio format).
2. **Deterministic Build:** Never hand-edit `design-tokens.css`. Always run `node convert-tokens.js` after editing token definitions.
3. **Semantic Role Mapping:**
   - Primitives (`--primitives-colors-*`) define the global palette scale (0-100).
   - Color Roles (`--colors-roles-*`) define the semantic context and automatically handle Material 3 dark-theme tonal inversions.
4. **Tailwind Extension:** Tailwind classes (`bg-primary`, `text-on-primary`, `bg-surface-elevated`, `bg-error-container`) must bind directly to CSS variables or configured theme extensions in `tailwind.config.ts`.

---

## 2. Dark-First Studio Aesthetic Standards

### 2.1 Color & Surface Hierarchy
- **Canvas Base (`#090d16`):** Deep cosmic charcoal providing high contrast for glowing data widgets.
- **Card Surfaces (`#0f172a`):** Slate-900 surface for dashboard cards, sidebar panels, and data tables.
- **Elevated Surfaces (`#1e293b`):** Slate-800 for modals, dropdown menus, and drilldown inspector drawers.
- **Borders & Strokes:** `1px solid rgba(255, 255, 255, 0.08)` or `border-slate-800`. Avoid high-opacity stark white borders.
- **Hero & Card Glows:** Use subtle radial gradients (e.g., `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.15), transparent)`).

### 2.2 Typography & Numerical Clarity
- **Primary Font:** Sans-serif (`DM Sans`, `Inter`, or system fallback).
- **Headings:** Bold/Semibold tracking-tight (`tracking-tight font-semibold`).
- **Telemetry & Metrics:** All token counts, timestamps, latencies, and dollar amounts must use `font-mono` (`tabular-nums`) to prevent optical wobble during live SSE updates.

### 2.3 Interactive State Polish
- **Hover Transitions:** `transition-all duration-200 ease-out`. Buttons must show subtle brightness shifts (`hover:opacity-90` or `hover:border-primary-500/50`).
- **Active / Selected States:** High-visibility luminous ring or accent border (`border-primary-500 bg-primary-500/10`).
- **Disabled States:** `disabled:opacity-40 disabled:cursor-not-allowed`.

---

## 3. Component Design Guidelines

### 3.1 Multi-File Dropzone
- Clear visual separation between drop area and file list.
- Dynamic drag-over feedback (`border-primary-500 bg-primary-500/10` with glowing border).
- Per-file chips showing filename, extension badge, formatted size (e.g. `245 KB`), and instant removal button.

### 3.2 Bounded FIFO Queue Visualizer
- Top-level status header showing `Active: X / Max · Queued: Y`.
- Visual progress bar reflecting stage transition percentage (0% to 100%).
- Animated pulsing badges during `PREPROCESSING` and `INFERENCE`.

### 3.3 Structured Document Tree Inspector
- Tabbed layout switching between **Visual Brief**, **Structured Schema (JSON/Tree)**, **Model Telemetry & Cost**, **Execution Logs (SSE)**, and **Raw LLM Trace**.
- Copy-to-clipboard buttons with instant visual feedback ("Copied!").
- Syntax-highlighted code containers with max-height scroll and custom slim scrollbars.

---

## 4. Accessibility & Responsive Breakpoints

- **Contrast:** Maintain WCAG 2.1 AA compliant contrast ($\ge 4.5:1$ for normal text, $\ge 3:1$ for large text/icons).
- **Keyboard Trapping:** Modal drilldowns must trap focus and release upon `Escape` keypress.
- **Responsiveness:** Fluid grid layouts adapting seamlessly across mobile (`sm: 640px`), tablet (`md: 768px`), and desktop (`lg: 1024px`, `xl: 1280px`).
