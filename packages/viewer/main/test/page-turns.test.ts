/**
 * One page at a time, in a real browser: the View menu's Page by page switches the Stage to paged
 * flow, and a mouse wheel past the page's edge turns it, one page per gesture.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  dist,
  frames,
  launchChromium,
  serveViewer,
  waitForDocument,
  type ViewerHost,
} from './helpers/viewer-host';

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>page turns</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf' });
  window.element.addEventListener('epdf:ready', (event) => { window.viewer = event.detail.viewer; });
</script>
</body></html>`;

interface TurnWindow {
  viewer: {
    get(name: 'stage'): {
      getCurrentPageIndex(): number;
      getSettings(): { flow: string; layout: string };
      updateSettings(settings: Record<string, unknown>): void;
    };
  };
}

/** Where a row or button with this label is, in the viewer's shadow root. */
const centerOf = (tab: Page, label: string) =>
  tab.evaluate((wanted) => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const found = [
      ...root.querySelectorAll<HTMLElement>(`[aria-label="${wanted}"], [role^="menuitem"]`),
    ].find(
      (element) =>
        !element.closest('[aria-hidden="true"]') &&
        (element.getAttribute('aria-label') === wanted ||
          element.querySelector('.truncate')?.textContent === wanted),
    );
    if (!found) return null;
    const rect = found.getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
  }, label);

const scrollingRows = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    return [...root.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitemradio"]')]
      .map((row) => ({
        label: row.querySelector('.truncate')?.textContent ?? '',
        checked: row.getAttribute('aria-checked'),
      }))
      .filter((row) => ['Vertical', 'Horizontal', 'Page by page'].includes(row.label));
  });

const pageIndex = (tab: Page) =>
  tab.evaluate(() => (window as unknown as TurnWindow).viewer.get('stage').getCurrentPageIndex());

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('page by page', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer({ '/turns.html': PAGE });
    browser = await launchChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const open = async (): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/turns.html`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  const click = async (tab: Page, label: string) => {
    const at = await centerOf(tab, label);
    expect(at, `"${label}"`).not.toBeNull();
    await tab.mouse.click(at!.x, at!.y);
    await frames(tab);
  };

  it('is a choice in the View menu beside Vertical and Horizontal', async () => {
    const tab = await open();
    await click(tab, 'View Controls');
    expect(await scrollingRows(tab)).toEqual([
      { label: 'Vertical', checked: 'true' },
      { label: 'Horizontal', checked: 'false' },
      { label: 'Page by page', checked: 'false' },
    ]);
    await click(tab, 'Page by page');
    const settings = await tab.evaluate(() =>
      (window as unknown as TurnWindow).viewer.get('stage').getSettings(),
    );
    expect(settings).toMatchObject({ flow: 'paged', layout: 'vertical' });

    await click(tab, 'View Controls');
    expect(await scrollingRows(tab)).toEqual([
      { label: 'Vertical', checked: 'false' },
      { label: 'Horizontal', checked: 'false' },
      { label: 'Page by page', checked: 'true' },
    ]);
    await tab.close();
  });

  it('turns one page per wheel gesture past the edge', async () => {
    const tab = await open();
    await tab.evaluate(() =>
      (window as unknown as TurnWindow).viewer
        .get('stage')
        .updateSettings({ flow: 'paged', zoom: { mode: 'fit-page' } }),
    );
    await frames(tab);
    await tab.mouse.move(550, 400);

    await tab.mouse.wheel(0, 120);
    await expect.poll(() => pageIndex(tab)).toBe(1);
    // The same gesture's momentum turns nothing more.
    await tab.mouse.wheel(0, 120);
    await frames(tab);
    expect(await pageIndex(tab)).toBe(1);

    // After a pause, a new gesture turns again, and back up the other way.
    await tab.waitForTimeout(300);
    await tab.mouse.wheel(0, 120);
    await expect.poll(() => pageIndex(tab)).toBe(2);
    await tab.waitForTimeout(300);
    await tab.mouse.wheel(0, -120);
    await expect.poll(() => pageIndex(tab)).toBe(1);
    await tab.close();
  });
});
