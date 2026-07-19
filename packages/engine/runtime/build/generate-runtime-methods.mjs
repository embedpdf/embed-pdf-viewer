#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const methods = [
  'wasmExports',
  'UTF16ToString',
  'UTF8ToString',
  'addFunction',
  'ccall',
  'cwrap',
  'getValue',
  'removeFunction',
  'setValue',
  'stringToUTF16',
  'stringToUTF8',
];

const selfDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(selfDir, 'generated'));
mkdirSync(outDir, { recursive: true });

writeFileSync(resolve(outDir, 'exported-runtime-methods.txt'), methods.join(','), 'utf8');
writeFileSync(
  resolve(outDir, 'runtime-methods.ts'),
  `/* AUTO-GENERATED - DO NOT EDIT BY HAND. */\n` +
    `/// <reference types="emscripten" />\n\n` +
    `export interface WasmExports {\n  malloc: (size: number) => number;\n  free: (ptr: number) => void;\n}\n\n` +
    `export interface PdfRuntimeWasmMethods {\n${methods
      .map((method) => `  ${method}: ${method === 'wasmExports' ? 'WasmExports' : `typeof ${method}`};`)
      .join('\n')}\n}\n\n` +
    `export const exportedRuntimeMethods = [\n${methods.map((m) => `  "${m}"`).join(',\n')}\n] as const;\n`,
  'utf8',
);

console.log(`generated ${methods.length} runtime helpers`);
