import type {
  AnnotationListMutationMeta,
  AnnotationRef,
  PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';

import type { WriteStamp } from '../../../../document-session/DocumentSession';

/**
 * The `meta` every single-page annotation write returns: the page it
 * changed and the annotations it touched, the one it was asked about first.
 */
export function annotationMutationMeta(
  stamp: WriteStamp,
  pageObjectNumber: PageObjectNumber,
  changed: readonly AnnotationRef[],
): AnnotationListMutationMeta {
  return {
    affectedPages: [toPageRef(pageObjectNumber)],
    cacheDelta: null,
    ...stamp,
    changed: [...changed],
  };
}
