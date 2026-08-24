import { describe, expect, test, vi } from 'vitest';

import { DEFAULT_WASM_URL, resolveInlineWasmSource } from '../src/wasm-source';

// Simulate a runtime where `@embedpdf/engine-runtime-wasm32/wasm-url` cannot
// be loaded. Under a bundler this is a BUILD-time error (desired); the runtime
// catch exists for native-ESM/no-bundler environments, where the pinned CDN
// URL becomes the primary source — with no further fallback.
vi.mock('@embedpdf/engine-runtime-wasm32/wasm-url', () => {
  throw new Error('module not available in this runtime');
});

describe('resolveInlineWasmSource without the wasm-url module', () => {
  test('falls back to the pinned CDN URL as the primary, with no fallback chained', async () => {
    const resolved = await resolveInlineWasmSource({});
    expect(resolved.wasmUrl).toBe(DEFAULT_WASM_URL);
    expect(resolved.fallbackWasmUrl).toBeUndefined();
  });

  test('explicit options are unaffected', async () => {
    const resolved = await resolveInlineWasmSource({ wasmUrl: '/my/embedpdf.wasm' });
    expect(resolved.wasmUrl).toBe('/my/embedpdf.wasm');
    expect(resolved.fallbackWasmUrl).toBeUndefined();
  });
});
