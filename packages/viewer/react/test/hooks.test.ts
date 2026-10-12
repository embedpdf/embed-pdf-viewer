/**
 * The app's own headless hooks inside the viewer (`pages/hooks.tsx`): a search box of the
 * app's, in a toolbar item, searches with `useSearch()` and follows `useSearchState()`, and the
 * viewer's own search plugin, highlights and panel hold the same search.
 */
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChromium, servePages, until, watchPage, type PageHost } from './helpers';
import type { HooksRecord } from './pages/hooks';

describe('headless hooks inside the viewer', () => {
  let host: PageHost;
  let browser: Browser;
  let page: Page;
  let seen: ReturnType<typeof watchPage>;

  beforeAll(async () => {
    host = await servePages();
    browser = await launchChromium();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    seen = watchPage(page);
    await page.goto(`${host.origin}/hooks.html`);
    await until(
      page,
      () => (window.__viewerCheck as HooksRecord).viewer?.documents.list()[0]?.status === 'ready',
    );
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('shares one copy of the search plugin with the app', async () => {
    expect(await page.evaluate(() => (window.__viewerCheck as HooksRecord).sameToken)).toBe(true);
  });

  it('puts the app’s component in its toolbar item', async () => {
    await page.locator('[data-check="query"]').waitFor({ state: 'visible', timeout: 15_000 });
    expect(
      await page.evaluate(
        () => document.querySelector('[data-check="search"]')?.closest('[slot]')?.slot,
      ),
    ).toBe('item:app-search');
  });

  it('searches from the app, and the viewer holds, paints and lists the same search', async () => {
    const box = page.locator('[data-check="query"]');
    let query: string | null = null;
    for (const candidate of ['the', 'PDF', 'e']) {
      await box.fill(candidate);
      const found = await until(
        page,
        () => Number(document.querySelector('[data-check="hits"]')?.textContent) > 0,
        { timeout: 10_000 },
      );
      if (found) {
        query = candidate;
        break;
      }
    }
    expect(query).not.toBeNull();
    const appHits = Number(await page.locator('[data-check="hits"]').textContent());

    const viewer = await page.evaluate(() => {
      const record = window.__viewerCheck as HooksRecord;
      const search = record.viewer!.get(record.SearchToken);
      return { hitCount: search.getHitCount(), text: search.getQuery()?.text ?? null };
    });
    expect(viewer).toEqual({ hitCount: appHits, text: query });

    const highlights = await page.evaluate(() => {
      const shadow = document.querySelector('embedpdf-viewer')!.shadowRoot!;
      return shadow.querySelectorAll('div[style*="mix-blend-mode"], svg[style*="mix-blend-mode"]')
        .length;
    });
    expect(highlights).toBeGreaterThan(0);

    await page.locator('[data-check="next"]').click();
    await page.waitForTimeout(300);
    const active = await page.evaluate(() => {
      const record = window.__viewerCheck as HooksRecord;
      return {
        app: Number(document.querySelector('[data-check="active"]')!.textContent),
        viewer: record.viewer!.get(record.SearchToken).getActiveHitIndex(),
      };
    });
    expect(active.app).toBe(active.viewer);
    expect(active.app).toBeGreaterThanOrEqual(0);

    await page.evaluate(() =>
      (window.__viewerCheck as HooksRecord).viewer!.commands.execute('panel:search'),
    );
    const panel = await page
      .waitForFunction(
        () =>
          /(\d+) results found/.exec(
            document.querySelector('embedpdf-viewer')!.shadowRoot!.textContent ?? '',
          )?.[1] ?? null,
        null,
        { timeout: 10_000 },
      )
      .then((handle) => handle.jsonValue());
    expect(Number(panel)).toBe(appHits);
    expect(seen.errors).toEqual([]);
  });
});
