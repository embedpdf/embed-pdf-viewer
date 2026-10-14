/**
 * An element a framework wrapper renders (`data-epdf-wrapped`) waits for the wrapper's `.config`:
 * when it upgrades over the server's HTML before hydration has run, it doesn't start a viewer
 * from its attributes that the config would replace. Once the config comes it mounts once. An
 * element without the mark still mounts from its attributes, as plain HTML does.
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

/** A page as a server renders it: the element is in the HTML before the viewer's code loads. */
const page = (attributes: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>wrapped element</title>
<style>
  body { margin: 0; }
  embedpdf-viewer { position: absolute; inset: 0; display: block; }
</style></head>
<body>
<embedpdf-viewer ${attributes}></embedpdf-viewer>
<script type="module">
  window.ready = 0;
  const element = document.querySelector('embedpdf-viewer');
  element.addEventListener('epdf:ready', () => (window.ready += 1));
  window.element = element;
  await import('/embedpdf.js');
  window.loaded = true;
</script>
</body></html>`;

const PAGES = {
  '/wrapped.html': page('data-epdf-wrapped src="/sample.pdf"'),
  '/plain.html': page('src="/sample.pdf"'),
};

interface WrappedPage {
  ready: number;
  loaded: boolean;
  element: HTMLElement & { config: unknown };
}

const state = (tab: Page) =>
  tab.evaluate(() => {
    const { ready, loaded, element } = window as unknown as WrappedPage;
    return { ready, loaded, mounted: element.shadowRoot !== null };
  });

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('an element a wrapper renders', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer(PAGES);
    browser = await launchChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('waits for its config when it upgrades over the server’s HTML, then mounts once', async () => {
    const tab = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await tab.goto(`${host.origin}/wrapped.html`);
    await tab.waitForFunction(() => (window as unknown as WrappedPage).loaded === true);
    await tab.waitForTimeout(500);
    // The viewer's code ran and the element upgraded, but it started nothing.
    expect(await state(tab)).toEqual({ ready: 0, loaded: true, mounted: false });

    // Hydration: the wrapper sets the config.
    await tab.evaluate(() => {
      (window as unknown as WrappedPage).element.config = { src: '/sample.pdf' };
    });
    await waitForDocument(tab);
    await tab.waitForTimeout(300);
    expect(await state(tab)).toEqual({ ready: 1, loaded: true, mounted: true });
    await tab.close();
  });

  it('still mounts from its attributes without the mark, as plain HTML does', async () => {
    const tab = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    await tab.goto(`${host.origin}/plain.html`);
    await waitForDocument(tab);
    expect(await state(tab)).toEqual({ ready: 1, loaded: true, mounted: true });
    await tab.close();
  });
});
