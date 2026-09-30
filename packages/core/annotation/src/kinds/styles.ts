/**
 * How each kind is drawn: the style view a kind names (`style` in its file),
 * which reads its colours, stroke and border off the annotation by the
 * engine's field names and fills in what the kind doesn't keep (a highlight
 * strokes nothing, a caret draws 1 pt, a redaction's outline 1.5 pt).
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import type { Style } from '../types';

/** A style's border when it has no dash of its own and no cloud. */
const PLAIN_BORDER = { borderStyle: 'solid', dashArray: null, cloudyIntensity: null } as const;

type Stroked = Extract<
  AnnotationDTO,
  { subtype: 'square' | 'circle' | 'line' | 'polygon' | 'polyline' | 'ink' | 'free-text' }
>;

/**
 * A kind drawn with a stroke, as the engine keeps it: its stroke, its fill
 * (ink has none) and its border, a dash or a cloud (square, circle, line,
 * polygon, polyline, ink, free text).
 */
export function strokedStyle(annotation: AnnotationDTO): Style {
  const stroked = annotation as Stroked;
  return {
    color: stroked.color,
    interiorColor: ('interiorColor' in stroked && stroked.interiorColor) || null,
    strokeWidth: stroked.strokeWidth,
    opacity: stroked.opacity,
    blendMode: stroked.blendMode,
    borderStyle: stroked.borderStyle ?? 'solid',
    dashArray: stroked.dashArray ?? null,
    cloudyIntensity: ('cloudyIntensity' in stroked && stroked.cloudyIntensity) || null,
  };
}

type Coloured = Extract<
  AnnotationDTO,
  {
    subtype:
      | 'highlight'
      | 'underline'
      | 'squiggly'
      | 'strikeout'
      | 'caret'
      | 'redact'
      | 'text'
      | 'file-attachment';
  }
>;

/** A kind drawn in its one colour, with the stroke width its drawing uses and no border of its own. */
const colouredStyle =
  (strokeWidth: number) =>
  (annotation: AnnotationDTO): Style => {
    const coloured = annotation as Coloured;
    return {
      color: coloured.color,
      interiorColor: ('interiorColor' in coloured && coloured.interiorColor) || null,
      strokeWidth,
      opacity: coloured.opacity,
      blendMode: coloured.blendMode,
      ...PLAIN_BORDER,
    };
  };

/** Text markup: its colour and opacity; its marks' widths follow the line height, so it strokes nothing itself. */
export const markupStyle = colouredStyle(0);

/** A caret: its mark in its colour, drawn 1 pt. */
export const caretStyle = colouredStyle(1);

/** A redaction mark: its outline (1.5 pt, a viewer's choice: the file keeps no width) and the fill applying paints. */
export const redactStyle = colouredStyle(1.5);

/** A note or attachment icon: its colour is the icon's. */
export const iconStyle = colouredStyle(1);

/** A stamp: its drawing is its appearance, so its opacity is the only style it has. */
export function stampStyle(annotation: AnnotationDTO): Style {
  const stamp = annotation as Extract<AnnotationDTO, { subtype: 'stamp' }>;
  return {
    color: '#444444',
    interiorColor: null,
    strokeWidth: 1,
    opacity: stamp.opacity,
    blendMode: stamp.blendMode,
    ...PLAIN_BORDER,
  };
}

/** A form widget: its border and background as the form draws them; a widget has no dash of its own. */
export function widgetStyle(annotation: AnnotationDTO): Style {
  const widget = annotation as Extract<AnnotationDTO, { subtype: 'widget' }>;
  return {
    color: widget.color ?? '#1a1a1a',
    interiorColor: widget.interiorColor ?? null,
    strokeWidth: widget.strokeWidth,
    opacity: 1,
    blendMode: widget.blendMode,
    ...PLAIN_BORDER,
    borderStyle: widget.borderStyle,
  };
}

/** A kind the viewer only shows (a link, a popup, an unknown type): an outline it never draws itself. */
export function plainStyle(annotation: AnnotationDTO): Style {
  return {
    color: '#444444',
    interiorColor: null,
    strokeWidth: 1,
    opacity: 1,
    blendMode: annotation.blendMode,
    ...PLAIN_BORDER,
  };
}

/** The dash a border draws with, or `undefined` for a solid or cloudy one. */
export function dashOf(style: Style): number[] | undefined {
  if (style.cloudyIntensity || style.borderStyle !== 'dashed') return undefined;
  return style.dashArray?.length ? style.dashArray : [3, 3];
}
