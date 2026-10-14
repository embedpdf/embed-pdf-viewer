/**
 * How a panel opens, in a running viewer: docked beside the pages in a wide
 * viewer, its edge dragged wider and the width kept when it opens again; over
 * the pages' edge at medium widths, taking focus while the bars around the
 * pages keep working, until a click on the pages closes it; and as a sheet
 * from the bottom on a phone, which closes when its handle is dragged down or
 * a page is picked in it. And what the layout changes: how a panel opens per
 * size, its width limits, an edge that doesn't drag, the width the app hears
 * (`onPanelResize`, `epdf:panelresize`), and thumbnails that wrap into more
 * columns as the panel widens, sized by `plugins.thumbnails`.
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

const PAGES = {
  '/whole.html': `<!doctype html><html><head><meta charset="utf-8">
<title>panel frames</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; inset: 0; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf' });
</script>
</body></html>`,
  '/configured.html': `<!doctype html><html><head><meta charset="utf-8">
<title>panel frames, configured</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; inset: 0; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.heard = [];
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    layout: (layout) =>
      layout
        .panels({ present: { medium: 'dock' } })
        .panel('thumbnails', {
          present: { compact: 'overlay' },
          width: { initial: 320, min: 260, max: 400 },
        })
        .panel('search', { resizable: false }),
    onPanelResize: (event) => window.heard.push(['config', event.id, event.width]),
    plugins: { thumbnails: { zoom: { pageWidth: 100 } } },
  });
  window.element.addEventListener('epdf:panelresize', (event) =>
    window.heard.push(['event', event.detail.id, event.detail.width]),
  );
</script>
</body></html>`,
};

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Frame {
  present: string | null;
  role: string | null;
  label: string | null;
  modal: string | null;
  box: Box;
  inTopLayer: boolean;
}

/** The open panel's frame with this id, or null. */
const frameOf = (tab: Page, id: string) =>
  tab.evaluate((panel) => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const frame = root.querySelector(`[data-epdf-panel="${panel}"]`);
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    return {
      present: frame.getAttribute('data-present'),
      role: frame.getAttribute('role'),
      label: frame.getAttribute('aria-label'),
      modal: frame.getAttribute('aria-modal'),
      box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      inTopLayer: frame.closest('[data-epdf-layer]')?.matches(':popover-open') ?? false,
    };
  }, id) as Promise<Frame | null>;

/** The box of the main pages: the stage the floating bars float over. */
const pagesOf = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const stage = (root.querySelector('[data-float]') as HTMLElement).offsetParent!;
    const rect = stage.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }) as Promise<Box>;

/** The live (not the measurement layer's) button labelled `label`, by its box. */
const buttonOf = (tab: Page, label: string, within = '') =>
  tab.evaluate(
    ([name, scope]) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const button = [
        ...root.querySelectorAll(
          `${scope} button[aria-label="${name}"], ${scope} button[title="${name}"]`,
        ),
      ].find((candidate) => !candidate.closest('[aria-hidden="true"]'));
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    },
    [label, within],
  );

/** What has focus, looking into the shadow root: its label, and the panel it's in. */
const focused = (tab: Page) =>
  tab.evaluate(() => {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return {
      label: active?.getAttribute('aria-label') ?? active?.getAttribute('title') ?? null,
      panel: active?.closest('[data-epdf-panel]')?.getAttribute('data-epdf-panel') ?? null,
    };
  });

const clickBox = async (tab: Page, box: Box | null, what: string) => {
  expect(box, what).not.toBeNull();
  await tab.mouse.click((box!.left + box!.right) / 2, (box!.top + box!.bottom) / 2);
  await frames(tab);
};

const execute = (tab: Page, command: string) =>
  tab.evaluate(
    (id) =>
      (
        window as unknown as {
          element: { viewer: { commands: { execute(id: string): Promise<unknown> } } };
        }
      ).element.viewer.commands.execute(id),
    command,
  );

/** Wait out a slide or a fade. */
const settle = (tab: Page) => tab.waitForTimeout(350);

const widthOf = (box: Box) => Math.round(box.right - box.left);

/** The open thumbnails panel's thumbs that show a page: how many columns, and how wide each is. */
const thumbsOf = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const thumbs = [
      ...root.querySelectorAll('[data-epdf-panel="thumbnails"] button[title^="Page "]'),
    ].map((thumb) => thumb.getBoundingClientRect());
    return {
      columns: new Set(thumbs.map((rect) => Math.round(rect.left))).size,
      width: thumbs.length > 0 ? Math.round(thumbs[0]!.width) : 0,
    };
  });

/** The inner edge of the open panel `id`: its middle, and what it says. */
const edgeOf = (tab: Page, id: string) =>
  tab.evaluate((panel) => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const handle = root.querySelector(`[data-epdf-panel="${panel}"] [role="separator"]`);
    if (!handle) return null;
    const rect = handle.getBoundingClientRect();
    return {
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2,
      now: handle.getAttribute('aria-valuenow'),
      min: handle.getAttribute('aria-valuemin'),
      max: handle.getAttribute('aria-valuemax'),
    };
  }, id);

const dragEdge = async (tab: Page, id: string, dx: number) => {
  const edge = await edgeOf(tab, id);
  expect(edge, `the edge of ${id}`).not.toBeNull();
  await tab.mouse.move(edge!.x, edge!.y);
  await tab.mouse.down();
  await tab.mouse.move(edge!.x + dx, edge!.y, { steps: 5 });
  await tab.mouse.up();
  await frames(tab);
};

const heard = (tab: Page) => tab.evaluate(() => (window as unknown as { heard: unknown[] }).heard);

/** What the viewer draws at a point in the window: a control's label, or that it's the scrim. */
const topAt = (tab: Page, x: number, y: number) =>
  tab.evaluate(
    ([px, py]) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const hit = root.elementFromPoint(px!, py!);
      if (!hit) return null;
      if (hit.closest('[data-epdf-scrim]')) return 'scrim';
      const control = hit.closest('button');
      return control?.getAttribute('aria-label') ?? control?.getAttribute('title') ?? 'other';
    },
    [x, y],
  );

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('panel frames', () => {
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

  const open = async (width: number, page = '/whole.html'): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width, height: 800 } });
    await tab.goto(`${host.origin}${page}`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  it('docks beside the pages in a wide viewer, as a labeled region that leaves focus alone', async () => {
    const tab = await open(1280);
    const before = await pagesOf(tab);
    await clickBox(tab, await buttonOf(tab, 'Thumbnails'), 'the Thumbnails button');
    const frame = await frameOf(tab, 'thumbnails');
    expect(frame).toMatchObject({
      present: 'dock',
      role: 'region',
      label: 'Thumbnails',
      modal: null,
      inTopLayer: false,
    });
    expect(widthOf(frame!.box)).toBe(288);
    // The pages make room for it.
    const after = await pagesOf(tab);
    expect(Math.round(after.left)).toBe(Math.round(frame!.box.right));
    expect(widthOf(after)).toBe(widthOf(before) - 288);
    expect((await focused(tab)).panel).toBeNull();
    await tab.close();
  });

  it('drags a docked panel wider by its edge, steps it with the keys, and keeps the width', async () => {
    const tab = await open(1280);
    await clickBox(tab, await buttonOf(tab, 'Thumbnails'), 'the Thumbnails button');
    const edge = await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const handle = root.querySelector('[data-epdf-panel="thumbnails"] [role="separator"]')!;
      const rect = handle.getBoundingClientRect();
      return {
        x: (rect.left + rect.right) / 2,
        y: (rect.top + rect.bottom) / 2,
        label: handle.getAttribute('aria-label'),
        now: handle.getAttribute('aria-valuenow'),
      };
    });
    expect(edge).toMatchObject({ label: 'Resize Thumbnails', now: '288' });
    await tab.mouse.move(edge.x, edge.y);
    await tab.mouse.down();
    await tab.mouse.move(edge.x + 100, edge.y, { steps: 5 });
    await tab.mouse.up();
    await frames(tab);
    expect(widthOf((await frameOf(tab, 'thumbnails'))!.box)).toBe(388);

    await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      root.querySelector<HTMLElement>('[data-epdf-panel="thumbnails"] [role="separator"]')!.focus();
    });
    await tab.keyboard.press('ArrowLeft');
    await frames(tab);
    expect(widthOf((await frameOf(tab, 'thumbnails'))!.box)).toBe(372);

    await clickBox(tab, await buttonOf(tab, 'Close', '[data-epdf-panel]'), 'the close button');
    expect(await frameOf(tab, 'thumbnails')).toBeNull();
    await clickBox(tab, await buttonOf(tab, 'Thumbnails'), 'the Thumbnails button');
    expect(widthOf((await frameOf(tab, 'thumbnails'))!.box)).toBe(372);
    await tab.close();
  });

  it('opens over the pages at medium widths, takes focus, and a click on the pages closes it', async () => {
    const tab = await open(800);
    const before = await pagesOf(tab);
    await clickBox(tab, await buttonOf(tab, 'Thumbnails'), 'the Thumbnails button');
    await settle(tab);
    const frame = await frameOf(tab, 'thumbnails');
    expect(frame).toMatchObject({
      present: 'overlay',
      role: 'dialog',
      label: 'Thumbnails',
      modal: null,
    });
    // The pages stay where they are, under it.
    expect(await pagesOf(tab)).toEqual(before);
    expect(Math.round(frame!.box.left)).toBe(Math.round(before.left));
    expect((await focused(tab)).panel).toBe('thumbnails');

    await tab.mouse.click(before.right - 60, (before.top + before.bottom) / 2);
    await frames(tab);
    expect(await frameOf(tab, 'thumbnails')).toBeNull();
    expect((await focused(tab)).label).toBe('Thumbnails');
    await tab.close();
  });

  it('leaves the bars working while an overlay is open, and Tab moves on past it', async () => {
    const tab = await open(800);
    const button = await buttonOf(tab, 'Thumbnails');
    await clickBox(tab, button, 'the Thumbnails button');
    await settle(tab);
    // Only the pages dim: the bar's buttons are on top, not under a scrim.
    const middle = { x: (button!.left + button!.right) / 2, y: (button!.top + button!.bottom) / 2 };
    expect(await topAt(tab, middle.x, middle.y)).toBe('Thumbnails');
    const pages = await pagesOf(tab);
    expect(await topAt(tab, pages.right - 60, (pages.top + pages.bottom) / 2)).toBe('scrim');

    // Another panel's button works, and the overlay stays open beside it.
    await clickBox(tab, await buttonOf(tab, 'Search'), 'the Search button');
    await settle(tab);
    expect(await frameOf(tab, 'search')).not.toBeNull();
    expect(await frameOf(tab, 'thumbnails')).not.toBeNull();

    // Shift+Tab from its first control goes back to the bar before it, instead of round inside.
    await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      root.querySelector<HTMLElement>('[data-epdf-panel="thumbnails"] button')!.focus();
    });
    expect((await focused(tab)).panel).toBe('thumbnails');
    await tab.keyboard.press('Shift+Tab');
    const after = await focused(tab);
    expect(after.panel).toBeNull();
    expect(after.label).not.toBeNull();
    expect(await frameOf(tab, 'thumbnails')).not.toBeNull();
    await tab.close();
  });

  it('closes an overlay with Escape, giving focus back to its button', async () => {
    const tab = await open(800);
    await clickBox(tab, await buttonOf(tab, 'Thumbnails'), 'the Thumbnails button');
    await settle(tab);
    expect((await focused(tab)).panel).toBe('thumbnails');
    await tab.keyboard.press('Escape');
    await frames(tab);
    expect(await frameOf(tab, 'thumbnails')).toBeNull();
    expect((await focused(tab)).label).toBe('Thumbnails');
    await tab.close();
  });

  it('is a sheet from the bottom on a phone, which its handle drags down to close', async () => {
    const tab = await open(375);
    await execute(tab, 'panel:thumbnails');
    await settle(tab);
    const frame = await frameOf(tab, 'thumbnails');
    expect(frame).toMatchObject({
      present: 'sheet',
      role: 'dialog',
      label: 'Thumbnails',
      inTopLayer: true,
    });
    expect(Math.round(frame!.box.bottom)).toBe(800);
    expect(Math.round(frame!.box.top)).toBe(400);
    expect((await focused(tab)).panel).toBe('thumbnails');

    const handle = await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const rect = root
        .querySelector('[data-epdf-panel="thumbnails"] [data-epdf-sheet-handle]')!
        .getBoundingClientRect();
      return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    });
    await tab.mouse.move(handle.x, handle.y);
    await tab.mouse.down();
    await tab.mouse.move(handle.x, handle.y + 300, { steps: 12 });
    await tab.waitForTimeout(150);
    await tab.mouse.up();
    await frames(tab);
    expect(await frameOf(tab, 'thumbnails')).toBeNull();
    await tab.close();
  });

  it('closes a sheet of thumbnails when a page is picked in it', async () => {
    const tab = await open(375);
    await execute(tab, 'panel:thumbnails');
    await settle(tab);
    const thumb = await tab.waitForFunction(
      () => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const button = root.querySelector('[data-epdf-panel="thumbnails"] button[title="Page 2"]');
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      },
      null,
      { timeout: 10_000 },
    );
    // Its top, which shows in the sheet even when the rest of it is lower down.
    const box = (await thumb.jsonValue()) as Box;
    expect(box.top).toBeLessThan(780);
    await tab.mouse.click((box.left + box.right) / 2, box.top + 12);
    await frames(tab);
    expect(await frameOf(tab, 'thumbnails')).toBeNull();
    await tab.waitForFunction(() =>
      /Page 2 of/.test(document.querySelector('embedpdf-viewer')?.shadowRoot?.textContent ?? ''),
    );
    await tab.close();
  });
  it('wraps the thumbnails into more columns as the panel widens', async () => {
    const tab = await open(1280);
    await clickBox(tab, await buttonOf(tab, 'Thumbnails'), 'the Thumbnails button');
    await tab.waitForFunction(
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-epdf-panel="thumbnails"] button[title="Page 2"]'),
      null,
      { timeout: 10_000 },
    );
    expect(await thumbsOf(tab)).toEqual({ columns: 1, width: 150 });
    // Two 150 px thumbs, the 16 px between them and 12 px on either side fit in 340.
    await dragEdge(tab, 'thumbnails', 80);
    await settle(tab);
    expect(widthOf((await frameOf(tab, 'thumbnails'))!.box)).toBe(368);
    expect((await thumbsOf(tab)).columns).toBe(2);
    await tab.close();
  });

  it('opens each panel the way the layout says for the size, and keeps the other sizes', async () => {
    const medium = await open(800, '/configured.html');
    await execute(medium, 'panel:thumbnails');
    await settle(medium);
    // `panels({ present: { medium: 'dock' } })` reached every panel.
    expect(await frameOf(medium, 'thumbnails')).toMatchObject({ present: 'dock', role: 'region' });
    await execute(medium, 'panel:search');
    await settle(medium);
    expect(await frameOf(medium, 'search')).toMatchObject({ present: 'dock' });
    await medium.close();

    const phone = await open(375, '/configured.html');
    await execute(phone, 'panel:thumbnails');
    await settle(phone);
    // Thumbnails overlay on a phone; search keeps the default there, a sheet.
    expect(await frameOf(phone, 'thumbnails')).toMatchObject({ present: 'overlay' });
    await execute(phone, 'panel:thumbnails');
    await execute(phone, 'panel:search');
    await settle(phone);
    expect(await frameOf(phone, 'search')).toMatchObject({ present: 'sheet' });
    await phone.close();
  });

  it('starts a panel at its width, drags it within its limits, and tells the app', async () => {
    const tab = await open(1280, '/configured.html');
    await execute(tab, 'panel:thumbnails');
    await frames(tab);
    expect(widthOf((await frameOf(tab, 'thumbnails'))!.box)).toBe(320);
    expect(await edgeOf(tab, 'thumbnails')).toMatchObject({ now: '320', min: '260', max: '400' });

    await dragEdge(tab, 'thumbnails', 200);
    expect(widthOf((await frameOf(tab, 'thumbnails'))!.box)).toBe(400);
    // Once, when the drag ended: from the config and as the element's event.
    expect(await heard(tab)).toEqual([
      ['event', 'thumbnails', 400],
      ['config', 'thumbnails', 400],
    ]);

    await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      root.querySelector<HTMLElement>('[data-epdf-panel="thumbnails"] [role="separator"]')!.focus();
    });
    await tab.keyboard.press('Home');
    await frames(tab);
    expect(widthOf((await frameOf(tab, 'thumbnails'))!.box)).toBe(260);
    expect((await heard(tab)).slice(2)).toEqual([
      ['event', 'thumbnails', 260],
      ['config', 'thumbnails', 260],
    ]);
    await tab.close();
  });

  it('has no edge to drag on a panel that is not resizable', async () => {
    const tab = await open(1280, '/configured.html');
    await execute(tab, 'panel:search');
    await frames(tab);
    expect(widthOf((await frameOf(tab, 'search'))!.box)).toBe(288);
    expect(await edgeOf(tab, 'search')).toBeNull();
    await tab.close();
  });

  it('sizes the thumbnails from plugins.thumbnails, and the viewer finds their Stage by name', async () => {
    const tab = await open(1280, '/configured.html');
    await execute(tab, 'panel:thumbnails');
    await tab.waitForFunction(
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-epdf-panel="thumbnails"] button[title="Page 2"]'),
      null,
      { timeout: 10_000 },
    );
    // 100 px thumbs: two fit in the 320 px the layout starts it at.
    expect(await thumbsOf(tab)).toEqual({ columns: 2, width: 100 });
    const settings = await tab.evaluate(() => {
      const { viewer } = (
        window as unknown as {
          element: { viewer: { get(name: string): { getSettings(): Record<string, unknown> } } };
        }
      ).element;
      const { zoom, columns } = viewer.get('thumbnails').getSettings();
      return { zoom, columns };
    });
    expect(settings).toEqual({ zoom: { pageWidth: 100 }, columns: 'auto' });
    await tab.close();
  });
});
