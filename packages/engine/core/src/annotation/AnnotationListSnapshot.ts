import type { AnnotationDTO } from './kinds';
import type { PageState } from '../revision/PageState';

/**
 * Whole-document raw read response. Returned by
 * `DocumentAnnotationsService.listRawAll()` and over the wire as the
 * cloud layer annotation reads. Page order matches the document's
 * page index.
 */
export interface AnnotationListSnapshotAllPages {
  pages: AnnotationListPageSnapshot[];
}

/**
 * Single-page raw or full read response. Returned by
 * `PageAnnotationsService.list()` and over the wire as the
 * `GET /v1/docs/:id/layers/:layer/pages/:pageObjectNumber/.../annotations` body.
 *
 * `pageState` carries the revision token clients must hand back when
 * referring to weak annotations on this page; `annotations` is the
 * discriminated union of per-subtype DTOs in display order.
 */
export interface AnnotationListPageSnapshot {
  pageState: PageState;
  annotations: AnnotationDTO[];
}
