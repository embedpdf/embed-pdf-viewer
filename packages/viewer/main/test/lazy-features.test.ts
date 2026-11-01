/**
 * A feature's interface isn't part of the viewer's first load: the search, comments, style,
 * stamps, signatures, redaction, measurement, outline, attachments and form design panels, the
 * signature, redaction, outline properties and print dialogs and the link editor are chunks of
 * their own. None loads before the document shows; once it has and the browser is idle, the
 * viewer fetches them in the background, so opening one afterwards fetches nothing. A module is
 * known by a translation key only it asks for.
 *
 * `FEATURES` lists every chunk the viewer fetches in the background: one missing from it can still
 * be arriving when the last test opens the others, and counts as fetched by them.
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

/** How each feature's interface opens, and a key only its code has. */
const FEATURES = [
  { name: 'search panel', open: { command: 'panel:search' }, marker: 'demo.searchPlaceholder' },
  {
    name: 'comments panel',
    open: { command: 'panel:comments' },
    marker: 'demo.commentsReplyPlaceholder',
  },
  { name: 'stamps panel', open: { command: 'panel:stamps' }, marker: 'demo.stampsImportHint' },
  {
    name: 'signatures panel',
    open: { command: 'panel:signatures' },
    marker: 'demo.signaturesNew',
  },
  {
    name: 'redaction panel',
    open: { command: 'panel:redaction' },
    marker: 'demo.redactionEmpty',
  },
  {
    name: 'measurement panel',
    open: { command: 'panel:measurement' },
    marker: 'measurement.knownLength',
  },
  { name: 'style panel', open: { command: 'panel:style' }, marker: 'demo.formatLabel' },
  { name: 'signature maker', open: { surface: 'signature-maker' }, marker: 'demo.makerTitle' },
  { name: 'sign dialog', open: { surface: 'signature-sign' }, marker: 'demo.signKindApproval' },
  {
    name: 'signature inspector',
    open: { surface: 'signature-inspector' },
    marker: 'demo.inspectIntegrity',
  },
  {
    name: 'redaction confirmation',
    open: { surface: 'redact-confirm' },
    marker: 'demo.redactConfirmTitle',
  },
  { name: 'print dialog', open: { surface: 'print' }, marker: 'print.preparingPage' },
  { name: 'outline panel', open: { command: 'panel:outline' }, marker: 'outline.noMatches' },
  {
    name: 'attachments panel',
    open: { command: 'panel:attachments' },
    marker: 'attachments.dropHint',
  },
  {
    name: 'outline properties dialog',
    open: { surface: 'outline-properties' },
    marker: 'outline.properties.bold',
  },
  // These show only in a state this page doesn't set up, the form designer's sidebar in Form
  // mode and the link editor over a selected link, so they aren't opened here.
  { name: 'form design panel', open: null, marker: 'formDesign.allFields' },
  { name: 'link editor', open: null, marker: 'linkEditor.toUrl' },
] as const;

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>lazy features</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: 'light' });
  // When the document first shows: the frame its page count appears in.
  const watch = () => {
    if (/Page 1 of \\d+/.test(window.element.shadowRoot?.textContent ?? '')) {
      window.shownAt = performance.now();
    } else requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
    shownAt?: number;
  }
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))("a feature's code", () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;
  /** The scripts the page fetched, in order: each one's path and text. */
  const scripts: { path: string; text: string }[] = [];

  beforeAll(async () => {
    host = await serveViewer({ '/lazy.html': PAGE });
    browser = await launchChromium();
    tab = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    tab.on('response', (response) => {
      const url = new URL(response.url());
      if (!url.pathname.endsWith('.js')) return;
      void response
        .text()
        .then((text) => scripts.push({ path: url.pathname, text }))
        .catch(() => {});
    });
    await tab.goto(`${host.origin}/lazy.html`);
    await waitForDocument(tab);
    await frames(tab);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  /** The scripts so far that hold `marker` as a string. */
  const holding = (marker: string): string[] =>
    scripts
      .filter(({ text }) => text.includes(`"${marker}"`) || text.includes(`'${marker}'`))
      .map(({ path }) => path);

  it('is fetched in the background once the document shows', async () => {
    const until = Date.now() + 30_000;
    const missing = () => FEATURES.filter((feature) => holding(feature.marker).length === 0);
    while (missing().length > 0 && Date.now() < until) {
      await tab.evaluate(() => new Promise((done) => setTimeout(done, 100)));
    }
    expect(missing().map((feature) => feature.name)).toEqual([]);
  });

  it('is not part of the first load: none of it starts before the document shows', async () => {
    const started = await tab.evaluate(() => ({
      shownAt: window.shownAt ?? null,
      scripts: Object.fromEntries(
        performance
          .getEntriesByType('resource')
          .map((entry) => [new URL(entry.name).pathname, entry.startTime]),
      ),
    }));
    expect(started.shownAt).not.toBeNull();
    for (const feature of FEATURES) {
      const [path] = holding(feature.marker);
      expect(path, feature.name).toBeDefined();
      expect(started.scripts[path!], feature.name).toBeGreaterThan(started.shownAt!);
    }
  });

  it('opens without fetching anything once fetched', async () => {
    const before = scripts.length;
    for (const { open } of FEATURES) {
      if (!open) continue;
      await tab.evaluate((how) => {
        const { viewer } = window.element;
        if ('command' in how) return viewer.commands.execute(how.command);
        viewer.get('shell').open(how.surface, { exclusive: 'modal' });
      }, open);
      await frames(tab);
      await tab.evaluate((how) => {
        const shell = window.element.viewer.get('shell');
        shell.close('command' in how ? how.command.slice('panel:'.length) : how.surface);
      }, open);
    }
    await tab.evaluate(() => new Promise((done) => setTimeout(done, 500)));
    // Data, not code: the stamps panel brings in the standard stamps, a PDF (base64 `%PDF`), and
    // the document's form fields bring in the standard faces they're drawn in, OpenType fonts
    // (base64 `OTTO`), each the first time a widget that needs it paints.
    const code = scripts
      .slice(before)
      .filter(({ text }) => !text.includes('"JVBERi0') && !text.includes('"T1RUTw'));
    expect(code.map(({ path }) => path)).toEqual([]);
  });
});
