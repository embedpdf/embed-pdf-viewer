/**
 * The docs' zoom pill in a toolbar item (`pages/zoom.ts`): `inject(EpdfStageRef)` there is the
 * viewer's own Stage, so the pill shows its zoom, the viewer's `<epdf-button command="zoom:in">`
 * changes it, and the level shown follows.
 */
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChromium, servePages, until, watchPage, type PageHost } from './helpers';
import type { ZoomRecord } from './pages/zoom';

describe('the zoom pill, with inject(EpdfStageRef) in a toolbar item', () => {
  let host: PageHost;
  let browser: Browser;
  let page: Page;
  let seen: ReturnType<typeof watchPage>;

  /** The level the pill shows, and the viewer's own, as a percentage. */
  const levels = () =>
    page.evaluate(() => {
      const { viewer } = window.__viewerCheck as ZoomRecord;
      return {
        shown: document.querySelector('[data-check="level"]')?.textContent?.trim() ?? '',
        viewer: `${Math.round(viewer!.get('stage').getZoomLevel() * 100)}%`,
      };
    });

  beforeAll(async () => {
    host = await servePages();
    browser = await launchChromium();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    seen = watchPage(page);
    await page.goto(`${host.origin}/zoom.html`);
    await until(
      page,
      () => (window.__viewerCheck as ZoomRecord).viewer?.documents.list()[0]?.status === 'ready',
    );
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it("shows the viewer's zoom level", async () => {
    expect(
      await until(
        page,
        () => {
          const { viewer } = window.__viewerCheck as ZoomRecord;
          const shown = document.querySelector('[data-check="level"]')?.textContent?.trim();
          return shown === `${Math.round(viewer!.get('stage').getZoomLevel() * 100)}%`;
        },
        { timeout: 10_000 },
      ),
    ).toBe(true);
    const { shown } = await levels();
    expect(shown).toMatch(/^\d+%$/);
  });

  it('zooms in with <epdf-button command="zoom:in">, and the level shown follows', async () => {
    const before = await page.evaluate(() =>
      (window.__viewerCheck as ZoomRecord).viewer!.get('stage').getZoomLevel(),
    );
    await page.click('epdf-button[command="zoom:in"]');
    expect(
      await until(
        page,
        (level) => {
          const { viewer } = window.__viewerCheck as ZoomRecord;
          const now = viewer!.get('stage').getZoomLevel();
          const shown = document.querySelector('[data-check="level"]')?.textContent?.trim();
          return now > level && shown === `${Math.round(now * 100)}%`;
        },
        { arg: before, timeout: 10_000 },
      ),
    ).toBe(true);
    const { shown, viewer } = await levels();
    expect(shown).toBe(viewer);
  });

  it("runs a command from the app's own button with epdfCommand", async () => {
    expect(await page.locator('[data-check="fit"]').textContent()).not.toContain('zoom:');
    await page.click('[data-check="fit"]');
    // The mode changes at once; the level settles once the view has its new width.
    expect(
      await until(
        page,
        () => {
          const { viewer } = window.__viewerCheck as ZoomRecord;
          const stage = viewer!.get('stage');
          const shown = document.querySelector('[data-check="level"]')?.textContent?.trim();
          return (
            stage.getZoomMode() === 'fit-width' &&
            shown === `${Math.round(stage.getZoomLevel() * 100)}%`
          );
        },
        { timeout: 10_000 },
      ),
    ).toBe(true);
    expect(seen.errors).toEqual([]);
  });
});
