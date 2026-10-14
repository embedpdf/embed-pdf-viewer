/**
 * The tool table as plain JavaScript checks it: no `strictNullChecks`, as a reader's script on an
 * HTML page or a non-strict app. Every way to write a tool compiles (the viewer docs' examples),
 * and a mistake is still an error. `pnpm typecheck` runs it (`tsconfig.json` beside it), so an
 * unused `@ts-expect-error` fails too.
 */

/** @typedef {import('../../../src/tools/definitions').AnnotationToolInput} AnnotationToolInput */

/** @type {AnnotationToolInput[]} */
export const tools = [
  // A built-in tool with other defaults.
  { id: 'highlight', defaults: { color: '#fde047', opacity: 0.4 } },
  { id: 'ink', defaults: { color: '#1d4ed8', strokeWidth: 2 } },
  // A tool of your own, from a built-in one.
  { id: 'approved', extends: 'free-text', defaults: { contents: 'Approved', fontColor: '#15803d' } },
  // A tool of your own, from its kind.
  { id: 'red-box', subtype: 'square', defaults: { color: '#dc2626' } },
];

/** @type {AnnotationToolInput} */
// @ts-expect-error no built-in tool has this id, and it names no kind or base
export const unknownTool = { id: 'nope', defaults: { color: '#000000' } };

/** @type {AnnotationToolInput} */
// @ts-expect-error a base that isn't a built-in tool
export const unknownBase = { id: 'approved', extends: 'nope' };

/** @type {AnnotationToolInput} */
// @ts-expect-error a highlight's defaults take no stroke width
export const wrongDefaults = { id: 'highlight', defaults: { strokeWidth: 'thick' } };
