/**
 * What the Security page says the viewer does with a PDF it can't trust, checked in the viewer:
 * links open only on a click, and only to the web, mail and phone numbers; a document's scripts
 * and submit buttons reach no network and open no window; checking a signature asks no server;
 * and what people type into a comment shows as text. Every request the page makes is recorded,
 * and `window.open` too.
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

const fixtures = resolve(dist, '../../../engine/main/test/fixtures');

/** A PDF of `objects` (numbered from 1, the first one the catalog), with its cross-reference table. */
function pdfOf(objects: readonly string[]): Uint8Array {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

/** One link annotation on the page, 20 pt tall, at `top` points from the page's bottom. */
const link = (top: number, action: string) =>
  `<< /Type /Annot /Subtype /Link /Rect [72 ${top} 320 ${top + 20}] /Border [0 0 0] /A ${action} >>`;

const LINKS = [
  ['https://site.example.test/', '<< /S /URI /URI (https://site.example.test/) >>'],
  ['mailto:someone@example.test', '<< /S /URI /URI (mailto:someone@example.test) >>'],
  ['tel:+15551234567', '<< /S /URI /URI (tel:+15551234567) >>'],
  ['javascript:window.pwned=1', '<< /S /URI /URI (javascript:window.pwned=1) >>'],
  ['file:///etc/passwd', '<< /S /URI /URI (file:///etc/passwd) >>'],
  [
    'script',
    `<< /S /JavaScript /JS (app.launchURL\\("https://launch.example.test/", true\\);
      this.getURL\\("https://get.example.test/"\\);
      this.submitForm\\({ cURL: "https://script-submit.example.test/" }\\);) >>`,
  ],
  ['submit', '<< /S /SubmitForm /F << /FS /URL /F (https://submit.example.test/) >> /Flags 4 >>'],
] as const;

/**
 * A page of links, one per address above, a text field to submit, and a document that tries to
 * open addresses by itself: the catalog's open action and the page's.
 */
const LINKS_PDF = pdfOf([
  `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${LINKS.length + 4} 0 R] >>
     /OpenAction << /S /URI /URI (https://open.example.test/) >> >>`,
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
     /Annots [${LINKS.map((_, index) => `${index + 4} 0 R`).join(' ')} ${LINKS.length + 4} 0 R]
     /AA << /O << /S /URI /URI (https://page-open.example.test/) >> >> >>`,
  ...LINKS.map(([, action], index) => link(720 - index * 40, action)),
  `<< /Type /Annot /Subtype /Widget /FT /Tx /T (name) /V (Ada) /Rect [72 400 320 420] /F 4
     /P 3 0 R /DA (/Helv 12 Tf 0 g) >>`,
]);

const base64Of = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const page = (pdf: Uint8Array, extra = '') => `<!doctype html><html><head><meta charset="utf-8">
<title>untrusted pdf</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 760px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.opened = [];
  window.open = (url) => {
    window.opened.push(String(url));
    return null;
  };
  const bytes = Uint8Array.from(atob('${base64Of(pdf)}'), (char) => char.charCodeAt(0));
  window.element = EmbedPDF.init({
    target: '#viewer',
    src: bytes,
    theme: 'light',
    ${extra}
  });
</script>
</body></html>`;

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
    opened: string[];
    pwned?: unknown;
  }
}

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('a PDF the viewer cannot trust', () => {
  let host: ViewerHost;
  let browser: Browser;

  beforeAll(async () => {
    host = await serveViewer({
      '/links.html': page(LINKS_PDF),
      '/signed.html': page(new Uint8Array(readFileSync(join(fixtures, 'signed_certified.pdf')))),
      '/comments.html': page(new Uint8Array(readFileSync(join(fixtures, 'hello_world.pdf')))),
    });
    browser = await launchChromium();
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  /** A tab on `path` with its document open, and every request it makes to another origin. */
  const open = async (path: string): Promise<{ tab: Page; elsewhere: string[] }> => {
    const tab = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const elsewhere: string[] = [];
    await tab.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(host.origin)) return route.continue();
      elsewhere.push(url);
      return route.abort();
    });
    tab.on('popup', (popup) => elsewhere.push(`popup ${popup.url()}`));
    await tab.goto(`${host.origin}${path}`);
    await waitForDocument(tab);
    await frames(tab);
    return { tab, elsewhere };
  };

  /** Click the link labelled `label` where a person would: the middle of its box. */
  const clickLink = async (tab: Page, label: string) => {
    const box = await tab.evaluate((wanted) => {
      const anchors = [...window.element.shadowRoot!.querySelectorAll('a[role="link"]')];
      const anchor = anchors.find((each) => each.getAttribute('aria-label') === wanted);
      if (!anchor) return null;
      const rect = anchor.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, label);
    if (!box) throw new Error(`no link "${label}"`);
    await tab.mouse.click(box.x, box.y);
    await tab.evaluate(() => new Promise((done) => setTimeout(done, 300)));
  };

  it('opens nothing by itself, and only http, https, mailto and tel after a click', async () => {
    const { tab, elsewhere } = await open('/links.html');
    // The catalog's and the page's open actions try two addresses as the document opens.
    await tab.evaluate(() => new Promise((done) => setTimeout(done, 1000)));
    expect(await tab.evaluate(() => window.opened)).toEqual([]);

    // A website link is a real anchor; the blocked schemes get no href.
    const hrefs = await tab.evaluate(() =>
      Object.fromEntries(
        [...window.element.shadowRoot!.querySelectorAll('a[role="link"]')].map((anchor) => [
          anchor.getAttribute('aria-label'),
          anchor.getAttribute('href'),
        ]),
      ),
    );
    expect(hrefs['javascript:window.pwned=1']).toBeNull();
    expect(hrefs['file:///etc/passwd']).toBeNull();

    for (const [label] of LINKS.slice(0, 5)) await clickLink(tab, label);
    expect(await tab.evaluate(() => window.opened)).toEqual([
      'https://site.example.test/',
      'mailto:someone@example.test',
      'tel:+15551234567',
    ]);
    expect(await tab.evaluate(() => window.pwned)).toBeUndefined();
    expect(elsewhere).toEqual([]);
    await tab.close();
  });

  it("runs a document's scripts and submit buttons without a request or a window", async () => {
    const { tab, elsewhere } = await open('/links.html');
    const scriptLink = await tab.evaluate(() =>
      [...window.element.shadowRoot!.querySelectorAll('a[role="link"]')]
        .map((anchor) => anchor.getAttribute('aria-label') ?? '')
        .filter((label) => !label.includes(':')),
    );
    // The script link and the submit link carry no address of their own: both read as links.
    expect(scriptLink.length).toBe(2);
    for (const label of new Set(scriptLink)) {
      const boxes = await tab.evaluate(
        (wanted) =>
          [...window.element.shadowRoot!.querySelectorAll('a[role="link"]')]
            .filter((anchor) => anchor.getAttribute('aria-label') === wanted)
            .map((anchor) => {
              const rect = anchor.getBoundingClientRect();
              return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }),
        label,
      );
      for (const box of boxes) {
        await tab.mouse.click(box.x, box.y);
        await tab.evaluate(() => new Promise((done) => setTimeout(done, 500)));
      }
    }
    // Scripts run in this viewer (the actions plugin's own switch is on).
    expect(
      await tab.evaluate(
        () => window.element.viewer.get('actions').getSettings().javascript.enabled,
      ),
    ).toBe(true);
    expect(await tab.evaluate(() => window.opened)).toEqual([]);
    expect(elsewhere).toEqual([]);
    await tab.close();
  });

  it('checks a signature without asking any server', async () => {
    const { tab, elsewhere } = await open('/signed.html');
    const verdicts = await tab.evaluate(async () => {
      const signature = window.element.viewer.get('signature');
      return (await signature.validate()).map(
        (verdict: { integrity: string }) => verdict.integrity,
      );
    });
    expect(verdicts.length).toBeGreaterThan(0);
    expect(elsewhere).toEqual([]);
    await tab.close();
  });

  it('shows what people type into a comment as text, never as markup', async () => {
    const { tab } = await open('/comments.html');
    const markup = '<img src=x onerror="window.pwned=1"><b>bold</b><script>window.pwned=2</script>';
    await tab.evaluate(async (text) => {
      const annotation = window.element.viewer.get('annotation');
      const { annotation: note } = await annotation.create(0, {
        subtype: 'text',
        rect: { x: 72, y: 72, width: 24, height: 24 },
        contents: text,
      });
      await annotation.comments.reply(note.ref, `reply ${text}`);
      await window.element.viewer.commands.execute('panel:comments');
    }, markup);
    await tab.waitForFunction(
      (text) => (window.element.shadowRoot!.textContent ?? '').includes(`reply ${text}`),
      markup,
      { timeout: 20_000 },
    );
    const shown = await tab.evaluate(() => {
      const root = window.element.shadowRoot!;
      return {
        images: root.querySelectorAll('img[src="x"]').length,
        bold: [...root.querySelectorAll('b')].filter((each) => each.textContent === 'bold').length,
        scripts: root.querySelectorAll('script').length,
      };
    });
    expect(shown).toEqual({ images: 0, bold: 0, scripts: 0 });
    expect(await tab.evaluate(() => window.pwned)).toBeUndefined();
    await tab.close();
  });
});
