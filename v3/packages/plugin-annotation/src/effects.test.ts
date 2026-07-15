import { describe, expect, it } from 'vitest';
import type { DocumentEvent, EffectContext } from '@embedpdf-x/kernel';
import { encodeStableIdKey } from '@embedpdf/engine-core/runtime';
import type { Annot } from '@embedpdf-x/annotation-core';

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
