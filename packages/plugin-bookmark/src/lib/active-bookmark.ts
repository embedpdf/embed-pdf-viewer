import { PdfActionType, PdfBookmarkObject, PdfDestinationObject } from '@embedpdf/models';

/**
 * Resolve the navigable destination a bookmark points to.
 *
 * Handles both direct `destination` targets and `Goto`/`RemoteGoto` actions.
 * Returns `undefined` for bookmarks with no navigable page (URI actions,
 * unsupported/launch actions, or header nodes with no target).
 */
export function resolveBookmarkDestination(
  bookmark: PdfBookmarkObject,
): PdfDestinationObject | undefined {
  const target = bookmark.target;
  if (!target) return undefined;

  if (target.type === 'destination') {
    return target.destination;
  }

  if (target.type === 'action') {
    const { action } = target;
    if (action.type === PdfActionType.Goto || action.type === PdfActionType.RemoteGoto) {
      return action.destination;
    }
  }

  return undefined;
}

/**
 * The 0-based page index a bookmark targets, or `undefined` when it has no
 * navigable page.
 */
export function resolveBookmarkPageIndex(bookmark: PdfBookmarkObject): number | undefined {
  return resolveBookmarkDestination(bookmark)?.pageIndex;
}

/**
 * Find the "active" bookmark for a given 0-based reading page.
 *
 * Uses the deepest-heading-≤-page rule: walk the tree in document (pre-order)
 * order and return the path of the last bookmark whose resolved page index is
 * ≤ `currentPageIndex`. On a tie, the later entry in document order wins.
 * Returns `null` when the page precedes every targeted bookmark.
 *
 * The returned path is the list of child indices from the root to the active
 * node (e.g. `[1, 0]` = first child of the second top-level bookmark).
 */
export function getActiveBookmarkPath(
  bookmarks: PdfBookmarkObject[],
  currentPageIndex: number,
): number[] | null {
  let bestPath: number[] | null = null;

  const walk = (nodes: PdfBookmarkObject[], prefix: number[]): void => {
    nodes.forEach((node, index) => {
      const path = [...prefix, index];
      const pageIndex = resolveBookmarkPageIndex(node);
      if (pageIndex !== undefined && pageIndex <= currentPageIndex) {
        bestPath = path;
      }
      if (node.children && node.children.length > 0) {
        walk(node.children, path);
      }
    });
  };

  walk(bookmarks, []);
  return bestPath;
}
