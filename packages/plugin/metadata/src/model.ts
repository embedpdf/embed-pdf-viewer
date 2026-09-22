import type { DocumentMetadata, ResourceStatus } from '@embedpdf/core';

/** Pure state and transitions. `revision` bumps on every confirmed value. */
export interface MetadataState {
  readonly status: ResourceStatus;
  readonly value: DocumentMetadata | null;
  readonly revision: number;
}

export type MetadataAction =
  | { type: 'loading' }
  | { type: 'set'; metadata: DocumentMetadata }
  | { type: 'error'; forbidden: boolean };

export const initialMetadataState = (): MetadataState => ({
  status: 'idle',
  value: null,
  revision: 0,
});

export function reduceMetadata(state: MetadataState, action: MetadataAction): MetadataState {
  switch (action.type) {
    case 'loading':
      return state.status === 'loading' ? state : { ...state, status: 'loading' };
    case 'set':
      return { status: 'ready', value: action.metadata, revision: state.revision + 1 };
    case 'error':
      return { ...state, status: action.forbidden ? 'forbidden' : 'error' };
    default:
      return state;
  }
}

/** The keys whose values differ between two snapshots (shallow; `custom` by entries). */
export function changedKeys(
  previous: DocumentMetadata | null,
  next: DocumentMetadata,
): readonly (keyof DocumentMetadata)[] {
  const keys = Object.keys(next) as (keyof DocumentMetadata)[];
  if (!previous) return keys;
  return keys.filter((key) => {
    const a = previous[key];
    const b = next[key];
    if (key === 'custom') return JSON.stringify(a) !== JSON.stringify(b);
    return a !== b;
  });
}
