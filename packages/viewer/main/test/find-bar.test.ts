/**
 * Search opens as a find bar where hits come without their text: with a scope that allows
 * searching but not copying, the Search button and Ctrl/Cmd+F open a bar over the top corner
 * of the pages (across them on a phone) in place of the panel, the cursor in its field. It says
 * which hit is active of how many; Enter steps to the next one and Shift+Enter back; its
 * options open behind a toggle; Escape closes it and gives focus back. Where copying is allowed,
 * search opens as the panel.
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
<title>find bar</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; inset: 0; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  // ?copy keeps copying, and with it the snippets; without it the scope leaves copying out.
  const copy = new URLSearchParams(location.search).has('copy');
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    theme: 'light',
    scope: ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.search', ...(copy ? ['doc.text.copy'] : [])],
  });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

/** The search field's placeholder, in English. */
const FIELD = 'Search document…';

/** What has focus, looking into the shadow root: the search field, a button by its label, or none. */
const focused = (tab: Page) =>
  tab.evaluate(() => {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    if (!active || active === document.body) return null;
    const placeholder = active.getAttribute('placeholder');
    if (placeholder) return { field: placeholder };
    return { label: active.getAttribute('aria-label') ?? active.getAttribute('title') ?? '' };
  });

/** Wait until the search field has focus: its code loads on its first open. */
const untilFieldFocused = (tab: Page) =>
  tab.waitForFunction(
    (placeholder) => {
      let active: Element | null = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active?.getAttribute('placeholder') === placeholder;
    },
    FIELD,
    { timeout: 20_000 },
  );

/** How search opens: `bar`, `dock`, `overlay` or `sheet`, or null while it's closed. */
const presentOf = (tab: Page) =>
  tab.evaluate(
    () =>
      window.element
        .shadowRoot!.querySelector('[data-epdf-panel="search"]')
        ?.getAttribute('data-present') ?? null,
  );

/** The bar's counter, as numbers: which hit is active, of how many. */
const counterOf = (tab: Page) =>
  tab.evaluate(() => {
    const text = window.element.shadowRoot!.querySelector(
      '[data-epdf-panel="search"]',
    )?.textContent;
    const match = /(\d+) of (\d+)/.exec(text ?? '');
    return match ? { current: Number(match[1]), total: Number(match[2]) } : null;
  });

/** The bar's box and the viewer's, in page pixels. */
const boxesOf = (tab: Page) =>
  tab.evaluate(() => ({
    viewer: window.element.getBoundingClientRect().toJSON() as DOMRect,
    bar: window.element
      .shadowRoot!.querySelector('[data-epdf-panel="search"]')!
      .getBoundingClientRect()
      .toJSON() as DOMRect,
  }));

/** Click the middle of the pages, which puts focus inside the viewer. */
async function clickPages(tab: Page): Promise<void> {
  const box = await tab.evaluate(() => window.element.getBoundingClientRect().toJSON());
  await tab.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  await frames(tab);
}

/** Click the live button labelled `label` (not the measurement layer's copy). */
async function clickButton(tab: Page, label: string): Promise<void> {
  const box = await tab.evaluate((name) => {
    const button = [
      ...window.element.shadowRoot!.querySelectorAll(
        `button[aria-label="${name}"], button[title="${name}"]`,
      ),
    ].find((candidate) => !candidate.closest('[aria-hidden="true"]'));
    return button ? button.getBoundingClientRect().toJSON() : null;
  }, label);
  expect(box, `the ${label} button`).not.toBeNull();
  await tab.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await frames(tab);
}

/** Type `text` in the focused field and wait until its search has finished with hits. */
async function searchFor(tab: Page, text: string): Promise<void> {
  await tab.keyboard.type(text);
  await tab.waitForFunction(
    (wanted) => {
      const search = window.element.viewer.get('search');
      return search.getQuery()?.text === wanted && search.getStatus() === 'complete';
    },
    text,
    { timeout: 20_000 },
  );
  await frames(tab);
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('the find bar', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer({ '/find-bar.html': PAGE });
    browser = await launchChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const open = async (width: number, query = ''): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width, height: 800 } });
    await tab.goto(`${host.origin}/find-bar.html${query}`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  it('opens from the Search button without copying, and steps through the hits', async () => {
    const tab = await open(1280);
    expect(await tab.evaluate(() => window.element.viewer.get('search').canSearch())).toBe(true);
    expect(
      await tab.evaluate(() => window.element.viewer.get('search').canSearch({ snippets: true })),
    ).toBe(false);

    await clickButton(tab, 'Search');
    await untilFieldFocused(tab);
    expect(await presentOf(tab)).toBe('bar');

    await searchFor(tab, 'the');
    const total = await tab.evaluate(() => window.element.viewer.get('search').getHitCount());
    expect(total).toBeGreaterThan(1);
    expect(await counterOf(tab)).toEqual({ current: 1, total });

    // Enter steps to the next hit, Shift+Enter back.
    await tab.keyboard.press('Enter');
    await frames(tab);
    expect(await counterOf(tab)).toEqual({ current: 2, total });
    await tab.keyboard.press('Shift+Enter');
    await frames(tab);
    expect(await counterOf(tab)).toEqual({ current: 1, total });

    // The options open behind their toggle.
    await clickButton(tab, 'Search options');
    expect(
      await tab.evaluate(
        () =>
          window.element
            .shadowRoot!.querySelector('[data-epdf-panel="search"]')
            ?.textContent?.includes('Whole word') ?? false,
      ),
    ).toBe(true);

    // Escape, from anywhere in it, closes it and gives focus back to the button that opened it.
    expect(await focused(tab)).toEqual({ label: 'Search options' });
    await tab.keyboard.press('Escape');
    await frames(tab);
    expect(await tab.evaluate(() => window.element.viewer.get('shell').isOpen('search'))).toBe(
      false,
    );
    expect(await focused(tab)).toEqual({ label: 'Search' });
    await tab.close();
  });

  it('opens on Ctrl/Cmd+F, across the pages on a phone', async () => {
    const tab = await open(400);
    await clickPages(tab);
    await tab.keyboard.press('ControlOrMeta+f');
    await untilFieldFocused(tab);
    expect(await presentOf(tab)).toBe('bar');
    const { viewer, bar } = await boxesOf(tab);
    expect(bar.left - viewer.left).toBeCloseTo(8, 0);
    expect(viewer.right - bar.right).toBeCloseTo(8, 0);
    await tab.close();
  });

  it('opens as the panel where copying is allowed', async () => {
    const tab = await open(1280, '?copy');
    await clickButton(tab, 'Search');
    await untilFieldFocused(tab);
    expect(await presentOf(tab)).toBe('dock');
    await tab.close();
  });
});
