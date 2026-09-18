# Reference Guide: Design Tokens & Styling Architecture

## Overview
This document outlines the token transformation pipeline from Figma design tokens to CSS variables and Tailwind utility classes.

---

## 1. Token Hierarchy

```
Figma Tokens Studio (design-tokens.tokens.json)
               │
               ▼  node convert-tokens.js
CSS Custom Properties (design-tokens.css)
               │
               ├─► Global Utility Bindings (src/app/globals.css)
               └─► Tailwind Theme Extensions (tailwind.config.ts)
```

### Primitives vs Semantic Roles
- **Primitives (`primitives colors`):** Raw color stops across luminance scales (e.g. `neutral0` to `neutral100`, `primary10` to `primary99`). Primitives are never bound directly to JSX component classes.
- **Color Roles (`colors roles`):** Semantic design intentions (`primary`, `on-primary`, `primary-container`, `secondary`, `error-container`). In `convert-tokens.js`, semantic roles automatically calculate dark theme tonal inversions (e.g., tone 90 in light maps to tone 30 in dark).

---

## 2. Token Naming Conventions

All tokens in JSON are converted using lowercase kebab-case prefixed with `--`:

| JSON Token Path | Generated CSS Variable |
| :--- | :--- |
| `primitives colors.neutral color palete.nuetral99` | `--primitives-colors-neutral-color-palete-nuetral99` |
| `color.roles.primary` | `--colors-roles-primary` |
| `color.roles.on primary` | `--colors-roles-on-primary` |
| `effect.soft shadow` | `--effect-soft-shadow` |
| `effect.medium shadow` | `--effect-medium-shadow` |

---

## 3. Dark Mode Palette Definition

```css
:root {
  --bg-surface: var(--primitives-colors-neutral-color-palete-nuetral99);
  --bg-surface-elevated: var(--primitives-colors-neutral-color-palete-nuetral100);
}

[data-theme="dark"], .dark {
  --bg-surface: #0f172a;
  --bg-surface-elevated: #1e293b;
  --colors-roles-primary: #818cf8;
  --colors-roles-on-primary: #1e1b4b;
}
```

---

## 4. UI Component Design Checklist

- [ ] Does the element use semantic utility classes (`bg-surface-elevated`, `text-on-surface`, `border-slate-800`)?
- [ ] Are active interactive states clearly distinguished with glowing rings or accent backgrounds?
- [ ] Does text copy meet WCAG 2.1 AA minimum 4.5:1 contrast against `#090d16` canvas?
- [ ] Are dynamic numerical metrics (tokens, time, costs) formatted in `font-mono tabular-nums`?
