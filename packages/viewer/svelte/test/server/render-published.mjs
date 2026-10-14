#!/usr/bin/env node
/* global console, process, URL */
/**
 * Imports the built `@embedpdf/viewer-svelte` (both doors) in plain Node, as a server does before
 * it renders a page, and renders <PDFViewer> with `render` from `svelte/server`: importing touches
 * no `window`, `document` or `customElements`, the server renders the empty `<embedpdf-viewer>`
 * with the class and style it was given, and the `/core` door's files never import the local one.
 *
 * In this workspace a package's exports point at its source; a published one's point at its
 * `dist` (`publishConfig.exports`). The resolve hook below gives every `@embedpdf/*` import the
 * published entry, so the run sees what an app installed from npm sees, and the load hook compiles
 * the `.svelte` components and `.svelte.js` modules there for the server, as SvelteKit does. Build
 * the viewer (`@embedpdf/viewer-chrome`, `@embedpdf/viewer`), `@embedpdf/svelte` and
 * `@embedpdf/viewer-svelte` first.
 *
 * Plain Node and not the test runner, whose own resolver would stand in for the published
 * entries: `../server.test.ts` runs it and reads the one JSON report it prints.
 */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const packageRoot = resolvePath(here, '../..');
const compiler = pathToFileURL(
  resolvePath(packageRoot, 'node_modules/svelte/src/compiler/index.js'),
);

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

/** Svelte's own compiler, for the components and rune modules a package ships as source. */
const svelte = () => import(${JSON.stringify(compiler.href)});

export async function load(url, context, next) {
  if (!url.startsWith('file:')) return next(url, context);
  const filename = fileURLToPath(url);
  if (filename.endsWith('.svelte')) {
    const { compile } = await svelte();
    const { js } = compile(readFileSync(filename, 'utf8'), { filename, generate: 'server' });
    return { format: 'module', source: js.code, shortCircuit: true };
  }
  if (filename.endsWith('.svelte.js')) {
    const { compileModule } = await svelte();
    const { js } = compileModule(readFileSync(filename, 'utf8'), { filename, generate: 'server' });
    return { format: 'module', source: js.code, shortCircuit: true };
  }
  return next(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(HOOKS)}`, import.meta.url);

const report = { checks: {}, errors: [] };
const check = (name, ok, detail) => (report.checks[name] = { ok: Boolean(ok), detail });

/** The markup without Svelte's hydration comments: what a browser shows of it. */
const withoutComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

/** The bare imports of `entry` and of every `dist` file it imports, through relative imports. */
function bareImportsOf(entry) {
  const seen = new Set();
  const bare = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    // What a comment shows is no import: the doors' module comments have code samples.
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const [, specifier] of code.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g)) {
      if (specifier.startsWith('.')) visit(resolvePath(dirname(file), specifier));
      else bare.add(specifier);
    }
    for (const [, specifier] of code.matchAll(/import\s*['"]([^'"]+)['"]/g)) {
      if (specifier.startsWith('.')) visit(resolvePath(dirname(file), specifier));
      else bare.add(specifier);
    }
  };
  visit(entry);
  return [...bare].sort();
}

try {
  const touched = [];
  for (const name of ['window', 'document', 'customElements', 'HTMLElement']) {
    if (name in globalThis) touched.push(`${name} exists before the import`);
  }
  const { createRawSnippet } = await import('svelte');
  const { render } = await import('svelte/server');
  const local = await import('@embedpdf/viewer-svelte');
  const core = await import('@embedpdf/viewer-svelte/core');
  for (const name of ['window', 'document', 'customElements', 'HTMLElement']) {
    if (name in globalThis) touched.push(`${name} exists after the import`);
  }
  check('importing both doors on the server touches no browser global', touched.length === 0, {
    touched,
    exports: Object.keys(local).length,
  });

  const mine = createRawSnippet(() => ({ render: () => '<span slot="item:status">mine</span>' }));
  const { body } = render(local.PDFViewer, {
    props: { src: '/report.pdf', style: 'height: 100vh', children: mine },
  });
  check(
    'the server renders the empty element with its style and the wrapper mark, and no children before the viewer',
    withoutComments(body) === '<embedpdf-viewer data-epdf-wrapped="" style="height: 100vh"></embedpdf-viewer>',
    body,
  );
  const { body: coreBody } = render(core.PDFViewer, {
    props: { engine: () => ({}), class: 'viewer' },
  });
  check(
    'the core door renders the empty element too',
    withoutComments(coreBody) === '<embedpdf-viewer data-epdf-wrapped="" class="viewer"></embedpdf-viewer>',
    coreBody,
  );

  const dist = resolvePath(packageRoot, 'dist');
  const localImports = bareImportsOf(resolvePath(dist, 'index.js'));
  const coreImports = bareImportsOf(resolvePath(dist, 'core.js'));
  check(
    "each door imports its own viewer entry, and the core door's files never the local one",
    localImports.includes('@embedpdf/viewer') &&
      coreImports.includes('@embedpdf/viewer/core') &&
      !coreImports.includes('@embedpdf/viewer'),
    { localImports, coreImports },
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
