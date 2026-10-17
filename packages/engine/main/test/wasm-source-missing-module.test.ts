import { describe, expect, test, vi } from 'vitest';

import { resolveDefaultWasmSource } from '../src/wasm-source';

// A build with no usable sibling module: it throws on evaluation (an output
// format where `import.meta.url` is undefined makes its `new URL()` throw) or
// cannot be loaded at all. There is nothing after the sibling — no CDN — so
// the default resolution fails with the two fixes named.
vi.mock('@embedpdf/engine-runtime-wasm32/wasm-url', () => {
  throw new Error('module not available in this runtime');
});

describe('resolveDefaultWasmSource without a usable wasm-url module', () => {
  test('fails with guidance instead of reaching for a CDN', async () => {
    await expect(resolveDefaultWasmSource({})).rejects.toThrow(/@embedpdf\/engine\/portable/);
    await expect(resolveDefaultWasmSource({})).rejects.toThrow(/assetsUrl/);
  });

  test('explicit options are unaffected', async () => {
    const resolved = await resolveDefaultWasmSource({ wasmUrl: '/my/embedpdf.wasm' });
    expect(resolved.wasmUrl).toBe('/my/embedpdf.wasm');
  });

  test('a wasmLoader is an explicit source too: its bytes, nothing fetched', async () => {
    const resolved = await resolveDefaultWasmSource({
      wasmLoader: async () => new Uint8Array([0, 0x61, 0x73, 0x6d]),
    });
    expect(resolved.wasmUrl).toBeUndefined();
    expect(new Uint8Array(resolved.wasmBinary!)).toEqual(new Uint8Array([0, 0x61, 0x73, 0x6d]));
  });
});
