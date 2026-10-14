/**
 * No word the viewer shows is left out of its languages. In a test language that wraps every
 * string of the English pack (`⟦Opacity⟧`), the viewer is walked through its bars, modes, menus,
 * panels and dialogs, and every visible text, title, label and placeholder must be wrapped: a
 * string the viewer writes itself, or a library's label shown without its key, comes out
 * unwrapped, and the test names it and where it showed. What isn't the viewer's to translate is
 * let through: text without letters (numbers, colours), units and scales (cm², 1/8 in = 1 ft),
 * what the document says (its file name, its form fields' names, tooltips and options, and the
 * text its pages draw: a field's painted value or caption, an annotation's label), keys (key caps
 * and a shortcut's keys), and the names the stamp and signature-font libraries give (in their own
 * languages). A string split around a control (the pager's "⟦Page [3] of 8⟧") counts as wrapped by
 * either bracket.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TranslationDictionary } from '@embedpdf/plugin-i18n';

import { en } from '../../chrome/src/locales/en';
import {
  dist,
  frames,
  launchChromium,
  serveViewer,
  waitForDocument,
  type ViewerHost,
} from './helpers/viewer-host';

/** Every string of a dictionary wrapped in ⟦ ⟧, its `{name}` slots kept. */
const wrapped = (dictionary: TranslationDictionary): TranslationDictionary =>
  Object.fromEntries(
    Object.entries(dictionary).map(([key, value]) => [
      key,
      typeof value === 'string' ? `⟦${value}⟧` : wrapped(value),
    ]),
  );

/** The test language: English, every string marked. */
const PSEUDO = 'en-XA';

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>untranslated</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; inset: 0; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    theme: 'light',
    locale: '${PSEUDO}',
    strings: { '${PSEUDO}': ${JSON.stringify(wrapped(en.translations))} },
  });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

/** Text a viewer may show unwrapped that isn't its own: the document's and the libraries'. */
const NOT_THE_VIEWERS = (tab: Page): Promise<string[]> =>
  tab.evaluate(() => {
    const { viewer } = window.element;
    const stamp = viewer.get('stamp');
    interface Field {
      name: string;
      alternateName?: string | null;
      options?: readonly { label: string; value: string }[];
      widgets: readonly { exportValue?: string }[];
    }
    const fields: readonly Field[] = viewer.get('form').list();
    return [
      'sample.pdf',
      // The document's form fields: their names, tooltips and options.
      ...fields.flatMap((field) => [
        field.name,
        field.name.slice(field.name.lastIndexOf('.') + 1),
        field.alternateName ?? '',
        ...(field.options ?? []).flatMap((option) => [option.label, option.value]),
        // A radio button's or a checkbox's value, which the form designer lists.
        ...field.widgets.map((widget) => widget.exportValue ?? ''),
      ]),
      // The default handwriting fonts, by their names (`@embedpdf/default-signature-fonts`).
      'Allura',
      'Great Vibes',
      'Caveat',
      ...stamp.listLibraries().map((library: { name: string }) => library.name),
      ...stamp.listAssets().map((asset: { label: string }) => asset.label),
    ].map((text) => text.trim());
  });

/** Every unwrapped word showing now, each with where it showed. */
const unwrapped = async (tab: Page): Promise<string[]> =>
  tab.evaluate(
    (allowed) => {
      const root = window.element.shadowRoot!;
      const shown = (element: Element | null): boolean =>
        !!element &&
        element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        // The toolbars' measuring copy, and key caps, which are the keyboard's names.
        !element.closest('[aria-hidden="true"], kbd');
      const isWord = (text: string) =>
        /\p{L}/u.test(text) &&
        !/[⟦⟧]/.test(text) &&
        !allowed.includes(text) &&
        // A colour, a size with its unit, a measuring unit or scale (cm², 1/8 in = 1 ft), a
        // shortcut's keys (⌘O, Ctrl+O).
        !/^#[0-9a-f]{3,8}$/i.test(text) &&
        !/^[\d.,\s]+(px|pt)$/i.test(text) &&
        !/^(?:[\d\s/.:=,]|mm|cm|km|m|in|ft|yd|mi|pt|ha|acre|²)+$/.test(text) &&
        !/^(?:[⌘⌥⇧⌃]|(?:Ctrl|Alt|Shift)\+)/.test(text);
      const where = (element: Element) =>
        element.closest('[data-epdf-panel]')?.getAttribute('data-epdf-panel') ??
        element.closest('[role="dialog"], [role="menu"], [role="toolbar"]')?.getAttribute('role') ??
        element.tagName.toLowerCase();
      const found = new Set<string>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || parent.closest('style, script, template')) continue;
        // The page's drawings: SVG text is a field's painted value or caption, or an annotation's
        // label or caption, the document's words.
        if (parent.closest('text')) continue;
        // An option shows while its select does; the browser draws it.
        if (!shown(parent.tagName === 'OPTION' ? parent.closest('select') : parent)) continue;
        const text = (node.textContent ?? '').trim();
        if (isWord(text)) found.add(`${where(parent)}: "${text}"`);
      }
      for (const element of root.querySelectorAll('[title], [aria-label], [placeholder], [alt]')) {
        if (!shown(element)) continue;
        for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
          const text = element.getAttribute(attribute)?.trim() ?? '';
          if (isWord(text)) found.add(`${where(element)} [${attribute}]: "${text}"`);
        }
      }
      return [...found];
    },
    await NOT_THE_VIEWERS(tab),
  );

const run = (tab: Page, command: string) =>
  tab.evaluate((id) => window.element.viewer.commands.execute(id), command);

/** Long enough for a lazy panel's or dialog's code to load and draw. */
const settle = async (tab: Page) => {
  await tab.waitForTimeout(600);
  await frames(tab);
};

const closeEverything = async (tab: Page) => {
  await tab.evaluate(() => {
    const shell = window.element.viewer.get('shell');
    shell.closeAllMenus();
    for (const surface of shell.listOpenSurfaces()) {
      if (surface.exclusive !== 'mode') shell.close(surface.id);
    }
  });
  await frames(tab);
};

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('the words the viewer shows', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;
  /** What each state of the running test showed unwrapped, by the state's name. */
  let found: Record<string, string[]> = {};
  beforeEach(() => {
    found = {};
  });

  /** Go into a state and keep what it shows unwrapped; `shows` is a word that proves it's there. */
  const visit = async (name: string, enter: () => Promise<unknown>, shows?: string) => {
    await enter();
    await settle(tab);
    if (shows !== undefined) {
      const text = await tab.evaluate(() => window.element.shadowRoot!.textContent ?? '');
      expect(text, name).toContain(`⟦${shows}⟧`);
    }
    const words = await unwrapped(tab);
    if (words.length > 0) found[name] = words;
  };

  beforeAll(async () => {
    host = await serveViewer({ '/untranslated.html': PAGE });
    browser = await launchChromium();
    tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/untranslated.html`);
    await waitForDocument(tab);
    await frames(tab);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('shows the test language', async () => {
    const text = await tab.evaluate(() => window.element.shadowRoot!.textContent ?? '');
    expect(text).toContain('⟦');
  });

  it('wraps every word of the bars, modes and menus', async () => {
    await visit('the bars', async () => {});
    for (const mode of ['annotate', 'shapes', 'insert', 'form', 'redact', 'measure', 'view']) {
      await visit(`mode:${mode}`, () => run(tab, `mode:${mode}`));
    }
    for (const menu of ['menu:document', 'menu:view', 'menu:zoom']) {
      await visit(menu, () => run(tab, menu));
      await closeEverything(tab);
    }
    expect(found).toEqual({});
  });

  it('wraps every word of the panels', async () => {
    for (const panel of [
      'thumbnails',
      'search',
      'comments',
      'style',
      'stamps',
      'signatures',
      'redaction',
      'measurement',
    ]) {
      // Its title, in its header, says it opened.
      const title = (en.translations.panels as Record<string, string>)[panel]!;
      await visit(`panel:${panel}`, () => run(tab, `panel:${panel}`), title);
      await closeEverything(tab);
    }
    // A tool's defaults in the style panel.
    await visit(
      'a tool in the style panel',
      async () => {
        await run(tab, 'tool:ink');
        await run(tab, 'panel:style');
      },
      'Stroke width',
    );
    await closeEverything(tab);
    await run(tab, 'tool:pointer');
    expect(found).toEqual({});
  });

  it('wraps every word around a selected annotation and selected text', async () => {
    await tab.evaluate(async () => {
      const annotation = window.element.viewer.get('annotation');
      const { annotation: made } = await annotation.create(0, {
        subtype: 'square',
        box: { x: 120, y: 160, width: 160, height: 100 },
      });
      annotation.selection.set([made.ref]);
    });
    await visit('a selected annotation', async () => {});
    await visit('its style and flags', () => run(tab, 'panel:style'), 'Flags (/F)');
    await closeEverything(tab);
    await visit('its link editor', () => run(tab, 'annotation:link'), 'URL');
    await closeEverything(tab);
    await tab.evaluate(() => window.element.viewer.get('annotation').selection.set([]));
    await visit('selected text', () =>
      tab.evaluate(() => window.element.viewer.get('selection').selectPage(0)),
    );
    await tab.evaluate(() => window.element.viewer.get('selection').clear?.());
    expect(found).toEqual({});
  });

  it('wraps every word of the form designer', async () => {
    await run(tab, 'mode:form');
    await visit('the form designer', () => run(tab, 'form:design'), 'Form design');
    // A field selected: its settings.
    await visit(
      "a field's settings",
      () =>
        tab.evaluate(() =>
          window.element
            .shadowRoot!.querySelector<HTMLButtonElement>(
              '[data-epdf-panel="form-design"] li button',
            )!
            .click(),
        ),
      'All fields',
    );
    // A radio group selected: its buttons, and the button that adds one.
    await visit(
      "a radio group's buttons",
      () =>
        tab.evaluate(async () => {
          const { viewer } = window.element;
          const page = viewer.documents.getPage(0);
          const { field } = await viewer.get('form').create({
            family: 'radio',
            name: 'guard-group',
            widgets: [
              {
                page: page.ref,
                rect: { x: 72, y: 40, width: 16, height: 16 },
                exportValue: 'Choice1',
              },
            ],
          });
          viewer.get('annotation').selection.set([field.widgets[0].ref]);
        }),
      'Add a button',
    );
    await tab.evaluate(() => window.element.viewer.get('annotation').selection.set([]));
    await run(tab, 'form:design');
    await run(tab, 'mode:view');
    expect(found).toEqual({});
  });

  it("reads every setting of a form field, of each family, in the viewer's language", async () => {
    // Read as data: the style panel shows these for a field selected in Form mode.
    const unread = await tab.evaluate(async () => {
      const { viewer } = window.element;
      const form = viewer.get('form');
      const i18n = viewer.get('i18n');
      const page = viewer.documents.getPage(0);
      const box = (y: number) => ({ page: page.ref, rect: { x: 72, y, width: 160, height: 24 } });
      // The document has text fields, checkboxes and buttons; radio buttons, a list and a
      // dropdown join them.
      const options = [{ label: 'One', value: 'one' }];
      await form.create({ family: 'combobox', name: 'guard-combo', options, widgets: [box(72)] });
      await form.create({ family: 'listbox', name: 'guard-list', options, widgets: [box(110)] });
      await form.create({
        family: 'radio',
        name: 'guard-radio',
        widgets: [{ ...box(150), exportValue: 'one' }],
      });
      const byFamily = new Map<string, unknown>();
      for (const field of form.list()) {
        if (!byFamily.has(field.family)) byFamily.set(field.family, field.ref);
      }
      const unwrapped: string[] = [];
      for (const [family, ref] of byFamily) {
        for (const setting of form.getFieldSettings(ref)?.properties ?? []) {
          const text: string = i18n.t(setting.labelKey, { fallback: setting.label });
          if (!text.includes('⟦')) unwrapped.push(`${family} ${setting.key}: "${text}"`);
        }
      }
      return { families: [...byFamily.keys()].sort(), unwrapped };
    });
    expect(unread.families).toEqual(
      expect.arrayContaining(['checkbox', 'combobox', 'listbox', 'radio', 'text']),
    );
    expect(unread.unwrapped).toEqual([]);
  });

  it('wraps every word of the dialogs', async () => {
    await visit('help:shortcuts', () => run(tab, 'help:shortcuts'), 'Keyboard Shortcuts');
    await closeEverything(tab);
    await visit('page:go-to', () => run(tab, 'page:go-to'), 'Go to Page');
    await closeEverything(tab);
    await visit(
      'the signature maker',
      () =>
        tab.evaluate(() =>
          window.element.viewer.get('shell').open('signature-maker', { exclusive: 'modal' }),
        ),
      'New signature',
    );
    await closeEverything(tab);
    await visit(
      'redaction:apply',
      async () => {
        await tab.evaluate(() =>
          window.element.viewer
            .get('redaction')
            .markArea(0, { x: 300, y: 300, width: 120, height: 40 }),
        );
        await run(tab, 'redaction:apply');
      },
      'Apply redactions?',
    );
    await closeEverything(tab);
    expect(found).toEqual({});
  });
});
