/**
 * Shortcuts don't fall through: a key whose command is turned off, or not allowed by the
 * scope, never reaches the browser, and the viewer says why in a notice. Ctrl/Cmd+P without
 * printing doesn't print the page, and Ctrl/Cmd+C on text the user may not copy says so.
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

/** Everything but printing and copying. */
const READ_ONLY_SCOPE = [
  'doc.open',
  'doc.render',
  'doc.text.select',
  'doc.text.search',
  'doc.annotate.read',
];

const CONFIGS = {
  'not-allowed': { scope: READ_ONLY_SCOPE },
  'turned-off': { disable: ['documents.print'] },
} as const;

const page = (
  config: unknown,
) => `<!doctype html><html><head><meta charset="utf-8"><title>refused shortcuts</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 24px; top: 72px; width: 860px; height: 600px; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  // What the browser would do with the keys: print the page.
  window.printed = 0;
  window.print = () => { window.printed += 1; };
  EmbedPDF.init({ target: '#viewer', src: '/sample.pdf', ...${JSON.stringify(config)} });
</script>
</body></html>`;

/** The notice's text, once it has some. */
const notice = (tab: Page) =>
  tab
    .waitForFunction(
      () =>
        document
          .querySelector('embedpdf-viewer')
          ?.shadowRoot?.querySelector('[role="status"]')
          ?.textContent?.trim() || null,
      null,
      { timeout: 10_000 },
    )
    .then((handle) => handle.jsonValue());

const pressed = (tab: Page) =>
  tab.evaluate(() => ({
    printed: (window as unknown as { printed: number }).printed,
    prevented: (window as unknown as { prevented: boolean[] }).prevented.at(-1),
  }));

describe('refused shortcuts', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    expect(existsSync(join(dist, 'embedpdf.js')), 'run `pnpm build` first').toBe(true);
    host = await serveViewer(
      Object.fromEntries(
        Object.entries(CONFIGS).map(([name, config]) => [`/${name}.html`, page(config)]),
      ),
    );
    browser = await launchChromium();
  });
  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const open = async (name: keyof typeof CONFIGS): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(`${host.origin}/${name}.html`);
    await waitForDocument(tab);
    await frames(tab);
    // Added after the viewer's own listener, so it sees whether the viewer took the key.
    await tab.evaluate(() => {
      const record = window as unknown as { prevented: boolean[] };
      record.prevented = [];
      window.addEventListener('keydown', (event) => record.prevented.push(event.defaultPrevented));
    });
    return tab;
  };

  it('takes Ctrl/Cmd+P when the scope leaves printing out, and says printing isn’t allowed', async () => {
    const tab = await open('not-allowed');
    await tab.keyboard.press('ControlOrMeta+p');
    expect(await notice(tab)).toBe("Printing isn't allowed");
    expect(await pressed(tab)).toEqual({ printed: 0, prevented: true });
    await tab.close();
  });

  it('takes Ctrl/Cmd+P when printing is turned off, and says it isn’t available', async () => {
    const tab = await open('turned-off');
    await tab.keyboard.press('ControlOrMeta+p');
    expect(await notice(tab)).toBe("Print isn't available");
    expect(await pressed(tab)).toEqual({ printed: 0, prevented: true });
    await tab.close();
  });

  it('says copying isn’t allowed on Ctrl/Cmd+C over text the user may not copy', async () => {
    const tab = await open('not-allowed');
    // Wait for the first page's text, then drag across the title.
    await tab.waitForTimeout(1500);
    await tab.mouse.move(310, 240);
    await tab.mouse.down();
    await tab.mouse.move(450, 240, { steps: 5 });
    await tab.mouse.move(600, 240, { steps: 5 });
    await tab.mouse.up();
    await frames(tab);
    await tab.keyboard.press('ControlOrMeta+c');
    expect(await notice(tab)).toBe("Copying isn't allowed");
    expect((await pressed(tab)).prevented).toBe(true);
    await tab.close();
  });

  it('hides what the scope leaves out or the config turns off, and refuses it from code too', async () => {
    const commandsOf = (tab: Page, ids: readonly string[]) =>
      tab.evaluate(async (wanted) => {
        type Commands = {
          resolveCommand(id: string): { visible: boolean } | null;
          execute(id: string): Promise<unknown>;
        };
        const element = document.querySelector('embedpdf-viewer') as unknown as {
          viewer: { commands: Commands };
        };
        const { commands } = element.viewer;
        const result: Record<string, unknown> = {};
        for (const id of wanted) {
          result[id] = {
            visible: commands.resolveCommand(id)?.visible,
            execute: await commands.execute(id),
          };
        }
        return result;
      }, ids);
    const hidden = { visible: false, execute: { status: 'rejected', reason: 'hidden' } };

    const notAllowed = await open('not-allowed');
    expect(await commandsOf(notAllowed, ['tool:highlight', 'tool:text-field'])).toEqual({
      'tool:highlight': hidden,
      'tool:text-field': hidden,
    });
    await notAllowed.close();

    const turnedOff = await open('turned-off');
    expect(await commandsOf(turnedOff, ['document:print'])).toEqual({ 'document:print': hidden });
    await turnedOff.close();
  });
});
