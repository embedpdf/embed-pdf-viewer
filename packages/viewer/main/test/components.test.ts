/**
 * Your own components in a running viewer: an element slotted as `item:<id>` shows in its bar
 * and says where it sits (`data-orientation`, `data-edge`, `data-variant`, `data-size`, kept
 * live as the bar moves to a rail), it's a stop of the toolbar's arrow keys, one with `grow`
 * takes the room its bar has left and costs the bar nothing more than its own width, a `panel:<id>` body
 * shows in its panel, each region shows where it goes (`empty` only while no document is open),
 * `<epdf-button>` and `<epdf-menu>` look and work like the viewer's own (`active` too),
 * `<epdf-icon>` draws the viewer's icons and the app's, and the zoom field is one Tab stop with
 * its buttons on the arrow keys.
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

/**
 * A page with `<embedpdf-viewer>` holding `children`, given `config` (a script expression), the
 * document when `src` is set, and the page's own `css`.
 */
const page = (children: string, config = '{}', src: string | null = '/sample.pdf', css = '') =>
  `<!doctype html><html><head><meta charset="utf-8">
<title>components</title>
<style>
  body { margin: 0; }
  embedpdf-viewer { position: absolute; left: 0; top: 0; width: ${WIDTH}px; height: ${HEIGHT}px; display: block; }
  ${css}
</style></head>
<body>
<embedpdf-viewer id="viewer"${src ? ` src="${src}"` : ''}>${children}</embedpdf-viewer>
<script type="module">
  import '/embedpdf.js';
  window.clicks = 0;
  window.selected = [];
  const element = document.getElementById('viewer');
  element.addEventListener('epdf:ready', (event) => { window.viewer = event.detail.viewer; });
  element.addEventListener('select', (event) => window.selected.push(event.target.id));
  element.config = ${config};
</script>
</body></html>`;

/** Two items of your own in the main bar, which goes to a rail on the start edge below 900px. */
const ITEMS = page(
  `<div slot="item:reviewers" id="reviewers"><button id="first">Ada</button><button id="second">Grace</button></div>
   <span slot="item:versions" id="versions">Version 3</span>`,
  `{
    layout: (layout, env) => {
      const placed = layout
        .add({ custom: 'reviewers' }, { to: 'main', section: 'start' })
        .add({ custom: 'versions', variants: ['full', 'short'] }, { to: 'main', section: 'start' });
      return env.width < 900 ? placed.place('main', 'start') : placed;
    },
  }`,
);

const REGIONS = page(
  `<header slot="header" id="header">Acme Contracts</header>
   <nav slot="tabs" id="tabs">Our own tabs</nav>
   <div slot="empty" id="empty">Drop a PDF here</div>
   <footer slot="footer" id="footer">Saved a minute ago</footer>`,
  '{}',
  null,
);

const PANEL = page(
  `<section slot="panel:notes" id="notes"><textarea placeholder="Your notes"></textarea></section>`,
  `{
    layout: (layout) =>
      layout
        .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
        .add('panel:notes', { to: 'main', section: 'end' }),
  }`,
);

/** The viewer's own components in toolbar items, in a bar at `place`. */
const primitives = (place: string) =>
  page(
    `<div slot="item:pill" id="pill">
       <epdf-button command="zoom:in" id="zoom-in"></epdf-button>
       <epdf-button command="tool:pan" id="pan"></epdf-button>
       <epdf-button icon="eye" label="Night" id="night" active></epdf-button>
       <epdf-button icon="link" label="Mine" id="mine"></epdf-button>
     </div>
     <epdf-menu slot="item:share" icon="link" label="Share" id="share">
       <epdf-menu-item icon="copy" id="copy">Copy link</epdf-menu-item>
       <epdf-menu-item command="zoom:out" id="out"></epdf-menu-item>
       <epdf-menu-item id="notes" active>Show notes</epdf-menu-item>
     </epdf-menu>
     <epdf-button slot="item:solo" command="zoom:in" id="solo"></epdf-button>
     <span slot="item:status" id="status">
       <epdf-icon name="check" id="check"></epdf-icon>
       <epdf-icon name="seal" size="16" label="Approved" id="seal"></epdf-icon>
     </span>`,
    `{
      icons: { seal: { paths: ['M4 4h16v16H4z'], fill: true } },
      layout: (layout) =>
        layout
          .place('main', '${place}')
          .add({ custom: 'pill' }, { to: 'main', section: 'start' })
          .add({ custom: 'share' }, { to: 'main', section: 'start' })
          .add({ custom: 'solo' }, { to: 'main', section: 'start' })
          .add({ custom: 'status' }, { to: 'main', section: 'end' }),
    }`,
  );

/** An item of two sizes, which its variant picks by CSS. */
const VARIANTS = page(
  `<span slot="item:sized" id="sized">Sized</span>`,
  `{
    layout: (layout) =>
      layout.add(
        { custom: 'sized', variants: ['full', 'short'], command: 'zoom:in' },
        { to: 'main', section: 'start' },
      ),
  }`,
  '/sample.pdf',
  `#sized { display: inline-block; overflow: hidden; }
   #sized[data-variant='full'] { width: 700px; }
   #sized[data-variant='short'] { width: 48px; }`,
);

/** A title field of yours in a bar, with `grow` or without, and in the main bar the same way. */
const growing = (grow: boolean) =>
  page(
    `<input slot="item:title" id="title" value="Q3 report">
     <input slot="item:note" id="note" value="Draft">`,
    `{
      layout: (layout) =>
        layout
          .addBar('heading', {
            place: { edge: 'top', after: 'main' },
            start: [[{ custom: 'title', grow: ${grow} }]],
            end: [['zoom:out', 'zoom:in']],
          })
          .add({ custom: 'note', grow: ${grow} }, { to: 'main', section: 'start' }),
    }`,
    '/sample.pdf',
    `#title, #note { width: 100%; box-sizing: border-box; font: inherit; }`,
  );

const PAGES = {
  '/items.html': ITEMS,
  '/grow.html': growing(true),
  '/no-grow.html': growing(false),
  '/variants.html': VARIANTS,
  '/regions.html': REGIONS,
  '/panel.html': PANEL,
  '/primitives.html': primitives('top'),
  '/primitives-bottom.html': primitives('bottom'),
  '/default.html': page(''),
};

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** What the page's script keeps on `window`. */
type TestWindow = Window & {
  viewer?: {
    get(name: 'stage'): { getZoomLevel(): number };
    commands: {
      execute(id: string): Promise<unknown>;
      resolveCommand(id: string): { label: string } | null;
    };
  };
  clicks: number;
  selected: string[];
};

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('your own components', () => {
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

  const open = async (path: string, withDocument = true): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}${path}`);
    if (withDocument) await waitForDocument(tab);
    await tab.waitForFunction(() => (window as unknown as TestWindow).viewer !== undefined);
    await frames(tab);
    return tab;
  };

  /** The box of the page's element `id`, or null while it isn't shown. */
  const boxOf = (tab: Page, id: string) =>
    tab.evaluate((id) => {
      const element = document.getElementById(id);
      if (!element || element.getClientRects().length === 0) return null;
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return { left, right, top, bottom };
    }, id) as Promise<Box | null>;

  /** The box of a bar by its id, in the viewer. */
  const barBox = (tab: Page, id: string) =>
    tab.evaluate((id) => {
      const bar = document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelector(`[data-bar="${id}"]`);
      if (!bar) return null;
      const { left, right, top, bottom } = bar.getBoundingClientRect();
      return { left, right, top, bottom };
    }, id) as Promise<Box | null>;

  const within = (inner: Box | null, outer: Box | null) =>
    inner !== null &&
    outer !== null &&
    inner.left >= outer.left - 0.5 &&
    inner.right <= outer.right + 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.bottom <= outer.bottom + 0.5;

  const contextOf = (tab: Page, id: string) =>
    tab.evaluate((id) => {
      const element = document.getElementById(id)!;
      return {
        orientation: element.getAttribute('data-orientation'),
        edge: element.getAttribute('data-edge'),
        variant: element.getAttribute('data-variant'),
        size: element.getAttribute('data-size'),
      };
    }, id);

  /** A command's label, as the viewer shows it. */
  const labelOf = (tab: Page, id: string) =>
    tab.evaluate(
      (id) => (window as unknown as TestWindow).viewer!.commands.resolveCommand(id)!.label,
      id,
    );

  /** The element that has focus, inside the shadow roots too: its id, or its label. */
  const focused = (tab: Page) =>
    tab.evaluate(() => {
      let active: Element | null = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      const bar = active?.closest('[data-bar]')?.getAttribute('data-bar') ?? null;
      return { id: active?.id || null, label: active?.getAttribute('aria-label') ?? null, bar };
    });

  it('shows an item:<id> element in its bar, saying where it sits, and keeps it live as the bar moves', async () => {
    const tab = await open('/items.html');
    expect(within(await boxOf(tab, 'reviewers'), await barBox(tab, 'main'))).toBe(true);
    expect(await contextOf(tab, 'reviewers')).toEqual({
      orientation: 'horizontal',
      edge: 'top',
      variant: null,
      size: 'expanded',
    });
    // An item with variants of its own is told which one the toolbar picked.
    expect((await contextOf(tab, 'versions')).variant).toBe('full');

    await tab.evaluate(() => {
      document.querySelector<HTMLElement>('embedpdf-viewer')!.style.width = '800px';
    });
    await tab.waitForFunction(
      () => document.getElementById('reviewers')!.getAttribute('data-orientation') === 'vertical',
    );
    expect(await contextOf(tab, 'reviewers')).toEqual({
      orientation: 'vertical',
      edge: 'start',
      variant: null,
      size: 'medium',
    });
    const rail = await barBox(tab, 'main');
    expect(rail!.left).toBe(0);
    expect(within(await boxOf(tab, 'reviewers'), rail)).toBe(true);
    await tab.close();
  });

  it('draws the variant that fits, measured as it draws it, and the larger one again with room', async () => {
    const tab = await open('/variants.html');
    // 700px don't fit beside the main bar's own buttons in 1100: the short form does.
    await tab.waitForFunction(
      () => document.getElementById('sized')!.getAttribute('data-variant') === 'short',
    );
    await frames(tab);
    expect(within(await boxOf(tab, 'sized'), await barBox(tab, 'main'))).toBe(true);
    expect((await contextOf(tab, 'sized')).variant).toBe('short');

    await tab.evaluate(() => {
      document.querySelector<HTMLElement>('embedpdf-viewer')!.style.width = '2200px';
    });
    await tab.waitForFunction(
      () => document.getElementById('sized')!.getAttribute('data-variant') === 'full',
    );
    expect(within(await boxOf(tab, 'sized'), await barBox(tab, 'main'))).toBe(true);
    await tab.close();
  });

  /** The live buttons a bar shows, by their labels: what didn't go to its "More" menu. */
  const buttonsOf = (tab: Page, bar: string) =>
    tab.evaluate(
      (id) =>
        [
          ...document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelectorAll(`[data-bar="${id}"] button`),
        ]
          .filter((button) => !button.closest('[aria-hidden]'))
          .map((button) => button.getAttribute('aria-label') ?? button.textContent ?? ''),
      bar,
    );

  it('gives an item with grow the room its bar has left, at no cost to the rest of the bar', async () => {
    const fixed = await open('/no-grow.html');
    const own = (await boxOf(fixed, 'title'))!;
    const fixedMain = await buttonsOf(fixed, 'main');
    await fixed.close();

    const tab = await open('/grow.html');
    const title = (await boxOf(tab, 'title'))!;
    const bar = (await barBox(tab, 'heading'))!;
    const zoomOut = await tab.evaluate(() => {
      const button = document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelector('[data-bar="heading"] button[aria-label="Zoom Out"]')!;
      return button.getBoundingClientRect().left;
    });
    // From the bar's start to the buttons after it, with the bar's gap between.
    expect(title.right - title.left).toBeGreaterThan(own.right - own.left + 400);
    expect(title.left - bar.left).toBeLessThanOrEqual(24);
    expect(zoomOut - title.right).toBeGreaterThanOrEqual(8 - 0.5);
    expect(zoomOut - title.right).toBeLessThanOrEqual(8 + 0.5);
    // The fit counts it at its own width: the main bar keeps every button it kept without grow.
    expect(await buttonsOf(tab, 'main')).toEqual(fixedMain);
    expect(within(await boxOf(tab, 'note'), await barBox(tab, 'main'))).toBe(true);
    await tab.close();
  });

  it("makes an item's first control its stop in the toolbar's arrow keys", async () => {
    const tab = await open('/items.html');
    await tab.evaluate(() => document.getElementById('first')!.focus());
    await tab.keyboard.press('ArrowLeft');
    const before = await focused(tab);
    expect(before.bar).toBe('main');
    await tab.keyboard.press('ArrowRight');
    expect((await focused(tab)).id).toBe('first');
    // The item's other controls are its own: the toolbar leaves them in the Tab order.
    expect(await tab.evaluate(() => document.getElementById('second')!.tabIndex)).toBe(0);
    await tab.close();
  });

  it('shows the regions where they go, and empty only while no document is open', async () => {
    const tab = await open('/regions.html', false);
    await tab.waitForFunction(() => document.getElementById('empty')!.getClientRects().length > 0);
    const header = (await boxOf(tab, 'header'))!;
    const tabs = (await boxOf(tab, 'tabs'))!;
    const main = (await barBox(tab, 'main'))!;
    const empty = (await boxOf(tab, 'empty'))!;
    const footer = (await boxOf(tab, 'footer'))!;
    expect(header.top).toBe(0);
    expect(tabs.top).toBeGreaterThanOrEqual(header.bottom);
    expect(main.top).toBeGreaterThanOrEqual(tabs.bottom);
    expect(empty.top).toBeGreaterThanOrEqual(main.bottom);
    expect(footer.top).toBeGreaterThanOrEqual(empty.bottom);
    expect(footer.bottom).toBe(HEIGHT);

    await tab.evaluate(() => {
      (document.getElementById('viewer') as HTMLElement & { src: string | null }).src =
        '/sample.pdf';
    });
    await waitForDocument(tab);
    expect(await boxOf(tab, 'empty')).toBeNull();
    expect(await boxOf(tab, 'header')).not.toBeNull();

    await tab.evaluate(() => {
      (document.getElementById('viewer') as HTMLElement & { src: string | null }).src = null;
    });
    await tab.waitForFunction(() => document.getElementById('empty')!.getClientRects().length > 0);
    await tab.close();
  });

  it('shows a panel:<id> body in its panel once the panel opens', async () => {
    const tab = await open('/panel.html');
    expect(await boxOf(tab, 'notes')).toBeNull();
    await tab.evaluate(() =>
      (window as unknown as TestWindow).viewer!.commands.execute('panel:notes'),
    );
    await tab.waitForFunction(() => document.getElementById('notes')!.getClientRects().length > 0);
    const notes = (await boxOf(tab, 'notes'))!;
    // An end panel, beside the pages on the right.
    expect(notes.left).toBeGreaterThan(WIDTH / 2);
    await tab.close();
  });

  it('draws <epdf-button command> as the command: its tooltip, it runs, and its state shows', async () => {
    const tab = await open('/primitives.html');
    const inner = (id: string) =>
      tab.evaluate((id) => {
        const button = document.getElementById(id)!.shadowRoot!.querySelector('button');
        return button
          ? {
              label: button.getAttribute('aria-label'),
              title: button.getAttribute('title'),
              pressed: button.getAttribute('aria-pressed'),
            }
          : null;
      }, id);
    // Its tooltip is the viewer's own, not the browser's.
    expect(await inner('zoom-in')).toMatchObject({
      label: await labelOf(tab, 'zoom:in'),
      title: null,
    });
    expect(within(await boxOf(tab, 'pill'), await barBox(tab, 'main'))).toBe(true);

    const zoom = () =>
      tab.evaluate(() => (window as unknown as TestWindow).viewer!.get('stage').getZoomLevel());
    const before = await zoom();
    await tab.click('#zoom-in');
    await tab.waitForFunction((level) => {
      const viewer = (window as unknown as TestWindow).viewer!;
      return viewer.get('stage').getZoomLevel() > level;
    }, before);

    expect((await inner('pan'))!.pressed).toBeNull();
    await tab.click('#pan');
    await tab.waitForFunction(
      () =>
        document
          .getElementById('pan')!
          .shadowRoot!.querySelector('button')
          ?.getAttribute('aria-pressed') === 'true',
    );

    // A button of your own: its click is yours.
    expect((await inner('mine'))!.label).toBe('Mine');
    await tab.evaluate(() => {
      document.getElementById('mine')!.addEventListener('click', () => {
        (window as unknown as TestWindow).clicks += 1;
      });
    });
    await tab.click('#mine');
    expect(await tab.evaluate(() => (window as unknown as TestWindow).clicks)).toBe(1);
    await tab.close();
  });

  it('opens <epdf-menu> like the viewer’s menus and fires select on the row picked', async () => {
    const tab = await open('/primitives.html');
    const menu = () =>
      tab.evaluate(() => {
        const surface = document
          .getElementById('share')!
          .shadowRoot!.querySelector<HTMLElement>('[role="menu"]');
        if (!surface) return null;
        const { top, bottom } = surface.getBoundingClientRect();
        return {
          inTopLayer: surface.matches(':popover-open'),
          // Each row's text, without its shortcut.
          rows: [...surface.querySelectorAll('[role^="menuitem"] .truncate')].map((label) =>
            label.textContent?.trim(),
          ),
          top,
          bottom,
        };
      });
    await tab.click('#share');
    await tab.waitForFunction(
      () => document.getElementById('share')!.shadowRoot!.querySelector('[role="menu"]') !== null,
    );
    const opened = (await menu())!;
    expect(opened.inTopLayer).toBe(true);
    expect(opened.rows).toEqual(['Copy link', await labelOf(tab, 'zoom:out'), 'Show notes']);
    // Below its button in a top bar.
    expect(opened.top).toBeGreaterThanOrEqual((await boxOf(tab, 'share'))!.bottom);

    await tab.evaluate(() => {
      const rows = document
        .getElementById('share')!
        .shadowRoot!.querySelectorAll<HTMLElement>('[role^="menuitem"]');
      rows[0]!.click();
    });
    expect(await tab.evaluate(() => (window as unknown as TestWindow).selected)).toEqual(['copy']);
    expect(await menu()).toBeNull();
    await tab.close();

    // From a bottom bar it opens upward.
    const bottom = await open('/primitives-bottom.html');
    await bottom.click('#share');
    await bottom.waitForFunction(
      () => document.getElementById('share')!.shadowRoot!.querySelector('[role="menu"]') !== null,
    );
    const share = (await boxOf(bottom, 'share'))!;
    const upward = await bottom.evaluate(
      () =>
        document
          .getElementById('share')!
          .shadowRoot!.querySelector('[role="menu"]')!
          .getBoundingClientRect().bottom,
    );
    expect(upward).toBeLessThanOrEqual(share.top);
    await bottom.close();
  });

  it('shows <epdf-button active> pressed and <epdf-menu-item active> checked, as they change', async () => {
    const tab = await open('/primitives.html');
    const night = () =>
      tab.evaluate(() => {
        const button = document.getElementById('night')!.shadowRoot!.querySelector('button')!;
        return { pressed: button.getAttribute('aria-pressed'), part: button.getAttribute('part') };
      });
    expect(await night()).toEqual({
      pressed: 'true',
      part: 'toolbar-button toolbar-button-active',
    });
    // The property sets the attribute, and the viewer follows it.
    await tab.evaluate(() => {
      (document.getElementById('night') as HTMLElement & { active: boolean }).active = false;
    });
    await tab.waitForFunction(() => !document.getElementById('night')!.hasAttribute('active'));
    await frames(tab);
    expect(await night()).toEqual({ pressed: null, part: 'toolbar-button' });
    await tab.evaluate(() => document.getElementById('night')!.toggleAttribute('active', true));
    await frames(tab);
    expect((await night()).pressed).toBe('true');

    const row = () =>
      tab.evaluate(() => {
        const rows = [
          ...document
            .getElementById('share')!
            .shadowRoot!.querySelectorAll<HTMLElement>('[role^="menuitem"]'),
        ];
        const notes = rows.find((each) => each.textContent?.includes('Show notes'))!;
        return {
          role: notes.getAttribute('role'),
          checked: notes.getAttribute('aria-checked'),
          part: notes.getAttribute('part'),
        };
      });
    await tab.click('#share');
    await tab.waitForFunction(
      () => document.getElementById('share')!.shadowRoot!.querySelector('[role="menu"]') !== null,
    );
    expect(await row()).toEqual({
      role: 'menuitemcheckbox',
      checked: 'true',
      part: 'menu-item menu-item-active',
    });
    await tab.evaluate(() => document.getElementById('notes')!.removeAttribute('active'));
    await frames(tab);
    expect(await row()).toEqual({ role: 'menuitem', checked: null, part: 'menu-item' });
    await tab.close();
  });

  it("draws <epdf-icon>: the viewer's icon or the app's, at its size, read only with a label", async () => {
    const tab = await open('/primitives.html');
    const icon = (id: string) =>
      tab.evaluate((id) => {
        const host = document.getElementById(id)!;
        const svg = host.shadowRoot!.querySelector('svg');
        if (!svg) return null;
        const { width, height } = svg.getBoundingClientRect();
        return {
          width,
          height,
          hidden: svg.getAttribute('aria-hidden'),
          name: svg.getAttribute('aria-label'),
          filled: svg.querySelector('path')?.getAttribute('fill') ?? null,
          color: getComputedStyle(svg).color === getComputedStyle(host).color,
          tabIndex: host.tabIndex,
        };
      }, id);
    await tab.waitForFunction(
      () => document.getElementById('seal')!.shadowRoot?.querySelector('svg') != null,
    );
    expect(await icon('check')).toEqual({
      width: 20,
      height: 20,
      hidden: 'true',
      name: null,
      // Drawn as a line: the path has no fill of its own.
      filled: null,
      color: true,
      tabIndex: -1,
    });
    // The app's own icon, by its name in `icons`, filled; with a label, screen readers read it.
    expect(await icon('seal')).toEqual({
      width: 16,
      height: 16,
      hidden: null,
      name: 'Approved',
      filled: 'currentColor',
      color: true,
      tabIndex: -1,
    });
    await tab.evaluate(() => document.getElementById('check')!.setAttribute('name', 'x'));
    await frames(tab);
    expect(
      await tab.evaluate(() =>
        document.getElementById('check')!.shadowRoot!.querySelector('path')!.getAttribute('d'),
      ),
    ).toBe('M18 6l-12 12');
    await tab.close();
  });

  it("gives <epdf-button> the viewer's tooltip, in the element's own shadow root", async () => {
    const tab = await open('/primitives.html');
    const box = (await boxOf(tab, 'mine'))!;
    await tab.mouse.move((box.left + box.right) / 2, (box.top + box.bottom) / 2);
    await tab.waitForFunction(() =>
      document
        .getElementById('mine')!
        .shadowRoot!.querySelector('[role="tooltip"]')
        ?.matches(':popover-open'),
    );
    const tooltip = await tab.evaluate(() => {
      const root = document.getElementById('mine')!.shadowRoot!;
      const tip = root.querySelector<HTMLElement>('[role="tooltip"]')!;
      const { top } = tip.getBoundingClientRect();
      return { text: tip.textContent?.trim(), top, part: tip.getAttribute('part') };
    });
    expect(tooltip).toMatchObject({ text: 'Mine', part: 'tooltip' });
    // Below its button in a top bar.
    expect(tooltip.top).toBeGreaterThanOrEqual(box.bottom);
    await tab.close();
  });

  it("keeps the viewer's own components on the toolbar's arrow keys, out of the Tab order", async () => {
    const tab = await open('/primitives.html');
    // The solo button is its item's stop: an arrow reaches it, and Tab passes it while it isn't
    // the bar's tab stop.
    await tab.evaluate(() => document.getElementById('solo')!.focus());
    expect((await focused(tab)).label).toBe(await labelOf(tab, 'zoom:in'));
    await tab.keyboard.press('ArrowLeft');
    await tab.keyboard.press('ArrowRight');
    expect(await tab.evaluate(() => document.activeElement?.id)).toBe('solo');
    expect(await tab.evaluate(() => document.getElementById('share')!.tabIndex)).toBe(-1);
    // Back with Tab: past the menu's button, to the last control of the item before it.
    await tab.keyboard.press('Shift+Tab');
    expect(await tab.evaluate(() => document.activeElement?.id)).toBe('mine');
    await tab.close();
  });

  it('makes the zoom field one Tab stop, its buttons on the arrow keys', async () => {
    const tab = await open('/default.html');
    const zoomButton = (label: string) =>
      tab.evaluate((label) => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const bar = root.querySelector('[data-bar="main"]')!;
        const button = [...bar.querySelectorAll<HTMLElement>('[data-epdf-toolbar-item] button')]
          .filter((candidate) => !candidate.closest('[aria-hidden="true"]'))
          .find((candidate) => candidate.getAttribute('aria-label') === label)!;
        return button.tabIndex;
      }, label);
    expect(await zoomButton('Zoom Out')).toBe(-1);
    expect(await zoomButton('Zoom In')).toBe(-1);
    expect(await zoomButton('Zoom')).toBe(-1);

    await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      root.querySelector<HTMLInputElement>('[data-bar="main"] input[name="zoom"]')!.focus();
    });
    await tab.keyboard.press('Tab');
    expect((await focused(tab)).bar).not.toBe('main');

    await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      [...root.querySelectorAll<HTMLElement>('[data-bar="main"] button[aria-label="Zoom In"]')]
        .find((button) => !button.closest('[aria-hidden="true"]'))!
        .focus();
    });
    await tab.keyboard.press('ArrowLeft');
    expect((await focused(tab)).label).toBe('Zoom Out');
    await tab.close();
  });
});
