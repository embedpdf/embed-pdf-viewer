/**
 * Drive the core the way the plugin does: a model is a session composed with
 * the records it works on, and each message's change set is laid on top of
 * those records.
 */
import { annotationKey } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import { annotationOfRecord, recordOf } from '../src/record';
import type {
  Effect,
  FieldValues,
  Id,
  Message,
  Model,
  ModelAnnotation,
  RecordFields,
  Session,
  Style,
  UpdateResult,
} from '../src/types';
import { initialModel, sameSession, update } from '../src/update';

/**
 * A record's fields for a test, and any of its annotation's fields the test
 * states. The annotations it answers are the annotation's (`answering`).
 */
export type RecordInput = Omit<RecordFields, 'annotation' | 'irt' | 'group'> & {
  annotation?: Partial<AnnotationDTO>;
};

/**
 * The key and ref of a confirmed test record named `name` on `page`: keyed as
 * the engine keys it, so the records that answer it find it.
 */
export function named(name: string, page: PageRef): { id: Id; ref: AnnotationRef } {
  const ref: AnnotationRef = { kind: 'nm', page, nm: name };
  return { id: annotationKey(ref), ref };
}

/** The annotation fields of one answering `parent`: a comment reply, or a `/RT /Group` member. */
export const answering = (
  parent: AnnotationRef,
  type: 'reply' | 'group' = 'reply',
): Partial<AnnotationDTO> => ({ reply: { to: parent, type } });

/**
 * A record as the plugin hands one to the core: its fields, and the
 * annotation they predict, with the annotation fields the test states laid
 * over it. A measurement's stated label stands where the engine can't work
 * one out (no scale), as a file's stored label does. A confirmed record keeps
 * its ref; one not written yet is named by its id.
 */
export function record(input: RecordInput): ModelAnnotation {
  const { annotation: stated, ...fields } = input;
  const ref = fields.ref ?? { kind: 'nm' as const, page: fields.page, nm: fields.id };
  const predicted = annotationOfRecord(fields, { ref, index: 0 });
  const label =
    fields.measure?.contents && !predicted.contents ? { contents: fields.measure.contents } : {};
  return recordOf(fields, { ...predicted, ...label, ...stated } as AnnotationDTO);
}

/** A model over these records (in this order), with an optional session on top of the initial one. */
export const modelWith = (
  records: readonly ModelAnnotation[],
  session: Partial<Session> = {},
): Model => ({
  ...initialModel,
  ...session,
  byId: Object.fromEntries(records.map((record) => [record.id, record])),
  order: records.map((record) => record.id),
});

/** The model after a result: its session, and its change set laid on the records. */
export function apply(model: Model, result: UpdateResult): Model {
  const { put, drop } = result.change;
  if (!put.length && !drop.length && sameSession(model, result.session)) return model;
  const byId = { ...model.byId };
  for (const id of drop) delete byId[id];
  for (const record of put) byId[record.id] = record;
  const added = put.map((record) => record.id).filter((id) => !(id in model.byId));
  const order = [...model.order.filter((id) => id in byId), ...added];
  return { ...result.session, byId, order };
}

/** One message, applied: the next model and the effects it asked for. */
export function step(model: Model, message: Message): [Model, Effect[]] {
  const result = update(model, message);
  return [apply(model, result), [...result.effects]];
}

/** Several messages, applied in order. */
export const run = (model: Model, messages: readonly Message[]): Model =>
  messages.reduce((current, message) => step(current, message)[0], model);

/**
 * `value` with every number rounded to `digits` decimals: for comparing
 * geometry that took a round trip through the engine's fields, where a turn
 * and its undoing can move the last digit.
 */
export function rounded<T>(value: T, digits = 9): T {
  if (typeof value === 'number') return Number(value.toFixed(digits)) as T;
  if (Array.isArray(value)) return value.map((item) => rounded(item, digits)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, rounded(item, digits)]),
    ) as T;
  }
  return value;
}

/**
 * A measurement without its label: the label is worked out from the points
 * and the scale, so a test that states an appearance compares the rest.
 */
export function withoutLabel<M extends { contents?: string | null }>(
  measure: M | undefined,
): Omit<M, 'contents'> | undefined {
  if (!measure) return measure;
  const { contents: _label, ...rest } = measure;
  return rest;
}

/** A plain style for fixtures: red, two points wide. */
export const STYLE: Style = {
  color: '#e5484d',
  interiorColor: null,
  strokeWidth: 2,
  opacity: 1,
  blendMode: 'normal',
  borderStyle: 'solid',
  dashArray: null,
  cloudyIntensity: null,
};

/** A sidebar edit of the selection: the same fields for every selected record. */
export const restyle = (model: Model, patch: FieldValues): Message => ({
  type: 'setFields',
  patches: Object.fromEntries(model.selected.map((id) => [id, patch])),
});
