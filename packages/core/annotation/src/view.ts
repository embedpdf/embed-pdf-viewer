/**
 * Pure view selectors. `pageItems` is the per-annotation render list (live gesture
 * applied) for customRenderer wrapping; `chrome` is the selection overlay
 * (handles carry their resize cursor, group box, marquee).
 */
import {
  chordThrough,
  geomHandles,
  geomRotateAbout,
  geomRotation,
  geomScaleAbout,
  geomTranslate,
  geomVisualBounds,
  groupResizeFactors,
  obbFromGeom,
  placeRotateKnob,
  rectFromPoints,
  rectHandlesFor,
  normalizeDeg,
  rotatePoint,
  selectionBounds,
  selectionQuad,
  shapeRectFor,
  unionRect,
  ROTATE_KNOB_OFFSET,
} from './geometry';
import { groupCaps } from './group';
import { isSelectable, paintOrder } from './hit';
import { capsFor } from './kinds';
import { annotTransformable, viewable } from './flags';
import { effBearer, effFlags } from './session';
import {
  anchoredBox,
  anchoredGeom,
  anchoredStrokeWidth,
  anchorModeOf,
  anchorOf,
  type ViewEnv,
} from './anchor';
import { blendFor } from './scene';
import { styleFromProps } from './props';
import { calloutBox, calloutUprightRot, defaultsFor, rotateDraftDelta } from './update';
import type { Annot, ChromeNode, Geom, Id, Model, Rect, RenderItem, Style, Vec } from './types';
import type { CreationDraftAnchor } from './types';

const DRAFT_ID = '__draft__';
const PREVIEW_ID = '__markup_preview__';

const polyPreviewPoints = (points: Vec[], cur: Vec): Vec[] => {
  const last = points[points.length - 1];
  return last && (cur.x !== last.x || cur.y !== last.y) ? [...points, cur] : points;
};

/**
 * The gesture-effective geometry, in VIEW space: PROJECT FIRST (screen-
 * anchored bodies to their effective footprint — the identity for everyone
 * else), then apply the live gesture. Gestures compose in view space: the
 * pointer, the drafts' pivots/boxes, and a `handle` draft's geometry all live
 * there already, so ONE code path serves flagged and unflagged annotations —
 * and the commit (`editUp`) maps the same composition back through
 * `unanchoredGeom`, so preview ≡ commit by construction. THE geometry every
 * selector below hands out, so render/chrome/bounds agree with hit.
 */
function effGeom(m: Model, id: Id, view: ViewEnv | undefined): Geom {
  const a = m.byId[id];
  const g = anchoredGeom(a.geom, anchorModeOf(a), view);
  const d = m.draft;
  if (d) {
    if (d.g === 'move' && d.ids.includes(id)) return geomTranslate(g, d.delta);
    if (d.g === 'handle' && d.id === id) return d.cur; // already view space
    if (d.g === 'rotate' && d.ids.includes(id)) {
      // The SAME snapped angle rule the commit uses (see `rotateDraftDelta`).
      return geomRotateAbout(g, d.pivot, rotateDraftDelta(m, d).delta);
    }
    if (d.g === 'group' && d.ids.includes(id)) {
      const { sx, sy } = groupResizeFactors(d.base, d.cur);
      return geomScaleAbout(g, d.anchor, sx, sy);
    }
  }
  return g;
}

/** Style with the stroke width an anchored VECTOR body renders at (screen-
 *  constant line weight); everyone else keeps their style verbatim. */
function effStyle(a: Annot, view: ViewEnv | undefined): Style {
  const mode = anchorModeOf(a);
  if (!mode?.zoom || !view) return a.style;
  return { ...a.style, strokeWidth: anchoredStrokeWidth(a.style.strokeWidth, mode, view) };
}

/** The blit placement for a baked raster: its box (view space, live move
 *  applied) + the rotation to re-apply about the box centre.
 *
 *  `opaqueBody` kinds (stamp images): the raster IS the visual, so the box
 *  follows EVERY live gesture — the unrotated rect of the effective geometry
 *  covers move, resize, and group-scale in one rule, and the effective
 *  rotation drives the blit transform (a stamp spins with the gesture).
 *
 *  Everyone else blits by the AP `/Rect`: for a screen-anchored annotation
 *  that box rides the SAME similarity the geometry projects through
 *  (`anchoredBox`), composing its counter-rotation with any engine-stripped
 *  `apRot` — so a baked noZoom/noRotate body renders screen-constant too. */
function effAp(m: Model, id: Id, view: ViewEnv | undefined): { box?: Rect; rot?: number } {
  const a = m.byId[id];
  if (capsFor(a.subtype).opaqueBody) {
    const g = effGeom(m, id, view);
    return {
      box: 'rect' in g ? g.rect : a.apBox,
      rot: geomRotation(g) || undefined,
    };
  }
  if (!a.apBox) return { rot: a.apRot };
  const projected = anchoredBox(a.apBox, anchorOf(a.geom), anchorModeOf(a), view);
  let box = projected?.box ?? a.apBox;
  const rot = normalizeDeg((a.apRot ?? 0) + (projected?.rot ?? 0)) || undefined;
  const d = m.draft;
  if (d?.g === 'move' && d.ids.includes(id)) {
    box = { ...box, x: box.x + d.delta.x, y: box.y + d.delta.y };
  }
  return { box, rot };
}

/** Render source for one annotation: an in-progress resize renders LIVE (the
 *  baked raster can't stretch), even though the commit hasn't flipped `source`
 *  yet — so the drag is crisp and a no-op grab can revert to baked. */
function effSource(m: Model, id: Id): 'baked' | 'vector' {
  const a = m.byId[id];
  // `opaqueBody` kinds have NO vector render: they stay baked through every
  // gesture — the bitmap stretches with `effApBox` and tilts via the item's
  // live `rot`, then the engine's re-fit appearance replaces it on commit.
  if (capsFor(a.subtype).opaqueBody) return a.source;
  // A callout under TEXT EDIT renders fully live (scene leader/border + DOM
  // text): the flat baked raster can't hide just its text, so any blend
  // doubles it. Geometry gestures flip below; editing joins them here. (A
  // plain free-text needs no rule — it leaves the render list while live.)
  if (m.editing === id && a.geom.t === 'text' && a.geom.callout) return 'vector';
  const d = m.draft;
  // A live resize/rotate/group transform must render LIVE — the baked raster
  // can't stretch or tilt — even before the commit flips `source`.
  if (d?.g === 'handle' && d.id === id) return 'vector';
  if ((d?.g === 'rotate' || d?.g === 'group') && d.ids.includes(id)) return 'vector';
  return a.source;
}

/** A free-text box renders as a LIVE element (editable / reflowing) while it's
 *  being edited or while its source is vector (a resize, in-progress or committed);
 *  otherwise it renders as the engine's baked /AP image, exactly like a shape. */
function textIsLive(m: Model, id: Id): boolean {
  return m.editing === id || effSource(m, id) === 'vector';
}

export function pageItems(m: Model, pon: number, view?: ViewEnv): RenderItem[] {
  const items: RenderItem[] = [];
  // `paintOrder` puts text-layer markups beneath every other kind (back→front),
  // so a highlight drawn after a circle still paints under it — and culls what
  // `/F` hides. The SAME order hit-testing uses, so what you click matches
  // what you see.
  for (const id of paintOrder(m, pon)) {
    const a = m.byId[id];
    // Live (editing / resizing) free-text is rendered by the framework as an editable
    // element (see `textBoxes`); a baked, idle box renders as its engine /AP image —
    // the SAME path shapes use. So only skip text while it's live. A callout is the
    // exception: even while live, its leader/arrow/box-border draw via the vector
    // scene (only its TEXT is the DOM element), so it stays in the render list.
    if (a.geom.t === 'text' && !a.geom.callout && textIsLive(m, id)) continue;
    const geom = effGeom(m, id, view);
    const style = effStyle(a, view);
    // Blit box + rotation for the baked raster (see `effAp`): opaqueBody kinds
    // follow the live effective geometry; everyone else blits by the AP /Rect,
    // projected through the anchor similarity for screen-anchored bodies and
    // composed with any engine-stripped `apRot`.
    const ap = effAp(m, id, view);
    items.push({
      id,
      ref: a.ref,
      subtype: a.subtype,
      geom,
      box: geomVisualBounds(geom, style.strokeWidth, style.border),
      apBox: ap.box,
      style,
      ...(a.text ? { text: a.text } : {}),
      ...(a.label ? { label: a.label } : {}),
      source: effSource(m, id),
      selected: m.selected.includes(id),
      ...(m.hovered === id ? { hovered: true } : {}),
      rot: geomRotation(geom),
      ...(ap.rot ? { apRot: ap.rot } : {}),
      blend: blendFor(a.style),
    });
  }
  const d = m.draft;
  if (
    (d?.g === 'create-rect' ||
      d?.g === 'create-line' ||
      d?.g === 'create-poly' ||
      d?.g === 'create-ink') &&
    d.pon === pon
  ) {
    // Preview with the tool's RESOLVED defaults (base + per-subtype override), so the
    // ghost is a faithful WYSIWYG of what will commit — not the bare base style. A
    // cloudy rect stores the OUTER box (see `shapeRectFor`), so the cloud grows out
    // from the cursor; a 0-drag draws nothing (skipped, like a solid 0×0).
    const def = defaultsFor(m, d.preset ?? d.subtype);
    const style = styleFromProps(def);
    const dragged = d.g === 'create-rect' ? rectFromPoints(d.from, d.to) : null;
    const geom: Geom | null =
      d.g === 'create-rect'
        ? dragged && (dragged.width > 0 || dragged.height > 0)
          ? { t: 'rect', rect: shapeRectFor(dragged, d.ellipse, style), ellipse: d.ellipse }
          : null
        : d.g === 'create-line'
          ? { t: 'line', a: d.from, b: d.to, ends: def.lineEndings }
          : d.g === 'create-poly'
            ? {
                t: 'poly',
                points: polyPreviewPoints(d.points, d.cur),
                closed: d.closed,
                ends: d.closed ? undefined : def.lineEndings,
              }
            : { t: 'ink', strokes: d.strokes };
    if (geom)
      items.push({
        id: DRAFT_ID,
        ref: null,
        subtype: d.subtype,
        geom,
        box: geomVisualBounds(geom, style.strokeWidth, style.border),
        style,
        source: 'ghost',
        selected: false,
      });
  }
  // Callout creation ghost: the in-progress leader (tip → cur, then tip → knee →
  // box) and the text-box preview, painted through the SAME vector scene.
  if (d?.g === 'create-callout' && d.pon === pon) {
    const def = defaultsFor(m, d.preset ?? d.subtype);
    const style = styleFromProps(def);
    const ending = def.lineEndings.end !== 'none' ? def.lineEndings.end : 'open-arrow';
    // The box preview carries the SAME upright rot the commit will apply, so
    // the ghost box (and its leader connection) is what you actually get.
    const rot = calloutUprightRot(d);
    const geom: Geom =
      d.step === 'knee'
        ? { t: 'line', a: d.tip, b: d.cur, ends: { start: ending, end: 'none' } }
        : {
            t: 'text',
            rect: calloutBox(d),
            callout: { tip: d.tip, knee: d.knee, ending },
            ...(rot ? { rot } : {}),
          };
    items.push({
      id: DRAFT_ID,
      ref: null,
      subtype: d.subtype,
      geom,
      box: geomVisualBounds(geom, style.strokeWidth, style.border),
      style,
      source: 'ghost',
      selected: false,
    });
  }
  // Live text-markup preview: the in-progress selection rendered as the markup it
  // will become (same `scene()` paint as the committed annotation).
  const quads = m.preview?.byPage[pon];
  if (m.preview && quads?.length) {
    const geom: Geom = { t: 'quads', quads };
    items.push({
      id: PREVIEW_ID,
      ref: null,
      subtype: m.preview.subtype,
      geom,
      box: geomVisualBounds(geom, 0),
      style: styleFromProps(defaultsFor(m, m.preview.preset)),
      source: 'ghost',
      selected: false,
    });
  }
  return items;
}

/** One free-text box, geometry only (the live move/resize gesture applied), with
 *  its edit flag. The framework renders an editable element here; the plugin
 *  layers the DTO-derived text style on top. */
export interface TextBox {
  id: Id;
  box: Rect;
  editing: boolean;
  /** Applied rotation (deg, CW). `box` is the UNROTATED text box; the framework
   *  rotates the editable element about its centre by this. 0/undefined = none. */
  rot?: number;
}

/** The free-text boxes on a page — the text counterpart of `pageItems`. */
export function textBoxes(m: Model, pon: number, view?: ViewEnv): TextBox[] {
  const out: TextBox[] = [];
  for (const id of m.order) {
    const a = m.byId[id];
    if (a.pon !== pon || a.geom.t !== 'text') continue;
    if (!viewable(effFlags(m, id), m.selected.includes(id))) continue; // `/F`-hidden
    if (!textIsLive(m, id)) continue; // baked → rendered as the /AP image instead
    const g = effGeom(m, id, view);
    if (g.t !== 'text') continue;
    out.push({ id, box: g.rect, editing: m.editing === id, rot: geomRotation(g) });
  }
  return out;
}

/** The currently selected annotations as render items (live gesture applied) —
 *  cross-page, for selection-aware toolbars (style + line-ending editing). */
export function selectedItems(m: Model, view?: ViewEnv): RenderItem[] {
  const items: RenderItem[] = [];
  for (const id of m.selected) {
    const a = m.byId[id];
    if (!a) continue;
    const geom = effGeom(m, id, view);
    const style = effStyle(a, view);
    items.push({
      id,
      ref: a.ref,
      subtype: a.subtype,
      geom,
      box: geomVisualBounds(geom, style.strokeWidth, style.border),
      style,
      source: a.source,
      selected: true,
      rot: geomRotation(geom),
    });
  }
  return items;
}

const boxCorners = (r: Rect): [Vec, Vec, Vec, Vec] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

/**
 * The union of the selection's bounds on `pon`, reading each member through
 * `geomOf` — `effGeom` for the group chrome, so the outline/handles/knob RIDE
 * a live move/scale exactly like single-selection chrome; the COMMITTED
 * geometry for a rotate gesture's rest anchor. Hit-testing keeps its own
 * committed union (hit.ts `groupUnionBounds`): hits only happen between
 * gestures, where the two are identical.
 */
function unionBoundsOf(
  m: Model,
  pon: number,
  geomOf: (id: Id) => Geom,
  view?: ViewEnv,
): Rect | null {
  const corners: Vec[] = [];
  for (const id of m.selected) {
    const a = m.byId[id];
    if (!a || a.pon !== pon) continue;
    corners.push(...selectionQuad(geomOf(id), effStyle(a, view).strokeWidth, a.style.border));
  }
  return corners.length ? unionRect(corners) : null;
}

/** The page-bound knob placement for the selection on `pon`, reading each
 *  member's geometry through `geomOf` — `effGeom` for the live view, the
 *  COMMITTED geometry for a rotate gesture's rest anchor (see `selectionKnob`). */
function placeSelectionKnob(
  m: Model,
  pon: number,
  pageBox: Rect | undefined,
  knobOffset: number,
  geomOf: (id: Id) => Geom,
  view?: ViewEnv,
): { at: Vec; from: Vec } | null {
  const sel = m.selected.filter((id) => isSelectable(m, id) && m.byId[id].pon === pon);
  if (sel.length === 1) {
    const a = m.byId[sel[0]];
    // No knob for a locked (frozen) annotation — the SAME gate hitTest
    // applies, so the drawn knob is always grabbable and vice versa. A
    // screen-anchored body keeps its knob: rotating edits its AUTHORED tilt
    // (`noRotate` only exempts it from the page's rotation). The obb takes
    // the PROJECTED stroke width (`effStyle`) — with the raw width, the knob
    // drifts off the outline as zoom grows.
    if (!capsFor(a.subtype).rotatable || !annotTransformable(effBearer(m, a))) return null;
    const obb = obbFromGeom(geomOf(sel[0]), effStyle(a, view).strokeWidth, a.style.border);
    return obb ? placeRotateKnob(obb.corners, knobOffset, pageBox) : null;
  }
  if (sel.length > 1 && groupCaps(m, sel).rotatable) {
    const union = unionBoundsOf(m, pon, geomOf, view);
    if (union) return placeRotateKnob(boxCorners(union), knobOffset, pageBox);
  }
  return null;
}

/**
 * The rotate knob for the current selection on `pon` — the SAME knob `chrome`
 * draws — or null when the selection has none (non-rotatable single, or a group
 * whose caps aren't rotatable). A single shape's knob hangs off its OBB top edge;
 * a group's off the union box. With `pageBox` the knob is placed PAGE-BOUND
 * (`placeRotateKnob`: flip below / clamp inside) — off-page it would be visible
 * but unreachable, since pointer dispatch resolves pages by containment. Shared
 * by `chrome` (to draw) and `selectionAnchor` (to push the menu clear of it), so
 * the two can never disagree on where it is.
 *
 * The placement DECISION is made at rest; a gesture never re-decides — it RIDES.
 * During a live rotate the knob starts exactly where it was grabbed (the rest
 * placement on the COMMITTED geometry) and turns rigidly about the pivot by the
 * same snapped delta the shape uses; the policy re-evaluates only on release.
 * Re-deciding per frame would jump at grab and side-switch mid-spin.
 */
export function selectionKnob(
  m: Model,
  pon: number,
  pageBox?: Rect,
  knobOffset: number = ROTATE_KNOB_OFFSET,
  view?: ViewEnv,
): { at: Vec; from: Vec } | null {
  const d = m.draft;
  if (d?.g === 'rotate' && m.byId[d.ids[0]]?.pon === pon) {
    const rest = placeSelectionKnob(
      m,
      pon,
      pageBox,
      knobOffset,
      (id) => anchoredGeom(m.byId[id].geom, anchorModeOf(m.byId[id]), view),
      view,
    );
    if (!rest) return null;
    const { delta } = rotateDraftDelta(m, d);
    return {
      at: rotatePoint(rest.at, d.pivot, delta),
      from: rotatePoint(rest.from, d.pivot, delta),
    };
  }
  return placeSelectionKnob(m, pon, pageBox, knobOffset, (id) => effGeom(m, id, view), view);
}

export function chrome(
  m: Model,
  pon: number,
  pageBox?: Rect,
  knobOffset: number = ROTATE_KNOB_OFFSET,
  view?: ViewEnv,
): ChromeNode[] {
  const nodes: ChromeNode[] = [];
  if (m.draft?.g === 'marquee' && m.draft.pon === pon) {
    nodes.push({ kind: 'marquee', rect: rectFromPoints(m.draft.from, m.draft.to) });
  }
  // Live alignment guides of a snapped move (the gesture lives on ONE page —
  // its members' page).
  if (m.draft?.g === 'move' && m.draft.guides.length && m.byId[m.draft.ids[0]]?.pon === pon) {
    for (const g of m.draft.guides)
      nodes.push({ kind: 'guide', axis: g.axis, at: g.at, lo: g.lo, hi: g.hi });
  }
  // A live rotate on THIS page's selection. While it runs, the chrome switches
  // modes (v2 behaviour): the readout chip + full-bleed guides appear, and the
  // handles/knob are suppressed below — the pointer holds capture, so grab
  // affordances are noise; "how far am I" feedback is everything.
  const rd = m.draft?.g === 'rotate' && m.byId[m.draft.ids[0]]?.pon === pon ? m.draft : null;
  if (rd) {
    const { angle } = rotateDraftDelta(m, rd);
    nodes.push({ kind: 'angle-chip', at: rd.cur, angle: Math.round(angle) });
    // Guides as chords of the PAGE through the pivot — the fixed 0°/90°
    // reference cross + the live indicator at the SAME snapped angle the chip
    // shows and the commit applies. Full-bleed beats a magic length constant;
    // no pageBox (headless) → a generous fixed span around the pivot.
    const span = pageBox ?? { x: rd.pivot.x - 300, y: rd.pivot.y - 300, width: 600, height: 600 };
    const lines: Array<{ a: Vec; b: Vec; role: 'axis' | 'indicator' }> = [];
    for (const [deg, role] of [
      [0, 'axis'],
      [90, 'axis'],
      [angle, 'indicator'],
    ] as const) {
      const c = chordThrough(span, rd.pivot, deg);
      if (c) lines.push({ ...c, role });
    }
    nodes.push({ kind: 'rotate-guides', center: rd.pivot, angle, lines });
  }
  const sel = m.selected.filter((id) => isSelectable(m, id) && m.byId[id].pon === pon);
  if (sel.length === 1) {
    const a = m.byId[sel[0]];
    const g = effGeom(m, sel[0], view);
    const style = effStyle(a, view);
    const caps = capsFor(a.subtype);
    const rot = geomRotation(g);
    // Oriented chrome follows the GEOMETRY, not the caps: any tilted kind with
    // an OBB — a caret riding rotated text included — outlines on its tilt.
    // The rotate KNOB stays caps-gated (`placeSelectionKnob` / `hitTest`), so
    // an oriented outline never implies a rotate affordance.
    const obb = obbFromGeom(g, style.strokeWidth, a.style.border);
    if (obb && rot !== 0) {
      nodes.push({ kind: 'obb', corners: obb.corners, angle: obb.angle });
    } else {
      nodes.push({
        kind: 'outline',
        rect: selectionBounds(g, style.strokeWidth, a.style.border),
      });
    }
    // handles for kinds that resize (box) or vertex-edit; anchored/markup show
    // a bare outline — and so do locked (frozen) annotations, the SAME gate
    // hitTest applies. Screen-anchored bodies keep their handles, placed on
    // the PROJECTED geometry (`g`), so they sit exactly where hitTest grabs
    // them. `geomHandles` already places them on the rotated box; `rot`
    // additionally tilts each handle GLYPH so it rides the box's orientation.
    // Suppressed during a live rotate (`rd`) — guides own that mode.
    if (!rd && annotTransformable(effBearer(m, a)) && (caps.resizable || caps.vertexEditable)) {
      for (const h of geomHandles(g))
        nodes.push({ kind: 'handle', at: h.at, cursor: h.cursor, ...(rot ? { rot } : {}) });
    }
  } else if (sel.length > 1 && !rd) {
    // The LIVE union (draft-effective geometry): the outline and its handles
    // ride a group move/scale exactly like single-selection chrome. During a
    // live rotate the members spin away from any axis-aligned box, so the
    // whole block is suppressed — the guides own that mode.
    const union = unionBoundsOf(m, pon, (id) => effGeom(m, id, view), view);
    if (union) {
      nodes.push({ kind: 'outline', rect: union });
      const gc = groupCaps(m, sel);
      if (gc.resizable) {
        for (const h of rectHandlesFor(union))
          nodes.push({ kind: 'handle', at: h.at, cursor: h.cursor });
      }
    }
  }
  // The rotate knob (single shape or group) — one source of truth with the menu
  // anchor, so the menu is always pushed clear of exactly this point. Hidden
  // while a rotate runs (the gesture holds capture; the guides own the mode).
  if (!rd) {
    const knob = selectionKnob(m, pon, pageBox, knobOffset, view);
    if (knob) nodes.push({ kind: 'rotate-knob', at: knob.at, from: knob.from });
  }
  return nodes;
}

/** The content-space union of the selectable selected items on `pon`, or null if
 *  the page holds none. This is the SAME box the chrome outline draws, so a
 *  floating menu sits exactly on the selection. */
export function selectionBoundsOnPage(m: Model, pon: number, view?: ViewEnv): Rect | null {
  const sel = m.selected.filter((id) => isSelectable(m, id) && m.byId[id].pon === pon);
  if (sel.length === 0) return null;
  // The rotated AABB: the axis-aligned box that encloses the ORIENTED selection
  // quad. For a tilted shape this tracks the live `rot`, so the upright floating
  // menu floats above the whole tilted shape instead of the (fixed) unrotated box.
  const corners = sel.flatMap((id) =>
    selectionQuad(
      effGeom(m, id, view),
      effStyle(m.byId[id], view).strokeWidth,
      m.byId[id].style.border,
    ),
  );
  return unionRect(corners);
}

/** The anchor for a selection-aware floating menu: the PRIMARY page (the first
 *  selectable selected id) + the union box of the selection on that page (content
 *  space). Null when nothing selectable is selected. A cross-page selection
 *  anchors to its primary page, so there is exactly one menu. `pageBoxOf` is a
 *  lookup (the anchor resolves its own page) feeding the page-bound knob
 *  placement — the menu then dodges the knob where it ACTUALLY sits. */
export function selectionAnchor(
  m: Model,
  pageBoxOf?: (pon: number) => Rect | undefined,
  knobOffsetOf?: (pon: number) => number | undefined,
  viewOf?: (pon: number) => ViewEnv | undefined,
): { pon: number; bounds: Rect; knob?: Vec } | null {
  // No menu while a rotate gesture runs (v2 behaviour): the chrome is in
  // guides mode and a floating menu chasing a spinning box is pure noise.
  if (m.draft?.g === 'rotate') return null;
  const id = m.selected.find((x) => isSelectable(m, x));
  if (id == null) return null;
  const pon = m.byId[id].pon;
  const view = viewOf?.(pon);
  const bounds = selectionBoundsOnPage(m, pon, view);
  if (!bounds) return null;
  // `bounds` is the plain selection box (the menu stays centred on it). The knob
  // rides ALONGSIDE it so the menu can nudge ONLY the edge it sits on, and only
  // when the handle would otherwise hide under it — never shifting the centre.
  const knob = selectionKnob(
    m,
    pon,
    pageBoxOf?.(pon),
    knobOffsetOf?.(pon) ?? ROTATE_KNOB_OFFSET,
    view,
  );
  return knob ? { pon, bounds, knob: knob.at } : { pon, bounds };
}

/** Anchor for controls that finish/cancel an active multi-click creation draft.
 *  It is rect-based like selectionAnchor, using the committed vertices only so
 *  the menu remains stable while the hover preview follows the pointer. */
export function creationDraftAnchor(m: Model): CreationDraftAnchor | null {
  const d = m.draft;
  if (d?.g !== 'create-poly') return null;
  if (!d.points.length) return null;
  const minPoints = d.closed ? 3 : 2;
  return {
    kind: 'poly',
    subtype: d.closed ? 'polygon' : 'polyline',
    pon: d.pon,
    bounds: unionRect(d.points),
    pointCount: d.points.length,
    minPoints,
    canFinish: d.points.length >= minPoints,
  };
}
