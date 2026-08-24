import type { PageLayout } from './PageLayout';

/**
 * Read-only snapshot of every page in the open document, ordered by the
 * page's current display `index`. Returned by `pages.list()`.
 *
 * This is a GEOMETRY view: each `PageLayout` carries size, rotation,
 * label, userUnit, and the raw PDF boxes — the things a developer expects
 * when listing pages. It deliberately carries NO annotation liveness
 * (`revision`, `weakAnnotationState`); that lives on annotation reads
 * (`AnnotationListSnapshot.pageState`) and inside the cloud manifest,
 * because it changes on a different (annotation) cadence and is joined back
 * by `pageObjectNumber`.
 *
 * The container name is kept (consistent with the other `*Snapshot` read
 * DTOs); only the element type changed from a liveness envelope to
 * `PageLayout`.
 */
export interface PageListSnapshot {
  pageCount: number;
  pages: PageLayout[];
}
