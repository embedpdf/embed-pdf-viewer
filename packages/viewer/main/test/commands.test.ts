/**
 * Buttons & commands, as the page says: a command of yours with its own `label`, whose functions
 * get `get` (a plugin by its name), the `viewer` and the `documentId`; a command with a built-in
 * id that gives only what it changes; icons as path data, `{ paths, fill }` filled, and a
 * built-in icon replaced everywhere by one of the same name; and every built-in command the
 * page lists, with a tool of your own getting its `tool:<id>` too.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const here = dirname(fileURLToPath(import.meta.url));
const COMMANDS_PAGE = resolve(here, '../../../../docs/content/viewer/customize/commands.mdx');

/** The command ids the page's "Every built-in command" table lists. */
function documentedCommandIds(): string[] {
  const page = readFileSync(COMMANDS_PAGE, 'utf8');
  const table = page.split('## Every built-in command')[1]!.split('\n## ')[0]!;
  return [...table.matchAll(/`([a-z-]+:[a-z0-9-]+)`/g)].map((match) => match[1]!);
}

/** The config, as script: it holds functions, so it can't travel as JSON. */
const CONFIG = `{
  target: '#viewer',
  src: '/sample.pdf',
  theme: 'light',
  icons: {
    logo: { paths: ['M4 4h16v16H4z'], fill: true },
    // The built-in download icon, replaced: one path, as a string.
    download: 'M2 2h20',
  },
  commands: [
    {
      id: 'acme:probe',
      label: 'Probe',
      icon: 'logo',
      enabled: ({ get }) => typeof get('stage').zoomIn === 'function',
      run: ({ get, viewer, documentId }) => {
        window.heard.push({
          sameViewer: viewer === window.element.viewer,
          documentId,
          active: viewer.documents.getActiveId(),
          pages: get('stage').getPageCount() > 0,
        });
      },
    },
    // Only what changes: the label, icon and shortcut stay the built-in ones.
    { id: 'document:download', run: ({ documentId }) => window.heard.push({ downloaded: documentId }) },
    { id: 'document:print', label: 'Print it' },
  ],
  plugins: {
    annotation: {
      tools: [{ id: 'approved', extends: 'free-text', meta: { label: 'Approved' } }],
    },
  },
  layout: (layout) => layout.add('acme:probe', { to: 'main', section: 'end' }),
}`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>commands</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1200px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.heard = [];
  window.printed = 0;
  // No PDF viewer, so the viewer prints pictures from a frame of its own. Where the browser's PDF
  // viewer shows the copy, the print() the stub below sets when the frame loads isn't always the
  // one the print reaches.
  Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false });
  // What the browser's print dialog would do: each print frame's print() counts, and printing
  // finishes at once.
  new MutationObserver((records) => {
    for (const node of records.flatMap((record) => [...record.addedNodes])) {
      if (!(node instanceof HTMLIFrameElement)) continue;
      node.addEventListener('load', () => {
        const view = node.contentWindow;
        view.print = () => {
          window.printed += 1;
          view.dispatchEvent(new Event('afterprint'));
        };
      });
    }
  }).observe(document.body, { childList: true });
  window.element = EmbedPDF.init(${CONFIG});
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

type Heard = { heard: unknown[]; printed: number };
const heard = (tab: Page) =>
  tab.evaluate(() => {
    const record = window as unknown as Heard;
    return { heard: record.heard, printed: record.printed };
  });

const resolved = (tab: Page, id: string) =>
  tab.evaluate((commandId) => {
    const command = window.element.viewer.commands.resolveCommand(commandId);
    return (
      command && {
        label: command.label,
        icon: command.icon ?? null,
        shortcuts: command.shortcuts,
        enabled: command.enabled,
        visible: command.visible,
      }
    );
  }, id);

const execute = (tab: Page, id: string, args?: unknown) =>
  tab.evaluate(
    ([commandId, given]) =>
      window.element.viewer.commands.execute(
        commandId,
        given === undefined ? undefined : { args: given },
      ),
    [id, args] as const,
  );

/** The paths of the icon in the live button or menu row with this label, as `d fill stroke`. */
const iconPathsOf = (tab: Page, label: string) =>
  tab.evaluate((name) => {
    const root = window.element.shadowRoot!;
    const candidates = [
      ...root.querySelectorAll(`button[aria-label="${name}"], button[title="${name}"]`),
      ...[...root.querySelectorAll('[role^="menuitem"]')].filter(
        (row) => row.querySelector('.truncate')?.textContent === name,
      ),
    ].filter((candidate) => !candidate.closest('[aria-hidden="true"]'));
    const svg = candidates[0]?.querySelector('svg');
    return svg
      ? [...svg.querySelectorAll('path')].map(
          (path) =>
            `${path.getAttribute('d')} ${path.getAttribute('fill')} ${path.getAttribute('stroke')}`,
        )
      : null;
  }, label);

const currentPage = (tab: Page) =>
  tab.evaluate(() => window.element.viewer.get('stage').getCurrentPageIndex() as number);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('buttons and commands', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    host = await serveViewer({ '/commands.html': PAGE });
    browser = await launchChromium();
    tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/commands.html`);
    await waitForDocument(tab);
    await frames(tab);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('shows your command by its own label, and gives its functions get, the viewer and the document', async () => {
    expect(await resolved(tab, 'acme:probe')).toMatchObject({
      label: 'Probe',
      icon: 'logo',
      enabled: true,
      visible: true,
    });
    expect(await execute(tab, 'acme:probe')).toEqual({ status: 'executed' });
    const active = await tab.evaluate(() => window.element.viewer.documents.getActiveId());
    expect((await heard(tab)).heard).toEqual([
      { sameViewer: true, documentId: active, active, pages: true },
    ]);
  });

  it('merges a command with a built-in id over the built-in one: what it leaves out stays', async () => {
    expect(await resolved(tab, 'document:download')).toMatchObject({
      label: 'Download',
      icon: 'download',
      shortcuts: ['Mod+S'],
      enabled: true,
      visible: true,
    });
    const active = await tab.evaluate(() => window.element.viewer.documents.getActiveId());
    expect(await execute(tab, 'document:download')).toEqual({ status: 'executed' });
    expect((await heard(tab)).heard.at(-1)).toEqual({ downloaded: active });

    // A label alone keeps the built-in run.
    expect(await resolved(tab, 'document:print')).toMatchObject({
      label: 'Print it',
      icon: 'print',
      shortcuts: ['Mod+P'],
    });
    expect(await execute(tab, 'document:print')).toEqual({ status: 'executed' });
    // It opens the Print dialog, which prepares the pages; its Print button prints them.
    const PRINT_BUTTON = '[role="dialog"] button[type="submit"]';
    await tab.waitForFunction(
      (selector) =>
        window.element.shadowRoot!.querySelector<HTMLButtonElement>(selector)?.disabled === false,
      PRINT_BUTTON,
    );
    await tab.evaluate(
      (selector) => window.element.shadowRoot!.querySelector<HTMLButtonElement>(selector)!.click(),
      PRINT_BUTTON,
    );
    await tab.waitForFunction(() => (window as unknown as Heard).printed === 1);
    await tab.waitForFunction(() => !window.element.shadowRoot!.querySelector('[role="dialog"]'));
  });

  it('draws { paths, fill } filled, and a built-in icon replaced wherever it shows', async () => {
    expect(await iconPathsOf(tab, 'Probe')).toEqual(['M4 4h16v16H4z currentColor none']);
    await execute(tab, 'menu:document');
    await frames(tab);
    expect(await iconPathsOf(tab, 'Download')).toEqual(['M2 2h20 null null']);
    await tab.keyboard.press('Escape');
    await frames(tab);
  });

  it('has every built-in command the page lists, and a command for a tool of your own', async () => {
    const ids = documentedCommandIds();
    expect(ids.length).toBeGreaterThan(80);
    const missing = await tab.evaluate(
      (wanted) => wanted.filter((id) => !window.element.viewer.commands.hasCommand(id)),
      ids,
    );
    expect(missing).toEqual([]);

    expect(await resolved(tab, 'tool:approved')).toMatchObject({
      label: 'Approved',
      visible: true,
    });
    expect(await execute(tab, 'tool:approved')).toEqual({ status: 'executed' });
    expect(
      await tab.evaluate(() => window.element.viewer.get('interaction').getActiveToolId()),
    ).toBe('approved');
    await execute(tab, 'tool:pointer');
  });

  it('moves through the pages, to a page given or one typed in the Go to Page dialog', async () => {
    await execute(tab, 'page:last');
    await tab.waitForFunction(
      () =>
        window.element.viewer.get('stage').getCurrentPageIndex() ===
        window.element.viewer.get('stage').getPageCount() - 1,
    );
    await execute(tab, 'page:first');
    await tab.waitForFunction(() => window.element.viewer.get('stage').getCurrentPageIndex() === 0);
    await execute(tab, 'page:next');
    await tab.waitForFunction(() => window.element.viewer.get('stage').getCurrentPageIndex() === 1);
    await execute(tab, 'page:previous');
    await tab.waitForFunction(() => window.element.viewer.get('stage').getCurrentPageIndex() === 0);

    expect(await execute(tab, 'page:go-to', { page: 3 })).toEqual({ status: 'executed' });
    await tab.waitForFunction(() => window.element.viewer.get('stage').getCurrentPageIndex() === 2);

    await execute(tab, 'page:go-to');
    await frames(tab);
    const field = tab.locator('embedpdf-viewer [role="dialog"] input');
    await field.waitFor({ state: 'visible', timeout: 10_000 });
    // The sentence reads around the field: "Page [3] of 8".
    const sentence = await tab.evaluate(() =>
      [...window.element.shadowRoot!.querySelector('[role="dialog"] label')!.childNodes]
        .map((node) => (node.nodeType === Node.TEXT_NODE ? node.textContent : '[ ]'))
        .join('')
        .trim(),
    );
    expect(sentence).toMatch(/^Page \[ \] of \d+$/);
    await field.fill('2');
    await field.press('Enter');
    await tab.waitForFunction(() => window.element.viewer.get('stage').getCurrentPageIndex() === 1);
    expect(await tab.locator('embedpdf-viewer [role="dialog"]').count()).toBe(0);
    expect(await currentPage(tab)).toBe(1);
  });

  it('highlights, underlines and strikes out selected text', async () => {
    const markup = async (id: string) => {
      await tab.evaluate(() => window.element.viewer.get('selection').selectPage(0));
      await tab.waitForFunction(() => window.element.viewer.get('selection').hasSelection());
      expect(await resolved(tab, id)).toMatchObject({ visible: true, enabled: true });
      expect(await execute(tab, id)).toEqual({ status: 'executed' });
    };
    const subtypes = () =>
      tab.evaluate(() =>
        (
          window.element.viewer.get('annotation').list({ pages: [0] }) as Array<{ subtype: string }>
        ).map((annotation) => annotation.subtype),
      );
    const before = await subtypes();
    await markup('selection:highlight');
    await markup('selection:underline');
    await markup('selection:strikeout');
    await tab.waitForFunction(
      (count) => window.element.viewer.get('annotation').list({ pages: [0] }).length >= count + 3,
      before.length,
    );
    expect((await subtypes()).slice(before.length).sort()).toEqual([
      'highlight',
      'strikeout',
      'underline',
    ]);
    // Without a selection they're not offered.
    await tab.evaluate(() => window.element.viewer.get('selection').clear());
    expect(await resolved(tab, 'selection:highlight')).toMatchObject({ visible: false });
  });

  it('asks before removing marked areas for good: redaction:apply opens the confirmation', async () => {
    expect(await resolved(tab, 'redaction:apply')).toMatchObject({ enabled: false });
    await tab.evaluate(async () => {
      await window.element.viewer
        .get('redaction')
        .markArea(0, { x: 100, y: 100, width: 120, height: 40 });
    });
    await tab.waitForFunction(() => window.element.viewer.get('redaction').getPendingCount() > 0);
    expect(await resolved(tab, 'redaction:apply')).toMatchObject({ enabled: true, visible: true });
    expect(await execute(tab, 'redaction:apply')).toEqual({ status: 'executed' });
    const dialog = tab.locator('embedpdf-viewer [role="dialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await dialog.textContent()).toContain('Apply redactions?');
    await tab.keyboard.press('Escape');
    await frames(tab);
  });
});
