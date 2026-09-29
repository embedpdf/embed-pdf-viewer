/**
 * The seam between the engine's wire vocabulary and the core's model. Both
 * measure places in page space and spell colors as hex, so values pass
 * through as they are.
 */
import {
  FLAG_KEYS,
  type AnnotationPropsPatch,
  type Border,
  type ModelGeometry,
  type Rect,
  type Style,
} from '@embedpdf/core-annotation';
import type {
  AnnotationDTO,
  AnnotationFlags,
  AnnotationRef,
  Color,
  PageBox,
  PdfLinkTarget,
  PdfLinkTargetWritable,
  StandardFont,
  WidgetAppearance,
} from '@embedpdf/engine-core/runtime';

// The one annotation key (engine-core `annotationKey`): obj:<n> | nm:<page>:<name> | idx:<page>:<i>.
export { annotationKey } from '@embedpdf/core';

/**
 * The model's CSS color as the engine takes it, `'#rrggbb'`: a short `#rgb`
 * is spelled out, and anything else that isn't a hex color is black.
 */
export function hexColorOf(css: string): Color {
  const trimmed = css.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : '#000000';
}

/** The `/F` flags of a read, as the model's one flag set. */
export function flagsOf(dto: AnnotationFlags): AnnotationFlags {
  return Object.fromEntries(FLAG_KEYS.map((key) => [key, dto[key]])) as unknown as AnnotationFlags;
}

/* Rotation: the model's `rot` and the engine's `rotation` are both degrees
 * clockwise, so they pass through unchanged. */

/** `rot` for a point kind's geom (line, polygon, polyline, ink), from a DTO's
 *  `rotation`: the turn its points are drawn with. Absent → no `rot` key
 *  (kept off the geom so unrotated shapes stay clean). */
export const rotFromDTO = (rotation?: number | null): { rot?: number } =>
  rotation ? { rot: rotation } : {};

/**
 * The geometry of a box kind (square, circle, free text, stamp, caret): the
 * model's `rect` is its box before any turn and `rot` the turn. The engine
 * works out `/Rect`, the upright box around all it draws. The turn is stated
 * as `null` when there is none (total projection — the engine's tri-state
 * writes keep an omitted field, so an omission would keep a stale turn).
 */
export function boxGeomFields(rect: Rect, rot: number): { box: PageBox; rotation: number | null } {
  return { box: rect, rotation: rot || null };
}

/** A box geom (square/circle/stamp) from its DTO: its `box` and `rot` its turn. */
export function boxGeomFromDTO(
  dto: { box: PageBox; rotation: number | null },
  ellipse: boolean,
): ModelGeometry {
  const rot = dto.rotation ?? 0;
  return { kind: 'rect', rect: dto.box, ellipse, ...(rot ? { rot } : {}) };
}

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

/** Engine DTO → page-space `Style` (CSS colours, `Border` union). Exported so
 *  selection-aware UIs can read display values straight off a {@link AnnotationDTO}
 *  without re-deriving the colour/border mapping. */
export function styleFromDTO(dto: AnnotationDTO): Style {
  if (dto.subtype === 'widget') {
    return {
      color: dto.color ? dto.color : '#1a1a1a',
      interiorColor: dto.interiorColor ? dto.interiorColor : null,
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
      color: strokeDto.color,
      interiorColor: strokeDto.interiorColor ? strokeDto.interiorColor : null,
      strokeWidth: strokeDto.strokeWidth,
      opacity: strokeDto.opacity,
      blendMode: dto.blendMode,
      border: borderFromDTO(strokeDto),
    };
  }
  if (TEXT_MARKUP.has(dto.subtype)) {
    const markupDto = dto as Extract<AnnotationDTO, { color: Color }>;
    return {
      color: markupDto.color,
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
      color: caretDto.color,
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
      color: freeTextDto.color,
      interiorColor: freeTextDto.interiorColor ? freeTextDto.interiorColor : null,
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
      color: redactDto.color,
      interiorColor: redactDto.interiorColor ? redactDto.interiorColor : null,
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
      color: iconDto.color,
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
    ...(props.color !== undefined ? { color: hexColorOf(props.color) } : {}),
    ...(props.interiorColor !== undefined
      ? { interiorColor: props.interiorColor ? hexColorOf(props.interiorColor) : null }
      : {}),
    ...(props.strokeWidth !== undefined ? { strokeWidth: props.strokeWidth } : {}),
    ...(props.border !== undefined
      ? { borderStyle: props.border.kind === 'dashed' ? ('dashed' as const) : ('solid' as const) }
      : {}),
    ...(props.fontFamily !== undefined ? { fontFamily: props.fontFamily as StandardFont } : {}),
    ...(props.fontSize !== undefined ? { fontSize: props.fontSize } : {}),
    ...(props.fontColor !== undefined ? { fontColor: hexColorOf(props.fontColor) } : {}),
    ...(props.textAlign !== undefined ? { textAlign: props.textAlign } : {}),
  };
}
