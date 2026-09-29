/**
 * What every transition that changes records shares — the records it returns
 * become the message's change set: the ids of new records, who owns the
 * appearance after an edit (live rendering, or the raster box following the
 * geometry), the effect a geometry commit emits, and removing records.
 */
import { annotationKey } from '@embedpdf/core';
import type { AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import { anchoredGeom, anchorModeOf, unanchoredGeom, type ViewEnv } from '../anchor';
import { capsFor } from '../kinds';
import { annotationOfRecord, type AnnotationPlace, fieldsOf, kindOf, recordOf } from '../record';
import type {
  ModelGeometry,
  Id,
  Model,
  ModelAnnotation,
  Point,
  Rect,
  RecordFields,
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
  if (!capsFor(kindOf(annotation.annotation)).opaqueBody) return toVector(annotation);
  const { geometry } = fieldsOf(annotation);
  return geometry.kind === 'box' ? { ...annotation, apBox: geometry.box } : annotation;
};

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
  op: (geometry: ModelGeometry) => ModelGeometry,
): ModelGeometry => {
  const mode = anchorModeOf(annotation);
  return unanchoredGeom(op(anchoredGeom(fieldsOf(annotation).geometry, mode, view)), mode, view);
};

export const geomEqual = (left: ModelGeometry, right: ModelGeometry): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * The ref the `offset`-th record a message creates is written under: its name
 * `<namePrefix><n>` on `page`, counted from the session's `seq`.
 */
export const newRecordRef = (
  model: Model,
  page: PageRef,
  offset = 1,
): Extract<AnnotationRef, { kind: 'nm' }> => ({
  kind: 'nm',
  page,
  nm: `${model.namePrefix}${model.seq + offset}`,
});

/** The key of the `offset`-th record a message creates on `page`: its `nm` ref's. */
export const newRecordId = (model: Model, page: PageRef, offset = 1): Id =>
  annotationKey(newRecordRef(model, page, offset));

/**
 * The fields a new record is made from: everything but what `newRecord` gives
 * it (its key, ref and relationships — `reply` states the one it answers).
 */
export type NewRecordFields = Omit<RecordFields, 'id' | 'ref' | 'source' | 'irt' | 'group'>;

/**
 * The `offset`-th record a message creates: keyed by the `nm` ref it will be
 * written under, drawn live, and holding the annotation its fields predict,
 * appended after the page's other records. `reply` ties it to the annotation
 * it belongs to.
 */
export function newRecord(
  model: Model,
  fields: NewRecordFields,
  options: { offset?: number; reply?: AnnotationPlace['reply'] } = {},
): ModelAnnotation {
  const offset = options.offset ?? 1;
  const page = fields.page;
  const ref = newRecordRef(model, page, offset);
  const record: RecordFields = {
    ...fields,
    id: annotationKey(ref),
    ref: null,
    source: 'vector',
  };
  const onPage = model.order.filter(
    (id) => model.byId[id]?.annotation.page.pageObjectNumber === page.pageObjectNumber,
  ).length;
  const annotation = annotationOfRecord(record, {
    ref,
    index: onPage + offset - 1,
    ...(options.reply ? { reply: options.reply } : {}),
  });
  return recordOf(record, annotation);
}

/** The model without these records, and without any session reference to them. */
export function withoutRecords(model: Model, ids: readonly Id[]): Model {
  const gone = new Set(ids);
  const byId = { ...model.byId };
  for (const id of ids) delete byId[id];
  return forget({ ...model, byId, order: model.order.filter((id) => !gone.has(id)) }, ids);
}
