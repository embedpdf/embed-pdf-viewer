/**
 * People open files themselves, as Documents says: **Open** in the document menu asks for a
 * file, and a PDF dropped on the pages opens too, each as a new tab. A
 * drop target shows while a PDF is dragged over; other files and text are left to the page.
 * `disable: ['documents.open']` turns off both ways, and the tab strip has no "+" of its own.
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

const page = (config: unknown) => `<!doctype html><html><head><meta charset="utf-8">
<title>opening files</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    theme: 'light',
    ...${JSON.stringify(config)},
  });
</script>
</body></html>`;

const PAGES = {
  '/open.html': page({}),
  '/no-open.html': page({ disable: ['documents.open'] }),
};

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

/** The open documents, in tab order, and which one shows. */
const documentsOf = (tab: Page) =>
  tab.evaluate(() => {
    const documents = window.element.viewer.documents;
    return {
      names: (documents.list() as Array<{ name: string }>).map((document) => document.name),
      active: (documents.getActive() as { name: string } | null)?.name ?? null,
    };
  });

/** Wait until `count` documents are open and the active one is ready. */
const waitForDocuments = (tab: Page, count: number) =>
  tab.waitForFunction(
    (wanted) => {
      const documents = window.element.viewer.documents;
      return documents.getCount() === wanted && documents.getActive()?.status === 'ready';
    },
    count,
    { timeout: 60_000 },
  );

/** The live (not the measurement layer's) button with this label or tooltip: click its middle. */
async function clickButton(tab: Page, label: string): Promise<void> {
  const box = await tab.evaluate((name) => {
    const root = window.element.shadowRoot!;
    const button = [
      ...root.querySelectorAll(`button[aria-label="${name}"], button[title="${name}"]`),
    ].find((candidate) => !candidate.closest('[aria-hidden="true"]'));
    const rect = button?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  }, label);
  expect(box, `a button "${label}"`).not.toBeNull();
  await tab.mouse.click(box!.x, box!.y);
  await frames(tab);
}

/** The rows of the open menus, by their labels. */
const menuRows = (tab: Page) =>
  tab.evaluate(() =>
    [...window.element.shadowRoot!.querySelectorAll('[role="menu"]')]
      .filter((menu) => menu.matches(':popover-open'))
      .flatMap((menu) => [...menu.querySelectorAll('[role^="menuitem"]')])
      .map((row) => row.querySelector('.truncate')?.textContent ?? ''),
  );

/** Click the open menu's row with this label. */
async function clickRow(tab: Page, label: string): Promise<void> {
  const box = await tab.evaluate((name) => {
    const row = [...window.element.shadowRoot!.querySelectorAll('[role^="menuitem"]')].find(
      (candidate) => candidate.querySelector('.truncate')?.textContent === name,
    );
    const rect = row?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  }, label);
  expect(box, `a row "${label}"`).not.toBeNull();
  await tab.mouse.click(box!.x, box!.y);
}

type Dragged = { file: string; type: string } | { text: string };

/**
 * Drag something over the middle of the pages and drop it, as the browser does: `dragenter`,
 * `dragover`, then `drop`, on the element there. Says whether the drop target showed and whether
 * the viewer took the drag (`dragover`) and the drop.
 */
const drop = (tab: Page, dragged: Dragged) =>
  tab.evaluate(async (what) => {
    const transfer = new DataTransfer();
    if ('text' in what) {
      transfer.setData('text/plain', what.text);
    } else {
      const bytes =
        what.type === 'application/pdf'
          ? await (await fetch('/sample.pdf')).arrayBuffer()
          : new ArrayBuffer(8);
      transfer.items.add(new File([bytes], what.file, { type: what.type }));
    }
    const root = window.element.shadowRoot!;
    const box = window.element.getBoundingClientRect();
    const target = root.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)!;
    const send = (type: string) => {
      const event = new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        dataTransfer: transfer,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const frame = () =>
      new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    send('dragenter');
    const tookDrag = send('dragover');
    await frame();
    const targetShown = root.querySelector('[data-epdf-drop-target]') !== null;
    const tookDrop = send('drop');
    await frame();
    const targetAfter = root.querySelector('[data-epdf-drop-target]') !== null;
    return { targetShown, tookDrag, tookDrop, targetAfter };
  }, dragged);

const LEFT_TO_THE_PAGE = {
  targetShown: false,
  tookDrag: false,
  tookDrop: false,
  targetAfter: false,
};

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('opening files', () => {
  let host: ViewerHost;
  let browser: Browser;
  let pdf: Buffer;

  beforeAll(async () => {
    host = await serveViewer(PAGES);
    browser = await launchChromium();
    pdf = Buffer.from(await (await fetch(`${host.origin}/sample.pdf`)).arrayBuffer());
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

  it('opens the file picked after Open in the document menu as a new tab', async () => {
    const tab = await open('/open.html');
    await clickButton(tab, 'Menu');
    expect((await menuRows(tab))[0]).toBe('Open');
    const [chooser] = await Promise.all([tab.waitForEvent('filechooser'), clickRow(tab, 'Open')]);
    expect(await chooser.element().getAttribute('accept')).toBe('.pdf,application/pdf');
    expect(chooser.isMultiple()).toBe(false);
    await chooser.setFiles({ name: 'second.pdf', mimeType: 'application/pdf', buffer: pdf });
    await waitForDocuments(tab, 2);
    expect(await documentsOf(tab)).toEqual({ names: ['sample', 'second'], active: 'second' });
    await tab.close();
  });

  it('opens a PDF dropped on the pages as a new tab, with a drop target while it is over them', async () => {
    const tab = await open('/open.html');
    expect(await drop(tab, { file: 'dropped.pdf', type: 'application/pdf' })).toEqual({
      targetShown: true,
      tookDrag: true,
      tookDrop: true,
      targetAfter: false,
    });
    await waitForDocuments(tab, 2);
    expect(await documentsOf(tab)).toEqual({ names: ['sample', 'dropped'], active: 'dropped' });
    await tab.close();
  });

  it('leaves other files and dragged text to the page', async () => {
    const tab = await open('/open.html');
    expect(await drop(tab, { file: 'notes.txt', type: 'text/plain' })).toEqual(LEFT_TO_THE_PAGE);
    expect(await drop(tab, { text: 'a selection' })).toEqual(LEFT_TO_THE_PAGE);
    await frames(tab);
    expect((await documentsOf(tab)).names).toEqual(['sample']);
    await tab.close();
  });

  it("has neither Open nor drops with disable: ['documents.open']", async () => {
    const tab = await open('/no-open.html');
    await clickButton(tab, 'Menu');
    const rows = await menuRows(tab);
    expect(rows).toContain('Download');
    expect(rows).not.toContain('Open');
    await tab.keyboard.press('Escape');
    expect(await drop(tab, { file: 'dropped.pdf', type: 'application/pdf' })).toEqual(
      LEFT_TO_THE_PAGE,
    );
    await frames(tab);
    expect((await documentsOf(tab)).names).toEqual(['sample']);
    await tab.close();
  });

  it('shows tabs with no "+": a tab strip button only closes a document', async () => {
    const tab = await open('/open.html');
    await tab.evaluate(() =>
      window.element.viewer.documents.open({ kind: 'url', url: '/sample.pdf' }, { name: 'Copy' }),
    );
    await waitForDocuments(tab, 2);
    await frames(tab);
    const strip = await tab.evaluate(() => {
      const tabs = [...window.element.shadowRoot!.querySelectorAll('[role="tab"]')];
      const bar = tabs[0]?.parentElement?.parentElement;
      return {
        tabs: tabs.map((element) => element.textContent),
        buttons: [...(bar?.querySelectorAll('button') ?? [])].map((button) =>
          button.getAttribute('aria-label'),
        ),
      };
    });
    expect(strip.tabs).toEqual(['sample', 'Copy']);
    expect(strip.buttons).toEqual(['Close Copy']);
    await tab.close();
  });
});
