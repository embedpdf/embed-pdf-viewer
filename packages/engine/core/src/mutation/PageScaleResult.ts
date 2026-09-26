import type { PageRef } from '../identity/PageRef';
import type { MutationMeta } from './MutationMeta';

/** A calibration changes document state, with no page pixels or annotation indices changed. */
export interface PageScaleResult {
  page: PageRef;
  meta: MutationMeta;
}
