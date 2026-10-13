/**
 * The engine's own code reaches the page's main thread only when the engine runs there. With its
 * worker, the page fetches only what talks to the worker: PDFium's runtime and the host that
 * drives it come in the worker's script and nowhere else. Where there is no `Worker`, the engine
 * runs in the page instead: the page fetches them then, and the document still opens.
 *
 * The runtime is known by its PDFium function names (`FPDF_`), the host by a message only it has.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dist,
  launchChromium,
  serveViewer,
  waitForDocument,
  type ViewerHost,
} from './helpers/viewer-host';

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>engine thread</title>
<style>body { margin: 0; } #viewer { height: 700px; }</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: 'light' });
</script>
</body></html>`;

/** Strings only the engine's runtime and its host hold. */
const ENGINE_MARKERS = ['FPDF_', 'unknown request kind: '];

interface Script {
  path: string;
  text: string;
}

/** Open the page and wait for the document, recording every script the browser fetched. */
async function openViewer(browser: Browser, url: string, withoutWorker: boolean) {
  const page: Page = await browser.newPage();
  if (withoutWorker) {
    await page.addInitScript(() => {
      delete (window as { Worker?: unknown }).Worker;
    });
  }
  const scripts: Script[] = [];
  const reads: Promise<unknown>[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (!path.endsWith('.js')) return;
    reads.push(
      response
        .text()
        .then((text) => scripts.push({ path, text }))
        .catch(() => {}),
    );
  });
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(new URL(worker.url()).pathname));
  await page.goto(url);
  await waitForDocument(page);
  await Promise.all(reads);
  return { page, scripts, workers };
}

const holdingEngine = (scripts: Script[]): string[] =>
  scripts
    .filter(({ text }) => ENGINE_MARKERS.some((marker) => text.includes(marker)))
    .map(({ path }) => path);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))(
  "the engine's code on the main thread",
  () => {
    let host: ViewerHost;
    let browser: Browser;

    beforeAll(async () => {
      host = await serveViewer({ '/engine.html': PAGE });
      browser = await launchChromium();
    });

    afterAll(async () => {
      await browser?.close();
      await host?.close();
    });

    it('is never fetched by the page when the engine runs in its worker', async () => {
      const { page, scripts, workers } = await openViewer(
        browser,
        `${host.origin}/engine.html`,
        false,
      );
      expect(workers).toContain('/embedpdf-worker.js');
      // The worker's own script holds the engine: the markers find it there.
      expect(holdingEngine(scripts)).toContain('/embedpdf-worker.js');
      const pageScripts = scripts.filter(({ path }) => !workers.includes(path));
      expect(pageScripts.length).toBeGreaterThan(0);
      expect(holdingEngine(pageScripts)).toEqual([]);
      await page.close();
    });

    it('is fetched when there is no Worker, and the document still opens', async () => {
      const { page, scripts, workers } = await openViewer(
        browser,
        `${host.origin}/engine.html`,
        true,
      );
      expect(workers).toEqual([]);
      expect(holdingEngine(scripts).length).toBeGreaterThan(0);
      expect(await page.evaluate(() => typeof Worker)).toBe('undefined');
      await page.close();
    });
  },
);
