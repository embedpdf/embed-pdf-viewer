/**
 * Drive the core the way the plugin does: a model is a session composed with
 * the records it works on, and each message's change set is laid on top of
 * those records.
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { annotationOfRecord } from '../src/record';
import type { Effect, Message, Model, ModelAnnotation, Session, UpdateResult } from '../src/types';
import { initialModel, sameSession, update } from '../src/update';

/** A record's fields for a test, and any of its annotation's fields the test states. */
export type RecordInput = Omit<ModelAnnotation, 'annotation'> & {
  annotation?: Partial<AnnotationDTO>;
};

/**
 * A record as the plugin hands one to the core: its fields, and the
 * annotation they predict, with the annotation fields the test states laid
 * over it. A confirmed record keeps its ref; one not written yet is named by
 * its id.
 */
export function record(input: RecordInput): ModelAnnotation {
  const { annotation: stated, ...fields } = input;
  const ref = fields.ref ?? { kind: 'nm' as const, page: fields.page, nm: fields.id };
  const predicted = annotationOfRecord(fields, { ref, index: 0 });
  return { ...fields, annotation: { ...predicted, ...stated } as AnnotationDTO };
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
