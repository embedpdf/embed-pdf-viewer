import type {
  AnnotationListMutationMeta,
  AnnotationStableId,
  PageState,
} from '@embedpdf/engine-core/runtime';
import {
  invalidatesWeakIndexRefs,
  shiftsExistingAnnotationIndices,
  type AnnotationMutationKind,
} from '@embedpdf/engine-core/runtime';

/**
 * The kind of mutation that just happened on a page.
 *
 * Index-space behaviour drives whether weak (`kind: 'index'`) refs
 * the client may be holding stay valid:
 *
 *   - `update` does not touch the /Annots array at all.
 *   - `create` is append-only — the new annotation lands at
 *     `index = previousCount`, so no existing index ever shifts.
 *     The array grows, but every pre-existing weak ref still points
 *     at the same physical annotation.
 *   - `delete` removes an entry and shifts every later index down by
 *     one. Pre-existing weak refs at or after the removed index are
 *     now off-by-one and stale.
 *   - `move` detaches a contiguous block and re-inserts it, rewriting
 *     indices on both ends of the gap. Existing weak refs across that
 *     range are stale.
 *
 * So the doctrine for `MutationKind` is: only `delete` and `move`
 * actually invalidate weak refs. `update` and `create` leave them
 * alone. (A future explicit-position `createAt(index)` API would
 * shift indices >= toIndex and would join the structural cohort —
 * see `MutationKind` extension note in `compute()` below.)
 */
export type MutationKind = AnnotationMutationKind;

/**
 * Inputs that decide whether a mutation should make a client refetch.
 *
 *   `pageStateBefore` is captured BEFORE the mutation. Its known
 *   `weakAnnotationState` drives the locked rule:
 *     index-shifting mutation × any weak annotation on the page  ⇒  refetch.
 *
 *   `pageStateAfter` is captured AFTER the mutation. It carries the
 *   bumped revision token (for index-shifting ops) and the recomputed
 *   weak-annotation state (for any op that might have changed it, e.g.
 *   opportunistic /NM stamping during update).
 *
 *   `changed` is the list of stable ids the mutation actually touched.
 *   Empty for a weak delete (we have no durable id to report).
 */
export interface ImpactInputs {
  mutation: MutationKind;
  pageStateBefore: PageState;
  pageStateAfter: PageState;
  changed: AnnotationStableId[];
}

/**
 * Pure helper: turn a mutation outcome into the side-effect envelope
 * every result type carries on its `meta` field.
 *
 * The rules — locked with the user, do not change without re-reading
 * the doc comment on `AnnotationListMutationMeta` and the
 * `MutationKind` definition above:
 *
 *   1. `update` and `create` are non-invalidating.
 *
 *      - `update` doesn't touch the /Annots array; indices on the page
 *        do not move, so weak refs the client may be holding stay
 *        valid. Opportunistic /NM stamping during an update is also
 *        non-structural — it changes the annotation's identity quality
 *        but not its position.
 *
 *      - `create` is append-only. The new annotation goes at
 *        `index = previousCount`, so no existing index shifts and no
 *        pre-existing weak ref ever becomes stale. We treat `create`
 *        the same as `update` for impact purposes: no revision bump,
 *        `weakRefsInvalidated = false`, `shouldRefetch = null`.
 *
 *        The "revisions exist solely for weak-ref authentication"
 *        doctrine (see `pages.move()`'s identical reasoning) means we
 *        deliberately do NOT bump on `create` — bumping a revision
 *        that nobody's weak ref depends on would erode the invariant
 *        and turn revisions into a generic "something changed" signal.
 *
 *   2. `delete` and `move` ARE index-shifting. They genuinely move
 *      pre-existing indices:
 *        - `delete` removes an annotation, shifting every later index
 *          down by one.
 *        - `move` detaches a contiguous block and re-inserts it
 *          elsewhere, rewriting indices on both ends of the gap.
 *      They invalidate weak refs iff the page actually had any weak
 *      refs *before* the mutation — if every annotation already had a
 *      durable identity, no client could possibly be holding a stale
 *      index, and we keep `shouldRefetch = null`.
 *
 *      (`move` opportunistically stamps /NM on weak refs in the batch
 *      BEFORE the move, so the annotations actually being moved end up
 *      durable on the way out; but other weak annotations on the page
 *      still need a refetch.)
 *
 *   3. When rule (2) fires, the reason is always `'weakRefsInvalidated'`.
 *      `'pageRebuilt'` and `'externalChange'` are reserved for higher-
 *      level signals the engine doesn't emit yet (insert/delete-page
 *      that rebuilds /Annots, watch-based refresh). Page **reorder**
 *      explicitly does NOT bump per-page revisions and does NOT emit
 *      `pageRebuilt` — see `PagesMutator`.
 *
 *   Future note: when an explicit-position `createAt(index)` API
 *   ships, add `'createAt'` to `MutationKind` and slot it into rule
 *   (2) — it shifts every index >= toIndex and is structural in the
 *   same way `delete` and `move` are.
 */
export function computeMutationImpact(inputs: ImpactInputs): AnnotationListMutationMeta {
  const { mutation, pageStateBefore, pageStateAfter, changed } = inputs;

  if (!shiftsExistingAnnotationIndices(mutation)) {
    return {
      affectedPages: [pageStateAfter],
      cacheDelta: null,
      changed,
      weakRefsInvalidated: false,
      shouldRefetch: null,
    };
  }

  // delete / move: index-shifting.
  const weakRefsInvalidated = invalidatesWeakIndexRefs(
    mutation,
    pageStateBefore.weakAnnotationState,
  );
  return {
    affectedPages: [pageStateAfter],
    cacheDelta: null,
    changed,
    weakRefsInvalidated,
    shouldRefetch: weakRefsInvalidated ? { reason: 'weakRefsInvalidated' } : null,
  };
}
