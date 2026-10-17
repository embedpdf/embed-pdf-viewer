/**
 * An engine with no worker boots in Node whichever build of `#inline-transport` the resolver
 * picks. Node and its test runners ask for `node` (a Svelte app's tests also ask for `browser`);
 * a DOM environment may ask for `browser` alone, which lands on the self-contained browser
 * build, whose runtime won't start in Node, so it hands over to the Node build.
 *
 * Each runs in a Node process of its own, as published (`pnpm build` first), so the resolver is
 * Node's own.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = (path: string) => pathToFileURL(resolve(root, path)).href;

const TINY_PDF =
  '%PDF-1.7\\n1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n2 0 obj\\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\nendobj\\n3 0 obj\\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>\\nendobj\\ntrailer\\n<< /Root 1 0 R >>\\n%%EOF\\n';

/** Runs `code` as a module in a new Node process with `conditions`; returns what it printed. */
function runNode(code: string, conditions: readonly string[] = []): string {
  return execFileSync(
    process.execPath,
    [...conditions.map((name) => `--conditions=${name}`), '--input-type=module', '-e', code],
    { cwd: root, encoding: 'utf8', timeout: 60_000 },
  ).trim();
}

describe('an engine with no worker, in Node', () => {
  it('opens a document when the resolver also asks for `browser`', () => {
    const printed = runNode(
      `
      const { createLocalEngine } = await import(${JSON.stringify(url('dist/index.js'))});
      const engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
      const bytes = new TextEncoder().encode(${JSON.stringify(TINY_PDF)}.replaceAll('\\\\n', '\\n'));
      const doc = await engine.open({ kind: 'bytes', id: 'node', bytes }, { scope: ['*'] });
      console.log((await doc.pages.list()).pageCount);
      await doc.close();
      await engine.destroy();
      `,
      ['browser'],
    );
    expect(printed.split('\n').at(-1)).toBe('1');
  });

  it('boots from the browser build too, which hands over to the Node build', () => {
    const printed = runNode(`
      const { createInlineTransport } = await import(${JSON.stringify(url('workers/inline-transport.js'))});
      const transport = await createInlineTransport({ prefer: 'wasm' });
      console.log(typeof transport.send);
      await transport.terminate();
    `);
    expect(printed.split('\n').at(-1)).toBe('function');
  });
});
