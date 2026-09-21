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
import { annotatedPons } from '../src/invalidation';
import { initialRenderState, reduceRender, type RenderAction } from '../src/model';
import { renderPlugin } from '../src/render.plugin';

/** The render plugin through the real kernel: the ledger, the two raster
 *  doors, policy conformance, the tile surface, the permission twin. */

const PONS = [11, 22, 33];
const CROP = { left: 0, bottom: 0, right: 612, top: 792 };

/** Minimal event shapes — only the fields the invalidation map reads. */
const event = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;
const widget = (pon: number) => ({ annotObjectNumber: 5, page: toPageRef(pon) });

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
  let resolveFn!: (v: unknown) => void;
  let rejectFn!: (e: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  const task = Object.assign(promise, {
    aborted: undefined as unknown,
    abort(reason?: unknown) {
      task.aborted = reason ?? new Error('aborted');
      rejectFn(task.aborted);
    },
  });
  return { task, resolve: (v: unknown) => resolveFn(v), reject: (e: unknown) => rejectFn(e) };
}

const image = (key = 'handle') =>
  ({ source: { kind: 'bytes', bytes: new Uint8Array(4) }, format: 'png', key }) as unknown;

async function boot(
  opts: { policy?: unknown; config?: RenderConfig; allow?: boolean; crop?: typeof CROP } = {},
) {
  const crop = opts.crop ?? CROP;
  const pages = PONS.map(
    (pon, index) =>
      ({
        index,
        ref: toPageRef(pon),
        label: null,
        size: { width: crop.right - crop.left, height: crop.top - crop.bottom },
        rotation: 0,
        userUnit: 1,
        boxes: { media: { ...crop }, crop: { ...crop } },
      }) as PageLayout,
  );
  const listeners = new Set<(event: unknown) => void>();
  const imageCalls: Array<{ pon: number; options: Record<string, unknown> }> = [];
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
    security: { allows: () => opts.allow ?? true },
    render: { policy: () => Promise.resolve(opts.policy ?? { kind: 'continuous' }) },
    page: (ref: PageRef) => ({
      render: {
        image: (options: Record<string, unknown>) => {
          imageCalls.push({ pon: ref.pageObjectNumber, options });
          const t = makeTask();
          tasks.push(t);
          return t.task;
        },
      },
    }),
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  const kernel = createKernel({ engine, plugins: [renderPlugin(opts.config)] });
  await kernel.start();
  await kernel.documents.open({ kind: 'bytes', id: 'd', bytes: new Uint8Array() });
  return {
    kernel,
    render: kernel.capability(RenderToken, 'd'),
    imageCalls,
    tasks,
    emit: (e: DocumentEvent) => listeners.forEach((l) => l(e)),
  };
}

describe('reduceRender', () => {
  it('bumps each touched page independently, in the ledger the scope names', () => {
    let s = initialRenderState();
    s = reduceRender(s, { type: 'invalidate', scope: 'annotations', pages: [11] });
    s = reduceRender(s, { type: 'invalidate', scope: 'annotations', pages: [11, 22] });
    s = reduceRender(s, { type: 'invalidate', scope: 'content', pages: [11] });
    expect(s.annotatedEpochs[11]).toBe(2);
    expect(s.annotatedEpochs[22]).toBe(1);
    expect(s.contentEpochs[11]).toBe(1);
    expect(s.contentEpochs[22]).toBeUndefined();
  });

  it('is a no-op (same reference) for empty bumps and unknown actions', () => {
    const s = initialRenderState();
    expect(reduceRender(s, { type: 'invalidate', scope: 'content', pages: [] })).toBe(s);
    expect(reduceRender(s, { type: 'OTHER' } as unknown as RenderAction)).toBe(s);
  });
});

describe('annotatedPons — the built-in event→pages map', () => {
  const allPons = () => PONS;

  it.each(['annotation.created', 'annotation.updated', 'annotation.deleted', 'annotation.moved'])(
    '%s invalidates its page',
    (type) => {
      expect(annotatedPons(event({ type, page: toPageRef(22) }), allPons)).toEqual([22]);
    },
  );

  it.each(['form.valueChanged', 'form.effectsApplied'])(
    '%s invalidates every page a changed widget lives on',
    (type) => {
      const e = event({ type, changedWidgets: [widget(11), widget(33)] });
      expect(annotatedPons(e, allPons)).toEqual([11, 33]);
    },
  );

  it('form.fieldDeleted invalidates the removed widgets’ pages', () => {
    const e = event({ type: 'form.fieldDeleted', removedWidgets: [widget(22)] });
    expect(annotatedPons(e, allPons)).toEqual([22]);
  });

  it.each(['form.fieldCreated', 'form.fieldUpdated', 'form.widgetAttached', 'form.widgetDetached'])(
    '%s invalidates the field’s widget pages',
    (type) => {
      const e = event({ type, field: { widgets: [widget(11), widget(22)] } });
      expect(annotatedPons(e, allPons)).toEqual([11, 22]);
    },
  );

  it.each(['form.imported', 'form.repaired'])(
    '%s (coarse result) invalidates all pages',
    (type) => {
      expect(annotatedPons(event({ type }), allPons)).toEqual(PONS);
    },
  );

  it.each(['pages.rotated', 'pages.moved', 'pages.deleted', 'metadata.updated'])(
    '%s invalidates nothing (registry/metadata, not pixels)',
    (type) => {
      expect(annotatedPons(event({ type }), allPons)).toEqual([]);
    },
  );
});

describe('the ledger — confirmed events and the invalidate verb', () => {
  it('a confirmed annotation event bumps the epoch for that page only, annotated product only', async () => {
    const h = await boot();
    expect(h.render.getRenderEpoch(toPageRef(22))).toBe(0);
    h.emit(event({ type: 'annotation.updated', page: toPageRef(22), origin: { kind: 'local' } }));
    expect(h.render.getRenderEpoch(toPageRef(22))).toBe(1);
    expect(h.render.getRenderEpoch(toPageRef(22), false)).toBe(0);
    expect(h.render.getRenderEpoch(toPageRef(11))).toBe(0);
    await h.kernel.destroy();
  });

  it('origin is irrelevant — a remote event bumps too, and onInvalidated says where it came from', async () => {
    const h = await boot();
    const seen: string[] = [];
    h.render.onInvalidated((e) =>
      seen.push(`${e.scope}:${e.origin.locality}:${e.pages.map((p) => p.pageObjectNumber)}`),
    );
    h.emit(
      event({
        type: 'annotation.moved',
        page: toPageRef(11),
        origin: { kind: 'remote', sessionId: 'other', sub: 'alice', ts: 1, serverId: 7 },
      }),
    );
    h.emit(event({ type: 'form.imported', origin: { kind: 'local' } }));
    h.render.invalidate({ pages: [toPageRef(22)], scope: 'content' });
    h.render.invalidate();
    expect(seen).toEqual([
      'annotations:remote:11',
      'annotations:local:11,22,33',
      'content:local:22',
      'content:local:11,22,33',
    ]);
    await h.kernel.destroy();
  });

  it('invalidate scopes: content reaches BOTH products, annotations leaves base alone', async () => {
    const h = await boot();
    h.render.invalidate({ pages: [toPageRef(22)], scope: 'content' });
    expect(h.render.getRenderEpoch(toPageRef(22), false)).toBe(1);
    expect(h.render.getRenderEpoch(toPageRef(22), true)).toBe(1);
    h.render.invalidate({ pages: [toPageRef(22)], scope: 'annotations' });
    expect(h.render.getRenderEpoch(toPageRef(22), false)).toBe(1);
    expect(h.render.getRenderEpoch(toPageRef(22), true)).toBe(2);
    expect(h.render.getRenderEpoch(toPageRef(11))).toBe(0);
    await h.kernel.destroy();
  });

  it('a redaction apply is a content fact for the applied pages', async () => {
    const h = await boot();
    h.emit(
      event({
        type: 'redaction.applied',
        origin: { kind: 'local' },
        results: [
          { status: 'applied', page: toPageRef(11) },
          { status: 'skipped', page: toPageRef(22) },
        ],
      }),
    );
    expect(h.render.getRenderEpoch(toPageRef(11), false)).toBe(1);
    expect(h.render.getRenderEpoch(toPageRef(22), false)).toBe(0);
    await h.kernel.destroy();
  });
});

describe('policy conformance — the host door', () => {
  it('keys are computable the moment the capability exists — the kernel materialized the policy', async () => {
    const h = await boot({ policy: LATTICE });
    expect(h.render.getRenderPolicy()).toEqual(LATTICE);
    expect(h.render.getSourceKey(toPageRef(11), { scale: 1 })).toBe('11|w640|a1|e0');
    await h.kernel.destroy();
  });

  it('continuous conforms to the EXACT device width, capped at the budget', async () => {
    const h = await boot();
    expect(h.render.getRenderPolicy()).toEqual({ kind: 'continuous' });
    expect(h.render.getSourceKey(toPageRef(11), { scale: 0.5 })).toBe('11|w306|a1|e0');
    expect(h.render.conformViewport(toPageRef(11), 0.5)).toEqual({ kind: 'width', width: 306 });
    expect(h.render.getSourceKey(toPageRef(11), { scale: 1.53 })).toBe('11|w640|a1|e0');
    expect(h.render.getSourceKey(toPageRef(11), { scale: 8 })).toBe('11|w640|a1|e0');
    await h.kernel.destroy();
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

  it('THE identity law: zoom inside a rung produces the SAME key; an epoch bump mints a new one', async () => {
    const h = await boot({ policy: LATTICE });
    const at12 = h.render.getSourceKey(toPageRef(11), { scale: 1.2 });
    expect(at12).toBe('11|w1280|a1|e0');
    expect(h.render.getSourceKey(toPageRef(11), { scale: 1.5 })).toBe(at12);
    expect(h.render.getSourceKey(toPageRef(11), { scale: 2.2 })).toBe('11|w2560|a1|e0');
    h.render.invalidate({ pages: [toPageRef(11)], scope: 'content' });
    expect(h.render.getSourceKey(toPageRef(11), { scale: 1.2 })).not.toBe(at12);
    await h.kernel.destroy();
  });

  it('renderSource sends the CONFORMED viewport; same-rung asks collapse to ONE engine call', async () => {
    const h = await boot({ policy: LATTICE });
    const a = h.render.renderSource(toPageRef(11), { scale: 1.2 });
    const b = h.render.renderSource(toPageRef(11), { scale: 1.5 });
    expect(h.imageCalls).toHaveLength(1);
    expect(h.imageCalls[0]!.options.viewport).toEqual({ kind: 'width', width: 1280 });
    expect(h.imageCalls[0]!.options.format).toBeUndefined(); // no strategy format: the engine's default
    h.tasks[0]!.resolve(image());
    expect(await a).toBe(await b);
    // A rung re-ask AFTER resolution serves from the LRU — still one call.
    await h.render.renderSource(toPageRef(11), { scale: 1.3 });
    expect(h.imageCalls).toHaveLength(1);
    await h.kernel.destroy();
  });

  it('one consumer aborting a shared fetch leaves it alive; the LAST one aborts the engine call', async () => {
    const h = await boot({ policy: LATTICE });
    const ac = new AbortController();
    const doomed = h.render.renderSource(toPageRef(11), { scale: 1.2, signal: ac.signal });
    const survivor = h.render.renderSource(toPageRef(11), { scale: 1.5 });
    ac.abort();
    await expect(doomed).rejects.toBeTruthy();
    expect(h.tasks[0]!.task.aborted).toBeUndefined();
    h.tasks[0]!.resolve(image());
    await survivor;

    const only = new AbortController();
    const alone = h.render.renderSource(toPageRef(22), { scale: 1.2, signal: only.signal });
    only.abort();
    await expect(alone).rejects.toBeTruthy();
    expect(h.tasks[1]!.task.aborted).toBeTruthy();
    void h.render.renderSource(toPageRef(22), { scale: 1.2 }).catch(() => {}); // not sticky
    expect(h.imageCalls).toHaveLength(3);
    await h.kernel.destroy();
  });

  it("format is a strategy value: 'bmp' rides into engine calls under continuous and keys", async () => {
    const h = await boot({ config: { format: 'bmp', quality: 0.9 } });
    void h.render.renderSource(toPageRef(11), { scale: 0.5 }).catch(() => {});
    expect(h.imageCalls[0]!.options.format).toBe('bmp');
    expect(h.imageCalls[0]!.options.quality).toBe(0.9);
    expect(h.render.getSourceKey(toPageRef(11), { scale: 0.5 })).toBe('11|w306|a1|e0|fbmp');
    await h.kernel.destroy();
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
    const h = await boot({ policy: LATTICE });
    void h.render.renderPage(toPageRef(11), { width: 200 }).catch(() => {});
    void h.render.renderPage(toPageRef(11), { scale: 0.25 }).catch(() => {});
    void h.render.renderPage(toPageRef(11)).catch(() => {});
    expect(h.imageCalls.map((c) => c.options.viewport)).toEqual([
      { kind: 'width', width: 200 },
      { kind: 'width', width: 153 },
      { kind: 'width', width: 612 },
    ]);
    await h.kernel.destroy();
  });

  it('shares the raster store with the host door when the size matches', async () => {
    const h = await boot({ policy: LATTICE });
    const conformed = h.render.renderSource(toPageRef(11), { scale: 1 }); // w640
    h.tasks[0]!.resolve(image('shared'));
    await conformed;
    const exact = await h.render.renderPage(toPageRef(11), { width: 640 });
    expect(exact).toBe(await conformed);
    expect(h.imageCalls).toHaveLength(1);
    // A per-call format is part of the identity: a different encode renders again.
    void h.render.renderPage(toPageRef(11), { width: 640, format: 'png' }).catch(() => {});
    expect(h.imageCalls).toHaveLength(2);
    expect(h.imageCalls[1]!.options.format).toBe('png');
    await h.kernel.destroy();
  });

  it('renderThumbnail is a width render; renderPages reports in input order with per-page failures', async () => {
    const h = await boot();
    void h.render.renderThumbnail(toPageRef(11), { maxWidth: 120 }).catch(() => {});
    expect(h.imageCalls[0]!.options.viewport).toEqual({ kind: 'width', width: 120 });

    const batch = h.render.renderPages([toPageRef(22), toPageRef(99), toPageRef(33)], {
      width: 100,
      concurrency: 1,
    });
    await Promise.resolve();
    h.tasks[1]!.resolve(image('22'));
    await vi.waitFor(() => expect(h.tasks).toHaveLength(3));
    h.tasks[2]!.reject(new Error('engine said no'));
    const result = await batch;
    expect(result.applied.map((r) => r.page.pageObjectNumber)).toEqual([22]);
    expect(result.failed.map((f) => [f.ref.pageObjectNumber, f.error.code])).toEqual([
      [99, 'not-found'],
      [33, 'operation-failed'],
    ]);
    await h.kernel.destroy();
  });

  it('unknown pages are not-found; completed and failed renders are announced', async () => {
    const h = await boot();
    await expect(h.render.renderPage(toPageRef(99))).rejects.toMatchObject({ code: 'not-found' });
    const log: string[] = [];
    h.render.onRenderCompleted((e) => log.push(`ok:${e.page.pageObjectNumber}`));
    h.render.onRenderFailed((e) => log.push(`fail:${e.page.pageObjectNumber}:${e.error.code}`));
    const ok = h.render.renderPage(toPageRef(11));
    h.tasks[0]!.resolve(image());
    await ok;
    const bad = h.render.renderPage(toPageRef(22));
    h.tasks[1]!.reject(new Error('boom'));
    await expect(bad).rejects.toMatchObject({ code: 'operation-failed' });
    expect(log).toEqual(['ok:11', 'fail:22:operation-failed']);
    await h.kernel.destroy();
  });
});

describe('the tile surface — pure reads, page-space regions', () => {
  const deep = { desiredDeviceWidth: 612 * 8, visibleRect: { x: 0, y: 0, width: 80, height: 80 } };

  it('createViewDemand is stable per view and reference-counted; getPlan is pure', async () => {
    const h = await boot({ config: { tiles: { settleMs: 0, bleed: 0 } } });
    const main = h.render.createViewDemand('stage');
    expect(h.render.createViewDemand('stage')).toBe(main);
    expect(h.render.createViewDemand('stage-thumbs')).not.toBe(main);
    // Nothing set: the empty plan, and no engine work from a read.
    expect(h.render.createViewDemand('stage').getPlan(toPageRef(11)).paint).toEqual([]);
    expect(h.imageCalls).toHaveLength(0);
    // A thumbnail-sized demand never engages.
    main.setDemand(toPageRef(11), { desiredDeviceWidth: 120 });
    expect(main.getPlan(toPageRef(11)).engaged).toBe(false);
    // A deep demand engages and schedules the want set; the read returns the plan it produced.
    main.setDemand(toPageRef(11), deep);
    expect(main.getPlan(toPageRef(11)).engaged).toBe(true);
    expect(h.imageCalls.length).toBeGreaterThan(0);
    const before = h.imageCalls.length;
    expect(main.getPlan(toPageRef(11))).toBe(main.getPlan(toPageRef(11)));
    expect(h.imageCalls.length).toBe(before); // reads never fetch
    main.dispose();
    main.dispose();
    main.dispose(); // the last reference releases the view's pages
    await h.kernel.destroy();
  });

  it('tile regions go through the kernel page space — crop offsets included', async () => {
    const crop = { left: 10, bottom: 20, right: 622, top: 812 };
    const h = await boot({ config: { tiles: { settleMs: 0, bleed: 0 } }, crop });
    const view = h.render.createViewDemand('stage');
    view.setDemand(toPageRef(11), deep);
    const first = h.imageCalls[0]!.options.target as { kind: string; rect: Record<string, number> };
    expect(first.kind).toBe('rect');
    // The page's top-left tile is at page-space (0,0): PDF left = crop.left, top = crop.top.
    expect(first.rect.left).toBe(10);
    expect(first.rect.top).toBe(812);
    expect(h.imageCalls[0]!.options.viewport).toEqual({ kind: 'scale', scale: 8 });
    view.dispose();
    await h.kernel.destroy();
  });

  it('a tile arrival re-plans outside any read and wakes subscribers', async () => {
    const h = await boot({ config: { tiles: { settleMs: 0, bleed: 0 } } });
    const view = h.render.createViewDemand('stage');
    view.setDemand(toPageRef(11), deep);
    const planned = view.getPlan(toPageRef(11));
    expect(planned.fetching.length).toBeGreaterThan(0);
    let wakes = 0;
    h.kernel.subscribe(() => wakes++);
    h.tasks.forEach((t) => t.resolve(image()));
    await vi.waitFor(() => expect(view.getPlan(toPageRef(11)).paint.length).toBeGreaterThan(0));
    expect(view.getPlan(toPageRef(11))).not.toBe(planned);
    expect(wakes).toBeGreaterThan(0);
    view.dispose();
    await h.kernel.destroy();
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
