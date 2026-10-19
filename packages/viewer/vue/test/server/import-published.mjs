#!/usr/bin/env node
/* global console, process, URL */
/**
 * Imports the built `@embedpdf/viewer-vue` (both doors) in plain Node, as a server does before it
 * renders a page (Nuxt), and renders <PDFViewer> to a string with `vue/server-renderer`:
 * importing touches no `window`, `document` or `customElements`, the server renders the empty
 * `<embedpdf-viewer>` with the size it was given, without the components in its slot, and only
 * the main entry's build imports the local engine's door.
 *
 * In this workspace a package's exports point at its source; a published one's point at its
 * `dist` (`publishConfig.exports`). The resolve hook below gives every `@embedpdf/*` import the
 * published entry, so the run sees what an app installed from npm sees. Build the viewer
 * (`@embedpdf/viewer-chrome`, `@embedpdf/viewer`), `@embedpdf/vue` and `@embedpdf/viewer-vue`
 * first.
 *
 * Plain Node and not the test runner, whose own resolver would stand in for the published
 * entries: `../server.test.ts` runs it and reads the one JSON report it prints.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

const HOOKS = `
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolveFile } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The package a file belongs to: its directory and manifest. */
function packageOf(file) {
  for (let directory = dirname(file); directory !== dirname(directory); directory = dirname(directory)) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) return { directory, manifest: JSON.parse(readFileSync(manifest, 'utf8')) };
  }
  return null;
}

const targetOf = (entry) =>
  typeof entry === 'string' ? entry : entry && (entry.development ?? entry.import ?? entry.default);

export async function resolve(specifier, context, next) {
  const resolved = await next(specifier, context);
  if (!specifier.startsWith('@embedpdf/') || !resolved.url.startsWith('file:')) return resolved;
  const file = fileURLToPath(resolved.url);
  const owner = packageOf(file);
  const published = owner?.manifest.publishConfig?.exports;
  if (!published) return resolved;
  for (const [subpath, entry] of Object.entries(owner.manifest.exports ?? {})) {
    const target = targetOf(entry);
    if (!target || resolveFile(owner.directory, target) !== file) continue;
    const dist = targetOf(published[subpath]) ?? published[subpath]?.import;
    if (!dist) return resolved;
    return { ...resolved, url: pathToFileURL(resolveFile(owner.directory, dist)).href, format: 'module' };
  }
  return resolved;
}
`;
register(`data:text/javascript,${encodeURIComponent(HOOKS)}`, import.meta.url);

const report = { checks: {}, errors: [] };
const check = (name, ok, detail) => (report.checks[name] = { ok: Boolean(ok), detail });

try {
  const touched = [];
  for (const name of ['window', 'document', 'customElements', 'HTMLElement']) {
    if (name in globalThis) touched.push(`${name} exists before the import`);
  }
  const { h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  const local = await import('@embedpdf/viewer-vue');
  const core = await import('@embedpdf/viewer-vue/core');
  for (const name of ['window', 'document', 'customElements', 'HTMLElement']) {
    if (name in globalThis) touched.push(`${name} exists after the import`);
  }
  check('importing both doors on the server touches no browser global', touched.length === 0, {
    touched,
    exports: Object.keys(local).length,
  });

  const html = await renderToString(
    h(
      local.PDFViewer,
      { src: '/report.pdf', style: { height: '100vh' } },
      {
        default: () =>
          h(local.ToolbarItem, { id: 'status' }, { default: () => h('span', null, 'mine') }),
      },
    ),
  );
  check(
    'the server renders the empty element with its size and the wrapper mark, and no children before the viewer',
    html === '<embedpdf-viewer data-epdf-wrapped style="height:100vh;"></embedpdf-viewer>',
    html,
  );
  const coreHtml = await renderToString(h(core.PDFViewer, { engine: () => ({}), class: 'viewer' }));
  check(
    'the core door renders the empty element too',
    coreHtml === '<embedpdf-viewer data-epdf-wrapped class="viewer"></embedpdf-viewer>',
    coreHtml,
  );

  // The local door is the bare `@embedpdf/viewer`; `@embedpdf/viewer/core` carries no engine.
  const localDoor = /["']@embedpdf\/viewer["']/;
  const reaching = readdirSync(dist)
    .filter((file) => /\.c?js$/.test(file))
    .filter((file) => localDoor.test(readFileSync(join(dist, file), 'utf8')));
  check(
    'only the main entry imports the local engine door, so the core entry leaves PDFium out',
    reaching.sort().join(' ') === 'index.cjs index.js',
    reaching,
  );
} catch (error) {
  report.errors.push(
    `script: ${String(error?.stack ?? error)
      .split('\n')
      .slice(0, 4)
      .join(' | ')}`,
  );
  report.failed = true;
}
report.ok =
  !report.failed &&
  report.errors.length === 0 &&
  Object.values(report.checks).every((entry) => entry.ok);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
