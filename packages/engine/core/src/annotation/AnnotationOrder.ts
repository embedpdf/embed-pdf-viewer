import type { AnnotationFamily } from './family';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageRef } from '../identity/PageRef';

/** One entry of a page's `/Annots`: the annotation it holds and the family it belongs to. */
export interface AnnotationOrderEntry {
  ref: AnnotationRef;
  family: AnnotationFamily;
}

/**
 * A page's `/Annots` as written, both families together
 * (`page.annotations.order()`). PDFium paints each family in its own order,
 * but a viewer that stacks its own layer over the page (as PDF.js does with
 * its annotation layer) follows the array itself, so the interleaving
 * matters there.
 */
export interface AnnotationOrder {
  page: PageRef;
  /** Every `/Annots` entry, first to last; `null` for one that isn't an annotation dictionary. */
  entries: (AnnotationOrderEntry | null)[];
}
