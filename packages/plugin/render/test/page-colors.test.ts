import { describe, expect, it, vi } from 'vitest';
import { toPageRef } from '@embedpdf/core';
import { boot, image } from './harness';

/** The page colors through the real kernel: what each door asks the engine for,
 *  what a change of the setting makes stale, and what a picture's key says. */

const deep = { desiredDeviceWidth: 612 * 8, visibleRect: { x: 0, y: 0, width: 80, height: 80 } };
const DARK = { background: '#1e1e1e', text: '#e8e6e3' } as const;

describe('the pageColors setting', () => {
  it('is normal by default, and asks the engine for no colors', async () => {
    const fixture = await boot();
    expect(fixture.render.getSettings().pageColors).toBe('normal');
    void fixture.render.renderSource(toPageRef(11), { scale: 1 }).catch(() => {});
    void fixture.render.renderPage(toPageRef(11), { width: 200 }).catch(() => {});
    void fixture.render.renderThumbnail(toPageRef(11)).catch(() => {});
    expect(fixture.imageCalls).toHaveLength(3);
    for (const call of fixture.imageCalls) expect(call.options).not.toHaveProperty('pageColors');
    // A key for pages as the file has them carries no colors.
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 8 })).toBe('11|w640|a1f1|e0');
    await fixture.kernel.destroy();
  });

  it('can be registered: every picture is drawn in it from the start', async () => {
    const fixture = await boot({ config: { pageColors: 'dark' } });
    void fixture.render.renderSource(toPageRef(11), { scale: 1 }).catch(() => {});
    expect(fixture.imageCalls[0]!.options.pageColors).toBe('dark');
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 8 })).toBe('11|w640|a1f1|e0|cdark');
    await fixture.kernel.destroy();
  });

  it('reaches the layers’ pictures, the thumbnails, the tiles and the pictures you ask for', async () => {
    const fixture = await boot({
      config: { pageColors: DARK, tiles: { settleMs: 0, bleedPx: 0 } },
    });
    void fixture.render.renderSource(toPageRef(11), { scale: 1 }).catch(() => {});
    void fixture.render.renderSource(toPageRef(11), { scale: 1, thumbnail: true }).catch(() => {});
    void fixture.render.renderPage(toPageRef(22), { width: 200 }).catch(() => {});
    void fixture.render
      .renderPage(toPageRef(22), { rect: { x: 0, y: 0, width: 50, height: 50 } })
      .catch(() => {});
    void fixture.render.renderPage(toPageRef(22), { rotation: 90, width: 200 }).catch(() => {});
    void fixture.render.renderThumbnail(toPageRef(33)).catch(() => {});
    const view = fixture.render.createViewDemand('stage');
    view.setDemand(toPageRef(11), deep);
    expect(fixture.imageCalls.length).toBeGreaterThan(6);
    for (const call of fixture.imageCalls) expect(call.options.pageColors).toEqual(DARK);
    view.destroy();
    await fixture.kernel.destroy();
  });

  it('is replaced whole by a change, not merged into the colors before it', async () => {
    const fixture = await boot({
      config: { pageColors: { background: '#000000', text: '#ffffff' } },
    });
    fixture.render.updateSettings({ pageColors: { text: '#cccccc' } });
    expect(fixture.render.getSettings().pageColors).toEqual({ text: '#cccccc' });
    fixture.render.updateSettings({ pageColors: 'sepia' });
    expect(fixture.render.getSettings().pageColors).toBe('sepia');
    fixture.render.resetSettings();
    expect(fixture.render.getSettings().pageColors).toEqual({
      background: '#000000',
      text: '#ffffff',
    });
    await fixture.kernel.destroy();
  });

  it('is left to the engine to refuse: a bad color is the engine’s InvalidArg, and a key still reads', async () => {
    const fixture = await boot({ config: { pageColors: { text: 'red' } } });
    expect(() => fixture.render.getSourceKey(toPageRef(11), { scale: 1 })).not.toThrow();
    void fixture.render.renderSource(toPageRef(11), { scale: 1 }).catch(() => {});
    expect(fixture.imageCalls[0]!.options.pageColors).toEqual({ text: 'red' });
    await fixture.kernel.destroy();
  });
});

describe('a change of the pageColors setting', () => {
  it('makes every picture stale: the epoch bumps, onInvalidated fires, and a source key changes', async () => {
    const fixture = await boot();
    const invalidated: string[] = [];
    fixture.render.onInvalidated((event) =>
      invalidated.push(
        `${event.scope}:${event.origin?.kind ?? 'caller'}:` +
          event.pages.map((page) => page.objectNumber),
      ),
    );
    const before = fixture.render.getSourceKey(toPageRef(11), { scale: 8 });
    const epoch = (layers: { includeAnnotations?: boolean }) =>
      fixture.render.getRenderEpoch(toPageRef(22), layers);

    fixture.render.updateSettings({ pageColors: 'dark' });
    expect(invalidated).toEqual(['content:caller:11,22,33']);
    expect([epoch({ includeAnnotations: false }), epoch({})]).toEqual([1, 1]);
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 8 })).not.toBe(before);

    // The same colors again change nothing.
    fixture.render.updateSettings({ pageColors: 'dark' });
    expect(invalidated).toHaveLength(1);
    fixture.render.updateSettings({ pageColors: 'normal' });
    expect(invalidated).toHaveLength(2);
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 8 })).not.toBe(
      '11|w640|a1f1|e1|cdark',
    );
    await fixture.kernel.destroy();
  });

  it('is the only setting that does: others redraw nothing', async () => {
    const fixture = await boot();
    const invalidated = vi.fn();
    fixture.render.onInvalidated(invalidated);
    fixture.render.updateSettings({ fullPage: { maxWidth: 1000 }, slowAfterMs: 100 });
    expect(invalidated).not.toHaveBeenCalled();
    await fixture.kernel.destroy();
  });

  it('asks for the pictures again in the new colors: layers by their key, tiles by their epoch', async () => {
    const fixture = await boot({ config: { tiles: { settleMs: 0, bleedPx: 0 } } });
    const view = fixture.render.createViewDemand('stage');
    view.setDemand(toPageRef(11), deep);
    const tilesBefore = fixture.imageCalls.length;
    expect(tilesBefore).toBeGreaterThan(0);
    fixture.tasks.forEach((pending) => pending.resolve(image()));
    await vi.waitFor(() => expect(view.getPlan(toPageRef(11)).paint.length).toBeGreaterThan(0));
    const planned = view.getPlan(toPageRef(11));

    fixture.render.updateSettings({ pageColors: 'sepia' });
    // The view shows new tiles, and what it fetches is in sepia.
    expect(view.getPlan(toPageRef(11))).not.toBe(planned);
    const again = fixture.imageCalls.slice(tilesBefore);
    expect(again.length).toBeGreaterThan(0);
    for (const call of again) expect(call.options.pageColors).toBe('sepia');

    // A layer asking for the same page and size is not served the picture in normal colors.
    const stale = fixture.render.renderSource(toPageRef(22), { scale: 1 });
    fixture.tasks.at(-1)!.resolve(image('normal'));
    await stale;
    fixture.render.updateSettings({ pageColors: 'dark' });
    void fixture.render.renderSource(toPageRef(22), { scale: 1 }).catch(() => {});
    expect(fixture.imageCalls.at(-1)!.options.pageColors).toBe('dark');
    view.destroy();
    await fixture.kernel.destroy();
  });
});

describe('the pageColors of one picture', () => {
  it('wins over the setting, and normal draws it as the file has it', async () => {
    const fixture = await boot({ config: { pageColors: 'dark' } });
    void fixture.render
      .renderPage(toPageRef(11), { width: 200, pageColors: 'sepia' })
      .catch(() => {});
    void fixture.render
      .renderPage(toPageRef(11), { width: 200, pageColors: 'normal' })
      .catch(() => {});
    void fixture.render.renderPage(toPageRef(11), { width: 200 }).catch(() => {});
    void fixture.render
      .renderPage(toPageRef(11), {
        rect: { x: 0, y: 0, width: 50, height: 50 },
        pageColors: 'normal',
      })
      .catch(() => {});
    void fixture.render.renderThumbnail(toPageRef(11), { pageColors: 'sepia' }).catch(() => {});
    void fixture.render.renderThumbnail(toPageRef(11), { pageColors: 'normal' }).catch(() => {});
    expect(fixture.imageCalls.map((call) => call.options.pageColors)).toEqual([
      'sepia',
      undefined,
      'dark',
      undefined,
      'sepia',
      undefined,
    ]);
    await fixture.kernel.destroy();
  });

  it('is its own picture in the cache: the same page and size in other colors is not served from it', async () => {
    const fixture = await boot();
    const plain = fixture.render.renderPage(toPageRef(11), { width: 640 });
    fixture.tasks[0]!.resolve(image('plain'));
    expect(await plain).toMatchObject({ key: 'plain' });
    const dark = fixture.render.renderPage(toPageRef(11), { width: 640, pageColors: 'dark' });
    expect(fixture.imageCalls).toHaveLength(2);
    fixture.tasks[1]!.resolve(image('dark'));
    expect(await dark).toMatchObject({ key: 'dark' });
    // The same colors again are the cached picture.
    await fixture.render.renderPage(toPageRef(11), { width: 640, pageColors: 'dark' });
    expect(fixture.imageCalls).toHaveLength(2);
    // A layer's picture of the page, at the same size, shares it when the setting says the same.
    fixture.render.updateSettings({ pageColors: 'dark' });
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 1 })).toBe('11|w612|a1f1|e1|cdark');
    await fixture.kernel.destroy();
  });
});
