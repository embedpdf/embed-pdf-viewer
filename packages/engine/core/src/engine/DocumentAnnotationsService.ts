import type {
  AnnotationListPageSnapshot,
  AnnotationListSnapshotAllPages,
} from '../annotation/AnnotationListSnapshot';
import type { PageRef } from '../identity/PageRef';
import { AbortablePromise } from '../promise/AbortablePromise';

export interface WeakAnnotationEditSession {
  readonly id: string;
  readonly expiresAt: number;
  readonly heartbeatIntervalMs: number;
  /** The pages this session claims edit presence on. */
  readonly pages: readonly PageRef[];
  covers(page: PageRef): boolean;
  updatePages(pages: readonly PageRef[]): AbortablePromise<void>;
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
  listRaw(page: PageRef): AbortablePromise<AnnotationListPageSnapshot>;
  beginWeakEdit(pages: readonly PageRef[]): AbortablePromise<WeakAnnotationEditSession>;
}
