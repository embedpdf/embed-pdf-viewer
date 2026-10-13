/**
 * Keyboard shortcuts reach a viewer only while focus is inside it: with two viewers on a page
 * one key press runs in one of them, and the page keeps its keys everywhere else. A press on
 * the pages puts focus inside. Your shortcut wins over a built-in one with the same keys; `?`
 * opens the sheet with every shortcut; Ctrl/Cmd+F opens search (Find), Ctrl/Cmd+O opens a file, and
 * Delete removes the selected annotations.
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

/** One viewer's config, as script: a command of yours whose shortcut a built-in one has too. */
const configFor = (name: string) => `{
  target: '#${name}',
  src: '/sample.pdf',
  theme: 'light',
  commands: [
    { id: 'acme:save', label: 'Save', shortcut: 'Mod+S', run: () => window.saved.push('${name}') },
  ],
}`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>shortcuts</title>
<style>
  body { margin: 0; }
  #a { position: absolute; left: 0; top: 40px; width: 620px; height: 700px; display: block; }
  #b { position: absolute; left: 640px; top: 40px; width: 620px; height: 700px; display: block; }
</style></head>
<body>
<button id="outside">Page button</button>
<div id="a"></div>
<div id="b"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.saved = [];
  window.prevented = [];
  window.viewers = { a: EmbedPDF.init(${configFor('a')}), b: EmbedPDF.init(${configFor('b')}) };
  // After the viewers' own listeners: whether one of them took the key.
  window.addEventListener('keydown', (event) => window.prevented.push(event.defaultPrevented));
</script>
</body></html>`;

type Name = 'a' | 'b';
interface PageRecord {
  saved: string[];
  prevented: boolean[];
  viewers: { [name in Name]: HTMLElement & { viewer: any } };
}

const record = (tab: Page) =>
  tab.evaluate(() => {
    const { saved, prevented } = window as unknown as PageRecord;
    return { saved: [...saved], prevented: prevented.at(-1) ?? null };
  });

/** Click the middle of a viewer's pages, which puts focus inside it. */
async function clickPages(tab: Page, name: Name): Promise<void> {
  const box = await tab.evaluate(
    (which) => document.getElementById(which)!.getBoundingClientRect().toJSON(),
    name,
  );
  await tab.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  await frames(tab);
}

/** Whether focus is inside a viewer: somewhere in its shadow root, or the element itself. */
const hasFocus = (tab: Page, name: Name) =>
  tab.evaluate((which) => {
    const element = (window as unknown as PageRecord).viewers[which];
    return document.activeElement === element && element.shadowRoot!.activeElement !== null;
  }, name);

/** The shortcuts sheet a viewer shows: its groups and rows, or null while it's closed. */
const sheetOf = (tab: Page, name: Name) =>
  tab.evaluate((which) => {
    const root = (window as unknown as PageRecord).viewers[which].shadowRoot!;
    const sheet = root.querySelector('[data-epdf-shortcuts]');
    if (!sheet) return null;
    return [...sheet.querySelectorAll('section')].map((section) => ({
      group: section.querySelector('h3')?.textContent ?? '',
      rows: [...section.querySelectorAll('[data-epdf-shortcut]')].map((row) => [
        row.querySelector('dt')?.textContent ?? '',
        [...row.querySelectorAll('kbd')].map((key) => key.textContent ?? ''),
      ]),
    }));
  }, name);

/** Whether a viewer's search panel is open. */
const searchOpen = (tab: Page, name: Name) =>
  tab.evaluate(
    (which) =>
      (window as unknown as PageRecord).viewers[which].viewer
        .get('shell')
        .isOpen('search') as boolean,
    name,
  );

/** A command's shortcuts in a viewer. */
const shortcutsOf = (tab: Page, name: Name, id: string) =>
  tab.evaluate(
    ([which, commandId]) =>
      (window as unknown as PageRecord).viewers[which].viewer.commands.resolveCommand(commandId)
        ?.shortcuts as string[],
    [name, id] as const,
  );

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('keyboard shortcuts', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    host = await serveViewer({ '/shortcuts.html': PAGE });
    browser = await launchChromium();
    tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/shortcuts.html`);
    await tab.waitForFunction(
      () =>
        Object.values((window as unknown as PageRecord).viewers).every((element) =>
          /Page 1 of \d+/.test(element.shadowRoot?.textContent ?? ''),
        ),
      null,
      { timeout: 60_000 },
    );
    await waitForDocument(tab);
    await frames(tab);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('runs a key in the viewer that has focus only, and leaves it to the page elsewhere', async () => {
    await tab.focus('#outside');
    await tab.keyboard.press('ControlOrMeta+s');
    expect(await record(tab)).toEqual({ saved: [], prevented: false });

    await clickPages(tab, 'a');
    expect(await hasFocus(tab, 'a')).toBe(true);
    await tab.keyboard.press('ControlOrMeta+s');
    expect(await record(tab)).toEqual({ saved: ['a'], prevented: true });

    await clickPages(tab, 'b');
    expect(await hasFocus(tab, 'b')).toBe(true);
    await tab.keyboard.press('ControlOrMeta+s');
    expect(await record(tab)).toEqual({ saved: ['a', 'b'], prevented: true });

    await tab.focus('#outside');
    await tab.keyboard.press('ControlOrMeta+f');
    expect((await record(tab)).prevented).toBe(false);
    expect(await searchOpen(tab, 'a')).toBe(false);
  });

  it('gives your shortcut to your command: the built-in one with the same keys loses it', async () => {
    expect(await shortcutsOf(tab, 'a', 'document:download')).toEqual([]);
    expect(await shortcutsOf(tab, 'a', 'acme:save')).toEqual(['Mod+S']);
  });

  it('opens the shortcuts sheet on ?, by group, in the viewer that has focus', async () => {
    await clickPages(tab, 'a');
    await tab.keyboard.press('?');
    await tab.waitForFunction(() =>
      (window as unknown as PageRecord).viewers.a.shadowRoot!.querySelector(
        '[data-epdf-shortcuts]',
      ),
    );
    expect(await sheetOf(tab, 'b')).toBeNull();
    const sheet = (await sheetOf(tab, 'a'))!;
    const isMac = await tab.evaluate(() => /Mac/.test(navigator.platform));
    const mod = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);
    expect(sheet.map((section) => section.group)).toEqual([
      'Document',
      'Viewing',
      'Editing',
      'Other',
    ]);
    const rows: Record<string, string[]> = Object.fromEntries(
      sheet.flatMap((section) => section.rows),
    );
    expect(rows['Print']).toEqual([mod('P')]);
    expect(rows['Open']).toEqual([mod('O')]);
    expect(rows['Find']).toEqual([mod('F')]);
    expect(rows['Zoom In']).toEqual([mod('='), isMac ? '⌘Num +' : 'Ctrl+Num +']);
    expect(rows['Delete']).toEqual(isMac ? ['⌦', '⌫'] : ['Delete', 'Backspace']);
    expect(rows['Keyboard Shortcuts']).toEqual(['?']);
    expect(sheet.at(-1)).toEqual({ group: 'Other', rows: [['Save', [mod('S')]]] });
    // Download gave its keys to Save.
    expect(rows['Download']).toBeUndefined();

    await tab.keyboard.press('Escape');
    await frames(tab);
    expect(await sheetOf(tab, 'a')).toBeNull();
  });

  it('opens search on Ctrl/Cmd+F and a file on Ctrl/Cmd+O, in the viewer that has focus', async () => {
    await clickPages(tab, 'a');
    await tab.keyboard.press('ControlOrMeta+f');
    expect(await searchOpen(tab, 'a')).toBe(true);
    expect(await searchOpen(tab, 'b')).toBe(false);
    await tab.evaluate(() =>
      (window as unknown as PageRecord).viewers.a.viewer.commands.execute('panel:search'),
    );

    await clickPages(tab, 'b');
    const [chooser] = await Promise.all([
      tab.waitForEvent('filechooser', { timeout: 10_000 }),
      tab.keyboard.press('ControlOrMeta+o'),
    ]);
    expect(await chooser.element().getAttribute('accept')).toBe('.pdf,application/pdf');
    expect((await record(tab)).prevented).toBe(true);
  });

  it('deletes the selected annotations on Delete', async () => {
    await clickPages(tab, 'a');
    const ref = await tab.evaluate(async () => {
      const annotation = (window as unknown as PageRecord).viewers.a.viewer.get('annotation');
      const { annotation: made } = await annotation.create(0, {
        subtype: 'square',
        box: { x: 120, y: 160, width: 160, height: 100 },
      });
      annotation.selection.set([made.ref]);
      return made.ref;
    });
    await frames(tab);
    expect(await hasFocus(tab, 'a')).toBe(true);
    await tab.keyboard.press('Delete');
    await tab.waitForFunction(
      (target) =>
        (window as unknown as PageRecord).viewers.a.viewer.get('annotation').get(target) === null,
      ref,
      { timeout: 10_000 },
    );
  });
});
