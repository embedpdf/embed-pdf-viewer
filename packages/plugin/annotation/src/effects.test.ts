import { describe, expect, it } from 'vitest';
import type { DocumentEvent, EffectContext } from '@embedpdf/core';
import { encodeStableIdKey } from '@embedpdf/engine-core/runtime';
import type { Annot } from '@embedpdf/core-annotation';

import { registerAnnotationEffects } from './effects';
import { annotationReducer, initialAnnotationState } from './reducer';
import type { AnnotationAction, AnnotationState } from './types';

const event = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;

describe('annotation document effects', () => {
  it.each(['form.valueChanged', 'form.effectsApplied'])(
    '%s advances the changed widget appearance version',
    (type) => {
      const annotObjectNumber = 5;
      const id = encodeStableIdKey({ kind: 'objectNumber', value: annotObjectNumber });
      let state = initialAnnotationState();
      state = {
        ...state,
        model: {
          ...state.model,
          byId: {
            [id]: { id, apVersion: 0 } as Annot,
          },
          order: [id],
        },
      };

      let emit: ((event: DocumentEvent) => void) | null = null;
      const ctx = {
        getState: () => state,
        dispatch: (action: AnnotationAction) => {
          state = annotationReducer(state, action);
        },
        document: () => null,
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
      emit!(
        event({
          type,
          changedWidgets: [{ annotObjectNumber, pageObjectNumber: 11 }],
          origin: { kind: 'local' },
        }),
      );

      expect(state.model.byId[id]?.apVersion).toBe(1);
    },
  );
});

describe('remote annotation events — echo-driven appearance invalidation', () => {
  const CROP = { left: 0, bottom: 0, right: 600, top: 800 };
  const NO_FLAGS = {
    invisible: false,
    hidden: false,
    print: false,
    noZoom: false,
    noRotate: false,
    noView: false,
    readOnly: false,
    locked: false,
    toggleNoView: false,
    lockedContents: false,
  };
  const squareDTO = (annotObjectNumber: number) => ({
    ref: { kind: 'objectNumber', pageObjectNumber: 11, annotObjectNumber },
    pageObjectNumber: 11,
    index: 0,
    identityQuality: 'durable',
    nm: null,
    flags: NO_FLAGS,
    rect: { left: 100, bottom: 100, right: 200, top: 200 },
    contents: null,
    author: null,
    created: null,
    modified: null,
    blendMode: 'normal',
    inReplyTo: null,
    replyType: null,
    subtype: 'square',
    color: { r: 0, g: 0, b: 0 },
    interiorColor: null,
    strokeWidth: 2,
    opacity: 1,
    borderStyle: 'solid',
  });

  const harness = () => {
    const id = 'obj:70';
    let state = initialAnnotationState();
    state = {
      ...state,
      model: {
        ...state.model,
        byId: { [id]: { id, apVersion: 0 } as Annot },
        order: [id],
      },
    };
    let emit: ((documentEvent: DocumentEvent) => void) | null = null;
    const ctx = {
      getState: () => state,
      dispatch: (action: AnnotationAction) => {
        state = annotationReducer(state, action);
      },
      document: () => ({ pages: [{ pageObjectNumber: 11, boxes: { crop: CROP } }] }),
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
    return { id, emit: emit!, getState: () => state };
  };

  it('a PRESERVED remote update re-syncs the model without an appearance re-fetch', () => {
    const { id, emit, getState } = harness();
    emit(
      event({
        type: 'annotation.updated',
        pageObjectNumber: 11,
        origin: { kind: 'remote' },
        updated: squareDTO(70),
        appearance: { action: 'preserved', changed: false },
      }),
    );
    const a = getState().model.byId[id];
    expect(a?.subtype).toBe('square'); // the DTO re-sync applied
    expect(a?.apVersion ?? 0).toBe(0); // …but the cached raster stays
  });

  it('a REGENERATED remote update advances apVersion exactly once', () => {
    const { id, emit, getState } = harness();
    emit(
      event({
        type: 'annotation.updated',
        pageObjectNumber: 11,
        origin: { kind: 'remote' },
        updated: squareDTO(70),
        appearance: { action: 'regenerated', changed: true },
      }),
    );
    expect(getState().model.byId[id]?.apVersion).toBe(1);
  });

  it('a remote z-order move never re-fetches appearances', () => {
    const { id, emit, getState } = harness();
    emit(
      event({
        type: 'annotation.moved',
        pageObjectNumber: 11,
        origin: { kind: 'remote' },
        moved: [squareDTO(70)],
      }),
    );
    const a = getState().model.byId[id];
    expect(a?.subtype).toBe('square');
    expect(a?.apVersion ?? 0).toBe(0);
  });
});
