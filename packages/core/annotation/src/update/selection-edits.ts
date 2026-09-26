/**
 * Edits the toolbar applies to the whole selection: restyle, flags, quarter
 * turns, reset rotation, delete. Each changed record gets its own effect.
 */
import type { AnnotationFlags } from '@embedpdf/engine-core/runtime';

import { annotDeletable, annotTransformable, flagsEqual, mergeFlags } from '../flags';
import { geomResetRotation, geomRotateAbout, geomRotation, rotatePoint } from '../geometry';
import { groupUnionBounds } from '../hit';
import { capsFor } from '../kinds';
import { linkChildrenOf } from '../links';
import { transformMeasurementCaption } from '../measurement-shape';
import { applyProps, kindTakesLink } from '../props';
import { annotationSelectionFrame } from '../selection';
import type { AnnotationPropsPatch, Effect, Id, Model, Point, PropKey } from '../types';
import { geometryPatch, ownGeometry, toVector, withoutRecords } from './changes';

/**
 * Apply a flat property patch to the current selection. Each member takes only
 * the keys its kind declares (see `applyProps` — routing to `style`, `geom.ends`
 * or `text` happens there) and ignores the rest, so one patch restyles a mixed
 * selection. Changed members flip to `vector` (we own the appearance now) and
 * emit one engine patch each. The base style / tool defaults are never touched:
 * editing existing annotations must not change what the next drawn one looks like.
 */
export function setProps(model: Model, patch: AnnotationPropsPatch): [Model, Effect[]] {
  if (!model.selected.length) return [model, []];
  const byId = { ...model.byId };
  const fx: Effect[] = [];
  // The effect carries the user's keys verbatim — the shell lowers exactly
  // this intent to wire fields; the changed-prop set is the artifact.
  const keys = (Object.keys(patch) as PropKey[]).filter((propKey) => patch[propKey] !== undefined);
  for (const id of model.selected) {
    const annotation = byId[id];
    if (!annotation) continue;
    // The `link` slot is not appearance and not model state on a non-link
    // kind: the value lives in attached child annotations (the `linkOf`
    // lens reads them back), so the intent is read off the PATCH and rides
    // the target-carrying `syncLink` — the shell's reconciler owns the child
    // operations. Locked annotations refuse it like any other prop write.
    const linkIntent =
      patch.link !== undefined &&
      annotation.subtype !== 'link' &&
      kindTakesLink(annotation.subtype) &&
      annotTransformable(annotation);
    const next = applyProps(annotation, patch);
    if (!next) {
      // Nothing applied to the model (link-only patch on a parent, or an
      // undeclared key) — the link intent still materializes.
      if (linkIntent) fx.push({ type: 'syncLink', id, target: patch.link ?? null });
      continue;
    }
    const linkChanged = next.link !== annotation.link;
    const otherChanged =
      next.style !== annotation.style ||
      next.geometry !== annotation.geometry ||
      next.text !== annotation.text ||
      next.icon !== annotation.icon;
    // A restyle flips to vector (we own the appearance now) — except
    // `opaqueBody` kinds (widgets), which have no vector render: they stay
    // baked and the shell re-fetches the engine's re-baked raster on resolve.
    // Flipping them would also drop them out of `appearanceEpoch`, freezing
    // their raster forever.
    byId[id] = capsFor(annotation.subtype).opaqueBody || !otherChanged ? next : toVector(next);
    // The link kind's target lives on its own DTO — a plain engine patch.
    if (otherChanged || (linkChanged && annotation.subtype === 'link'))
      fx.push({ type: 'patch', id, scope: { kind: 'props', keys } });
    if (linkIntent) fx.push({ type: 'syncLink', id, target: patch.link ?? null });
  }
  return fx.length ? [{ ...model, byId }, fx] : [model, []];
}

/**
 * Merge a `/F` flags patch into the selection (or explicit ids). Not the props
 * path, on purpose: flags aren't appearance — members keep their render
 * `source` (a baked raster stays valid; nothing re-bakes) — and the write is
 * not gated by `locked`, because unlocking a locked annotation is the whole
 * point (Acrobat's Locked checkbox stays live). One `flags` effect per changed
 * member.
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
  const fx: Effect[] = [];
  let byId: Model['byId'] | null = null;
  for (const id of targets) {
    const annotation = (byId ?? model.byId)[id];
    if (!annotation) continue;
    const flags = mergeFlags(annotation.flags, patch);
    if (flagsEqual(flags, annotation.flags)) continue; // no spurious engine writes
    byId ??= { ...model.byId };
    byId[id] = { ...annotation, flags };
    fx.push({ type: 'flags', id });
  }
  return byId ? [{ ...model, byId }, fx] : [model, []];
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
  // pivot: a single shape's own selection-rect centre (so vertex kinds spin in
  // place, not about their off-centre vertex mean); a group's union-box centre.
  // Stored space throughout — a screen-anchored member's authored tilt turns,
  // which is exactly its on-screen tilt (the display adds nothing to it); at
  // high zoom the anchor may re-seat by a hair, which the toolbar action
  // accepts (the knob gesture, which is pointer-exact, goes through the
  // view-space commit instead).
  let pivot: Point;
  if (ids.length === 1) {
    const annotation = model.byId[ids[0]];
    pivot = annotationSelectionFrame(annotation).center;
  } else {
    const page = model.byId[ids[0]].page;
    const union = groupUnionBounds({ ...model, selected: ids }, page);
    if (!union) return [model, []];
    pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
  }
  const byId = { ...model.byId };
  const fx: Effect[] = [];
  for (const id of ids) {
    const annotation = byId[id];
    const before = annotation.geometry;
    byId[id] = ownGeometry({
      ...annotation,
      geometry: geomRotateAbout(before, pivot, deltaDeg),
      measure: transformMeasurementCaption(annotation.measure, (point) =>
        rotatePoint(point, pivot, deltaDeg),
      ),
    });
    fx.push(geometryPatch(id));
  }
  return [{ ...model, byId }, fx];
}

/** Reset rotation on the selection to the as-authored orientation. For a
 *  screen-anchored annotation that is its on-screen orientation, so reset is
 *  as meaningful as for anyone else. */
export function resetRotation(model: Model): [Model, Effect[]] {
  const byId = { ...model.byId };
  const fx: Effect[] = [];
  for (const id of model.selected) {
    const annotation = byId[id];
    if (!annotation || !annotTransformable(annotation) || geomRotation(annotation.geometry) === 0)
      continue;
    byId[id] = ownGeometry({
      ...annotation,
      geometry: geomResetRotation(annotation.geometry, annotationSelectionFrame(annotation).center),
      measure: transformMeasurementCaption(annotation.measure, (point) =>
        rotatePoint(
          point,
          annotationSelectionFrame(annotation).center,
          -geomRotation(annotation.geometry),
        ),
      ),
    });
    fx.push(geometryPatch(id));
  }
  return fx.length ? [{ ...model, byId }, fx] : [model, []];
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
