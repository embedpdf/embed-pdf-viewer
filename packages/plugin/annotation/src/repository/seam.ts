/**
 * The geometry/colour/rotation SEAM between the engine's PDF-space wire
 * vocabulary and the core's content-space model. Every conversion between the
 * two worlds lives here — kind modules speak through these helpers and never
 * hand-roll a convention flip.
 */
import type {
  AnnotationDTO,
  AnnotationRef,
  Color,
  PdfLinkTarget,
  PdfLinkTargetWritable,
  PdfRect,
  PdfRectDifferences,
  StandardFont,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';
import {
  contentToPdfRect,
  normalizeDeg,
  pdfToContentRect,
  rotatedAabb,
  type AnnotationPropsPatch,
  type Border,
  type Geom,
  type Rect,
  type Style,
} from '@embedpdf/core-annotation';

// The content↔PDF bridge, re-exported so kind modules cross the seam through
// ONE import point and never reach into the core's geometry directly.
export {
  contentToPdfPoint,
  contentToPdfRect,
  pdfToContentPoint,
  pdfToContentRect,
} from '@embedpdf/core-annotation';

export function refKey(ref: AnnotationRef): string {
  return ref.kind === 'objectNumber'
    ? `obj:${ref.annotObjectNumber}`
    : ref.kind === 'nm'
      ? `nm:${ref.nm}`
      : `idx:${ref.pageObjectNumber}:${ref.index}`;
}

/* ── colour seam (engine Color ↔ CSS hex) ─────────────────────────────────── */

const h2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
export const colorToCss = (c: Color): string => `#${h2(c.r)}${h2(c.g)}${h2(c.b)}`;
export function cssToColor(css: string): Color {
  const s = css.trim();
  const m6 = /^#?([0-9a-f]{6})$/i.exec(s);
  if (m6) {
    const n = parseInt(m6[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m3 = /^#?([0-9a-f]{3})$/i.exec(s);
  if (m3) {
    const [a, b, c] = m3[1];
    return { r: parseInt(a + a, 16), g: parseInt(b + b, 16), b: parseInt(c + c, 16) };
  }
  return { r: 0, g: 0, b: 0 };
}

/* ── rotation seam (CW content ↔ PDF convention) ──────────────────────────────
 * The model's `rot` is CLOCKWISE in content space (y-down). PDF user space is
 * y-up, so the y-flip at this boundary turns a CW content tilt into a CCW PDF
 * tilt of the same magnitude — i.e. the stored `/EMBD_Metadata/Rotation` is the
 * NEGATION (mod 360). This is the ONE place the convention is converted; every
 * layer above speaks CW-content and the engine/PDFium speaks the PDF angle.
 */
export const toPdfRotation = (rotCW: number): number => normalizeDeg(-rotCW);
export const fromPdfRotation = (rotPdf: number): number => normalizeDeg(-rotPdf);

/** Advisory `rot` for a vertex geom, from a DTO's (PDF-convention) `rotation`.
 *  Absent → no `rot` key (kept off the geom so unrotated shapes stay clean). */
export const rotFromDTO = (rotation?: number): { rot?: number } =>
  rotation ? { rot: fromPdfRotation(rotation) } : {};

/**
 * Geometry/rotation fields for a BOX kind (square/circle/plain free-text). The
 * model's `rect` is the UNROTATED logical box and `rot` the applied tilt, so:
 *  - rot == 0 → `/Rect` IS the box; the transform pair is stated as `null`
 *    (TOTAL projection — the engine's tri-state writes preserve omissions, so
 *    an omitted field would keep a stale rotation instead of flattening it).
 *  - rot != 0 → `/Rect` is the rotated visual AABB (PDFium clips the baked /AP
 *    to it), `unrotatedRect` the logical box, `rotation` the PDF angle.
 */
export function boxGeomFields(
  rect: Rect,
  rot: number,
  crop: PdfRect,
): { rect: PdfRect; unrotatedRect: PdfRect | null; rotation: number | null } {
  if (!rot) return { rect: contentToPdfRect(rect, crop), rotation: null, unrotatedRect: null };
  return {
    rect: contentToPdfRect(rotatedAabb(rect, rot), crop),
    unrotatedRect: contentToPdfRect(rect, crop),
    rotation: toPdfRotation(rot),
  };
}

/** A box geom (square/circle/stamp) from its DTO: when rotated, the LOCAL box
 *  is the stored `unrotatedRect` (the AABB `/Rect` is the rendered envelope)
 *  and `rot` the converted tilt; unrotated, `/Rect` IS the box. */
export function boxGeomFromDTO(
  dto: { rect: PdfRect },
  rotation: number | undefined,
  unrotatedRect: PdfRect | undefined,
  crop: PdfRect,
  ellipse: boolean,
): Geom {
  const rot = rotation ? fromPdfRotation(rotation) : 0;
  const box = rot && unrotatedRect ? unrotatedRect : dto.rect;
  return { t: 'rect', rect: pdfToContentRect(box, crop), ellipse, ...(rot ? { rot } : {}) };
}

/** Inset a PdfRect by a `/RD` (PDF user space, y-up: all four are non-negative
 *  insets from the matching `/Rect` edge). Used to recover the callout text box. */
export const insetPdfRectByRD = (r: PdfRect, rd?: PdfRectDifferences | null): PdfRect =>
  rd
    ? {
        left: r.left + rd.left,
        bottom: r.bottom + rd.bottom,
        right: r.right - rd.right,
        top: r.top - rd.top,
      }
    : r;

/** Engine border fields (`/BS /S`, `/BS /D`, `/BE /I`) → the `Border` union. A
 *  cloudy effect wins over the underlying border style (which stays solid). */
export function borderFromDTO(d: {
  borderStyle?: string;
  dashArray?: number[];
  cloudyIntensity?: number | null;
}): Border {
  if ((d.cloudyIntensity ?? 0) > 0) return { kind: 'cloudy', intensity: d.cloudyIntensity! };
  if (d.borderStyle === 'dashed')
    return { kind: 'dashed', dash: d.dashArray?.length ? d.dashArray : [3, 3] };
  return { kind: 'solid' };
}

/** The writable projection of a `link` value: `goto`/`uri` pass through,
 *  read-only arms (`javascript`, `named`, `goto-remote`, `launch`,
 *  `unsupported`) yield `null` — they can be carried, never (re)written. */
export function writableTarget(t: PdfLinkTarget | null | undefined): PdfLinkTargetWritable | null {
  return t && (t.kind === 'goto' || t.kind === 'uri') ? t : null;
}

export const TEXT_MARKUP = new Set(['highlight', 'underline', 'squiggly', 'strikeout']);
// Geometric kinds that carry the `/C` stroke colour + `/BS` border. Ink belongs
// here too (it has a stroke but no `/IC`, so its interiorColor reads back null).
const STROKE_KINDS = new Set(['square', 'circle', 'line', 'polygon', 'polyline', 'ink']);

/** Engine DTO → content-space `Style` (CSS colours, `Border` union). Exported so
 *  selection-aware UIs can read display values straight off a {@link AnnotationDTO}
 *  without re-deriving the colour/border mapping. */
export function styleFromDTO(dto: AnnotationDTO): Style {
  if (dto.subtype === 'widget') {
    return {
      color: dto.color ? colorToCss(dto.color) : '#1a1a1a',
      interiorColor: dto.interiorColor ? colorToCss(dto.interiorColor) : null,
      strokeWidth: dto.strokeWidth,
      opacity: 1,
      blendMode: dto.blendMode,
      border: dto.borderStyle === 'dashed' ? { kind: 'dashed', dash: [3, 3] } : { kind: 'solid' },
    };
  }
  if (STROKE_KINDS.has(dto.subtype)) {
    const d = dto as Extract<
      AnnotationDTO,
      { interiorColor: Color | null; opacity: number; strokeWidth: number }
    >;
    return {
      color: colorToCss(d.color),
      interiorColor: d.interiorColor ? colorToCss(d.interiorColor) : null,
      strokeWidth: d.strokeWidth,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: borderFromDTO(d),
    };
  }
  if (TEXT_MARKUP.has(dto.subtype)) {
    const d = dto as Extract<AnnotationDTO, { color: Color }>;
    return {
      color: colorToCss(d.color),
      interiorColor: null,
      strokeWidth: 0,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'caret') {
    const d = dto as Extract<AnnotationDTO, { color: Color; opacity: number }>;
    return {
      color: colorToCss(d.color),
      interiorColor: null,
      strokeWidth: 1,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'free-text') {
    // `/DA` colour is the border + leader stroke; `/C` is the box background; `/BS`
    // gives the width. A plain text box draws no vector scene, so these only matter
    // for a callout's leader/arrow/box-border (and the style toolbar's readout).
    const d = dto as Extract<AnnotationDTO, { subtype: 'free-text' }>;
    return {
      color: colorToCss(d.color),
      interiorColor: d.interiorColor ? colorToCss(d.interiorColor) : null,
      strokeWidth: d.strokeWidth,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: borderFromDTO(d),
    };
  }
  if (dto.subtype === 'redact') {
    // `/C` is the marking-stage outline; `/IC` the fill painted on apply.
    // No `/BS` on redact — the outline weight is a client rendering choice.
    const d = dto as Extract<AnnotationDTO, { subtype: 'redact' }>;
    return {
      color: colorToCss(d.color),
      interiorColor: d.interiorColor ? colorToCss(d.interiorColor) : null,
      strokeWidth: 1.5,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'text' || dto.subtype === 'file-attachment') {
    // Icon kinds: /C is the icon fill, /CA its opacity — no stroke/fill split.
    const d = dto as Extract<AnnotationDTO, { color: Color; opacity: number }>;
    return {
      color: colorToCss(d.color),
      interiorColor: null,
      strokeWidth: 1,
      opacity: d.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  return {
    color: '#444444',
    interiorColor: null,
    strokeWidth: 1,
    opacity: 1,
    blendMode: dto.blendMode,
    border: { kind: 'solid' },
  };
}

/**
 * The flat props vocabulary (CSS colours, house keys) → the engine's widget
 * appearance for `doc.forms` authoring — the SAME mapping the widget patch
 * lowering uses, exported as a boundary utility so the form plugin can style
 * `placeField` from a tool's `currentDefaults` without growing a second CSS
 * parser. Absent keys stay absent (the engine writes nothing for them).
 */
export function widgetAppearanceFromProps(props: AnnotationPropsPatch): WidgetAppearance {
  return {
    ...(props.color !== undefined ? { color: cssToColor(props.color) } : {}),
    ...(props.interiorColor !== undefined
      ? { interiorColor: props.interiorColor ? cssToColor(props.interiorColor) : null }
      : {}),
    ...(props.strokeWidth !== undefined ? { strokeWidth: props.strokeWidth } : {}),
    ...(props.border !== undefined
      ? { borderStyle: props.border.kind === 'dashed' ? ('dashed' as const) : ('solid' as const) }
      : {}),
    ...(props.fontFamily !== undefined ? { fontFamily: props.fontFamily as StandardFont } : {}),
    ...(props.fontSize !== undefined ? { fontSize: props.fontSize } : {}),
    ...(props.fontColor !== undefined ? { fontColor: cssToColor(props.fontColor) } : {}),
    ...(props.textAlign !== undefined ? { textAlign: props.textAlign } : {}),
  };
}
