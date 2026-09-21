import type { ActionsAction, ActionsState } from './types';

export const initialActionsState = (): ActionsState => ({ seq: 0, policyRevision: 0 });

export function actionsReducer(state: ActionsState, action: ActionsAction): ActionsState {
  switch (action.type) {
    case 'ACTIONS_DISPATCHED':
      return { ...state, seq: state.seq + 1 };
    case 'ACTIONS_POLICY_CHANGED':
      return { ...state, policyRevision: state.policyRevision + 1 };
    default:
      return state;
  }
}
