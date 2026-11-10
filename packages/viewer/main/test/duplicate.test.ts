/**
 * Duplicate, by hand: `Ctrl`/`Cmd`+`D` copies the selected annotations beside the originals
 * and selects the copies, which drag into place; each undo takes one step back. The button
 * shows for what people place and drag, so not for a highlight, and is greyed out while a
 * locked annotation is selected.
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
<title>duplicate</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.readies = [];
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: 'light' });
  window.element.addEventListener('epdf:ready', (event) => window.readies.push(event.detail.viewer));
</script>
</body></html>`;

type Box = { x: number; y: number; width: number; height: number };
type Ref = { kind: 'objectNumber'; objectNumber: number };

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
    readies: unknown[];
  }
}

const create = (tab: Page, fields: Record<string, unknown>): Promise<Ref> =>
  tab.evaluate(async (draft) => {
    const annotation = window.element.viewer.get('annotation');
    const { annotation: made } = await annotation.create(0, draft);
    return made.ref;
  }, fields);

const select = (tab: Page, refs: readonly Ref[]): Promise<void> =>
  tab.evaluate((targets) => {
    window.element.viewer.get('annotation').selection.select(targets);
  }, refs);

/** Every annotation's box, in drawing order. */
const boxes = (tab: Page): Promise<Box[]> =>
  tab.evaluate(() =>
    window.element.viewer
      .get('annotation')
      .list()
      .map((annotation: { rect: Box }) => annotation.rect),
  );

const selectedRefs = (tab: Page): Promise<Ref[]> =>
  tab.evaluate(() =>
    window.element.viewer
      .get('annotation')
      .selection.getSelected()
      .map((annotation: { ref: Ref }) => annotation.ref),
  );

/** Where an annotation is on the screen: its page box through the main view, in client pixels. */
const screenBoxOf = (tab: Page, ref: Ref): Promise<Box> =>
  tab.evaluate((target) => {
    const viewer = window.element.viewer;
    const rect = viewer.get('annotation').get(target).rect;
    const box = viewer.get('stage').pageRectToViewport(0, rect);
    // The main view: the largest box that takes the pointer for the pages.
    const views = [...window.element.shadowRoot!.querySelectorAll('div')].filter(
      (element) => (element as HTMLElement).style.touchAction === 'none',
    );
    const area = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width * bounds.height;
    };
    const origin = views
      .sort((left, right) => area(right) - area(left))[0]!
      .getBoundingClientRect();
    return { x: origin.left + box.x, y: origin.top + box.y, width: box.width, height: box.height };
  }, ref);

/** How the bar's Duplicate shows now. */
const duplicateCommand = (tab: Page) =>
  tab.evaluate(() => {
    const command = window.element.viewer.commands.resolveCommand('annotation:duplicate');
    return { visible: command?.visible, enabled: command?.enabled };
  });

/** Wait until every change on its way has its answer. */
const settled = async (tab: Page): Promise<void> => {
  await tab.waitForFunction(() => {
    const annotation = window.element.viewer.get('annotation');
    return annotation.list().every((each: { ref: Ref }) => !annotation.isPending(each.ref));
  });
  await frames(tab);
};

const SQUARE = {
  subtype: 'square',
  box: { x: 120, y: 160, width: 160, height: 100 },
  interiorColor: '#ffcc00',
};

describe('duplicate', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    expect(existsSync(join(dist, 'embedpdf.js')), 'run `pnpm build` first').toBe(true);
    host = await serveViewer({ '/duplicate.html': PAGE });
    browser = await launchChromium();
  });
  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const open = async (): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors: string[] = [];
    tab.on('pageerror', (error) => errors.push(error.message));
    await tab.goto(`${host.origin}/duplicate.html`);
    await waitForDocument(tab);
    await tab.waitForFunction(() => window.readies.length === 1);
    await frames(tab);
    expect(errors).toEqual([]);
    return tab;
  };

  it('Mod+D copies the selection beside it, the copy drags, and each undo is one step', async () => {
    const tab = await open();
    const square = await create(tab, SQUARE);
    await frames(tab);
    // A click selects it, and gives the viewer the keys.
    const at = await screenBoxOf(tab, square);
    await tab.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    await frames(tab);
    expect(await selectedRefs(tab)).toEqual([square]);
    expect(await duplicateCommand(tab)).toEqual({ visible: true, enabled: true });

    await tab.keyboard.press('ControlOrMeta+d');
    await tab.waitForFunction(() => window.element.viewer.get('annotation').list().length === 2);
    await settled(tab);
    const [original, copy] = await boxes(tab);
    expect(original).toEqual(SQUARE.box);
    expect(copy).toEqual({ ...SQUARE.box, x: SQUARE.box.x + 10, y: SQUARE.box.y + 10 });
    const [copied] = await selectedRefs(tab);
    expect(copied).not.toEqual(square);

    // The copy is the selection: it drags away from the original.
    const from = await screenBoxOf(tab, copied!);
    const x = from.x + from.width / 2;
    const y = from.y + from.height / 2;
    await tab.mouse.move(x, y);
    await tab.mouse.down();
    await tab.mouse.move(x + 100, y + 60, { steps: 6 });
    await tab.mouse.move(x + 200, y + 120, { steps: 6 });
    await tab.mouse.up();
    await settled(tab);
    const moved = (await boxes(tab))[1]!;
    expect(moved.x).toBeGreaterThan(copy!.x + 50);
    expect((await boxes(tab))[0]).toEqual(SQUARE.box);

    // The first undo puts the copy back beside the original; the second takes it away and
    // selects the original again.
    await tab.keyboard.press('ControlOrMeta+z');
    await tab.waitForFunction(
      (beside) => window.element.viewer.get('annotation').list()[1]?.rect.x === beside,
      copy!.x,
    );
    await settled(tab);
    await tab.keyboard.press('ControlOrMeta+z');
    await tab.waitForFunction(() => window.element.viewer.get('annotation').list().length === 1);
    await settled(tab);
    expect(await boxes(tab)).toEqual([SQUARE.box]);
    expect(await selectedRefs(tab)).toEqual([square]);
    await tab.close();
  });

  it('shows for what people drag, and is greyed out for a locked annotation', async () => {
    const tab = await open();
    const square = await create(tab, SQUARE);
    const locked = await create(tab, {
      ...SQUARE,
      box: { ...SQUARE.box, y: 320 },
      locked: true,
    });
    const highlight = await create(tab, {
      subtype: 'highlight',
      color: '#ffeb3b',
      quadPoints: [
        {
          upperLeft: { x: 120, y: 480 },
          upperRight: { x: 320, y: 480 },
          lowerLeft: { x: 120, y: 496 },
          lowerRight: { x: 320, y: 496 },
        },
      ],
    });
    await frames(tab);

    expect(await duplicateCommand(tab)).toEqual({ visible: false, enabled: false });
    await select(tab, [square]);
    expect(await duplicateCommand(tab)).toEqual({ visible: true, enabled: true });
    // A highlight stays on its words: the bar offers no copy beside it.
    await select(tab, [highlight]);
    expect(await duplicateCommand(tab)).toEqual({ visible: false, enabled: true });
    // Its copy would be locked too.
    await select(tab, [square, locked]);
    expect(await duplicateCommand(tab)).toEqual({ visible: true, enabled: false });
    const refused = await tab.evaluate(() =>
      window.element.viewer.commands.execute('annotation:duplicate'),
    );
    expect(refused).toMatchObject({ status: 'rejected' });
    expect(await boxes(tab)).toHaveLength(3);
    await tab.close();
  });
});
