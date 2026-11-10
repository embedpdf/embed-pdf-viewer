import type { AnnotationList, AnnotationListOptions } from '../annotation/AnnotationList';
import { AbortablePromise } from '../promise/AbortablePromise';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { AnnotationBundle } from '../transfer/AnnotationBundle';
import type { AnnotationCopyOptions, AnnotationCopyResult } from '../transfer/annotationCopy';
import type { AnnotationImportOptions, AnnotationImportResult } from '../transfer/annotationImport';
import type { AnnotationExportSelection } from '../transfer/exportSelection';

/**
 * Document-scoped annotation service exposed via
 * `DocumentHandle.annotations`.
 */
export interface DocumentAnnotationsService {
  /**
   * The annotations of the given pages, or of every page. A raw read: no
   * page is loaded, so listing a whole document is cheap. Returns what
   * `page.annotations.list()` returns for each page.
   */
  list(options?: AnnotationListOptions): AbortablePromise<AnnotationList>;
  /**
   * Take annotations out of the document, with the bytes beside them, as one
   * bundle: every annotation, or the selection with what it points at and,
   * by default, its threads (see {@link AnnotationExportSelection}). One
   * drawing is one resource however many stamps place it. Refused with
   * `PayloadTooLarge`, naming the limit, when the bundle would pass one of
   * the import limits, and with `NotFound` for a selected page or
   * annotation the document doesn't have. Needs `doc.annotate.read` and
   * `doc.download`.
   */
  export(selection?: AnnotationExportSelection): AbortablePromise<AnnotationBundle>;
  /**
   * Create a bundle's annotations in this document, as one change: every
   * item is checked, its pages mapped and what can't be carried left out
   * (`dropped`) before the first write, and a failure while writing leaves
   * the document as it was. `reply.to` and a popup's `parent` link to the
   * items they name in the bundle. Emits one `annotations.created` per
   * annotation, sharing `origin.tx`. Needs `doc.annotate.modify`; the
   * default `attribution: 'restore'` also needs `doc.annotate.import`.
   */
  import(
    bundle: AnnotationBundle,
    options?: AnnotationImportOptions,
  ): AbortablePromise<AnnotationImportResult>;
  /**
   * Copy annotations of this document, as one change: a copy of each, in the
   * order of `refs`, on its own page or on `options.page`, moved by
   * `options.offset`. A copy carries its source's data and flags, a stamp's
   * drawing and an attachment's file; it has its own ref and a fresh name,
   * and the session is its author. Links between the copies stay; a link to
   * an annotation that isn't copied is left out, and so are replies that
   * aren't named. What can't be made again is in `dropped`. It is the op
   * `annotations.copy` through `doc.apply`, so its `opId` undoes it. Emits
   * one `annotations.created` per copy, sharing `origin.tx`. Refused with
   * `NotFound` for an annotation the document doesn't have. Needs
   * `doc.annotate.read`, and what creating each copy needs.
   */
  copy(
    refs: readonly AnnotationRef[],
    options?: AnnotationCopyOptions,
  ): AbortablePromise<AnnotationCopyResult>;
}
