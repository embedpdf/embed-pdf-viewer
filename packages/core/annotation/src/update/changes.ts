/**
 * What every transition that changes records shares — the records it returns
 * become the message's change set: a new record and the draft it is written
 * from, a view-space gesture's commit, and removing records.
 */
import { annotationKey } from '@embedpdf/core';
import {
  ANNOTATION_FIELD_NAMES,
  type AnnotationDraft,
  type Annotation,
  type AnnotationFlags,
  type AnnotationRef,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import { anchoredGeom, anchorModeOf, unanchoredGeom, type ViewEnv } from '../anchor';
import { sourceOfNew } from '../appearance';
import { DRAWN_FLAGS } from '../flags';
import { annotationOfNew, shapeOf } from '../record';
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
 * The ref of the `offset`-th record a message creates: the object number the
 * session holds in that place (`Session.objectNumbers`), on `page`. Throws
 * when the session holds too few: the plugin hands it what a message needs
 * before it runs (`newRecordsAtMost`).
 */
const newRecordRef = (
  model: Model,
  page: PageRef,
  offset: number,
): Extract<AnnotationRef, { kind: 'objectNumber' }> => {
  const objectNumber = model.objectNumbers[offset - 1];
  if (objectNumber === undefined) {
    throw new Error('annotation-core: the session holds no object number for a new record');
  }
  return { kind: 'objectNumber', page, objectNumber };
};

/** The session's object numbers once a message created `count` records. */
export const numbersLeft = (model: Model, count: number): readonly number[] =>
  model.objectNumbers.slice(count);

/**
 * The draft a drawing creates, complete before its record is made: the
 * tool's `defaults` (the fields its kind has), the fields that state its
 * `shape`, what the drawing adds (`fields`: an intent, a measurement, first
 * text), and the flags a drawn annotation starts with (`print`, and the
 * tool's own). The view's record and the engine's create both come from
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

/** A record a message creates, and the draft it is written from. */
export interface NewRecord {
  readonly record: ModelAnnotation;
  readonly draft: AnnotationDraft;
}

/**
 * The `offset`-th record a message creates, from its `draft`: keyed by the
 * object number it takes (`newRecordRef`), holding the annotation the engine
 * will read back (`annotationOfNew`), and drawn as a new record is
 * (`sourceOfNew`). `reply` ties it to
 * the annotation it belongs to, which can be one the same message creates.
 */
export function newRecord(
  model: Model,
  page: PageRef,
  draft: AnnotationDraft,
  options: { offset?: number; reply?: NonNullable<Annotation['reply']> } = {},
): NewRecord {
  const offset = options.offset ?? 1;
  const ref = newRecordRef(model, page, offset);
  // The annotation it answers is the engine's to look up as it writes: read
  // without it, then stated.
  const read = annotationOfNew(draft, { ref });
  const annotation: Annotation = options.reply ? { ...read, reply: options.reply } : read;
  return {
    record: {
      id: annotationKey(ref),
      unconfirmed: true,
      source: sourceOfNew(annotation),
      annotation,
    },
    draft: options.reply ? ({ ...draft, reply: options.reply } as AnnotationDraft) : draft,
  };
}

/** The model without these records, and without any session reference to them. */
export function withoutRecords(model: Model, ids: readonly Id[]): Model {
  const gone = new Set(ids);
  const byId = { ...model.byId };
  for (const id of ids) delete byId[id];
  return forget({ ...model, byId, order: model.order.filter((id) => !gone.has(id)) }, ids);
}
