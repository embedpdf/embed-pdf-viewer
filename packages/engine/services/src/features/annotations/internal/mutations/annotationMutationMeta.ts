import type {
  AnnotationListMutationMeta,
  AnnotationRef,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';

/**
 * The `meta` every single-page annotation write returns: the page it
 * changed and the annotations it touched, the one it was asked about first.
 */
export function annotationMutationMeta(
  pageObjectNumber: PageObjectNumber,
  changed: readonly AnnotationRef[],
): AnnotationListMutationMeta {
  return { affectedPages: [toPageRef(pageObjectNumber)], cacheDelta: null, changed: [...changed] };
}
