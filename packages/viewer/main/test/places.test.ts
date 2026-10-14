/**
 * Where the bars go in a running viewer: a bar at `start` is a vertical
 * toolbar along the left edge and moves to the right in a right-to-left
 * language, bars on one edge stack from the outside in, a floating bar sits
 * over the pages in its corner, the `pager` bar shows the page number and goes
 * to the page typed into it, and the document tabs show only while more than
 * one document is open.
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

const WIDTH = 1100;
const HEIGHT = 700;

/** A page whose viewer gets `config`, a script expression with `layout` written as a function. */
const page = (config: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>places</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: ${WIDTH}px; height: ${HEIGHT}px; display: block; }
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
  '/default.html': page('{}'),
  '/rail.html': page(`{
    layout: (layout) =>
      layout.addBar('tools', {
        place: 'start',
        start: [['tool:pointer', 'tool:pan'], ['tool:highlight', 'tool:ink'], ['history:undo', 'history:redo']],
      }),
  }`),
  '/stacked.html': page(`{
    layout: (layout) =>
      layout
        .addBar('first', { place: 'start', center: [['tool:pointer']] })
        .addBar('second', { place: 'start', center: [['tool:pan']] })
        .addBar('outer', { place: { edge: 'start', before: 'first' }, center: [['tool:ink']] })
        .addBar('near', { place: 'end', center: [['zoom:in']] })
        .addBar('far', { place: 'end', center: [['zoom:out']] }),
  }`),
  '/floating.html': page(`{
    layout: (layout) =>
      layout
        .addBar('zoom', { place: { float: 'bottom-end' }, center: [['zoom:out', 'zoom:in']] })
        .addBar('corner', { place: { float: 'top-start' }, start: [['tool:pointer', 'tool:pan']] }),
  }`),
  '/always.html': page(`{ layout: (layout) => layout.tabs('always') }`),
};

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

type ViewerWindow = Window & {
  viewer: {
    get(name: 'stage'): { getCurrentPageIndex(): number; getZoomLevel(): number };
    get(name: 'i18n'): {
      updateSettings(patch: {
        locales: { code: string; name: string; direction: string; translations: object }[];
      }): void;
      setLocale(code: string): Promise<void>;
    };
    documents: { open(source: unknown, options?: { name?: string }): Promise<unknown> };
  };
};

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('where the bars go', () => {
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
    await tab.waitForFunction(() => (window as Partial<ViewerWindow>).viewer !== undefined);
    await frames(tab);
    return tab;
  };

  /** The box of each bar by id, and of the pages: the element the floating bars float in. */
  const boxes = (tab: Page) =>
    tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const box = (element: Element | null) => {
        if (!element) return null;
        const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      };
      const pager = root.querySelector<HTMLElement>('[data-float]');
      return {
        bars: Object.fromEntries(
          [...root.querySelectorAll<HTMLElement>('[data-bar]')].map((bar) => [
            bar.dataset.bar!,
            box(bar)!,
          ]),
        ) as Record<string, Box>,
        pages: box(pager?.offsetParent ?? null) as Box,
      };
    });

  it('draws a start bar as a vertical toolbar along the left, and on the right in a right-to-left language', async () => {
    const tab = await open('/rail.html');
    const before = await boxes(tab);
    const rail = before.bars.tools!;
    expect(rail.left).toBe(0);
    expect(rail.height).toBeGreaterThan(rail.width * 4);
    expect(before.pages.left).toBeGreaterThanOrEqual(rail.right);
    // Under the main bar, which runs the full width.
    expect(rail.top).toBeGreaterThanOrEqual(before.bars.main!.bottom);

    const layout = await tab.evaluate(() => {
      const bar = document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelector('[data-bar="tools"]')!;
      const buttons = [...bar.querySelectorAll('[data-epdf-toolbar-item] button')].map((button) =>
        button.getBoundingClientRect(),
      );
      return {
        orientation: bar.querySelector('[role="toolbar"]')!.getAttribute('aria-orientation'),
        lefts: [...new Set(buttons.map((button) => Math.round(button.left)))],
        tops: buttons.map((button) => button.top),
      };
    });
    expect(layout.orientation).toBe('vertical');
    expect(layout.lefts).toHaveLength(1);
    expect(layout.tops).toEqual([...layout.tops].sort((left, right) => left - right));
    expect(layout.tops).toHaveLength(6);

    await tab.evaluate(async () => {
      const i18n = (window as unknown as ViewerWindow).viewer.get('i18n');
      i18n.updateSettings({
        locales: [{ code: 'ar', name: 'العربية', direction: 'rtl', translations: {} }],
      });
      await i18n.setLocale('ar');
    });
    await tab.waitForFunction(
      (width) =>
        (document
          .querySelector('embedpdf-viewer')
          ?.shadowRoot?.querySelector('[data-bar="tools"]')
          ?.getBoundingClientRect().right ?? 0) === width,
      WIDTH,
    );
    const after = await boxes(tab);
    expect(after.bars.tools!.right).toBe(WIDTH);
    expect(after.pages.right).toBeLessThanOrEqual(after.bars.tools!.left);
    await tab.close();
  });

  it('stacks the bars on one edge from the outside in, in the order they were added', async () => {
    const tab = await open('/stacked.html');
    const { bars } = await boxes(tab);
    // `before` puts a bar outside the one it names.
    expect(bars.outer!.left).toBe(0);
    expect(bars.first!.left).toBe(bars.outer!.right);
    expect(bars.second!.left).toBe(bars.first!.right);
    // On the end edge the first bar added is the outermost, at the right.
    expect(bars.near!.right).toBe(WIDTH);
    expect(bars.far!.right).toBe(bars.near!.left);
    await tab.close();
  });

  it('floats a bar over the pages in its corner, clear of the scrollbars and above the pages', async () => {
    const tab = await open('/floating.html');
    const placed = await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const pill = (id: string) => {
        const element = root.querySelector(
          `[data-bar="${id}"] [role="toolbar"] > div:has(> [data-epdf-toolbar-item]:not(:empty))`,
        )!;
        const { left, right, top, bottom } = element.getBoundingClientRect();
        const hit = root.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        return {
          box: { left, right, top, bottom },
          hitsBar: hit !== null && element.contains(hit),
          shadow: getComputedStyle(element).boxShadow,
        };
      };
      const pages = root.querySelector<HTMLElement>('[data-float]')!.offsetParent!;
      const { left, right, top, bottom } = pages.getBoundingClientRect();
      return { zoom: pill('zoom'), corner: pill('corner'), pages: { left, right, top, bottom } };
    });
    const { zoom, corner, pages } = placed;
    // 20 px in from the pages' edges: clear of their 12 px scrollbars.
    expect(pages.right - zoom.box.right).toBeGreaterThanOrEqual(12);
    expect(pages.right - zoom.box.right).toBeLessThanOrEqual(24);
    expect(pages.bottom - zoom.box.bottom).toBeGreaterThanOrEqual(12);
    expect(pages.bottom - zoom.box.bottom).toBeLessThanOrEqual(24);
    expect(corner.box.left - pages.left).toBeGreaterThanOrEqual(12);
    expect(corner.box.left - pages.left).toBeLessThanOrEqual(24);
    expect(corner.box.top - pages.top).toBeGreaterThanOrEqual(12);
    expect(corner.box.top - pages.top).toBeLessThanOrEqual(24);
    // Above the pages, with a shadow.
    expect(zoom.hitsBar).toBe(true);
    expect(corner.hitsBar).toBe(true);
    expect(zoom.shadow).not.toBe('none');

    // Its buttons work, and the press stays off the pages.
    const zoomBefore = await tab.evaluate(() =>
      (window as unknown as ViewerWindow).viewer.get('stage').getZoomLevel(),
    );
    await tab
      .locator(
        'embedpdf-viewer [data-bar="zoom"] [data-epdf-toolbar-item] button[aria-label="Zoom In"]',
      )
      .click();
    await tab.waitForFunction(
      (level) => (window as unknown as ViewerWindow).viewer.get('stage').getZoomLevel() > level,
      zoomBefore,
    );
    await tab.close();
  });

  it('shows the page number in the pager over the pages, and goes to the page typed into it', async () => {
    const tab = await open('/default.html');
    const pagerText = () =>
      tab.evaluate(
        () =>
          document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelector('[data-bar="pager"] [data-epdf-toolbar-item]')!.textContent,
      );
    expect(await pagerText()).toMatch(/^Page 1 of \d+$/);
    const { bars, pages } = await boxes(tab);
    const pager = bars.pager!;
    // Floating at the bottom of the pages, in the middle.
    expect(pager.bottom).toBeLessThan(pages.bottom);
    expect(pager.bottom).toBeGreaterThan(pages.bottom - 40);
    const middle = await tab.evaluate(() => {
      const pill = document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelector(
          '[data-bar="pager"] [role="toolbar"] > div:has(> [data-epdf-toolbar-item]:not(:empty))',
        )!
        .getBoundingClientRect();
      return (pill.left + pill.right) / 2;
    });
    expect(Math.abs(middle - (pages.left + pages.right) / 2)).toBeLessThan(2);
    // The page number is drawn once: the pager is all there is.
    const drawn = await tab.evaluate(
      () =>
        [...document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelectorAll('*')].filter(
          (element) =>
            !element.closest('[aria-hidden]') &&
            [...element.childNodes].some((node) => node instanceof Text && /Page/.test(node.data)),
        ).length,
    );
    expect(drawn).toBe(1);

    const number = tab.locator(
      'embedpdf-viewer [data-bar="pager"] [data-epdf-toolbar-item] button',
    );
    /** Press the number, and wait for the field that takes its place to have focus. */
    const openField = async () => {
      await number.click();
      await tab.waitForFunction(
        () =>
          document.querySelector('embedpdf-viewer')!.shadowRoot!.activeElement?.tagName === 'INPUT',
      );
    };
    await openField();
    await tab.keyboard.type('3');
    await tab.keyboard.press('Enter');
    await tab.waitForFunction(
      () => (window as unknown as ViewerWindow).viewer.get('stage').getCurrentPageIndex() === 2,
    );
    await tab.waitForFunction(() =>
      /^Page 3 of/.test(
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-bar="pager"] [data-epdf-toolbar-item]')!.textContent ??
          '',
      ),
    );
    // Back on the number, so the keyboard carries on from there.
    expect(
      await tab.evaluate(
        () =>
          document.querySelector('embedpdf-viewer')!.shadowRoot!.activeElement?.textContent ?? '',
      ),
    ).toBe('3');

    // Escape keeps the page.
    await openField();
    await tab.keyboard.type('5');
    await tab.keyboard.press('Escape');
    await frames(tab);
    expect(
      await tab.evaluate(() =>
        (window as unknown as ViewerWindow).viewer.get('stage').getCurrentPageIndex(),
      ),
    ).toBe(2);
    expect(await pagerText()).toMatch(/^Page 3 of/);
    await tab.close();
  });

  it('shows the document tabs only while more than one document is open, unless the layout says', async () => {
    const tabCount = (tab: Page) =>
      tab.evaluate(
        () =>
          document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelectorAll('[role="tab"]')
            .length,
      );
    const tab = await open('/default.html');
    expect(await tabCount(tab)).toBe(0);
    await tab.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());
      await (window as unknown as ViewerWindow).viewer.documents.open(
        { kind: 'bytes', id: 'second', bytes },
        { name: 'Second' },
      );
    });
    await tab.waitForFunction(
      () =>
        document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelectorAll('[role="tab"]')
          .length === 2,
    );
    await tab.close();

    const always = await open('/always.html');
    expect(await tabCount(always)).toBe(1);
    await always.close();
  });
});
