import type { SignatureAction, SignatureState } from './types';

export const initialSignatureState = (): SignatureState => ({
  snapshot: null,
  verdicts: null,
  target: null,
  pending: null,
  busy: false,
});

export function signatureReducer(state: SignatureState, action: SignatureAction): SignatureState {
  switch (action.type) {
    case 'SNAPSHOT':
      return { ...state, snapshot: action.snapshot };
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
