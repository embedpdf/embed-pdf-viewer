#!/usr/bin/env node
/* global console, process */
/**
 * Imports the built `@embedpdf/viewer-angular` (both doors) in plain Node, as a server does
 * before it renders a page, and renders `<epdf-pdf-viewer>` with Angular's server rendering
 * (`renderApplication` from `@angular/platform-server`): importing touches no `window`,
 * `document` or `customElements`, and the server renders the empty `<embedpdf-viewer>` inside
 * `<epdf-pdf-viewer>`, with the size it was given, and none of the templates the viewer shows
 * once it runs. The packages' partial declarations compile just in time (`@angular/compiler`).
 *
 * In this workspace a package's exports may point at its source; a published one's point at its
 * `dist` (`publishConfig.exports`). The resolve hook below gives every `@embedpdf/*` import the
 * published entry, so the run sees what an app installed from npm sees. Build the viewer
 * (`@embedpdf/viewer-chrome`, `@embedpdf/viewer`), `@embedpdf/angular` and this package first.
 *
 * Plain Node and not the test runner, whose own resolver would stand in for the published
 * entries: `../server.test.ts` runs it and reads the one JSON report it prints.
 */
import { register } from 'node:module';

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
// Standard output is the report's: what Angular logs while it renders (that it runs in
// development mode) goes to standard error.
const log = console.log;
console.log = console.error;

/** The `<epdf-pdf-viewer>` in a rendered page, without Angular's comment anchors. */
const viewerIn = (html) =>
  /<epdf-pdf-viewer[\s\S]*<\/epdf-pdf-viewer>/.exec(html)?.[0].replace(/<!--[\s\S]*?-->/g, '') ??
  html;

try {
  const touched = [];
  for (const name of ['window', 'document', 'customElements', 'HTMLElement']) {
    if (name in globalThis) touched.push(`${name} exists before the import`);
  }
  await import('@angular/compiler');
  const { Component, provideZonelessChangeDetection } = await import('@angular/core');
  const { bootstrapApplication } = await import('@angular/platform-browser');
  const local = await import('@embedpdf/viewer-angular');
  const core = await import('@embedpdf/viewer-angular/core');
  for (const name of ['window', 'document', 'customElements', 'HTMLElement']) {
    if (name in globalThis) touched.push(`${name} exists after the import`);
  }
  check('importing both doors on the server touches no browser global', touched.length === 0, {
    touched,
    exports: Object.keys(local).length,
  });

  const { provideServerRendering, renderApplication } = await import('@angular/platform-server');
  /** The page an app with `template` renders on the server, with `imports`. */
  const render = (imports, template, fields = {}) => {
    const App = Component({ selector: 'app-root', imports, template })(
      class {
        constructor() {
          Object.assign(this, fields);
        }
      },
    );
    return renderApplication(
      () =>
        bootstrapApplication(App, {
          providers: [provideServerRendering(), provideZonelessChangeDetection()],
        }),
      { document: '<html><head></head><body><app-root></app-root></body></html>' },
    );
  };

  const html = viewerIn(
    await render(
      [local.EpdfPdfViewer, local.EpdfToolbarItem],
      `<epdf-pdf-viewer src="/report.pdf" style="height: 100vh">
        <ng-template epdfToolbarItem="status"><span>mine</span></ng-template>
      </epdf-pdf-viewer>`,
    ),
  );
  check(
    'the server renders the empty element with its size, and no templates before the viewer',
    /^<epdf-pdf-viewer [^>]*style="display: block; height: 100vh;"[^>]*><embedpdf-viewer data-epdf-wrapped=""><\/embedpdf-viewer><\/epdf-pdf-viewer>$/.test(
      html,
    ),
    html,
  );
  const coreHtml = viewerIn(
    await render([core.EpdfPdfViewer], '<epdf-pdf-viewer [engine]="engine" class="viewer" />', {
      engine: () => ({}),
    }),
  );
  check(
    'the core door renders the empty element too',
    /^<epdf-pdf-viewer [^>]*class="viewer"[^>]*><embedpdf-viewer data-epdf-wrapped=""><\/embedpdf-viewer><\/epdf-pdf-viewer>$/.test(
      coreHtml,
    ),
    coreHtml,
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
log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
