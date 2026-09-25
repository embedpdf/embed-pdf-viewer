import { describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  toPageRef,
  type DocumentEvent,
  type DocumentHandle,
  type Engine,
  type PageLayout,
  type PageRef,
} from '@embedpdf/core';
import type { RenderConfig } from '../src/contract';
import { RenderToken } from '../src/host-contract';
import { renderPlugin } from '../src/render.plugin';

/** The render plugin through the real kernel: the ledger, the two raster
 *  doors, policy conformance, the tile surface, the permission twin. */

const PAGE_OBJECT_NUMBERS = [11, 22, 33];
const CROP = { left: 0, bottom: 0, right: 612, top: 792 };

/** Minimal event shapes — only the fields the controller reads. */
const documentEvent = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;

const LATTICE = {
  kind: 'lattice',
  fullPage: { widths: [320, 640, 1280, 2560] },
  appearances: { scales: [1, 2, 4] },
  formats: ['webp'],
  background: 'white',
  enforced: false,
} as const;

/** A controllable AbortablePromise-shaped render task. */
function makeTask() {
  let resolvePromise!: (value: unknown) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const task = Object.assign(promise, {
    aborted: undefined as unknown,
    abort(reason?: unknown) {
      task.aborted = reason ?? new Error('aborted');
      rejectPromise(task.aborted);
    },
  });
  return {
    task,
    resolve: (value: unknown) => resolvePromise(value),
    reject: (error: unknown) => rejectPromise(error),
  };
}

const image = (key = 'handle') =>
  ({ source: { kind: 'bytes', bytes: new Uint8Array(4) }, format: 'png', key }) as unknown;

async function boot(
  options: { policy?: unknown; config?: RenderConfig; allow?: boolean; crop?: typeof CROP } = {},
) {
  const crop = options.crop ?? CROP;
  const pages = PAGE_OBJECT_NUMBERS.map(
    (pageObjectNumber, index) =>
      ({
        index,
        ref: toPageRef(pageObjectNumber),
        label: null,
        size: { width: crop.right - crop.left, height: crop.top - crop.bottom },
        rotation: 0,
        userUnit: 1,
        boxes: { media: { ...crop }, crop: { ...crop } },
      }) as PageLayout,
  );
  const listeners = new Set<(event: unknown) => void>();
  const imageCalls: Array<{ pageObjectNumber: number; options: Record<string, unknown> }> = [];
  const tasks: Array<ReturnType<typeof makeTask>> = [];
  const handle = {
    id: 'd',
    events: {
      subscribe: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: pages.length, pages }) },
    security: { allows: () => options.allow ?? true },
    render: { getPolicy: () => Promise.resolve(options.policy ?? { kind: 'continuous' }) },
    page: (ref: PageRef) => ({
      render: {
        image: (imageOptions: Record<string, unknown>) => {
          imageCalls.push({ pageObjectNumber: ref.pageObjectNumber, options: imageOptions });
          const pending = makeTask();
          tasks.push(pending);
          return pending.task;
        },
      },
    }),
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const kernel = createKernel({ engine, plugins: [renderPlugin(options.config)] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  return {
    kernel,
    render: kernel.capability(RenderToken, 'd'),
    imageCalls,
    tasks,
    emit: (event: DocumentEvent) => listeners.forEach((listener) => listener(event)),
  };
}

describe('the ledger — confirmed events and the invalidate verb', () => {
  it('a confirmed annotation event bumps the epoch for that page only, annotated product only', async () => {
    const fixture = await boot();
    expect(fixture.render.getRenderEpoch(toPageRef(22))).toBe(0);
    fixture.emit(
      documentEvent({ type: 'annotation.updated', page: toPageRef(22), origin: { kind: 'local' } }),
    );
    expect(fixture.render.getRenderEpoch(toPageRef(22))).toBe(1);
    expect(fixture.render.getRenderEpoch(toPageRef(22), false)).toBe(0);
    expect(fixture.render.getRenderEpoch(toPageRef(11))).toBe(0);
    await fixture.kernel.destroy();
  });

  it('bumps for every origin; onInvalidated carries the event origin, or null for the invalidate verb', async () => {
    const fixture = await boot();
    const seen: string[] = [];
    fixture.render.onInvalidated((event) =>
      seen.push(
        `${event.scope}:${event.origin?.locality ?? 'caller'}:` +
          event.pages.map((page) => page.pageObjectNumber),
      ),
    );
    fixture.emit(
      documentEvent({
        type: 'annotation.moved',
        page: toPageRef(11),
        origin: { kind: 'remote', sessionId: 'other', sub: 'alice', ts: 1, serverId: 7 },
      }),
    );
    fixture.emit(documentEvent({ type: 'form.imported', origin: { kind: 'local' } }));
    fixture.render.invalidate({ pages: [toPageRef(22)], scope: 'content' });
    fixture.render.invalidate();
    expect(seen).toEqual([
      'annotations:remote:11',
      'annotations:local:11,22,33',
      'content:caller:22',
      'content:caller:11,22,33',
    ]);
    await fixture.kernel.destroy();
  });

  it('invalidate scopes: content reaches both products, annotations leaves base alone', async () => {
    const fixture = await boot();
    fixture.render.invalidate({ pages: [toPageRef(22)], scope: 'content' });
    expect(fixture.render.getRenderEpoch(toPageRef(22), false)).toBe(1);
    expect(fixture.render.getRenderEpoch(toPageRef(22), true)).toBe(1);
    fixture.render.invalidate({ pages: [toPageRef(22)], scope: 'annotations' });
    expect(fixture.render.getRenderEpoch(toPageRef(22), false)).toBe(1);
    expect(fixture.render.getRenderEpoch(toPageRef(22), true)).toBe(2);
    expect(fixture.render.getRenderEpoch(toPageRef(11))).toBe(0);
    await fixture.kernel.destroy();
  });

  it('a desynced stream repaints the content of every page, with no origin', async () => {
    const fixture = await boot();
    const seen: { scope: string; origin: unknown }[] = [];
    fixture.render.onInvalidated((event) => seen.push(event));
    fixture.emit(documentEvent({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 1 }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ scope: 'content', origin: null });
    expect(fixture.render.getRenderEpoch(toPageRef(11), false)).toBe(1);
    await fixture.kernel.destroy();
  });

  it('a redaction apply is a content fact for the applied pages', async () => {
    const fixture = await boot();
    fixture.emit(
      documentEvent({
        type: 'redaction.applied',
        origin: { kind: 'local' },
        results: [
          { status: 'applied', page: toPageRef(11) },
          { status: 'skipped', page: toPageRef(22) },
        ],
      }),
    );
    expect(fixture.render.getRenderEpoch(toPageRef(11), false)).toBe(1);
    expect(fixture.render.getRenderEpoch(toPageRef(22), false)).toBe(0);
    await fixture.kernel.destroy();
  });
});

describe('policy conformance — the host door', () => {
  it('keys are computable the moment the capability exists — the kernel materialized the policy', async () => {
    const fixture = await boot({ policy: LATTICE });
    expect(fixture.render.getRenderPolicy()).toEqual(LATTICE);
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 1 })).toBe('11|w640|a1|e0');
    await fixture.kernel.destroy();
  });

  it('continuous conforms to the exact device width, capped at the budget', async () => {
    const fixture = await boot();
    expect(fixture.render.getRenderPolicy()).toEqual({ kind: 'continuous' });
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 0.5 })).toBe('11|w306|a1|e0');
    expect(fixture.render.conformViewport(toPageRef(11), 0.5)).toEqual({
      kind: 'width',
      width: 306,
    });
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 1.53 })).toBe('11|w640|a1|e0');
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 8 })).toBe('11|w640|a1|e0');
    await fixture.kernel.destroy();
  });

  it('continuous with a ladder quantize opts into rung caching; the budget filters an advertised ladder', async () => {
    const ladder = await boot({
      config: { fullPage: { quantize: [320, 640, 1280], maxWidth: 1280 } },
    });
    expect(ladder.render.getSourceKey(toPageRef(11), { scale: 0.5 })).toBe('11|w320|a1|e0');
    expect(ladder.render.getSourceKey(toPageRef(11), { scale: 8 })).toBe('11|w1280|a1|e0');
    const capped = await boot({ policy: LATTICE, config: { fullPage: { maxWidth: 700 } } });
    expect(capped.render.conformViewport(toPageRef(11), 8)).toEqual({ kind: 'width', width: 640 });
    await ladder.kernel.destroy();
    await capped.kernel.destroy();
  });

  it('zoom inside a rung produces the same key; an epoch bump mints a new one', async () => {
    const fixture = await boot({ policy: LATTICE });
    const at12 = fixture.render.getSourceKey(toPageRef(11), { scale: 1.2 });
    expect(at12).toBe('11|w1280|a1|e0');
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 1.5 })).toBe(at12);
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 2.2 })).toBe('11|w2560|a1|e0');
    fixture.render.invalidate({ pages: [toPageRef(11)], scope: 'content' });
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 1.2 })).not.toBe(at12);
    await fixture.kernel.destroy();
  });

  it('renderSource sends the conformed viewport; same-rung asks collapse to one engine call', async () => {
    const fixture = await boot({ policy: LATTICE });
    const first = fixture.render.renderSource(toPageRef(11), { scale: 1.2 });
    const second = fixture.render.renderSource(toPageRef(11), { scale: 1.5 });
    expect(fixture.imageCalls).toHaveLength(1);
    expect(fixture.imageCalls[0]!.options.viewport).toEqual({ kind: 'width', width: 1280 });
    expect(fixture.imageCalls[0]!.options.format).toBeUndefined(); // no strategy format: the engine's default
    fixture.tasks[0]!.resolve(image());
    expect(await first).toBe(await second);
    // A rung re-ask after resolution serves from the LRU — still one call.
    await fixture.render.renderSource(toPageRef(11), { scale: 1.3 });
    expect(fixture.imageCalls).toHaveLength(1);
    await fixture.kernel.destroy();
  });

  it('one consumer aborting a shared fetch leaves it alive; the last one aborts the engine call', async () => {
    const fixture = await boot({ policy: LATTICE });
    const controller = new AbortController();
    const doomed = fixture.render.renderSource(toPageRef(11), {
      scale: 1.2,
      signal: controller.signal,
    });
    const survivor = fixture.render.renderSource(toPageRef(11), { scale: 1.5 });
    controller.abort();
    await expect(doomed).rejects.toBeTruthy();
    expect(fixture.tasks[0]!.task.aborted).toBeUndefined();
    fixture.tasks[0]!.resolve(image());
    await survivor;

    const only = new AbortController();
    const alone = fixture.render.renderSource(toPageRef(22), { scale: 1.2, signal: only.signal });
    only.abort();
    await expect(alone).rejects.toBeTruthy();
    expect(fixture.tasks[1]!.task.aborted).toBeTruthy();
    void fixture.render.renderSource(toPageRef(22), { scale: 1.2 }).catch(() => {}); // not sticky
    expect(fixture.imageCalls).toHaveLength(3);
    await fixture.kernel.destroy();
  });

  it("format is a strategy value: 'bmp' rides into engine calls under continuous and keys", async () => {
    const fixture = await boot({ config: { format: 'bmp', quality: 0.9 } });
    void fixture.render.renderSource(toPageRef(11), { scale: 0.5 }).catch(() => {});
    expect(fixture.imageCalls[0]!.options.format).toBe('bmp');
    expect(fixture.imageCalls[0]!.options.quality).toBe(0.9);
    expect(fixture.render.getSourceKey(toPageRef(11), { scale: 0.5 })).toBe('11|w306|a1|e0|fbmp');
    await fixture.kernel.destroy();
    // …and under a lattice 'bmp' conforms to the deployment's formats (BMP is local-only).
    const cloud = await boot({ policy: LATTICE, config: { format: 'bmp' } });
    void cloud.render.renderSource(toPageRef(11), { scale: 0.5 }).catch(() => {});
    expect(cloud.imageCalls[0]!.options.format).toBe('webp');
    expect(cloud.render.getSourceKey(toPageRef(11), { scale: 0.5 })).toBe('11|w320|a1|e0|fwebp');
    await cloud.kernel.destroy();
  });

  it('paint settings are reference-stable and reflect the config', async () => {
    const on = await boot();
    expect(on.render.getPaintSettings()).toEqual({ fadeMs: 0, tiles: true });
    expect(on.render.getPaintSettings()).toBe(on.render.getPaintSettings());
    const off = await boot({ config: { tiles: false } });
    expect(off.render.getPaintSettings().tiles).toBe(false);
    await on.kernel.destroy();
    await off.kernel.destroy();
  });
});

describe('the public door — exact sizes', () => {
  it('renderPage honours the requested width, or scale × page width, and defaults to scale 1', async () => {
    const fixture = await boot({ policy: LATTICE });
    void fixture.render.renderPage(toPageRef(11), { width: 200 }).catch(() => {});
    void fixture.render.renderPage(toPageRef(11), { scale: 0.25 }).catch(() => {});
    void fixture.render.renderPage(toPageRef(11)).catch(() => {});
    expect(fixture.imageCalls.map((call) => call.options.viewport)).toEqual([
      { kind: 'width', width: 200 },
      { kind: 'width', width: 153 },
      { kind: 'width', width: 612 },
    ]);
    await fixture.kernel.destroy();
  });

  it('shares the raster store with the host door when the size matches', async () => {
    const fixture = await boot({ policy: LATTICE });
    const conformed = fixture.render.renderSource(toPageRef(11), { scale: 1 }); // w640
    fixture.tasks[0]!.resolve(image('shared'));
    await conformed;
    const exact = await fixture.render.renderPage(toPageRef(11), { width: 640 });
    expect(exact).toBe(await conformed);
    expect(fixture.imageCalls).toHaveLength(1);
    // A per-call format is part of the identity: a different encode renders again.
    void fixture.render.renderPage(toPageRef(11), { width: 640, format: 'png' }).catch(() => {});
    expect(fixture.imageCalls).toHaveLength(2);
    expect(fixture.imageCalls[1]!.options.format).toBe('png');
    await fixture.kernel.destroy();
  });

  it('renderThumbnail is a width render; renderPages reports in input order with per-page failures', async () => {
    const fixture = await boot();
    void fixture.render.renderThumbnail(toPageRef(11), { maxWidth: 120 }).catch(() => {});
    expect(fixture.imageCalls[0]!.options.viewport).toEqual({ kind: 'width', width: 120 });

    const batch = fixture.render.renderPages([toPageRef(22), toPageRef(99), toPageRef(33)], {
      width: 100,
      concurrency: 1,
    });
    await Promise.resolve();
    fixture.tasks[1]!.resolve(image('22'));
    await vi.waitFor(() => expect(fixture.tasks).toHaveLength(3));
    fixture.tasks[2]!.reject(new Error('engine said no'));
    const result = await batch;
    expect(result.applied.map((entry) => entry.page.pageObjectNumber)).toEqual([22]);
    expect(
      result.failed.map((failure) => [failure.ref.pageObjectNumber, failure.error.code]),
    ).toEqual([
      [99, 'not-found'],
      [33, 'operation-failed'],
    ]);
    await fixture.kernel.destroy();
  });

  it('unknown pages are not-found; completed and failed renders are announced', async () => {
    const fixture = await boot();
    await expect(fixture.render.renderPage(toPageRef(99))).rejects.toMatchObject({
      code: 'not-found',
    });
    const log: string[] = [];
    fixture.render.onRenderCompleted((event) => log.push(`ok:${event.page.pageObjectNumber}`));
    fixture.render.onRenderFailed((event) =>
      log.push(`fail:${event.page.pageObjectNumber}:${event.error.code}`),
    );
    const ok = fixture.render.renderPage(toPageRef(11));
    fixture.tasks[0]!.resolve(image());
    await ok;
    const bad = fixture.render.renderPage(toPageRef(22));
    fixture.tasks[1]!.reject(new Error('boom'));
    await expect(bad).rejects.toMatchObject({ code: 'operation-failed' });
    expect(log).toEqual(['ok:11', 'fail:22:operation-failed']);
    await fixture.kernel.destroy();
  });
});

describe('the tile surface — pure reads, page-space regions', () => {
  const deep = { desiredDeviceWidth: 612 * 8, visibleRect: { x: 0, y: 0, width: 80, height: 80 } };

  it('createViewDemand is stable per view and reference-counted; getPlan is pure', async () => {
    const fixture = await boot({ config: { tiles: { settleMs: 0, bleed: 0 } } });
    const main = fixture.render.createViewDemand('stage');
    expect(fixture.render.createViewDemand('stage')).toBe(main);
    expect(fixture.render.createViewDemand('stage-thumbs')).not.toBe(main);
    // Nothing set: the empty plan, and no engine work from a read.
    expect(fixture.render.createViewDemand('stage').getPlan(toPageRef(11)).paint).toEqual([]);
    expect(fixture.imageCalls).toHaveLength(0);
    // A thumbnail-sized demand never engages.
    main.setDemand(toPageRef(11), { desiredDeviceWidth: 120 });
    expect(main.getPlan(toPageRef(11)).engaged).toBe(false);
    // A deep demand engages and schedules the want set; the read returns the paint plan it produced.
    main.setDemand(toPageRef(11), deep);
    expect(main.getPlan(toPageRef(11)).engaged).toBe(true);
    expect(fixture.imageCalls.length).toBeGreaterThan(0);
    const before = fixture.imageCalls.length;
    expect(main.getPlan(toPageRef(11))).toBe(main.getPlan(toPageRef(11)));
    expect(fixture.imageCalls.length).toBe(before); // reads never fetch
    main.dispose();
    main.dispose();
    main.dispose(); // the last reference releases the view's pages
    await fixture.kernel.destroy();
  });

  it('tile regions go through the kernel page space — crop offsets included', async () => {
    const crop = { left: 10, bottom: 20, right: 622, top: 812 };
    const fixture = await boot({ config: { tiles: { settleMs: 0, bleed: 0 } }, crop });
    const view = fixture.render.createViewDemand('stage');
    view.setDemand(toPageRef(11), deep);
    const first = fixture.imageCalls[0]!.options.target as {
      kind: string;
      rect: Record<string, number>;
    };
    expect(first.kind).toBe('rect');
    // The page's top-left tile is at page-space (0,0): PDF left = crop.left, top = crop.top.
    expect(first.rect.left).toBe(10);
    expect(first.rect.top).toBe(812);
    expect(fixture.imageCalls[0]!.options.viewport).toEqual({ kind: 'scale', scale: 8 });
    view.dispose();
    await fixture.kernel.destroy();
  });

  it('a tile arrival re-plans outside any read and wakes subscribers', async () => {
    const fixture = await boot({ config: { tiles: { settleMs: 0, bleed: 0 } } });
    const view = fixture.render.createViewDemand('stage');
    view.setDemand(toPageRef(11), deep);
    const planned = view.getPlan(toPageRef(11));
    expect(planned.fetching.length).toBeGreaterThan(0);
    let wakes = 0;
    fixture.kernel.subscribe(() => wakes++);
    fixture.tasks.forEach((pending) => pending.resolve(image()));
    await vi.waitFor(() => expect(view.getPlan(toPageRef(11)).paint.length).toBeGreaterThan(0));
    expect(view.getPlan(toPageRef(11))).not.toBe(planned);
    expect(wakes).toBeGreaterThan(0);
    view.dispose();
    await fixture.kernel.destroy();
  });
});

describe('the twin law (permissions.md) — canRender and the fetch gates', () => {
  it('canRender mirrors doc.render; a denied session never spends an engine round-trip', async () => {
    const allowed = await boot({ allow: true });
    expect(allowed.render.canRender()).toBe(true);
    const denied = await boot({ allow: false });
    expect(denied.render.canRender()).toBe(false);
    await expect(denied.render.renderPage(toPageRef(11))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(denied.render.renderSource(toPageRef(11), { scale: 1 })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(denied.render.renderPages([toPageRef(11)])).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(denied.imageCalls).toHaveLength(0);
    void allowed.render.renderPage(toPageRef(11)).catch(() => {});
    expect(allowed.imageCalls).toHaveLength(1);
    await allowed.kernel.destroy();
    await denied.kernel.destroy();
  });
});
