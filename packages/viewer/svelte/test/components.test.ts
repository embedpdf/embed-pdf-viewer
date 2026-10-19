/**
 * Your own components in <PDFViewer> (`pages/components.ts`): `ToolbarItem` in the bar with
 * `useToolbarItem()` saying where, and following the bar to a rail; a variant drawn by Svelte and
 * measured as drawn; `Button` and `Menu` / `MenuItem`; `Panel`; the `header` and `footer`
 * regions.
 */
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChromium, servePages, until, watchPage, type PageHost } from './helpers';
import type { ComponentsRecord } from './pages/components';

describe('your own components in <PDFViewer>', () => {
  let host: PageHost;
  let browser: Browser;
  let page: Page;
  let seen: ReturnType<typeof watchPage>;

  /** What `useToolbarItem()` says, as the component drew it, and whether it shows in the bar. */
  const where = () =>
    page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('[data-check="where"]')!;
      const bar = document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelector('[data-bar="main"]')!
        .getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return {
        orientation: element.textContent,
        edge: element.dataset.edge,
        size: element.dataset.size,
        variant: element.dataset.variant,
        inBar: box.left >= bar.left && box.right <= bar.right && box.top >= bar.top,
      };
    });

  beforeAll(async () => {
    host = await servePages();
    browser = await launchChromium();
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    seen = watchPage(page);
    await page.goto(`${host.origin}/components.html`);
    await until(
      page,
      () =>
        (window.__viewerCheck as ComponentsRecord).viewer?.documents.list()[0]?.status === 'ready',
    );
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('shows a ToolbarItem in the bar, and useToolbarItem() says where', async () => {
    expect(
      await until(
        page,
        () => document.querySelector<HTMLElement>('[data-check="where"]')?.dataset.edge === 'top',
        { timeout: 10_000 },
      ),
    ).toBe(true);
    expect(await where()).toEqual({
      orientation: 'horizontal',
      edge: 'top',
      size: 'expanded',
      variant: 'none',
      inBar: true,
    });
  });

  it('measures the variant Svelte draws', async () => {
    // 700px don't fit in the main bar at 1280: the short form does.
    expect(
      await until(
        page,
        () =>
          document.querySelector<HTMLElement>('[data-check="sized"]')?.dataset.drawn === 'short',
        { timeout: 10_000 },
      ),
    ).toBe(true);
    const shown = await page.evaluate(() => {
      const box = document.querySelector('[data-check="sized"]')!.getBoundingClientRect();
      const bar = document
        .querySelector('embedpdf-viewer')!
        .shadowRoot!.querySelector('[data-bar="main"]')!
        .getBoundingClientRect();
      return box.width > 0 && box.right <= bar.right;
    });
    expect(shown).toBe(true);
  });

  it('follows the bar to a rail with useToolbarItem()', async () => {
    await page.evaluate(() => (window.__viewerCheck as ComponentsRecord).setWidth('800px'));
    expect(
      await until(
        page,
        () => document.querySelector('[data-check="where"]')?.textContent === 'vertical',
        { timeout: 10_000 },
      ),
    ).toBe(true);
    expect(await where()).toMatchObject({ edge: 'start', size: 'medium', inBar: true });
    await page.evaluate(() => (window.__viewerCheck as ComponentsRecord).setWidth('100%'));
    await until(
      page,
      () => document.querySelector('[data-check="where"]')?.textContent === 'horizontal',
    );
  });

  it('runs a Button’s command', async () => {
    const zoom = () =>
      page.evaluate(() =>
        (window.__viewerCheck as ComponentsRecord).viewer!.get('stage').getZoomLevel(),
      );
    const before = await zoom();
    await page.click('epdf-button[command="zoom:in"]');
    expect(
      await until(
        page,
        (level) =>
          (window.__viewerCheck as ComponentsRecord).viewer!.get('stage').getZoomLevel() > level,
        { arg: before, timeout: 10_000 },
      ),
    ).toBe(true);
  });

  it('opens a Menu’s MenuItems, and the picked one calls onselect', async () => {
    await page.click('epdf-menu');
    expect(
      await until(
        page,
        () => document.querySelector('epdf-menu')?.shadowRoot?.querySelector('[role="menu"]'),
        { timeout: 10_000 },
      ),
    ).toBe(true);
    const rows = await page.evaluate(() =>
      [
        ...document.querySelector('epdf-menu')!.shadowRoot!.querySelectorAll('[role^="menuitem"]'),
      ].map((row) => row.textContent!.trim()),
    );
    expect(rows).toEqual(['Copy link', 'Email a link']);
    await page.evaluate(() =>
      document
        .querySelector('epdf-menu')!
        .shadowRoot!.querySelectorAll<HTMLElement>('[role^="menuitem"]')[1]!
        .click(),
    );
    expect(
      await page.evaluate(() => [...(window.__viewerCheck as ComponentsRecord).picked]),
    ).toEqual(['email']);
  });

  it('shows a Panel once its panel opens', async () => {
    await page.evaluate(() =>
      (window.__viewerCheck as ComponentsRecord).viewer!.commands.execute('panel:notes'),
    );
    await page.locator('[data-check="notes"]').waitFor({ state: 'visible', timeout: 10_000 });
  });

  it('puts the header region above everything and the footer below', async () => {
    const regions = await page.evaluate(() => {
      const viewer = document.querySelector('embedpdf-viewer')!.getBoundingClientRect();
      const header = document.querySelector('[data-check="header"]')!.getBoundingClientRect();
      const footer = document.querySelector('[data-check="footer"]')!.getBoundingClientRect();
      return {
        headerTop: header.top - viewer.top,
        footerBottom: viewer.bottom - footer.bottom,
        shown: header.height > 0 && footer.height > 0,
      };
    });
    expect(regions).toEqual({ headerTop: 0, footerBottom: 0, shown: true });
    expect(seen.errors).toEqual([]);
  });
});
