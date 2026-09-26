/**
 * The release of an edit gesture: the previewed result becomes the records'
 * new geometry, and one patch effect per changed record asks for the write.
 * A grab that changed nothing writes nothing.
 */
import { anchorModeOf, unanchoredGeom } from '../anchor';
import {
  geomRotateAbout,
  geomScaleAbout,
  geomTranslate,
  groupResizeFactors,
  rotatePoint,
} from '../geometry';
import {
  moveMeasurementCaption,
  shapeMeasurementReadout,
  transformMeasurementCaption,
} from '../measurement-shape';
import type { Effect, Model, ModelAnnotation } from '../types';
import { commitViewGesture, geomEqual, geometryPatch, ownGeometry, translateRect } from './changes';
import { rotateDraftDelta } from './edit';

export function editUp(model: Model): [Model, Effect[]] {
  const draft = model.draft!;
  if (draft.kind === 'leader') {
    const annotation = model.byId[draft.id];
    if (annotation?.measure?.intent !== 'line-dimension' || draft.delta === 0) {
      return [{ ...model, draft: null }, []];
    }

    const measure = annotation.measure;
    const updated: ModelAnnotation = {
      ...annotation,
      source: 'vector',
      measure: {
        ...measure,
        leader: {
          ...measure.leader,
          length: (measure.leader?.length ?? 0) + draft.delta,
        },
      },
    };

    return [
      { ...model, draft: null, byId: { ...model.byId, [updated.id]: updated } },
      [{ type: 'patch', id: updated.id, scope: { kind: 'leader' } }],
    ];
  }
  if (draft.kind === 'caption') {
    const annotation = model.byId[draft.id];
    if (!annotation?.measure || (!draft.delta.x && !draft.delta.y))
      return [{ ...model, draft: null }, []];
    return [
      {
        ...model,
        draft: null,
        byId: {
          ...model.byId,
          [annotation.id]: {
            ...annotation,
            source: 'vector',
            measure: moveMeasurementCaption(
              annotation.geometry,
              annotation.measure,
              draft.delta,
              annotation.style,
            ),
          },
        },
      },
      [{ type: 'patch', id: annotation.id, scope: { kind: 'caption' } }],
    ];
  }
  if (draft.kind === 'handle') {
    // A grab that didn't actually resize leaves the appearance untouched → keep
    // it baked, no engine write.
    if (geomEqual(draft.base, draft.current)) return [{ ...model, draft: null }, []];
    // A resize changes the appearance: we own it now → live (vector) render
    // (opaque-body kinds stay baked; the engine re-fits their AP natively).
    // `cur` is view-space (the projected geometry the user dragged); the
    // commit maps it back to stored space — the identity when un-flagged.
    const before = model.byId[draft.id];
    const stored = unanchoredGeom(draft.current, anchorModeOf(before), draft.view);
    if (before.measure?.intent === 'polygon-dimension') {
      const readout = shapeMeasurementReadout(stored, before.measure);
      if ('unavailable' in readout && readout.unavailable === 'invalid-geometry') {
        return [{ ...model, draft: null }, []];
      }
    }
    const annotation = ownGeometry({ ...before, geometry: stored });
    return [
      { ...model, byId: { ...model.byId, [draft.id]: annotation }, draft: null },
      [geometryPatch(draft.id)],
    ];
  }
  if (draft.kind === 'rotate') {
    const { delta } = rotateDraftDelta(model, draft);
    if (Math.abs(delta) < 0.01) return [{ ...model, draft: null }, []];
    const byId = { ...model.byId };
    const fx: Effect[] = [];
    for (const id of draft.ids) {
      const annotation = byId[id];
      if (!annotation) continue;
      // rotation re-bakes the appearance → live (vector) render + patch. The
      // gesture composed in view space (`effGeom`); the commit replays the
      // same composition and unprojects — a screen-anchored member's authored
      // tilt turns WYSIWYG, exactly as previewed.
      const rotated = commitViewGesture(annotation, draft.view, (geometry) =>
        geomRotateAbout(geometry, draft.pivot, delta),
      );
      const measure = transformMeasurementCaption(annotation.measure, (point) =>
        rotatePoint(point, draft.pivot, delta),
      );
      byId[id] = ownGeometry({ ...annotation, geometry: rotated, measure });
      fx.push(geometryPatch(id));
    }
    return [{ ...model, byId, draft: null }, fx];
  }
  if (draft.kind === 'group') {
    const { sx, sy } = groupResizeFactors(draft.base, draft.current);
    if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return [{ ...model, draft: null }, []];
    const byId = { ...model.byId };
    const fx: Effect[] = [];
    for (const id of draft.ids) {
      const annotation = byId[id];
      if (!annotation) continue;
      const scaled = commitViewGesture(annotation, draft.view, (geometry) =>
        geomScaleAbout(geometry, draft.anchor, sx, sy),
      );
      const measure = transformMeasurementCaption(annotation.measure, (point) => ({
        x: draft.anchor.x + (point.x - draft.anchor.x) * sx,
        y: draft.anchor.y + (point.y - draft.anchor.y) * sy,
      }));
      byId[id] = ownGeometry({ ...annotation, geometry: scaled, measure });
      fx.push(geometryPatch(id));
    }
    return [{ ...model, byId, draft: null }, fx];
  }
  if (draft.kind === 'move') {
    if (Math.hypot(draft.delta.x, draft.delta.y) < 0.01) return [{ ...model, draft: null }, []]; // a click
    const byId = { ...model.byId };
    const fx: Effect[] = [];
    for (const id of draft.ids) {
      const annotation = byId[id];
      // A move is a rigid translation — the appearance is unchanged, so a baked
      // annotation stays baked and its raster box rides along. Source preserved.
      byId[id] = {
        ...annotation,
        geometry: geomTranslate(annotation.geometry, draft.delta),
        measure: transformMeasurementCaption(annotation.measure, (point) => ({
          x: point.x + draft.delta.x,
          y: point.y + draft.delta.y,
        })),
        apBox: annotation.apBox ? translateRect(annotation.apBox, draft.delta) : undefined,
      };
      fx.push({ type: 'patch', id, scope: { kind: 'geometry' } }); // a move never invalidates the raster
    }
    return [{ ...model, byId, draft: null }, fx];
  }
  return [{ ...model, draft: null }, []];
}
