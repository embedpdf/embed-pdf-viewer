/**
 * The pure annotation core: update(model, msg) → [model, effects].
 *
 * Editing is intent-driven (the shell's edit handler sends `editPointer`, the draw
 * handler `createPointer`). Geometry lives in the `Geom` union; all the per-kind
 * math is in geometry.ts. Effects (create/patch/delete) are the only impurities.
 */
import type { AnnotationFlags, AnnotationRef, InkIntent } from '@embedpdf/engine-core/runtime';
import { expandGroups, groupMembers } from './group';
import { canMove, groupUnionBounds, hitTest, isSelectable } from './hit';
import { isSubstrateOnly } from './plane';
import { linkChildrenOf } from './links';
import { capsFor } from './kinds';
import {
  annotContentsEditable,
  annotDeletable,
  annotTransformable,
  DRAWN_FLAGS,
  flagsEqual,
  mergeFlags,
} from './flags';
import { anchoredGeom, anchorModeOf, unanchoredGeom, type ViewEnv } from './anchor';
import {
  apSizeChanged,
  caretGeomFromAnchor,
  DEFAULT_CHROME_GEOM,
  geomDragHandle,
  geomResetRotation,
  geomRotateAbout,
  geomRotation,
  geomScaleAbout,
  geomTranslate,
  groupResizeAnchor,
  groupResizeBox,
  groupResizeFactors,
  normalizeDeg,
  quadIntersectsRect,
  rectFromPoints,
  selectionCenter,
  selectionQuad,
  shapeRectFor,
  transposedAboutCenter,
  unionRect,
  uprightAnchoredRect,
  uprightRotation,
} from './geometry';
import { clickCreateGeom, resolveClickPlacement } from './placement';
import { applyProps, initialTextStyle, kindTakesLink, styleFromProps, textStyleFromProps } from './props';
import { computeMoveSnap } from './snap';
import { straightenInkStroke } from './ink';
import type {
  Annot,
  AnnotationProps,
  AnnotationPropsPatch,
  ClickCreate,
  Draft,
  Effect,
  Geom,
  Id,
  InkStraightenOptions,
  LineEndings,
  Model,
  Msg,
  PointerInput,
  PropKey,
  Quad,
  Rect,
  Style,
  Subtype,
  TextEndAnchor,
  TextQuad,
  Vec,
} from './types';

/** The click ↔ drag threshold (content units): a press-release whose width AND
 *  height both stay under it is a CLICK. Exported so every gesture owner (the
 *  draw handler, the form plugin's place handler) shares ONE definition. */
export const MIN_DRAG = 3;
const isPolySubtype = (subtype: Subtype): subtype is 'polygon' | 'polyline' =>
  subtype === 'polygon' || subtype === 'polyline';

export const initialStyle: Style = {
  color: '#e5484d',
  interiorColor: null,
  strokeWidth: 2,
  opacity: 1,
  blendMode: 'normal',
  border: { kind: 'solid' },
};

const NO_ENDINGS: LineEndings = { start: 'none', end: 'none' };

export const initialModel: Model = {
  byId: {},
  order: [],
  selected: [],
  hovered: null,
  draft: null,
  preview: null,
  seq: 0,
  style: initialStyle,
  defaults: {},
  hitMargin: 6,
  editing: null,
  snap: {
    guides: true,
    guideThreshold: 5,
    rotation: true,
    rotationAngles: [0, 90, 180, 270],
    rotationThreshold: 4,
  },
};

/**
 * Resolve a tool's effective defaults as a FULL flat props bag: the base `style`
 * + the font/endings base, with the per-tool override layered on top. This is
 * what a defaults-editing UI reads, and what creation projects `style`/`text`
 * from (`styleFromProps` / `textStyleFromProps`).
 */
export function defaultsFor(m: Model, subtype: Subtype): AnnotationProps {
  const d = m.defaults[subtype];
  return {
    ...m.style,
    ...initialTextStyle,
    ...d,
    lineEndings: { ...NO_ENDINGS, ...d?.lineEndings },
  };
}

/** Flip an annotation to live (vector) rendering — we now own its appearance, so
 *  the engine's baked AP is no longer authoritative. Idempotent. */
const toVector = (a: Annot): Annot => (a.source === 'vector' ? a : { ...a, source: 'vector' });
/**
 * Take ownership of the appearance after a GEOMETRY edit. Vector kinds flip to
 * live rendering; `opaqueBody` kinds (stamp images) have NO vector render — they
 * stay `baked`, with the raster box following the committed geometry (the bitmap
 * shows stretched until the engine's natively re-fit appearance arrives with the
 * DTO sync). Call with the NEW geometry already applied.
 */
const ownGeometry = (a: Annot): Annot => {
  if (!capsFor(a.subtype).opaqueBody) return toVector(a);
  return 'rect' in a.geom ? { ...a, apBox: a.geom.rect } : a;
};
/**
 * Does this committed edit invalidate an engine-baked raster? Only when the
 * annotation STAYS baked (an opaque-body kind — everything else just flipped to
 * vector via {@link ownGeometry} and renders live from its geometry) AND the
 * edit changed the /AP frame's SIZE, does the engine's re-bake produce new
 * raster content. In practice: a stamp resize. Moves and rotations keep the
 * frame (the blit translates/rotates the same pixels), so they emit false and
 * a committed drag costs zero appearance re-renders. Call with the NEXT
 * (post-{@link ownGeometry}) annot and the geometry it had BEFORE the edit.
 */
const apInvalidated = (next: Annot, before: Geom): boolean =>
  next.source === 'baked' && apSizeChanged(before, next.geom);
/** The patch effect for a committed geometry edit. `apChanged` is attached ONLY
 *  when the edit invalidated a baked raster (a stamp resize) — so every other
 *  edit keeps the bare `{ fx, id }` shape and never triggers an appearance
 *  re-fetch. `next` is the post-{@link ownGeometry} annot, `before` its old geom. */
const patchFx = (id: Id, next: Annot, before: Geom): Effect =>
  apInvalidated(next, before)
    ? { fx: 'patch', id, scope: { kind: 'geometry' }, apChanged: true }
    : { fx: 'patch', id, scope: { kind: 'geometry' } };
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const translateRect = (r: Rect, d: Vec): Rect => ({ ...r, x: r.x + d.x, y: r.y + d.y });

/**
 * Commit a VIEW-space gesture result for one annotation: apply `op` to the
 * PROJECTED geometry (the identity for un-flagged annotations — `op` then
 * simply runs on the stored geom) and map the result back to stored space
 * through `unanchoredGeom`. The exact composition `effGeom` previewed, so a
 * released gesture commits what it showed — for screen-anchored and plain
 * annotations alike, through ONE code path.
 */
const commitViewGesture = (a: Annot, view: ViewEnv | undefined, op: (g: Geom) => Geom): Geom => {
  const mode = anchorModeOf(a);
  return unanchoredGeom(op(anchoredGeom(a.geom, mode, view)), mode, view);
};

/* ── page-bound gestures ──────────────────────────────────────────────────────
 * Annotations are page-bound; the pointer isn't. Two rules keep them apart:
 *  1. FRAME: a gesture is anchored to the page it started on. A sample resolved
 *     against another page is in a different coordinate frame (each page's
 *     content space has its own origin) — subtracting across frames produced
 *     the teleport-to-page-top bug, so foreign-page samples are ignored.
 *  2. CLAMP: within the home frame, geometry pins to the page box (v2 rule):
 *     an overshooting pointer slides the shape along the edge; a shape larger
 *     than the page pins to the page's top/left (lo wins when lo > hi).
 */
const clampAxis = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const clampPointToBox = (p: Vec, box: Rect | undefined): Vec =>
  box
    ? {
        x: clampAxis(p.x, box.x, box.x + box.width),
        y: clampAxis(p.y, box.y, box.y + box.height),
      }
    : p;

/** The pointer sample's view environment (relative zoom + display rotation),
 *  when the caller supplied one — screen-anchored annotations hit-test and
 *  page-clamp at their EFFECTIVE geometry with it. Absent → stored geometry
 *  (headless). */
const viewOf = (input: PointerInput): ViewEnv | undefined =>
  input.zoom != null || input.displayRotation != null
    ? { zoom: input.zoom ?? 1, rotation: input.displayRotation ?? 0 }
    : undefined;

/** The union of the ids' SELECTION bounds (the outline the user sees) — the box
 *  the page-clamp keeps inside the page during a move. Screen-anchored members
 *  count at their effective (view-projected) footprint. */
function unionBoundsOf(m: Model, ids: Id[], view?: ViewEnv): Rect | null {
  const corners: Vec[] = [];
  for (const id of ids) {
    const a = m.byId[id];
    if (!a) continue;
    const g = anchoredGeom(a.geom, anchorModeOf(a), view);
    corners.push(...selectionQuad(g, a.style.strokeWidth, a.style.border));
  }
  return corners.length ? unionRect(corners) : null;
}

/** Clamp a move delta so the selection's union bounds stay inside the page.
 *  Per-axis, so a pointer past the bottom edge still slides the selection
 *  horizontally along that edge. */
function clampMoveDelta(
  m: Model,
  ids: Id[],
  delta: Vec,
  page: Rect | undefined,
  view?: ViewEnv,
): Vec {
  if (!page) return delta;
  const b = unionBoundsOf(m, ids, view);
  if (!b) return delta;
  return {
    x: clampAxis(delta.x, page.x - b.x, page.x + page.width - (b.x + b.width)),
    y: clampAxis(delta.y, page.y - b.y, page.y + page.height - (b.y + b.height)),
  };
}

/** The page an edit draft is anchored to — every edit gesture lives on ONE page. */
function editDraftPon(m: Model, d: Draft): number | null {
  const id = d.g === 'handle' ? d.id : 'ids' in d && d.ids.length ? d.ids[0] : null;
  return id != null ? (m.byId[id]?.pon ?? null) : null;
}
const geomEqual = (a: Geom, b: Geom): boolean => JSON.stringify(a) === JSON.stringify(b);
const RAD2DEG = 180 / Math.PI;

/** The signed CW angle (deg) of `p` relative to `pivot`, in content space (y-down). */
const angleAt = (pivot: Vec, p: Vec): number => Math.atan2(p.y - pivot.y, p.x - pivot.x) * RAD2DEG;

/** Shortest signed arc from `a` to `b` (deg), in (-180, 180]. */
const arcTo = (a: number, b: number): number => ((b - a + 540) % 360) - 180;

/**
 * The live rotation of a rotate draft, snapping applied — the ONE angle rule
 * shared by the preview (`effGeom`), the commit (`editUp`) and the angle chip,
 * so they can never disagree. The selection's ABSOLUTE angle (a single member's
 * `rot` + the raw pointer delta; a group's raw delta from 0) locks onto the
 * configured angles within the threshold; `free` (shift held) bypasses.
 * `delta` is what `geomRotateAbout` applies; `angle` is what the chip shows.
 */
export function rotateDraftDelta(
  m: Model,
  d: Extract<Draft, { g: 'rotate' }>,
): { delta: number; angle: number; snapped: boolean } {
  const raw = angleAt(d.pivot, d.cur) - angleAt(d.pivot, d.start);
  const one = d.ids.length === 1 ? m.byId[d.ids[0]] : null;
  // The absolute angle is read off the PROJECTED geometry (identity when
  // un-flagged): the chip and the snap targets speak about what the user SEES
  // — a noRotate shape's on-screen tilt, not its stored one.
  const base = one ? geomRotation(anchoredGeom(one.geom, anchorModeOf(one), d.view)) : 0;
  const angle = normalizeDeg(base + raw);
  if (!m.snap.rotation || d.free) return { delta: raw, angle, snapped: false };
  for (const target of m.snap.rotationAngles) {
    const adjust = arcTo(angle, normalizeDeg(target));
    if (Math.abs(adjust) <= m.snap.rotationThreshold)
      return { delta: raw + adjust, angle: normalizeDeg(target), snapped: true };
  }
  return { delta: raw, angle, snapped: false };
}

/** A group resize is isotropic (uniform) when ANY selected member is rotated —
 *  an off-axis scale across a rotated rect+rot is a shear it can't represent. A
 *  vertex member's advisory `rot` counts (preserves obbFromTheta + reset). */
const selectionHasRotation = (m: Model, ids: Id[]): boolean =>
  ids.some((id) => geomRotation(m.byId[id]?.geom ?? ({ t: 'caret' } as Geom)) !== 0);

export function update(m: Model, msg: Msg): [Model, Effect[]] {
  switch (msg.t) {
    case 'editPointer':
      return editPointer(m, msg.phase, msg.in);
    case 'marqueePointer':
      return marqueePointer(m, msg.phase, msg.in);
    case 'createPointer':
      return createPointer(
        m,
        msg.phase,
        msg.subtype,
        msg.in,
        msg.preset,
        msg.intent,
        msg.deferInkCommit,
        msg.straightenInk,
        msg.clickCreate,
        msg.flags,
      );
    case 'finishInkDraft':
      return finishInkCreate(m);
    case 'finishCreationDraft':
      return finishPolyCreate(m);
    case 'createCaret':
      return createCaret(m, msg.pon, msg.anchor, msg.flags);
    case 'createReplaceText':
      return createReplaceText(m, msg.pon, msg.quads, msg.anchor, msg.preset);
    case 'createMarkup':
      return createMarkup(m, msg.subtype, msg.pon, msg.quads, msg.preset, msg.flags);
    case 'setMarkupPreview':
      return setMarkupPreview(m, msg.subtype, msg.quadsByPage, msg.preset);
    case 'clearMarkupPreview':
      return m.preview ? [{ ...m, preview: null }, []] : [m, []];
    case 'select': {
      const ids = expandGroups(
        m,
        msg.ids.filter((id) => isSelectable(m, id)),
      );
      if (!ids.length) return [m, []];
      const selected = msg.add ? [...new Set([...m.selected, ...ids])] : ids;
      return [{ ...m, selected }, []];
    }
    case 'deselect': {
      if (!m.selected.length) return [m, []];
      // With `ids`: drop only those (an engaged Behavior retroactively un-selects
      // its annotations — engaged ⇒ not selectable ⇒ not selected). Without: all.
      if (!msg.ids) return [{ ...m, selected: [] }, []];
      const drop = new Set(msg.ids);
      const selected = m.selected.filter((id) => !drop.has(id));
      return selected.length === m.selected.length ? [m, []] : [{ ...m, selected }, []];
    }
    case 'setProps':
      return setProps(m, msg.patch);
    case 'setFlags':
      return setFlags(m, msg.patch, msg.ids);
    case 'setDefaults':
      return setDefaults(m, msg.subtype, msg.patch);
    case 'setSnap':
      return [{ ...m, snap: { ...m.snap, ...msg.patch } }, []];
    case 'rotate90':
      return rotateSelection(m, 90);
    case 'resetRotation':
      return resetRotation(m);
    case 'delete':
      return deleteSelection(m);
    case 'cancel':
      return [{ ...m, draft: null }, []];
    case 'loaded':
      return [mergeLoaded(m, msg.annots), []];
    case 'hydrated':
      return [hydrateAnnots(m, msg.annots, msg.bumpAp ?? false), []];
    case 'created':
      return [reconcile(m, msg.tempId, msg.id, msg.ref), []];
    case 'createFailed':
      return [removeAnnots(m, [msg.tempId]), []];
    case 'upsert':
      return [upsertAnnots(m, msg.annots, msg.bumpAp), []];
    case 'bumpAp':
      return [bumpAp(m, msg.ids), []];
    case 'hover':
      // Pure view-model state; the capability diffs before dispatching, so
      // this fires at enter/leave cadence only.
      return m.hovered === msg.id ? [m, []] : [{ ...m, hovered: msg.id }, []];
    case 'remove': {
      const next = removeAnnots(m, msg.ids);
      // A removed annotation can't stay hovered.
      return [next.hovered && !next.byId[next.hovered] ? { ...next, hovered: null } : next, []];
    }
    case 'beginTextEdit':
      // `lockedContents` (or an inert `/F` state) blocks entering text edit —
      // the geometry gates don't apply here: locked-only contents still edit.
      return m.byId[msg.id] && annotContentsEditable(m.byId[msg.id]!)
        ? [{ ...m, editing: msg.id, selected: [msg.id], draft: null }, []]
        : [m, []];
    case 'setText':
      return setText(m, msg.id, msg.text);
    case 'endTextEdit':
      return m.editing ? [{ ...m, editing: null }, []] : [m, []];
  }
}

/** Apply the editor's plain text optimistically. Updates `contents` on the
 *  DTO-backed model and flips the box to `vector` so the live text shows. Emits
 *  NO effect — the plugin owns the (debounced) engine write while you type, so
 *  the model never churns mid-keystroke. */
function setText(m: Model, id: Id, text: string): [Model, Effect[]] {
  const a = m.byId[id];
  if (!a) return [m, []];
  const next = toVector({ ...a, data: a.data ? { ...a.data, contents: text } : a.data });
  return [{ ...m, byId: { ...m.byId, [id]: next } }, []];
}

function editPointer(
  m: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
): [Model, Effect[]] {
  if (phase === 'down') return editDown(m, input);
  if (phase === 'move') return m.draft ? editMove(m, input) : [m, []];
  return m.draft ? editUp(m) : [m, []];
}

function editDown(m: Model, input: PointerInput): [Model, Effect[]] {
  // `pageBox` + `chrome` reach the hit-test so the page-bound rotate knob
  // (flipped / clamped near an edge) is grabbed exactly where the chrome drew
  // it, with the caller's (screen-constant) grab zones. The view env rides
  // along so screen-anchored annotations are grabbed where they're PAINTED.
  const hit = hitTest(
    m,
    input.pon,
    input.point,
    input.chrome ?? DEFAULT_CHROME_GEOM,
    m.hitMargin,
    input.pageBox,
    input.inert,
    viewOf(input),
  );
  if (hit.t === 'handle') {
    // The handle gesture runs in VIEW space: `base` is the PROJECTED geometry
    // the user grabbed (identity for un-flagged annotations), and the commit
    // maps the result back via `unanchoredGeom` with the SAME captured view.
    const a = m.byId[hit.id];
    const view = viewOf(input);
    const base = anchoredGeom(a.geom, anchorModeOf(a), view);
    return [
      {
        ...m,
        draft: {
          g: 'handle',
          id: hit.id,
          handle: hit.handle,
          base,
          cur: base,
          ...(view ? { view } : {}),
        },
      },
      [],
    ];
  }
  if (hit.t === 'rotate') {
    const view = viewOf(input);
    return [
      {
        ...m,
        draft: {
          g: 'rotate',
          ids: hit.ids,
          pivot: hit.pivot,
          start: input.point,
          cur: input.point,
          ...(view ? { view } : {}),
        },
      },
      [],
    ];
  }
  if (hit.t === 'group-handle') {
    const view = viewOf(input);
    return [
      {
        ...m,
        draft: {
          g: 'group',
          op: 'resize',
          ids: hit.ids,
          handle: hit.handle,
          anchor: groupResizeAnchor(hit.box, hit.handle),
          base: hit.box,
          cur: hit.box,
          ...(view ? { view } : {}),
        },
      },
      [],
    ];
  }
  if (hit.t === 'annot') {
    // A hit on any member acts on the WHOLE group — select/toggle/drag as a unit.
    const grp = groupMembers(m, hit.id);
    const inSel = m.selected.includes(hit.id);
    const selected = input.shift
      ? inSel
        ? m.selected.filter((x) => !grp.includes(x)) // shift+click a member → drop the group
        : [...m.selected, ...grp.filter((x) => !m.selected.includes(x))]
      : inSel
        ? m.selected
        : grp;
    // Only arm a move gesture if every selected annotation can move; an anchored
    // kind (markup/caret) still selects, it just won't drag.
    const movable = selected.length > 0 && selected.every((id) => canMove(m, id));
    const draft: Draft | null = movable
      ? { g: 'move', ids: selected, start: input.point, delta: { x: 0, y: 0 }, guides: [] }
      : null;
    return [{ ...m, selected, draft }, []];
  }
  return [{ ...m, selected: [] }, []]; // empty (the handler usually pre-empts via 'deselect')
}

function editMove(m: Model, input: PointerInput): [Model, Effect[]] {
  const d = m.draft!;
  // Foreign coordinate frame (see the page-bound gesture rules above) — ignore.
  const home = editDraftPon(m, d);
  if (home != null && input.pon !== home) return [m, []];
  if (d.g === 'move') {
    const view = viewOf(input);
    const raw = clampMoveDelta(m, d.ids, sub(input.point, d.start), input.pageBox, view);
    if (!m.snap.guides || input.shift)
      return [{ ...m, draft: { ...d, delta: raw, guides: [] } }, []];
    // Snap guides read STORED geometry (an anchored mover aligns by its /Rect
    // box) — a deliberate simplification; the clamp above is view-exact.
    const snap = computeMoveSnap(m, d.ids, input.pon, raw, m.snap.guideThreshold, input.pageBox);
    // A snap adjusts by ≤ threshold, but never past the page edge: re-clamp, and
    // drop the guide on an axis the clamp took back (its line would be a lie).
    const delta = clampMoveDelta(m, d.ids, snap.delta, input.pageBox, view);
    const guides = snap.guides.filter((g) =>
      g.axis === 'x' ? delta.x === snap.delta.x : delta.y === snap.delta.y,
    );
    return [{ ...m, draft: { ...d, delta, guides } }, []];
  }
  const point = clampPointToBox(input.point, input.pageBox);
  if (d.g === 'handle')
    return [{ ...m, draft: { ...d, cur: geomDragHandle(d.base, d.handle, point) } }, []];
  // Rotation reads the pointer as an ANGLE about the pivot — the raw point is
  // valid (and better) outside the page; the geometry itself never translates.
  // `free` (shift) records the snap bypass for this sample.
  if (d.g === 'rotate') return [{ ...m, draft: { ...d, cur: input.point, free: input.shift } }, []];
  if (d.g === 'group') {
    const iso = selectionHasRotation(m, d.ids);
    return [{ ...m, draft: { ...d, cur: groupResizeBox(d.base, d.handle, point, iso) } }, []];
  }
  return [m, []];
}

function editUp(m: Model): [Model, Effect[]] {
  const d = m.draft!;
  if (d.g === 'handle') {
    // A grab that didn't actually resize leaves the appearance untouched → keep
    // it baked, no engine write.
    if (geomEqual(d.base, d.cur)) return [{ ...m, draft: null }, []];
    // A resize changes the appearance: we own it now → live (vector) render
    // (opaque-body kinds stay baked; the engine re-fits their AP natively).
    // `cur` is VIEW-space (the projected geometry the user dragged); the
    // commit maps it back to stored space — the identity when un-flagged.
    const before = m.byId[d.id];
    const stored = unanchoredGeom(d.cur, anchorModeOf(before), d.view);
    const a = ownGeometry({ ...before, geom: stored });
    return [{ ...m, byId: { ...m.byId, [d.id]: a }, draft: null }, [patchFx(d.id, a, before.geom)]];
  }
  if (d.g === 'rotate') {
    const { delta } = rotateDraftDelta(m, d);
    if (Math.abs(delta) < 0.01) return [{ ...m, draft: null }, []];
    const byId = { ...m.byId };
    const fx: Effect[] = [];
    for (const id of d.ids) {
      const a = byId[id];
      if (!a) continue;
      // rotation re-bakes the appearance → live (vector) render + patch. The
      // gesture composed in VIEW space (`effGeom`); the commit replays the
      // same composition and unprojects — a screen-anchored member's AUTHORED
      // tilt turns WYSIWYG, exactly as previewed.
      const geom = commitViewGesture(a, d.view, (g) => geomRotateAbout(g, d.pivot, delta));
      byId[id] = ownGeometry({ ...a, geom });
      fx.push(patchFx(id, byId[id], a.geom));
    }
    return [{ ...m, byId, draft: null }, fx];
  }
  if (d.g === 'group') {
    const { sx, sy } = groupResizeFactors(d.base, d.cur);
    if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return [{ ...m, draft: null }, []];
    const byId = { ...m.byId };
    const fx: Effect[] = [];
    for (const id of d.ids) {
      const a = byId[id];
      if (!a) continue;
      const geom = commitViewGesture(a, d.view, (g) => geomScaleAbout(g, d.anchor, sx, sy));
      byId[id] = ownGeometry({ ...a, geom });
      fx.push(patchFx(id, byId[id], a.geom));
    }
    return [{ ...m, byId, draft: null }, fx];
  }
  if (d.g === 'move') {
    if (Math.hypot(d.delta.x, d.delta.y) < 0.01) return [{ ...m, draft: null }, []]; // a click
    const byId = { ...m.byId };
    const fx: Effect[] = [];
    for (const id of d.ids) {
      const a = byId[id];
      // A move is a rigid translation — the appearance is unchanged, so a baked
      // annotation STAYS baked and its raster box rides along. Source preserved.
      byId[id] = {
        ...a,
        geom: geomTranslate(a.geom, d.delta),
        apBox: a.apBox ? translateRect(a.apBox, d.delta) : undefined,
      };
      fx.push({ fx: 'patch', id, scope: { kind: 'geometry' } }); // a move never invalidates the raster
    }
    return [{ ...m, byId, draft: null }, fx];
  }
  return [{ ...m, draft: null }, []];
}

function marqueePointer(
  m: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
): [Model, Effect[]] {
  // The marquee lives on one page and pins to its box (same rules as editMove).
  const point = clampPointToBox(input.point, input.pageBox);
  if (phase === 'down') {
    return [{ ...m, draft: { g: 'marquee', pon: input.pon, from: point, to: point } }, []];
  }
  if (m.draft?.g !== 'marquee') return [m, []];
  if (m.draft.pon !== input.pon) return [m, []]; // foreign frame — ignore
  if (phase === 'move') {
    return [{ ...m, draft: { ...m.draft, to: point } }, []];
  }

  // A marquee that touches one member takes the whole group with it.
  const hits = expandGroups(
    m,
    annotsInBox(m, m.draft.pon, m.draft.from, point, input.inert, viewOf(input)),
  );
  const selected = input.shift ? toggleSelection(m.selected, hits) : hits;
  return [{ ...m, selected, draft: null }, []];
}

function toggleSelection(base: Id[], ids: Id[]): Id[] {
  const next = new Set(base);
  for (const id of ids) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return [...next];
}

function createPointer(
  m: Model,
  phase: 'down' | 'move' | 'up',
  subtype: Subtype,
  input: PointerInput,
  preset: string = subtype,
  intent?: InkIntent,
  deferInkCommit = false,
  straightenInk?: InkStraightenOptions,
  clickCreate?: ClickCreate | false,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  // An in-progress creation is anchored to its page: a move/up sample from
  // another page is a foreign frame — ignore it. (A DOWN on another page is a
  // fresh intent: the per-subtype branches below start/restart the draft there.)
  if (phase !== 'down' && m.draft && 'pon' in m.draft && m.draft.pon !== input.pon) return [m, []];
  // Shapes can't be drawn past the page edge — the pointer pins to it.
  if (input.pageBox) input = { ...input, point: clampPointToBox(input.point, input.pageBox) };
  if (subtype === 'free-text-callout') return calloutPointer(m, phase, input, preset, flags);
  if (phase === 'down') {
    if (isPolySubtype(subtype)) {
      if (input.finish) return finishPolyCreate(m);
      if (
        m.draft?.g === 'create-poly' &&
        m.draft.subtype === subtype &&
        m.draft.pon === input.pon
      ) {
        return [
          {
            ...m,
            draft: { ...m.draft, points: [...m.draft.points, input.point], cur: input.point },
          },
          [],
        ];
      }
      return [
        {
          ...m,
          selected: [],
          draft: {
            g: 'create-poly',
            subtype,
            preset,
            pon: input.pon,
            points: [input.point],
            cur: input.point,
            closed: subtype === 'polygon',
            ...(flags ? { flags } : {}),
          },
        },
        [],
      ];
    }
    const draft: Draft | null =
      subtype === 'line'
        ? {
            g: 'create-line',
            subtype,
            preset,
            pon: input.pon,
            from: input.point,
            to: input.point,
            ...(clickCreate !== undefined ? { clickCreate } : {}),
            ...(flags ? { flags } : {}),
          }
        : subtype === 'ink'
          ? m.draft?.g === 'create-ink' &&
            m.draft.subtype === subtype &&
            m.draft.preset === preset &&
            m.draft.pon === input.pon
            ? { ...m.draft, strokes: [...m.draft.strokes, [input.point]] }
            : {
                g: 'create-ink',
                subtype,
                preset,
                pon: input.pon,
                strokes: [[input.point]],
                intent,
                ...(flags ? { flags } : {}),
              }
          : subtype === 'square' ||
              subtype === 'circle' ||
              subtype === 'free-text' ||
              subtype === 'redact' ||
              subtype === 'link'
            ? {
                g: 'create-rect',
                subtype,
                preset,
                pon: input.pon,
                from: input.point,
                to: input.point,
                ellipse: subtype === 'circle',
                // Captured at DOWN (the gesture's home page); a rotation of 0
                // makes upright a no-op, so the draft stays clean then.
                ...(input.upright && input.displayRotation
                  ? { displayRotation: input.displayRotation, upright: true }
                  : {}),
                ...(clickCreate !== undefined ? { clickCreate } : {}),
                ...(flags ? { flags } : {}),
              }
            : null;
    return draft ? [{ ...m, selected: [], draft }, []] : [m, []];
  }
  if (phase === 'move') {
    if (m.draft?.g === 'create-poly') {
      return [{ ...m, draft: { ...m.draft, cur: input.point } }, []];
    }
    if (m.draft?.g === 'create-rect' || m.draft?.g === 'create-line') {
      return [{ ...m, draft: { ...m.draft, to: input.point } }, []];
    }
    if (m.draft?.g === 'create-ink') {
      // append to the active (last) stroke as the pen moves
      const strokes = m.draft.strokes.slice();
      strokes[strokes.length - 1] = [...strokes[strokes.length - 1], input.point];
      return [{ ...m, draft: { ...m.draft, strokes } }, []];
    }
    return [m, []];
  }
  // up
  const d = m.draft;
  if (d?.g !== 'create-rect' && d?.g !== 'create-line' && d?.g !== 'create-ink') return [m, []];

  if (d.g === 'create-ink') {
    let next = m;
    if (straightenInk && d.strokes.length) {
      const strokes = d.strokes.slice();
      const last = strokes.length - 1;
      strokes[last] = straightenInkStroke(strokes[last], straightenInk);
      next = { ...m, draft: { ...d, strokes } };
    }
    return deferInkCommit ? [next, []] : finishInkCreate(next);
  }

  const def = defaultsFor(m, d.preset ?? d.subtype);
  const style = styleFromProps(def);
  let geom: Geom | null = null;
  // The upright counter-rotation for a BOX commit (0 when the tool/page don't
  // ask for one). A DRAGGED box keeps the on-screen footprint the author drew:
  // for a quarter-turn the unrotated box is the drag rect TRANSPOSED about its
  // centre, so spinning it by `rot` lands exactly back on the dragged region.
  const upRot =
    d.g === 'create-rect' && d.upright && d.displayRotation
      ? uprightRotation(d.displayRotation)
      : 0;
  const uprightBox = (dragged: Rect): Rect =>
    upRot === 90 || upRot === 270 ? transposedAboutCenter(dragged) : dragged;
  // Click commits resolve through the SHARED placement layer (placement.ts) —
  // the same `resolveClickPlacement` the footprint ghost and the form plugin
  // consume, so preview ≡ commit by construction. The core only supplies the
  // kind-level fallback for free text (a click must always yield a typable
  // box) and converts the placement to a Geom via `clickCreateGeom`.
  const clickGeom = (policy: ClickCreate): Geom | null =>
    clickCreateGeom(
      d.subtype,
      resolveClickPlacement(d.from, policy, {
        pageBox: input.pageBox,
        upright: d.g === 'create-rect' ? d.upright : undefined,
        displayRotation: d.g === 'create-rect' ? d.displayRotation : undefined,
      }),
      def,
    );
  if (d.g === 'create-rect' && d.subtype === 'free-text') {
    // Free-text: a dragged box, or — on a mere click — a default box you can
    // immediately type into (created unless the tool says `clickCreate: false`;
    // an empty text box is unreachable by drag alone, hence the kind-level
    // fallback: 180×40, top-left anchored so the box hangs where you'll type).
    const dragged = rectFromPoints(d.from, d.to);
    const isClick = dragged.width < MIN_DRAG && dragged.height < MIN_DRAG;
    if (!isClick) {
      geom = { t: 'text', rect: uprightBox(dragged), ...(upRot ? { rot: upRot } : {}) };
    } else if (d.clickCreate !== false) {
      geom = clickGeom(
        d.clickCreate && 'width' in d.clickCreate
          ? d.clickCreate
          : { width: 180, height: 40, anchor: 'top-left' },
      );
    }
  } else if (d.g === 'create-rect') {
    const dragged = rectFromPoints(d.from, d.to);
    if (dragged.width >= MIN_DRAG || dragged.height >= MIN_DRAG) {
      // cloudy stores the OUTER box (dragged + extent) so the dragged box is its inner edge
      geom = {
        t: 'rect',
        rect: shapeRectFor(uprightBox(dragged), d.ellipse, style),
        ellipse: d.ellipse,
        ...(upRot ? { rot: upRot } : {}),
      };
    } else if (d.clickCreate && 'width' in d.clickCreate) {
      geom = clickGeom(d.clickCreate);
    }
  } else if (d.g === 'create-line') {
    if (Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) >= MIN_DRAG) {
      geom = { t: 'line', a: d.from, b: d.to, ends: def.lineEndings };
    } else if (d.clickCreate && 'length' in d.clickCreate) {
      geom = clickGeom(d.clickCreate);
    }
  }
  if (!geom) return [{ ...m, draft: null }, []];

  const id = `tmp:${m.seq + 1}`;
  const annot: Annot = {
    id,
    ref: null,
    pon: d.pon,
    subtype: d.subtype,
    geom,
    style,
    // A text kind carries its text styling from birth, so the tool's font
    // defaults actually apply to what you draw.
    ...(geom.t === 'text' ? { text: textStyleFromProps(def) } : {}),
    // A drawn link starts at the tool preset's target ('docs-link' style
    // presets), or dead (`null` — the create-then-edit flow).
    ...(d.subtype === 'link' ? { link: def.link ?? null } : {}),
    flags: { ...DRAWN_FLAGS, ...d.flags },
    source: 'vector',
  };
  return [
    {
      ...m,
      seq: m.seq + 1,
      byId: { ...m.byId, [id]: annot },
      order: [...m.order, id],
      selected: [id],
      draft: null,
      // A freshly drawn free-text box opens straight into edit (type immediately).
      editing: geom.t === 'text' ? id : m.editing,
    },
    [{ fx: 'create', id }],
  ];
}

/** Commit all strokes accumulated by a grouped ink gesture. */
function finishInkCreate(m: Model): [Model, Effect[]] {
  const d = m.draft;
  if (d?.g !== 'create-ink') return [m, []];
  const points = d.strokes.flat();
  if (!d.strokes.some((stroke) => stroke.length >= 2) || points.length === 0)
    return [{ ...m, draft: null }, []];
  const bounds = unionRect(points);
  if (Math.max(bounds.width, bounds.height) < MIN_DRAG) return [{ ...m, draft: null }, []];

  const id = `tmp:${m.seq + 1}`;
  const annot: Annot = {
    id,
    ref: null,
    pon: d.pon,
    subtype: d.subtype,
    geom: { t: 'ink', strokes: d.strokes },
    style: styleFromProps(defaultsFor(m, d.preset ?? d.subtype)),
    ...(d.intent ? { intent: d.intent } : {}),
    flags: { ...DRAWN_FLAGS, ...d.flags },
    source: 'vector',
  };
  return [
    {
      ...m,
      seq: m.seq + 1,
      byId: { ...m.byId, [id]: annot },
      order: [...m.order, id],
      selected: [id],
      draft: null,
    },
    [{ fx: 'create', id }],
  ];
}

/** Default text-box size for a callout placed with a click (no box drag). */
const CALLOUT_BOX = { width: 150, height: 40 };

/** The callout draft's upright counter-rotation (deg CW; 0 = none) — the SAME
 *  rule the rect commit applies, shared by `calloutBox`, the ghost preview and
 *  the commit so all three agree by construction. */
export function calloutUprightRot(d: Extract<Draft, { g: 'create-callout' }>): number {
  return d.upright && d.displayRotation ? uprightRotation(d.displayRotation) : 0;
}

/**
 * The text-box rect for an in-progress callout's `box` step — the ONE rule both
 * the live preview and the commit use, so what you see is what you get. Only a
 * drag past `MIN_DRAG` sizes the box; a press-without-drag (a click) keeps the
 * default-size box anchored at the press point, so it never collapses to a sliver
 * while you decide whether you're dragging (the "bounce"). Before the press
 * (hover), the default box tracks the cursor.
 *
 * Under `upright` this returns the UNROTATED logical box (the frame text is laid
 * out in): a DRAGGED box keeps the on-screen footprint the author drew (quarter
 * turns transpose it about its centre — spinning by `rot` lands exactly back on
 * the dragged region), and the default box anchors so its DISPLAYED top-left
 * hangs at the point, down-right of the cursor as the author sees it — the same
 * two rules the free-text drag/click commits use.
 */
export function calloutBox(d: Extract<Draft, { g: 'create-callout' }>): Rect {
  const rot = calloutUprightRot(d);
  const quarter = rot === 90 || rot === 270;
  const defaultBox = (at: Vec): Rect =>
    rot
      ? uprightAnchoredRect(at, CALLOUT_BOX.width, CALLOUT_BOX.height, d.displayRotation!)
      : { x: at.x, y: at.y, ...CALLOUT_BOX };
  if (d.boxFrom) {
    const dragged = d.boxTo ? rectFromPoints(d.boxFrom, d.boxTo) : null;
    if (dragged && (dragged.width >= MIN_DRAG || dragged.height >= MIN_DRAG))
      return quarter ? transposedAboutCenter(dragged) : dragged;
    return defaultBox(d.boxFrom);
  }
  return defaultBox(d.cur);
}

/**
 * The free-text callout's multi-step creation, a v2-style 3-click flow:
 *   click 1 (down)  → set the leader `tip`, advance to the `knee` step
 *   hover/move      → preview the leader to the cursor
 *   click 2 (down)  → set the `knee`, advance to the `box` step
 *   drag/click (up) → lay the text box (dragged, or a default box on a click)
 * Commit creates a `free-text` annotation with a `callout` geom and opens it for
 * editing — the connection point to the box is always derived, never stored.
 */
function calloutPointer(
  m: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
  preset: string = 'free-text-callout',
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const d = m.draft;
  if (phase === 'down') {
    if (d?.g !== 'create-callout' || d.pon !== input.pon) {
      return [
        {
          ...m,
          selected: [],
          draft: {
            g: 'create-callout',
            subtype: 'free-text-callout',
            preset,
            pon: input.pon,
            step: 'knee',
            tip: input.point,
            cur: input.point,
            // Captured at the TIP click (the gesture's home page) — the box
            // step may span later samples that don't carry the rotation. A
            // rotation of 0 makes upright a no-op, so the draft stays clean.
            ...(input.upright && input.displayRotation
              ? { displayRotation: input.displayRotation, upright: true }
              : {}),
            ...(flags ? { flags } : {}),
          },
        },
        [],
      ];
    }
    if (d.step === 'knee') {
      return [{ ...m, draft: { ...d, knee: input.point, step: 'box', cur: input.point } }, []];
    }
    // box step: begin the box drag at this point
    return [{ ...m, draft: { ...d, boxFrom: input.point, boxTo: input.point } }, []];
  }
  if (phase === 'move') {
    if (d?.g !== 'create-callout') return [m, []];
    if (d.step === 'box' && d.boxFrom) return [{ ...m, draft: { ...d, boxTo: input.point } }, []];
    return [{ ...m, draft: { ...d, cur: input.point } }, []];
  }
  // up: only the box step (with a started box) commits; the tip/knee clicks no-op.
  if (d?.g !== 'create-callout' || d.step !== 'box' || !d.boxFrom) return [m, []];
  const rect = calloutBox(d); // the SAME box the preview showed
  // The upright counter-rotation applies to the text BOX only (about its own
  // centre) — the leader tip/knee are page-space anchors and never turn.
  const rot = calloutUprightRot(d);
  const def = defaultsFor(m, d.preset ?? 'free-text-callout');
  const ending = def.lineEndings.end !== 'none' ? def.lineEndings.end : 'open-arrow';
  const id = `tmp:${m.seq + 1}`;
  const annot: Annot = {
    id,
    ref: null,
    pon: d.pon,
    subtype: 'free-text',
    geom: {
      t: 'text',
      rect,
      callout: { tip: d.tip, knee: d.knee, ending },
      ...(rot ? { rot } : {}),
    },
    style: styleFromProps(def),
    text: textStyleFromProps(def),
    flags: { ...DRAWN_FLAGS, ...d.flags },
    source: 'vector',
  };
  return [
    {
      ...m,
      seq: m.seq + 1,
      byId: { ...m.byId, [id]: annot },
      order: [...m.order, id],
      selected: [id],
      draft: null,
      editing: id,
    },
    [{ fx: 'create', id }],
  ];
}

function finishPolyCreate(m: Model): [Model, Effect[]] {
  const d = m.draft;
  if (d?.g !== 'create-poly') return [m, []];
  const minPoints = d.closed ? 3 : 2;
  if (d.points.length < minPoints) return [{ ...m, draft: null }, []];

  const def = defaultsFor(m, d.preset ?? d.subtype);
  const geom: Geom = {
    t: 'poly',
    points: d.points,
    closed: d.closed,
    ends: d.closed ? undefined : def.lineEndings,
  };
  const id = `tmp:${m.seq + 1}`;
  const annot: Annot = {
    id,
    ref: null,
    pon: d.pon,
    subtype: d.subtype,
    geom,
    style: styleFromProps(def),
    flags: { ...DRAWN_FLAGS, ...d.flags },
    source: 'vector',
  };
  return [
    {
      ...m,
      seq: m.seq + 1,
      byId: { ...m.byId, [id]: annot },
      order: [...m.order, id],
      selected: [id],
      draft: null,
    },
    [{ fx: 'create', id }],
  ];
}

/** Drop degenerate segment quads (zero-length baseline or ink extent). Area is
 *  the cross product of the two edge vectors — orientation-safe. */
const usableQuads = (quads: TextQuad[]): TextQuad[] =>
  quads.filter((q) => {
    const ux = q.upperEnd.x - q.upperStart.x;
    const uy = q.upperEnd.y - q.upperStart.y;
    const sx = q.lowerStart.x - q.upperStart.x;
    const sy = q.lowerStart.y - q.upperStart.y;
    return Math.abs(ux * sy - uy * sx) > 0;
  });

/**
 * Build a text-markup annotation from the selection's per-line rects. The new
 * annotation is `vector` (rendered live by the overlay) and selected, mirroring
 * `createPointer`. One call per page the selection spans. Clears any live preview.
 */
function createMarkup(
  m: Model,
  subtype: Subtype,
  pon: Annot['pon'],
  segmentQuads: TextQuad[],
  preset: string = subtype,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [m, []];
  const id = `tmp:${m.seq + 1}`;
  const annot: Annot = {
    id,
    ref: null,
    pon,
    subtype,
    geom: { t: 'quads', quads },
    style: styleFromProps(defaultsFor(m, preset)),
    flags: { ...DRAWN_FLAGS, ...flags },
    source: 'vector',
  };
  return [
    {
      ...m,
      seq: m.seq + 1,
      byId: { ...m.byId, [id]: annot },
      order: [...m.order, id],
      selected: [id],
      draft: null,
      preview: null,
    },
    [{ fx: 'create', id }],
  ];
}

/**
 * Create Adobe-compatible Replace Text as one optimistic logical annotation:
 * a top-level Caret (`/IT /Replace`) plus a StrikeOut subordinate
 * (`/IT /StrikeOutTextEdit`, `/IRT` caret, `/RT /Group`). Persistence performs
 * the two ordered writes and rolls the primary back if the subordinate fails.
 */
function createReplaceText(
  m: Model,
  pon: Annot['pon'],
  segmentQuads: TextQuad[],
  anchor: TextEndAnchor,
  preset = 'replace-text',
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [m, []];
  const primaryId = `tmp:${m.seq + 1}`;
  const strikeoutId = `tmp:${m.seq + 2}`;
  const style = styleFromProps(defaultsFor(m, preset));
  const caret: Annot = {
    id: primaryId,
    ref: null,
    pon,
    subtype: 'caret',
    intent: 'replace',
    geom: caretGeomFromAnchor(anchor),
    style,
    flags: DRAWN_FLAGS,
    source: 'vector',
  };
  const strikeout: Annot = {
    id: strikeoutId,
    ref: null,
    pon,
    subtype: 'strikeout',
    intent: 'strikeout-text-edit',
    geom: { t: 'quads', quads },
    style,
    flags: DRAWN_FLAGS,
    source: 'vector',
    irt: primaryId,
    group: primaryId,
  };
  return [
    {
      ...m,
      seq: m.seq + 2,
      byId: { ...m.byId, [primaryId]: caret, [strikeoutId]: strikeout },
      order: [...m.order, primaryId, strikeoutId],
      selected: [primaryId, strikeoutId],
      draft: null,
      preview: null,
    },
    [{ fx: 'createGroup', primary: primaryId, members: [strikeoutId] }],
  ];
}

function createCaret(
  m: Model,
  pon: Annot['pon'],
  anchor: TextEndAnchor,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const caretGeom = caretGeomFromAnchor(anchor);
  if (caretGeom.rect.width <= 0 || caretGeom.rect.height <= 0) return [m, []];
  const id = `tmp:${m.seq + 1}`;
  const def = defaultsFor(m, 'caret');
  const annot: Annot = {
    id,
    ref: null,
    pon,
    subtype: 'caret',
    geom: caretGeom,
    style: styleFromProps(def),
    flags: { ...DRAWN_FLAGS, ...flags },
    source: 'vector',
  };
  return [
    {
      ...m,
      seq: m.seq + 1,
      byId: { ...m.byId, [id]: annot },
      order: [...m.order, id],
      selected: [id],
      draft: null,
      preview: null,
    },
    [{ fx: 'create', id }],
  ];
}

/** Set / replace the live markup preview from the selection's per-page quads. */
function setMarkupPreview(
  m: Model,
  subtype: Subtype,
  quadsByPage: Record<number, TextQuad[]>,
  preset: string = subtype,
): [Model, Effect[]] {
  const byPage: Record<number, TextQuad[]> = {};
  for (const k in quadsByPage) {
    const quads = usableQuads(quadsByPage[k]);
    if (quads.length) byPage[Number(k)] = quads;
  }
  return [{ ...m, preview: { subtype, preset, byPage } }, []];
}

/**
 * Apply a flat property patch to the current selection. Each member takes only
 * the keys its KIND declares (see `applyProps` — routing to `style`, `geom.ends`
 * or `text` happens there) and ignores the rest, so one patch restyles a mixed
 * selection. Changed members flip to `vector` (we own the appearance now) and
 * emit one engine patch each. The base style / tool defaults are NEVER touched:
 * editing existing annotations must not change what the next drawn one looks like.
 */
function setProps(m: Model, patch: AnnotationPropsPatch): [Model, Effect[]] {
  if (!m.selected.length) return [m, []];
  const byId = { ...m.byId };
  const fx: Effect[] = [];
  // The effect carries the user's keys VERBATIM — the shell lowers exactly
  // this intent to wire fields; the changed-prop set IS the artifact.
  const keys = (Object.keys(patch) as PropKey[]).filter((k) => patch[k] !== undefined);
  for (const id of m.selected) {
    const a = byId[id];
    if (!a) continue;
    // The `link` slot is NOT appearance and NOT model state on a non-link
    // kind: the value lives in attached child annotations (the `linkOf`
    // lens reads them back), so the intent is read off the PATCH and rides
    // the target-carrying `syncLink` — the shell's reconciler owns the child
    // operations. Locked annotations refuse it like any other prop write.
    const linkIntent =
      patch.link !== undefined &&
      a.subtype !== 'link' &&
      kindTakesLink(a.subtype) &&
      annotTransformable(a);
    const next = applyProps(a, patch);
    if (!next) {
      // Nothing applied to the model (link-only patch on a parent, or an
      // undeclared key) — the link intent still materializes.
      if (linkIntent) fx.push({ fx: 'syncLink', id, target: patch.link ?? null });
      continue;
    }
    const linkChanged = next.link !== a.link;
    const otherChanged =
      next.style !== a.style ||
      next.geom !== a.geom ||
      next.text !== a.text ||
      next.icon !== a.icon;
    // A restyle flips to vector (we own the appearance now) — EXCEPT
    // `opaqueBody` kinds (widgets), which have no vector render: they stay
    // baked and the shell re-fetches the engine's re-baked raster on resolve.
    // Flipping them would also drop them out of `appearanceEpoch`, freezing
    // their raster forever.
    byId[id] = capsFor(a.subtype).opaqueBody || !otherChanged ? next : toVector(next);
    // The link KIND's target lives on its own DTO — a plain engine patch.
    if (otherChanged || (linkChanged && a.subtype === 'link'))
      fx.push({ fx: 'patch', id, scope: { kind: 'props', keys } });
    if (linkIntent) fx.push({ fx: 'syncLink', id, target: patch.link ?? null });
  }
  return fx.length ? [{ ...m, byId }, fx] : [m, []];
}

/**
 * Merge a `/F` flags patch into the selection (or explicit ids). NOT the props
 * path, on purpose: flags aren't appearance — members keep their render
 * `source` (a baked raster stays valid; nothing re-bakes) — and the write is
 * NOT gated by `locked`, because unlocking a locked annotation is the whole
 * point (Acrobat's Locked checkbox stays live). One `flags` effect per changed
 * COMMITTED member; uncommitted drafts just merge (their create draft carries
 * the flags when it commits).
 */
/**
 * The actions plane's session-visibility write (Hide actions, script
 * `annot.hidden`): merge per-id hidden overrides into the session overlay.
 * Pure session state — ZERO effects, no engine write, no authority. Hiding
 * clears transient engagement so no orphaned selection chrome or text editor
 * survives on an invisible annotation. Identity-preserving no-op when nothing
 * changes (plugin memo caches key on model identity).
 */

function setFlags(m: Model, patch: Partial<AnnotationFlags>, ids?: Id[]): [Model, Effect[]] {
  const targets = ids ?? m.selected;
  if (!targets.length) return [m, []];
  const fx: Effect[] = [];
  let byId: Model['byId'] | null = null;
  for (const id of targets) {
    const a = (byId ?? m.byId)[id];
    if (!a) continue;
    const flags = mergeFlags(a.flags, patch);
    if (flagsEqual(flags, a.flags)) continue; // no spurious engine writes
    byId ??= { ...m.byId };
    byId[id] = { ...a, flags };
    if (a.ref) fx.push({ fx: 'flags', id });
  }
  return byId ? [{ ...m, byId }, fx] : [m, []];
}

function setDefaults(m: Model, subtype: Subtype, patch: AnnotationPropsPatch): [Model, Effect[]] {
  const prev = m.defaults[subtype] ?? {};
  const next: AnnotationPropsPatch = { ...prev, ...patch };
  // Endings merge per side, so `{ end: 'open-arrow' }` keeps a configured start.
  if (patch.lineEndings) next.lineEndings = { ...prev.lineEndings, ...patch.lineEndings };
  return [{ ...m, defaults: { ...m.defaults, [subtype]: next } }, []];
}

/**
 * Rotate the current selection by `deltaDeg` (clockwise) — the toolbar
 * "rotate 90°" affordance. A single shape turns about its own centre; a
 * multi-target group about the union-box centre (gated by `groupRotatable` for
 * groups, `rotatable` for a single shape). Emits one patch per rotated member.
 */
function rotateSelection(m: Model, deltaDeg: number): [Model, Effect[]] {
  const ids = m.selected.filter((id) => {
    const a = m.byId[id];
    return a && annotTransformable(a) && capsFor(a.subtype).rotatable;
  });
  if (!ids.length) return [m, []];
  // pivot: a single shape's own selection-rect centre (so vertex kinds spin in
  // place, not about their off-centre vertex mean); a group's union-box centre.
  // Stored space throughout — a screen-anchored member's AUTHORED tilt turns,
  // which is exactly its on-screen tilt (the display adds nothing to it); at
  // high zoom the anchor may re-seat by a hair, which the toolbar action
  // accepts (the knob gesture, which is pointer-exact, goes through the
  // view-space commit instead).
  let pivot: Vec;
  if (ids.length === 1) {
    const a = m.byId[ids[0]];
    pivot = selectionCenter(a.geom, a.style.strokeWidth);
  } else {
    const pon = m.byId[ids[0]].pon;
    const union = groupUnionBounds({ ...m, selected: ids }, pon);
    if (!union) return [m, []];
    pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
  }
  const byId = { ...m.byId };
  const fx: Effect[] = [];
  for (const id of ids) {
    const a = byId[id];
    const before = a.geom;
    byId[id] = ownGeometry({ ...a, geom: geomRotateAbout(before, pivot, deltaDeg) });
    fx.push(patchFx(id, byId[id], before));
  }
  return [{ ...m, byId }, fx];
}

/** Reset rotation on the selection to the as-authored orientation. For a
 *  screen-anchored annotation that IS its on-screen orientation, so reset is
 *  as meaningful as for anyone else. */
function resetRotation(m: Model): [Model, Effect[]] {
  const byId = { ...m.byId };
  const fx: Effect[] = [];
  for (const id of m.selected) {
    const a = byId[id];
    if (!a || !annotTransformable(a) || geomRotation(a.geom) === 0) continue;
    byId[id] = ownGeometry({ ...a, geom: geomResetRotation(a.geom) });
    fx.push(patchFx(id, byId[id], a.geom));
  }
  return fx.length ? [{ ...m, byId }, fx] : [m, []];
}

function deleteSelection(m: Model): [Model, Effect[]] {
  // `locked` (and inert `/F` states) protect against deletion — only the
  // transformable members go; the rest keep their selection, so a mixed
  // selection deletes what it may and leaves the frozen ones visibly selected.
  const deletable = m.selected.filter((id) => {
    const a = m.byId[id];
    return !!a && annotDeletable(a);
  });
  if (!deletable.length) return [m, []];
  // Attached link children die with their parent. They ARE model
  // annotations now, so expanding the deletable set makes the one loop
  // below handle parent and children uniformly — no side ledger.
  const withChildren = [
    ...deletable,
    ...deletable.flatMap((id) => linkChildrenOf(m, id).map((c) => c.id)),
  ];
  const fx: Effect[] = [];
  for (const id of withChildren) {
    const a = m.byId[id];
    if (a?.ref) fx.push({ fx: 'delete', ref: a.ref });
  }
  return [removeAnnots(m, withChildren), fx];
}

/* ── marquee helper; exported for tests ───────────────────────────────────── */
export function annotsInBox(
  m: Model,
  pon: number,
  a: Vec,
  b: Vec,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Id[] {
  const box = rectFromPoints(a, b);
  return m.order.filter((id) => {
    const annot = m.byId[id];
    if (annot?.pon !== pon || inert?.has(id) || !isSelectable(m, id)) return false;
    // Conversation-plane annotations (replies, review states) are never on
    // the page — the marquee cannot sweep up what does not paint.
    if (isSubstrateOnly(annot)) return false;
    // intersect against what is actually DRAWN: the oriented selection quad
    // (exact, via SAT) — the SAME quad the chrome outlines and the grab region
    // uses (screen-anchored bodies at their view-projected footprint). Its
    // AABB is a coarse superset whose empty corners cover most of a tilted
    // shape's unrotated footprint, so testing the AABB selected shapes the
    // marquee never touched.
    const g = anchoredGeom(annot.geom, anchorModeOf(annot), view);
    return quadIntersectsRect(selectionQuad(g, annot.style.strokeWidth, annot.style.border), box);
  });
}

/* ── store maintenance ───────────────────────────────────────────────────── */

function mergeLoaded(m: Model, annots: Annot[]): Model {
  const byId = { ...m.byId };
  const order = [...m.order];
  for (const a of annots) {
    if (byId[a.id]) continue;
    byId[a.id] = a;
    order.push(a.id);
  }
  return { ...m, byId, order };
}

/**
 * Whole-document hydration ingest: the snapshot is the committed truth.
 * Overwrites by id via `upsertAnnots` (gesture protection included), then
 * reaps committed entries the snapshot no longer contains — deletions that
 * happened before we subscribed (initial load) or inside a desync gap.
 * Gentler than `removeAnnots`: `tmp:` drafts and gesture-locked ids
 * survive, and an in-progress draft is NOT cancelled — reaped ids can
 * never be part of it (locked ids are excluded from reaping).
 */
function hydrateAnnots(m: Model, annots: Annot[], bumpApFlag: boolean): Model {
  const incoming = new Set(annots.map((a) => a.id));
  const locked = draftIds(m.draft);
  const reaped = m.order.filter((id) => {
    if (incoming.has(id) || locked.has(id)) return false;
    const a = m.byId[id];
    return a !== undefined && a.ref !== null; // committed only; tmp: drafts stay
  });
  let next = m;
  if (reaped.length > 0) {
    const gone = new Set(reaped);
    const byId = { ...m.byId };
    for (const id of reaped) delete byId[id];
    next = {
      ...m,
      byId,
      order: m.order.filter((id) => !gone.has(id)),
      selected: m.selected.filter((id) => !gone.has(id)),
      hovered: m.hovered && gone.has(m.hovered) ? null : m.hovered,
      editing: m.editing && gone.has(m.editing) ? null : m.editing,
    };
  }
  return upsertAnnots(next, annots, bumpApFlag);
}

/**
 * Add-or-replace by id. Unlike `mergeLoaded` (which skips ids it already has,
 * for the bulk page read), this OVERWRITES — it's how the data API re-syncs an
 * annotation from the authoritative engine DTO and how a remote edit lands.
 * New ids append to `order`; existing ones keep their position. An annotation
 * currently being dragged (its id is in a `move`/`handle` draft) is left as-is
 * so a remote echo can't yank geometry out from under the local gesture.
 */
function upsertAnnots(m: Model, annots: Annot[], bumpAp = false): Model {
  const dragging = draftIds(m.draft);
  const byId = { ...m.byId };
  const order = [...m.order];
  for (const a of annots) {
    if (dragging.has(a.id)) continue;
    if (!byId[a.id]) order.push(a.id);
    const prev = byId[a.id];
    // `apVersion` is model-owned, not DTO-derived: carry it across the replace,
    // +1 when this upsert confirms an engine re-bake with new raster content.
    byId[a.id] = { ...a, apVersion: (prev?.apVersion ?? 0) + (bumpAp ? 1 : 0) };
  }
  return { ...m, byId, order };
}

/** Advance `apVersion` for known ids — an engine /AP re-bake that arrived
 *  WITHOUT new model data (a form value write repainting its widgets). */
function bumpAp(m: Model, ids: Id[]): Model {
  let byId: Model['byId'] | null = null;
  for (const id of ids) {
    const a = m.byId[id];
    if (!a) continue;
    byId ??= { ...m.byId };
    byId[id] = { ...a, apVersion: (a.apVersion ?? 0) + 1 };
  }
  return byId ? { ...m, byId } : m;
}

/** Ids locked by an in-progress local gesture (don't let an upsert clobber them). */
function draftIds(draft: Draft | null): Set<Id> {
  if (!draft) return new Set();
  if (draft.g === 'move') return new Set(draft.ids);
  if (draft.g === 'handle') return new Set([draft.id]);
  if (draft.g === 'rotate' || draft.g === 'group') return new Set(draft.ids);
  return new Set();
}

function removeAnnots(m: Model, ids: Id[]): Model {
  const gone = new Set(ids);
  const byId = { ...m.byId };
  for (const id of ids) delete byId[id];
  return {
    ...m,
    byId,
    order: m.order.filter((id) => !gone.has(id)),
    selected: m.selected.filter((id) => !gone.has(id)),
    draft: null,
    editing: m.editing && gone.has(m.editing) ? null : m.editing,
  };
}

function reconcile(m: Model, tempId: Id, id: Id, ref: AnnotationRef): Model {
  const a = m.byId[tempId];
  if (!a) return m;
  const { [tempId]: _drop, ...rest } = m.byId;
  const byId: Record<Id, Annot> = { ...rest, [id]: { ...a, id, ref } };
  // Composite creations can relate another optimistic annotation to this temp
  // id. Keep the relationship coherent across the temp→durable id swap.
  for (const key of Object.keys(byId)) {
    const other = byId[key]!;
    if (other.irt === tempId || other.group === tempId) {
      byId[key] = {
        ...other,
        ...(other.irt === tempId ? { irt: id } : {}),
        ...(other.group === tempId ? { group: id } : {}),
      };
    }
  }
  return {
    ...m,
    byId,
    order: m.order.map((x) => (x === tempId ? id : x)),
    selected: m.selected.map((x) => (x === tempId ? id : x)),
    // keep the just-drawn box in edit mode across the temp→durable id swap
    editing: m.editing === tempId ? id : m.editing,
  };
}
