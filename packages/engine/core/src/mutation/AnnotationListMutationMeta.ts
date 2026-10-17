import type { MutationMeta } from './MutationMeta';
import type { AnnotationRef } from '../identity/AnnotationRef';

/**
 * Per-page side-effect envelope every annotation mutation returns: the pages
 * it changed and the annotations it touched, so a client updates its caches
 * without a fresh read. Names never change, so nothing a client holds goes
 * stale.
 *
 * Wire-stable, identical between local and cloud engines.
 */
export interface AnnotationListMutationMeta extends MutationMeta {
  /**
   * The annotations the mutation actually touched, created, updated and
   * deleted alike; the per-mutation result types pin down which is which
   * (see `AnnotationCreateResult` etc.).
   */
  changed: AnnotationRef[];
}
