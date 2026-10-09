/**
 * Drive the core the way the plugin does: a model is a session composed with
 * the records it works on, and each message's change set is laid on top of
 * those records.
 */
import { annotationKey } from '@embedpdf/core';
import {
  type Annotation,
  type AnnotationFlags,
  type AnnotationRef,
  type PageRef,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';

import { geomBounds } from '../src/geometry';
import { kindNamed } from '../src/kinds';
import { measurementDraftFields, type MeasurementAppearance } from '../src/measurement';
import { annotationOfNew, writableTarget } from '../src/record';
import { engineSubtypeOf } from '../src/record/defaults';
import type {
  Effect,
  FieldValues,
  Id,
  KindName,
  Message,
  Model,
  ModelAnnotation,
  Session,
  Shape,
  Style,
  TextStyle,
  UpdateResult,
} from '../src/types';
import { initialModel, newRecordsAtMost, sameSession, update } from '../src/update';
import { draftOf } from '../src/update/changes';

/**
 * A test record, described as a drawing states one: its kind, its shape, its
 * style and text by the engine's field names, what its draft adds (a
 * measurement, an intent, a link target, an icon), its `/F` flags, and how
 * it is drawn. `ref: null` is a record the engine hasn't confirmed. The
 * annotation fields a test states directly (`annotation`) lie over what the
 * draft reads back as; the annotations it answers are stated there
 * (`answering`).
 */
export interface RecordInput extends Omit<ModelAnnotation, 'annotation'> {
  readonly ref: AnnotationRef | null;
  readonly page: PageRef;
  readonly subtype: KindName;
  readonly geometry: Shape;
  readonly style: Style;
  readonly text?: TextStyle;
  readonly measure?: MeasurementAppearance;
  readonly intent?: string;
  readonly link?: PdfLinkTarget | null;
  readonly icon?: string;
  readonly flags: AnnotationFlags;
  readonly annotation?: Partial<Annotation>;
}

/** The engine fields a kind's sidebar edits: a border picker's are its three. */
function editedFields(kind: KindName): Set<string> {
  return new Set(
    kindNamed(kind).properties.flatMap((spec) =>
      spec.key === 'borderStyle'
        ? ['borderStyle', 'dashArray', ...(spec.cloudy ? ['cloudyIntensity'] : [])]
        : [spec.key],
    ),
  );
}

/** What a test record's draft adds beside its style and shape, as the drawing of its kind would. */
function draftExtras(input: RecordInput): FieldValues {
  const subtype = engineSubtypeOf(input.subtype);
  const shape = input.geometry;
  return {
    // A line's or polyline's endings: a field of their own, beside its points.
    ...('lineEndings' in shape && shape.lineEndings ? { lineEndings: shape.lineEndings } : {}),
    ...(input.measure ? measurementDraftFields(input.measure) : {}),
    ...(subtype === 'free-text'
      ? {
          intent:
            shape.kind === 'text-box' && shape.calloutLine ? 'free-text-callout' : 'free-text',
          contents: '',
        }
      : {}),
    ...(input.intent !== undefined ? { intent: input.intent } : {}),
    ...(subtype === 'link' ? { target: writableTarget(input.link ?? null) } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    // A text redaction states the box around its quads.
    ...(subtype === 'redact' && shape.kind === 'quads' ? { rect: geomBounds(shape) } : {}),
  };
}

/** The object number each test name stands for: one per name, the same every time it is asked. */
const numbers = new Map<string, number>();
const numberOf = (name: string): number => {
  let number = numbers.get(name);
  if (number === undefined) {
    number = 9000 + numbers.size;
    numbers.set(name, number);
  }
  return number;
};

/** The ref a test record named `name` has on `page`: the object number the name stands for. */
export const refNamed = (name: string, page: PageRef): AnnotationRef => ({
  kind: 'objectNumber',
  page,
  objectNumber: numberOf(name),
});

/**
 * The key and ref of a confirmed test record named `name` on `page`: keyed as
 * the engine keys it, so the records that answer it find it.
 */
export function named(name: string, page: PageRef): { id: Id; ref: AnnotationRef } {
  const ref = refNamed(name, page);
  return { id: annotationKey(ref), ref };
}

/** The annotation fields of one answering `parent`: a comment reply, or a `/RT /Group` member. */
export const answering = (
  parent: AnnotationRef,
  type: 'reply' | 'group' = 'reply',
): Partial<Annotation> => ({ reply: { to: parent, type } });

/**
 * A record as the plugin hands one to the core: the annotation its draft
 * reads back as (its style and text as its kind's sidebar sets them), with
 * the annotation fields the test states laid over it, read as the engine
 * writes a create (`annotationOfNew`); a measurement's stated label
 * stands where the engine can't work one out (no scale), as a file's stored
 * label does. A confirmed record keeps its ref; one not written yet takes the
 * object number its id stands for.
 */
export function recordOf(input: RecordInput): ModelAnnotation {
  const { annotation: stated, ref, page, subtype, geometry, style, text, flags, measure } = input;
  const edited = editedFields(subtype);
  const sidebar = Object.fromEntries(
    Object.entries({ ...style, ...text }).filter(([name]) => edited.has(name)),
  );
  const draft = draftOf(subtype, sidebar, geometry, draftExtras(input), flags);
  const at = ref ?? refNamed(input.id, page);
  const written = annotationOfNew(draft, { ref: at });
  const label = measure?.contents && !written.contents ? { contents: measure.contents } : {};
  return {
    id: input.id,
    ...(ref === null ? { unconfirmed: true as const } : {}),
    source: input.source,
    ...(input.apBox ? { apBox: input.apBox } : {}),
    ...(input.apRot !== undefined ? { apRot: input.apRot } : {}),
    ...(input.apVersion !== undefined ? { apVersion: input.apVersion } : {}),
    ...(input.authority ? { authority: input.authority } : {}),
    annotation: { ...written, ...label, ...stated } as Annotation,
  };
}

/** The record with these annotation fields stated over its own: how a test locks one, or gives it a file's value. */
export const withAnnotation = (
  record: ModelAnnotation,
  fields: Partial<Annotation>,
): ModelAnnotation => ({
  ...record,
  annotation: { ...record.annotation, ...fields } as Annotation,
});

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

/**
 * `model` holding the object numbers `message` may need, as the plugin hands
 * them out before it runs: numbers above every one the model holds or uses,
 * so the same steps always make the same refs.
 */
export function withNumbersFor(model: Model, message: Message): Model {
  const missing = newRecordsAtMost(message) - model.objectNumbers.length;
  if (missing <= 0) return model;
  const used = Object.values(model.byId).map((record) =>
    record.annotation.ref.kind === 'objectNumber' ? record.annotation.ref.objectNumber : 0,
  );
  const next = Math.max(99, ...model.objectNumbers, ...used) + 1;
  const numbers = Array.from({ length: missing }, (_, index) => next + index);
  return { ...model, objectNumbers: [...model.objectNumbers, ...numbers] };
}

/** One message, applied as the plugin runs it: the next model and the effects it asked for. */
export function step(model: Model, message: Message): [Model, Effect[]] {
  const ready = withNumbersFor(model, message);
  const result = update(ready, message);
  return [apply(ready, result), [...result.effects]];
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
