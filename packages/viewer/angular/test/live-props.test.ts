/**
 * `<epdf-pdf-viewer>`'s live inputs (`pages/live-props.ts`): `theme`, `locale`, `disable`,
 * `readOnly` and `src` change the running viewer in place, the same viewer and kernel
 * throughout; `(panelResize)` runs the handler as the template has it now; and a changed
 * read-once input is ignored with one warning naming it.
 */
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChromium, servePages, until, watchPage, type PageHost } from './helpers';
import type { LivePropsRecord } from './pages/live-props';

/** The `Symbol.for` key the viewer keeps its kernel under. */
const KERNEL = '@embedpdf/viewer/kernel';

describe('<epdf-pdf-viewer> live inputs', () => {
  let host: PageHost;
  let browser: Browser;
  let page: Page;
  let seen: ReturnType<typeof watchPage>;

  /** Whether the viewer is still the first one, with its first kernel: nothing mounted again. */
  const sameViewer = () =>
    page.evaluate((kernel) => {
      const { viewers, firstKernel } = window.__viewerCheck as LivePropsRecord;
      const viewer = document.querySelector('embedpdf-viewer')!.viewer;
      return (
        viewers.length === 1 &&
        viewer === viewers[0] &&
        (viewer as unknown as Record<symbol, unknown>)[Symbol.for(kernel)] === firstKernel
      );
    }, KERNEL);

  beforeAll(async () => {
    host = await servePages();
    browser = await launchChromium();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    seen = watchPage(page);
    await page.goto(`${host.origin}/live-props.html`);
    await until(page, () => {
      const { viewers } = window.__viewerCheck as LivePropsRecord;
      return viewers.length === 1 && viewers[0]!.documents.list()[0]?.status === 'ready';
    });
    await page.evaluate((kernel) => {
      const record = window.__viewerCheck as LivePropsRecord;
      record.firstKernel = (record.viewers[0] as unknown as Record<symbol, unknown>)[
        Symbol.for(kernel)
      ];
    }, KERNEL);
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('follows theme', async () => {
    await page.evaluate(() => (window.__viewerCheck as LivePropsRecord).set({ theme: 'dark' }));
    const dark = await until(
      page,
      () =>
        document
          .querySelector('embedpdf-viewer')!
          .shadowRoot!.querySelector('[data-embedpdf-root]')!
          .classList.contains('dark'),
      { timeout: 10_000 },
    );
    expect(dark).toBe(true);
    expect(await sameViewer()).toBe(true);
  });

  it('follows locale', async () => {
    await page.evaluate(() => (window.__viewerCheck as LivePropsRecord).set({ locale: 'es' }));
    const spanish = await until(
      page,
      () =>
        /Página 1 de \d+/.test(
          document.querySelector('embedpdf-viewer')!.shadowRoot!.textContent ?? '',
        ),
      { timeout: 15_000 },
    );
    expect(spanish).toBe(true);
    expect(await sameViewer()).toBe(true);
  });

  it('follows disable and readOnly', async () => {
    await page.evaluate(() =>
      (window.__viewerCheck as LivePropsRecord).set({ disable: ['search', 'tool:highlight'] }),
    );
    await page.waitForTimeout(100);
    const disabled = await page.evaluate(() => {
      const { disabledCategories, disabledCommands } = (
        window.__viewerCheck as LivePropsRecord
      ).viewers[0]!.commands.getSettings();
      return { disabledCategories, disabledCommands };
    });
    expect(disabled).toEqual({
      disabledCategories: ['search'],
      disabledCommands: ['tool:highlight'],
    });

    await page.evaluate(() =>
      (window.__viewerCheck as LivePropsRecord).set({ disable: [], readOnly: true }),
    );
    await page.waitForTimeout(100);
    const readOnly = await page.evaluate(
      () =>
        (window.__viewerCheck as LivePropsRecord).viewers[0]!.commands.getSettings()
          .disabledCategories,
    );
    expect(readOnly).toEqual(expect.arrayContaining(['annotations', 'forms']));
    expect(await sameViewer()).toBe(true);
  });

  it('follows src: a File in place of the URL', async () => {
    const bytes = await page.evaluate(async () =>
      Array.from(new Uint8Array(await (await fetch('/sample.pdf')).arrayBuffer())),
    );
    await page.evaluate(
      (data) =>
        (window.__viewerCheck as LivePropsRecord).set({
          src: new File([new Uint8Array(data)], 'picked.pdf'),
        }),
      bytes,
    );
    const picked = await until(page, () => {
      const list = (window.__viewerCheck as LivePropsRecord).viewers[0]!.documents.list();
      return list.length === 1 && list[0]!.name === 'picked' && list[0]!.status === 'ready';
    });
    expect(picked).toBe(true);
    expect(await sameViewer()).toBe(true);
  });

  it('runs the latest (panelResize) handler, without mounting again', async () => {
    await page.evaluate(() => (window.__viewerCheck as LivePropsRecord).setTag('second'));
    await page.evaluate(() =>
      (window.__viewerCheck as LivePropsRecord).viewers[0]!.commands.execute('panel:thumbnails'),
    );
    const edge = page.locator('embedpdf-viewer [data-epdf-panel="thumbnails"] [role="separator"]');
    await edge.waitFor({ state: 'attached', timeout: 10_000 });
    await edge.focus();
    await page.keyboard.press('ArrowRight');
    expect(
      await until(page, () =>
        (window.__viewerCheck as LivePropsRecord).resized.includes('second thumbnails 304'),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => [...(window.__viewerCheck as LivePropsRecord).resized]),
    ).toEqual(['second thumbnails 304']);
    expect(await sameViewer()).toBe(true);
  });

  it('ignores a changed read-once input, with one warning naming it', async () => {
    await page.evaluate(() => (window.__viewerCheck as LivePropsRecord).newCommands());
    await page.waitForTimeout(100);
    await page.evaluate(() => (window.__viewerCheck as LivePropsRecord).newCommands());
    await page.waitForTimeout(100);
    expect(seen.warnings).toHaveLength(1);
    expect(seen.warnings[0]).toContain('`commands`');
    expect(await sameViewer()).toBe(true);
    expect(seen.errors).toEqual([]);
  });
});
