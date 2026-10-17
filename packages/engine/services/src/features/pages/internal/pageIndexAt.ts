import { anchorOf, type PagePosition } from '@embedpdf/engine-core/runtime';

import type { DocumentSession } from '../../../document-session/DocumentSession';

/**
 * The page index `position` stands for, among `pageCount` pages: `'start'` is
 * 0, `'end'` is `pageCount`, and a neighbour is its own index (`before`) or
 * the next one (`after`). A neighbour that isn't a page of the document is
 * `NotFound`.
 */
export function pageIndexAt(
  session: DocumentSession,
  position: PagePosition,
  pageCount: number,
): number {
  if (position === 'start') return 0;
  if (position === 'end') return pageCount;
  const { pageIndex } = session.resolvePageRef(anchorOf(position)!);
  return 'before' in position ? pageIndex : pageIndex + 1;
}
