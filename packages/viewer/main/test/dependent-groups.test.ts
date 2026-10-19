/**
 * Undo, redo and style are dependent groups in the mode bars: they show beside a mode's tools,
 * and a mode bar left with only them shows nothing. So its tab goes, the last tab takes View
 * with it, and a read-only viewer shows no tab strip and no empty bar under the main one.
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

/** A page whose viewer gets `config`, a script expression. Wide, so every mode tab fits. */
const page = (config: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>dependent groups</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1600px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
</script>
</body></html>`;

const PAGES = {
  '/default.html': page('{}'),
  '/read-only.html': page('{ readOnly: true }'),
  '/no-insert.html': page("{ disable: ['stamps', 'attachments', 'signatures'] }"),
};

const MODE_BARS = ['annotate', 'shapes', 'insert', 'form', 'redact', 'measure'];

/** The bar bands the viewer draws, in order, and the mode tabs in the live row. */
const drawn = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    return {
      bars: [...root.querySelectorAll<HTMLElement>('[data-bar]')].map((bar) => bar.dataset.bar!),
      tabs: [...root.querySelectorAll('[part~="mode-tab"]')]
        .filter((tab) => !tab.closest('[aria-hidden]'))
        .map((tab) => tab.textContent),
    };
  });

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('dependent groups', () => {
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
    const tab = await browser.newPage({ viewport: { width: 1700, height: 800 } });
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  /** Each mode bar while its mode is open: undo and redo show beside the tools. */
  it('show beside the tools of a mode', async () => {
    const tab = await open('/default.html');
    const { tabs } = await drawn(tab);
    expect(tabs).toEqual(['View', 'Annotate', 'Shapes', 'Insert', 'Form', 'Redact', 'Measure']);
    await tab.locator('embedpdf-viewer [part~="mode-tab"]', { hasText: 'Insert' }).first().click();
    await frames(tab);
    const labels = await tab.evaluate(() =>
      [
        ...document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelectorAll('[data-bar="insert"] button'),
      ]
        .filter((button) => !button.closest('[aria-hidden]'))
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    );
    expect(labels).toEqual(expect.arrayContaining(['Undo', 'Redo']));
    await tab.close();
  });

  it('leave a read-only viewer no mode tab, no View tab and no bar under the main one', async () => {
    const tab = await open('/read-only.html');
    const { tabs, bars } = await drawn(tab);
    expect(tabs).toEqual([]);
    expect(bars).toContain('main');
    expect(bars.filter((bar) => MODE_BARS.includes(bar))).toEqual([]);
    await tab.close();
  });

  it('take the Insert tab, and only that one, when everything else in its bar is off', async () => {
    const tab = await open('/no-insert.html');
    expect((await drawn(tab)).tabs).toEqual([
      'View',
      'Annotate',
      'Shapes',
      'Form',
      'Redact',
      'Measure',
    ]);
    await tab.close();
  });

  it('follow readOnly while the viewer runs', async () => {
    const tab = await open('/default.html');
    const setReadOnly = (readOnly: boolean) =>
      tab.evaluate((value) => {
        (document.querySelector('embedpdf-viewer') as unknown as { readOnly: boolean }).readOnly =
          value;
      }, readOnly);
    await setReadOnly(true);
    await frames(tab);
    expect((await drawn(tab)).tabs).toEqual([]);
    await setReadOnly(false);
    await frames(tab);
    expect((await drawn(tab)).tabs).toContain('Insert');
    await tab.close();
  });
});
