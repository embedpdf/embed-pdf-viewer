/**
 * The annotation KIND table — the single declarative source for "what an
 * annotation of this subtype IS and what you can do to it". Pure DATA (no
 * closures), keyed by subtype, so it ports to Rust as a static table and replaces
 * the scattered `subtype`/`geom.t` switches and the old binary `EDITABLE_SUBTYPES`.
 *
 * Two layers meet here:
 *   • `variant` — which {@link Geom} primitive the kind renders/hit-tests as.
 *     Several subtypes share one (square+circle → `rect`, the markups → `quads`).
 *   • `caps` — ORTHOGONAL capability flags. "Editable" was one boolean that
 *     conflated selectable / movable / resizable / vertex-editable; splitting it
 *     is what lets text-markup be *selectable but not movable*, a note icon be
 *     *movable but not resizable*, and so on — without new code paths.
 *
 * Creation lives on TOOLS (a later layer), not here: many tools can target one
 * kind (ink vs ink-highlight, line vs arrow). A kind is the editing/identity
 * surface; a tool is the authoring surface.
 */
import type { Geom, Subtype } from './types';

/**
 * One editable property of a kind, as a UI contract: which {@link AnnotationProps}
 * key, rendered how (the union arm fixes the control + its constraints), labelled
 * what by default. A property sidebar is a `switch (spec.key)` over these — the
 * per-kind lists below are the v2 snippet's hand-rolled `TOOL_PROPERTIES` schema,
 * promoted into the library so every consumer gets it for free.
 *
 * `label` is a default (English) display name — apps with i18n map `key`s to
 * their own strings and ignore it. Array ORDER is display order.
 */
export type PropSpec =
  | { key: 'color'; label: string }
  | { key: 'interiorColor'; label: string }
  | { key: 'fontColor'; label: string }
  | { key: 'opacity'; label: string; min: number; max: number; step: number }
  | { key: 'strokeWidth'; label: string; min: number; max: number; step: number }
  | { key: 'fontSize'; label: string; min: number; max: number; step: number }
  /** Border style picker; `cloudy` says whether this kind honours a cloudy border. */
  | { key: 'border'; label: string; cloudy: boolean }
  | { key: 'lineEndings'; label: string }
  | { key: 'fontFamily'; label: string }
  | { key: 'textAlign'; label: string }
  | { key: 'blendMode'; label: string }
  /** `/Name` icon picker for icon kinds; `options` are the legal names. */
  | { key: 'icon'; label: string; options: readonly string[] }
  /** Measurement calibration editor (scale, unit, precision). Declared by the
   *  five geometry kinds that can BE a measurement; the control only shows for
   *  an annotation that actually carries one (`readProp` returns `undefined`
   *  otherwise), so an ordinary square's sidebar is unchanged. */
  | { key: 'measurement'; label: string }
  /** Link-target editor (URL / page destination). Declared by the link kind
   *  (its own target) and by every kind that may carry an ATTACHED link;
   *  kinds that omit it (widgets, caret, redact…) simply cannot be links —
   *  `applyProps` drops the key and menus never show the control. */
  | { key: 'link'; label: string };

/** Orthogonal capability flags. Static data — the annotation's `/F` flags are
 *  the runtime overrides (a locked annotation is never transformable, a hidden
 *  one never renders, regardless of these — see flags.ts). */
export interface KindCaps {
  /** Can be clicked to select. */
  selectable: boolean;
  /** Can be dragged (by its body) to translate. */
  movable: boolean;
  /** Exposes the 8 box resize handles (shapes). */
  resizable: boolean;
  /** Exposes per-vertex handles (line endpoints, polygon/polyline vertices). */
  vertexEditable: boolean;
  /** Can be rotated (shapes, free text, lines/polys/ink). */
  rotatable: boolean;
  /** Can be MOVED as part of a multi-target (group) transform. */
  groupMovable: boolean;
  /** Can be uniformly SCALED as part of a multi-target (group) transform — ON
   *  even for vertex kinds that have no single-shape box resize (their handles
   *  ARE the vertices; in a group they scale fine). */
  groupResizable: boolean;
  /** Can be ROTATED as part of a multi-target (group) transform. */
  groupRotatable: boolean;
  /** Carries editable text content (free text, the comment popup). */
  textEditable: boolean;
  /** Can carry a comment/note + threaded replies (`/Contents` + `/Popup`). */
  commentable: boolean;
  /** Has a popup as its primary surface (the comment/Text icon). */
  hasPopup: boolean;
  /** Bound to underlying text (markup, caret) — never freely moved/resized. */
  anchored: boolean;
  /** Has an interior fill (`/IC`). */
  hasFill: boolean;
  /** Has line endings (`/LE` — line, polyline). */
  hasEndings: boolean;
  /** Can take a cloudy border effect (`/BE` — shapes). */
  hasCloudy: boolean;
  /** The whole body is visible content, so hit-testing grabs anywhere inside
   *  the box (stamp images) — NOT just the stroke/fill like outline shapes. */
  opaqueBody: boolean;
  /** The `/F` ReadOnly flag is IGNORED for this kind (ISO 32000: widgets — a
   *  ReadOnly form FIELD must still be movable by a form designer; the
   *  form-filling layer enforces field ReadOnly itself). */
  ignoresReadOnly: boolean;
  /** Behaves as if `/F` NoZoom is always set (screen-constant size — the
   *  spec's rule for Text/note icons). See anchor.ts. */
  noZoom: boolean;
  /** Behaves as if `/F` NoRotate is always set (screen-upright — the spec's
   *  rule for Text/note icons). See anchor.ts. */
  noRotate: boolean;
}

export interface AnnotationKind {
  subtype: Subtype;
  /** Future: PDF `/IT` intent (free-text vs callout, caret insert vs replace). */
  intent?: string;
  variant: Geom['t'];
  caps: KindCaps;
  /** The kind's editable properties, in DISPLAY ORDER — the contract a property
   *  sidebar renders from (see {@link PropSpec}). Empty = nothing to edit. */
  props: PropSpec[];
}

/* Shared spec entries — plain data, spread into the per-kind lists below. */
const OPACITY: PropSpec = { key: 'opacity', label: 'Opacity', min: 0.1, max: 1, step: 0.05 };
const ICON_COLOR: PropSpec = { key: 'color', label: 'Color' };

/* `/Name` values per icon kind — mirrors the engine's NoteIcon /
 * FileAttachmentIcon unions (the appearance generator's vocabulary). */
const NOTE_ICONS = [
  'comment',
  'key',
  'note',
  'help',
  'new-paragraph',
  'paragraph',
  'insert',
] as const;
const FILE_ATTACHMENT_ICONS = ['push-pin', 'paperclip', 'graph', 'tag'] as const;
const STROKE: PropSpec = { key: 'color', label: 'Stroke' };
const FILL: PropSpec = { key: 'interiorColor', label: 'Fill' };
const STROKE_WIDTH: PropSpec = {
  key: 'strokeWidth',
  label: 'Stroke width',
  min: 0.5,
  max: 30,
  step: 0.5,
};
const BORDER_CLOUDY: PropSpec = { key: 'border', label: 'Border', cloudy: true };
const BORDER_PLAIN: PropSpec = { key: 'border', label: 'Border', cloudy: false };
const LINE_ENDINGS: PropSpec = { key: 'lineEndings', label: 'Line endings' };
const BLEND_MODE: PropSpec = { key: 'blendMode', label: 'Blend mode' };

/**
 * "This annotation links somewhere" — one spec, shared by every kind that can
 * carry an attached link (a grouped `/Link` child; see AnnotationProps.link).
 * Deliberately absent from: widget-* (a widget's `/A` is forms-plane
 * behavior, not an attached link), caret (an anchored edit marker),
 * file-attachment (its click means "open the attachment"), and redact.
 */
const LINKABLE: PropSpec = { key: 'link', label: 'Link' };
const MEASUREMENT: PropSpec = { key: 'measurement', label: 'Measurement' };

/** Shapes with a fill + a (possibly cloudy) border: square / circle / polygon. */
const SHAPE_PROPS: PropSpec[] = [
  STROKE,
  FILL,
  OPACITY,
  STROKE_WIDTH,
  BORDER_CLOUDY,
  MEASUREMENT,
  LINKABLE,
];

// Widget-plane styling: every family has a box; text-bearing families add
// the /DA vocabulary. Same flat keys as every other kind — the writer maps
// them onto /MK//BS//DA//Q underneath. One PDF subtype, several CLIENT
// kinds (the free-text/callout precedent): the field FAMILY picks the kind,
// so a radio never offers a font and the schema-driven sidebar needs no
// widget-specific code.
const WIDGET_BOX_PROPS: PropSpec[] = [
  { key: 'color', label: 'Border color' },
  { key: 'interiorColor', label: 'Background' },
  { key: 'strokeWidth', label: 'Border width', min: 0, max: 12, step: 0.5 },
  { key: 'border', label: 'Border style', cloudy: false },
];
const WIDGET_TEXT_PROPS: PropSpec[] = [
  ...WIDGET_BOX_PROPS,
  { key: 'fontFamily', label: 'Font' },
  { key: 'fontSize', label: 'Font size', min: 0, max: 96, step: 1 },
  { key: 'fontColor', label: 'Text color' },
  { key: 'textAlign', label: 'Alignment' },
];
/** Stroked vertex kinds with `/LE` endings: line / polyline. The fill colours a
 *  CLOSED ending (closed arrow / circle / square / diamond). */
const LINE_PROPS: PropSpec[] = [
  STROKE,
  FILL,
  OPACITY,
  STROKE_WIDTH,
  BORDER_PLAIN,
  LINE_ENDINGS,
  MEASUREMENT,
  LINKABLE,
];
/** Text markup: colour/opacity plus its appearance-stream blend mode. */
const MARK_PROPS: PropSpec[] = [{ key: 'color', label: 'Color' }, OPACITY, BLEND_MODE, LINKABLE];
/** Carets are anchored text-edit markers, without a blend-mode control. */
const CARET_PROPS: PropSpec[] = [{ key: 'color', label: 'Color' }, OPACITY];
const INK_PROPS: PropSpec[] = [
  { key: 'color', label: 'Color' },
  OPACITY,
  STROKE_WIDTH,
  BLEND_MODE,
  LINKABLE,
];
/** Redaction marks: outline at rest; the fill + label are what apply paints.
 *  Label size 0 = auto-fit to the region (the engine's convention). */
const REDACT_PROPS: PropSpec[] = [
  { key: 'color', label: 'Outline' },
  FILL,
  OPACITY,
  { key: 'fontFamily', label: 'Label font' },
  { key: 'fontSize', label: 'Label size', min: 0, max: 96, step: 1 },
  { key: 'fontColor', label: 'Label color' },
  { key: 'textAlign', label: 'Align' },
];
/** Free text: font first (the primary surface), then box background + border. */
const TEXT_PROPS: PropSpec[] = [
  { key: 'fontFamily', label: 'Font' },
  { key: 'fontSize', label: 'Font size', min: 4, max: 96, step: 1 },
  { key: 'fontColor', label: 'Text color' },
  { key: 'textAlign', label: 'Align' },
  OPACITY,
  { key: 'interiorColor', label: 'Background' },
  { key: 'color', label: 'Border' },
  { key: 'strokeWidth', label: 'Border width', min: 0, max: 12, step: 0.5 },
  LINKABLE,
];

/** Build caps from a sparse override — everything not named is `false`. */
const caps = (c: Partial<KindCaps>): KindCaps => ({
  selectable: false,
  movable: false,
  resizable: false,
  vertexEditable: false,
  rotatable: false,
  groupMovable: false,
  groupResizable: false,
  groupRotatable: false,
  textEditable: false,
  commentable: false,
  hasPopup: false,
  anchored: false,
  hasFill: false,
  hasEndings: false,
  hasCloudy: false,
  opaqueBody: false,
  ignoresReadOnly: false,
  noZoom: false,
  noRotate: false,
  ...c,
});

/** Read-only fallback for unknown/unsupported subtypes (render baked, no editing). */
const READONLY: KindCaps = caps({});

/** The built-in kinds. Shapes resize, lines/polys vertex-edit, markup is anchored
 *  (selectable + recolor/delete, never move/resize). */
export const KINDS: Record<string, AnnotationKind> = {
  'widget-text': {
    subtype: 'widget-text',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      groupMovable: true,
      hasFill: true,
      opaqueBody: true,
      ignoresReadOnly: true,
    }),
    props: WIDGET_TEXT_PROPS,
  },
  'widget-choice': {
    subtype: 'widget-choice',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      groupMovable: true,
      hasFill: true,
      opaqueBody: true,
      ignoresReadOnly: true,
    }),
    props: WIDGET_TEXT_PROPS,
  },
  'widget-button': {
    subtype: 'widget-button',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      groupMovable: true,
      hasFill: true,
      opaqueBody: true,
      ignoresReadOnly: true,
    }),
    props: WIDGET_TEXT_PROPS,
  },
  'widget-toggle': {
    subtype: 'widget-toggle',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      groupMovable: true,
      hasFill: true,
      opaqueBody: true,
      ignoresReadOnly: true,
    }),
    props: WIDGET_BOX_PROPS,
  },
  'widget-box': {
    subtype: 'widget-box',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      groupMovable: true,
      hasFill: true,
      opaqueBody: true,
      ignoresReadOnly: true,
    }),
    props: WIDGET_BOX_PROPS,
  },
  'free-text': {
    subtype: 'free-text',
    variant: 'text',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true, // the box resizes (8 handles); text reflows
      rotatable: true,
      groupMovable: true,
      groupResizable: true,
      groupRotatable: true,
      textEditable: true,
      commentable: true,
      hasFill: true, // `/C` box background
    }),
    props: TEXT_PROPS,
  },
  square: {
    subtype: 'square',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      rotatable: true,
      groupMovable: true,
      groupResizable: true,
      groupRotatable: true,
      commentable: true,
      hasFill: true,
      hasCloudy: true,
    }),
    props: SHAPE_PROPS,
  },
  circle: {
    subtype: 'circle',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      rotatable: true,
      groupMovable: true,
      groupResizable: true,
      groupRotatable: true,
      commentable: true,
      hasFill: true,
      hasCloudy: true,
    }),
    props: SHAPE_PROPS,
  },
  line: {
    subtype: 'line',
    variant: 'line',
    caps: caps({
      selectable: true,
      movable: true,
      vertexEditable: true,
      rotatable: true,
      groupMovable: true,
      groupResizable: true,
      groupRotatable: true,
      commentable: true,
      hasEndings: true,
    }),
    props: LINE_PROPS,
  },
  polygon: {
    subtype: 'polygon',
    variant: 'poly',
    caps: caps({
      selectable: true,
      movable: true,
      vertexEditable: true,
      rotatable: true,
      groupMovable: true,
      groupResizable: true,
      groupRotatable: true,
      commentable: true,
      hasFill: true,
      hasCloudy: true,
    }),
    props: SHAPE_PROPS,
  },
  polyline: {
    subtype: 'polyline',
    variant: 'poly',
    caps: caps({
      selectable: true,
      movable: true,
      vertexEditable: true,
      rotatable: true,
      groupMovable: true,
      groupResizable: true,
      groupRotatable: true,
      commentable: true,
      hasEndings: true,
    }),
    props: LINE_PROPS,
  },
  // Ink: freehand strokes. Selectable + movable as a whole; no single-shape
  // resize/vertex handles (the strokes are the geometry), but rotatable and
  // group-resizable. Created by a freehand drag.
  ink: {
    subtype: 'ink',
    variant: 'ink',
    caps: caps({
      selectable: true,
      movable: true,
      rotatable: true,
      groupMovable: true,
      groupResizable: true,
      groupRotatable: true,
      commentable: true,
    }),
    props: INK_PROPS,
  },
  // Text markup: selectable + anchored (bound to text — recolor/delete, never
  // move/resize). Created from a text selection, not a drag (see the markup tool).
  highlight: {
    subtype: 'highlight',
    variant: 'quads',
    caps: caps({ selectable: true, anchored: true, commentable: true }),
    props: MARK_PROPS,
  },
  underline: {
    subtype: 'underline',
    variant: 'quads',
    caps: caps({ selectable: true, anchored: true, commentable: true }),
    props: MARK_PROPS,
  },
  squiggly: {
    subtype: 'squiggly',
    variant: 'quads',
    caps: caps({ selectable: true, anchored: true, commentable: true }),
    props: MARK_PROPS,
  },
  strikeout: {
    subtype: 'strikeout',
    variant: 'quads',
    caps: caps({ selectable: true, anchored: true, commentable: true }),
    props: MARK_PROPS,
  },
  // Redaction mark (the non-destructive stage of the two-stage model): created
  // from a text selection (per-line quads) OR an area drag (rect-only geometry).
  // Text marks are anchored like markup; area marks move/resize — the
  // anchored+quads transform gate in hit.ts lets one caps set serve both
  // geometries.
  redact: {
    subtype: 'redact',
    variant: 'quads',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      anchored: true,
      commentable: true,
      hasFill: true,
    }),
    props: REDACT_PROPS,
  },
  caret: {
    subtype: 'caret',
    variant: 'caret',
    caps: caps({ selectable: true, anchored: true, commentable: true }),
    props: CARET_PROPS,
  },
  // Sticky note ("comment"): a fixed 20x20 icon whose visual is the
  // engine-baked /AP (generated from /C + /Name). Screen-constant and
  // screen-upright per the spec's Text-icon rule (noZoom/noRotate); its
  // popup thread is the primary surface once comments land.
  text: {
    subtype: 'text',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      groupMovable: true,
      commentable: true,
      hasPopup: true,
      opaqueBody: true,
      noZoom: true,
      noRotate: true,
    }),
    props: [{ key: 'icon', label: 'Icon', options: NOTE_ICONS }, ICON_COLOR, OPACITY, LINKABLE],
  },
  // File attachment: the same fixed-icon shape as the note, but its primary
  // surface is the embedded FILE (open/download), not a popup.
  'file-attachment': {
    subtype: 'file-attachment',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      groupMovable: true,
      commentable: true,
      opaqueBody: true,
      noZoom: true,
      noRotate: true,
    }),
    props: [{ key: 'icon', label: 'Icon', options: FILE_ATTACHMENT_ICONS }, ICON_COLOR, OPACITY],
  },
  // Stamp: a rect-variant kind whose visual is ALWAYS the engine-baked /AP
  // (image or vector appearance authored at create time) — never a vector
  // re-render, so it declares no editable style props. Geometry edits
  // (move/resize/rotate) re-fit the appearance natively on the engine side.
  stamp: {
    subtype: 'stamp',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      rotatable: true,
      groupMovable: true,
      groupResizable: true,
      groupRotatable: true,
      commentable: true,
      opaqueBody: true,
    }),
    props: [LINKABLE],
  },
  // Link: an invisible hit rectangle that navigates somewhere. Paints nothing
  // of its own (scene() skips it; any /AP a PDF baked shows via the page
  // raster); `opaqueBody` gives whole-box hit-testing so the invisible rect
  // is grabbable when the link tool makes it editable. Its `link` prop is
  // its OWN target (`/A`) — the one kind where the key doesn't route to an
  // attached child. No rotate: a link has no reading orientation.
  link: {
    subtype: 'link',
    variant: 'rect',
    caps: caps({
      selectable: true,
      movable: true,
      resizable: true,
      groupMovable: true,
      opaqueBody: true,
    }),
    props: [LINKABLE],
  },
};

/** The capabilities of a subtype, or the read-only default for unknown kinds. */
export const capsFor = (subtype: string): KindCaps => KINDS[subtype]?.caps ?? READONLY;

const NO_PROPS: PropSpec[] = [];

/** A kind's editable properties in display order — empty for unknown kinds.
 *  Stable references, so selectors can compare by identity. */
export const propsFor = (subtype: string): PropSpec[] => KINDS[subtype]?.props ?? NO_PROPS;

/** A text-markup kind (highlight/underline/squiggly/strikeout). These are drawn
 *  on the text layer, which always sits beneath every other annotation. */
export const isMarkup = (subtype: string): boolean => KINDS[subtype]?.variant === 'quads';
