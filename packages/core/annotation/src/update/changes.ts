/**
 * What every transition that changes records shares — the records it returns
 * become the message's change set: a new record and the draft it is written
 * from, a view-space gesture's commit, and removing records.
 */
import { annotationKey } from '@embedpdf/core';
import {
  ANNOTATION_FIELD_NAMES,
  annotationOfDraft,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationFlags,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import { anchoredGeom, anchorModeOf, unanchoredGeom, type ViewEnv } from '../anchor';
import { sourceOfNew } from '../appearance';
import { DRAWN_FLAGS } from '../flags';
import { geomVisualBounds } from '../geometry';
import { shapeOf, styleOf } from '../record';
import { engineSubtypeOf } from '../record/defaults';
import { familyOf } from '../shapes';
import type { FieldValues, Shape, Id, Model, ModelAnnotation, Point, KindName } from '../types';
import { forget } from './session';

export const isPolySubtype = (subtype: KindName): subtype is 'polygon' | 'polyline' =>
  subtype === 'polygon' || subtype === 'polyline';

export const sub = (from: Point, to: Point): Point => ({ x: from.x - to.x, y: from.y - to.y });

/**
 * Commit a view-space gesture result for one annotation: apply `op` to the
 * projected geometry (the identity for un-flagged annotations — `op` then
 * simply runs on the stored geom) and map the result back to stored space
 * through `unanchoredGeom`. The exact composition `effGeom` previewed, so a
 * released gesture commits what it showed — for screen-anchored and plain
 * annotations alike, through one code path.
 */
export const commitViewGesture = (
  record: ModelAnnotation,
  view: ViewEnv | undefined,
  op: (geometry: Shape) => Shape,
): Shape => {
  const mode = anchorModeOf(record);
  return unanchoredGeom(op(anchoredGeom(shapeOf(record.annotation), mode, view)), mode, view);
};

export const geomEqual = (left: Shape, right: Shape): boolean =>
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
 * The draft a drawing creates, complete before anything is predicted: the
 * tool's `defaults` (the fields its kind has), the fields that state its
 * `shape`, what the drawing adds (`fields`: an intent, a measurement, first
 * text), and the flags a drawn annotation starts with (`print`, and the
 * tool's own). The view's prediction and the engine's create both come from
 * it.
 */
export function draftOf(
  kind: string,
  defaults: FieldValues,
  shape: Shape,
  fields: FieldValues = {},
  flags: Partial<AnnotationFlags> = {},
): AnnotationDraft {
  const subtype = engineSubtypeOf(kind);
  const declared = ANNOTATION_FIELD_NAMES[subtype];
  const own = Object.fromEntries(
    Object.entries(defaults).filter(([name]) => declared.includes(name)),
  );
  return {
    ...own,
    ...familyOf(shape).write(shape, subtype),
    ...fields,
    ...DRAWN_FLAGS,
    ...flags,
    subtype,
  } as unknown as AnnotationDraft;
}

/** A record a message creates, and the draft it is written from, named as the record is keyed. */
export interface NewRecord {
  readonly record: ModelAnnotation;
  readonly draft: AnnotationDraft;
}

/**
 * The `offset`-th record a message creates, from its `draft`: named by the
 * `nm` it will be written under (its key), holding the annotation the engine
 * will read back, appended after the page's other records, and drawn as a
 * new record is (`sourceOfNew`). A kind whose `rect` the engine works out
 * from its drawing gets the drawn bounds. `reply` ties it to the annotation
 * it belongs to; the write states it once that one has a ref.
 */
export function newRecord(
  model: Model,
  page: PageRef,
  draft: AnnotationDraft,
  options: { offset?: number; reply?: NonNullable<AnnotationDTO['reply']> } = {},
): NewRecord {
  const offset = options.offset ?? 1;
  const ref = newRecordRef(model, page, offset);
  const named = { ...draft, nm: ref.nm } as AnnotationDraft;
  const onPage = model.order.filter(
    (id) => model.byId[id]?.annotation.page.objectNumber === page.objectNumber,
  ).length;
  const read = annotationOfDraft(named, { ref, index: onPage + offset - 1 });
  const annotation: AnnotationDTO = {
    ...read,
    ...('rect' in draft ? {} : { rect: geomVisualBounds(shapeOf(read), styleOf(read)) }),
    ...(options.reply ? { reply: options.reply } : {}),
  } as AnnotationDTO;
  return {
    record: {
      id: annotationKey(ref),
      unconfirmed: true,
      source: sourceOfNew(annotation),
      annotation,
    },
    draft: named,
  };
}

/** The model without these records, and without any session reference to them. */
export function withoutRecords(model: Model, ids: readonly Id[]): Model {
  const gone = new Set(ids);
  const byId = { ...model.byId };
  for (const id of ids) delete byId[id];
  return forget({ ...model, byId, order: model.order.filter((id) => !gone.has(id)) }, ids);
}
