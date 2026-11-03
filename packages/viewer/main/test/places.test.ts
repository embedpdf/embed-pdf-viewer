/**
 * Where the bars go in a running viewer: a bar at `start` is a vertical
 * toolbar along the left edge and moves to the right in a right-to-left
 * language, bars on one edge stack from the outside in, a floating bar sits
 * over the pages in its corner, bars floating on one edge share it or stack
 * and never cover each other, a floating bar rests out of sight while nothing
 * moves as its place says, the `pager` bar shows the page number between the
 * previous and next page buttons and goes to the page typed into it, and the
 * document tabs show only while more than one document is open.
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
/** A phone's width, where the Layout page's example is checked. */
const PHONE = 390;

/**
 * A page whose viewer gets `config`, a script expression with `layout` written as a function, in
 * a box `width` px wide.
 */
const page = (config: string, width = WIDTH) => `<!doctype html><html><head><meta charset="utf-8">
<title>places</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: ${width}px; height: ${HEIGHT}px; display: block; }
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
  // The Layout page's bottom bar, with the zoom floating in the corner next to the page number.
  '/phone-zoom.html': page(
    `{
    layout: (layout) =>
      layout
        .place('main', 'bottom')
        .remove('zoom', { from: 'main' })
        .addBar('zoom', { place: { float: 'bottom-end' }, center: [[{ custom: 'zoom' }]] }),
  }`,
    PHONE,
  ),
  // A corner bar too wide to leave the page number room beside it.
  '/phone-crowded.html': page(
    `{
    layout: (layout) =>
      layout
        .place('main', 'bottom')
        .remove('zoom', { from: 'main' })
        .addBar('zoom', {
          place: { float: 'bottom-end' },
          center: [[{ custom: 'zoom' }, 'tool:pointer', 'tool:pan', 'tool:highlight']],
        }),
  }`,
    PHONE,
  ),
  '/wide-zoom.html': page(`{
    layout: (layout) =>
      layout.addBar('zoom', { place: { float: 'bottom-end' }, center: [[{ custom: 'zoom' }]] }),
  }`),
  '/idle-zoom.html': page(`{
    layout: (layout) =>
      layout.addBar('zoom', {
        place: { float: 'bottom-end', hideWhenIdle: true },
        center: [['zoom:out', 'zoom:in']],
      }),
  }`),
  '/idle-menu.html': page(`{
    layout: (layout) => layout.add('zoom:in', { to: 'pager' }).add('menu:zoom', { to: 'pager' }),
  }`),
  '/keep.html': page(
    `{ layout: (layout) => layout.place('pager', { float: 'bottom', hideWhenIdle: false }) }`,
  ),
};

/** How long the pages and the pointer stay still before a bar rests out of sight. */
const IDLE_MS = 2000;

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
    get(name: 'stage'): {
      getCurrentPageIndex(): number;
      getZoomLevel(): number;
      goToPage(index: number): void;
    };
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

  const open = async (path: string, width = 1280): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width, height: 800 } });
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

  /** The box of the pill (the section with the bar's items) of each floating bar, by id. */
  const pills = (tab: Page) =>
    tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      return Object.fromEntries(
        [...root.querySelectorAll<HTMLElement>('[data-float] [data-bar]')].map((bar) => {
          const pill = bar.querySelector(
            ':scope > [role="toolbar"] > div:has(> [data-epdf-toolbar-item]:not(:empty))',
          )!;
          const { left, right, top, bottom, width, height } = pill.getBoundingClientRect();
          return [bar.dataset.bar!, { left, right, top, bottom, width, height }];
        }),
      ) as Record<string, Box>;
    });

  const overlap = (left: Box, right: Box) =>
    left.left < right.right &&
    right.left < left.right &&
    left.top < right.bottom &&
    right.top < left.bottom;

  it('puts the page number and a corner bar on a phone side by side, the page number moved aside', async () => {
    const tab = await open('/phone-zoom.html', PHONE);
    const { pages } = await boxes(tab);
    const { pager, zoom } = await pills(tab);
    expect(pager).toBeDefined();
    expect(zoom).toBeDefined();
    expect(overlap(pager!, zoom!)).toBe(false);
    // One row on the bottom edge: the zoom in its corner, the page number beside it.
    expect(Math.abs(pager!.bottom - zoom!.bottom)).toBeLessThan(1);
    expect(pages.right - zoom!.right).toBeGreaterThanOrEqual(12);
    expect(pages.right - zoom!.right).toBeLessThanOrEqual(24);
    // Off the middle only as far as the zoom needs: a gap before it.
    expect(Math.abs(zoom!.left - pager!.right - 8)).toBeLessThan(1);
    expect(pager!.left - pages.left).toBeGreaterThanOrEqual(20 - 0.5);
    await tab.close();
  });

  it('moves a corner bar a row in, over the page number, when they do not fit side by side', async () => {
    const tab = await open('/phone-crowded.html', PHONE);
    const { pages } = await boxes(tab);
    const { pager, zoom } = await pills(tab);
    expect(overlap(pager!, zoom!)).toBe(false);
    // The page number keeps the edge, centered across the pages; the zoom sits over it.
    const pagesMiddle = (pages.left + pages.right) / 2;
    expect(Math.abs((pager!.left + pager!.right) / 2 - pagesMiddle)).toBeLessThan(2);
    expect(pages.bottom - pager!.bottom).toBeLessThanOrEqual(24);
    expect(pager!.top - zoom!.bottom).toBeGreaterThanOrEqual(8 - 0.5);
    expect(pages.right - zoom!.right).toBeLessThanOrEqual(24);
    // Its buttons still work: the zoom field's own.
    const zoomBefore = await tab.evaluate(() =>
      (window as unknown as ViewerWindow).viewer.get('stage').getZoomLevel(),
    );
    await tab
      .locator(
        'embedpdf-viewer [data-bar="zoom"] [data-epdf-toolbar-item] button[aria-label="Zoom In"]',
      )
      .first()
      .click();
    await tab.waitForFunction(
      (level) => (window as unknown as ViewerWindow).viewer.get('stage').getZoomLevel() > level,
      zoomBefore,
    );
    await tab.close();
  });

  it('keeps the page number centered beside a corner bar on a wide viewer, and stacks them as it narrows', async () => {
    const tab = await open('/wide-zoom.html');
    const { pages } = await boxes(tab);
    const wide = await pills(tab);
    expect(overlap(wide.pager!, wide.zoom!)).toBe(false);
    expect(Math.abs(wide.pager!.bottom - wide.zoom!.bottom)).toBeLessThan(1);
    const pagesMiddle = (pages.left + pages.right) / 2;
    expect(Math.abs((wide.pager!.left + wide.pager!.right) / 2 - pagesMiddle)).toBeLessThan(2);
    await tab.evaluate(() => {
      document.getElementById('viewer')!.style.width = '300px';
    });
    await tab.waitForFunction(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const bottom = (id: string) =>
        root.querySelector(`[data-bar="${id}"]`)?.getBoundingClientRect().bottom ?? 0;
      return bottom('zoom') < bottom('pager') - 8;
    });
    const narrow = await pills(tab);
    expect(overlap(narrow.pager!, narrow.zoom!)).toBe(false);
    await tab.close();
  });

  /** Whether the bar `id` rests out of sight now. */
  const idleHidden = (tab: Page, id = 'pager') =>
    tab.evaluate(
      (bar) =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector(`[data-bar="${bar}"]`)
          ?.hasAttribute('data-idle-hidden') ?? null,
      id,
    );
  /** Wait for the bar `id` to rest out of sight, or come back. */
  const until = (tab: Page, hidden: boolean, id = 'pager') =>
    expect.poll(() => idleHidden(tab, id), { timeout: IDLE_MS + 2000 }).toBe(hidden);

  it('rests a floating bar out of sight once nothing moves, as its place says, and wakes it', async () => {
    const tab = await open('/idle-zoom.html');
    // Shown when the document opens; then out of sight, the pager by default and a bar of yours
    // as its place says.
    expect(await idleHidden(tab)).toBe(false);
    await until(tab, true);
    expect(await idleHidden(tab, 'zoom')).toBe(true);
    // Out of sight it takes no presses, but keeps its place in the keyboard's order.
    expect(
      await tab.evaluate(() => {
        const button = document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-bar="pager"] button')!;
        const { pointerEvents, visibility } = getComputedStyle(button);
        return { pointerEvents, visibility };
      }),
    ).toEqual({ pointerEvents: 'none', visibility: 'visible' });
    // A pointer moving over the pages wakes it.
    await tab.mouse.move(WIDTH / 2, HEIGHT / 2);
    await until(tab, false);
    await until(tab, true);
    // So do the pages moving, from code too.
    await tab.evaluate(() => (window as unknown as ViewerWindow).viewer.get('stage').goToPage(3));
    await until(tab, false);
    await tab.close();

    // `false` keeps a bar on screen.
    const kept = await open('/keep.html');
    await kept.waitForTimeout(IDLE_MS + 500);
    expect(await idleHidden(kept)).toBe(false);
    await kept.close();
  });

  it('keeps it while the pointer is on it, the keyboard or a field is in it, or its menu is open', async () => {
    const tab = await open('/idle-menu.html');
    const pager = 'embedpdf-viewer [data-bar="pager"]';
    // The pointer on it holds it.
    await tab.locator(`${pager} [aria-label="Next Page"]:visible`).hover();
    await tab.waitForTimeout(IDLE_MS + 400);
    expect(await idleHidden(tab)).toBe(false);
    // A button keeps focus after a click, but that doesn't hold it once the pointer leaves.
    await tab.locator(`${pager} [aria-label="Zoom In"]:visible`).click();
    await tab.mouse.move(WIDTH / 2, 100);
    await until(tab, true);
    // Focus from the keyboard brings it back, and holds it: an arrow key along the bar, from the
    // button the click left focus on. Not Tab: the bar is one tab stop, and what's before it
    // depends on the document (a form's fields come first).
    await tab.keyboard.press('ArrowLeft');
    await until(tab, false);
    await tab.waitForTimeout(IDLE_MS + 400);
    expect(await idleHidden(tab)).toBe(false);
    // So does the page number's field, being typed in.
    await tab.locator(`${pager} [data-epdf-toolbar-item] button:visible`, { hasText: '/' }).click();
    await tab.waitForFunction(
      () =>
        document.querySelector('embedpdf-viewer')!.shadowRoot!.activeElement?.tagName === 'INPUT',
    );
    await tab.mouse.move(WIDTH / 2, 100);
    await tab.waitForTimeout(IDLE_MS + 400);
    expect(await idleHidden(tab)).toBe(false);
    await tab.keyboard.press('Escape');
    // And a menu open from it, wherever the pointer goes.
    await tab.locator(`${pager} [aria-label="Zoom"]:visible`).click();
    await tab.mouse.move(WIDTH / 2, 100);
    await tab.waitForTimeout(IDLE_MS + 400);
    expect(await idleHidden(tab)).toBe(false);
    await tab.close();
  });

  it('shows the page number in the pager over the pages, and goes to the page typed into it', async () => {
    const tab = await open('/default.html');
    /** What the page number says, without a tooltip showing beside it. */
    const pagerText = () =>
      tab.evaluate(() => {
        const item = document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector(
            '[data-bar="pager"] [data-epdf-toolbar-item]:has(> span > button:not([aria-label]))',
          )!
          .cloneNode(true) as HTMLElement;
        for (const tooltip of item.querySelectorAll('[role="tooltip"]')) tooltip.remove();
        return item.textContent;
      });
    expect(await pagerText()).toMatch(/^1 \/ \d+$/);
    // Between the previous and the next page buttons.
    const labels = await tab.evaluate(() =>
      [
        ...document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelectorAll('[data-bar="pager"] button'),
      ]
        .filter((button) => !button.closest('[aria-hidden="true"]'))
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    );
    expect(labels.slice(0, 3)).toEqual([
      'Previous Page',
      expect.stringMatching(/^1 \/ /),
      'Next Page',
    ]);
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
    // The page count is drawn once: the pager is all there is.
    const drawn = await tab.evaluate(
      () =>
        [...document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelectorAll('*')].filter(
          (element) =>
            !element.closest('[aria-hidden]') &&
            [...element.childNodes].some(
              (node) => node instanceof Text && /^ \/ \d+$/.test(node.data),
            ),
        ).length,
    );
    expect(drawn).toBe(1);

    const number = tab.locator(
      'embedpdf-viewer [data-bar="pager"] [data-epdf-toolbar-item] button:not([aria-label])',
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
    await expect.poll(pagerText).toMatch(/^3 \//);
    // Back on the number, so the keyboard carries on from there.
    expect(
      await tab.evaluate(
        () =>
          document.querySelector('embedpdf-viewer')!.shadowRoot!.activeElement?.textContent ?? '',
      ),
    ).toMatch(/^3 \//);

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
    expect(await pagerText()).toMatch(/^3 \//);
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
