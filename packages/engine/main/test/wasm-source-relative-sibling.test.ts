import { afterEach, describe, expect, test, vi } from 'vitest';

import { DEFAULT_WASM_URL, resolveInlineWasmSource } from '../src/wasm-source';

// Not every bundler emits an absolute URL for the wasm asset: webpack's
// RelativeURL runtime (used by Next.js) yields a ROOT-RELATIVE href like
// `/_next/static/media/embedpdf.<hash>.wasm`. A blob: worker cannot resolve
// that (blob URLs are not a valid base), so the default resolution must
// absolutize against the page BEFORE the URL crosses the postMessage boundary.
vi.mock('@embedpdf/engine-runtime-wasm32/wasm-url', () => ({
  default: '/_next/static/media/embedpdf.abc123.wasm',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveInlineWasmSource with a bundler-relative sibling URL', () => {
  test('absolutizes against the page location, keeping the CDN fallback', async () => {
    vi.stubGlobal('location', { href: 'https://app.test/some/page' });
    const resolved = await resolveInlineWasmSource({});
    expect(resolved.wasmUrl).toBe('https://app.test/_next/static/media/embedpdf.abc123.wasm');
    expect(resolved.fallbackWasmUrl).toBe(DEFAULT_WASM_URL);
  });
});
