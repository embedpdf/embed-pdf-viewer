/** The redaction slice: the apply latch and the last result. Marks live on the annotation plane. */
import type { RedactionApplyResult } from '@embedpdf/engine-core';

export interface RedactionState {
  /** A destructive apply is in flight. */
  applying: boolean;
  /** The last apply result seen (own or remote), for status UI. */
  lastResult: RedactionApplyResult | null;
}

export type RedactionAction =
  | { type: 'APPLY_STARTED' }
  | { type: 'APPLY_FINISHED'; result: RedactionApplyResult | null };

export const initialRedactionState = (): RedactionState => ({
  applying: false,
  lastResult: null,
});

export const redactionReducer = (
  state: RedactionState,
  action: RedactionAction,
): RedactionState => {
  switch (action.type) {
    case 'APPLY_STARTED':
      return { ...state, applying: true };
    case 'APPLY_FINISHED':
      return { applying: false, lastResult: action.result ?? state.lastResult };
    default:
      return state;
  }
};
