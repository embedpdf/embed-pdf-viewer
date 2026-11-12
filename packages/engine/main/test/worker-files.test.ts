/**
 * The bundled worker files are named only where a worker can start from them: on a page of the
 * same origin as the scripts. A test runner has no page, and its scripts are file: URLs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  findEncoderWorkerFile,
  findEngineWorkerFile,
  movedWithoutFiles,
  prebundledDevWasm,
  startableFile,
} from '../src/worker-files';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the bundled worker files', () => {
  it('are not named where there is no page', () => {
    expect(typeof location).toBe('undefined');
    expect(findEngineWorkerFile()).toBeNull();
    expect(findEncoderWorkerFile()).toBeNull();
  });

  it('are not named on a page of another origin than the scripts', () => {
    vi.stubGlobal('location', { origin: 'https://site.test', href: 'https://site.test/' });
    expect(findEngineWorkerFile()).toBeNull();
    expect(findEncoderWorkerFile()).toBeNull();
  });

  it('are not named on a page with an opaque origin', () => {
    vi.stubGlobal('location', { origin: 'null', href: 'data:text/html,' });
    expect(findEngineWorkerFile()).toBeNull();
  });

  it('are named on the page origin when the bundler gave a URL relative to the page', () => {
    // Next.js's rewrite: a URL object whose text is a path and whose origin is ''.
    const relative = { origin: '', toString: () => '/_next/static/media/embedpdf-worker.0a1b.js' };
    vi.stubGlobal('location', { origin: 'https://site.test', href: 'https://site.test/docs/' });
    expect(startableFile(() => relative as unknown as URL)).toBe(
      'https://site.test/_next/static/media/embedpdf-worker.0a1b.js',
    );
  });

  it('are named when the bundler gave an absolute URL on the page origin', () => {
    vi.stubGlobal('location', { origin: 'https://site.test', href: 'https://site.test/' });
    const file = new URL('https://site.test/assets/embedpdf-worker.js');
    expect(startableFile(() => file)).toBe('https://site.test/assets/embedpdf-worker.js');
  });
});

/**
 * A dev server that prebundles packages moves the engine into a cache folder and copies none of
 * its files. Each case is a module URL and the worker URL its build gives: `asWritten` is the
 * expression nobody rewrote, resolved by the browser against the module.
 */
describe('a package prebundled without its files', () => {
  const asWritten = (module: string) => () => new URL('../workers/embedpdf-worker.js', module);

  it("is Vite 7's cache folder, where the worker URL is still as written", () => {
    const module = 'http://localhost:5173/node_modules/.vite/deps/@embedpdf_engine.js?v=5e442550';
    expect(movedWithoutFiles(asWritten(module), () => module)).toBe(true);
  });

  it("is Angular 20's, a cache folder outside node_modules", () => {
    const module =
      'http://localhost:4200/@fs/app/.angular/cache/20.2.2/app/vite/deps/@embedpdf_engine.js?v=7cb0914f';
    expect(movedWithoutFiles(asWritten(module), () => module)).toBe(true);
  });

  it('is not Vite 8, which rewrites the URL to the file in node_modules', () => {
    const module = 'http://localhost:5173/node_modules/.vite/deps/@embedpdf_engine.js?v=00e733a2';
    const rewritten = () => new URL('../../@embedpdf/engine/workers/embedpdf-worker.js', module);
    expect(movedWithoutFiles(rewritten, () => module)).toBe(false);
  });

  it('is not a build whose bundler emitted the file', () => {
    const module = 'https://site.test/assets/index-0a1b.js';
    const emitted = () => new URL('https://site.test/assets/embedpdf-worker-2c3d.js');
    expect(movedWithoutFiles(emitted, () => module)).toBe(false);
  });

  it('is not webpack, which names the module by its file and the worker by a path', () => {
    const module = 'file:///app/node_modules/@embedpdf/engine/dist/src-0a1b.js';
    const relative = { toString: () => '/_next/static/media/embedpdf-worker.0a1b.js' };
    expect(
      movedWithoutFiles(
        () => relative as unknown as URL,
        () => module,
      ),
    ).toBe(false);
  });

  it('is not the package served as it is, from dist or from src', () => {
    for (const module of [
      'https://cdn.test/npm/@embedpdf/engine@3.2.0/dist/src-0a1b.js',
      'http://localhost:5173/@fs/repo/packages/engine/main/src/worker-files.ts',
    ]) {
      expect(movedWithoutFiles(asWritten(module), () => module)).toBe(false);
    }
  });

  it('is not a build with no module URL to tell by', () => {
    const none = () => undefined as unknown as string;
    expect(movedWithoutFiles(() => new URL('../workers/embedpdf-worker.js', none()), none)).toBe(
      false,
    );
  });

  it('looks the same in a production build that emits the worker to workers/ beside its chunks', () => {
    // `assetFileNames: 'workers/[name][extname]'` with the chunks in `assets/`: the emitted
    // file is where the expression points as written. The URL can't tell them apart, which is
    // why a build also has to carry the dev copy (see worker-files-dev-copy.test.ts).
    const module = 'https://site.test/assets/app.js';
    const emitted = () => new URL('https://site.test/workers/embedpdf-worker.js');
    expect(movedWithoutFiles(emitted, () => module)).toBe(true);
  });

  it('is not this test run, which loads the module from src', async () => {
    expect(await prebundledDevWasm()).toBeNull();
  });
});
