/** The actions slice: store-visible observability only (a dispatch counter
 *  and a policy revision) — every real state lives with its owning area. */
export interface ActionsState {
  /** Monotonic dispatch counter — store-visible observability. */
  seq: number;
  /** Bumped by `updatePolicy`, so store selectors re-read `getPolicy()`. */
  policyRevision: number;
}

export type ActionsAction = { type: 'ACTIONS_DISPATCHED' } | { type: 'ACTIONS_POLICY_CHANGED' };

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
