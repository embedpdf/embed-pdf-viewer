/**
 * The viewer's languages in a running viewer: in Arabic it reads right to left (the bars mirror,
 * a `start` panel opens on the right) and every word is Arabic; a language given only through
 * `strings` reads the way its code says; and a built-in button's label has its command's id as
 * its key, per language.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ar } from '../../chrome/src/locales/ar';
import { de } from '../../chrome/src/locales/de';
import { fr } from '../../chrome/src/locales/fr';
import { dist, frames, launchChromium, serveViewer, type ViewerHost } from './helpers/viewer-host';

const WIDTH = 1100;

/** A page whose viewer gets `config`, a script expression. */
const page = (config: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>languages</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: ${WIDTH}px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
</script>
</body></html>`;

const PAGES = {
  '/arabic.html': page(`{ locale: 'ar' }`),
  '/persian.html': page(`{ locale: 'fa', strings: { fa: { 'zoom:in': 'بزرگ‌نمایی' } } }`),
  '/strings.html': page(`{
    locale: 'de',
    strings: {
      en: { 'document:download': 'Save a copy' },
      de: { 'document:download': 'Kopie speichern' },
    },
  }`),
};

// `window.element` is the viewer's element, as the other browser tests declare it: its `viewer`
// and its `locale`.

/** A string of a pack, by its dotted key. */
const stringOf = (translations: object, key: string): string =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      translations,
    ) as string;

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const clickOn = (tab: Page, box: Box) =>
  tab.mouse.click((box.left + box.right) / 2, (box.top + box.bottom) / 2);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('languages', () => {
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

  /** Open a page and wait until its document shows and its language has loaded. */
  const open = async (path: string, locale: string): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    tab.on('pageerror', (error) => errors.push(error.message));
    await tab.goto(`${host.origin}${path}`);
    await tab.waitForFunction(
      (code) =>
        window.element?.viewer?.get('i18n').getLocale() === code &&
        (window.element.viewer.documents.list() as { status: string }[]).some(
          (document) => document.status === 'ready',
        ),
      locale,
      { timeout: 60_000 },
    );
    await frames(tab);
    expect(errors).toEqual([]);
    return tab;
  };

  /** The live (not the measurement layer's) button with this label or tooltip, and its box. */
  const buttonOf = (tab: Page, label: string) =>
    tab.evaluate((name) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const button = [
        ...root.querySelectorAll(`button[aria-label="${name}"], button[title="${name}"]`),
      ].find((candidate) => !candidate.closest('[aria-hidden="true"]'));
      if (!button) return null;
      const { left, right, top, bottom } = button.getBoundingClientRect();
      return { left, right, top, bottom };
    }, label) as Promise<Box | null>;

  const directionOf = (tab: Page) =>
    tab.evaluate(
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-embedpdf-root] [dir]')
          ?.getAttribute('dir') ?? null,
    );

  it('reads right to left in Arabic: the bars mirror and a start panel opens on the right', async () => {
    const tab = await open('/arabic.html', 'ar');
    expect(await directionOf(tab)).toBe('rtl');

    // The pager reads in Arabic.
    const text = await tab.evaluate(() => window.element.shadowRoot!.textContent ?? '');
    const pageOne = stringOf(ar.translations, 'demo.page')
      .replace('{current}', '1')
      .split('{total}')[0]!;
    expect(text).toContain(pageOne);

    // The main bar's start (the document menu) is on the right, its end (search) on the left.
    const menu = await buttonOf(tab, stringOf(ar.translations, 'commands.menu'));
    const search = await buttonOf(tab, stringOf(ar.translations, 'panels.search'));
    expect(menu, 'the document menu button, labelled in Arabic').not.toBeNull();
    expect(search, 'the search panel button, labelled in Arabic').not.toBeNull();
    expect(menu!.right).toBeGreaterThan(WIDTH - 80);
    expect(search!.left).toBeLessThan(WIDTH / 2);
    expect(search!.right).toBeLessThan(menu!.left);

    // The thumbnails panel sits at `start`: on the right in Arabic.
    const thumbnails = await buttonOf(tab, stringOf(ar.translations, 'panels.thumbnails'));
    expect(thumbnails).not.toBeNull();
    await clickOn(tab, thumbnails!);
    await tab.waitForFunction(() =>
      window.element.shadowRoot!.querySelector('[data-epdf-panel="thumbnails"]'),
    );
    await frames(tab);
    const panel = await tab.evaluate(() => {
      const { left, right } = window.element
        .shadowRoot!.querySelector('[data-epdf-panel="thumbnails"]')!
        .getBoundingClientRect();
      return { left, right };
    });
    expect(Math.round(panel.right)).toBe(WIDTH);
    expect(panel.left).toBeGreaterThan(WIDTH / 2);

    // Back to a left-to-right language in place.
    await tab.evaluate(() => (window.element.locale = 'de'));
    await tab.waitForFunction(() => window.element.viewer.get('i18n').getLocale() === 'de');
    await frames(tab);
    expect(await directionOf(tab)).toBe('ltr');
    expect(await buttonOf(tab, stringOf(de.translations, 'commands.menu'))).not.toBeNull();
    await tab.close();
  });

  it('reads right to left in a language given only through strings whose code says so', async () => {
    const tab = await open('/persian.html', 'fa');
    expect(await directionOf(tab)).toBe('rtl');
    // Its own word, under the command's id, on the zoom field's button.
    const zoomIn = await buttonOf(tab, 'بزرگ‌نمایی');
    expect(zoomIn, 'the zoom in button, labelled from strings').not.toBeNull();
    // And English for everything it leaves out.
    expect(await buttonOf(tab, 'Menu')).not.toBeNull();
    await tab.close();
  });

  it('labels a built-in button by its command id, in each language its own', async () => {
    const tab = await open('/strings.html', 'de');
    const label = () =>
      tab.evaluate(() => window.element.viewer.commands.resolveCommand('document:download')!.label);
    expect(await label()).toBe('Kopie speichern');

    // The document menu shows it.
    const menu = await buttonOf(tab, stringOf(de.translations, 'commands.menu'));
    await clickOn(tab, menu!);
    await tab.waitForFunction(() =>
      [...window.element.shadowRoot!.querySelectorAll('[role="menu"] [role^="menuitem"]')].some(
        (row) => row.textContent?.includes('Kopie speichern'),
      ),
    );
    await tab.keyboard.press('Escape');

    await tab.evaluate(() => (window.element.locale = 'en'));
    await tab.waitForFunction(() => window.element.viewer.get('i18n').getLocale() === 'en');
    expect(await label()).toBe('Save a copy');

    // French has no string for the id: its own label, not the English one.
    await tab.evaluate(() => (window.element.locale = 'fr'));
    await tab.waitForFunction(() => window.element.viewer.get('i18n').getLocale() === 'fr');
    expect(await label()).toBe(stringOf(fr.translations, 'commands.download'));
    await tab.close();
  });
});
