import { textBoxFamily } from '../shapes';
import { defineKind, NO_CAPS, type AnnotationProperty, type KindCaps } from './define';
import { fontFamily, LINKABLE, OPACITY, textAlign } from './fields';
import { strokedStyle } from './styles';
import { bodyText } from './texts';

const TEXT_BOX_CAPS: KindCaps = {
  ...NO_CAPS,
  selectable: true,
  movable: true,
  resizable: true,
  rotatable: true,
  groupMovable: true,
  groupResizable: true,
  groupRotatable: true,
  textEditable: true,
  commentable: true,
  hasFill: true, // `/C`, the box's background
};

// The font first (the text is what it is for), then the box's background and border.
const TEXT_BOX_FIELDS: readonly AnnotationProperty[] = [
  fontFamily('Font'),
  { key: 'fontSize', control: 'number', label: 'Font size', min: 4, max: 96, step: 1 },
  { key: 'fontColor', control: 'color', label: 'Text color' },
  { key: 'bold', control: 'textFormat', label: 'Bold', format: 'bold' },
  { key: 'italic', control: 'textFormat', label: 'Italic', format: 'italic' },
  { key: 'underline', control: 'textFormat', label: 'Underline', format: 'underline' },
  textAlign('Align'),
  OPACITY,
  { key: 'interiorColor', control: 'color', label: 'Background' },
  { key: 'color', control: 'color', label: 'Border' },
  { key: 'strokeWidth', control: 'number', label: 'Border width', min: 0, max: 12, step: 0.5 },
  LINKABLE,
];

/**
 * A text box (`/FreeText`). Its box resizes and turns, its text reflows, and
 * its text is edited in place.
 */
export const freeText = defineKind({
  name: 'free-text',
  family: textBoxFamily,
  style: strokedStyle,
  text: bodyText,
  caps: TEXT_BOX_CAPS,
  properties: TEXT_BOX_FIELDS,
});

/**
 * A text box with a line pointing out (`/FreeText` with the `FreeTextCallout`
 * intent). It keeps the turn it was made with, the one that stands it upright
 * on a turned page, so nothing turns it, and a group resize can't scale it.
 * Its box resizes; its tip and knee move.
 */
export const freeTextCallout = defineKind({
  name: 'free-text-callout',
  family: textBoxFamily,
  style: strokedStyle,
  text: bodyText,
  caps: { ...TEXT_BOX_CAPS, rotatable: false, groupResizable: false, groupRotatable: false },
  properties: TEXT_BOX_FIELDS,
});
