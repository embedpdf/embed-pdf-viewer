/** Drawing a free-text callout: the tip, the elbow, then the text box it points from. */
import type { AnnotationFlags } from '@embedpdf/engine-core/runtime';

import { DRAWN_FLAGS } from '../flags';
import {
  rectFromPoints,
  rotatedAabb,
  transposedAboutCenter,
  uprightAnchoredRect,
  uprightRotation,
} from '../geometry';
import { clampRectToBox } from '../placement';
import { styleFromProps, textStyleFromProps } from '../props';
import type { Draft, Effect, Model, ModelAnnotation, Point, PointerInput, Rect } from '../types';
import { newRecordId } from './changes';
import { MIN_DRAG } from './draw';
import { defaultsFor } from './session';

/** Default text-box size for a callout placed with a click (no box drag). */
const CALLOUT_BOX = { width: 150, height: 40 };

/** The callout draft's upright counter-rotation (deg CW; 0 = none) — the same
 *  rule the rect commit applies, shared by `calloutBox`, the ghost preview and
 *  the commit so all three agree by construction. */
export function calloutUprightRot(draft: Extract<Draft, { kind: 'create-callout' }>): number {
  return draft.upright && draft.displayRotation ? uprightRotation(draft.displayRotation) : 0;
}

/**
 * The text-box rect for an in-progress callout's `box` step — the one rule both
 * the live preview and the commit use, so what you see is what you get. Only a
 * drag past `MIN_DRAG` sizes the box; a press-without-drag (a click) keeps the
 * default-size box anchored at the press point, so it never collapses to a sliver
 * while you decide whether you're dragging (the "bounce"). Before the press
 * (hover), the default box tracks the cursor.
 *
 * Under `upright` this returns the unrotated logical box (the frame text is laid
 * out in): a dragged box keeps the on-screen footprint the author drew (quarter
 * turns transpose it about its centre — spinning by `rot` lands exactly back on
 * the dragged region), and the default box anchors so its displayed top-left
 * hangs at the point, down-right of the cursor as the author sees it — the same
 * two rules the free-text drag/click commits use. The default box then slides
 * so that footprint stays inside the page; a real drag is already bounded by
 * the point clamp and is left exactly where the author drew it.
 */
export function calloutBox(draft: Extract<Draft, { kind: 'create-callout' }>): Rect {
  const rot = calloutUprightRot(draft);
  const quarter = rot === 90 || rot === 270;
  const defaultBox = (at: Point): Rect =>
    slideCalloutFootprint(
      rot
        ? uprightAnchoredRect(at, CALLOUT_BOX.width, CALLOUT_BOX.height, draft.displayRotation!)
        : { x: at.x, y: at.y, ...CALLOUT_BOX },
      rot,
      draft.pageBox,
    );
  if (draft.boxFrom) {
    const dragged = draft.boxTo ? rectFromPoints(draft.boxFrom, draft.boxTo) : null;
    if (dragged && (dragged.width >= MIN_DRAG || dragged.height >= MIN_DRAG))
      return quarter ? transposedAboutCenter(dragged) : dragged;
    return defaultBox(draft.boxFrom);
  }
  return defaultBox(draft.current);
}

/** Shift `rect` so its displayed footprint (the box rotated about its centre)
 *  sits inside `page`. The logical rect may still cross the page under an
 *  upright quarter-turn; only the footprint the author sees is page-bound. */
function slideCalloutFootprint(rect: Rect, rot: number, page: Rect | undefined): Rect {
  if (!page) return rect;
  const foot = rotatedAabb(rect, rot);
  const placed = clampRectToBox(foot, page);
  const dx = placed.x - foot.x;
  const dy = placed.y - foot.y;
  if (dx === 0 && dy === 0) return rect;
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

/**
 * The free-text callout's multi-step creation, a 3-click flow:
 *   click 1 (down)  → set the leader `tip`, advance to the `knee` step
 *   hover/move      → preview the leader to the cursor
 *   click 2 (down)  → set the `knee`, advance to the `box` step
 *   drag/click (up) → lay the text box (dragged, or a default box on a click)
 * Commit creates a `free-text` annotation with a `callout` geom and opens it for
 * editing — the connection point to the box is always derived, never stored.
 */
export function calloutPointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
  preset: string = 'free-text-callout',
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const draft = model.draft;
  if (phase === 'down') {
    if (
      draft?.kind !== 'create-callout' ||
      draft.page.pageObjectNumber !== input.page.pageObjectNumber
    ) {
      return [
        {
          ...model,
          selected: [],
          draft: {
            kind: 'create-callout',
            subtype: 'free-text-callout',
            preset,
            page: input.page,
            step: 'knee',
            tip: input.point,
            current: input.point,
            // Captured at the tip click (the gesture's home page) — the box
            // step may span later samples that don't carry the rotation. A
            // rotation of 0 makes upright a no-op, so the draft stays clean.
            ...(input.upright && input.displayRotation
              ? { displayRotation: input.displayRotation, upright: true }
              : {}),
            ...(input.pageBox ? { pageBox: input.pageBox } : {}),
            ...(flags ? { flags } : {}),
          },
        },
        [],
      ];
    }
    if (draft.step === 'knee') {
      return [
        { ...model, draft: { ...draft, knee: input.point, step: 'box', current: input.point } },
        [],
      ];
    }
    // box step: begin the box drag at this point
    return [{ ...model, draft: { ...draft, boxFrom: input.point, boxTo: input.point } }, []];
  }
  if (phase === 'move') {
    if (draft?.kind !== 'create-callout') return [model, []];
    if (draft.step === 'box' && draft.boxFrom)
      return [{ ...model, draft: { ...draft, boxTo: input.point } }, []];
    return [{ ...model, draft: { ...draft, current: input.point } }, []];
  }
  // up: only the box step (with a started box) commits; the tip/knee clicks no-op.
  if (draft?.kind !== 'create-callout' || draft.step !== 'box' || !draft.boxFrom)
    return [model, []];
  const rect = calloutBox(draft); // the same box the preview showed
  // The upright counter-rotation applies to the text box only (about its own
  // centre) — the leader tip/knee are page-space anchors and never turn.
  const rot = calloutUprightRot(draft);
  const definition = defaultsFor(model, draft.preset ?? 'free-text-callout');
  const ending = definition.lineEndings.end !== 'none' ? definition.lineEndings.end : 'open-arrow';
  const id = newRecordId(model);
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: draft.page,
    subtype: 'free-text',
    geometry: {
      kind: 'text',
      rect,
      callout: { tip: draft.tip, knee: draft.knee, ending },
      ...(rot ? { rot } : {}),
    },
    style: styleFromProps(definition),
    text: textStyleFromProps(definition),
    flags: { ...DRAWN_FLAGS, ...draft.flags },
    source: 'vector',
  };
  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: annotation },
      order: [...model.order, id],
      selected: [id],
      draft: null,
      editing: id,
    },
    [{ type: 'create', id }],
  ];
}
