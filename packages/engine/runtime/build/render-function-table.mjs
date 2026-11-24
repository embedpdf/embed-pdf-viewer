/**
 * Render `src/core/pdf-functions.generated.ts` from the runtime's functions.
 *
 * The signature table is written compactly: every distinct ABI slot once, and
 * each function as a line of slot indices, decoded into shared slot objects
 * when the module loads. Written as one object literal per slot, the table was
 * most of the engine worker's script (about 400 KB minified, a thousand
 * functions with nested literals), and parsing and building it was a large
 * part of the worker's start.
 *
 * Each entry is `{ name, tsParams, tsReturn, params, result }`, where `params`
 * and `result` hold `{ ts, wasm, native }` slots (`result` null for void).
 */
export function renderFunctionTable(functions) {
  const slots = [];
  const slotIndex = new Map();
  const indexOf = (slot) => {
    const key = JSON.stringify(slot);
    let index = slotIndex.get(key);
    if (index === undefined) {
      index = slots.length;
      slots.push(slot);
      slotIndex.set(key, index);
    }
    return index;
  };
  // `name result param param ...`, a void result written as `-`.
  const rows = functions.map((fn) =>
    [fn.name, fn.result ? indexOf(fn.result) : '-', ...fn.params.map(indexOf)].join(' '),
  );
  return (
    `/* Auto-generated - do not edit by hand. */\n` +
    `import type { Ptr } from './pdf-runtime-module';\n\n` +
    `export interface PdfFunctions {\n${functions
      .map((fn) => `  ${fn.name}: (${fn.tsParams}) => ${fn.tsReturn};`)
      .join('\n')}\n}\n\n` +
    `export type PdfFunctionTsKind = 'Ptr' | 'number' | 'string' | 'boolean' | 'bigint' | 'void';\n` +
    `export type PdfFunctionAbiKind = 'void' | 'bool' | 'i32' | 'i64' | 'f32' | 'f64' | 'pointer' | 'cstring' | 'utf16ptr';\n` +
    `export type PdfFunctionCwrapKind = 'number' | 'string' | 'boolean' | 'bigint' | null;\n` +
    `export interface PdfFunctionAbiTarget {\n` +
    `  readonly kind: PdfFunctionAbiKind;\n` +
    `  readonly cwrap: PdfFunctionCwrapKind;\n` +
    `}\n` +
    `export interface PdfFunctionAbiSlot {\n` +
    `  readonly ts: PdfFunctionTsKind;\n` +
    `  readonly wasm: PdfFunctionAbiTarget;\n` +
    `  readonly native: PdfFunctionAbiTarget;\n` +
    `}\n` +
    `export interface PdfFunctionSignature {\n` +
    `  readonly params: readonly PdfFunctionAbiSlot[];\n` +
    `  readonly result: PdfFunctionAbiSlot | null;\n` +
    `}\n\n` +
    `/** Every distinct parameter or result slot, referred to by index below. */\n` +
    `const SLOTS: readonly PdfFunctionAbiSlot[] = [\n${slots
      .map((slot) => `  ${JSON.stringify(slot)},`)
      .join('\n')}\n];\n\n` +
    `/** One function per line: its name, its result slot (\`-\` for void), its parameter slots. */\n` +
    'const TABLE = `\n' +
    rows.join('\n') +
    '\n`;\n\n' +
    `function decode(table: string): Readonly<Record<keyof PdfFunctions, PdfFunctionSignature>> {\n` +
    `  const out: Record<string, PdfFunctionSignature> = {};\n` +
    `  for (const row of table.split('\\n')) {\n` +
    `    if (!row) continue;\n` +
    `    const [name, result, ...params] = row.split(' ');\n` +
    `    out[name!] = {\n` +
    `      params: params.map((index) => SLOTS[Number(index)]!),\n` +
    `      result: result === '-' ? null : SLOTS[Number(result)]!,\n` +
    `    };\n` +
    `  }\n` +
    `  return out as Readonly<Record<keyof PdfFunctions, PdfFunctionSignature>>;\n` +
    `}\n\n` +
    `export const pdfFunctionSignatures = decode(TABLE);\n`
  );
}
