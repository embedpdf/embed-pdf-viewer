/**
 * The cursor goes in the search field when search asks for it: Ctrl/Cmd+F (Find) opens search
 * with the cursor in its field, so typing searches; pressed again from the field, it keeps
 * search open and selects the text, in place of the browser's own find; the Search button puts
 * the cursor there too; a plain open leaves the cursor where it is; and where search opens over
 * the pages (800 px), the field has focus, not the panel's close button.
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
<title>search focus</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; inset: 0; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.prevented = [];
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: 'light' });
  // After the viewer's own listeners: whether it took the key from the browser.
  window.addEventListener('keydown', (event) => window.prevented.push(event.defaultPrevented));
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
    prevented: boolean[];
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

/** Wait until the search field has focus: the panel's code loads on its first open. */
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

/** The search field's text and what of it is selected. */
const fieldOf = (tab: Page) =>
  tab.evaluate((placeholder) => {
    const field = window.element.shadowRoot!.querySelector<HTMLInputElement>(
      `input[placeholder="${placeholder}"]`,
    );
    return field
      ? { value: field.value, start: field.selectionStart, end: field.selectionEnd }
      : null;
  }, FIELD);

const searchOpen = (tab: Page) =>
  tab.evaluate(() => window.element.viewer.get('shell').isOpen('search') as boolean);

/** Whether the viewer took the last key from the browser. */
const lastPrevented = (tab: Page) => tab.evaluate(() => window.prevented.at(-1) ?? null);

/** How the search panel's frame opens: `dock`, `overlay` or `sheet`, or null while it's closed. */
const presentOf = (tab: Page) =>
  tab.evaluate(
    () =>
      window.element
        .shadowRoot!.querySelector('[data-epdf-panel="search"]')
        ?.getAttribute('data-present') ?? null,
  );

/** Click the middle of the pages, which puts focus inside the viewer. */
async function clickPages(tab: Page): Promise<void> {
  const box = await tab.evaluate(() => window.element.getBoundingClientRect().toJSON());
  await tab.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  await frames(tab);
}

/** Click the toolbar's live button labelled `label` (not the measurement layer's copy). */
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

const closeSearch = async (tab: Page) => {
  await tab.evaluate(() => window.element.viewer.get('shell').close('search'));
  await frames(tab);
};

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('the cursor in the search field', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer({ '/search-focus.html': PAGE });
    browser = await launchChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const open = async (width: number): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width, height: 800 } });
    await tab.goto(`${host.origin}/search-focus.html`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  it('puts the cursor in the field on Ctrl/Cmd+F, keeps it open and selects the text on another', async () => {
    const tab = await open(1280);
    await clickPages(tab);
    await tab.keyboard.press('ControlOrMeta+f');
    expect(await lastPrevented(tab)).toBe(true);
    await untilFieldFocused(tab);
    expect(await searchOpen(tab)).toBe(true);
    expect(await presentOf(tab)).toBe('dock');

    // Typing searches.
    await tab.keyboard.type('the');
    await tab.waitForFunction(
      () => window.element.viewer.get('search').getQuery()?.text === 'the',
      null,
      { timeout: 10_000 },
    );

    // From the field, Ctrl/Cmd+F is Find's, not the browser's: search stays open and the
    // text is selected, so typing replaces it.
    await tab.keyboard.press('End');
    await tab.keyboard.press('ControlOrMeta+f');
    await frames(tab);
    expect(await lastPrevented(tab)).toBe(true);
    expect(await searchOpen(tab)).toBe(true);
    expect(await focused(tab)).toEqual({ field: FIELD });
    expect(await fieldOf(tab)).toEqual({ value: 'the', start: 0, end: 3 });
    await tab.close();
  });

  it('puts the cursor in the field from the Search button, and leaves it on a plain open', async () => {
    const tab = await open(1280);
    await clickButton(tab, 'Search');
    await untilFieldFocused(tab);
    expect(await searchOpen(tab)).toBe(true);

    await closeSearch(tab);
    await clickPages(tab);
    const before = await focused(tab);
    expect(before).not.toEqual({ field: FIELD });
    // Your code opening search without asking for focus doesn't move the cursor.
    await tab.evaluate(() => window.element.viewer.get('shell').open('search'));
    await tab.waitForFunction(
      (placeholder) =>
        !!window.element.shadowRoot!.querySelector(`input[placeholder="${placeholder}"]`),
      FIELD,
    );
    await frames(tab);
    expect(await focused(tab)).toEqual(before);
    await tab.close();
  });

  it('gives the field focus, not the close button, where search opens over the pages', async () => {
    const tab = await open(800);
    await clickPages(tab);
    await tab.keyboard.press('ControlOrMeta+f');
    await untilFieldFocused(tab);
    expect(await presentOf(tab)).toBe('overlay');
    // Still the field, once the overlay has settled.
    await tab.waitForTimeout(350);
    expect(await focused(tab)).toEqual({ field: FIELD });
    await tab.close();
  });
});
