/**
 * Form widgets (`/Widget`): one PDF subtype, five kinds. The widget's field
 * family picks its kind, so a checkbox never offers a font and a sidebar needs
 * no widget-specific code. Every widget has a box; the text-bearing ones add
 * the `/DA` text fields. The writer maps these flat fields onto `/MK`, `/BS`,
 * `/DA` and `/Q`.
 *
 * A widget ignores the `ReadOnly` flag here: a form designer must still move a
 * read-only field; the form-filling layer enforces it itself.
 */
import { boxFamily } from '../shapes';
import { defineKind, NO_CAPS, type FieldSpec, type KindCaps } from './define';
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

const BOX_FIELDS: readonly FieldSpec[] = [
  { key: 'color', label: 'Border color' },
  { key: 'interiorColor', label: 'Background' },
  { key: 'strokeWidth', label: 'Border width', min: 0, max: 12, step: 0.5 },
  { key: 'borderStyle', label: 'Border style', cloudy: false },
];

const TEXT_FIELDS: readonly FieldSpec[] = [
  ...BOX_FIELDS,
  { key: 'fontFamily', label: 'Font' },
  { key: 'fontSize', label: 'Font size', min: 0, max: 96, step: 1 },
  { key: 'fontColor', label: 'Text color' },
  { key: 'textAlign', label: 'Alignment' },
];

/** A text field. */
export const widgetText = defineKind({
  name: 'widget-text',
  family: boxFamily,
  style: widgetStyle,
  text: fieldText,
  caps: WIDGET_CAPS,
  fields: TEXT_FIELDS,
});

/** A combo box or a list box. */
export const widgetChoice = defineKind({
  name: 'widget-choice',
  family: boxFamily,
  style: widgetStyle,
  text: fieldText,
  caps: WIDGET_CAPS,
  fields: TEXT_FIELDS,
});

/** A push button: its caption is text. */
export const widgetButton = defineKind({
  name: 'widget-button',
  family: boxFamily,
  style: widgetStyle,
  text: fieldText,
  caps: WIDGET_CAPS,
  fields: TEXT_FIELDS,
});

/** A checkbox or a radio button: no text. */
export const widgetToggle = defineKind({
  name: 'widget-toggle',
  family: boxFamily,
  style: widgetStyle,
  caps: WIDGET_CAPS,
  fields: BOX_FIELDS,
});

/** Any other widget (a signature field, one in no field): a box. */
export const widgetBox = defineKind({
  name: 'widget-box',
  family: boxFamily,
  style: widgetStyle,
  caps: WIDGET_CAPS,
  fields: BOX_FIELDS,
});

/** The widget kind for a field family. */
const KIND_BY_FAMILY: Readonly<Record<string, string>> = {
  text: widgetText.name,
  combobox: widgetChoice.name,
  listbox: widgetChoice.name,
  pushbutton: widgetButton.name,
  checkbox: widgetToggle.name,
  radio: widgetToggle.name,
};

/** The name of the widget kind for a widget's field family. */
export const widgetKindOf = (family: string): string => KIND_BY_FAMILY[family] ?? widgetBox.name;
