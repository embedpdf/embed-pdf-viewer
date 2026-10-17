/**
 * A search engine for the search tests: pages 5 and 7, where a search finds two upright matches
 * on page 5, then a slanted one on page 7.
 */
import { toPageRef } from '@embedpdf/core';
import type { DocumentHandle, Engine } from '@embedpdf/core';
import { pageLayout } from './fixtures';

/**
 * A match on one line, in page space: upright, or slanted (its right end 5 points higher),
 * which the layer draws as a polygon instead of a box.
 */
const match = (objectNumber: number, start: number, slant = 0) => ({
  page: toPageRef(objectNumber),
  start,
  count: 4,
  segments: [
    {
      quad: {
        upperLeft: { x: 30, y: 40 + start },
        upperRight: { x: 50, y: 40 + start - slant },
        lowerLeft: { x: 30, y: 50 + start },
        lowerRight: { x: 50, y: 50 + start - slant },
      },
      rect: { x: 30, y: 40 + start - slant, width: 20, height: 10 + slant },
      advance: 1 as const,
    },
  ],
});

/** Pages 5 and 7; a search finds two upright matches on page 5, then a slanted one on page 7. */
export function searchEngine(): Engine {
  const slices = () => [
    { matches: [match(5, 0), match(5, 9)], nextCursor: 'c1', pagesSearched: 1, pageCount: 2 },
    { matches: [match(7, 2, 5)], nextCursor: null, pagesSearched: 2, pageCount: 2 },
  ];
  let script = slices();
  const handle = {
    id: 'doc',
    events: { subscribe: () => () => {}, lastServerId: () => null },
    pages: {
      list: () => Promise.resolve({ pageCount: 2, pages: [pageLayout(5, 0), pageLayout(7, 1)] }),
    },
    security: { allows: () => true },
    search: {
      query: (request: { cursor?: string }) => {
        if (request.cursor === undefined) script = slices();
        return Promise.resolve(script.shift());
      },
    },
    // Calls' facts and working sets change nothing here: the same document.
    with() {
      return this;
    },
    setWorkingSet: () => {},
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  return {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
}
