#!/usr/bin/env node
/* global window, document, console, process, URL */
/**
 * Drives `spike.html` from a build of `vite.spike.config.ts` in the system
 * Chrome: the app's own search box, slotted into a toolbar socket, searches
 * through `useSearch()`, shows its `hitCount` from `useSearchState()`, and the
 * viewer's own search panel and page highlights show the same matches.
 *
 *   node test/spike-hooks.mjs [dist|<built dir>] [screenshot.png]
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
const distName = process.argv[2] ?? 'dist';
const screenshot = process.argv[3];
// A build of vite.spike.config.ts by its SPIKE_VIEWER_DIST, or any directory with a spike.html.
const root = resolve(here, '..', 'dist-spike', distName);
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
const report = { dist: distName, checks: {}, errors: [] };
const check = (name, ok, detail) => (report.checks[name] = { ok: Boolean(ok), detail });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (error) => report.errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) report.errors.push(`http ${response.status()}: ${response.url()}`);
  });
  await page.goto(`${origin}/spike.html`);

  // The viewer is live and its document is open.
  await page.waitForFunction(() => window.spike, null, { timeout: 30_000 });
  await page.waitForFunction(
    () => window.spike.viewer.documents.list()[0]?.status === 'ready',
    null,
    { timeout: 30_000 },
  );
  check('one SearchToken', await page.evaluate(() => window.spike.sameToken));

  // The app's box is rendered, inside the viewer's toolbar socket.
  const box = page.locator('[data-spike="query"]');
  await box.waitFor({ state: 'visible', timeout: 15_000 });
  check(
    'slotted into the toolbar socket',
    await page.evaluate(
      () => document.querySelector('[data-spike="search"]')?.assignedSlot?.name === 'spike-search',
    ),
  );

  // Search from the app's own component; its hitCount follows.
  let query = null;
  for (const candidate of ['the', 'PDF', 'e']) {
    await box.fill(candidate);
    const hits = await page
      .waitForFunction(
        () => Number(document.querySelector('[data-spike="hits"]')?.textContent) > 0,
        null,
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (hits) {
      query = candidate;
      break;
    }
  }
  const appHits = Number(await page.locator('[data-spike="hits"]').textContent());
  check('app hitCount updates', query !== null && appHits > 0, { query, appHits });

  // The viewer's search plugin holds the same search.
  const viewerState = await page.evaluate(() => {
    const search = window.spike.viewer.get(window.spike.SearchToken);
    return { hitCount: search.getHitCount(), text: search.getQuery()?.text ?? null };
  });
  check(
    'viewer search state matches',
    viewerState.hitCount === appHits && viewerState.text === query,
    viewerState,
  );

  // The pages paint the matches (the search layer's highlight boxes, in the shadow root).
  const highlights = await page.evaluate(() => {
    const shadow = document.querySelector('embedpdf-viewer').shadowRoot;
    return [...shadow.querySelectorAll('div[style*="mix-blend-mode"], svg[style*="mix-blend-mode"]')]
      .length;
  });
  check('pages highlight matches', highlights > 0, { highlights });

  // Next, from the app: the active match moves in both.
  await page.locator('[data-spike="next"]').click();
  await page.waitForTimeout(300);
  const active = await page.evaluate(() => ({
    app: Number(document.querySelector('[data-spike="active"]').textContent),
    viewer: window.spike.viewer.get(window.spike.SearchToken).getActiveHitIndex?.() ?? null,
  }));
  check('active hit shared', active.app === active.viewer && active.app >= 0, active);

  // The viewer's own search panel shows the same count.
  await page.evaluate(() => window.spike.viewer.execute('panel:search'));
  const panelText = await page
    .waitForFunction(
      () => {
        const text = document.querySelector('embedpdf-viewer').shadowRoot.textContent ?? '';
        return /(\d+) results found/.exec(text)?.[1] ?? null;
      },
      null,
      { timeout: 10_000 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  check('viewer panel shows same hits', Number(panelText) === appHits, { panel: panelText });

} catch (error) {
  report.errors.push(`script: ${error.message.split('\n')[0]}`);
  report.failed = true;
  const page = browser.contexts()[0]?.pages()[0];
  report.debug = await page
    ?.evaluate(() => {
      const host = document.querySelector('embedpdf-viewer');
      return {
        lightChildren: host ? [...host.children].map((child) => child.outerHTML.slice(0, 120)) : null,
        slots: host?.shadowRoot
          ? [...host.shadowRoot.querySelectorAll('slot')].map((slot) => slot.name)
          : null,
        ready: Boolean(window.spike),
      };
    })
    .catch((error) => error.message);
} finally {
  if (screenshot) await browser.contexts()[0]?.pages()[0]?.screenshot({ path: screenshot });
  await browser.close();
  server.close();
}
report.ok = !report.failed && Object.values(report.checks).every((c) => c.ok);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
