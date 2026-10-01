/**
 * The style-panel properties kinds share. A kind lists its own in its file, in
 * display order, from these and from ones only it has; the flags every kind
 * has are added by `propertiesOf` (props.ts).
 */
import type { AnnotationProperty } from './define';

export const OPACITY: AnnotationProperty = {
  key: 'opacity',
  control: 'number',
  label: 'Opacity',
  min: 0.1,
  max: 1,
  step: 0.05,
};
export const STROKE: AnnotationProperty = { key: 'color', control: 'color', label: 'Stroke' };
export const FILL: AnnotationProperty = { key: 'interiorColor', control: 'color', label: 'Fill' };
export const COLOR: AnnotationProperty = { key: 'color', control: 'color', label: 'Color' };
export const STROKE_WIDTH: AnnotationProperty = {
  key: 'strokeWidth',
  control: 'number',
  label: 'Stroke width',
  min: 0.5,
  max: 30,
  step: 0.5,
};
export const BORDER_CLOUDY: AnnotationProperty = {
  key: 'borderStyle',
  control: 'choice',
  label: 'Border',
  options: ['solid', 'dashed', 'cloudy'],
  cloudy: true,
};
export const BORDER_PLAIN: AnnotationProperty = {
  key: 'borderStyle',
  control: 'choice',
  label: 'Border',
  options: ['solid', 'dashed'],
  cloudy: false,
};

/** Every line ending the engine draws. */
export const LINE_ENDING_NAMES = [
  'none',
  'square',
  'circle',
  'diamond',
  'open-arrow',
  'closed-arrow',
  'butt',
  'r-open-arrow',
  'r-closed-arrow',
  'slash',
] as const;

export const LINE_ENDINGS: AnnotationProperty = {
  key: 'lineEndings',
  control: 'choice',
  label: 'Line endings',
  options: LINE_ENDING_NAMES,
};

/** The blend modes an appearance stream can composite with. */
const BLEND_MODE_NAMES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

export const BLEND_MODE: AnnotationProperty = {
  key: 'blendMode',
  control: 'choice',
  label: 'Blend mode',
  options: BLEND_MODE_NAMES,
};

/** The standard PDF fonts; an app adds the fonts it registered. */
const STANDARD_FONT_NAMES = [
  'courier',
  'courier-bold',
  'courier-bold-oblique',
  'courier-oblique',
  'helvetica',
  'helvetica-bold',
  'helvetica-bold-oblique',
  'helvetica-oblique',
  'times-roman',
  'times-bold',
  'times-bold-italic',
  'times-italic',
  'symbol',
  'zapf-dingbats',
] as const;

/** A font picker, labelled `label`. */
export const fontFamily = (label: string): AnnotationProperty => ({
  key: 'fontFamily',
  control: 'choice',
  label,
  options: STANDARD_FONT_NAMES,
});

/** A text alignment picker, labelled `label`. */
export const textAlign = (label: string): AnnotationProperty => ({
  key: 'textAlign',
  control: 'choice',
  label,
  options: ['left', 'center', 'right'],
});

/**
 * "This annotation links somewhere": one property, shared by every kind that
 * can carry an attached link (a grouped `/Link` child). Deliberately absent
 * from: the widgets (a widget's `/A` is forms-plane behavior, not an attached
 * link), the caret (an anchored edit marker), the file attachment (its click
 * means "open the attachment") and the redaction mark.
 */
export const LINKABLE: AnnotationProperty = { key: 'link', control: 'link', label: 'Link' };

/** Shapes with a fill and a (possibly cloudy) border: square, circle, polygon. */
export const SHAPE_FIELDS: readonly AnnotationProperty[] = [
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
export const LINE_FIELDS: readonly AnnotationProperty[] = [
  STROKE,
  FILL,
  OPACITY,
  STROKE_WIDTH,
  BORDER_PLAIN,
  LINE_ENDINGS,
  LINKABLE,
];

/** Text markup: colour and opacity, plus its appearance stream's blend mode. */
export const MARKUP_FIELDS: readonly AnnotationProperty[] = [COLOR, OPACITY, BLEND_MODE, LINKABLE];

/** The flags every kind has, in the order a panel lists them. */
export const FLAG_PROPERTIES: readonly AnnotationProperty[] = [
  { key: 'print', control: 'flag', label: 'Print' },
  { key: 'hidden', control: 'flag', label: 'Hidden' },
  { key: 'noView', control: 'flag', label: 'No view' },
  { key: 'toggleNoView', control: 'flag', label: 'Toggle no view' },
  { key: 'readOnly', control: 'flag', label: 'Read only' },
  { key: 'locked', control: 'flag', label: 'Locked' },
  { key: 'lockedContents', control: 'flag', label: 'Locked contents' },
  { key: 'noZoom', control: 'flag', label: 'No zoom' },
  { key: 'noRotate', control: 'flag', label: 'No rotate' },
  { key: 'invisible', control: 'flag', label: 'Invisible' },
];
