/**
 * What the package's entry loads before anything runs. Where the engine runs in a worker, the
 * page's main thread holds only what talks to the worker: the engine's client and engine-core's
 * `runtime` and `public` entries. Those, and engine-core's root entry, reach no zod as
 * published, so an app's bundler never sees it on the page.
 *
 * The engine host (`@embedpdf/engine-services`, with the schemas and zod behind it) and PDFium's
 * runtime load only when an engine boots in this thread (`#inline-transport`). In a browser
 * they are one self-contained module (`workers/inline-transport.js`) that imports no package,
 * so a bundler never resolves zod's own entry either; in Node they are imported as packages.
 *
 * The entry is bundled the way an app's bundler splits it, from source and as published, with
 * every package left external, so each import of a package shows up in the chunk that makes it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Metafile } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type Output = Metafile['outputs'][string];

interface Graph {
  readonly outputs: Record<string, Output>;
  readonly entry: string;
}

async function graphOf(entryPoint: string, platform: 'browser' | 'node'): Promise<Graph> {
  const result = await build({
    entryPoints: [resolve(root, entryPoint)],
    bundle: true,
    splitting: true,
    format: 'esm',
    platform,
    outdir: resolve(root, 'entry-graph'),
    write: false,
    metafile: true,
    external: ['@embedpdf/*'],
    logLevel: 'silent',
  });
  const { outputs } = result.metafile;
  const entry = Object.keys(outputs).find((path) => outputs[path]!.entryPoint !== undefined)!;
  return { outputs, entry };
}

/** The packages a chunk and the chunks it imports statically import, transitively. */
function staticPackages({ outputs }: Graph, chunk: string): Set<string> {
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
function lazyChunks({ outputs }: Graph): string[] {
  return Object.values(outputs).flatMap((output) =>
    output.imports
      .filter((imported) => imported.kind === 'dynamic-import' && !imported.external)
      .map((imported) => imported.path),
  );
}

/** The lazy chunks built from a module whose path ends with `module`. */
function lazyChunksHolding(graph: Graph, module: string): string[] {
  return lazyChunks(graph).filter((chunk) =>
    Object.keys(graph.outputs[chunk]!.inputs).some((input) => input.endsWith(module)),
  );
}

let source: Graph;
let published: Graph;

beforeAll(async () => {
  source = await graphOf('src/index.ts', 'browser');
  published = await graphOf('dist/index.js', 'browser');
});

describe("the engine entry's static graph", () => {
  it('imports engine-core through its runtime and public entries, and no other package', () => {
    for (const graph of [source, published]) {
      expect([...staticPackages(graph, graph.entry)].sort()).toEqual([
        '@embedpdf/engine-core/public',
        '@embedpdf/engine-core/runtime',
      ]);
    }
  });

  it('leaves the engine host and the runtime to one chunk that imports no package', () => {
    for (const graph of [source, published]) {
      const inline = lazyChunksHolding(graph, 'workers/inline-transport.js');
      expect(inline).toHaveLength(1);
      expect([...staticPackages(graph, inline[0]!)]).toEqual([]);
    }
  });

  it('carries one zod, inside that chunk, where a page never loads it unless it has no worker', () => {
    const fallback = readFileSync(resolve(root, 'workers/inline-transport.js'), 'utf8');
    expect(fallback.match(/name\s*=\s*"ZodError"/g)).toHaveLength(1);
  });

  it('in Node, imports the engine host and the runtime as packages when such an engine boots', async () => {
    const node = await graphOf('dist/index.js', 'node');
    const inline = lazyChunksHolding(node, 'workers/inline-transport.node.js');
    expect(inline).toHaveLength(1);
    expect([...staticPackages(node, inline[0]!)].sort()).toEqual([
      '@embedpdf/engine-runtime',
      '@embedpdf/engine-services',
    ]);
  });
});

/**
 * The modules of a published entry's static graph that import zod, as an app's bundler resolves
 * the entry (`import`, or `require` for the CommonJS build). Only engine-core is followed; every
 * other package stays external.
 */
async function zodImportersOf(specifier: string, format: 'esm' | 'cjs'): Promise<string[]> {
  const result = await build({
    stdin: {
      contents: format === 'esm' ? `import '${specifier}';` : `require('${specifier}');`,
      resolveDir: root,
    },
    bundle: true,
    format,
    platform: format === 'esm' ? 'browser' : 'node',
    write: false,
    metafile: true,
    external: ['zod'],
    logLevel: 'silent',
  });
  return Object.entries(result.metafile.inputs)
    .filter(([, input]) =>
      input.imports.some(
        (imported) => imported.path === 'zod' && imported.kind !== 'dynamic-import',
      ),
    )
    .map(([path]) => path);
}

describe("engine-core's page entries, as published", () => {
  const entries = [
    '@embedpdf/engine-core',
    '@embedpdf/engine-core/runtime',
    '@embedpdf/engine-core/public',
  ];

  it.each(entries)('%s reaches no zod', async (specifier) => {
    expect(await zodImportersOf(specifier, 'esm')).toEqual([]);
    expect(await zodImportersOf(specifier, 'cjs')).toEqual([]);
  });

  it('leave zod to the validation entry the engine host imports', async () => {
    expect(await zodImportersOf('@embedpdf/engine-core/validation', 'esm')).not.toEqual([]);
  });
});
