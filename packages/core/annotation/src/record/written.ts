/**
 * An annotation as the engine writes it: what the viewer shows while a
 * create or an edit is on its way, field for field what the engine's answer
 * will bring.
 *
 * The engine's own functions state the fields the change writes
 * (`annotationOfDraft`, `applyAnnotationPatch`). Two fields the engine works
 * out as it writes, and they follow its own verdict on the change
 * (`appearanceChangeOf`): a drawn kind's `rect` (`DRAWN_RECT_KINDS`), the
 * upright box around what its appearance paints, and `hasAppearance`,
 * whether the file holds that appearance:
 *
 * | The change                          | `rect`                         | `hasAppearance`          |
 * | :---------------------------------- | :----------------------------- | :----------------------- |
 * | Nothing visible                     | as it is                       | as it is                 |
 * | A pure move                         | moved the same distance        | as it is                 |
 * | Anything else visible, and a create | the box around the new drawing | baked                    |
 *
 * The engine measures that box on the appearance it bakes; the viewer
 * measures it on the drawing it draws live (`drawnBoundsOf`). The two
 * drawings are the same drawing (or the annotation would jump when it
 * switches between them), so the two boxes are the same box:
 * `packages/engine/main/test/annotation-rect.test.ts` holds them to it.
 *
 * A kind whose shape is its rect (a link, a note, a form field) states its
 * rect itself. A link or form widget gets no appearance of the engine's
 * (`UNBAKED_KINDS`): whether the file holds one stays as it was, and a new
 * one has none.
 */
import {
  annotationOfDraft,
  appearanceChangeOf,
  applyAnnotationPatch,
  DRAWN_RECT_KINDS,
  resolveAnnotationPatch,
  UNBAKED_KINDS,
  type AnnotationDraft,
  type Annotation,
  type AnnotationPatch,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';

import { distanceDrawnBounds, distanceLayout, measurementOf } from '../measurement';
import { shapeMeasurementLayout } from '../measurement-shape';
import { rectCornerPoints, unionRect } from '../rect';
import { familyOf } from '../shapes';
import type { Rect } from '../types';
import { shapeOf } from './shape';
import { styleOf } from './style';

/** Does the engine work out this annotation's `rect` from its drawing? */
const rectFollowsDrawing = (annotation: Annotation): boolean =>
  DRAWN_RECT_KINDS.has(annotation.subtype);

/**
 * The upright page box around all the annotation paints: its shape as its
 * family paints it (stroke, endings, cloud, turn), and a measurement's
 * dimension line, leader lines and caption.
 */
function drawnBoundsOf(annotation: Annotation): Rect {
  const shape = shapeOf(annotation);
  const style = styleOf(annotation);
  const bounds = familyOf(shape).rect(shape, style);
  const measure = measurementOf(annotation);
  if (!measure) return bounds;
  if (measure.intent === 'line-dimension') {
    const layout = distanceLayout(shape, measure, style.strokeWidth);
    return layout ? distanceDrawnBounds(layout, style.strokeWidth) : bounds;
  }
  const caption = shapeMeasurementLayout(shape, measure, style)?.caption;
  return caption ? unionRect([...rectCornerPoints(bounds), ...caption.bounds]) : bounds;
}

/**
 * The annotation `draft` creates, as the engine reads it back: the draft's
 * fields as the engine states them, and a drawn kind's `rect` the box around
 * its drawing. `at` says where it will sit: its ref and its place on the page.
 */
export function annotationOfNew(
  draft: AnnotationDraft,
  at: { readonly ref: AnnotationRef; readonly index: number },
): Annotation {
  const annotation = annotationOfDraft(draft, at);
  return rectFollowsDrawing(annotation)
    ? { ...annotation, rect: drawnBoundsOf(annotation) }
    : annotation;
}

/**
 * `annotation` after `patch`, as the engine reads it back: the patch applied
 * by the engine's own rules, and the fields the engine works out as its
 * verdict on the change says (the table at the top of this file). Throws, as
 * the engine would refuse it, for a patch the annotation doesn't take.
 */
export function annotationAfter(annotation: Annotation, patch: AnnotationPatch): Annotation {
  const after = applyAnnotationPatch(annotation, patch);
  const change = appearanceChangeOf(annotation, resolveAnnotationPatch(annotation, patch));
  switch (change.impact) {
    case 'inert':
      return after;
    case 'translation': {
      if (!rectFollowsDrawing(after)) return after;
      const { rect } = annotation;
      return { ...after, rect: { ...rect, x: rect.x + change.by.x, y: rect.y + change.by.y } };
    }
    case 'regenerate':
      return {
        ...after,
        ...(UNBAKED_KINDS.has(after.subtype) ? {} : { hasAppearance: true }),
        ...(rectFollowsDrawing(after) ? { rect: drawnBoundsOf(after) } : {}),
      };
  }
}
