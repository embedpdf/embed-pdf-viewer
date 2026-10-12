/**
 * The viewer on a phone, and with a finger: menus open as sheets from the
 * bottom of the viewer, a submenu slides in over its menu and goes back, a
 * sheet closes on a tap above it, Escape or a drag down its handle; the page
 * number hides while the pages scroll; every button and menu row is 44 px
 * tall when the main pointer is a finger; the viewer keeps clear of the
 * notch where it reaches the screen's edge; and the dialogs hold focus until
 * they close and give it back.
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

/** A page with the viewer in `box` (CSS) and `config`, a script expression. */
const page = (box: string, config = '{}') => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>small screens</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; ${box}; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.copied = 0;
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
</script>
</body></html>`;

const WHOLE = 'inset: 0';

/** A command that opens a menu, in the document menu. */
const SHARE = `{
  commands: [
    { id: 'acme:share', label: 'Share', icon: 'link', menu: 'share' },
    { id: 'acme:copy-link', label: 'Copy link', icon: 'copy', run: () => { window.copied += 1; } },
    { id: 'acme:email', label: 'Email a link', icon: 'message', run: () => {} },
  ],
  layout: (layout) =>
    layout
      .addMenu('share', [['acme:copy-link', 'acme:email']])
      .add('acme:share', { to: 'document', after: 'document:download' }),
}`;

const PAGES = {
  '/whole.html': page(WHOLE),
  '/share.html': page(WHOLE, SHARE),
  '/inset.html': page('left: 40px; top: 60px; width: 320px; height: 600px'),
};

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface SheetMenu {
  label: string | null;
  inert: boolean;
  box: Box;
  rows: string[];
}

interface OpenSheet {
  layer: Box;
  sheet: Box;
  menus: SheetMenu[];
}

/** The open sheets, in the order they opened. */
const sheetsOf = (tab: Page) =>
  tab.evaluate(() => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const boxOf = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    return [...root.querySelectorAll<HTMLElement>('[data-epdf-layer]')]
      .filter((layer) => layer.matches(':popover-open') && layer.querySelector('[data-epdf-sheet]'))
      .map((layer) => {
        const sheet = layer.querySelector('[data-epdf-sheet]')!;
        return {
          layer: boxOf(layer),
          sheet: boxOf(sheet),
          menus: [...sheet.querySelectorAll<HTMLElement>('[role="menu"]')].map((menu) => ({
            label: menu.getAttribute('aria-label'),
            inert: menu.inert,
            box: boxOf(menu),
            rows: [...menu.querySelectorAll('[role^="menuitem"]')]
              .filter((row) => row.closest('[role="menu"]') === menu)
              .map((row) => row.querySelector('.truncate')?.textContent ?? ''),
          })),
        };
      });
  }) as Promise<OpenSheet[]>;

/** The live (not the measurement layer's) button labelled `label`, by its box. */
const buttonOf = (tab: Page, label: string) =>
  tab.evaluate((name) => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const button = [
      ...root.querySelectorAll(`button[aria-label="${name}"], button[title="${name}"]`),
    ].find((candidate) => !candidate.closest('[aria-hidden="true"]'));
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }, label);

/** A row of an open menu, by its label. */
const rowOf = (tab: Page, label: string) =>
  tab.evaluate((name) => {
    const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const row = [...root.querySelectorAll('[role="menu"] [role^="menuitem"]')].find(
      (candidate) => candidate.querySelector('.truncate')?.textContent === name,
    );
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }, label);

/** What has focus, looking into the shadow root: its label, else its text. */
const focused = (tab: Page) =>
  tab.evaluate(() => {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return (
      active?.getAttribute('aria-label') ??
      active?.querySelector('.truncate')?.textContent ??
      active?.textContent ??
      null
    );
  });

const clickBox = async (tab: Page, box: Box | null, what: string) => {
  expect(box, what).not.toBeNull();
  await tab.mouse.click((box!.left + box!.right) / 2, (box!.top + box!.bottom) / 2);
  await frames(tab);
};

/** Wait out a slide or a fade. */
const settle = (tab: Page) => tab.waitForTimeout(350);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('small screens', () => {
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

  const open = async (
    path: string,
    width = 375,
    options: { touch?: boolean } = {},
  ): Promise<Page> => {
    const tab = await browser.newPage({
      viewport: { width, height: 800 },
      ...(options.touch ? { hasTouch: true, isMobile: true } : {}),
    });
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  it('opens a menu as a sheet from the bottom of the viewer, with its first row focused', async () => {
    const tab = await open('/share.html');
    await clickBox(tab, await buttonOf(tab, 'Menu'), 'the Menu button');
    await settle(tab);
    const [sheet, ...others] = await sheetsOf(tab);
    expect(others).toEqual([]);
    expect(sheet).toBeDefined();
    expect(sheet!.layer).toEqual({ left: 0, top: 0, right: 375, bottom: 800 });
    expect(Math.round(sheet!.sheet.bottom)).toBe(800);
    expect(sheet!.sheet.left).toBe(0);
    expect(sheet!.sheet.right).toBe(375);
    expect(sheet!.sheet.top).toBeGreaterThan(40);
    expect(sheet!.menus).toHaveLength(1);
    expect(sheet!.menus[0]!.label).toBe('Menu');
    expect(sheet!.menus[0]!.rows).toContain('Share');
    expect(await focused(tab)).toBe(sheet!.menus[0]!.rows[0]);
    // No popover beside the button.
    const popovers = await tab.evaluate(
      () =>
        [
          ...document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelectorAll('[role="menu"]:popover-open'),
        ].length,
    );
    expect(popovers).toBe(0);
    await tab.close();
  });

  it('slides a submenu in over its menu, with a row that goes back', async () => {
    const tab = await open('/share.html');
    await clickBox(tab, await buttonOf(tab, 'Menu'), 'the Menu button');
    await settle(tab);
    await clickBox(tab, await rowOf(tab, 'Share'), 'the Share row');
    await settle(tab);
    const [sheet] = await sheetsOf(tab);
    const [first, submenu] = sheet!.menus;
    expect(first!.inert).toBe(true);
    expect(submenu).toMatchObject({ label: 'Share', inert: false });
    expect(submenu!.rows).toEqual(['Back', 'Copy link', 'Email a link']);
    // Slid in: over the menu it opened from, edge to edge.
    expect(Math.abs(submenu!.box.left - first!.box.left)).toBeLessThan(1);
    expect(await focused(tab)).toBe('Back');

    await clickBox(tab, await rowOf(tab, 'Back'), 'the Back row');
    const [back] = await sheetsOf(tab);
    expect(back!.menus).toHaveLength(1);
    expect(back!.menus[0]!.inert).toBe(false);
    expect(await focused(tab)).toBe('Share');

    // The arrow toward the submenu opens it again, and the arrow back goes back.
    await tab.keyboard.press('ArrowRight');
    await frames(tab);
    expect((await sheetsOf(tab))[0]!.menus).toHaveLength(2);
    await tab.keyboard.press('ArrowLeft');
    await frames(tab);
    expect((await sheetsOf(tab))[0]!.menus).toHaveLength(1);
    expect(await focused(tab)).toBe('Share');

    // A pick in the submenu runs it and closes the whole sheet.
    await clickBox(tab, await rowOf(tab, 'Share'), 'the Share row');
    await settle(tab);
    await clickBox(tab, await rowOf(tab, 'Copy link'), 'the Copy link row');
    expect(await sheetsOf(tab)).toEqual([]);
    expect(await tab.evaluate(() => (window as unknown as { copied: number }).copied)).toBe(1);
    await tab.close();
  });

  it('closes on Escape, giving focus back to its button, and on a tap above it', async () => {
    const tab = await open('/share.html');
    await clickBox(tab, await buttonOf(tab, 'Menu'), 'the Menu button');
    await settle(tab);
    await tab.keyboard.press('Escape');
    await frames(tab);
    expect(await sheetsOf(tab)).toEqual([]);
    expect(await focused(tab)).toBe('Menu');

    await clickBox(tab, await buttonOf(tab, 'Menu'), 'the Menu button');
    await settle(tab);
    expect(await sheetsOf(tab)).toHaveLength(1);
    await tab.mouse.click(187, 300);
    await frames(tab);
    expect(await sheetsOf(tab)).toEqual([]);
    await tab.close();
  });

  it('closes when its handle is dragged down, and stays after a short drag', async () => {
    const tab = await open('/share.html');
    await clickBox(tab, await buttonOf(tab, 'Menu'), 'the Menu button');
    await settle(tab);
    const handleOf = () =>
      tab.evaluate(() => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const rect = root.querySelector('[data-epdf-sheet-handle]')!.getBoundingClientRect();
        return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
      });
    const before = (await sheetsOf(tab))[0]!.sheet;

    let handle = await handleOf();
    await tab.mouse.move(handle.x, handle.y);
    await tab.mouse.down();
    await tab.mouse.move(handle.x, handle.y + 20, { steps: 4 });
    await tab.waitForTimeout(150);
    await tab.mouse.up();
    await settle(tab);
    const [stayed] = await sheetsOf(tab);
    expect(stayed).toBeDefined();
    expect(Math.abs(stayed!.sheet.top - before.top)).toBeLessThan(1);

    handle = await handleOf();
    const height = before.bottom - before.top;
    await tab.mouse.move(handle.x, handle.y);
    await tab.mouse.down();
    await tab.mouse.move(handle.x, handle.y + height * 0.7, { steps: 12 });
    await tab.waitForTimeout(150);
    await tab.mouse.up();
    await frames(tab);
    expect(await sheetsOf(tab)).toEqual([]);
    await tab.close();
  });

  it('opens menus beside their button above a phone width', async () => {
    const tab = await open('/share.html', 800);
    await clickBox(tab, await buttonOf(tab, 'Menu'), 'the Menu button');
    expect(await sheetsOf(tab)).toEqual([]);
    const popovers = await tab.evaluate(
      () =>
        [
          ...document
            .querySelector('embedpdf-viewer')!
            .shadowRoot!.querySelectorAll('[role="menu"]:popover-open'),
        ].length,
    );
    expect(popovers).toBe(1);
    await tab.close();
  });

  it('hides the page number while the pages scroll on a phone, and brings it back after', async () => {
    const pagerHidden = (tab: Page) =>
      tab.evaluate(() => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const pager = root.querySelector('[data-bar="pager"]');
        return pager ? pager.hasAttribute('data-scroll-hidden') : null;
      });
    const scroll = async (tab: Page, width: number) => {
      await tab.mouse.move(width / 2, 400);
      for (let i = 0; i < 4; i += 1) {
        await tab.mouse.wheel(0, 120);
        await tab.waitForTimeout(40);
      }
    };

    const phone = await open('/whole.html');
    expect(await pagerHidden(phone)).toBe(false);
    await scroll(phone, 375);
    expect(await pagerHidden(phone)).toBe(true);
    const shown = await phone.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      return getComputedStyle(root.querySelector('[data-bar="pager"]')!).visibility;
    });
    // Still fading out; then it takes no presses.
    expect(['visible', 'hidden']).toContain(shown);
    await phone.waitForTimeout(1200);
    expect(await pagerHidden(phone)).toBe(false);
    await phone.close();

    const wide = await open('/whole.html', 1280);
    await scroll(wide, 1280);
    expect(await pagerHidden(wide)).toBe(false);
    await wide.close();
  });

  it('makes every bar button and menu row 44 px tall when the main pointer is a finger', async () => {
    const heightsOf = (tab: Page) =>
      tab.evaluate(() => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const live = (element: Element) => !element.closest('[aria-hidden="true"]');
        const buttons = [...root.querySelectorAll('[role="toolbar"] button')].filter(live);
        return {
          touch: root.querySelector('[data-touch]') !== null,
          buttons: buttons.map((button) => button.getBoundingClientRect().height),
        };
      });

    const finger = await open('/share.html', 375, { touch: true });
    const touched = await heightsOf(finger);
    expect(touched.touch).toBe(true);
    expect(touched.buttons.length).toBeGreaterThan(0);
    expect(Math.min(...touched.buttons)).toBeGreaterThanOrEqual(44);
    await clickBox(finger, await buttonOf(finger, 'Menu'), 'the Menu button');
    await settle(finger);
    const rows = await finger.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      return [...root.querySelectorAll('[data-epdf-sheet] [role^="menuitem"]')].map(
        (row) => row.getBoundingClientRect().height,
      );
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(44);
    await finger.close();

    const mouse = await open('/share.html', 375);
    const pointed = await heightsOf(mouse);
    expect(pointed.touch).toBe(false);
    expect(Math.min(...pointed.buttons)).toBeLessThan(44);
    await mouse.close();
  });

  it('keeps clear of the notch and home bar on the screen edges it reaches, and only there', async () => {
    const paddingOf = (tab: Page) =>
      tab.evaluate(() => {
        const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
        const layout = root.querySelector<HTMLElement>('[data-embedpdf-root] [dir]')!;
        return {
          top: layout.style.paddingTop,
          bottom: layout.style.paddingBottom,
          left: layout.style.paddingLeft,
        };
      });
    const whole = await open('/whole.html');
    expect(await paddingOf(whole)).toEqual({
      top: 'env(safe-area-inset-top, 0px)',
      bottom: 'env(safe-area-inset-bottom, 0px)',
      left: 'env(safe-area-inset-left, 0px)',
    });
    await whole.close();

    const inset = await open('/inset.html');
    expect(await paddingOf(inset)).toEqual({ top: '', bottom: '', left: '' });
    await inset.close();
  });

  it('holds focus in a dialog until it closes, and gives it back to the button', async () => {
    const tab = await open('/whole.html', 1280);
    await tab.evaluate(() => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      [...root.querySelectorAll<HTMLElement>('button[aria-label="Menu"]')]
        .find((button) => !button.closest('[aria-hidden="true"]'))!
        .focus();
    });
    await tab.evaluate(() =>
      (
        window as unknown as {
          element: { viewer: { get(name: string): { open(id: string): void } } };
        }
      ).element.viewer
        .get('shell')
        .open('signature-maker'),
    );
    await frames(tab);
    const inDialog = () =>
      tab.evaluate(() => {
        let active: Element | null = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        const dialog = active?.closest('[role="dialog"]');
        const layer = dialog?.closest('[data-epdf-layer]');
        return {
          inside: dialog?.getAttribute('aria-modal') === 'true',
          named: dialog ? !!dialog.getAttribute('aria-labelledby') : false,
          topLayer: layer?.matches(':popover-open') ?? false,
        };
      });
    expect(await inDialog()).toEqual({ inside: true, named: true, topLayer: true });
    for (let i = 0; i < 25; i += 1) await tab.keyboard.press('Tab');
    expect((await inDialog()).inside).toBe(true);
    for (let i = 0; i < 25; i += 1) await tab.keyboard.press('Shift+Tab');
    expect((await inDialog()).inside).toBe(true);

    await tab.keyboard.press('Escape');
    await frames(tab);
    const stillOpen = await tab.evaluate(
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[role="dialog"][aria-modal="true"]') !== null,
    );
    expect(stillOpen).toBe(false);
    expect(await focused(tab)).toBe('Menu');
    await tab.close();
  });
});
