/**
 * Full Screen on a host page: the viewer's own box fills the screen, never the page around it,
 * and through a transform around it too; the button follows the browser's Escape; the page's own
 * full screen of something around the viewer stays when the viewer's ends; a dialog open in the
 * viewer stays over it as the page or the viewer goes full screen; a frame that may not go full
 * screen has no Full Screen, and one that may goes full screen from inside. Without full screen
 * for elements (an iPhone) the box covers the whole window until Escape, and a viewer that is the
 * whole window there has no Full Screen. A browser that refuses its full screen gets the window
 * too, under a dialog that was open.
 *
 * Runs against the built snippet (`pnpm build` first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Browser, Frame, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dist, launchChromium, serveViewer, type ViewerHost } from './helpers/viewer-host';

/**
 * A host page with a header, and the viewer in `box` (CSS) inside an element with a transform,
 * which holds in anything `position: fixed` inside it. Its own button makes that element full
 * screen.
 */
const page = (box: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>full screen</title>
<style>
  body { margin: 0; }
  header { height: 40px; }
  #around { position: absolute; left: 20px; top: 50px; right: 0; bottom: 0;
    transform: translateZ(0); overflow: hidden; }
  #viewer { position: absolute; ${box}; display: block; }
  #page-fullscreen { position: absolute; right: 8px; top: 8px; }
</style></head>
<body>
<header>The page's own header</header>
<button id="page-fullscreen" onclick="document.getElementById('around').requestFullscreen()">
  Page full screen</button>
<div id="around"><div id="viewer"></div></div>
<script type="module">
  import EmbedPDF from '/embedpdf.js';
  window.element = EmbedPDF.init({ target: '#viewer', src: '/sample.pdf' });
</script>
</body></html>`;

/** A page with `/boxed.html` in a frame that `allow` says may or may not go full screen. */
const framed = (allow: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>framed</title><style>body { margin: 0; }</style></head>
<body><iframe src="/boxed.html" allow="${allow}" style="width: 900px; height: 700px; border: 0"></iframe>
</body></html>`;

const PAGES = {
  '/boxed.html': page('left: 20px; top: 20px; width: 600px; height: 500px'),
  '/whole.html': page('inset: 0').replace('top: 50px', 'top: 0').replace('left: 20px', 'left: 0'),
  '/framed-denied.html': framed("fullscreen 'none'"),
  '/framed-allowed.html': framed('fullscreen'),
};

/** A browser with no full screen for elements, as iPhone Safari: only video has one there. */
function withoutElementFullscreen(): void {
  Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
    configurable: true,
    get: () => false,
  });
  delete (Element.prototype as Partial<Element>).requestFullscreen;
}

/** A browser that has full screen but refuses it, as a webview whose app doesn't offer it. */
function refusingFullscreen(): void {
  Element.prototype.requestFullscreen = () => Promise.reject(new TypeError('refused'));
}

interface FullscreenFacts {
  /** The page's full-screen element, by id, else by tag. */
  readonly pageFullscreen: string | null;
  /** The viewer's root is what the browser shows full screen. */
  readonly rootFullscreen: boolean;
  /** The viewer's root covers the window from the top layer. */
  readonly fillsWindow: boolean;
  readonly box: { left: number; top: number; width: number; height: number };
  readonly window: { width: number; height: number };
  /** What is on top at the window's top left corner, by tag. */
  readonly atCorner: string | null;
  readonly command: { visible: boolean; active: boolean; icon: string | null };
  /** The id of the `<embedpdf-viewer>` element's parent: the page's, where the page put it. */
  readonly parent: string | null;
}

const factsOf = (scope: Page | Frame) =>
  scope.evaluate(() => {
    const element = document.querySelector('embedpdf-viewer')!;
    const shadow = element.shadowRoot!;
    const root = shadow.querySelector<HTMLElement>('[data-embedpdf-root]')!;
    const rect = root.getBoundingClientRect();
    const full = document.fullscreenElement;
    const command = (
      window as unknown as {
        element: {
          viewer: {
            commands: {
              resolveCommand(id: string): {
                visible: boolean;
                active: boolean;
                icon?: string;
              } | null;
            };
          };
        };
      }
    ).element.viewer.commands.resolveCommand('view:fullscreen');
    return {
      pageFullscreen: full ? full.id || full.localName : null,
      rootFullscreen: shadow.fullscreenElement === root,
      fillsWindow: root.matches(':popover-open'),
      box: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      window: { width: innerWidth, height: innerHeight },
      atCorner: document.elementFromPoint(2, 2)?.localName ?? null,
      command: {
        visible: command?.visible ?? false,
        active: command?.active ?? false,
        icon: command?.icon ?? null,
      },
      parent: element.parentElement?.id ?? null,
    };
  }) as Promise<FullscreenFacts>;

/** Wait until the viewer in `scope` shows the opened document: the chrome reports its page count. */
const waitForDocumentIn = (scope: Page | Frame) =>
  scope.waitForFunction(
    () =>
      /Page 1 of \d+/.test(
        document.querySelector('embedpdf-viewer')?.shadowRoot?.textContent ?? '',
      ),
    null,
    { timeout: 60_000 },
  );

/** Let the viewer render and run its effects: two frames. */
const framesIn = (scope: Page | Frame) =>
  scope.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

/** Open the viewer's menu and press Full Screen in it, as a user does. */
async function pressFullScreen(scope: Page | Frame): Promise<void> {
  await scope.locator('embedpdf-viewer').getByRole('button', { name: 'Menu', exact: true }).click();
  await scope.locator('embedpdf-viewer [role^="menuitem"]', { hasText: 'Full Screen' }).click();
  await framesIn(scope);
}

/** Run a command from the page's code, which no press started. */
const execute = (scope: Page | Frame, id: string) =>
  scope.evaluate(
    (commandId) =>
      (
        window as unknown as {
          element: { viewer: { commands: { execute(id: string): Promise<unknown> } } };
        }
      ).element.viewer.commands.execute(commandId),
    id,
  );

/** Open the Print dialog, a layer over the viewer, and wait for it. */
async function openPrintDialog(scope: Page | Frame): Promise<void> {
  await execute(scope, 'document:print');
  await scope.waitForFunction(
    () => !!document.querySelector('embedpdf-viewer')!.shadowRoot!.querySelector('[role="dialog"]'),
  );
  await framesIn(scope);
}

/** Whether the open dialog is what shows at its own center, inside the viewer. */
const dialogOnTop = (scope: Page | Frame) =>
  scope.evaluate(() => {
    const shadow = document.querySelector('embedpdf-viewer')!.shadowRoot!;
    const dialog = shadow.querySelector('[role="dialog"]');
    if (!dialog) return false;
    const rect = dialog.getBoundingClientRect();
    const top = shadow.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return top !== null && dialog.contains(top);
  });

describe.skipIf(!existsSync(join(dist, 'embedpdf.js')))('full screen', () => {
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

  /** `init` runs in the page before its own scripts. */
  const open = async (path: string, options: { init?: () => void } = {}) => {
    const tab = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    if (options.init) await tab.addInitScript(options.init);
    await tab.goto(`${host.origin}${path}`);
    return tab;
  };

  const openViewer = async (path: string, options: { init?: () => void } = {}) => {
    const tab = await open(path, options);
    await waitForDocumentIn(tab);
    await framesIn(tab);
    return tab;
  };

  const viewerFrameOf = async (tab: Page): Promise<Frame> => {
    await tab.waitForFunction(() => document.querySelector('iframe') !== null);
    const frame = (await (await tab.$('iframe'))!.contentFrame())!;
    await waitForDocumentIn(frame);
    await framesIn(frame);
    return frame;
  };

  it("fills the screen with the viewer's own box, not the page, through a transform around it", async () => {
    const tab = await openViewer('/boxed.html');
    const before = await factsOf(tab);
    expect(before.command).toEqual({ visible: true, active: false, icon: 'fullscreen' });
    expect(before.box).toEqual({ left: 40, top: 70, width: 600, height: 500 });

    await pressFullScreen(tab);
    const full = await factsOf(tab);
    expect(full.pageFullscreen).toBe('embedpdf-viewer');
    expect(full.rootFullscreen).toBe(true);
    expect(full.box).toEqual({ left: 0, top: 0, ...full.window });
    expect(full.command).toEqual({ visible: true, active: true, icon: 'fullscreenExit' });
    expect(full.parent).toBe('viewer');

    await pressFullScreen(tab);
    const after = await factsOf(tab);
    expect(after.pageFullscreen).toBeNull();
    expect(after.box).toEqual(before.box);
    expect(after.command).toEqual(before.command);
    await tab.close();
  });

  it("follows the browser's Escape", async () => {
    const tab = await openViewer('/boxed.html');
    await pressFullScreen(tab);
    expect((await factsOf(tab)).command.active).toBe(true);
    // What Escape does in full screen: the browser ends it, not the page.
    await tab.evaluate(() => document.exitFullscreen());
    await framesIn(tab);
    const after = await factsOf(tab);
    expect(after.pageFullscreen).toBeNull();
    expect(after.command).toEqual({ visible: true, active: false, icon: 'fullscreen' });
    await tab.close();
  });

  it("keeps the page's own full screen around the viewer when the viewer's ends", async () => {
    const tab = await openViewer('/boxed.html');
    await tab.click('#page-fullscreen');
    await framesIn(tab);
    const page = await factsOf(tab);
    expect(page.pageFullscreen).toBe('around');
    // The page's element fills the screen, not the viewer's.
    expect(page.command.active).toBe(false);

    await pressFullScreen(tab);
    expect((await factsOf(tab)).rootFullscreen).toBe(true);
    await pressFullScreen(tab);
    const after = await factsOf(tab);
    expect(after.rootFullscreen).toBe(false);
    expect(after.pageFullscreen).toBe('around');
    await tab.close();
  });

  it('keeps a dialog open in the viewer over it when the page makes it full screen', async () => {
    const tab = await openViewer('/boxed.html');
    await openPrintDialog(tab);
    expect(await dialogOnTop(tab)).toBe(true);
    await tab.click('#page-fullscreen');
    await framesIn(tab);
    expect((await factsOf(tab)).pageFullscreen).toBe('around');
    expect(await dialogOnTop(tab)).toBe(true);
    await tab.close();
  });

  it('has no Full Screen in a frame that may not go full screen', async () => {
    const tab = await open('/framed-denied.html');
    const frame = await viewerFrameOf(tab);
    expect((await factsOf(frame)).command.visible).toBe(false);
    await frame
      .locator('embedpdf-viewer')
      .getByRole('button', { name: 'Menu', exact: true })
      .click();
    await expect(
      frame.locator('embedpdf-viewer [role^="menuitem"]', { hasText: 'Full Screen' }).count(),
    ).resolves.toBe(0);
    await tab.close();
  });

  it('goes full screen from inside a frame that may', async () => {
    const tab = await open('/framed-allowed.html');
    const frame = await viewerFrameOf(tab);
    await pressFullScreen(frame);
    const inside = await factsOf(frame);
    expect(inside.rootFullscreen).toBe(true);
    expect(inside.box).toEqual({ left: 0, top: 0, ...inside.window });
    expect(await tab.evaluate(() => document.fullscreenElement?.localName ?? null)).toBe('iframe');
    await tab.close();
  });

  it('covers the whole window where the browser has no full screen for it, until Escape', async () => {
    const tab = await openViewer('/boxed.html', { init: withoutElementFullscreen });
    const before = await factsOf(tab);
    expect(before.command).toEqual({ visible: true, active: false, icon: 'fullscreen' });

    await pressFullScreen(tab);
    const full = await factsOf(tab);
    expect(full.fillsWindow).toBe(true);
    expect(full.pageFullscreen).toBeNull();
    // Over the page's header, past the transform and the overflow of the element around it.
    expect(full.box).toEqual({ left: 0, top: 0, ...full.window });
    expect(full.atCorner).toBe('embedpdf-viewer');
    expect(full.command).toEqual({ visible: true, active: true, icon: 'fullscreenExit' });
    expect(full.parent).toBe('viewer');

    await tab.keyboard.press('Escape');
    await framesIn(tab);
    const after = await factsOf(tab);
    expect(after.fillsWindow).toBe(false);
    expect(after.box).toEqual(before.box);
    expect(after.command).toEqual(before.command);
    expect(after.atCorner).toBe('header');
    await tab.close();
  });

  it('has no Full Screen there when the viewer is the whole window already', async () => {
    const tab = await openViewer('/whole.html', { init: withoutElementFullscreen });
    expect((await factsOf(tab)).command.visible).toBe(false);
    await tab.close();
  });

  it('keeps a dialog open in the viewer over it as the viewer goes full screen', async () => {
    const tab = await openViewer('/boxed.html');
    await openPrintDialog(tab);
    // Playwright's evaluate counts as a press, so the browser lets the page go full screen.
    await execute(tab, 'view:fullscreen');
    await framesIn(tab);
    expect((await factsOf(tab)).rootFullscreen).toBe(true);
    expect(await dialogOnTop(tab)).toBe(true);
    await tab.close();
  });

  it('covers the window where the browser refuses its full screen, under a dialog that was open', async () => {
    const tab = await open('/boxed.html', { init: refusingFullscreen });
    await waitForDocumentIn(tab);
    await framesIn(tab);
    await openPrintDialog(tab);
    await execute(tab, 'view:fullscreen');
    await framesIn(tab);
    const full = await factsOf(tab);
    expect(full.pageFullscreen).toBeNull();
    expect(full.fillsWindow).toBe(true);
    expect(full.box).toEqual({ left: 0, top: 0, ...full.window });
    expect(await dialogOnTop(tab)).toBe(true);
    await tab.close();
  });
});
