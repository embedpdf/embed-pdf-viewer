/**
 * Theming from the page: a `--epdf-*` variable set on `<embedpdf-viewer>` or
 * on any element around it wins, in light and in dark, over the viewer's own
 * default and over the `theme` config (`accent`, `tokens`, `dark`); with no
 * page CSS the config, or else the viewer's default, applies. The chrome (a
 * pressed toolbar button) and the parts drawn on the pages (the text
 * selection) always agree. Every token the Theming page lists paints the
 * chrome, and every part it lists takes the page's `::part()` rules.
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

const CONFIGS = {
  light: 'light',
  dark: 'dark',
  accent: { preference: 'light', accent: '#7c3aed' },
  tokens: { preference: 'light', tokens: { accent: '#0f6e56', surface: '#fbfaf7', radius: '2px' } },
  'dark-tokens': {
    preference: 'dark',
    tokens: { accent: '#0f6e56', radius: '2px' },
    dark: { accent: '#7dd3fc', surface: '#16201c' },
  },
} as const;

const page = (
  theme: unknown,
) => `<!doctype html><html><head><meta charset="utf-8"><title>theming</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 24px; top: 72px; width: 860px; height: 600px; }
</style></head>
<body>
<div id="around"><div id="viewer"></div></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: ${JSON.stringify(theme)} });
</script>
</body></html>`;

/** Open a config's page and select the document's title, so its highlight is drawn. */
async function open(browser: Browser, url: string): Promise<Page> {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.goto(url);
  await waitForDocument(tab);
  // Wait for the first page's text, then drag across the title.
  await tab.waitForTimeout(1500);
  await tab.mouse.move(310, 196);
  await tab.mouse.down();
  await tab.mouse.move(450, 196, { steps: 5 });
  await tab.mouse.move(600, 196, { steps: 5 });
  await tab.mouse.up();
  await tab.mouse.move(0, 0);
  await frames(tab);
  return tab;
}

/**
 * The accent as each side draws it, beside what `accent` would give: the color of the pressed
 * toolbar button, and the fill of the text selection (the accent at 35%).
 */
const accents = (tab: Page, accent: string) =>
  tab.evaluate((expected) => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const pressed = root.querySelector('[part~="toolbar-button-active"]');
    const selected = [...root.querySelectorAll<SVGElement>('svg polygon')].find((polygon) =>
      polygon.style.fill.includes('--epdf-text-selection'),
    );
    // The same colors, as the browser computes them.
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    probe.append(shape);
    document.body.append(probe);
    shape.style.color = expected;
    shape.style.fill = `color-mix(in srgb, ${expected} 35%, transparent)`;
    const want = { button: getComputedStyle(shape).color, selection: getComputedStyle(shape).fill };
    probe.remove();
    return {
      got: {
        button: pressed ? getComputedStyle(pressed).color : 'no pressed button',
        selection: selected ? getComputedStyle(selected).fill : 'no text selection',
      },
      want,
    };
  }, accent);

/** Set (or clear) a page rule, as the page's own stylesheet. */
const pageCss = (tab: Page, css: string) =>
  tab.evaluate((text) => {
    let style = document.getElementById('page-theme');
    if (!style) {
      style = document.createElement('style');
      style.id = 'page-theme';
      document.head.append(style);
    }
    style.textContent = text;
  }, css);

/** A value for every token but the accent, none of them a default. */
const PAGE_TOKENS = {
  background: 'rgb(250, 240, 230)',
  surface: 'rgb(240, 250, 230)',
  'surface-raised': 'rgb(230, 240, 250)',
  text: 'rgb(60, 20, 20)',
  'text-muted': 'rgb(20, 60, 20)',
  border: 'rgb(20, 20, 160)',
  hover: 'rgb(200, 180, 120)',
  canvas: 'rgb(120, 140, 160)',
  radius: '3px',
  font: 'serif',
} as const;

type Look = Record<keyof typeof PAGE_TOKENS, string | undefined>;

/**
 * Where the chrome shows each token: the viewer's background, the main bar (its surface, text and
 * line), the bar over the selected text (a raised surface), the pages' canvas, a button's corners
 * and font, and, under the pointer, a button (the hover) and a mode tab's line (muted text).
 */
async function lookOf(tab: Page): Promise<Look> {
  const look = await tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const style = (element: Element | null | undefined) =>
      element ? getComputedStyle(element) : null;
    const bar = root.querySelector('[data-bar="main"]');
    const button = root.querySelector('[data-bar="main"] [part="toolbar-button"]');
    const selectionBar = [...root.querySelectorAll('[role="toolbar"][part="toolbar"]')].find(
      (element) => element.parentElement?.hasAttribute('data-placement'),
    );
    return {
      background: style(root.querySelector('[data-embedpdf-root] > div'))?.backgroundColor,
      surface: style(bar)?.backgroundColor,
      'surface-raised': style(selectionBar)?.backgroundColor,
      text: style(bar)?.color,
      border: style(bar)?.borderBottomColor,
      canvas: style(root.querySelector('[style*="--epdf-canvas"]'))?.backgroundColor,
      radius: style(button)?.borderTopLeftRadius,
      font: style(button)?.fontFamily,
    };
  });
  /** A style of the first button `selector` finds, with the pointer over it. */
  const hovered = async (selector: string, property: 'backgroundColor' | 'borderBottomColor') => {
    const box = await tab.evaluate((within) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const element = [...root.querySelectorAll(within)].find(
        (candidate) => !candidate.closest('[aria-hidden="true"]'),
      );
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    }, selector);
    if (!box) return undefined;
    await tab.mouse.move(box.x, box.y);
    // Buttons fade between colors: read once they arrive.
    await tab.waitForTimeout(400);
    const value = await tab.evaluate(
      ([at, name]) => {
        const button = document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.elementFromPoint(at.x, at.y)!
          .closest('button')!;
        return getComputedStyle(button)[name];
      },
      [box, property] as const,
    );
    await tab.mouse.move(0, 0);
    return value;
  };
  return {
    ...look,
    hover: await hovered('[data-bar="main"] [part="toolbar-button"]', 'backgroundColor'),
    'text-muted': await hovered('[data-bar="main"] [part="mode-tab"]', 'borderBottomColor'),
  };
}

describe('theming from the page', () => {
  let host: ViewerHost;
  let browser: Browser;
  const tabs = new Map<keyof typeof CONFIGS, Page>();

  beforeAll(async () => {
    expect(existsSync(join(dist, 'embedpdf.js')), 'run `pnpm build` first').toBe(true);
    host = await serveViewer(
      Object.fromEntries(
        Object.entries(CONFIGS).map(([name, theme]) => [`/${name}.html`, page(theme)]),
      ),
    );
    browser = await launchChromium();
    for (const name of Object.keys(CONFIGS) as Array<keyof typeof CONFIGS>) {
      tabs.set(name, await open(browser, `${host.origin}/${name}.html`));
    }
  });
  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const expectAccent = async (name: keyof typeof CONFIGS, accent: string) => {
    const tab = tabs.get(name)!;
    await tab.bringToFront();
    // The toolbar's buttons fade between colors: read them once they arrive.
    await tab.waitForTimeout(400);
    const { got, want } = await accents(tab, accent);
    expect(got, `${name}: ${accent}`).toEqual(want);
  };

  it("uses the viewer's default accent for its mode, in the chrome and on the pages, without page CSS", async () => {
    await expectAccent('light', '#3b82f6');
    await expectAccent('dark', '#60a5fa');
  });

  it('uses the config tokens without page CSS, the dark ones in dark', async () => {
    await expectAccent('tokens', '#0f6e56');
    await expectAccent('dark-tokens', '#7dd3fc');
  });

  it('takes theme.accent as the accent', async () => {
    await expectAccent('accent', '#7c3aed');
  });

  it('takes a variable set around the viewer over its default and its config, in light and dark', async () => {
    for (const name of Object.keys(CONFIGS) as Array<keyof typeof CONFIGS>) {
      await pageCss(tabs.get(name)!, '#around { --epdf-accent: #e91e63; }');
      await expectAccent(name, '#e91e63');
    }
  });

  it('takes a variable set on the element over one set around it, in light and dark', async () => {
    for (const name of Object.keys(CONFIGS) as Array<keyof typeof CONFIGS>) {
      await pageCss(
        tabs.get(name)!,
        '#around { --epdf-accent: #e91e63; } embedpdf-viewer { --epdf-accent: #7c3aed; }',
      );
      await expectAccent(name, '#7c3aed');
    }
  });

  it("paints the chrome in its own tokens for its mode, or the config's, without page CSS", async () => {
    for (const name of Object.keys(CONFIGS) as Array<keyof typeof CONFIGS>) {
      await pageCss(tabs.get(name)!, '');
    }
    const light = await lookOf(tabs.get('light')!);
    expect(light).toMatchObject({ surface: 'rgb(255, 255, 255)', radius: '6px' });
    expect(light.font).toMatch(/^ui-sans-serif/);
    expect(await lookOf(tabs.get('dark')!)).toMatchObject({ surface: 'rgb(31, 41, 55)' });
    expect(await lookOf(tabs.get('tokens')!)).toMatchObject({
      surface: 'rgb(251, 250, 247)',
      radius: '2px',
    });
    expect(await lookOf(tabs.get('dark-tokens')!)).toMatchObject({
      surface: 'rgb(22, 32, 28)',
      radius: '2px',
    });
  });

  it('paints the chrome in every token the page sets, over its defaults and its config, in light and dark', async () => {
    const css = Object.entries(PAGE_TOKENS)
      .map(([name, value]) => `--epdf-${name}: ${value};`)
      .join(' ');
    for (const name of Object.keys(CONFIGS) as Array<keyof typeof CONFIGS>) {
      const tab = tabs.get(name)!;
      await tab.bringToFront();
      await pageCss(tab, `#around { ${css} }`);
      expect(await lookOf(tab), name).toEqual(PAGE_TOKENS);
    }
  });

  it('gives your own components in it every token as a CSS variable, and its font and text color', async () => {
    const tab = tabs.get('dark-tokens')!;
    await tab.bringToFront();
    await pageCss(tab, '');
    await tab.evaluate(() => {
      const header = document.createElement('header');
      header.slot = 'header';
      header.id = 'mine';
      header.textContent = 'Acme Contracts';
      header.style.cssText =
        'background: var(--epdf-surface); border: 1px solid var(--epdf-border);' +
        'border-radius: var(--epdf-radius); padding: 4px;';
      document.querySelector('embedpdf-viewer')!.append(header);
    });
    await frames(tab);
    const mine = () =>
      tab.evaluate(() => {
        const style = getComputedStyle(document.getElementById('mine')!);
        return {
          shown: document.getElementById('mine')!.getBoundingClientRect().height > 0,
          surface: style.backgroundColor,
          border: style.borderTopColor,
          radius: style.borderTopLeftRadius,
          text: style.color,
          font: style.fontFamily,
        };
      });
    // The config's dark surface and radius, the dark defaults for the rest.
    expect(await mine()).toEqual({
      shown: true,
      surface: 'rgb(22, 32, 28)',
      border: 'rgb(75, 85, 99)',
      radius: '2px',
      text: 'rgb(249, 250, 251)',
      font: expect.stringMatching(/^ui-sans-serif/),
    });
    // And the page's, once it sets them.
    await pageCss(tab, '#around { --epdf-surface: rgb(240, 250, 230); --epdf-font: serif; }');
    expect(await mine()).toMatchObject({ surface: 'rgb(240, 250, 230)', font: 'serif' });
  });
});

/** Every part the Theming page lists. */
const PARTS = [
  'toolbar',
  'toolbar-button',
  'toolbar-button-active',
  'mode-tab',
  'mode-tab-active',
  'tab',
  'tab-active',
  'menu',
  'menu-item',
  'menu-item-active',
  'panel',
  'panel-header',
] as const;

/** Per part, how many elements carry it, and how many of those the page's `::part()` rule reached. */
const partsOf = (tab: Page) =>
  tab.evaluate(
    (names) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const live = (element: Element) => !element.closest('[aria-hidden="true"]');
      return Object.fromEntries(
        names.map((name) => {
          const carriers = [...root.querySelectorAll(`[part~="${name}"]`)].filter(live);
          const reached = carriers.filter(
            (element) => getComputedStyle(element).getPropertyValue(`--part-${name}`) === 'reached',
          );
          return [name, { carriers: carriers.length, reached: reached.length }];
        }),
      );
    },
    PARTS as unknown as string[],
  );

describe('restyling a part from the page', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer({ '/parts.html': page('light') });
    browser = await launchChromium();
  });
  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('reaches every part the Theming page lists, on every bar and button, with ::part()', async () => {
    const tab = await open(browser, `${host.origin}/parts.html`);
    await pageCss(
      tab,
      PARTS.map((name) => `embedpdf-viewer::part(${name}) { --part-${name}: reached; }`).join('\n'),
    );

    // Every bar is a `toolbar`: the main one, the page number floating over the pages, and the
    // bar over the selected text; every button in them is a `toolbar-button` or a `mode-tab`.
    const bars = await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const live = (element: Element) => !element.closest('[aria-hidden="true"]');
      const toolbars = [...root.querySelectorAll('[part~="toolbar"]')].filter(live);
      const buttons = toolbars.flatMap((bar) =>
        [...bar.querySelectorAll('button')].filter(live).map((button) => ({
          label: button.getAttribute('aria-label') ?? button.getAttribute('title'),
          part: button.getAttribute('part'),
        })),
      );
      return {
        main: toolbars.some((bar) => bar.getAttribute('data-bar') === 'main'),
        floating: toolbars.some((bar) => bar.closest('[data-float]') !== null),
        selection: toolbars.some((bar) => bar.parentElement?.hasAttribute('data-placement')),
        // The page number is a field, not a button.
        unnamed: buttons.filter(
          (button) =>
            button.label !== 'Go to page' && !/toolbar-button|mode-tab/.test(button.part ?? ''),
        ),
      };
    });
    expect(bars).toEqual({ main: true, floating: true, selection: true, unnamed: [] });

    // A second document's tabs, then a panel and a menu with its current choice.
    const run = (id: string) =>
      tab.evaluate(
        (command) =>
          (
            document.querySelector('embedpdf-viewer') as HTMLElement & { viewer: any }
          ).viewer.commands.execute(command),
        id,
      );
    await tab.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());
      await (
        document.querySelector('embedpdf-viewer') as HTMLElement & { viewer: any }
      ).viewer.documents.open({ kind: 'bytes', id: 'second', bytes }, { name: 'Second' });
    });
    await tab.waitForFunction(
      () =>
        document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelectorAll('[role="tab"]')
          .length === 2,
    );
    await waitForDocument(tab);
    await run('panel:thumbnails');
    await frames(tab);
    await run('menu:view');
    await frames(tab);

    const parts = await partsOf(tab);
    for (const name of PARTS) {
      expect(parts[name]!.carriers, `an element is the ${name} part`).toBeGreaterThan(0);
      expect(parts[name]!.reached, `every ${name} part takes the page's rule`).toBe(
        parts[name]!.carriers,
      );
    }
    // One of each that says "the current one".
    expect(parts['tab-active']!.carriers).toBe(1);
    expect(parts['mode-tab-active']!.carriers).toBe(1);
    await tab.close();
  });
});
