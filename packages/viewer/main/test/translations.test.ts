/**
 * The Translations page (`docs/content/viewer/customize/translations.mdx`) in a running viewer:
 * without a `locale`, or with `'auto'`, it follows the browser's languages; its thirteen
 * languages each load the first time they show, Hebrew right to left; your command's `labelKey`
 * and a panel's and a mode bar's `titleKey` read per language, English where a language has no
 * words; the style panel's words change through `strings`; a language of your own falls back to
 * English (after EmbedPDF's own words in it, where the i18n plugin has some), and reads right to
 * left when its code says so; `setLocale` resolves once the language shows; `addTranslations`
 * changes words in place; and the toolbar moves more or fewer buttons into "More" as the words
 * get longer or shorter. Arabic, `fa` and a built-in button's label by its command id are
 * `languages.test.ts`'s.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { de } from '../../chrome/src/locales/de';
import { fr } from '../../chrome/src/locales/fr';
import { he } from '../../chrome/src/locales/he';
import { dist, frames, launchChromium, serveViewer, type ViewerHost } from './helpers/viewer-host';

const WIDTH = 1100;

/** A page whose viewer, `width` wide, gets `config`, a script expression. */
const page = (config: string, width = WIDTH) => `<!doctype html><html><head><meta charset="utf-8">
<title>translations</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: ${width}px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.readies = [];
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${config} });
  window.element.addEventListener('epdf:ready', (event) => window.readies.push(event.detail.viewer));
</script>
</body></html>`;

/** Your own button, panel and mode, with their words in English and Dutch (Quick start's icon). */
const OWN = `{
  icons: {
    send: ['M10 14L21 3', 'M21 3l-6.5 18a.5.5 0 0 1-1 0L10 14l-7-3.5a.5.5 0 0 1 0-1L21 3z'],
  },
  commands: [{ id: 'acme:send', labelKey: 'acme.send', icon: 'send', run: () => {} }],
  strings: {
    en: { 'acme.send': 'Send for signature', 'acme.notes': 'Notes', 'acme.review': 'Review' },
    nl: {
      'acme.send': 'Verstuur ter ondertekening',
      'acme.notes': 'Notities',
      'acme.review': 'Beoordelen',
    },
  },
  layout: (layout) =>
    layout
      .add('acme:send', { to: 'main', section: 'end' })
      .addPanel('notes', { side: 'end', titleKey: 'acme.notes', icon: 'book' })
      .add('panel:notes', { to: 'main', group: 'panels' })
      .addBar('review', {
        place: { with: 'main' },
        mode: 'review',
        titleKey: 'acme.review',
        center: [['acme:send']],
      }),
}`;

/** Text-only buttons of your own at the end of the main bar, their words longer per language. */
const WORDS = ['one', 'two', 'three', 'four', 'five', 'six'];
const shortWordOf = (n: string) => n.slice(0, 1).toUpperCase() + n.slice(1, 2);
const wordsOf = (word: (n: string) => string) =>
  JSON.stringify(Object.fromEntries(WORDS.map((n) => [`acme.${n}`, word(n)])));
const MEASURED = `{
  locale: 'en',
  commands: ${JSON.stringify(WORDS)}.map((n) => ({ id: 'acme:' + n, labelKey: 'acme.' + n, run: () => {} })),
  strings: {
    en: ${wordsOf((n) => `Request ${n}`)},
    de: ${wordsOf((n) => `Unterschriftsanforderung Nummer ${n}`)},
    fr: ${wordsOf(shortWordOf)},
  },
  layout: (layout) =>
    ${JSON.stringify(WORDS)}.reduce(
      (each, n) => each.add('acme:' + n, { to: 'main', section: 'end' }),
      layout,
    ),
}`;

const PAGES = {
  '/auto.html': page('{}'),
  '/auto-named.html': page(`{ locale: 'auto' }`),
  '/english.html': page(`{ locale: 'en' }`),
  // Wide enough for every mode tab beside your button and your panel's.
  '/own.html': page(OWN, 1500),
  '/style.html': page(`{
    locale: 'en',
    strings: {
      en: {
        'annotation.style.stroke': 'Line',
        'annotation.flags.noView': 'Not on screen',
        'annotation.lineEndings.openArrow': 'Plain arrow',
        'form.settings.tooltip': 'Hint',
      },
    },
  }`),
  '/swedish.html': page(`{
    locale: 'sv',
    strings: { sv: { 'document:download': 'Ladda ner', 'zoom:in': 'Zooma in' } },
  }`),
  '/kurdish.html': page(
    `{ locale: 'ku-Arab', strings: { 'ku-Arab': { 'zoom:in': 'گەورەکردن' } } }`,
  ),
  '/urdu.html': page(`{ locale: 'ur', strings: { ur: { 'zoom:in': 'بڑا کریں' } } }`),
  '/kurdish-latin.html': page(`{ locale: 'ku', strings: { ku: { 'zoom:in': 'Mezin bike' } } }`),
  '/measured.html': page(MEASURED, 900),
};

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
    readies: unknown[];
  }
}

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

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('translations', () => {
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

  /**
   * Open a page in a browser whose language is `browserLocale`, and wait until its document
   * shows and its language is `locale`.
   */
  const open = async (path: string, locale: string, browserLocale = 'en-US'): Promise<Page> => {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 800 },
      locale: browserLocale,
    });
    const tab = await context.newPage();
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

  const close = (tab: Page) => tab.context().close();

  const localeOf = (tab: Page) =>
    tab.evaluate(() => window.element.viewer.get('i18n').getLocale() as string);

  const switchTo = async (tab: Page, locale: string, code = locale) => {
    await tab.evaluate((value) => (window.element.locale = value), locale);
    await tab.waitForFunction(
      (expected) => window.element.viewer.get('i18n').getLocale() === expected,
      code,
    );
    await frames(tab);
  };

  /** The live (not the measurement layer's) button with this label or tooltip, and its box. */
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
        const { left, right, top, bottom } = button.getBoundingClientRect();
        return { left, right, top, bottom };
      },
      [label, within] as const,
    ) as Promise<Box | null>;

  const directionOf = (tab: Page) =>
    tab.evaluate(
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-embedpdf-root] [dir]')
          ?.getAttribute('dir') ?? null,
    );

  const run = async (tab: Page, command: string) => {
    await tab.evaluate((id) => window.element.viewer.commands.execute(id), command);
    await frames(tab);
  };

  /** Every piece of text a panel shows, each trimmed: its labels, its rows, its buttons' names. */
  const wordsIn = (tab: Page, panel: string) =>
    tab.evaluate((id) => {
      const root = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      const element = root.querySelector(`[data-epdf-panel="${id}"]`);
      if (!element) return null;
      const words = new Set<string>();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (text) words.add(text);
      }
      for (const labelled of element.querySelectorAll('[aria-label], [title]')) {
        for (const name of ['aria-label', 'title']) {
          const text = labelled.getAttribute(name)?.trim();
          if (text) words.add(text);
        }
      }
      return [...words];
    }, panel);

  /** The live mode tabs' words. */
  const modeTabs = (tab: Page) =>
    tab.evaluate(() =>
      [
        ...document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelectorAll('[part~="mode-tab"]'),
      ]
        .filter((element) => !element.closest('[aria-hidden="true"]'))
        .map((element) => element.textContent?.trim() ?? ''),
    );

  /** An open panel's name, which its header's title gives it; `null` while it's closed. */
  const panelName = (tab: Page, id: string) =>
    tab.evaluate(
      (panel) =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector(`[data-epdf-panel="${panel}"]`)
          ?.getAttribute('aria-label') ?? null,
      id,
    );

  it("follows the browser's languages without a locale, or with 'auto', and again after one", async () => {
    // A Canadian French browser gets French; a Traditional Chinese one English.
    for (const path of ['/auto.html', '/auto-named.html']) {
      const french = await open(path, 'fr', 'fr-CA');
      expect(await buttonOf(french, stringOf(fr.translations, 'panels.search'))).not.toBeNull();
      await close(french);
      const chinese = await open(path, 'en', 'zh-TW');
      expect(await localeOf(chinese)).toBe('en');
      await close(chinese);
    }

    // A language the app picks wins over the browser's, until it asks for 'auto' again.
    const tab = await open('/auto.html', 'fr', 'fr-CA');
    await switchTo(tab, 'de');
    await switchTo(tab, 'auto', 'fr');
    expect(await buttonOf(tab, stringOf(fr.translations, 'panels.search'))).not.toBeNull();
    await close(tab);
  });

  it('speaks thirteen languages, each loaded the first time it shows, Hebrew right to left', async () => {
    const tab = await open('/english.html', 'en');
    const requested: string[] = [];
    tab.on('request', (request) => requested.push(new URL(request.url()).pathname));
    const languages = () =>
      tab.evaluate(() =>
        (
          window.element.viewer.get('i18n').listLocales() as { code: string; loaded: boolean }[]
        ).map(({ code, loaded }) => ({ code, loaded })),
      );
    const before = await languages();
    expect(before.map((language) => language.code).sort()).toEqual(
      ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'ja', 'zh-CN', 'ko', 'ar', 'he'].sort(),
    );
    expect(before.filter((language) => language.loaded).map((language) => language.code)).toEqual([
      'en',
    ]);

    // Hebrew's words arrive in a chunk of their own, the first time it shows.
    expect(requested.filter((path) => path.startsWith('/chunks/he-'))).toEqual([]);
    await switchTo(tab, 'he');
    expect(requested.filter((path) => path.startsWith('/chunks/he-'))).toHaveLength(1);
    const after = await languages();
    expect(
      after
        .filter((language) => language.loaded)
        .map((language) => language.code)
        .sort(),
    ).toEqual(['en', 'he']);

    // Right to left: the document menu, at the main bar's start, is on the right.
    expect(await directionOf(tab)).toBe('rtl');
    const menu = await buttonOf(tab, stringOf(he.translations, 'commands.menu'));
    expect(menu, 'the document menu button, labelled in Hebrew').not.toBeNull();
    expect(menu!.right).toBeGreaterThan(WIDTH - 80);
    await close(tab);
  });

  it('labels your command by its labelKey in each language, and in English where one has none', async () => {
    const tab = await open('/own.html', 'en');
    const label = () =>
      tab.evaluate(() => window.element.viewer.commands.resolveCommand('acme:send')!.label);
    expect(await label()).toBe('Send for signature');
    expect(await buttonOf(tab, 'Send for signature', '[data-bar="main"]')).not.toBeNull();

    await switchTo(tab, 'nl');
    expect(await label()).toBe('Verstuur ter ondertekening');
    expect(await buttonOf(tab, 'Verstuur ter ondertekening', '[data-bar="main"]')).not.toBeNull();

    // German has no words for it: English, the fallback language.
    await switchTo(tab, 'de');
    expect(await label()).toBe('Send for signature');
    expect(await buttonOf(tab, 'Send for signature', '[data-bar="main"]')).not.toBeNull();
    await close(tab);
  });

  it('titles your panel and your mode by their titleKey, in each language', async () => {
    const tab = await open('/own.html', 'en');
    expect(await modeTabs(tab)).toContain('Review');
    const notes = await buttonOf(tab, 'Notes', '[data-bar="main"]');
    expect(notes, "the notes panel's button").not.toBeNull();
    await clickOn(tab, notes!);
    await frames(tab);
    expect(await panelName(tab, 'notes')).toBe('Notes');

    // The open panel's header, its button and the mode's tab follow the language.
    await switchTo(tab, 'nl');
    expect(await panelName(tab, 'notes')).toBe('Notities');
    expect(await buttonOf(tab, 'Notities', '[data-bar="main"]')).not.toBeNull();
    expect(await modeTabs(tab)).toContain('Beoordelen');
    expect(await modeTabs(tab)).not.toContain('Review');

    await switchTo(tab, 'de');
    expect(await panelName(tab, 'notes')).toBe('Notes');
    expect(await modeTabs(tab)).toContain('Review');
    await close(tab);
  });

  it("changes the style panel's words through strings, each by its key", async () => {
    const tab = await open('/style.html', 'en');

    // A rectangle's line color: `annotation.style.stroke`.
    await run(tab, 'tool:square');
    await run(tab, 'panel:style');
    await tab.waitForFunction(() =>
      window.element.shadowRoot!.querySelector('[data-epdf-panel="style"] label'),
    );
    let words = await wordsIn(tab, 'style');
    expect(words).toContain('Line');
    expect(words).not.toContain('Stroke');

    // A line's endings: `annotation.lineEndings.openArrow`, an option's name.
    await run(tab, 'tool:line');
    await frames(tab);
    const endings = await tab.evaluate(() => {
      const panel = window.element.shadowRoot!.querySelector('[data-epdf-panel="style"]')!;
      const field = [...panel.querySelectorAll('section')].find(
        (section) => section.querySelector('label')?.textContent?.trim() === 'Line endings',
      );
      const trigger = field?.querySelector('button');
      if (!trigger) return null;
      trigger.scrollIntoView({ block: 'center' });
      const { left, right, top, bottom } = trigger.getBoundingClientRect();
      return { left, right, top, bottom };
    });
    expect(endings, "the line endings' first picker").not.toBeNull();
    await clickOn(tab, endings!);
    await frames(tab);
    words = await wordsIn(tab, 'style');
    expect(words).toContain('Plain arrow');
    expect(words).not.toContain('Open arrow');
    await tab.keyboard.press('Escape');
    await run(tab, 'tool:pointer');

    // A selected annotation's flags: `annotation.flags.noView`.
    await tab.evaluate(async () => {
      const annotation = window.element.viewer.get('annotation');
      const { annotation: made } = await annotation.create(0, {
        subtype: 'square',
        box: { x: 120, y: 160, width: 160, height: 100 },
      });
      annotation.selection.set([made.ref]);
      // Open, or left open: its command would close it.
      window.element.viewer.get('shell').open('style');
    });
    await tab.waitForFunction(() =>
      window.element.shadowRoot!.textContent?.includes('Not on screen'),
    );
    words = await wordsIn(tab, 'style');
    expect(words).toContain('Not on screen');
    expect(words).not.toContain('No view');
    await tab.evaluate(() => window.element.viewer.get('annotation').selection.set([]));

    // A form field's settings: `form.settings.tooltip`.
    await run(tab, 'mode:form');
    await run(tab, 'form:design');
    await tab.waitForFunction(() =>
      window.element.shadowRoot!.querySelector('[data-epdf-panel="form-design"] li button'),
    );
    await tab.evaluate(() =>
      window.element
        .shadowRoot!.querySelector<HTMLButtonElement>('[data-epdf-panel="form-design"] li button')!
        .click(),
    );
    await tab.waitForFunction(() =>
      window.element
        .shadowRoot!.querySelector('[data-epdf-panel="form-design"]')
        ?.textContent?.includes('Hint'),
    );
    words = await wordsIn(tab, 'form-design');
    expect(words).toContain('Hint');
    expect(words).not.toContain('Tooltip');
    await close(tab);
  });

  it('makes a language of its own from strings, with English for the words it leaves out', async () => {
    const tab = await open('/swedish.html', 'sv');
    const swedish = await tab.evaluate(() =>
      (window.element.viewer.get('i18n').listLocales() as { code: string; name: string }[]).find(
        (language) => language.code === 'sv',
      ),
    );
    expect(swedish).toMatchObject({ code: 'sv', name: 'svenska', direction: 'ltr', loaded: true });
    expect(await directionOf(tab)).toBe('ltr');

    // Its own words.
    expect(await buttonOf(tab, 'Zooma in')).not.toBeNull();
    const download = await tab.evaluate(
      () => window.element.viewer.commands.resolveCommand('document:download')!.label,
    );
    expect(download).toBe('Ladda ner');

    // English for the rest: the bars, the tools, the pager.
    expect(await buttonOf(tab, 'Menu')).not.toBeNull();
    expect(await buttonOf(tab, 'Search')).not.toBeNull();
    expect(await buttonOf(tab, 'Pointer')).not.toBeNull();
    const text = await tab.evaluate(() => window.element.shadowRoot!.textContent ?? '');
    expect(text).toMatch(/Page 1 of \d+/);

    // Except where EmbedPDF has words of its own in the language: the i18n plugin's Swedish
    // for the standard zoom, page and copy commands comes before English.
    const standard = await tab.evaluate(() =>
      ['zoom:out', 'page:next', 'selection:copy'].map(
        (id) => window.element.viewer.commands.resolveCommand(id)!.label,
      ),
    );
    expect(standard).toEqual(['Zooma ut', 'Nästa sida', 'Kopiera']);
    await close(tab);
  });

  it('reads a language of its own right to left when its code says so', async () => {
    for (const [path, locale, word, direction] of [
      ['/urdu.html', 'ur', 'بڑا کریں', 'rtl'],
      ['/kurdish.html', 'ku-Arab', 'گەورەکردن', 'rtl'],
      // Kurdish without a script is written in Latin letters.
      ['/kurdish-latin.html', 'ku', 'Mezin bike', 'ltr'],
    ] as const) {
      const tab = await open(path, locale);
      expect({ locale, direction: await directionOf(tab) }).toEqual({ locale, direction });
      expect(await buttonOf(tab, word), `${locale}'s zoom in button`).not.toBeNull();
      await close(tab);
    }
  });

  it('switches the language from code, resolving once it has loaded', async () => {
    const tab = await open('/english.html', 'en');
    const result = await tab.evaluate(async () => {
      const { viewer } = window.element;
      const i18n = viewer.get('i18n');
      const read = () => ({
        locale: i18n.getLocale(),
        loading: i18n.getLoadingLocale(),
        download: viewer.commands.resolveCommand('document:download')!.label,
      });
      const switching = i18n.setLocale('fr');
      const during = read();
      await switching;
      return { during, after: read() };
    });
    // French was still loading: English showed meanwhile.
    expect(result.during).toEqual({ locale: 'en', loading: 'fr', download: 'Download' });
    expect(result.after).toEqual({
      locale: 'fr',
      loading: null,
      download: stringOf(fr.translations, 'commands.download'),
    });
    // The same as the locale prop: the bars and the pager in French.
    await frames(tab);
    expect(await buttonOf(tab, stringOf(fr.translations, 'panels.search'))).not.toBeNull();
    const text = await tab.evaluate(() => window.element.shadowRoot!.textContent ?? '');
    expect(text).toMatch(/Page 1 sur \d+/);
    await close(tab);
  });

  it('adds words to a language while the viewer runs, without starting over', async () => {
    const tab = await open('/own.html', 'en');
    // Dutch hasn't loaded yet: its words wait for it, and win over `strings`.
    await tab.evaluate(() =>
      window.element.viewer.get('i18n').addTranslations('nl', { 'acme.send': 'Nu versturen' }),
    );
    await switchTo(tab, 'nl');
    expect(await buttonOf(tab, 'Nu versturen', '[data-bar="main"]')).not.toBeNull();

    // Zoomed in, then new words: the same viewer, the same document, the same zoom.
    await run(tab, 'zoom:in');
    const before = await tab.evaluate(() => ({
      zoom: window.element.viewer.get('stage').getZoomLevel() as number,
      documents: window.element.viewer.documents
        .list()
        .map((document: { id: string }) => document.id),
    }));
    await tab.evaluate(() =>
      window.element.viewer
        .get('i18n')
        .addTranslations('nl', { acme: { send: 'Verzenden' }, 'zoom:in': 'Dichterbij' }),
    );
    await frames(tab);
    expect(await buttonOf(tab, 'Verzenden', '[data-bar="main"]')).not.toBeNull();
    expect(await buttonOf(tab, 'Dichterbij')).not.toBeNull();
    // Dutch's other words stay.
    expect(await buttonOf(tab, 'Uitzoomen')).not.toBeNull();
    const after = await tab.evaluate(() => ({
      zoom: window.element.viewer.get('stage').getZoomLevel() as number,
      documents: window.element.viewer.documents
        .list()
        .map((document: { id: string }) => document.id),
      readies: window.readies.length,
      sameViewer: window.readies[0] === window.element.viewer,
    }));
    expect(after).toEqual({ ...before, readies: 1, sameViewer: true });
    await close(tab);
  });

  it('moves more buttons into "More" for longer words, and fewer for shorter ones', async () => {
    const tab = await open('/measured.html', 'en');
    /** The rows of the main bar's "More" menu, opened and closed again; none without one. */
    const inMore = async (more: string): Promise<string[]> => {
      const button = await buttonOf(tab, more, '[data-bar="main"]');
      if (!button) return [];
      await clickOn(tab, button);
      await tab.waitForFunction(() =>
        [...window.element.shadowRoot!.querySelectorAll('[role="menu"]')].some((menu) =>
          menu.matches(':popover-open'),
        ),
      );
      const rows = await tab.evaluate(() => {
        const menu = [...window.element.shadowRoot!.querySelectorAll('[role="menu"]')].find(
          (each) => each.matches(':popover-open'),
        )!;
        return [...menu.querySelectorAll('[role^="menuitem"]')]
          .filter((row) => row.closest('[role="menu"]') === menu)
          .map((row) => row.querySelector('.truncate')?.textContent ?? row.textContent ?? '');
      });
      await tab.keyboard.press('Escape');
      await frames(tab);
      return rows;
    };

    const english = await inMore('More');
    expect(english.length, 'some of the English buttons are in "More"').toBeGreaterThan(0);

    // German's words are longer: more of the buttons go.
    await switchTo(tab, 'de');
    const german = await inMore(stringOf(de.translations, 'demo.more'));
    expect(german.length).toBeGreaterThan(english.length);

    // French's are two letters each: fewer, and they're in the bar.
    await switchTo(tab, 'fr');
    const french = await inMore(stringOf(fr.translations, 'demo.more'));
    expect(french.length).toBeLessThan(english.length);
    for (const word of WORDS.map(shortWordOf)) {
      expect(await buttonOf(tab, word, '[data-bar="main"]'), word).not.toBeNull();
    }
    await close(tab);
  });
});
