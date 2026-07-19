import type { AbortablePromise } from '../promise/AbortablePromise';
import type { SearchRequest, SearchSlice } from '../search/types';

/**
 * Document-scoped text search, exposed via `DocumentHandle.search`.
 *
 * The contract is a client-driven cursor loop over bounded slices: each
 * `query()` call scans at most a budgeted amount of work (pages/matches)
 * and returns what it found plus a resume cursor. There is no job to
 * start or cancel — a 40K-page document is searched by asking for slices
 * until `nextCursor` is null or the user stops caring. Engines clamp the
 * requested budget to their own ceilings, so no single call can hold a
 * worker (or the server) for minutes.
 *
 * Reads are gated by `doc.text.search`; `mode: 'full'` (snippets) also
 * requires `doc.text.copy` — see {@link SearchMode}. Results always
 * reflect the CURRENT layer view: text removed by redaction in this
 * layer is unfindable, and a cursor issued before a content mutation is
 * rejected rather than resumed over stale pages.
 *
 * Matches carry merged line rects from the same line-merge as text
 * selection (never per-glyph boxes) and text-page character offsets that
 * join the selection/geometry subsystem directly.
 */
export interface DocumentSearchService {
  query(request: SearchRequest): AbortablePromise<SearchSlice>;
}
