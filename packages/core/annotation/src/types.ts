import type { PageRotation, Point, Rect as GeometryRect, Quad } from '@embedpdf/core-geometry';
import type {
  AnnotationDTO,
  AnnotationPatch,
  AnnotationFlags,
  AnnotationRef,
  BlendMode,
  CaretIntent,
  InkIntent,
  LineEnding,
  LineEndings,
  PageRef,
  PdfLinkTarget,
  RichTextDocumentInput,
  StrikeoutIntent,
} from '@embedpdf/engine-core/runtime';

import type { DistanceAppearance, MeasurementAppearance } from './measurement';
import type { ShapeMeasurementAppearance } from './measurement-shape';
import type { BoxShape } from './shapes/box';

export type { Quad, QuadRing } from '@embedpdf/core-geometry';

export type { LineEnding, LineEndings };

export type { Point } from '@embedpdf/core-geometry';
export type Rect = GeometryRect;

/**
 * Where a text-edit annotation (caret / replace-text) anchors: the boundary
 * glyph's oriented cell plus the reading direction along its baseline
 * (+1 = toward the right end, −1 = toward the left end — sequence-derived,
 * never inferred from geometry).
 */
export interface TextEndAnchor {
  glyphQuad: Quad;
  advance: 1 | -1;
}

export type Id = string;
export type Cursor = string;
export type PolySubtype = 'polygon' | 'polyline';

/**
 * The per-page view environment the screen-anchor projection consumes:
 * `zoom` — the page's zoom relative to its 100% baseline (dimensionless;
 * 1 = Acrobat's 100% = `viewUnitsPerPoint × userUnit` view px per point) —
 * and the total display rotation (document /Rotate + view rotation).
 * Deliberately not a px-per-point scale: `noZoom` means "hold the body at its
 * 100%-zoom size", a statement about zoom; a units conversion here would
 * shrink bodies at 100%. Per-event / per-call context (the
 * `pageBox` pattern) — never stored on the model; the pointer drafts capture
 * it at down so anchored gestures project and commit with the view they
 * started under. See anchor.ts.
 */
export interface ViewEnv {
  zoom: number;
  rotation: PageRotation;
}

export type Subtype =
  | 'highlight'
  | 'underline'
  | 'squiggly'
  | 'strikeout'
  | 'square'
  | 'circle'
  | 'line'
  | 'polygon'
  | 'polyline'
  | 'caret'
  | 'ink'
  | 'stamp'
  | 'text'
  | 'file-attachment'
  | 'redact'
  | 'link'
  | (string & {});

/**
 * Page-space geometry — the one thing hit-testing, editing, and rendering work
 * on. A small closed union covers every kind: shapes (rect/ellipse), line,
 * polygon/polyline (poly), text markup (quads), and caret.
 */
/**
 * A free-text callout's leader: the `/CL` line + `/LE` arrow. `tip` is the
 * called-out point (the arrow is drawn here); `knee` is the optional elbow. The
 * point where the leader meets the text box (the third `/CL` point) is never
 * stored — it is derived from the box + the knee (see `calloutConnection`), so it
 * can't drift when the box or knee moves. Page space (y-down).
 */
export interface Callout {
  tip: Point;
  knee?: Point;
  ending: LineEnding;
}

/**
 * The shape a gesture moves, one arm per family. The box family's arm is its
 * own shape, the engine's `box` and `rotation` ({@link BoxShape}); the other
 * arms still carry the core's older names until their family moves.
 *
 * Rotation is degrees clockwise in page space, normalized `[0,360)`:
 *
 * - **Box** (`box`, `text`): the box before its turn, and the turn about its
 *   middle. The engine works out `/Rect` around the turned drawing, so PDFium
 *   bakes a portable `/AP`.
 * - **Vertex** (`line`, `poly`, `ink`): the points are already rotated (they are
 *   the portable visual), so `rot` is an advisory scalar — the cumulative tilt the
 *   user applied since authoring. It lets EmbedPDF reconstruct an oriented
 *   selection box (`obbFromTheta`) and offer reset-to-0; it is inert for
 *   rendering (PDFium ignores a lone `Rotation` with no `UnrotatedRect`).
 */
export type ModelGeometry =
  | BoxShape // square, circle, stamp, and the kinds whose shape is their rect
  | { kind: 'line'; a: Point; b: Point; ends?: LineEndings; rot?: number } // line (points pre-rotated; rot advisory)
  | { kind: 'poly'; points: Point[]; closed: boolean; ends?: LineEndings; rot?: number } // polygon/polyline (pre-rotated; rot advisory)
  | { kind: 'quads'; quads: Quad[] } // highlight / underline / squiggly / strikeout
  | { kind: 'caret'; rect: Rect; rot?: number } // caret insertion marker (rect = unrotated box; rot = its text's baseline tilt, authoring metadata — no gesture)
  | { kind: 'ink'; strokes: Point[][]; rot?: number } // freehand ink (pre-rotated; rot advisory)
  | { kind: 'text'; rect: Rect; callout?: Callout; rot?: number }; // free-text box (`rect` is the unrotated text box);
// a `callout` adds a leader line + arrow. The text is data (DTO `contents`),
// rendered by the framework as an editable element, not by `scene()`.

/**
 * How a shape's outline is stroked. A discriminated union so illegal combinations
 * — a dash array on a cloudy border, an intensity on a dashed one — are simply
 * unrepresentable. Maps onto the engine's `/BS /S` (`borderStyle`), `/BS /D`
 * (`dashArray`), and `/BE /I` (`cloudyIntensity`) wire fields. Cloudy is only
 * honoured for shapes (square/circle); other kinds treat it as solid.
 */
export type Border =
  | { kind: 'solid' }
  | { kind: 'dashed'; dash: number[] }
  | { kind: 'cloudy'; intensity: number };

export interface Style {
  /** `/C` colour — stroke for geometric kinds, highlight colour for markup. */
  color: string;
  /** `/IC` interior (fill) colour. `null` when the annotation has no fill. */
  interiorColor: string | null;
  strokeWidth: number;
  opacity: number;
  /** Effective blend mode of the annotation's normal appearance. */
  blendMode: BlendMode;
  /** Outline style — defaults to `{ kind: 'solid' }`. */
  border: Border;
}

export type TextAlign = 'left' | 'center' | 'right';

/**
 * Page-space text styling for a text-editable kind (free text) — the text
 * counterpart of {@link Style}, projected from the DTO's `/DA` fields the same
 * way `style` is projected from `/C`/`/CA`/`/BS`. CSS colour string; the engine
 * `Color` seam is crossed only in record/.
 */
export interface TextStyle {
  /** A PDF standard font name or a registered font key. */
  fontFamily: string;
  /** Content units (PDF points). */
  fontSize: number;
  fontColor: string;
  textAlign: TextAlign;
  /**
   * The rich body's formatting (free text only): bold = body weight ≥ 600,
   * italic = the body face's italic, underline = the body's decoration.
   * Absent = off. Runs override these as deltas (a bold word in a regular
   * box), which the plugin routes to the editor's text selection instead.
   */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/**
 * Engine fields by name, as a create or an update states them: a tool's
 * defaults (a draft without its shape), or what a selection edit writes to
 * each member. The kind table's {@link FieldSpec}s say which a sidebar edits.
 */
export type FieldValues = Readonly<Record<string, unknown>>;

/**
 * One annotation as the core works on it: the engine's record, and how it is
 * drawn right now. The record is the only data; the core's gestures read it
 * through `fieldsOf` and change it through `withFields` (record/).
 */
export interface ModelAnnotation {
  id: Id;
  ref: AnnotationRef | null;
  /** The page this annotation lives on. Internals may key by
   *  `page.pageObjectNumber`; the address itself is what callers pass around. */
  page: PageRef;
  subtype: Subtype;
  /**
   * How the record renders: `baked` blits the engine's appearance raster,
   * `vector` draws it live from its geometry and style. The core sets
   * `vector` when an edit makes the raster stale (a resize, a restyle,
   * typing); a move keeps the raster. The plugin decides it for confirmed
   * records: this session's edits stay live, another session's are baked.
   */
  source: 'baked' | 'vector';
  /**
   * Page-space box of the engine appearance raster (the AP `/Rect`), set when
   * the annotation is derived from a DTO. While `source === 'baked'` the renderer
   * blits the engine bitmap into this box; a move translates it (a rigid shift
   * keeps the raster valid), so the bitmap rides along without re-rendering.
   * Ignored once `source === 'vector'`.
   */
  apBox?: Rect;
  /**
   * Rotation (deg, CW) that was stripped from the baked raster — present only
   * when the engine rendered this appearance rotation-free (`appearanceTurnOf`:
   * a box kind drawn turned, inside its turned box; `apBox` is then its `box`).
   * The blit re-applies it as a view transform about the box centre. Vertex
   * kinds pre-rotate their geometry, so this stays unset there and their
   * rasters blit untransformed.
   */
  apRot?: number;
  /**
   * Revision of the engine-baked `/AP` content (absent ≡ 0). The raster a baked
   * annotation shows depends on exactly this and the render scale — never on
   * position (`apBox` translates the blit) or rotation (`apRot` transforms it) —
   * so the shell re-fetches appearances precisely when it changes. Owned by the
   * plugin's confirmed records, which advance it when the engine reports a
   * re-baked appearance; the core only reads it.
   */
  apVersion?: number;
  /**
   * This session's authority over this record (see permissions.md), set by the
   * plugin from the security service; the core only reads it. Fused into
   * `annotTransformable`/`annotDeletable`, so a record the session may not
   * edit renders and behaves exactly like a `locked` one (bare outline, no
   * handles, no drag). Absent = unstamped (a record created in this session,
   * a wildcard local engine, tests) and treated as allowed — the client gate
   * is a courtesy that keeps the UI truthful; the engine independently enforces.
   */
  authority?: { update: boolean; delete: boolean };
  /**
   * The annotation's data in the engine's shape: what the engine will read
   * back once this session's writes land. A confirmed record's is the
   * engine's own read; a record this session created predicts it from its
   * create (`newRecord`); an edit merges the fields it changed, and `update`
   * applies them as the engine will. Its `rect` (for a kind the engine
   * draws) and its attribution wait for the engine's answer.
   */
  annotation: AnnotationDTO;
  /**
   * Relationship to another annotation. `irt` ("in reply to") links a child to a
   * parent — a reply in a comment thread, or a caret bound to its strikeout in a
   * replace-text pair. `group` ties a set into one composite unit (created and,
   * typically, deleted together). Both are record keys, so a record this
   * session created is named by its `new:<n>` id.
   */
  irt?: Id;
  group?: string;
}

/**
 * A record as the core's gestures read and write it: its annotation's
 * geometry, style and text in the core's own shapes. `fieldsOf` works them
 * out from the annotation, and `withFields` turns changed ones back into the
 * annotation's fields (record/). A new record has no annotation yet: its
 * create is what predicts one.
 */
export interface RecordFields extends Omit<ModelAnnotation, 'annotation'> {
  geometry: ModelGeometry;
  style: Style;
  /** Text styling — present only for text-editable kinds (free text). */
  text?: TextStyle;
  /** Redaction label (`/OverlayText` + `/Repeat`) — redact kind only. The
   *  hover preview scene draws it. */
  label?: { text: string; repeat: boolean };
  measure?: MeasurementAppearance;
  /** `/Name` icon — present only for icon kinds (text note, file attachment). */
  icon?: string;
  /**
   * The `/F` annotation flags (freshly drawn annotations start at
   * {@link DRAWN_FLAGS} — `print` set). Never read individual keys to gate
   * behavior — the predicates in `flags.ts` (`annotInteractive`,
   * `annotTransformable`, `annotContentsEditable`, `viewable`) are the one
   * interpretation of the spec, and `anchorModeOf` owns `noZoom`/`noRotate`.
   */
  flags: AnnotationFlags;
  /** Normalized PDF `/IT` for intent-bearing annotations authored before a DTO exists. */
  intent?: CaretIntent | StrikeoutIntent | InkIntent;
  /**
   * The link kind's own `/A` target — present only on `subtype: 'link'`. Every other kind's link is an
   * attached child annotation in the substrate, read through the `linkOf`
   * lens and materialized by the shell's `syncLink` reconciler; parents
   * store nothing.
   */
  link?: PdfLinkTarget | null;
  annotation?: AnnotationDTO;
}

/** A draggable handle: a resize corner/edge (rect) or a vertex (line/poly). */
export interface Handle {
  id: string;
  at: Point;
  cursor: Cursor;
}

/** An alignment guide produced by move-snapping: a vertical (`axis: 'x'`) or
 *  horizontal (`axis: 'y'`) line at `at`, spanning `lo..hi` (content units). */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  lo: number;
  hi: number;
}

/** Snapping behaviour — seeded from the plugin config, live-adjustable via the
 *  `setSnap` msg (so an app can wire a UI toggle). */
export interface SnapSettings {
  /** Alignment guides while moving (snap to other annotations + the page). */
  guides: boolean;
  /** Guide snap tolerance, content units (PDF pt) — the `hitMargin` convention. */
  guideThreshold: number;
  /** Snap the rotate gesture onto `rotationAngles`. */
  rotation: boolean;
  rotationAngles: number[];
  /** Rotation snap tolerance, degrees. */
  rotationThreshold: number;
}

/**
 * The `defaults` key a creation draft resolves its props from — the authoring
 * tool that started it, which may differ from the PDF `subtype`. Two tools can
 * share a subtype but carry distinct defaults (an "arrow" is a `line` with an
 * arrowhead default); the preset keeps them apart. Absent → fall back to
 * `subtype` (a headless / programmatic caller that isn't tool-driven), so the
 * built-in tools where preset === subtype resolve from their subtype.
 */
export type Draft =
  | {
      kind: 'create-rect';
      subtype: Subtype;
      preset?: string;
      page: PageRef;
      from: Point;
      to: Point;
      ellipse: boolean;
      /** Display rotation + upright policy captured at down (the gesture's home
       *  page), so the commit counter-rotates against what the author saw even
       *  if the up sample resolves elsewhere. See {@link PointerInput}. */
      displayRotation?: PageRotation;
      upright?: boolean;
      /** The tool's click-create policy, captured at down like `upright`. */
      clickCreate?: ClickCreate | false;
      /** The tool's `/F` seed, captured at down like `upright` — merged over
       *  {@link DRAWN_FLAGS} at commit (a note tool sets noZoom/noRotate). */
      flags?: Partial<AnnotationFlags>;
    }
  | {
      kind: 'create-distance';
      step: 'endpoints' | 'offset';
      subtype: 'line';
      preset: string;
      page: PageRef;
      from: Point;
      to: Point;
      measure: DistanceAppearance;
      flags?: Partial<AnnotationFlags>;
    }
  | {
      kind: 'create-line';
      measure?: MeasurementAppearance;
      capture?: string;
      subtype: Subtype;
      preset?: string;
      page: PageRef;
      from: Point;
      to: Point;
      /** The tool's click-create policy, captured at down like `upright`. */
      clickCreate?: ClickCreate | false;
      /** The tool's `/F` seed, captured at down (see the rect draft). */
      flags?: Partial<AnnotationFlags>;
    }
  | {
      kind: 'create-poly';
      measure?: ShapeMeasurementAppearance;
      subtype: Subtype;
      preset?: string;
      page: PageRef;
      points: Point[];
      current: Point;
      closed: boolean;
      /** The tool's `/F` seed, captured at down (see the rect draft). */
      flags?: Partial<AnnotationFlags>;
    }
  | {
      kind: 'create-ink';
      subtype: Subtype;
      preset?: string;
      page: PageRef;
      strokes: Point[][];
      intent?: InkIntent;
      /** The tool's `/F` seed, captured at down (see the rect draft). */
      flags?: Partial<AnnotationFlags>;
    }
  | {
      // Free-text callout, built in clicks: click 1 sets `tip`, click 2 sets
      // `knee` (advancing to `box`), then a drag/click lays the text box. `cur`
      // is the live pointer for the leader/box preview; `boxFrom`/`boxTo` are the
      // dragged box once the box step starts.
      kind: 'create-callout';
      subtype: Subtype;
      preset?: string;
      page: PageRef;
      step: 'knee' | 'box';
      tip: Point;
      knee?: Point;
      current: Point;
      boxFrom?: Point;
      boxTo?: Point;
      /** Home-page box captured at the tip click. The default text box slides
       *  fully inside it; a drag is already point-clamped and ignores this. */
      pageBox?: Rect;
      /** Display rotation + upright policy captured at the tip click (the
       *  gesture's home page) — the text box commits counter-rotated so it
       *  reads upright; the leader (tip/knee) is page-space and never turns.
       *  Same capture rule as the rect draft. */
      displayRotation?: PageRotation;
      upright?: boolean;
      /** The tool's `/F` seed, captured at down (see the rect draft). */
      flags?: Partial<AnnotationFlags>;
    }
  // `guides` are the live alignment guides of a snapped move (empty when
  // snapping is off, bypassed, or nothing is in range) — drawn by `chrome`.
  | { kind: 'move'; ids: Id[]; start: Point; delta: Point; guides: Guide[] }
  // Single-shape resize / vertex drag. For a screen-anchored (`noZoom`/
  // `noRotate`) target, `base`/`cur` live in view space — the projected
  // geometry the user actually grabbed — and the commit maps `cur` back to
  // stored space through `unanchoredGeom` with the captured `view`. For every
  // other target the projection is the identity and `base` Is the stored geom.
  | {
      kind: 'handle';
      id: Id;
      handle: string;
      base: ModelGeometry;
      current: ModelGeometry;
      view?: ViewEnv;
    }
  // Rotate gesture (single or multi-target). `pivot` is the rotation centre
  // in view space (a single shape's projected centre / the projected union-box
  // centre for a group); `ids` are the members being turned; `start`/`cur` are
  // the pointer at grab and now, so the live angle is
  // `angle(cur - pivot) - angle(start - pivot)`. The base geometry stays in
  // `m.byId` until commit, so `effGeom` rotates from there. `free` (shift
  // held) bypasses rotation snapping for this sample. `view` (captured at
  // Down) projects screen-anchored members for preview + commit.
  | {
      kind: 'rotate';
      ids: Id[];
      pivot: Point;
      start: Point;
      current: Point;
      free?: boolean;
      view?: ViewEnv;
    }
  // Multi-target box transform (move/resize) computed as one Mat2D about the
  // union box. `anchor` is the fixed point of a resize (the opposite corner);
  // `sx`/`sy` the live scale; for `move` the scale is 1 and `delta` carries the
  // translation. Single-shape resize keeps using the `handle` draft above.
  // `anchor`/`base`/`cur` live in view space (the union box is computed from
  // projected quads); `view` as on the rotate draft.
  | {
      kind: 'group';
      op: 'resize';
      ids: Id[];
      handle: string;
      anchor: Point;
      base: Rect;
      current: Rect;
      view?: ViewEnv;
    }
  | { kind: 'caption'; id: Id; start: Point; delta: Point }
  | { kind: 'leader'; id: Id; start: Point; delta: number }
  | { kind: 'marquee'; page: PageRef; from: Point; to: Point };

/** A live text-markup preview (the in-progress selection rendered as the markup it
 *  will become). Per page, since a selection can span pages. */
export interface MarkupPreview {
  subtype: Subtype;
  /** Defaults key, distinct from subtype for presets such as replace-text. */
  preset: string;
  /** Keyed by `page.pageObjectNumber` (an internal lookup, not an address). */
  byPage: Record<number, Quad[]>;
}

/** Anchor + affordance state for UI that controls an in-progress creation draft. */
export interface CreationDraftAnchor {
  kind: 'poly';
  subtype: PolySubtype;
  page: PageRef;
  bounds: Rect;
  pointCount: number;
  minPoints: number;
  canFinish: boolean;
}

/**
 * What the core owns: everything about the user's session that is not a
 * record. `update` returns the next session; the plugin stores it.
 */
export interface Session {
  selected: Id[];
  /** The annotation under the pointer (topmost hit), or null. View-model
   *  state like `selected` — drives hover affordances (a redaction mark's
   *  applied-look preview) purely from the scene. Updated on change only
   *  (enter/leave cadence, never per-move). */
  hovered: Id | null;
  /** The gesture in progress (a move, a resize, a shape being drawn), or null. */
  draft: Draft | null;
  /** Transient ghost of an in-progress markup selection (null when idle). */
  preview: MarkupPreview | null;
  /** How many records this session has created; the next one is `new:<seq + 1>`. */
  seq: number;
  /**
   * The start of the `/NM` name each record this session creates is written
   * with: `<namePrefix><n>` for record `new:<n>`. A host gives each session
   * its own, so two sessions never name two annotations alike.
   */
  namePrefix: string;
  /**
   * Each tool's defaults for the annotations it draws, keyed by the tool's
   * preset: the engine fields its creates state. The engine's own defaults
   * fill in what they leave out.
   */
  defaults: Record<string, FieldValues>;
  /** Extra clickable margin (content units) around a stroke — bump it for touch. */
  hitMargin: number;
  /** The free-text annotation currently in text-edit mode (its `contentEditable`
   *  is focused), or null. Distinct from `selected`: you select to move/resize,
   *  you edit to type. */
  editing: Id | null;
  /** Snapping behaviour (alignment guides + rotation). */
  snap: SnapSettings;
}

/**
 * The records a gesture works on, read-only: what the engine confirmed with
 * the user's unconfirmed changes on top. The plugin builds it; the core never
 * stores a record.
 */
export interface AnnotationView {
  byId: Record<Id, ModelAnnotation>;
  /** Paint order: the document's order, then records created in this session. */
  order: Id[];
}

/** What every transition and read takes: the session composed with the records it works on. */
export type Model = Session & AnnotationView;

/**
 * What one message changed in the records. `put` holds new or changed records
 * as the user produced them; `drop` holds the ids the user deleted. The plugin
 * shows them until the engine writes that carry them settle.
 */
export interface ChangeSet {
  readonly put: readonly ModelAnnotation[];
  readonly drop: readonly Id[];
  /**
   * What each changed record's change means to the engine, by id: the fields
   * it changed, as `update` takes them. None for a new record (its create
   * writes it) or for a change the engine keeps nothing of (a record handed
   * to live rendering, a value set to what it was).
   */
  readonly patches: Readonly<Record<Id, AnnotationPatch>>;
}

/** The result of one message: the next session, the records it changed, and the engine work to do. */
export interface UpdateResult {
  readonly session: Session;
  readonly change: ChangeSet;
  readonly effects: readonly Effect[];
}

/**
 * Selection-chrome geometry in content units — the grab zones and the knob
 * stalk. The core is unit-agnostic and zoom-free: callers own the px→content
 * conversion (settings are CSS px; divide by the page's view scale), so grab
 * zones stay screen-constant across zoom.
 */
export interface ChromeGeometry {
  /** Half-side of a resize/vertex handle's square grab zone. */
  handleTol: number;
  /** Half-side of the rotate knob's square grab zone. */
  knobTol: number;
  /** How far the rotate knob hangs off the selection edge. */
  knobOffset: number;
}

export interface PointerInput {
  /** The page the sample resolved against (its own page-space frame). */
  page: PageRef;
  point: Point;
  shift: boolean;
  finish?: boolean;
  /**
   * The page's content box (`{0, 0, crop.width, crop.height}`) — when present,
   * gestures are clamped to it: a move keeps the selection's bounds inside the
   * page (sliding along the edge when the pointer overshoots), resize/create
   * points pin to the edge. Annotations are page-bound; the pointer isn't.
   */
  pageBox?: Rect;
  /**
   * Chrome grab-zone geometry for this event — per-event environmental context
   * exactly like `pageBox` (the caller converts its CSS-px settings by the
   * page's view scale at dispatch). Absent → `DEFAULT_CHROME_GEOM`.
   */
  chrome?: ChromeGeometry;
  /**
   * The page's total display rotation (document /Rotate + view rotation) at the
   * gesture — per-event environmental context like `pageBox`. A creation down
   * captures it on the draft (an `upright` commit counter-rotates against how
   * the page was displayed); edit gestures read it per sample, paired with
   * `scale`, so screen-anchored (`noZoom`/`noRotate`) annotations hit-test and
   * clamp at their effective geometry. Page space itself never rotates.
   */
  displayRotation?: PageRotation;
  /**
   * The page's zoom relative to its 100% baseline at the event — the other
   * half of the {@link ViewEnv} pair with `displayRotation` (dimensionless,
   * `transform.zoom`; not the px-per-point scale the caller uses for its
   * CSS-px chrome conversion). Absent → 1 (headless callers; screen-anchored
   * bodies then hit-test at rect size).
   */
  zoom?: number;
  /**
   * Counter-rotate the created annotation so it reads upright at
   * `displayRotation` — the authoring tool's `upright` policy, resolved by the
   * caller (the core knows subtypes, not tools). Box kinds only (free-text /
   * stamp are the ones with a natural reading orientation); vertex kinds and
   * callouts ignore it.
   */
  upright?: boolean;
  /**
   * Ids invisible to hit-testing and marquee for this event — per-event
   * environmental context like `pageBox`. The caller (plugin shell) resolves
   * its engaged Behaviors (form widgets under a fill tool render their own
   * DOM and must not select/move), so the core stays behavior-agnostic.
   */
  inert?: ReadonlySet<Id>;
}

/**
 * What a bare click (a press-release under the drag threshold) creates for a
 * tool: a default-size box with an explicit anchor (`center` unless stated —
 * free text declares `top-left` so the box hangs where you'll type,
 * display-frame-aware under `upright`), or a default-length line from the
 * point (`angleDeg` 0 = rightward, CW-positive in y-down space). Resolved
 * from the tool by the caller and passed on the message — the core knows
 * subtypes, not tools (the `upright` pattern). `false` suppresses a kind's
 * own click fallback (free text always click-creates by default).
 * Anchoring is policy data, never inferred from the kind — the same policy
 * drives annotation commits, footprint ghosts, and form-field placement
 * (see `resolveClickPlacement`).
 */
export type ClickCreate =
  | { width: number; height: number; anchor?: 'center' | 'top-left' }
  | { length: number; angleDeg?: number };

export type Message =
  | { type: 'editPointer'; phase: 'down' | 'move' | 'up'; in: PointerInput }
  | { type: 'marqueePointer'; phase: 'down' | 'move' | 'up'; in: PointerInput }
  | {
      type: 'createPointer';
      measure?: MeasurementAppearance;
      capture?: string;
      phase: 'down' | 'move' | 'up';
      subtype: Subtype;
      /** The authoring tool's `defaults` key (see {@link Draft}). Defaults to `subtype`. */
      preset?: string;
      /** PDF intent carried by an ink authoring preset. */
      intent?: InkIntent;
      /** The tool's click-create policy (see {@link ClickCreate}). */
      clickCreate?: ClickCreate | false;
      /** The tool's `/F` seed — merged over {@link DRAWN_FLAGS} at commit (a
       *  note tool passes `{ noZoom: true, noRotate: true }`). */
      flags?: Partial<AnnotationFlags>;
      /** Keep a completed ink stroke in the draft until `finishInkDraft`. */
      deferInkCommit?: boolean;
      /** Optional pure straight-line recognition applied to each completed stroke. */
      straightenInk?: InkStraightenOptions;
      in: PointerInput;
    }
  | { type: 'finishInkDraft' }
  | { type: 'finishCreationDraft' }
  | {
      type: 'createCaret';
      page: PageRef;
      anchor: TextEndAnchor;
      flags?: Partial<AnnotationFlags>;
    }
  | {
      type: 'createReplaceText';
      page: PageRef;
      quads: Quad[];
      anchor: TextEndAnchor;
      preset?: string;
    }
  // text markup: build one annotation from the selected text's per-line oriented
  // quads (the `text-selection` create gesture). One message per page the
  // selection covers.
  | {
      type: 'createMarkup';
      subtype: Subtype;
      page: PageRef;
      quads: Quad[];
      preset?: string;
      /** The tool's `/F` seed — merged over {@link DRAWN_FLAGS} at commit. */
      flags?: Partial<AnnotationFlags>;
    }
  // live markup preview (the selection rendered as the markup it will become)
  | {
      type: 'setMarkupPreview';
      subtype: Subtype;
      /** Per-page quads keyed by `page.pageObjectNumber` (a lookup, not an address). */
      quadsByPage: Record<number, Quad[]>;
      preset?: string;
    }
  | { type: 'clearMarkupPreview' }
  // Without `ids`: clear the selection. With `ids`: drop only those members
  // (the shell prunes annotations whose Behavior just engaged — inert things
  // cannot stay selected).
  | { type: 'deselect'; ids?: Id[] }
  /** Pointer entered/left an annotation (topmost hit id, or null). Pure state. */
  | { type: 'hover'; id: Id | null }
  // Programmatic selection (the data-API `select(ref)` — e.g. auto-selecting
  // a freshly placed form widget). Unknown/unselectable ids are dropped;
  // selecting a group member takes the whole group, like a click would.
  | { type: 'select'; ids: Id[]; add?: boolean }
  // Write engine fields to records, a patch per id: each takes the fields its
  // kind has and ignores the rest, so one message restyles a mixed selection.
  // A locked record takes none (`contents` and `richText` follow
  // `lockedContents` instead). Members flip to `vector`.
  | { type: 'setFields'; patches: Readonly<Record<Id, FieldValues>> }
  // Bold, italic or underline on the selection's text bodies.
  | { type: 'setTextFormat'; format: 'bold' | 'italic' | 'underline'; on: boolean }
  // Link the selection somewhere, or unlink it (`null`): the link kind's own
  // target, or every other linkable kind's attached link.
  | { type: 'setLink'; target: PdfLinkTarget | null }
  // Merge a `/F` flags patch into the selection (or explicit ids). Flags are
  // not appearance: members keep their render `source` (no /AP re-bake), and —
  // deliberately — the write is not gated by `locked`: this is how you unlock
  // (Acrobat keeps its Locked checkbox live on a locked annotation). One
  // `flags` effect per changed committed member; an uncommitted draft just
  // merges (its create draft carries the flags when it commits).
  | { type: 'setFlags'; patch: Partial<AnnotationFlags>; ids?: Id[] }
  // Merge fields into a tool's defaults (keyed by its preset).
  | { type: 'setDefaults'; preset: string; patch: FieldValues }
  // Live-adjust snapping (a UI toggle) — merges into `Model.snap`.
  | { type: 'setSnap'; patch: Partial<SnapSettings> }
  // Rotate the current selection by a fixed quarter-turn (clockwise) about its
  // centre — the toolbar "rotate 90°" affordance. Works for a single shape or a
  // multi-target group (about the union-box centre).
  | { type: 'rotate90' }
  // Reset rotation to the as-authored orientation: box `rot → 0`; vertex points
  // spun by `-rot` about their centroid, `rot → 0`. One patch effect per member.
  | { type: 'resetRotation' }
  | { type: 'delete' }
  | { type: 'cancel' }
  /** A record this session created was confirmed under a new id: selection, hover and editing follow it. */
  | { type: 'rekey'; from: Id; to: Id }
  /** These records left the view (deleted elsewhere, a refused create): drop every reference to them. */
  | { type: 'forget'; ids: Id[] }
  // free-text editing: enter/leave the focused `contentEditable`, and apply the
  // browser's plain-text result. `setText` flips the annotation to `vector` so
  // the live text shows; its `text` effect is written after a pause in typing.
  | { type: 'beginTextEdit'; id: Id }
  | { type: 'setText'; id: Id; text: string }
  // The editor's rich result (runs of deltas over the body), applied
  // like `setText`; `contents` follows as the projection.
  | { type: 'setRichText'; id: Id; doc: RichTextDocumentInput }
  | { type: 'endTextEdit' };

export type Effect =
  | { type: 'captured'; tool: string; page: PageRef; geometry: ModelGeometry }
  | { type: 'create'; id: Id }
  | { type: 'createGroup'; primary: Id; members: Id[] }
  /** Write one record's change: its entry in the change set's `patches`. `update`
   *  asks for it for every changed record that has one, except typed text, which
   *  its `text` effect writes after a pause. Whether the engine's re-baked
   *  appearance differs is the engine's answer, not the core's guess. */
  | { type: 'patch'; id: Id; patch: AnnotationPatch }
  /** Write the edited text of one free-text record. The plugin waits for a
   *  pause in typing and writes the latest text once. */
  | { type: 'text'; id: Id }
  /** The parent's `link` prop changed on a non-link kind: reconcile its
   *  attached link children (create / retarget / delete) toward `target`
   *  (null = remove them). Declarative — the plugin's reconciler is the only
   *  code that spells out child operations; parents store no link value, the
   *  committed children are the truth (`linkOf` reads them back). Geometry
   *  commits don't emit this; the plugin re-runs the reconciler after any
   *  `patch` of an annotation with attached children. */
  | { type: 'syncLink'; id: Id; target: PdfLinkTarget | null }
  /** Delete one record from the document. A record the engine has not
   *  confirmed yet is deleted once its create is. */
  | { type: 'delete'; id: Id };

/** Per-annotation render data — its content geometry + style + live state. */
export interface RenderItem {
  id: Id;
  ref: AnnotationRef | null;
  subtype: Subtype;
  geometry: ModelGeometry;
  /**
   * The visual box (geometry + stroke + line endings) in page space — the same
   * `geomVisualBounds` that feeds the engine `/Rect`. The renderer paints into this
   * box and does no bounds math of its own, so the on-screen box and the baked
   * appearance can never drift (the patch computes the rect).
   */
  box: Rect;
  /**
   * Page-space box the engine appearance raster occupies (the AP `/Rect`),
   * with the live move gesture applied — so a baked annotation's bitmap follows
   * a drag. Only meaningful when `source === 'baked'`; absent otherwise.
   */
  apBox?: Rect;
  /**
   * Rotation (deg, CW) to apply to the baked raster as a view transform —
   * exactly the rotation the engine stripped from it (see `ModelAnnotation.apRot`).
   * Live for `opaqueBody` kinds (a stamp spins with the rotate gesture);
   * absent when the raster already contains its rotation (vertex kinds).
   */
  apRot?: number;
  style: Style;
  /** Text styling (/DA projection) — present for text-bearing kinds (free
   *  text, text/choice widgets). Lets a behavior renderer's focused editor
   *  match the baked appearance's font. */
  text?: TextStyle;
  source: 'baked' | 'vector' | 'ghost';
  selected: boolean;
  /** The pointer is over this annotation — scene-level hover affordances
   *  (e.g. a redaction mark previews its applied look). */
  hovered?: boolean;
  /** Redaction label projection (redact kind only) — see {@link ModelAnnotation.label}. */
  label?: { text: string; repeat: boolean };
  measure?: MeasurementAppearance;
  /**
   * Applied rotation (deg, CW), or 0/undefined. For box kinds (`box`/`text`)
   * `box` is the unrotated visual box and the renderer applies this rotation
   * about its centre (CSS/SVG transform). For vertex kinds the geometry is
   * already rotated, so this is advisory only — the renderer must not re-apply it.
   */
  rot?: number;
  /**
   * Mix-blend-mode the annotation composites with against the page (highlights
   * multiply). The vector painter reads blend per scene node; the baked /AP image
   * has no scene, so it reads this. Undefined = normal compositing.
   */
  blend?: Exclude<BlendMode, 'normal'>;
}

/** The dumb draw vocabulary the framework renderer maps to SVG (page space).
 *  A closed node (rect, ellipse, closed poly) takes the annotation's fill colour;
 *  an open node (line, open poly — open arrows, butt, slash) is stroke-only. The
 *  stroke colour applies to every node. Closed-ness is the only fill signal. */
export type RenderNode =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'ellipse'; rect: Rect }
  | { kind: 'line'; a: Point; b: Point }
  | { kind: 'poly'; points: Point[]; closed: boolean }
  // a precomputed closed path (cloudy border) — `d` is SVG data in page space
  | { kind: 'path'; d: string };

/**
 * How to paint one node. The pure core fills this in (per kind/subtype), and a
 * framework renderer applies it verbatim — so all appearance logic (markup fill vs
 * stroke, blend, dash, derived widths) lives once, in the portable core, not in
 * every framework. Omitted `fill`/`stroke` mean none.
 */
export interface Paint {
  fill?: string;
  stroke?: string;
  width?: number; // stroke width (content units)
  opacity?: number;
  dash?: number[]; // stroke dash (content units)
  blend?: Exclude<BlendMode, 'normal'>;
  lineCap?: 'round'; // stroke-linecap; omitted = the default butt. Round for freehand ink.
  join?: 'round'; // stroke-linejoin; omitted = the default miter. Round for freehand ink.
}

/**
 * A fully-painted draw node: geometry + paint. `scene(item)` returns these and a
 * per-framework painter maps each to one element, applying `paint` — the entire
 * surface a new framework renderer must implement. Supersedes the geometry-only
 * `RenderNode` for rendering; `geomScene` stays the internal geometry helper.
 */
export type SceneNode =
  | { kind: 'rect'; rect: Rect; paint: Paint }
  | { kind: 'ellipse'; rect: Rect; paint: Paint }
  | { kind: 'line'; a: Point; b: Point; paint: Paint }
  | { kind: 'poly'; points: Point[]; closed: boolean; paint: Paint }
  | { kind: 'path'; d: string; paint: Paint }
  /** Painted (non-interactive) text — `at` is the baseline start point in
   *  content units. Editable text (free text) stays a framework element;
   *  this is for pure pixels, e.g. a redaction label preview. */
  | {
      kind: 'text';
      at: Point;
      text: string;
      fontSize: number;
      fontFamily?: string;
      rotation?: number;
      paint: Paint;
    };

/** Pure geometry settings for recognising and axis-snapping a freehand stroke. */
export interface InkStraightenOptions {
  /** Maximum `max perpendicular deviation / endpoint distance`. */
  deviationThreshold: number;
  /** Degrees from horizontal/vertical within which the line snaps to that axis. */
  axisSnapDegrees: number;
}

export type ChromeNode =
  | { kind: 'outline'; rect: Rect }
  // An oriented selection box: the four corners of the (possibly tilted) OBB in
  // order, for rotatable kinds. The renderer draws the closed quad; `angle` (deg)
  // lets it orient resize cursors. Replaces the axis-aligned `outline` whenever a
  // shape (or group) carries rotation.
  | { kind: 'obb'; corners: [Point, Point, Point, Point]; angle: number }
  // `rot` (deg, CW) tilts the handle glyph itself so it rides a rotated box.
  | { kind: 'handle'; at: Point; cursor: Cursor; rot?: number }
  // The rotate knob: `at` is where the grab dot sits (hanging off the top edge),
  // `from` the edge anchor the connector stalk draws to.
  | { kind: 'rotate-knob'; at: Point; from: Point }
  // A live alignment guide (see `Guide`) — drawn while a snapped move is active.
  | { kind: 'guide'; axis: 'x' | 'y'; at: number; lo: number; hi: number }
  // The live rotation readout while a rotate gesture is active: `at` is the
  // pointer (page space), `angle` the selection's absolute angle (deg, CW).
  | { kind: 'angle-chip'; at: Point; angle: number }
  // Rotation guides while a rotate gesture is active: finished line segments —
  // chords of the page through the pivot — so painters just draw. Two `axis`
  // lines (the fixed 0°/90° reference cross) + one `indicator` at the live
  // `angle` (the same snapped angle the chip shows and the commit applies).
  | {
      kind: 'rotate-guides';
      center: Point;
      angle: number;
      lines: Array<{ a: Point; b: Point; role: 'axis' | 'indicator' }>;
    }
  | { kind: 'marquee'; rect: Rect };
