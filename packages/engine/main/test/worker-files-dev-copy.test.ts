/**
 * When the engine takes itself for a package that a dev server prebundled without its files.
 * The worker URL alone can't say: a production build that emits its assets under their own names
 * in `workers/`, beside the folder of its chunks, has the same URL as a prebundle. So the build
 * also has to carry the dev copy of the wasm, `@embedpdf/engine/dev-wasm`, which only a resolver
 * that says `development` gets. A production build gets a module that holds nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const build = vi.hoisted(() => ({ devWasm: null as string | null, asked: 0, broken: false }));

vi.mock('@embedpdf/engine/dev-wasm', () => ({
  get default() {
    build.asked += 1;
    if (build.broken) throw new Error('the chunk did not load');
    return build.devWasm;
  },
}));

import { devWasmWhere } from '../src/worker-files';

const asWritten = (module: string) => () => new URL('../workers/embedpdf-worker.js', module);

/** Vite 7's dev server: the engine in its cache folder, the worker URL as written. */
const PREBUNDLED = 'http://localhost:5173/node_modules/.vite/deps/@embedpdf_engine.js?v=5e442550';
/** `vite build` with `entryFileNames: 'assets/app.js'` and `assetFileNames: 'workers/[name][extname]'`. */
const PRODUCTION = 'https://site.test/assets/app.js';
const EMITTED = () => new URL('https://site.test/workers/embedpdf-worker.js');

beforeEach(() => {
  build.devWasm = null;
  build.asked = 0;
  build.broken = false;
});

describe('the dev copy of the wasm', () => {
  it('is what a prebundled package starts from in a dev build', async () => {
    build.devWasm = 'H4sIAAAA';
    expect(await devWasmWhere(asWritten(PREBUNDLED), () => PREBUNDLED)).toBe('H4sIAAAA');
  });

  it('is not there in a production build that emits the worker to workers/ beside its chunks', async () => {
    // The emitted file is where the expression points as written, and the module is in no
    // package folder: the same as a prebundle, but for the copy the build doesn't carry.
    expect(EMITTED().href).toBe(asWritten(PRODUCTION)().href);
    expect(await devWasmWhere(EMITTED, () => PRODUCTION)).toBeNull();
    expect(build.asked).toBe(1);
  });

  it('is not asked for where a bundler rewrote the worker URL', async () => {
    build.devWasm = 'H4sIAAAA';
    const emitted = () => new URL('https://site.test/assets/embedpdf-worker-2c3d.js');
    expect(await devWasmWhere(emitted, () => 'https://site.test/assets/index-0a1b.js')).toBeNull();
    expect(build.asked).toBe(0);
  });

  it('is not asked for where the package is served as it is', async () => {
    build.devWasm = 'H4sIAAAA';
    const module = 'https://cdn.test/npm/@embedpdf/engine@3.2.0/dist/src-0a1b.js';
    expect(await devWasmWhere(asWritten(module), () => module)).toBeNull();
    expect(build.asked).toBe(0);
  });

  it('counts as not there when its module does not load', async () => {
    build.broken = true;
    expect(await devWasmWhere(asWritten(PREBUNDLED), () => PREBUNDLED)).toBeNull();
  });
});
