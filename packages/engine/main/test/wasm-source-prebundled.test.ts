/**
 * The default wasm where a dev server prebundled the package without `embedpdf.wasm`: the inline
 * copy the build carries under the `development` export condition (`@embedpdf/engine/dev-wasm`).
 * The sibling URL is never asked for, because it points into the dev server's cache folder.
 */
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const WASM = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
const build = vi.hoisted(() => ({ devWasm: null as string | null }));

vi.mock('../src/worker-files', () => ({ prebundledWithoutFiles: () => true }));
vi.mock('@embedpdf/engine/dev-wasm', () => ({
  get default() {
    return build.devWasm;
  },
}));
vi.mock('@embedpdf/engine-runtime-wasm32/wasm-url', () => {
  throw new Error('the sibling URL must not be asked for');
});

import { resolveDefaultWasmSource } from '../src/wasm-source';

beforeEach(() => {
  build.devWasm = gzipSync(WASM).toString('base64');
});

describe('resolveDefaultWasmSource in a package prebundled without its files', () => {
  test('gives the bytes of the inline copy, and no URL', async () => {
    const resolved = await resolveDefaultWasmSource({});
    expect(resolved.wasmUrl).toBeUndefined();
    expect(new Uint8Array(resolved.wasmBinary!)).toEqual(WASM);
  });

  test('leaves an explicit source as it is', async () => {
    const resolved = await resolveDefaultWasmSource({ wasmUrl: '/my/embedpdf.wasm' });
    expect(resolved.wasmUrl).toBe('/my/embedpdf.wasm');
    expect(resolved.wasmBinary).toBeUndefined();
  });

  test('names the fixes in a build that carries no inline copy', async () => {
    build.devWasm = null;
    await expect(resolveDefaultWasmSource({})).rejects.toThrow(/without its worker files/);
    await expect(resolveDefaultWasmSource({})).rejects.toThrow(/@embedpdf\/engine\/portable/);
  });
});
