import type { AnnotationListMutationMeta } from './AnnotationListMutationMeta';
import type { AppearanceOutcome } from '../annotation/appearance';
import type { Annotation } from '../annotation/kinds';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Created annotation, fully materialised. It is born as a PDF object, so
 * it is named by its object number.
 */
export interface AnnotationCreateResult<C extends Coordinates = PageCoordinates> {
  annotation: Annotation<C>;
  meta: AnnotationListMutationMeta;
}

export interface AnnotationUpdateResult<C extends Coordinates = PageCoordinates> {
  /**
   * The updated annotation, fully materialised after the patch, under the
   * name it had: an update never renames an annotation, and never writes
   * its /NM.
   *
   * The /NM value is data to the engine. Callers that keep their own id
   * in it set `draft.nm` at creation (a create refuses a name its page
   * already has) and find the annotation by it in a read. There is no
   * `patch.nm`.
   */
  annotation: Annotation<C>;
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

/**
 * A delete: nothing exists after it, so only `meta`. Deleting an annotation
 * deletes its replies, grouped parts, review states and popups with it;
 * `meta.changed` names them all, the annotation first.
 */
export interface AnnotationDeleteResult {
  meta: AnnotationListMutationMeta;
}

/**
 * What a delete removed, as its `annotations.deleted` event names it for
 * listeners that didn't make the call: the refs in `meta.changed`, the
 * annotation first.
 */
export function deletedAnnotationsOf(result: AnnotationDeleteResult): AnnotationRef[] {
  return result.meta.changed;
}

/**
 * Result of a stacking-order change (`page.annotations.reorder()`): the
 * page's annotations in their new paint order, whole, as refs (widgets
 * excepted: they paint above every annotation, in their own order). The
 * moved annotations keep their names and their data, so nothing else is
 * read back.
 */
export interface AnnotationReorderResult {
  /** Every annotation of the page, widgets excepted, bottom to top. */
  order: AnnotationRef[];
  /** `meta.changed` names the annotations that moved, in the order given. */
  meta: AnnotationListMutationMeta;
}
