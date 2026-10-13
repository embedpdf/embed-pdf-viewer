/**
 * `viewer.get('metadata')`: the metadata plugin is the viewer's, as Plugins lists it, and it
 * reads nothing as a document opens. Its state is `idle` until code asks with `ensureLoaded()`,
 * which reads the title, author and custom fields; a second document starts `idle` too.
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

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>metadata</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: 'light' });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('the metadata plugin in the viewer', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    host = await serveViewer({ '/metadata.html': PAGE });
    browser = await launchChromium();
    tab = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    await tab.goto(`${host.origin}/metadata.html`);
    await waitForDocument(tab);
    await frames(tab);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  /** The metadata's load states and snapshots, read through `viewer.get('metadata')`. */
  const read = () =>
    tab.evaluate(() => {
      const metadata = window.element.viewer.get('metadata');
      return {
        status: metadata.getStatus(),
        customStatus: metadata.custom.getStatus(),
        title: metadata.getSnapshot()?.title ?? null,
      };
    });

  it('reads nothing as the document opens', async () => {
    await tab.evaluate(() => new Promise((done) => setTimeout(done, 1000)));
    expect(await read()).toEqual({ status: 'idle', customStatus: 'idle', title: null });
  });

  it('reads the metadata when code asks with ensureLoaded()', async () => {
    const loading = await tab.evaluate(() => {
      const metadata = window.element.viewer.get('metadata');
      const asked = metadata.ensureLoaded();
      const status = metadata.getStatus();
      return asked.then(() => status);
    });
    expect(loading).toBe('loading');
    expect(await read()).toEqual({
      status: 'ready',
      customStatus: 'ready',
      title: 'Form I-140, Immigrant Petition for Alien Workers',
    });
  });

  it("is each document's own: another one opens idle", async () => {
    const other = await tab.evaluate(async () => {
      const { viewer } = window.element;
      const bytes = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());
      const { document } = await viewer.documents.open({ kind: 'bytes', id: 'second', bytes });
      return document.id as string;
    });
    await tab.waitForFunction(
      (id) => window.element.viewer.documents.get(id)?.status === 'ready',
      other,
    );
    const status = await tab.evaluate(
      (id) => window.element.viewer.forDocument(id).get('metadata').getStatus(),
      other,
    );
    expect(status).toBe('idle');
  });
});
