/**
 * The config a running `<embedpdf-viewer>` follows, and the `viewer` it hands out.
 *
 * `src`, `theme`, `locale`, `disable` and `readOnly` change in place, from their properties, from
 * `.config` and (for `src`, `theme` and `locale`) from the attributes: the viewer, and the kernel
 * inside it, stay the same objects. Any other change builds a new viewer. `scope` and `identity`
 * from the config reach the documents, and a read-only viewer still lets the app's code call
 * its plugins.
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

const shell = (body: string, script: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>live config</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
</style></head>
<body>
${body}
<script type="module">
  import EmbedPDF, { SearchToken } from '/embedpdf.js';
  window.SearchToken = SearchToken;
  window.kernelOf = (viewer) => viewer[Symbol.for('@embedpdf/viewer/kernel')];
  window.readies = [];
  ${script}
  window.element.addEventListener('epdf:ready', (event) => window.readies.push(event.detail.viewer));
</script>
</body></html>`;

const PAGES = {
  '/init.html': shell(
    '<div id="viewer"></div>',
    "window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', theme: 'light' });",
  ),
  '/declarative.html': shell(
    '<embedpdf-viewer id="viewer" src="/sample.pdf" theme="light" locale="en"></embedpdf-viewer>',
    "window.element = document.getElementById('viewer');",
  ),
  // Changed after the element mounts, before its viewer is ready.
  '/early.html': shell(
    '<div id="viewer"></div>',
    `window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf' });
    queueMicrotask(() => {
      window.element.locale = 'es';
      window.element.disable = ['search'];
    });`,
  ),
  '/scoped.html': shell(
    '<div id="viewer"></div>',
    `window.element = EmbedPDF.init({
      target: '#viewer',
      src: '/sample.pdf',
      scope: ['doc.open', 'doc.render', 'doc.text.select'],
      identity: { displayName: 'Ada Lovelace' },
    });`,
  ),
};

declare global {
  interface Window {
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
    readies: unknown[];
    kernelOf(viewer: unknown): unknown;
    SearchToken: unknown;
  }
}

async function open(browser: Browser, url: string): Promise<Page> {
  const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors: string[] = [];
  tab.on('pageerror', (error) => errors.push(error.message));
  await tab.goto(url);
  await waitForDocument(tab);
  await tab.waitForFunction(() => window.readies.length === 1);
  expect(errors).toEqual([]);
  return tab;
}

/** The viewer and its kernel are still the first ones: nothing mounted again. */
const sameViewer = (tab: Page) =>
  tab.evaluate(() => {
    const [first] = window.readies;
    return (
      window.readies.length === 1 &&
      window.element.viewer === first &&
      window.kernelOf(window.element.viewer) === window.kernelOf(first)
    );
  });

const isDark = (tab: Page) =>
  tab.evaluate(() =>
    window.element.shadowRoot!.querySelector('[data-embedpdf-root]')!.classList.contains('dark'),
  );

/** The documents' names and states, in tab order. */
const tabs = (tab: Page) =>
  tab.evaluate(() =>
    (window.element.viewer.documents.list() as Array<{ name: string; status: string }>).map(
      (document) => `${document.name}:${document.status}`,
    ),
  );

const waitForTabs = (tab: Page, expected: readonly string[]) =>
  tab.waitForFunction(
    (want) =>
      JSON.stringify(
        (window.element.viewer.documents.list() as Array<{ name: string; status: string }>).map(
          (document) => `${document.name}:${document.status}`,
        ),
      ) === JSON.stringify(want),
    expected,
    { timeout: 30_000 },
  );

const shadowText = (tab: Page) => tab.evaluate(() => window.element.shadowRoot!.textContent ?? '');

describe('a running viewer follows its live config', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    expect(existsSync(join(dist, 'embedpdf.js')), 'run `pnpm build` first').toBe(true);
    host = await serveViewer(PAGES);
    browser = await launchChromium();
    tab = await open(browser, `${host.origin}/init.html`);
  });
  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('switches the theme and its tokens in place', async () => {
    expect(await isDark(tab)).toBe(false);
    await tab.evaluate(() => (window.element.theme = 'dark'));
    await frames(tab);
    expect(await isDark(tab)).toBe(true);

    await tab.evaluate(
      () => (window.element.theme = { preference: 'light', tokens: { accent: '#0f6e56' } }),
    );
    await frames(tab);
    expect(await isDark(tab)).toBe(false);
    const accent = await tab.evaluate(() =>
      getComputedStyle(window.element.shadowRoot!.querySelector('[data-embedpdf-root]')!)
        .getPropertyValue('--epdf-accent')
        .trim(),
    );
    expect(accent).toBe('#0f6e56');
    expect(await sameViewer(tab)).toBe(true);
  });

  it('switches the language in place', async () => {
    await tab.evaluate(() => (window.element.locale = 'es'));
    await tab.waitForFunction(() =>
      /Página 1 de \d+/.test(window.element.shadowRoot!.textContent ?? ''),
    );
    await tab.evaluate(() => (window.element.locale = 'en'));
    await tab.waitForFunction(() =>
      /Page 1 of \d+/.test(window.element.shadowRoot!.textContent ?? ''),
    );
    expect(await sameViewer(tab)).toBe(true);
  });

  it('turns features and single commands off and on again in place', async () => {
    const settings = () =>
      tab.evaluate(() => {
        const { disabledCategories, disabledCommands } =
          window.element.viewer.commands.getSettings();
        return { disabledCategories, disabledCommands };
      });
    await tab.evaluate(() => (window.element.disable = ['search', 'tool:highlight']));
    expect(await settings()).toEqual({
      disabledCategories: ['search'],
      disabledCommands: ['tool:highlight'],
    });
    const searchShows = () =>
      tab.evaluate(() => window.element.viewer.commands.resolveCommand('panel:search')?.visible);
    expect(await searchShows()).toBe(false);

    await tab.evaluate(() => (window.element.disable = []));
    expect(await settings()).toEqual({ disabledCategories: [], disabledCommands: [] });
    expect(await searchShows()).toBe(true);
    expect(await sameViewer(tab)).toBe(true);
  });

  it('makes the viewer read-only and back in place, and the plugins keep working for code', async () => {
    const categories = () =>
      tab.evaluate(() => window.element.viewer.commands.getSettings().disabledCategories);
    await tab.evaluate(() => (window.element.readOnly = true));
    expect(await categories()).toEqual(expect.arrayContaining(['annotations', 'forms', 'pages']));

    // The interface is read-only; the app's code is not.
    const rotated = await tab.evaluate(async () => {
      const pageEdit = window.element.viewer.get('pageEdit');
      await pageEdit.rotateBy([0], 90);
      return window.element.viewer.get('documents').getPage(0).rotation;
    });
    expect(rotated).toBe(90);

    await tab.evaluate(() => (window.element.readOnly = { except: ['forms.filling'] }));
    const kept = await categories();
    expect(kept).toContain('forms.building');
    expect(kept).not.toContain('forms');

    await tab.evaluate(() => (window.element.readOnly = false));
    expect(await categories()).toEqual([]);
    expect(await sameViewer(tab)).toBe(true);
  });

  it('opens a new src in place of the old one: a URL, a File, bytes, then none', async () => {
    expect(await tabs(tab)).toEqual(['sample:ready']);
    const bytes = await tab.evaluate(async () =>
      Array.from(new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer())),
    );

    await tab.evaluate(
      (data) => (window.element.src = new File([new Uint8Array(data)], 'picked.pdf')),
      bytes,
    );
    await waitForTabs(tab, ['picked:ready']);

    await tab.evaluate((data) => (window.element.src = new Uint8Array(data)), bytes);
    await waitForTabs(tab, ['Document:ready']);

    await tab.evaluate(() => (window.element.src = '/sample.pdf?again'));
    await waitForTabs(tab, ['sample:ready']);

    await tab.evaluate(() => (window.element.src = null));
    await waitForTabs(tab, []);
    expect(await sameViewer(tab)).toBe(true);
  });

  it('follows the live keys from .config too, and builds a new viewer for any other change', async () => {
    await tab.evaluate(() => {
      window.element.config = { ...window.element.config, src: '/sample.pdf', theme: 'dark' };
    });
    await waitForTabs(tab, ['sample:ready']);
    await frames(tab);
    expect(await isDark(tab)).toBe(true);
    expect(await sameViewer(tab)).toBe(true);

    await tab.evaluate(() => {
      window.element.config = {
        ...window.element.config,
        commands: [{ id: 'acme:hello', label: 'Hello', run: () => {} }],
      };
    });
    await tab.waitForFunction(() => window.readies.length === 2);
    await waitForTabs(tab, ['sample:ready']);
    const remounted = await tab.evaluate(() => ({
      viewer: window.element.viewer === window.readies[1],
      kernel: window.kernelOf(window.readies[1]) !== window.kernelOf(window.readies[0]),
      command: window.element.viewer.commands.hasCommand('acme:hello'),
    }));
    expect(remounted).toEqual({ viewer: true, kernel: true, command: true });
  });
});

describe('a declarative viewer follows its attributes', () => {
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

  it('changes src, theme and locale in place', async () => {
    const tab = await open(browser, `${host.origin}/declarative.html`);
    await tab.evaluate(() => window.element.setAttribute('theme', 'dark'));
    await frames(tab);
    expect(await isDark(tab)).toBe(true);

    await tab.evaluate(() => window.element.setAttribute('locale', 'es'));
    await tab.waitForFunction(() =>
      /Página 1 de \d+/.test(window.element.shadowRoot!.textContent ?? ''),
    );

    await tab.evaluate(() => window.element.setAttribute('src', '/sample.pdf?second'));
    await waitForTabs(tab, ['sample:ready']);
    const id = await tab.evaluate(() => window.element.viewer.documents.getActiveId());
    expect(id).toBe('/sample.pdf?second');
    expect(await sameViewer(tab)).toBe(true);
    expect(await shadowText(tab)).toMatch(/Página 1 de \d+/);
  });

  it('takes a property over its attribute, and the attribute back for undefined', async () => {
    const tab = await open(browser, `${host.origin}/declarative.html`);
    await tab.evaluate(() => (window.element.theme = 'dark'));
    await frames(tab);
    expect(await isDark(tab)).toBe(true);
    await tab.evaluate(() => (window.element.theme = undefined));
    await frames(tab);
    expect(await isDark(tab)).toBe(false);
    expect(await sameViewer(tab)).toBe(true);
  });
});

describe('the viewer in code', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    host = await serveViewer(PAGES);
    browser = await launchChromium();
    tab = await open(browser, `${host.origin}/init.html`);
  });
  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('gives each plugin by its name, the same object as by its token', async () => {
    const result = await tab.evaluate(() => {
      const viewer = window.element.viewer;
      return {
        search: viewer.get('search') === viewer.get(window.SearchToken),
        documents: viewer.documents === viewer.get('documents'),
        commands: viewer.commands === viewer.get('commands'),
        stage: typeof viewer.get('stage').getCurrentPageIndex,
        tryStage: viewer.tryGet('stage') === viewer.get('stage'),
      };
    });
    expect(result).toEqual({
      search: true,
      documents: true,
      commands: true,
      stage: 'function',
      tryStage: true,
    });
  });

  it('names the plugins it has when asked for one it does not, and tryGet gives null', async () => {
    const { message, tried } = await tab.evaluate(() => {
      const tried = window.element.viewer.tryGet('nope');
      try {
        window.element.viewer.get('nope');
        return { message: null, tried };
      } catch (error) {
        return { message: (error as Error).message, tried };
      }
    });
    expect(message).toContain('no plugin named "nope"');
    expect(message).toContain('search');
    expect(tried).toBeNull();
  });

  it('talks to one document with forDocument, and has no command shortcuts of its own', async () => {
    const result = await tab.evaluate(() => {
      const viewer = window.element.viewer;
      const id = viewer.documents.getActiveId();
      return {
        pages: viewer.forDocument(id).get('stage') === viewer.get('stage'),
        retired: ['on', 'execute', 'resolve', 'watchCommand'].filter((name) => name in viewer),
      };
    });
    expect(result).toEqual({ pages: true, retired: [] });
  });

  it('runs commands through viewer.commands, and follows values with watch', async () => {
    const result = await tab.evaluate(async () => {
      const viewer = window.element.viewer;
      const seen: number[] = [];
      const stop = viewer.watch(
        () => viewer.get('stage').getCurrentPageIndex(),
        (index: number) => seen.push(index),
      );
      const executed: string[] = [];
      const off = viewer.commands.onExecuted(({ commandId }: { commandId: string }) =>
        executed.push(commandId),
      );
      const { status } = await viewer.commands.execute('zoom:in');
      off();
      stop();
      return { status, executed };
    });
    expect(result).toEqual({ status: 'executed', executed: ['zoom:in'] });
  });
});

describe('scope and identity from the config', () => {
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

  it('reach the documents: what the scope leaves out is refused, from code too', async () => {
    const tab = await open(browser, `${host.origin}/scoped.html`);
    const result = await tab.evaluate(async () => {
      const pageEdit = window.element.viewer.get('pageEdit');
      const canEdit = pageEdit.canEdit();
      const refusal = await pageEdit.rotateBy([0], 90).then(
        () => null,
        (error: { code?: string }) => error.code ?? 'rejected',
      );
      return { canEdit, refusal };
    });
    expect(result).toEqual({ canEdit: false, refusal: 'permission-denied' });
  });
});

describe('a change before the viewer is ready', () => {
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

  it('takes a change made before the viewer was ready', async () => {
    const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await tab.goto(`${host.origin}/early.html`);
    // Spanish, so the document shows as "Página 1 de …".
    await tab.waitForFunction(
      () => /Página 1 de \d+/.test(window.element.shadowRoot?.textContent ?? ''),
      null,
      { timeout: 60_000 },
    );
    const disabled = await tab.evaluate(
      () => window.element.viewer.commands.getSettings().disabledCategories,
    );
    expect(disabled).toEqual(['search']);
    expect(await sameViewer(tab)).toBe(true);
  });
});
