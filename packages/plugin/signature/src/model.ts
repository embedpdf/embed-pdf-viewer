/** The signature slice: the last snapshot and verdicts, the sign-here target,
 *  a parked two-phase signing, and the busy flag. */
import type { ResourceStatus } from '@embedpdf/core';
import type { SignatureVerdict } from '@embedpdf/core-signature';
import type { FormFieldRef, SignatureSnapshot } from '@embedpdf/engine-core/runtime';

import type { SignaturePending } from './contract';

export interface SignatureState {
  snapshot: SignatureSnapshot | null;
  /** `idle` until the first read; `loading` while one is in flight. */
  status: ResourceStatus;
  verdicts: SignatureVerdict[] | null;
  /** The field the user chose to sign next ("select the field, then pick a mark"). */
  target: FormFieldRef | null;
  /** A signing candidate is parked (here or, on the cloud, elsewhere): the document is read-only. */
  pending: SignaturePending | null;
  /** A sign/fill call is in flight. */
  busy: boolean;
}

export type SignatureAction =
  | { type: 'SNAPSHOT'; snapshot: SignatureSnapshot | null }
  | { type: 'STATUS'; status: ResourceStatus }
  | { type: 'VERDICTS'; verdicts: SignatureVerdict[] | null }
  | { type: 'TARGET'; field: FormFieldRef | null }
  | { type: 'PENDING'; pending: SignaturePending | null }
  | { type: 'BUSY'; busy: boolean };

export const initialSignatureState = (): SignatureState => ({
  snapshot: null,
  status: 'idle',
  verdicts: null,
  target: null,
  pending: null,
  busy: false,
});

export function signatureReducer(state: SignatureState, action: SignatureAction): SignatureState {
  switch (action.type) {
    case 'SNAPSHOT':
      return { ...state, snapshot: action.snapshot };
    case 'STATUS':
      return state.status === action.status ? state : { ...state, status: action.status };
    case 'VERDICTS':
      return { ...state, verdicts: action.verdicts };
    case 'TARGET':
      return { ...state, target: action.field };
    case 'PENDING':
      return { ...state, pending: action.pending };
    case 'BUSY':
      return { ...state, busy: action.busy };
    default:
      return state;
  }
}
