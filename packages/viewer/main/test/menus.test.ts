/**
 * The viewer's menus in a running viewer: they open away from their bar's
 * edge and flip or move to stay on screen, sit in the browser's top layer so
 * nothing around them clips them, take the menu keys (arrows, typeahead,
 * Escape back to the button), mark the current choice in the accent look, open a
 * submenu beside its row, and say why a row can't run. The bars over selected
 * text and a selected annotation sit above it, below it without room, and
 * open their menus away from it.
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

/** A page with the viewer in `box` (CSS) and `config`, a script expression. */
const page = (box: string, config = '{}') => `<!doctype html><html><head><meta charset="utf-8">
<title>menus</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; ${box}; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.copied = 0;
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
</script>
</body></html>`;

const FULL = 'left: 0; top: 0; width: 1100px; height: 700px';

/** A command that opens a menu: in the main bar's end, and in the document menu. */
const SHARE = `{
  commands: [
    { id: 'acme:share', label: 'Share', icon: 'link', menu: 'share' },
    { id: 'acme:copy-link', label: 'Copy link', icon: 'copy', run: () => { window.copied += 1; } },
    { id: 'acme:email', label: 'Email a link', icon: 'message', run: () => {} },
  ],
  layout: (layout) =>
    layout
      .addMenu('share', [['acme:copy-link', 'acme:email']])
      .add('acme:share', { to: 'main', section: 'end' })
      .add('acme:share', { to: 'document', after: 'document:download' }),
}`;

const PAGES = {
  '/top.html': page(FULL),
  '/bottom.html': page(FULL, `{ layout: (layout) => layout.place('main', 'bottom') }`),
  '/start.html': page(FULL, `{ layout: (layout) => layout.place('main', 'start') }`),
  // Too narrow for the whole main bar and eight more buttons, the rest goes into "More"; wider
  // than a phone, whose menus are sheets (small-screens.test.ts).
  '/narrow-bottom.html': page(
    'left: 0; top: 0; width: 640px; height: 700px',
    `{
      commands: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        id: 'acme:extra-' + n, label: 'Extra ' + n, icon: 'link', run: () => {},
      })),
      layout: (layout) =>
        [1, 2, 3, 4, 5, 6, 7, 8].reduce(
          (each, n) => each.add('acme:extra-' + n, { to: 'main', section: 'end' }),
          layout.place('main', 'bottom'),
        ),
    }`,
  ),
  // A viewer low in the window: no room below its top bar.
  // A phone: every menu, "More" too, is a sheet from the bottom of the viewer.
  '/phone-bottom.html': page(
    'left: 0; top: 0; width: 380px; height: 700px',
    `{ layout: (layout) => layout.place('main', 'bottom') }`,
  ),
  '/low.html': page('left: 0; top: 690px; width: 1100px; height: 110px'),
  '/share.html': page('left: 0; top: 0; width: 1280px; height: 700px', SHARE),
  // The zoom menu in the main bar and a floating one, the view menu in the main bar and a rail.
  '/twice.html': page(
    FULL,
    `{
      layout: (layout) =>
        layout
          .addBar('zoom', { place: { float: 'bottom-end' }, center: [[{ custom: 'zoom' }]] })
          .addBar('tools', { place: 'start', start: [['menu:view', 'tool:pan']] }),
    }`,
  ),
  // A menu in the bar over selected text.
  '/selection.html': page(
    'left: 24px; top: 72px; width: 860px; height: 600px',
    `{
      commands: [
        { id: 'acme:share', label: 'Share', icon: 'link', menu: 'share' },
        { id: 'acme:copy-link', label: 'Copy link', icon: 'copy', run: () => {} },
      ],
      layout: (layout) =>
        layout.addMenu('share', [['acme:copy-link']]).add('acme:share', { to: 'selection' }),
    }`,
  ),
  '/scoped.html': page(
    FULL,
    `{ scope: ['doc.open', 'doc.render', 'doc.text.select'], notAllowed: 'disable' }`,
  ),
};

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface MenuRow {
  role: string | null;
  label: string;
  checked: string | null;
  disabled: boolean;
  title: string | null;
  hasCheck: boolean;
  background: string;
  popup: string | null;
}

interface OpenMenu {
  label: string | null;
  inTopLayer: boolean;
  box: Box;
  rows: MenuRow[];
  groups: string[];
}

/** The open menus, outermost first, and the live button labelled `label`. */
const menusOf = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const boxOf = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    return [...root.querySelectorAll<HTMLElement>('[role="menu"]')]
      .filter((menu) => menu.matches(':popover-open'))
      .map((menu) => {
        const own = (element: Element) => element.closest('[role="menu"]') === menu;
        return {
          label: menu.getAttribute('aria-label'),
          inTopLayer: menu.matches(':popover-open'),
          box: boxOf(menu),
          rows: [...menu.querySelectorAll('[role^="menuitem"]')].filter(own).map((row) => ({
            role: row.getAttribute('role'),
            label: row.querySelector('.truncate')?.textContent ?? '',
            checked: row.getAttribute('aria-checked'),
            disabled: row.getAttribute('aria-disabled') === 'true',
            title: row.getAttribute('title'),
            hasCheck: row.querySelector('svg path[d="M5 12l5 5l10 -10"]') !== null,
            background: getComputedStyle(row).backgroundColor,
            popup: row.getAttribute('aria-haspopup'),
          })),
          groups: [...menu.querySelectorAll('[role="group"][aria-labelledby]')]
            .filter(own)
            .map(
              (group) => root.getElementById(group.getAttribute('aria-labelledby')!)!.textContent!,
            ),
        };
      });
  }) as Promise<OpenMenu[]>;

/**
 * The live (not the measurement layer's) button with this label, or this tooltip: in the bar
 * `scope` names (a CSS selector), else anywhere.
 */
const buttonOf = (tab: Page, label: string, scope = '') =>
  tab.evaluate(
    ([name, within]) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const labelled = `${within} button[aria-label="${name}"], ${within} button[title="${name}"]`;
      const button = [...root.querySelectorAll(labelled)].find(
        (candidate) => !candidate.closest('[aria-hidden="true"]'),
      );
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        expanded: button.getAttribute('aria-expanded'),
      };
    },
    [label, scope],
  );

/** What has focus, looking into the shadow root: its label, else its text. */
const focused = (tab: Page) =>
  tab.evaluate(() => {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return (
      active?.getAttribute('aria-label') ??
      active?.querySelector('.truncate')?.textContent ??
      active?.textContent ??
      null
    );
  });

const click = async (tab: Page, label: string, scope = '') => {
  const button = await buttonOf(tab, label, scope);
  expect(button, `a button "${label}"`).not.toBeNull();
  await tab.mouse.click((button!.left + button!.right) / 2, (button!.top + button!.bottom) / 2);
  await frames(tab);
};

/** Drag across the line of text at `y`, from `from` to `to`. */
async function selectText(tab: Page, y: number, from: number, to: number): Promise<void> {
  await tab.mouse.move(from, y);
  await tab.mouse.down();
  await tab.mouse.move((from + to) / 2, y, { steps: 5 });
  await tab.mouse.move(to, y, { steps: 5 });
  await tab.mouse.up();
  await frames(tab);
}

/** The selected text's highlight on the screen, top to bottom. */
const highlightOf = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const rects = [...root.querySelectorAll<SVGElement>('svg polygon')]
      .filter((polygon) => polygon.style.fill.includes('--epdf-text-selection'))
      .map((polygon) => polygon.getBoundingClientRect());
    return rects.length === 0
      ? null
      : {
          top: Math.min(...rects.map((rect) => rect.top)),
          bottom: Math.max(...rects.map((rect) => rect.bottom)),
        };
  });

/** The bar over the selection: the bar the page's anchored UI holds, and where it says it sits. */
const selectionBarOf = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const bar = [...root.querySelectorAll('[role="toolbar"]')].find((element) =>
      element.parentElement?.hasAttribute('data-placement'),
    );
    if (!bar) return null;
    const rect = bar.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      placement: bar.parentElement!.getAttribute('data-placement'),
    };
  });

/** Make a square on the first page at page `y` from code, select it with a click, and say where it is. */
async function selectSquareAt(tab: Page, y: number): Promise<Box> {
  const box = await tab.evaluate(async (top) => {
    const viewer = (window as unknown as { element: { viewer: any } }).element.viewer;
    const { annotation } = await viewer.get('annotation').create(0, {
      subtype: 'square',
      box: { x: 120, y: top, width: 160, height: 100 },
      // Filled, so a click inside it lands on it.
      interiorColor: '#ffcc00',
    });
    const rect = viewer.get('annotation').get(annotation.ref).rect;
    const onScreen = viewer.get('stage').pageRectToViewport(0, rect);
    // The main view: the largest box that takes the pointer for the pages.
    const views = [
      ...document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelectorAll('div'),
    ]
      .filter((element) => element.style.touchAction === 'none')
      .map((element) => element.getBoundingClientRect())
      .sort((left, right) => right.width * right.height - left.width * left.height);
    const origin = views[0]!;
    return {
      left: origin.left + onScreen.x,
      top: origin.top + onScreen.y,
      right: origin.left + onScreen.x + onScreen.width,
      bottom: origin.top + onScreen.y + onScreen.height,
    };
  }, y);
  await frames(tab);
  await tab.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2);
  await tab.waitForFunction(() =>
    [
      ...document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelectorAll('[role="toolbar"]'),
    ].some((bar) => bar.parentElement?.hasAttribute('data-placement')),
  );
  await frames(tab);
  return box;
}

const press = async (tab: Page, key: string) => {
  await tab.keyboard.press(key);
  await frames(tab);
};

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('menus', () => {
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

  const open = async (path: string, width = 1280, touch = false): Promise<Page> => {
    // `hasTouch` makes a finger the main way of pointing (`pointer: coarse`); the mouse still drags.
    const tab = await browser.newPage({ viewport: { width, height: 800 }, hasTouch: touch });
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  it("opens a top bar's menu below its button, in the top layer, and its button closes it", async () => {
    const tab = await open('/top.html');
    await click(tab, 'Menu');
    const [menu, ...others] = await menusOf(tab);
    const button = await buttonOf(tab, 'Menu');
    expect(others).toEqual([]);
    expect(menu!.inTopLayer).toBe(true);
    expect(menu!.label).toBe('Menu');
    expect(button!.expanded).toBe('true');
    expect(menu!.box.top).toBeGreaterThanOrEqual(button!.bottom);
    expect(Math.abs(menu!.box.left - button!.left)).toBeLessThan(1);

    await click(tab, 'Menu');
    expect(await menusOf(tab)).toEqual([]);
    expect((await buttonOf(tab, 'Menu'))!.expanded).toBe('false');
    await tab.close();
  });

  it("opens a bottom bar's menu above its button", async () => {
    const tab = await open('/bottom.html');
    await click(tab, 'Menu');
    const [menu] = await menusOf(tab);
    const button = await buttonOf(tab, 'Menu');
    expect(menu).toBeDefined();
    expect(menu!.box.bottom).toBeLessThanOrEqual(button!.top);
    await tab.close();
  });

  it('opens the "More" menu of a bottom bar upward, lined up with the end of its button', async () => {
    const tab = await open('/narrow-bottom.html');
    await click(tab, 'More');
    const [menu] = await menusOf(tab);
    const button = await buttonOf(tab, 'More');
    expect(menu).toBeDefined();
    expect(menu!.rows.length).toBeGreaterThan(0);
    expect(menu!.box.bottom).toBeLessThanOrEqual(button!.top);
    expect(Math.abs(menu!.box.right - button!.right)).toBeLessThan(1);
    await tab.close();
  });

  it('opens the "More" menu of a phone as a sheet from the bottom, not beside its button', async () => {
    const tab = await open('/phone-bottom.html', 380);
    await click(tab, 'More');
    expect(await menusOf(tab)).toEqual([]);
    const sheet = await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const layer = [...root.querySelectorAll('[data-epdf-layer]')].find((each) =>
        each.matches(':popover-open'),
      );
      const sheet = layer?.querySelector('[data-epdf-sheet]');
      if (!sheet) return null;
      const rect = sheet.getBoundingClientRect();
      return {
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        rows: sheet.querySelectorAll('[role="menu"] [role^="menuitem"]').length,
      };
    });
    expect(sheet).toMatchObject({ bottom: 700, width: 380 });
    expect(sheet!.rows).toBeGreaterThan(0);
    await tab.close();
  });

  it("opens a start bar's menu beside its button, toward the pages, on either side", async () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const tab = await open('/start.html');
      // The viewer's direction is its root's `dir`: a right-to-left language sets it.
      await tab.evaluate((dir) => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        root.querySelector('[data-embedpdf-root] [dir]')!.setAttribute('dir', dir);
      }, direction);
      await frames(tab);
      await click(tab, 'Menu');
      const [menu] = await menusOf(tab);
      const button = await buttonOf(tab, 'Menu');
      expect(menu, direction).toBeDefined();
      if (direction === 'ltr') {
        expect(button!.left).toBeLessThan(100);
        expect(menu!.box.left).toBeGreaterThanOrEqual(button!.right);
      } else {
        expect(button!.right).toBeGreaterThan(1000);
        expect(menu!.box.right).toBeLessThanOrEqual(button!.left);
      }
      expect(Math.abs(menu!.box.top - button!.top)).toBeLessThan(1);
      await tab.close();
    }
  });

  it('flips above its button without room below, reaching past the viewer unclipped', async () => {
    const tab = await open('/low.html');
    await click(tab, 'Menu');
    const [menu] = await menusOf(tab);
    const button = await buttonOf(tab, 'Menu');
    expect(menu).toBeDefined();
    expect(menu!.box.bottom).toBeLessThanOrEqual(button!.top);
    // Above the viewer's own box, and still what the page shows there.
    expect(menu!.box.top).toBeLessThan(690);
    const shown = await tab.evaluate(
      ([x, y]) => {
        const element = document.elementFromPoint(x!, y!);
        const inner = element?.shadowRoot?.elementFromPoint(x!, y!);
        return { host: element?.localName, inMenu: !!inner?.closest('[role="menu"]') };
      },
      [(menu!.box.left + menu!.box.right) / 2, menu!.box.top + 8],
    );
    expect(shown).toEqual({ host: 'embedpdf-viewer', inMenu: true });
    await tab.close();
  });

  it('moves left to stay on screen when its button is at the window edge', async () => {
    const tab = await open('/share.html');
    await click(tab, 'Share');
    const [menu] = await menusOf(tab);
    const button = await buttonOf(tab, 'Share');
    expect(menu).toBeDefined();
    expect(menu!.rows.map((row) => row.label)).toEqual(['Copy link', 'Email a link']);
    expect(menu!.box.top).toBeGreaterThanOrEqual(button!.bottom);
    expect(menu!.box.right).toBeLessThanOrEqual(1280 - 4 + 0.5);
    expect(menu!.box.left).toBeLessThan(button!.left);
    await tab.close();
  });

  it('moves with the arrow keys and typeahead, and Escape gives focus back to its button', async () => {
    const tab = await open('/top.html');
    await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      [...root.querySelectorAll<HTMLElement>('button[aria-label="View Controls"]')]
        .find((button) => !button.closest('[aria-hidden="true"]'))!
        .focus();
    });
    await press(tab, 'Enter');
    expect((await menusOf(tab)).length).toBe(1);
    expect(await focused(tab)).toBe('Single Page');
    await press(tab, 'ArrowDown');
    expect(await focused(tab)).toBe('Two Page');
    await press(tab, 'End');
    expect(await focused(tab)).toBe('Full Screen');
    await press(tab, 'ArrowDown');
    expect(await focused(tab)).toBe('Single Page');
    await press(tab, 'h');
    expect(await focused(tab)).toBe('Horizontal');
    await tab.waitForTimeout(600);
    await press(tab, 'r');
    expect(await focused(tab)).toBe('Rotate Clockwise');
    await press(tab, 'r');
    expect(await focused(tab)).toBe('Rotate Counter-Clockwise');

    await press(tab, 'Escape');
    expect(await menusOf(tab)).toEqual([]);
    expect(await focused(tab)).toBe('View Controls');
    expect((await buttonOf(tab, 'View Controls'))!.expanded).toBe('false');
    await tab.close();
  });

  it('marks the current choice in the accent look, not like a hovered row, in named groups', async () => {
    const tab = await open('/top.html');
    await click(tab, 'View Controls');
    const [menu] = await menusOf(tab);
    const row = (label: string) => menu!.rows.find((each) => each.label === label)!;
    expect(menu!.groups).toEqual(['Page Layout', 'Scrolling', 'Rotate']);
    expect(row('Single Page')).toMatchObject({ role: 'menuitemradio', checked: 'true' });
    expect(row('Two Page')).toMatchObject({ role: 'menuitemradio', checked: 'false' });
    expect(row('Vertical')).toMatchObject({ checked: 'true' });
    expect(row('Rotate Clockwise')).toMatchObject({ role: 'menuitem', checked: null });
    // No check column: the choice is its background, and the other rows have none.
    expect(menu!.rows.some((each) => each.hasCheck)).toBe(false);
    const chosen = row('Single Page').background;
    expect(chosen).not.toBe(row('Two Page').background);
    expect(row('Vertical').background).toBe(chosen);

    // The pointer over a row is the neutral hover look, never the choice's.
    const hovered = await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const two = [...root.querySelectorAll('[role="menu"] [role^="menuitem"]')].find(
        (item) => item.querySelector('.truncate')?.textContent === 'Two Page',
      )!;
      const rect = two.getBoundingClientRect();
      return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    });
    await tab.mouse.move(hovered.x, hovered.y);
    await tab.waitForTimeout(250);
    const [hover] = await menusOf(tab);
    const hoverBackground = hover!.rows.find((each) => each.label === 'Two Page')!.background;
    expect(hoverBackground).not.toBe(row('Two Page').background);
    expect(hoverBackground).not.toBe(chosen);

    await tab.mouse.click(
      (menu!.box.left + menu!.box.right) / 2,
      await tab.evaluate(() => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const two = [...root.querySelectorAll('[role="menu"] [role^="menuitem"]')].find(
          (item) => item.querySelector('.truncate')?.textContent === 'Two Page',
        )!;
        const rect = two.getBoundingClientRect();
        return (rect.top + rect.bottom) / 2;
      }),
    );
    await frames(tab);
    expect(await menusOf(tab)).toEqual([]);
    await click(tab, 'View Controls');
    const [again] = await menusOf(tab);
    expect(again!.rows.find((each) => each.label === 'Two Page')).toMatchObject({
      checked: 'true',
      background: chosen,
    });
    expect(again!.rows.find((each) => each.label === 'Single Page')!.checked).toBe('false');
    await tab.close();
  });

  it('opens a submenu beside its row and closes it with the arrow keys', async () => {
    const tab = await open('/share.html');
    await click(tab, 'Menu');
    const [menu] = await menusOf(tab);
    expect(menu!.rows.map((row) => [row.label, row.popup])).toEqual([
      ['Open', null],
      ['Download', null],
      ['Share', 'menu'],
      ['Print', null],
      ['Full Screen', null],
    ]);
    expect(await focused(tab)).toBe('Open');
    await press(tab, 'ArrowDown');
    await press(tab, 'ArrowDown');
    expect(await focused(tab)).toBe('Share');

    await press(tab, 'ArrowRight');
    const [parent, submenu] = await menusOf(tab);
    expect(submenu).toBeDefined();
    expect(submenu!.label).toBe('Share');
    expect(submenu!.box.left).toBeGreaterThanOrEqual(parent!.box.right - 2);
    expect(await focused(tab)).toBe('Copy link');
    // The parent's keys stay out of the submenu.
    await press(tab, 'ArrowDown');
    expect(await focused(tab)).toBe('Email a link');

    await press(tab, 'ArrowLeft');
    expect((await menusOf(tab)).length).toBe(1);
    expect(await focused(tab)).toBe('Share');

    await press(tab, 'ArrowRight');
    await press(tab, 'Enter');
    expect(await tab.evaluate(() => (window as unknown as { copied: number }).copied)).toBe(1);
    expect(await menusOf(tab)).toEqual([]);
    expect(await focused(tab)).toBe('Menu');
    await tab.close();
  });

  it('opens a menu two bars name only at the button pressed', async () => {
    const tab = await open('/twice.html');
    await click(tab, 'Zoom', '[data-bar="zoom"]');
    let menus = await menusOf(tab);
    let pressed = await buttonOf(tab, 'Zoom', '[data-bar="zoom"]');
    expect(menus.length).toBe(1);
    // The floating bar is in the bottom half: its menu opens upward, from its own button.
    expect(menus[0]!.box.bottom).toBeLessThanOrEqual(pressed!.top);
    expect(pressed!.expanded).toBe('true');
    expect((await buttonOf(tab, 'Zoom', '[data-bar="main"]'))!.expanded).toBe('false');

    await click(tab, 'View Controls', '[data-bar="main"]');
    menus = await menusOf(tab);
    pressed = await buttonOf(tab, 'View Controls', '[data-bar="main"]');
    expect(menus.length).toBe(1);
    expect(menus[0]!.box.top).toBeGreaterThanOrEqual(pressed!.bottom);

    await click(tab, 'View Controls', '[data-bar="tools"]');
    menus = await menusOf(tab);
    pressed = await buttonOf(tab, 'View Controls', '[data-bar="tools"]');
    expect(menus.length).toBe(1);
    expect(menus[0]!.box.left).toBeGreaterThanOrEqual(pressed!.right);
    expect((await buttonOf(tab, 'View Controls', '[data-bar="main"]'))!.expanded).toBe('false');
    await press(tab, 'Escape');

    // Opened from code: at one of its buttons, once.
    await tab.evaluate(() =>
      (
        document.querySelector('embedpdf-viewer') as unknown as {
          viewer: { commands: { execute(id: string): Promise<unknown> } };
        }
      ).viewer.commands.execute('menu:view'),
    );
    await frames(tab);
    expect((await menusOf(tab)).length).toBe(1);
    await tab.close();
  });

  it('sits above selected text, and opens its menus above it, away from the selection', async () => {
    const tab = await open('/selection.html');
    await tab.waitForTimeout(1500);
    // The "Start here" line, low on the first page: room above it.
    await selectText(tab, 554, 125, 360);
    const text = await highlightOf(tab);
    const bar = await selectionBarOf(tab);
    expect(text, 'the selected text').not.toBeNull();
    expect(bar?.placement).toBe('top');
    expect(bar!.bottom).toBeLessThanOrEqual(text!.top);
    const share = await buttonOf(tab, 'Share');
    expect(share, 'the Share button in the selection bar').not.toBeNull();
    await click(tab, 'Share');
    const [menu] = await menusOf(tab);
    expect(menu).toBeDefined();
    expect(menu!.rows.map((row) => row.label)).toEqual(['Copy link']);
    expect(menu!.box.bottom).toBeLessThanOrEqual(share!.top);
    await tab.close();
  });

  it("keeps clear of the selection's handles on a touch screen", async () => {
    const gapOver = async (touch: boolean) => {
      const tab = await open('/selection.html', 1280, touch);
      await tab.waitForTimeout(1500);
      await selectText(tab, 554, 125, 360);
      const text = await highlightOf(tab);
      const bar = await selectionBarOf(tab);
      await tab.close();
      return text!.top - bar!.bottom;
    };
    // Each handle's 12 px head and the 14 px a finger grabs around it, beyond the usual 12 px.
    expect(Math.round(await gapOver(false))).toBe(12);
    expect(Math.round(await gapOver(true))).toBe(12 + 12 + 14);
  });

  it('sits below selected text without room above it, and opens its menus below it', async () => {
    const tab = await open('/selection.html');
    await tab.waitForTimeout(1500);
    // The document's title, just under the main bar: no room above it for the bar.
    await selectText(tab, 196, 310, 600);
    const text = await highlightOf(tab);
    const bar = await selectionBarOf(tab);
    expect(bar?.placement).toBe('bottom');
    expect(bar!.top).toBeGreaterThanOrEqual(text!.bottom);
    const share = await buttonOf(tab, 'Share');
    await click(tab, 'Share');
    const [menu] = await menusOf(tab);
    expect(menu!.box.top).toBeGreaterThanOrEqual(share!.bottom);
    await tab.close();
  });

  it('sits above a selected annotation, and below one at the top of the view', async () => {
    const tab = await open('/selection.html');
    await tab.waitForTimeout(1500);
    // Mid-page, with room above and below it.
    const middle = await selectSquareAt(tab, 150);
    const above = await selectionBarOf(tab);
    expect(above?.placement).toBe('top');
    // Clear of the annotation, and of the handle that turns it, which sits above it.
    expect(above!.bottom).toBeLessThan(middle.top - 15);
    await press(tab, 'Escape');

    const top = await selectSquareAt(tab, 4);
    const below = await selectionBarOf(tab);
    expect(below?.placement).toBe('bottom');
    expect(below!.top).toBeGreaterThanOrEqual(top.bottom);
    await tab.close();
  });

  it("greys out a row the scope doesn't allow, says why, and skips it", async () => {
    const tab = await open('/scoped.html');
    await click(tab, 'Menu');
    const [menu] = await menusOf(tab);
    const download = menu!.rows.find((row) => row.label === 'Download')!;
    const print = menu!.rows.find((row) => row.label === 'Print')!;
    for (const row of [download, print]) {
      expect(row.disabled).toBe(true);
      expect(row.title).toBeTruthy();
      expect(row.title).not.toBe(row.label);
    }
    // Opening another file needs nothing of this document's scope.
    expect(await focused(tab)).toBe('Open');
    await press(tab, 'ArrowDown');
    expect(await focused(tab)).toBe('Full Screen');
    await tab.close();
  });
});
