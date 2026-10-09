import {
  annotationKey,
  annotationWriteCapabilities,
  annotationWriteCapability,
  authorizeAnnotationCreate,
  authorizeAnnotationDelete,
  authorizeAnnotationUpdate,
  authorizeCapability,
  authorizeUnprotected,
  deletedWith,
  EngineError,
  EngineErrorCode,
  formWidget,
  isSkippedItem,
  type Annotation,
  type AnnotationAuthority,
  type AnnotationFamily,
  type AnnotationImportOp,
  type AnnotationPatch,
  type AnnotationRef,
  type AnnotationUpdateResult,
  type ChangeAuthority,
  type ChangeItem,
  type ChangeOp,
  type FormWidget,
  type WidgetPatch,
  type PageObjectNumber,
  type PageRef,
  type PdfCoordinates,
  type PdfAnnotationActions,
  type PdfDestination,
  widgetActionsOf,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { exportAnnots, importAnnots } from './captures';
import { assertExpected, leftAlone, type ChangeContext, type Done } from './changeContext';
import { captureAfter, captureBefore, revertObjects, unchangedSince } from './objectCaptures';
import { valuesEqual } from '../../../shared/valuesEqual';
import { AnnotationImporter } from '../../annotations/AnnotationImporter';
import { AnnotationMutator } from '../../annotations/AnnotationMutator';
import {
  openAnnotAtRaw,
  resolveAnnotIndexRaw,
} from '../../annotations/internal/identity/resolveAnnotIndexRaw';
import { annotationMutationMeta } from '../../annotations/internal/mutations/annotationMutationMeta';
import {
  applyReorder,
  familyOrder,
  planReorder,
  readPageStack,
  type PageStack,
  type PlannedReorder,
} from '../../annotations/internal/stackingOrder';
import { promoteInlineAnnotations } from '../../annotations/internal/write/promoteInlineAnnotations';
import { fitCaptionToFamily } from '../../forms/internal/widgetCaption';
import { RawAnnotationReader } from '../../annotations/RawAnnotationReader';
import { formMutationMeta } from '../../forms/internal/formMutationMeta';
import type {
  AnnotationRemoveStep,
  AnnotationReorderStep,
  AnnotationRestoreStep,
  ObjectsRevertStep,
  ReverseStep,
  RevertFallback,
  StepRights,
} from '../ChangeRecord';

type Op<T extends ChangeOp['type']> = Extract<
  ChangeOp<PdfCoordinates, WireAnnotationResources>,
  { type: T }
>;

/** The ops that update an annotation's dictionary in place: a widget's is a form op. */
export type UpdateReport = 'annotations.update' | 'forms.updateWidget';

/**
 * What an update may write in an annotation's appearance and attached file.
 * A widget's actions need no deep capture: each write makes new action
 * objects, and the runtime copies a shared `/AA` into the widget before it
 * changes, so the widget's own dictionary holds the change. Following `/A`
 * would also reach the fields a reset or submit names.
 */
const APPEARANCE_KEYS = ['AP', 'FS'];

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

/** `annotations.create`; its reverse deletes it, when nobody changed it since. */
export function createAnnotation(ctx: ChangeContext, op: Op<'annotations.create'>): Done {
  if (op.data.subtype === 'widget') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a widget is the form's: create one with doc.forms.create or doc.forms.addWidget",
      { details: { field: 'subtype' } },
    );
  }
  authorizeUnprotected(ctx.authority, annotationWriteCapability(op.data.subtype));
  const actor = authorizeAnnotationCreate(
    ctx.authority,
    op.data.subtype,
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
 * `annotations.import`: a bundle's annotations, created as the import plans
 * them (`AnnotationImporter`), each checked as its create would be. Its
 * reverse removes what the import made, thread by thread, as a create's
 * undo does. A restoring import's steps take the import's rights.
 */
export function importAnnotations(ctx: ChangeContext, op: AnnotationImportOp): Done {
  const rights: StepRights | undefined = op.attribution === 'restore' ? 'import' : undefined;
  if (rights) authorizeImportRights(ctx.authority);
  const result = new AnnotationImporter(ctx.runtime, ctx.session, ctx.fonts).import(
    {
      bundle: op.bundle,
      ...(op.pages !== undefined ? { pages: op.pages } : {}),
      attribution: op.attribution,
      ...(op.actor ? { actor: op.actor } : {}),
      limits: op.limits,
      authorizeCreate: (draft) => {
        authorizeUnprotected(ctx.authority, annotationWriteCapability(draft.subtype));
        // A restoring import writes attribution that isn't the caller's,
        // under the rights checked above; a copy is the caller's own create.
        if (!rights) {
          authorizeAnnotationCreate(
            ctx.authority,
            draft.subtype,
            (draft as { groupId?: string | null }).groupId,
          );
        }
      },
    },
    ctx.signal,
  );
  return {
    item: { type: 'annotations.import', ...result },
    reverse: importReverse(ctx, result.annotations, rights),
  };
}

/**
 * The undo of an import: one remove per imported annotation that no other
 * imported one takes with it (a note takes its popup and its imported
 * replies), the last made first, each holding its thread as the import
 * left it. An imported reply to an annotation that was there goes alone.
 */
function importReverse(
  ctx: ChangeContext,
  created: readonly Annotation<PdfCoordinates>[],
  rights: StepRights | undefined,
): ReverseStep[] {
  const pages = new Map<number, Annotation<PdfCoordinates>[]>();
  const threadOf = (ref: AnnotationRef) => {
    let annotations = pages.get(ref.page.objectNumber);
    if (!annotations) {
      annotations = listPage(ctx, ref.page.objectNumber);
      pages.set(ref.page.objectNumber, annotations);
    }
    return deletedWith(annotations, ref);
  };
  const threads = created.map((annotation) => ({
    ref: annotation.ref,
    left: threadOf(annotation.ref),
  }));
  // `deletedWith` lists what goes with an annotation, then the annotation.
  const takenWith = new Set(
    threads.flatMap((thread) =>
      thread.left
        .map((member) => annotationKey(member.ref))
        .filter((key) => key !== annotationKey(thread.ref)),
    ),
  );
  return threads
    .filter((thread) => !takenWith.has(annotationKey(thread.ref)))
    .reverse()
    .map((thread) => ({
      kind: 'annotation.remove' as const,
      ref: thread.ref,
      left: thread.left,
      ...(rights ? { rights } : {}),
    }));
}

/** A restoring import's rights: `doc.annotate.modify` and `doc.annotate.import`. */
function authorizeImportRights(authority: ChangeAuthority): void {
  authorizeCapability(authority, 'doc.annotate.modify');
  authorizeCapability(authority, 'doc.annotate.import');
}

/**
 * The authority a step under an import's rights writes with: those rights
 * were checked, so the per-annotation rules give way.
 */
function underImportRights(authority: ChangeAuthority): AnnotationAuthority {
  return { ...authority, grants: null };
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
  const current = readAnnotation(ctx, op.ref);
  if (current.subtype === 'widget') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      "a widget is the form's: change its place and look with doc.forms.updateWidget",
    );
  }
  authorizeUnprotected(ctx.authority, annotationWriteCapability(current.subtype));
  assertExpected(opIndex, current, op.expect);
  return writeUpdate(ctx, op.ref, op.patch, 'annotations.update', op.resources);
}

/** `annotations.delete`; its reverse brings back everything it removed. */
export function deleteAnnotation(
  ctx: ChangeContext,
  op: Op<'annotations.delete'>,
  opIndex: number,
): Done {
  const current = readAnnotation(ctx, op.ref);
  if (current.subtype === 'widget') throw widgetDeleteRefused(current);
  authorizeUnprotected(ctx.authority, annotationWriteCapability(current.subtype));
  assertExpected(opIndex, current, op.expect);
  return writeDelete(ctx, op.ref);
}

/** Why a widget isn't deleted as an annotation, naming the form op that removes it. */
function widgetDeleteRefused(widget: Extract<Annotation<PdfCoordinates>, { subtype: 'widget' }>) {
  const merged =
    widget.field?.kind === 'objectNumber' &&
    widget.ref.kind === 'objectNumber' &&
    widget.field.objectNumber === widget.ref.objectNumber;
  return new EngineError(
    EngineErrorCode.InvalidArg,
    merged
      ? "widget is its form field's own dictionary (a merged field/widget) - delete the field with doc.forms.delete"
      : widget.field
        ? 'widget is attached to a form field - use doc.forms.removeWidget or doc.forms.delete'
        : "a widget is the form's: it isn't deleted as an annotation",
  );
}

/** `annotations.reorder`; its reverse puts them back beside their old neighbours. */
export function reorderAnnotations(ctx: ChangeContext, op: Op<'annotations.reorder'>): Done {
  const stack = readPageStack(ctx.runtime, ctx.session, op.page);
  const plan = planReorder(stack, 'annotations', op.refs, op.position);
  authorizeReorder(ctx, 'annotations', op.refs);
  applyReorder(ctx.runtime, ctx.session, plan);
  return reordered(ctx, plan, op.refs);
}

/**
 * A reorder's item, as its family's op reports it, and the step that puts
 * its rows back.
 */
export function reordered(
  ctx: ChangeContext,
  plan: PlannedReorder,
  refs: readonly AnnotationRef[],
): Done {
  const { page } = plan.stack;
  return {
    item: reorderItem(ctx, plan.family, page, plan.after, refs),
    reverse: [
      {
        kind: 'annotation.reorder',
        page,
        family: plan.family,
        refs,
        before: plan.before,
        after: plan.after,
      },
    ],
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
  const ref = step.subject.annotation;
  const reports = step.reports as UpdateReport;
  const current = tryReadAnnotation(ctx, ref);
  if (!current) return leftAlone(ctx, reports);
  authorizeUnprotected(ctx.authority, annotationWriteCapability(current.subtype));
  if (unchangedSince(ctx.runtime, ctx.session, step.objects)) {
    authorizeAnnotationUpdate(ctx.authority, current, undefined);
    const redo = revertObjects(ctx.runtime, ctx.session, step.objects);
    const annotation = readAnnotation(ctx, ref);
    return {
      item: updatedItem(ctx, reports, ref, {
        annotation,
        appearance: { action: 'restored', changed: step.appearanceChanged ?? true },
        meta: annotationMutationMeta(ctx.session.writeStamp(), ref.page.objectNumber, [ref]),
      }),
      reverse: [{ ...step, objects: redo, ...swapFallback(step.fallback) }],
    };
  }
  // Someone changed it since: put back by value what still shows the update.
  const fallback = step.fallback;
  if (fallback?.kind !== 'annotation') return leftAlone(ctx, reports);
  const now = current as unknown as Record<string, unknown>;
  const left = fallback.left as Record<string, unknown>;
  const restore = fallback.restore as Record<string, unknown>;
  const keys = Object.keys(left);
  const kept = keys.filter((key) => valuesEqual(now[key], left[key]));
  if (kept.length === 0) return leftAlone(ctx, reports);
  // A widget's actions are kept as read (trees) and written as a patch.
  const writable = (key: string, value: unknown) =>
    key === 'actions' && current.subtype === 'widget'
      ? widgetActionsOf(value as PdfAnnotationActions<PdfDestination> | null)
      : value;
  const patch = Object.fromEntries(kept.map((key) => [key, writable(key, restore[key])]));
  const done = writeUpdate(ctx, ref, patch as AnnotationPatch<PdfCoordinates>, reports);
  const skipped = keys.filter((key) => !kept.includes(key));
  const item = done.item;
  if (skipped.length === 0 || isSkippedItem(item) || item.type !== reports) return done;
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
      return left !== undefined && valuesEqual(member, left);
    });
  if (!unchanged) return leftAlone(ctx, 'annotations.delete');
  for (const capability of annotationWriteCapabilities(members)) {
    authorizeUnprotected(ctx.authority, capability);
  }
  if (step.rights) authorizeImportRights(ctx.authority);
  return writeDelete(ctx, step.ref, step.rights);
}

/**
 * Brings back what a delete removed, at the same numbers and positions. Skipped
 * when its page is gone or it is back already. It takes the authority its
 * delete took over each owner of what comes back.
 */
export function restoreAnnotations(ctx: ChangeContext, step: AnnotationRestoreStep): Done {
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
  // What comes back is checked once it is read; a refusal undoes the import
  // with the rest of the change.
  for (const capability of annotationWriteCapabilities(restored)) {
    authorizeUnprotected(ctx.authority, capability);
  }
  if (step.rights) authorizeImportRights(ctx.authority);
  else authorizeAnnotationDelete(ctx.authority, restored);
  return {
    item: {
      type: 'annotations.restore',
      page: step.page,
      annotations: restored,
      meta: annotationMutationMeta(ctx.session.writeStamp(), pageObjectNumber, step.members),
    },
    reverse: [
      {
        kind: 'annotation.remove',
        ref: root,
        left: restored,
        ...(step.rights ? { rights: step.rights } : {}),
      },
    ],
  };
}

/**
 * Puts the rows of a reorder back beside their old neighbours (see
 * `AnnotationReorderStep`). A row goes back only while it is where the
 * reorder left it, above the same row; it goes above the nearest row that
 * was below it before and is still there, or to the bottom.
 */
export function reorderBack(ctx: ChangeContext, step: AnnotationReorderStep): Done {
  const reports = step.family === 'annotations' ? 'annotations.reorder' : 'forms.reorderWidgets';
  const stack = tryReadPageStack(ctx, step.page);
  if (!stack) return leftAlone(ctx, reports);
  const now = familyOrder(stack, step.family);
  const back = step.refs.filter((ref) => {
    const below = rowBelow(now, ref);
    return below !== undefined && below === rowBelow(step.after, ref);
  });
  if (back.length === 0) return leftAlone(ctx, reports);
  authorizeReorder(ctx, step.family, back);

  const going = new Set(back.map(annotationKey));
  const inPlace = new Set(now.map(annotationKey).filter((key) => !going.has(key)));
  let current = stack;
  // Lowest first, so a row's old neighbour that moves too is back before it.
  for (const ref of step.before.filter((row) => going.has(annotationKey(row)))) {
    const at = step.before.findIndex((row) => annotationKey(row) === annotationKey(ref));
    const neighbour = step.before
      .slice(0, at)
      .reverse()
      .find((row) => inPlace.has(annotationKey(row)));
    const plan = planReorder(
      current,
      step.family,
      [ref],
      neighbour ? { after: neighbour } : 'start',
    );
    applyReorder(ctx.runtime, ctx.session, plan);
    inPlace.add(annotationKey(ref));
    current = readPageStack(ctx.runtime, ctx.session, step.page);
  }
  const after = familyOrder(current, step.family);
  return {
    item: reorderItem(ctx, step.family, step.page, after, back),
    reverse: [{ ...step, refs: back, before: now, after }],
  };
}

/**
 * The key of the row right below `ref` in `order`; `null` at the bottom,
 * `undefined` when `ref` isn't in it.
 */
function rowBelow(order: readonly AnnotationRef[], ref: AnnotationRef): string | null | undefined {
  const at = order.findIndex((row) => annotationKey(row) === annotationKey(ref));
  if (at < 0) return undefined;
  return at === 0 ? null : annotationKey(order[at - 1]!);
}

/** A reorder may move these rows: each annotation's kind, or the form's design. */
function authorizeReorder(
  ctx: ChangeContext,
  family: AnnotationFamily,
  refs: readonly AnnotationRef[],
): void {
  if (family === 'widgets') {
    authorizeCapability(ctx.authority, 'doc.forms.modify');
    return;
  }
  const moving = refs.map((ref) => readAnnotation(ctx, ref));
  for (const capability of annotationWriteCapabilities(moving)) {
    authorizeCapability(ctx.authority, capability);
  }
}

/** A reorder's item: the family's new order on the page, and the rows that moved. */
function reorderItem(
  ctx: ChangeContext,
  family: AnnotationFamily,
  page: PageRef,
  order: AnnotationRef[],
  moved: readonly AnnotationRef[],
): ChangeItem<PdfCoordinates> {
  const stamp = ctx.session.writeStamp();
  if (family === 'annotations') {
    return {
      type: 'annotations.reorder',
      page,
      order,
      meta: annotationMutationMeta(stamp, page.objectNumber, moved),
    };
  }
  const widgets: FormWidget[] = moved.map((ref) => ({
    ref,
    objectNumber: objectNumberOf(ctx, ref),
    page,
  }));
  return { type: 'forms.reorderWidgets', page, order, meta: formMutationMeta(stamp, [], widgets) };
}

// ---------------------------------------------------------------------------
// Writes, each recording its reverse
// ---------------------------------------------------------------------------

/**
 * An update of `ref` with `patch`, recording the dictionaries it writes, and
 * reported as `reports`: an annotation's update, or a widget's form op.
 */
export function writeUpdate(
  ctx: ChangeContext,
  ref: AnnotationRef,
  patch: AnnotationPatch<PdfCoordinates>,
  reports: UpdateReport,
  resources?: WireAnnotationResources,
): Done {
  // Captures go by object number: an annotation born inline gets one first.
  promoteInlineAnnotations(ctx.runtime, ctx.session, ref.page.objectNumber);
  const before = readAnnotation(ctx, ref);
  const written =
    before.subtype === 'widget'
      ? fitCaptionToFamily(before.fieldFamily, patch as WidgetPatch<PdfCoordinates>)
      : patch;
  const linked = linkedTo(before, written).map((other) => ({
    objectNumber: objectNumberOf(ctx, other),
    deep: [],
  }));
  const pending = captureBefore(ctx.runtime, ctx.session, [
    { objectNumber: objectNumberOf(ctx, ref), deep: APPEARANCE_KEYS },
    ...linked,
  ]);
  const result = mutator(ctx).update(ref, written, ctx.authority, ctx.signal, resources);
  const objects = captureAfter(ctx.runtime, ctx.session, pending);
  return {
    item: updatedItem(ctx, reports, ref, result),
    reverse: [
      {
        kind: 'objects.revert',
        reports,
        objects,
        subject: { annotation: ref },
        appearanceChanged: result.appearance.changed,
        fallback: valuesChanged(before, result.annotation, written),
      },
    ],
  };
}

/**
 * The item of an in-place update: an annotation's, with its page; or a
 * widget's form op, with the form's meta.
 */
function updatedItem(
  ctx: ChangeContext,
  reports: UpdateReport,
  ref: AnnotationRef,
  result: AnnotationUpdateResult<PdfCoordinates>,
): ChangeItem<PdfCoordinates> {
  if (reports === 'annotations.update') {
    return { type: 'annotations.update', page: ref.page, ...result };
  }
  const widget = result.annotation;
  if (widget.subtype !== 'widget') throw new Error('a widget update read back no widget');
  return {
    type: 'forms.updateWidget',
    widget,
    appearance: result.appearance,
    meta: formMutationMeta(ctx.session.writeStamp(), widget.field ? [widget.field] : [], [
      formWidget(objectNumberOf(ctx, ref), ref.page),
    ]),
  };
}

/** A delete of `ref` and what goes with it, capturing them first. */
/** Deletes `ref` and what goes with it; `rights` is what a step under an import's rights checked. */
function writeDelete(ctx: ChangeContext, ref: AnnotationRef, rights?: StepRights): Done {
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
          members.map((member) => resolveAnnotIndexRaw(ctx.runtime, ctx.session, member.ref).index),
        )
      : new Uint8Array();
  const authority = rights ? underImportRights(ctx.authority) : ctx.authority;
  const result = mutator(ctx).delete(ref, authority, ctx.signal);
  return {
    item: { type: 'annotations.delete', page: ref.page, ...result },
    reverse: [
      {
        kind: 'annotation.restore',
        page: ref.page,
        members: result.meta.changed,
        capture,
        unlinked: captureAfter(ctx.runtime, ctx.session, pending),
        ...(rights ? { rights } : {}),
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
export function readAnnotation(ctx: ChangeContext, ref: AnnotationRef): Annotation<PdfCoordinates> {
  resolveAnnotIndexRaw(ctx.runtime, ctx.session, ref);
  const key = annotationKey(ref);
  const found = listPage(ctx, ref.page.objectNumber).find(
    (annotation) => annotationKey(annotation.ref) === key,
  );
  if (!found) throw new Error(`annotation ${key} is on its page but reads as none`);
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

/** Every annotation of a page, read from its dictionaries; the page is not loaded. */
function listPage(ctx: ChangeContext, page: PageObjectNumber): Annotation<PdfCoordinates>[] {
  return new RawAnnotationReader(ctx.runtime, ctx.session, ctx.fonts).listOne(page, ctx.signal)
    .annotations;
}

/** A page's stack, or null when the page is gone. */
function tryReadPageStack(ctx: ChangeContext, page: PageRef): PageStack | null {
  try {
    return readPageStack(ctx.runtime, ctx.session, page);
  } catch {
    return null;
  }
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
export function objectNumberOf(ctx: ChangeContext, ref: AnnotationRef): number {
  if (ref.kind === 'objectNumber') return ref.objectNumber;
  const { pageIndex, index } = resolveAnnotIndexRaw(ctx.runtime, ctx.session, ref);
  const annotPtr = openAnnotAtRaw(ctx.runtime, ctx.session, pageIndex, index);
  try {
    return ctx.runtime.fn.EPDFAnnot_GetObjectNumber(annotPtr);
  } finally {
    ctx.runtime.fn.FPDFPage_CloseAnnot(annotPtr);
  }
}
