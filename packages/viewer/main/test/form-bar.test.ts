/**
 * The Form mode is the layout's `form` bar: removing the bar removes the Form tab and its tools,
 * and people still fill in the form, which needs no mode.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

/** A form with three text fields: `alpha` and `beta` filled in, `log` empty. */
const FORM = readFileSync(
  resolve(dist, '../../../engine/main/test/fixtures/action_buttons_form.pdf'),
);

const page = (layout: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>form bar</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  const bytes = Uint8Array.from(atob('${FORM.toString('base64')}'), (char) => char.charCodeAt(0));
  window.element = EmbedPDF.init({ target: '#viewer', src: bytes, theme: 'light', ${layout} });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('the Form mode bar', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer({
      '/default.html': page(''),
      '/no-form-bar.html': page("layout: (layout) => layout.removeBar('form'),"),
    });
    browser = await launchChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  const open = async (path: string): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await frames(tab);
    return tab;
  };

  /** The mode tabs the main bar shows, by their labels. */
  const modeTabs = (tab: Page): Promise<string[]> =>
    tab.evaluate(() =>
      [...window.element.shadowRoot!.querySelectorAll('[role="toolbar"] button')]
        .map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '')
        .filter((label) =>
          ['View', 'Annotate', 'Shapes', 'Insert', 'Form', 'Redact', 'Measure'].includes(label),
        ),
    );

  /** Type into the field named `name` as a person does, and commit with Enter. */
  const fill = async (tab: Page, name: string, text: string) => {
    await tab.waitForFunction(
      (field) => !!window.element.shadowRoot!.querySelector(`input[aria-label="${field}"]`),
      name,
      { timeout: 20_000 },
    );
    const box = await tab.evaluate((field) => {
      const input = window.element.shadowRoot!.querySelector(`input[aria-label="${field}"]`)!;
      const rect = input.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, name);
    await tab.mouse.click(box.x, box.y);
    await tab.keyboard.type(text);
    await tab.keyboard.press('Enter');
    await tab.waitForFunction(
      ({ field, value }) => window.element.viewer.get('form').exportValues()[field] === value,
      { field: name, value: text },
      { timeout: 10_000 },
    );
  };

  it('is the bar named form: its tab opens it with the field tools', async () => {
    const tab = await open('/default.html');
    expect(await modeTabs(tab)).toContain('Form');
    await tab.evaluate(() => window.element.viewer.commands.execute('mode:form'));
    await frames(tab);
    const tools = await tab.evaluate(() =>
      [...window.element.shadowRoot!.querySelectorAll('[role="toolbar"] button')].map((button) =>
        button.getAttribute('aria-label'),
      ),
    );
    expect(tools).toEqual(expect.arrayContaining(['Text Field', 'Checkbox']));
    await tab.close();
  });

  it('leaves no Form tab without the bar, and the form still fills in', async () => {
    const tab = await open('/no-form-bar.html');
    expect(await modeTabs(tab)).not.toContain('Form');
    await fill(tab, 'log', 'filled without the Form mode');
    expect(
      await tab.evaluate(() => window.element.viewer.get('form').exportValues()),
    ).toMatchObject({ alpha: 'filled-a', log: 'filled without the Form mode' });
    await tab.close();
  });
});
