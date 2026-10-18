import {
  EngineError,
  EngineErrorCode,
  authorizeCapability,
  toOutlineItemRef,
  type ChangeOp,
  type OutlineItem,
  type OutlineItemPatch,
  type OutlineItemRef,
  type PdfCoordinates,
  type PdfDestination,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { exportOutlineItem, importOutlineItem } from './captures';
import { assertExpected, leftAlone, type ChangeContext, type Done } from './changeContext';
import { captureAfter, captureBefore, revertObjects, unchangedSince } from './objectCaptures';
import { valuesEqual } from '../../../shared/valuesEqual';
import { OUTLINE_TOP, OutlineMutator } from '../../outline';
import type {
  ObjectsRevertStep,
  OutlineMoveStep,
  OutlineRemoveStep,
  OutlineRestoreStep,
  RevertFallback,
} from '../ChangeRecord';

type Op<T extends ChangeOp['type']> = Extract<
  ChangeOp<PdfCoordinates, WireAnnotationResources>,
  { type: T }
>;

/** The fields an update can change, each with a value a revert can put back. */
const FIELDS = ['title', 'target', 'color', 'bold', 'italic', 'open'] as const;

/** What a capture of an item follows: its action, and its destination. */
const TARGET_KEYS = ['A', 'Dest'];

const mutatorOf = (ctx: ChangeContext) => new OutlineMutator(ctx.runtime, ctx.session);
const authorize = (ctx: ChangeContext) => authorizeCapability(ctx.authority, 'doc.outline.modify');

/** `outline.create`; its reverse deletes the item while nobody changed it since. */
export function createOutlineItem(ctx: ChangeContext, op: Op<'outline.create'>): Done {
  authorize(ctx);
  const result = mutatorOf(ctx).create(op.parent, op.position ?? 'end', op.data, op.objectNumber);
  return {
    item: { type: 'outline.create', ...result },
    reverse: [{ kind: 'outline.remove', ref: result.item.ref, left: [result.item] }],
  };
}

/**
 * `outline.update`; its reverse puts the item's dictionary back as it was,
 * or, when someone changed it since, the fields still holding what it set.
 */
export function updateOutlineItem(
  ctx: ChangeContext,
  op: Op<'outline.update'>,
  opIndex: number,
): Done {
  authorize(ctx);
  const before = requireItem(ctx, op.ref);
  assertExpected(opIndex, before, op.expect);
  return writeUpdate(ctx, op.ref, op.patch, before);
}

/** `outline.move`; its reverse puts each item back beside the sibling it followed. */
export function moveOutlineItems(ctx: ChangeContext, op: Op<'outline.move'>): Done {
  authorize(ctx);
  const mutator = mutatorOf(ctx);
  const tree = mutator.tree();
  const items = op.refs.map((ref) => ref.objectNumber);
  const back = mutator.placementsOf(items, tree);
  const result = mutator.move(op.refs, op.parent, op.position);
  const parent = op.parent?.objectNumber ?? OUTLINE_TOP;
  return {
    item: { type: 'outline.move', ...result },
    reverse: [
      { kind: 'outline.move', placements: back, left: items.map((item) => ({ item, parent })) },
    ],
  };
}

/** `outline.delete`; its reverse brings the item and the items under it back. */
export function deleteOutlineItem(
  ctx: ChangeContext,
  op: Op<'outline.delete'>,
  opIndex: number,
): Done {
  authorize(ctx);
  const before = requireItem(ctx, op.ref);
  assertExpected(opIndex, before, op.expect);
  return writeDelete(ctx, op.ref);
}

/** Puts an item's dictionary back, or the fields that still show the update (see `updateOutlineItem`). */
export function revertOutlineItem(
  ctx: ChangeContext,
  step: ObjectsRevertStep & { subject: { outlineItem: OutlineItemRef } },
): Done {
  const ref = step.subject.outlineItem;
  const mutator = mutatorOf(ctx);
  const current = mutator.find(ref);
  if (!current) return leftAlone(ctx, 'outline.update');
  authorize(ctx);
  if (unchangedSince(ctx.runtime, ctx.session, step.objects)) {
    const redo = revertObjects(ctx.runtime, ctx.session, step.objects);
    return {
      item: { type: 'outline.update', ...mutator.updated(ref) },
      reverse: [{ ...step, objects: redo, ...swapped(step.fallback) }],
    };
  }
  // Someone changed it since: put back by value what still shows the update.
  const fallback = step.fallback;
  if (fallback?.kind !== 'outline') return leftAlone(ctx, 'outline.update');
  const now = current as unknown as Record<string, unknown>;
  const left = fallback.left as Record<string, unknown>;
  const restore = fallback.restore as Record<string, unknown>;
  const keys = Object.keys(left);
  const kept = keys.filter(
    (key) => valuesEqual(now[key], left[key]) && writable(key, restore[key]),
  );
  if (kept.length === 0) return leftAlone(ctx, 'outline.update');
  const patch = Object.fromEntries(kept.map((key) => [key, restore[key]]));
  const done = writeUpdate(ctx, ref, patch as OutlineItemPatch<PdfDestination>, current);
  const skipped = keys.filter((key) => !kept.includes(key));
  if (skipped.length === 0 || done.item.type !== 'outline.update') return done;
  return { ...done, item: { ...done.item, skipped } };
}

/**
 * Deletes what a create or a restore brought back, while the item and the
 * items under it read exactly as the change left them.
 */
export function removeOutlineItem(ctx: ChangeContext, step: OutlineRemoveStep): Done {
  const mutator = mutatorOf(ctx);
  const tree = mutator.tree();
  if (!tree.has(step.ref.objectNumber)) return leftAlone(ctx, 'outline.delete');
  authorize(ctx);
  if (!valuesEqual(mutator.subtree(step.ref.objectNumber, tree), step.left)) {
    return leftAlone(ctx, 'outline.delete');
  }
  return writeDelete(ctx, step.ref);
}

/** Brings back what a delete removed, while its parent is there and it isn't back already. */
export function restoreOutlineItem(ctx: ChangeContext, step: OutlineRestoreStep): Done {
  const mutator = mutatorOf(ctx);
  const tree = mutator.tree();
  if (tree.has(step.ref.objectNumber)) return leftAlone(ctx, 'outline.restore');
  if (step.parent && !tree.has(step.parent.objectNumber)) {
    return leftAlone(ctx, 'outline.restore');
  }
  authorize(ctx);
  importOutlineItem(ctx.runtime, ctx.session.requireDocPtr(), step.capture);
  const result = mutator.restored(step.ref.objectNumber);
  return {
    item: { type: 'outline.restore', ...result },
    reverse: [{ kind: 'outline.remove', ref: step.ref, left: result.items }],
  };
}

/**
 * Puts items back where a move found them: each still under the parent the
 * move left it under, its old parent still there, and not under itself.
 */
export function moveOutlineItemsBack(ctx: ChangeContext, step: OutlineMoveStep): Done {
  const mutator = mutatorOf(ctx);
  const tree = mutator.tree();
  const leftUnder = new Map(step.left.map(({ item, parent }) => [item, parent]));
  const placements = step.placements.filter(
    ({ item, parent }) =>
      tree.parentOf(item) === leftUnder.get(item) &&
      (parent === OUTLINE_TOP || tree.has(parent)) &&
      !tree.isAtOrUnder(parent, item),
  );
  if (placements.length === 0) return leftAlone(ctx, 'outline.move');
  authorize(ctx);
  const back = mutator.placementsOf(
    placements.map(({ item }) => item),
    tree,
  );
  const result = mutator.place(placements, tree);
  return {
    item: { type: 'outline.move', ...result },
    reverse: [
      {
        kind: 'outline.move',
        placements: back,
        left: placements.map(({ item, parent }) => ({ item, parent })),
      },
    ],
  };
}

/** An update, captured so it can be put back exactly. */
function writeUpdate(
  ctx: ChangeContext,
  ref: OutlineItemRef,
  patch: OutlineItemPatch<PdfDestination>,
  before: OutlineItem<PdfDestination>,
): Done {
  const pending = captureBefore(ctx.runtime, ctx.session, [
    { objectNumber: ref.objectNumber, deep: TARGET_KEYS },
  ]);
  const result = mutatorOf(ctx).update(ref, patch);
  const objects = captureAfter(ctx.runtime, ctx.session, pending);
  return {
    item: { type: 'outline.update', ...result },
    reverse: [
      {
        kind: 'objects.revert',
        reports: 'outline.update',
        objects,
        subject: { outlineItem: ref },
        fallback: fallbackOf(before, result.item, patch),
      },
    ],
  };
}

/** A delete, captured in its transaction so an undo brings back the same objects. */
function writeDelete(ctx: ChangeContext, ref: OutlineItemRef): Done {
  const mutator = mutatorOf(ctx);
  const parent = mutator.tree().parentOf(ref.objectNumber);
  const capture = exportOutlineItem(ctx.runtime, ctx.session.requireDocPtr(), ref.objectNumber);
  const result = mutator.delete(ref);
  return {
    item: { type: 'outline.delete', ...result },
    reverse: [
      {
        kind: 'outline.restore',
        ref,
        parent: parent === undefined || parent === OUTLINE_TOP ? null : toOutlineItemRef(parent),
        capture,
      },
    ],
  };
}

function requireItem(ctx: ChangeContext, ref: OutlineItemRef): OutlineItem<PdfDestination> {
  const item = mutatorOf(ctx).find(ref);
  if (!item) {
    throw new EngineError(EngineErrorCode.NotFound, `no outline item ${ref.objectNumber}`, {
      details: { field: 'ref' },
    });
  }
  return item;
}

/** The fields an update changed: their values before, and the values it left. */
function fallbackOf(
  before: OutlineItem<PdfDestination>,
  after: OutlineItem<PdfDestination>,
  patch: OutlineItemPatch<PdfDestination>,
): RevertFallback {
  const changed = FIELDS.filter(
    (field) => patch[field] !== undefined && !valuesEqual(before[field], after[field]),
  );
  return {
    kind: 'outline',
    restore: Object.fromEntries(changed.map((field) => [field, before[field]])),
    left: Object.fromEntries(changed.map((field) => [field, after[field]])),
  };
}

/** Whether a value read back can be written again: a target another app made may not be. */
function writable(field: string, value: unknown): boolean {
  if (field !== 'target' || value === null) return true;
  const target = value as { kind: string; name?: string };
  if (target.kind === 'goto' || target.kind === 'uri') return true;
  return (
    target.kind === 'named' &&
    ['NextPage', 'PrevPage', 'FirstPage', 'LastPage'].includes(target.name ?? '')
  );
}

function swapped(fallback: RevertFallback | undefined): { fallback?: RevertFallback } {
  if (fallback?.kind !== 'outline') return fallback ? { fallback } : {};
  return { fallback: { kind: 'outline', restore: fallback.left, left: fallback.restore } };
}
