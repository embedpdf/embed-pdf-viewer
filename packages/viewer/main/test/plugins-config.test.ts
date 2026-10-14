/**
 * `plugins` in the config: a built-in plugin's settings by its name, over the viewer's own; a
 * plugin of your own as its definition, which `viewer.get(name)` finds; a warning for a name the
 * viewer doesn't know; and the annotation plugin's `editable` and the form plugin's `fillable`
 * meeting what `disable` and `readOnly` turn off, so each only takes away.
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

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<title>plugins config</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  // A plugin of the app's own, as a headless app writes one.
  const AnalyticsToken = { name: 'analytics' };
  window.tracked = [];
  const analyticsPlugin = (config) => ({
    id: 'acme-analytics',
    token: AnalyticsToken,
    create: () => ({ api: { track: (name) => window.tracked.push(config.endpoint + ' ' + name) } }),
  });
  window.warnings = [];
  const warn = console.warn;
  console.warn = (...args) => {
    window.warnings.push(args.join(' '));
    warn(...args);
  };
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: '/sample.pdf',
    disable: ['annotations.drawing'],
    plugins: {
      stage: { spread: 'odd' },
      search: { highlight: { color: '#a7f3d0' } },
      actions: { javascript: { enabled: false } },
      annotation: {
        editable: ['ink', 'highlight'],
        tools: [{ id: 'highlight', defaults: { color: '#fde047' } }],
      },
      form: { fillable: ['text'] },
      commands: { disabledCommands: ['zoom:in'] },
      analytics: analyticsPlugin({ endpoint: '/api/events' }),
      serch: { highlight: {} },
    },
  });
</script>
</body></html>`;

/** What a page of this test keeps on `window`. */
interface PluginsWindow {
  element: HTMLElement & {
    disable: readonly string[] | undefined;
    readOnly: boolean | undefined;
    viewer: {
      get(name: string): Record<string, (...args: unknown[]) => unknown>;
      commands: { getSettings(): { disabledCategories: string[]; disabledCommands: string[] } };
    };
  };
  tracked: string[];
  warnings: string[];
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('plugins in the config', () => {
  let host: ViewerHost;
  let browser: Browser;
  let tab: Page;

  beforeAll(async () => {
    host = await serveViewer({ '/plugins.html': PAGE });
    browser = await launchChromium();
    tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/plugins.html`);
    await waitForDocument(tab);
    await frames(tab);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  /** The settings each plugin has now. */
  const settingsOn = () =>
    tab.evaluate(() => {
      const { viewer } = (window as unknown as PluginsWindow).element;
      const settings = (name: string) => viewer.get(name).getSettings!() as Record<string, never>;
      const annotation = settings('annotation');
      return {
        stage: { spread: settings('stage').spread, layout: settings('stage').layout },
        search: settings('search').highlight,
        actions: settings('actions').javascript,
        tools: (annotation.tools as { id: string }[]).map((tool) => tool.id),
        editable: annotation.editable,
        fillable: settings('form').fillable,
        commands: viewer.commands.getSettings(),
      };
    });

  it("gives each built-in plugin the app's settings, over the viewer's own", async () => {
    const settings = await settingsOn();
    // The viewer's vertical layout stays; the app's spread joins it.
    expect(settings.stage).toEqual({ spread: 'odd', layout: 'vertical' });
    expect(settings.search).toMatchObject({ color: '#a7f3d0' });
    expect(settings.actions).toMatchObject({ enabled: false });
    // The app's tools come after the viewer's, so the viewer's own (arrow, image) stay.
    expect(settings.tools).toEqual(expect.arrayContaining(['arrow', 'image', 'highlight']));
    expect(settings.tools.at(-1)).toBe('highlight');
  });

  it('adds what the app turns off to what disable turns off', async () => {
    const { commands } = await settingsOn();
    expect(commands.disabledCategories).toEqual(['annotations.drawing']);
    expect(commands.disabledCommands).toEqual(['zoom:in']);
  });

  it("finds the app's own plugin by the name it was given", async () => {
    const tracked = await tab.evaluate(() => {
      const page = window as unknown as PluginsWindow;
      page.element.viewer.get('analytics').track!('opened');
      return page.tracked;
    });
    expect(tracked).toEqual(['/api/events opened']);
  });

  it('warns about a plugin name the viewer does not know', async () => {
    const warnings = await tab.evaluate(() => (window as unknown as PluginsWindow).warnings);
    expect(warnings).toContain(
      '[embedpdf] plugins: "serch" is not one of the viewer\'s plugins, and not a plugin ' +
        'definition (did you mean "search"?)',
    );
  });

  it('keeps only what both the app and disable or readOnly allow to be changed by hand', async () => {
    // Drawing is off, so ink is frozen: of the app's ink and highlight, highlight is left.
    expect(await settingsOn()).toMatchObject({ editable: ['highlight'], fillable: ['text'] });

    await tab.evaluate(() => ((window as unknown as PluginsWindow).element.disable = []));
    await frames(tab);
    expect(await settingsOn()).toMatchObject({
      editable: ['ink', 'highlight'],
      fillable: ['text'],
    });

    await tab.evaluate(() => ((window as unknown as PluginsWindow).element.readOnly = true));
    await frames(tab);
    const readOnly = await settingsOn();
    expect(readOnly).toMatchObject({ editable: false, fillable: false });
    // The app's own turned-off command stays off through the change.
    expect(readOnly.commands.disabledCommands).toEqual(['zoom:in']);

    await tab.evaluate(() => ((window as unknown as PluginsWindow).element.readOnly = false));
    await frames(tab);
    expect(await settingsOn()).toMatchObject({
      editable: ['ink', 'highlight'],
      fillable: ['text'],
    });
  });
});
