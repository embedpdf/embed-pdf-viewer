import type { ActionsAction, ActionsState } from './types';

export const initialActionsState = (): ActionsState => ({ seq: 0 });

export function actionsReducer(state: ActionsState, action: ActionsAction): ActionsState {
  switch (action.type) {
    case 'ACTIONS_DISPATCHED':
      return { seq: state.seq + 1 };
    default:
      return state;
  }
}
