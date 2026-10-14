/**
 * A page argument as plugins take it, a `PageRef` or a zero-based index into
 * the document's page list (display order), looked up two ways. A read asks
 * {@link findPage} and gets null for a page that isn't there: reads run while
 * rendering, and a page deleted mid-render must not break a layer. A verb asks
 * {@link pageOf}, which refuses with `not-found`.
 */
import { pageRefsEqual, type PageRef } from '@embedpdf/engine-core/runtime';

import { PluginError } from './errors';
import type { PageInfo } from './types';

/** What `ctx.getPage` reads: the page `page` names in `pages`, or null. */
export function findPage(pages: readonly PageInfo[], page: PageRef | number): PageInfo | null {
  if (typeof page === 'number') return pages[page] ?? null;
  return pages.find((pageInfo) => pageRefsEqual(pageInfo.ref, page)) ?? null;
}

/** What `ctx.pageOf` resolves: the page `page` names in `pages`. Throws `not-found` when there is none. */
export function pageOf(
  pages: readonly PageInfo[],
  page: PageRef | number,
  capability: string,
): PageInfo {
  const found = findPage(pages, page);
  if (found) return found;
  throw new PluginError(
    'not-found',
    capability,
    typeof page === 'number'
      ? `there is no page ${page} in this document`
      : `page ${page.objectNumber} is not in this document`,
  );
}
