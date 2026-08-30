import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvent, EffectContext } from '@embedpdf/core';

import { createRenderCapability } from './capability';
import { annotatedPons, registerRenderEffects } from './effects';
import { initialRenderState, renderReducer } from './reducer';
import type { RenderAction, RenderPluginOptions, RenderState } from './types';

const PONS = [11, 22, 33];

/** Minimal event shapes — only the fields the invalidation map reads. */
const event = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;

const widget = (pageObjectNumber: number) => ({ annotObjectNumber: 5, pageObjectNumber });

describe('renderReducer', () => {
  it('bumps each touched pon independently, in the ledger the scope names', () => {
    let s = initialRenderState();
    s = renderReducer(s, { type: 'INVALIDATE', scope: 'annotations', pons: [11] });
    s = renderReducer(s, { type: 'INVALIDATE', scope: 'annotations', pons: [11, 22] });
    s = renderReducer(s, { type: 'INVALIDATE', scope: 'content', pons: [11] });
    expect(s.annotatedEpochs[11]).toBe(2);
    expect(s.annotatedEpochs[22]).toBe(1);
    expect(s.contentEpochs[11]).toBe(1);
    expect(s.contentEpochs[22]).toBeUndefined();
    expect(s.annotatedEpochs[33]).toBeUndefined();
  });

  it('is a no-op (same reference) for empty bumps and unknown actions', () => {
    const s = initialRenderState();
    expect(renderReducer(s, { type: 'INVALIDATE', scope: 'content', pons: [] })).toBe(s);
    expect(renderReducer(s, { type: 'OTHER' } as unknown as RenderAction)).toBe(s);
  });
});

describe('annotatedPons — the built-in event→pages map', () => {
  const allPons = () => PONS;

  it.each(['annotation.created', 'annotation.updated', 'annotation.deleted', 'annotation.moved'])(
    '%s invalidates its page',
    (type) => {
      expect(annotatedPons(event({ type, pageObjectNumber: 22 }), allPons)).toEqual([22]);
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

describe('effects + capability wired together', () => {
  function harness() {
    let state = initialRenderState();
    let emit: ((e: DocumentEvent) => void) | null = null;
    let unsubscribed = false;
    const cleanups: Array<() => void> = [];
    const ctx = {
      getState: () => state,
      dispatch: (a: RenderAction) => {
        state = renderReducer(state, a);
      },
      document: () => ({ pages: PONS.map((pageObjectNumber) => ({ pageObjectNumber })) }),
      doc: {
        events: {
          subscribe: (handler: (e: DocumentEvent) => void) => {
            emit = handler;
            return () => {
              unsubscribed = true;
            };
          },
        },
      },
      cleanup: (fn: () => void) => cleanups.push(fn),
    } as unknown as EffectContext<RenderState, RenderAction>;
    registerRenderEffects(ctx);
    return {
      capability: createRenderCapability(ctx),
      emit: (e: DocumentEvent) => emit!(e),
      teardown: () => cleanups.forEach((fn) => fn()),
      wasUnsubscribed: () => unsubscribed,
    };
  }

  it('tilesFor binds the view once: stable per view, distinct across views', () => {
    const h = harness();
    const main = h.capability.tilesFor('stage');
    expect(h.capability.tilesFor('stage')).toBe(main); // reference-stable (hook dep)
    expect(h.capability.tilesFor('stage-thumbs')).not.toBe(main); // its own state
  });

  it('a confirmed annotation event bumps renderEpoch for that page only', () => {
    const h = harness();
    expect(h.capability.renderEpoch(22)).toBe(0);
    h.emit(event({ type: 'annotation.updated', pageObjectNumber: 22 }));
    expect(h.capability.renderEpoch(22)).toBe(1);
    expect(h.capability.renderEpoch(11)).toBe(0);
  });

  it('annotation facts never reach base renders (annotated-only scope)', () => {
    const h = harness();
    h.emit(event({ type: 'annotation.created', pageObjectNumber: 22 }));
    expect(h.capability.renderEpoch(22, false)).toBe(0);
    expect(h.capability.renderEpoch(22, true)).toBe(1);
  });

  it('origin is irrelevant — any confirmed event bumps (remote SSE included)', () => {
    const h = harness();
    h.emit(
      event({
        type: 'annotation.moved',
        pageObjectNumber: 11,
        origin: { kind: 'remote', sessionId: 'other', sub: 'alice', ts: 1, serverId: 7 },
      }),
    );
    expect(h.capability.renderEpoch(11)).toBe(1);
  });

  it('coarse form events bump every page from the registry', () => {
    const h = harness();
    h.emit(event({ type: 'form.imported' }));
    for (const pon of PONS) expect(h.capability.renderEpoch(pon)).toBe(1);
  });

  it('teardown unsubscribes from the event stream', () => {
    const h = harness();
    h.teardown();
    expect(h.wasUnsubscribed()).toBe(true);
  });

  // ── the open door: invalidate() ──────────────────────────────────────────

  it('invalidate({pons, scope: "content"}) reaches BOTH raster products', () => {
    const h = harness();
    h.capability.invalidate({ pons: [22], scope: 'content' });
    expect(h.capability.renderEpoch(22, false)).toBe(1);
    expect(h.capability.renderEpoch(22, true)).toBe(1);
    expect(h.capability.renderEpoch(11, false)).toBe(0);
  });

  it('invalidate({pons, scope: "annotations"}) leaves base renders untouched', () => {
    const h = harness();
    h.capability.invalidate({ pons: [22], scope: 'annotations' });
    expect(h.capability.renderEpoch(22, false)).toBe(0);
    expect(h.capability.renderEpoch(22, true)).toBe(1);
  });

  it('invalidate() defaults to every page, content scope', () => {
    const h = harness();
    h.capability.invalidate();
    for (const pon of PONS) {
      expect(h.capability.renderEpoch(pon, false)).toBe(1);
      expect(h.capability.renderEpoch(pon, true)).toBe(1);
    }
  });

  it('content and annotation facts compose into one monotonic annotated version', () => {
    const h = harness();
    h.emit(event({ type: 'annotation.updated', pageObjectNumber: 11 }));
    h.capability.invalidate({ pons: [11], scope: 'content' });
    expect(h.capability.renderEpoch(11, true)).toBe(2); // 1 content + 1 annotated
    expect(h.capability.renderEpoch(11, false)).toBe(1); // content only
  });
});

// ── Policy conformance: the three-layer rule ────────────────────────────────

const LATTICE = {
  kind: 'lattice',
  fullPage: { widths: [320, 640, 1280, 2560] },
  appearances: { scales: [1, 2, 4] },
  formats: ['webp'],
  background: 'white',
  enforced: false,
} as const;

describe('policy conformance', () => {
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
    return { task, resolve: (v: unknown) => resolveFn(v) };
  }

  function harness(opts: { policy?: unknown; options?: RenderPluginOptions } = {}) {
    let state = initialRenderState();
    const imageCalls: Array<{ pon: number; options: Record<string, unknown> }> = [];
    const tasks: Array<ReturnType<typeof makeTask>> = [];
    const ctx = {
      getState: () => state,
      dispatch: (a: RenderAction) => {
        state = renderReducer(state, a);
      },
      // The policy is a DOCUMENT FACT on the kernel registry — the harness
      // supplies it exactly like the kernel does: on the meta, pre-publish.
      document: () => ({
        pages: PONS.map((pageObjectNumber) => ({
          pageObjectNumber,
          size: { width: 612, height: 792 },
        })),
        renderPolicy: opts.policy ?? { kind: 'continuous' },
      }),
      doc: {
        events: { subscribe: () => () => {} },
        security: { allows: () => true },
        page: (pon: number) => ({
          render: {
            image: (options: Record<string, unknown>) => {
              imageCalls.push({ pon, options });
              const t = makeTask();
              tasks.push(t);
              return t.task;
            },
          },
        }),
      },
      cleanup: () => {},
    } as unknown as EffectContext<RenderState, RenderAction>;
    registerRenderEffects(ctx);
    return { capability: createRenderCapability(ctx, opts.options), imageCalls, tasks };
  }

  it('keys are computable the moment the capability exists — the kernel materialized the fact', () => {
    const h = harness({ policy: LATTICE });
    expect(h.capability.renderSourceKey(11, { scale: 1 })).toBe('11|w640|a1|e0');
  });

  it('continuous conforms to the EXACT device width, capped at the budget', () => {
    const h = harness();
    expect(h.capability.renderPolicy()).toEqual({ kind: 'continuous' });
    // Below the budget: the exact demand (612pt × 0.5 = 306) — resting
    // pixels are never resampled, the dpr-1 crispness rule.
    expect(h.capability.renderSourceKey(11, { scale: 0.5 })).toBe('11|w306|a1|e0');
    expect(h.capability.conformViewport(11, 0.5)).toEqual({ kind: 'width', width: 306 });
    // Past the budget the base holds at maxWidth (default 640) — one stable
    // key at any deeper zoom; sharpness beyond it is the tile plane's job.
    expect(h.capability.renderSourceKey(11, { scale: 1.53 })).toBe('11|w640|a1|e0');
    expect(h.capability.renderSourceKey(11, { scale: 8 })).toBe('11|w640|a1|e0');
  });

  it('continuous with a ladder quantize opts into rung caching', () => {
    const h = harness({ options: { fullPage: { quantize: [320, 640, 1280], maxWidth: 1280 } } });
    expect(h.capability.renderSourceKey(11, { scale: 0.5 })).toBe('11|w320|a1|e0');
    expect(h.capability.renderSourceKey(11, { scale: 1 })).toBe('11|w640|a1|e0');
    expect(h.capability.renderSourceKey(11, { scale: 8 })).toBe('11|w1280|a1|e0');
  });

  it('the budget also filters an advertised ladder (mobile-memory knob)', () => {
    const h = harness({ policy: LATTICE, options: { fullPage: { maxWidth: 700 } } });
    // Deployment rungs [320, 640, 1280, 2560] filtered to ≤700 → cap at 640.
    expect(h.capability.conformViewport(11, 8)).toEqual({ kind: 'width', width: 640 });
  });

  it('lattice: scale converts through the page width and snaps UP to the rung', () => {
    const h = harness({ policy: LATTICE });
    // 612pt page at 1× → 612px → w640; at 2× → 1224px → w1280.
    expect(h.capability.conformViewport(11, 1)).toEqual({ kind: 'width', width: 640 });
    expect(h.capability.conformViewport(11, 2)).toEqual({ kind: 'width', width: 1280 });
  });

  it('THE identity law: zoom inside a rung produces the SAME key (1.2 → 1.5 = no-op)', () => {
    const h = harness({ policy: LATTICE });
    const at12 = h.capability.renderSourceKey(11, { scale: 1.2 });
    const at15 = h.capability.renderSourceKey(11, { scale: 1.5 });
    expect(at12).toBe('11|w1280|a1|e0');
    expect(at15).toBe(at12);
    // …and crossing the rung changes it.
    expect(h.capability.renderSourceKey(11, { scale: 2.2 })).toBe('11|w2560|a1|e0');
  });

  it('epoch bumps mint new keys (staleness is a key change, never a flush)', () => {
    const h = harness({ policy: LATTICE });
    const before = h.capability.renderSourceKey(11, { scale: 1 });
    h.capability.invalidate({ pons: [11], scope: 'content' });
    const after = h.capability.renderSourceKey(11, { scale: 1 });
    expect(after).not.toBe(before);
  });

  it('renderPage sends the CONFORMED viewport to the engine', () => {
    const h = harness({ policy: LATTICE });
    void h.capability.renderPage(11, { scale: 1.2 }).catch(() => {});
    expect(h.imageCalls).toHaveLength(1);
    expect(h.imageCalls[0]!.options.viewport).toEqual({ kind: 'width', width: 1280 });
  });

  it('same-rung asks collapse in the store: two renderPage calls, ONE engine call', async () => {
    const h = harness({ policy: LATTICE });
    const a = h.capability.renderPage(11, { scale: 1.2 });
    const b = h.capability.renderPage(11, { scale: 1.5 });
    expect(h.imageCalls).toHaveLength(1);
    h.tasks[0]!.resolve({ fake: 'handle' });
    expect(await a).toEqual({ fake: 'handle' });
    expect(await b).toEqual({ fake: 'handle' });
    // A rung re-ask AFTER resolution serves from the LRU — still one call.
    expect(await h.capability.renderPage(11, { scale: 1.3 })).toEqual({ fake: 'handle' });
    expect(h.imageCalls).toHaveLength(1);
  });

  it('one consumer aborting a shared in-flight fetch does not kill it for the other', async () => {
    const h = harness({ policy: LATTICE });
    const ac = new AbortController();
    const doomed = h.capability.renderPage(11, { scale: 1.2, signal: ac.signal });
    const survivor = h.capability.renderPage(11, { scale: 1.5 });
    ac.abort();
    await expect(doomed).rejects.toBeTruthy();
    expect(h.tasks[0]!.task.aborted).toBeUndefined(); // engine call still alive
    h.tasks[0]!.resolve({ fake: 'handle' });
    expect(await survivor).toEqual({ fake: 'handle' });
  });

  it('the LAST consumer aborting an unresolved fetch aborts the engine call', async () => {
    const h = harness({ policy: LATTICE });
    const ac = new AbortController();
    const only = h.capability.renderPage(11, { scale: 1.2, signal: ac.signal });
    ac.abort();
    await expect(only).rejects.toBeTruthy();
    expect(h.tasks[0]!.task.aborted).toBeTruthy();
    // The dead entry is not sticky: the next ask fetches fresh.
    void h.capability.renderPage(11, { scale: 1.2 }).catch(() => {});
    expect(h.imageCalls).toHaveLength(2);
  });

  it("format is a strategy value: 'bmp' rides into engine calls under continuous", () => {
    const h = harness({ options: { format: 'bmp', quality: 0.9 } });
    void h.capability.renderPage(11, { scale: 0.5 }).catch(() => {});
    expect(h.imageCalls[0]!.options.format).toBe('bmp');
    expect(h.imageCalls[0]!.options.quality).toBe(0.9);
  });

  it("…and conforms to policy.formats under a lattice — 'bmp' becomes the deployment format", () => {
    const h = harness({ policy: LATTICE, options: { format: 'bmp' } });
    void h.capability.renderPage(11, { scale: 0.5 }).catch(() => {});
    // LATTICE advertises formats: ['webp'] — BMP is local-only by contract.
    expect(h.imageCalls[0]!.options.format).toBe('webp');
  });

  it('the encode format is part of the raster identity — keys change with it', () => {
    // The cloud policy arrives async after open; a resolved-format change
    // must mint new keys, never serve old-format bytes for the same key.
    const plain = harness().capability.renderSourceKey(11, { scale: 0.5 });
    const bmp = harness({ options: { format: 'bmp' } }).capability.renderSourceKey(11, {
      scale: 0.5,
    });
    expect(plain).toBe('11|w306|a1|e0');
    expect(bmp).toBe('11|w306|a1|e0|fbmp');
  });

  it('paintSettings resolves the layer-facing knobs', () => {
    expect(harness().capability.paintSettings()).toEqual({
      fadeMs: 0,
      tiles: true,
    });
    expect(harness({ options: { tiles: false } }).capability.paintSettings().tiles).toBe(false);
  });
});

describe('the twin law (PERMISSIONS.md) — canRender and the fetch gates', () => {
  const makeCtx = (allowed: boolean) => {
    let state = initialRenderState();
    const image = vi.fn(() => {
      const p = Promise.resolve({ close: () => {} }) as Promise<unknown> & {
        abort: (r?: unknown) => void;
      };
      p.abort = () => {};
      return p;
    });
    const ctx = {
      getState: () => state,
      dispatch: (a: RenderAction) => {
        state = renderReducer(state, a);
      },
      document: () => ({
        pages: [{ pageObjectNumber: 11, size: { width: 612, height: 792 } }],
      }),
      doc: {
        security: { allows: () => allowed },
        page: () => ({ render: { image } }),
        events: { subscribe: () => () => {} },
      },
      cleanup: () => {},
      tryGet: () => null,
    } as unknown as EffectContext<RenderState, RenderAction>;
    return { capability: createRenderCapability(ctx), image };
  };

  it('canRender mirrors doc.render', () => {
    expect(makeCtx(true).capability.canRender()).toBe(true);
    expect(makeCtx(false).capability.canRender()).toBe(false);
  });

  it('a denied session never spends an engine round-trip on a raster', async () => {
    const { capability, image } = makeCtx(false);
    await expect(
      capability.renderPage(11, { scale: 1, signal: new AbortController().signal }),
    ).rejects.toMatchObject({ name: 'PermissionDenied', required: 'doc.render' });
    expect(image).not.toHaveBeenCalled();
  });

  it('an allowed session renders (twin ⇔ verb conformance)', async () => {
    const { capability, image } = makeCtx(true);
    await capability.renderPage(11, { scale: 1, signal: new AbortController().signal });
    expect(image).toHaveBeenCalledOnce();
  });
});
