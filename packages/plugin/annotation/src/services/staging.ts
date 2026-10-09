/**
 * How the store puts one change together from ops, whichever door they came
 * through: a change stated in code, checked, as its op; what follows an
 * update; the deletes another delete covers; the records it names and what it
 * is called. Pure functions.
 */
import { PluginError, type ChangeLabel } from '@embedpdf/core';
import {
  drawnAfter,
  fromDTO,
  sourceOfNew,
  type Id,
  type Model,
  type ModelAnnotation,
  type UpdateResult,
} from '@embedpdf/core-annotation';
import {
  annotationKey,
  deletedWith,
  resolveAnnotationPatch,
  type AnnotationRef,
  type ChangeOp,
} from '@embedpdf/engine-core/runtime';

import type { StoreChange } from './store';
import { annotationOfCreate, type AnnotationRecords } from '../sync/records';

/**
 * What an update brings along in the same change (an annotation's attached
 * link children), read from the model the change leaves. Called for every
 * update either door stages.
 */
export type FollowUp = (
  op: Extract<ChangeOp, { type: 'annotations.update' }>,
  model: Model,
) => readonly ChangeOp[];

/**
 * A stated change as its op, as given: what an op builder adds for changes
 * worked out in the engine's terms (a link's children).
 */
export const opOfStated = (change: StoreChange): ChangeOp => {
  switch (change.type) {
    case 'create':
      return {
        type: 'annotations.create',
        page: change.page,
        data: change.draft,
        ...(change.resources ? { resources: change.resources } : {}),
      };
    case 'update':
      return {
        type: 'annotations.update',
        ref: change.ref,
        patch: change.patch,
        ...(change.resources ? { resources: change.resources } : {}),
      };
    case 'delete':
      return { type: 'annotations.delete', ref: change.ref };
    case 'reorder':
      return {
        type: 'annotations.reorder',
        page: change.page,
        refs: change.refs,
        position: change.position,
      };
  }
};

/** The record keys an op names. */
const keysOf = (op: ChangeOp): string[] => {
  switch (op.type) {
    case 'annotations.create':
      return op.objectNumber === undefined ? [] : [`obj:${op.objectNumber}`];
    case 'annotations.update':
    case 'annotations.delete':
      return [annotationKey(op.ref)];
    case 'annotations.reorder':
      return op.refs.map(annotationKey);
    default:
      return [];
  }
};

/** The records a change names, each once. */
export const idsOf = (ops: readonly ChangeOp[]): Id[] => [...new Set(ops.flatMap(keysOf))];

/**
 * What a change is called, from what it does: one kind of op, or several.
 * History and refusals show it.
 */
export const labelOf = (ops: readonly ChangeOp[]): ChangeLabel => {
  const kinds = new Set(ops.map((op) => op.type));
  const [only] = kinds;
  const verb = kinds.size === 1 && only ? only.slice('annotations.'.length) : 'change';
  return { key: `annotation.${verb}`, count: idsOf(ops).length };
};

/**
 * The ops without the deletes another delete of them already covers: an
 * annotation goes with its replies, grouped parts and popups, and an op
 * naming one already gone would refuse the whole change.
 */
export function withoutCoveredDeletes(
  records: AnnotationRecords,
  ops: readonly ChangeOp[],
): readonly ChangeOp[] {
  const deleted = ops.flatMap((op) => (op.type === 'annotations.delete' ? [op.ref] : []));
  if (deleted.length < 2) return ops;
  const covered = new Set<string>();
  for (const ref of deleted) {
    const page = records.order
      .map((key) => records.byKey[key]!.dto)
      .filter((dto) => dto.page.objectNumber === ref.page.objectNumber);
    for (const annotation of deletedWith(page, ref)) {
      if (annotationKey(annotation.ref) !== annotationKey(ref)) {
        covered.add(annotationKey(annotation.ref));
      }
    }
  }
  return ops.filter(
    (op) => op.type !== 'annotations.delete' || !covered.has(annotationKey(op.ref)),
  );
}

/**
 * `ops` with what follows each update right after it (`FollowUp`): one
 * change writes both.
 */
export const withFollowUps = (
  ops: readonly ChangeOp[],
  followUp: FollowUp | null,
  model: Model,
): ChangeOp[] =>
  ops.flatMap((op) =>
    op.type === 'annotations.update' && followUp ? [op, ...followUp(op, model)] : [op],
  );

/**
 * `before` with the records as `shown` holds them: the model a change stated
 * in code leaves. A record it didn't touch keeps its identity.
 */
export function modelOver(
  before: Model,
  previous: AnnotationRecords,
  shown: AnnotationRecords,
): Model {
  const byId: Record<Id, ModelAnnotation> = {};
  for (const key of shown.order) {
    const stored = shown.byKey[key]!;
    const kept = previous.byKey[key] === stored ? before.byId[key] : undefined;
    byId[key] = kept ?? { ...fromDTO(stored.dto), source: 'vector' };
  }
  return { ...before, byId, order: [...shown.order] };
}

/** `before`'s records with a message's change set laid over them, and its session: the model its effects read. */
export function modelAfter(before: Model, result: UpdateResult): Model {
  if (!result.change.put.length && !result.change.drop.length) {
    return { ...before, ...result.session };
  }
  const byId = { ...before.byId };
  for (const id of result.change.drop) delete byId[id];
  for (const record of result.change.put) byId[record.id] = record;
  const added = result.change.put.map((record) => record.id).filter((id) => !(id in before.byId));
  const order = [...before.order.filter((id) => id in byId), ...added];
  return { ...result.session, byId, order };
}

const notFound = (ref: AnnotationRef): PluginError =>
  new PluginError('not-found', 'annotation', `no annotation ${annotationKey(ref)}`);

/**
 * One stated change as its op, checked by the engine's own rules against
 * `current`: what shows is what the engine will write, and a change it
 * would refuse throws. `live`: the record draws live from now on.
 */
export function checkedOpOf(
  change: StoreChange,
  current: AnnotationRecords,
  taken: number[],
  recordOf: (id: Id) => ModelAnnotation | undefined,
): { id: Id; op: ChangeOp | null; live?: boolean } {
  if (change.type === 'create') {
    const objectNumber = taken.shift()!;
    const ref: AnnotationRef = { kind: 'objectNumber', page: change.page, objectNumber };
    const annotation = annotationOfCreate(change.draft, ref);
    return {
      id: annotationKey(ref),
      op: {
        type: 'annotations.create',
        page: change.page,
        data: change.draft,
        objectNumber,
        ...(change.resources ? { resources: change.resources } : {}),
      },
      live: sourceOfNew(annotation) === 'vector',
    };
  }
  if (change.type === 'reorder') {
    for (const ref of change.refs) {
      if (!(annotationKey(ref) in current.byKey)) throw notFound(ref);
    }
    return {
      id: annotationKey(change.refs[0]!),
      op: {
        type: 'annotations.reorder',
        page: change.page,
        refs: change.refs,
        position: change.position,
      },
    };
  }
  const id = annotationKey(change.ref);
  const stored = current.byKey[id];
  if (!stored) throw notFound(change.ref);
  if (change.type === 'delete') return { id, op: { type: 'annotations.delete', ref: change.ref } };
  const noFields = Object.keys(change.patch).every((name) => name === 'subtype');
  // A patch that says nothing, with no bytes, is no write at all.
  if (noFields && !change.resources) return { id, op: null };
  // The engine's resolve rules, run now: a patch it would refuse throws
  // before anything shows.
  resolveAnnotationPatch(stored.dto, change.patch);
  const record = recordOf(id);
  return {
    id,
    op: {
      type: 'annotations.update',
      ref: change.ref,
      patch: change.patch,
      ...(change.resources ? { resources: change.resources } : {}),
    },
    live: !!record && drawnAfter(record, change.patch).source === 'vector',
  };
}
