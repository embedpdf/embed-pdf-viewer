/**
 * The form slice: the pure core `Model` (the reconciled field tree, per-page
 * widget geometry, in-flight writes) plus the hydration status. The pure
 * `update` runs in the store service; the reducer only stores new state —
 * keeping the kernel store a dumb, serializable container.
 */
import type { ResourceStatus } from '@embedpdf/core';

import { initialModel, type Model } from './core/model';

export interface FormState {
  model: Model;
  /** Hydration: `loading` until the field tree is in, then `ready`; `forbidden` without `doc.forms.read`. */
  status: ResourceStatus;
}

export type FormAction =
  | { type: 'SET_MODEL'; model: Model }
  | { type: 'SET_STATUS'; status: ResourceStatus };

export const initialFormState = (): FormState => ({ model: initialModel(), status: 'idle' });

export const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case 'SET_MODEL':
      return { ...state, model: action.model };
    case 'SET_STATUS':
      return state.status === action.status ? state : { ...state, status: action.status };
    default:
      return state;
  }
};
