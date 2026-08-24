/**
 * Identifier extraction.
 *
 * The most common documentation query is not a sentence, it is a name:
 * `useZoom`, `zoomTo`, `stagePlugin`, `@embedpdf/react`. Embeddings are poor at
 * exact tokens — they blur an identifier into its semantic neighbourhood — so
 * these are pulled out and indexed lexically, at the highest FTS weight.
 */

/**
 * Words that survive the shape tests below but carry no lookup value. Language
 * keywords are already excluded by requiring camelCase/PascalCase/@scope shape.
 */
const NOISE = new Set([
  'Array',
  'Boolean',
  'Error',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'Promise',
  'Record',
  'Set',
  'String',
  'Partial',
  'React',
  'Vue',
  'Svelte',
  'Angular',
  'App',
  'Component',
  'Props',
  'Type',
  'The',
  'This',
  'That',
  'And',
  'But',
  'You',
  'Your',
  'For',
  'From',
  'With',
  'When',
  'What',
  'Then',
  'Here',
  'They',
  'Not',
  'Use',
  'Add',
]);

/** `@embedpdf/react`, `useZoom`, `EPDFForm_GetValue`, `stage.zoomTo`. */
const PACKAGE = /@[a-z0-9-]+\/[a-z0-9-]+/g;
const IMPORT_SOURCE = /\bfrom\s+['"]([^'"]+)['"]/g;
const IMPORT_NAMES = /\bimport\s*(?:type\s*)?\{([^}]*)\}/g;
const CALL = /\b([a-z][A-Za-z0-9_]*)\s*\(/g;
const JSX_TAG = /<\/?([A-Z][A-Za-z0-9_]*)/g;
// Once the first lowercase-to-uppercase hump is present, the rest is one
// linear alphanumeric run. Repeating a run that already accepts uppercase
// created exponentially many equivalent partitions for the regexp engine.
const PASCAL = /\b([A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]*_[A-Za-z0-9_]+)\b/g;

function collect(source: string, pattern: RegExp, group = 1): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const value = match[group];
    if (value) found.push(value);
  }
  return found;
}

function keep(symbol: string): boolean {
  if (symbol.length < 3 || symbol.length > 64) return false;
  if (NOISE.has(symbol)) return false;
  // A bare lowercase word is prose, not an identifier. Require a shape that
  // only code produces: camelCase, PascalCase-with-a-hump, snake, or a scope.
  return (
    symbol.startsWith('@') ||
    symbol.includes('/') ||
    symbol.includes('_') ||
    symbol.includes('.') ||
    /[a-z][A-Z]/.test(symbol)
  );
}

/** Pulls identifiers out of a fenced code block. */
export function symbolsFromCode(code: string): string[] {
  return [
    ...collect(code, PACKAGE, 0),
    ...collect(code, IMPORT_SOURCE),
    ...collect(code, IMPORT_NAMES).flatMap((names) =>
      names.split(',').map((name) =>
        name
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      ),
    ),
    ...collect(code, CALL),
    ...collect(code, JSX_TAG),
    ...collect(code, PASCAL),
  ].filter(keep);
}

/**
 * Pulls an identifier out of inline code. Prose backticks a lot of things that
 * are not identifiers (`1`, `custom`, `200%`), so the shape test does the work.
 */
export function symbolsFromInlineCode(value: string): string[] {
  const trimmed = value.trim().replace(/\(\)$/, '');
  if (/\s/.test(trimmed)) return symbolsFromCode(trimmed);
  return keep(trimmed) ? [trimmed] : [];
}

export function dedupeSymbols(symbols: string[]): string[] {
  return [...new Set(symbols)].sort();
}
