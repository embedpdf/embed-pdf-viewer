/**
 * Wire-stable annotation primitives that are NOT pure geometry.
 *
 * Geometry primitives (points, rects, sizes, quads, rotation) now live in
 * `../geometry` as the canonical `Pdf*` vocabulary. The aliases below are
 * TRANSITIONAL re-exports kept only so existing consumers keep compiling
 * during the geometry consolidation; new code should import `Pdf*` directly
 * from `../geometry`.
 *
 * These do not depend on PDFium or any browser/Node surface; they are
 * the lingua franca between local engine, cloud engine, and server.
 */

import type { PdfPoint, PdfRect, PdfRotation, PdfSize } from '../geometry/primitives';

/** @deprecated Use `PdfPoint` from `../geometry`. */
export type Point = PdfPoint;
/** @deprecated Use `PdfRect` from `../geometry`. */
export type Rect = PdfRect;
/** @deprecated Use `PdfSize` from `../geometry`. */
export type Size = PdfSize;
/** @deprecated Use `PdfRotation` from `../geometry`. */
export type Rotation = PdfRotation;

/**
 * sRGB color. Components are 0..255 integers. Engines normalize PDFium's
 * device color space into sRGB at read time.
 *
 * Colour carries NO alpha: annotation transparency is a separate concern
 * stored in `/CA` and surfaced as the `opacity` style field, so there is a
 * single source of truth for transparency. See `ColorStyleFields.opacity`.
 */
export interface Color {
  r: number;
  g: number;
  b: number;
}

/**
 * /LE entries (line endings). Maps PDFium FPDFAnnot_GetLineEndings codes
 * onto the spec names. We use kebab-case so the wire format is stable
 * across language ports.
 */
export type LineEnding =
  | 'none'
  | 'square'
  | 'circle'
  | 'diamond'
  | 'open-arrow'
  | 'closed-arrow'
  | 'butt'
  | 'r-open-arrow'
  | 'r-closed-arrow'
  | 'slash';

/**
 * The `/LE` pair carried by line and polyline annotations: the ending
 * drawn at the start point and the ending drawn at the end point.
 */
export interface LineEndings {
  start: LineEnding;
  end: LineEnding;
}

/**
 * The 14 standard PDF fonts a free-text annotation's `/DA` can name. We use
 * kebab-case so the wire format is stable across language ports; the engine
 * maps these onto PDFium's `FPDF_STANDARD_FONT` integer codes at write time.
 */
export type StandardFont =
  | 'courier'
  | 'courier-bold'
  | 'courier-bold-oblique'
  | 'courier-oblique'
  | 'helvetica'
  | 'helvetica-bold'
  | 'helvetica-bold-oblique'
  | 'helvetica-oblique'
  | 'times-roman'
  | 'times-bold'
  | 'times-bold-italic'
  | 'times-italic'
  | 'symbol'
  | 'zapf-dingbats';

/**
 * Font selector for a free-text annotation: either one of the 14 PDF
 * {@link StandardFont} names, or the `key` of a font registered through
 * `engine.fonts` (local/WASM engine only).
 *
 * The `(string & {})` arm keeps the standard-font literals auto-completing
 * while still accepting any registered key. Because the standard names are
 * matched first at write time, those 14 names are reserved: don't register a
 * custom font under a key like `'helvetica'`.
 */
export type FreeTextFont = StandardFont | (string & {});

/**
 * Horizontal text alignment (`/Q`) for free-text annotations. Maps onto the
 * ISO 32000 §12.7.3.3 quadding codes 0/1/2 at write time.
 */
export type TextAlignment = 'left' | 'center' | 'right';

/**
 * Free-text `/IT` intent. `free-text` is a plain text box; `free-text-callout`
 * adds a `/CL` leader line pointing at the called-out region.
 */
export type FreeTextIntent = 'free-text' | 'free-text-callout';

/** Caret `/IT` intent used by an Acrobat-compatible replace-text edit. */
export type CaretIntent = 'replace';

/** Strikeout `/IT` intent used by the subordinate part of a replace-text edit. */
export type StrikeoutIntent = 'strikeout-text-edit';

/** Ink `/IT` intent used by an Acrobat-compatible freehand highlighter. */
export type InkIntent = 'ink-highlight';

/**
 * Effective blend mode of an annotation's normal appearance stream (`/AP /N`).
 * Values use CSS-compatible kebab-case so the wire vocabulary is portable; the
 * engine maps them onto PDFium's `FPDF_BLENDMODE` integer codes.
 */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/**
 * Border/line style for shape annotations — the `/BS /S` (border style)
 * subset PDFium can author. Maps onto the ISO 32000 §8.4.3.3 border style
 * names. Cloudy borders are a SEPARATE concern (`/BE` border effect),
 * surfaced as `cloudyIntensity` on the shape DTO, not as a border style.
 *
 * kebab-/lower-case so the wire format is stable across language ports;
 * the engine maps these onto PDFium's integer codes at write time.
 */
export type AnnotationBorderStyle = 'solid' | 'dashed' | 'beveled' | 'inset';

/**
 * `/RD` (rectangle differences) for shape annotations — the four margins,
 * in PDF points, between the annotation `/Rect` and the geometry actually
 * drawn inside it. Used so a thick/cloudy border has room to render
 * without being clipped by the `/Rect`. y-up PDF user space, so each value
 * is a non-negative inset from the corresponding `/Rect` edge.
 */
export interface PdfRectDifferences {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The `/RT` (reply type) relationship an annotation declares toward the
 * annotation its `/IRT` points at (ISO 32000 §12.5.6.2). Wire-stable
 * kebab/lower-case strings; the engine maps these onto PDFium's
 * `FPDF_ANNOT_REPLY_TYPE` integer codes at read/write time.
 *
 *   'reply' -> `/R`     a comment-thread reply (the ISO default when
 *                       `/IRT` is present but `/RT` is absent).
 *   'group' -> `/Group` a subordinate part of one logical annotation
 *                       group (e.g. the Caret of a text-edit pair).
 */
export type AnnotationReplyType = 'reply' | 'group';

/**
 * Bitset wrapper for the `/F` (Annotation Flags) PDF entry. We expose each
 * bit as its own boolean so callers don't have to know the bit positions.
 */
export interface AnnotationFlags {
  invisible: boolean;
  hidden: boolean;
  print: boolean;
  noZoom: boolean;
  noRotate: boolean;
  noView: boolean;
  readOnly: boolean;
  locked: boolean;
  toggleNoView: boolean;
  lockedContents: boolean;
}

export const NO_ANNOTATION_FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: false,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};
