/**
 * Documents, as the page says: `documents` entries with `src`, `name`, `password` and `active`
 * each open in a tab; a document that can't be opened says why in its tab, with **Try again**;
 * closing a tab or leaving the page with unsaved changes asks first; and a `src` that is an
 * engine's open input (what the cloud viewer makes of `{ token }`) opens as it is and follows
 * its prop.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dist, frames, launchChromium, serveViewer, type ViewerHost } from './helpers/viewer-host';

/** PDFium's own encrypted fixture: user password `1234`. */
const encryptedPdf = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../engine/main/test/fixtures/encrypted.pdf',
  ),
);

const page = (config: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>documents</title>
<style>
  body { margin: 0; }
  #viewer { position: absolute; left: 0; top: 0; width: 1100px; height: 700px; display: block; }
</style></head>
<body>
<div id="viewer"></div>
<script type="module">
  import EmbedPDF, { EmbedPdfViewerElement } from '/embedpdf.js';
  // An engine that opens \`{ kind: 'token' }\` as a cloud engine does: the token names the
  // document, and the engine gives it its id. Here the document is the sample, and its id the
  // token's first word, so a renewed token ('b renewed') names the same document ('b').
  const local = EmbedPdfViewerElement.defaultEngineProvider(undefined).engine;
  const tokenEngine = () => {
    const engine = local();
    return new Proxy(engine, {
      get(target, key) {
        if (key === 'open') {
          return (input, options) =>
            input.kind === 'token'
              ? target.open(
                  { kind: 'bytes', id: 'doc-' + input.token.split(' ')[0], bytes: window.sample },
                  options,
                )
              : target.open(input, options);
        }
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  window.sample = new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer());
  window.element = EmbedPDF.init({ target: '#viewer', theme: 'light', ...${config} });
</script>
</body></html>`;

const PAGES = {
  '/several.html': page(`{
    documents: [
      { src: '/sample.pdf', name: 'Contract' },
      { src: '/sample.pdf', name: 'Appendix A' },
      { src: '/encrypted.pdf', name: 'Payroll', password: '1234' },
      { src: '/sample.pdf', name: 'Signed scan', active: true },
      { src: '/encrypted.pdf' },
    ],
  }`),
  '/failing.html': page(`{
    documents: [
      { src: '/sample.pdf', name: 'Report' },
      { src: '/flaky.pdf', name: 'Flaky' },
      { src: '/notes.pdf', name: 'Notes' },
      { src: '/sample.pdf', name: 'Last' },
    ],
  }`),
  '/unsaved.html': page(`{
    documents: [
      { src: '/sample.pdf', name: 'Contract' },
      { src: '/sample.pdf', name: 'Appendix' },
    ],
  }`),
  '/token.html': page(`{ engine: tokenEngine, src: { kind: 'token', token: 'a' } }`),
};

declare global {
  interface Window {
    // The same shape the other viewer tests give it.
    element: HTMLElement & Record<string, unknown> & { viewer: any; config: any };
  }
}

interface Tab {
  name: string | undefined;
  id: string;
  status: string;
  unsaved: boolean;
  error: string | null;
}

/** The open documents, in tab order, and the active one's name. */
const documentsOf = (tab: Page) =>
  tab.evaluate(() => {
    const documents = window.element.viewer.documents;
    return {
      tabs: (documents.list() as Array<Record<string, any>>).map(
        (document): Tab => ({
          name: document.name,
          id: document.id,
          status: document.status,
          unsaved: document.hasUnsavedChanges,
          error: document.error?.code ?? null,
        }),
      ),
      active: (documents.getActive() as { name?: string } | null)?.name ?? null,
    };
  });

/** Wait until every document has settled: none is loading any more. */
const waitForSettled = (tab: Page, count: number) =>
  tab.waitForFunction(
    (wanted) => {
      // The page makes the element once it has read the sample.
      const documents = window.element?.viewer?.documents;
      const list = (documents?.list() ?? []) as Array<{ status: string }>;
      return list.length === wanted && list.every((document) => document.status !== 'loading');
    },
    count,
    { timeout: 60_000 },
  );

/** The middle of the live element `selector` finds in the viewer, or of the one with `text`. */
const middleOf = (tab: Page, selector: string, text?: string) =>
  tab.evaluate(
    ({ selector, text }) => {
      const element = [...window.element.shadowRoot!.querySelectorAll(selector)].find(
        (candidate) =>
          !candidate.closest('[aria-hidden="true"]') &&
          (text === undefined || candidate.textContent?.trim() === text),
      );
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    },
    { selector, text },
  );

async function click(tab: Page, selector: string, text?: string): Promise<void> {
  const point = await middleOf(tab, selector, text);
  expect(point, `${selector} ${text ?? ''}`).not.toBeNull();
  await tab.mouse.click(point!.x, point!.y);
  await frames(tab);
}

/** The open dialog's title, or null with none open. */
const dialogTitle = (tab: Page) =>
  tab.evaluate(() => {
    const dialog = window.element.shadowRoot!.querySelector('[role="dialog"]');
    return dialog ? (dialog.querySelector('h2')?.textContent ?? '') : null;
  });

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('documents', () => {
  let host: ViewerHost;
  let browser: Browser;
  let sample: Buffer;

  beforeAll(async () => {
    host = await serveViewer(PAGES);
    browser = await launchChromium();
    sample = Buffer.from(await (await fetch(`${host.origin}/sample.pdf`)).arrayBuffer());
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  /** A page of this test, with `/encrypted.pdf`, a `/flaky.pdf` that's missing until asked again, and a `/notes.pdf` that isn't a PDF. */
  const open = async (path: string): Promise<Page> => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    let flakyAsked = 0;
    await tab.route('**/encrypted.pdf', (route) =>
      route.fulfill({ body: encryptedPdf, contentType: 'application/pdf' }),
    );
    await tab.route('**/flaky.pdf', (route) =>
      ++flakyAsked === 1
        ? route.fulfill({ status: 404, body: 'not here' })
        : route.fulfill({ body: sample, contentType: 'application/pdf' }),
    );
    await tab.route('**/notes.pdf', (route) =>
      route.fulfill({ body: 'just some notes, not a PDF', contentType: 'application/pdf' }),
    );
    await tab.goto(`${host.origin}${path}`);
    return tab;
  };

  it('opens each entry in a tab: its name, its password, and the one marked active first', async () => {
    const tab = await open('/several.html');
    await waitForSettled(tab, 5);
    const { tabs, active } = await documentsOf(tab);
    expect(tabs.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: 'Contract', status: 'ready' },
      { name: 'Appendix A', status: 'ready' },
      // Its password was given, so nobody is asked.
      { name: 'Payroll', status: 'ready' },
      { name: 'Signed scan', status: 'ready' },
      // Named after its file, and it asks for its password.
      { name: 'encrypted', status: 'locked' },
    ]);
    // Two entries of one URL are two documents.
    expect(new Set(tabs.map(({ id }) => id)).size).toBe(5);
    expect(active).toBe('Signed scan');
    await tab.close();
  });

  it('says why a document failed in its tab, and Try again opens it there', async () => {
    const tab = await open('/failing.html');
    await waitForSettled(tab, 4);
    expect((await documentsOf(tab)).tabs.map(({ name, error }) => ({ name, error }))).toEqual([
      { name: 'Report', error: null },
      { name: 'Flaky', error: 'not-found' },
      { name: 'Notes', error: 'invalid-input' },
      { name: 'Last', error: null },
    ]);

    // The tab's warning sign says why.
    const signs = await tab.evaluate(() =>
      [...window.element.shadowRoot!.querySelectorAll('[role="tab"] span[role="img"]')].map(
        (sign) => sign.getAttribute('aria-label'),
      ),
    );
    expect(signs).toEqual(['The file wasn’t found.', 'This file isn’t a PDF, or it’s damaged.']);

    await click(tab, '[role="tab"]', 'Notes');
    expect(
      await tab.evaluate(
        () => window.element.shadowRoot!.querySelector('[data-epdf-error-reason]')?.textContent,
      ),
    ).toBe('This file isn’t a PDF, or it’s damaged.');
    await click(tab, '[role="tab"]', 'Flaky');
    const pane = await tab.evaluate(() => ({
      reason: window.element.shadowRoot!.querySelector('[data-epdf-error-reason]')?.textContent,
      buttons: [...window.element.shadowRoot!.querySelectorAll('[role="alert"] button')].map(
        (button) => button.textContent,
      ),
    }));
    expect(pane).toEqual({
      reason: 'The file wasn’t found.',
      buttons: ['Close document', 'Try again'],
    });

    // The file is there now: it opens in its own tab, which keeps its place and stays active.
    await click(tab, '[role="alert"] button', 'Try again');
    await waitForSettled(tab, 4);
    const after = await documentsOf(tab);
    expect(after.tabs.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: 'Report', status: 'ready' },
      { name: 'Flaky', status: 'ready' },
      { name: 'Notes', status: 'error' },
      { name: 'Last', status: 'ready' },
    ]);
    expect(after.active).toBe('Flaky');
    await tab.close();
  });

  it('asks before a tab with unsaved changes closes, and before the page is left', async () => {
    const tab = await open('/unsaved.html');
    await waitForSettled(tab, 2);
    const closeButton = '[role="tab"] button';

    // A tab without changes closes at once.
    await tab.evaluate(() =>
      window.element.viewer.documents.open({ kind: 'url', url: '/sample.pdf' }, { name: 'Copy' }),
    );
    await waitForSettled(tab, 3);
    await frames(tab);
    await click(tab, closeButton);
    expect(await dialogTitle(tab)).toBeNull();
    expect((await documentsOf(tab)).tabs.map(({ name }) => name)).toEqual(['Contract', 'Appendix']);

    // One with changes asks; Cancel keeps it.
    const change = () =>
      tab.evaluate(async () => {
        await window.element.viewer.get('pageEdit').rotateBy([0], 90);
      });
    await change();
    await tab.waitForFunction(() => window.element.viewer.documents.getActive()?.hasUnsavedChanges);
    const active = (await documentsOf(tab)).active;
    await click(tab, closeButton);
    expect(await dialogTitle(tab)).toBe('Close without saving?');
    expect(
      await tab.evaluate(
        () => window.element.shadowRoot!.querySelector('[role="dialog"] p')?.textContent,
      ),
    ).toBe(`“${active}” has changes that weren’t downloaded. They’ll be lost.`);
    await click(tab, '[role="dialog"] button', 'Cancel');
    expect(await dialogTitle(tab)).toBeNull();
    expect((await documentsOf(tab)).tabs).toHaveLength(2);

    // Closing it anyway loses the changes.
    await click(tab, closeButton);
    await click(tab, '[role="dialog"] button', 'Close without saving');
    expect(await dialogTitle(tab)).toBeNull();
    const left = await documentsOf(tab);
    expect(left.tabs.map(({ name }) => name)).toEqual(
      ['Contract', 'Appendix'].filter((name) => name !== active),
    );

    // Leaving the page asks while a document has unsaved changes; staying keeps it.
    await change();
    await tab.waitForFunction(() => window.element.viewer.documents.getActive()?.hasUnsavedChanges);
    const asked: string[] = [];
    let stay = true;
    tab.on('dialog', (dialog) => {
      asked.push(dialog.type());
      void (stay ? dialog.dismiss() : dialog.accept());
    });
    const viewerUrl = tab.url();
    await expect(tab.goto('about:blank')).rejects.toThrow(/ERR_ABORTED/);
    expect(asked).toEqual(['beforeunload']);
    expect(tab.url()).toBe(viewerUrl);

    // Downloaded, nothing is lost: the page is left without asking.
    await tab.evaluate(() => window.element.viewer.documents.download());
    expect((await documentsOf(tab)).tabs.every(({ unsaved }) => !unsaved)).toBe(true);
    stay = false;
    await tab.goto('about:blank');
    expect(asked).toEqual(['beforeunload']);
    await tab.close();
  });

  it("opens an engine's open input as src, and follows it: another opens in its place", async () => {
    const tab = await open('/token.html');
    await waitForSettled(tab, 1);
    const ids = async () =>
      (await documentsOf(tab)).tabs.map(({ id, status }) => `${id} ${status}`);
    expect(await ids()).toEqual(['doc-a ready']);
    await tab.evaluate(() => {
      (window as any).closedIds = [];
      window.element.viewer.documents.onClosed(({ documentId }: { documentId: string }) =>
        (window as any).closedIds.push(documentId),
      );
    });

    // Another document: it opens in place of the first, which closes.
    await tab.evaluate(() => (window.element.src = { kind: 'token', token: 'b' }));
    await tab.waitForFunction(() => {
      const list = window.element.viewer.documents.list();
      return list.length === 1 && list[0].id === 'doc-b' && list[0].status === 'ready';
    });

    // The same input again is no change.
    await tab.evaluate(() => (window.element.src = { kind: 'token', token: 'b' }));
    await frames(tab);
    expect(await tab.evaluate(() => (window as any).closedIds)).toEqual(['doc-a']);

    // A renewed token of the same document opens it again, once the old one has closed.
    await tab.evaluate(() => (window.element.src = { kind: 'token', token: 'b renewed' }));
    await tab.waitForFunction(() => (window as any).closedIds.length === 2);
    await waitForSettled(tab, 1);
    expect(await ids()).toEqual(['doc-b ready']);

    // null closes it.
    await tab.evaluate(() => (window.element.src = null));
    await tab.waitForFunction(() => window.element.viewer.documents.getCount() === 0);
    await tab.close();
  });
});
