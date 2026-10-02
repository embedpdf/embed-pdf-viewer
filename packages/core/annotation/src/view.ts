import type { Annotation, PageRef } from '@embedpdf/engine-core/runtime';
import { rasterPlacement, sourceDuring } from './appearance';
import { annotationSelectionFrame } from './selection';
/**
 * Pure view selectors. `pageItems` is the per-annotation render list (live gesture
 * applied) for customRenderer wrapping; `chrome` is the selection overlay
 * (handles carry their resize cursor, group box, marquee).
 */
import {
  distanceHandles,
  distanceLayout,
  measurementOf,
  type MeasurementAppearance,
} from './measurement';
import {
  measurementLayout,
  moveMeasurementCaption,
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
  rectHandlesFor,
  ROTATE_KNOB_OFFSET,
} from './geometry';
import { MIN_SIZE, cursorOnScreen, rectFromPoints, rotatePoint, unionRect } from './rect';
import { placed } from './frame';
import { calloutShape } from './shapes/text-box';
import { groupCaps } from './group';
import { isSelectable, paintOrder } from './hit';
import { annotTransformable, viewable } from './flags';
import {
  anchoredGeom,
  anchoredScale,
  anchoredStrokeWidth,
  anchorModeOf,
  type ViewEnv,
} from './anchor';
import { blendFor } from './kinds/styles';
import { isDrag, placedShape } from './placement';
import {
  calloutBox,
  calloutUprightRot,
  draftPlacement,
  lineEndingsOf,
  rotateDraftDelta,
  toolAnnotation,
} from './update';
import type {
  ChromeNode,
  HandleRole,
  Shape,
  Id,
  Model,
  Rect,
  RenderItem,
  Style,
  Point,
} from './types';
import type { CreationDraftAnchor, RotationAnchor } from './types';
import { kindOf, refOf, shapeOf, styleOf, textOf } from './record';

const DRAFT_ID = '__draft__';
const PREVIEW_ID = '__markup_preview__';

const polyPreviewPoints = (points: Point[], current: Point): Point[] => {
  const last = points[points.length - 1];
  return last && (current.x !== last.x || current.y !== last.y) ? [...points, current] : points;
};

/** A redaction's overlay text: the label its hover preview draws. */
const redactionLabelOf = (annotation: Annotation): Pick<RenderItem, 'label'> =>
  annotation.subtype === 'redact' && annotation.overlayText
    ? { label: { text: annotation.overlayText, repeat: annotation.repeat } }
    : {};

/** A note's or file attachment's icon: what its live drawing draws. */
export const iconOf = (annotation: Annotation): Pick<RenderItem, 'icon'> =>
  (annotation.subtype === 'text' || annotation.subtype === 'file-attachment') && annotation.icon
    ? { icon: annotation.icon }
    : {};

function effMeasure(model: Model, id: Id) {
  const record = model.byId[id];
  const draft = model.draft;
  const measure = measurementOf(record.annotation);

  if (!measure || !draft) {
    return measure;
  }

  if (draft.kind === 'caption' && draft.id === id) {
    const geometry = shapeOf(record.annotation);
    const style = styleOf(record.annotation);
    return moveMeasurementCaption(geometry, measure, draft.delta, style).measure;
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
function effGeom(model: Model, id: Id, view: ViewEnv | undefined): Shape {
  const record = model.byId[id];
  const geometry = anchoredGeom(shapeOf(record.annotation), anchorModeOf(record), view);
  const draft = model.draft;
  if (draft) {
    if (draft.kind === 'move' && draft.ids.includes(id))
      return geomTranslate(geometry, draft.delta);
    if (draft.kind === 'handle' && draft.id === id) return draft.current; // already view space
    if (draft.kind === 'caption' && draft.id === id) {
      // A perimeter's or area's caption center is its shape's.
      const style = styleOf(record.annotation);
      const measure = measurementOf(record.annotation);
      return measure
        ? moveMeasurementCaption(geometry, measure, draft.delta, style).geometry
        : geometry;
    }
    if (draft.kind === 'rotate' && draft.ids.includes(id)) {
      // The same snapped angle rule the commit uses (see `rotateDraftDelta`).
      return geomRotateAbout(geometry, draft.pivot, rotateDraftDelta(model, draft).delta);
    }
    if (draft.kind === 'group' && draft.ids.includes(id)) {
      const { sx, sy } = groupResizeFactors(draft.base, draft.current);
      return geomScaleAbout(geometry, draft.anchor, sx, sy, MIN_SIZE);
    }
  }
  return geometry;
}

/** Style with the stroke width an anchored vector body renders at (screen-
 *  constant line weight); everyone else keeps their style verbatim. */
function effStyle(annotation: Annotation, view: ViewEnv | undefined): Style {
  const mode = anchorModeOf({ annotation });
  const style = styleOf(annotation);
  if (!mode?.zoom || !view) return style;
  return { ...style, strokeWidth: anchoredStrokeWidth(style.strokeWidth, mode, view) };
}

/**
 * How an annotation not made yet paints, drawn as it will be once made: a
 * drawing in progress (`draft`) or the tool's ghost (`ghost`, what a click
 * would place). `annotation` is what the tool creates, its defaults and
 * flags; `shape` is where it goes, as the made one will store it, so a
 * screen-anchored icon shows at its size on screen, as a made one does.
 */
export function unmadeItem(
  id: Id,
  annotation: Annotation,
  shape: Shape,
  source: 'draft' | 'ghost',
  view?: ViewEnv,
  measure?: MeasurementAppearance,
): RenderItem {
  const geometry = anchoredGeom(shape, anchorModeOf({ annotation }), view);
  const style = effStyle(annotation, view);
  const distance = measure && measurementLayout(geometry, measure, style);
  const text = textOf(annotation);
  return placed(
    {
      id,
      ref: null,
      subtype: kindOf(annotation).name,
      geometry,
      box: distance?.visualBounds ?? geomVisualBounds(geometry, style),
      style,
      ...(text ? { text } : {}),
      ...iconOf(annotation),
      ...redactionLabelOf(annotation),
      ...(measure ? { measure } : {}),
      source,
      selected: false,
      rot: geomRotation(geometry),
      blend: blendFor(style),
    },
    anchoredScale(anchorModeOf({ annotation }), view),
  );
}

/** A free-text box renders as a live element (editable / reflowing) while it's
 *  being edited or while its source is vector (a resize, in-progress or committed);
 *  otherwise it renders as the engine's baked /AP image, exactly like a shape. */
function textIsLive(model: Model, id: Id): boolean {
  return model.editing === id || sourceDuring(model, id) === 'vector';
}

export function pageItems(model: Model, page: PageRef, view?: ViewEnv): RenderItem[] {
  const pageObjectNumber = page.objectNumber;
  const items: RenderItem[] = [];
  // `paintOrder` puts text-layer markups beneath every other kind (back→front),
  // so a highlight drawn after a circle still paints under it — and culls what
  // `/F` hides. The same order hit-testing uses, so what you click matches
  // what you see.
  for (const id of paintOrder(model, page)) {
    const record = model.byId[id];
    const text = textOf(record.annotation);
    // Free text stays in the render list in every state, like a shape: a baked,
    // idle box renders as its engine /AP image; a live one (editing / resizing /
    // restyled) renders its box — fill + border, and a callout's leader — via
    // the vector scene, while only its text is the framework's editable element
    // (see `textBoxes`). Dropping the live plain box here would lose its border
    // and background the moment it is touched.
    const geometry = effGeom(model, id, view);
    const style = effStyle(record.annotation, view);
    // Where the baked raster is drawn (appearance.ts): a stamp's where its
    // shape is, everyone else's at its raster box, carried along by a move.
    const ap = rasterPlacement(model, id, view, geometry);
    const measure = effMeasure(model, id);
    const distance = measure && measurementLayout(geometry, measure, style);
    items.push(
      placed(
        {
          id,
          ref: refOf(record),
          annotation: record.annotation,
          subtype: kindOf(record.annotation).name,
          geometry,
          box: distance?.visualBounds ?? geomVisualBounds(geometry, style),
          apBox: ap.box,
          style,
          ...(text ? { text } : {}),
          ...iconOf(record.annotation),
          ...redactionLabelOf(record.annotation),
          measure,
          source: sourceDuring(model, id),
          selected: model.selected.includes(id),
          ...(model.hovered === id ? { hovered: true } : {}),
          rot: geomRotation(geometry),
          ...(ap.rot ? { apRot: ap.rot } : {}),
          blend: blendFor(style),
        },
        anchoredScale(anchorModeOf(record), view),
      ),
    );
  }
  const draft = model.draft;
  // A box or a line being drawn shows what releasing it makes, once it is a
  // drag. Until then the release is a click: the tool's ghost shows that.
  if (
    (draft?.kind === 'create-rect' || draft?.kind === 'create-line') &&
    draft.page.objectNumber === pageObjectNumber &&
    isDrag(draft.kind === 'create-line' ? 'segment' : 'box', draft.from, draft.to)
  ) {
    const placement = draftPlacement(draft);
    const tool = { ...toolAnnotation(model, draft.subtype, draft.preset), ...draft.flags };
    const shape = placement && placedShape(tool, placement);
    if (shape) {
      const measure = draft.kind === 'create-line' ? draft.measure : undefined;
      items.push(unmadeItem(DRAFT_ID, tool, shape, 'draft', view, measure));
    }
  }
  if (
    (draft?.kind === 'create-distance' ||
      draft?.kind === 'create-poly' ||
      draft?.kind === 'create-ink') &&
    draft.page.objectNumber === pageObjectNumber
  ) {
    // Preview with the tool's resolved defaults (base + per-subtype override), so the
    // drawing is a faithful WYSIWYG of what will commit — not the bare base style.
    const tool = toolAnnotation(model, draft.subtype, draft.preset);
    const style = { ...styleOf(tool) };
    if (draft.kind === 'create-distance' && style.interiorColor == null) {
      style.interiorColor = style.color;
    }
    const geometry: Shape =
      draft.kind === 'create-distance'
        ? {
            kind: 'line',
            linePoints: { start: draft.from, end: draft.to },
            lineEndings: lineEndingsOf(tool),
            rotation: 0,
          }
        : draft.kind === 'create-poly'
          ? {
              kind: 'poly',
              vertices: polyPreviewPoints(draft.points, draft.current),
              closed: draft.closed,
              lineEndings: draft.closed ? undefined : lineEndingsOf(tool),
              rotation: 0,
            }
          : { kind: 'ink', inkList: draft.strokes, rotation: 0 };
    const measure =
      draft.kind === 'create-distance' || draft.kind === 'create-poly' ? draft.measure : undefined;
    const distance = measure && measurementLayout(geometry, measure, style);
    items.push(
      placed({
        id: DRAFT_ID,
        ref: null,
        measure,
        subtype: draft.subtype,
        geometry,
        box: distance?.visualBounds ?? geomVisualBounds(geometry, style),
        style,
        source: 'draft',
        selected: false,
      }),
    );
  }
  // Callout creation drawing: the in-progress leader (tip → cur, then tip → knee →
  // box) and the text-box preview, painted through the same vector scene.
  if (draft?.kind === 'create-callout' && draft.page.objectNumber === pageObjectNumber) {
    const tool = toolAnnotation(model, draft.subtype, draft.preset);
    const style = styleOf(tool);
    const toolEnding = tool.subtype === 'free-text' ? tool.lineEnding : null;
    const ending = toolEnding && toolEnding !== 'none' ? toolEnding : 'open-arrow';
    // The box preview carries the same upright rot the commit will apply, so
    // the ghost box (and its leader connection) is what you actually get.
    const rot = calloutUprightRot(draft);
    const geometry: Shape =
      draft.step === 'knee'
        ? {
            kind: 'line',
            linePoints: { start: draft.tip, end: draft.current },
            lineEndings: { start: ending, end: 'none' },
            rotation: 0,
          }
        : calloutShape(calloutBox(draft), rot, draft.tip, draft.knee, ending);
    items.push(
      placed({
        id: DRAFT_ID,
        ref: null,
        subtype: draft.subtype,
        geometry,
        box: geomVisualBounds(geometry, style),
        style,
        source: 'draft',
        selected: false,
      }),
    );
  }
  // Live text-markup preview: the in-progress selection rendered as the markup it
  // will become (same `scene()` paint as the committed annotation).
  const quads = model.preview?.byPage[pageObjectNumber];
  if (model.preview && quads?.length) {
    const geometry: Shape = { kind: 'quads', quadPoints: quads };
    items.push(
      placed({
        id: PREVIEW_ID,
        ref: null,
        subtype: model.preview.subtype,
        geometry,
        box: geomVisualBounds(geometry, { strokeWidth: 0 }),
        style: styleOf(toolAnnotation(model, model.preview.subtype, model.preview.preset)),
        source: 'draft',
        selected: false,
      }),
    );
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
  const pageObjectNumber = page.objectNumber;
  const out: TextBox[] = [];
  for (const id of model.order) {
    const record = model.byId[id];
    if (
      record.annotation.page.objectNumber !== pageObjectNumber ||
      shapeOf(record.annotation).kind !== 'text-box'
    )
      continue;
    if (!viewable(record.annotation, model.selected.includes(id))) continue; // `/F`-hidden
    if (!textIsLive(model, id)) continue; // baked → rendered as the /AP image instead
    const geometry = effGeom(model, id, view);
    if (geometry.kind !== 'text-box') continue;
    out.push({
      id,
      box: geometry.box,
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
    const record = model.byId[id];
    if (!record) continue;
    const geometry = effGeom(model, id, view);
    const style = effStyle(record.annotation, view);
    items.push(
      placed(
        {
          id,
          ref: refOf(record),
          annotation: record.annotation,
          subtype: kindOf(record.annotation).name,
          geometry,
          box: geomVisualBounds(geometry, style),
          style,
          source: record.source,
          selected: true,
          rot: geomRotation(geometry),
        },
        anchoredScale(anchorModeOf(record), view),
      ),
    );
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
function effectiveSelectionFrame(model: Model, id: Id, geometry: Shape, view?: ViewEnv) {
  const record = model.byId[id];
  return annotationSelectionFrame(record, undefined, {
    geometry,
    style: effStyle(record.annotation, view),
    measure: effMeasure(model, id),
  });
}

/** Union of the effective frames; group chrome and rotation use this box. */
function unionBoundsOf(
  model: Model,
  page: PageRef,
  geomOf: (id: Id) => Shape,
  view?: ViewEnv,
): Rect | null {
  const pageObjectNumber = page.objectNumber;
  const corners: Point[] = [];
  for (const id of model.selected) {
    const record = model.byId[id];
    if (!record || record.annotation.page.objectNumber !== pageObjectNumber) continue;
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
  geomOf: (id: Id) => Shape,
  view?: ViewEnv,
): { at: Point; from: Point } | null {
  const pageObjectNumber = page.objectNumber;
  const selection = model.selected.filter(
    (id) =>
      isSelectable(model, id) && model.byId[id].annotation.page.objectNumber === pageObjectNumber,
  );
  if (selection.length === 1) {
    const record = model.byId[selection[0]];
    // No knob for a locked (frozen) annotation — the same gate hitTest
    // applies, so the drawn knob is always grabbable and vice versa. A
    // screen-anchored body keeps its knob: rotating edits its authored tilt
    // (`noRotate` only exempts it from the page's rotation). The obb takes
    // the projected stroke width (`effStyle`) — with the raw width, the knob
    // drifts off the outline as zoom grows.
    if (!kindOf(record.annotation).caps.rotatable || !annotTransformable(record)) return null;
    const frame = effectiveSelectionFrame(model, record.id, geomOf(record.id), view);
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
    model.byId[draft.ids[0]]?.annotation.page.objectNumber === page.objectNumber
  ) {
    const rest = placeSelectionKnob(
      model,
      page,
      pageBox,
      knobOffset,
      (id) => anchoredGeom(shapeOf(model.byId[id].annotation), anchorModeOf(model.byId[id]), view),
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
  const pageObjectNumber = page.objectNumber;
  const nodes: ChromeNode[] = [];
  if (model.draft?.kind === 'marquee' && model.draft.page.objectNumber === pageObjectNumber) {
    nodes.push({ kind: 'marquee', rect: rectFromPoints(model.draft.from, model.draft.to) });
  }
  // A link being drawn: it has no drawing of its own, so the box it will
  // cover shows as the rubber band.
  if (
    model.draft?.kind === 'create-rect' &&
    model.draft.subtype === 'link' &&
    model.draft.page.objectNumber === pageObjectNumber
  ) {
    nodes.push({ kind: 'marquee', rect: rectFromPoints(model.draft.from, model.draft.to) });
  }
  // Live alignment guides of a snapped move (the gesture lives on one page —
  // its members' page).
  if (
    model.draft?.kind === 'move' &&
    model.draft.guides.length &&
    model.byId[model.draft.ids[0]]?.annotation.page.objectNumber === pageObjectNumber
  ) {
    for (const guide of model.draft.guides)
      nodes.push({ kind: 'guide', axis: guide.axis, at: guide.at, lo: guide.lo, hi: guide.hi });
  }
  // A live rotate on this page's selection. While it runs, the chrome switches
  // modes: full-bleed guides appear (the angle is the rotation badge's, a
  // screen overlay: `rotationAnchor`), and the handles/knob are suppressed
  // below — the pointer holds capture, so grab affordances are noise; "how
  // far am I" feedback is everything.
  const rd =
    model.draft?.kind === 'rotate' &&
    model.byId[model.draft.ids[0]]?.annotation.page.objectNumber === pageObjectNumber
      ? model.draft
      : null;
  if (rd) {
    const { angle } = rotateDraftDelta(model, rd);
    // Guides as chords of the page through the pivot — the fixed 0°/90°
    // reference cross + the live indicator at the same snapped angle the badge
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
    (id) =>
      isSelectable(model, id) && model.byId[id].annotation.page.objectNumber === pageObjectNumber,
  );
  if (selection.length === 1) {
    const record = model.byId[selection[0]];
    const geometry = effGeom(model, selection[0], view);
    const style = effStyle(record.annotation, view);
    const caps = kindOf(record.annotation).caps;
    const rot = geomRotation(geometry);
    const measure = effMeasure(model, record.id);
    const distance =
      measure?.intent === 'line-dimension' && distanceLayout(geometry, measure, style.strokeWidth);
    const frame = effectiveSelectionFrame(model, record.id, geometry, view);
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
    if (!rd && annotTransformable(record) && (caps.resizable || caps.vertexEditable)) {
      const handles = distance ? distanceHandles(distance) : geomHandles(geometry);
      const dragged =
        model.draft?.kind === 'handle' && model.draft.id === record.id ? model.draft.handle : null;
      for (const handle of handles) {
        nodes.push({
          kind: 'handle',
          at: handle.at,
          cursor: cursorOnScreen(handle.cursor, view?.rotation ?? 0),
          ...(rot ? { rot } : {}),
          role: handleRole(handle.id),
          active: handle.id === dragged,
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
        const dragged =
          model.draft?.kind === 'group' && model.draft.op === 'resize' ? model.draft.handle : null;
        for (const handle of rectHandlesFor(union))
          nodes.push({
            kind: 'handle',
            at: handle.at,
            cursor: cursorOnScreen(handle.cursor, view?.rotation ?? 0),
            role: handleRole(handle.id),
            active: handle.id === dragged,
          });
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

/** The page-space union of the selectable selected items on `page`, or null if
 *  the page holds none. This is the same box the chrome outline draws, so a
 *  floating menu sits exactly on the selection. */
export function selectionBoundsOnPage(model: Model, page: PageRef, view?: ViewEnv): Rect | null {
  const pageObjectNumber = page.objectNumber;
  const selection = model.selected.filter(
    (id) =>
      isSelectable(model, id) && model.byId[id].annotation.page.objectNumber === pageObjectNumber,
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
  // No menu while a gesture moves, resizes or turns the selection, or a box
  // selects: a floating menu chasing the pointer is noise, and it would cover
  // what the user is placing.
  if (model.draft && !model.draft.kind.startsWith('create-')) return null;
  const id = model.selected.find((selectedId) => isSelectable(model, selectedId));
  if (id == null) return null;
  const page = model.byId[id].annotation.page;
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
/**
 * The rotation in progress, for the badge that follows the pointer: `null`
 * when nothing is being turned. The badge is a screen overlay, so it stays
 * upright however the page is shown.
 */
export function rotationAnchor(model: Model): RotationAnchor | null {
  const draft = model.draft;
  if (draft?.kind !== 'rotate') return null;
  const page = model.byId[draft.ids[0]]?.annotation.page;
  if (!page) return null;
  return {
    page,
    at: draft.current,
    angle: Math.round(rotateDraftDelta(model, draft).angle),
  };
}

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
            { kind: 'poly', vertices: draft.points, closed: draft.closed, rotation: 0 },
            draft.measure,
          )
        )),
  };
}

/** A box's corner handle (`nw`), a side's (`n`), or one point of a line, polygon or dimension. */
function handleRole(id: string): HandleRole {
  if (id === 'nw' || id === 'ne' || id === 'se' || id === 'sw') return 'corner';
  if (id === 'n' || id === 'e' || id === 's' || id === 'w') return 'side';
  return 'point';
}

/**
 * Where UI attaches to one annotation: its page and the box around what it
 * shows, a gesture in progress included, so an overlay follows a drag. `null`
 * for a record the model doesn't have.
 */
export function annotationAnchor(
  model: Model,
  id: Id,
  view?: ViewEnv,
): { page: PageRef; bounds: Rect } | null {
  const record = model.byId[id];
  if (!record) return null;
  const frame = effectiveSelectionFrame(model, id, effGeom(model, id, view), view);
  return { page: record.annotation.page, bounds: unionRect(frame.corners) };
}
