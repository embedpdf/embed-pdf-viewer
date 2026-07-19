import type { AnnotationListMutationMeta } from './AnnotationListMutationMeta';
import type { AnnotationDTO } from '../annotation/kinds';
import type { AnnotationStableId } from '../identity/AnnotationStableId';

/**
 * Created annotation, fully materialised. The new annotation always has
 * `identityQuality === 'durable'` because the engine uses the
 * `EPDFPage_CreateAnnot` fork helper (which creates an indirect PDF
 * object) and reads it back via `EPDFPage_GetAnnotByObjectNumber`.
 */
export interface AnnotationCreateResult {
  created: AnnotationDTO;
  meta: AnnotationListMutationMeta;
}

export interface AnnotationUpdateResult {
  /**
   * The updated annotation, fully materialised after the patch.
   *
   * Note: `updated.ref` may be **stronger** than the input ref. If the
   * caller updated by `kind: 'index'` against a weak annotation (no /NM,
   * no indirect object number), the engine stamps a fresh
   * engine-generated UUID v4 as /NM during the update. The returned ref
   * will then be `kind: 'nm'`. This is non-structural (no revision bump,
   * no `shouldRefetch`); use `meta.changed[0]` (or `updated.ref`) to
   * update cache keys.
   *
   * /NM is monotonic per annotation:
   *   - if the annotation is already durable (has /NM or has objectNumber),
   *     the engine NEVER touches /NM during update;
   *   - if the annotation is weak, the engine always stamps a UUID v4.
   *
   * The /NM value is opaque to the engine. Callers that need a specific
   * id for tenant-side bookkeeping should set `draft.nm` at creation
   * time (the only place caller-supplied identity is accepted), or
   * maintain a Map<engine-id, tenant-id> on their side. There is
   * intentionally no `patch.nm` — a stable id that callers can rename
   * mid-session is not stable.
   */
  updated: AnnotationDTO;
  meta: AnnotationListMutationMeta;
}

export interface AnnotationDeleteResult {
  /**
   * Stable id of the annotation that was deleted. `null` for a weak
   * annotation (no objectNumber, no /NM): the engine refuses to fabricate
   * a stable id at delete time, so callers that targeted by index
   * receive `null` and must fall back to refetching the page list.
   */
  deleted: AnnotationStableId | null;
  meta: AnnotationListMutationMeta;
}

/**
 * Batch annotation move (contiguous-block semantics; symmetric with
 * `pages.move`). The single-annotation case is `move([ref], toIndex)`.
 *
 * Note on identity: any weak ref in the batch is opportunistically
 * upgraded to `kind: 'nm'` with an engine-stamped UUID v4 BEFORE the
 * move happens, mirroring `update()`. So `moved[i].ref` may be stronger
 * than the corresponding input ref. Each `moved[i].index` reflects the
 * post-move index, which is exactly `toIndex + i`.
 *
 * Move is structural for the per-page index space — bumps the page
 * revision once per batch, and `meta.shouldRefetch` is set iff the prior
 * `weakAnnotationState` was known to contain weak annotations.
 */
export interface AnnotationMoveResult {
  /**
   * The moved annotations in their **new order**. `length === refs.length`.
   * `moved[i]` is the post-move DTO of `refs[i]`, and lives at index
   * `toIndex + i` in the page's /Annots array.
   */
  moved: AnnotationDTO[];
  /**
   * One structural envelope per batch. ONE revision bump, one impact
   * computation, regardless of `refs.length`. `meta.changed` lists the
   * stable IDs of every moved annotation, in caller order.
   */
  meta: AnnotationListMutationMeta;
}
