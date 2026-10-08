/**
 * Theming from the page: a `--epdf-*` variable set on `<embedpdf-viewer>` or
 * on any element around it wins, in light and in dark, over the viewer's own
 * default and over the `theme.tokens` config; with no page CSS the config, or
 * else the viewer's default, applies. The chrome (a pressed toolbar button)
 * and the parts drawn on the pages (the text selection) always agree.
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
  tokens: { preference: 'light', tokens: { accent: '#0f6e56' } },
  'dark-tokens': { preference: 'dark', tokens: { accent: '#0f6e56' }, dark: { accent: '#7dd3fc' } },
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
  await tab.mouse.move(310, 240);
  await tab.mouse.down();
  await tab.mouse.move(450, 240, { steps: 5 });
  await tab.mouse.move(600, 240, { steps: 5 });
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
});
