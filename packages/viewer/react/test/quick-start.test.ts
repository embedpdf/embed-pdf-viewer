/**
 * Quick start's promise in <PDFViewer> (`pages/quick-start.tsx`): the command its config adds to
 * the main bar and your own component in a `ToolbarItem` are on the keyboard like the viewer's
 * own buttons. Tab enters the toolbar, the arrow keys reach the command's button and the
 * component's first control, and Enter on the button runs the command.
 */
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChromium, servePages, until, watchPage, type PageHost } from './helpers';
import type { QuickStartRecord } from './pages/quick-start';

describe('Quick start in <PDFViewer>', () => {
  let host: PageHost;
  let browser: Browser;
  let page: Page;
  let seen: ReturnType<typeof watchPage>;

  /**
   * The element with focus, inside the shadow roots too: its `data-check`, else its title, and
   * the bar it's in, through the slot a control of yours shows in.
   */
  const focused = () =>
    page.evaluate(() => {
      let active: Element | null = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      let bar: string | null = null;
      for (let node: Node | null = active; node && bar === null; ) {
        if (node instanceof Element) bar = node.getAttribute('data-bar');
        node =
          (node as Partial<Element>).assignedSlot ??
          node.parentNode ??
          (node as Partial<ShadowRoot>).host ??
          null;
      }
      const name = (active as HTMLElement | null)?.dataset?.check ?? active?.getAttribute('title');
      return { name: name ?? null, bar };
    });

  /** Press `key` until focus is on `name` or leaves the main bar, once round it at most: where it is. */
  const arrowTo = async (key: string, name: string) => {
    let now = await focused();
    for (let step = 0; step < 40 && now.name !== name; step += 1) {
      await page.keyboard.press(key);
      now = await focused();
      if (now.bar !== 'main') break;
    }
    return now.name;
  };

  beforeAll(async () => {
    host = await servePages();
    browser = await launchChromium();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    seen = watchPage(page);
    await page.goto(`${host.origin}/quick-start.html`);
    await until(
      page,
      () =>
        (window.__viewerCheck as QuickStartRecord).viewer?.documents.list()[0]?.status === 'ready',
    );
    await page.locator('[data-check="approve"]').waitFor({ state: 'visible', timeout: 10_000 });
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('reaches your command’s button and your component with the arrow keys, and Enter runs it', async () => {
    await page.focus('[data-check="before"]');
    await page.keyboard.press('Tab');
    expect((await focused()).bar).toBe('main');

    // Back from the bar's first stop, round to its end: the component's first control is its stop,
    // and its other control is its own, in the Tab order.
    expect(await arrowTo('ArrowLeft', 'approve')).toBe('approve');
    expect(
      await page.evaluate(
        () => document.querySelector<HTMLElement>('[data-check="reject"]')!.tabIndex,
      ),
    ).toBe(0);

    expect(await arrowTo('ArrowLeft', 'Send for signature')).toBe('Send for signature');
    await page.keyboard.press('Enter');
    const documentId = await page.evaluate(
      () => (window.__viewerCheck as QuickStartRecord).viewer!.documents.list()[0]!.id,
    );
    expect(
      await until(page, () => (window.__viewerCheck as QuickStartRecord).sent.length > 0, {
        timeout: 10_000,
      }),
    ).toBe(true);
    expect(await page.evaluate(() => [...(window.__viewerCheck as QuickStartRecord).sent])).toEqual(
      [documentId],
    );
    expect(seen.errors).toEqual([]);
  });
});
