/**
 * `@embedpdf/engine/portable`: the wasm through the module graph. The inline
 * module is gzip + base64 of the shipped binary; the entry inflates it and
 * hands the bytes to the boot as an explicit source. In node the same
 * `DecompressionStream` and `atob` exist, so the whole path runs for real.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

import { loadInlineWasm } from '../src/portable';
import { resolveInlineWasmSource } from '../src/wasm-source';

const require = createRequire(import.meta.url);
const shippedWasm = () =>
  readFileSync(require.resolve('@embedpdf/engine-runtime-wasm32/embedpdf.wasm'));

describe('@embedpdf/engine/portable', () => {
  test('the inline module inflates to exactly the shipped binary', async () => {
    const bytes = new Uint8Array(await loadInlineWasm());
    const shipped = shippedWasm();
    expect(bytes.byteLength).toBe(shipped.byteLength);
    expect(Buffer.compare(Buffer.from(bytes), shipped)).toBe(0);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0, 0x61, 0x73, 0x6d]);
  });

  test('as a wasmLoader it is an explicit source: bytes for the worker, no URL, no sibling lookup', async () => {
    const resolved = await resolveInlineWasmSource({ wasmLoader: loadInlineWasm });
    expect(resolved.wasmUrl).toBeUndefined();
    expect(resolved.wasmBinary!.byteLength).toBe(shippedWasm().byteLength);
  });
});
