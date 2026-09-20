import { describe, expect, test, vi } from 'vitest';

import { resolveInlineWasmSource } from '../src/wasm-source';

// A build with no usable sibling module: it throws on evaluation (an output
// format where `import.meta.url` is undefined makes its `new URL()` throw) or
// cannot be loaded at all. There is nothing after the sibling — no CDN — so
// the default resolution fails with the two fixes named.
vi.mock('@embedpdf/engine-runtime-wasm32/wasm-url', () => {
  throw new Error('module not available in this runtime');
});

describe('resolveInlineWasmSource without a usable wasm-url module', () => {
  test('fails with guidance instead of reaching for a CDN', async () => {
    await expect(resolveInlineWasmSource({})).rejects.toThrow(/@embedpdf\/engine\/portable/);
    await expect(resolveInlineWasmSource({})).rejects.toThrow(/assetsUrl/);
  });

  test('explicit options are unaffected', async () => {
    const resolved = await resolveInlineWasmSource({ wasmUrl: '/my/embedpdf.wasm' });
    expect(resolved.wasmUrl).toBe('/my/embedpdf.wasm');
  });

  test('a wasmLoader is an explicit source too: its bytes, nothing fetched', async () => {
    const resolved = await resolveInlineWasmSource({
      wasmLoader: async () => new Uint8Array([0, 0x61, 0x73, 0x6d]),
    });
    expect(resolved.wasmUrl).toBeUndefined();
    expect(new Uint8Array(resolved.wasmBinary!)).toEqual(new Uint8Array([0, 0x61, 0x73, 0x6d]));
  });
});
