import type { MetadataAction, MetadataState } from './types';

export const initialMetadataState = (): MetadataState => ({ metadata: null });

/** Pure. The only transition: replace the metadata snapshot (from a read or an
 *  event). */
export const metadataReducer = (state: MetadataState, a: MetadataAction): MetadataState =>
  a.type === 'SET' ? { ...state, metadata: a.metadata } : state;
