/**
 * What an annotation kind is: the shape of a kind declaration, and the
 * vocabulary it is written in (its capabilities and its sidebar fields).
 * Each kind is declared in its own file in this folder; `index.ts` lists
 * them all.
 */
import type { Annotation } from '@embedpdf/engine-core/runtime';

import type { ShapeFamily } from '../shapes';
import type { Style, TextStyle } from '../types';

/** The flags an annotation carries, each a `flag` property of every kind. */
export type FlagKey =
  | 'invisible'
  | 'hidden'
  | 'print'
  | 'noZoom'
  | 'noRotate'
  | 'noView'
  | 'readOnly'
  | 'locked'
  | 'toggleNoView'
  | 'lockedContents';

/**
 * One property a style panel edits, as a UI contract: which field, edited
 * with which control, labelled what by default. A panel switches on
 * `control` (or on `key`, for a richer editor of its own), reads
 * `values[property.key]` and writes `{ [property.key]: value }`, so each
 * kind's list is its property schema, kept in the library so every consumer
 * gets it for free.
 *
 * `key` is the engine's field name, with three exceptions: the border's
 * `borderStyle` reads and writes `borderStyle`, `dashArray` and
 * `cloudyIntensity` together; `bold`, `italic` and `underline` are the rich
 * body's formatting; and `link` is an attached link, not a field of the
 * annotation.
 *
 * `label` is a default (English) display name: apps with translations map
 * `key`s to their own strings and ignore it. Array order is display order.
 */
export type AnnotationProperty =
  | {
      readonly key: 'color' | 'interiorColor' | 'fontColor';
      readonly control: 'color';
      readonly label: string;
    }
  | {
      readonly key: 'opacity' | 'strokeWidth' | 'fontSize';
      readonly control: 'number';
      readonly label: string;
      readonly min: number;
      readonly max: number;
      readonly step: number;
    }
  /** The border over `borderStyle`, `dashArray` and `cloudyIntensity`;
   *  `cloudy` says whether this kind takes a cloudy border. */
  | {
      readonly key: 'borderStyle';
      readonly control: 'choice';
      readonly label: string;
      readonly options: readonly string[];
      readonly cloudy: boolean;
    }
  /** A value from a list: line endings, a font, an alignment, a blend mode, an icon. */
  | {
      readonly key: 'lineEndings' | 'fontFamily' | 'textAlign' | 'blendMode' | 'icon';
      readonly control: 'choice';
      readonly label: string;
      readonly options: readonly string[];
    }
  /** One of the annotation's flags, on or off. */
  | { readonly key: FlagKey; readonly control: 'flag'; readonly label: string }
  /** Free text, such as a redaction's label. */
  | { readonly key: 'overlayText'; readonly control: 'text'; readonly label: string }
  /** Bold, italic or underline of a text box: the body's formatting, or,
   *  while the text editor has a range, that range's runs. */
  | {
      readonly key: 'bold' | 'italic' | 'underline';
      readonly control: 'textFormat';
      readonly label: string;
      readonly format: 'bold' | 'italic' | 'underline';
    }
  /** Where it links to (a website or a page). Declared by the link kind (its
   *  own target) and by every kind that may carry an attached link; kinds
   *  that omit it (widgets, caret, redaction…) can't be links. */
  | { readonly key: 'link'; readonly control: 'link'; readonly label: string };

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
  /** Can be moved as part of a multi-target (group) transform. */
  groupMovable: boolean;
  /** Can be uniformly scaled as part of a multi-target (group) transform — on
   *  even for vertex kinds that have no single-shape box resize (their handles
   *  are the vertices; in a group they scale fine). */
  groupResizable: boolean;
  /** Can be rotated as part of a multi-target (group) transform. */
  groupRotatable: boolean;
  /** Carries editable text content (free text, the comment popup). */
  textEditable: boolean;
  /** Can carry a comment/note + threaded replies (`/Contents` + `/Popup`). */
  commentable: boolean;
  /** Has a popup as its primary surface (the comment/Text icon). */
  hasPopup: boolean;
  /** Bound to underlying text (markup, caret) — never freely moved/resized. */
  anchored: boolean;
  /** Paints with the page's text, beneath every other kind (text markup, redaction marks). */
  paintsBeneath: boolean;
  /** Has an interior fill (`/IC`). */
  hasFill: boolean;
  /** Has line endings (`/LE` — line, polyline). */
  hasEndings: boolean;
  /** Can take a cloudy border effect (`/BE` — shapes). */
  hasCloudy: boolean;
  /** The whole body is visible content, so hit-testing grabs anywhere inside
   *  the box (stamp images, note icons) — not just the stroke/fill like
   *  outline shapes. */
  opaqueBody: boolean;
  /** Its raster is its only drawing: the viewer draws none of it live (a
   *  stamp's image, a form widget, a link's border). */
  rasterOnly: boolean;
  /** The `/F` ReadOnly flag is ignored for this kind (ISO 32000: widgets — a
   *  ReadOnly form field must still be movable by a form designer; the
   *  form-filling layer enforces field ReadOnly itself). */
  ignoresReadOnly: boolean;
  /** Behaves as if `/F` NoZoom is always set (screen-constant size — the
   *  spec's rule for Text/note icons). See anchor.ts. */
  noZoom: boolean;
  /** Behaves as if `/F` NoRotate is always set (screen-upright — the spec's
   *  rule for Text/note icons). See anchor.ts. */
  noRotate: boolean;
}

/** No capability at all: a kind spreads this and turns on what it can do. */
export const NO_CAPS: KindCaps = {
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
  paintsBeneath: false,
  hasFill: false,
  hasEndings: false,
  hasCloudy: false,
  opaqueBody: false,
  rasterOnly: false,
  ignoresReadOnly: false,
  noZoom: false,
  noRotate: false,
};

/** One annotation kind: what it is, and what a user can do to it. */
export interface AnnotationKind {
  /** Its name: the PDF subtype, or a widget's field family (`widget-text`…). */
  readonly name: string;
  /**
   * The shape family that reads its shape off the annotation (`shapes/`).
   * The shape's family then hits, handles, moves and draws it.
   */
  readonly family: ShapeFamily;
  /**
   * How it is drawn: its colours, stroke and border, read off the annotation
   * with its kind's fill-ins (`styles.ts`).
   */
  readonly style: (annotation: Annotation) => Style;
  /**
   * How its text is set, for a kind with text: its font, size, colour and
   * alignment, read off the annotation (`texts.ts`).
   */
  readonly text?: (annotation: Annotation) => TextStyle;
  /** What a user can do to it. The annotation's `/F` flags override these at runtime (flags.ts). */
  readonly caps: KindCaps;
  /**
   * What a style panel edits, in display order, keyed by the engine's field
   * names. The flags every kind has are added by `propertiesOf`.
   */
  readonly properties: readonly AnnotationProperty[];
}

/**
 * Declares a kind. It returns the kind exactly as written: nothing is
 * registered and nothing is filled in. `index.ts` lists every kind.
 */
export const defineKind = <const Kind extends AnnotationKind>(kind: Kind): Kind => kind;
