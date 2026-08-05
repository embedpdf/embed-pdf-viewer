import { describe, expect, test } from 'vitest';

import { DEFAULT_WASM_URL, resolveInlineWasmSource, resolveWasmSource } from '../src/wasm-source';

describe('resolveWasmSource (explicit sources only)', () => {
  test('nothing configured resolves to nothing — non-inline deliveries self-resolve', () => {
    expect(resolveWasmSource({})).toEqual({});
  });

  test('wasmUrl passes through, with no fallback attached', () => {
    const resolved = resolveWasmSource({ wasmUrl: 'https://example.test/embedpdf.wasm' });
    expect(resolved.wasmUrl).toBe('https://example.test/embedpdf.wasm');
    expect(resolved.fallbackWasmUrl).toBeUndefined();
  });

  test('assetsUrl appends embedpdf.wasm, trailing slash or not', () => {
    expect(resolveWasmSource({ assetsUrl: 'https://example.test/assets' }).wasmUrl).toBe(
      'https://example.test/assets/embedpdf.wasm',
    );
    expect(resolveWasmSource({ assetsUrl: 'https://example.test/assets/' }).wasmUrl).toBe(
      'https://example.test/assets/embedpdf.wasm',
    );
  });

  test('wasmBinary is copied to a standalone ArrayBuffer (transfer-safe)', () => {
    const backing = new Uint8Array([1, 2, 3, 4, 5]);
    const view = backing.subarray(1, 4);
    const resolved = resolveWasmSource({ wasmBinary: view });
    expect(resolved.wasmBinary).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(resolved.wasmBinary!))).toEqual([2, 3, 4]);
    // The caller's buffer is untouched — transferring ours cannot neuter theirs.
    expect(resolved.wasmBinary).not.toBe(backing.buffer);
  });

  test('wasmBinary wins over wasmUrl and assetsUrl', () => {
    const resolved = resolveWasmSource({
      wasmBinary: new Uint8Array([9]),
      wasmUrl: 'https://example.test/embedpdf.wasm',
      assetsUrl: 'https://example.test/assets',
    });
    expect(resolved.wasmBinary).toBeDefined();
    expect(resolved.wasmUrl).toBeUndefined();
  });
});

describe('resolveInlineWasmSource (the inline blob worker default)', () => {
  test('explicit options win and never carry a fallback', async () => {
    const resolved = await resolveInlineWasmSource({
      wasmUrl: 'https://example.test/embedpdf.wasm',
    });
    expect(resolved.wasmUrl).toBe('https://example.test/embedpdf.wasm');
    expect(resolved.fallbackWasmUrl).toBeUndefined();
  });

  test('the default is sibling-first: the bundler-resolved wasm32 URL with the pinned CDN as fallback', async () => {
    const resolved = await resolveInlineWasmSource({});
    // In node the wasm-url module resolves at runtime to a file: URL of the
    // real workspace binary — a bundler would have rewritten it to an emitted
    // asset URL. Either way, the primary is NOT the CDN.
    expect(resolved.wasmUrl).toMatch(/embedpdf\.wasm$/);
    expect(resolved.wasmUrl).not.toBe(DEFAULT_WASM_URL);
    expect(resolved.fallbackWasmUrl).toBe(DEFAULT_WASM_URL);
    expect(resolved.wasmBinary).toBeUndefined();
  });
});
