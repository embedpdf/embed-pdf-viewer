/**
 * Used in the snippet pass. The engine refers to its two worker files as
 * `new URL('../workers/<file>', import.meta.url)` (see the engine's
 * src/worker-files.ts), which an app's bundler emits as files; Vite's library
 * mode would inline them as base64 instead, and a worker can't start from
 * that under `worker-src 'self'`. This plugin points each reference at an
 * explicit `?url&no-inline` asset import, as build/wasm-url-asset.js does for
 * the wasm: Vite emits `embedpdf-worker.js` and `encoder-worker.js` next to
 * `embedpdf.wasm` and hands back a URL relative to whichever chunk holds the
 * reference, so the folder stays relocatable.
 */
import path from 'node:path';
import type { Plugin } from 'vite';

const WORKER_FILES = ['embedpdf-worker', 'encoder-worker'] as const;
const REFERENCE =
  /new URL\((["'])\.\.\/workers\/(embedpdf-worker|encoder-worker)\.js(?:\?no-inline)?\1,\s*import\.meta\.url\)/g;

export function workerFilesAsAssets(): Plugin {
  const found = new Set<string>();
  return {
    name: 'embedpdf:worker-files-as-assets',
    enforce: 'pre',
    apply: 'build',
    transform(code, id) {
      if (!code.includes('../workers/')) return null;
      const imports = new Map<string, string>();
      const rewritten = code.replace(REFERENCE, (_match, _quote, name: string) => {
        found.add(name);
        const file = path.resolve(path.dirname(id.split('?')[0]), '..', 'workers', `${name}.js`);
        const local = `__embedpdf_${name.replace('-', '_')}_url`;
        imports.set(local, `${file}?url&no-inline`);
        return `new URL(${local})`;
      });
      if (imports.size === 0) return null;
      // Appended: import declarations hoist, and nothing before them moves in the source map.
      const footer = [...imports]
        .map(([local, specifier]) => `import ${local} from ${JSON.stringify(specifier)};`)
        .join('\n');
      return { code: `${rewritten}\n${footer}\n`, map: null };
    },
    buildEnd(error) {
      if (error) return;
      for (const name of WORKER_FILES) {
        if (!found.has(name)) {
          this.error(
            `no reference to the engine's workers/${name}.js was found, so the snippet would ` +
              'ship without it. Has src/worker-files.ts in @embedpdf/engine changed?',
          );
        }
      }
    },
  };
}
