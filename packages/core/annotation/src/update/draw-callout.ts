/** Drawing a free-text callout: the tip, the elbow, then the text box it points from. */
import type { AnnotationFlags } from '@embedpdf/engine-core/runtime';

import { uprightRotation } from '../geometry';
import { gesturePlacement } from '../placement';
import { calloutShape } from '../shapes/text-box';
import type { ClickCreate, Draft, Effect, Model, Placement, PointerInput, Rect } from '../types';
import { draftOf, newRecord, numbersLeft } from './changes';
import { defaultsFor, toolAnnotation } from './session';

/** A callout's text box on a click (no box drag): hanging down-right of the press, as a free text's does. */
const CALLOUT_BOX: ClickCreate = { width: 150, height: 40, anchor: 'top-left' };

/** The callout draft's upright counter-rotation (deg CW; 0 = none) — the same
 *  rule the rect commit applies, shared by `calloutBox`, the ghost preview and
 *  the commit so all three agree by construction. */
export function calloutUprightRot(draft: Extract<Draft, { kind: 'create-callout' }>): number {
  return draft.upright && draft.displayRotation ? uprightRotation(draft.displayRotation) : 0;
}

/**
 * The text-box rect for an in-progress callout's `box` step — the one rule both
 * the live preview and the commit use, so what you see is what you get: the
 * box step's gesture placed as any box tool's is (`gesturePlacement`). A drag
 * past `MIN_DRAG` sizes the box; a press-without-drag (a click) keeps the
 * default-size box at the press point, so it never collapses to a sliver
 * while you decide whether you're dragging (the "bounce"). Before the press
 * (hover), the default box tracks the cursor. Under `upright` it is the box
 * before its turn, laid out as the author sees the page.
 */
export function calloutBox(draft: Extract<Draft, { kind: 'create-callout' }>): Rect {
  const from = draft.boxFrom ?? draft.current;
  // A box gesture with a box policy always places a box.
  const placement = gesturePlacement('box', from, draft.boxTo ?? from, CALLOUT_BOX, {
    pageBox: draft.pageBox,
    upright: draft.upright,
    displayRotation: draft.displayRotation,
  }) as Extract<Placement, { kind: 'box' }>;
  return placement.rect;
}

/**
 * The free-text callout's multi-step creation, a 3-click flow:
 *   click 1 (down)  → set the leader `tip`, advance to the `knee` step
 *   hover/move      → preview the leader to the cursor
 *   click 2 (down)  → set the `knee`, advance to the `box` step
 *   drag/click (up) → lay the text box (dragged, or a default box on a click)
 * Commit creates a `free-text` callout and opens it for editing; the line's
 * end is where it meets the box (`calloutShape`).
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
    if (draft?.kind !== 'create-callout' || draft.page.objectNumber !== input.page.objectNumber) {
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
  const tool = toolAnnotation(model, 'free-text-callout', draft.preset);
  // The tool's arrow at the tip; a callout without one gets an open arrow.
  const toolEnding = tool.subtype === 'free-text' ? tool.lineEnding : null;
  const ending = toolEnding && toolEnding !== 'none' ? toolEnding : 'open-arrow';
  const created = newRecord(
    model,
    draft.page,
    draftOf(
      'free-text-callout',
      defaultsFor(model, draft.preset ?? 'free-text-callout'),
      calloutShape(rect, rot, draft.tip, draft.knee, ending),
      { intent: 'free-text-callout', contents: '' },
      draft.flags,
    ),
  );
  const id = created.record.id;
  return [
    {
      ...model,
      objectNumbers: numbersLeft(model, 1),
      byId: { ...model.byId, [id]: created.record },
      order: [...model.order, id],
      selected: [id],
      draft: null,
      editing: id,
    },
    [{ type: 'create', id, draft: created.draft }],
  ];
}
