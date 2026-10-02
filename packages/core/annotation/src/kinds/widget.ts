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
import { BORDER_PLAIN, fontFamily, textAlign } from './fields';
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
  { key: 'color', control: 'color', label: 'Border color' },
  { key: 'interiorColor', control: 'color', label: 'Background' },
  { key: 'strokeWidth', control: 'number', label: 'Border width', min: 0, max: 12, step: 0.5 },
  { ...BORDER_PLAIN, label: 'Border style' },
];

const TEXT_FIELDS: readonly AnnotationProperty[] = [
  ...BOX_FIELDS,
  fontFamily('Font'),
  { key: 'fontSize', control: 'number', label: 'Font size', min: 0, max: 96, step: 1 },
  { key: 'fontColor', control: 'color', label: 'Text color' },
  textAlign('Alignment'),
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

/** The widget kind for a field family. */
const KIND_BY_FAMILY: Readonly<Record<string, string>> = {
  text: widgetText.name,
  combobox: widgetChoice.name,
  listbox: widgetChoice.name,
  pushbutton: widgetButton.name,
  checkbox: widgetToggle.name,
  radio: widgetRadio.name,
};

/** The name of the widget kind for a widget's field family. */
export const widgetKindOf = (family: string): string => KIND_BY_FAMILY[family] ?? widgetBox.name;

/**
 * The field family a widget kind stands for, the other way round: what a form
 * tool's defaults read as, so they read as the tool's own kind (a choice tool
 * as a combo box, the bare box as a signature field).
 */
const FAMILY_BY_KIND: Readonly<Record<string, string>> = {
  [widgetText.name]: 'text',
  [widgetChoice.name]: 'combobox',
  [widgetButton.name]: 'pushbutton',
  [widgetToggle.name]: 'checkbox',
  [widgetRadio.name]: 'radio',
  [widgetBox.name]: 'signature',
};

/** The field family a widget kind stands for; `undefined` for a kind that is no widget's. */
export const fieldFamilyOfKind = (kind: string): string | undefined => FAMILY_BY_KIND[kind];
