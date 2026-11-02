/**
 * The layout's panels in a running viewer: a panel moved to the other side
 * opens there; two panels on one side take turns, and the open one's header
 * switches between them; a panel of your own gets a working `panel:<id>`
 * button and an empty body; a built-in panel in a whole layout of yours
 * brings its title and icon; a removed panel's button goes; a panel whose
 * feature is turned off closes, live; each panel is a labeled region; each
 * document keeps its own open panels; a panel opens from the start where it
 * docks (`open`); and one that can't close stays open where it docks
 * (`closable: false`).
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
  settle,
  waitForDocument,
  type ViewerHost,
} from './helpers/viewer-host';

const WIDTH = 1100;

/**
 * A page whose viewer, `width` wide, gets `config`, a script expression with `layout` written as a
 * function.
 */
const page = (config: string, width = WIDTH) => `<!doctype html><html><head><meta charset="utf-8">
<title>panels</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: ${width}px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
  window.element.addEventListener('epdf:ready', (event) => { window.viewer = event.detail.viewer; });
</script>
</body></html>`;

const PAGES = {
  '/default.html': page('{}'),
  '/moved.html': page(`{ layout: (layout) => layout.panel('thumbnails', { side: 'end' }) }`),
  '/notes.html': page(`{
    layout: (layout) =>
      layout
        .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
        .add('panel:notes', { to: 'main', group: 'panels' }),
  }`),
  '/removed.html': page(`{ layout: (layout) => layout.removePanel('thumbnails') }`),
  // A reading room: a whole layout naming the built-in search panel, and nothing about its looks.
  '/whole.html': page(`{
    layout: {
      bars: {
        main: { place: 'top', end: [['panel:search', 'document:download']] },
        pager: { place: { float: 'bottom' }, center: [[{ custom: 'page-number' }]] },
      },
      panels: { search: { side: 'end' } },
    },
  }`),
  '/start.html': page(`{ layout: (layout) => layout.panel('comments', { open: true }) }`),
  '/start-phone.html': page(
    `{ layout: (layout) => layout.panel('comments', { open: true }) }`,
    375,
  ),
  '/kept.html': page(`{ layout: (layout) => layout.panel('comments', { closable: false }) }`),
  '/kept-medium.html': page(
    `{ layout: (layout) => layout.panel('comments', { closable: false }) }`,
    800,
  ),
};

type ViewerWindow = Window & {
  element: HTMLElement & { disable: readonly string[]; readOnly: boolean };
  viewer: {
    commands: {
      execute(id: string): Promise<{ status: string }>;
      hasCommand(id: string): boolean;
      resolveCommand(id: string): { visible: boolean; active: boolean } | null;
    };
    documents: {
      open(source: unknown, options?: { name?: string }): Promise<unknown>;
      setActive(id: string): void;
      getActiveId(): string | null;
    };
  };
};

/** Each drawn panel: its id, how it opens, its role and name, its box, and its header's text. */
const panelsOf = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    return [...root.querySelectorAll<HTMLElement>('[data-epdf-panel]')].map((panel) => {
      const { left, right } = panel.getBoundingClientRect();
      const slot = panel.querySelector('slot');
      return {
        id: panel.dataset.epdfPanel!,
        present: panel.dataset.present ?? null,
        role: panel.getAttribute('role'),
        name: panel.getAttribute('aria-label'),
        left,
        right,
        slot: slot?.getAttribute('name') ?? null,
        // What the slot holds: your own elements, else the built-in content.
        filled: slot ? slot.assignedNodes({ flatten: true }).length > 0 : false,
        switcher: panel.querySelector('[data-epdf-panel-switcher]') !== null,
      };
    });
  });

/** The live buttons' labels in a bar: not the measurement layer's copies. */
const buttonsOf = (tab: Page, bar: string) =>
  tab.evaluate((id) => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    return [...root.querySelectorAll(`[data-bar="${id}"] button`)]
      .filter((button) => !button.closest('[aria-hidden="true"]'))
      .map((button) => button.getAttribute('aria-label') ?? button.textContent ?? '');
  }, bar);

/** Whether the open panel `id` has a close button in its header. */
const hasCloseButton = (tab: Page, id: string) =>
  tab.evaluate(
    (panel) =>
      document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelector(
          `[data-epdf-panel="${panel}"] [part="panel-header"] button[aria-label="Close"]`,
        ) !== null,
    id,
  );

/** The title in the open panel `id`'s header: its own, or the switcher's. */
const headerOf = (tab: Page, id: string) =>
  tab.evaluate(
    (panel) =>
      document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelector(
          `[data-epdf-panel="${panel}"] [part="panel-header"] :is(h2, [data-epdf-panel-switcher] .truncate)`,
        )
        ?.textContent?.trim() ?? null,
    id,
  );

/** Click the live element `selector` matches whose label or text is `label`. */
const click = async (tab: Page, selector: string, label: string) => {
  const box = await tab.evaluate(
    ([within, name]) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const element = [...root.querySelectorAll<HTMLElement>(within)].find(
        (candidate) =>
          !candidate.closest('[aria-hidden="true"]') &&
          (candidate.getAttribute('aria-label') === name ||
            candidate.textContent?.trim() === name ||
            // A menu row: its label, beside the shortcut it shows.
            candidate.querySelector('.truncate')?.textContent === name),
      );
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    [selector, label] as const,
  );
  expect(box, `${selector} "${label}"`).not.toBeNull();
  await tab.mouse.click(box!.x, box!.y);
  await frames(tab);
};

const run = async (tab: Page, id: string) => {
  const result = await tab.evaluate(
    (command) => (window as unknown as ViewerWindow).viewer.commands.execute(command),
    id,
  );
  await frames(tab);
  return result.status;
};

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('panels', () => {
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
    await tab.waitForFunction(
      () => (window as unknown as Partial<ViewerWindow>).viewer !== undefined,
    );
    await frames(tab);
    return tab;
  };

  it('docks the thumbnails at the start from their button, as a region named by the title', async () => {
    const tab = await open('/default.html');
    expect(await panelsOf(tab)).toEqual([]);
    await click(tab, '[data-bar="main"] button', 'Thumbnails');
    const [thumbnails] = await panelsOf(tab);
    expect(thumbnails).toMatchObject({
      id: 'thumbnails',
      present: 'dock',
      role: 'region',
      name: 'Thumbnails',
      slot: 'panel:thumbnails',
      filled: true,
    });
    expect(thumbnails!.left).toBe(0);
    // The outline and the attachments show beside them (the session may add to both), so the
    // title switches between them.
    expect(thumbnails!.switcher).toBe(true);
    await tab.close();
  });

  it('opens a panel on the side the layout moves it to', async () => {
    const tab = await open('/moved.html');
    expect(await run(tab, 'panel:thumbnails')).toBe('executed');
    const [thumbnails] = await panelsOf(tab);
    expect(thumbnails).toMatchObject({ id: 'thumbnails', present: 'dock' });
    expect(thumbnails!.right).toBe(WIDTH);
    // It takes turns with the other panels at the end now.
    await run(tab, 'panel:search');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['search']);
    await tab.close();
  });

  it('opens one panel per side, both sides at once, and the header switches between a side', async () => {
    const tab = await open('/default.html');
    await run(tab, 'panel:search');
    await run(tab, 'panel:comments');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['comments']);
    await run(tab, 'panel:thumbnails');
    const both = await panelsOf(tab);
    expect(both.map((panel) => panel.id)).toEqual(['thumbnails', 'comments']);
    expect(both[1]!.switcher).toBe(true);

    await click(tab, '[data-epdf-panel="comments"] [data-epdf-panel-switcher]', 'Comments');
    const rows = await tab.evaluate(() =>
      [
        ...document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelectorAll('[role="menu"] [role="menuitemradio"]'),
      ].map((row) => ({
        // The label, without the shortcut the row shows beside it.
        label: row.querySelector('.truncate')?.textContent ?? row.textContent,
        checked: row.getAttribute('aria-checked'),
      })),
    );
    expect(rows).toContainEqual({ label: 'Comments', checked: 'true' });
    expect(rows).toContainEqual({ label: 'Search', checked: 'false' });
    expect(rows.map((row) => row.label)).not.toContain('Thumbnails');

    await click(tab, '[role="menu"] [role="menuitemradio"]', 'Search');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['thumbnails', 'search']);
    await tab.close();
  });

  it('gives a panel of your own a working button and an empty body', async () => {
    const tab = await open('/notes.html');
    expect(await buttonsOf(tab, 'main')).toContain('Notes');
    await click(tab, '[data-bar="main"] button', 'Notes');
    const [notes] = await panelsOf(tab);
    expect(notes).toMatchObject({
      id: 'notes',
      role: 'region',
      name: 'Notes',
      slot: 'panel:notes',
      filled: false,
    });
    const active = await tab.evaluate(
      () =>
        (window as unknown as ViewerWindow).viewer.commands.resolveCommand('panel:notes')?.active,
    );
    expect(active).toBe(true);
    // It takes turns with the built-in panels on its side.
    await run(tab, 'panel:comments');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['comments']);
    await tab.close();
  });

  it('gives a built-in panel its title and icon in a whole layout of yours', async () => {
    const tab = await open('/whole.html');
    const button = await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const search = [...root.querySelectorAll('[data-bar="main"] button')].find(
        (candidate) =>
          !candidate.closest('[aria-hidden="true"]') &&
          candidate.getAttribute('aria-label') === 'Search',
      );
      return search ? { icon: search.querySelector('svg') !== null } : null;
    });
    expect(button).toEqual({ icon: true });
    await click(tab, '[data-bar="main"] button', 'Search');
    const [search] = await panelsOf(tab);
    expect(search).toMatchObject({ id: 'search', name: 'Search', filled: true });
    expect(await headerOf(tab, 'search')).toBe('Search');
    await tab.close();
  });

  it("takes a removed panel's button out of every bar, with its command", async () => {
    const tab = await open('/removed.html');
    expect(await buttonsOf(tab, 'main')).not.toContain('Thumbnails');
    const exists = await tab.evaluate(() =>
      (window as unknown as ViewerWindow).viewer.commands.hasCommand('panel:thumbnails'),
    );
    expect(exists).toBe(false);
    await tab.close();
  });

  it('closes an open panel whose feature is turned off, and its button goes, live', async () => {
    const tab = await open('/default.html');
    await run(tab, 'panel:thumbnails');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['thumbnails']);

    await tab.evaluate(() => {
      (window as unknown as ViewerWindow).element.disable = ['thumbnails'];
    });
    await frames(tab);
    expect(await panelsOf(tab)).toEqual([]);
    expect(await buttonsOf(tab, 'main')).not.toContain('Thumbnails');

    // On again: the button is back, and the panel stays closed.
    await tab.evaluate(() => {
      (window as unknown as ViewerWindow).element.disable = [];
    });
    await frames(tab);
    expect(await buttonsOf(tab, 'main')).toContain('Thumbnails');
    expect(await panelsOf(tab)).toEqual([]);

    // readOnly turns the annotations off, and the style panel with them.
    await run(tab, 'panel:style');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['style']);
    await tab.evaluate(() => {
      (window as unknown as ViewerWindow).element.readOnly = true;
    });
    await frames(tab);
    expect(await panelsOf(tab)).toEqual([]);
    await tab.close();
  });

  it('opens a panel from a tool through the panel, on its side', async () => {
    const tab = await open('/default.html');
    await run(tab, 'panel:comments');
    expect(await run(tab, 'tool:stamp')).toBe('executed');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['stamps']);
    const active = await tab.evaluate(
      () =>
        (window as unknown as ViewerWindow).viewer.commands.resolveCommand('tool:stamp')?.active,
    );
    expect(active).toBe(true);
    await run(tab, 'tool:stamp');
    expect(await panelsOf(tab)).toEqual([]);
    await tab.close();
  });

  it('keeps each document its own open panels', async () => {
    const tab = await open('/default.html');
    const first = await tab.evaluate(() =>
      (window as unknown as ViewerWindow).viewer.documents.getActiveId(),
    );
    await run(tab, 'panel:comments');

    const second = await tab.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());
      const { documents } = (window as unknown as ViewerWindow).viewer;
      await documents.open({ kind: 'bytes', id: 'second', bytes }, { name: 'Second' });
      return documents.getActiveId();
    });
    await waitForDocument(tab);
    await frames(tab);
    expect(await panelsOf(tab)).toEqual([]);
    await run(tab, 'panel:thumbnails');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['thumbnails']);

    const show = async (id: string | null) => {
      await tab.evaluate(
        (documentId) => (window as unknown as ViewerWindow).viewer.documents.setActive(documentId!),
        id,
      );
      await waitForDocument(tab);
      await frames(tab);
      return (await panelsOf(tab)).map((panel) => panel.id);
    };
    expect(await show(first)).toEqual(['comments']);
    expect(await show(second)).toEqual(['thumbnails']);
    await tab.close();
  });

  /** Open a second document and show it. */
  const openSecond = async (tab: Page) => {
    await tab.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());
      const { documents } = (window as unknown as ViewerWindow).viewer;
      await documents.open({ kind: 'bytes', id: 'second', bytes }, { name: 'Second' });
    });
    await waitForDocument(tab);
    await frames(tab);
  };

  it('opens a panel from the start where it docks, in each document, and leaves it closed once closed', async () => {
    const tab = await open('/start.html');
    expect((await panelsOf(tab)).map((panel) => [panel.id, panel.present])).toEqual([
      ['comments', 'dock'],
    ]);
    // Closed, it stays closed.
    await run(tab, 'panel:comments');
    expect(await panelsOf(tab)).toEqual([]);
    await run(tab, 'panel:thumbnails');
    await run(tab, 'panel:thumbnails');
    expect(await panelsOf(tab)).toEqual([]);
    // A document that opens next has it open.
    await openSecond(tab);
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['comments']);
    await tab.close();

    // On a phone it would be a sheet over the pages: it waits for its button.
    const phone = await open('/start-phone.html');
    expect(await panelsOf(phone)).toEqual([]);
    await phone.close();
  });

  it("keeps a panel that can't close open where it docks: no close button, and back after another on its side", async () => {
    const tab = await open('/kept.html');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['comments']);
    expect(await hasCloseButton(tab, 'comments')).toBe(false);
    // Its button opens it and leaves it open.
    expect(await run(tab, 'panel:comments')).toBe('executed');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['comments']);
    const active = await tab.evaluate(
      () =>
        (window as unknown as ViewerWindow).viewer.commands.resolveCommand('panel:comments')
          ?.active,
    );
    expect(active).toBe(true);

    // Another panel on its side takes its place, until it closes.
    await run(tab, 'panel:search');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['search']);
    expect(await hasCloseButton(tab, 'search')).toBe(true);
    await click(tab, '[data-epdf-panel="search"] [part="panel-header"] button', 'Close');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['comments']);
    // The other side is free.
    await run(tab, 'panel:thumbnails');
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['thumbnails', 'comments']);
    // A document that opens next has it open too.
    await openSecond(tab);
    expect((await panelsOf(tab)).map((panel) => panel.id)).toEqual(['comments']);
    await tab.close();

    // Over the pages it closes like any panel.
    const medium = await open('/kept-medium.html');
    expect(await panelsOf(medium)).toEqual([]);
    await run(medium, 'panel:comments');
    expect(await panelsOf(medium)).toMatchObject([{ id: 'comments', present: 'overlay' }]);
    expect(await hasCloseButton(medium, 'comments')).toBe(true);
    // It slides in: its Close button is where it ends up once it has.
    await settle(medium);
    await click(medium, '[data-epdf-panel="comments"] [part="panel-header"] button', 'Close');
    expect(await panelsOf(medium)).toEqual([]);
    await medium.close();
  });
});
