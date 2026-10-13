/**
 * The viewer in code, from Angular (`pages/viewer-code.ts`): `inject(EpdfPdfViewerRef)` and
 * `commandOf()` inside `<epdf-pdf-viewer>`, a headless service next to them, `(ready)` and the
 * element outside, `plugins` with a plugin of the app's own, and the viewer being done once
 * `<epdf-pdf-viewer>` goes, with a new one on the next mount.
 */
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchChromium, servePages, until, watchPage, type PageHost } from './helpers';
import type { ViewerCodeRecord } from './pages/viewer-code';

describe('the viewer in code, from Angular', () => {
  let host: PageHost;
  let browser: Browser;
  let page: Page;
  let seen: ReturnType<typeof watchPage>;

  beforeAll(async () => {
    host = await servePages();
    browser = await launchChromium();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    seen = watchPage(page);
    await page.goto(`${host.origin}/viewer-code.html`);
    await until(page, () => {
      const record = window.__viewerCheck as ViewerCodeRecord;
      return (
        record.viewers.length === 1 &&
        record.viewers[0]!.documents.list()[0]?.status === 'ready' &&
        record.inside !== null
      );
    });
  });

  afterAll(async () => {
    await browser?.close();
    await host?.close();
  });

  it('gives the same viewer to EpdfPdfViewerRef inside, the element outside and (ready)', async () => {
    const first = await page.evaluate(() => {
      const { viewers, elements, inside, outside } = window.__viewerCheck as ViewerCodeRecord;
      return {
        inside: inside!.viewer() === viewers[0],
        element: elements[0] === document.querySelector('embedpdf-viewer'),
        elementViewer: elements[0]!.viewer === viewers[0],
        className: document.querySelector('epdf-pdf-viewer')!.getAttribute('class'),
        outside,
      };
    });
    expect(first).toMatchObject({
      inside: true,
      element: true,
      elementViewer: true,
      className: 'report-viewer',
    });
    // Outside the viewer it throws, saying where it works.
    expect(first.outside).toMatch(/inside <epdf-pdf-viewer>/);
  });

  it('gives a command through commandOf(), as a button needs it, and follows it', async () => {
    const commands = await page.evaluate(() => {
      const { inside } = window.__viewerCheck as ViewerCodeRecord;
      const plain = ({ label, enabled }: { label: string; enabled: boolean }) => ({
        label,
        enabled,
      });
      return {
        zoomIn: plain(inside!.zoomIn()),
        missing: plain(inside!.missing()),
        pan: inside!.pan().active,
      };
    });
    expect(commands.zoomIn.enabled).toBe(true);
    expect(commands.zoomIn.label).not.toBe('zoom:in');
    expect(commands.missing).toEqual({ label: 'acme:missing', enabled: false });
    expect(commands.pan).toBe(false);
    await page.evaluate(() => (window.__viewerCheck as ViewerCodeRecord).inside!.pan().run());
    expect(
      await until(page, () => (window.__viewerCheck as ViewerCodeRecord).inside!.pan().active),
    ).toBe(true);
  });

  it('runs a headless service inside the viewer: EpdfInteraction follows the tool', async () => {
    expect(
      await until(
        page,
        () => (window.__viewerCheck as ViewerCodeRecord).inside!.activeTool() === 'pan',
        { timeout: 10_000 },
      ),
    ).toBe(true);
    await page.evaluate(() =>
      (window.__viewerCheck as ViewerCodeRecord).viewers[0]!.commands.execute('tool:pointer'),
    );
    expect(
      await until(
        page,
        () => (window.__viewerCheck as ViewerCodeRecord).inside!.activeTool() === 'pointer',
        { timeout: 10_000 },
      ),
    ).toBe(true);
  });

  it("takes a built-in plugin's settings and the app's own plugin, by its name", async () => {
    const plugins = await page.evaluate(() => {
      const record = window.__viewerCheck as ViewerCodeRecord;
      const [viewer] = record.viewers;
      // The app's own plugin isn't in the viewer's typed names: it's found by its name all the same.
      const analytics = (viewer!.get as (name: string) => unknown)('analytics');
      (analytics as { track(name: string): void }).track('opened');
      return { spread: viewer!.get('stage').getSettings().spread, tracked: [...record.tracked] };
    });
    expect(plugins).toEqual({ spread: 'odd', tracked: ['/api/events opened'] });
  });

  it('is done once <epdf-pdf-viewer> goes: calls fail and its listeners hear nothing', async () => {
    await page.evaluate(() => (window.__viewerCheck as ViewerCodeRecord).show(false));
    await until(page, () => document.querySelector('epdf-pdf-viewer') === null, {
      timeout: 10_000,
    });
    await page.waitForTimeout(300);
    const gone = await page.evaluate(async () => {
      const record = window.__viewerCheck as ViewerCodeRecord;
      const [viewer] = record.viewers;
      const outcome = async (call: () => unknown) => {
        try {
          await call();
          return 'ok';
        } catch (error) {
          return `${(error as Error).name} ${(error as { code?: string }).code}`;
        }
      };
      return {
        get: await outcome(() => viewer!.get('stage')),
        execute: await outcome(() => viewer!.commands.execute('zoom:in')),
        heard: [...record.heard],
      };
    });
    expect(gone).toEqual({
      get: 'PluginError instance-closed',
      execute: 'PluginError instance-closed',
      heard: [],
    });
  });

  it('brings a new viewer with the next <epdf-pdf-viewer>, its templates made inside it', async () => {
    await page.evaluate(() => (window.__viewerCheck as ViewerCodeRecord).show(true));
    expect(
      await until(page, () => {
        const { viewers, inside } = window.__viewerCheck as ViewerCodeRecord;
        return (
          viewers.length === 2 &&
          viewers[1] !== viewers[0] &&
          inside!.viewer() === viewers[1] &&
          inside!.mounts === 2
        );
      }),
    ).toBe(true);
    expect(seen.errors).toEqual([]);
  });
});
