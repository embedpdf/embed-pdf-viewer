#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const target = process.argv[2] ?? process.env.PDF_RUNTIME_TARGET ?? 'wasm32';
const libDir = resolve(root, 'build/libpdfium', target);
const includeDir = resolve(libDir, 'include');
const outDir = resolve(root, 'build/generated');
const tsOut = resolve(root, 'src/core/pdf-functions.generated.ts');

const prefixes = /^(?:FPDF|EPDF|FORM|PDFiumExt_)/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && entry.name.endsWith('.h')) files.push(full);
  }
  return files;
}

function isCppHelperHeader(file) {
  return relative(includeDir, file).split(/[\\/]/).includes('cpp');
}

function abi(kind, cwrap) {
  return { kind, cwrap };
}

/**
 * Map of every PDFium typedef name to its fully-resolved canonical C type
 * (e.g. `FPDF_ANNOTATION_SUBTYPE` -> `int`, `FPDF_DOCUMENT` -> `struct
 * fpdf_document_t__ *`). We use this to disambiguate integer typedefs
 * (enums, BOOL, DWORD, ...) from real handle pointers, both of which share
 * the `FPDF_` prefix and would otherwise be misclassified by name alone.
 */
const typedefCanonical = new Map();

function recordTypedefs(node) {
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'TypedefDecl' && node.name) {
    const qual = node.type?.qualType ?? '';
    if (qual) typedefCanonical.set(node.name, qual);
  }
  if (Array.isArray(node.inner)) node.inner.forEach(recordTypedefs);
}

/** Resolve nested typedef chains until we hit a non-typedef'd canonical type. */
function fullyResolveTypedefs(qual, depth = 0) {
  if (depth > 8) return qual;
  for (const [name, canonical] of typedefCanonical) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(qual)) {
      return fullyResolveTypedefs(qual.replace(re, canonical), depth + 1);
    }
  }
  return qual;
}

/**
 * Classify a C type into target-aware ABI metadata.
 *
 * Two important target-dependent rules:
 *   - `size_t` / `ptrdiff_t` are `i32` on `wasm32` but `i64` on every native
 *     target we ship. We expose them as `number` to TS callers because every
 *     real-world index/count fits in a Number; the bridge knows how to feed
 *     each side.
 *   - Genuine 64-bit integers (`int64_t` / `uint64_t` / `long long`) stay
 *     `bigint` end-to-end because their values can exceed 2^53.
 *
 * Pointer detection has to win over primitive detection, otherwise
 * `float* value` (an output buffer) would be classified as a float instead
 * of a pointer.
 */
function classifyType(ctype, isReturn = false) {
  // Resolve any PDFium typedef names (e.g. FPDF_BOOL, FPDF_ANNOTATION,
  // FPDF_ANNOTATION_SUBTYPE) to their canonical C type. This lets us tell
  // an int-typedef'd enum apart from a struct-pointer-typedef without
  // hard-coding either set.
  const raw = ctype.replace(/\bconst\b/g, '').replace(/\s+/g, ' ').trim();
  if (raw === 'void') {
    return { ts: isReturn ? 'void' : 'number', wasm: abi('void', null), native: abi('void', null) };
  }
  // Treat well-known PDFium typedef'd primitives specially before falling
  // through to the generic resolver, because their canonical forms collide
  // with regular char/short/int and we want their semantic shape to win
  // (string, utf16, boolean) over the underlying numeric ABI.
  if (/\bFPDF_BYTESTRING\b/.test(raw)) {
    return { ts: 'string', wasm: abi('cstring', 'string'), native: abi('cstring', 'string') };
  }
  if (/\b(FPDF_WIDESTRING|FPDF_WCHAR)\b/.test(raw) && /\*/.test(raw)) {
    return { ts: 'Ptr', wasm: abi('utf16ptr', 'number'), native: abi('utf16ptr', 'bigint') };
  }
  if (/\bFPDF_BOOL\b/.test(raw) && !/\*/.test(raw)) {
    return { ts: 'boolean', wasm: abi('bool', 'boolean'), native: abi('bool', 'boolean') };
  }

  const clean = fullyResolveTypedefs(raw);

  // Pointers (the canonical form embeds the `*` regardless of whether the
  // source used a typedef'd handle or a raw struct pointer).
  if (/\bchar\s*\*/.test(clean)) {
    return { ts: 'Ptr', wasm: abi('cstring', 'number'), native: abi('cstring', 'bigint') };
  }
  if (/\*/.test(clean)) {
    return { ts: 'Ptr', wasm: abi('pointer', 'number'), native: abi('pointer', 'bigint') };
  }

  // Primitives.
  if (/\bbool\b/.test(clean)) {
    return { ts: 'boolean', wasm: abi('bool', 'boolean'), native: abi('bool', 'boolean') };
  }
  if (/\b(double|float)\b/.test(clean)) {
    const k = clean.includes('float') ? 'f32' : 'f64';
    return { ts: 'number', wasm: abi(k, 'number'), native: abi(k, 'number') };
  }
  if (/\b(int64_t|uint64_t|long long)\b/.test(clean)) {
    return { ts: 'bigint', wasm: abi('i64', 'bigint'), native: abi('i64', 'bigint') };
  }
  if (/\b(size_t|ptrdiff_t)\b/.test(clean)) {
    return { ts: 'number', wasm: abi('i32', 'number'), native: abi('i64', 'number') };
  }

  // Anything else that resolves to an integer/enum (`int`, `unsigned int`,
  // `unsigned long`, `enum _FOO_`, ...) is treated as i32. This covers
  // FPDF_BOOL (the bool case above wins via FPDF_BOOL's underlying `int`),
  // FPDF_DWORD (`unsigned long` -> i32), FPDF_OBJECT_TYPE (enum -> i32),
  // and FPDF_ANNOTATION_SUBTYPE (`int` -> i32).
  if (/\b(int|short|long|char|signed|unsigned|enum)\b/.test(clean)) {
    return { ts: 'number', wasm: abi('i32', 'number'), native: abi('i32', 'number') };
  }

  return { ts: 'number', wasm: abi('i32', 'number'), native: abi('i32', 'number') };
}

function collectFunctions(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.kind === 'FunctionDecl' && node.name && prefixes.test(node.name)) {
    const qual = node.type?.qualType || '';
    const match = qual.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      const [, retRaw, paramsRaw] = match;
      const params =
        paramsRaw === 'void' || paramsRaw.trim() === ''
          ? []
          : paramsRaw.split(',').map((raw) => {
              const meta = classifyType(raw, false);
              return { cType: raw.trim(), ...meta };
            });
      out.push({
        name: node.name,
        result: { cType: retRaw.trim(), ...classifyType(retRaw, true) },
        params,
      });
    }
  }
  if (Array.isArray(node.inner)) node.inner.forEach((child) => collectFunctions(child, out));
  return out;
}

if (!existsSync(includeDir)) {
  console.error(`missing include directory: ${includeDir}`);
  console.error(`run scripts/fetch-libpdfium.sh ${target} first`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const headers = walk(includeDir).filter((file) => !isCppHelperHeader(file)).sort();
const allHeader = resolve(outDir, 'all.h');
writeFileSync(
  allHeader,
  headers.map((file) => `#include "${relative(outDir, file)}"`).join('\n') + '\n',
);

const astPath = resolve(outDir, 'ast.json');
const astJson = execFileSync('clang', [
  '-std=c11',
  `-I${includeDir}`,
  '-fsyntax-only',
  '-Xclang',
  '-ast-dump=json',
  allHeader,
], { maxBuffer: 128 * 1024 * 1024 }).toString();
writeFileSync(astPath, astJson);

const ast = JSON.parse(readFileSync(astPath, 'utf8'));
recordTypedefs(ast);
const functions = collectFunctions(ast).sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(resolve(outDir, 'functions.json'), JSON.stringify({ target, functions }, null, 2) + '\n');
writeFileSync(
  resolve(outDir, 'exported-functions.txt'),
  functions.map((fn) => `_${fn.name}`).concat(['_malloc', '_free']).join(','),
);

const tsTypeOf = (meta) => (meta.ts === 'Ptr' ? 'Ptr' : meta.ts);
const tsParams = (fn) =>
  fn.params.map((param, index) => `arg${index}: ${tsTypeOf(param)}`).join(', ');
const tsReturn = (fn) => tsTypeOf(fn.result);

/** Strip the C-source helper field; keep only the runtime ABI metadata. */
const abiSlot = (meta) =>
  meta.ts === 'void' ? null : { ts: meta.ts, wasm: meta.wasm, native: meta.native };

writeFileSync(
  tsOut,
  `/* AUTO-GENERATED - DO NOT EDIT BY HAND. */\n` +
    `import type { Ptr } from './pdf-runtime-module';\n\n` +
    `export interface PdfFunctions {\n${functions
      .map((fn) => `  ${fn.name}: (${tsParams(fn)}) => ${tsReturn(fn)};`)
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
    `export const pdfFunctionSignatures = {\n${functions
      .map(
        (fn) =>
          `  ${fn.name}: { params: ${JSON.stringify(fn.params.map(abiSlot))}, result: ${JSON.stringify(
            abiSlot(fn.result),
          )} },`,
      )
      .join('\n')}\n} as const;\n`,
);

console.log(`generated ${functions.length} PDF runtime functions for ${target}`);
