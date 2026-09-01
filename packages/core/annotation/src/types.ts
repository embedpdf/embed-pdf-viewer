import type {
  AnnotationDTO,
  AnnotationFlags,
  AnnotationRef,
  BlendMode,
  CaretIntent,
  InkIntent,
  LineEnding,
  LineEndings,
  PdfLinkTarget,
  StrikeoutIntent,
} from '@embedpdf/engine-core/runtime';
import type { PageObjectNumber } from '@embedpdf/core';
import type {
  PageRotation,
  Point,
  Rect as GeometryRect,
  TextQuad,
} from '@embedpdf/core-geometry';

export type { TextQuad } from '@embedpdf/core-geometry';

export type { LineEnding, LineEndings };

/**
 * Content-space point/rect (y-down, PDF points, crop-relative) — the viewer space.
 * These are the shared `@embedpdf/core-geometry` primitives: a `Vec` IS a `Point`
 * and `Rect` IS geometry's `Rect`, so the whole stack speaks one vocabulary and
 * the coordinate math lives in ONE package.
 */
export type Vec = Point;
export type Rect = GeometryRect;
/** Four POSITIONAL content-space points — selection chrome / OBB corners.
 *  Text-markup geometry uses the corner-NAMED {@link TextQuad} instead. */
export type Quad = [Vec, Vec, Vec, Vec];

/**
 * Where a text-edit annotation (caret / replace-text) anchors: the boundary
 * glyph's oriented cell plus the READING direction along its baseline
 * (+1 = toward `end`, −1 = toward `start` — sequence-derived, never inferred
 * from geometry).
 */
export interface TextEndAnchor {
  glyphQuad: TextQuad;
  advance: 1 | -1;
}

export type Id = string;
export type Cursor = string;
export type PolySubtype = 'polygon' | 'polyline';

/**
 * The per-page view environment the screen-anchor projection consumes:
 * `zoom` — the page's zoom RELATIVE to its 100% baseline (dimensionless;
 * 1 = Acrobat's 100% = `viewUnitsPerPoint × userUnit` view px per point) —
 * and the TOTAL display rotation (document /Rotate + view rotation).
 * Deliberately NOT a px-per-point scale: `noZoom` means "hold the body at its
 * 100%-zoom size", a statement about zoom, so feeding it a units conversion
 * (the old mistake) shrank bodies at 100%. Per-event / per-call context (the
 * `pageBox` pattern) — never stored on the model; the pointer drafts capture
 * it at DOWN so anchored gestures project and commit with the view they
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
 * Content-space geometry — the ONE thing hit-testing, editing, and rendering work
 * on. A small closed union covers every kind: shapes (rect/ellipse), line,
 * polygon/polyline (poly), text markup (quads), and caret.
 */
/**
 * A free-text callout's leader: the `/CL` line + `/LE` arrow. `tip` is the
 * called-out point (the arrow is drawn here); `knee` is the optional elbow. The
 * point where the leader meets the text box (the third `/CL` point) is NEVER
 * stored — it is DERIVED from the box + the knee (see `calloutConnection`), so it
 * can't drift when the box or knee moves. Content space (y-down).
 */
export interface Callout {
  tip: Vec;
  knee?: Vec;
  ending: LineEnding;
}

/**
 * Rotation (degrees, clockwise in content space, normalized `[0,360)`) carried by
 * the rotatable `Geom` variants. The semantics differ by family, which is exactly
 * the box-vs-vertex split:
 *
 * - **Box** (`rect`, `text`): `rect` is the UNROTATED local box and `rot` is the
 *   applied tilt — together they reconstruct the visual. The repository emits
 *   `rect` as `unrotatedRect`, `rot` as the rendered `/EMBD_Metadata/Rotation`,
 *   and the rotated visual AABB as `/Rect`, so PDFium bakes a portable `/AP`.
 * - **Vertex** (`line`, `poly`, `ink`): the points are ALREADY rotated (they are
 *   the portable visual), so `rot` is an ADVISORY scalar — the cumulative tilt the
 *   user applied since authoring. It lets EmbedPDF reconstruct an oriented
 *   selection box (`obbFromTheta`) and offer reset-to-0; it is inert for
 *   rendering (PDFium ignores a lone `Rotation` with no `UnrotatedRect`).
 */
export type Geom =
  | { t: 'rect'; rect: Rect; ellipse: boolean; rot?: number } // square / circle (rect = unrotated box)
  | { t: 'line'; a: Vec; b: Vec; ends?: LineEndings; rot?: number } // line (points pre-rotated; rot advisory)
  | { t: 'poly'; points: Vec[]; closed: boolean; ends?: LineEndings; rot?: number } // polygon/polyline (pre-rotated; rot advisory)
  | { t: 'quads'; quads: TextQuad[] } // highlight / underline / squiggly / strikeout
  | { t: 'caret'; rect: Rect; rot?: number } // caret insertion marker (rect = unrotated box; rot = its text's baseline tilt, authoring metadata — no gesture)
  | { t: 'ink'; strokes: Vec[][]; rot?: number } // freehand ink (pre-rotated; rot advisory)
  | { t: 'text'; rect: Rect; callout?: Callout; rot?: number }; // free-text box (`rect` is the unrotated text box);
// a `callout` adds a leader line + arrow. The TEXT is data (DTO `contents`),
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
 * Content-space text styling for a text-editable kind (free text) — the text
 * counterpart of {@link Style}, projected from the DTO's `/DA` fields the same
 * way `style` is projected from `/C`/`/CA`/`/BS`. CSS colour string; the engine
 * `Color` seam is crossed only in the plugin repository.
 */
export interface TextStyle {
  /** A PDF standard font name or a registered font key. */
  fontFamily: string;
  /** Content units (PDF points). */
  fontSize: number;
  fontColor: string;
  textAlign: TextAlign;
}

/**
 * The ONE flat vocabulary for editable appearance properties — what property
 * sidebars/toolbars read and write, regardless of where each property is stored
 * internally (`style`, `geom.ends`, or `text`). Which keys apply to a kind, and
 * in what UI order, is declared per kind in the KIND table (`propsFor`).
 */
export interface AnnotationProps extends Style, TextStyle {
  /** `/LE` endings (line / polyline). */
  lineEndings: LineEndings;
  /**
   * `/Name` icon of an icon kind (text note, file attachment). Optional in
   * the bag — each kind falls back to its own spec default ('comment',
   * 'paperclip') at creation, so one flat vocabulary needs no per-kind base
   * value. Valid values are the `options` of the kind's `icon` PropSpec.
   */
  icon?: string;
  /**
   * Where this annotation LINKS to, or `null` for none. Optional in the bag
   * like `icon`. One key, two storages (the props.ts routing rule): on the
   * link kind it is the annotation's OWN target (`/A`); on every other
   * linkable kind it is the target of the ATTACHED link child(ren) —
   * grouped `/Link` annotations the model folds into their parent (the
   * serialization the PDF spec forces, since only Link annotations are
   * clickable). Writing it creates/retargets/deletes those children through
   * the ONE `syncLink` seam.
   */
  link?: PdfLinkTarget | null;
}

export type PropKey = keyof AnnotationProps;

/**
 * What a committed edit CHANGED — carried on the `patch` effect so the shell
 * emits exactly that intent (repository `toScopedPatch`) instead of
 * reconstructing a full projection. `geometry` covers every gesture commit
 * (move/resize/rotate/vertex edit); `props` forwards the user's patch keys
 * verbatim. Text content never rides this effect (the debounced text-edit
 * write owns `contents`).
 */
export type PatchScope = { kind: 'geometry' } | { kind: 'props'; keys: PropKey[] };

/** A partial property write. `lineEndings` merges per side (set just `end`
 *  without knowing `start`); every other key overwrites. */
export type AnnotationPropsPatch = {
  [K in PropKey]?: K extends 'lineEndings' ? Partial<LineEndings> : AnnotationProps[K];
};

export interface Annot {
  id: Id;
  ref: AnnotationRef | null;
  pon: PageObjectNumber;
  subtype: Subtype;
  geom: Geom;
  style: Style;
  /** Text styling — present only for text-editable kinds (free text). Like
   *  `style`, a content-space projection of `data`, editable via `setProps`. */
  text?: TextStyle;
  /** Redaction label (`/OverlayText` + `/Repeat`) — redact kind only. A
   *  projection of `data` like `text`; the hover preview scene draws it. */
  label?: { text: string; repeat: boolean };
  /** `/Name` icon — present only for icon kinds (text note, file attachment).
   *  Like `style`, a projection of `data`, editable via `setProps`. */
  icon?: string;
  /**
   * The `/F` annotation flags, verbatim from the DTO (freshly drawn annotations
   * start at {@link DRAWN_FLAGS} — `print` set). NEVER read individual keys to
   * gate behavior — the predicates in `flags.ts` (`annotInteractive`,
   * `annotTransformable`, `annotContentsEditable`, `viewable`) are the one
   * interpretation of the spec, and `anchorModeOf` owns `noZoom`/`noRotate`.
   */
  flags: AnnotationFlags;
  source: 'baked' | 'vector';
  /**
   * Content-space box of the engine appearance raster (the AP `/Rect`), set when
   * the annotation is derived from a DTO. While `source === 'baked'` the renderer
   * blits the engine bitmap into this box; a move translates it (a rigid shift
   * keeps the raster valid), so the bitmap rides along without re-rendering.
   * Ignored once `source === 'vector'`.
   */
  apBox?: Rect;
  /**
   * Rotation (deg, CW) that was STRIPPED from the baked raster — present only
   * when the engine rendered this appearance rotation-free (a box-family kind
   * whose DTO carries BOTH `rotation` and `unrotatedRect`; `apBox` is then the
   * unrotated box). The blit re-applies it as a view transform about the box
   * centre. Vertex kinds pre-rotate their geometry, so this stays unset there
   * and their rasters blit untransformed.
   */
  apRot?: number;
  /**
   * Revision of the engine-baked `/AP` CONTENT (absent ≡ 0). The raster a baked
   * annotation shows depends on exactly this and the render scale — never on
   * position (`apBox` translates the blit) or rotation (`apRot` transforms it) —
   * so the shell re-fetches appearances precisely when it changes. Bumped by the
   * `upsert` that confirms an engine re-bake with new content: a geometry patch
   * that changed the authoring frame's SIZE resolving (`Effect.apChanged`), or a
   * remote edit folding in. A move or rotate leaves it untouched: the old raster
   * is still pixel-exact, so those cost zero re-renders.
   */
  apVersion?: number;
  /**
   * This SESSION's authority over this record, projected from the security
   * service's collab mirrors at ingest (see permissions.md) — model-owned
   * derived state like `apVersion`, never DTO-derived. Fused into
   * `annotTransformable`/`annotDeletable`, so a record the session may not
   * edit renders and behaves exactly like a `locked` one (bare outline, no
   * handles, no drag). Absent = unstamped (a local draft, a wildcard local
   * engine, tests) and treated as allowed — the client gate is a COURTESY
   * that keeps the UI truthful; the engine independently enforces.
   */
  authority?: { update: boolean; delete: boolean };
  /**
   * The canonical engine DTO this annotation was derived from (PDF-space, sRGB)
   * — the single source of truth for its data. `geom` and `style` are
   * content-space RENDER PROJECTIONS of it, recomputed (never edited directly)
   * whenever `data` changes, so the two can't drift. Absent only for a vector
   * draft that hasn't been committed to the engine yet (no DTO exists).
   */
  data?: AnnotationDTO;
  /** Normalized PDF `/IT` for intent-bearing annotations authored before a DTO exists. */
  intent?: CaretIntent | StrikeoutIntent | InkIntent;
  /**
   * The link KIND's own `/A` target (see {@link AnnotationProps.link}) —
   * present only on `subtype: 'link'`. Every OTHER kind's link is an
   * attached child annotation in the substrate, read through the `linkOf`
   * lens and materialized by the shell's `syncLink` reconciler; parents
   * store nothing.
   */
  link?: PdfLinkTarget | null;
  /**
   * Relationship to another annotation. `irt` ("in reply to") links a child to a
   * parent — a reply in a comment thread, or a caret bound to its strikeout in a
   * replace-text pair. `group` ties a set into one composite unit (created and,
   * typically, deleted together). Both are unused until comments / replace-text
   * land, but the field lives here from the start so select/delete/persistence
   * never have to be retrofitted around it.
   */
  irt?: Id;
  group?: string;
}

/** A draggable handle: a resize corner/edge (rect) or a vertex (line/poly). */
export interface Handle {
  id: string;
  at: Vec;
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
 * TOOL that started it, which may differ from the PDF `subtype`. Two tools can
 * share a subtype but carry distinct defaults (an "arrow" is a `line` with an
 * arrowhead default); the preset keeps them apart. Absent → fall back to
 * `subtype` (a headless / programmatic caller that isn't tool-driven), so the
 * built-in tools where preset === subtype behave exactly as before.
 */
export type Draft =
  | {
      g: 'create-rect';
      subtype: Subtype;
      preset?: string;
      pon: PageObjectNumber;
      from: Vec;
      to: Vec;
      ellipse: boolean;
      /** Display rotation + upright policy captured at DOWN (the gesture's home
       *  page), so the commit counter-rotates against what the author SAW even
       *  if the up sample resolves elsewhere. See {@link PointerInput}. */
      displayRotation?: PageRotation;
      upright?: boolean;
      /** The tool's click-create policy, captured at DOWN like `upright`. */
      clickCreate?: ClickCreate | false;
      /** The tool's `/F` seed, captured at DOWN like `upright` — merged over
       *  {@link DRAWN_FLAGS} at commit (a note tool sets noZoom/noRotate). */
      flags?: Partial<AnnotationFlags>;
    }
  | {
      g: 'create-line';
      subtype: Subtype;
      preset?: string;
      pon: PageObjectNumber;
      from: Vec;
      to: Vec;
      /** The tool's click-create policy, captured at DOWN like `upright`. */
      clickCreate?: ClickCreate | false;
      /** The tool's `/F` seed, captured at DOWN (see the rect draft). */
      flags?: Partial<AnnotationFlags>;
    }
  | {
      g: 'create-poly';
      subtype: Subtype;
      preset?: string;
      pon: PageObjectNumber;
      points: Vec[];
      cur: Vec;
      closed: boolean;
      /** The tool's `/F` seed, captured at DOWN (see the rect draft). */
      flags?: Partial<AnnotationFlags>;
    }
  | {
      g: 'create-ink';
      subtype: Subtype;
      preset?: string;
      pon: PageObjectNumber;
      strokes: Vec[][];
      intent?: InkIntent;
      /** The tool's `/F` seed, captured at DOWN (see the rect draft). */
      flags?: Partial<AnnotationFlags>;
    }
  | {
      // Free-text callout, built in clicks: click 1 sets `tip`, click 2 sets
      // `knee` (advancing to `box`), then a drag/click lays the text box. `cur`
      // is the live pointer for the leader/box preview; `boxFrom`/`boxTo` are the
      // dragged box once the box step starts.
      g: 'create-callout';
      subtype: Subtype;
      preset?: string;
      pon: PageObjectNumber;
      step: 'knee' | 'box';
      tip: Vec;
      knee?: Vec;
      cur: Vec;
      boxFrom?: Vec;
      boxTo?: Vec;
      /** Display rotation + upright policy captured at the TIP click (the
       *  gesture's home page) — the text BOX commits counter-rotated so it
       *  reads upright; the leader (tip/knee) is page-space and never turns.
       *  Same capture rule as the rect draft. */
      displayRotation?: PageRotation;
      upright?: boolean;
      /** The tool's `/F` seed, captured at DOWN (see the rect draft). */
      flags?: Partial<AnnotationFlags>;
    }
  // `guides` are the live alignment guides of a snapped move (empty when
  // snapping is off, bypassed, or nothing is in range) — drawn by `chrome`.
  | { g: 'move'; ids: Id[]; start: Vec; delta: Vec; guides: Guide[] }
  // Single-shape resize / vertex drag. For a screen-anchored (`noZoom`/
  // `noRotate`) target, `base`/`cur` live in VIEW space — the projected
  // geometry the user actually grabbed — and the commit maps `cur` back to
  // stored space through `unanchoredGeom` with the captured `view`. For every
  // other target the projection is the identity and `base` IS the stored geom.
  | { g: 'handle'; id: Id; handle: string; base: Geom; cur: Geom; view?: ViewEnv }
  // Rotate gesture (single OR multi-target). `pivot` is the rotation centre
  // in VIEW space (a single shape's projected centre / the projected union-box
  // centre for a group); `ids` are the members being turned; `start`/`cur` are
  // the pointer at grab and now, so the live angle is
  // `angle(cur - pivot) - angle(start - pivot)`. The base geometry stays in
  // `m.byId` until commit, so `effGeom` rotates from there. `free` (shift
  // held) bypasses rotation snapping for this sample. `view` (captured at
  // DOWN) projects screen-anchored members for preview + commit.
  | { g: 'rotate'; ids: Id[]; pivot: Vec; start: Vec; cur: Vec; free?: boolean; view?: ViewEnv }
  // Multi-target box transform (move/resize) computed as one Mat2D about the
  // union box. `anchor` is the fixed point of a resize (the opposite corner);
  // `sx`/`sy` the live scale; for `move` the scale is 1 and `delta` carries the
  // translation. Single-shape resize keeps using the `handle` draft above.
  // `anchor`/`base`/`cur` live in VIEW space (the union box is computed from
  // projected quads); `view` as on the rotate draft.
  | {
      g: 'group';
      op: 'resize';
      ids: Id[];
      handle: string;
      anchor: Vec;
      base: Rect;
      cur: Rect;
      view?: ViewEnv;
    }
  | { g: 'marquee'; pon: PageObjectNumber; from: Vec; to: Vec };

/** A live text-markup preview (the in-progress selection rendered as the markup it
 *  will become). Per page, since a selection can span pages. */
export interface MarkupPreview {
  subtype: Subtype;
  /** Defaults key, distinct from subtype for presets such as replace-text. */
  preset: string;
  byPage: Record<number, TextQuad[]>;
}

/** Anchor + affordance state for UI that controls an in-progress creation draft. */
export interface CreationDraftAnchor {
  kind: 'poly';
  subtype: PolySubtype;
  pon: PageObjectNumber;
  bounds: Rect;
  pointCount: number;
  minPoints: number;
  canFinish: boolean;
}

export interface Model {
  byId: Record<Id, Annot>;
  order: Id[];
  selected: Id[];
  /** The annotation under the pointer (topmost hit), or null. View-model
   *  state like `selected` — drives hover affordances (a redaction mark's
   *  applied-look preview) purely from the scene. Updated on CHANGE only
   *  (enter/leave cadence, never per-move). */
  hovered: Id | null;
  draft: Draft | null;
  /** Transient ghost of an in-progress markup selection (null when idle). */
  preview: MarkupPreview | null;
  seq: number;
  /** The base style new annotations inherit (per-tool `defaults` layer on top). */
  style: Style;
  /** Per-tool (keyed by subtype / tool id) property overrides for newly drawn
   *  annotations — the SAME flat vocabulary `setProps` uses. `lineEndings` is
   *  stored fully resolved (merged at `setDefaults` time). */
  defaults: Record<string, AnnotationPropsPatch>;
  /** Extra clickable margin (content units) around a stroke — bump it for touch. */
  hitMargin: number;
  /** The free-text annotation currently in TEXT-EDIT mode (its `contentEditable`
   *  is focused), or null. Distinct from `selected`: you select to move/resize,
   *  you edit to type. */
  editing: Id | null;
  /** Snapping behaviour (alignment guides + rotation). */
  snap: SnapSettings;
}

/**
 * Selection-chrome geometry in CONTENT units — the grab zones and the knob
 * stalk. The core is unit-agnostic and zoom-free: callers own the px→content
 * conversion (settings are CSS px; divide by the page's view scale), so grab
 * zones stay screen-constant across zoom.
 */
export interface ChromeGeom {
  /** Half-side of a resize/vertex handle's square grab zone. */
  handleTol: number;
  /** Half-side of the rotate knob's square grab zone. */
  knobTol: number;
  /** How far the rotate knob hangs off the selection edge. */
  knobOffset: number;
}

export interface PointerInput {
  pon: PageObjectNumber;
  point: Vec;
  shift: boolean;
  finish?: boolean;
  /**
   * The page's content box (`{0, 0, crop.width, crop.height}`) — when present,
   * gestures are CLAMPED to it: a move keeps the selection's bounds inside the
   * page (sliding along the edge when the pointer overshoots), resize/create
   * points pin to the edge. Annotations are page-bound; the pointer isn't.
   */
  pageBox?: Rect;
  /**
   * Chrome grab-zone geometry for this event — per-event environmental context
   * exactly like `pageBox` (the caller converts its CSS-px settings by the
   * page's view scale at dispatch). Absent → `DEFAULT_CHROME_GEOM`.
   */
  chrome?: ChromeGeom;
  /**
   * The page's TOTAL display rotation (document /Rotate + view rotation) at the
   * gesture — per-event environmental context like `pageBox`. A creation DOWN
   * captures it on the draft (an `upright` commit counter-rotates against how
   * the page was DISPLAYED); edit gestures read it per sample, paired with
   * `scale`, so screen-anchored (`noZoom`/`noRotate`) annotations hit-test and
   * clamp at their EFFECTIVE geometry. Content space itself never rotates.
   */
  displayRotation?: PageRotation;
  /**
   * The page's zoom RELATIVE to its 100% baseline at the event — the other
   * half of the {@link ViewEnv} pair with `displayRotation` (dimensionless,
   * `transform.zoom`; NOT the px-per-point scale the caller uses for its
   * CSS-px chrome conversion). Absent → 1 (headless callers; screen-anchored
   * bodies then hit-test at rect size).
   */
  zoom?: number;
  /**
   * Counter-rotate the created annotation so it reads upright at
   * `displayRotation` — the authoring TOOL's `upright` policy, resolved by the
   * caller (the core knows subtypes, not tools). Box kinds only (free-text /
   * stamp are the ones with a natural reading orientation); vertex kinds and
   * callouts ignore it.
   */
  upright?: boolean;
  /**
   * Ids invisible to hit-testing and marquee for THIS event — per-event
   * environmental context like `pageBox`. The caller (plugin shell) resolves
   * its engaged Behaviors (form widgets under a fill tool render their own
   * DOM and must not select/move), so the core stays behavior-agnostic.
   */
  inert?: ReadonlySet<Id>;
}

/**
 * What a bare CLICK (a press-release under the drag threshold) creates for a
 * tool: a default-size box with an EXPLICIT anchor (`center` unless stated —
 * free text declares `top-left` so the box hangs where you'll type,
 * display-frame-aware under `upright`), or a default-length line from the
 * point (`angleDeg` 0 = rightward, CW-positive in y-down space). Resolved
 * from the TOOL by the caller and passed on the message — the core knows
 * subtypes, not tools (the `upright` pattern). `false` suppresses a kind's
 * own click fallback (free text always click-creates by default).
 * Anchoring is policy DATA, never inferred from the kind — the same policy
 * drives annotation commits, footprint ghosts, and form-field placement
 * (see `resolveClickPlacement`).
 */
export type ClickCreate =
  | { width: number; height: number; anchor?: 'center' | 'top-left' }
  | { length: number; angleDeg?: number };

export type Msg =
  | { t: 'editPointer'; phase: 'down' | 'move' | 'up'; in: PointerInput }
  | { t: 'marqueePointer'; phase: 'down' | 'move' | 'up'; in: PointerInput }
  | {
      t: 'createPointer';
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
  | { t: 'finishInkDraft' }
  | { t: 'finishCreationDraft' }
  | {
      t: 'createCaret';
      pon: PageObjectNumber;
      anchor: TextEndAnchor;
      flags?: Partial<AnnotationFlags>;
    }
  | {
      t: 'createReplaceText';
      pon: PageObjectNumber;
      quads: TextQuad[];
      anchor: TextEndAnchor;
      preset?: string;
    }
  // text markup: build one annotation from the selected text's per-line oriented
  // quads (the `text-selection` create gesture). One message per page the
  // selection covers.
  | {
      t: 'createMarkup';
      subtype: Subtype;
      pon: PageObjectNumber;
      quads: TextQuad[];
      preset?: string;
      /** The tool's `/F` seed — merged over {@link DRAWN_FLAGS} at commit. */
      flags?: Partial<AnnotationFlags>;
    }
  // live markup preview (the selection rendered as the markup it will become)
  | {
      t: 'setMarkupPreview';
      subtype: Subtype;
      quadsByPage: Record<number, TextQuad[]>;
      preset?: string;
    }
  | { t: 'clearMarkupPreview' }
  // Without `ids`: clear the selection. With `ids`: drop only those members
  // (the shell prunes annotations whose Behavior just ENGAGED — inert things
  // cannot stay selected).
  | { t: 'deselect'; ids?: Id[] }
  /** Pointer entered/left an annotation (topmost hit id, or null). Pure state. */
  | { t: 'hover'; id: Id | null }
  /** Force/clear session visibility for specific annotations (the actions
   *  plane's Hide sink). Hiding also clears transient engagement (selection,
   *  editing, hover) for the hidden ids. Unknown ids no-op. Zero effects. */
  /** Drop overrides for truly DELETED annotations (never for reloads). */
  // Programmatic selection (the data-API `select(ref)` — e.g. auto-selecting
  // a freshly placed form widget). Unknown/unselectable ids are dropped;
  // selecting a group member takes the whole group, like a click would.
  | { t: 'select'; ids: Id[]; add?: boolean }
  // Apply a flat property patch to the current selection. Each member takes the
  // keys its KIND declares (`propsFor`) and ignores the rest, so one message
  // restyles a mixed selection. Members flip to `vector`; one patch effect each.
  | { t: 'setProps'; patch: AnnotationPropsPatch }
  // Merge a `/F` flags patch into the selection (or explicit ids). Flags are
  // NOT appearance: members keep their render `source` (no /AP re-bake), and —
  // deliberately — the write is NOT gated by `locked`: this is how you unlock
  // (Acrobat keeps its Locked checkbox live on a locked annotation). One
  // `flags` effect per changed COMMITTED member; an uncommitted draft just
  // merges (its create draft carries the flags when it commits).
  | { t: 'setFlags'; patch: Partial<AnnotationFlags>; ids?: Id[] }
  | { t: 'setDefaults'; subtype: Subtype; patch: AnnotationPropsPatch }
  // Live-adjust snapping (a UI toggle) — merges into `Model.snap`.
  | { t: 'setSnap'; patch: Partial<SnapSettings> }
  // Rotate the current selection by a fixed quarter-turn (clockwise) about its
  // centre — the toolbar "rotate 90°" affordance. Works for a single shape or a
  // multi-target group (about the union-box centre).
  | { t: 'rotate90' }
  // Reset rotation to the as-authored orientation: box `rot → 0`; vertex points
  // spun by `-rot` about their centroid, `rot → 0`. One patch effect per member.
  | { t: 'resetRotation' }
  | { t: 'delete' }
  | { t: 'cancel' }
  | { t: 'loaded'; annots: Annot[] }
  /**
   * Whole-document hydration ingest (and desync re-ingest): the snapshot is
   * the committed TRUTH. Incoming annots overwrite by id (gesture-locked ids
   * excepted, as in `upsert`); committed model entries ABSENT from the
   * snapshot are reaped — they were deleted while we could not watch.
   * Uncommitted `tmp:` drafts and gesture-locked ids are never reaped, and
   * an in-progress draft survives (unlike `remove`). `bumpAp` marks a
   * desync re-ingest: rasters may have changed invisibly during the gap,
   * so every replaced annotation re-fetches once.
   */
  | { t: 'hydrated'; annots: Annot[]; bumpAp?: boolean }
  | { t: 'created'; tempId: Id; id: Id; ref: AnnotationRef }
  | { t: 'createFailed'; tempId: Id }
  // store maintenance for the data API + collaboration: add-or-replace an
  // annotation by id (own create/update re-synced from the engine DTO, or a
  // remote edit arriving over the event stream), and remove by id (own delete
  // by ref, or a remote delete). Pure store ops — they emit no effects.
  // add-or-replace by id. `bumpAp` marks these upserts as confirming an engine
  // /AP re-bake with NEW content (a size-changing patch resolving, a remote
  // edit): each replaced annotation's `apVersion` increments, telling the shell
  // to re-fetch its raster. Plain re-syncs (a move's round-trip) leave it alone.
  | { t: 'upsert'; annots: Annot[]; bumpAp?: boolean }
  // A sibling PLANE re-baked these annotations' /AP without touching the
  // annotation model (a form value write regenerating widget appearances):
  // bump `apVersion` so the shell re-fetches the raster. Unknown ids no-op.
  | { t: 'bumpAp'; ids: Id[] }
  | { t: 'remove'; ids: Id[] }
  // free-text editing: enter/leave the focused `contentEditable`, and apply the
  // browser's plain-text result optimistically (the plugin debounces the engine
  // write). `setText` flips the annotation to `vector` so the live text shows.
  | { t: 'beginTextEdit'; id: Id }
  | { t: 'setText'; id: Id; text: string }
  | { t: 'endTextEdit' };

export type Effect =
  | { fx: 'create'; id: Id }
  | { fx: 'createGroup'; primary: Id; members: Id[] }
  /** `apChanged` is set (to `true`) ONLY when this patch INVALIDATED a baked
   *  raster — the annotation stayed `baked` (an opaque-body kind) and the edit
   *  resized its `/AP` frame, so the engine's re-bake produces new content (in
   *  practice: a stamp resize). The shell's resolve handler then turns it into
   *  an `upsert` with `bumpAp`. Absent for everything else — moves/rotations
   *  (the blit repositions the same pixels) and any kind that flipped to
   *  `vector` (it renders live; the raster stops mattering) — so those keep the
   *  bare `{ fx, id }` shape and trigger no appearance re-fetch. */
  | { fx: 'patch'; id: Id; scope: PatchScope; apChanged?: true }
  /** A `/F`-only engine write for one committed annotation: the shell emits a
   *  flags-only patch (the model already holds the merged flags) and re-syncs
   *  PRESERVING the render source — flags never re-bake an appearance. */
  | { fx: 'flags'; id: Id }
  /** The parent's `link` prop changed on a NON-link kind: reconcile its
   *  attached link children (create / retarget / delete) against the desired
   *  state derived from `link` + the parent's geometry. Declarative — the
   *  shell's reconciler is the only code that spells out child operations.
   *  (Geometry commits don't emit this; the shell re-runs the reconciler on
   *  any `patch` of an annotation that has `linkRefs`.) */
  // Reconcile the parent's attached link children toward `target` (null =
  // remove them). The intent rides the effect — parents store no link value;
  // the committed children ARE the truth (`linkOf` reads them back).
  | { fx: 'syncLink'; id: Id; target: PdfLinkTarget | null }
  | { fx: 'delete'; ref: AnnotationRef };

/** Per-annotation render data — its content geometry + style + live state. */
export interface RenderItem {
  id: Id;
  ref: AnnotationRef | null;
  subtype: Subtype;
  geom: Geom;
  /**
   * The VISUAL box (geometry + stroke + line endings) in content space — the SAME
   * `geomVisualBounds` that feeds the engine `/Rect`. The renderer paints into THIS
   * box and does no bounds math of its own, so the on-screen box and the baked
   * appearance can never drift (the v2 "patch computes the rect" rule).
   */
  box: Rect;
  /**
   * Content-space box the engine appearance raster occupies (the AP `/Rect`),
   * with the live move gesture applied — so a baked annotation's bitmap follows
   * a drag. Only meaningful when `source === 'baked'`; absent otherwise.
   */
  apBox?: Rect;
  /**
   * Rotation (deg, CW) to apply to the baked raster as a view transform —
   * exactly the rotation the engine STRIPPED from it (see `Annot.apRot`).
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
  /** Redaction label projection (redact kind only) — see {@link Annot.label}. */
  label?: { text: string; repeat: boolean };
  /**
   * Applied rotation (deg, CW), or 0/undefined. For BOX kinds (`rect`/`text`)
   * `box` is the UNROTATED visual box and the renderer applies this rotation
   * about its centre (CSS/SVG transform). For VERTEX kinds the geometry is
   * already rotated, so this is advisory only — the renderer must NOT re-apply it.
   */
  rot?: number;
  /**
   * Mix-blend-mode the annotation composites with against the page (highlights
   * multiply). The vector painter reads blend per scene node; the baked /AP image
   * has no scene, so it reads this. Undefined = normal compositing.
   */
  blend?: Exclude<BlendMode, 'normal'>;
}

/** The dumb draw vocabulary the framework renderer maps to SVG (content space).
 *  A CLOSED node (rect, ellipse, closed poly) takes the annotation's FILL colour;
 *  an open node (line, open poly — open arrows, butt, slash) is stroke-only. The
 *  stroke colour applies to every node. Closed-ness is the only fill signal. */
export type RenderNode =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'ellipse'; rect: Rect }
  | { kind: 'line'; a: Vec; b: Vec }
  | { kind: 'poly'; points: Vec[]; closed: boolean }
  // a precomputed closed path (cloudy border) — `d` is SVG data in content space
  | { kind: 'path'; d: string };

/**
 * How to paint one node. The pure core fills this in (per kind/subtype), and a
 * framework renderer applies it verbatim — so ALL appearance logic (markup fill vs
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
  cap?: 'round'; // stroke-linecap; omitted = the default butt. Round for freehand ink.
  join?: 'round'; // stroke-linejoin; omitted = the default miter. Round for freehand ink.
}

/**
 * A fully-painted draw node: geometry + paint. `scene(item)` returns these and a
 * per-framework painter maps each to ONE element, applying `paint` — the entire
 * surface a new framework renderer must implement. Supersedes the geometry-only
 * `RenderNode` for rendering; `geomScene` stays the internal geometry helper.
 */
export type SceneNode =
  | { kind: 'rect'; rect: Rect; paint: Paint }
  | { kind: 'ellipse'; rect: Rect; paint: Paint }
  | { kind: 'line'; a: Vec; b: Vec; paint: Paint }
  | { kind: 'poly'; points: Vec[]; closed: boolean; paint: Paint }
  | { kind: 'path'; d: string; paint: Paint }
  /** Painted (non-interactive) text — `at` is the BASELINE start point in
   *  content units. Editable text (free text) stays a framework element;
   *  this is for pure pixels, e.g. a redaction label preview. */
  | { kind: 'text'; at: Vec; text: string; fontSize: number; fontFamily?: string; paint: Paint };

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
  | { kind: 'obb'; corners: [Vec, Vec, Vec, Vec]; angle: number }
  // `rot` (deg, CW) tilts the handle glyph itself so it rides a rotated box.
  | { kind: 'handle'; at: Vec; cursor: Cursor; rot?: number }
  // The rotate knob: `at` is where the grab dot sits (hanging off the top edge),
  // `from` the edge anchor the connector stalk draws to.
  | { kind: 'rotate-knob'; at: Vec; from: Vec }
  // A live alignment guide (see `Guide`) — drawn while a snapped move is active.
  | { kind: 'guide'; axis: 'x' | 'y'; at: number; lo: number; hi: number }
  // The live rotation readout while a rotate gesture is active: `at` is the
  // pointer (content space), `angle` the selection's absolute angle (deg, CW).
  | { kind: 'angle-chip'; at: Vec; angle: number }
  // Rotation guides while a rotate gesture is active: finished line segments —
  // chords of the page through the pivot — so painters just draw. Two `axis`
  // lines (the fixed 0°/90° reference cross) + one `indicator` at the live
  // `angle` (the SAME snapped angle the chip shows and the commit applies).
  | {
      kind: 'rotate-guides';
      center: Vec;
      angle: number;
      lines: Array<{ a: Vec; b: Vec; role: 'axis' | 'indicator' }>;
    }
  | { kind: 'marquee'; rect: Rect };
