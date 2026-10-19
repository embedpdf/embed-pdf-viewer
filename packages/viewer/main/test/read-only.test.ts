/**
 * What a turned-off feature leaves in the document stays, frozen: under `readOnly` an annotation
 * is selected but not dragged or deleted, the View only label says why, and the comments panel
 * only reads; turning `readOnly` off while the viewer runs makes it movable again. Under
 * `disable: ['shapes']` a square is frozen and a highlight isn't. A scope that allows no change
 * shows the label too.
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
  'read-only': { readOnly: true },
  'no-shapes': { disable: ['shapes'] },
  'no-change-allowed': {
    scope: ['doc.open', 'doc.render', 'doc.text.select', 'doc.text.search', 'doc.annotate.read'],
  },
} as const;

const page = (config: unknown) => `<!doctype html><html><head><meta charset="utf-8">
<title>read-only</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.readies = [];
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    theme: 'light',
    ...${JSON.stringify(config)},
  });
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

/** Make an annotation on the first page from code, which a read-only viewer still lets the app do. */
const create = (tab: Page, fields: Record<string, unknown>): Promise<Ref> =>
  tab.evaluate(async (draft) => {
    const annotation = window.element.viewer.get('annotation');
    const { annotation: made } = await annotation.create(0, draft);
    return made.ref;
  }, fields);

const rectOf = (tab: Page, ref: Ref): Promise<Box | null> =>
  tab.evaluate((target) => window.element.viewer.get('annotation').get(target)?.rect ?? null, ref);

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

/** Press on an annotation's middle and drag it by (dx, dy). */
async function drag(tab: Page, ref: Ref, dx: number, dy: number): Promise<void> {
  const box = await screenBoxOf(tab, ref);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await tab.mouse.move(x, y);
  await tab.mouse.down();
  await tab.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await tab.mouse.move(x + dx, y + dy, { steps: 4 });
  await tab.mouse.up();
  await frames(tab);
}

const selectedRefs = (tab: Page): Promise<Ref[]> =>
  tab.evaluate(() =>
    window.element.viewer
      .get('annotation')
      .selection.list()
      .map((annotation: { ref: Ref }) => annotation.ref),
  );

/** The View only label, as it shows: its words, or null while it draws nothing. */
const viewOnlyLabel = (tab: Page): Promise<string | null> =>
  tab.evaluate(() => {
    const spans = [...window.element.shadowRoot!.querySelectorAll('span')];
    const label = spans.find(
      (span) => span.textContent === 'View only' && span.getBoundingClientRect().width > 0,
    );
    return label?.textContent ?? null;
  });

/** What the viewer handed the annotation and form plugins: who may change what by hand. */
const byHand = (tab: Page) =>
  tab.evaluate(() => ({
    editable: window.element.viewer.get('annotation').getSettings().editable,
    fillable: window.element.viewer.get('form').getSettings().fillable,
  }));

const SQUARE = {
  subtype: 'square',
  box: { x: 120, y: 160, width: 160, height: 100 },
  interiorColor: '#ffcc00',
};

describe('what a turned-off feature made stays, frozen', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    expect(existsSync(join(dist, 'embedpdf.js')), 'run `pnpm build` first').toBe(true);
    host = await serveViewer(
      Object.fromEntries(
        Object.entries(CONFIGS).map(([name, config]) => [`/${name}.html`, page(config)]),
      ),
    );
    browser = await launchChromium();
  });
  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const open = async (name: keyof typeof CONFIGS): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors: string[] = [];
    tab.on('pageerror', (error) => errors.push(error.message));
    await tab.goto(`${host.origin}/${name}.html`);
    await waitForDocument(tab);
    await tab.waitForFunction(() => window.readies.length === 1);
    await frames(tab);
    expect(errors).toEqual([]);
    return tab;
  };

  it('under readOnly: selected but not dragged or deleted, and the label says why', async () => {
    const tab = await open('read-only');
    expect(await viewOnlyLabel(tab)).toBe('View only');
    expect(await byHand(tab)).toEqual({ editable: false, fillable: false });

    const square = await create(tab, SQUARE);
    await frames(tab);
    const before = await rectOf(tab, square);
    await drag(tab, square, 140, 90);
    expect(await selectedRefs(tab)).toEqual([square]);
    expect(await rectOf(tab, square)).toEqual(before);

    await tab.keyboard.press('Delete');
    await tab.keyboard.press('Backspace');
    const deleted = await tab.evaluate(() =>
      window.element.viewer.commands.execute('annotation:delete'),
    );
    expect(deleted).toMatchObject({ status: 'rejected' });
    await frames(tab);
    expect(await rectOf(tab, square)).toEqual(before);
    // The plugin's own say: a frozen annotation, while the twins stay facts.
    expect(
      await tab.evaluate((ref) => {
        const annotation = window.element.viewer.get('annotation');
        return {
          editable: annotation.isEditable(ref),
          canUpdate: annotation.canUpdate(ref),
          properties: annotation.selection.getProperties().properties.length,
        };
      }, square),
    ).toEqual({ editable: false, canUpdate: true, properties: 0 });

    // Live: off again, and the square moves; the label is gone.
    await tab.evaluate(() => (window.element.readOnly = false));
    await frames(tab);
    expect(await viewOnlyLabel(tab)).toBeNull();
    expect(await byHand(tab)).toEqual({ editable: true, fillable: true });
    await drag(tab, square, 140, 90);
    await tab.waitForFunction(
      ([ref, x]) => (window.element.viewer.get('annotation').get(ref)?.rect.x ?? 0) > x + 50,
      [square, before!.x] as const,
    );
    await tab.close();
  });

  it('under readOnly the comments panel reads its threads, with nothing to write', async () => {
    const tab = await open('read-only');
    const square = await create(tab, { ...SQUARE, contents: 'Check this figure' });
    await tab.evaluate(async (ref) => {
      await window.element.viewer.get('annotation').comments.reply(ref, 'Agreed');
      window.element.viewer.get('shell').open('comments');
    }, square);
    await tab.waitForFunction(() =>
      window.element.shadowRoot!.textContent!.includes('Check this figure'),
    );
    await frames(tab);
    const panel = await tab.evaluate(() => {
      const root = window.element.shadowRoot!;
      return {
        reply: root.textContent!.includes('Agreed'),
        inputs: root.querySelectorAll('li input, li select, li textarea').length,
        deletes: [...root.querySelectorAll('li button')].filter((button) =>
          /Delete/.test(button.getAttribute('title') ?? ''),
        ).length,
      };
    });
    expect(panel).toEqual({ reply: true, inputs: 0, deletes: 0 });

    await tab.evaluate(() => (window.element.readOnly = false));
    await tab.waitForFunction(
      () => window.element.shadowRoot!.querySelectorAll('li input').length > 0,
    );
    await tab.close();
  });

  it("under disable: ['shapes'] a square is frozen and a highlight isn't", async () => {
    const tab = await open('no-shapes');
    expect(await viewOnlyLabel(tab)).toBeNull();
    const square = await create(tab, SQUARE);
    const highlight = await create(tab, {
      subtype: 'highlight',
      color: '#ffeb3b',
      quadPoints: [
        {
          upperLeft: { x: 120, y: 400 },
          upperRight: { x: 320, y: 400 },
          lowerLeft: { x: 120, y: 416 },
          lowerRight: { x: 320, y: 416 },
        },
      ],
    });
    await frames(tab);
    const before = await rectOf(tab, square);
    await drag(tab, square, 140, 90);
    expect(await selectedRefs(tab)).toEqual([square]);
    expect(await rectOf(tab, square)).toEqual(before);

    const deleteCommand = () =>
      tab.evaluate(() => {
        const command = window.element.viewer.commands.resolveCommand('annotation:delete');
        return { visible: command?.visible, enabled: command?.enabled };
      });
    // The square: the trash button shows, and does nothing.
    expect(await deleteCommand()).toEqual({ visible: true, enabled: false });
    expect(
      await tab.evaluate(
        ([shape, marker]) => {
          const annotation = window.element.viewer.get('annotation');
          return [annotation.isEditable(shape), annotation.isEditable(marker)];
        },
        [square, highlight] as const,
      ),
    ).toEqual([false, true]);

    // The highlight: restyled and deleted by hand as ever.
    await tab.evaluate(
      (ref) => window.element.viewer.get('annotation').selection.set([ref]),
      highlight,
    );
    await frames(tab);
    expect(await deleteCommand()).toEqual({ visible: true, enabled: true });
    expect(
      await tab.evaluate(
        () => window.element.viewer.get('annotation').selection.getProperties().properties.length,
      ),
    ).toBeGreaterThan(0);
    await tab.evaluate(() => window.element.viewer.commands.execute('annotation:delete'));
    await tab.waitForFunction(
      (ref) => window.element.viewer.get('annotation').get(ref) === null,
      highlight,
    );
    expect(await rectOf(tab, square)).toEqual(before);
    await tab.close();
  });

  it('shows the label while the scope allows no change at all', async () => {
    const tab = await open('no-change-allowed');
    await tab.waitForFunction(() =>
      [...window.element.shadowRoot!.querySelectorAll('span')].some(
        (span) => span.textContent === 'View only' && span.getBoundingClientRect().width > 0,
      ),
    );
    await tab.close();
  });
});
