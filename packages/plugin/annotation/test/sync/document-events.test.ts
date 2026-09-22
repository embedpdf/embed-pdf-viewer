import type { DocumentEvent, EffectContext } from '@embedpdf/core';
import type { Annot } from '@embedpdf/core-annotation';
import { annotationKey, formWidget, toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';

import { subscribeDocumentEvents } from '../../src/sync/document-events';
import { annotationReducer, initialAnnotationState } from '../../src/model';
import type { AnnotationAction, AnnotationState } from '../../src/model';

const event = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;

/** Effects harness: real reducer + a recording host stub — the effects
 *  layer routes; the routed-to behavior lives in capability.test.ts. */
const harness = (seed?: (state: AnnotationState) => AnnotationState) => {
  let state = initialAnnotationState();
  if (seed) state = seed(state);
  const host = {
    ensureHydrated: vi.fn(),
    refresh: vi.fn(async () => {}),
    deliverRemoteEvent: vi.fn(),
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
  subscribeDocumentEvents(ctx);
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
      const id = annotationKey({ kind: 'objectNumber', page: toPageRef(11), annotObjectNumber });
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
          changedWidgets: [formWidget(annotObjectNumber, toPageRef(11))],
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
      page: toPageRef(11),
      origin: { kind: 'remote', serverId: 45 },
      created: {},
    });
    emit(remote);
    expect(host.deliverRemoteEvent).toHaveBeenCalledWith(remote);
  });

  it('filters LOCAL annotation events — own edits flow through the capability', () => {
    const { host, emit } = harness();
    emit(
      event({
        type: 'annotation.created',
        page: toPageRef(11),
        origin: { kind: 'local', serverId: null },
        created: {},
      }),
    );
    expect(host.deliverRemoteEvent).not.toHaveBeenCalled();
  });

  it('stream.desynced triggers a refresh', () => {
    const { host, emit } = harness();
    emit(event({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 1 }));
    expect(host.refresh).toHaveBeenCalledTimes(1);
  });

  it('pages.deleted removes the pages’ annotations from the model', () => {
    const keep = 'obj:1';
    const gone = 'obj:2';
    const { emit, getState } = harness((state) => ({
      ...state,
      model: {
        ...state.model,
        byId: {
          [keep]: { id: keep, page: toPageRef(11) } as Annot,
          [gone]: { id: gone, page: toPageRef(12) } as Annot,
        },
        order: [keep, gone],
      },
    }));

    emit(
      event({
        type: 'pages.deleted',
        pages: [toPageRef(12)],
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
        insertedPages: [toPageRef(21), toPageRef(22)],
        origin: { kind: 'remote', serverId: 45 },
      }),
    );
    expect(host.reloadPage).toHaveBeenCalledTimes(2);
    expect(host.reloadPage).toHaveBeenCalledWith(toPageRef(21));
    expect(host.reloadPage).toHaveBeenCalledWith(toPageRef(22));
  });

  it('redaction.applied reloads the applied pages, origin-agnostic', () => {
    const { host, emit } = harness();
    emit(
      event({
        type: 'redaction.applied',
        origin: { kind: 'local', serverId: null },
        results: [
          { status: 'applied', page: toPageRef(11) },
          { status: 'skipped', page: toPageRef(12) },
        ],
      }),
    );
    expect(host.reloadPage).toHaveBeenCalledTimes(1);
    expect(host.reloadPage).toHaveBeenCalledWith(toPageRef(11));
  });
});
