/**
 * Long-term validation in the viewer: with `plugins.signature.revocation` set, a signature the
 * viewer seals gets its validation data right after, and the signature inspector says the file
 * holds everything a reader needs, and until when. When the answers can't be had the signature
 * is still sealed: the sign dialog says so in the reader's language, and the inspector offers
 * to add them later. With `documentTimestamp`, a document timestamp follows, in a field whose
 * box has no size and gets no control.
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
 * The viewer over the signature fixture, signing with a key a throwaway certificate authority
 * issued. `?revocation=` picks where the answers come from: the authority itself, or a source
 * nobody answers through; `?documentTimestamp` adds a document timestamp; `?mode=` is the
 * signature mode, `?locale=` the viewer's language and `?scope=` what the session may do, as a
 * comma-separated list.
 */
const page = `<!doctype html><html><head><meta charset="utf-8">
<title>long-term validation</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1280px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF, {
    createTestCertificateAuthority,
    createTestTimestampAuthority,
  } from '/embedpdf.js';
  const bytes = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const query = new URLSearchParams(location.search);
  const authority = await createTestCertificateAuthority();
  const signer = await authority.issueSigner({ commonName: 'Test signer' });
  const timestampAuthority = await createTestTimestampAuthority({
    commonName: 'Test Timestamp Authority',
  });
  window.sources = {
    working: authority.revocation,
    silent: {
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    },
  };
  window.mark = { source: bytes('${MARK}') };
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: bytes('${SIGNATURE_FIELD}'),
    theme: 'light',
    ...(query.get('locale') ? { locale: query.get('locale') } : {}),
    ...(query.get('scope') ? { scope: query.get('scope').split(',') } : {}),
    plugins: {
      signature: {
        signingKey: signer,
        timestampAuthority,
        revocation: window.sources[query.get('revocation') ?? 'working'],
        documentTimestamp: query.has('documentTimestamp'),
        ...(query.get('mode') ? { mode: query.get('mode') } : {}),
        trust: {
          anchors: async () => [authority.certificate],
          timestampAnchors: async () => [timestampAuthority.certificate],
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
    sources: Record<'working' | 'silent', unknown>;
  }
}

const FIELD = { kind: 'fqn', name: 'sig' } as const;
const ADD = 'Add verification information';

/** Everything the viewer shows, as text. */
const viewerText = (tab: Page): Promise<string> =>
  tab.evaluate(() => window.element.shadowRoot!.textContent ?? '');

/** Wait until the viewer shows `text` somewhere. */
const shows = (tab: Page, text: string): Promise<unknown> =>
  tab.waitForFunction((wanted) => window.element.shadowRoot!.textContent?.includes(wanted), text, {
    timeout: 20_000,
  });

/** Press the viewer's button that reads `label`. */
const press = (tab: Page, label: string): Promise<void> =>
  tab.evaluate((wanted) => {
    const buttons = [...window.element.shadowRoot!.querySelectorAll('button')];
    buttons.find((button) => button.textContent?.trim() === wanted)!.click();
  }, label);

/** Sign the field from code, and say whether the validation data followed. */
const sign = (tab: Page): Promise<{ added: boolean; failed: boolean; stamped: boolean }> =>
  tab.evaluate(async (field) => {
    const result = await window.element.viewer.get('signature').sign({ field, mark: window.mark });
    return {
      added: result.validationInfo !== null,
      failed: result.validationInfoError !== null,
      stamped: !!result.validationInfo?.documentTimestamp,
    };
  }, FIELD);

const longTermOf = (tab: Page): Promise<any> =>
  tab.evaluate(async (field) => {
    const signature = window.element.viewer.get('signature');
    await signature.validate();
    const verdict = signature.getVerdict(field);
    return { revocation: verdict.revocation, ...verdict.longTerm };
  }, FIELD);

const inspect = (tab: Page): Promise<void> =>
  tab.evaluate((field) => window.element.viewer.get('signature').requestInspection(field), FIELD);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))(
  'long-term validation in the viewer',
  () => {
    let host: ViewerHost;
    let browser: Browser;

    beforeAll(async () => {
      host = await serveViewer({ '/long-term.html': page });
      browser = await launchChromium();
    });

    afterAll(async () => {
      await browser?.close();
      await host?.close();
    });

    const open = async (query = ''): Promise<Page> => {
      const tab = await browser.newPage({ viewport: { width: 1280, height: 760 } });
      await tab.goto(`${host.origin}/long-term.html${query}`);
      await waitForDocument(tab);
      await frames(tab);
      return tab;
    };

    it('a signature sealed with a revocation source reads enabled in the inspector', async () => {
      const tab = await open();
      expect(await sign(tab)).toEqual({ added: true, failed: false, stamped: false });
      const longTerm = await longTermOf(tab);
      expect(longTerm).toMatchObject({ revocation: 'good', enabled: true, missing: [] });

      await inspect(tab);
      await shows(tab, 'Long-term validation');
      const text = await viewerText(tab);
      expect(text).toContain('Not revoked');
      expect(text).toContain('Enabled');
      // The day the proof runs out, written out in the viewer's format language.
      const until = new Date(longTerm.expiresAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      expect(text).toContain(`Provable until ${until}`);
      // Nothing is missing, so nothing is offered.
      expect(text).not.toContain(ADD);
      await tab.close();
    });

    it('without the answers the inspector says what is missing, and adds it when asked', async () => {
      const tab = await open('?revocation=silent');
      // The signature is sealed; only what should have followed is not there.
      expect(await sign(tab)).toEqual({ added: false, failed: true, stamped: false });
      expect((await longTermOf(tab)).enabled).toBe(false);

      await inspect(tab);
      await shows(tab, 'Not enabled');
      const text = await viewerText(tab);
      expect(text).toContain('No revocation answer: Test signer');
      expect(text).toContain(ADD);

      // Nobody answers: the inspector says so, and the button stays.
      await press(tab, ADD);
      await shows(tab, 'A certificate authority did not answer. Try again.');

      // The authority answers again.
      await tab.evaluate(() =>
        window.element.viewer
          .get('signature')
          .updateSettings({ revocation: window.sources.working }),
      );
      await press(tab, ADD);
      await shows(tab, 'Provable until');
      const after = await viewerText(tab);
      expect(after).toContain('Not revoked');
      expect(after).not.toContain(ADD);
      expect(after).not.toContain('Not enabled');
      await tab.close();
    });

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
        // The last button seals; the one before it only draws the mark in.
        [...dialog.querySelectorAll('button')].at(-1)!.click();
      });
    };
    const dialogShows = (tab: Page, text: string): Promise<unknown> =>
      tab.waitForFunction(
        (wanted) =>
          window.element
            .shadowRoot!.querySelector('[role="dialog"]')
            ?.textContent?.includes(wanted),
        text,
        { timeout: 20_000 },
      );
    const isSigned = (tab: Page): Promise<boolean> =>
      tab.evaluate(
        (field) => window.element.viewer.get('signature').getSignature(field)?.signed === true,
        FIELD,
      );

    it('the sign dialog says so when the session may not add the verification information', async () => {
      // Signing fields is not `doc.sign`, which storing the validation data takes: the sealing
      // then reports nothing added and nothing failed, and the signer still has to be told.
      const tab = await open('?mode=ask&scope=doc.open,doc.render,doc.forms.read,fields:sign:all');
      await signThroughDialog(tab);
      await dialogShows(tab, 'Signed. The verification information could not be added.');
      expect(await isSigned(tab)).toBe(true);
      expect((await longTermOf(tab)).enabled).toBe(false);
      await tab.close();
    });

    it('the sign dialog says when the verification information could not be added', async () => {
      const english = await open('?revocation=silent&mode=ask');
      await signThroughDialog(english);
      await dialogShows(english, 'Signed. The verification information could not be added.');
      expect(await isSigned(english)).toBe(true);
      // One button is left, and it closes the dialog.
      await english.evaluate(() => {
        const dialog = window.element.shadowRoot!.querySelector('[role="dialog"]')!;
        const buttons = [...dialog.querySelectorAll('button')];
        if (buttons.length !== 1) throw new Error(`${buttons.length} buttons in the dialog`);
        buttons[0]!.click();
      });
      await english.waitForFunction(
        () => !window.element.shadowRoot!.querySelector('[role="dialog"]'),
        null,
        { timeout: 20_000 },
      );
      await english.close();

      const dutch = await open('?revocation=silent&mode=ask&locale=nl');
      await signThroughDialog(dutch);
      await dialogShows(
        dutch,
        'Ondertekend. De verificatiegegevens konden niet worden toegevoegd.',
      );
      expect(await isSigned(dutch)).toBe(true);
      await dutch.close();
    });

    it('a document timestamp follows, in a field that gets no control', async () => {
      const tab = await open('?documentTimestamp');
      expect(await sign(tab)).toEqual({ added: true, failed: false, stamped: true });
      // The viewer hears of the new field as every session does, from the document's events.
      await tab.waitForFunction(
        () => window.element.viewer.get('signature').listSignatures().length === 2,
        null,
        { timeout: 20_000 },
      );
      const fields = await tab.evaluate(() =>
        window.element.viewer
          .get('signature')
          .listSignatures()
          .map((signature: any) => [signature.fieldName, signature.kind]),
      );
      expect(fields).toEqual([
        ['sig', 'signature'],
        ['Timestamp1', 'timestamp'],
      ]);
      const longTerm = await longTermOf(tab);
      expect(longTerm.enabled).toBe(true);
      expect(longTerm.documentTimestampedAt).not.toBeNull();

      // The signed field has its control, a button named after it. The timestamp's field has
      // a box of no size: nothing to click, and nothing for Tab to stop at.
      await frames(tab);
      const controls = await tab.evaluate(() =>
        [...window.element.shadowRoot!.querySelectorAll('button[aria-label]')]
          .map((button) => button.getAttribute('aria-label'))
          .filter((label) => label === 'sig' || label === 'Timestamp1'),
      );
      expect(controls).toEqual(['sig']);
      await tab.close();
    });
  },
);
