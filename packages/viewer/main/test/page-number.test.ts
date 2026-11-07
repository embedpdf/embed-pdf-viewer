/**
 * The page number while two pages sit side by side (`spread`): it names both, "1–2 / 8",
 * its number starts the field at the spread's first page and says what it does in the viewer's
 * tooltip, and its words are the documented keys (`pageNumber.pages`), which `strings` change. A
 * document of one page has no page number, and no buttons to other pages.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

/** A page whose viewer gets `config`, a script expression. */
const page = (config: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>page number</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
  window.element.addEventListener('epdf:ready', (event) => { window.viewer = event.detail.viewer; });
</script>
</body></html>`;

/** A document of one page: a form. */
const ONE_PAGE = readFileSync(
  resolve(dist, '../../../engine/main/test/fixtures/action_buttons_form.pdf'),
).toString('base64');

/** The page number's item in the pager, beside the previous and next page buttons. */
const NUMBER_ITEM =
  '[data-bar="pager"] [data-epdf-toolbar-item]:has(> span > button:not([aria-label]))';

const PAGES = {
  '/one-page.html': page(
    `{ src: Uint8Array.from(atob('${ONE_PAGE}'), (char) => char.charCodeAt(0)) }`,
  ),
  '/spread.html': page("{ plugins: { stage: { spread: 'odd' } } }"),
  '/words.html': page(`{
    plugins: { stage: { spread: 'odd' } },
    strings: { en: { 'pageNumber.pages': 'Spread {first}-{last} / {total}' } },
  }`),
};

interface NumberWindow {
  viewer: {
    get(name: 'stage'): {
      goToPage(index: number): void;
      getPageCount(): number;
      updateSettings(settings: { spread: string }): void;
    };
  };
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))(
  'the page number of a spread, and of one page',
  () => {
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

    const open = async (path: string): Promise<Page> => {
      const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${host.origin}${path}`);
      await waitForDocument(tab);
      await frames(tab);
      return tab;
    };

    const pagerText = (tab: Page) =>
      tab.evaluate(
        () =>
          document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelector(
              '[data-bar="pager"] [data-epdf-toolbar-item]:has(> span > button:not([aria-label]))',
            )?.textContent ?? '',
      );

    it('names the first and the last page of the spread, and one page without one', async () => {
      const tab = await open('/spread.html');
      const total = await tab.evaluate(() =>
        (window as unknown as NumberWindow).viewer.get('stage').getPageCount(),
      );
      await tab.waitForFunction(() =>
        /^\d+–\d+ \/ \d+$/.test(
          document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelector(
              '[data-bar="pager"] [data-epdf-toolbar-item]:has(> span > button:not([aria-label]))',
            )?.textContent ?? '',
        ),
      );
      const [, first, last, of] = /^(\d+)–(\d+) \/ (\d+)$/.exec(await pagerText(tab))!;
      expect(Number(last)).toBe(Number(first) + 1);
      expect(Number(of)).toBe(total);

      // Its number starts the field at the spread's first page.
      await tab.locator(`embedpdf-viewer ${NUMBER_ITEM} button`).click();
      const draft = await tab.evaluate(
        () =>
          (document.querySelector('embedpdf-viewer')!.shadowRoot!.activeElement as HTMLInputElement)
            .value,
      );
      expect(draft).toBe(first);
      await tab.keyboard.press('Escape');

      await tab.evaluate(() =>
        (window as unknown as NumberWindow).viewer.get('stage').updateSettings({ spread: 'none' }),
      );
      await tab.waitForFunction(() =>
        /^\d+ \/ \d+$/.test(
          document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelector(
              '[data-bar="pager"] [data-epdf-toolbar-item]:has(> span > button:not([aria-label]))',
            )?.textContent ?? '',
        ),
      );
      await tab.close();
    });

    it("says what pressing the number does in the viewer's tooltip", async () => {
      const tab = await open('/spread.html');
      await tab.locator(`embedpdf-viewer ${NUMBER_ITEM} button`).hover();
      const described = await tab
        .waitForFunction(() => {
          const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
          const button = root.querySelector(
            '[data-bar="pager"] [data-epdf-toolbar-item] button:not([aria-label])',
          )!;
          const id = button.getAttribute('aria-describedby');
          return id && !button.hasAttribute('title')
            ? root.getElementById(id)?.textContent?.trim()
            : null;
        })
        .then((handle) => handle.jsonValue());
      expect(described).toBe('Go to page');
      await tab.close();
    });

    it('says it in the words of pageNumber.pages', async () => {
      // Not `open`: its wait is for the viewer's own words.
      const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(`${host.origin}/words.html`);
      await tab.waitForFunction(
        () =>
          /^Spread 1-2 \/ \d+$/.test(
            document
              .querySelector('embedpdf-viewer')
              ?.shadowRoot?.querySelector(
                '[data-bar="pager"] [data-epdf-toolbar-item]:has(> span > button:not([aria-label]))',
              )?.textContent ?? '',
          ),
        null,
        { timeout: 60_000 },
      );
      await tab.close();
    });

    it('draws nothing for a document of one page, and no buttons to other pages', async () => {
      const tab = await open('/one-page.html');
      const pager = await tab.evaluate(() => {
        const bar = document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-bar="pager"]');
        const shown = [...(bar?.querySelectorAll('button') ?? [])].filter(
          (button) => !button.closest('[aria-hidden="true"]') && button.getClientRects().length > 0,
        );
        return {
          buttons: shown.map((button) => button.getAttribute('aria-label') ?? button.textContent),
          text: bar?.textContent ?? '',
        };
      });
      expect(pager).toEqual({ buttons: [], text: '' });
      await tab.close();
    });
  },
);
