import {
  annotationKey,
  authorizeAnnotationCreate,
  authorizeAnnotationDelete,
  authorizeAnnotationUpdate,
  authorizeCapability,
  authorizeUnprotected,
  deletedWith,
  isSkippedItem,
  type Annotation,
  type AnnotationPatch,
  type AnnotationRef,
  type ChangeOp,
  type PageObjectNumber,
  type PageRef,
  type PdfCoordinates,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { exportAnnots, importAnnots } from './captures';
import { assertExpected, leftAlone, type ChangeContext, type Done } from './changeContext';
import { captureAfter, captureBefore, revertObjects, unchangedSince } from './objectCaptures';
import { valuesEqual } from '../../../shared/valuesEqual';
import { AnnotationMutator } from '../../annotations/AnnotationMutator';
import {
  openAnnotAtRaw,
  resolveAnnotIndexRaw,
} from '../../annotations/internal/identity/resolveAnnotIndexRaw';
import { annotationMutationMeta } from '../../annotations/internal/mutations/annotationMutationMeta';
import { promoteInlineAnnotations } from '../../annotations/internal/write/promoteInlineAnnotations';
import { RawAnnotationReader } from '../../annotations/RawAnnotationReader';
import type {
  AnnotationRemoveStep,
  AnnotationReorderStep,
  AnnotationRestoreStep,
  ObjectsRevertStep,
  RevertFallback,
} from '../ChangeRecord';

type Op<T extends ChangeOp['type']> = Extract<
  ChangeOp<PdfCoordinates, WireAnnotationResources>,
  { type: T }
>;

/** An annotation's position is where it is, not what it is: guards leave it out. */
const POSITION = new Set(['index']);

/** What an update may write in an annotation's appearance and attached file. */
const APPEARANCE_KEYS = ['AP', 'FS'];

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

/** `annotations.create`; its reverse deletes it, when nobody changed it since. */
export function createAnnotation(ctx: ChangeContext, op: Op<'annotations.create'>): Done {
  authorizeUnprotected(ctx.authority, 'doc.annotate.modify');
  const actor = authorizeAnnotationCreate(
    ctx.authority,
    (op.data as { groupId?: string | null }).groupId,
  );
  const page = ctx.session.resolvePageRef(op.page).pageObjectNumber;
  const result = mutator(ctx).create(page, op.data, ctx.signal, {
    ...(actor ? { actor } : {}),
    ...(op.resources ? { resources: op.resources } : {}),
    ...(op.objectNumber !== undefined ? { objectNumber: op.objectNumber } : {}),
  });
  return {
    item: { type: 'annotations.create', page: op.page, ...result },
    reverse: [{ kind: 'annotation.remove', ref: result.annotation.ref, left: [result.annotation] }],
  };
}

/**
 * `annotations.update`. Its reverse puts back the dictionaries the update
 * wrote, as they were; when someone changed them since, it puts back by value
 * only the fields that still hold what the update set.
 */
export function updateAnnotation(
  ctx: ChangeContext,
  op: Op<'annotations.update'>,
  opIndex: number,
): Done {
  authorizeUnprotected(ctx.authority, 'doc.annotate.modify');
  assertExpected(opIndex, readAnnotation(ctx, op.ref), op.expect);
  return writeUpdate(ctx, op.ref, op.patch, op.resources);
}

/** `annotations.delete`; its reverse brings back everything it removed. */
export function deleteAnnotation(
  ctx: ChangeContext,
  op: Op<'annotations.delete'>,
  opIndex: number,
): Done {
  authorizeUnprotected(ctx.authority, 'doc.annotate.modify');
  assertExpected(opIndex, readAnnotation(ctx, op.ref), op.expect);
  return writeDelete(ctx, op.ref);
}

/** `annotations.move`; its reverse moves them back, when they are still where it put them. */
export function moveAnnotations(
  ctx: ChangeContext,
  op: Op<'annotations.move'>,
  opIndex: number,
): Done {
  authorizeCapability(ctx.authority, 'doc.annotate.modify');
  const from = op.refs.map((ref) => resolveAnnotIndexRaw(ctx.runtime, ctx.session, ref).index);
  assertExpected(opIndex, { indexes: from }, op.expect ? { indexes: op.expect } : undefined);
  const page = ctx.session.resolvePageRef(op.page).pageObjectNumber;
  const result = mutator(ctx).move(page, [...op.refs], op.toIndex, ctx.signal);
  const at = op.refs.map((_, i) => op.toIndex + i);
  return {
    item: { type: 'annotations.move', page: op.page, ...result },
    reverse: [{ kind: 'annotation.reorder', page: op.page, refs: op.refs, at, targets: from }],
  };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Undoes an update (see `updateAnnotation`). */
export function revertAnnotation(
  ctx: ChangeContext,
  step: ObjectsRevertStep & { subject: { annotation: AnnotationRef } },
): Done {
  authorizeUnprotected(ctx.authority, 'doc.annotate.modify');
  const ref = step.subject.annotation;
  const current = tryReadAnnotation(ctx, ref);
  if (!current) return leftAlone(ctx, 'annotations.update');
  if (unchangedSince(ctx.runtime, ctx.session, step.objects)) {
    authorizeAnnotationUpdate(ctx.authority, current, undefined);
    const redo = revertObjects(ctx.runtime, ctx.session, step.objects);
    const annotation = readAnnotation(ctx, ref);
    return {
      item: {
        type: 'annotations.update',
        page: ref.page,
        annotation,
        appearance: { action: 'restored', changed: step.appearanceChanged ?? true },
        meta: annotationMutationMeta(ctx.session.writeStamp(), ref.page.objectNumber, [ref]),
      },
      reverse: [{ ...step, objects: redo, ...swapFallback(step.fallback) }],
    };
  }
  // Someone changed it since: put back by value what still shows the update.
  const fallback = step.fallback;
  if (fallback?.kind !== 'annotation') return leftAlone(ctx, 'annotations.update');
  const now = current as unknown as Record<string, unknown>;
  const left = fallback.left as Record<string, unknown>;
  const restore = fallback.restore as Record<string, unknown>;
  const keys = Object.keys(left);
  const kept = keys.filter((key) => valuesEqual(now[key], left[key]));
  if (kept.length === 0) return leftAlone(ctx, 'annotations.update');
  const patch = Object.fromEntries(kept.map((key) => [key, restore[key]]));
  const done = writeUpdate(ctx, ref, patch as AnnotationPatch<PdfCoordinates>);
  const skipped = keys.filter((key) => !kept.includes(key));
  const item = done.item;
  if (skipped.length === 0 || isSkippedItem(item) || item.type !== 'annotations.update') {
    return done;
  }
  return { ...done, item: { ...item, skipped } };
}

/** Deletes what a create or a restore brought back, when nobody changed it since. */
export function removeAnnotation(ctx: ChangeContext, step: AnnotationRemoveStep): Done {
  const annotations = tryListPage(ctx, step.ref.page);
  if (!annotations) return leftAlone(ctx, 'annotations.delete');
  const members = deletedWith(annotations, step.ref);
  const expected = new Map(step.left.map((left) => [annotationKey(left.ref), left]));
  const unchanged =
    members.length > 0 &&
    members.length === expected.size &&
    members.every((member) => {
      const left = expected.get(annotationKey(member.ref));
      return left !== undefined && valuesEqual(member, left, POSITION);
    });
  if (!unchanged) return leftAlone(ctx, 'annotations.delete');
  authorizeUnprotected(ctx.authority, 'doc.annotate.modify');
  return writeDelete(ctx, step.ref);
}

/**
 * Brings back what a delete removed, at the same numbers and positions. Skipped
 * when its page is gone or it is back already. It takes the authority its
 * delete took over each owner of what comes back.
 */
export function restoreAnnotations(ctx: ChangeContext, step: AnnotationRestoreStep): Done {
  authorizeUnprotected(ctx.authority, 'doc.annotate.modify');
  const before = tryListPage(ctx, step.page);
  const root = step.members[0];
  if (!before || !root) return leftAlone(ctx, 'annotations.restore');
  if (before.some((annotation) => annotationKey(annotation.ref) === annotationKey(root))) {
    return leftAlone(ctx, 'annotations.restore');
  }
  const { pageIndex, pageObjectNumber } = ctx.session.resolvePageRef(step.page);
  importAnnots(ctx.runtime, ctx.session.requireDocPtr(), pageIndex, step.capture);
  ctx.session.invalidateDerived();
  // A popup the delete took from an annotation that stayed links to it again,
  // when that annotation is as the delete left it.
  if (step.unlinked.length > 0 && unchangedSince(ctx.runtime, ctx.session, step.unlinked)) {
    revertObjects(ctx.runtime, ctx.session, step.unlinked);
  }
  const after = listPage(ctx, pageObjectNumber);
  const restored = step.members.map((ref) => {
    const found = after.find((annotation) => annotationKey(annotation.ref) === annotationKey(ref));
    if (!found) throw new Error(`a restored annotation is missing: ${annotationKey(ref)}`);
    return found;
  });
  authorizeAnnotationDelete(ctx.authority, restored);
  return {
    item: {
      type: 'annotations.restore',
      page: step.page,
      annotations: restored,
      meta: annotationMutationMeta(ctx.session.writeStamp(), pageObjectNumber, step.members),
    },
    reverse: [{ kind: 'annotation.remove', ref: root, left: restored }],
  };
}

/**
 * Moves annotations to `targets`, when they are still `at`: the reverse of a
 * move, and of that reverse.
 */
export function reorderAnnotations(ctx: ChangeContext, step: AnnotationReorderStep): Done {
  authorizeCapability(ctx.authority, 'doc.annotate.modify');
  const record = ctx.session.resolvePageRef(step.page);
  const now = step.refs.map((ref) => tryIndexOf(ctx, ref));
  if (!valuesEqual(now, step.at)) return leftAlone(ctx, 'annotations.move');
  const moving = mutator(ctx);
  const page = record.pageObjectNumber;
  // Out to the end, the others closing up in their order, then each back in at
  // its place, lowest first: every place below it is already as it should be.
  const count = ctx.runtime.fn.EPDFPage_GetAnnotCountRaw(
    ctx.session.requireDocPtr(),
    record.pageIndex,
  );
  moving.move(page, [...step.refs], count - step.refs.length, ctx.signal);
  const order = step.refs
    .map((ref, i) => ({ ref, target: step.targets[i]! }))
    .sort((a, b) => a.target - b.target);
  for (const { ref, target } of order) moving.move(page, [ref], target, ctx.signal);
  const annotations = step.refs.map((ref) => readAnnotation(ctx, ref));
  return {
    item: {
      type: 'annotations.move',
      page: step.page,
      annotations,
      meta: annotationMutationMeta(ctx.session.writeStamp(), page, step.refs),
    },
    reverse: [{ ...step, at: step.targets, targets: step.at }],
  };
}

// ---------------------------------------------------------------------------
// Writes, each recording its reverse
// ---------------------------------------------------------------------------

/** An update of `ref` with `patch`, recording the dictionaries it writes. */
function writeUpdate(
  ctx: ChangeContext,
  ref: AnnotationRef,
  patch: AnnotationPatch<PdfCoordinates>,
  resources?: WireAnnotationResources,
): Done {
  // Captures go by object number: an annotation born inline gets one first.
  promoteInlineAnnotations(ctx.runtime, ctx.session, ref.page.objectNumber);
  const before = readAnnotation(ctx, ref);
  const linked = linkedTo(before, patch).map((other) => ({
    objectNumber: objectNumberOf(ctx, other),
    deep: [],
  }));
  const pending = captureBefore(ctx.runtime, ctx.session, [
    { objectNumber: objectNumberOf(ctx, ref), deep: APPEARANCE_KEYS },
    ...linked,
  ]);
  const result = mutator(ctx).update(ref, patch, ctx.authority, ctx.signal, resources);
  const objects = captureAfter(ctx.runtime, ctx.session, pending);
  return {
    item: { type: 'annotations.update', page: ref.page, ...result },
    reverse: [
      {
        kind: 'objects.revert',
        reports: 'annotations.update',
        objects,
        subject: { annotation: ref },
        appearanceChanged: result.appearance.changed,
        fallback: valuesChanged(before, result.annotation, patch),
      },
    ],
  };
}

/** A delete of `ref` and what goes with it, capturing them first. */
function writeDelete(ctx: ChangeContext, ref: AnnotationRef): Done {
  const page = ref.page.objectNumber;
  // A capture holds objects: whatever was born inline becomes one first.
  promoteInlineAnnotations(ctx.runtime, ctx.session, page);
  const annotations = listPage(ctx, page);
  const members = deletedWith(annotations, ref);
  const going = new Set(members.map((member) => annotationKey(member.ref)));
  // A popup that goes without its annotation unlinks it.
  const parents = members.flatMap((member) =>
    member.subtype === 'popup' && member.parent && !going.has(annotationKey(member.parent))
      ? [{ objectNumber: objectNumberOf(ctx, member.parent), deep: [] }]
      : [],
  );
  const pending = captureBefore(ctx.runtime, ctx.session, parents);
  const { pageIndex } = ctx.session.resolvePageRef(ref.page);
  const capture =
    members.length > 0
      ? exportAnnots(
          ctx.runtime,
          ctx.session.requireDocPtr(),
          pageIndex,
          members.map((member) => member.index),
        )
      : new Uint8Array();
  const result = mutator(ctx).delete(ref, ctx.authority, ctx.signal);
  return {
    item: { type: 'annotations.delete', page: ref.page, ...result },
    reverse: [
      {
        kind: 'annotation.restore',
        page: ref.page,
        members: result.meta.changed,
        capture,
        unlinked: captureAfter(ctx.runtime, ctx.session, pending),
      },
    ],
  };
}

/**
 * The value fallback of an update: the fields it changed, their old values,
 * and the values it left. Fields the patch named whose value stayed are not
 * changes.
 */
function valuesChanged(
  before: Annotation<PdfCoordinates>,
  after: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): RevertFallback {
  const was = before as unknown as Record<string, unknown>;
  const is = after as unknown as Record<string, unknown>;
  const keys = Object.keys(patch).filter(
    (key) => key !== 'subtype' && !valuesEqual(was[key], is[key]),
  );
  return {
    kind: 'annotation',
    restore: Object.fromEntries(
      keys.map((key) => [key, was[key]]),
    ) as AnnotationPatch<PdfCoordinates>,
    left: Object.fromEntries(keys.map((key) => [key, is[key]])) as AnnotationPatch<PdfCoordinates>,
  };
}

/** A revert's fallback the other way round: what its redo puts back. */
function swapFallback(fallback: RevertFallback | undefined): { fallback?: RevertFallback } {
  if (fallback?.kind !== 'annotation') return fallback ? { fallback } : {};
  return { fallback: { kind: 'annotation', restore: fallback.left, left: fallback.restore } };
}

/**
 * The annotations an update writes besides `annotation`: a note and its popup
 * share `/Open`, and relinking a popup writes its old and new parent.
 */
function linkedTo(
  annotation: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationRef[] {
  const linked: AnnotationRef[] = [];
  if ('open' in patch) {
    if (annotation.subtype === 'text' && annotation.popup) linked.push(annotation.popup);
    if (annotation.subtype === 'popup' && annotation.parent) linked.push(annotation.parent);
  }
  if (annotation.subtype === 'popup' && 'parent' in patch) {
    if (annotation.parent) linked.push(annotation.parent);
    const next = (patch as { parent?: AnnotationRef | null }).parent;
    if (next) linked.push(next);
  }
  return linked;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function mutator(ctx: ChangeContext): AnnotationMutator {
  return new AnnotationMutator(ctx.runtime, ctx.session, ctx.fonts);
}

/** The annotation `ref` names, as it reads now; `NotFound` when there is none. */
function readAnnotation(ctx: ChangeContext, ref: AnnotationRef): Annotation<PdfCoordinates> {
  const { index } = resolveAnnotIndexRaw(ctx.runtime, ctx.session, ref);
  const found = listPage(ctx, ref.page.objectNumber)[index];
  if (!found) throw new Error(`annotation ${annotationKey(ref)} is not at ${index}`);
  return found;
}

function tryReadAnnotation(
  ctx: ChangeContext,
  ref: AnnotationRef,
): Annotation<PdfCoordinates> | null {
  const annotations = tryListPage(ctx, ref.page);
  return (
    annotations?.find((annotation) => annotationKey(annotation.ref) === annotationKey(ref)) ?? null
  );
}

function tryIndexOf(ctx: ChangeContext, ref: AnnotationRef): number | null {
  return tryReadAnnotation(ctx, ref)?.index ?? null;
}

/** Every annotation of a page, read from its dictionaries; the page is not loaded. */
function listPage(ctx: ChangeContext, page: PageObjectNumber): Annotation<PdfCoordinates>[] {
  return new RawAnnotationReader(ctx.runtime, ctx.session, ctx.fonts).listOne(page, ctx.signal)
    .annotations;
}

/** The same, or null when the page is gone. */
function tryListPage(ctx: ChangeContext, page: PageRef): Annotation<PdfCoordinates>[] | null {
  try {
    return listPage(ctx, ctx.session.resolvePageRef(page).pageObjectNumber);
  } catch {
    return null;
  }
}

/** The object number of the annotation `ref` names (born inline, it must be promoted first). */
function objectNumberOf(ctx: ChangeContext, ref: AnnotationRef): number {
  if (ref.kind === 'objectNumber') return ref.objectNumber;
  const { pageIndex, index } = resolveAnnotIndexRaw(ctx.runtime, ctx.session, ref);
  const annotPtr = openAnnotAtRaw(ctx.runtime, ctx.session, pageIndex, index);
  try {
    return ctx.runtime.fn.EPDFAnnot_GetObjectNumber(annotPtr);
  } finally {
    ctx.runtime.fn.FPDFPage_CloseAnnot(annotPtr);
  }
}
