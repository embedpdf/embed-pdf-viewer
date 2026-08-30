import type { AnnotationDTO } from './kinds';
import type { PageState } from '../revision/PageState';

/**
 * Whole-document raw read response. Returned by
 * `DocumentAnnotationsService.listRawAll()` and over the wire as the
 * cloud layer annotation reads.
 *
 * One entry per page. ORDER IS UNSPECIFIED — the local engine serves
 * document order while the cloud engine serves manifest (pageObjectNumber
 * registry) order; join `pageState.pageObjectNumber` against
 * `pages.list()` when display order matters.
 */
export interface AnnotationListSnapshotAllPages {
  pages: AnnotationListPageSnapshot[];
  /**
   * Audit-log position this snapshot is consistent with (cloud only;
   * absent locally, where no audit log exists). Every page reflects
   * exactly the mutations with `serverId <= auditHead` and none newer —
   * the reads are pinned to one manifest, whose `auditHead` is written in
   * the same transaction as its version bumps.
   *
   * This is the reconciliation cursor for consumers that keep a snapshot
   * fresh from `doc.events`: drop events with `origin.serverId <=
   * auditHead` (already inside the snapshot), apply the rest.
   */
  auditHead?: number;
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
