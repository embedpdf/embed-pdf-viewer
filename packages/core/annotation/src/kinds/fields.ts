/**
 * The sidebar fields kinds share. A kind lists its own in its file, in display
 * order, from these and from ones only it has.
 */
import type { FieldSpec } from './define';

export const OPACITY: FieldSpec = {
  key: 'opacity',
  label: 'Opacity',
  min: 0.1,
  max: 1,
  step: 0.05,
};
export const STROKE: FieldSpec = { key: 'color', label: 'Stroke' };
export const FILL: FieldSpec = { key: 'interiorColor', label: 'Fill' };
export const COLOR: FieldSpec = { key: 'color', label: 'Color' };
export const STROKE_WIDTH: FieldSpec = {
  key: 'strokeWidth',
  label: 'Stroke width',
  min: 0.5,
  max: 30,
  step: 0.5,
};
export const BORDER_CLOUDY: FieldSpec = { key: 'borderStyle', label: 'Border', cloudy: true };
export const BORDER_PLAIN: FieldSpec = { key: 'borderStyle', label: 'Border', cloudy: false };
export const LINE_ENDINGS: FieldSpec = { key: 'lineEndings', label: 'Line endings' };
export const BLEND_MODE: FieldSpec = { key: 'blendMode', label: 'Blend mode' };

/**
 * "This annotation links somewhere": one spec, shared by every kind that can
 * carry an attached link (a grouped `/Link` child). Deliberately absent from:
 * the widgets (a widget's `/A` is forms-plane behavior, not an attached link),
 * the caret (an anchored edit marker), the file attachment (its click means
 * "open the attachment") and the redaction mark.
 */
export const LINKABLE: FieldSpec = { key: 'link', label: 'Link' };

/** Shapes with a fill and a (possibly cloudy) border: square, circle, polygon. */
export const SHAPE_FIELDS: readonly FieldSpec[] = [
  STROKE,
  FILL,
  OPACITY,
  STROKE_WIDTH,
  BORDER_CLOUDY,
  LINKABLE,
];

/**
 * Stroked vertex kinds with `/LE` endings: line, polyline. The fill colours a
 * closed ending (closed arrow, circle, square, diamond).
 */
export const LINE_FIELDS: readonly FieldSpec[] = [
  STROKE,
  FILL,
  OPACITY,
  STROKE_WIDTH,
  BORDER_PLAIN,
  LINE_ENDINGS,
  LINKABLE,
];

/** Text markup: colour and opacity, plus its appearance stream's blend mode. */
export const MARKUP_FIELDS: readonly FieldSpec[] = [COLOR, OPACITY, BLEND_MODE, LINKABLE];
