/**
 * Editing existing annotations with the pointer: the press that picks what to
 * do (select, move, resize, rotate, drag a caption or a leader) and the moves
 * that preview it. The release commits it (edit-commit.ts).
 */
import { anchoredGeom, anchorModeOf } from '../anchor';
import {
  DEFAULT_CHROME_GEOMETRY,
  geomDragHandle,
  geomRotation,
  groupResizeAnchor,
  groupResizeBox,
  normalizeDeg,
} from '../geometry';
import { groupMembers } from '../group';
import { canMove, hitTest } from '../hit';
import { distanceLeaderLength } from '../measurement';
import { computeMoveSnap } from '../snap';
import type { ContentGeometry, Draft, Effect, Id, Model, Point, PointerInput } from '../types';
import { sub } from './changes';
import { editUp } from './edit-commit';
import { clampMoveDelta, clampPointToBox, editDraftPage, viewOf } from './page-bound';

const RAD2DEG = 180 / Math.PI;

/** The signed CW angle (deg) of `point` relative to `pivot`, in content space (y-down). */
const angleAt = (pivot: Point, point: Point): number =>
  Math.atan2(point.y - pivot.y, point.x - pivot.x) * RAD2DEG;

/** Shortest signed arc from `from` to `to` (deg), in (-180, 180]. */
const arcTo = (from: number, to: number): number => ((to - from + 540) % 360) - 180;

/**
 * The live rotation of a rotate draft, snapping applied — the one angle rule
 * shared by the preview (`effGeom`), the commit (`editUp`) and the angle chip,
 * so they can never disagree. The selection's absolute angle (a single member's
 * `rot` + the raw pointer delta; a group's raw delta from 0) locks onto the
 * configured angles within the threshold; `free` (shift held) bypasses.
 * `delta` is what `geomRotateAbout` applies; `angle` is what the chip shows.
 */
export function rotateDraftDelta(
  model: Model,
  draft: Extract<Draft, { kind: 'rotate' }>,
): { delta: number; angle: number; snapped: boolean } {
  const raw = angleAt(draft.pivot, draft.current) - angleAt(draft.pivot, draft.start);
  const one = draft.ids.length === 1 ? model.byId[draft.ids[0]] : null;
  // The absolute angle is read off the projected geometry (identity when
  // un-flagged): the chip and the snap targets speak about what the user sees
  // — a noRotate shape's on-screen tilt, not its stored one.
  const base = one ? geomRotation(anchoredGeom(one.geometry, anchorModeOf(one), draft.view)) : 0;
  const angle = normalizeDeg(base + raw);
  if (!model.snap.rotation || draft.free) return { delta: raw, angle, snapped: false };
  for (const target of model.snap.rotationAngles) {
    const adjust = arcTo(angle, normalizeDeg(target));
    if (Math.abs(adjust) <= model.snap.rotationThreshold)
      return { delta: raw + adjust, angle: normalizeDeg(target), snapped: true };
  }
  return { delta: raw, angle, snapped: false };
}

/** A group resize is isotropic (uniform) when any selected member is rotated —
 *  an off-axis scale across a rotated rect+rot is a shear it can't represent. A
 *  vertex member's advisory `rot` counts (preserves obbFromTheta + reset). */
const selectionHasRotation = (model: Model, ids: Id[]): boolean =>
  ids.some(
    (id) => geomRotation(model.byId[id]?.geometry ?? ({ kind: 'caret' } as ContentGeometry)) !== 0,
  );

export function editPointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
): [Model, Effect[]] {
  if (phase === 'down') return editDown(model, input);
  if (phase === 'move') return model.draft ? editMove(model, input) : [model, []];
  return model.draft ? editUp(model) : [model, []];
}

export function editDown(model: Model, input: PointerInput): [Model, Effect[]] {
  // `pageBox` + `chrome` reach the hit-test so the page-bound rotate knob
  // (flipped / clamped near an edge) is grabbed exactly where the chrome drew
  // it, with the caller's (screen-constant) grab zones. The view env rides
  // along so screen-anchored annotations are grabbed where they're painted.
  const hit = hitTest(
    model,
    input.page,
    input.point,
    input.chrome ?? DEFAULT_CHROME_GEOMETRY,
    model.hitMargin,
    input.pageBox,
    input.inert,
    viewOf(input),
  );
  if (hit.kind === 'handle' && hit.handle === 'caption') {
    return [
      {
        ...model,
        draft: { kind: 'caption', id: hit.id, start: input.point, delta: { x: 0, y: 0 } },
      },
      [],
    ];
  }
  if (hit.kind === 'handle' && (hit.handle === 'leader-start' || hit.handle === 'leader-end')) {
    return [
      {
        ...model,
        draft: { kind: 'leader', id: hit.id, start: input.point, delta: 0 },
      },
      [],
    ];
  }
  if (hit.kind === 'handle') {
    // The handle gesture runs in view space: `base` is the projected geometry
    // the user grabbed (identity for un-flagged annotations), and the commit
    // maps the result back via `unanchoredGeom` with the same captured view.
    const annotation = model.byId[hit.id];
    const view = viewOf(input);
    const base = anchoredGeom(annotation.geometry, anchorModeOf(annotation), view);
    return [
      {
        ...model,
        draft: {
          kind: 'handle',
          id: hit.id,
          handle: hit.handle,
          base,
          current: base,
          ...(view ? { view } : {}),
        },
      },
      [],
    ];
  }
  if (hit.kind === 'rotate') {
    const view = viewOf(input);
    return [
      {
        ...model,
        draft: {
          kind: 'rotate',
          ids: hit.ids,
          pivot: hit.pivot,
          start: input.point,
          current: input.point,
          ...(view ? { view } : {}),
        },
      },
      [],
    ];
  }
  if (hit.kind === 'group-handle') {
    const view = viewOf(input);
    return [
      {
        ...model,
        draft: {
          kind: 'group',
          op: 'resize',
          ids: hit.ids,
          handle: hit.handle,
          anchor: groupResizeAnchor(hit.box, hit.handle),
          base: hit.box,
          current: hit.box,
          ...(view ? { view } : {}),
        },
      },
      [],
    ];
  }
  if (hit.kind === 'annot') {
    // A hit on any member acts on the whole group — select/toggle/drag as a unit.
    const grp = groupMembers(model, hit.id);
    const inSel = model.selected.includes(hit.id);
    const selected = input.shift
      ? inSel
        ? model.selected.filter((selectedId) => !grp.includes(selectedId)) // shift+click a member → drop the group
        : [...model.selected, ...grp.filter((memberId) => !model.selected.includes(memberId))]
      : inSel
        ? model.selected
        : grp;
    // Only arm a move gesture if every selected annotation can move; an anchored
    // kind (markup/caret) still selects, it just won't drag.
    const movable = selected.length > 0 && selected.every((id) => canMove(model, id));
    const draft: Draft | null = movable
      ? { kind: 'move', ids: selected, start: input.point, delta: { x: 0, y: 0 }, guides: [] }
      : null;
    return [{ ...model, selected, draft }, []];
  }
  return [{ ...model, selected: [] }, []]; // empty (the handler usually pre-empts via 'deselect')
}

export function editMove(model: Model, input: PointerInput): [Model, Effect[]] {
  const draft = model.draft!;
  // Foreign coordinate frame (see the page-bound gesture rules above) — ignore.
  const home = editDraftPage(model, draft);
  if (home != null && input.page.pageObjectNumber !== home.pageObjectNumber) return [model, []];
  if (draft.kind === 'move') {
    const view = viewOf(input);
    const raw = clampMoveDelta(
      model,
      draft.ids,
      sub(input.point, draft.start),
      input.pageBox,
      view,
    );
    if (!model.snap.guides || input.shift)
      return [{ ...model, draft: { ...draft, delta: raw, guides: [] } }, []];
    // Snap guides read stored geometry (an anchored mover aligns by its /Rect
    // box) — a deliberate simplification; the clamp above is view-exact.
    const snap = computeMoveSnap(
      model,
      draft.ids,
      input.page,
      raw,
      model.snap.guideThreshold,
      input.pageBox,
    );
    // A snap adjusts by ≤ threshold, but never past the page edge: re-clamp, and
    // drop the guide on an axis the clamp took back (its line would be a lie).
    const delta = clampMoveDelta(model, draft.ids, snap.delta, input.pageBox, view);
    const guides = snap.guides.filter((guide) =>
      guide.axis === 'x' ? delta.x === snap.delta.x : delta.y === snap.delta.y,
    );
    return [{ ...model, draft: { ...draft, delta, guides } }, []];
  }
  const point = clampPointToBox(input.point, input.pageBox);
  if (draft.kind === 'leader') {
    const annotation = model.byId[draft.id];
    const start = distanceLeaderLength(annotation.geometry, draft.start);
    const current = distanceLeaderLength(annotation.geometry, point);

    return [{ ...model, draft: { ...draft, delta: current - start } }, []];
  }
  if (draft.kind === 'caption')
    return [
      {
        ...model,
        draft: { ...draft, delta: { x: point.x - draft.start.x, y: point.y - draft.start.y } },
      },
      [],
    ];
  if (draft.kind === 'handle')
    return [
      { ...model, draft: { ...draft, current: geomDragHandle(draft.base, draft.handle, point) } },
      [],
    ];
  // Rotation reads the pointer as an angle about the pivot — the raw point is
  // valid (and better) outside the page; the geometry itself never translates.
  // `free` (shift) records the snap bypass for this sample.
  if (draft.kind === 'rotate')
    return [{ ...model, draft: { ...draft, current: input.point, free: input.shift } }, []];
  if (draft.kind === 'group') {
    const iso = selectionHasRotation(model, draft.ids);
    return [
      {
        ...model,
        draft: { ...draft, current: groupResizeBox(draft.base, draft.handle, point, iso) },
      },
      [],
    ];
  }
  return [model, []];
}
