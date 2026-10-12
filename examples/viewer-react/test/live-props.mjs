#!/usr/bin/env node
/* global window, document, File, console, process, URL, fetch */
/**
 * Drives `live-props.html` from a development build of `vite.spike.config.ts`
 * (`SPIKE_ENTRY=live-props NODE_ENV=development vite build --mode development
 * --config vite.spike.config.ts`) in the system Chrome: each live prop of
 * <PDFViewer> changes the running viewer in place, the viewer and its kernel
 * stay the same objects, and a changed prop of any other key is ignored with
 * one warning that names it.
 *
 *   node test/live-props.mjs [<built dir under dist-spike>]
 *
 * Prints one JSON report; exits 1 when a check fails.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../../..');
const root = resolve(here, '..', 'dist-spike', process.argv[2] ?? 'dist.live-props');
// playwright-core is a devDependency of @embedpdf/viewer, not of this example.
const { chromium } = createRequire(join(repo, 'packages/viewer/main/package.json'))(
  'playwright-core',
);

const TYPES = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
};
const assets = new Map();
const walk = (directory, prefix) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) walk(file, `${prefix}/${entry.name}`);
    else if (entry.isFile())
      assets.set(`${prefix}/${entry.name}`, {
        body: readFileSync(file),
        type: TYPES[extname(file)] ?? 'application/octet-stream',
      });
  }
};
walk(root, '');
const server = createServer((request, response) => {
  const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  if (pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  const asset = assets.get(pathname);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': asset.type }).end(asset.body);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const report = { checks: {}, errors: [], warnings: [] };
const check = (name, ok, detail) => (report.checks[name] = { ok: Boolean(ok), detail });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400)
      report.errors.push(`http ${response.status()}: ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
    if (message.type() === 'warning' && message.text().includes('<PDFViewer>')) {
      report.warnings.push(message.text());
    }
  });
  await page.goto(`${origin}/live-props.html`);

  await page.waitForFunction(() => window.live?.viewers.length === 1, null, { timeout: 30_000 });
  await page.waitForFunction(
    () => window.live.viewers[0].documents.list()[0]?.status === 'ready',
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    window.firstKernel = window.live.viewers[0][Symbol.for('@embedpdf/viewer/kernel')];
  });
  const same = () =>
    page.evaluate(() => {
      const element = document.querySelector('embedpdf-viewer');
      return (
        window.live.viewers.length === 1 &&
        element.viewer === window.live.viewers[0] &&
        element.viewer[Symbol.for('@embedpdf/viewer/kernel')] === window.firstKernel
      );
    });

  await page.evaluate(() => window.live.set({ theme: 'dark' }));
  const dark = await page
    .waitForFunction(
      () =>
        document
          .querySelector('embedpdf-viewer')
          .shadowRoot.querySelector('[data-embedpdf-root]')
          .classList.contains('dark'),
      null,
      { timeout: 10_000 },
    )
    .then(() => true)
    .catch(() => false);
  check('theme follows its prop', dark && (await same()));

  await page.evaluate(() => window.live.set({ locale: 'es' }));
  const spanish = await page
    .waitForFunction(
      () =>
        /Página 1 de \d+/.test(
          document.querySelector('embedpdf-viewer').shadowRoot.textContent ?? '',
        ),
      null,
      { timeout: 15_000 },
    )
    .then(() => true)
    .catch(() => false);
  check('locale follows its prop', spanish && (await same()));

  await page.evaluate(() => window.live.set({ disable: ['search', 'tool:highlight'] }));
  await page.waitForTimeout(100);
  const disabled = await page.evaluate(() => {
    const { disabledCategories, disabledCommands } = window.live.viewers[0].commands.getSettings();
    return { disabledCategories, disabledCommands };
  });
  check(
    'disable follows its prop',
    JSON.stringify(disabled) ===
      JSON.stringify({ disabledCategories: ['search'], disabledCommands: ['tool:highlight'] }) &&
      (await same()),
    disabled,
  );

  await page.evaluate(() => window.live.set({ disable: [], readOnly: true }));
  await page.waitForTimeout(100);
  const readOnly = await page.evaluate(
    () => window.live.viewers[0].commands.getSettings().disabledCategories,
  );
  check(
    'readOnly follows its prop',
    readOnly.includes('annotations') && readOnly.includes('forms') && (await same()),
    readOnly,
  );

  const bytes = await page.evaluate(async () =>
    Array.from(new Uint8Array(await (await fetch('/testlab.pdf')).arrayBuffer())),
  );
  await page.evaluate(
    (data) => window.live.set({ src: new File([new Uint8Array(data)], 'picked.pdf') }),
    bytes,
  );
  const picked = await page
    .waitForFunction(
      () => {
        const list = window.live.viewers[0].documents.list();
        return list.length === 1 && list[0].name === 'picked' && list[0].status === 'ready';
      },
      null,
      { timeout: 30_000 },
    )
    .then(() => true)
    .catch(() => false);
  check('src follows its prop, a File in place of the URL', picked && (await same()));

  await page.evaluate(() => window.live.rerender());
  await page.evaluate(() => window.live.rerender());
  await page.waitForTimeout(100);
  check(
    'a changed read-once prop is ignored with one warning naming it',
    report.warnings.length === 1 && report.warnings[0].includes('`commands`') && (await same()),
    report.warnings,
  );
} catch (error) {
  report.errors.push(`script: ${error.message.split('\n')[0]}`);
  report.failed = true;
} finally {
  await browser.close();
  server.close();
}
report.ok =
  !report.failed &&
  report.errors.length === 0 &&
  Object.values(report.checks).every((entry) => entry.ok);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
