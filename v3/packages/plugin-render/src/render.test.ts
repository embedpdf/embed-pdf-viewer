import { describe, expect, it } from 'vitest';
import type { DocumentEvent, EffectContext } from '@embedpdf-x/kernel';

import { createRenderCapability } from './capability';
import { annotatedPons, registerRenderEffects } from './effects';
import { initialRenderState, renderReducer } from './reducer';
import type { RenderAction, RenderState } from './types';

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
