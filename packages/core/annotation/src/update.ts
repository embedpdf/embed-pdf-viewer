import { annotationSelectionFrame } from './selection';
/**
 * The pure annotation core: update(model, msg) → [model, effects].
 *
 * Editing is intent-driven (the shell's edit handler sends `editPointer`, the draw
 * handler `createPointer`). Geometry lives in the `ContentGeometry` union; all the per-kind
 * math is in geometry.ts. Effects (create/patch/delete) are the only impurities.
 */
import type {
  AnnotationFlags,
  AnnotationRef,
  InkIntent,
  PageRef,
  RichTextDocumentInput,
} from '@embedpdf/engine-core/runtime';
import {
  distanceLeaderLength,
  type DistanceAppearance,
  type MeasurementAppearance,
} from './measurement';
import {
  moveMeasurementCaption,
  shapeMeasurementReadout,
  transformMeasurementCaption,
} from './measurement-shape';
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
import {
  anchoredGeom,
  anchoredStrokeWidth,
  anchorModeOf,
  unanchoredGeom,
  type ViewEnv,
} from './anchor';
import {
  apSizeChanged,
  caretGeomFromAnchor,
  DEFAULT_CHROME_GEOMETRY,
  geomDragHandle,
  geomResetRotation,
  geomRotateAbout,
  geomRotation,
  geomScaleAbout,
  geomTranslate,
  groupResizeAnchor,
  groupResizeBox,
  groupResizeFactors,
  geomVisualBounds,
  normalizeDeg,
  quadIntersectsRect,
  rectFromPoints,
  rotatedAabb,
  rotatePoint,
  shapeRectFor,
  transposedAboutCenter,
  unionRect,
  uprightAnchoredRect,
  uprightRotation,
} from './geometry';
import { clampRectToBox, clickCreateGeom, resolveClickPlacement } from './placement';
import {
  applyProps,
  initialTextStyle,
  kindTakesLink,
  styleFromProps,
  textStyleFromProps,
} from './props';
import { normalizeRuns, paragraphsFromPlainText, plainTextOf } from './richtext';
import { computeMoveSnap } from './snap';
import { straightenInkStroke } from './ink';
import type {
  ModelAnnotation,
  AnnotationProps,
  AnnotationPropsPatch,
  ClickCreate,
  Draft,
  Effect,
  ContentGeometry,
  Id,
  InkStraightenOptions,
  LineEndings,
  Model,
  Message,
  PointerInput,
  PropKey,
  Quad,
  Rect,
  Style,
  Subtype,
  TextEndAnchor,
  TextQuad,
  Point,
} from './types';

/** The click ↔ drag threshold (content units): a press-release whose width and
 *  height both stay under it is a click. Exported so every gesture owner (the
 *  draw handler, the form plugin's place handler) shares one definition. */
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
 * Resolve a tool's effective defaults as a full flat props bag: the base `style`
 * + the font/endings base, with the per-tool override layered on top. This is
 * what a defaults-editing UI reads, and what creation projects `style`/`text`
 * from (`styleFromProps` / `textStyleFromProps`).
 */
export function defaultsFor(model: Model, subtype: Subtype): AnnotationProps {
  const toolDefaults = model.defaults[subtype];
  return {
    ...model.style,
    ...initialTextStyle,
    ...toolDefaults,
    lineEndings: { ...NO_ENDINGS, ...toolDefaults?.lineEndings },
  };
}

/** Flip an annotation to live (vector) rendering — we now own its appearance, so
 *  the engine's baked AP is no longer authoritative. Idempotent. */
const toVector = (annotation: ModelAnnotation): ModelAnnotation =>
  annotation.source === 'vector' ? annotation : { ...annotation, source: 'vector' };
/**
 * Take ownership of the appearance after a geometry edit. Vector kinds flip to
 * live rendering; `opaqueBody` kinds (stamp images) have no vector render — they
 * stay `baked`, with the raster box following the committed geometry (the bitmap
 * shows stretched until the engine's natively re-fit appearance arrives with the
 * DTO sync). Call with the new geometry already applied.
 */
const ownGeometry = (annotation: ModelAnnotation): ModelAnnotation => {
  if (!capsFor(annotation.subtype).opaqueBody) return toVector(annotation);
  return 'rect' in annotation.geometry
    ? { ...annotation, apBox: annotation.geometry.rect }
    : annotation;
};
/**
 * Does this committed edit invalidate an engine-baked raster? Only when the
 * annotation stays baked (an opaque-body kind — everything else just flipped to
 * vector via {@link ownGeometry} and renders live from its geometry) and the
 * edit changed the /AP frame's size, does the engine's re-bake produce new
 * raster content. In practice: a stamp resize. Moves and rotations keep the
 * frame (the blit translates/rotates the same pixels), so they emit false and
 * a committed drag costs zero appearance re-renders. Call with the next
 * (post-{@link ownGeometry}) annot and the geometry it had before the edit.
 */
const apInvalidated = (next: ModelAnnotation, before: ContentGeometry): boolean =>
  next.source === 'baked' && apSizeChanged(before, next.geometry);
/** The patch effect for a committed geometry edit. `apChanged` is attached only
 *  when the edit invalidated a baked raster (a stamp resize) — so every other
 *  edit keeps the bare `{ fx, id }` shape and never triggers an appearance
 *  re-fetch. `next` is the post-{@link ownGeometry} annot, `before` its old geom. */
const patchFx = (id: Id, next: ModelAnnotation, before: ContentGeometry): Effect =>
  apInvalidated(next, before)
    ? { type: 'patch', id, scope: { kind: 'geometry' }, apChanged: true }
    : { type: 'patch', id, scope: { kind: 'geometry' } };
const sub = (from: Point, to: Point): Point => ({ x: from.x - to.x, y: from.y - to.y });
const translateRect = (rect: Rect, point: Point): Rect => ({
  ...rect,
  x: rect.x + point.x,
  y: rect.y + point.y,
});

/**
 * Commit a view-space gesture result for one annotation: apply `op` to the
 * projected geometry (the identity for un-flagged annotations — `op` then
 * simply runs on the stored geom) and map the result back to stored space
 * through `unanchoredGeom`. The exact composition `effGeom` previewed, so a
 * released gesture commits what it showed — for screen-anchored and plain
 * annotations alike, through one code path.
 */
const commitViewGesture = (
  annotation: ModelAnnotation,
  view: ViewEnv | undefined,
  op: (geometry: ContentGeometry) => ContentGeometry,
): ContentGeometry => {
  const mode = anchorModeOf(annotation);
  return unanchoredGeom(op(anchoredGeom(annotation.geometry, mode, view)), mode, view);
};

/* ── page-bound gestures ──────────────────────────────────────────────────────
 * Annotations are page-bound; the pointer isn't. Two rules keep them apart:
 *  1. Frame: a gesture is anchored to the page it started on. A sample resolved
 *     against another page is in a different coordinate frame (each page's
 *     content space has its own origin) — subtracting across frames would
 *     teleport the shape to the page top, so foreign-page samples are ignored.
 *  2. Clamp: within the home frame, geometry pins to the page box:
 *     an overshooting pointer slides the shape along the edge; a shape larger
 *     than the page pins to the page's top/left (lo wins when lo > hi).
 */
const clampAxis = (value: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, value));

const clampPointToBox = (point: Point, box: Rect | undefined): Point =>
  box
    ? {
        x: clampAxis(point.x, box.x, box.x + box.width),
        y: clampAxis(point.y, box.y, box.y + box.height),
      }
    : point;

/** The pointer sample's view environment (relative zoom + display rotation),
 *  when the caller supplied one — screen-anchored annotations hit-test and
 *  page-clamp at their effective geometry with it. Absent → stored geometry
 *  (headless). */
const viewOf = (input: PointerInput): ViewEnv | undefined =>
  input.zoom != null || input.displayRotation != null
    ? { zoom: input.zoom ?? 1, rotation: input.displayRotation ?? 0 }
    : undefined;

/** Corners of the region a move must keep inside the page. Most annotations
 *  use the selection frame (the outline the user sees); a screen-anchored
 *  member counts at its view-projected footprint. A callout's frame is only
 *  the text box, so the clamp uses the visual bounds — box, leader, and
 *  arrowhead — and the arrow cannot leave the page. */
function moveClampCorners(annotation: ModelAnnotation, view?: ViewEnv): Point[] {
  const mode = anchorModeOf(annotation);
  const geometry = anchoredGeom(annotation.geometry, mode, view);
  if (geometry.kind === 'text' && geometry.callout) {
    const visual = geomVisualBounds(
      geometry,
      anchoredStrokeWidth(annotation.style.strokeWidth, mode, view),
      annotation.style.border,
    );
    return [
      { x: visual.x, y: visual.y },
      { x: visual.x + visual.width, y: visual.y },
      { x: visual.x + visual.width, y: visual.y + visual.height },
      { x: visual.x, y: visual.y + visual.height },
    ];
  }
  return [...annotationSelectionFrame(annotation, view).corners];
}

/** The union of the ids' move-clamp bounds. */
function unionBoundsOf(model: Model, ids: Id[], view?: ViewEnv): Rect | null {
  const corners: Point[] = [];
  for (const id of ids) {
    const annotation = model.byId[id];
    if (!annotation) continue;
    corners.push(...moveClampCorners(annotation, view));
  }
  return corners.length ? unionRect(corners) : null;
}

/** Clamp a move delta so the move-clamp bounds stay inside the page.
 *  Per-axis, so a pointer past the bottom edge still slides the selection
 *  horizontally along that edge. */
function clampMoveDelta(
  model: Model,
  ids: Id[],
  delta: Point,
  page: Rect | undefined,
  view?: ViewEnv,
): Point {
  if (!page) return delta;
  const rect = unionBoundsOf(model, ids, view);
  if (!rect) return delta;
  return {
    x: clampAxis(delta.x, page.x - rect.x, page.x + page.width - (rect.x + rect.width)),
    y: clampAxis(delta.y, page.y - rect.y, page.y + page.height - (rect.y + rect.height)),
  };
}

/** The page an edit draft is anchored to — every edit gesture lives on one page. */
function editDraftPage(model: Model, draft: Draft): PageRef | null {
  const id = 'id' in draft ? draft.id : 'ids' in draft && draft.ids.length ? draft.ids[0] : null;
  return id != null ? (model.byId[id]?.page ?? null) : null;
}
const geomEqual = (left: ContentGeometry, right: ContentGeometry): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
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

export function update(model: Model, message: Message): [Model, Effect[]] {
  switch (message.type) {
    case 'editPointer':
      return editPointer(model, message.phase, message.in);
    case 'marqueePointer':
      return marqueePointer(model, message.phase, message.in);
    case 'createPointer':
      return createPointer(
        model,
        message.phase,
        message.subtype,
        message.in,
        message.preset,
        message.intent,
        message.deferInkCommit,
        message.straightenInk,
        message.clickCreate,
        message.flags,
        message.measure,
        message.capture,
      );
    case 'finishInkDraft':
      return finishInkCreate(model);
    case 'finishCreationDraft':
      return finishPolyCreate(model);
    case 'createCaret':
      return createCaret(model, message.page, message.anchor, message.flags);
    case 'createReplaceText':
      return createReplaceText(model, message.page, message.quads, message.anchor, message.preset);
    case 'createMarkup':
      return createMarkup(
        model,
        message.subtype,
        message.page,
        message.quads,
        message.preset,
        message.flags,
      );
    case 'createAnnot':
      return createAnnot(model, message);
    case 'setMarkupPreview':
      return setMarkupPreview(model, message.subtype, message.quadsByPage, message.preset);
    case 'clearMarkupPreview':
      return model.preview ? [{ ...model, preview: null }, []] : [model, []];
    case 'select': {
      const ids = expandGroups(
        model,
        message.ids.filter((id) => isSelectable(model, id)),
      );
      if (!ids.length) return [model, []];
      const selected = message.add ? [...new Set([...model.selected, ...ids])] : ids;
      return [{ ...model, selected }, []];
    }
    case 'deselect': {
      if (!model.selected.length) return [model, []];
      // With `ids`: drop only those (an engaged Behavior retroactively un-selects
      // its annotations — engaged ⇒ not selectable ⇒ not selected). Without: all.
      if (!message.ids) return [{ ...model, selected: [] }, []];
      const drop = new Set(message.ids);
      const selected = model.selected.filter((id) => !drop.has(id));
      return selected.length === model.selected.length ? [model, []] : [{ ...model, selected }, []];
    }
    case 'setProps':
      return setProps(model, message.patch);
    case 'setFlags':
      return setFlags(model, message.patch, message.ids);
    case 'setDefaults':
      return setDefaults(model, message.subtype, message.patch);
    case 'setSnap':
      return [{ ...model, snap: { ...model.snap, ...message.patch } }, []];
    case 'rotate90':
      return rotateSelection(model, 90);
    case 'resetRotation':
      return resetRotation(model);
    case 'delete':
      return deleteSelection(model);
    case 'cancel':
      return [{ ...model, draft: null }, []];
    case 'loaded':
      return [mergeLoaded(model, message.annots), []];
    case 'hydrated':
      return [hydrateAnnots(model, message.annots, message.bumpAp ?? false), []];
    case 'created':
      return [reconcile(model, message.tempId, message.id, message.ref), []];
    case 'createFailed':
      return [removeAnnots(model, [message.tempId]), []];
    case 'upsert':
      return [upsertAnnots(model, message.annots, message.bumpAp), []];
    case 'bumpAp':
      return [bumpAp(model, message.ids), []];
    case 'hover':
      // Pure view-model state; the capability diffs before dispatching, so
      // this fires at enter/leave cadence only.
      return model.hovered === message.id ? [model, []] : [{ ...model, hovered: message.id }, []];
    case 'remove': {
      const next = removeAnnots(model, message.ids);
      // A removed annotation can't stay hovered.
      return [next.hovered && !next.byId[next.hovered] ? { ...next, hovered: null } : next, []];
    }
    case 'beginTextEdit':
      // `lockedContents` (or an inert `/F` state) blocks entering text edit —
      // the geometry gates don't apply here: locked-only contents still edit.
      return model.byId[message.id] && annotContentsEditable(model.byId[message.id]!)
        ? [{ ...model, editing: message.id, selected: [message.id], draft: null }, []]
        : [model, []];
    case 'setText':
      return setText(model, message.id, message.text);
    case 'setRichText':
      return setRichText(model, message.id, message.doc);
    case 'endTextEdit':
      return model.editing ? [{ ...model, editing: null }, []] : [model, []];
  }
}

/** Apply the editor's plain text optimistically. Updates `contents` on the
 *  DTO-backed model and flips the box to `vector` so the live text shows. Emits
 *  no effect — the plugin owns the (debounced) engine write while you type, so
 *  the model never churns mid-keystroke. */
function setText(model: Model, id: Id, text: string): [Model, Effect[]] {
  const annotation = model.byId[id];
  if (!annotation) return [model, []];
  // The rich projection follows plain text: body-style paragraphs, one per
  // line break, so an editor rendering `richText` shows what was typed.
  const data =
    annotation.data && annotation.data.subtype === 'free-text'
      ? {
          ...annotation.data,
          contents: text,
          richText: { ...annotation.data.richText, paragraphs: paragraphsFromPlainText(text) },
        }
      : annotation.data
        ? { ...annotation.data, contents: text }
        : annotation.data;
  const next = toVector({ ...annotation, data });
  return [{ ...model, byId: { ...model.byId, [id]: next } }, []];
}

/** Apply the editor's rich document optimistically. The DTO's body is kept
 *  (a partial input body layers on it); `contents` is the projection. */
function setRichText(model: Model, id: Id, doc: RichTextDocumentInput): [Model, Effect[]] {
  const annotation = model.byId[id];
  if (!annotation || !annotation.data || annotation.data.subtype !== 'free-text')
    return [model, []];
  const normalized = normalizeRuns(doc);
  const richText = {
    body: { ...annotation.data.richText.body, ...(normalized.body ?? {}) },
    paragraphs: normalized.paragraphs,
  };
  const next = toVector({
    ...annotation,
    data: { ...annotation.data, richText, contents: plainTextOf(richText) },
  });
  return [{ ...model, byId: { ...model.byId, [id]: next } }, []];
}

function editPointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
): [Model, Effect[]] {
  if (phase === 'down') return editDown(model, input);
  if (phase === 'move') return model.draft ? editMove(model, input) : [model, []];
  return model.draft ? editUp(model) : [model, []];
}

function editDown(model: Model, input: PointerInput): [Model, Effect[]] {
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

function editMove(model: Model, input: PointerInput): [Model, Effect[]] {
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

function editUp(model: Model): [Model, Effect[]] {
  const draft = model.draft!;
  if (draft.kind === 'leader') {
    const annotation = model.byId[draft.id];
    if (annotation?.measure?.intent !== 'LineDimension' || draft.delta === 0) {
      return [{ ...model, draft: null }, []];
    }

    const measure = annotation.measure;
    const updated: ModelAnnotation = {
      ...annotation,
      source: 'vector',
      measure: {
        ...measure,
        leader: {
          ...measure.leader,
          length: (measure.leader?.length ?? 0) + draft.delta,
        },
      },
    };

    return [
      { ...model, draft: null, byId: { ...model.byId, [updated.id]: updated } },
      [{ type: 'patch', id: updated.id, scope: { kind: 'leader' } }],
    ];
  }
  if (draft.kind === 'caption') {
    const annotation = model.byId[draft.id];
    if (!annotation?.measure || (!draft.delta.x && !draft.delta.y))
      return [{ ...model, draft: null }, []];
    return [
      {
        ...model,
        draft: null,
        byId: {
          ...model.byId,
          [annotation.id]: {
            ...annotation,
            source: 'vector',
            measure: moveMeasurementCaption(
              annotation.geometry,
              annotation.measure,
              draft.delta,
              annotation.style,
            ),
          },
        },
      },
      [{ type: 'patch', id: annotation.id, scope: { kind: 'caption' } }],
    ];
  }
  if (draft.kind === 'handle') {
    // A grab that didn't actually resize leaves the appearance untouched → keep
    // it baked, no engine write.
    if (geomEqual(draft.base, draft.current)) return [{ ...model, draft: null }, []];
    // A resize changes the appearance: we own it now → live (vector) render
    // (opaque-body kinds stay baked; the engine re-fits their AP natively).
    // `cur` is view-space (the projected geometry the user dragged); the
    // commit maps it back to stored space — the identity when un-flagged.
    const before = model.byId[draft.id];
    const stored = unanchoredGeom(draft.current, anchorModeOf(before), draft.view);
    if (before.measure?.intent === 'PolygonDimension') {
      const readout = shapeMeasurementReadout(stored, before.measure);
      if ('unavailable' in readout && readout.unavailable === 'invalid-geometry') {
        return [{ ...model, draft: null }, []];
      }
    }
    const annotation = ownGeometry({ ...before, geometry: stored });
    return [
      { ...model, byId: { ...model.byId, [draft.id]: annotation }, draft: null },
      [patchFx(draft.id, annotation, before.geometry)],
    ];
  }
  if (draft.kind === 'rotate') {
    const { delta } = rotateDraftDelta(model, draft);
    if (Math.abs(delta) < 0.01) return [{ ...model, draft: null }, []];
    const byId = { ...model.byId };
    const fx: Effect[] = [];
    for (const id of draft.ids) {
      const annotation = byId[id];
      if (!annotation) continue;
      // rotation re-bakes the appearance → live (vector) render + patch. The
      // gesture composed in view space (`effGeom`); the commit replays the
      // same composition and unprojects — a screen-anchored member's authored
      // tilt turns WYSIWYG, exactly as previewed.
      const rotated = commitViewGesture(annotation, draft.view, (geometry) =>
        geomRotateAbout(geometry, draft.pivot, delta),
      );
      const measure = transformMeasurementCaption(annotation.measure, (point) =>
        rotatePoint(point, draft.pivot, delta),
      );
      byId[id] = ownGeometry({ ...annotation, geometry: rotated, measure });
      fx.push(patchFx(id, byId[id], annotation.geometry));
    }
    return [{ ...model, byId, draft: null }, fx];
  }
  if (draft.kind === 'group') {
    const { sx, sy } = groupResizeFactors(draft.base, draft.current);
    if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return [{ ...model, draft: null }, []];
    const byId = { ...model.byId };
    const fx: Effect[] = [];
    for (const id of draft.ids) {
      const annotation = byId[id];
      if (!annotation) continue;
      const scaled = commitViewGesture(annotation, draft.view, (geometry) =>
        geomScaleAbout(geometry, draft.anchor, sx, sy),
      );
      const measure = transformMeasurementCaption(annotation.measure, (point) => ({
        x: draft.anchor.x + (point.x - draft.anchor.x) * sx,
        y: draft.anchor.y + (point.y - draft.anchor.y) * sy,
      }));
      byId[id] = ownGeometry({ ...annotation, geometry: scaled, measure });
      fx.push(patchFx(id, byId[id], annotation.geometry));
    }
    return [{ ...model, byId, draft: null }, fx];
  }
  if (draft.kind === 'move') {
    if (Math.hypot(draft.delta.x, draft.delta.y) < 0.01) return [{ ...model, draft: null }, []]; // a click
    const byId = { ...model.byId };
    const fx: Effect[] = [];
    for (const id of draft.ids) {
      const annotation = byId[id];
      // A move is a rigid translation — the appearance is unchanged, so a baked
      // annotation stays baked and its raster box rides along. Source preserved.
      byId[id] = {
        ...annotation,
        geometry: geomTranslate(annotation.geometry, draft.delta),
        measure: transformMeasurementCaption(annotation.measure, (point) => ({
          x: point.x + draft.delta.x,
          y: point.y + draft.delta.y,
        })),
        apBox: annotation.apBox ? translateRect(annotation.apBox, draft.delta) : undefined,
      };
      fx.push({ type: 'patch', id, scope: { kind: 'geometry' } }); // a move never invalidates the raster
    }
    return [{ ...model, byId, draft: null }, fx];
  }
  return [{ ...model, draft: null }, []];
}

function marqueePointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
): [Model, Effect[]] {
  // The marquee lives on one page and pins to its box (same rules as editMove).
  const point = clampPointToBox(input.point, input.pageBox);
  if (phase === 'down') {
    return [{ ...model, draft: { kind: 'marquee', page: input.page, from: point, to: point } }, []];
  }
  if (model.draft?.kind !== 'marquee') return [model, []];
  if (model.draft.page.pageObjectNumber !== input.page.pageObjectNumber) return [model, []]; // foreign frame — ignore
  if (phase === 'move') {
    return [{ ...model, draft: { ...model.draft, to: point } }, []];
  }

  // A marquee that touches one member takes the whole group with it.
  const hits = expandGroups(
    model,
    annotsInBox(model, model.draft.page, model.draft.from, point, input.inert, viewOf(input)),
  );
  const selected = input.shift ? toggleSelection(model.selected, hits) : hits;
  return [{ ...model, selected, draft: null }, []];
}

function toggleSelection(base: Id[], ids: Id[]): Id[] {
  const next = new Set(base);
  for (const id of ids) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return [...next];
}

/**
 * Distance creation has two stages. Releasing the endpoint drag only advances
 * to offset placement; the following click is the sole persistence boundary.
 */
function distancePointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
  preset: string,
  measure?: DistanceAppearance,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const draft = model.draft;

  if (draft?.kind !== 'create-distance') {
    if (phase !== 'down' || !measure) {
      return [model, []];
    }

    return [
      {
        ...model,
        selected: [],
        draft: {
          kind: 'create-distance',
          step: 'endpoints',
          subtype: 'line',
          preset,
          page: input.page,
          from: input.point,
          to: input.point,
          measure: {
            ...measure,
            leader: { ...measure.leader, length: 0 },
          },
          ...(flags ? { flags } : {}),
        },
      },
      [],
    ];
  }

  // Even the final placement click belongs to the draft's original page.
  if (input.page.pageObjectNumber !== draft.page.pageObjectNumber) {
    return [model, []];
  }

  if (draft.step === 'endpoints') {
    if (phase === 'down') {
      return [model, []];
    }

    const nextDraft = { ...draft, to: input.point };
    if (phase === 'move') {
      return [{ ...model, draft: nextDraft }, []];
    }

    const length = Math.hypot(nextDraft.to.x - nextDraft.from.x, nextDraft.to.y - nextDraft.from.y);
    if (length < MIN_DRAG) {
      return [{ ...model, draft: null }, []];
    }

    return [{ ...model, draft: { ...nextDraft, step: 'offset' } }, []];
  }

  if (phase === 'up') {
    return [model, []];
  }

  const defaults = defaultsFor(model, draft.preset);
  const geometry: ContentGeometry = {
    kind: 'line',
    a: draft.from,
    b: draft.to,
    ends: defaults.lineEndings,
  };
  const appearance: DistanceAppearance = {
    ...draft.measure,
    leader: {
      ...draft.measure.leader,
      length: distanceLeaderLength(geometry, input.point),
    },
  };

  if (phase === 'move') {
    return [{ ...model, draft: { ...draft, measure: appearance } }, []];
  }

  const id = `tmp:${model.seq + 1}`;
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: draft.page,
    subtype: 'line',
    geometry,
    measure: appearance,
    style: {
      ...styleFromProps(defaults),
      interiorColor: defaults.interiorColor ?? defaults.color,
    },
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
    },
    [{ type: 'create', id }],
  ];
}

function createPointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  subtype: Subtype,
  input: PointerInput,
  preset: string = subtype,
  intent?: InkIntent,
  deferInkCommit = false,
  straightenInk?: InkStraightenOptions,
  clickCreate?: ClickCreate | false,
  flags?: Partial<AnnotationFlags>,
  measure?: MeasurementAppearance,
  capture?: string,
): [Model, Effect[]] {
  // An in-progress creation is anchored to its page: a move/up sample from
  // another page is a foreign frame — ignore it. (A down on another page is a
  // fresh intent: the per-subtype branches below start/restart the draft there.)
  if (
    phase !== 'down' &&
    model.draft &&
    'page' in model.draft &&
    model.draft.page.pageObjectNumber !== input.page.pageObjectNumber
  )
    return [model, []];
  // Shapes can't be drawn past the page edge — the pointer pins to it.
  if (input.pageBox) input = { ...input, point: clampPointToBox(input.point, input.pageBox) };
  if (
    model.draft?.kind === 'create-distance' ||
    (measure?.intent === 'LineDimension' && !capture)
  ) {
    return distancePointer(
      model,
      phase,
      input,
      preset,
      measure?.intent === 'LineDimension' ? measure : undefined,
      flags,
    );
  }
  if (subtype === 'free-text-callout') return calloutPointer(model, phase, input, preset, flags);
  if (phase === 'down') {
    if (isPolySubtype(subtype)) {
      if (input.finish) return finishPolyCreate(model);
      if (
        model.draft?.kind === 'create-poly' &&
        model.draft.subtype === subtype &&
        model.draft.preset === preset &&
        model.draft.page.pageObjectNumber === input.page.pageObjectNumber
      ) {
        return [
          {
            ...model,
            draft: {
              ...model.draft,
              points: [...model.draft.points, input.point],
              current: input.point,
            },
          },
          [],
        ];
      }
      return [
        {
          ...model,
          selected: [],
          draft: {
            kind: 'create-poly',
            subtype,
            preset,
            page: input.page,
            points: [input.point],
            current: input.point,
            closed: subtype === 'polygon',
            ...(measure && measure.intent !== 'LineDimension' ? { measure } : {}),
            ...(flags ? { flags } : {}),
          },
        },
        [],
      ];
    }
    const draft: Draft | null =
      subtype === 'line'
        ? {
            kind: 'create-line',
            measure,
            capture,
            subtype,
            preset,
            page: input.page,
            from: input.point,
            to: input.point,
            ...(clickCreate !== undefined ? { clickCreate } : {}),
            ...(flags ? { flags } : {}),
          }
        : subtype === 'ink'
          ? model.draft?.kind === 'create-ink' &&
            model.draft.subtype === subtype &&
            model.draft.preset === preset &&
            model.draft.page.pageObjectNumber === input.page.pageObjectNumber
            ? { ...model.draft, strokes: [...model.draft.strokes, [input.point]] }
            : {
                kind: 'create-ink',
                subtype,
                preset,
                page: input.page,
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
                kind: 'create-rect',
                subtype,
                preset,
                page: input.page,
                from: input.point,
                to: input.point,
                ellipse: subtype === 'circle',
                // Captured at down (the gesture's home page); a rotation of 0
                // makes upright a no-op, so the draft stays clean then.
                ...(input.upright && input.displayRotation
                  ? { displayRotation: input.displayRotation, upright: true }
                  : {}),
                ...(clickCreate !== undefined ? { clickCreate } : {}),
                ...(flags ? { flags } : {}),
              }
            : null;
    return draft ? [{ ...model, selected: [], draft }, []] : [model, []];
  }
  if (phase === 'move') {
    if (model.draft?.kind === 'create-poly') {
      return [{ ...model, draft: { ...model.draft, current: input.point } }, []];
    }
    if (model.draft?.kind === 'create-rect' || model.draft?.kind === 'create-line') {
      return [{ ...model, draft: { ...model.draft, to: input.point } }, []];
    }
    if (model.draft?.kind === 'create-ink') {
      // append to the active (last) stroke as the pen moves
      const strokes = model.draft.strokes.slice();
      strokes[strokes.length - 1] = [...strokes[strokes.length - 1], input.point];
      return [{ ...model, draft: { ...model.draft, strokes } }, []];
    }
    return [model, []];
  }
  // up
  const activeDraft = model.draft;
  if (
    activeDraft?.kind !== 'create-rect' &&
    activeDraft?.kind !== 'create-line' &&
    activeDraft?.kind !== 'create-ink'
  )
    return [model, []];

  if (activeDraft.kind === 'create-ink') {
    let next = model;
    if (straightenInk && activeDraft.strokes.length) {
      const strokes = activeDraft.strokes.slice();
      const last = strokes.length - 1;
      strokes[last] = straightenInkStroke(strokes[last], straightenInk);
      next = { ...model, draft: { ...activeDraft, strokes } };
    }
    return deferInkCommit ? [next, []] : finishInkCreate(next);
  }

  const definition = defaultsFor(model, activeDraft.preset ?? activeDraft.subtype);
  const style = styleFromProps(definition);
  let geometry: ContentGeometry | null = null;
  // The upright counter-rotation for a box commit (0 when the tool/page don't
  // ask for one). A dragged box keeps the on-screen footprint the author drew:
  // for a quarter-turn the unrotated box is the drag rect transposed about its
  // centre, so spinning it by `rot` lands exactly back on the dragged region.
  const upRot =
    activeDraft.kind === 'create-rect' && activeDraft.upright && activeDraft.displayRotation
      ? uprightRotation(activeDraft.displayRotation)
      : 0;
  const uprightBox = (dragged: Rect): Rect =>
    upRot === 90 || upRot === 270 ? transposedAboutCenter(dragged) : dragged;
  // Click commits resolve through the shared placement layer (placement.ts) —
  // the same `resolveClickPlacement` the footprint ghost and the form plugin
  // consume, so preview ≡ commit by construction. The core only supplies the
  // kind-level fallback for free text (a click must always yield a typable
  // box) and converts the placement to a ContentGeometry via `clickCreateGeom`.
  const clickGeom = (policy: ClickCreate): ContentGeometry | null =>
    clickCreateGeom(
      activeDraft.subtype,
      resolveClickPlacement(activeDraft.from, policy, {
        pageBox: input.pageBox,
        upright: activeDraft.kind === 'create-rect' ? activeDraft.upright : undefined,
        displayRotation:
          activeDraft.kind === 'create-rect' ? activeDraft.displayRotation : undefined,
      }),
      definition,
    );
  if (activeDraft.kind === 'create-rect' && activeDraft.subtype === 'free-text') {
    // Free-text: a dragged box, or — on a mere click — a default box you can
    // immediately type into (created unless the tool says `clickCreate: false`;
    // an empty text box is unreachable by drag alone, hence the kind-level
    // fallback: 180×40, top-left anchored so the box hangs where you'll type).
    const dragged = rectFromPoints(activeDraft.from, activeDraft.to);
    const isClick = dragged.width < MIN_DRAG && dragged.height < MIN_DRAG;
    if (!isClick) {
      geometry = { kind: 'text', rect: uprightBox(dragged), ...(upRot ? { rot: upRot } : {}) };
    } else if (activeDraft.clickCreate !== false) {
      geometry = clickGeom(
        activeDraft.clickCreate && 'width' in activeDraft.clickCreate
          ? activeDraft.clickCreate
          : { width: 180, height: 40, anchor: 'top-left' },
      );
    }
  } else if (activeDraft.kind === 'create-rect') {
    const dragged = rectFromPoints(activeDraft.from, activeDraft.to);
    if (dragged.width >= MIN_DRAG || dragged.height >= MIN_DRAG) {
      // cloudy stores the outer box (dragged + extent) so the dragged box is its inner edge
      geometry = {
        kind: 'rect',
        rect: shapeRectFor(uprightBox(dragged), activeDraft.ellipse, style),
        ellipse: activeDraft.ellipse,
        ...(upRot ? { rot: upRot } : {}),
      };
    } else if (activeDraft.clickCreate && 'width' in activeDraft.clickCreate) {
      geometry = clickGeom(activeDraft.clickCreate);
    }
  } else if (activeDraft.kind === 'create-line') {
    if (
      Math.hypot(activeDraft.to.x - activeDraft.from.x, activeDraft.to.y - activeDraft.from.y) >=
      MIN_DRAG
    ) {
      geometry = {
        kind: 'line',
        a: activeDraft.from,
        b: activeDraft.to,
        ends: definition.lineEndings,
      };
    } else if (activeDraft.clickCreate && 'length' in activeDraft.clickCreate) {
      geometry = clickGeom(activeDraft.clickCreate);
    }
  }
  if (!geometry) return [{ ...model, draft: null }, []];
  if (activeDraft.kind === 'create-line' && activeDraft.capture)
    return [
      { ...model, draft: null },
      [{ type: 'captured', tool: activeDraft.capture, page: activeDraft.page, geometry }],
    ];

  const id = `tmp:${model.seq + 1}`;
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: activeDraft.page,
    subtype: activeDraft.subtype,
    ...(activeDraft.kind === 'create-line' && activeDraft.measure
      ? { measure: activeDraft.measure }
      : {}),
    geometry,
    style,
    // A text kind carries its text styling from birth, so the tool's font
    // defaults actually apply to what you draw.
    ...(geometry.kind === 'text' ? { text: textStyleFromProps(definition) } : {}),
    // A drawn link starts at the tool preset's target ('docs-link' style
    // presets), or dead (`null` — the create-then-edit flow).
    ...(activeDraft.subtype === 'link' ? { link: definition.link ?? null } : {}),
    flags: { ...DRAWN_FLAGS, ...activeDraft.flags },
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
      // A freshly drawn free-text box opens straight into edit (type immediately).
      editing: geometry.kind === 'text' ? id : model.editing,
    },
    [{ type: 'create', id }],
  ];
}

/** Commit all strokes accumulated by a grouped ink gesture. */
function finishInkCreate(model: Model): [Model, Effect[]] {
  const draft = model.draft;
  if (draft?.kind !== 'create-ink') return [model, []];
  const points = draft.strokes.flat();
  if (!draft.strokes.some((stroke) => stroke.length >= 2) || points.length === 0)
    return [{ ...model, draft: null }, []];
  const bounds = unionRect(points);
  if (Math.max(bounds.width, bounds.height) < MIN_DRAG) return [{ ...model, draft: null }, []];

  const id = `tmp:${model.seq + 1}`;
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: draft.page,
    subtype: draft.subtype,
    geometry: { kind: 'ink', strokes: draft.strokes },
    style: styleFromProps(defaultsFor(model, draft.preset ?? draft.subtype)),
    ...(draft.intent ? { intent: draft.intent } : {}),
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
    },
    [{ type: 'create', id }],
  ];
}

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
function calloutPointer(
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
  const id = `tmp:${model.seq + 1}`;
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

function finishPolyCreate(model: Model): [Model, Effect[]] {
  const draft = model.draft;
  if (draft?.kind !== 'create-poly') return [model, []];
  const minPoints = draft.closed ? 3 : 2;
  if (draft.points.length < minPoints) return [{ ...model, draft: null }, []];

  const definition = defaultsFor(model, draft.preset ?? draft.subtype);
  const geometry: ContentGeometry = {
    kind: 'poly',
    points: draft.points,
    closed: draft.closed,
    ends: draft.closed ? undefined : definition.lineEndings,
  };
  if (draft.measure && 'unavailable' in shapeMeasurementReadout(geometry, draft.measure))
    return [model, []];

  const id = `tmp:${model.seq + 1}`;
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page: draft.page,
    subtype: draft.subtype,
    geometry,
    measure: draft.measure,
    style: styleFromProps(definition),
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
    },
    [{ type: 'create', id }],
  ];
}

/** Drop degenerate segment quads (zero-length baseline or ink extent). Area is
 *  the cross product of the two edge vectors — orientation-safe. */
const usableQuads = (quads: TextQuad[]): TextQuad[] =>
  quads.filter((quad) => {
    const ux = quad.upperEnd.x - quad.upperStart.x;
    const uy = quad.upperEnd.y - quad.upperStart.y;
    const sx = quad.lowerStart.x - quad.upperStart.x;
    const sy = quad.lowerStart.y - quad.upperStart.y;
    return Math.abs(ux * sy - uy * sx) > 0;
  });

/**
 * Build a text-markup annotation from the selection's per-line rects. The new
 * annotation is `vector` (rendered live by the overlay) and selected, mirroring
 * `createPointer`. One call per page the selection spans. Clears any live preview.
 */
function createMarkup(
  model: Model,
  subtype: Subtype,
  page: PageRef,
  segmentQuads: TextQuad[],
  preset: string = subtype,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [model, []];
  const id = `tmp:${model.seq + 1}`;
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page,
    subtype,
    geometry: { kind: 'quads', quads },
    style: styleFromProps(defaultsFor(model, preset)),
    flags: { ...DRAWN_FLAGS, ...flags },
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
      preview: null,
    },
    [{ type: 'create', id }],
  ];
}

/**
 * Create Adobe-compatible Replace Text as one optimistic logical annotation:
 * a top-level Caret (`/IT /Replace`) plus a StrikeOut subordinate
 * (`/IT /StrikeOutTextEdit`, `/IRT` caret, `/RT /Group`). Persistence performs
 * the two ordered writes and rolls the primary back if the subordinate fails.
 */
function createReplaceText(
  model: Model,
  page: PageRef,
  segmentQuads: TextQuad[],
  anchor: TextEndAnchor,
  preset = 'replace-text',
): [Model, Effect[]] {
  const quads = usableQuads(segmentQuads);
  if (!quads.length) return [model, []];
  const primaryId = `tmp:${model.seq + 1}`;
  const strikeoutId = `tmp:${model.seq + 2}`;
  const style = styleFromProps(defaultsFor(model, preset));
  const caret: ModelAnnotation = {
    id: primaryId,
    ref: null,
    page,
    subtype: 'caret',
    intent: 'replace',
    geometry: caretGeomFromAnchor(anchor),
    style,
    flags: DRAWN_FLAGS,
    source: 'vector',
  };
  const strikeout: ModelAnnotation = {
    id: strikeoutId,
    ref: null,
    page,
    subtype: 'strikeout',
    intent: 'strikeout-text-edit',
    geometry: { kind: 'quads', quads },
    style,
    flags: DRAWN_FLAGS,
    source: 'vector',
    irt: primaryId,
    group: primaryId,
  };
  return [
    {
      ...model,
      seq: model.seq + 2,
      byId: { ...model.byId, [primaryId]: caret, [strikeoutId]: strikeout },
      order: [...model.order, primaryId, strikeoutId],
      selected: [primaryId, strikeoutId],
      draft: null,
      preview: null,
    },
    [{ type: 'createGroup', primary: primaryId, members: [strikeoutId] }],
  ];
}

function createCaret(
  model: Model,
  page: PageRef,
  anchor: TextEndAnchor,
  flags?: Partial<AnnotationFlags>,
): [Model, Effect[]] {
  const caretGeom = caretGeomFromAnchor(anchor);
  if (caretGeom.rect.width <= 0 || caretGeom.rect.height <= 0) return [model, []];
  const id = `tmp:${model.seq + 1}`;
  const definition = defaultsFor(model, 'caret');
  const annotation: ModelAnnotation = {
    id,
    ref: null,
    page,
    subtype: 'caret',
    geometry: caretGeom,
    style: styleFromProps(definition),
    flags: { ...DRAWN_FLAGS, ...flags },
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
      preview: null,
    },
    [{ type: 'create', id }],
  ];
}

/** Set / replace the live markup preview from the selection's per-page quads. */
function setMarkupPreview(
  model: Model,
  subtype: Subtype,
  quadsByPage: Record<number, TextQuad[]>,
  preset: string = subtype,
): [Model, Effect[]] {
  const byPage: Record<number, TextQuad[]> = {};
  for (const key in quadsByPage) {
    const quads = usableQuads(quadsByPage[key]);
    if (quads.length) byPage[Number(key)] = quads;
  }
  return [{ ...model, preview: { subtype, preset, byPage } }, []];
}

/**
 * Apply a flat property patch to the current selection. Each member takes only
 * the keys its kind declares (see `applyProps` — routing to `style`, `geom.ends`
 * or `text` happens there) and ignores the rest, so one patch restyles a mixed
 * selection. Changed members flip to `vector` (we own the appearance now) and
 * emit one engine patch each. The base style / tool defaults are never touched:
 * editing existing annotations must not change what the next drawn one looks like.
 */
function setProps(model: Model, patch: AnnotationPropsPatch): [Model, Effect[]] {
  if (!model.selected.length) return [model, []];
  const byId = { ...model.byId };
  const fx: Effect[] = [];
  // The effect carries the user's keys verbatim — the shell lowers exactly
  // this intent to wire fields; the changed-prop set is the artifact.
  const keys = (Object.keys(patch) as PropKey[]).filter((propKey) => patch[propKey] !== undefined);
  for (const id of model.selected) {
    const annotation = byId[id];
    if (!annotation) continue;
    // The `link` slot is not appearance and not model state on a non-link
    // kind: the value lives in attached child annotations (the `linkOf`
    // lens reads them back), so the intent is read off the PATCH and rides
    // the target-carrying `syncLink` — the shell's reconciler owns the child
    // operations. Locked annotations refuse it like any other prop write.
    const linkIntent =
      patch.link !== undefined &&
      annotation.subtype !== 'link' &&
      kindTakesLink(annotation.subtype) &&
      annotTransformable(annotation);
    const next = applyProps(annotation, patch);
    if (!next) {
      // Nothing applied to the model (link-only patch on a parent, or an
      // undeclared key) — the link intent still materializes.
      if (linkIntent) fx.push({ type: 'syncLink', id, target: patch.link ?? null });
      continue;
    }
    const linkChanged = next.link !== annotation.link;
    const otherChanged =
      next.style !== annotation.style ||
      next.geometry !== annotation.geometry ||
      next.text !== annotation.text ||
      next.icon !== annotation.icon;
    // A restyle flips to vector (we own the appearance now) — except
    // `opaqueBody` kinds (widgets), which have no vector render: they stay
    // baked and the shell re-fetches the engine's re-baked raster on resolve.
    // Flipping them would also drop them out of `appearanceEpoch`, freezing
    // their raster forever.
    byId[id] = capsFor(annotation.subtype).opaqueBody || !otherChanged ? next : toVector(next);
    // The link kind's target lives on its own DTO — a plain engine patch.
    if (otherChanged || (linkChanged && annotation.subtype === 'link'))
      fx.push({ type: 'patch', id, scope: { kind: 'props', keys } });
    if (linkIntent) fx.push({ type: 'syncLink', id, target: patch.link ?? null });
  }
  return fx.length ? [{ ...model, byId }, fx] : [model, []];
}

/**
 * Merge a `/F` flags patch into the selection (or explicit ids). Not the props
 * path, on purpose: flags aren't appearance — members keep their render
 * `source` (a baked raster stays valid; nothing re-bakes) — and the write is
 * not gated by `locked`, because unlocking a locked annotation is the whole
 * point (Acrobat's Locked checkbox stays live). One `flags` effect per changed
 * committed member; uncommitted drafts just merge (their create draft carries
 * the flags when it commits).
 */
/**
 * The actions plane's session-visibility write (Hide actions, script
 * `annot.hidden`): merge per-id hidden overrides into the session overlay.
 * Pure session state — zero effects, no engine write, no authority. Hiding
 * clears transient engagement so no orphaned selection chrome or text editor
 * survives on an invisible annotation. Identity-preserving no-op when nothing
 * changes (plugin memo caches key on model identity).
 */

function setFlags(model: Model, patch: Partial<AnnotationFlags>, ids?: Id[]): [Model, Effect[]] {
  const targets = ids ?? model.selected;
  if (!targets.length) return [model, []];
  const fx: Effect[] = [];
  let byId: Model['byId'] | null = null;
  for (const id of targets) {
    const annotation = (byId ?? model.byId)[id];
    if (!annotation) continue;
    const flags = mergeFlags(annotation.flags, patch);
    if (flagsEqual(flags, annotation.flags)) continue; // no spurious engine writes
    byId ??= { ...model.byId };
    byId[id] = { ...annotation, flags };
    if (annotation.ref) fx.push({ type: 'flags', id });
  }
  return byId ? [{ ...model, byId }, fx] : [model, []];
}

function setDefaults(
  model: Model,
  subtype: Subtype,
  patch: AnnotationPropsPatch,
): [Model, Effect[]] {
  const previous = model.defaults[subtype] ?? {};
  const next: AnnotationPropsPatch = { ...previous, ...patch };
  // Endings merge per side, so `{ end: 'open-arrow' }` keeps a configured start.
  if (patch.lineEndings) next.lineEndings = { ...previous.lineEndings, ...patch.lineEndings };
  return [{ ...model, defaults: { ...model.defaults, [subtype]: next } }, []];
}

/**
 * Rotate the current selection by `deltaDeg` (clockwise) — the toolbar
 * "rotate 90°" affordance. A single shape turns about its own centre; a
 * multi-target group about the union-box centre (gated by `groupRotatable` for
 * groups, `rotatable` for a single shape). Emits one patch per rotated member.
 */
function rotateSelection(model: Model, deltaDeg: number): [Model, Effect[]] {
  const ids = model.selected.filter((id) => {
    const annotation = model.byId[id];
    return annotation && annotTransformable(annotation) && capsFor(annotation.subtype).rotatable;
  });
  if (!ids.length) return [model, []];
  // pivot: a single shape's own selection-rect centre (so vertex kinds spin in
  // place, not about their off-centre vertex mean); a group's union-box centre.
  // Stored space throughout — a screen-anchored member's authored tilt turns,
  // which is exactly its on-screen tilt (the display adds nothing to it); at
  // high zoom the anchor may re-seat by a hair, which the toolbar action
  // accepts (the knob gesture, which is pointer-exact, goes through the
  // view-space commit instead).
  let pivot: Point;
  if (ids.length === 1) {
    const annotation = model.byId[ids[0]];
    pivot = annotationSelectionFrame(annotation).center;
  } else {
    const page = model.byId[ids[0]].page;
    const union = groupUnionBounds({ ...model, selected: ids }, page);
    if (!union) return [model, []];
    pivot = { x: union.x + union.width / 2, y: union.y + union.height / 2 };
  }
  const byId = { ...model.byId };
  const fx: Effect[] = [];
  for (const id of ids) {
    const annotation = byId[id];
    const before = annotation.geometry;
    byId[id] = ownGeometry({
      ...annotation,
      geometry: geomRotateAbout(before, pivot, deltaDeg),
      measure: transformMeasurementCaption(annotation.measure, (point) =>
        rotatePoint(point, pivot, deltaDeg),
      ),
    });
    fx.push(patchFx(id, byId[id], before));
  }
  return [{ ...model, byId }, fx];
}

/** Reset rotation on the selection to the as-authored orientation. For a
 *  screen-anchored annotation that is its on-screen orientation, so reset is
 *  as meaningful as for anyone else. */
function resetRotation(model: Model): [Model, Effect[]] {
  const byId = { ...model.byId };
  const fx: Effect[] = [];
  for (const id of model.selected) {
    const annotation = byId[id];
    if (!annotation || !annotTransformable(annotation) || geomRotation(annotation.geometry) === 0)
      continue;
    byId[id] = ownGeometry({
      ...annotation,
      geometry: geomResetRotation(annotation.geometry, annotationSelectionFrame(annotation).center),
      measure: transformMeasurementCaption(annotation.measure, (point) =>
        rotatePoint(
          point,
          annotationSelectionFrame(annotation).center,
          -geomRotation(annotation.geometry),
        ),
      ),
    });
    fx.push(patchFx(id, byId[id], annotation.geometry));
  }
  return fx.length ? [{ ...model, byId }, fx] : [model, []];
}

function deleteSelection(model: Model): [Model, Effect[]] {
  // `locked` (and inert `/F` states) protect against deletion — only the
  // transformable members go; the rest keep their selection, so a mixed
  // selection deletes what it may and leaves the frozen ones visibly selected.
  const deletable = model.selected.filter((id) => {
    const annotation = model.byId[id];
    return !!annotation && annotDeletable(annotation);
  });
  if (!deletable.length) return [model, []];
  // Attached link children die with their parent. They are model
  // annotations now, so expanding the deletable set makes the one loop
  // below handle parent and children uniformly — no side ledger.
  const withChildren = [
    ...deletable,
    ...deletable.flatMap((id) => linkChildrenOf(model, id).map((annotation) => annotation.id)),
  ];
  const fx: Effect[] = [];
  for (const id of withChildren) {
    const annotation = model.byId[id];
    if (annotation?.ref) fx.push({ type: 'delete', ref: annotation.ref });
  }
  return [removeAnnots(model, withChildren), fx];
}

/* ── marquee helper; exported for tests ───────────────────────────────────── */
export function annotsInBox(
  model: Model,
  page: PageRef,
  from: Point,
  to: Point,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Id[] {
  const pageObjectNumber = page.pageObjectNumber;
  const box = rectFromPoints(from, to);
  return model.order.filter((id) => {
    const annotation = model.byId[id];
    if (
      annotation?.page.pageObjectNumber !== pageObjectNumber ||
      inert?.has(id) ||
      !isSelectable(model, id)
    )
      return false;
    // Conversation-plane annotations (replies, review states) are never on
    // the page — the marquee cannot sweep up what does not paint.
    if (isSubstrateOnly(annotation)) return false;
    // intersect against what is actually drawn: the oriented selection quad
    // (exact, via SAT) — the same quad the chrome outlines and the grab region
    // uses (screen-anchored bodies at their view-projected footprint). Its
    // AABB is a coarse superset whose empty corners cover most of a tilted
    // shape's unrotated footprint, so testing the AABB selected shapes the
    // marquee never touched.
    const frame = annotationSelectionFrame(annotation, view);
    return quadIntersectsRect(frame.corners, box);
  });
}

/* ── store maintenance ───────────────────────────────────────────────────── */

function mergeLoaded(model: Model, annots: ModelAnnotation[]): Model {
  const byId = { ...model.byId };
  const order = [...model.order];
  for (const annotation of annots) {
    if (byId[annotation.id]) continue;
    byId[annotation.id] = annotation;
    order.push(annotation.id);
  }
  return { ...model, byId, order };
}

/**
 * Whole-document hydration ingest: the snapshot is the committed truth.
 * Overwrites by id via `upsertAnnots` (gesture protection included), then
 * reaps committed entries the snapshot no longer contains — deletions that
 * happened before we subscribed (initial load) or inside a desync gap.
 * Gentler than `removeAnnots`: `tmp:` drafts and gesture-locked ids
 * survive, and an in-progress draft is not cancelled — reaped ids can
 * never be part of it (locked ids are excluded from reaping).
 */
function hydrateAnnots(model: Model, annots: ModelAnnotation[], bumpApFlag: boolean): Model {
  const incoming = new Set(annots.map((annotation) => annotation.id));
  const locked = draftIds(model.draft);
  const reaped = model.order.filter((id) => {
    if (incoming.has(id) || locked.has(id)) return false;
    const annotation = model.byId[id];
    return annotation !== undefined && annotation.ref !== null; // committed only; tmp: drafts stay
  });
  let next = model;
  if (reaped.length > 0) {
    const gone = new Set(reaped);
    const byId = { ...model.byId };
    for (const id of reaped) delete byId[id];
    next = {
      ...model,
      byId,
      order: model.order.filter((id) => !gone.has(id)),
      selected: model.selected.filter((id) => !gone.has(id)),
      hovered: model.hovered && gone.has(model.hovered) ? null : model.hovered,
      editing: model.editing && gone.has(model.editing) ? null : model.editing,
    };
  }
  return upsertAnnots(next, annots, bumpApFlag);
}

/**
 * Add-or-replace by id. Unlike `mergeLoaded` (which skips ids it already has,
 * for the bulk page read), this overwrites — it's how the data API re-syncs an
 * annotation from the authoritative engine DTO and how a remote edit lands.
 * New ids append to `order`; existing ones keep their position. An annotation
 * currently being dragged (its id is in a `move`/`handle` draft) is left as-is
 * so a remote echo can't yank geometry out from under the local gesture.
 */
function upsertAnnots(model: Model, annots: ModelAnnotation[], bumpAp = false): Model {
  const dragging = draftIds(model.draft);
  const byId = { ...model.byId };
  const order = [...model.order];
  for (const annotation of annots) {
    if (dragging.has(annotation.id)) continue;
    if (!byId[annotation.id]) order.push(annotation.id);
    const previous = byId[annotation.id];
    // `apVersion` is model-owned, not DTO-derived: carry it across the replace,
    // +1 when this upsert confirms an engine re-bake with new raster content.
    byId[annotation.id] = {
      ...annotation,
      apVersion: (previous?.apVersion ?? 0) + (bumpAp ? 1 : 0),
    };
  }
  return { ...model, byId, order };
}

/** Advance `apVersion` for known ids — an engine /AP re-bake that arrived
 *  Without new model data (a form value write repainting its widgets). */
function bumpAp(model: Model, ids: Id[]): Model {
  let byId: Model['byId'] | null = null;
  for (const id of ids) {
    const annotation = model.byId[id];
    if (!annotation) continue;
    byId ??= { ...model.byId };
    byId[id] = { ...annotation, apVersion: (annotation.apVersion ?? 0) + 1 };
  }
  return byId ? { ...model, byId } : model;
}

/** Ids locked by an in-progress local gesture (don't let an upsert clobber them). */
function draftIds(draft: Draft | null): Set<Id> {
  if (!draft) return new Set();
  if (draft.kind === 'move') return new Set(draft.ids);
  if (draft.kind === 'handle' || draft.kind === 'caption' || draft.kind === 'leader') {
    return new Set([draft.id]);
  }
  if (draft.kind === 'rotate' || draft.kind === 'group') return new Set(draft.ids);
  return new Set();
}

function removeAnnots(model: Model, ids: Id[]): Model {
  const gone = new Set(ids);
  const byId = { ...model.byId };
  for (const id of ids) delete byId[id];
  return {
    ...model,
    byId,
    order: model.order.filter((id) => !gone.has(id)),
    selected: model.selected.filter((id) => !gone.has(id)),
    draft: null,
    editing: model.editing && gone.has(model.editing) ? null : model.editing,
  };
}

function reconcile(model: Model, tempId: Id, id: Id, ref: AnnotationRef): Model {
  const annotation = model.byId[tempId];
  if (!annotation) return model;
  const { [tempId]: _drop, ...rest } = model.byId;
  const byId: Record<Id, ModelAnnotation> = { ...rest, [id]: { ...annotation, id, ref } };
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
    ...model,
    byId,
    order: model.order.map((annotationId) => (annotationId === tempId ? id : annotationId)),
    selected: model.selected.map((annotationId) => (annotationId === tempId ? id : annotationId)),
    // keep the just-drawn box in edit mode across the temp→durable id swap
    editing: model.editing === tempId ? id : model.editing,
  };
}

/**
 * The data API's create: page-space geometry in, the same optimistic
 * annotation and `create` effect a draw tool commits out. Defaults come from
 * the preset (a tool id or the bare subtype); `props` override them; line and
 * open-poly kinds take the preset's line endings when the geometry carries none.
 */
function createAnnot(
  model: Model,
  message: Extract<Message, { type: 'createAnnot' }>,
): [Model, Effect[]] {
  const preset = (message.preset ?? message.subtype) as Subtype;
  const definition = defaultsFor(model, preset);
  const geometry: ContentGeometry =
    (message.geometry.kind === 'line' ||
      (message.geometry.kind === 'poly' && !message.geometry.closed)) &&
    !message.geometry.ends
      ? { ...message.geometry, ends: definition.lineEndings }
      : message.geometry;
  const id = `tmp:${model.seq + 1}`;
  const base: ModelAnnotation = {
    id,
    ref: null,
    page: message.page,
    subtype: message.subtype,
    geometry,
    style: styleFromProps(definition),
    ...(geometry.kind === 'text' ? { text: textStyleFromProps(definition) } : {}),
    ...(message.subtype === 'link' ? { link: definition.link ?? null } : {}),
    flags: { ...DRAWN_FLAGS, ...message.flags },
    source: 'vector',
  };
  const annotation = message.props ? (applyProps(base, message.props) ?? base) : base;
  return [
    {
      ...model,
      seq: model.seq + 1,
      byId: { ...model.byId, [id]: annotation },
      order: [...model.order, id],
      ...(message.select ? { selected: [id] } : {}),
    },
    [{ type: 'create', id }],
  ];
}
