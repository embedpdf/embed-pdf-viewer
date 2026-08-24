import type { MutationMeta } from './MutationMeta';
import type { RefetchReason } from './RefetchReason';
import type { AnnotationStableId } from '../identity/AnnotationStableId';

/**
 * Per-page side-effect envelope every annotation mutation returns. The
 * client uses it to update local caches without needing a fresh full
 * read in the common case, and to fire a `shouldRefetch` only when
 * indices actually shifted under a weak ref.
 *
 * Wire-stable, identical between local and cloud engines.
 */
export interface AnnotationListMutationMeta extends MutationMeta {
  /**
   * Stable IDs of annotations actually touched by the mutation. Includes
   * created, updated, and deleted; the per-mutation result types pin
   * down which is which (see `AnnotationCreateResult` etc.).
   */
  changed: AnnotationStableId[];
  /**
   * `true` if any weak `AnnotationRef.kind === 'index'` references the
   * client may still be holding became invalid as a result of this
   * mutation. Set by the engine based on the page's
   * `affectedPages[0].weakAnnotationState` and the structural shape of the change.
   * Mutation paths ensure the weak-annotation state is known before computing
   * this value.
   */
  weakRefsInvalidated: boolean;
  /**
   * `null` means "your snapshot is still valid"; non-null means the
   * client should refetch the page list and lists the reason for UX.
   */
  shouldRefetch: { reason: RefetchReason } | null;
}
