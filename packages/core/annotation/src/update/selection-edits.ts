/**
 * Edits the toolbar applies to the whole selection: fields, text formats,
 * links, flags, quarter turns, reset rotation, delete. Each changed record's
 * change is its own engine write (`update` derives it from the change set).
 */
import type { AnnotationFlags, PdfLinkTarget, RichTextBody } from '@embedpdf/engine-core/runtime';

import { annotDeletable, annotTransformable } from '../flags';
import { geomResetRotation, geomRotateAbout, geomRotation } from '../geometry';
import { groupUnionBounds } from '../hit';
import { linkChildrenOf } from '../links';
import { kindTakesLink } from '../props';
import { kindOf, shapeOf, withShape, withValues, writableTarget } from '../record';
import { annotationTurnPivot } from '../selection';
import type { Effect, FieldValues, Id, Model, ModelAnnotation, Point } from '../types';
import { withoutRecords } from './changes';

type TextFormat = 'bold' | 'italic' | 'underline';

/**
 * The model with `change` applied to each record of `ids` (a record listed
 * twice sees its first change). The same model when no record changes.
 */
function changeRecords(
  model: Model,
  ids: readonly Id[],
  change: (record: ModelAnnotation) => ModelAnnotation,
): Model {
  let byId: Model['byId'] | null = null;
  for (const id of ids) {
    const record = (byId ?? model.byId)[id];
    if (!record) continue;
    const next = change(record);
    if (next === record) continue;
    byId ??= { ...model.byId };
    byId[id] = next;
  }
  return byId ? { ...model, byId } : model;
}

/**
 * Write engine fields to records, a patch per id, each through `withValues`:
 * a record takes the fields its kind has and may change now, so one message
 * restyles a mixed selection, and a `rect` the engine would refuse throws.
 * The tool defaults are never touched: editing existing annotations doesn't
 * change the next one drawn.
 */
export function setFields(
  model: Model,
  patches: Readonly<Record<Id, FieldValues>>,
): [Model, Effect[]] {
  const next = changeRecords(model, Object.keys(patches), (record) =>
    withValues(record, patches[record.id]!),
  );
  return [next, []];
}

/** Does a free text's body carry `format`, as the sidebar shows it? */
function bodyHas(body: RichTextBody, format: TextFormat): boolean {
  if (format === 'bold') return body.weight >= 600;
  if (format === 'italic') return body.italic;
  return body.decoration.includes('underline');
}

/** The body with `format` on or off, the rest of it as it was. */
function bodyWith(body: RichTextBody, format: TextFormat, on: boolean): RichTextBody {
  if (format === 'bold') return { ...body, weight: on ? 700 : 400 };
  if (format === 'italic') return { ...body, italic: on };
  const lines = body.decoration.filter((line) => line !== 'underline');
  return { ...body, decoration: on ? [...lines, 'underline'] : lines };
}

/**
 * Bold, italic or underline on or off for the selection's free texts. A
 * format is the rich text's body, so every run that doesn't set its own
 * follows; the editor's range formats runs instead.
 */
export function setTextFormat(model: Model, format: TextFormat, on: boolean): [Model, Effect[]] {
  const next = changeRecords(model, model.selected, (record) => {
    const annotation = record.annotation;
    if (annotation.subtype !== 'free-text') return record;
    const { body, paragraphs } = annotation.richText;
    if (bodyHas(body, format) === on) return record;
    return withValues(record, { richText: { body: bodyWith(body, format, on), paragraphs } });
  });
  return [next, []];
}

/**
 * Link the selection to `target`, or unlink it (`null`). A link annotation's
 * target is a field of it. Every other linkable kind's link lives in
 * attached child annotations, so it rides a `syncLink` effect and the
 * plugin's reconciler writes the children. Locked annotations refuse it.
 */
export function setLink(model: Model, target: PdfLinkTarget | null): [Model, Effect[]] {
  const fx: Effect[] = [];
  const links: Id[] = [];
  for (const id of model.selected) {
    const record = model.byId[id];
    if (!record || !annotTransformable(record) || !kindTakesLink(kindOf(record.annotation)))
      continue;
    if (record.annotation.subtype === 'link') links.push(id);
    else fx.push({ type: 'syncLink', id, target });
  }
  // A read-only target (a script, a named action) is carried, never written.
  if (target && !writableTarget(target)) return [model, fx];
  return [changeRecords(model, links, (record) => withValues(record, { target })), fx];
}

/**
 * Merge `/F` flags into the selection (or explicit ids), through
 * `withValues`: a flag is writable with update authority alone, so a locked
 * annotation unlocks and a hidden one shows. A flag changes no drawing: a
 * baked raster stays baked.
 */
export function setFlags(
  model: Model,
  patch: Partial<AnnotationFlags>,
  ids?: Id[],
): [Model, Effect[]] {
  return [changeRecords(model, ids ?? model.selected, (record) => withValues(record, patch)), []];
}

/**
 * Rotate the current selection by `deltaDeg` (clockwise) — the toolbar
 * "rotate 90°" affordance. A single shape turns about its own centre; a
 * multi-target group about the union-box centre (gated by `groupRotatable` for
 * groups, `rotatable` for a single shape). Emits one patch per rotated member.
 */
export function rotateSelection(model: Model, deltaDeg: number): [Model, Effect[]] {
  const ids = model.selected.filter((id) => {
    const record = model.byId[id];
    return record && annotTransformable(record) && kindOf(record.annotation).caps.rotatable;
  });
  if (!ids.length) return [model, []];
  // pivot: where the engine turns a single shape (`turnPivotOf`: a box's
  // centre, the middle of a point kind's upright points), so a turn changes only
  // its angle; a group's union-box centre.
  // Stored space throughout — a screen-anchored member's authored tilt turns,
  // which is exactly its on-screen tilt (the display adds nothing to it); at
  // high zoom the anchor may re-seat by a hair, which the toolbar action
  // accepts (the knob gesture, which is pointer-exact, goes through the
  // view-space commit instead).
  let pivot: Point;
  if (ids.length === 1) {
    const record = model.byId[ids[0]];
    pivot = annotationTurnPivot(record);
  } else {
    const page = model.byId[ids[0]].annotation.page;
    const union = groupUnionBounds({ ...model, selected: ids }, page);
    if (!union) return [model, []];
    pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
  }
  const byId = { ...model.byId };
  for (const id of ids) {
    const record = byId[id];
    const geometry = shapeOf(record.annotation);
    byId[id] = withShape(record, geomRotateAbout(geometry, pivot, deltaDeg));
  }
  return [{ ...model, byId }, []];
}

/** Reset rotation on the selection to the as-authored orientation. For a
 *  screen-anchored annotation that is its on-screen orientation, so reset is
 *  as meaningful as for anyone else. A kind that doesn't turn keeps its turn:
 *  a caret's follows its text, a callout's stands it upright. */
export function resetRotation(model: Model): [Model, Effect[]] {
  const byId = { ...model.byId };
  let turned = false;
  for (const id of model.selected) {
    const record = byId[id];
    if (!record || !annotTransformable(record) || !kindOf(record.annotation).caps.rotatable)
      continue;
    const geometry = shapeOf(record.annotation);
    if (geomRotation(geometry) === 0) continue;
    const pivot = annotationTurnPivot(record);
    byId[id] = withShape(record, geomResetRotation(geometry, pivot));
    turned = true;
  }
  return turned ? [{ ...model, byId }, []] : [model, []];
}

export function deleteSelection(model: Model): [Model, Effect[]] {
  // `locked` (and inert `/F` states) protect against deletion — only the
  // transformable members go; the rest keep their selection, so a mixed
  // selection deletes what it may and leaves the frozen ones visibly selected.
  const deletable = model.selected.filter((id) => {
    const record = model.byId[id];
    return !!record && annotDeletable(record);
  });
  if (!deletable.length) return [model, []];
  // Attached link children die with their parent. They are model
  // annotations now, so expanding the deletable set makes the one loop
  // below handle parent and children uniformly — no side ledger.
  const withChildren = [
    ...deletable,
    ...deletable.flatMap((id) => linkChildrenOf(model, id).map((record) => record.id)),
  ];
  const fx: Effect[] = withChildren
    .filter((id) => model.byId[id])
    .map((id): Effect => ({ type: 'delete', id }));
  return [{ ...withoutRecords(model, withChildren), draft: null }, fx];
}
