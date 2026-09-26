/**
 * The geometry/colour/rotation seam between the engine's PDF-space wire
 * vocabulary and the core's content-space model. Every conversion between the
 * two worlds lives here — kind modules speak through these helpers and never
 * hand-roll a convention flip.
 */
import {
  contentToPdfRect,
  FLAG_KEYS,
  normalizeDeg,
  pdfToContentRect,
  rotatedAabb,
  type AnnotationPropsPatch,
  type Border,
  type ContentGeometry,
  type Rect,
  type Style,
} from '@embedpdf/core-annotation';
import type {
  AnnotationDTO,
  AnnotationFlags,
  AnnotationRef,
  Color,
  PdfLinkTarget,
  PdfLinkTargetWritable,
  PdfRect,
  PdfRectDifferences,
  StandardFont,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';

// The content↔PDF bridge, re-exported so kind modules cross the seam through
// one import point and never reach into the core's geometry directly.
export {
  contentToPdfPoint,
  contentToPdfRect,
  pdfToContentPoint,
  pdfToContentRect,
} from '@embedpdf/core-annotation';

// The one annotation key (engine-core `annotationKey`): obj:<n> | nm:<page>:<name> | idx:<page>:<i>.
export { annotationKey } from '@embedpdf/core';

/* ── colour seam (engine Color ↔ CSS hex) ─────────────────────────────────── */

const h2 = (channel: number) =>
  Math.max(0, Math.min(255, Math.round(channel)))
    .toString(16)
    .padStart(2, '0');
export const colorToCss = (color: Color): string => `#${h2(color.r)}${h2(color.g)}${h2(color.b)}`;
export function cssToColor(css: string): Color {
  const trimmed = css.trim();
  const m6 = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  if (m6) {
    const packed = parseInt(m6[1], 16);
    return { r: (packed >> 16) & 255, g: (packed >> 8) & 255, b: packed & 255 };
  }
  const m3 = /^#?([0-9a-f]{3})$/i.exec(trimmed);
  if (m3) {
    const [red, green, blue] = m3[1];
    return {
      r: parseInt(red + red, 16),
      g: parseInt(green + green, 16),
      b: parseInt(blue + blue, 16),
    };
  }
  return { r: 0, g: 0, b: 0 };
}

/* ── rotation seam (CW content ↔ PDF convention) ──────────────────────────────
 * The model's `rot` is clockwise in content space (y-down). PDF user space is
 * y-up, so the y-flip at this boundary turns a CW content tilt into a CCW PDF
 * tilt of the same magnitude — i.e. the stored `/EMBD_Metadata/Rotation` is the
 * negation (mod 360). This is the one place the convention is converted; every
 * layer above speaks CW-content and the engine/PDFium speaks the PDF angle.
 */
export const toPdfRotation = (rotCW: number): number => normalizeDeg(-rotCW);
export const fromPdfRotation = (rotPdf: number): number => normalizeDeg(-rotPdf);

/** Advisory `rot` for a vertex geom, from a DTO's (PDF-convention) `rotation`.
 *  Absent → no `rot` key (kept off the geom so unrotated shapes stay clean). */
/** The `/F` flags of a read, as the model's one flag set. */
export function flagsOf(dto: AnnotationFlags): AnnotationFlags {
  return Object.fromEntries(FLAG_KEYS.map((key) => [key, dto[key]])) as unknown as AnnotationFlags;
}

export const rotFromDTO = (rotation?: number | null): { rot?: number } =>
  rotation ? { rot: fromPdfRotation(rotation) } : {};

/**
 * Geometry/rotation fields for a box kind (square/circle/plain free-text). The
 * model's `rect` is the unrotated logical box and `rot` the applied tilt, so:
 *  - rot == 0 → `/Rect` is the box; the transform pair is stated as `null`
 *    (total projection — the engine's tri-state writes preserve omissions, so
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

/** A box geom (square/circle/stamp) from its DTO: when rotated, the local box
 *  is the stored `unrotatedRect` (the AABB `/Rect` is the rendered envelope)
 *  and `rot` the converted tilt; unrotated, `/Rect` is the box. */
export function boxGeomFromDTO(
  dto: { rect: PdfRect },
  rotation: number | undefined,
  unrotatedRect: PdfRect | undefined,
  crop: PdfRect,
  ellipse: boolean,
): ContentGeometry {
  const rot = rotation ? fromPdfRotation(rotation) : 0;
  const box = rot && unrotatedRect ? unrotatedRect : dto.rect;
  return { kind: 'rect', rect: pdfToContentRect(box, crop), ellipse, ...(rot ? { rot } : {}) };
}

/** Inset a PdfRect by a `/RD` (PDF user space, y-up: all four are non-negative
 *  insets from the matching `/Rect` edge). Recovers the callout text box. */
export const insetPdfRectByRD = (rect: PdfRect, rd?: PdfRectDifferences | null): PdfRect =>
  rd
    ? {
        left: rect.left + rd.left,
        bottom: rect.bottom + rd.bottom,
        right: rect.right - rd.right,
        top: rect.top - rd.top,
      }
    : rect;

/** Engine border fields (`/BS /S`, `/BS /D`, `/BE /I`) → the `Border` union. A
 *  cloudy effect wins over the underlying border style (which stays solid). */
export function borderFromDTO(dto: {
  borderStyle?: string;
  dashArray?: number[] | null;
  cloudyIntensity?: number | null;
}): Border {
  if ((dto.cloudyIntensity ?? 0) > 0) return { kind: 'cloudy', intensity: dto.cloudyIntensity! };
  if (dto.borderStyle === 'dashed')
    return { kind: 'dashed', dash: dto.dashArray?.length ? dto.dashArray : [3, 3] };
  return { kind: 'solid' };
}

/** The writable projection of a `link` value: `goto`/`uri` pass through,
 *  read-only arms (`javascript`, `named`, `goto-remote`, `launch`,
 *  `unsupported`) yield `null` — they can be carried, never (re)written. */
export function writableTarget(
  target: PdfLinkTarget | null | undefined,
): PdfLinkTargetWritable | null {
  return target && (target.kind === 'goto' || target.kind === 'uri') ? target : null;
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
    const strokeDto = dto as Extract<
      AnnotationDTO,
      { interiorColor: Color | null; opacity: number; strokeWidth: number }
    >;
    return {
      color: colorToCss(strokeDto.color),
      interiorColor: strokeDto.interiorColor ? colorToCss(strokeDto.interiorColor) : null,
      strokeWidth: strokeDto.strokeWidth,
      opacity: strokeDto.opacity,
      blendMode: dto.blendMode,
      border: borderFromDTO(strokeDto),
    };
  }
  if (TEXT_MARKUP.has(dto.subtype)) {
    const markupDto = dto as Extract<AnnotationDTO, { color: Color }>;
    return {
      color: colorToCss(markupDto.color),
      interiorColor: null,
      strokeWidth: 0,
      opacity: markupDto.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'caret') {
    const caretDto = dto as Extract<AnnotationDTO, { color: Color; opacity: number }>;
    return {
      color: colorToCss(caretDto.color),
      interiorColor: null,
      strokeWidth: 1,
      opacity: caretDto.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'free-text') {
    // `/DA` colour is the border + leader stroke; `/C` is the box background; `/BS`
    // gives the width. A plain text box draws no vector scene, so these only matter
    // for a callout's leader/arrow/box-border (and the style toolbar's readout).
    const freeTextDto = dto as Extract<AnnotationDTO, { subtype: 'free-text' }>;
    return {
      color: colorToCss(freeTextDto.color),
      interiorColor: freeTextDto.interiorColor ? colorToCss(freeTextDto.interiorColor) : null,
      strokeWidth: freeTextDto.strokeWidth,
      opacity: freeTextDto.opacity,
      blendMode: dto.blendMode,
      border: borderFromDTO(freeTextDto),
    };
  }
  if (dto.subtype === 'redact') {
    // `/C` is the marking-stage outline; `/IC` the fill painted on apply.
    // No `/BS` on redact — the outline weight is a client rendering choice.
    const redactDto = dto as Extract<AnnotationDTO, { subtype: 'redact' }>;
    return {
      color: colorToCss(redactDto.color),
      interiorColor: redactDto.interiorColor ? colorToCss(redactDto.interiorColor) : null,
      strokeWidth: 1.5,
      opacity: redactDto.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'stamp') {
    // The drawing is the appearance; /CA is the only style it has.
    return {
      color: '#444444',
      interiorColor: null,
      strokeWidth: 1,
      opacity: dto.opacity,
      blendMode: dto.blendMode,
      border: { kind: 'solid' },
    };
  }
  if (dto.subtype === 'text' || dto.subtype === 'file-attachment') {
    // Icon kinds: /C is the icon fill, /CA its opacity — no stroke/fill split.
    const iconDto = dto as Extract<AnnotationDTO, { color: Color; opacity: number }>;
    return {
      color: colorToCss(iconDto.color),
      interiorColor: null,
      strokeWidth: 1,
      opacity: iconDto.opacity,
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
 * appearance for `doc.forms` authoring — the same mapping the widget patch
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
