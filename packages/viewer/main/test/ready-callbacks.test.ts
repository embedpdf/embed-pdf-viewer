/**
 * `onReady` and `onDocumentChange` in the config: `onReady` gets the `viewer` once it's live,
 * before any document change; `onDocumentChange` gets the active document's id, the first one
 * included, whether it came from `src` or `documents`. The element's `epdf:ready` and
 * `epdf:documentchange` say the same, at the same moments.
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

/** A page whose viewer gets `config` (a script expression) and logs what it hears, in order. */
const page = (config: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>ready callbacks</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.heard = [];
  window.readyViewers = [];
  window.element = EmbedPDF.init({
    target: '#viewer',
    onReady: (viewer) => {
      window.readyViewers.push(viewer);
      window.heard.push('onReady');
    },
    onDocumentChange: (documentId) => window.heard.push('onDocumentChange ' + documentId),
    ...${config},
  });
  window.element.addEventListener('epdf:ready', () => window.heard.push('epdf:ready'));
  window.element.addEventListener('epdf:documentchange', (event) =>
    window.heard.push('epdf:documentchange ' + event.detail.documentId),
  );
</script>
</body></html>`;

const PAGES = {
  '/src.html': page("{ src: '/sample.pdf' }"),
  '/documents.html': page("{ documents: [{ src: '/sample.pdf', name: 'Sample' }] }"),
};

/** What a page of this test keeps on `window`. */
interface Heard {
  element: HTMLElement & {
    viewer: {
      documents: { getActiveId(): string | null; close(id: string): Promise<unknown> };
    } | null;
  };
  heard: string[];
  readyViewers: unknown[];
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('onReady and onDocumentChange', () => {
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
    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  /** What the page heard, and the active document now. */
  const heardOn = (tab: Page) =>
    tab.evaluate(() => {
      const { element, heard, readyViewers } = window as unknown as Heard;
      return {
        heard,
        sameViewer: readyViewers.length === 1 && readyViewers[0] === element.viewer,
        active: element.viewer!.documents.getActiveId(),
      };
    });

  for (const path of ['/src.html', '/documents.html']) {
    it(`calls onReady once, then onDocumentChange with the active document (${path})`, async () => {
      const tab = await open(path);
      const { heard, sameViewer, active } = await heardOn(tab);
      expect(sameViewer).toBe(true);
      expect(heard.slice(0, 2)).toEqual(['epdf:ready', 'onReady']);
      expect(heard.filter((entry) => /ready/i.test(entry))).toHaveLength(2);
      // Each change is the event, then the config's callback, with the same id.
      const changes = heard.slice(2);
      expect(changes.length).toBeGreaterThan(0);
      for (let i = 0; i < changes.length; i += 2) {
        const documentId = changes[i]!.replace('epdf:documentchange ', '');
        expect(changes.slice(i, i + 2)).toEqual([
          `epdf:documentchange ${documentId}`,
          `onDocumentChange ${documentId}`,
        ]);
      }
      expect(changes.at(-1)).toBe(`onDocumentChange ${active}`);
      await tab.close();
    });
  }

  it('calls onDocumentChange with null once the last document closes', async () => {
    const tab = await open('/src.html');
    await tab.evaluate(async () => {
      const { documents } = (window as unknown as Heard).element.viewer!;
      await documents.close(documents.getActiveId()!);
    });
    await frames(tab);
    const { heard } = await heardOn(tab);
    expect(heard.slice(-2)).toEqual(['epdf:documentchange null', 'onDocumentChange null']);
    await tab.close();
  });
});
