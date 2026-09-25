import type { AnnotationList, AnnotationListOptions } from '../annotation/AnnotationList';
import type { PageRef } from '../identity/PageRef';
import { AbortablePromise } from '../promise/AbortablePromise';
import type { AnnotationBundle } from '../transfer/AnnotationBundle';
import type { AnnotationImportOptions, AnnotationImportResult } from '../transfer/annotationImport';
import type { AnnotationExportSelection } from '../transfer/exportSelection';

export interface WeakAnnotationEditSession {
  readonly id: string;
  readonly expiresAt: number;
  readonly heartbeatIntervalMs: number;
  /** The pages this session claims edit presence on. */
  readonly pages: readonly PageRef[];
  covers(page: PageRef): boolean;
  updatePages(pages: readonly PageRef[]): AbortablePromise<void>;
  heartbeat(): AbortablePromise<void>;
  close(): AbortablePromise<void>;
}

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
  beginEdit(pages: readonly PageRef[]): AbortablePromise<WeakAnnotationEditSession>;
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
   * items they name in the bundle. Emits one `annotation.created` per
   * annotation, sharing `origin.tx`. Needs `doc.annotate.modify`; the
   * default `attribution: 'restore'` also needs `doc.annotate.import`.
   */
  import(
    bundle: AnnotationBundle,
    options?: AnnotationImportOptions,
  ): AbortablePromise<AnnotationImportResult>;
}
