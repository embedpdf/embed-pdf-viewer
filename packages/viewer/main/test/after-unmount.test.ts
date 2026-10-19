/**
 * When the viewer mounts again with a new config, or leaves the page, its `viewer` is done: the
 * listeners added through it stop (they hear nothing of the documents closing), its calls refuse
 * with `instance-closed`, and `onReady` brings the new one.
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
<title>after unmount</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.viewers = [];
  window.heard = [];
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    onReady: (viewer) => {
      const index = window.viewers.push(viewer) - 1;
      viewer.documents.onClosed(({ documentId }) => window.heard.push(index + ' closed ' + documentId));
      viewer.watch(
        () => viewer.documents.getActiveId(),
        (documentId) => window.heard.push(index + ' active ' + documentId),
      );
    },
  });
</script>
</body></html>`;

/** What a page of this test keeps on `window`. */
interface GoneWindow {
  element: HTMLElement & { config: Record<string, unknown> };
  viewers: Array<{
    get(name: string): { getCurrentPageIndex(): number };
    tryGet(name: string): unknown;
    documents: { getActiveId(): string | null; close(id: string): Promise<void> };
    commands: { execute(id: string): Promise<unknown> };
  }>;
  heard: string[];
}

/** How each call to a viewer refuses: `ok`, or the error's name and code, thrown or rejected. */
const refusalsOf = (tab: Page, index: number) =>
  tab.evaluate(async (at) => {
    const viewer = (window as unknown as GoneWindow).viewers[at]!;
    const outcome = async (call: () => unknown) => {
      try {
        await call();
        return 'ok';
      } catch (error) {
        const { name, code } = error as { name: string; code?: string };
        return `${name} ${code}`;
      }
    };
    return {
      get: await outcome(() => viewer.get('stage')),
      read: await outcome(() => viewer.documents.getActiveId()),
      execute: await outcome(() => viewer.commands.execute('zoom:in')),
      close: await outcome(() => viewer.documents.close('sample')),
    };
  }, index);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('the viewer after it goes', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer({ '/gone.html': PAGE });
    browser = await launchChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const open = async (): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/gone.html`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  it('is done after a new config mounts a new viewer, and onReady brings the new one', async () => {
    const tab = await open();
    const before = await tab.evaluate(() => [...(window as unknown as GoneWindow).heard]);
    await tab.evaluate(() => {
      const { element } = window as unknown as GoneWindow;
      element.config = { ...element.config, layout: (layout: unknown) => layout };
    });
    await tab.waitForFunction(
      () => {
        const viewer = (window as unknown as GoneWindow).viewers[1];
        return Boolean(viewer?.tryGet('stage'));
      },
      null,
      { timeout: 60_000 },
    );
    await frames(tab);

    const { count, same, heard } = await tab.evaluate(() => {
      const page = window as unknown as GoneWindow;
      return {
        count: page.viewers.length,
        same: page.viewers[0] === page.viewers[1],
        heard: page.heard,
      };
    });
    expect(count).toBe(2);
    expect(same).toBe(false);
    // The old viewer's listeners heard nothing of its documents closing.
    expect(heard.filter((entry) => entry.startsWith('0 '))).toEqual(
      before.filter((entry) => entry.startsWith('0 ')),
    );
    expect(await refusalsOf(tab, 0)).toEqual({
      get: 'PluginError instance-closed',
      read: 'PluginError instance-closed',
      execute: 'PluginError instance-closed',
      close: 'PluginError instance-closed',
    });
    // The new one works.
    expect(
      await tab.evaluate(() =>
        (window as unknown as GoneWindow).viewers[1]!.get('stage').getCurrentPageIndex(),
      ),
    ).toBe(0);
    await tab.close();
  });

  it('is done once the element leaves the page', async () => {
    const tab = await open();
    const before = await tab.evaluate(() => [...(window as unknown as GoneWindow).heard]);
    await tab.evaluate(() => (window as unknown as GoneWindow).element.remove());
    await frames(tab);
    await tab.waitForTimeout(200);
    expect(await tab.evaluate(() => (window as unknown as GoneWindow).heard)).toEqual(before);
    expect(await refusalsOf(tab, 0)).toEqual({
      get: 'PluginError instance-closed',
      read: 'PluginError instance-closed',
      execute: 'PluginError instance-closed',
      close: 'PluginError instance-closed',
    });
    await tab.close();
  });
});
