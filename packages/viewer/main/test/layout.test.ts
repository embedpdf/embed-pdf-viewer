/**
 * The `layout` config in a running viewer: edits of the default layout take
 * buttons out of one bar, a bar with a new mode adds its tab and shows while
 * the mode is open, a mode or a bar with nothing visible has no tab and draws
 * nothing, an open mode whose tab goes falls back to View, and the layout
 * function runs again when the viewer's size changes.
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

/**
 * A page whose viewer gets `config`, a script expression with `layout` written as a function. The
 * viewer is wide enough for every mode tab, the page's own ones too, in any platform's system font.
 */
const page = (config: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>layout</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1400px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF, { CommandsToken } from '/embedpdf.js';
  window.warnings = [];
  const warn = console.warn;
  console.warn = (...args) => { window.warnings.push(args.join(' ')); warn(...args); };
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
  window.element.addEventListener('epdf:ready', (event) => {
    window.commands = event.detail.viewer.get(CommandsToken);
  });
</script>
</body></html>`;

const PAGES = {
  '/removed.html': page(`{
    layout: (layout) => layout.remove(['tool:pan', 'panel:comments'], { from: 'main' }),
  }`),
  '/review.html': page(`{
    commands: [
      { id: 'acme:approve', label: 'Approve', icon: 'check', categories: ['acme'], run: () => {} },
      { id: 'acme:never', label: 'Never', icon: 'check', visible: () => false, run: () => {} },
    ],
    layout: (layout) =>
      layout
        .addBar('review', {
          place: { with: 'main' },
          mode: 'review',
          title: 'Review',
          center: [['acme:approve']],
        })
        .addBar('hidden', {
          place: { with: 'main' },
          mode: 'hidden',
          title: 'Hidden',
          center: [['acme:never']],
        })
        .addBar('empty', { place: { edge: 'top', after: 'main' }, center: [['acme:never']] })
        .addBar('second', { place: { edge: 'top', after: 'main' }, center: [['acme:approve']] })
        .remove('tool:pann', { from: 'main' }),
  }`),
  '/sized.html': page(`{
    layout: (layout, env) => (env.size === 'compact' ? layout.place('main', 'bottom') : layout),
  }`),
};

/** What the viewer draws: each bar band by id, in order, and the live buttons' labels in a bar. */
const drawn = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const live = (element: Element) =>
      [...element.querySelectorAll('button')]
        .filter((button) => !button.closest('[aria-hidden]'))
        .map((button) => button.getAttribute('aria-label') ?? button.textContent ?? '');
    const bars = [...root.querySelectorAll<HTMLElement>('[data-bar]')];
    return {
      bars: bars.map((bar) => bar.dataset.bar!),
      buttons: Object.fromEntries(bars.map((bar) => [bar.dataset.bar!, live(bar)])),
      tabs: [...root.querySelectorAll('[part~="mode-tab"]')]
        .filter((tab) => !tab.closest('[aria-hidden]'))
        .map((tab) => tab.textContent),
      tops: Object.fromEntries(
        bars.map((bar) => [bar.dataset.bar!, bar.getBoundingClientRect().top]),
      ),
    };
  });

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('the layout config', () => {
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

  const open = async (path: string, width = 1440): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width, height: 800 } });
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await tab.waitForFunction(() => (window as { commands?: unknown }).commands !== undefined);
    await frames(tab);
    return tab;
  };

  it('takes buttons out of the one bar remove() names', async () => {
    const tab = await open('/removed.html');
    const { buttons } = await drawn(tab);
    expect(buttons.main).toContain('Pointer');
    expect(buttons.main).toContain('Search');
    expect(buttons.main).not.toContain('Pan');
    expect(buttons.main).not.toContain('Comment');
    // The command stays: it still runs from code.
    const result = await tab.evaluate(() =>
      (
        window as unknown as { commands: { execute(id: string): Promise<{ status: string }> } }
      ).commands.execute('tool:pan'),
    );
    expect(result.status).toBe('executed');
    await tab.close();
  });

  it('adds a tab for a bar with a new mode, and shows the bar while the mode is open', async () => {
    const tab = await open('/review.html');
    const before = await drawn(tab);
    expect(before.tabs).toContain('Review');
    expect(before.bars).not.toContain('review');

    const reviewTab = tab.locator('embedpdf-viewer [part~="mode-tab"]', { hasText: 'Review' });
    await reviewTab.first().click();
    await frames(tab);
    const during = await drawn(tab);
    expect(during.bars).toContain('review');
    expect(during.buttons.review).toEqual(['Approve']);
    // The mode bar rides along main, on the side of the pages.
    expect(during.tops.review!).toBeGreaterThan(during.tops.main!);

    // Back to View closes the new mode too.
    await tab.locator('embedpdf-viewer [part~="mode-tab"]', { hasText: 'View' }).first().click();
    await frames(tab);
    expect((await drawn(tab)).bars).not.toContain('review');
    await tab.close();
  });

  it('gives a mode with nothing visible no tab, and draws no bar with nothing visible', async () => {
    const tab = await open('/review.html');
    const { tabs, bars } = await drawn(tab);
    expect(tabs).not.toContain('Hidden');
    expect(bars).not.toContain('empty');
    // A bar placed after main sits right inside it.
    expect(bars.slice(0, 2)).toEqual(['main', 'second']);
    await tab.close();
  });

  it('falls back to View when the open mode loses its tab', async () => {
    const tab = await open('/review.html');
    await tab.locator('embedpdf-viewer [part~="mode-tab"]', { hasText: 'Review' }).first().click();
    await frames(tab);
    expect((await drawn(tab)).bars).toContain('review');

    // Turning off its only command leaves the mode's bar with nothing visible.
    await tab.evaluate(() =>
      (
        window as unknown as {
          commands: { updateSettings(patch: { disabledCategories: string[] }): void };
        }
      ).commands.updateSettings({ disabledCategories: ['acme'] }),
    );
    await frames(tab);
    await frames(tab);
    const after = await drawn(tab);
    expect(after.tabs).not.toContain('Review');
    expect(after.bars).not.toContain('review');
    const viewActive = await tab.evaluate(() =>
      [
        ...document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelectorAll('[part~="mode-tab-active"]'),
      ].map((element) => element.textContent),
    );
    expect(viewActive).toContain('View');
    await tab.close();
  });

  it('falls back to View when the open mode is turned off with its feature', async () => {
    const tab = await open('/removed.html');
    await tab.locator('embedpdf-viewer [part~="mode-tab"]', { hasText: 'Annotate' }).first().click();
    await frames(tab);
    expect((await drawn(tab)).bars).toContain('annotate');

    // The mode's bar keeps undo and redo, but the mode's own command goes with `annotations`.
    await tab.evaluate(() => {
      (document.querySelector('embedpdf-viewer') as unknown as { disable: string[] }).disable = [
        'annotations',
      ];
    });
    await frames(tab);
    await frames(tab);
    const after = await drawn(tab);
    expect(after.tabs).not.toContain('Annotate');
    expect(after.bars).not.toContain('annotate');
    const active = await tab.evaluate(() =>
      [
        ...document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelectorAll('[part~="mode-tab-active"]'),
      ].map((element) => element.textContent),
    );
    expect(active).toContain('View');
    await tab.close();
  });

  it('warns about an id the layout does not have, with the closest one', async () => {
    const tab = await open('/review.html');
    const warnings = await tab.evaluate(() => (window as { warnings?: string[] }).warnings ?? []);
    expect(warnings).toContain(
      '[embedpdf] layout: remove: "tool:pann" is not in "main" (did you mean "tool:pan"?)',
    );
    await tab.close();
  });

  it('runs the layout function again when the viewer gets narrow', async () => {
    const tab = await open('/sized.html');
    const wide = await drawn(tab);
    expect(wide.tops.main!).toBeLessThan(100);

    await tab.evaluate(() => {
      document.getElementById('viewer')!.style.width = '480px';
    });
    await tab.waitForFunction(
      () =>
        (document
          .querySelector('embedpdf-viewer')
          ?.shadowRoot?.querySelector('[data-bar="main"]')
          ?.getBoundingClientRect().top ?? 0) > 400,
    );
    await tab.evaluate(() => {
      document.getElementById('viewer')!.style.width = '1400px';
    });
    await tab.waitForFunction(
      () =>
        (document
          .querySelector('embedpdf-viewer')
          ?.shadowRoot?.querySelector('[data-bar="main"]')
          ?.getBoundingClientRect().top ?? 1000) < 100,
    );
    await tab.close();
  });
});
