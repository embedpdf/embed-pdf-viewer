/**
 * What an annotation kind is: the shape of a kind declaration, and the
 * vocabulary it is written in (its capabilities and its sidebar fields).
 * Each kind is declared in its own file in this folder; `index.ts` lists
 * them all.
 */
import type { ModelGeometry } from '../types';

/**
 * One editable field of a kind, as a UI contract: which engine field, rendered
 * how (the union arm fixes the control and its constraints), labelled what by
 * default. A property sidebar is a `switch (field.key)` over these; it reads
 * `values[field.key]` and writes `{ [field.key]: value }`, so each kind's
 * list is its property schema, kept in the library so every consumer gets it
 * for free.
 *
 * `key` is the engine's field name, with three exceptions: the border picker
 * reads and writes `borderStyle`, `dashArray` and `cloudyIntensity` together;
 * `bold`, `italic` and `underline` are the rich body's formatting; and `link`
 * is an attached link, not a field of the annotation.
 *
 * `label` is a default (English) display name — apps with i18n map `key`s to
 * their own strings and ignore it. Array order is display order.
 */
export type FieldSpec =
  | { key: 'color'; label: string }
  | { key: 'interiorColor'; label: string }
  | { key: 'fontColor'; label: string }
  | { key: 'opacity'; label: string; min: number; max: number; step: number }
  | { key: 'strokeWidth'; label: string; min: number; max: number; step: number }
  | { key: 'fontSize'; label: string; min: number; max: number; step: number }
  /** Border picker over `borderStyle`, `dashArray` and `cloudyIntensity`;
   *  `cloudy` says whether this kind takes a cloudy border. */
  | { key: 'borderStyle'; label: string; cloudy: boolean }
  | { key: 'lineEndings'; label: string }
  | { key: 'fontFamily'; label: string }
  | { key: 'textAlign'; label: string }
  /** Rich-text formatting toggles (free text): the body's formatting, or —
   *  while the text editor has a range — that range's runs. */
  | { key: 'bold'; label: string }
  | { key: 'italic'; label: string }
  | { key: 'underline'; label: string }
  | { key: 'blendMode'; label: string }
  /** `/Name` icon picker for icon kinds; `options` are the legal names. */
  | { key: 'icon'; label: string; options: readonly string[] }
  /** Link-target editor (URL / page destination). Declared by the link kind
   *  (its own target) and by every kind that may carry an attached link;
   *  kinds that omit it (widgets, caret, redact…) simply cannot be links —
   *  menus never show the control. */
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
  /** Has an interior fill (`/IC`). */
  hasFill: boolean;
  /** Has line endings (`/LE` — line, polyline). */
  hasEndings: boolean;
  /** Can take a cloudy border effect (`/BE` — shapes). */
  hasCloudy: boolean;
  /** The whole body is visible content, so hit-testing grabs anywhere inside
   *  the box (stamp images) — not just the stroke/fill like outline shapes. */
  opaqueBody: boolean;
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
  hasFill: false,
  hasEndings: false,
  hasCloudy: false,
  opaqueBody: false,
  ignoresReadOnly: false,
  noZoom: false,
  noRotate: false,
};

/** One annotation kind: what it is, and what a user can do to it. */
export interface AnnotationKind {
  /** Its name: the PDF subtype, or a widget's field family (`widget-text`…). */
  readonly name: string;
  /**
   * The shape family its geometry belongs to (`shapes/`): how it is read
   * from the annotation, hit, handled, moved and drawn.
   */
  readonly family: ModelGeometry['kind'];
  /** What a user can do to it. The annotation's `/F` flags override these at runtime (flags.ts). */
  readonly caps: KindCaps;
  /** What a sidebar edits, in display order, keyed by the engine's field names. */
  readonly fields: readonly FieldSpec[];
}

/**
 * Declares a kind. It returns the kind exactly as written: nothing is
 * registered and nothing is filled in. `index.ts` lists every kind.
 */
export const defineKind = <const Kind extends AnnotationKind>(kind: Kind): Kind => kind;
