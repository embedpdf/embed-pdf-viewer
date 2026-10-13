/**
 * What the package's entry loads before anything runs. Where the engine runs in a worker, the
 * page's main thread holds only what talks to the worker: the engine host
 * (`@embedpdf/engine-services`) and PDFium's runtime (`@embedpdf/engine-runtime`) are imported
 * only by the module an engine running in this thread loads when it boots; the rest is the
 * engine's client and engine-core's `runtime` and `public` entries.
 *
 * The entry is bundled the way an app's bundler splits it, with every package left external, so
 * each import of a package shows up in the chunk that makes it.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Metafile } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Output = Metafile['outputs'][string];

let outputs: Record<string, Output>;
let entry: string;

beforeAll(async () => {
  const result = await build({
    entryPoints: [resolve(root, 'src/index.ts')],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    outdir: resolve(root, 'entry-graph'),
    write: false,
    metafile: true,
    external: ['@embedpdf/*'],
    logLevel: 'silent',
  });
  outputs = result.metafile.outputs;
  entry = Object.keys(outputs).find((path) => outputs[path]!.entryPoint !== undefined)!;
});

/** The packages a chunk and the chunks it imports statically import, transitively. */
function staticPackages(chunk: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const visit = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const imported of outputs[path]!.imports) {
      if (imported.kind !== 'import-statement') continue;
      if (imported.external) packages.add(imported.path);
      else visit(imported.path);
    }
  };
  visit(chunk);
  return packages;
}

/** The chunks the entry's graph loads with `import()`. */
function lazyChunks(): string[] {
  return Object.values(outputs).flatMap((output) =>
    output.imports
      .filter((imported) => imported.kind === 'dynamic-import' && !imported.external)
      .map((imported) => imported.path),
  );
}

describe("the engine entry's static graph", () => {
  it('imports engine-core through its runtime and public entries, and no other package', () => {
    expect([...staticPackages(entry)].sort()).toEqual([
      '@embedpdf/engine-core/public',
      '@embedpdf/engine-core/runtime',
    ]);
  });

  it('leaves the engine host and the runtime to the chunk an engine in this thread loads', () => {
    const inline = lazyChunks().filter((chunk) => {
      const packages = staticPackages(chunk);
      return packages.has('@embedpdf/engine-services') && packages.has('@embedpdf/engine-runtime');
    });
    expect(inline).toHaveLength(1);
  });
});
