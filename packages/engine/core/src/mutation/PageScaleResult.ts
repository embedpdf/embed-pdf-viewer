import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { MutationMeta } from './MutationMeta';

/** A calibration changes document state, with no page pixels or annotation indices changed. */
export interface PageScaleResult {
  pageObjectNumber: PageObjectNumber;
  meta: MutationMeta;
}
