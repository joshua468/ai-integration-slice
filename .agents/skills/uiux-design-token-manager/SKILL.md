---
name: uiux-design-token-manager
description: >-
  Use this skill to inspect, synchronize, and compile Figma design tokens into CSS custom properties and Tailwind themes, manage light/dark tonal roles, and ensure WCAG 2.1 AA accessibility compliance across UI components.
---

# UI/UX Design Token Manager

This skill provides step-by-step procedures for managing design tokens exported from Figma/Tokens Studio, compiling them into CSS custom properties via `convert-tokens.js`, mapping them to Tailwind CSS classes, and auditing UI component aesthetics.

---

## Workflows

### 1. Synchronize & Compile Tokens from Figma JSON
When `design-tokens.tokens.json` is updated or when design token values need to be refreshed:

```bash
# Run the token conversion script
node convert-tokens.js
```

**Verification:**
- Inspect `design-tokens.css` to verify that all primitives and semantic roles were declared under `:root` and `[data-theme="dark"]` / `.dark`.
- Check that alias references (e.g. `{primitives colors.primary color palete.primary40}`) were converted into CSS `var(...)` syntax without unresolved brackets.

---

### 2. Map Design Tokens to Tailwind Utilities
Ensure newly added color roles or effect shadows are available in `tailwind.config.ts` or `src/app/globals.css`:

1. **Semantic Color Roles in `src/app/globals.css`:**
   ```css
   .bg-surface {
     background-color: var(--primitives-colors-neutral-color-palete-nuetral99);
   }
   .bg-surface-elevated {
     background-color: var(--primitives-colors-neutral-color-palete-nuetral100);
   }
   .bg-primary {
     background-color: var(--colors-roles-primary);
   }
   .text-on-primary {
     color: var(--colors-roles-on-primary);
   }
   ```
2. **Dark Mode Surfaces in `tailwind.config.ts`:**
   ```typescript
   colors: {
     background: '#090d16',
     surface: '#0f172a',
     'surface-elevated': '#1e293b',
     'surface-highlight': '#334155',
   }
   ```

---

### 3. Audit UI Accessibility (WCAG 2.1 AA)
When designing or modifying cards, buttons, or badges:
1. Verify contrast ratio against dark background (`#090d16`):
   - Text (`#f8fafc` or `text-slate-200`): Ratio $> 10:1$ (Pass AAA).
   - Secondary Text (`#94a3b8` or `text-slate-400`): Ratio $> 4.8:1$ (Pass AA).
   - Badges: Combine translucent backgrounds (`bg-indigo-500/15`) with high-contrast text (`text-indigo-300`) and subtle borders (`border-indigo-500/30`).
2. Test keyboard navigation and focus rings (`focus-visible:ring-2 focus-visible:ring-primary-400`).

---

## References & Helper Files
- [Design Tokens Architecture Guide](./references/design-tokens-guide.md)
