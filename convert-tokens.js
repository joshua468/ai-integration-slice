/**
 * Convert Figma design tokens to CSS variables.
 *
 * Reads design-tokens.tokens.json (exported by Figma Tokens / Tokens Studio)
 * and generates design-tokens.css declaring every token as a CSS custom
 * property. It separates:
 *   - Primitives (foundation palette) - not applied directly to UI
 *   - Color Roles (semantic colors)  - applied directly to UI, with an
 *     automatically derived dark theme (Material 3 tonal inversion)
 *   - Typography, Spacing & Effects
 *
 * References like {path.to.token} are converted to var(--path-to-token).
 *
 * Run with: node convert-tokens.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, 'design-tokens.tokens.json');
const OUTPUT_FILE = path.join(__dirname, 'design-tokens.css');

/**
 * Converts a JSON path array into a CSS custom property name.
 * @param {string[]} pathArray - The token path in the JSON tree.
 * @returns {string} A normalized CSS variable name (e.g. --colors-roles-primary).
 */
function toCssVarName(pathArray) {
  return (
    '--' +
    pathArray
      .join('-')
      .replace(/[\s.]+/g, '-')
      .replace(/[^\w-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
  );
}

/**
 * Normalizes a token reference path to a CSS variable name.
 * @param {string} aliasPath - A dot/space delimited reference path.
 * @returns {string} A normalized CSS variable name.
 */
function normalizeAlias(aliasPath) {
  return toCssVarName(aliasPath.split('.'));
}

/**
 * Derives the dark theme equivalent of a Material 3 tonal value.
 * @param {string} aliasPath - The referenced path (e.g. "primitives colors.primary color palete.primary40").
 * @returns {string} The CSS variable for the dark theme equivalent.
 */
function getDarkThemeAlias(aliasPath) {
  const match = aliasPath.match(
    /(.*(?:primary|secondary|tertiary|nuetral|nuetralvariant|error))(\d+)$/i
  );

  if (match) {
    const base = match[1];
    const tone = parseInt(match[2], 10);

    let darkTone = tone;
    if (tone >= 98) darkTone = 20;
    else if (tone === 95) darkTone = 30;
    else if (tone === 90) darkTone = 30;
    else if (tone === 80) darkTone = 40;
    else if (tone === 40) darkTone = 80;
    else if (tone === 30) darkTone = 90;
    else if (tone === 20) darkTone = 98;
    else if (tone <= 10) darkTone = 98;

    return `var(${normalizeAlias(`${base}${darkTone}`)})`;
  }

  return `var(${normalizeAlias(aliasPath)})`;
}

const primitiveVariables = [];
const roleVariablesLight = [];
const roleVariablesDark = [];
const otherVariables = [];

/**
 * Renders a single token value into the appropriate variable bucket.
 * @param {any} value - The raw token value.
 * @param {string} type - The token type (color, dimension, custom-shadow, ...).
 * @param {string[]} currentPath - The token path.
 */
function processValue(value, type, currentPath) {
  const firstKey = currentPath[0];
  const isColorRole = firstKey === 'colors roles';
  const isPrimitive =
    firstKey === 'primitives colors' || firstKey === 'color';

  if (typeof value === 'string') {
    // Token aliases (references to other tokens)
    if (type === 'color' && value.startsWith('{')) {
      const aliasPath = value.slice(1, -1); // strip { }
      const lightVar = `var(${normalizeAlias(aliasPath)})`;

      if (isColorRole) {
        roleVariablesLight.push(`  ${toCssVarName(currentPath)}: ${lightVar};`);
        roleVariablesDark.push(
          `  ${toCssVarName(currentPath)}: ${getDarkThemeAlias(aliasPath)};`
        );
      } else {
        otherVariables.push(`  ${toCssVarName(currentPath)}: ${lightVar};`);
      }
      return;
    }

    if (type === 'color') {
      if (isPrimitive) {
        primitiveVariables.push(`  ${toCssVarName(currentPath)}: ${value};`);
      } else if (isColorRole) {
        roleVariablesLight.push(`  ${toCssVarName(currentPath)}: ${value};`);
        roleVariablesDark.push(`  ${toCssVarName(currentPath)}: ${value};`);
      } else {
        otherVariables.push(`  ${toCssVarName(currentPath)}: ${value};`);
      }
      return;
    }

    // Other string values (font families, text cases, ...)
    otherVariables.push(`  ${toCssVarName(currentPath)}: ${value};`);
    return;
  }

  if (typeof value === 'number') {
    const suffix = type === 'dimension' ? 'px' : '';
    otherVariables.push(`  ${toCssVarName(currentPath)}: ${value}${suffix};`);
    return;
  }

  if (type === 'custom-shadow' && typeof value === 'object') {
    const shadow = `${value.offsetX}px ${value.offsetY}px ${value.radius}px ${value.spread}px ${value.color}`;
    otherVariables.push(`  ${toCssVarName(currentPath)}: ${shadow};`);
    return;
  }
}

/**
 * Recursively walks the token tree.
 * @param {object} node - The current JSON node.
 * @param {string[]} currentPath - Path tracking depth.
 */
function traverse(node, currentPath = []) {
  if (node && typeof node === 'object') {
    if ('value' in node) {
      processValue(node.value, node.type, currentPath);
      return;
    }

    for (const key in node) {
      if (key === 'extensions' || key === 'description') continue;
      traverse(node[key], [...currentPath, key]);
    }
  }
}

function generate() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('Tokens file not found:', INPUT_FILE);
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  traverse(tokens);

  const cssContent = `/**
 * Design Tokens
 * Auto-generated from design-tokens.tokens.json. Do not edit directly.
 *
 * Color system:
 * - Primitives: foundational palette, NOT applied directly to UI.
 * - Color Roles: semantic colors applied directly to UI.
 *   A dark theme is auto-derived using Material 3 tonal inversion.
 */

:root {
  /* --- Primitives (Foundation) --- */
${primitiveVariables.join('\n')}

  /* --- Typography, Spacing & Effects --- */
${otherVariables.join('\n')}

  /* --- Color Roles (Light) --- */
${roleVariablesLight.join('\n')}
}

/* --- Color Roles (Dark) --- */
@media (prefers-color-scheme: dark) {
  :root {
${roleVariablesDark.join('\n')}
  }
}

[data-theme="dark"] {
${roleVariablesDark.join('\n')}
}
`;

  fs.writeFileSync(OUTPUT_FILE, cssContent.trim() + '\n');
  console.log(`Generated ${OUTPUT_FILE} (${primitiveVariables.length} primitives, ${roleVariablesLight.length} color roles, ${otherVariables.length} other tokens).`);
}

generate();