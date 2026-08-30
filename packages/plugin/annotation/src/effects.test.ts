import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvent, EffectContext } from '@embedpdf/core';
import { encodeStableIdKey } from '@embedpdf/engine-core/runtime';
import type { Annot } from '@embedpdf/core-annotation';

import { registerAnnotationEffects } from './effects';
import { annotationReducer, initialAnnotationState } from './reducer';
import type { AnnotationAction, AnnotationState } from './types';

const event = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;

/** Effects harness: real reducer + a recording host stub — the effects
 *  layer routes; the routed-to behavior lives in capability.test.ts. */
const harness = (seed?: (state: AnnotationState) => AnnotationState) => {
  let state = initialAnnotationState();
  if (seed) state = seed(state);
  const host = {
    ensureHydrated: vi.fn(),
    rehydrate: vi.fn(async () => {}),
    deliverRemoteAnnotationEvent: vi.fn(),
    reloadPage: vi.fn(async () => {}),
  };
  let emit: ((documentEvent: DocumentEvent) => void) | null = null;
  const ctx = {
    getState: () => state,
    dispatch: (action: AnnotationAction) => {
      state = annotationReducer(state, action);
    },
    document: () => null,
    get: () => host,
    doc: {
      events: {
        subscribe: (handler: (documentEvent: DocumentEvent) => void) => {
          emit = handler;
          return () => undefined;
        },
      },
    },
    cleanup: () => undefined,
  } as unknown as EffectContext<AnnotationState, AnnotationAction>;
  registerAnnotationEffects(ctx);
  return { host, emit: emit!, getState: () => state };
};

describe('annotation document effects', () => {
  it('kicks whole-document hydration exactly once at registration', () => {
    const { host } = harness();
    expect(host.ensureHydrated).toHaveBeenCalledTimes(1);
  });

  it.each(['form.valueChanged', 'form.effectsApplied'])(
    '%s advances the changed widget appearance version',
    (type) => {
      const annotObjectNumber = 5;
      const id = encodeStableIdKey({ kind: 'objectNumber', value: annotObjectNumber });
      const { emit, getState } = harness((state) => ({
        ...state,
        model: {
          ...state.model,
          byId: { [id]: { id, apVersion: 0 } as Annot },
          order: [id],
        },
      }));

      emit(
        event({
          type,
          changedWidgets: [{ annotObjectNumber, pageObjectNumber: 11 }],
          origin: { kind: 'local' },
        }),
      );

      expect(getState().model.byId[id]?.apVersion).toBe(1);
    },
  );

  it('hands every REMOTE annotation event to the hydration-aware delivery', () => {
    const { host, emit } = harness();
    const remote = event({
      type: 'annotation.created',
      pageObjectNumber: 11,
      origin: { kind: 'remote', serverId: 45 },
      created: {},
    });
    emit(remote);
    expect(host.deliverRemoteAnnotationEvent).toHaveBeenCalledWith(remote);
  });

  it('filters LOCAL annotation events — own edits flow through the capability', () => {
    const { host, emit } = harness();
    emit(
      event({
        type: 'annotation.created',
        pageObjectNumber: 11,
        origin: { kind: 'local', serverId: null },
        created: {},
      }),
    );
    expect(host.deliverRemoteAnnotationEvent).not.toHaveBeenCalled();
  });

  it('stream.desynced triggers a rehydrate', () => {
    const { host, emit } = harness();
    emit(event({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 1 }));
    expect(host.rehydrate).toHaveBeenCalledTimes(1);
  });

  it('pages.deleted removes the pages’ annotations from the model', () => {
    const keep = 'obj:1';
    const gone = 'obj:2';
    const { emit, getState } = harness((state) => ({
      ...state,
      model: {
        ...state.model,
        byId: {
          [keep]: { id: keep, pon: 11 } as Annot,
          [gone]: { id: gone, pon: 12 } as Annot,
        },
        order: [keep, gone],
      },
    }));

    emit(
      event({
        type: 'pages.deleted',
        pageObjectNumbers: [12],
        origin: { kind: 'remote', serverId: 45 },
      }),
    );

    expect(getState().model.order).toEqual([keep]);
    expect(getState().model.byId[gone]).toBeUndefined();
  });

  it('pages.inserted reloads the new pages', () => {
    const { host, emit } = harness();
    emit(
      event({
        type: 'pages.inserted',
        insertedPageObjectNumbers: [21, 22],
        origin: { kind: 'remote', serverId: 45 },
      }),
    );
    expect(host.reloadPage).toHaveBeenCalledTimes(2);
    expect(host.reloadPage).toHaveBeenCalledWith(21);
    expect(host.reloadPage).toHaveBeenCalledWith(22);
  });

  it('redaction.applied reloads the applied pages, origin-agnostic', () => {
    const { host, emit } = harness();
    emit(
      event({
        type: 'redaction.applied',
        origin: { kind: 'local', serverId: null },
        results: [
          { status: 'applied', pageObjectNumber: 11 },
          { status: 'skipped', pageObjectNumber: 12 },
        ],
      }),
    );
    expect(host.reloadPage).toHaveBeenCalledTimes(1);
    expect(host.reloadPage).toHaveBeenCalledWith(11);
  });
});
