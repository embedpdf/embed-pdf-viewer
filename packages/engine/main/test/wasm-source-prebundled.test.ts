/**
 * The default wasm where a dev server prebundled the package without `embedpdf.wasm`: the dev
 * copy the build carries (`prebundledDevWasm` in src/worker-files.ts), and never the sibling URL,
 * which points into the dev server's cache folder. Every other build has no such copy and asks
 * for the sibling, as it always did.
 */
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const WASM = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
const build = vi.hoisted(() => ({ devWasm: null as string | null, siblingAsked: 0 }));

vi.mock('../src/worker-files', () => ({ prebundledDevWasm: async () => build.devWasm }));
vi.mock('@embedpdf/engine-runtime-wasm32/wasm-url', () => ({
  get default() {
    build.siblingAsked += 1;
    return 'https://site.test/workers/embedpdf.wasm';
  },
}));

import { resolveDefaultWasmSource } from '../src/wasm-source';

beforeEach(() => {
  build.devWasm = gzipSync(WASM).toString('base64');
  build.siblingAsked = 0;
});

describe('resolveDefaultWasmSource', () => {
  test('gives the bytes of the dev copy in a prebundled package, and asks for no URL', async () => {
    const resolved = await resolveDefaultWasmSource({});
    expect(resolved.wasmUrl).toBeUndefined();
    expect(new Uint8Array(resolved.wasmBinary!)).toEqual(WASM);
    expect(build.siblingAsked).toBe(0);
  });

  test('leaves an explicit source as it is', async () => {
    const resolved = await resolveDefaultWasmSource({ wasmUrl: '/my/embedpdf.wasm' });
    expect(resolved.wasmUrl).toBe('/my/embedpdf.wasm');
    expect(resolved.wasmBinary).toBeUndefined();
  });

  test('gives the file the bundler emitted in a build with no dev copy', async () => {
    // A production build, also one whose files keep their names in `workers/`.
    build.devWasm = null;
    const resolved = await resolveDefaultWasmSource({});
    expect(resolved.wasmUrl).toBe('https://site.test/workers/embedpdf.wasm');
    expect(resolved.wasmBinary).toBeUndefined();
  });
});
