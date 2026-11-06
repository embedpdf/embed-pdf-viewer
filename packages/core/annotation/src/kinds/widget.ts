/**
 * Form widgets (`/Widget`): one PDF subtype, six kinds. The widget's field
 * family picks its kind, so a checkbox never offers a font and a sidebar needs
 * no widget-specific code. Every widget has a box; the text-bearing ones add
 * the `/DA` text fields. The writer maps these flat fields onto `/MK`, `/BS`,
 * `/DA` and `/Q`.
 *
 * A widget ignores the `ReadOnly` flag here: a form designer must still move a
 * read-only field; the form-filling layer enforces it itself.
 */
import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS, type AnnotationProperty, type KindCaps } from './define';
import { BORDER_PLAIN, FONT_FAMILY, TEXT_ALIGN } from './fields';
import { widgetStyle } from './styles';
import { fieldText } from './texts';

const WIDGET_CAPS: KindCaps = {
  ...NO_CAPS,
  selectable: true,
  movable: true,
  resizable: true,
  groupMovable: true,
  hasFill: true,
  opaqueBody: true,
  rasterOnly: true,
  ignoresReadOnly: true,
};

const BOX_FIELDS: readonly AnnotationProperty[] = [
  {
    key: 'color',
    control: 'color',
    label: 'Border color',
    labelKey: 'annotation.style.borderColor',
    allowsNone: true,
  },
  {
    key: 'interiorColor',
    control: 'color',
    label: 'Background',
    labelKey: 'annotation.style.background',
    allowsNone: true,
  },
  {
    key: 'strokeWidth',
    control: 'number',
    label: 'Border width',
    labelKey: 'annotation.style.borderWidth',
    min: 0,
    max: 12,
    step: 0.5,
  },
  { ...BORDER_PLAIN, label: 'Border style', labelKey: 'annotation.style.borderStyle' },
];

const TEXT_FIELDS: readonly AnnotationProperty[] = [
  ...BOX_FIELDS,
  FONT_FAMILY,
  {
    key: 'fontSize',
    control: 'number',
    label: 'Font size',
    labelKey: 'annotation.style.fontSize',
    min: 0,
    max: 96,
    step: 1,
  },
  {
    key: 'fontColor',
    control: 'color',
    label: 'Text color',
    labelKey: 'annotation.style.textColor',
  },
  { ...TEXT_ALIGN, label: 'Alignment', labelKey: 'annotation.style.alignment' },
];

/** A text field. */
export const widgetText = defineKind({
  name: 'widget-text',
  family: boxFamily,
  style: widgetStyle,
  text: fieldText,
  caps: WIDGET_CAPS,
  properties: TEXT_FIELDS,
});

/** A combo box or a list box. */
export const widgetChoice = defineKind({
  name: 'widget-choice',
  family: boxFamily,
  style: widgetStyle,
  text: fieldText,
  caps: WIDGET_CAPS,
  properties: TEXT_FIELDS,
});

/** A push button: its caption is text. */
export const widgetButton = defineKind({
  name: 'widget-button',
  family: boxFamily,
  style: widgetStyle,
  text: fieldText,
  caps: WIDGET_CAPS,
  properties: TEXT_FIELDS,
});

/** A checkbox: no text. */
export const widgetToggle = defineKind({
  name: 'widget-toggle',
  family: boxFamily,
  style: widgetStyle,
  caps: WIDGET_CAPS,
  properties: BOX_FIELDS,
});

/** A radio button: no text, and round (its box draws the ellipse in it, as the engine draws one). */
export const widgetRadio = defineKind({
  name: 'widget-radio',
  family: boxFamily,
  style: widgetStyle,
  caps: WIDGET_CAPS,
  properties: BOX_FIELDS,
});

/** Any other widget (a signature field, one in no field): a box. */
export const widgetBox = defineKind({
  name: 'widget-box',
  family: boxFamily,
  style: widgetStyle,
  caps: WIDGET_CAPS,
  properties: BOX_FIELDS,
});

/**
 * A signature field's widget with a mark in it (`hasMark`: it's signed, or a
 * mark was drawn in): it shows the mark, not its box, so it has no style.
 */
export const widgetMark = defineKind({
  name: 'widget-mark',
  family: boxFamily,
  style: widgetStyle,
  caps: WIDGET_CAPS,
  properties: [],
});

/** The widget kind for a field kind. */
const KIND_BY_FIELD_KIND: Readonly<Record<string, string>> = {
  text: widgetText.name,
  combobox: widgetChoice.name,
  listbox: widgetChoice.name,
  pushbutton: widgetButton.name,
  checkbox: widgetToggle.name,
  radio: widgetRadio.name,
};

/** The name of a widget's kind: the one with a mark in it, else its field kind's. */
export const widgetKindOf = (widget: { fieldKind: string; hasMark: boolean }): string =>
  widget.hasMark ? widgetMark.name : (KIND_BY_FIELD_KIND[widget.fieldKind] ?? widgetBox.name);

/**
 * The field kind a widget kind stands for, the other way round: what a form
 * tool's defaults read as, so they read as the tool's own kind (a choice tool
 * as a combo box, the bare box as a signature field).
 */
const FIELD_KIND_BY_KIND: Readonly<Record<string, string>> = {
  [widgetText.name]: 'text',
  [widgetChoice.name]: 'combobox',
  [widgetButton.name]: 'pushbutton',
  [widgetToggle.name]: 'checkbox',
  [widgetRadio.name]: 'radio',
  [widgetBox.name]: 'signature',
};

/** The field kind a widget kind stands for; `undefined` for a kind that is no widget's. */
export const fieldKindOf = (kind: string): string | undefined => FIELD_KIND_BY_KIND[kind];
