import type { AnnotationListMutationMeta } from './AnnotationListMutationMeta';
import type { AppearanceOutcome } from '../annotation/appearance';
import type { AnnotationDTO } from '../annotation/kinds';
import type { AnnotationStableId } from '../identity/AnnotationStableId';

/**
 * Created annotation, fully materialised. The new annotation always has
 * `identityQuality === 'durable'` because the engine uses the
 * `EPDFPage_CreateAnnot` fork helper (which creates an indirect PDF
 * object) and reads it back via `EPDFPage_GetAnnotByObjectNumber`.
 */
export interface AnnotationCreateResult {
  annotation: AnnotationDTO;
  meta: AnnotationListMutationMeta;
}

export interface AnnotationUpdateResult {
  /**
   * The updated annotation, fully materialised after the patch.
   *
   * Note: `annotation.ref` may be **stronger** than the input ref. If the
   * caller updated by `kind: 'index'` against a weak annotation (no /NM,
   * no indirect object number), the engine stamps a fresh
   * engine-generated UUID v4 as /NM during the update. The returned ref
   * will then be `kind: 'nm'`. This is non-structural (no revision bump,
   * no `shouldRefetch`); use `meta.changed[0]` (or `annotation.ref`) to
   * update cache keys.
   *
   * /NM is monotonic per annotation:
   *   - if the annotation is already durable (has /NM or has objectNumber),
   *     the engine never touches /NM during update;
   *   - if the annotation is weak, the engine always stamps a UUID v4.
   *
   * The /NM value is opaque to the engine. Callers that need a specific
   * id for tenant-side bookkeeping should set `draft.nm` at creation
   * time (the only place caller-supplied identity is accepted), or
   * maintain a Map<engine-id, tenant-id> on their side. There is
   * intentionally no `patch.nm` — a stable id that callers can rename
   * mid-session is not stable.
   */
  annotation: AnnotationDTO;
  /**
   * The engine's appearance verdict for this update (see
   * {@link AppearanceOutcome}). Clients drive raster invalidation off
   * `appearance.changed` — never off the shape of the patch they sent: the
   * engine value-diffs and verifies, so a full-object patch that only moved
   * the annotation still reports `preserved`.
   */
  appearance: AppearanceOutcome;
  meta: AnnotationListMutationMeta;
}

/** A delete: nothing exists after it, so only `meta`. */
export interface AnnotationDeleteResult {
  meta: AnnotationListMutationMeta;
}

/**
 * What a delete removed, as its `annotations.deleted` event names it for
 * listeners that didn't make the call: the stable id in `meta.changed`, or
 * `null` for a weak annotation (no objectNumber, no /NM), for which the
 * engine refuses to fabricate one — those listeners refetch the page list.
 */
export function deletedAnnotationOf(result: AnnotationDeleteResult): AnnotationStableId | null {
  return result.meta.changed[0] ?? null;
}

/**
 * Batch annotation move (contiguous-block semantics; symmetric with
 * `pages.move`). The single-annotation case is `move([ref], toIndex)`.
 *
 * Note on identity: any weak ref in the batch is opportunistically
 * upgraded to `kind: 'nm'` with an engine-stamped UUID v4 before the
 * move happens, mirroring `update()`. So `annotations[i].ref` may be
 * stronger than the corresponding input ref. Each `annotations[i].index`
 * reflects the post-move index, which is exactly `toIndex + i`.
 *
 * Move is structural for the per-page index space — bumps the page
 * revision once per batch, and `meta.shouldRefetch` is set iff the prior
 * `weakAnnotationState` was known to contain weak annotations.
 */
export interface AnnotationMoveResult {
  /**
   * The moved annotations in their **new order**. `length === refs.length`.
   * `annotations[i]` is the post-move DTO of `refs[i]`, and lives at index
   * `toIndex + i` in the page's /Annots array.
   */
  annotations: AnnotationDTO[];
  /**
   * One structural envelope per batch. One revision bump, one impact
   * computation, regardless of `refs.length`. `meta.changed` lists the
   * stable IDs of every moved annotation, in caller order.
   */
  meta: AnnotationListMutationMeta;
}
