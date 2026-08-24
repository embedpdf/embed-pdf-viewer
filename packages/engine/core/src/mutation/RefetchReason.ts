/**
 * Why a mutation invalidates the previously returned snapshot. Surfaced on
 * `AnnotationListMutationMeta.shouldRefetch.reason` so clients can render
 * the right UX (silent refresh vs. visible "list changed").
 */
export type RefetchReason =
  /** Indices on the affected page changed; weak refs are stale. */
  | 'weakRefsInvalidated'
  /** Server-side change unrelated to this mutation (e.g. another writer). */
  | 'externalChange'
  /** Page was rebuilt (insert/delete/reorder). */
  | 'pageRebuilt';
