import type { PageRef } from '@embedpdf/engine-core/runtime';
import { annotationSelectionFrame } from './selection';
/**
 * Pure view selectors. `pageItems` is the per-annotation render list (live gesture
 * applied) for customRenderer wrapping; `chrome` is the selection overlay
 * (handles carry their resize cursor, group box, marquee).
 */
import { distanceHandles, distanceLayout } from './measurement';
import {
  measurementLayout,
  moveMeasurementCaption,
  transformMeasurementCaption,
  shapeMeasurementReadout,
} from './measurement-shape';
import {
  chordThrough,
  geomHandles,
  geomRotateAbout,
  geomRotation,
  geomScaleAbout,
  geomTranslate,
  geomVisualBounds,
  groupResizeFactors,
  placeRotateKnob,
  rectFromPoints,
  rectHandlesFor,
  normalizeDeg,
  rotatePoint,
  shapeRectFor,
  unionRect,
  ROTATE_KNOB_OFFSET,
} from './geometry';
import { groupCaps } from './group';
import { isSelectable, paintOrder } from './hit';
import { capsFor } from './kinds';
import { annotTransformable, viewable } from './flags';
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
import type {
  ModelAnnotation,
  ChromeNode,
  ContentGeometry,
  Id,
  Model,
  Rect,
  RenderItem,
  Style,
  Point,
} from './types';
import type { CreationDraftAnchor } from './types';

const DRAFT_ID = '__draft__';
const PREVIEW_ID = '__markup_preview__';

const polyPreviewPoints = (points: Point[], current: Point): Point[] => {
  const last = points[points.length - 1];
  return last && (current.x !== last.x || current.y !== last.y) ? [...points, current] : points;
};

function effMeasure(model: Model, id: Id) {
  const annotation = model.byId[id];
  const draft = model.draft;
  const measure = annotation.measure;

  if (!measure || !draft) {
    return measure;
  }

  if (draft.kind === 'caption' && draft.id === id) {
    return moveMeasurementCaption(annotation.geometry, measure, draft.delta, annotation.style);
  }

  if (draft.kind === 'leader' && draft.id === id && measure.intent === 'line-dimension') {
    return {
      ...measure,
      leader: {
        ...measure.leader,
        length: (measure.leader?.length ?? 0) + draft.delta,
      },
    };
  }

  if (draft.kind === 'move' && draft.ids.includes(id)) {
    return transformMeasurementCaption(measure, (point) => ({
      x: point.x + draft.delta.x,
      y: point.y + draft.delta.y,
    }));
  }
  if (draft.kind === 'rotate' && draft.ids.includes(id)) {
    return transformMeasurementCaption(measure, (point) =>
      rotatePoint(point, draft.pivot, rotateDraftDelta(model, draft).delta),
    );
  }
  if (draft.kind === 'group' && draft.ids.includes(id)) {
    const { sx, sy } = groupResizeFactors(draft.base, draft.current);
    return transformMeasurementCaption(measure, (point) => ({
      x: draft.anchor.x + (point.x - draft.anchor.x) * sx,
      y: draft.anchor.y + (point.y - draft.anchor.y) * sy,
    }));
  }
  return measure;
}

/**
 * The gesture-effective geometry, in view space: Project first (screen-
 * anchored bodies to their effective footprint — the identity for everyone
 * else), then apply the live gesture. Gestures compose in view space: the
 * pointer, the drafts' pivots/boxes, and a `handle` draft's geometry all live
 * there already, so one code path serves flagged and unflagged annotations —
 * and the commit (`editUp`) maps the same composition back through
 * `unanchoredGeom`, so preview ≡ commit by construction. The geometry every
 * selector below hands out, so render/chrome/bounds agree with hit.
 */
function effGeom(model: Model, id: Id, view: ViewEnv | undefined): ContentGeometry {
  const annotation = model.byId[id];
  const geometry = anchoredGeom(annotation.geometry, anchorModeOf(annotation), view);
  const draft = model.draft;
  if (draft) {
    if (draft.kind === 'move' && draft.ids.includes(id))
      return geomTranslate(geometry, draft.delta);
    if (draft.kind === 'handle' && draft.id === id) return draft.current; // already view space
    if (draft.kind === 'rotate' && draft.ids.includes(id)) {
      // The same snapped angle rule the commit uses (see `rotateDraftDelta`).
      return geomRotateAbout(geometry, draft.pivot, rotateDraftDelta(model, draft).delta);
    }
    if (draft.kind === 'group' && draft.ids.includes(id)) {
      const { sx, sy } = groupResizeFactors(draft.base, draft.current);
      return geomScaleAbout(geometry, draft.anchor, sx, sy);
    }
  }
  return geometry;
}

/** Style with the stroke width an anchored vector body renders at (screen-
 *  constant line weight); everyone else keeps their style verbatim. */
function effStyle(annotation: ModelAnnotation, view: ViewEnv | undefined): Style {
  const mode = anchorModeOf(annotation);
  if (!mode?.zoom || !view) return annotation.style;
  return {
    ...annotation.style,
    strokeWidth: anchoredStrokeWidth(annotation.style.strokeWidth, mode, view),
  };
}

/** The blit placement for a baked raster: its box (view space, live move
 *  applied) + the rotation to re-apply about the box centre.
 *
 *  `opaqueBody` kinds (stamp images): the raster is the visual, so the box
 *  follows every live gesture — the unrotated rect of the effective geometry
 *  covers move, resize, and group-scale in one rule, and the effective
 *  rotation drives the blit transform (a stamp spins with the gesture).
 *
 *  Everyone else blits by the AP `/Rect`: for a screen-anchored annotation
 *  that box rides the same similarity the geometry projects through
 *  (`anchoredBox`), composing its counter-rotation with any engine-stripped
 *  `apRot` — so a baked noZoom/noRotate body renders screen-constant too. */
function effAp(model: Model, id: Id, view: ViewEnv | undefined): { box?: Rect; rot?: number } {
  const annotation = model.byId[id];
  if (capsFor(annotation.subtype).opaqueBody) {
    const geometry = effGeom(model, id, view);
    return {
      box: 'rect' in geometry ? geometry.rect : annotation.apBox,
      rot: geomRotation(geometry) || undefined,
    };
  }
  if (!annotation.apBox) return { rot: annotation.apRot };
  const projected = anchoredBox(
    annotation.apBox,
    anchorOf(annotation.geometry),
    anchorModeOf(annotation),
    view,
  );
  let box = projected?.box ?? annotation.apBox;
  const rot = normalizeDeg((annotation.apRot ?? 0) + (projected?.rot ?? 0)) || undefined;
  const draft = model.draft;
  if (draft?.kind === 'move' && draft.ids.includes(id)) {
    box = { ...box, x: box.x + draft.delta.x, y: box.y + draft.delta.y };
  }
  return { box, rot };
}

/** Render source for one annotation: an in-progress resize renders live (the
 *  baked raster can't stretch), even though the commit hasn't flipped `source`
 *  yet — so the drag is crisp and a no-op grab can revert to baked. */
function effSource(model: Model, id: Id): 'baked' | 'vector' {
  const annotation = model.byId[id];
  // `opaqueBody` kinds have no vector render: they stay baked through every
  // gesture — the bitmap stretches with `effApBox` and tilts via the item's
  // live `rot`, then the engine's re-fit appearance replaces it on commit.
  if (capsFor(annotation.subtype).opaqueBody) return annotation.source;
  // A text box under text edit renders fully live (scene fill/border — and a
  // callout's leader — + DOM text): the flat baked raster can't hide just
  // its text, so any blend doubles it. Geometry gestures flip below; editing
  // joins them here.
  if (model.editing === id && annotation.geometry.kind === 'text') return 'vector';
  const draft = model.draft;
  // A live resize/rotate/group transform must render live — the baked raster
  // can't stretch or tilt — even before the commit flips `source`.
  if (
    (draft?.kind === 'handle' || draft?.kind === 'caption' || draft?.kind === 'leader') &&
    draft.id === id
  )
    return 'vector';
  if ((draft?.kind === 'rotate' || draft?.kind === 'group') && draft.ids.includes(id))
    return 'vector';
  return annotation.source;
}

/** A free-text box renders as a live element (editable / reflowing) while it's
 *  being edited or while its source is vector (a resize, in-progress or committed);
 *  otherwise it renders as the engine's baked /AP image, exactly like a shape. */
function textIsLive(model: Model, id: Id): boolean {
  return model.editing === id || effSource(model, id) === 'vector';
}

export function pageItems(model: Model, page: PageRef, view?: ViewEnv): RenderItem[] {
  const pageObjectNumber = page.pageObjectNumber;
  const items: RenderItem[] = [];
  // `paintOrder` puts text-layer markups beneath every other kind (back→front),
  // so a highlight drawn after a circle still paints under it — and culls what
  // `/F` hides. The same order hit-testing uses, so what you click matches
  // what you see.
  for (const id of paintOrder(model, page)) {
    const annotation = model.byId[id];
    // Free text stays in the render list in every state, like a shape: a baked,
    // idle box renders as its engine /AP image; a live one (editing / resizing /
    // restyled) renders its box — fill + border, and a callout's leader — via
    // the vector scene, while only its text is the framework's editable element
    // (see `textBoxes`). Dropping the live plain box here would lose its border
    // and background the moment it is touched.
    const geometry = effGeom(model, id, view);
    const style = effStyle(annotation, view);
    // Blit box + rotation for the baked raster (see `effAp`): opaqueBody kinds
    // follow the live effective geometry; everyone else blits by the AP /Rect,
    // projected through the anchor similarity for screen-anchored bodies and
    // composed with any engine-stripped `apRot`.
    const ap = effAp(model, id, view);
    const measure = effMeasure(model, id);
    const distance = measure && measurementLayout(geometry, measure, style);
    items.push({
      id,
      ref: annotation.ref,
      subtype: annotation.subtype,
      geometry,
      box: distance?.visualBounds ?? geomVisualBounds(geometry, style.strokeWidth, style.border),
      apBox: ap.box,
      style,
      ...(annotation.text ? { text: annotation.text } : {}),
      ...(annotation.label ? { label: annotation.label } : {}),
      measure,
      source: effSource(model, id),
      selected: model.selected.includes(id),
      ...(model.hovered === id ? { hovered: true } : {}),
      rot: geomRotation(geometry),
      ...(ap.rot ? { apRot: ap.rot } : {}),
      blend: blendFor(annotation.style),
    });
  }
  const draft = model.draft;
  if (
    (draft?.kind === 'create-rect' ||
      draft?.kind === 'create-line' ||
      draft?.kind === 'create-distance' ||
      draft?.kind === 'create-poly' ||
      draft?.kind === 'create-ink') &&
    draft.page.pageObjectNumber === pageObjectNumber
  ) {
    // Preview with the tool's resolved defaults (base + per-subtype override), so the
    // ghost is a faithful WYSIWYG of what will commit — not the bare base style. A
    // cloudy rect stores the outer box (see `shapeRectFor`), so the cloud grows out
    // from the cursor; a 0-drag draws nothing (skipped, like a solid 0×0).
    const definition = defaultsFor(model, draft.preset ?? draft.subtype);
    const style = styleFromProps(definition);
    if (draft.kind === 'create-distance' && style.interiorColor == null) {
      style.interiorColor = style.color;
    }
    const dragged = draft.kind === 'create-rect' ? rectFromPoints(draft.from, draft.to) : null;
    const geometry: ContentGeometry | null =
      draft.kind === 'create-rect'
        ? dragged && (dragged.width > 0 || dragged.height > 0)
          ? {
              kind: 'rect',
              rect: shapeRectFor(dragged, draft.ellipse, style),
              ellipse: draft.ellipse,
            }
          : null
        : draft.kind === 'create-line' || draft.kind === 'create-distance'
          ? { kind: 'line', a: draft.from, b: draft.to, ends: definition.lineEndings }
          : draft.kind === 'create-poly'
            ? {
                kind: 'poly',
                points: polyPreviewPoints(draft.points, draft.current),
                closed: draft.closed,
                ends: draft.closed ? undefined : definition.lineEndings,
              }
            : { kind: 'ink', strokes: draft.strokes };
    if (geometry) {
      const measure =
        draft.kind === 'create-line' ||
        draft.kind === 'create-distance' ||
        draft.kind === 'create-poly'
          ? draft.measure
          : undefined;
      const distance = measure && measurementLayout(geometry, measure, style);
      items.push({
        id: DRAFT_ID,
        ref: null,
        measure,
        subtype: draft.subtype,
        geometry,
        box: distance?.visualBounds ?? geomVisualBounds(geometry, style.strokeWidth, style.border),
        style,
        source: 'ghost',
        selected: false,
      });
    }
  }
  // Callout creation ghost: the in-progress leader (tip → cur, then tip → knee →
  // box) and the text-box preview, painted through the same vector scene.
  if (draft?.kind === 'create-callout' && draft.page.pageObjectNumber === pageObjectNumber) {
    const definition = defaultsFor(model, draft.preset ?? draft.subtype);
    const style = styleFromProps(definition);
    const ending =
      definition.lineEndings.end !== 'none' ? definition.lineEndings.end : 'open-arrow';
    // The box preview carries the same upright rot the commit will apply, so
    // the ghost box (and its leader connection) is what you actually get.
    const rot = calloutUprightRot(draft);
    const geometry: ContentGeometry =
      draft.step === 'knee'
        ? { kind: 'line', a: draft.tip, b: draft.current, ends: { start: ending, end: 'none' } }
        : {
            kind: 'text',
            rect: calloutBox(draft),
            callout: { tip: draft.tip, knee: draft.knee, ending },
            ...(rot ? { rot } : {}),
          };
    items.push({
      id: DRAFT_ID,
      ref: null,
      subtype: draft.subtype,
      geometry,
      box: geomVisualBounds(geometry, style.strokeWidth, style.border),
      style,
      source: 'ghost',
      selected: false,
    });
  }
  // Live text-markup preview: the in-progress selection rendered as the markup it
  // will become (same `scene()` paint as the committed annotation).
  const quads = model.preview?.byPage[pageObjectNumber];
  if (model.preview && quads?.length) {
    const geometry: ContentGeometry = { kind: 'quads', quads };
    items.push({
      id: PREVIEW_ID,
      ref: null,
      subtype: model.preview.subtype,
      geometry,
      box: geomVisualBounds(geometry, 0),
      style: styleFromProps(defaultsFor(model, model.preview.preset)),
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
  /** Applied rotation (deg, CW). `box` is the unrotated text box; the framework
   *  rotates the editable element about its centre by this. 0/undefined = none. */
  rot?: number;
}

/** The free-text boxes on a page — the text counterpart of `pageItems`. */
export function textBoxes(model: Model, page: PageRef, view?: ViewEnv): TextBox[] {
  const pageObjectNumber = page.pageObjectNumber;
  const out: TextBox[] = [];
  for (const id of model.order) {
    const annotation = model.byId[id];
    if (
      annotation.page.pageObjectNumber !== pageObjectNumber ||
      annotation.geometry.kind !== 'text'
    )
      continue;
    if (!viewable(annotation.flags, model.selected.includes(id))) continue; // `/F`-hidden
    if (!textIsLive(model, id)) continue; // baked → rendered as the /AP image instead
    const geometry = effGeom(model, id, view);
    if (geometry.kind !== 'text') continue;
    out.push({
      id,
      box: geometry.rect,
      editing: model.editing === id,
      rot: geomRotation(geometry),
    });
  }
  return out;
}

/** The currently selected annotations as render items (live gesture applied) —
 *  cross-page, for selection-aware toolbars (style + line-ending editing). */
export function selectedItems(model: Model, view?: ViewEnv): RenderItem[] {
  const items: RenderItem[] = [];
  for (const id of model.selected) {
    const annotation = model.byId[id];
    if (!annotation) continue;
    const geometry = effGeom(model, id, view);
    const style = effStyle(annotation, view);
    items.push({
      id,
      ref: annotation.ref,
      subtype: annotation.subtype,
      geometry,
      box: geomVisualBounds(geometry, style.strokeWidth, style.border),
      style,
      source: annotation.source,
      selected: true,
      rot: geomRotation(geometry),
    });
  }
  return items;
}

const boxCorners = (rect: Rect): [Point, Point, Point, Point] => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height },
];

/** Project the complete annotation after applying the current gesture. */
function effectiveSelectionFrame(model: Model, id: Id, geometry: ContentGeometry, view?: ViewEnv) {
  const annotation = model.byId[id];
  return annotationSelectionFrame({
    ...annotation,
    geometry,
    style: effStyle(annotation, view),
    measure: effMeasure(model, id),
  });
}

/** Union of the effective frames; group chrome and rotation use this box. */
function unionBoundsOf(
  model: Model,
  page: PageRef,
  geomOf: (id: Id) => ContentGeometry,
  view?: ViewEnv,
): Rect | null {
  const pageObjectNumber = page.pageObjectNumber;
  const corners: Point[] = [];
  for (const id of model.selected) {
    const annotation = model.byId[id];
    if (!annotation || annotation.page.pageObjectNumber !== pageObjectNumber) continue;
    corners.push(...effectiveSelectionFrame(model, id, geomOf(id), view).corners);
  }
  return corners.length ? unionRect(corners) : null;
}

/** The page-bound knob placement for the selection on `page`, reading each
 *  member's geometry through `geomOf` — `effGeom` for the live view, the
 *  committed geometry for a rotate gesture's rest anchor (see `selectionKnob`). */
function placeSelectionKnob(
  model: Model,
  page: PageRef,
  pageBox: Rect | undefined,
  knobOffset: number,
  geomOf: (id: Id) => ContentGeometry,
  view?: ViewEnv,
): { at: Point; from: Point } | null {
  const pageObjectNumber = page.pageObjectNumber;
  const selection = model.selected.filter(
    (id) => isSelectable(model, id) && model.byId[id].page.pageObjectNumber === pageObjectNumber,
  );
  if (selection.length === 1) {
    const annotation = model.byId[selection[0]];
    // No knob for a locked (frozen) annotation — the same gate hitTest
    // applies, so the drawn knob is always grabbable and vice versa. A
    // screen-anchored body keeps its knob: rotating edits its authored tilt
    // (`noRotate` only exempts it from the page's rotation). The obb takes
    // the projected stroke width (`effStyle`) — with the raw width, the knob
    // drifts off the outline as zoom grows.
    if (!capsFor(annotation.subtype).rotatable || !annotTransformable(annotation)) return null;
    const frame = effectiveSelectionFrame(model, annotation.id, geomOf(annotation.id), view);
    return placeRotateKnob(frame.corners, knobOffset, pageBox);
  }
  if (selection.length > 1 && groupCaps(model, selection).rotatable) {
    const union = unionBoundsOf(model, page, geomOf, view);
    if (union) return placeRotateKnob(boxCorners(union), knobOffset, pageBox);
  }
  return null;
}

/**
 * The rotate knob for the current selection on `page` — the same knob `chrome`
 * draws — or null when the selection has none (non-rotatable single, or a group
 * whose caps aren't rotatable). A single shape's knob hangs off its OBB top edge;
 * a group's off the union box. With `pageBox` the knob is placed page-bound
 * (`placeRotateKnob`: flip below / clamp inside) — off-page it would be visible
 * but unreachable, since pointer dispatch resolves pages by containment. Shared
 * by `chrome` (to draw) and `selectionAnchor` (to push the menu clear of it), so
 * the two can never disagree on where it is.
 *
 * The placement decision is made at rest; a gesture never re-decides — it rides.
 * During a live rotate the knob starts exactly where it was grabbed (the rest
 * placement on the committed geometry) and turns rigidly about the pivot by the
 * same snapped delta the shape uses; the policy re-evaluates only on release.
 * Re-deciding per frame would jump at grab and side-switch mid-spin.
 */
export function selectionKnob(
  model: Model,
  page: PageRef,
  pageBox?: Rect,
  knobOffset: number = ROTATE_KNOB_OFFSET,
  view?: ViewEnv,
): { at: Point; from: Point } | null {
  const draft = model.draft;
  if (
    draft?.kind === 'rotate' &&
    model.byId[draft.ids[0]]?.page.pageObjectNumber === page.pageObjectNumber
  ) {
    const rest = placeSelectionKnob(
      model,
      page,
      pageBox,
      knobOffset,
      (id) => anchoredGeom(model.byId[id].geometry, anchorModeOf(model.byId[id]), view),
      view,
    );
    if (!rest) return null;
    const { delta } = rotateDraftDelta(model, draft);
    return {
      at: rotatePoint(rest.at, draft.pivot, delta),
      from: rotatePoint(rest.from, draft.pivot, delta),
    };
  }
  return placeSelectionKnob(
    model,
    page,
    pageBox,
    knobOffset,
    (id) => effGeom(model, id, view),
    view,
  );
}

export function chrome(
  model: Model,
  page: PageRef,
  pageBox?: Rect,
  knobOffset: number = ROTATE_KNOB_OFFSET,
  view?: ViewEnv,
): ChromeNode[] {
  const pageObjectNumber = page.pageObjectNumber;
  const nodes: ChromeNode[] = [];
  if (model.draft?.kind === 'marquee' && model.draft.page.pageObjectNumber === pageObjectNumber) {
    nodes.push({ kind: 'marquee', rect: rectFromPoints(model.draft.from, model.draft.to) });
  }
  // Live alignment guides of a snapped move (the gesture lives on one page —
  // its members' page).
  if (
    model.draft?.kind === 'move' &&
    model.draft.guides.length &&
    model.byId[model.draft.ids[0]]?.page.pageObjectNumber === pageObjectNumber
  ) {
    for (const guide of model.draft.guides)
      nodes.push({ kind: 'guide', axis: guide.axis, at: guide.at, lo: guide.lo, hi: guide.hi });
  }
  // A live rotate on this page's selection. While it runs, the chrome switches
  // modes: the readout chip + full-bleed guides appear, and the
  // handles/knob are suppressed below — the pointer holds capture, so grab
  // affordances are noise; "how far am I" feedback is everything.
  const rd =
    model.draft?.kind === 'rotate' &&
    model.byId[model.draft.ids[0]]?.page.pageObjectNumber === pageObjectNumber
      ? model.draft
      : null;
  if (rd) {
    const { angle } = rotateDraftDelta(model, rd);
    nodes.push({ kind: 'angle-chip', at: rd.current, angle: Math.round(angle) });
    // Guides as chords of the page through the pivot — the fixed 0°/90°
    // reference cross + the live indicator at the same snapped angle the chip
    // shows and the commit applies. Full-bleed beats a magic length constant;
    // no pageBox (headless) → a generous fixed span around the pivot.
    const span = pageBox ?? { x: rd.pivot.x - 300, y: rd.pivot.y - 300, width: 600, height: 600 };
    const lines: Array<{ a: Point; b: Point; role: 'axis' | 'indicator' }> = [];
    for (const [deg, role] of [
      [0, 'axis'],
      [90, 'axis'],
      [angle, 'indicator'],
    ] as const) {
      const chord = chordThrough(span, rd.pivot, deg);
      if (chord) lines.push({ ...chord, role });
    }
    nodes.push({ kind: 'rotate-guides', center: rd.pivot, angle, lines });
  }
  const selection = model.selected.filter(
    (id) => isSelectable(model, id) && model.byId[id].page.pageObjectNumber === pageObjectNumber,
  );
  if (selection.length === 1) {
    const annotation = model.byId[selection[0]];
    const geometry = effGeom(model, selection[0], view);
    const style = effStyle(annotation, view);
    const caps = capsFor(annotation.subtype);
    const rot = geomRotation(geometry);
    const measure = effMeasure(model, annotation.id);
    const distance =
      measure?.intent === 'line-dimension' && distanceLayout(geometry, measure, style.strokeWidth);
    const frame = effectiveSelectionFrame(model, annotation.id, geometry, view);
    if (frame.angle !== 0) {
      nodes.push({ kind: 'obb', corners: frame.corners, angle: frame.angle });
    } else {
      nodes.push({ kind: 'outline', rect: unionRect(frame.corners) });
    }
    // handles for kinds that resize (box) or vertex-edit; anchored/markup show
    // a bare outline — and so do locked (frozen) annotations, the same gate
    // hitTest applies. Screen-anchored bodies keep their handles, placed on
    // the projected geometry (`geometry`), so they sit exactly where hitTest grabs
    // them. `geomHandles` already places them on the rotated box; `rot`
    // additionally tilts each handle glyph so it rides the box's orientation.
    // Suppressed during a live rotate (`rd`) — guides own that mode.
    if (!rd && annotTransformable(annotation) && (caps.resizable || caps.vertexEditable)) {
      const handles = distance ? distanceHandles(distance) : geomHandles(geometry);
      for (const handle of handles) {
        nodes.push({
          kind: 'handle',
          at: handle.at,
          cursor: handle.cursor,
          ...(rot ? { rot } : {}),
        });
      }
    }
  } else if (selection.length > 1 && !rd) {
    // The live union (draft-effective geometry): the outline and its handles
    // ride a group move/scale exactly like single-selection chrome. During a
    // live rotate the members spin away from any axis-aligned box, so the
    // whole block is suppressed — the guides own that mode.
    const union = unionBoundsOf(model, page, (id) => effGeom(model, id, view), view);
    if (union) {
      nodes.push({ kind: 'outline', rect: union });
      const gc = groupCaps(model, selection);
      if (gc.resizable) {
        for (const handle of rectHandlesFor(union))
          nodes.push({ kind: 'handle', at: handle.at, cursor: handle.cursor });
      }
    }
  }
  // The rotate knob (single shape or group) — one source of truth with the menu
  // anchor, so the menu is always pushed clear of exactly this point. Hidden
  // while a rotate runs (the gesture holds capture; the guides own the mode).
  if (!rd) {
    const knob = selectionKnob(model, page, pageBox, knobOffset, view);
    if (knob) nodes.push({ kind: 'rotate-knob', at: knob.at, from: knob.from });
  }
  return nodes;
}

/** The content-space union of the selectable selected items on `page`, or null if
 *  the page holds none. This is the same box the chrome outline draws, so a
 *  floating menu sits exactly on the selection. */
export function selectionBoundsOnPage(model: Model, page: PageRef, view?: ViewEnv): Rect | null {
  const pageObjectNumber = page.pageObjectNumber;
  const selection = model.selected.filter(
    (id) => isSelectable(model, id) && model.byId[id].page.pageObjectNumber === pageObjectNumber,
  );
  if (selection.length === 0) return null;
  // The rotated AABB: the axis-aligned box that encloses the oriented selection
  // quad. For a tilted shape this tracks the live `rot`, so the upright floating
  // menu floats above the whole tilted shape instead of the (fixed) unrotated box.
  const corners = selection.flatMap(
    (id) => effectiveSelectionFrame(model, id, effGeom(model, id, view), view).corners,
  );
  return unionRect(corners);
}

/** The anchor for a selection-aware floating menu: the primary page (the first
 *  selectable selected id) + the union box of the selection on that page (content
 *  space). Null when nothing selectable is selected. A cross-page selection
 *  anchors to its primary page, so there is exactly one menu. `pageBoxOf` is a
 *  lookup (the anchor resolves its own page) feeding the page-bound knob
 *  placement — the menu then dodges the knob where it actually sits. */
export function selectionAnchor(
  model: Model,
  pageBoxOf?: (page: PageRef) => Rect | undefined,
  knobOffsetOf?: (page: PageRef) => number | undefined,
  viewOf?: (page: PageRef) => ViewEnv | undefined,
): { page: PageRef; bounds: Rect; knob?: Point } | null {
  // No menu while a rotate gesture runs: the chrome is in
  // guides mode and a floating menu chasing a spinning box is pure noise.
  if (model.draft?.kind === 'rotate') return null;
  const id = model.selected.find((selectedId) => isSelectable(model, selectedId));
  if (id == null) return null;
  const page = model.byId[id].page;
  const view = viewOf?.(page);
  const bounds = selectionBoundsOnPage(model, page, view);
  if (!bounds) return null;
  // `bounds` is the plain selection box (the menu stays centred on it). The knob
  // rides alongside it so the menu can nudge only the edge it sits on, and only
  // when the handle would otherwise hide under it — never shifting the centre.
  const knob = selectionKnob(
    model,
    page,
    pageBoxOf?.(page),
    knobOffsetOf?.(page) ?? ROTATE_KNOB_OFFSET,
    view,
  );
  return knob ? { page, bounds, knob: knob.at } : { page, bounds };
}

/** Anchor for controls that finish/cancel an active multi-click creation draft.
 *  It is rect-based like selectionAnchor, using the committed vertices only so
 *  the menu remains stable while the hover preview follows the pointer. */
export function creationDraftAnchor(model: Model): CreationDraftAnchor | null {
  const draft = model.draft;
  if (draft?.kind !== 'create-poly') return null;
  if (!draft.points.length) return null;
  const minPoints = draft.closed ? 3 : 2;
  return {
    kind: 'poly',
    subtype: draft.closed ? 'polygon' : 'polyline',
    page: draft.page,
    bounds: unionRect(draft.points),
    pointCount: draft.points.length,
    minPoints,
    canFinish:
      draft.points.length >= minPoints &&
      (!draft.measure ||
        !(
          'unavailable' in
          shapeMeasurementReadout(
            { kind: 'poly', points: draft.points, closed: draft.closed },
            draft.measure,
          )
        )),
  };
}
