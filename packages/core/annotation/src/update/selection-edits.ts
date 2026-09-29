/**
 * Edits the toolbar applies to the whole selection: fields, text formats,
 * links, flags, quarter turns, reset rotation, delete. Each changed record's
 * change is its own engine write (`update` derives it from the change set).
 */
import {
  ANNOTATION_FIELD_NAMES,
  annotationPatchBetween,
  mergeAnnotationPatch,
  type AnnotationFlags,
  type AnnotationPatch,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';

import {
  annotContentsEditable,
  annotDeletable,
  annotTransformable,
  flagsEqual,
  mergeFlags,
} from '../flags';
import { geomResetRotation, geomRotateAbout, geomRotation, rotatePoint } from '../geometry';
import { groupUnionBounds } from '../hit';
import { capsFor, fieldsFor } from '../kinds';
import { linkChildrenOf } from '../links';
import { transformMeasurementCaption } from '../measurement-shape';
import { kindTakesLink } from '../props';
import { fieldsOf, withFields } from '../record';
import { annotationTurnPivot } from '../selection';
import type { Effect, FieldValues, Id, Model, ModelAnnotation, Point } from '../types';
import { ownGeometry, toVector, withoutRecords } from './changes';

/** The text fields: `lockedContents` gates them, not `locked`. */
const CONTENT_FIELDS: ReadonlySet<string> = new Set(['contents', 'richText']);

/**
 * The fields of `patch` a record takes now: those its kind has, and of those
 * the ones it may change — its text unless `lockedContents`, the rest unless
 * `locked`. Flags unlock through their own message.
 */
function writableFields(record: ModelAnnotation, patch: FieldValues): Record<string, unknown> {
  const declared = ANNOTATION_FIELD_NAMES[record.annotation.subtype];
  const fields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined || name === 'subtype' || !declared.includes(name)) continue;
    const allowed = CONTENT_FIELDS.has(name)
      ? annotContentsEditable(record)
      : annotTransformable(record);
    if (allowed) fields[name] = value;
  }
  return fields;
}

/**
 * Write engine fields to records, a patch per id. Each record takes the
 * fields its kind has and may change now (`writableFields`) and ignores the
 * rest, so one message restyles a mixed selection. A changed record flips to
 * `vector` (we own the appearance now), except `opaqueBody` kinds (widgets):
 * they have no vector render, and the engine's re-baked raster replaces
 * theirs. A value set to what it was is no change. The tool defaults are
 * never touched: editing existing annotations doesn't change the next one drawn.
 */
export function setFields(
  model: Model,
  patches: Readonly<Record<Id, FieldValues>>,
): [Model, Effect[]] {
  let byId: Model['byId'] | null = null;
  for (const [id, patch] of Object.entries(patches)) {
    const record = model.byId[id];
    if (!record) continue;
    const fields = writableFields(record, patch);
    if (!Object.keys(fields).length) continue;
    const annotation = mergeAnnotationPatch(record.annotation, {
      ...fields,
      subtype: record.annotation.subtype,
    } as AnnotationPatch);
    if (!Object.keys(annotationPatchBetween(record.annotation, annotation)).length) continue;
    const next = { ...record, annotation };
    byId ??= { ...model.byId };
    byId[id] = capsFor(record.subtype).opaqueBody ? next : toVector(next);
  }
  return byId ? [{ ...model, byId }, []] : [model, []];
}

/**
 * Bold, italic or underline on or off for the selection's text bodies: each
 * member whose kind takes the format. Runs keep their own formatting; the
 * editor's range edits them instead.
 */
export function setTextFormat(
  model: Model,
  format: 'bold' | 'italic' | 'underline',
  on: boolean,
): [Model, Effect[]] {
  let byId: Model['byId'] | null = null;
  for (const id of model.selected) {
    const record = model.byId[id];
    if (!record || !annotTransformable(record)) continue;
    if (!fieldsFor(record.subtype).some((spec) => spec.key === format)) continue;
    const { text } = fieldsOf(record);
    if (!text || (text[format] ?? false) === on) continue;
    byId ??= { ...model.byId };
    byId[id] = toVector(withFields(record, { text: { ...text, [format]: on } }));
  }
  return byId ? [{ ...model, byId }, []] : [model, []];
}

/**
 * Link the selection to `target`, or unlink it (`null`). The link kind's own
 * `/A` is a field of it; every other linkable kind's link lives in attached
 * child annotations, so it rides a `syncLink` effect and the plugin's
 * reconciler writes the children. Locked annotations refuse it.
 */
export function setLink(model: Model, target: PdfLinkTarget | null): [Model, Effect[]] {
  let byId: Model['byId'] | null = null;
  const fx: Effect[] = [];
  for (const id of model.selected) {
    const record = model.byId[id];
    if (!record || !annotTransformable(record) || !kindTakesLink(record.subtype)) continue;
    if (record.subtype !== 'link') {
      fx.push({ type: 'syncLink', id, target });
      continue;
    }
    const next = withFields(record, { link: target });
    if (next === record) continue;
    byId ??= { ...model.byId };
    byId[id] = next;
  }
  return [byId ? { ...model, byId } : model, fx];
}

/**
 * Merge a `/F` flags patch into the selection (or explicit ids). Not the props
 * path, on purpose: flags aren't appearance — members keep their render
 * `source` (a baked raster stays valid; nothing re-bakes) — and the write is
 * not gated by `locked`, because unlocking a locked annotation is the whole
 * point (Acrobat's Locked checkbox stays live). Each changed member writes the
 * flags that changed.
 */
/**
 * The actions plane's session-visibility write (Hide actions, script
 * `annot.hidden`): merge per-id hidden overrides into the session overlay.
 * Pure session state — zero effects, no engine write, no authority. Hiding
 * clears transient engagement so no orphaned selection chrome or text editor
 * survives on an invisible annotation. Identity-preserving no-op when nothing
 * changes (plugin memo caches key on model identity).
 */

export function setFlags(
  model: Model,
  patch: Partial<AnnotationFlags>,
  ids?: Id[],
): [Model, Effect[]] {
  const targets = ids ?? model.selected;
  if (!targets.length) return [model, []];
  let byId: Model['byId'] | null = null;
  for (const id of targets) {
    const annotation = (byId ?? model.byId)[id];
    if (!annotation) continue;
    const current = fieldsOf(annotation).flags;
    const flags = mergeFlags(current, patch);
    if (flagsEqual(flags, current)) continue; // no spurious engine writes
    byId ??= { ...model.byId };
    byId[id] = withFields(annotation, { flags });
  }
  return byId ? [{ ...model, byId }, []] : [model, []];
}

/**
 * Rotate the current selection by `deltaDeg` (clockwise) — the toolbar
 * "rotate 90°" affordance. A single shape turns about its own centre; a
 * multi-target group about the union-box centre (gated by `groupRotatable` for
 * groups, `rotatable` for a single shape). Emits one patch per rotated member.
 */
export function rotateSelection(model: Model, deltaDeg: number): [Model, Effect[]] {
  const ids = model.selected.filter((id) => {
    const annotation = model.byId[id];
    return annotation && annotTransformable(annotation) && capsFor(annotation.subtype).rotatable;
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
    const annotation = model.byId[ids[0]];
    pivot = annotationTurnPivot(annotation);
  } else {
    const page = model.byId[ids[0]].page;
    const union = groupUnionBounds({ ...model, selected: ids }, page);
    if (!union) return [model, []];
    pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
  }
  const byId = { ...model.byId };
  for (const id of ids) {
    const annotation = byId[id];
    const { geometry, measure } = fieldsOf(annotation);
    byId[id] = ownGeometry(
      withFields(annotation, {
        geometry: geomRotateAbout(geometry, pivot, deltaDeg),
        measure: transformMeasurementCaption(measure, (point) =>
          rotatePoint(point, pivot, deltaDeg),
        ),
      }),
    );
  }
  return [{ ...model, byId }, []];
}

/** Reset rotation on the selection to the as-authored orientation. For a
 *  screen-anchored annotation that is its on-screen orientation, so reset is
 *  as meaningful as for anyone else. */
export function resetRotation(model: Model): [Model, Effect[]] {
  const byId = { ...model.byId };
  let turned = false;
  for (const id of model.selected) {
    const annotation = byId[id];
    if (!annotation || !annotTransformable(annotation)) continue;
    const { geometry, measure } = fieldsOf(annotation);
    const turn = geomRotation(geometry);
    if (turn === 0) continue;
    const pivot = annotationTurnPivot(annotation);
    byId[id] = ownGeometry(
      withFields(annotation, {
        geometry: geomResetRotation(geometry, pivot),
        measure: transformMeasurementCaption(measure, (point) => rotatePoint(point, pivot, -turn)),
      }),
    );
    turned = true;
  }
  return turned ? [{ ...model, byId }, []] : [model, []];
}

export function deleteSelection(model: Model): [Model, Effect[]] {
  // `locked` (and inert `/F` states) protect against deletion — only the
  // transformable members go; the rest keep their selection, so a mixed
  // selection deletes what it may and leaves the frozen ones visibly selected.
  const deletable = model.selected.filter((id) => {
    const annotation = model.byId[id];
    return !!annotation && annotDeletable(annotation);
  });
  if (!deletable.length) return [model, []];
  // Attached link children die with their parent. They are model
  // annotations now, so expanding the deletable set makes the one loop
  // below handle parent and children uniformly — no side ledger.
  const withChildren = [
    ...deletable,
    ...deletable.flatMap((id) => linkChildrenOf(model, id).map((annotation) => annotation.id)),
  ];
  const fx: Effect[] = withChildren
    .filter((id) => model.byId[id])
    .map((id): Effect => ({ type: 'delete', id }));
  return [{ ...withoutRecords(model, withChildren), draft: null }, fx];
}
