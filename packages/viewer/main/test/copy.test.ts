/**
 * Copying the selected text counts for the viewer that has focus only: with two viewers on a
 * page, each with text selected, Ctrl/Cmd+C copies from the one focus is inside, and so does a
 * copy the browser sends to the body (Edit → Copy); with focus elsewhere, the page copies its
 * own selected text without a viewer taking part.
 *
 * What gets copied is recorded in the page, so the system clipboard is never touched: the
 * Clipboard API's `writeText` is a stand-in, and a listener of the page's own, after the
 * viewers', reads each copy event and then keeps the browser from writing it.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dist, frames, launchChromium, serveViewer, type ViewerHost } from './helpers/viewer-host';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>copy</title>
<style>
  body { margin: 0; }
  #page-text { position: absolute; left: 8px; top: 0; margin: 8px 0; }
  #a { position: absolute; left: 0; top: 60px; width: 620px; height: 700px; display: block; }
  #b { position: absolute; left: 640px; top: 60px; width: 620px; height: 700px; display: block; }
</style></head>
<body>
<p id="page-text">Text of the page around the viewers.</p>
<embedpdf-viewer id="a" src="/sample.pdf" theme="light" locale="en"></embedpdf-viewer>
<embedpdf-viewer id="b" src="/sample.pdf" theme="light" locale="en"></embedpdf-viewer>
<script type="module">
  import '/embedpdf.js';
</script>
</body></html>`;

type Name = 'a' | 'b';
type ViewerElement = HTMLElement & { viewer: any };
interface CopyRecord {
  prevented: boolean;
  text: string;
}
/** What the page records. */
interface Recorded {
  /** The texts given to the Clipboard API. */
  written: string[];
  /** Each copy event, as the viewers left it. */
  copies: CopyRecord[];
  /** Whether a viewer prevented each key press, its modifiers left out. */
  keys: boolean[];
}

/** Before the page's scripts: the recording stand-in and listeners. */
function recordCopying(): void {
  const recorded = window as unknown as Recorded;
  recorded.written = [];
  recorded.copies = [];
  recorded.keys = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        recorded.written.push(text);
      },
    },
  });
  // On the window, so after the viewers' listeners, which are on the document. A shortcut's
  // modifiers (Ctrl, Cmd) come as keys of their own first: only the key they go with counts.
  const MODIFIERS = ['Control', 'Meta', 'Shift', 'Alt'];
  window.addEventListener('keydown', (event) => {
    if (!MODIFIERS.includes(event.key)) recorded.keys.push(event.defaultPrevented);
  });
  window.addEventListener('copy', (event) => {
    recorded.copies.push({
      prevented: event.defaultPrevented,
      text: event.clipboardData?.getData('text/plain') ?? '',
    });
    // Recorded: the browser writes nothing to the system clipboard.
    event.preventDefault();
  });
}

const recordedOf = (tab: Page) =>
  tab.evaluate(() => {
    const { written, copies, keys } = window as unknown as Recorded;
    return { written: [...written], copies: [...copies], keys: [...keys] };
  });

const forgetRecorded = (tab: Page) =>
  tab.evaluate(() => {
    const recorded = window as unknown as Recorded;
    recorded.written.length = 0;
    recorded.copies.length = 0;
    recorded.keys.length = 0;
  });

/** Select a whole page in each viewer, a different one in each: page 1 in A, page 2 in B. */
async function selectInBoth(tab: Page): Promise<void> {
  await tab.evaluate(() => {
    const viewer = (name: string) => (document.getElementById(name) as ViewerElement).viewer;
    viewer('a').get('selection').selectPage(0);
    viewer('b').get('selection').selectPage(1);
  });
  await tab.waitForFunction(() =>
    ['a', 'b'].every((name) =>
      (document.getElementById(name) as ViewerElement).viewer.get('selection').hasSelection(),
    ),
  );
}

/** The text a viewer's selection reads. */
const selectedText = (tab: Page, name: Name) =>
  tab.evaluate(
    (which) =>
      (document.getElementById(which) as ViewerElement).viewer
        .get('selection')
        .readText() as Promise<string>,
    name,
  );

/** Click the middle of a viewer's pages, which puts focus inside it. */
async function clickPages(tab: Page, name: Name): Promise<void> {
  const box = await tab.evaluate(
    (which) => document.getElementById(which)!.getBoundingClientRect().toJSON(),
    name,
  );
  await tab.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  await frames(tab);
}

/** Whether focus is inside a viewer: somewhere in its shadow root. */
const hasFocus = (tab: Page, name: Name) =>
  tab.evaluate((which) => {
    const element = document.getElementById(which)!;
    return document.activeElement === element && element.shadowRoot!.activeElement !== null;
  }, name);

/** A copy event at the body, where the browser sends Edit → Copy when nothing is selected. */
const copyAtBody = (tab: Page) =>
  tab.evaluate(() => {
    const event = new ClipboardEvent('copy', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: new DataTransfer(),
    });
    document.body.dispatchEvent(event);
    return (window as unknown as Recorded).copies.at(-1)!;
  });

/** Long enough for a viewer's clipboard write, which reads the text first, to have landed. */
const writesSettled = (tab: Page) => tab.waitForTimeout(400);

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('copying', () => {
  let host: ViewerHost;
  let browser: Browser;
  let context: BrowserContext;
  let tab: Page;
  const texts = { a: '', b: '' };

  beforeAll(async () => {
    host = await serveViewer({ '/copy.html': PAGE });
    browser = await launchChromium();
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(recordCopying);
    tab = await context.newPage();
    await tab.goto(`${host.origin}/copy.html`);
    await tab.waitForFunction(
      () =>
        ['a', 'b'].every((name) =>
          /Page 1 of \d+/.test(document.getElementById(name)?.shadowRoot?.textContent ?? ''),
        ),
      null,
      { timeout: 60_000 },
    );
    await frames(tab);
    await selectInBoth(tab);
    texts.a = await selectedText(tab, 'a');
    texts.b = await selectedText(tab, 'b');
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('selects different text in each viewer', () => {
    expect(texts.a.length).toBeGreaterThan(0);
    expect(texts.b.length).toBeGreaterThan(0);
    expect(texts.a).not.toBe(texts.b);
  });

  it('copies on Ctrl/Cmd+C from the viewer focus is inside, and from it alone', async () => {
    for (const name of ['a', 'b'] as const) {
      await clickPages(tab, name);
      expect(await hasFocus(tab, name)).toBe(true);
      // The press on the pages may have changed the selection: select again, in both.
      await selectInBoth(tab);
      await forgetRecorded(tab);
      await tab.keyboard.press('ControlOrMeta+c');
      await expect.poll(async () => (await recordedOf(tab)).written).toContain(texts[name]);
      await writesSettled(tab);
      expect((await recordedOf(tab)).written).toEqual([texts[name]]);
    }
  });

  it('answers a copy at the body (Edit → Copy) from the viewer focus is inside', async () => {
    await clickPages(tab, 'a');
    expect(await hasFocus(tab, 'a')).toBe(true);
    await selectInBoth(tab);
    await forgetRecorded(tab);
    // The text is read once the selection settles, so the copy event can be answered at once.
    await expect
      .poll(() => copyAtBody(tab), { timeout: 5_000 })
      .toEqual({ prevented: true, text: texts.a });
  });

  it("leaves the page's own selected text to the page while focus is outside the viewers", async () => {
    await selectInBoth(tab);
    await tab.click('#page-text', { clickCount: 3 });
    expect(await hasFocus(tab, 'a')).toBe(false);
    expect(await hasFocus(tab, 'b')).toBe(false);
    await forgetRecorded(tab);
    await tab.keyboard.press('ControlOrMeta+c');
    await expect.poll(async () => (await recordedOf(tab)).copies.length).toBeGreaterThan(0);
    await writesSettled(tab);
    // The browser's own copy of the paragraph: no viewer prevented it, put its text in it, or
    // wrote anything.
    expect(await recordedOf(tab)).toEqual({
      written: [],
      copies: [{ prevented: false, text: '' }],
      keys: [false],
    });
  });
});
