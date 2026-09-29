/**
 * The release of an edit gesture: the previewed result becomes the records'
 * new geometry, and one patch effect per changed record asks for the write.
 * A grab that changed nothing writes nothing.
 */
import { anchorModeOf, unanchoredGeom } from '../anchor';
import { geomRotateAbout, geomScaleAbout, geomTranslate, groupResizeFactors } from '../geometry';
import { measurementOf } from '../measurement';
import { moveMeasurementCaption, shapeMeasurementReadout } from '../measurement-shape';
import { fieldsOf, shapeOf, withShape, withValues } from '../record';
import type { Effect, Model } from '../types';
import { commitViewGesture, geomEqual } from './changes';
import { rotateDraftDelta } from './edit';

export function editUp(model: Model): [Model, Effect[]] {
  const draft = model.draft!;
  if (draft.kind === 'leader') {
    const annotation = model.byId[draft.id];
    const measure = annotation && measurementOf(annotation.annotation);
    if (measure?.intent !== 'line-dimension' || draft.delta === 0) {
      return [{ ...model, draft: null }, []];
    }

    const updated = withValues(annotation!, {
      leader: { ...measure.leader, length: (measure.leader?.length ?? 0) + draft.delta },
    });

    return [{ ...model, draft: null, byId: { ...model.byId, [updated.id]: updated } }, []];
  }
  if (draft.kind === 'caption') {
    const annotation = model.byId[draft.id];
    const measure = annotation && measurementOf(annotation.annotation);
    if (!measure || (!draft.delta.x && !draft.delta.y)) return [{ ...model, draft: null }, []];
    const { style } = fieldsOf(annotation!);
    const caption = moveMeasurementCaption(
      shapeOf(annotation!.annotation),
      measure,
      draft.delta,
      style,
    );
    // A distance's caption offset is a field of its own; a perimeter's or
    // area's caption center is its shape's.
    const moved =
      caption.measure.intent === 'line-dimension'
        ? withValues(annotation!, { captionOffset: caption.measure.captionOffset })
        : withShape(annotation!, caption.geometry);
    return [{ ...model, draft: null, byId: { ...model.byId, [moved.id]: moved } }, []];
  }
  if (draft.kind === 'handle') {
    // A grab that didn't actually resize writes nothing.
    if (geomEqual(draft.base, draft.current)) return [{ ...model, draft: null }, []];
    // `cur` is view-space (the projected geometry the user dragged); the
    // commit maps it back to stored space — the identity when un-flagged.
    const before = model.byId[draft.id];
    const stored = unanchoredGeom(draft.current, anchorModeOf(before), draft.view);
    const measure = measurementOf(before.annotation);
    if (measure?.intent === 'polygon-dimension') {
      const readout = shapeMeasurementReadout(stored, measure);
      if ('unavailable' in readout && readout.unavailable === 'invalid-geometry') {
        return [{ ...model, draft: null }, []];
      }
    }
    const annotation = withShape(before, stored);
    return [{ ...model, byId: { ...model.byId, [draft.id]: annotation }, draft: null }, []];
  }
  if (draft.kind === 'rotate') {
    const { delta } = rotateDraftDelta(model, draft);
    if (Math.abs(delta) < 0.01) return [{ ...model, draft: null }, []];
    const byId = { ...model.byId };
    for (const id of draft.ids) {
      const annotation = byId[id];
      if (!annotation) continue;
      // The gesture composed in view space (`effGeom`); the commit replays the
      // same composition and unprojects — a screen-anchored member's authored
      // tilt turns WYSIWYG, exactly as previewed. A measurement's caption
      // center turns with its shape.
      const rotated = commitViewGesture(annotation, draft.view, (geometry) =>
        geomRotateAbout(geometry, draft.pivot, delta),
      );
      byId[id] = withShape(annotation, rotated);
    }
    return [{ ...model, byId, draft: null }, []];
  }
  if (draft.kind === 'group') {
    const { sx, sy } = groupResizeFactors(draft.base, draft.current);
    if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return [{ ...model, draft: null }, []];
    const byId = { ...model.byId };
    for (const id of draft.ids) {
      const annotation = byId[id];
      if (!annotation) continue;
      const scaled = commitViewGesture(annotation, draft.view, (geometry) =>
        geomScaleAbout(geometry, draft.anchor, sx, sy),
      );
      byId[id] = withShape(annotation, scaled);
    }
    return [{ ...model, byId, draft: null }, []];
  }
  if (draft.kind === 'move') {
    if (Math.hypot(draft.delta.x, draft.delta.y) < 0.01) return [{ ...model, draft: null }, []]; // a click
    const byId = { ...model.byId };
    for (const id of draft.ids) {
      const annotation = byId[id];
      const geometry = shapeOf(annotation.annotation);
      byId[id] = withShape(annotation, geomTranslate(geometry, draft.delta));
    }
    return [{ ...model, byId, draft: null }, []];
  }
  return [{ ...model, draft: null }, []];
}
