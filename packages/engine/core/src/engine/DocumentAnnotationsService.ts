import type {
  AnnotationListPageSnapshot,
  AnnotationListSnapshotAllPages,
} from '../annotation/AnnotationListSnapshot';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface WeakAnnotationEditSession {
  readonly id: string;
  readonly expiresAt: number;
  readonly heartbeatIntervalMs: number;
  readonly pageObjectNumbers: readonly PageObjectNumber[];
  covers(pageObjectNumber: PageObjectNumber): boolean;
  updatePages(pageObjectNumbers: readonly PageObjectNumber[]): AbortablePromise<void>;
  heartbeat(): AbortablePromise<void>;
  release(): AbortablePromise<void>;
}

/**
 * Document-scoped annotation service exposed via
 * `DocumentHandle.annotations`. The two read paths matter:
 *
 *   `listRawAll()` - whole-doc raw read. No `pagePtr` is acquired; uses
 *                    `EPDFPage_GetAnnotCountRaw` + `EPDFPage_GetAnnotRaw`.
 *                    Cheapest possible path; ideal for "do anything with
 *                    a document" UX where the caller wants to know what's
 *                    where but does not need full per-subtype fields yet.
 *
 *   `listRaw(p)`   - single-page raw read. Same fast path scoped to one
 *                    page, by PDF object number.
 *
 * The slow per-subtype `pagePtr`-driven read lives on
 * `PageAnnotationsService.list()`.
 */
export interface DocumentAnnotationsService {
  listRawAll(): AbortablePromise<AnnotationListSnapshotAllPages>;
  listRaw(pageObjectNumber: PageObjectNumber): AbortablePromise<AnnotationListPageSnapshot>;
  beginWeakEdit(
    pageObjectNumbers: readonly PageObjectNumber[],
  ): AbortablePromise<WeakAnnotationEditSession>;
}
