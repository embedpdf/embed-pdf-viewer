/**
 * The viewer inside a page that scrolls, in a real browser: a wheel over the pages scrolls them,
 * and one that begins where they can't scroll any further scrolls the page around the viewer.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dist,
  evenlyTimed,
  frames,
  launchChromium,
  serveViewer,
  waitForDocument,
  type ViewerHost,
} from './helpers/viewer-host';

/** A page three screens tall whose viewer gets `config`, a script expression. */
const page = (config: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>scroll chaining</title>
<style>
  body { margin: 0; height: 2400px; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 600px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
  window.element.addEventListener('epdf:ready', (event) => { window.viewer = event.detail.viewer; });
</script>
</body></html>`;

const PAGES = {
  '/chains.html': page('{}'),
  '/keeps.html': page('{ plugins: { stage: { scrollChaining: false } } }'),
};

interface ChainWindow {
  viewer: {
    get(name: 'stage'): {
      getCamera(): unknown;
      panBy(dx: number, dy: number): void;
    };
  };
}

/**
 * The pause that ends a wheel gesture, for the Stage and for the browser. Every step below either
 * waits it out or holds whichever gesture its wheel lands in, so a slow machine changes no answer.
 */
const PAUSE_MS = 1000;

/** Where the pointer rests: over the pages, in the middle of the viewer. */
const POINTER = { x: 550, y: 300 };

const camera = (tab: Page) =>
  tab.evaluate(() =>
    JSON.stringify((window as unknown as ChainWindow).viewer.get('stage').getCamera()),
  );
const pageScroll = (tab: Page) => tab.evaluate(() => window.scrollY);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('inside a page that scrolls', () => {
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

  /** The viewer on its page, the pointer over the pages. */
  const open = async (path: keyof typeof PAGES): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await frames(tab);
    await overThePages(tab);
    return tab;
  };

  /** Put the pointer back over the pages, wherever the page around the viewer scrolled to. */
  const overThePages = async (tab: Page) =>
    tab.mouse.move(POINTER.x, POINTER.y - (await pageScroll(tab)));

  /** Scroll the pages all the way down, and let the gesture end. */
  const toTheEnd = async (tab: Page) => {
    await tab.evaluate(() =>
      (window as unknown as ChainWindow).viewer.get('stage').panBy(0, -1_000_000),
    );
    await frames(tab);
    await tab.waitForTimeout(PAUSE_MS);
  };

  it('a wheel over the pages scrolls them, and the page around the viewer stays', async () => {
    const tab = await open('/chains.html');
    const before = await camera(tab);
    await tab.mouse.wheel(0, 120);
    await expect.poll(() => camera(tab)).not.toBe(before);
    expect(await pageScroll(tab)).toBe(0);
    await tab.close();
  });

  it('a wheel that reaches the end stops there; the next one scrolls the page', async () => {
    const tab = await open('/chains.html');
    await toTheEnd(tab);
    const atEnd = await camera(tab);

    // Back up a little, then down again, further than the pages go: this wheel reaches the end,
    // and what is left of it stays in the viewer.
    await tab.mouse.wheel(0, -120);
    await expect.poll(() => camera(tab)).not.toBe(atEnd);
    await tab.waitForTimeout(PAUSE_MS);
    await tab.mouse.wheel(0, 480);
    await expect.poll(() => camera(tab)).toBe(atEnd);
    await frames(tab);
    expect(await pageScroll(tab)).toBe(0);

    // The next gesture is the page's, all of it.
    await tab.waitForTimeout(PAUSE_MS);
    await tab.mouse.wheel(0, 120);
    await expect.poll(() => pageScroll(tab)).toBe(120);
    await tab.mouse.wheel(0, 120);
    await expect.poll(() => pageScroll(tab)).toBe(240);
    expect(await camera(tab)).toBe(atEnd);

    // Back up, the pages have somewhere to go, so the wheel is theirs again.
    await overThePages(tab);
    await tab.waitForTimeout(PAUSE_MS);
    await tab.mouse.wheel(0, -120);
    await expect.poll(() => camera(tab)).not.toBe(atEnd);
    expect(await pageScroll(tab)).toBe(240);
    await tab.close();
  });

  it('a push that begins while the last scroll still coasts at the end scrolls the page', async () => {
    const tab = await open('/chains.html');
    await toTheEnd(tab);
    const atEnd = await camera(tab);
    await tab.mouse.wheel(0, -120);
    await expect.poll(() => camera(tab)).not.toBe(atEnd);
    await tab.waitForTimeout(PAUSE_MS);

    // A trackpad leaves no pause between two swipes: the first still coasts, slower and slower,
    // when the second begins. So no wait here. The swipe reaches the end, coasts on there, and
    // then the scroll speeds up again: a new push, and the page's. A machine slow enough to put a
    // pause between two wheels only gives the page more.
    await evenlyTimed(tab, POINTER, [60, 60, 60, 40, 20, 10, 30, 60, 90]);
    await expect.poll(() => pageScroll(tab)).toBeGreaterThanOrEqual(120);
    expect(await camera(tab)).toBe(atEnd);
    await tab.close();
  });

  it('a wheel up at the top of the pages scrolls the page back up', async () => {
    const tab = await open('/chains.html');
    const atTop = await camera(tab);
    await tab.evaluate(() => window.scrollTo(0, 200));
    await overThePages(tab);
    await tab.mouse.wheel(0, -120);
    await expect.poll(() => pageScroll(tab)).toBe(80);
    expect(await camera(tab)).toBe(atTop);
    await tab.close();
  });

  it('with scrollChaining off, the viewer keeps every wheel over it', async () => {
    const tab = await open('/keeps.html');
    await toTheEnd(tab);
    const atEnd = await camera(tab);
    for (let notch = 0; notch < 3; notch++) await tab.mouse.wheel(0, 120);
    await tab.waitForTimeout(PAUSE_MS);
    await tab.mouse.wheel(0, 120);
    await frames(tab);
    await tab.waitForTimeout(200);
    expect(await pageScroll(tab)).toBe(0);
    expect(await camera(tab)).toBe(atEnd);
    await tab.close();
  });
});
