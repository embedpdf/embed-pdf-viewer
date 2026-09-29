/**
 * How an annotation is drawn: from the engine's raster of its appearance
 * (`baked`), or live from its fields (`vector`). Everything that chooses
 * between the two is in this file.
 *
 * After a change, whether a gesture, a sidebar edit or code made it:
 *
 * | The change                                                  | How the record is drawn next                                   |
 * | :---------------------------------------------------------- | :------------------------------------------------------------- |
 * | Nothing visible (a lock, the author, a square's comment)    | Unchanged                                                      |
 * | A pure move                                                 | Unchanged; a baked raster moves the same distance              |
 * | Anything else visible (restyle, resize, turn, text, points) | Live                                                           |
 * | A stamp or a form widget (no live drawing)                  | Always the raster, drawn where its shape is                    |
 *
 * The change is the engine's own verdict (`appearanceChangeOf`): where the
 * engine keeps the appearance it has, so does the view, so an imported
 * appearance moved by a drag looks exactly as it did.
 *
 * During a gesture the same rule holds for the change in progress: a move
 * carries the raster along; a resize, turn, group transform, caption or
 * leader drag draws live, and so does a text box being typed into.
 *
 * A new record draws live: it has no raster until the engine bakes one. A
 * new stamp shows its image.
 *
 * The plugin holds the rest (its `vector` preference): a record this session
 * drew live stays live for the session, and another session's edit hands it
 * back to the engine's raster (`plugin-annotation`, `sync/confirmed.ts`).
 */
import {
  annotationPatchBetween,
  appearanceChangeOf,
  applyAnnotationPatch,
  type AnnotationDTO,
  type AnnotationPatch,
} from '@embedpdf/engine-core/runtime';

import { anchoredBox, anchorModeOf, anchorOf } from './anchor';
import { geomRotation } from './geometry';
import { normalizeDeg } from './rect';
import { kindOf, shapeOf } from './record';
import type { Id, Model, ModelAnnotation, ModelGeometry, Rect, ViewEnv } from './types';

/** The part of a record that says how it is drawn. */
export type DrawState = Pick<ModelAnnotation, 'source' | 'apBox'>;

/** Has the annotation a live drawing? Stamps and form widgets don't: their raster is the drawing. */
const drawsLive = (annotation: AnnotationDTO): boolean => !kindOf(annotation).caps.opaqueBody;

/** How a record this session creates is drawn at first. */
export const sourceOfNew = (annotation: AnnotationDTO): ModelAnnotation['source'] =>
  drawsLive(annotation) ? 'vector' : 'baked';

/**
 * What changes in how `record` is drawn once its annotation is `after`: the
 * rule at the top of this file. Only the fields that change.
 */
export function drawnAfter(record: ModelAnnotation, after: AnnotationDTO): Partial<DrawState> {
  if (!drawsLive(record.annotation)) return {};
  const change = appearanceChangeOf(
    record.annotation,
    annotationPatchBetween(record.annotation, after) as AnnotationPatch,
  );
  switch (change.impact) {
    case 'inert':
      return {};
    case 'translation': {
      const box = record.apBox;
      return box ? { apBox: { ...box, x: box.x + change.by.x, y: box.y + change.by.y } } : {};
    }
    case 'regenerate':
      return record.source === 'vector' ? {} : { source: 'vector' };
  }
}

/** `record` after `patch`: its annotation as the engine will apply the patch, drawn as the rule says. */
export function applyChange(record: ModelAnnotation, patch: AnnotationPatch): ModelAnnotation {
  const annotation = applyAnnotationPatch(record.annotation, patch);
  return { ...record, annotation, ...drawnAfter(record, annotation) };
}

/**
 * How a record is drawn right now, its gesture in progress included: the
 * baked raster can't stretch, tilt or hide its text, so those gestures draw
 * live before their commit decides. A no-op grab leaves the record as it was.
 */
export function sourceDuring(model: Model, id: Id): ModelAnnotation['source'] {
  const record = model.byId[id];
  // No live drawing: the raster follows the gesture (`rasterPlacement`), and
  // the engine's refitted appearance replaces it after the commit.
  if (!drawsLive(record.annotation)) return record.source;
  // A text box being typed into: the raster can't hide just its text, so a
  // blend would show it twice.
  if (model.editing === id && shapeOf(record.annotation).kind === 'text-box') return 'vector';
  const draft = model.draft;
  if (
    (draft?.kind === 'handle' || draft?.kind === 'caption' || draft?.kind === 'leader') &&
    draft.id === id
  )
    return 'vector';
  if ((draft?.kind === 'rotate' || draft?.kind === 'group') && draft.ids.includes(id))
    return 'vector';
  return record.source;
}

/**
 * Where a record's raster is drawn right now, in view space: its box and the
 * turn to put back about its middle.
 *
 * - A stamp or form widget: where its shape is (`shapeNow`, the gesture in
 *   progress included), turned with it: its raster is its drawing.
 * - Every other kind: at the raster's box (`apBox`), carried along by a move
 *   in progress. A screen-anchored annotation's box rides the same
 *   similarity its shape projects through (`anchoredBox`), composed with any
 *   turn the engine took out of the raster (`apRot`).
 */
export function rasterPlacement(
  model: Model,
  id: Id,
  view: ViewEnv | undefined,
  shapeNow: ModelGeometry,
): { box?: Rect; rot?: number } {
  const record = model.byId[id];
  if (!drawsLive(record.annotation)) {
    return {
      box: shapeNow.kind === 'box' ? shapeNow.box : record.apBox,
      rot: geomRotation(shapeNow) || undefined,
    };
  }
  if (!record.apBox) return { rot: record.apRot };
  const projected = anchoredBox(
    record.apBox,
    anchorOf(shapeOf(record.annotation)),
    anchorModeOf(record),
    view,
  );
  let box = projected?.box ?? record.apBox;
  const rot = normalizeDeg((record.apRot ?? 0) + (projected?.rot ?? 0)) || undefined;
  const draft = model.draft;
  if (draft?.kind === 'move' && draft.ids.includes(id)) {
    box = { ...box, x: box.x + draft.delta.x, y: box.y + draft.delta.y };
  }
  return { box, rot };
}
