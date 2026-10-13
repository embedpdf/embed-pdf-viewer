/**
 * The style-panel properties kinds share. A kind lists its own in its file, in
 * display order, from these and from ones only it has; the flags every kind
 * has are added by `propertiesOf` (props.ts). Each label has its translation
 * key beside it (`AnnotationProperty`), and so does each option.
 */
import type { AnnotationOption, AnnotationProperty } from './define';

export const OPACITY: AnnotationProperty = {
  key: 'opacity',
  control: 'number',
  label: 'Opacity',
  labelKey: 'annotation.style.opacity',
  min: 0.1,
  max: 1,
  step: 0.05,
};
export const STROKE: AnnotationProperty = {
  key: 'color',
  control: 'color',
  label: 'Stroke',
  labelKey: 'annotation.style.stroke',
};
export const FILL: AnnotationProperty = {
  key: 'interiorColor',
  control: 'color',
  label: 'Fill',
  labelKey: 'annotation.style.fill',
};
export const COLOR: AnnotationProperty = {
  key: 'color',
  control: 'color',
  label: 'Color',
  labelKey: 'annotation.style.color',
};
export const STROKE_WIDTH: AnnotationProperty = {
  key: 'strokeWidth',
  control: 'number',
  label: 'Stroke width',
  labelKey: 'annotation.style.strokeWidth',
  min: 0.5,
  max: 30,
  step: 0.5,
};

const SOLID: AnnotationOption = {
  value: 'solid',
  label: 'Solid',
  labelKey: 'annotation.borderStyles.solid',
};
const DASHED: AnnotationOption = {
  value: 'dashed',
  label: 'Dashed',
  labelKey: 'annotation.borderStyles.dashed',
};
const CLOUDY: AnnotationOption = {
  value: 'cloudy',
  label: 'Cloudy',
  labelKey: 'annotation.borderStyles.cloudy',
};

export const BORDER_CLOUDY: AnnotationProperty = {
  key: 'borderStyle',
  control: 'choice',
  label: 'Border',
  labelKey: 'annotation.style.border',
  options: [SOLID, DASHED, CLOUDY],
  cloudy: true,
};
export const BORDER_PLAIN: AnnotationProperty = {
  key: 'borderStyle',
  control: 'choice',
  label: 'Border',
  labelKey: 'annotation.style.border',
  options: [SOLID, DASHED],
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

/** The line endings, in `LINE_ENDING_NAMES` order. */
const LINE_ENDING_OPTIONS: readonly AnnotationOption[] = [
  { value: 'none', label: 'None', labelKey: 'annotation.lineEndings.none' },
  { value: 'square', label: 'Square', labelKey: 'annotation.lineEndings.square' },
  { value: 'circle', label: 'Circle', labelKey: 'annotation.lineEndings.circle' },
  { value: 'diamond', label: 'Diamond', labelKey: 'annotation.lineEndings.diamond' },
  { value: 'open-arrow', label: 'Open arrow', labelKey: 'annotation.lineEndings.openArrow' },
  { value: 'closed-arrow', label: 'Closed arrow', labelKey: 'annotation.lineEndings.closedArrow' },
  { value: 'butt', label: 'Butt', labelKey: 'annotation.lineEndings.butt' },
  {
    value: 'r-open-arrow',
    label: 'Reverse open arrow',
    labelKey: 'annotation.lineEndings.reverseOpenArrow',
  },
  {
    value: 'r-closed-arrow',
    label: 'Reverse closed arrow',
    labelKey: 'annotation.lineEndings.reverseClosedArrow',
  },
  { value: 'slash', label: 'Slash', labelKey: 'annotation.lineEndings.slash' },
];

export const LINE_ENDINGS: AnnotationProperty = {
  key: 'lineEndings',
  control: 'choice',
  label: 'Line endings',
  labelKey: 'annotation.style.lineEndings',
  options: LINE_ENDING_OPTIONS,
};

/** The blend modes an appearance stream can composite with. */
const BLEND_MODE_OPTIONS: readonly AnnotationOption[] = [
  { value: 'normal', label: 'Normal', labelKey: 'annotation.blendModes.normal' },
  { value: 'multiply', label: 'Multiply', labelKey: 'annotation.blendModes.multiply' },
  { value: 'screen', label: 'Screen', labelKey: 'annotation.blendModes.screen' },
  { value: 'overlay', label: 'Overlay', labelKey: 'annotation.blendModes.overlay' },
  { value: 'darken', label: 'Darken', labelKey: 'annotation.blendModes.darken' },
  { value: 'lighten', label: 'Lighten', labelKey: 'annotation.blendModes.lighten' },
  { value: 'color-dodge', label: 'Color dodge', labelKey: 'annotation.blendModes.colorDodge' },
  { value: 'color-burn', label: 'Color burn', labelKey: 'annotation.blendModes.colorBurn' },
  { value: 'hard-light', label: 'Hard light', labelKey: 'annotation.blendModes.hardLight' },
  { value: 'soft-light', label: 'Soft light', labelKey: 'annotation.blendModes.softLight' },
  { value: 'difference', label: 'Difference', labelKey: 'annotation.blendModes.difference' },
  { value: 'exclusion', label: 'Exclusion', labelKey: 'annotation.blendModes.exclusion' },
  { value: 'hue', label: 'Hue', labelKey: 'annotation.blendModes.hue' },
  { value: 'saturation', label: 'Saturation', labelKey: 'annotation.blendModes.saturation' },
  { value: 'color', label: 'Color', labelKey: 'annotation.blendModes.color' },
  { value: 'luminosity', label: 'Luminosity', labelKey: 'annotation.blendModes.luminosity' },
];

export const BLEND_MODE: AnnotationProperty = {
  key: 'blendMode',
  control: 'choice',
  label: 'Blend mode',
  labelKey: 'annotation.style.blendMode',
  options: BLEND_MODE_OPTIONS,
};

/** The standard PDF fonts; an app adds the fonts it registered. */
const STANDARD_FONT_OPTIONS: readonly AnnotationOption[] = [
  { value: 'courier', label: 'Courier', labelKey: 'annotation.fonts.courier' },
  { value: 'courier-bold', label: 'Courier Bold', labelKey: 'annotation.fonts.courierBold' },
  {
    value: 'courier-bold-oblique',
    label: 'Courier Bold Oblique',
    labelKey: 'annotation.fonts.courierBoldOblique',
  },
  {
    value: 'courier-oblique',
    label: 'Courier Oblique',
    labelKey: 'annotation.fonts.courierOblique',
  },
  { value: 'helvetica', label: 'Helvetica', labelKey: 'annotation.fonts.helvetica' },
  { value: 'helvetica-bold', label: 'Helvetica Bold', labelKey: 'annotation.fonts.helveticaBold' },
  {
    value: 'helvetica-bold-oblique',
    label: 'Helvetica Bold Oblique',
    labelKey: 'annotation.fonts.helveticaBoldOblique',
  },
  {
    value: 'helvetica-oblique',
    label: 'Helvetica Oblique',
    labelKey: 'annotation.fonts.helveticaOblique',
  },
  { value: 'times-roman', label: 'Times Roman', labelKey: 'annotation.fonts.timesRoman' },
  { value: 'times-bold', label: 'Times Bold', labelKey: 'annotation.fonts.timesBold' },
  {
    value: 'times-bold-italic',
    label: 'Times Bold Italic',
    labelKey: 'annotation.fonts.timesBoldItalic',
  },
  { value: 'times-italic', label: 'Times Italic', labelKey: 'annotation.fonts.timesItalic' },
  { value: 'symbol', label: 'Symbol', labelKey: 'annotation.fonts.symbol' },
  { value: 'zapf-dingbats', label: 'Zapf Dingbats', labelKey: 'annotation.fonts.zapfDingbats' },
];

/** A font picker over the standard fonts; a kind gives it its own label where it differs. */
export const FONT_FAMILY: AnnotationProperty = {
  key: 'fontFamily',
  control: 'choice',
  label: 'Font',
  labelKey: 'annotation.style.font',
  options: STANDARD_FONT_OPTIONS,
};

/** A text alignment picker; a kind gives it its own label where it differs. */
export const TEXT_ALIGN: AnnotationProperty = {
  key: 'textAlign',
  control: 'choice',
  label: 'Align',
  labelKey: 'annotation.style.align',
  options: [
    { value: 'left', label: 'Left', labelKey: 'annotation.alignments.left' },
    { value: 'center', label: 'Center', labelKey: 'annotation.alignments.center' },
    { value: 'right', label: 'Right', labelKey: 'annotation.alignments.right' },
  ],
};

/**
 * "This annotation links somewhere": one property, shared by every kind that
 * can carry an attached link (a grouped `/Link` child). Deliberately absent
 * from: the widgets (a widget's `/A` is forms-plane behavior, not an attached
 * link), the caret (an anchored edit marker), the file attachment (its click
 * means "open the attachment") and the redaction mark.
 */
export const LINKABLE: AnnotationProperty = {
  key: 'link',
  control: 'link',
  label: 'Link',
  labelKey: 'annotation.style.link',
};

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
  { key: 'print', control: 'flag', label: 'Print', labelKey: 'annotation.flags.print' },
  { key: 'hidden', control: 'flag', label: 'Hidden', labelKey: 'annotation.flags.hidden' },
  { key: 'noView', control: 'flag', label: 'No view', labelKey: 'annotation.flags.noView' },
  {
    key: 'toggleNoView',
    control: 'flag',
    label: 'Toggle no view',
    labelKey: 'annotation.flags.toggleNoView',
  },
  { key: 'readOnly', control: 'flag', label: 'Read only', labelKey: 'annotation.flags.readOnly' },
  { key: 'locked', control: 'flag', label: 'Locked', labelKey: 'annotation.flags.locked' },
  {
    key: 'lockedContents',
    control: 'flag',
    label: 'Locked contents',
    labelKey: 'annotation.flags.lockedContents',
  },
  { key: 'noZoom', control: 'flag', label: 'No zoom', labelKey: 'annotation.flags.noZoom' },
  { key: 'noRotate', control: 'flag', label: 'No rotate', labelKey: 'annotation.flags.noRotate' },
  { key: 'invisible', control: 'flag', label: 'Invisible', labelKey: 'annotation.flags.invisible' },
];
