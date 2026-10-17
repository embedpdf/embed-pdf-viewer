import type { MutationMeta } from './MutationMeta';
import type { PageRef } from '../identity/PageRef';

/** A calibration changes document state, with no page pixels or annotation indices changed. */
export interface PageScaleResult {
  page: PageRef;
  meta: MutationMeta;
}
