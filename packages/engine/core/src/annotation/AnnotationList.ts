import type { AnnotationDTO } from './kinds';
import type { PageRef } from '../identity/PageRef';
import type { PageState } from '../revision/PageState';

/**
 * What `doc.annotations.list()` and `page.annotations.list()` return, and
 * what the server's annotation list endpoints send: the annotations of the
 * listed pages, each page's in display order, and the state of each listed
 * page (its `revision` goes back with weak refs). Every annotation names its
 * `page`.
 *
 * A whole-document list's page order is unspecified — the local engine
 * reads in document order, the cloud in its page registry's order; join
 * `pages[i].page` against `pages.list()` (by ref) when display order matters.
 */
export interface AnnotationList {
  annotations: AnnotationDTO[];
  pages: PageState[];
  /**
   * Cloud, whole document only: the audit-log position the list is
   * consistent with. Every page reflects exactly the mutations with
   * `serverId <= auditHead` and none newer — the read is pinned to one
   * manifest, whose `auditHead` is written in the same transaction as its
   * version bumps.
   *
   * This is the reconciliation cursor for consumers that keep a list fresh
   * from `doc.events`: drop events with `origin.serverId <= auditHead`
   * (already inside the list), apply the rest.
   */
  auditHead?: number;
}

/** Which pages `doc.annotations.list()` reads. */
export interface AnnotationListOptions {
  /** The pages to list, in the order to list them. Every page when omitted. */
  pages?: readonly PageRef[];
}

/** Lists of different pages as one, in their order. */
export function concatAnnotationLists(lists: readonly AnnotationList[]): AnnotationList {
  return {
    annotations: lists.flatMap((list) => list.annotations),
    pages: lists.flatMap((list) => list.pages),
  };
}
