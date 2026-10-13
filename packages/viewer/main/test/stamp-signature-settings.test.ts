/**
 * The settings only the viewer has, next to the plugins' own: `plugins.stamp.quick` puts stamps in
 * the Insert toolbar by library and name, `plugins.stamp.standard: false` leaves the standard
 * stamps out, and `plugins.signature.kinds` and `fonts` shape the signature maker, which offers
 * three handwriting fonts by default and embeds the one a typed mark uses. The plugins' own
 * settings in the same objects still reach them.
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

const CONFIGS = {
  quick: {
    plugins: {
      stamp: { quick: ['standard:Approved', 'standard:Rejected'], previewWidth: 128 },
      signature: {
        mode: 'ask',
        kinds: ['signature'],
        fonts: [{ key: 'brand-script', url: '/fonts/brand.ttf', label: 'Brand Script' }],
      },
    },
  },
  'no-standard': { plugins: { stamp: { standard: false } } },
  defaults: {},
} as const;

/** A one-page PDF with an empty signature field, `sig`. */
const SIGNATURE_FIELD = readFileSync(
  resolve(dist, '../../../engine/main/test/fixtures/unsigned_sigfield.pdf'),
).toString('base64');

const page = (
  config: unknown,
  src = "'/sample.pdf'",
) => `<!doctype html><html><head><meta charset="utf-8">
<title>stamp and signature settings</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1280px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: ${src},
    theme: 'light',
    ...${JSON.stringify(config)},
  });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

/** The labels of the buttons in the viewer's toolbars, as a screen reader reads them. */
const buttonLabels = (tab: Page): Promise<string[]> =>
  tab.evaluate(() =>
    [...window.element.shadowRoot!.querySelectorAll('[role="toolbar"] button')].map(
      (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
    ),
  );

/** Run one of the viewer's commands, as its button does. */
const run = (tab: Page, command: string) =>
  tab.evaluate((id) => window.element.viewer.commands.execute(id), command);

/** The fonts the signature maker's Type tab offers, by their labels, once it's open. */
async function typedFonts(tab: Page): Promise<(string | undefined)[]> {
  await tab.evaluate(() => {
    const dialog = window.element.shadowRoot!.querySelector('[role="dialog"]')!;
    const type = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Type',
    );
    type!.click();
  });
  await frames(tab);
  return tab.evaluate(() =>
    [...window.element.shadowRoot!.querySelectorAll('[role="dialog"] select option')].map(
      (option) => option.textContent?.trim(),
    ),
  );
}

/** The text of the open dialog, or null without one. */
const dialogText = (tab: Page): Promise<string | null> =>
  tab.evaluate(
    () => window.element.shadowRoot!.querySelector('[role="dialog"]')?.textContent ?? null,
  );

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))(
  'the viewer stamp and signature settings',
  () => {
    let host: ViewerHost;
    let browser: Browser;

    beforeAll(async () => {
      host = await serveViewer({
        ...Object.fromEntries(
          Object.entries(CONFIGS).map(([name, config]) => [`/${name}.html`, page(config)]),
        ),
        '/signing.html': page(
          {},
          `Uint8Array.from(atob('${SIGNATURE_FIELD}'), (char) => char.charCodeAt(0))`,
        ),
      });
      browser = await launchChromium();
    });

    afterAll(async () => {
      await browser?.close();
      await host?.close();
    });

    const open = async (name: keyof typeof CONFIGS | 'signing'): Promise<Page> => {
      const tab = await browser.newPage({ viewport: { width: 1280, height: 760 } });
      await tab.goto(`${host.origin}/${name}.html`);
      await waitForDocument(tab);
      await frames(tab);
      return tab;
    };

    it('shows the quick stamps in the Insert toolbar, by library and name', async () => {
      const tab = await open('quick');
      await run(tab, 'mode:insert');
      await tab.waitForFunction(
        () =>
          [...window.element.shadowRoot!.querySelectorAll('[role="toolbar"] button')].some(
            (button) => button.getAttribute('aria-label') === 'Rejected',
          ),
        null,
        { timeout: 20_000 },
      );
      const labels = await buttonLabels(tab);
      expect(labels).toEqual(expect.arrayContaining(['Approved', 'Rejected']));
      // The stamp plugin's own setting, from the same object, reached the plugin.
      const previewWidth = await tab.evaluate(
        () => window.element.viewer.get('stamp').getSettings().previewWidth,
      );
      expect(previewWidth).toBe(128);
      await tab.close();
    });

    it('keeps only the marks kinds names, offers its fonts, and gives the plugin the rest', async () => {
      const tab = await open('quick');
      expect(
        await tab.evaluate(() => window.element.viewer.get('signature').getSettings().mode),
      ).toBe('ask');
      await tab.evaluate(() =>
        window.element.viewer.get('shell').open('signature-maker', { exclusive: 'modal' }),
      );
      await tab.waitForFunction(
        () => !!window.element.shadowRoot!.querySelector('[role="dialog"]'),
      );
      const text = await dialogText(tab);
      expect(text).toContain('Signature');
      expect(text).not.toContain('Initials');
      // The Type tab offers the app's fonts, in place of the default ones.
      expect(await typedFonts(tab)).toEqual(['Brand Script']);
      await tab.close();
    });

    it('offers three handwriting fonts by default, read when the Type tab opens', async () => {
      const tab = await open('defaults');
      const fetched: string[] = [];
      tab.on('response', (response) => fetched.push(new URL(response.url()).pathname));
      await tab.evaluate(() =>
        window.element.viewer.get('shell').open('signature-maker', { exclusive: 'modal' }),
      );
      await tab.waitForFunction(
        () => !!window.element.shadowRoot!.querySelector('[role="dialog"]'),
      );
      await frames(tab);
      // A chunk per font: none of them is fetched before the Type tab opens.
      expect(fetched.filter((path) => /\/(allura|great-vibes|caveat)-/.test(path))).toEqual([]);
      expect(await typedFonts(tab)).toEqual(['Allura', 'Great Vibes', 'Caveat']);
      const until = Date.now() + 10_000;
      while (!fetched.some((path) => /\/allura-/.test(path)) && Date.now() < until) {
        await tab.evaluate(() => new Promise((done) => setTimeout(done, 100)));
      }
      expect(fetched.filter((path) => /\/(allura|great-vibes|caveat)-/.test(path))).toEqual([
        expect.stringMatching(/\/allura-/),
      ]);
      await tab.close();
    });

    it('embeds the font of a typed mark in the saved PDF', async () => {
      const tab = await open('signing');
      await tab.evaluate(() =>
        window.element.viewer.get('shell').open('signature-maker', { exclusive: 'modal' }),
      );
      await tab.waitForFunction(
        () => !!window.element.shadowRoot!.querySelector('[role="dialog"]'),
      );
      await typedFonts(tab);
      // The person's name, then the mark typed in the first font, Allura.
      const dialog = tab.locator('embedpdf-viewer [role="dialog"]');
      await dialog.locator('input').first().fill('Ada Lovelace');
      await dialog.getByPlaceholder('Type your name').first().fill('Ada Lovelace');
      await dialog.getByRole('button', { name: 'Save' }).click();
      // The person's library, with the typed mark as its signature.
      const assetId = await tab.waitForFunction(
        () =>
          window.element.viewer
            .get('stamp')
            .listLibraries({ kind: 'signatures' })[0]
            ?.assetIds.find((id: string) => id.endsWith(':signature')) ?? null,
        null,
        { timeout: 20_000 },
      );
      const embedded = await tab.evaluate(
        async (mark) => {
          const { viewer } = window.element;
          await viewer
            .get('signature')
            .placeMark({ assetId: mark }, { field: { kind: 'fqn', name: 'sig' } });
          const bytes: Uint8Array = await viewer.documents.download();
          const text = new TextDecoder('latin1').decode(bytes);
          return {
            font: /\/(?:BaseFont|FontName)\s*\/[A-Z]{6}\+Allura/.test(text),
            program: text.includes('/FontFile2'),
          };
        },
        await assetId.jsonValue(),
      );
      expect(embedded).toEqual({ font: true, program: true });
      await tab.close();
    });

    it('keeps initials by default', async () => {
      const tab = await open('defaults');
      await tab.evaluate(() =>
        window.element.viewer.get('shell').open('signature-maker', { exclusive: 'modal' }),
      );
      await tab.waitForFunction(
        () => !!window.element.shadowRoot!.querySelector('[role="dialog"]'),
      );
      expect(await dialogText(tab)).toContain('Initials');
      await tab.close();
    });

    /** Whether the stamp plugin has the standard stamps. */
    const hasStandard = (tab: Page): Promise<boolean> =>
      tab.evaluate(
        () => window.element.viewer.get('stamp').getLibrary('embedpdf-standard') !== null,
      );

    it('brings in the standard stamps when the stamps panel opens', async () => {
      const tab = await open('defaults');
      expect(await hasStandard(tab)).toBe(false);
      await run(tab, 'panel:stamps');
      await tab.waitForFunction(
        () => window.element.viewer.get('stamp').getLibrary('embedpdf-standard') !== null,
        null,
        { timeout: 20_000 },
      );
      await tab.close();
    });

    it('leaves the standard stamps out with standard: false', async () => {
      const tab = await open('no-standard');
      await run(tab, 'panel:stamps');
      await tab.evaluate(() => new Promise((done) => setTimeout(done, 2000)));
      expect(await hasStandard(tab)).toBe(false);
      await tab.close();
    });
  },
);
