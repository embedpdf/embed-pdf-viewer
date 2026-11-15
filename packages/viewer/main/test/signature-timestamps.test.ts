/**
 * Signature timestamps in the viewer: with `plugins.signature.timestampAuthority` set, a
 * signature the viewer seals carries a timestamp, and the signature inspector shows the time
 * the authority vouches for and who the authority is. When the authority can't be had, the sign
 * dialog says so in the reader's language, and nothing is signed.
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

/** A one-page PDF with an empty signature field, `sig`. */
const SIGNATURE_FIELD = readFileSync(
  resolve(dist, '../../../engine/main/test/fixtures/unsigned_sigfield.pdf'),
).toString('base64');
/** A one-page PDF: the mark a signature is drawn with. */
const MARK = readFileSync(
  resolve(dist, '../../../engine/main/test/fixtures/signature_artwork.pdf'),
).toString('base64');

/**
 * The viewer over the signature fixture, signing with a throwaway key. `?authority=` picks the
 * timestamp authority: a working one, one that never answers, or one that refuses; `?mode=`
 * the signature mode; `?locale=` the viewer's language.
 */
const page = `<!doctype html><html><head><meta charset="utf-8">
<title>signature timestamps</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1280px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF, {
    createTestSigner,
    createTestTimestampAuthority,
    httpTimestampAuthority,
  } from '/embedpdf.js';
  const bytes = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const query = new URLSearchParams(location.search);
  const signer = await createTestSigner({ commonName: 'Test signer' });
  const working = await createTestTimestampAuthority({ commonName: 'Test Timestamp Authority' });
  const overHttp = (fetch) =>
    httpTimestampAuthority({ url: 'https://tsa.example.com/', retries: 0, fetch });
  const authorities = {
    working,
    unreachable: overHttp(async () => {
      throw new TypeError('Failed to fetch');
    }),
    refusing: overHttp(async () => new Response('no', { status: 403 })),
  };
  window.mark = { source: bytes('${MARK}') };
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: bytes('${SIGNATURE_FIELD}'),
    theme: 'light',
    ...(query.get('locale') ? { locale: query.get('locale') } : {}),
    plugins: {
      signature: {
        signingKey: signer,
        timestampAuthority: authorities[query.get('authority') ?? 'working'],
        ...(query.get('mode') ? { mode: query.get('mode') } : {}),
        trust: {
          anchors: async () => [signer.certificate],
          timestampAnchors: async () => [working.certificate],
        },
      },
    },
  });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
    mark: { source: Uint8Array };
  }
}

const FIELD = { kind: 'fqn', name: 'sig' } as const;

/** Everything the viewer shows, as text. */
const viewerText = (tab: Page): Promise<string> =>
  tab.evaluate(() => window.element.shadowRoot!.textContent ?? '');

/** The text of the open dialog, or null without one. */
const dialogText = (tab: Page): Promise<string | null> =>
  tab.evaluate(
    () => window.element.shadowRoot!.querySelector('[role="dialog"]')?.textContent ?? null,
  );

const isSigned = (tab: Page): Promise<boolean> =>
  tab.evaluate(
    (field) => window.element.viewer.get('signature').getSignature(field)?.signed === true,
    FIELD,
  );

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))(
  'signature timestamps in the viewer',
  () => {
    let host: ViewerHost;
    let browser: Browser;

    beforeAll(async () => {
      host = await serveViewer({ '/timestamps.html': page });
      browser = await launchChromium();
    });

    afterAll(async () => {
      await browser?.close();
      await host?.close();
    });

    const open = async (query = ''): Promise<Page> => {
      const tab = await browser.newPage({ viewport: { width: 1280, height: 760 } });
      await tab.goto(`${host.origin}/timestamps.html${query}`);
      await waitForDocument(tab);
      await frames(tab);
      return tab;
    };

    /** Drop the mark on the field in `ask` mode, and press the dialog's first button: Sign. */
    const signThroughDialog = async (tab: Page): Promise<void> => {
      await tab.evaluate(
        (field) => window.element.viewer.get('signature').placeMark(window.mark, { field }),
        FIELD,
      );
      await tab.waitForFunction(
        () => !!window.element.shadowRoot!.querySelector('[role="dialog"]'),
        null,
        { timeout: 20_000 },
      );
      await tab.evaluate(() => {
        const dialog = window.element.shadowRoot!.querySelector('[role="dialog"]')!;
        const buttons = [...dialog.querySelectorAll('button')];
        // The last button seals; the one before it only draws the mark in.
        buttons.at(-1)!.click();
      });
    };

    it('a signature sealed with an authority shows its timestamp in the inspector', async () => {
      const tab = await open();
      await tab.evaluate(
        (field) => window.element.viewer.get('signature').sign({ field, mark: window.mark }),
        FIELD,
      );
      expect(await isSigned(tab)).toBe(true);

      const timestamp = await tab.evaluate(async () => {
        const [verdict] = await window.element.viewer.get('signature').validate();
        return verdict.timestamp;
      });
      expect(timestamp).toMatchObject({
        summary: 'valid',
        trust: 'trusted',
        authorityName: 'Test Timestamp Authority',
      });

      await tab.evaluate(
        (field) => window.element.viewer.get('signature').requestInspection(field),
        FIELD,
      );
      await tab.waitForFunction(
        () => window.element.shadowRoot!.textContent?.includes('Test Timestamp Authority'),
        null,
        { timeout: 20_000 },
      );
      const text = await viewerText(tab);
      expect(text).toContain('Timestamp');
      // The time shown is the authority's, written out in the viewer's format language.
      const shown = new Date(timestamp.genTime).toLocaleString('en-US');
      expect(text).toContain(shown);
      await tab.close();
    });

    it('an authority that does not answer: the dialog says so, and nothing is signed', async () => {
      const tab = await open('?authority=unreachable&mode=ask');
      await signThroughDialog(tab);
      await tab.waitForFunction(
        () =>
          window.element
            .shadowRoot!.querySelector('[role="dialog"]')
            ?.textContent?.includes('The timestamp service did not answer. Try again.'),
        null,
        { timeout: 20_000 },
      );
      expect(await isSigned(tab)).toBe(false);
      await tab.close();
    });

    it('an authority that refuses: the dialog says that, in the language the viewer speaks', async () => {
      const english = await open('?authority=refusing&mode=ask');
      await signThroughDialog(english);
      await english.waitForFunction(
        () =>
          window.element
            .shadowRoot!.querySelector('[role="dialog"]')
            ?.textContent?.includes('The timestamp service refused the request.'),
        null,
        { timeout: 20_000 },
      );
      await english.close();

      const dutch = await open('?authority=refusing&mode=ask&locale=nl');
      await signThroughDialog(dutch);
      await dutch.waitForFunction(
        () =>
          window.element
            .shadowRoot!.querySelector('[role="dialog"]')
            ?.textContent?.includes('De tijdstempeldienst heeft het verzoek geweigerd.'),
        null,
        { timeout: 20_000 },
      );
      expect(await dialogText(dutch)).not.toContain('refused');
      expect(await isSigned(dutch)).toBe(false);
      await dutch.close();
    });
  },
);
