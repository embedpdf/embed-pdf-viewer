import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build, createServer, type ViteDevServer } from 'vite';

const outputDirectories: string[] = [];
const devServers: ViteDevServer[] = [];

afterEach(async () => {
  await Promise.all(devServers.splice(0).map((server) => server.close()));
  await Promise.all(
    outputDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    }),
  );
  return files.flat();
}

describe('browser bundle', () => {
  it('selects the browser single-file variant in Vite dev', async () => {
    const root = fileURLToPath(new URL('./fixtures/browser', import.meta.url));
    const importer = fileURLToPath(new URL('../src/QuickJsSandbox.ts', import.meta.url));
    const server = await createServer({
      appType: 'custom',
      configFile: false,
      root,
      logLevel: 'silent',
      server: { hmr: false, middlewareMode: true },
    });
    devServers.push(server);

    const resolved = await server.pluginContainer.resolveId('#quickjs-variant', importer);

    // Vite's dep optimizer may rewrite the id to .vite/deps/@jitl_quickjs-....js?v=...,
    // replacing the scope separator, so match the package name without it.
    expect(resolved?.id).toContain('quickjs-singlefile-browser-release-sync');
    expect(resolved?.id).not.toContain('quickjs-wasmfile-release-sync');
  });

  it('bundles browser QuickJS without an external WebAssembly request', async () => {
    const output = await mkdtemp(join(tmpdir(), 'embedpdf-js-sandbox-'));
    outputDirectories.push(output);

    await build({
      configFile: false,
      root: fileURLToPath(new URL('./fixtures/browser', import.meta.url)),
      logLevel: 'silent',
      build: { outDir: output, emptyOutDir: true },
    });

    const files = await filesBelow(output);
    expect(files.some((file) => file.endsWith('.js'))).toBe(true);
    expect(files.some((file) => file.endsWith('.wasm'))).toBe(false);
  });
});
