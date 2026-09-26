/**
 * What every transition that changes records shares — the records it returns
 * become the message's change set: the ids of new records, who owns the
 * appearance after an edit (live rendering, or the raster box following the
 * geometry), the effect a geometry commit emits, and removing records.
 */
import { anchoredGeom, anchorModeOf, unanchoredGeom, type ViewEnv } from '../anchor';
import { capsFor } from '../kinds';
import type {
  ContentGeometry,
  Effect,
  Id,
  Model,
  ModelAnnotation,
  Point,
  Rect,
  Subtype,
} from '../types';
import { forget } from './session';

export const isPolySubtype = (subtype: Subtype): subtype is 'polygon' | 'polyline' =>
  subtype === 'polygon' || subtype === 'polyline';

/** Flip an annotation to live (vector) rendering — we now own its appearance, so
 *  the engine's baked AP is no longer authoritative. Idempotent. */
export const toVector = (annotation: ModelAnnotation): ModelAnnotation =>
  annotation.source === 'vector' ? annotation : { ...annotation, source: 'vector' };

/**
 * Take ownership of the appearance after a geometry edit. Vector kinds flip to
 * live rendering; `opaqueBody` kinds (stamp images) have no vector render — they
 * stay `baked`, with the raster box following the committed geometry (the bitmap
 * shows stretched until the engine's natively re-fit appearance arrives with the
 * DTO sync). Call with the new geometry already applied.
 */
export const ownGeometry = (annotation: ModelAnnotation): ModelAnnotation => {
  if (!capsFor(annotation.subtype).opaqueBody) return toVector(annotation);
  return 'rect' in annotation.geometry
    ? { ...annotation, apBox: annotation.geometry.rect }
    : annotation;
};

/** The patch effect for a committed geometry edit. */
export const geometryPatch = (id: Id): Effect => ({
  type: 'patch',
  id,
  scope: { kind: 'geometry' },
});

export const sub = (from: Point, to: Point): Point => ({ x: from.x - to.x, y: from.y - to.y });

export const translateRect = (rect: Rect, point: Point): Rect => ({
  ...rect,
  x: rect.x + point.x,
  y: rect.y + point.y,
});

/**
 * Commit a view-space gesture result for one annotation: apply `op` to the
 * projected geometry (the identity for un-flagged annotations — `op` then
 * simply runs on the stored geom) and map the result back to stored space
 * through `unanchoredGeom`. The exact composition `effGeom` previewed, so a
 * released gesture commits what it showed — for screen-anchored and plain
 * annotations alike, through one code path.
 */
export const commitViewGesture = (
  annotation: ModelAnnotation,
  view: ViewEnv | undefined,
  op: (geometry: ContentGeometry) => ContentGeometry,
): ContentGeometry => {
  const mode = anchorModeOf(annotation);
  return unanchoredGeom(op(anchoredGeom(annotation.geometry, mode, view)), mode, view);
};

export const geomEqual = (left: ContentGeometry, right: ContentGeometry): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** The id of the `offset`-th record a message creates (`new:<n>`), counted from the session's `seq`. */
export const newRecordId = (model: Model, offset = 1): Id => `new:${model.seq + offset}`;

/** The model without these records, and without any session reference to them. */
export function withoutRecords(model: Model, ids: readonly Id[]): Model {
  const gone = new Set(ids);
  const byId = { ...model.byId };
  for (const id of ids) delete byId[id];
  return forget({ ...model, byId, order: model.order.filter((id) => !gone.has(id)) }, ids);
}
