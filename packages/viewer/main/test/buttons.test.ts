/**
 * The viewer's buttons in a running viewer: their tooltips (the label, the shortcut the way the
 * platform writes it, the reason a button is greyed out; after a moment under the pointer, at
 * once on focus from the keyboard, never from a touch; in the top layer, in the theme's colors
 * and font, away from the bar's edge; described by for screen readers; Escape hides them; no
 * browser `title`, in a bar, a panel, a dialog or a tab), a greyed-out menu row's reason, text cut
 * short shown whole, a primary button, and a part per bar.
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

/** A page with `<embedpdf-viewer>` given `config` (a script expression), and the page's `css`. */
const page = (config = '{}', css = '') =>
  `<!doctype html><html><head><meta charset="utf-8">
<title>buttons</title>
<style>
  body { margin: 0; }
  embedpdf-viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
  ${css}
</style></head>
<body>
<button id="before">Before</button>
<embedpdf-viewer id="viewer" src="/sample.pdf"></embedpdf-viewer>
<script type="module">
  import '/embedpdf.js';
  const element = document.getElementById('viewer');
  element.addEventListener('epdf:ready', (event) => { window.viewer = event.detail.viewer; });
  element.config = ${config};
</script>
</body></html>`;

/** Print in the main bar, for a user whose scope doesn't allow it, shown greyed out. */
const SCOPED = `{
  scope: ['doc.open', 'doc.render', 'doc.text.select'],
  notAllowed: 'disable',
  layout: (layout) => layout.add('document:print', { to: 'main', section: 'end' }),
}`;

/** A command of yours with a shortcut, in the main bar. */
const APPROVE = `{
  commands: [
    { id: 'acme:approve', label: 'Approve', icon: 'check', shortcut: 'Mod+Enter', run: () => {} },
  ],
  layout: (layout) => layout.add('acme:approve', { to: 'main', section: 'end' }),
}`;

const PAGES = {
  '/top.html': page(APPROVE),
  '/bottom.html': page(`{ layout: (layout) => layout.place('main', 'bottom') }`),
  '/start.html': page(`{ layout: (layout) => layout.place('main', 'start') }`),
  '/themed.html': page(
    `{ theme: { tokens: { tooltip: 'rgb(10, 20, 30)', 'tooltip-text': 'rgb(200, 210, 220)', font: 'serif' } } }`,
  ),
  '/scoped.html': page(SCOPED),
  '/primary.html': page(
    `{
      layout: (layout) =>
        layout.add(
          { command: 'document:download', emphasis: 'primary', variants: ['icon+label', 'icon'] },
          { to: 'main', section: 'end' },
        ),
    }`,
    `embedpdf-viewer::part(toolbar-main) { background: rgb(1, 2, 3); }
     embedpdf-viewer::part(toolbar-pager) { outline: 3px solid rgb(4, 5, 6); }`,
  ),
};

/** What the page's script keeps on `window`. */
type TestWindow = Window & {
  viewer?: {
    commands: {
      resolveCommand(id: string): { label: string; disabledReason?: string } | null;
      execute(id: string, options?: { args?: unknown }): Promise<unknown>;
    };
  };
};

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface Tooltip {
  readonly text: string;
  readonly id: string;
  readonly box: Box;
  readonly inTopLayer: boolean;
  readonly background: string;
  readonly color: string;
  readonly font: string;
  /** `none` for one shown for the keyboard's focus: presses go through it. */
  readonly pointerEvents: string;
  /** The parts screen readers leave out: the words that are its button's name already. */
  readonly hidden: readonly string[];
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))("the viewer's buttons", () => {
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

  const open = async (path: string, options: { hasTouch?: boolean } = {}): Promise<Page> => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      hasTouch: options.hasTouch ?? false,
    });
    const tab = await context.newPage();
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await tab.waitForFunction(() => (window as unknown as TestWindow).viewer !== undefined);
    await frames(tab);
    return tab;
  };

  const close = (tab: Page) => tab.context().close();

  /** A command's label, as the viewer shows it. */
  const labelOf = (tab: Page, id: string) =>
    tab.evaluate(
      (id) => (window as unknown as TestWindow).viewer!.commands.resolveCommand(id)!.label,
      id,
    );

  /** The live button labelled `label` in `scope` (a CSS selector): its box and what it says. */
  const buttonOf = (tab: Page, label: string, scope = '[data-bar="main"]') =>
    tab.evaluate(
      ([name, within]) => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const button = [...root.querySelectorAll(`${within} [aria-label="${name}"]`)].find(
          (candidate) => !candidate.closest('[aria-hidden="true"]'),
        );
        if (!button) return null;
        const { left, right, top, bottom } = button.getBoundingClientRect();
        return {
          box: { left, right, top, bottom },
          title: button.getAttribute('title'),
          describedBy: button.getAttribute('aria-describedby'),
          part: button.getAttribute('part'),
          background: getComputedStyle(button).backgroundColor,
          color: getComputedStyle(button).color,
        };
      },
      [label, scope] as const,
    );

  /** The tooltip showing now, or null. */
  const tooltipOf = (tab: Page) =>
    tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const tip = [...root.querySelectorAll<HTMLElement>('[role="tooltip"]')].find(
        (candidate) => candidate.isConnected,
      );
      if (!tip) return null;
      const { left, right, top, bottom } = tip.getBoundingClientRect();
      const style = getComputedStyle(tip);
      return {
        text: tip.textContent!.replace(/\s+/g, ' ').trim(),
        id: tip.id,
        box: { left, right, top, bottom },
        inTopLayer: tip.matches(':popover-open'),
        background: style.backgroundColor,
        color: style.color,
        font: style.fontFamily,
        pointerEvents: style.pointerEvents,
        hidden: [...tip.querySelectorAll('[aria-hidden="true"]')].map(
          (part) => part.textContent ?? '',
        ),
      };
    }) as Promise<Tooltip | null>;

  const waitForTooltip = (tab: Page, timeout = 3000) =>
    tab.waitForFunction(
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[role="tooltip"]')
          ?.matches(':popover-open') === true,
      null,
      { timeout },
    );

  const waitForNoTooltip = (tab: Page) =>
    tab.waitForFunction(
      () =>
        document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelector('[role="tooltip"]') ===
        null,
    );

  const centerOf = (box: Box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

  /** Rest the pointer on the button labelled `label`. */
  const hover = async (tab: Page, label: string, scope?: string) => {
    const button = (await buttonOf(tab, label, scope))!;
    const { x, y } = centerOf(button.box);
    await tab.mouse.move(x, y);
    return button;
  };

  const isMac = (tab: Page) => tab.evaluate(() => /Mac|iP(hone|ad|od)/.test(navigator.platform));

  it('shows the label and the shortcut after the pointer rests a moment, below a top bar', async () => {
    const tab = await open('/top.html');
    const button = await hover(tab, 'Approve');
    // Not at once.
    expect(await tooltipOf(tab)).toBeNull();
    await waitForTooltip(tab);
    const tooltip = (await tooltipOf(tab))!;
    // The shortcut the way the platform writes it.
    expect(tooltip.text).toBe((await isMac(tab)) ? 'Approve ⌘↩' : 'Approve Ctrl+Enter');
    expect(tooltip.inTopLayer).toBe(true);
    expect(tooltip.box.top).toBeGreaterThanOrEqual(button.box.bottom);
    // Centered on its button.
    expect(
      Math.abs(
        (tooltip.box.left + tooltip.box.right) / 2 - (button.box.left + button.box.right) / 2,
      ),
    ).toBeLessThan(1);

    // The button names it while it shows, and the browser's tooltip is gone.
    const described = (await buttonOf(tab, 'Approve'))!;
    expect(described.title).toBeNull();
    expect(described.describedBy).toBe(tooltip.id);
    // The label is the button's name already: screen readers hear the shortcut.
    expect(tooltip.hidden).toEqual(['Approve']);

    // Gone once the pointer leaves, and the button no longer names it.
    await tab.mouse.move(600, 400);
    await waitForNoTooltip(tab);
    expect((await buttonOf(tab, 'Approve'))!.describedBy).toBeNull();
    await close(tab);
  });

  it('shows the label alone for a button without a shortcut, with nothing more to describe', async () => {
    const tab = await open('/top.html');
    const pan = await labelOf(tab, 'tool:pan');
    await hover(tab, pan);
    await waitForTooltip(tab);
    expect((await tooltipOf(tab))!.text).toBe(pan);
    expect((await buttonOf(tab, pan))!.describedBy).toBeNull();
    await close(tab);
  });

  it('writes a built-in shortcut the way the platform does', async () => {
    const tab = await open('/top.html');
    const zoomIn = await labelOf(tab, 'zoom:in');
    await hover(tab, zoomIn);
    await waitForTooltip(tab);
    const shortcut = (await isMac(tab)) ? '⌘=' : 'Ctrl+=';
    expect((await tooltipOf(tab))!.text).toBe(`${zoomIn} ${shortcut}`);
    await close(tab);
  });

  it('moves along a bar at once, one tooltip at a time', async () => {
    const tab = await open('/top.html');
    const zoomIn = await labelOf(tab, 'zoom:in');
    const zoomOut = await labelOf(tab, 'zoom:out');
    await hover(tab, zoomIn);
    await waitForTooltip(tab);
    await hover(tab, zoomOut);
    // Sooner than the wait a first tooltip has.
    await waitForTooltip(tab, 450);
    expect((await tooltipOf(tab))!.text.startsWith(zoomOut)).toBe(true);
    expect(
      await tab.evaluate(
        () =>
          document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelectorAll('[role="tooltip"]').length,
      ),
    ).toBe(1);
    await close(tab);
  });

  it('shows at once when a button gets focus from the keyboard, and Escape hides it', async () => {
    const tab = await open('/top.html');
    await tab.focus('#before');
    await tab.keyboard.press('Tab');
    // The pointer is nowhere near: focus showed it (at once: tooltip-timing.test.ts), and presses
    // go through it.
    await waitForTooltip(tab);
    const first = (await tooltipOf(tab))!;
    expect(first.pointerEvents).toBe('none');
    const focused = await tab.evaluate(() => {
      let active: Element | null = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active?.getAttribute('aria-label') ?? null;
    });
    expect(focused).not.toBeNull();
    expect(first.text.startsWith(focused!)).toBe(true);

    // The next button's, at once.
    await tab.keyboard.press('ArrowRight');
    await tab.waitForFunction(
      (before) =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[role="tooltip"]')
          ?.textContent?.trim() !== before,
      first.text,
      { timeout: 450 },
    );

    await tab.keyboard.press('Escape');
    await waitForNoTooltip(tab);
    await close(tab);
  });

  it('never shows from a touch', async () => {
    const tab = await open('/top.html', { hasTouch: true });
    const pan = await labelOf(tab, 'tool:pan');
    const button = (await buttonOf(tab, pan))!;
    const { x, y } = centerOf(button.box);
    await tab.touchscreen.tap(x, y);
    await tab.waitForTimeout(1000);
    expect(await tooltipOf(tab)).toBeNull();
    await close(tab);
  });

  it('opens away from the edge its bar sits on', async () => {
    const bottom = await open('/bottom.html');
    const pan = await labelOf(bottom, 'tool:pan');
    const low = await hover(bottom, pan);
    await waitForTooltip(bottom);
    expect((await tooltipOf(bottom))!.box.bottom).toBeLessThanOrEqual(low.box.top);
    await close(bottom);

    const start = await open('/start.html');
    const left = await hover(start, pan);
    await waitForTooltip(start);
    expect((await tooltipOf(start))!.box.left).toBeGreaterThanOrEqual(left.box.right);
    await close(start);
  });

  it("draws in the theme's tooltip colors and font", async () => {
    const plain = await open('/top.html');
    const pan = await labelOf(plain, 'tool:pan');
    await hover(plain, pan);
    await waitForTooltip(plain);
    // The other mode's colors by default: the text color behind, the surface's for the words.
    expect(await tooltipOf(plain)).toMatchObject({
      background: 'rgb(17, 24, 39)',
      color: 'rgb(255, 255, 255)',
    });
    await close(plain);

    const themed = await open('/themed.html');
    await hover(themed, pan);
    await waitForTooltip(themed);
    expect(await tooltipOf(themed)).toMatchObject({
      background: 'rgb(10, 20, 30)',
      color: 'rgb(200, 210, 220)',
      font: 'serif',
    });
    await close(themed);
  });

  it('says why a button is greyed out, and a greyed-out menu row too, beside it', async () => {
    const tab = await open('/scoped.html');
    const print = await labelOf(tab, 'document:print');
    const reason = await tab.evaluate(
      () =>
        (window as unknown as TestWindow).viewer!.commands.resolveCommand('document:print')!
          .disabledReason,
    );
    expect(reason).toBeTruthy();
    await hover(tab, print);
    await waitForTooltip(tab);
    const tooltip = (await tooltipOf(tab))!;
    expect(tooltip.text.startsWith(print)).toBe(true);
    expect(tooltip.text.endsWith(reason!)).toBe(true);
    // The reason is read with the button.
    expect(tooltip.hidden).toEqual([print]);
    await tab.mouse.move(600, 400);
    await waitForNoTooltip(tab);

    // The document menu's Print row, greyed out: why, beside the row.
    const menuButton = (await buttonOf(tab, await labelOf(tab, 'menu:document')))!;
    await tab.mouse.click(centerOf(menuButton.box).x, centerOf(menuButton.box).y);
    const row = await tab.evaluate((label) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const rows = [...root.querySelectorAll('[role="menu"] [role^="menuitem"]')];
      const found = rows.find((each) => each.querySelector('.truncate')?.textContent === label)!;
      const { left, right, top, bottom } = found.getBoundingClientRect();
      return { left, right, top, bottom, title: found.getAttribute('title') };
    }, print);
    expect(row.title).toBeNull();
    await tab.mouse.move((row.left + row.right) / 2, (row.top + row.bottom) / 2);
    await waitForTooltip(tab);
    const beside = (await tooltipOf(tab))!;
    // The row shows its label and shortcut itself: the reason is what it adds.
    expect(beside.text).toBe(`${print} ${reason}`);
    expect(beside.box.left >= row.right - 0.5 || beside.box.right <= row.left + 0.5).toBe(true);
    await close(tab);
  });

  it('draws a primary button filled in the accent, and gives each bar a part of its own', async () => {
    const tab = await open('/primary.html');
    const download = await labelOf(tab, 'document:download');
    const button = (await buttonOf(tab, download))!;
    expect(button.part).toBe('toolbar-button toolbar-button-primary');
    expect(button.background).toBe('rgb(59, 130, 246)');
    expect(button.color).toBe('rgb(255, 255, 255)');

    const bars = await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const main = root.querySelector('[data-bar="main"]')!;
      const pill = root.querySelector('[data-bar="pager"] [part~="toolbar"]')!;
      return {
        main: main.getAttribute('part'),
        mainBackground: getComputedStyle(main).backgroundColor,
        pill: pill.getAttribute('part'),
        pillOutline: getComputedStyle(pill).outlineColor,
      };
    });
    expect(bars).toEqual({
      main: 'toolbar toolbar-main',
      mainBackground: 'rgb(1, 2, 3)',
      pill: 'toolbar toolbar-pager',
      pillOutline: 'rgb(4, 5, 6)',
    });
    await close(tab);
  });
  /** Run a command of the viewer's, with its `args`. */
  const execute = (tab: Page, id: string, args?: unknown) =>
    tab.evaluate(
      ([command, given]) =>
        (window as unknown as TestWindow).viewer!.commands.execute(command, { args: given }),
      [id, args] as const,
    );

  /** Every element with a browser `title` in the viewer, but the page number's (its own agent's). */
  const titled = (tab: Page) =>
    tab.evaluate(() =>
      [...document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelectorAll('[title]')]
        .filter((element) => !element.closest('[data-bar="pager"]'))
        .map((element) => `${element.localName}: ${element.getAttribute('title')}`),
    );

  it('leaves no browser title in the panels, the shortcuts sheet or the tabs', async () => {
    const tab = await open('/top.html');
    expect(await titled(tab)).toEqual([]);
    for (const panel of ['thumbnails', 'search', 'comments', 'attachments', 'outline']) {
      await execute(tab, `panel:${panel}`);
      await tab.waitForFunction(
        (id) =>
          document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelector(`[data-epdf-panel="${id}"]`) !== null,
        panel,
      );
      await frames(tab);
      expect(await titled(tab), panel).toEqual([]);
    }
    await execute(tab, 'help:shortcuts');
    await tab.waitForFunction(
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-epdf-shortcuts]') !== null,
    );
    expect(await titled(tab)).toEqual([]);
    await close(tab);
  });

  it("gives a panel's buttons the viewer's tooltip", async () => {
    const tab = await open('/top.html');
    await execute(tab, 'panel:thumbnails');
    const scope = '[data-epdf-panel="thumbnails"]';
    await tab.waitForFunction(
      (within) =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector(`${within} [aria-label="Page 2"]`) !== null,
      scope,
    );
    await frames(tab);
    const page = await hover(tab, 'Page 2', scope);
    await waitForTooltip(tab);
    const tooltip = (await tooltipOf(tab))!;
    expect(tooltip.text).toBe('Page 2');
    expect(tooltip.inTopLayer).toBe(true);
    expect(tooltip.box.top).toBeGreaterThanOrEqual(page.box.bottom);
    // Its words are the button's name: nothing more to describe.
    expect((await buttonOf(tab, 'Page 2', scope))!.describedBy).toBeNull();
    await close(tab);
  });

  it('shows a name cut short whole in its tooltip, and only while it is cut short', async () => {
    const tab = await open('/top.html');
    const long = `${'A quarterly report with a very long name '.repeat(3).trim()}.pdf`;
    // The panel first: attaching files with it closed opens it, and its command would close it.
    await execute(tab, 'panel:attachments');
    await tab.waitForFunction(
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-epdf-panel="attachments"]') !== null,
    );
    await tab.evaluate(
      ([first, second]) =>
        (window as unknown as TestWindow).viewer!.commands.execute('attachment:add', {
          args: { files: [new File(['%PDF'], first), new File(['%PDF'], second)] },
        }),
      [long, 'notes.txt'] as const,
    );
    const rowOf = (name: string) =>
      tab.evaluate((wanted) => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const row = [...root.querySelectorAll('[data-epdf-panel="attachments"] li button')].find(
          (button) => button.querySelector('bdi')?.textContent === wanted,
        );
        if (!row) return null;
        const { left, right, top, bottom } = row.getBoundingClientRect();
        return { left, right, top, bottom };
      }, name);
    await tab.waitForFunction(
      (wanted) =>
        [
          ...document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelectorAll('[data-epdf-panel="attachments"] bdi'),
        ].some((bdi) => bdi.textContent === wanted),
      'notes.txt',
    );
    await frames(tab);

    const short = (await rowOf('notes.txt'))!;
    await tab.mouse.move(...(Object.values(centerOf(short)) as [number, number]));
    await tab.waitForTimeout(1000);
    expect(await tooltipOf(tab)).toBeNull();

    const cut = (await rowOf(long))!;
    await tab.mouse.move(...(Object.values(centerOf(cut)) as [number, number]));
    await waitForTooltip(tab);
    const tooltip = (await tooltipOf(tab))!;
    expect(tooltip.text).toBe(long);
    // The name is on screen already: screen readers aren't told it twice.
    expect(tooltip.hidden).toEqual([long]);
    await close(tab);
  });
});
