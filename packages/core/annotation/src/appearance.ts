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
 * | A stamp, form widget or link (no live drawing)              | Always the raster, drawn where its shape is                    |
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
 * A record with no appearance in the file (`hasAppearance` false) draws
 * live: every viewer draws that one from its fields, so the engine's raster
 * would be its drawing too, made in memory. A note or file attachment draws
 * its icon.
 *
 * The plugin holds the rest (its `vector` preference): a record this session
 * drew live stays live for the session, and another session's edit hands it
 * back to the engine's raster (`plugin-annotation`, `sync/confirmed.ts`).
 */
import { containedRect } from '@embedpdf/core-geometry';
import {
  appearanceChangeOf,
  resolveAnnotationPatch,
  type Annotation,
  type AnnotationPatch,
} from '@embedpdf/engine-core/runtime';

import { anchoredBox, anchorModeOf, anchorOf } from './anchor';
import { geomRotation } from './geometry';
import { normalizeDeg } from './rect';
import { annotationAfter, kindOf, shapeOf } from './record';
import type { Id, Model, ModelAnnotation, Shape, Rect, ViewEnv } from './types';

/** The part of a record that says how it is drawn. */
export type DrawState = Pick<ModelAnnotation, 'source' | 'apBox'>;

/** Has the annotation a live drawing? Stamps, form widgets and links don't: their raster is the drawing. */
const drawsLive = (annotation: Annotation): boolean => !kindOf(annotation).caps.rasterOnly;

/** How a record this session creates is drawn at first. */
export const sourceOfNew = (annotation: Annotation): ModelAnnotation['source'] =>
  drawsLive(annotation) ? 'vector' : 'baked';

/**
 * How a record the engine reports is drawn: live when this session drew it
 * live (`vector`, the plugin's preference) or when the file holds no
 * appearance for it; otherwise from the engine's raster.
 */
export const sourceOfConfirmed = (
  annotation: Annotation,
  vector: boolean,
): ModelAnnotation['source'] =>
  drawsLive(annotation) && (vector || !annotation.hasAppearance) ? 'vector' : 'baked';

/**
 * What changes in how `record` is drawn once `patch` is written: the rule at
 * the top of this file. Only the fields that change. The engine judges the
 * patch as it will write it: a `rect` command is the shape it moves to by
 * then.
 */
export function drawnAfter(record: ModelAnnotation, patch: AnnotationPatch): Partial<DrawState> {
  if (!drawsLive(record.annotation)) return {};
  const change = appearanceChangeOf(
    record.annotation,
    resolveAnnotationPatch(record.annotation, patch),
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

/** `record` after `patch`: its annotation as the engine will read it back (`annotationAfter`), drawn as the rule says. */
export function applyChange(record: ModelAnnotation, patch: AnnotationPatch): ModelAnnotation {
  return {
    ...record,
    annotation: annotationAfter(record.annotation, patch),
    ...drawnAfter(record, patch),
  };
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
 * Where the raster of a kind without a live drawing goes in `box`, its shape
 * now: filling it, or, for a stamp that fits its drawing `contain`, at the
 * raster's own proportions, centred, as the engine fits the drawing into a
 * resized box. A resize never stretches it.
 */
function rasterInShape(record: ModelAnnotation, box: Rect): Rect {
  const { annotation, apBox } = record;
  return annotation.subtype === 'stamp' && annotation.fit === 'contain' && apBox
    ? containedRect(apBox, box)
    : box;
}

/**
 * Where a record's raster is drawn right now, in view space: its box and the
 * turn to put back about its middle.
 *
 * - A stamp or form widget: where its shape is (`shapeNow`, the gesture in
 *   progress included), turned with it: its raster is its drawing. A
 *   stamp's keeps its proportions in a resized box (`rasterInShape`).
 * - Every other kind: at the raster's box (`apBox`), carried along by a move
 *   in progress. A screen-anchored annotation's box rides the same
 *   similarity its shape projects through (`anchoredBox`), composed with any
 *   turn the engine took out of the raster (`apRot`).
 */
export function rasterPlacement(
  model: Model,
  id: Id,
  view: ViewEnv | undefined,
  shapeNow: Shape,
): { box?: Rect; rot?: number } {
  const record = model.byId[id];
  if (!drawsLive(record.annotation)) {
    return {
      box: shapeNow.kind === 'box' ? rasterInShape(record, shapeNow.box) : record.apBox,
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
